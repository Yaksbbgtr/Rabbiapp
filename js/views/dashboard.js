(function () {
  'use strict';
  var h = UI.h;

  Views.register('welcome', {
    title: 'Welcome', hidden: true,
    render: function (main) {
      var s = Store.get().settings;
      var name = UI.input({ value: s.rebbiName, placeholder: 'e.g. Rabbi Cohen' });
      var cls = UI.input({ value: s.className, placeholder: 'e.g. Kitah Daled' });
      var school = UI.input({ value: s.school, placeholder: 'Yeshiva name' });
      main.appendChild(h('div.welcome',
        h('div.card.hero',
          h('h1', 'Welcome, Rebbi!'),
          h('p.lead', 'Everything for your kitah in one place: talmidim, attendance, chazara tracking, middos points, bechinos, lesson plans, parent contact, report cards, plus the parsha and Hebrew date.'),
          h('p.muted', 'All your data stays private on this device. Use Settings → Backup to save a copy or move it to another device.'),
          UI.field('Your name (as it appears on letters)', name),
          UI.field('Class name', cls),
          UI.field('Yeshiva', school),
          h('div.row.gap',
            h('button.btn.primary', {
              onclick: function () {
                Store.update(function (st) {
                  st.settings.rebbiName = name.value.trim();
                  st.settings.className = cls.value.trim();
                  st.settings.school = school.value.trim();
                  st.settings.setupDone = true;
                });
                App.go('talmidim');
              }
            }, 'Get started → add talmidim'),
            h('button.btn', {
              onclick: function () { Store.loadDemo(); UI.toast('Sample class loaded'); App.go('dashboard'); }
            }, 'Try it with a sample class')))));
    }
  });

  Views.register('dashboard', {
    title: 'Today', icon: 'home',
    render: function (main) {
      var st = Store.get();
      var today = Store.todayISO();
      var rd = HebCal.isoToRD(today);
      var hd = HebCal.fromRD(rd);
      var parsha = HebCal.parshaOfWeek(rd);
      var talmidim = Store.activeTalmidim();

      main.appendChild(h('div.page-head',
        h('div', h('h1', greeting() + (st.settings.rebbiName ? ', ' + st.settings.rebbiName : '')),
          h('p.muted', UI.fmtDate(today, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })))));

      var grid = h('div.grid.dash');
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
        h('a.btn', { href: '#/planner' }, 'Open planner')));

      // Middos leaders
      var totals = talmidim.map(function (t) { return { t: t, pts: Store.pointsTotal(t.id) }; })
        .sort(function (a, b) { return b.pts - a.pts; }).slice(0, 5);
      grid.appendChild(h('div.card',
        h('h2', 'Middos stars'),
        talmidim.length ? h('ol.leaders', totals.map(function (x) {
          return h('li', h('span', Store.displayName(x.t)), h('span.pill', x.pts + ' ' + st.settings.pointsName.toLowerCase()));
        })) : h('p.muted', 'No talmidim yet.'),
        h('a.btn', { href: '#/middos' }, 'Give points')));

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
    }
  });

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
