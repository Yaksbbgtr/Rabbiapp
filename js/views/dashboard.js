(function () {
  'use strict';
  var h = UI.h;

  Views.register('dashboard', {
    title: 'Today', icon: 'home',
    render: function (main) {
      var st = Store.get();
      var today = Store.todayISO();
      var rd = HebCal.isoToRD(today);
      var hd = HebCal.fromRD(rd);
      var parsha = HebCal.parshaOfWeek(rd);
      var talmidim = Store.activeTalmidim();

      main.appendChild(h('div.page-head.no-print',
        h('div', h('h1', greeting() + (st.settings.rebbiName ? ', ' + st.settings.rebbiName : '')),
          h('p.muted', UI.fmtDate(today, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })))));

      var grid = h('div.grid.dash.no-print');
      main.appendChild(grid);

      // Date & parsha card
      var omer = HebCal.omerDay(rd);
      var nextShabbos = parsha.shabbosRD;
      grid.appendChild(h('div.card.date-card',
        h('div.big-he', HebCal.formatHebrew(hd)),
        h('div.muted', HebCal.formatEnglish(hd)),
        h('div.parsha',
          h('div.label', parsha.holiday ? 'This Shabbos' : 'Parshas Hashavua'),
          h('div.parsha-name', h('span.he', parsha.he), h('span', parsha.en))),
        h('div.muted.small', 'Shabbos: ' + UI.fmtDate(HebCal.rdToISO(nextShabbos), { weekday: undefined })),
        omer ? h('div.pill.gold', 'Tonight: ' + omer + ' (' + HebCal.gematriya(omer) + ') la\'omer — count after nightfall') : null));

      // Upcoming
      var hol = HebCal.holidaysBetween(rd, rd + 21).filter(function (x) { return !x.chanukah || x.chanukah === 1 || x.rd === rd; });
      var bdays = upcomingBirthdays(talmidim, rd, 21);
      var events = hol.map(function (x) { return { rd: x.rd, text: x.en, he: x.he, kind: x.fast ? 'fast' : x.yomTov ? 'yt' : 'day' }; })
        .concat(bdays.map(function (b) { return { rd: b.rd, text: '🎂 ' + Store.displayName(b.t) + ' – Hebrew birthday' + (b.age ? ' (' + b.age + ')' : ''), kind: 'bday' }; }))
        .sort(function (a, b) { return a.rd - b.rd; }).slice(0, 8);
      grid.appendChild(h('div.card',
        h('h2', 'Coming up'),
        events.length ? h('ul.list', events.map(function (e) {
          return h('li.event.ev-' + e.kind,
            h('span.when', e.rd === rd ? 'Today' : e.rd === rd + 1 ? 'Tomorrow' : UI.fmtDate(HebCal.rdToISO(e.rd))),
            h('span', e.text), e.he ? h('span.he.muted', e.he) : null);
        })) : h('p.muted', 'Nothing in the next three weeks.')));

      // Attendance
      var att = st.attendance[today] || {};
      var counts = { P: 0, A: 0, L: 0, E: 0 };
      talmidim.forEach(function (t) { if (att[t.id]) counts[att[t.id]]++; });
      var taken = Object.keys(att).length > 0;
      var absentees = talmidim.filter(function (t) { return att[t.id] === 'A' || att[t.id] === 'E'; });
      grid.appendChild(h('div.card',
        h('h2', 'Attendance'),
        taken ? h('div',
          h('div.stats',
            stat(counts.P + counts.L, 'here'), stat(counts.A + counts.E, 'absent'), stat(counts.L, 'late')),
          absentees.length ? h('p.small', 'Absent: ' + absentees.map(function (t) { return Store.displayName(t, { short: true }); }).join(', ')) : null)
          : h('p.muted', talmidim.length ? 'Not taken yet today.' : 'Add talmidim to begin.'),
        h('a.btn.primary', { href: '#/attendance' }, taken ? 'Edit attendance' : 'Take attendance')));

      // Today's plan
      var lessons = st.lessons.filter(function (l) { return l.date === today; });
      grid.appendChild(h('div.card',
        h('h2', 'Today\'s plan'),
        lessons.length ? h('ul.list', lessons.map(function (l) {
          return h('li.check-row',
            h('input', { type: 'checkbox', checked: l.done, 'aria-label': 'Done',
              onchange: function (e) { Store.update(function () { l.done = e.target.checked; }); } }),
            h('div', h('strong', l.subject), ' ', h('span', { dir: 'auto' }, l.plan)));
        })) : h('p.muted', 'Nothing planned for today.'),
        h('div.row.gap.wrap',
          h('a.btn', { href: '#/planner' }, 'Open planner'),
          h('button.btn', { type: 'button', onclick: function () { window.print(); } }, UI.icon('print', 16), 'Print today\'s plan'))));

      // Follow-ups
      var due = st.contacts.filter(function (c) { return c.followUp && !c.followUpDone && c.followUp <= HebCal.rdToISO(rd + 3); })
        .sort(function (a, b) { return a.followUp.localeCompare(b.followUp); });
      grid.appendChild(h('div.card',
        h('h2', 'Parent follow-ups'),
        due.length ? h('ul.list', due.map(function (c) {
          return h('li.check-row',
            h('input', { type: 'checkbox', 'aria-label': 'Mark done', onchange: function () { Store.update(function () { c.followUpDone = true; }); App.render(); } }),
            h('div', h('strong', Store.displayName(Store.talmid(c.talmidId))), ' – ', h('span', { dir: 'auto' }, c.note),
              h('div.small' + (c.followUp < today ? '.overdue' : '.muted'), 'Due ' + UI.fmtDate(c.followUp))));
        })) : h('p.muted', 'No follow-ups due.'),
        h('a.btn', { href: '#/parents' }, 'Parent log')));

      // Issues sent to the office
      var mine = Issues.mine().slice(0, 5);
      grid.appendChild(h('div.card',
        h('h2', 'Office'),
        mine.length ? h('ul.list', mine.map(function (i) {
          return h('li', h('a.row.between.gap.plain-link', { href: '#/issue/' + i.id },
            h('span', h('span', { dir: 'auto' }, i.title), i.talmidName ? h('span.small.muted', ' · ' + i.talmidName) : null,
              Issues.unread(i) ? h('span.pill.neg.small', ' New reply') : null),
            h('span.pill' + (i.status === 'done' ? '.pos' : i.status === 'progress' ? '.gold' : ''), Issues.statusLabel(i.status))));
        })) : h('p.muted', 'Something broken, a concern about a talmid, anything the office should handle? Send it from here.'),
        h('div.row.gap.wrap', h('button.btn', { type: 'button', onclick: function () { Issues.report(''); } }, UI.icon('send'), 'Report an issue'),
          mine.length ? h('a.btn', { href: '#/issues' }, 'All my issues') : null)));

      // Quick note
      var noteInput = h('textarea', { rows: 2, placeholder: 'Jot something down…', dir: 'auto' });
      var recent = st.notes.slice(-4).reverse();
      grid.appendChild(h('div.card',
        h('h2', 'Quick notes'),
        noteInput,
        h('button.btn.primary', {
          onclick: function () {
            var v = noteInput.value.trim();
            if (!v) return;
            Store.update(function (s) { s.notes.push({ id: Store.uid(), date: today, text: v }); });
            App.render();
          }
        }, 'Save note'),
        recent.length ? h('ul.list.notes', recent.map(function (n) {
          return h('li', h('span.small.muted', UI.fmtDate(n.date)), ' ', h('span', { dir: 'auto' }, n.text),
            h('button.icon-btn.small', { 'aria-label': 'Delete note', onclick: function () {
              Store.update(function (s) { s.notes = s.notes.filter(function (x) { return x.id !== n.id; }); }); App.render();
            } }, '×'));
        })) : null));
      packCards(grid);
      main.appendChild(daySheet(st, today, rd, hd, parsha, talmidim, events, due, lessons));
    }
  });

  // The printed page for the day: date, parsha, plan, attendance, follow-ups, what's coming up, and room for notes.
  function daySheet(st, today, rd, hd, parsha, talmidim, events, due, lessons) {
    var s = st.settings;
    var att = st.attendance[today] || {};
    var taken = Object.keys(att).length > 0;
    var mark = { P: '', L: 'Late', A: 'Absent', E: 'Excused' };
    var omer = HebCal.omerDay(rd);
    var notes = st.notes.filter(function (n) { return n.date === today; });
    return h('div.print-only.day-sheet',
      h('div.ds-head',
        h('div', h('div.ds-title', UI.fmtDate(today, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })),
          h('div.ds-sub', [s.rebbiName, s.className, s.school].filter(Boolean).join(' · '))),
        h('div.ds-he', h('div.he', HebCal.formatHebrew(hd)),
          h('div.ds-sub', (parsha.holiday ? parsha.en : 'Parshas ' + parsha.en) + ' · ', h('span.he', parsha.he)))),
      omer ? h('p', 'Tonight: ' + omer + ' (' + HebCal.gematriya(omer) + ') la\'omer') : null,
      h('section', h('h3', 'Today\'s plan'),
        lessons.length ? h('table.ds-table',
          h('thead', h('tr', h('th', { style: 'width:24px' }, ''), h('th', { style: 'width:110px' }, 'Subject'), h('th', 'Plan'), h('th', { style: 'width:30%' }, 'Where we stopped / notes'))),
          h('tbody', lessons.map(function (l) {
            return h('tr', h('td', l.done ? '☑' : '☐'), h('td', h('strong', l.subject)), h('td.ds-pre', { dir: 'auto' }, l.plan || ''), h('td.ds-pre', { dir: 'auto' }, l.notes || ''));
          }))) : h('p', 'Nothing planned for today.')),
      h('section', h('h3', 'Attendance' + (taken ? '' : ' (not taken yet)')),
        h('div.ds-roster', talmidim.map(function (t) {
          var m = taken ? mark[att[t.id]] || '' : '';
          return h('div', h('span.ds-box', m ? '' : taken ? '✓' : ''), Store.displayName(t), m ? h('strong', ' – ' + m) : null);
        }))),
      due.length ? h('section', h('h3', 'Parent follow-ups'),
        h('ul', due.map(function (c) { return h('li', '☐ ', h('strong', Store.displayName(Store.talmid(c.talmidId))), ' – ', c.note, ' (due ' + UI.fmtDate(c.followUp) + ')'); }))) : null,
      events.length ? h('section', h('h3', 'Coming up'),
        h('ul', events.map(function (e) { return h('li', (e.rd === rd ? 'Today' : e.rd === rd + 1 ? 'Tomorrow' : UI.fmtDate(HebCal.rdToISO(e.rd))) + ' – ' + e.text.replace('🎂 ', '')); }))) : null,
      h('section', h('h3', 'Notes'),
        notes.length ? h('ul', notes.map(function (n) { return h('li', { dir: 'auto' }, n.text); })) : null,
        h('div.ds-lines', [1, 2, 3, 4, 5].map(function () { return h('div.ds-line'); }))));
  }

  // Cards have different heights, so a plain grid leaves gaps under the short ones. Give each card as many
  // small rows as it is tall, so the next card tucks in right underneath (order stays left-to-right).
  var ROW = 4, GAP = 16;
  function packCards(grid) {
    function layout() {
      if (!grid.isConnected) { if (obs) obs.disconnect(); return; }
      var cols = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length;
      grid.classList.toggle('packed', cols > 1);
      [].forEach.call(grid.children, function (c) {
        c.style.gridRowEnd = cols > 1 ? 'span ' + Math.ceil((c.getBoundingClientRect().height + GAP) / ROW) : '';
      });
    }
    var obs = window.ResizeObserver ? new ResizeObserver(function () { requestAnimationFrame(layout); }) : null;
    if (obs) [].forEach.call(grid.children, function (c) { obs.observe(c); });
    requestAnimationFrame(layout);
  }

  function stat(n, label) { return h('div.stat', h('div.stat-n', String(n)), h('div.stat-l', label)); }

  function greeting() {
    var hr = new Date().getHours();
    if (hr < 12) return 'Good morning';
    if (hr < 17) return 'Good afternoon';
    return 'Good evening';
  }

  function upcomingBirthdays(talmidim, rd, days) {
    var out = [];
    talmidim.forEach(function (t) {
      if (!t.birthday) return;
      var orig = HebCal.isoToRD(t.birthday);
      var next = HebCal.nextHebrewAnniversary(orig, rd);
      if (next !== null && next - rd <= days) {
        out.push({ t: t, rd: next, age: HebCal.fromRD(next).year - HebCal.fromRD(orig).year });
      }
    });
    return out;
  }
  window.upcomingBirthdays = upcomingBirthdays;
})();
