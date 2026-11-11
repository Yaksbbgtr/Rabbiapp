/* Profiles: each rebbi logs in to his own class on this device. */
(function () {
  'use strict';
  var h = UI.h;

  function initials(name) {
    var words = String(name || '').replace(/^(Rabbi|Rebbi|Rav|Reb|R'|Mr\.?|Morah)\s+/i, '').trim().split(/\s+/).filter(Boolean);
    var s = words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0] || 'R').slice(0, 2);
    return s.toUpperCase();
  }

  function enter(p) {
    function go(pin) {
      if (!Store.login(p.id, pin)) return false;
      UI.toast('Welcome, ' + p.name);
      var home = Store.isAdmin() ? 'admin' : 'dashboard';
      if (location.hash === '#/' + home) App.render(); else App.go(home);
      return true;
    }
    if (!Store.hasPin(p.id)) { go(); return; }
    var pin = UI.input({ type: 'password', inputmode: 'numeric', autocomplete: 'off', placeholder: 'PIN', 'aria-label': 'PIN' });
    var msg = h('p.overdue.small');
    var m = UI.modal('Enter PIN for ' + p.name, h('div', pin, msg), [
      { label: 'Cancel' },
      { label: 'Log in', primary: true, onClick: function () {
        if (go(pin.value)) return;
        msg.textContent = 'That PIN is not right. Try again.'; pin.value = ''; pin.focus();
        return false;
      } }
    ]);
    pin.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); if (go(pin.value)) m.close(); else { msg.textContent = 'That PIN is not right. Try again.'; pin.value = ''; } } });
  }

  function newProfile() {
    var name = UI.input({ placeholder: 'e.g. Rabbi Cohen', autocomplete: 'name' });
    var cls = UI.input({ placeholder: 'e.g. Kitah Daled' });
    var school = UI.input({ placeholder: 'Yeshiva name', value: 'Yeshiva K\'tana of Waterbury' });
    var pin = UI.input({ type: 'password', inputmode: 'numeric', autocomplete: 'off', placeholder: 'Leave empty for no PIN' });
    var adminBox = h('input', { type: 'checkbox' });
    var classField = UI.field('Class', cls);
    adminBox.addEventListener('change', function () { classField.style.display = adminBox.checked ? 'none' : ''; });
    UI.modal('New profile', h('div',
      UI.field('Your name (as it appears on letters)', name),
      classField,
      UI.field('Yeshiva', school),
      h('label.check-row', adminBox, ' Administrator – sees the grades and attendance of every class on this device, no class of their own'),
      UI.field('PIN (optional)', pin, 'A PIN keeps other people using this device out of your class.')), [
      { label: 'Cancel' },
      { label: 'Create profile', primary: true, onClick: function () {
        if (!name.value.trim()) { UI.toast('Please enter your name'); name.focus(); return false; }
        try {
          var id = Store.createProfile({ name: name.value, className: cls.value, school: school.value.trim(), pin: pin.value.trim(), admin: adminBox.checked });
          Store.login(id, pin.value.trim());
        } catch (e) { alert(e.message); return false; }
        UI.toast('Profile created');
        App.go(adminBox.checked ? 'admin' : 'talmidim');
      } }
    ]);
  }

  Views.register('login', {
    title: 'Log in', hidden: true,
    render: function (main) {
      var profiles = Store.profiles();
      var allSamples = window.DemoData.grades.every(function (g) { return profiles.some(function (p) { return p.sampleGrade === g.grade; }); });
      main.appendChild(h('div.login',
        h('div.login-hero',
          h('img', { src: 'icons/logo-white.png', alt: 'Yeshiva K\'tana of Waterbury', width: 906, height: 454 }),
          h('div.login-app', 'Rebbi App')),
        h('h1', profiles.length ? 'Who is using the app?' : 'Welcome, Rebbi!'),
        profiles.length ? null : h('p.muted', 'Everything for your kitah in one place: talmidim, attendance, limud tracking, bechinos, lesson plans, parent contact and report cards. Create your profile to begin. Your class stays private on this device.'),
        profiles.length ? h('div.profile-list', profiles.map(function (p) {
          return h('button.profile-row', { type: 'button', onclick: function () { enter(p); } },
            h('div.avatar', initials(p.name)),
            h('div.grow', h('div.name', p.name), h('div.small.muted', p.role === 'admin' ? 'Administrator – all classes' : p.className || 'No class name yet')),
            p.role === 'admin' ? h('span.pill', 'Admin') : null,
            p.sampleGrade || p.sample ? h('span.pill.muted', 'Sample') : null,
            Store.hasPin(p.id) ? h('span.small.muted', { title: 'PIN needed' }, '🔒') : null,
            UI.icon('chev', 18));
        })) : null,
        h('div.login-actions',
          h('button.btn.primary.big', { type: 'button', onclick: newProfile }, UI.icon('plus'), 'New profile'),
          allSamples ? null : h('button.btn.big', { type: 'button', onclick: function () {
            try { var n = Store.createSampleProfiles(); UI.toast(n + ' sample profiles added'); }
            catch (e) { alert(e.message); }
            App.render();
          } }, 'Add sample profiles for grades 1–8')),
        h('p.small.muted', 'Profiles are saved on this device only. Each one has its own class, and a backup can be downloaded from its Settings page.')));
    }
  });

  // Old link from before profiles existed
  Views.register('welcome', { title: 'Welcome', hidden: true, render: function () { App.go(Store.currentProfile() ? 'dashboard' : 'login'); } });

  function logout() {
    Store.logout();
    if (location.hash === '#/login') App.render(); else App.go('login');
  }

  function profileMenu() {
    var p = Store.currentProfile();
    if (!p) return;
    var n = Store.activeTalmidim().length;
    UI.modal('Profile', h('div',
      h('div.row.gap', h('div.avatar.lg', initials(p.name)),
        h('div', h('div.big', h('strong', p.name)), h('div.muted', (p.className || 'No class name yet') + ' · ' + n + ' talmidim'),
          p.sampleGrade ? h('span.pill.muted', 'Sample profile') : null)),
      h('div.profile-actions',
        h('button.btn', { type: 'button', onclick: function () { document.querySelector('.modal-overlay').remove(); logout(); } }, UI.icon('users'), 'Switch profile'),
        h('button.btn', { type: 'button', onclick: function () { document.querySelector('.modal-overlay').remove(); App.go('settings'); } }, UI.icon('gear'), 'Profile settings'),
        h('button.btn.danger', { type: 'button', onclick: function () { document.querySelector('.modal-overlay').remove(); logout(); UI.toast('Logged out'); } }, 'Log out'))),
      [{ label: 'Close' }]);
  }

  // Settings card for the logged-in profile
  function settingsCard() {
    var p = Store.currentProfile();
    if (!p) return null;
    var has = Store.hasPin(p.id);
    return h('div.card',
      h('h2', 'Profile'),
      h('p', 'Logged in as ', h('strong', p.name), p.role === 'admin' ? ' (administrator)' : p.className ? ' · ' + p.className : '', p.role === 'admin' ? '.' : '. Change the name and class above.'),
      p.role === 'admin' ? null : h('label.check-row', h('input', { type: 'checkbox', checked: Store.get().settings.coloringPages !== false, onchange: function (e) {
        Store.update(function (s) { s.settings.coloringPages = e.target.checked; });
        UI.toast(e.target.checked ? 'Coloring pages on' : 'Coloring pages off');
      } }), ' Offer coloring pages under "Create project" (for younger classes)'),
      h('div.row.gap.wrap',
        h('button.btn', { onclick: function () {
          var pin = UI.input({ type: 'password', inputmode: 'numeric', autocomplete: 'off', placeholder: has ? 'New PIN (empty to remove)' : 'Choose a PIN' });
          UI.modal(has ? 'Change PIN' : 'Set a PIN', h('div', pin,
            h('p.small.muted', 'A PIN keeps other people using this device out of your class. It is a simple lock, not strong security, and it cannot be recovered if forgotten, so keep a backup.')), [
            { label: 'Cancel' },
            { label: 'Save', primary: true, onClick: function () { Store.setPin(p.id, pin.value.trim()); UI.toast(pin.value.trim() ? 'PIN saved' : 'PIN removed'); App.render(); } }
          ]);
        } }, has ? 'Change or remove PIN' : 'Set a PIN'),
        h('button.btn', { onclick: logout }, 'Log out'),
        h('button.btn.danger', { onclick: function () {
          UI.confirm('Delete the profile "' + p.name + '" and its whole class from this device? This cannot be undone.', function () {
            Store.deleteProfile(p.id); App.go('login');
          }, 'Delete profile');
        } }, 'Delete this profile')));
  }

  window.Profiles = { initials: initials, menu: profileMenu, logout: logout, settingsCard: settingsCard };
})();
