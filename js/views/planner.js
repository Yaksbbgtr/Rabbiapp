(function () {
  'use strict';
  var h = UI.h;
  var SUBJECTS = ['Davening', 'Chumash', 'Rashi', 'Mishnayos', 'Gemara', 'Navi', 'Dinim', 'Halacha', 'Parsha', 'Kriah', 'Chazara', 'Story', 'Other'];
  var mode = 'week';          // 'day' | 'week' | 'month'
  var cursor = null;          // ISO date the planner is looking at

  // l: an existing lesson, or nothing / a prefilled object (no id) for a new one.
  function editLesson(l, date) {
    var isNew = !l || !l.id;
    if (isNew) l = Object.assign({ date: date || Store.todayISO(), subject: 'Chumash', plan: '', notes: '', done: false }, l || {});
    var subj = UI.input({ value: l.subject, list: 'plan-subj' });
    var dl = h('datalist#plan-subj', SUBJECTS.map(function (s) { return h('option', { value: s }); }));
    var d = UI.input({ type: 'date', value: l.date });
    // Nothing can be planned on Shabbos or Yom Tov: flag the date and block saving.
    var shabbosWarn = h('div.shabbos-warn', { role: 'alert' });
    var isShabbosDate = function () {
      var day = d.value ? HebCal.noMelacha(HebCal.isoToRD(d.value)) : '';
      shabbosWarn.textContent = '⚠ This date is ' + day + '. Pick another day.';
      shabbosWarn.hidden = !day; d.classList.toggle('invalid', !!day);
      if (saveBtn) { saveBtn.disabled = !!day; saveBtn.title = day ? 'Can\'t plan on ' + day : ''; }
      return !!day;
    };
    var saveBtn = null;
    d.addEventListener('input', isShabbosDate); d.addEventListener('change', isShabbosDate);
    isShabbosDate();
    var plan = h('textarea', { rows: 4, dir: 'auto', placeholder: 'Pesukim / mishnayos to cover, questions to ask, activities…' }, l.plan);
    var notes = h('textarea', { rows: 3, dir: 'auto', placeholder: 'After the shiur: how did it go? Where did we stop?' }, l.notes || '');
    var dlg = UI.modal(isNew ? 'Add to plan' : 'Edit plan', h('div', dl,
      h('div.form-grid', UI.field('Subject', subj), UI.field('Date', d)), shabbosWarn,
      UI.field('Plan', plan), UI.field('Notes / where we stopped', notes)), [
      isNew ? null : { label: 'Delete', danger: true, onClick: function () {
        Store.update(function (s) { s.lessons = s.lessons.filter(function (x) { return x.id !== l.id; }); }); App.render();
      } },
      { label: 'Cancel' },
      { label: 'Save', primary: true, onClick: function () {
        if (isShabbosDate()) { UI.toast('Can\'t plan on Shabbos or Yom Tov'); d.focus(); return false; }
        Store.update(function (s) {
          l.subject = subj.value.trim() || 'Other'; l.date = d.value; l.plan = plan.value.trim(); l.notes = notes.value.trim();
          if (isNew) { l.id = Store.uid(); s.lessons.push(l); }
        });
        App.render();
      } }
    ].filter(Boolean));
    saveBtn = dlg.el.querySelector('.modal-actions .btn.primary');
    isShabbosDate(); // grey out Save if it opened on Shabbos / Yom Tov
  }

  function lessonsOn(iso) {
    return Store.get().lessons.filter(function (l) { return l.date === iso; });
  }

  // Tapping an item (or its checkbox) marks it done / not done; the pencil edits it, the x removes it.
  function lessonRow(l) {
    var toggle = function () { Store.update(function () { l.done = !l.done; }); App.render(); };
    return h('div.lesson' + (l.done ? '.done' : ''),
      h('input', { type: 'checkbox', checked: l.done, 'aria-label': 'Done', onchange: toggle }),
      h('button.link.grow', { type: 'button', title: l.done ? 'Mark not done' : 'Mark done', onclick: toggle },
        h('strong', l.subject), ' ', h('span', { dir: 'auto' }, l.plan),
        l.notes ? h('div.small.muted', { dir: 'auto' }, '↳ ' + l.notes) : null),
      h('button.lesson-x.lesson-edit', { type: 'button', title: 'Edit', 'aria-label': 'Edit ' + l.subject, onclick: function () { editLesson(l); } }, UI.icon('edit', 16)),
      h('button.lesson-x', { type: 'button', title: 'Remove', 'aria-label': 'Remove ' + l.subject, onclick: function () {
        UI.confirm('Remove "' + l.subject + (l.plan ? ': ' + l.plan.split('\n')[0] : '') + '" from the planner?', function () {
          Store.update(function (s) { s.lessons = s.lessons.filter(function (x) { return x.id !== l.id; }); });
          UI.toast('Removed'); App.render();
        }, 'Remove');
      } }, UI.icon('x', 16)));
  }

  function shabbosLabel(rd) {
    var p = HebCal.parshaForShabbos(rd);
    return p.holiday ? p.en : 'Shabbos Parshas ' + p.en;
  }

  function move(n) {
    var rd = HebCal.isoToRD(cursor);
    if (mode === 'day') cursor = HebCal.rdToISO(rd + n);
    else if (mode === 'week') cursor = HebCal.rdToISO(rd + 7 * n);
    else {
      var d = new Date(+cursor.slice(0, 4), +cursor.slice(5, 7) - 1 + n, 1);
      cursor = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01';
    }
    App.render();
    window.scrollTo(0, 0);
  }

  // Other pages can open the Add to plan form prefilled, e.g. { date, subject, plan }.
  window.Planner = { add: function (prefill) { editLesson(prefill || null); } };

  Views.register('planner', {
    title: 'Planner', icon: 'calendar',
    render: function (main) {
      var today = Store.todayISO();
      cursor = cursor || today;
      var todayRD = HebCal.isoToRD(today);
      var rd = HebCal.isoToRD(cursor);
      var sunday = rd - HebCal.weekday(rd);

      // What the header says for the current view
      var rangeText, sub;
      if (mode === 'day') {
        rangeText = UI.fmtDate(cursor, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        sub = HebCal.formatHebrew(HebCal.fromRD(rd));
      } else if (mode === 'week') {
        var p = HebCal.parshaForShabbos(sunday + 6);
        var a = HebCal.rdToISO(sunday), b = HebCal.rdToISO(sunday + 6);
        rangeText = UI.fmtDate(a, { weekday: undefined }) + ' – ' +
          (a.slice(0, 7) === b.slice(0, 7) ? String(+b.slice(8)) : UI.fmtDate(b, { weekday: undefined })) + ', ' + b.slice(0, 4);
        sub = p.holiday ? p.en : 'Parshas ' + p.en + ' · ' + p.he;
      } else {
        rangeText = new Date(+cursor.slice(0, 4), +cursor.slice(5, 7) - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
        var m1 = HebCal.fromRD(HebCal.isoToRD(cursor.slice(0, 8) + '01'));
        var lastDay = new Date(+cursor.slice(0, 4), +cursor.slice(5, 7), 0).getDate();
        var m2 = HebCal.fromRD(HebCal.isoToRD(cursor.slice(0, 8) + String(lastDay).padStart(2, '0')));
        sub = HebCal.MONTH_HE[m1.month] + (m1.month === m2.month ? '' : ' – ' + HebCal.MONTH_HE[m2.month]) + ' ' + HebCal.gematriya(m2.year);
      }

      main.appendChild(h('div.page-head',
        h('div', h('h1', 'Planner')),
        h('div.seg', [['day', 'Day'], ['week', 'Week'], ['month', 'Month']].map(function (m) {
          return h('button' + (mode === m[0] ? '.on' : ''), { type: 'button', onclick: function () { mode = m[0]; App.render(); } }, m[1]);
        }))));

      var isNow = mode === 'day' ? cursor === today : mode === 'week' ? sunday === todayRD - HebCal.weekday(todayRD) : cursor.slice(0, 7) === today.slice(0, 7);
      main.appendChild(h('div.card.plan-nav',
        h('button.btn.nav-btn', { type: 'button', 'aria-label': 'Previous ' + mode, onclick: function () { move(-1); } }, UI.icon('chevl'), h('span.nav-word', 'Prev')),
        h('div.plan-range',
          h('div.plan-range-main', rangeText),
          h('div.small.muted', h('span.he', sub)),
          isNow ? null : h('button.link.small', { type: 'button', onclick: function () { cursor = today; App.render(); } }, 'Back to today')),
        h('button.btn.nav-btn', { type: 'button', 'aria-label': 'Next ' + mode, onclick: function () { move(1); } }, h('span.nav-word', 'Next'), UI.icon('chev'))));

      if (mode === 'day') renderDay(main, rd, todayRD);
      else if (mode === 'week') renderWeek(main, sunday, todayRD);
      else renderMonth(main, cursor, todayRD);
    }
  });

  // ---------- Day ----------
  function renderDay(main, rd, todayRD) {
    var iso = HebCal.rdToISO(rd);
    var hols = HebCal.holidaysBetween(rd, rd);
    var isShabbos = HebCal.weekday(rd) === 6;
    var lessons = lessonsOn(iso);
    main.appendChild(h('div.card.day.day-big' + (rd === todayRD ? '.today' : '') + (isShabbos ? '.shabbos' : ''),
      h('div.row.gap.wrap',
        hols.map(function (x) { return h('span.pill' + (x.fast ? '.neg' : '.gold'), x.en); }),
        isShabbos ? h('span.pill.gold', shabbosLabel(rd)) : null),
      lessons.length ? h('div.lesson-list', lessons.map(lessonRow))
        : h('p.muted', isShabbos ? 'Good Shabbos!' : 'Nothing planned for this day yet.'),
      h('button.btn.primary', { type: 'button', onclick: function () { editLesson(null, iso); } }, UI.icon('plus'), 'Add to this day')));
    if (!isShabbos) {
      main.appendChild(h('div.row.gap.wrap',
        h('button.btn', { type: 'button', onclick: function () {
          var prev = lessonsOn(UI.addDays(iso, -1));
          if (HebCal.weekday(rd) === 0) prev = lessonsOn(UI.addDays(iso, -2)); // Sunday copies Friday
          if (!prev.length) { UI.toast('Nothing planned the day before'); return; }
          Store.update(function (s) {
            prev.forEach(function (l) { s.lessons.push({ id: Store.uid(), date: iso, subject: l.subject, plan: l.plan, notes: '', done: false }); });
          });
          UI.toast('Copied ' + prev.length + (prev.length === 1 ? ' item' : ' items')); App.render();
        } }, UI.icon('copy'), 'Copy previous day'),
        h('button.btn', { type: 'button', onclick: function () { window.print(); } }, UI.icon('print'), 'Print')));
    }
  }

  // ---------- Week ----------
  function renderWeek(main, sunday, todayRD) {
    var st = Store.get();
    var week = h('div.week');
    var hols = HebCal.holidaysBetween(sunday, sunday + 6);
    for (var i = 0; i < 7; i++) {
      (function (rd) {
        var iso = HebCal.rdToISO(rd);
        var hd = HebCal.fromRD(rd);
        var lessons = lessonsOn(iso);
        var dayHols = hols.filter(function (x) { return x.rd === rd; });
        var isShabbos = HebCal.weekday(rd) === 6;
        var openDay = function () { cursor = iso; mode = 'day'; App.render(); window.scrollTo(0, 0); };
        week.appendChild(h('div.card.day.day-open' + (rd === todayRD ? '.today' : '') + (isShabbos ? '.shabbos' : ''), {
            title: 'Open this day',
            // Clicking anywhere on the day opens it, except on its checkboxes, lessons and Add button.
            onclick: function (e) { if (!e.target.closest('button, input, a, label')) openDay(); } },
          h('div.day-head',
            h('button.link', { type: 'button', title: 'Open this day', onclick: openDay },
              h('strong', UI.fmtDate(iso, { weekday: 'long', month: undefined, day: undefined })), ' ',
              h('span.muted.small', UI.fmtDate(iso, { weekday: undefined }))),
            h('span.he.muted', HebCal.formatHebrew(hd, { noYear: true }))),
          dayHols.map(function (x) { return h('div.pill' + (x.fast ? '.neg' : '.gold'), x.en); }),
          isShabbos ? h('div.muted.small', shabbosLabel(rd)) :
            h('div', lessons.map(lessonRow),
              h('button.btn.small.ghost', { type: 'button', onclick: function () { editLesson(null, iso); } }, UI.icon('plus', 16), 'Add'))));
      })(sunday + i);
    }
    main.appendChild(week);

    main.appendChild(h('div.row.gap.wrap',
      h('button.btn', { type: 'button', onclick: function () {
        var prevStart = HebCal.rdToISO(sunday - 7), prevEnd = HebCal.rdToISO(sunday - 1);
        var prev = st.lessons.filter(function (l) { return l.date >= prevStart && l.date <= prevEnd; });
        if (!prev.length) { UI.toast('Nothing planned the week before'); return; }
        Store.update(function (s) {
          prev.forEach(function (l) {
            s.lessons.push({ id: Store.uid(), date: UI.addDays(l.date, 7), subject: l.subject, plan: l.plan, notes: '', done: false });
          });
        });
        UI.toast('Copied ' + prev.length + ' items from the week before'); App.render();
      } }, UI.icon('copy'), 'Copy previous week'),
      h('button.btn', { type: 'button', onclick: function () { window.print(); } }, UI.icon('print'), 'Print week')));
  }

  // ---------- Month ----------
  function renderMonth(main, iso, todayRD) {
    var y = +iso.slice(0, 4), m = +iso.slice(5, 7) - 1;
    var first = HebCal.isoToRD(iso.slice(0, 8) + '01');
    var daysIn = new Date(y, m + 1, 0).getDate();
    var start = first - HebCal.weekday(first);
    var cells = Math.ceil((HebCal.weekday(first) + daysIn) / 7) * 7;
    var hols = HebCal.holidaysBetween(start, start + cells - 1);
    var grid = h('div.month-grid');
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Shabbos'].forEach(function (d) { grid.appendChild(h('div.month-dow', d)); });
    for (var i = 0; i < cells; i++) {
      (function (rd) {
        var d = HebCal.rdToISO(rd);
        var inMonth = +d.slice(5, 7) - 1 === m;
        var hd = HebCal.fromRD(rd);
        var n = lessonsOn(d).length;
        var dayHols = hols.filter(function (x) { return x.rd === rd && !x.roshChodesh; });
        var isShabbos = HebCal.weekday(rd) === 6;
        grid.appendChild(h('button.month-cell' + (inMonth ? '' : '.other') + (rd === todayRD ? '.today' : '') + (isShabbos ? '.shabbos' : ''), {
          type: 'button', 'aria-label': UI.fmtDate(d, { weekday: 'long' }) + (n ? ', ' + n + ' planned' : ''),
          onclick: function () { cursor = d; mode = 'day'; App.render(); window.scrollTo(0, 0); }
        },
          h('div.month-num', String(+d.slice(8))),
          h('div.month-he', HebCal.gematriya(hd.day) + (hd.day === 1 || hd.day === 30 ? ' ' + HebCal.MONTH_HE[hd.month] : '')),
          dayHols.length ? h('div.month-hol', dayHols[0].en.replace(/ (I|II)$/, '').replace(/:.*$/, '')) : null,
          n ? h('div.month-count', n + (n === 1 ? ' item' : ' items')) : null));
      })(start + i);
    }
    main.appendChild(h('div.card.month-card', grid));
    main.appendChild(h('p.small.muted', 'Tap a day to see or plan it.'));
  }
})();
