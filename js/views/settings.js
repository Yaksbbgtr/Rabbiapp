(function () {
  'use strict';
  var h = UI.h;
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Shabbos'];

  // Which version this device is running, to compare phone and computer, and a button to load the newest.
  function versionCard() {
    return h('div.card',
      h('h2', 'App version'),
      h('p', 'Version ', h('strong', App.version), App.built ? ' · published ' + App.built : ''),
      h('p.small.muted', 'Every device should show the same version. The app updates itself when it opens; if a device shows an older one, tap the button.'),
      h('button.btn', { type: 'button', onclick: function () { UI.toast('Getting the newest version…'); App.forceUpdate(); } }, 'Get the newest version'));
  }

  // One group of settings: a heading, then its cards. Groups are listed in a jump bar at the top.
  function section(main, nav, id, title, cards) {
    cards = cards.filter(Boolean);
    if (!cards.length) return;
    var el = h('section.settings-group', { id: 'set-' + id }, h('h2.settings-group-title', title), cards);
    main.appendChild(el);
    nav.appendChild(h('button.chip', { type: 'button', onclick: function () { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, title));
  }
  function appearanceCard() {
    var seg = h('div.seg');
    UI.themeButtons(seg, function () { App.render(); });
    return h('div.card',
      h('h2', 'Light or dark'),
      seg,
      h('p.small.muted', 'Light or Dark stays that way on this device. Auto follows the phone\'s own light/dark setting.'));
  }

  Views.register('settings', {
    title: 'Settings', icon: 'gear', admin: true,
    render: function (main) {
      var st = Store.get();
      var s = st.settings;
      main.appendChild(h('div.page-head', h('h1', 'Settings')));
      var nav = h('div.chips.settings-nav');
      main.appendChild(nav);
      var add = function (id, title, cards) { section(main, nav, id, title, cards); };

      if (Store.isAdmin()) {
        add('office', 'Office', [h('div.card', h('h2', 'Who this profile is'),
          UI.field('This profile is for', bind('staffRole', UI.select([['office', 'Main office – every class'], ['principal', 'Principal – every class'], ['maintenance', 'Maintenance – issues sent to maintenance']], Store.staffRole())),
            'Rebbeim choose who a report goes to: the main office, the principal or maintenance.'),
          UI.field('Your name', bind('rebbiName', UI.input({ value: s.rebbiName }))),
          UI.field('Your cell', bind('rebbiPhone', UI.input({ type: 'tel', value: s.rebbiPhone || '' }))))]);
        add('account', 'Account', [Sync.accountCard(), Profiles.settingsCard()]);
        add('look', 'Appearance', [appearanceCard()]);
        add('devices', 'Sync & updates', [Sync.card(), versionCard()]);
        return;
      }

      function bind(key, el, prop) {
        el.addEventListener('change', function () {
          Store.update(function (x) { x.settings[key] = prop === 'checked' ? el.checked : el.value.trim(); });
          UI.toast('Saved');
          App.render();
        });
        return el;
      }

      var classCard = h('div.card',
        h('h2', 'Class details'),
        h('div.form-grid',
          UI.field('Your name', bind('rebbiName', UI.input({ value: s.rebbiName }))),
          UI.field('Your cell', bind('rebbiPhone', UI.input({ type: 'tel', value: s.rebbiPhone || '' })), 'Shown to the office on issues you report'),
          UI.field('Class name', bind('className', UI.input({ value: s.className }))),
          UI.field('Yeshiva', bind('school', UI.input({ value: s.school }))),
          UI.field('Remind me to be in touch with a family after', bind('contactReminderDays',
            UI.select([[7, '1 week'], [14, '2 weeks'], [21, '3 weeks'], [30, '1 month'], [45, '6 weeks'], [60, '2 months'], [90, '3 months']], s.contactReminderDays || 30)),
            'Families you haven\'t called or texted in this long show up on the Parents page'),
          UI.field('School office email', bind('officeEmail', UI.input({ type: 'email', value: s.officeEmail || '', placeholder: 'office@yeshiva.org' })), 'Where report cards are sent')));

      var optionsCard = h('div.card',
        h('h2', 'Options'),
        h('label.check-row', bind('hebrewFirst', h('input', { type: 'checkbox', checked: s.hebrewFirst }), 'checked'), ' Show Hebrew names throughout the app'),
        h('label.check-row', h('input', { type: 'checkbox', checked: s.coloringPages !== false, onchange: function (e) {
          Store.update(function (x) { x.settings.coloringPages = e.target.checked; });
          UI.toast(e.target.checked ? 'Coloring pages on' : 'Coloring pages off');
        } }), ' Offer coloring pages under "Create project" (for younger classes)'),
        h('div.field', { style: 'margin-top:14px' }, h('span.field-label', 'School days (for monthly attendance)'),
          h('div.chips', DAYS.map(function (d, i) {
            var on = s.attendanceDays.indexOf(i) >= 0;
            return h('button.chip' + (on ? '.on' : ''), { onclick: function () {
              Store.update(function (x) {
                var a = x.settings.attendanceDays;
                if (on) a.splice(a.indexOf(i), 1); else a.push(i);
                a.sort();
              });
              App.render();
            } }, d);
          }))));

      add('class', 'Your class', [classCard, optionsCard]);
      add('account', 'Account', [Sync.accountCard(), Profiles.settingsCard()]);
      add('calendar', 'Calendar', [Calendar.settingsCard()]);
      add('look', 'Appearance', [appearanceCard()]);

      var file = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
      file.addEventListener('change', function () {
        var f = file.files[0];
        if (!f) return;
        var r = new FileReader();
        r.onload = function () {
          UI.confirm('Replace ALL current data with this backup?', function () {
            try { Store.importJSON(r.result); UI.toast('Backup restored'); App.go('dashboard'); }
            catch (e) { alert(e.message); }
          }, 'Restore');
        };
        r.readAsText(f);
      });
      var last = localStorage.getItem('rabbiapp.lastBackup');
      var backupCard = h('div.card',
        h('h2', 'Backup'),
        h('p', Store.currentProfile() && Store.currentProfile().cloud
          ? 'This class syncs to your other devices. A downloaded backup is still a good extra copy.'
          : 'This profile\'s data is saved only in this browser on this device. Download a backup regularly, and use it to move your class to another device or browser.'),
        h('p.small.muted', last ? 'Last backup: ' + new Date(+last).toLocaleString() : 'No backup downloaded yet.'),
        h('div.row.gap.wrap',
          h('button.btn.primary', { onclick: function () {
            UI.download('rebbi-app-backup-' + Store.todayISO() + '.json', Store.exportJSON());
            try { localStorage.setItem('rabbiapp.lastBackup', String(Date.now())); } catch (e) { /* ignore */ }
          } }, 'Download backup'),
          h('button.btn', { onclick: function () { file.click(); } }, 'Restore from backup'),
          file));
      add('devices', 'Sync, backup & updates', [Sync.card(), backupCard, versionCard()]);

      add('reset', 'Start over', [h('div.card',
        h('h2', 'New year / start over'),
        h('div.row.gap.wrap',
          h('button.btn', { onclick: function () {
            UI.confirm('Start a new school year? Talmidim, attendance, grades, plans and logs are cleared. Your settings, jobs and templates are kept. Download a backup first!', function () {
              Store.update(function (x) {
                x.talmidim = []; x.attendance = {}; x.units = []; x.mastery = {}; x.limudComments = {}; x.tests = []; x.scores = {};
                x.lessons = []; x.contacts = []; x.comments = {}; x.notes = [];
                x.jobs.forEach(function (j) { j.holder = null; });
              });
              App.go('talmidim');
            }, 'Start new year');
          } }, 'Start a new school year'),
          h('button.btn.danger', { onclick: function () {
            UI.confirm('Erase this profile\'s whole class (talmidim, attendance, grades, plans and logs)? This cannot be undone.', function () { Store.reset(); App.go('talmidim'); }, 'Erase everything');
          } }, 'Erase this class')))]);

      main.appendChild(h('div.card',
        h('h2', 'About'),
        h('p.small.muted', 'Rebbi App works offline. Install it to your home screen from your browser\'s menu ("Add to Home Screen" / "Install app"). Yomim tovim and the parsha schedule follow chutz la\'aretz.')));
    }
  });
})();
