(function () {
  'use strict';
  var h = UI.h;
  var range = { from: '', to: '' };

  function reportCard(t) {
    var st = Store.get();
    var a = window.attendanceSummary(t.id, range.from, range.to);
    var inRange = function (d) { return (!range.from || d >= range.from) && (!range.to || d <= range.to); };
    var tests = st.tests.filter(function (x) { return inRange(x.date) && st.scores[x.id] && st.scores[x.id][t.id] !== undefined; });
    var pts = st.points.filter(function (p) { return p.talmidId === t.id && inRange(p.date) && p.delta > 0; })
      .reduce(function (s, p) { return s + p.delta; }, 0);
    var units = st.units.filter(function (u) { return inRange(u.date || ''); });
    // Group test scores by subject
    var bySubject = {};
    tests.forEach(function (x) {
      var k = x.subject || 'General';
      (bySubject[k] = bySubject[k] || []).push(100 * st.scores[x.id][t.id] / (x.max || 100));
    });

    return h('article.report-card',
      h('header.rc-head',
        h('div', h('div.rc-school', st.settings.school || ''), h('div.rc-title', 'Progress Report'),
          h('div.muted', (st.settings.className || '') + (range.from || range.to ? ' · ' + (range.from ? UI.fmtDate(range.from, { weekday: undefined, year: 'numeric' }) : '…') + ' – ' + (range.to ? UI.fmtDate(range.to, { weekday: undefined, year: 'numeric' }) : 'today') : ''))),
        h('div.rc-name', h('div', (t.first || '') + ' ' + (t.last || '')), t.hebName ? h('div.he', t.hebName) : null)),
      h('section',
        h('h3', 'Limudim'),
        Object.keys(bySubject).length ? h('table.rc-table',
          h('thead', h('tr', h('th', 'Subject'), h('th', 'Bechinos'), h('th', 'Average'))),
          h('tbody', Object.keys(bySubject).map(function (k) {
            var arr = bySubject[k];
            var avg = arr.reduce(function (x, y) { return x + y; }, 0) / arr.length;
            return h('tr', h('td', k), h('td', String(arr.length)), h('td', h('strong', Math.round(avg) + '% ' + letter(avg))));
          }))) : h('p.muted', 'No bechinos in this period.')),
      units.length ? h('section',
        h('h3', 'Mastery'),
        h('table.rc-table', h('tbody', units.map(function (u) {
          var lvl = (st.mastery[u.id] || {})[t.id] || 0;
          return h('tr', h('td', u.subject), h('td', { dir: 'auto' }, u.title), h('td', window.MASTERY_LEVELS[lvl]));
        })))) : null,
      h('section.rc-row',
        h('div', h('h3', 'Attendance'),
          h('p', a.days ? Math.round(100 * a.present / a.days) + '% present · ' + a.absent + ' absent · ' + a.late + ' late' : 'No attendance recorded.')),
        h('div', h('h3', 'Middos'), h('p', pts + ' ' + st.settings.pointsName.toLowerCase() + ' earned'))),
      h('section', h('h3', 'Rebbi\'s comments'), h('div.rc-comment', { dir: 'auto' }, st.comments[t.id] || ' ')),
      h('footer.rc-sign', h('div', h('div.sig-line'), h('div.small', st.settings.rebbiName || 'Rebbi')), h('div', h('div.sig-line'), h('div.small', 'Parent signature'))));
  }

  function letter(p) {
    if (p >= 97) return '(A+)'; if (p >= 93) return '(A)'; if (p >= 90) return '(A-)';
    if (p >= 87) return '(B+)'; if (p >= 83) return '(B)'; if (p >= 80) return '(B-)';
    if (p >= 77) return '(C+)'; if (p >= 73) return '(C)'; if (p >= 70) return '(C-)';
    return '(D)';
  }

  Views.register('reports', {
    title: 'Report cards', short: 'Reports', icon: 'file',
    render: function (main, params) {
      var talmidim = Store.activeTalmidim();
      var only = params[0] ? Store.talmid(params[0]) : null;
      var from = UI.input({ type: 'date', value: range.from, onchange: function (e) { range.from = e.target.value; App.render(); } });
      var to = UI.input({ type: 'date', value: range.to, onchange: function (e) { range.to = e.target.value; App.render(); } });
      main.appendChild(h('div.page-head.no-print',
        h('div', h('h1', only ? 'Report card' : 'Report cards'), h('p.muted', 'Write comments on each talmid\'s page. Print or save as PDF from the print dialog.')),
        h('div.row.gap', only ? h('a.btn', { href: '#/reports' }, 'Whole class') : null,
          h('button.btn.primary', { onclick: function () { window.print(); } }, UI.icon('print'), 'Print'))));
      main.appendChild(h('div.card.row.gap.wrap.no-print', UI.field('From', from), UI.field('To', to),
        h('button.btn', { onclick: function () { range = { from: '', to: '' }; App.render(); } }, 'All time')));

      if (!talmidim.length) { main.appendChild(UI.empty('Add talmidim first.')); return; }

      if (!only) {
        var missing = talmidim.filter(function (t) { return !Store.get().comments[t.id]; });
        if (missing.length) main.appendChild(h('div.card.warn.no-print', 'Missing comments: ',
          missing.map(function (t, i) { return [i ? ', ' : '', h('a', { href: '#/talmid/' + t.id }, Store.displayName(t))]; })));
      }
      (only ? [only] : talmidim).forEach(function (t) { main.appendChild(reportCard(t)); });
    }
  });
})();
