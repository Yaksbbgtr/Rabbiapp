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

      var dateInput = UI.input({ type: 'date', value: selected, onchange: function (e) { selected = e.target.value || Store.todayISO(); App.render(); } });
      main.appendChild(h('div.card.row.between.wrap',
        h('div.row.gap',
          h('button.icon-btn', { 'aria-label': 'Previous day', onclick: function () { selected = UI.addDays(selected, -1); App.render(); } }, UI.icon('chevl')),
          dateInput,
          h('button.icon-btn', { 'aria-label': 'Next day', onclick: function () { selected = UI.addDays(selected, 1); App.render(); } }, UI.icon('chev')),
          h('span.he.muted', UI.hebDate(selected))),
        h('div.row.gap',
          h('button.btn', {
            onclick: function () {
              Store.update(function (s) {
                var day = s.attendance[selected] = s.attendance[selected] || {};
                talmidim.forEach(function (t) { if (!day[t.id]) day[t.id] = 'P'; });
              });
              App.render();
            }
          }, 'Mark rest here'),
          h('button.btn', {
            onclick: function () {
              Store.update(function (s) { delete s.attendance[selected]; });
              App.render();
            }
          }, 'Clear day'))));

      var day = st.attendance[selected] || {};
      var list = h('div.card.att-list');
      talmidim.forEach(function (t) {
        var cur = day[t.id];
        list.appendChild(h('div.att-row',
          h('div.att-name', h('span', Store.displayName(t)), t.hebName && !st.settings.hebrewFirst ? h('span.he.muted.small', t.hebName) : null),
          h('div.att-btns', { role: 'group', 'aria-label': 'Attendance for ' + Store.displayName(t) },
            STATUSES.map(function (s) {
              return h('button.att.' + s[0] + (cur === s[0] ? '.on' : ''), {
                'aria-pressed': cur === s[0] ? 'true' : 'false',
                onclick: function () {
                  Store.update(function (st2) {
                    var d = st2.attendance[selected] = st2.attendance[selected] || {};
                    if (d[t.id] === s[0]) delete d[t.id]; else d[t.id] = s[0];
                    if (!Object.keys(d).length) delete st2.attendance[selected];
                  });
                  App.render();
                }
              }, s[1]);
            }))));
      });
      main.appendChild(list);
      var marked = Object.keys(day).length;
      main.appendChild(h('p.muted.small', marked + ' of ' + talmidim.length + ' marked'));
    }
  });

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
