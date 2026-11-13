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

  var attDate = null;
  var issueFilter = 'open';
  var issueTo = ''; // '' = everyone, or 'office' / 'principal' / 'maintenance'

  // Each office section is its own page in the menu.
  function openIssueCount() { return Issues.officeUnreadCount(); }
  // Issues that were new when the office opened the page keep a "New" tag until it leaves the page.
  var freshIds = {};
  window.addEventListener('hashchange', function () { if (location.hash !== '#/admin-issues') freshIds = {}; });
  function section(name, title, short, icon, sub, draw, badge) {
    Views.register(name, {
      title: title, short: short, icon: icon, admin: true, adminOnly: true, badge: badge,
      render: function (main, params) {
        // old links like #/admin/phones
        if (name === 'admin' && params[0]) { App.go(params[0] === 'classes' ? 'admin' : 'admin-' + params[0]); return; }
        var list = classes();
        main.appendChild(h('div.page-head', h('div', h('h1', title), h('p.muted', sub(list)))));
        draw(main, list);
      }
    });
  }
  section('admin', 'Classes', 'Classes', 'users', function (l) { return 'Every class on this device' + (l.length ? ': ' + l.length + ' classes' : '') + '.'; }, function (m, l) { renderClasses(m, l); });
  section('admin-attendance', 'Attendance', 'Attendance', 'check', function () { return 'One day across every class.'; }, function (m, l) { renderAttendance(m, l); });
  section('admin-phones', 'Phones', 'Phones', 'phone', function () { return 'Parents\' phone directory for the whole school.'; }, function (m, l) { renderPhones(m, l); });
  section('admin-tuition', 'Tuition', 'Tuition', 'dollar', function () { return 'Tuition, payments and outstanding balances. Office only.'; }, function (m, l) { renderTuition(m, l); });
  section('admin-issues', 'Issues', 'Issues', 'flag', function () { return 'Reports from rebbeim and staff, as tasks.'; }, function (m, l) { renderIssues(m, l); }, openIssueCount);

  // ================= Classes =================
  function renderClasses(main, list) {
      var file = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
      file.addEventListener('change', function () { if (file.files[0]) importBackup(file.files[0]); file.value = ''; });
      var from = UI.input({ type: 'date', value: range.from, 'aria-label': 'From', onchange: function (e) { range.from = e.target.value; App.render(); } });
      var to = UI.input({ type: 'date', value: range.to, 'aria-label': 'To', onchange: function (e) { range.to = e.target.value; App.render(); } });

      main.appendChild(h('div.card.row.between.wrap',
        h('p.muted.small', { style: 'margin:0' }, 'Attendance and bechina marks for every talmid.'),
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
      main.appendChild(h('p.small.muted', 'Spreadsheets download as .csv files, which open in Excel, Numbers and Google Sheets. Marks below 70% and attendance below 90% are shown in red.'));
  }

  // ================= Attendance (one day, every class) =================
  function renderAttendance(main, list) {
    attDate = attDate || Store.todayISO();
    var iso = attDate;
    var dateInput = UI.input({ type: 'date', value: iso, 'aria-label': 'Date', onchange: function (e) { attDate = e.target.value || Store.todayISO(); App.render(); } });
    main.appendChild(h('div.card.plan-nav',
      h('button.btn.nav-btn', { type: 'button', 'aria-label': 'Previous day', onclick: function () { attDate = UI.addDays(iso, -1); App.render(); } }, UI.icon('chevl')),
      h('div.plan-range', h('div.plan-range-main', UI.fmtDate(iso, { weekday: 'long', year: 'numeric' })), h('div.small.muted', h('span.he', UI.hebDate(iso))),
        iso === Store.todayISO() ? null : h('button.link.small', { type: 'button', onclick: function () { attDate = Store.todayISO(); App.render(); } }, 'Today')),
      h('button.btn.nav-btn', { type: 'button', 'aria-label': 'Next day', onclick: function () { attDate = UI.addDays(iso, 1); App.render(); } }, UI.icon('chev'))));
    main.appendChild(h('div.row.gap.wrap', { style: 'margin-bottom:12px' }, dateInput));

    if (!list.length) { main.appendChild(UI.empty('No classes on this device yet.')); return; }
    var totals = { P: 0, L: 0, A: 0, E: 0, taken: 0, classes: 0 };
    var rows = [];
    var perClass = list.map(function (c) {
      var day = (c.data.attendance || {})[iso];
      var out = { c: c, taken: !!day, P: 0, L: 0, A: 0, E: 0, absent: [], late: [] };
      if (day) {
        totals.classes++;
        c.talmidim.forEach(function (t) {
          var v = day[t.id]; if (!v) return;
          out[v]++; totals[v]++; totals.taken++;
          var name = (t.first || '') + ' ' + (t.last || '');
          if (v === 'A' || v === 'E') out.absent.push({ t: t, excused: v === 'E' });
          if (v === 'L') out.late.push(t);
          rows.push([c.profile.className, c.profile.name, t.last || '', t.first || '', { P: 'Present', L: 'Late', A: 'Absent', E: 'Excused' }[v], t.fatherPhone || '', t.motherPhone || '']);
          void name;
        });
      }
      return out;
    });
    main.appendChild(h('div.card',
      h('div.stats', stat(totals.classes + '/' + list.length, 'classes taken'), stat(totals.P + totals.L, 'here'), stat(totals.A + totals.E, 'absent'), stat(totals.L, 'late')),
      h('div.row.gap.wrap',
        h('button.btn.primary.small', { type: 'button', onclick: function () {
          UI.download('Attendance ' + iso + '.csv', csv([['Class', 'Rebbi', 'Last name', 'First name', 'Status', 'Father\'s cell', 'Mother\'s cell']].concat(rows)), 'text/csv'); UI.toast('Spreadsheet downloaded');
        } }, UI.icon('file', 16), 'Export this day'),
        h('button.btn.small', { type: 'button', onclick: function () { window.print(); } }, UI.icon('print', 16), 'Print'))));
    // The main office and the principal can take or fix a class's attendance (e.g. when the rebbi is out).
    var canMark = Store.staffRole() !== 'maintenance';
    perClass.forEach(function (x) {
      var c = x.c;
      main.appendChild(h('div.card',
        h('div.row.between.gap.wrap',
          h('div', h('strong', c.profile.className || '(no class name)'), h('span.muted.small', ' · ' + c.profile.name)),
          h('div.row.gap.wrap', { style: 'align-items:center' },
            x.taken ? h('span.small', (x.P + x.L) + ' here · ' + (x.A + x.E) + ' absent · ' + x.L + ' late' + ((c.data.attendanceBy || {})[iso] ? ' · by ' + c.data.attendanceBy[iso] : '')) : h('span.pill.gold', 'Not taken'),
            canMark ? h('button.btn.small' + (x.taken ? '' : '.primary'), { type: 'button', onclick: function () { markAttendance(c, iso); } },
              UI.icon('check', 16), x.taken ? 'Edit' : 'Take attendance') : null)),
        x.absent.length ? h('div.small', h('strong', 'Absent: '), x.absent.map(function (a, i) {
          var t = a.t, n = t.fatherPhone || t.motherPhone;
          return [i ? ', ' : '', (t.first || '') + ' ' + (t.last || '') + (a.excused ? ' (excused)' : ''),
            n ? h('a.small', { href: 'tel:' + n.replace(/[^\d+]/g, ''), title: 'Call parents' }, ' ☎') : null];
        })) : null,
        x.late.length ? h('div.small', h('strong', 'Late: '), x.late.map(function (t) { return (t.first || '') + ' ' + (t.last || ''); }).join(', ')) : null));
    });
  }

  // Take or edit one class's attendance for a day, from the office. Everyone starts as Here, like on the rebbi's side.
  var ATT = [['P', 'Here'], ['L', 'Late'], ['A', 'Absent'], ['E', 'Excused']];
  function markAttendance(c, iso) {
    var saved = (Store.peek(c.profile.id).attendance || {})[iso] || {};
    var day = {};
    c.talmidim.forEach(function (t) { day[t.id] = saved[t.id] || 'P'; });
    var rows = c.talmidim.map(function (t) {
      var seg = h('div.seg.att-seg', { role: 'group', 'aria-label': (t.first || '') + ' ' + (t.last || '') });
      var draw = function () {
        seg.innerHTML = '';
        ATT.forEach(function (a) {
          seg.appendChild(h('button' + (day[t.id] === a[0] ? '.on.att-' + a[0] : ''), { type: 'button', onclick: function () { day[t.id] = a[0]; draw(); } }, a[1]));
        });
      };
      draw();
      return h('div.row.between.gap.wrap.att-office-row', h('span', (t.first || '') + ' ' + (t.last || '')), seg);
    });
    var who = Store.get().settings.rebbiName || Store.currentProfile().name;
    UI.modal((c.profile.className || c.profile.name) + ' – ' + UI.fmtDate(iso), h('div',
      h('p.small.muted', 'Everyone starts as Here. Tap Late, Absent or Excused for the exceptions, then Save. ' + (c.profile.name || 'The rebbi') + ' sees it in his attendance.'),
      h('div.att-office-list', rows)), [
      { label: 'Cancel' },
      { label: 'Save attendance', primary: true, onClick: function () {
        Store.updateProfile(c.profile.id, function (d) {
          d.attendance = d.attendance || {};
          d.attendance[iso] = Object.assign({}, d.attendance[iso] || {}, day);
          d.attendanceBy = d.attendanceBy || {};
          d.attendanceBy[iso] = who;
        });
        UI.toast('Attendance saved for ' + (c.profile.className || c.profile.name));
        App.render();
      } }
    ]);
  }

  // ================= Phones (parents' directory) =================
  var phoneQuery = '';
  var phoneClass = ''; // profile id, '' = all classes
  function renderPhones(main, list) {
    if (phoneClass && !list.some(function (c) { return c.profile.id === phoneClass; })) phoneClass = '';
    var picked = phoneClass ? list.filter(function (c) { return c.profile.id === phoneClass; }) : list;
    var search = UI.input({ type: 'search', value: phoneQuery, placeholder: 'Search a name or number…', 'aria-label': 'Search' });
    var classSel = UI.select([['', 'All classes']].concat(list.map(function (c) { return [c.profile.id, (c.profile.className || '(no class name)') + ' – ' + c.profile.name]; })), phoneClass, { 'aria-label': 'Class' });
    classSel.addEventListener('change', function () { phoneClass = classSel.value; App.render(); });
    var total = picked.reduce(function (n, c) { return n + c.talmidim.length; }, 0);
    var one = phoneClass ? picked[0] : null;
    main.appendChild(h('div.card.row.between.wrap',
      h('div', h('strong', one ? (one.profile.className || 'Class') + ' – phone list' : 'Parents\' phone directory'),
        h('div.small.muted', total + ' families' + (one ? ' · ' + one.profile.name : ' across ' + list.length + ' classes'))),
      h('div.row.gap.wrap',
        h('button.btn.primary.small', { type: 'button', onclick: function () {
          UI.download((one ? fileSafe(one.profile.className || one.profile.name) + ' phone list' : 'Parents phone directory') + '.csv', csv(phoneSheet(picked)), 'text/csv'); UI.toast('Spreadsheet downloaded');
        } }, UI.icon('file', 16), 'Export (spreadsheet)'),
        h('button.btn.small', { type: 'button', onclick: function () { window.print(); } }, UI.icon('print', 16), 'Print'))));
    main.appendChild(h('div.phone-filters', UI.field('Class', classSel), UI.field('Search', search)));
    var table = h('div.card.scroll-x');
    function draw() {
      var q = search.value.trim().toLowerCase();
      table.innerHTML = '';
      var rows = [];
      picked.forEach(function (c) {
        c.talmidim.forEach(function (t) {
          var hay = [c.profile.className, t.first, t.last, t.father, t.mother, t.fatherPhone, t.motherPhone, t.email].join(' ').toLowerCase();
          if (q && hay.indexOf(q) < 0) return;
          var tel = function (n) { return n ? h('a', { href: 'tel:' + n.replace(/[^\d+]/g, '') }, n) : ''; };
          // data-label names each cell when the table turns into cards on a phone; empty cells are hidden there.
          var cell = function (cls, label, filled, content) { return h('td' + cls + (filled ? '' : '.blank'), { 'data-label': label }, h('span.val', content)); };
          rows.push(h('tr', h('td.cls', { 'data-label': 'Class' }, c.profile.className), h('th', (t.first || '') + ' ' + (t.last || '')),
            cell('', 'Father', t.father || t.fatherPhone, [t.father || '', t.fatherPhone ? [h('br'), tel(t.fatherPhone)] : null]),
            cell('', 'Mother', t.mother || t.motherPhone, [t.mother || '', t.motherPhone ? [h('br'), tel(t.motherPhone)] : null]),
            cell('', 'Email', t.email, t.email ? h('a', { href: 'mailto:' + t.email }, t.email) : ''),
            cell('.low', 'Allergies', t.allergies, t.allergies || '')));
        });
      });
      table.appendChild(rows.length ? h('table.grid-table.admin-table.stack-table',
        h('thead', h('tr', h('th', 'Class'), h('th', 'Talmid'), h('th', 'Father'), h('th', 'Mother'), h('th', 'Email'), h('th', 'Allergies'))),
        h('tbody', rows)) : h('p.muted', 'No families match.'));
    }
    search.addEventListener('input', function () { phoneQuery = search.value; draw(); });
    draw();
    main.appendChild(table);
  }

  // ================= Tuition =================
  // Kept in the office's own profile data: tuition.families[profileId:talmidId] = { annual, payments: [{date, amount, note}], notes }
  var tuitionFilter = 'all'; // 'all' | 'owing' | 'paid'
  var tuitionBy = 'family';  // 'family' (a drop-down per family) | 'class' (one list, by class)
  var openFam = {};          // families opened in the drop-down list
  function tuitionStore() {
    var st = Store.get();
    st.tuition = st.tuition || { defaultAnnual: 0, families: {} };
    st.tuition.families = st.tuition.families || {};
    return st.tuition;
  }
  function money(n) { return '$' + (Math.round(n * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
  function familyRec(key) { return tuitionStore().families[key] || { annual: null, payments: [], notes: '' }; }
  function familyNumbers(key) {
    var r = familyRec(key), tu = tuitionStore();
    var annual = r.annual === null || r.annual === undefined || r.annual === '' ? (+tu.defaultAnnual || 0) : +r.annual;
    var paid = (r.payments || []).reduce(function (s, p) { return s + (+p.amount || 0); }, 0);
    return { annual: annual, paid: paid, balance: Math.max(0, annual - paid), usesDefault: r.annual === null || r.annual === undefined || r.annual === '' };
  }
  function editFamily(key, label, parents) {
    var r = familyRec(key), tu = tuitionStore();
    var annual = UI.input({ type: 'number', inputmode: 'decimal', min: 0, value: r.annual === null || r.annual === undefined ? '' : r.annual, placeholder: tu.defaultAnnual ? 'Default ' + money(+tu.defaultAnnual) : '0' });
    var notes = h('textarea', { rows: 2, dir: 'auto', placeholder: 'Scholarship, payment plan, who to call…' }, r.notes || '');
    var payList = h('ul.list.small');
    var payments = (r.payments || []).slice();
    function drawPay() {
      payList.innerHTML = '';
      payments.forEach(function (p, i) {
        payList.appendChild(h('li.row.between.gap', h('span', UI.fmtDate(p.date) + ' · ' + money(+p.amount) + (p.note ? ' · ' + p.note : '')),
          h('button.icon-btn.small', { type: 'button', 'aria-label': 'Remove payment', onclick: function () { payments.splice(i, 1); drawPay(); } }, '×')));
      });
      if (!payments.length) payList.appendChild(h('li.muted', 'No payments recorded.'));
    }
    drawPay();
    var pAmt = UI.input({ type: 'number', inputmode: 'decimal', min: 0, placeholder: 'Amount' });
    var pDate = UI.input({ type: 'date', value: Store.todayISO() });
    var pNote = UI.input({ placeholder: 'Check #, cash, card…' });
    function addPay() {
      if (!(+pAmt.value > 0)) { UI.toast('Enter an amount'); return; }
      payments.push({ date: pDate.value || Store.todayISO(), amount: +pAmt.value, note: pNote.value.trim() });
      pAmt.value = ''; pNote.value = ''; drawPay();
    }
    function saveFamily() {
      // A payment typed but not yet "recorded" is saved too.
      if (+pAmt.value > 0) payments.push({ date: pDate.value || Store.todayISO(), amount: +pAmt.value, note: pNote.value.trim() });
      Store.update(function (s) {
        s.tuition = s.tuition || { defaultAnnual: 0, families: {} }; s.tuition.families = s.tuition.families || {};
        s.tuition.families[key] = { annual: annual.value === '' ? null : +annual.value, payments: payments, notes: notes.value.trim() };
      });
      UI.toast('Saved'); App.render();
    }
    var m = UI.modal('Tuition – ' + label, h('div',
      parents ? h('p.small.muted', parents) : null,
      UI.field('Annual tuition for this family', annual, 'Leave empty to use the office default'),
      h('h3', 'Payments'), payList,
      h('div.form-grid', UI.field('Amount', pAmt), UI.field('Date', pDate)),
      h('div.row.gap', pNote, h('button.btn.small', { type: 'button', title: 'Add this payment and enter another', onclick: addPay }, UI.icon('plus', 14), 'Add another')),
      h('p.small.muted', 'Save records the payment above. Use "Add another" only if you are entering several at once.'),
      UI.field('Notes', notes)), [
      { label: 'Cancel' },
      { label: 'Save', primary: true, onClick: saveFamily }
    ]);
    // Enter in any box saves (Notes keeps Enter for new lines).
    [annual, pAmt, pDate, pNote].forEach(function (inp) {
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); saveFamily(); m.close(); } });
    });
  }
  function renderTuition(main, list) {
    var tu = tuitionStore();
    var def = UI.input({ type: 'number', inputmode: 'decimal', min: 0, value: tu.defaultAnnual || '', placeholder: '0', 'aria-label': 'Default annual tuition' });
    var saveDefault = function () {
      if ((+def.value || 0) === (+tuitionStore().defaultAnnual || 0)) return;
      Store.update(function (s) { s.tuition.defaultAnnual = +def.value || 0; }); UI.toast('Default saved'); App.render();
    };
    def.addEventListener('change', saveDefault);
    def.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); saveDefault(); } });
    var rows = [];
    list.forEach(function (c) {
      c.talmidim.forEach(function (t) {
        var key = c.profile.id + ':' + t.id;
        var n = familyNumbers(key);
        rows.push({ c: c, t: t, key: key, n: n, rec: familyRec(key) });
      });
    });
    var owing = rows.filter(function (r) { return r.n.balance > 0; });
    var totals = rows.reduce(function (a, r) { a.annual += r.n.annual; a.paid += r.n.paid; a.balance += r.n.balance; return a; }, { annual: 0, paid: 0, balance: 0 });
    main.appendChild(h('div.card',
      h('div.stats', stat(money(totals.annual), 'billed'), stat(money(totals.paid), 'paid'), stat(money(totals.balance), 'outstanding'), stat(owing.length, 'families owing')),
      h('div.row.gap.wrap',
        h('label.row.gap.small.muted', 'Default annual tuition $', def),
        h('div.seg', { role: 'group', 'aria-label': 'Sort by' }, [['family', 'By family'], ['class', 'By class']].map(function (f) {
          return h('button' + (tuitionBy === f[0] ? '.on' : ''), { type: 'button', 'aria-pressed': tuitionBy === f[0] ? 'true' : 'false',
            onclick: function () { tuitionBy = f[0]; App.render(); } }, f[1]);
        })),
        h('div.seg', { role: 'group', 'aria-label': 'Show' }, [['all', 'All'], ['owing', 'Outstanding'], ['paid', 'Paid']].map(function (f) {
          return h('button' + (tuitionFilter === f[0] ? '.on' : ''), { type: 'button', 'aria-pressed': tuitionFilter === f[0] ? 'true' : 'false',
            onclick: function () { tuitionFilter = f[0]; App.render(); } }, f[1]);
        })),
        h('button.btn.primary.small', { type: 'button', onclick: function () {
          var sheet = [['Class', 'Last name', 'First name', 'Father', 'Father\'s cell', 'Mother', 'Mother\'s cell', 'Annual tuition', 'Paid', 'Balance', 'Last payment', 'Notes']];
          rows.forEach(function (r) {
            var last = (r.rec.payments || []).slice().sort(function (a, b) { return b.date.localeCompare(a.date); })[0];
            sheet.push([r.c.profile.className, r.t.last || '', r.t.first || '', r.t.father || '', r.t.fatherPhone || '', r.t.mother || '', r.t.motherPhone || '', r.n.annual, r.n.paid, r.n.balance, last ? last.date + ' ' + money(+last.amount) : '', r.rec.notes || '']);
          });
          UI.download('Tuition balances.csv', csv(sheet), 'text/csv'); UI.toast('Spreadsheet downloaded');
        } }, UI.icon('file', 16), 'Export (spreadsheet)'))));
    main.appendChild(h('p.small.muted', 'Tuition is kept in the office profile only; rebbeim never see it. Tap a family or class to see its boys; tap a boy to set tuition and record payments.'));
    // A family with no tuition set (and no payments) isn't "paid" – it just hasn't been set up yet.
    var unset = function (r) { return !r.n.annual && !r.n.paid; };
    var shown = tuitionFilter === 'owing' ? owing : tuitionFilter === 'paid' ? rows.filter(function (r) { return r.n.balance <= 0 && !unset(r); }) : rows;
    if (!shown.length) { main.appendChild(UI.empty(!rows.length ? 'No classes on this device yet.' : tuitionFilter === 'paid' ? 'No families are paid in full yet.' : 'No outstanding balances.')); return; }
    var isShown = {}; shown.forEach(function (r) { isShown[r.key] = true; });
    var balanceCell = function (n, none) { return n.balance > 0 ? money(n.balance) : none ? h('span.muted', 'Not set') : 'Paid ✓'; };
    var childRow = function (r, sib) {
      var parents = [r.t.father ? r.t.father + (r.t.fatherPhone ? ' ' + r.t.fatherPhone : '') : '', r.t.mother ? r.t.mother + (r.t.motherPhone ? ' ' + r.t.motherPhone : '') : ''].filter(Boolean).join(' · ');
      return h('tr', { class: 'clickable' + (sib ? ' sib' : ''), onclick: function () { editFamily(r.key, (r.t.first || '') + ' ' + (r.t.last || '') + (r.c.profile.className ? ' (' + r.c.profile.className + ')' : ''), parents); } },
        h('td.cls', { 'data-label': 'Class' }, r.c.profile.className), h('th', (r.t.first || '') + ' ' + (r.t.last || ''), sib && r.t.father ? h('div.small.muted', 'Father: ' + r.t.father) : null, r.rec.notes ? h('div.small.muted', r.rec.notes) : null),
        h('td.money', { 'data-label': 'Annual' }, h('span.val', money(r.n.annual), r.n.usesDefault ? h('span.small.muted', ' *') : null)), h('td.money', { 'data-label': 'Paid' }, h('span.val', money(r.n.paid))),
        h('td.money' + (r.n.balance > 0 ? '.low' : ''), { 'data-label': 'Balance' }, h('span.val', balanceCell(r.n, unset(r)))));
    };
    var body = [];
    // One drop-down per family (last name) or per class, with its boys inside.
    var byClass = tuitionBy === 'class';
    var keyOf = function (r) { return byClass ? 'c:' + r.c.profile.id : 'f:' + ((r.t.last || '').trim().toLowerCase() || '?'); };
    var byKey = {}, groups = [];
    rows.forEach(function (r) {
      var k = keyOf(r);
      if (!byKey[k]) { byKey[k] = []; groups.push(byKey[k]); }
      byKey[k].push(r);
    });
    if (byClass) groups.forEach(function (g) { g.sort(function (a, b) { return ((a.t.last || '') + (a.t.first || '')).localeCompare((b.t.last || '') + (b.t.first || '')); }); });
    else groups.sort(function (a, b) { return (a[0].t.last || '').localeCompare(b[0].t.last || ''); });
    groups.forEach(function (g) {
      var vis = g.filter(function (r) { return isShown[r.key]; });
      if (!vis.length) return;
      var fk = keyOf(g[0]), open = !!openFam[fk];
      var tot = g.reduce(function (a, r) { a.annual += r.n.annual; a.paid += r.n.paid; a.balance += r.n.balance; return a; }, { annual: 0, paid: 0, balance: 0 });
      var kids = vis.map(function (r) { var tr = childRow(r, true); if (!open) tr.hidden = true; return tr; });
      var boys = g.length + (g.length === 1 ? ' boy' : ' boys');
      var cd = byClass ? Store.peek(g[0].c.profile.id).settings || {} : null;
      var label = byClass
        ? [(g[0].c.profile.className || g[0].c.profile.name), h('span.small.muted', ' · ' + [cd.rebbiName || g[0].c.profile.name, boys].filter(Boolean).join(' · '))]
        : [(g[0].t.last || '') + ' Family', h('span.small.muted', ' · ' + boys + ': ' + g.map(function (r) { return r.c.profile.className; }).join(', '))];
      var word = byClass ? 'Class' : 'Family';
      var head = h('tr.family-row.fam-toggle' + (open ? '.open' : ''), { tabindex: 0, role: 'button', 'aria-expanded': open ? 'true' : 'false',
        onclick: function () {
          open = openFam[fk] = !open;
          head.classList.toggle('open', open); head.setAttribute('aria-expanded', open ? 'true' : 'false');
          kids.forEach(function (tr) { tr.hidden = !open; });
        },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); head.click(); } } },
        h('th', { colspan: 2 }, h('span.fam-chev', UI.icon('chev', 16)), label),
        h('td.money', { 'data-label': word + ' annual' }, h('span.val', money(tot.annual))), h('td.money', { 'data-label': word + ' paid' }, h('span.val', money(tot.paid))),
        h('td.money' + (tot.balance > 0 ? '.low' : ''), { 'data-label': word + ' balance' }, h('span.val', balanceCell(tot, g.every(unset)))));
      body.push(head); kids.forEach(function (tr) { body.push(tr); });
    });
    main.appendChild(h('div.card.scroll-x', h('table.grid-table.admin-table.stack-table',
      h('thead', h('tr', h('th', 'Class'), h('th', 'Talmid'), h('th.money', 'Annual'), h('th.money', 'Paid'), h('th.money', 'Balance'))),
      h('tbody', body))));
    main.appendChild(h('p.small.muted', '* uses the office default.'));
  }

  // ================= Issues =================
  function renderIssues(main, list) {
    var staff = Store.staffRole();
    var items = Issues.all().filter(function (x) { return Issues.visibleTo(x.issue, staff); });
    // Opening the Issues page reads them: clear the indicator, but tag what was new.
    var seenNow = items.filter(function (x) { return Issues.officeUnread(x.issue); });
    seenNow.forEach(function (x) { freshIds[x.issue.id] = true; Issues.markOfficeSeen(x); });
    if (seenNow.length) setTimeout(App.render, 0);
    var to = staff === 'maintenance' ? '' : issueTo;
    var shown = items.filter(function (x) {
      return (issueFilter === 'all' || (issueFilter === 'done' ? x.issue.status === 'done' : x.issue.status !== 'done'))
        && (!to || Issues.toList(x.issue).indexOf(to) >= 0);
    });
    main.appendChild(h('div.card.row.between.wrap',
      h('div.row.gap.wrap',
        h('div.seg', [['open', 'Open'], ['done', 'Done'], ['all', 'All']].map(function (f) {
          return h('button' + (issueFilter === f[0] ? '.on' : ''), { type: 'button', onclick: function () { issueFilter = f[0]; App.render(); } }, f[1]);
        })),
        staff === 'maintenance' ? null : h('div.seg', { role: 'group', 'aria-label': 'Sent to' }, [['', 'Everyone']].concat(Issues.TO).map(function (f) {
          return h('button' + (issueTo === f[0] ? '.on' : ''), { type: 'button', onclick: function () { issueTo = f[0]; App.render(); } }, f[1]);
        }))),
      h('button.btn.primary', { type: 'button', onclick: function () { Issues.report('', function () { App.render(); }); } }, UI.icon('plus'), 'New issue')));
    main.appendChild(h('p.small.muted', staff === 'maintenance'
      ? 'Issues sent to maintenance by rebbeim and the office. Add a job to your to-do list, reply in the conversation, and mark it done when fixed.'
      : 'Issues reported by rebbeim and staff, as tasks. Each shows who it was sent to (main office, principal or maintenance), the rebbi\'s cell and, when it\'s about a talmid, the parents\' cells.'));
    if (!shown.length) { main.appendChild(UI.empty(items.length ? 'Nothing here.' : 'No issues yet. Rebbeim report them from a talmid\'s page or the Today page; the office can add one with New issue.')); return; }
    shown.forEach(function (item) {
      var card = Issues.taskCard(item, function () { App.render(); });
      var acts = staff === 'maintenance' && window.Maintenance && card.querySelector('.issue-actions');
      if (acts) acts.insertBefore(Maintenance.cardButton(item), acts.firstChild);
      if (freshIds[item.issue.id]) { card.classList.add('fresh'); card.insertBefore(h('span.pill.neg.fresh-tag', 'New'), card.firstChild); }
      main.appendChild(card);
    });
    void list;
  }

  function stat(n, label) { return h('div.stat', h('div.stat-n', String(n)), h('div.stat-l', label)); }
  window.AdminExport = { classSheet: classSheet, schoolSheet: schoolSheet, phoneSheet: phoneSheet, csv: csv, familyNumbers: familyNumbers };
})();
