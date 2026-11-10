(function () {
  'use strict';
  var h = UI.h;
  var range = { from: '', to: '' };

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
        h('div', h('h1', only ? 'Report card' : 'Report cards'), h('p.muted', 'Type each talmid\'s comment right on his report card. Print or save as PDF from the print dialog.')),
        h('div.row.gap', only ? h('a.btn', { href: '#/reports' }, 'Whole class') : null,
          h('button.btn.primary', { onclick: function () { window.print(); } }, UI.icon('print'), 'Print'))));
      main.appendChild(h('div.card.row.gap.wrap.no-print', UI.field('From', from), UI.field('To', to),
        h('button.btn', { onclick: function () { range = { from: '', to: '' }; App.render(); } }, 'All time')));

      if (!talmidim.length) { main.appendChild(UI.empty('Add talmidim first.')); return; }

      onCommentChange = null;
      if (!only) {
        var warn = h('div.card.warn.no-print');
        var drawMissing = function () {
          var missing = talmidim.filter(function (t) { return !Store.get().comments[t.id]; });
          warn.innerHTML = '';
          warn.style.display = missing.length ? '' : 'none';
          warn.appendChild(document.createTextNode('Still need a comment (' + missing.length + '): '));
          missing.forEach(function (t, i) {
            if (i) warn.appendChild(document.createTextNode(', '));
            warn.appendChild(h('button.link.jump', { type: 'button', onclick: function () {
              var card = document.getElementById('rc-' + t.id);
              if (!card) return;
              var ta = card.querySelector('textarea');
              ta.scrollIntoView({ block: 'center', behavior: 'smooth' });
              ta.focus({ preventScroll: true });
            } }, Store.displayName(t)));
          });
        };
        drawMissing();
        onCommentChange = drawMissing;
        main.appendChild(warn);
      }
      (only ? [only] : talmidim).forEach(function (t) { main.appendChild(reportCard(t)); });
    }
  });
})();
