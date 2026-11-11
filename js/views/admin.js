/* Administrator: every class on this device, each talmid's attendance and grades, spreadsheet export. */
(function () {
  'use strict';
  var h = UI.h;
  var range = { from: '', to: '' };
  var openClass = null;

  // ----- numbers for one class (its own saved data, not the logged-in profile's) -----
  function attendanceOf(data, talmidId) {
    var r = { days: 0, present: 0, absent: 0, late: 0, excused: 0 };
    Object.keys(data.attendance || {}).forEach(function (date) {
      if (range.from && date < range.from) return;
      if (range.to && date > range.to) return;
      var v = data.attendance[date][talmidId];
      if (!v) return;
      r.days++;
      if (v === 'P') r.present++;
      if (v === 'L') { r.late++; r.present++; }
      if (v === 'A') r.absent++;
      if (v === 'E') { r.excused++; r.absent++; }
    });
    r.pct = r.days ? Math.round(100 * r.present / r.days) : null;
    return r;
  }
  function testsOf(data) {
    return (data.tests || []).filter(function (x) { return (!range.from || x.date >= range.from) && (!range.to || x.date <= range.to); })
      .sort(function (a, b) { return a.date.localeCompare(b.date); });
  }
  function scoreOf(data, test, talmidId) {
    var v = (data.scores[test.id] || {})[talmidId];
    return v === undefined || v === '' || v === null ? null : Number(v);
  }
  function averageOf(data, tests, talmidId) {
    var sum = 0, n = 0;
    tests.forEach(function (x) { var v = scoreOf(data, x, talmidId); if (v !== null) { sum += 100 * v / (x.max || 100); n++; } });
    return n ? Math.round(sum / n) : null;
  }
  function classRows(p) {
    var data = Store.peek(p.id);
    var talmidim = (data.talmidim || []).filter(function (t) { return !t.archived; })
      .sort(function (a, b) { return (a.last || '').localeCompare(b.last || '') || (a.first || '').localeCompare(b.first || ''); });
    var tests = testsOf(data);
    return { profile: p, data: data, talmidim: talmidim, tests: tests, rows: talmidim.map(function (t) {
      return { t: t, att: attendanceOf(data, t.id), scores: tests.map(function (x) { return scoreOf(data, x, t.id); }), avg: averageOf(data, tests, t.id) };
    }) };
  }
  function classes() {
    return Store.profiles().filter(function (p) { return p.role !== 'admin'; }).map(classRows);
  }

  // ----- spreadsheet (CSV opens in Excel, Numbers and Google Sheets) -----
  function csvCell(v) {
    var s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function csv(rows) { return '﻿' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n'); }
  function pct(v) { return v === null ? '' : v + '%'; }

  // One sheet per class: a column per bechina, plus attendance.
  function classSheet(c) {
    var head = ['Class', 'Rebbi', 'Last name', 'First name', 'Hebrew name', 'Allergies', 'Attendance %', 'Days recorded', 'Absent', 'Late', 'Excused']
      .concat(c.tests.map(function (x) { return x.title + ' (' + UI.fmtDate(x.date, { weekday: undefined }) + ', out of ' + x.max + ')'; }))
      .concat(['Bechina average %']);
    var rows = c.rows.map(function (r) {
      return [c.profile.className, c.profile.name, r.t.last || '', r.t.first || '', r.t.hebName || '', r.t.allergies || '', pct(r.att.pct), r.att.days, r.att.absent, r.att.late, r.att.excused]
        .concat(r.scores.map(function (v) { return v === null ? '' : v; })).concat([pct(r.avg)]);
    });
    return [head].concat(rows);
  }
  // Every class in one sheet: one row per talmid, bechinos listed in one cell so the columns line up.
  function schoolSheet(list) {
    var head = ['Class', 'Rebbi', 'Last name', 'First name', 'Hebrew name', 'Allergies', 'Attendance %', 'Days recorded', 'Absent', 'Late', 'Excused', 'Bechinos taken', 'Bechina average %', 'Bechina marks'];
    var rows = [];
    list.forEach(function (c) {
      c.rows.forEach(function (r) {
        var marks = c.tests.map(function (x, i) { return r.scores[i] === null ? null : x.title + ': ' + r.scores[i] + '/' + x.max; }).filter(Boolean);
        rows.push([c.profile.className, c.profile.name, r.t.last || '', r.t.first || '', r.t.hebName || '', r.t.allergies || '', pct(r.att.pct), r.att.days, r.att.absent, r.att.late, r.att.excused,
          marks.length, pct(r.avg), marks.join('; ')]);
      });
    });
    return [head].concat(rows);
  }
  // Master list of parents' phone numbers, every class.
  function phoneSheet(list) {
    var head = ['Class', 'Rebbi', 'Last name', 'First name', 'Father', 'Father\'s cell', 'Mother', 'Mother\'s cell', 'Email', 'Address', 'Allergies'];
    var rows = [];
    list.forEach(function (c) {
      c.talmidim.forEach(function (t) {
        rows.push([c.profile.className, c.profile.name, t.last || '', t.first || '', t.father || '', t.fatherPhone || '', t.mother || '', t.motherPhone || '', t.email || '', t.address || '', t.allergies || '']);
      });
    });
    return [head].concat(rows);
  }
  function fileSafe(s) { return String(s || '').replace(/[\\/:*?"<>|]+/g, '').trim() || 'class'; }
  function rangeLabel() { return range.from || range.to ? ' ' + (range.from || 'start') + ' to ' + (range.to || Store.todayISO()) : ''; }

  // ----- import a rebbi's backup file as a class -----
  function importBackup(file) {
    var r = new FileReader();
    r.onload = function () {
      var data;
      try { data = JSON.parse(r.result); } catch (e) { alert('That file is not a Rebbi App backup.'); return; }
      if (!data || !Array.isArray(data.talmidim)) { alert('That file is not a Rebbi App backup.'); return; }
      var name = (data.settings && data.settings.rebbiName) || 'Rebbi', cls = (data.settings && data.settings.className) || '';
      var existing = Store.profiles().filter(function (p) { return p.role !== 'admin' && p.name === name && p.className === cls; })[0];
      var finish = function (msg) { UI.toast(msg); App.render(); };
      try {
        if (existing) {
          UI.confirm('A class for ' + name + (cls ? ' (' + cls + ')' : '') + ' is already on this device. Replace it with this newer file?', function () {
            Store.replaceProfileData(existing.id, data); finish('Updated ' + name + '\'s class');
          }, 'Replace');
        } else {
          Store.createProfile({ data: data, name: name, className: cls });
          finish('Added ' + name + '\'s class');
        }
      } catch (e) { alert(e.message); }
    };
    r.readAsText(file);
  }

  Views.register('admin', {
    title: 'All classes', short: 'Classes', icon: 'users', admin: true, adminOnly: true,
    render: function (main) {
      var list = classes();
      var file = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
      file.addEventListener('change', function () { if (file.files[0]) importBackup(file.files[0]); file.value = ''; });
      var from = UI.input({ type: 'date', value: range.from, 'aria-label': 'From', onchange: function (e) { range.from = e.target.value; App.render(); } });
      var to = UI.input({ type: 'date', value: range.to, 'aria-label': 'To', onchange: function (e) { range.to = e.target.value; App.render(); } });

      main.appendChild(h('div.page-head',
        h('div', h('h1', 'All classes'), h('p.muted', 'Attendance and bechina marks for every talmid in every class on this device.')),
        h('div.row.gap.wrap',
          list.length ? h('button.btn.primary', { type: 'button', onclick: function () {
            UI.download('All classes' + rangeLabel() + '.csv', csv(schoolSheet(list)), 'text/csv');
            UI.toast('Spreadsheet downloaded');
          } }, UI.icon('file'), 'Export all (spreadsheet)') : null,
          h('button.btn', { type: 'button', onclick: function () { file.click(); } }, UI.icon('plus'), 'Add a rebbi\'s backup file'),
          file)));

      main.appendChild(h('div.card.row.gap.wrap',
        h('span.small.muted', 'Period:'), UI.field('From', from), UI.field('To', to),
        h('button.btn.small', { type: 'button', onclick: function () { range = { from: '', to: '' }; App.render(); } }, 'Whole year')));

      if (!list.length) {
        main.appendChild(UI.empty('No classes on this device yet. Each rebbi can send you his backup file (his Settings → Download backup); add it here with the button above. Rebbeim who use this same device appear automatically.'));
        return;
      }

      // School summary
      var all = [].concat.apply([], list.map(function (c) { return c.rows; }));
      var withAtt = all.filter(function (r) { return r.att.pct !== null; });
      var withAvg = all.filter(function (r) { return r.avg !== null; });
      main.appendChild(h('div.card', h('div.stats',
        stat(list.length, 'classes'), stat(all.length, 'talmidim'),
        stat(withAtt.length ? Math.round(withAtt.reduce(function (s, r) { return s + r.att.pct; }, 0) / withAtt.length) + '%' : '–', 'attendance'),
        stat(withAvg.length ? Math.round(withAvg.reduce(function (s, r) { return s + r.avg; }, 0) / withAvg.length) + '%' : '–', 'bechina avg'))));

      list.forEach(function (c) {
        var p = c.profile;
        var isOpen = openClass === p.id;
        var attPct = c.rows.filter(function (r) { return r.att.pct !== null; });
        var card = h('div.card.admin-class');
        card.appendChild(h('button.admin-class-head', { type: 'button', 'aria-expanded': isOpen ? 'true' : 'false', onclick: function () { openClass = isOpen ? null : p.id; App.render(); } },
          h('div.grow', h('div.name', p.className || '(no class name)'), h('div.small.muted', p.name + ' · ' + c.talmidim.length + ' talmidim · ' + c.tests.length + ' bechinos' +
            (attPct.length ? ' · attendance ' + Math.round(attPct.reduce(function (s, r) { return s + r.att.pct; }, 0) / attPct.length) + '%' : ''))),
          UI.icon(isOpen ? 'chevl' : 'chev', 18)));
        if (isOpen) {
          card.appendChild(h('div.row.gap.wrap', { style: 'margin:8px 0 10px' },
            h('button.btn.small.primary', { type: 'button', onclick: function () {
              UI.download(fileSafe(p.className || p.name) + rangeLabel() + '.csv', csv(classSheet(c)), 'text/csv'); UI.toast('Spreadsheet downloaded');
            } }, UI.icon('file', 16), 'Export this class'),
            h('button.btn.small', { type: 'button', onclick: function () { window.print(); } }, UI.icon('print', 16), 'Print')));
          if (!c.talmidim.length) card.appendChild(h('p.muted', 'No talmidim in this class.'));
          else card.appendChild(h('div.scroll-x', h('table.grid-table.admin-table',
            h('thead', h('tr', h('th', 'Talmid'), h('th', 'Allergies'), h('th', 'Attend.'), h('th', 'Abs'), h('th', 'Late'),
              c.tests.map(function (x) { return h('th', { title: x.title + ' · ' + UI.fmtDate(x.date) + ' · out of ' + x.max }, x.title.length > 18 ? x.title.slice(0, 17) + '…' : x.title, h('div.small.muted', '/' + x.max)); }),
              h('th', 'Avg'))),
            h('tbody', c.rows.map(function (r) {
              return h('tr',
                h('th', (r.t.first || '') + ' ' + (r.t.last || ''), r.t.hebName ? h('div.he.small.muted', r.t.hebName) : null),
                h('td.low', r.t.allergies || ''),
                h('td' + (r.att.pct !== null && r.att.pct < 90 ? '.low' : ''), r.att.pct === null ? '–' : r.att.pct + '%'),
                h('td', String(r.att.absent)), h('td', String(r.att.late)),
                r.scores.map(function (v, i) { return h('td' + (v !== null && 100 * v / c.tests[i].max < 70 ? '.low' : ''), v === null ? '–' : String(v)); }),
                h('td', h('strong', r.avg === null ? '–' : r.avg + '%')));
            })))));
        }
        main.appendChild(card);
      });
      // Parents' phone directory
      var dirOpen = openClass === 'phones';
      var dir = h('div.card.admin-class');
      var total = list.reduce(function (n, c) { return n + c.talmidim.length; }, 0);
      dir.appendChild(h('button.admin-class-head', { type: 'button', 'aria-expanded': dirOpen ? 'true' : 'false', onclick: function () { openClass = dirOpen ? null : 'phones'; App.render(); } },
        h('div.grow', h('div.name', 'Parents\' phone directory'), h('div.small.muted', total + ' families across ' + list.length + ' classes')),
        UI.icon(dirOpen ? 'chevl' : 'chev', 18)));
      if (dirOpen) {
        dir.appendChild(h('div.row.gap.wrap', { style: 'margin:8px 0 10px' },
          h('button.btn.small.primary', { type: 'button', onclick: function () { UI.download('Parents phone directory.csv', csv(phoneSheet(list)), 'text/csv'); UI.toast('Spreadsheet downloaded'); } }, UI.icon('file', 16), 'Export phone directory'),
          h('button.btn.small', { type: 'button', onclick: function () { window.print(); } }, UI.icon('print', 16), 'Print')));
        dir.appendChild(h('div.scroll-x', h('table.grid-table.admin-table',
          h('thead', h('tr', h('th', 'Class'), h('th', 'Talmid'), h('th', 'Father'), h('th', 'Mother'), h('th', 'Email'), h('th', 'Allergies'))),
          h('tbody', [].concat.apply([], list.map(function (c) {
            return c.talmidim.map(function (t) {
              var tel = function (n) { return n ? h('a', { href: 'tel:' + n.replace(/[^\d+]/g, '') }, n) : ''; };
              return h('tr', h('td', c.profile.className), h('th', (t.first || '') + ' ' + (t.last || '')),
                h('td', t.father || '', t.fatherPhone ? [h('br'), tel(t.fatherPhone)] : null),
                h('td', t.mother || '', t.motherPhone ? [h('br'), tel(t.motherPhone)] : null),
                h('td', t.email ? h('a', { href: 'mailto:' + t.email }, t.email) : ''),
                h('td.low', t.allergies || ''));
            });
          }))))));
      }
      main.appendChild(dir);

      main.appendChild(h('p.small.muted', 'Spreadsheets download as .csv files, which open in Excel, Numbers and Google Sheets. Marks below 70% and attendance below 90% are shown in red.'));
    }
  });

  function stat(n, label) { return h('div.stat', h('div.stat-n', String(n)), h('div.stat-l', label)); }
  window.AdminExport = { classSheet: classSheet, schoolSheet: schoolSheet, phoneSheet: phoneSheet, csv: csv };
})();
