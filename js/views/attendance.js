(function () {
  'use strict';
  var h = UI.h;
  var STATUSES = [['P', 'Here'], ['L', 'Late'], ['A', 'Absent'], ['E', 'Excused']];
  var selected = null;
  var mode = 'day';

  Views.register('attendance', {
    title: 'Attendance', icon: 'check',
    render: function (main) {
      selected = selected || Store.todayISO();
      var st = Store.get();
      var talmidim = Store.activeTalmidim();

      main.appendChild(h('div.page-head',
        h('div', h('h1', 'Attendance')),
        h('div.seg', [['day', 'Daily'], ['month', 'Monthly']].map(function (m) {
          return h('button' + (mode === m[0] ? '.on' : ''), { onclick: function () { mode = m[0]; App.render(); } }, m[1]);
        }))));

      if (!talmidim.length) { main.appendChild(UI.empty('Add talmidim first.', h('a.btn.primary', { href: '#/talmidim' }, 'Add talmidim'))); return; }

      if (mode === 'month') return renderMonth(main, talmidim);

      // Everyone starts as "Here". Changes stay a draft until Save attendance is pressed.
      var saved = st.attendance[selected] || null;
      var draftKey = (Store.currentProfile() || {}).id + '|' + selected; // unsaved marks belong to one profile and day
      var draft = drafts[draftKey];
      if (!draft) {
        draft = drafts[draftKey] = {};
        talmidim.forEach(function (t) { draft[t.id] = (saved && saved[t.id]) || 'P'; });
      }
      talmidim.forEach(function (t) { if (!draft[t.id]) draft[t.id] = 'P'; });
      var dirty = !saved || talmidim.some(function (t) { return saved[t.id] !== draft[t.id]; });

      var dateInput = UI.input({ type: 'date', value: selected, 'aria-label': 'Date', onchange: function (e) { selected = e.target.value || Store.todayISO(); App.render(); } });
      main.appendChild(h('div.card.row.between.wrap',
        h('div.row.gap',
          h('button.icon-btn', { 'aria-label': 'Previous day', onclick: function () { selected = UI.addDays(selected, -1); App.render(); } }, UI.icon('chevl')),
          dateInput,
          h('button.icon-btn', { 'aria-label': 'Next day', onclick: function () { selected = UI.addDays(selected, 1); App.render(); } }, UI.icon('chev')),
          h('span.he.muted', UI.hebDate(selected))),
        saved ? h('button.btn', {
          onclick: function () {
            UI.confirm('Erase the saved attendance for ' + UI.fmtDate(selected) + '?', function () {
              Store.update(function (s) { delete s.attendance[selected]; });
              delete drafts[draftKey];
              App.render();
            }, 'Erase');
          }
        }, 'Erase this day') : null));

      main.appendChild(h('p.muted.small', 'Everyone starts as Here. Tap Late, Absent or Excused for the boys who aren\'t, then press Save attendance.'));

      var list = h('div.card.att-list');
      talmidim.forEach(function (t) {
        var cur = draft[t.id];
        list.appendChild(h('div.att-row',
          h('div.att-name', h('span', Store.displayName(t)), t.hebName && !st.settings.hebrewFirst ? h('span.he.muted.small', t.hebName) : null),
          h('div.att-btns', { role: 'group', 'aria-label': 'Attendance for ' + Store.displayName(t) },
            STATUSES.map(function (s) {
              return h('button.att.' + s[0] + (cur === s[0] ? '.on' : ''), {
                'aria-pressed': cur === s[0] ? 'true' : 'false',
                onclick: function () { draft[t.id] = s[0]; App.render(); }
              }, s[1]);
            }))));
      });
      main.appendChild(list);

      var c = { P: 0, L: 0, A: 0, E: 0 };
      talmidim.forEach(function (t) { c[draft[t.id]]++; });
      var summary = c.P + ' here' + (c.L ? ' · ' + c.L + ' late' : '') + (c.A ? ' · ' + c.A + ' absent' : '') + (c.E ? ' · ' + c.E + ' excused' : '');
      main.appendChild(h('div.save-bar',
        h('div',
          h('div.save-status' + (dirty ? '.unsaved' : ''), !saved ? 'Not saved yet' : dirty ? 'Changes not saved' : 'Saved ✓'),
          h('div.small.muted', summary)),
        h('button.btn.primary.big', {
          disabled: !dirty,
          onclick: function () {
            Store.update(function (s) {
              var day = {};
              talmidim.forEach(function (t) { day[t.id] = draft[t.id]; });
              // keep records of archived talmidim for this day
              Object.keys(s.attendance[selected] || {}).forEach(function (id) { if (!day[id]) day[id] = s.attendance[selected][id]; });
              s.attendance[selected] = day;
              if (s.attendanceBy) delete s.attendanceBy[selected]; // taken by the rebbi himself now
            });
            delete drafts[draftKey];
            UI.toast('Attendance saved: ' + summary);
            App.render();
          }
        }, UI.icon('check'), dirty ? 'Save attendance' : 'Saved')));
    }
  });

  var drafts = {};
  var monthOffset = 0;
  function renderMonth(main, talmidim) {
    var st = Store.get();
    var now = new Date();
    var first = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    var daysIn = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    var dates = [];
    for (var d = 1; d <= daysIn; d++) {
      var iso = first.getFullYear() + '-' + String(first.getMonth() + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      if (st.attendance[iso] || st.settings.attendanceDays.indexOf(new Date(first.getFullYear(), first.getMonth(), d).getDay()) >= 0) dates.push(iso);
    }
    main.appendChild(h('div.card.row.between',
      h('button.icon-btn', { 'aria-label': 'Previous month', onclick: function () { monthOffset--; App.render(); } }, UI.icon('chevl')),
      h('h2', first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })),
      h('button.icon-btn', { 'aria-label': 'Next month', onclick: function () { monthOffset++; App.render(); } }, UI.icon('chev'))));
    var table = h('table.grid-table.att-month',
      h('thead', h('tr', h('th', 'Talmid'), dates.map(function (iso) {
        return h('th', { title: UI.hebDate(iso) }, String(+iso.slice(8)));
      }), h('th', 'Abs'), h('th', 'Late'))),
      h('tbody', talmidim.map(function (t) {
        var abs = 0, late = 0;
        return h('tr', h('th', Store.displayName(t)), dates.map(function (iso) {
          var v = (st.attendance[iso] || {})[t.id] || '';
          if (v === 'A' || v === 'E') abs++;
          if (v === 'L') late++;
          return h('td.att-cell.' + (v || 'none'), v === 'P' ? '✓' : v);
        }), h('td', String(abs)), h('td', String(late)));
      })));
    main.appendChild(h('div.card.scroll-x', table));
    main.appendChild(h('div.row.gap',
      h('button.btn', { onclick: function () { exportCSV(talmidim, dates); } }, 'Export CSV'),
      h('button.btn', { onclick: function () { window.print(); } }, UI.icon('print'), 'Print')));
  }

  function exportCSV(talmidim, dates) {
    var st = Store.get();
    var rows = [['Talmid'].concat(dates)];
    talmidim.forEach(function (t) {
      rows.push([Store.displayName(t)].concat(dates.map(function (iso) { return (st.attendance[iso] || {})[t.id] || ''; })));
    });
    var csv = rows.map(function (r) { return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
    UI.download('attendance-' + dates[0].slice(0, 7) + '.csv', '﻿' + csv, 'text/csv');
  }
})();
