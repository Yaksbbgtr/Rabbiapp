/*
 * Cloud sync (Supabase). Optional: with sync off the app works exactly as before, from this device only.
 *
 * Each profile (a rebbi's class, or the office's own data) is one row of the classes table:
 *   { id, owner, owner_email, name, class_name, role, updated_at, updated_by, updated_device,
 *     data:   { <top-level key>: JSON string },   e.g. data.talmidim, data.lessons, data.settings
 *     issues: { <issue id>: JSON string } }       one entry per issue, so rebbi and office edits don't collide
 * Only the keys that changed are written (the class_patch database function). Each device remembers what the
 * cloud last had (as small hashes), so it can tell its own changes apart from changes made elsewhere and merge
 * them, including edits made offline. Live updates come over Supabase Realtime; each one re-reads the row.
 * Who may read what is enforced in the database (supabase/schema.sql): a rebbi sees his own classes, the office all.
 */
(function () {
  'use strict';
  var h = UI.h;
  // The Supabase project (Project Settings → API). The publishable key is meant to be public: the database's
  // row level security decides what each signed-in account may see.
  var CONFIG = window.REBBI_SYNC_CONFIG || { // REBBI_SYNC_CONFIG: the tests' stand-in project
    url: '',
    key: ''
  };
  var SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.js';
  var ON_KEY = 'rabbiapp.sync.on';
  var BASE_KEY = 'rabbiapp.sync.base.';
  var DEVICE_KEY = 'rabbiapp.sync.device';
  var RETURN_KEY = 'rabbiapp.sync.return';
  var MAX_BYTES = 900000;

  var S = { status: 'off', user: null, admin: false, error: '', ready: false, people: [], shared: {} };
  var sb = null, sdkPromise = null, channel = null, sharedOn = false;
  var SENT_KEY = 'rabbiapp.shared.sent.'; // what this device last sent for each shared issue (a hash)
  var timers = {}, refetchTimers = {};
  var inFlight = 0, sending = {}, again = {};
  var deviceOnly = {}; // profiles that were on this device before signing in: uploaded only when asked
  var pendingRender = false;

  function ls(k, v) {
    try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* ignore */ }
    return null;
  }
  function wanted() { return ls(ON_KEY) === '1'; }

  // ---------- status ----------
  var STATUS_TEXT = {
    off: 'Off – this device only', loading: 'Connecting…', signedout: 'Not signed in', synced: 'Up to date',
    syncing: 'Saving…', offline: 'Offline – changes will sync when you\'re back online', error: 'Problem syncing'
  };
  function setStatus(st, err) {
    if (S.status === st && (err || '') === S.error) return;
    S.status = st; S.error = err || '';
    var el = document.getElementById('sync-dot');
    if (el) { el.className = 'sync-dot ' + st; el.title = 'Sync: ' + STATUS_TEXT[st]; }
    // Refresh the Settings / login cards if they're showing.
    if (/^#\/(settings|login)?$/.test(location.hash || '#/') && !busy()) App.render();
  }

  // ---------- small helpers ----------
  function hash(str) {
    var x = 5381;
    for (var i = 0; i < str.length; i++) x = ((x << 5) + x + str.charCodeAt(i)) | 0;
    return (x >>> 0).toString(36) + '.' + str.length;
  }
  function getBase(id) { try { return JSON.parse(ls(BASE_KEY + id)); } catch (e) { return null; } }
  function setBase(id, split) {
    var b = { data: {}, issues: {} };
    Object.keys(split.data).forEach(function (k) { b.data[k] = hash(split.data[k]); });
    Object.keys(split.issues).forEach(function (k) { b.issues[k] = hash(split.issues[k]); });
    ls(BASE_KEY + id, JSON.stringify(b));
  }
  // Class data -> { data: {key: json}, issues: {id: json} }
  function split(obj) {
    var out = { data: {}, issues: {} };
    Object.keys(obj || {}).forEach(function (k) {
      if (k === 'issues') (obj.issues || []).forEach(function (i) { if (i && i.id) out.issues[i.id] = JSON.stringify(i); });
      else if (obj[k] !== undefined) out.data[k] = JSON.stringify(obj[k]);
    });
    return out;
  }
  function join(sp) {
    var obj = {};
    Object.keys(sp.data).forEach(function (k) { try { obj[k] = JSON.parse(sp.data[k]); } catch (e) { /* skip bad field */ } });
    obj.issues = Object.keys(sp.issues).map(function (k) { try { return JSON.parse(sp.issues[k]); } catch (e) { return null; } })
      .filter(Boolean).sort(function (a, b) { return (a.date || '').localeCompare(b.date || '') || String(a.id).localeCompare(String(b.id)); });
    return obj;
  }
  function size(sp) {
    var n = 0;
    Object.keys(sp.data).forEach(function (k) { n += sp.data[k].length; });
    Object.keys(sp.issues).forEach(function (k) { n += sp.issues[k].length; });
    return n;
  }
  // The user is typing or a popup is open: don't redraw the page under them.
  function busy() {
    if (document.querySelector('.modal-overlay')) return true;
    var a = document.activeElement;
    return !!(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== 'checkbox' && a.type !== 'radio');
  }
  function renderSoon() {
    if (pendingRender) return;
    pendingRender = true;
    (function tryRender() {
      if (busy()) { setTimeout(tryRender, 1200); return; }
      pendingRender = false;
      App.render();
    })();
  }

  function configured() { return !!(CONFIG.url && CONFIG.key); }
  function deviceId() {
    var d = ls(DEVICE_KEY);
    if (!d) { d = Math.random().toString(36).slice(2) + Date.now().toString(36); ls(DEVICE_KEY, d); }
    return d;
  }
  function profileById(id) { return Store.profiles().filter(function (x) { return x.id === id; })[0]; }
  function isNetwork(e) { return navigator.onLine === false || /fetch|network|load failed/i.test((e && e.message) || ''); }
  function failed(e) { setStatus(isNetwork(e) ? 'offline' : 'error', isNetwork(e) ? '' : (e && e.message) || 'error'); }
  function settle() { if (S.user && S.ready && !inFlight) setStatus(navigator.onLine === false ? 'offline' : 'synced'); }
  // supabase-js answers { data, error }; turn that into a normal promise.
  function q(p) { return Promise.resolve(p).then(function (r) { if (r && r.error) throw r.error; return r ? r.data : null; }); }

  // ---------- loading Supabase ----------
  function script(src) {
    return new Promise(function (ok, fail) {
      var el = document.createElement('script');
      el.src = src; el.onload = ok; el.onerror = function () { fail(new Error('Could not load ' + src)); };
      document.head.appendChild(el);
    });
  }
  function loadSdk() {
    if (!configured()) return Promise.reject(new Error('Sync isn\'t set up yet.'));
    if (!sdkPromise) {
      sdkPromise = (window.supabase && window.supabase.createClient ? Promise.resolve() : script(SDK)).then(function () {
        sb = window.supabase.createClient(CONFIG.url, CONFIG.key, {
          auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true, storageKey: 'rabbiapp.sync.auth' }
        });
        sb.auth.onAuthStateChange(function (event, session) {
          var u = session && session.user;
          // Called again for every token refresh; only a different account starts over.
          setTimeout(function () { onUser(u ? { uid: u.id, email: (u.email || '').toLowerCase() } : null); }, 0);
          if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') cleanReturnURL();
        });
      });
      sdkPromise.catch(function () { sdkPromise = null; });
    }
    return sdkPromise;
  }
  // Back from Google: drop ?code=… from the address and go back to the page sign-in started from.
  function cleanReturnURL() {
    if (!/[?&](code|error)=/.test(location.search)) return;
    var back = ls(RETURN_KEY) || '#/'; ls(RETURN_KEY, null);
    history.replaceState(null, '', location.pathname + back);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }
  function start() {
    if (!wanted() && !/[?&]code=/.test(location.search)) { setStatus('off'); return Promise.resolve(); }
    setStatus('loading');
    return loadSdk().catch(function (e) {
      setStatus(navigator.onLine === false ? 'offline' : 'error', configured() ? 'Couldn\'t reach the sync service.' : e.message);
    });
  }

  // ---------- signing in and out ----------
  // Google sign-in leaves the app and comes back (works the same in Safari, Chrome and the home-screen app).
  // Resolves with null; the app picks up the signed-in account when it reloads.
  var signingIn = null;
  function signIn() {
    if (signingIn) return signingIn;
    ls(ON_KEY, '1');
    setStatus('loading');
    signingIn = loadSdk().then(function () {
      ls(RETURN_KEY, location.hash || '#/');
      return q(sb.auth.signInWithOAuth({ provider: 'google',
        options: { redirectTo: location.origin + location.pathname, queryParams: { prompt: 'select_account' } } }));
    }).then(function () { return null; }, function (e) {
      signingIn = null; setStatus('error', e.message); UI.toast('Sign-in didn\'t work: ' + e.message); return null;
    });
    return signingIn;
  }
  function stopLive() {
    if (channel && sb) { sb.removeChannel(channel); }
    channel = null; sharedOn = false;
    S.people = []; S.shared = {};
  }
  // Log out of Google but keep the classes on the device (Log out on the profile menu).
  function lock() {
    stopLive();
    if (sb && S.user) sb.auth.signOut({ scope: 'local' });
  }
  // May the signed-in account open this profile? The office may open any; a rebbi his own and this device's own.
  function canOpen(p) {
    if (!S.user || !p) return false;
    if (S.admin) return true;
    return !p.cloud || !p.ownerEmail || p.ownerEmail === S.user.email;
  }
  // Signing out removes this account's classes from the device (they stay safe in the cloud).
  function signOut() {
    if (S.status === 'offline' || S.status === 'syncing') { alert('Some changes haven\'t reached the cloud yet. Connect to the internet and wait for "Up to date" before signing out.'); return; }
    UI.confirm('Sign out? This account\'s classes are removed from this device. They stay in the cloud and come back when you sign in again.', function () {
      stopLive();
      Store.profiles().filter(function (p) { return p.cloud; }).forEach(function (p) { Store.deleteProfile(p.id); ls(BASE_KEY + p.id, null); });
      ls(ON_KEY, null);
      (sb ? sb.auth.signOut({ scope: 'local' }) : Promise.resolve()).then(function () {
        S.user = null; S.admin = false; setStatus('off');
        App.go('login'); App.render();
      });
    }, 'Sign out');
  }

  function onUser(u) {
    if (u && S.user && S.user.uid === u.uid) return; // same account, new token
    if (!u && !S.user && S.status !== 'loading') return;
    stopLive();
    S.user = u; S.admin = false; S.ready = false; S.adminP = null;
    signingIn = null;
    if (!u) { setStatus(wanted() ? 'signedout' : 'off'); return; }
    ls(ON_KEY, '1');
    deviceOnly = {};
    Store.profiles().forEach(function (p) { if (!p.cloud) deviceOnly[p.id] = true; });
    setStatus('loading');
    S.adminP = q(sb.rpc('is_admin')).then(function (a) { S.admin = a === true; }, function () { S.admin = false; });
    S.adminP.then(listen).then(function () { if (window.Calendar && Calendar.publishSoon) Calendar.publishSoon(); });
  }

  // Live updates: any change to a class, the directory or a shared issue. Each class change re-reads that row,
  // so the newest copy is always what gets merged (and big classes never depend on the size of a live message).
  function listen() {
    var me = S.user;
    channel = sb.channel('rebbi-' + me.uid)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'classes' }, function (m) {
        var id = (m.new && m.new.id) || (m.old && m.old.id);
        if (id && m.eventType !== 'DELETE') refetchSoon(id);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'people' }, function () { if (sharedOn) loadPeopleSoon(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shared' }, function () { if (sharedOn) loadSharedSoon(); })
      .subscribe(function (st) {
        // (Re)connected: catch up on anything missed while away.
        if (st === 'SUBSCRIBED' && S.user === me && S.ready) loadAll();
      });
    return loadAll();
  }
  function loadAll() {
    var me = S.user;
    return q(sb.from('classes').select('*')).then(function (rows) {
      if (S.user !== me) return;
      var changed = false;
      rows.forEach(function (r) { if (applyRemote(r)) changed = true; });
      if (!S.ready) {
        S.ready = true;
        // Classes this device thinks are in the cloud but aren't (deleted elsewhere) go back to device-only.
        var ids = {}; rows.forEach(function (r) { ids[r.id] = true; });
        Store.profiles().forEach(function (p) {
          if (p.cloud && !ids[p.id] && (S.admin || p.ownerEmail === S.user.email)) { Store.setProfileFields(p.id, { cloud: undefined }); ls(BASE_KEY + p.id, null); }
        });
        Object.keys(deviceOnly).forEach(function (pid) { if (deviceOnly[pid] === false) { delete deviceOnly[pid]; upload(pid); } });
        startShared();
      } else if (sharedOn) { loadPeople(); loadShared(); }
      // Changes made here while offline that haven't gone up yet.
      Store.profiles().forEach(function (p) { if (p.cloud) pushLocal(p.id); });
      settle();
      if (changed) renderSoon();
    }, function (e) { failed(e); });
  }
  function refetchSoon(id) {
    clearTimeout(refetchTimers[id]);
    refetchTimers[id] = setTimeout(function () {
      var me = S.user;
      q(sb.from('classes').select('*').eq('id', id).maybeSingle()).then(function (r) {
        if (S.user !== me || !r) return;
        if (applyRemote(r)) renderSoon();
      }, failed);
    }, 250);
  }

  // ---------- cloud -> device ----------
  // Three-way merge of one value: l = this device, r = cloud, b = what the cloud had last time we synced.
  // Returns 'l' (keep / send ours), 'r' (take theirs) or '' (same).
  function pick(l, r, b) {
    if (l === r) return '';
    var hl = l === undefined ? undefined : hash(l), hr = r === undefined ? undefined : hash(r);
    if (hl === b) return 'r';           // we didn't change it: take the cloud's
    if (hr === b) return 'l';           // only we changed it: send ours
    return 'r';                         // both changed: the cloud's copy wins
  }
  function applyRemote(r) {
    var id = r.id;
    var remote = { data: r.data || {}, issues: r.issues || {} };
    var had = Store.hasData(id);
    var before = profileById(id);
    // Sample classes keep their "Sample" tag on every device (older uploads are recognised by class and rebbi).
    var g = r.sample_grade || ((window.DemoData && DemoData.grades.filter(function (x) { return x.className === r.class_name && x.rebbi === r.name; })[0]) || {}).grade;
    Store.ensureProfile({ id: id, name: r.name, className: r.class_name, role: r.role, cloud: true, ownerEmail: r.owner_email,
      sampleGrade: g || undefined, sample: r.sample || undefined, staff: r.staff || undefined });
    var local = had ? split(Store.peek(id)) : { data: {}, issues: {} };
    var base = getBase(id) || { data: {}, issues: {} };
    var merged = { data: {}, issues: {} }, push = [];
    ['data', 'issues'].forEach(function (part) {
      var keys = {};
      Object.keys(local[part]).concat(Object.keys(remote[part])).forEach(function (k) { keys[k] = true; });
      Object.keys(keys).forEach(function (k) {
        var l = local[part][k], rv = remote[part][k];
        var w = had ? pick(l, rv, base[part][k]) : 'r';
        var v = w === 'l' ? l : w === 'r' ? rv : l;
        if (v !== undefined) merged[part][k] = v;
        if (w === 'l') push.push([part, k, l]);
      });
    });
    var localChanged = !had || JSON.stringify(merged) !== JSON.stringify(local);
    setBase(id, remote);
    if (localChanged) Store.replaceProfileData(id, join(merged), { silent: true });
    if (push.length) send(id, push);
    return localChanged || !before;
  }

  // ---------- device -> cloud ----------
  // entries: [part, key, value or undefined to remove]. Once the cloud has them, the base remembers them.
  // One write per class at a time; changes made meanwhile go in the next one.
  function send(id, entries) {
    if (!sb || !S.user) return;
    if (sending[id]) { again[id] = true; return; }
    var p = profileById(id) || {};
    var args = { p_id: id, p_device: deviceId(), meta: { name: p.name || '', class_name: p.className || '' },
      set_data: {}, del_data: [], set_issues: {}, del_issues: [] };
    entries.forEach(function (e) {
      if (e[2] === undefined) args['del_' + e[0]].push(e[1]); else args['set_' + e[0]][e[1]] = e[2];
    });
    sending[id] = true; inFlight++;
    setStatus('syncing');
    q(sb.rpc('class_patch', args)).then(function () {
      var base = getBase(id) || { data: {}, issues: {} };
      entries.forEach(function (e) { if (e[2] === undefined) delete base[e[0]][e[1]]; else base[e[0]][e[1]] = hash(e[2]); });
      ls(BASE_KEY + id, JSON.stringify(base));
    }, function (e) {
      failed(e);
      if (!isNetwork(e)) ls(BASE_KEY + id, null); // re-merge from scratch next time the cloud copy arrives
    }).then(function () {
      sending[id] = false; inFlight--;
      if (again[id]) { again[id] = false; pushLocal(id); }
      settle();
    });
  }
  function pushLocal(id) {
    var p = profileById(id);
    if (!p || !p.cloud || !S.user || !S.ready) return;
    if (!S.admin && p.ownerEmail && p.ownerEmail !== S.user.email) return; // someone else's class opened with Skip
    if (sending[id]) { again[id] = true; return; }
    var local = split(Store.peek(id));
    if (size(local) > MAX_BYTES) { setStatus('error', 'This class is too big to sync (over 900 KB).'); return; }
    var base = getBase(id);
    if (!base) return; // waiting for the cloud copy to merge with
    var entries = [];
    ['data', 'issues'].forEach(function (part) {
      Object.keys(local[part]).forEach(function (k) { if (hash(local[part][k]) !== base[part][k]) entries.push([part, k, local[part][k]]); });
      Object.keys(base[part]).forEach(function (k) { if (!(k in local[part])) entries.push([part, k, undefined]); });
    });
    if (!entries.length) return;
    if (navigator.onLine === false) { setStatus('offline'); return; } // goes up when back online (loadAll)
    send(id, entries);
  }
  Store.onWrite(function (id) {
    if (!id || !S.user) return;
    // A profile made while signed in goes to the cloud by itself.
    var p = profileById(id);
    if (p && !p.cloud && !deviceOnly[id]) {
      if (S.ready) upload(id).then(function () { App.render(); }); else deviceOnly[id] = false;
      return;
    }
    clearTimeout(timers[id]);
    timers[id] = setTimeout(function () { pushLocal(id); pushShared(id); publishPeople(); }, 600);
  });

  // Put a class that's only on this device into the cloud, owned by the signed-in account.
  function upload(id) {
    var p = profileById(id);
    if (!p || !S.user) return Promise.resolve();
    var local = split(Store.peek(id));
    if (size(local) > MAX_BYTES) { alert(p.name + '\'s class is too big to sync (over 900 KB).'); return Promise.resolve(); }
    Store.setProfileFields(id, { cloud: true, ownerEmail: S.user.email });
    setBase(id, local);
    setStatus('syncing'); inFlight++;
    return q(sb.from('classes').insert({
      id: id, owner: S.user.uid, owner_email: S.user.email, name: p.name || '', class_name: p.className || '', role: p.role === 'admin' ? 'admin' : 'rebbi',
      sample_grade: p.sampleGrade || 0, sample: !!p.sample, staff: p.staff || '',
      data: local.data, issues: local.issues, updated_by: S.user.uid, updated_device: deviceId()
    })).then(function () { publishPeople(); }, function (e) {
      Store.setProfileFields(id, { cloud: undefined }); ls(BASE_KEY + id, null);
      failed(e); UI.toast('Upload failed: ' + e.message);
    }).then(function () { inFlight--; settle(); });
  }

  // ---------- issues sent from one rebbi to another ----------
  // A rebbi can't read another rebbi's class, so an issue sent to other rebbeim is also copied to the shared table,
  // which only the people on it can read. Replies from the others are added there and copied back into the
  // sender's own issue by the sender's device.
  function myRebbiProfiles() {
    return Store.profiles().filter(function (p) { return p.cloud && p.role !== 'admin' && p.ownerEmail === S.user.email; });
  }
  var lastPeople = '';
  function publishPeople() {
    if (!sb || !S.user || !S.ready) return Promise.resolve();
    var profiles = {};
    myRebbiProfiles().forEach(function (p) {
      var st = Store.peek(p.id).settings || {};
      profiles[p.id] = { name: st.rebbiName || p.name || '', className: st.className || p.className || '' };
    });
    var key = JSON.stringify(profiles);
    if (key === lastPeople) return Promise.resolve();
    if (key === '{}') return Promise.resolve(); // only rebbeim with a class are in the directory
    lastPeople = key;
    return q(sb.from('people').upsert({ email: S.user.email, uid: S.user.uid, profiles: profiles, updated_at: new Date().toISOString() }))
      .then(function () { if (sharedOn) loadPeople(); }, function () { lastPeople = ''; });
  }
  // The directory of rebbeim (readable once this account has a class in it, or by the office).
  function loadPeople() {
    var me = S.user;
    return q(sb.from('people').select('email, profiles')).then(function (rows) {
      if (S.user !== me) return;
      var list = [];
      rows.forEach(function (v) {
        Object.keys(v.profiles || {}).forEach(function (pid) { list.push({ key: 'rebbi:' + pid, id: pid, name: v.profiles[pid].name, cls: v.profiles[pid].className, email: v.email }); });
      });
      S.people = list;
      myRebbiProfiles().forEach(function (p) { pushShared(p.id); }); // now that we know everyone's address
    }, function () { S.people = []; });
  }
  function loadShared() {
    var me = S.user;
    return q(sb.from('shared').select('*')).then(function (rows) {
      if (S.user !== me) return;
      var all = {};
      rows.forEach(function (r) {
        all[r.id] = { from: r.from_uid, fromEmail: r.from_email, fromProfileId: r.from_profile_id, members: r.members,
          toKeys: r.to_keys, issue: r.issue, byPhone: r.by_phone, replies: r.replies || {}, seen: r.seen || {} };
      });
      S.shared = all;
      mergeReplies();
      renderSoon();
    }, failed);
  }
  var peopleTimer = null, sharedTimer = null;
  function loadPeopleSoon() { clearTimeout(peopleTimer); peopleTimer = setTimeout(loadPeople, 300); }
  function loadSharedSoon() { clearTimeout(sharedTimer); sharedTimer = setTimeout(loadShared, 300); }
  function startShared() {
    if (!sb || !S.user || sharedOn) return;
    sharedOn = true;
    Promise.resolve(publishPeople()).then(function () {
      if (!S.user) return;
      loadPeople(); loadShared();
    });
  }
  function noteKey(n) { return n.id || [n.date, n.by, n.text].join('|'); }
  // On the sender's device: copy the others' replies and read marks into his own issue.
  function mergeReplies() {
    Object.keys(S.shared).forEach(function (iid) {
      var doc = S.shared[iid];
      if (doc.from !== S.user.uid || !Store.hasData(doc.fromProfileId)) return;
      var replies = Object.keys(doc.replies || {}).map(function (k) { try { return JSON.parse(doc.replies[k]); } catch (e) { return null; } }).filter(Boolean);
      var issue = (Store.peek(doc.fromProfileId).issues || []).filter(function (i) { return i.id === iid; })[0];
      if (!issue) return;
      var have = {}; (issue.notes || []).forEach(function (n) { have[noteKey(n)] = true; });
      var add = replies.filter(function (n) { return !have[noteKey(n)]; }).sort(function (a, b) { return (a.at || '').localeCompare(b.at || ''); });
      var seen = doc.seen || {}, seenChanged = Object.keys(seen).some(function (k) { return (issue.seenBy || {})[k] !== seen[k]; });
      if (!add.length && !seenChanged) return;
      Store.updateProfile(doc.fromProfileId, function (d) {
        (d.issues || []).forEach(function (i) {
          if (i.id !== iid) return;
          i.notes = (i.notes || []).concat(add);
          i.seenBy = Object.assign({}, i.seenBy || {}, seen);
          if (add.length) { i.updatedAt = Store.todayISO(); if (i.status === 'done') i.status = 'open'; }
        });
      });
    });
  }
  // Recipients' email addresses for an issue's rebbi recipients.
  function emailFor(key, issue) {
    var pid = key.replace(/^rebbi:/, '');
    var p = S.people.filter(function (x) { return x.id === pid; })[0];
    if (p) return p.email;
    var lp = Store.profiles().filter(function (x) { return x.id === pid; })[0];
    return (lp && lp.ownerEmail) || (issue.toEmails || {})[key] || '';
  }
  // On the sender's device: send his issues that go to other rebbeim (only what changed).
  function pushShared(id) {
    if (!sb || !S.user || !S.ready) return;
    var p = profileById(id);
    if (!p || !p.cloud || p.ownerEmail !== S.user.email) return;
    var data = Store.peek(id);
    (data.issues || []).forEach(function (i) {
      var keys = (Array.isArray(i.to) ? i.to : []).filter(function (k) { return k.indexOf('rebbi:') === 0; });
      if (!keys.length) return;
      var members = [S.user.email];
      keys.forEach(function (k) { var e = (emailFor(k, i) || '').toLowerCase(); if (e && members.indexOf(e) < 0) members.push(e); });
      var json = JSON.stringify(i);
      var sig = hash(json + members.join(','));
      if (ls(SENT_KEY + i.id) === sig) return;
      if (members.length < 2 && !S.shared[i.id]) return; // nobody to send it to yet
      q(sb.rpc('shared_put', { p_id: i.id, p_profile: id, p_members: members, p_to_keys: keys, p_issue: json,
        p_phone: i.byPhone || (data.settings && data.settings.rebbiPhone) || '' }))
        .then(function () { ls(SENT_KEY + i.id, sig); }, failed);
    });
  }
  // On a recipient's device: issues other rebbeim sent to this profile.
  function receivedFor(profileId) {
    if (!S.user) return [];
    var out = [];
    Object.keys(S.shared).forEach(function (iid) {
      var doc = S.shared[iid];
      if (doc.from === S.user.uid && Store.hasData(doc.fromProfileId)) return; // my own (shown from my class)
      if ((doc.toKeys || []).indexOf('rebbi:' + profileId) < 0) return;
      var i; try { i = JSON.parse(doc.issue); } catch (e) { return; }
      var have = {}; (i.notes || []).forEach(function (n) { have[noteKey(n)] = true; });
      Object.keys(doc.replies || {}).forEach(function (k) {
        try { var n = JSON.parse(doc.replies[k]); if (!have[noteKey(n)]) { i.notes = (i.notes || []).concat([n]); have[noteKey(n)] = true; } } catch (e) { /* skip */ }
      });
      (i.notes || []).sort(function (a, b) { return (a.at || a.date || '').localeCompare(b.at || b.date || ''); });
      i.seenBy = Object.assign({}, i.seenBy || {}, doc.seen || {});
      out.push({ issue: i, profileId: doc.fromProfileId, shared: true, talmid: null, byPhone: doc.byPhone || i.byPhone || '' });
    });
    return out;
  }
  function replyShared(issueId, note) {
    if (!sb || !S.user) return Promise.reject(new Error('Not signed in'));
    var doc = S.shared[issueId];
    if (doc) { doc.replies = Object.assign({}, doc.replies || {}); doc.replies[note.id] = JSON.stringify(note); } // show it right away
    return q(sb.rpc('shared_reply', { p_id: issueId, p_note_id: note.id, p_note: JSON.stringify(note) }))
      .catch(function (e) { failed(e); UI.toast('Reply didn\'t send: ' + e.message); });
  }
  function seenShared(issueId, profileId, n) {
    if (!sb || !S.user || !S.shared[issueId]) return;
    var doc = S.shared[issueId];
    if ((doc.seen || {})[profileId] === n) return;
    doc.seen = Object.assign({}, doc.seen || {}); doc.seen[profileId] = n;
    q(sb.rpc('shared_seen', { p_id: issueId, p_profile: profileId, p_n: n })).catch(function () { /* try again next time */ });
  }
  function people() { return S.people.slice(); }

  // ---------- screens ----------
  function statusLine() {
    return h('div.sync-status',
      h('span.sync-dot.' + S.status),
      h('span', STATUS_TEXT[S.status] + (S.error && S.status === 'error' ? ' – ' + S.error : '')));
  }
  // Settings card.
  function card() {
    var box = h('div.card.sync-card', h('h2', 'Sync across devices'));
    if (!configured()) {
      box.appendChild(h('p.muted', 'Sync isn\'t set up in this version of the app yet. Everything stays on this device.'));
      return box;
    }
    if (!S.user) {
      box.appendChild(h('p', 'Sign in with Google to keep your classes, issues and planner the same on your phone and computer. Without signing in, everything stays on this device only.'));
      if (S.status === 'error' || S.status === 'offline' || S.status === 'loading') box.appendChild(statusLine());
      box.appendChild(h('button.btn.primary', { type: 'button', onclick: signIn }, 'Sign in with Google'));
      box.appendChild(h('p.small.muted', 'Test version: please use sample classes only, not real talmidim\'s information, until the school sets it up officially.'));
      return box;
    }
    box.appendChild(h('p', 'Signed in as ', h('strong', S.user.email), S.admin ? h('span.pill', { style: 'margin-left:6px' }, 'Office') : null));
    box.appendChild(statusLine());
    var localOnly = Store.profiles().filter(function (p) { return !p.cloud; });
    if (localOnly.length) {
      box.appendChild(h('h3', 'Only on this device'));
      box.appendChild(h('p.small.muted', 'These were on this device before you signed in. Upload a profile to see it on your other devices. (New profiles you make while signed in upload by themselves.) If the same class was made separately on two devices, upload it from just one of them.'));
      box.appendChild(h('div.sync-list', localOnly.map(function (p) {
        return h('div.row.between.gap.sync-row',
          h('div', h('div', p.name), h('div.small.muted', p.role === 'admin' ? 'Office' : p.className || '')),
          h('button.btn.small', { type: 'button', disabled: !S.ready, onclick: function () { upload(p.id).then(function () { UI.toast('Uploaded'); App.render(); }); } }, 'Upload'));
      })));
      if (localOnly.length > 1) box.appendChild(h('button.btn', { type: 'button', disabled: !S.ready, onclick: function () {
        Promise.all(localOnly.map(function (p) { return upload(p.id); })).then(function () { UI.toast('Uploaded ' + localOnly.length); App.render(); });
      } }, 'Upload all'));
    } else {
      box.appendChild(h('p.small.muted', 'Every profile on this device is synced.'));
    }
    box.appendChild(h('div.row.gap.wrap', { style: 'margin-top:10px' }, h('button.btn', { type: 'button', onclick: signOut }, 'Sign out')));
    return box;
  }
  // Short version for the log-in screen.
  function loginCard() {
    if (!configured()) return h('div');
    if (S.user) return h('div.sync-login.small', statusLine(), h('span.muted', 'Signed in as ' + S.user.email));
    return h('div.sync-login',
      h('button.btn.big', { type: 'button', onclick: signIn }, 'Sign in with Google to get your classes'),
      S.status === 'error' ? statusLine() : null);
  }

  // ---------- live calendar feed ----------
  // calendars: the rebbi's calendar as ready-made .ics text. The "calendar" Edge Function serves it at a
  // secret link that Google / Apple Calendar subscribe to. Only the owner can write it.
  function publishCalendar(token, ics, name) {
    if (!S.user || !sb) return Promise.reject(new Error('not signed in'));
    return q(sb.from('calendars').upsert({ token: token, owner: S.user.uid, name: name || '', ics: ics, updated_at: new Date().toISOString() }));
  }
  function removeCalendar(token) {
    if (!S.user || !sb) return Promise.reject(new Error('not signed in'));
    return q(sb.from('calendars').delete().eq('token', token));
  }
  function idToken() {
    if (!S.user || !sb) return Promise.reject(new Error('not signed in'));
    return sb.auth.getSession().then(function (r) {
      var s = r.data && r.data.session;
      if (!s) throw new Error('not signed in');
      return s.access_token;
    });
  }

  window.Sync = { start: start, signIn: signIn, signOut: signOut, lock: lock, canOpen: canOpen, isAdmin: function () { return S.admin; }, card: card, loginCard: loginCard, upload: upload,
    status: function () { return S.status; }, user: function () { return S.user; }, isOn: function () { return !!S.user; },
    people: people, receivedFor: receivedFor, replyShared: replyShared, seenShared: seenShared,
    publishCalendar: publishCalendar, removeCalendar: removeCalendar, idToken: idToken,
    functionsURL: function (name) { return CONFIG.url ? CONFIG.url.replace(/\/+$/, '') + '/functions/v1/' + name : ''; },
    configured: configured };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.addEventListener('online', function () {
    if (wanted() && !S.user) start();
    else if (S.user && S.ready) loadAll();
  });
  window.addEventListener('offline', function () { if (S.user) setStatus('offline'); });
})();
