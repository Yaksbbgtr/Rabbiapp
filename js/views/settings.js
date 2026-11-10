(function () {
  'use strict';
  var h = UI.h;
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Shabbos'];

  Views.register('settings', {
    title: 'Settings', icon: 'gear',
    render: function (main) {
      var st = Store.get();
      var s = st.settings;
      main.appendChild(h('div.page-head', h('h1', 'Settings')));

      function bind(key, el, prop) {
        el.addEventListener('change', function () {
          Store.update(function (x) { x.settings[key] = prop === 'checked' ? el.checked : el.value.trim(); });
          UI.toast('Saved');
          App.render();
        });
        return el;
      }

      main.appendChild(h('div.card',
        h('h2', 'Class'),
        h('div.form-grid',
          UI.field('Your name', bind('rebbiName', UI.input({ value: s.rebbiName }))),
          UI.field('Class name', bind('className', UI.input({ value: s.className }))),
          UI.field('Yeshiva', bind('school', UI.input({ value: s.school }))),
          UI.field('What to call points', bind('pointsName', UI.input({ value: s.pointsName })), 'e.g. Points, Stars, Kochavim, Tickets')),
        h('label.check-row', bind('hebrewFirst', h('input', { type: 'checkbox', checked: s.hebrewFirst }), 'checked'), ' Show Hebrew names throughout the app'),
        h('div.field', h('span.field-label', 'School days (for monthly attendance)'),
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
          })))));

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
      main.appendChild(h('div.card',
        h('h2', 'Backup & devices'),
        h('p', 'Your data is saved only in this browser on this device. Download a backup regularly, and use it to move your class to another device or browser.'),
        h('p.small.muted', last ? 'Last backup: ' + new Date(+last).toLocaleString() : 'No backup downloaded yet.'),
        h('div.row.gap.wrap',
          h('button.btn.primary', { onclick: function () {
            UI.download('rebbi-app-backup-' + Store.todayISO() + '.json', Store.exportJSON());
            try { localStorage.setItem('rabbiapp.lastBackup', String(Date.now())); } catch (e) { /* ignore */ }
          } }, 'Download backup'),
          h('button.btn', { onclick: function () { file.click(); } }, 'Restore from backup'),
          file)));

      main.appendChild(h('div.card',
        h('h2', 'New year / start over'),
        h('div.row.gap.wrap',
          h('button.btn', { onclick: function () {
            UI.confirm('Start a new school year? Talmidim, attendance, points, grades, plans and logs are cleared. Your settings, prizes, reasons, jobs and templates are kept. Download a backup first!', function () {
              Store.update(function (x) {
                x.talmidim = []; x.attendance = {}; x.units = []; x.mastery = {}; x.points = []; x.tests = []; x.scores = {};
                x.lessons = []; x.contacts = []; x.comments = {}; x.notes = [];
                x.jobs.forEach(function (j) { j.holder = null; });
              });
              App.go('talmidim');
            }, 'Start new year');
          } }, 'Start a new school year'),
          h('button.btn', { onclick: function () {
            UI.confirm('Replace everything with a sample class?', function () { Store.loadDemo(); App.go('dashboard'); }, 'Load sample');
          } }, 'Load sample class'),
          h('button.btn.danger', { onclick: function () {
            UI.confirm('Erase ALL data on this device? This cannot be undone.', function () { Store.reset(); location.hash = '#/welcome'; }, 'Erase everything');
          } }, 'Erase everything'))));

      main.appendChild(h('div.card',
        h('h2', 'About'),
        h('p.small.muted', 'Rebbi App works offline. Install it to your home screen from your browser\'s menu ("Add to Home Screen" / "Install app"). Yomim tovim and the parsha schedule follow chutz la\'aretz.')));
    }
  });
})();
