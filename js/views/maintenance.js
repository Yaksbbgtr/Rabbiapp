/*
 * Maintenance profile: a Dashboard and a To-do list, next to Issues.
 * The to-do list lives in the maintenance profile's own data (s.todo), so it syncs like everything else.
 * A to-do can be linked to an issue (added from the issue's card) or typed in by hand.
 */
(function () {
  'use strict';
  var h = UI.h;
  var showDone = false;

  function todos() { return Store.get().todo || []; }
  function issueFor(td) {
    if (!td.issueId) return null;
    return Issues.all().filter(function (x) { return x.issue.id === td.issueId; })[0] || null;
  }
  function onList(issueId) { return todos().some(function (td) { return td.issueId === issueId && !td.done; }); }

  function add(title, item) {
    Store.update(function (s) {
      s.todo = s.todo || [];
      s.todo.push({ id: Store.uid(), title: title, issueId: item ? item.issue.id : '', profileId: item ? item.profileId : '',
        where: item ? [item.issue.by, item.issue.className].filter(Boolean).join(' · ') : '', added: Store.todayISO(), done: false, doneOn: '' });
    });
  }

  // Tick a to-do. If it came from an issue that's still open, offer to mark the issue done for the rebbi too.
  function setDone(td, done) {
    Store.update(function (s) { (s.todo || []).forEach(function (x) { if (x.id === td.id) { x.done = done; x.doneOn = done ? Store.todayISO() : ''; } }); });
    var it = done && issueFor(td);
    if (it && it.issue.status !== 'done') {
      UI.modal('Issue fixed?', h('p', 'Also mark "' + it.issue.title + '" as done, so ' + (it.issue.by || 'the rebbi') + ' sees it\'s fixed?'), [
        { label: 'Not yet' },
        { label: 'Mark issue done', primary: true, onClick: function () {
          Store.updateProfile(it.profileId, function (d) { (d.issues || []).forEach(function (i) { if (i.id === it.issue.id) { i.status = 'done'; i.updatedAt = Store.todayISO(); } }); });
          UI.toast('Issue marked done'); App.render();
        } }
      ]);
    }
    App.render();
  }

  function row(td) {
    var it = issueFor(td);
    var pri = it && it.issue.priority !== 'normal' && it.issue.status !== 'done' ? h('span.pill.neg', Issues.priorityLabel(it.issue.priority).split(' –')[0]) : null;
    return h('li.check-row.todo-row' + (td.done ? '.done' : ''),
      h('input', { type: 'checkbox', checked: td.done, 'aria-label': td.done ? 'Mark not done' : 'Mark done', onchange: function (e) { setDone(td, e.target.checked); } }),
      h('div.grow',
        h('div', { dir: 'auto' }, h('strong', td.title), pri ? ' ' : null, pri),
        h('div.small.muted', [td.where, it ? 'Issue: ' + Issues.statusLabel(it.issue.status) : td.issueId ? 'Issue deleted' : '', td.done && td.doneOn ? 'Done ' + UI.fmtDate(td.doneOn) : 'Added ' + UI.fmtDate(td.added)].filter(Boolean).join(' · '))),
      h('button.icon-btn.lesson-x', { type: 'button', title: 'Remove', 'aria-label': 'Remove', onclick: function () {
        Store.update(function (s) { s.todo = (s.todo || []).filter(function (x) { return x.id !== td.id; }); }); App.render();
      } }, UI.icon('x', 16)));
  }

  function maintOnly(name, def) { def.admin = true; def.adminOnly = true; def.maintOnly = true; Views.register(name, def); }

  // ---------- To-do list ----------
  maintOnly('maint-todo', {
    title: 'To-do list', short: 'To-do', icon: 'clipboard',
    badge: function () { return todos().filter(function (t) { return !t.done; }).length; },
    render: function (main) {
      main.appendChild(h('div.page-head', h('div', h('h1', 'To-do list'), h('p.muted', 'Your own list of jobs. Add issues to it from the Issues page, or type a job here.'))));
      var input = UI.input({ placeholder: 'e.g. Change filters in the boiler room', 'aria-label': 'New job' });
      var addIt = function () { if (!input.value.trim()) { input.focus(); return; } add(input.value.trim()); UI.toast('Added'); App.render(); };
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addIt(); } });
      main.appendChild(h('div.card.row.gap', h('div.grow', input), h('button.btn.primary', { type: 'button', onclick: addIt }, UI.icon('plus'), 'Add')));
      var open = todos().filter(function (t) { return !t.done; }), done = todos().filter(function (t) { return t.done; });
      main.appendChild(h('div.card', h('h2', 'To do (' + open.length + ')'),
        open.length ? h('ul.list', open.map(row)) : h('p.muted', 'Nothing on the list. Open Issues and tap "Add to to-do list" on a job.')));
      if (done.length) {
        main.appendChild(h('div.card',
          h('button.btn.small', { type: 'button', onclick: function () { showDone = !showDone; App.render(); } }, (showDone ? 'Hide' : 'Show') + ' done (' + done.length + ')'),
          showDone ? h('ul.list', { style: 'margin-top:8px' }, done.slice().reverse().map(row)) : null,
          showDone ? h('button.btn.small.danger', { type: 'button', onclick: function () {
            UI.confirm('Clear all ' + done.length + ' done jobs from the list?', function () { Store.update(function (s) { s.todo = (s.todo || []).filter(function (x) { return !x.done; }); }); App.render(); }, 'Clear');
          } }, 'Clear done') : null));
      }
    }
  });

  // ---------- Dashboard ----------
  maintOnly('maint-home', {
    title: 'Dashboard', short: 'Dashboard', icon: 'home',
    render: function (main) {
      var today = Store.todayISO();
      var name = Store.get().settings.rebbiName || Store.currentProfile().name;
      main.appendChild(h('div.page-head', h('div', h('h1', 'Good ' + (new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening') + (name ? ', ' + name.replace(/\s*\(.*\)$/, '') : '')),
        h('p.muted', 'Maintenance – what needs doing.'))));
      var issues = Issues.all().filter(function (x) { return Issues.visibleTo(x.issue, 'maintenance'); });
      var open = issues.filter(function (x) { return x.issue.status !== 'done'; });
      var fresh = issues.filter(function (x) { return Issues.officeUnread(x.issue); });
      var weekAgo = UI.addDays(today, -7);
      var openTodo = todos().filter(function (t) { return !t.done; });
      var doneWeek = todos().filter(function (t) { return t.done && t.doneOn >= weekAgo; }).length
        + issues.filter(function (x) { return x.issue.status === 'done' && (x.issue.updatedAt || '') >= weekAgo && !todos().some(function (t) { return t.issueId === x.issue.id && t.done; }); }).length;
      main.appendChild(h('div.card', h('div.stats',
        stat(open.length, 'open issues', 'admin-issues'), stat(fresh.length, 'new', 'admin-issues'),
        stat(openTodo.length, 'on to-do list', 'maint-todo'), stat(doneWeek, 'done this week'))));

      var grid = h('div.grid');
      main.appendChild(grid);
      grid.appendChild(h('div.card', h('h2', 'To-do list'),
        openTodo.length ? h('ul.list', openTodo.slice(0, 6).map(row)) : h('p.muted', 'Nothing on the list.'),
        openTodo.length > 6 ? h('p.small.muted', '+ ' + (openTodo.length - 6) + ' more') : null,
        h('a.btn', { href: '#/maint-todo' }, 'Open to-do list')));

      var urgent = open.filter(function (x) { return x.issue.priority !== 'normal' || (x.issue.due && x.issue.due <= today); });
      grid.appendChild(h('div.card', h('h2', 'Urgent & due'),
        urgent.length ? h('ul.list', urgent.slice(0, 6).map(issueLi)) : h('p.muted', 'Nothing urgent.'),
        h('a.btn', { href: '#/admin-issues' }, 'All issues')));

      grid.appendChild(h('div.card', h('h2', 'Newest issues'),
        open.length ? h('ul.list', open.slice().sort(function (a, b) { return b.issue.date.localeCompare(a.issue.date); }).slice(0, 5).map(issueLi)) : h('p.muted', 'No open issues.')));

      function issueLi(x) {
        var i = x.issue, due = i.due && i.due <= today;
        return h('li',
          h('div.row.between.gap', h('strong', { dir: 'auto' }, i.title), onList(i.id) ? h('span.pill', 'On list') : h('button.btn.small', { type: 'button', onclick: function () { add(i.title, x); UI.toast('Added to to-do list'); App.render(); } }, UI.icon('plus', 14), 'To-do')),
          h('div.small' + (due ? '.overdue' : '.muted'), [i.by, i.className, Issues.priorityLabel(i.priority), i.due ? 'Due ' + UI.fmtDate(i.due) : 'Sent ' + UI.fmtDate(i.date)].filter(Boolean).join(' · ')));
      }
    }
  });

  function stat(n, label, page) {
    return h(page ? 'a.stat' : 'div.stat', page ? { href: '#/' + page, style: 'text-decoration:none' } : {}, h('div.stat-n', String(n)), h('div.stat-l', label));
  }

  // The "Add to to-do list" button on an issue card (maintenance only).
  function cardButton(item) {
    var on = onList(item.issue.id);
    return h('button.btn.small' + (on ? '' : '.primary'), { type: 'button', disabled: on, onclick: function () { add(item.issue.title, item); UI.toast('Added to to-do list'); App.render(); } },
      UI.icon(on ? 'check' : 'plus', 16), on ? 'On to-do list' : 'Add to to-do list');
  }

  window.Maintenance = { cardButton: cardButton, onList: onList };
})();
