(function () {
  'use strict';
  var h = UI.h;
  var selectedIds = {};
  var tab = 'give';

  function award(ids, delta, reason) {
    var today = Store.todayISO();
    Store.update(function (s) {
      ids.forEach(function (id) { s.points.push({ id: Store.uid(), talmidId: id, date: today, delta: delta, reason: reason }); });
    });
    UI.toast((delta > 0 ? '+' : '') + delta + ' to ' + (ids.length === 1 ? Store.displayName(Store.talmid(ids[0])) : ids.length + ' talmidim'));
  }

  Views.register('middos', {
    title: 'Middos & Points', short: 'Middos', icon: 'star',
    render: function (main) {
      var st = Store.get();
      var talmidim = Store.activeTalmidim();
      var label = st.settings.pointsName;

      main.appendChild(h('div.page-head',
        h('div', h('h1', 'Middos & ' + label.toLowerCase()), h('p.muted', 'Catch them being good! Select talmidim, then tap a reason.')),
        h('div.seg', [['give', 'Give'], ['board', 'Leaderboard'], ['store', 'Prize store'], ['history', 'History']].map(function (m) {
          return h('button' + (tab === m[0] ? '.on' : ''), { onclick: function () { tab = m[0]; App.render(); } }, m[1]);
        }))));

      if (!talmidim.length) { main.appendChild(UI.empty('Add talmidim first.')); return; }

      if (tab === 'give') {
        var ids = function () { return Object.keys(selectedIds).filter(function (k) { return selectedIds[k] && Store.talmid(k); }); };
        var grid = h('div.pick-grid');
        talmidim.forEach(function (t) {
          grid.appendChild(h('button.pick' + (selectedIds[t.id] ? '.on' : ''), {
            'aria-pressed': selectedIds[t.id] ? 'true' : 'false',
            onclick: function () { selectedIds[t.id] = !selectedIds[t.id]; App.render(); }
          }, h('div.avatar', window.talmidInitials(t)), h('div.name', Store.displayName(t, { short: true })), h('div.pts', String(Store.pointsTotal(t.id)))));
        });
        var n = ids().length;
        main.appendChild(h('div.row.gap.wrap',
          h('button.btn', { onclick: function () { talmidim.forEach(function (t) { selectedIds[t.id] = true; }); App.render(); } }, 'Select all'),
          h('button.btn', { onclick: function () { selectedIds = {}; App.render(); } }, 'Clear'),
          h('span.muted', n ? n + ' selected' : 'Nobody selected')));
        main.appendChild(grid);

        var reasons = h('div.reason-grid');
        st.pointReasons.forEach(function (r) {
          reasons.appendChild(h('button.reason' + (r.delta < 0 ? '.neg' : '.pos'), {
            disabled: !n,
            onclick: function () { award(ids(), r.delta, r.label); App.render(); }
          }, h('span.delta', (r.delta > 0 ? '+' : '') + r.delta), h('span', r.label)));
        });
        var custom = UI.input({ placeholder: 'Other reason…' });
        var amt = UI.input({ type: 'number', value: 1, style: 'width:5em', 'aria-label': 'Amount' });
        main.appendChild(h('div.card',
          h('h2', 'Reason'),
          reasons,
          h('div.row.gap.wrap', custom, amt,
            h('button.btn.primary', { disabled: !n, onclick: function () {
              var d = parseInt(amt.value, 10);
              if (!d) return;
              award(ids(), d, custom.value.trim() || 'Points');
              App.render();
            } }, 'Give'),
            h('button.btn', { onclick: editReasons }, 'Edit reasons'))));
      }

      if (tab === 'board') {
        var sorted = talmidim.map(function (t) {
          var week = HebCal.rdToISO(HebCal.isoToRD(Store.todayISO()) - 6);
          return {
            t: t, total: Store.pointsTotal(t.id),
            week: st.points.reduce(function (s, p) { return p.talmidId === t.id && p.date >= week ? s + p.delta : s; }, 0)
          };
        }).sort(function (a, b) { return b.total - a.total; });
        var max = Math.max.apply(null, sorted.map(function (x) { return Math.abs(x.total); }).concat([1]));
        main.appendChild(h('div.card',
          h('table.grid-table.board',
            h('thead', h('tr', h('th', '#'), h('th', 'Talmid'), h('th', ''), h('th', 'This week'), h('th', 'Total'))),
            h('tbody', sorted.map(function (x, i) {
              return h('tr', h('td', String(i + 1)), h('th', Store.displayName(x.t)),
                h('td.bar-cell', h('div.bar', { style: 'width:' + Math.max(0, 100 * x.total / max) + '%' })),
                h('td', String(x.week)), h('td', h('strong', String(x.total))));
            })))),
          h('button.btn', { onclick: function () {
            UI.confirm('Reset everyone\'s ' + label.toLowerCase() + ' to zero? (History is cleared.)', function () {
              Store.update(function (s) { s.points = []; }); App.render();
            }, 'Reset');
          } }, 'Start a new round (reset)'));
      }

      if (tab === 'store') {
        var who = UI.select(UI.talmidOptions('— Choose talmid —'), '');
        var rewardsList = h('div.reward-grid', st.rewards.map(function (r) {
          return h('div.card.reward',
            h('div.reward-name', r.name), h('div.pill.gold', r.cost + ' ' + label.toLowerCase()),
            h('div.row.gap',
              h('button.btn.primary.small', { onclick: function () {
                if (!who.value) { UI.toast('Choose a talmid first'); return; }
                var bal = Store.pointsTotal(who.value);
                if (bal < r.cost) { UI.toast('Not enough yet: has ' + bal); return; }
                award([who.value], -r.cost, 'Prize: ' + r.name);
                App.render();
              } }, 'Redeem'),
              h('button.icon-btn.small', { 'aria-label': 'Remove prize', onclick: function () {
                Store.update(function (s) { s.rewards = s.rewards.filter(function (x) { return x.id !== r.id; }); }); App.render();
              } }, UI.icon('trash', 16))));
        }));
        var nm = UI.input({ placeholder: 'New prize' });
        var cost = UI.input({ type: 'number', placeholder: 'Cost', style: 'width:6em' });
        main.appendChild(h('div.card', UI.field('Redeeming for', who)));
        main.appendChild(rewardsList);
        main.appendChild(h('div.card.row.gap.wrap', nm, cost, h('button.btn', { onclick: function () {
          if (!nm.value.trim() || !(+cost.value > 0)) return;
          Store.update(function (s) { s.rewards.push({ id: Store.uid(), name: nm.value.trim(), cost: +cost.value }); });
          App.render();
        } }, UI.icon('plus'), 'Add prize')));
      }

      if (tab === 'history') {
        var items = st.points.slice().reverse().slice(0, 200);
        main.appendChild(h('div.card', items.length ? h('ul.list', items.map(function (p) {
          return h('li.row.between',
            h('span', h('span.small.muted', UI.fmtDate(p.date)), ' ', h('strong', Store.displayName(Store.talmid(p.talmidId))), ' – ', p.reason),
            h('span.row.gap', h('span.pill' + (p.delta < 0 ? '.neg' : '.pos'), (p.delta > 0 ? '+' : '') + p.delta),
              h('button.icon-btn.small', { 'aria-label': 'Undo', onclick: function () {
                Store.update(function (s) { s.points = s.points.filter(function (x) { return x.id !== p.id; }); }); App.render();
              } }, '×')));
        })) : h('p.muted', 'No history yet.')));
      }
    }
  });

  function editReasons() {
    var st = Store.get();
    var rows = st.pointReasons.map(function (r) { return { label: r.label, delta: r.delta }; });
    var box = h('div');
    function draw() {
      box.innerHTML = '';
      rows.forEach(function (r, i) {
        box.appendChild(h('div.row.gap',
          UI.input({ value: r.label, oninput: function (e) { r.label = e.target.value; } }),
          UI.input({ type: 'number', value: r.delta, style: 'width:5em', oninput: function (e) { r.delta = parseInt(e.target.value, 10) || 0; } }),
          h('button.icon-btn', { 'aria-label': 'Remove', onclick: function () { rows.splice(i, 1); draw(); } }, '×')));
      });
      box.appendChild(h('button.btn.small', { onclick: function () { rows.push({ label: '', delta: 1 }); draw(); } }, UI.icon('plus'), 'Add reason'));
    }
    draw();
    UI.modal('Point reasons', box, [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: function () {
      Store.update(function (s) { s.pointReasons = rows.filter(function (r) { return r.label.trim() && r.delta; }); });
      App.render();
    } }]);
  }
})();
