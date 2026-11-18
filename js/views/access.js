/*
 * Access (office accounts only): who may do what, in one place.
 *   - people asking for office access → Give office access / Not now
 *   - office access: everyone who sees every class; add someone by email, or take it away
 *   - classes: whose each class is; "Give to…" hands it to another Google account (even one that hasn't signed in yet:
 *     it's waiting for them the first time they do)
 *   - everyone who has signed in
 * The database enforces all of it (supabase/schema.sql); this page just shows it.
 */
(function () {
  'use strict';
  var h = UI.h;
  var data = null, loading = null, err = '', stop = null, loadedAt = 0;

  function isEmail(s) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s || '').trim()); }
  function ago(iso) {
    if (!iso) return '';
    var d = (Date.now() - new Date(iso).getTime()) / 60000;
    if (d < 2) return 'just now';
    if (d < 60) return Math.round(d) + ' min ago';
    if (d < 60 * 36) return Math.round(d / 60) + ' h ago';
    return UI.fmtDate(String(iso).slice(0, 10), { weekday: undefined, year: 'numeric' });
  }
  function nameOf(email) {
    var a = data && data.accounts.filter(function (x) { return x.email === email; })[0];
    return a && a.name ? a.name : '';
  }
  function who(email) {
    var n = nameOf(email);
    var seen = data && data.accounts.some(function (x) { return x.email === email; });
    return n ? [h('strong', n), h('div.small.muted', email)] : [h('strong', email), seen ? null : h('div.small.muted', 'hasn\'t signed in yet')];
  }

  function reload() {
    if (loading) return loading;
    loading = Sync.access.load().then(function (d) { data = d; err = ''; }, function (e) { err = e.message; })
      .then(function () { loadedAt = Date.now(); })
      .then(function () { loading = null; if (location.hash === '#/admin-access' && !document.querySelector('.modal-overlay')) App.render(); });
    return loading;
  }
  // Changes from the database (someone asked for access, another office account changed something).
  var soon = null;
  function live() { clearTimeout(soon); soon = setTimeout(reload, 400); }

  function act(p, okMsg) {
    return p.then(function () { UI.toast(okMsg); return reload(); }, function (e) { alert('That didn\'t work: ' + e.message); });
  }

  function giveOffice(email, name) {
    UI.confirm('Give ' + (name || email) + ' office access? They will see and change every class, and can manage access here.', function () {
      act(Sync.access.addAdmin(email), 'Office access given');
    }, 'Give office access');
  }

  // "Give to…": pick someone who has signed in, or type any Google email.
  function giveClass(c) {
    var people = data.accounts.slice().sort(function (a, b) { return (a.name || a.email).localeCompare(b.name || b.email); });
    var sel = UI.select([['', 'Choose someone…']].concat(people.map(function (a) { return [a.email, (a.name ? a.name + ' – ' : '') + a.email]; })), '');
    var typed = UI.input({ type: 'email', dir: 'ltr', placeholder: 'or type their Google email', autocomplete: 'off' });
    sel.addEventListener('change', function () { if (sel.value) typed.value = ''; });
    typed.addEventListener('input', function () { if (typed.value) sel.value = ''; });
    UI.modal('Give ' + label(c) + ' to…', h('div',
      h('p', 'Now: ', h('strong', nameOf(c.owner_email) || c.owner_email || 'nobody')),
      UI.field('New owner', sel), typed,
      h('p.small.muted', { style: 'margin-top:10px' }, 'The class moves to their account the next time they open the app (if they haven\'t signed in yet, it will be waiting for them). ' +
        'It leaves the old owner\'s account. Everything in it stays: talmidim, marks, attendance, documents.')), [
      { label: 'Cancel' },
      { label: 'Give', primary: true, onClick: function () {
        var email = (sel.value || typed.value).trim().toLowerCase();
        if (!isEmail(email)) { UI.toast('Choose someone or type an email'); return false; }
        if (email === c.owner_email) { UI.toast('It already belongs to them'); return false; }
        act(Sync.access.assign(c.id, email), label(c) + ' now belongs to ' + (nameOf(email) || email));
      } }
    ]);
  }
  function label(c) {
    if (c.role === 'admin') return c.name || 'Office profile';
    return [c.name, c.class_name].filter(Boolean).join(' · ') || 'Class';
  }

  function render(main) {
    main.appendChild(h('div.page-head', h('div', h('h1', 'Access'),
      h('p.muted', 'Who sees which classes, and who has office access.'))));
    if (!window.Sync || !Sync.isOn()) {
      main.appendChild(h('div.card', h('p', 'Sign in (Settings → Account) with an office account to manage access.')));
      return;
    }
    if (!Sync.isAdmin()) {
      main.appendChild(h('div.card', h('p', 'Only office accounts can manage access. ', Sync.user().email, ' isn\'t one yet.')));
      return;
    }
    if (!stop) stop = Sync.access.onChange(live);
    if (!data) {
      main.appendChild(h('div.card', h('p.muted', err ? 'Couldn\'t load: ' + err : 'Loading…')));
      if (!loadedAt) reload();
      return;
    }
    var me = Sync.user().email;
    var admins = {}; data.admins.forEach(function (a) { admins[a.email] = a; });

    // ---------- requests ----------
    var asking = data.accounts.filter(function (a) { return a.wants_office && !admins[a.email]; });
    if (asking.length) {
      main.appendChild(h('div.card.access-asking',
        h('h2', 'Asking for office access'),
        asking.map(function (a) {
          return h('div.access-row',
            h('div.grow', who(a.email)),
            h('div.row.gap.wrap',
              h('button.btn.small.primary', { type: 'button', onclick: function () { giveOffice(a.email, a.name); } }, 'Give office access'),
              h('button.btn.small', { type: 'button', onclick: function () { act(Sync.access.dismiss(a.email), 'Request dismissed'); } }, 'Not now')));
        })));
    }

    // ---------- office access ----------
    var addIn = UI.input({ type: 'email', dir: 'ltr', placeholder: 'their Google email', autocomplete: 'off' });
    var addBtn = h('button.btn', { type: 'button', onclick: function () {
      var e = addIn.value.trim().toLowerCase();
      if (!isEmail(e)) { UI.toast('Type a Google email address'); addIn.focus(); return; }
      if (admins[e]) { UI.toast('They already have office access'); return; }
      giveOffice(e, nameOf(e));
    } }, UI.icon('plus', 16), 'Give office access');
    main.appendChild(h('div.card',
      h('h2', 'Office access'),
      h('p.small.muted', 'These accounts see and change every class, open every document, and can manage this page.'),
      h('div.access-list', data.admins.slice().sort(function (a, b) { return a.email.localeCompare(b.email); }).map(function (a) {
        return h('div.access-row',
          h('div.grow', who(a.email), a.added_by ? h('div.small.muted', 'added by ' + (nameOf(a.added_by) || a.added_by)) : null),
          a.email === me ? h('span.pill', 'You')
            : h('button.btn.small', { type: 'button', onclick: function () {
              UI.confirm('Take away office access from ' + (nameOf(a.email) || a.email) + '? They keep their own classes.', function () {
                act(Sync.access.removeAdmin(a.email), 'Office access removed');
              }, 'Take away');
            } }, 'Take away'));
      })),
      h('div.row.gap.wrap', { style: 'margin-top:12px' }, addIn, addBtn)));

    // ---------- classes ----------
    var classes = data.classes.slice().sort(function (a, b) {
      return (a.role === 'admin') - (b.role === 'admin') || label(a).localeCompare(label(b));
    });
    main.appendChild(h('div.card',
      h('h2', 'Classes'),
      h('p.small.muted', 'Each class belongs to one Google account. "Give to…" moves it to someone else, for example a new rebbi taking over a class.'),
      classes.length ? h('div.access-list', classes.map(function (c) {
        return h('div.access-row',
          h('div.grow',
            h('strong', label(c)),
            c.sample || c.sample_grade ? h('span.pill.muted', { style: 'margin-left:6px' }, 'Sample') : null,
            c.role === 'admin' ? h('span.pill', { style: 'margin-left:6px' }, 'Office') : null,
            h('div.small.muted', 'Belongs to ' + (nameOf(c.owner_email) ? nameOf(c.owner_email) + ' (' + c.owner_email + ')' : c.owner_email || 'nobody'))),
          h('button.btn.small', { type: 'button', onclick: function () { giveClass(c); } }, 'Give to…'));
      })) : h('p.muted', 'No classes in the cloud yet.')));

    // ---------- everyone ----------
    var owned = {}; data.classes.forEach(function (c) { owned[c.owner_email] = (owned[c.owner_email] || 0) + (c.role === 'admin' ? 0 : 1); });
    var people = data.accounts.slice().sort(function (a, b) { return String(b.last_seen).localeCompare(String(a.last_seen)); });
    main.appendChild(h('div.card',
      h('h2', 'Everyone who has signed in'),
      people.length ? h('div.access-list', people.map(function (a) {
        var n = owned[a.email] || 0;
        return h('div.access-row',
          h('div.grow', who(a.email),
            h('div.small.muted', (n ? n + (n === 1 ? ' class' : ' classes') : 'no class') + ' · last seen ' + ago(a.last_seen))),
          admins[a.email] ? h('span.pill', 'Office')
            : h('button.btn.small', { type: 'button', onclick: function () { giveOffice(a.email, a.name); } }, 'Give office access'));
      })) : h('p.muted', 'Nobody yet.')));
  }

  Views.register('admin-access', {
    title: 'Access', short: 'Access', icon: 'key', admin: true, adminOnly: true,
    when: function () { return !!(window.Sync && Sync.isOn() && Sync.isAdmin()); },
    // Fresh numbers when the page is opened (not on every redraw: reloading redraws the page).
    render: function (main) { if (data && Date.now() - loadedAt > 15000) reload(); render(main); }
  });
})();
