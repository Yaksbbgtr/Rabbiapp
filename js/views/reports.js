(function () {
  'use strict';
  var h = UI.h;
  var range = { from: '', to: '' };
  var rangeOpen = false;

  function reportCard(t) {
    var st = Store.get();
    var a = window.attendanceSummary(t.id, range.from, range.to);
    var inRange = function (d) { return (!range.from || d >= range.from) && (!range.to || d <= range.to); };
    var tests = st.tests.filter(function (x) { return inRange(x.date) && st.scores[x.id] && st.scores[x.id][t.id] !== undefined; });
    var units = st.units.filter(function (u) { return inRange(u.date || ''); });
    // Group test scores by subject
    var bySubject = {};
    tests.forEach(function (x) {
      var k = x.subject || 'General';
      (bySubject[k] = bySubject[k] || []).push(100 * st.scores[x.id][t.id] / (x.max || 100));
    });

    return h('article.report-card', { id: 'rc-' + t.id },
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
      h('section', h('h3', 'Attendance'),
        h('p', a.days ? Math.round(100 * a.present / a.days) + '% present · ' + a.absent + ' absent · ' + a.late + ' late' : 'No attendance recorded.')),
      commentSection(t),
      h('footer.rc-sign', h('div', h('div.sig-line'), h('div.small', st.settings.rebbiName || 'Rebbi')), h('div', h('div.sig-line'), h('div.small', 'Parent signature'))));
  }

  // Comment box: type right on the report card. Saved as you type; prints as plain text.
  var onCommentChange = null;
  function commentSection(t) {
    var st = Store.get();
    var printed = h('div.rc-comment.print-only', { dir: 'auto' }, st.comments[t.id] || '\u00a0');
    var saved = h('span.rc-saved.no-print', { 'aria-live': 'polite' });
    var ta = h('textarea.rc-comment-edit.no-print', {
      dir: 'auto', rows: 3, placeholder: 'Tap here to write a comment for ' + (t.first || Store.displayName(t)) + '…',
      'aria-label': 'Comment for ' + Store.displayName(t)
    }, st.comments[t.id] || '');
    function grow() { ta.style.height = 'auto'; ta.style.height = (ta.scrollHeight + 2) + 'px'; }
    var timer;
    ta.addEventListener('input', function () {
      grow();
      printed.textContent = ta.value || '\u00a0';
      Store.update(function (s) { if (ta.value.trim()) s.comments[t.id] = ta.value; else delete s.comments[t.id]; });
      saved.textContent = 'Saved ✓';
      clearTimeout(timer); timer = setTimeout(function () { saved.textContent = ''; }, 1500);
      if (onCommentChange) onCommentChange();
    });
    setTimeout(grow, 0);
    return h('section', h('h3', 'Rebbi\'s comments ', saved), ta, printed);
  }

  window.buildReportCard = reportCard;

  function letter(p) {
    if (p >= 97) return '(A+)'; if (p >= 93) return '(A)'; if (p >= 90) return '(A-)';
    if (p >= 87) return '(B+)'; if (p >= 83) return '(B)'; if (p >= 80) return '(B-)';
    if (p >= 77) return '(C+)'; if (p >= 73) return '(C)'; if (p >= 70) return '(C-)';
    return '(D)';
  }

  Views.register('reports', {
    title: 'Report cards', short: 'Reports', icon: 'file',
    render: function (main, params) {
      var st = Store.get();
      var talmidim = Store.activeTalmidim();
      var only = params[0] ? Store.talmid(params[0]) : null;
      onCommentChange = null;

      var from = UI.input({ type: 'date', value: range.from, onchange: function (e) { range.from = e.target.value; App.render(); } });
      var to = UI.input({ type: 'date', value: range.to, onchange: function (e) { range.to = e.target.value; App.render(); } });
      var fmt = function (d) { return UI.fmtDate(d, { weekday: undefined, year: 'numeric' }); };
      var rangeText = !range.from && !range.to ? 'the whole year so far'
        : (range.from ? fmt(range.from) : 'the start') + ' to ' + (range.to ? fmt(range.to) : 'today');
      var rangeCard = h('details.card.no-print.rc-range', { open: rangeOpen ? true : null },
        h('summary', 'Reports cover: ', h('strong', rangeText), h('span.muted.small', ' (change)')),
        h('div.form-grid', UI.field('From', from), UI.field('To', to)),
        h('button.btn.small', { onclick: function () { range = { from: '', to: '' }; App.render(); } }, 'Whole year'));
      rangeCard.addEventListener('toggle', function () { rangeOpen = rangeCard.open; });

      // ----- one talmid's report card -----
      if (only) {
        var idx = talmidim.findIndex(function (t) { return t.id === only.id; });
        var prev = talmidim[idx - 1], next = talmidim[idx + 1];
        main.appendChild(h('a.back.no-print', { href: '#/reports' }, UI.icon('chevl', 16), 'Class list'));
        main.appendChild(h('div.page-head.no-print',
          h('div', h('h1', Store.displayName(only)), h('p.muted', 'Tap the comments box to write. It saves as you type.')),
          h('div.row.gap.wrap',
            h('button.btn.primary', { onclick: function () { window.SendReports.open([only]); } }, UI.icon('send'), 'Send to office'),
            h('button.btn', { onclick: function () { window.print(); } }, UI.icon('print'), 'Print this card'))));
        main.appendChild(reportCard(only));
        main.appendChild(h('div.rc-nav.no-print',
          prev ? h('a.btn', { href: '#/reports/' + prev.id }, UI.icon('chevl', 16), Store.displayName(prev)) : h('span'),
          next ? h('a.btn', { href: '#/reports/' + next.id }, Store.displayName(next), UI.icon('chev', 16)) : h('span')));
        main.appendChild(rangeCard);
        return;
      }

      // ----- class list -----
      var done = talmidim.filter(function (t) { return st.comments[t.id]; }).length;
      main.appendChild(h('div.page-head.no-print',
        h('div', h('h1', 'Report cards'), h('p.muted', 'Tap a talmid to open his report card and write his comment.')),
        talmidim.length ? h('div.row.gap.wrap',
          h('button.btn.primary', { onclick: function () { window.SendReports.open(talmidim); } }, UI.icon('send'), 'Send reports to office'),
          h('button.btn', { onclick: function () { window.print(); } }, UI.icon('print'), 'Print all')) : null));

      if (!talmidim.length) { main.appendChild(UI.empty('Add talmidim first.')); return; }

      main.appendChild(rangeCard);
      main.appendChild(h('p.small.muted.no-print', done + ' of ' + talmidim.length + ' comments written'));
      main.appendChild(h('div.card.rc-list.no-print', talmidim.map(function (t) {
        var avg = window.averageScore(t.id);
        var has = !!st.comments[t.id];
        return h('a.rc-list-row', { href: '#/reports/' + t.id },
          h('div.avatar', window.talmidInitials(t)),
          h('div.grow',
            h('div.name', Store.displayName(t)),
            h('div.small.muted', avg === null ? 'No bechinos yet' : 'Average ' + Math.round(avg) + '%')),
          h('span.pill' + (has ? '.pos' : '.gold'), has ? 'Comment ✓' : 'Needs comment'),
          UI.icon('chev', 18));
      })));

      // All the cards, shown only on paper when "Print all" is pressed.
      main.appendChild(h('div.print-only', talmidim.map(reportCard)));
    }
  });
})();
