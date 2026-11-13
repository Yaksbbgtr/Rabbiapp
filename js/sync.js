/*
 * Cloud sync (Firebase). Optional: with sync off the app works exactly as before, from this device only.
 *
 * Each profile (a rebbi's class, or the office's own data) is one Firestore document, classes/{profileId}:
 *   { owner: uid, ownerEmail, name, className, role, updatedAt, updatedBy,
 *     data:   { <top-level key>: JSON string },   e.g. data.talmidim, data.lessons, data.settings
 *     issues: { <issue id>: JSON string } }       one entry per issue, so rebbi and office edits don't collide
 * Only the keys that changed are written. Each device remembers what the cloud last had (as small hashes), so it
 * can tell its own changes apart from changes made elsewhere and merge them, including edits made offline.
 * Who may read what is enforced by firestore.rules: a rebbi sees his own classes, the office sees all.
 */
(function () {
  'use strict';
  var h = UI.h;
  var CONFIG = {
    apiKey: 'AIzaSyBVqaT6xNsuCoBuWH0CGzx2EQxiYV2DOX0',
    authDomain: 'rabbi--app.firebaseapp.com',
    projectId: 'rabbi--app',
    storageBucket: 'rabbi--app.firebasestorage.app',
    messagingSenderId: '115495989124',
    appId: '1:115495989124:web:976263b22ebb671ff3b7d1'
  };
  var SDK = 'https://www.gstatic.com/firebasejs/10.14.1/firebase-';
  var ON_KEY = 'rabbiapp.sync.on';
  var BASE_KEY = 'rabbiapp.sync.base.';
  var MAX_BYTES = 900000; // Firestore documents hold up to 1 MB

  var S = { status: 'off', user: null, admin: false, error: '', ready: false, people: [], shared: {} };
  var auth = null, db = null, unsub = null, sdkPromise = null, unsubPeople = null, unsubShared = null;
  var SENT_KEY = 'rabbiapp.shared.sent.'; // what this device last sent for each shared issue (a hash)
  var timers = {};
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

  // ---------- loading Firebase ----------
  function script(src) {
    return new Promise(function (ok, fail) {
      var el = document.createElement('script');
      el.src = src; el.onload = ok; el.onerror = function () { fail(new Error('Could not load ' + src)); };
      document.head.appendChild(el);
    });
  }
  function loadSdk() {
    if (!sdkPromise) {
      sdkPromise = script(SDK + 'app-compat.js')
        .then(function () { return Promise.all([script(SDK + 'auth-compat.js'), script(SDK + 'firestore-compat.js')]); })
        .then(function () {
          if (!firebase.apps.length) firebase.initializeApp(CONFIG);
          auth = firebase.auth();
          db = firebase.firestore();
          // Developer testing only: point at local Firebase emulators when this device is set up for it.
          var emu = ls('rabbiapp.sync.emulator');
          if (emu) { auth.useEmulator('http://' + emu + ':9099'); db.useEmulator(emu, 8080); }
          // Keep a copy on the device so the app works offline and catches up later.
          try { db.enablePersistence({ synchronizeTabs: true }).catch(function () { /* another tab or private mode */ }); } catch (e) { /* ignore */ }
          auth.onAuthStateChanged(onUser);
          auth.getRedirectResult().catch(function (e) { setStatus('error', e.message); });
        });
      sdkPromise.catch(function () { sdkPromise = null; });
    }
    return sdkPromise;
  }
  function start() {
    if (!wanted()) { setStatus('off'); return Promise.resolve(); }
    setStatus('loading');
    return loadSdk().catch(function () {
      setStatus(navigator.onLine === false ? 'offline' : 'error', 'Couldn\'t reach the sync service.');
    });
  }

  // ---------- signing in and out ----------
  // Resolves with the signed-in user once we know whether it's an office account (or null if it didn't happen).
  var signingIn = null;
  function signIn() {
    if (signingIn) return signingIn; // a second tap while the Google window is open would break it
    signingIn = signInOnce().then(function (u) { signingIn = null; return u; }, function (e) { signingIn = null; throw e; });
    return signingIn;
  }
  function signInOnce() {
    ls(ON_KEY, '1');
    setStatus('loading');
    return loadSdk().then(function () {
      var p = new firebase.auth.GoogleAuthProvider();
      p.setCustomParameters({ prompt: 'select_account' });
      return auth.signInWithPopup(p).then(function (res) {
        return new Promise(function (ok) { (function wait() { if (S.user && S.user.uid === res.user.uid && S.adminP) S.adminP.then(function () { ok(S.user); }); else setTimeout(wait, 100); })(); });
      }, function (e) {
        if (/popup-blocked|operation-not-supported|web-storage-unsupported/.test(e.code || '')) return auth.signInWithRedirect(p).then(function () { return null; });
        if (/popup-closed|cancelled-popup/.test(e.code || '')) { setStatus(S.user ? 'synced' : 'signedout'); return null; }
        throw e;
      });
    }).catch(function (e) { setStatus('error', e.message); UI.toast('Sign-in didn\'t work: ' + e.message); return null; });
  }
  // Log out of Google but keep the classes on the device (Log out on the profile menu).
  function stopShared() {
    if (unsubPeople) { unsubPeople(); unsubPeople = null; }
    if (unsubShared) { unsubShared(); unsubShared = null; }
    S.people = []; S.shared = {};
  }
  function lock() {
    if (unsub) { unsub(); unsub = null; }
    stopShared();
    if (auth && S.user) auth.signOut();
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
      if (unsub) { unsub(); unsub = null; }
      stopShared();
      Store.profiles().filter(function (p) { return p.cloud; }).forEach(function (p) { Store.deleteProfile(p.id); ls(BASE_KEY + p.id, null); });
      ls(ON_KEY, null);
      (auth ? auth.signOut() : Promise.resolve()).then(function () {
        S.user = null; S.admin = false; setStatus('off');
        App.go('login'); App.render();
      });
    }, 'Sign out');
  }

  function onUser(u) {
    if (unsub) { unsub(); unsub = null; }
    stopShared();
    S.user = u; S.admin = false; S.ready = false; S.adminP = null;
    if (!u) { setStatus(wanted() ? 'signedout' : 'off'); return; }
    ls(ON_KEY, '1');
    deviceOnly = {};
    Store.profiles().forEach(function (p) { if (!p.cloud) deviceOnly[p.id] = true; });
    setStatus('loading');
    S.adminP = db.collection('admins').doc(u.email).get()
      .then(function (d) { S.admin = d.exists; }, function () { S.admin = false; });
    S.adminP.then(listen);
  }

  function listen() {
    var q = S.admin ? db.collection('classes') : db.collection('classes').where('owner', '==', S.user.uid);
    unsub = q.onSnapshot({ includeMetadataChanges: true }, function (snap) {
      var changed = false;
      snap.docChanges().forEach(function (ch) {
        if (ch.type === 'removed') return;
        if (applyRemote(ch.doc)) changed = true;
      });
      if (!snap.metadata.fromCache && !S.ready) {
        S.ready = true;
        // Classes this device thinks are in the cloud but aren't (deleted elsewhere) go back to device-only.
        var ids = {}; snap.docs.forEach(function (d) { ids[d.id] = true; });
        Store.profiles().forEach(function (p) {
          if (p.cloud && !ids[p.id] && (S.admin || p.ownerEmail === S.user.email)) { Store.setProfileFields(p.id, { cloud: undefined }); ls(BASE_KEY + p.id, null); }
        });
        Object.keys(deviceOnly).forEach(function (pid) { if (deviceOnly[pid] === false) { delete deviceOnly[pid]; upload(pid); } });
        startShared();
      }
      setStatus(snap.metadata.hasPendingWrites ? 'syncing' : snap.metadata.fromCache ? (navigator.onLine === false ? 'offline' : 'loading') : 'synced');
      if (changed) renderSoon();
    }, function (e) { setStatus('error', e.message); });
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
  function applyRemote(doc) {
    if (doc.metadata.hasPendingWrites) return false; // our own write echoing back
    var id = doc.id, r = doc.data() || {};
    var remote = { data: r.data || {}, issues: r.issues || {} };
    var had = Store.hasData(id);
    var before = Store.profiles().filter(function (p) { return p.id === id; })[0];
    // Sample classes keep their "Sample" tag on every device (older uploads are recognised by class and rebbi).
    var g = r.sampleGrade || ((window.DemoData && DemoData.grades.filter(function (x) { return x.className === r.className && x.rebbi === r.name; })[0]) || {}).grade;
    Store.ensureProfile({ id: id, name: r.name, className: r.className, role: r.role, cloud: true, ownerEmail: r.ownerEmail,
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
  function send(id, entries) {
    if (!db || !S.user) return;
    var p = Store.profiles().filter(function (x) { return x.id === id; })[0] || {};
    var FP = firebase.firestore.FieldPath, FV = firebase.firestore.FieldValue;
    var args = [new FP('updatedAt'), FV.serverTimestamp(), new FP('updatedBy'), S.user.uid,
      new FP('name'), p.name || '', new FP('className'), p.className || ''];
    entries.forEach(function (e) { args.push(new FP(e[0], e[1]), e[2] === undefined ? FV.delete() : e[2]); });
    var ref = db.collection('classes').doc(id);
    setStatus('syncing');
    ref.update.apply(ref, args).catch(function (err) {
      setStatus('error', err.message);
      ls(BASE_KEY + id, null); // re-merge from scratch next time the cloud copy arrives
    });
  }
  function pushLocal(id) {
    var p = Store.profiles().filter(function (x) { return x.id === id; })[0];
    if (!p || !p.cloud || !S.user || !S.ready) return;
    if (!S.admin && p.ownerEmail && p.ownerEmail !== S.user.email) return; // someone else's class opened with Skip
    var local = split(Store.peek(id));
    if (size(local) > MAX_BYTES) { setStatus('error', 'This class is too big to sync (over 900 KB).'); return; }
    var base = getBase(id) || { data: {}, issues: {} };
    var entries = [];
    ['data', 'issues'].forEach(function (part) {
      Object.keys(local[part]).forEach(function (k) { if (hash(local[part][k]) !== base[part][k]) entries.push([part, k, local[part][k]]); });
      Object.keys(base[part]).forEach(function (k) { if (!(k in local[part])) entries.push([part, k, undefined]); });
    });
    if (!entries.length) return;
    setBase(id, local);
    send(id, entries);
  }
  Store.onWrite(function (id) {
    if (!id || !S.user) return;
    // A profile made while signed in goes to the cloud by itself.
    var p = Store.profiles().filter(function (x) { return x.id === id; })[0];
    if (p && !p.cloud && !deviceOnly[id]) {
      if (S.ready) upload(id).then(function () { App.render(); }); else deviceOnly[id] = false;
      return;
    }
    clearTimeout(timers[id]);
    timers[id] = setTimeout(function () { pushLocal(id); pushShared(id); publishPeople(); }, 600);
  });

  // Put a class that's only on this device into the cloud, owned by the signed-in account.
  function upload(id) {
    var p = Store.profiles().filter(function (x) { return x.id === id; })[0];
    if (!p || !S.user) return Promise.resolve();
    var local = split(Store.peek(id));
    if (size(local) > MAX_BYTES) { alert(p.name + '\'s class is too big to sync (over 900 KB).'); return Promise.resolve(); }
    Store.setProfileFields(id, { cloud: true, ownerEmail: S.user.email });
    setBase(id, local);
    setStatus('syncing');
    return db.collection('classes').doc(id).set({
      owner: S.user.uid, ownerEmail: S.user.email, name: p.name || '', className: p.className || '', role: p.role === 'admin' ? 'admin' : 'rebbi',
      sampleGrade: p.sampleGrade || 0, sample: !!p.sample, staff: p.staff || '',
      data: local.data, issues: local.issues, updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: S.user.uid
    }).then(function () { publishPeople(); }, function (e) {
      Store.setProfileFields(id, { cloud: undefined }); ls(BASE_KEY + id, null);
      setStatus('error', e.message); UI.toast('Upload failed: ' + e.message);
    });
  }

  // ---------- issues sent from one rebbi to another ----------
  // A rebbi can't read another rebbi's class, so an issue sent to other rebbeim is also copied to shared/{issueId},
  // which only the people on it can open. Replies from the others are added there and copied back into the
  // sender's own issue by the sender's device.
  function myRebbiProfiles() {
    return Store.profiles().filter(function (p) { return p.cloud && p.role !== 'admin' && p.ownerEmail === S.user.email; });
  }
  var lastPeople = '';
  function publishPeople() {
    if (!db || !S.user || !S.ready) return;
    var profiles = {};
    myRebbiProfiles().forEach(function (p) {
      var st = Store.peek(p.id).settings || {};
      profiles[p.id] = { name: st.rebbiName || p.name || '', className: st.className || p.className || '' };
    });
    var key = JSON.stringify(profiles);
    if (key === lastPeople) return Promise.resolve();
    if (key === '{}') return Promise.resolve(); // only rebbeim with a class are in the directory
    lastPeople = key;
    return db.collection('people').doc(S.user.email).set({ uid: S.user.uid, email: S.user.email, profiles: profiles, updatedAt: firebase.firestore.FieldValue.serverTimestamp() })
      .then(function () { if (!unsubPeople) listenPeople(); }, function () { lastPeople = ''; });
  }
  // The directory of rebbeim (readable once this account has a class in it, or by the office).
  function listenPeople() {
    if (!db || !S.user || unsubPeople) return;
    unsubPeople = db.collection('people').onSnapshot(function (snap) {
      var list = [];
      snap.forEach(function (d) {
        var v = d.data() || {};
        Object.keys(v.profiles || {}).forEach(function (pid) { list.push({ key: 'rebbi:' + pid, id: pid, name: v.profiles[pid].name, cls: v.profiles[pid].className, email: v.email || d.id }); });
      });
      S.people = list;
      myRebbiProfiles().forEach(function (p) { pushShared(p.id); }); // now that we know everyone's address
    }, function () { S.people = []; unsubPeople = null; }); // not in the directory yet: try again once we are
  }
  function startShared() {
    if (!db || !S.user || unsubShared) return;
    Promise.resolve(publishPeople()).then(function () {
      if (!S.user) return;
      listenPeople();
      unsubShared = db.collection('shared').where('members', 'array-contains', S.user.email).onSnapshot(function (snap) {
        var all = {};
        snap.forEach(function (d) { all[d.id] = d.data(); });
        S.shared = all;
        mergeReplies();
        renderSoon();
      }, function (e) { setStatus('error', e.message); });
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
    if (!db || !S.user || !S.ready) return;
    var p = Store.profiles().filter(function (x) { return x.id === id; })[0];
    if (!p || !p.cloud || p.ownerEmail !== S.user.email) return;
    var data = Store.peek(id);
    (data.issues || []).forEach(function (i) {
      var keys = (Array.isArray(i.to) ? i.to : []).filter(function (k) { return k.indexOf('rebbi:') === 0; });
      if (!keys.length) return;
      var members = [S.user.email];
      keys.forEach(function (k) { var e = emailFor(k, i); if (e && members.indexOf(e) < 0) members.push(e); });
      var json = JSON.stringify(i);
      var sig = hash(json + members.join(','));
      if (ls(SENT_KEY + i.id) === sig) return;
      if (members.length < 2 && !S.shared[i.id]) return; // nobody to send it to yet
      db.collection('shared').doc(i.id).set({
        from: S.user.uid, fromEmail: S.user.email, fromProfileId: id, members: members, toKeys: keys,
        issue: json, byPhone: i.byPhone || (data.settings && data.settings.rebbiPhone) || '',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true }).then(function () { ls(SENT_KEY + i.id, sig); }, function (e) { setStatus('error', e.message); });
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
    if (!db || !S.user) return Promise.reject(new Error('Not signed in'));
    var FP = firebase.firestore.FieldPath;
    var doc = S.shared[issueId];
    if (doc) { doc.replies = Object.assign({}, doc.replies || {}); doc.replies[note.id] = JSON.stringify(note); } // show it right away
    return db.collection('shared').doc(issueId).update(new FP('replies', note.id), JSON.stringify(note), new FP('updatedAt'), firebase.firestore.FieldValue.serverTimestamp())
      .catch(function (e) { setStatus('error', e.message); UI.toast('Reply didn\'t send: ' + e.message); });
  }
  function seenShared(issueId, profileId, n) {
    if (!db || !S.user || !S.shared[issueId]) return;
    var doc = S.shared[issueId];
    if ((doc.seen || {})[profileId] === n) return;
    doc.seen = Object.assign({}, doc.seen || {}); doc.seen[profileId] = n;
    db.collection('shared').doc(issueId).update(new firebase.firestore.FieldPath('seen', profileId), n).catch(function () { /* try again next time */ });
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
    if (S.user) return h('div.sync-login.small', statusLine(), h('span.muted', 'Signed in as ' + S.user.email));
    return h('div.sync-login',
      h('button.btn.big', { type: 'button', onclick: signIn }, 'Sign in with Google to get your classes'),
      S.status === 'error' ? statusLine() : null);
  }

  window.Sync = { start: start, signIn: signIn, signOut: signOut, lock: lock, canOpen: canOpen, isAdmin: function () { return S.admin; }, card: card, loginCard: loginCard, upload: upload,
    status: function () { return S.status; }, user: function () { return S.user; }, isOn: function () { return !!S.user; },
    people: people, receivedFor: receivedFor, replyShared: replyShared, seenShared: seenShared };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.addEventListener('online', function () { if (wanted() && !S.user) start(); });
})();
