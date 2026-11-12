(function () {
  'use strict';
  var h = UI.h;
  var openTest = null;

  function editTest(x) {
    var isNew = !x;
    x = x || { title: '', subject: 'Chumash', date: Store.todayISO(), max: 100 };
    var title = UI.input({ value: x.title, placeholder: 'e.g. Parshas Vayeira bechina' });
    var subj = UI.input({ value: x.subject, list: 'subj-list' });
    var date = UI.input({ type: 'date', value: x.date });
    var max = UI.input({ type: 'number', value: x.max, min: 1 });
    var dl = h('datalist#subj-list', ['Chumash', 'Rashi', 'Mishnayos', 'Gemara', 'Navi', 'Dinim', 'Kriah', 'Parsha'].map(function (s) { return h('option', { value: s }); }));
    UI.modal(isNew ? 'New bechina' : 'Edit bechina', h('div', dl, UI.field('Title', title), UI.field('Subject', subj),
      h('div.form-grid', UI.field('Date', date), UI.field('Out of', max))), [
      isNew ? null : { label: 'Delete', danger: true, onClick: function () {
        UI.confirm('Delete this bechina and all its scores?', function () {
          Store.update(function (s) { s.tests = s.tests.filter(function (t) { return t.id !== x.id; }); delete s.scores[x.id]; });
          openTest = null; App.render();
        });
      } },
      { label: 'Cancel' },
      { label: isNew ? 'Create' : 'Save', primary: true, onClick: function () {
        if (!title.value.trim()) { UI.toast('Please give it a title'); return false; }
        Store.update(function (s) {
          x.title = title.value.trim(); x.subject = subj.value.trim(); x.date = date.value; x.max = +max.value || 100;
          if (isNew) { x.id = Store.uid(); s.tests.push(x); s.scores[x.id] = {}; }
        });
        openTest = x.id; App.render();
      } }
    ].filter(Boolean));
  }

  function stats(x) {
    var st = Store.get();
    var vals = Object.keys(st.scores[x.id] || {}).map(function (k) { return st.scores[x.id][k]; })
      .filter(function (v) { return v !== '' && v !== null && !isNaN(v); }).map(Number);
    if (!vals.length) return null;
    var sum = vals.reduce(function (a, b) { return a + b; }, 0);
    return { n: vals.length, avg: sum / vals.length, hi: Math.max.apply(null, vals), lo: Math.min.apply(null, vals) };
  }

  Views.register('bechinos', {
    title: 'Bechinos', icon: 'clipboard',
    render: function (main) {
      var st = Store.get();
      var talmidim = Store.activeTalmidim();
      main.appendChild(h('div.page-head',
        h('div', h('h1', 'Bechinos'), h('p.muted', 'Tests, quizzes and grades.')),
        h('button.btn.primary', { onclick: function () { editTest(); } }, UI.icon('plus'), 'New bechina')));

      var tests = st.tests.slice().sort(function (a, b) { return b.date.localeCompare(a.date); });
      if (!tests.length) { main.appendChild(UI.empty('No bechinos yet.')); return; }

      var x = tests.find(function (t) { return t.id === openTest; });
      if (x) {
        var s = stats(x);
        var scores = st.scores[x.id] = st.scores[x.id] || {};
        main.appendChild(h('div.card',
          h('div.row.between.wrap.gap', { style: 'margin-bottom:12px' },
            h('div', h('button.link', { onclick: function () { openTest = null; App.render(); } }, '← All bechinos'),
              h('h2', x.title), h('p.muted', x.subject + ' · ' + UI.fmtDate(x.date) + ' · out of ' + x.max)),
            h('div.row.gap.wrap',
              h('button.btn.primary', { onclick: function () { window.ClassListScanner.openBechina(x); } }, UI.icon('camera'), 'Scan papers'),
              h('button.btn', { onclick: function () { editTest(x); } }, UI.icon('edit'), 'Edit'),
              h('button.btn', { onclick: function () { window.print(); } }, UI.icon('print'), 'Print'))),
          s ? h('div.stats', stat(Math.round(s.avg * 10) / 10, 'average'), stat(s.hi, 'highest'), stat(s.lo, 'lowest'), stat(s.n + '/' + talmidim.length, 'graded')) : null));
        var table = h('table.grid-table.scores', h('thead', h('tr', h('th', 'Talmid'), h('th', 'Score'), h('th', '%'))),
          h('tbody', talmidim.map(function (t) {
            var v = scores[t.id];
            var pct = h('td.pct', v !== undefined && v !== '' ? Math.round(100 * v / x.max) + '%' : '');
            var inp = UI.input({ type: 'number', inputmode: 'decimal', value: v === undefined ? '' : v, min: 0, max: x.max, 'aria-label': 'Score for ' + Store.displayName(t), class: 'score-input' });
            inp.addEventListener('change', function () {
              Store.update(function (st2) {
                if (inp.value === '') delete st2.scores[x.id][t.id]; else st2.scores[x.id][t.id] = Number(inp.value);
              });
              pct.textContent = inp.value === '' ? '' : Math.round(100 * inp.value / x.max) + '%';
            });
            inp.addEventListener('keydown', function (e) {
              if (e.key === 'Enter') { e.preventDefault(); var all = table.querySelectorAll('.score-input'); var i = Array.prototype.indexOf.call(all, inp); if (all[i + 1]) all[i + 1].focus(); else inp.blur(); }
            });
            return h('tr', h('th', Store.displayName(t)), h('td', inp), pct);
          })));
        main.appendChild(h('div.card', table, h('p.small.muted', 'Tip: press Enter to jump to the next talmid.')));
        return;
      }

      main.appendChild(h('div.list-cards', tests.map(function (t) {
        var s = stats(t);
        return h('button.card.test-card', { onclick: function () { openTest = t.id; App.render(); } },
          h('div.grow', h('div.name', t.title), h('div.small.muted', t.subject + ' · ' + UI.fmtDate(t.date))),
          h('div', s ? h('span.pill', 'avg ' + Math.round(100 * s.avg / t.max) + '%') : h('span.pill.muted', 'not graded')));
      })));

      // Gradebook overview
      if (talmidim.length) {
        var recent = tests.slice(0, 8).reverse();
        main.appendChild(h('div.card.scroll-x',
          h('h2', 'Gradebook'),
          h('table.grid-table',
            h('thead', h('tr', h('th', 'Talmid'), recent.map(function (t) { return h('th', { title: t.title }, t.title.slice(0, 14)); }), h('th', 'Avg %'))),
            h('tbody', talmidim.map(function (tal) {
              var avg = window.averageScore(tal.id);
              return h('tr', h('th', Store.displayName(tal)), recent.map(function (t) {
                var v = (st.scores[t.id] || {})[tal.id];
                return h('td', v === undefined ? '' : String(v));
              }), h('td', h('strong', avg === null ? '' : Math.round(avg) + '%')));
            })))));
      }
    }
  });

  function stat(n, label) { return h('div.stat', h('div.stat-n', String(n)), h('div.stat-l', label)); }
})();
