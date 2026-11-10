(function () {
  'use strict';
  var h = UI.h;
  var weekOffset = 0;
  var SUBJECTS = ['Davening', 'Chumash', 'Rashi', 'Mishnayos', 'Gemara', 'Navi', 'Dinim', 'Parsha', 'Kriah', 'Chazara', 'Story', 'Other'];

  function editLesson(l, date) {
    var isNew = !l;
    l = l || { date: date, subject: 'Chumash', plan: '', notes: '', done: false };
    var subj = UI.input({ value: l.subject, list: 'plan-subj' });
    var dl = h('datalist#plan-subj', SUBJECTS.map(function (s) { return h('option', { value: s }); }));
    var d = UI.input({ type: 'date', value: l.date });
    var plan = h('textarea', { rows: 4, dir: 'auto', placeholder: 'Pesukim / mishnayos to cover, questions to ask, activities…' }, l.plan);
    var notes = h('textarea', { rows: 3, dir: 'auto', placeholder: 'After the shiur: how did it go? Where did we stop?' }, l.notes || '');
    UI.modal(isNew ? 'Add to plan' : 'Edit plan', h('div', dl,
      h('div.form-grid', UI.field('Subject', subj), UI.field('Date', d)),
      UI.field('Plan', plan), UI.field('Notes / where we stopped', notes)), [
      isNew ? null : { label: 'Delete', danger: true, onClick: function () {
        Store.update(function (s) { s.lessons = s.lessons.filter(function (x) { return x.id !== l.id; }); }); App.render();
      } },
      { label: 'Cancel' },
      { label: 'Save', primary: true, onClick: function () {
        Store.update(function (s) {
          l.subject = subj.value.trim() || 'Other'; l.date = d.value; l.plan = plan.value.trim(); l.notes = notes.value.trim();
          if (isNew) { l.id = Store.uid(); s.lessons.push(l); }
        });
        App.render();
      } }
    ].filter(Boolean));
  }

  Views.register('planner', {
    title: 'Planner', icon: 'calendar',
    render: function (main) {
      var st = Store.get();
      var todayRD = HebCal.isoToRD(Store.todayISO());
      var sunday = todayRD - HebCal.weekday(todayRD) + 7 * weekOffset;
      var parsha = HebCal.parshaForShabbos(sunday + 6);

      main.appendChild(h('div.page-head',
        h('div', h('h1', 'Weekly planner'),
          h('p.muted', parsha.holiday ? parsha.en : 'Parshas ' + parsha.en + ' · ', h('span.he', parsha.holiday ? '' : parsha.he))),
        h('div.row.gap',
          h('button.icon-btn', { 'aria-label': 'Previous week', onclick: function () { weekOffset--; App.render(); } }, UI.icon('chevl')),
          h('button.btn', { onclick: function () { weekOffset = 0; App.render(); } }, 'This week'),
          h('button.icon-btn', { 'aria-label': 'Next week', onclick: function () { weekOffset++; App.render(); } }, UI.icon('chev')))));

      var week = h('div.week');
      var hols = HebCal.holidaysBetween(sunday, sunday + 6);
      for (var i = 0; i < 7; i++) {
        (function (rd) {
          var iso = HebCal.rdToISO(rd);
          var hd = HebCal.fromRD(rd);
          var lessons = st.lessons.filter(function (l) { return l.date === iso; });
          var dayHols = hols.filter(function (x) { return x.rd === rd; });
          var isShabbos = HebCal.weekday(rd) === 6;
          week.appendChild(h('div.card.day' + (rd === todayRD ? '.today' : '') + (isShabbos ? '.shabbos' : ''),
            h('div.day-head',
              h('div', h('strong', UI.fmtDate(iso, { weekday: 'long', month: undefined, day: undefined })), ' ',
                h('span.muted.small', UI.fmtDate(iso, { weekday: undefined }))),
              h('span.he.muted', HebCal.formatHebrew(hd, { noYear: true }))),
            dayHols.map(function (x) { return h('div.pill' + (x.fast ? '.neg' : '.gold'), x.en); }),
            isShabbos ? h('div.muted.small', parsha.holiday ? parsha.en : 'Shabbos Parshas ' + parsha.en) :
              h('div',
                lessons.map(function (l) {
                  return h('div.lesson' + (l.done ? '.done' : ''),
                    h('input', { type: 'checkbox', checked: l.done, 'aria-label': 'Done', onchange: function (e) { Store.update(function () { l.done = e.target.checked; }); App.render(); } }),
                    h('button.link.grow', { onclick: function () { editLesson(l); } },
                      h('strong', l.subject), ' ', h('span', { dir: 'auto' }, l.plan),
                      l.notes ? h('div.small.muted', { dir: 'auto' }, '↳ ' + l.notes) : null));
                }),
                h('button.btn.small.ghost', { onclick: function () { editLesson(null, iso); } }, UI.icon('plus', 16), 'Add'))));
        })(sunday + i);
      }
      main.appendChild(week);

      main.appendChild(h('div.row.gap.wrap',
        h('button.btn', { onclick: function () {
          var prevStart = HebCal.rdToISO(sunday - 7), prevEnd = HebCal.rdToISO(sunday - 1);
          var prev = st.lessons.filter(function (l) { return l.date >= prevStart && l.date <= prevEnd; });
          if (!prev.length) { UI.toast('Nothing planned last week'); return; }
          Store.update(function (s) {
            prev.forEach(function (l) {
              s.lessons.push({ id: Store.uid(), date: UI.addDays(l.date, 7), subject: l.subject, plan: l.plan, notes: '', done: false });
            });
          });
          UI.toast('Copied ' + prev.length + ' items from last week'); App.render();
        } }, UI.icon('copy'), 'Copy last week\'s schedule'),
        h('button.btn', { onclick: function () { window.print(); } }, UI.icon('print'), 'Print week')));
    }
  });
})();
