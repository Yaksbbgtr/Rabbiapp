(function () {
  'use strict';
  var h = UI.h;
  window.MASTERY_LEVELS = ['Not yet', 'Learning', 'Knows it', 'Fluent'];
  var SUBJECTS = ['Chumash', 'Rashi', 'Mishnayos', 'Gemara', 'Navi', 'Dinim', 'Kriah', 'Tefillah', 'Parsha', 'Yahadus', 'Other'];
  var filter = 'All';
  var showArchived = false;

  function editUnit(u) {
    var isNew = !u;
    u = u || { subject: filter !== 'All' ? filter : 'Chumash', title: '', date: Store.todayISO() };
    var subj = UI.select(SUBJECTS, u.subject);
    var dl = h('datalist#parsha-list', HebCal.PARSHIYOS.map(function (p) { return h('option', { value: 'Parshas ' + p[0] }); }));
    var title = UI.input({ value: u.title, placeholder: 'e.g. Parshas Noach – Perek 6, or Brachos 1:1-3', list: 'parsha-list' });
    var date = UI.input({ type: 'date', value: u.date });
    UI.modal(isNew ? 'New limud unit' : 'Edit unit', h('div', dl,
      UI.field('Subject', subj), UI.field('What is being learned', title), UI.field('Started', date)), [
      isNew ? null : { label: 'Delete', danger: true, onClick: function () {
        UI.confirm('Delete this unit and its progress marks?', function () {
          Store.update(function (s) { s.units = s.units.filter(function (x) { return x.id !== u.id; }); delete s.mastery[u.id]; });
          App.render();
        });
      } },
      { label: 'Cancel' },
      { label: isNew ? 'Add' : 'Save', primary: true, onClick: function () {
        if (!title.value.trim()) { UI.toast('Please describe the unit'); return false; }
        Store.update(function (s) {
          u.subject = subj.value; u.title = title.value.trim(); u.date = date.value;
          if (isNew) { u.id = Store.uid(); s.units.push(u); s.mastery[u.id] = {}; }
        });
        App.render();
      } }
    ].filter(Boolean));
  }

  Views.register('limud', {
    title: 'Limud Tracker', short: 'Limud', icon: 'book',
    render: function (main) {
      var st = Store.get();
      var talmidim = Store.activeTalmidim();
      var used = SUBJECTS.filter(function (s) { return st.units.some(function (u) { return u.subject === s; }); });

      main.appendChild(h('div.page-head',
        h('div', h('h1', 'Limud tracker'), h('p.muted', 'Track who knows each perek, mishna or sugya. Tap a box to choose the level.')),
        h('button.btn.primary', { onclick: function () { editUnit(); } }, UI.icon('plus'), 'New unit')));

      main.appendChild(h('div.chips',
        ['All'].concat(used).map(function (s) {
          return h('button.chip' + (filter === s ? '.on' : ''), { onclick: function () { filter = s; App.render(); } }, s);
        }),
        h('label.chip.check', h('input', { type: 'checkbox', checked: showArchived, onchange: function (e) { showArchived = e.target.checked; App.render(); } }), 'Show finished')));

      var units = st.units.filter(function (u) { return (filter === 'All' || u.subject === filter) && (showArchived || !u.archived); });
      if (!units.length || !talmidim.length) {
        main.appendChild(UI.empty(!talmidim.length ? 'Add talmidim first.' : 'No units yet. Create one for what you\'re learning now (e.g. "Parshas Lech Lecha – Perek 12").'));
        return;
      }

      main.appendChild(h('div.legend', window.MASTERY_LEVELS.map(function (l, i) { return h('span.level.l' + i, l); })));

      var table = h('table.grid-table.mastery',
        h('thead', h('tr', h('th', 'Talmid'), units.map(function (u) {
          var m = st.mastery[u.id] || {};
          var known = talmidim.filter(function (t) { return (m[t.id] || 0) >= 2; }).length;
          return h('th.unit-h',
            h('button.link', { onclick: function () { editUnit(u); }, title: 'Edit' },
              h('div.small.muted', u.subject), h('div', { dir: 'auto' }, u.title)),
            h('div.small', known + '/' + talmidim.length + ' know'),
            h('div.unit-actions',
              h('button.btn.tiny', { title: 'Set everyone to "Learning"', onclick: function () {
                Store.update(function (s) { var mm = s.mastery[u.id] = s.mastery[u.id] || {}; talmidim.forEach(function (t) { if (!mm[t.id]) mm[t.id] = 1; }); });
                App.render();
              } }, 'All learning'),
              h('button.btn.tiny', { onclick: function () { Store.update(function () { u.archived = !u.archived; }); App.render(); } }, u.archived ? 'Reopen' : 'Finished')));
        }))),
        h('tbody', talmidim.map(function (t) {
          return h('tr', h('th', h('a', { href: '#/talmid/' + t.id }, Store.displayName(t))), units.map(function (u) {
            return h('td', UI.levelSelect(t.id, u.id, Store.displayName(t) + ', ' + u.title));
          }));
        })));
      main.appendChild(h('div.card.scroll-x', table));

      // Who needs help: talmidim with most "not yet / learning" in open units
      var open = st.units.filter(function (u) { return !u.archived; });
      var needs = talmidim.map(function (t) {
        var weak = open.filter(function (u) { return ((st.mastery[u.id] || {})[t.id] || 0) < 2; });
        return { t: t, weak: weak };
      }).filter(function (x) { return x.weak.length; }).sort(function (a, b) { return b.weak.length - a.weak.length; }).slice(0, 6);
      if (needs.length) {
        main.appendChild(h('div.card',
          h('h2', 'Chazara focus'),
          h('p.muted.small', 'Talmidim who still need help on open units, for a chazara chavrusa or extra time.'),
          h('ul.list', needs.map(function (x) {
            return h('li', h('strong', Store.displayName(x.t)), ': ', x.weak.map(function (u) { return u.title; }).join(', '));
          }))));
      }
    }
  });
})();
