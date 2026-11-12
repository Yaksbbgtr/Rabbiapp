/* A rebbi's (or staff member's) own issues sent to the office, with the office's responses. */
(function () {
  'use strict';
  var h = UI.h;

  var findMeeting = Issues.findMeeting;
  var filter = 'open';

  function statusPill(i) {
    return h('span.pill' + (i.status === 'done' ? '.pos' : i.status === 'progress' ? '.gold' : ''), Issues.statusLabel(i.status));
  }

  Views.register('issues', {
    title: 'Issues', icon: 'flag', badge: function () { return Issues.unreadCount(); },
    render: function (main) {
      var all = Issues.mine();
      var shown = all.filter(function (i) { return filter === 'all' || (filter === 'done' ? i.status === 'done' : i.status !== 'done'); });
      main.appendChild(h('div.page-head',
        h('div', h('h1', 'Issues'), h('p.muted', 'What you\'ve sent to the office, and their replies.')),
        h('button.btn.primary', { type: 'button', onclick: function () { Issues.report(''); } }, UI.icon('send'), 'Report to the office')));
      main.appendChild(h('div.seg', { style: 'margin-bottom:14px' }, [['open', 'Open'], ['done', 'Done'], ['all', 'All']].map(function (f) {
        return h('button' + (filter === f[0] ? '.on' : ''), { type: 'button', onclick: function () { filter = f[0]; App.render(); } }, f[1]);
      })));
      if (!shown.length) {
        main.appendChild(UI.empty(all.length ? 'Nothing here.' : 'You haven\'t sent anything to the office yet. Something broken, a concern about a talmid, anything the office should handle? Tap "Report to the office".'));
        return;
      }
      main.appendChild(h('div.list-cards', shown.map(function (i) {
        var replies = (i.notes || []).filter(function (n) { return Issues.isOffice(i, n); });
        var last = replies[replies.length - 1];
        var unread = Issues.unread(i);
        return h('a.card.unit-card.issue-row.pri-' + (i.priority || 'normal') + (unread ? '.unread' : ''), { href: '#/issue/' + i.id },
          h('div.grow',
            h('div.small.muted', UI.fmtDate(i.date) + (i.talmidName ? ' · about ' + i.talmidName : '') + (i.priority && i.priority !== 'normal' ? ' · ' + Issues.priorityLabel(i.priority) : '')),
            h('div.name', { dir: 'auto' }, i.title),
            last ? h('div.small' + (unread ? '.reply-new' : '.muted'), (unread ? 'New reply: ' : 'Office: ') + last.text.slice(0, 90) + (last.text.length > 90 ? '…' : ''))
              : h('div.small.muted', 'No reply yet')),
          h('div.issue-side', statusPill(i), unread ? h('span.nav-badge', String(unread)) : null),
          UI.icon('chev', 18));
      })));
    }
  });

  Views.register('issue', {
    title: 'Issue', hidden: true, matches: 'issues',
    render: function (main, params) {
      var st = Store.get();
      var i = (st.issues || []).filter(function (x) { return x.id === params[0]; })[0];
      if (!i) { main.appendChild(UI.empty('This issue was not found.', h('a.btn', { href: '#/issues' }, 'All issues'))); return; }
      // Opening it marks the office's replies as read.
      var officeCount = (i.notes || []).filter(function (n) { return Issues.isOffice(i, n); }).length;
      if ((i.seenOffice || 0) < officeCount) { Store.update(function () { i.seenOffice = officeCount; }); setTimeout(App.render, 0); } // refresh the menu count

      main.appendChild(h('a.back', { href: '#/issues' }, UI.icon('chevl', 16), 'All issues'));
      var t = i.talmidId ? Store.talmid(i.talmidId) : null;
      if (t) main.appendChild(h('a.card.issue-student.plain-link', { href: '#/talmid/' + t.id, style: 'display:block' },
        h('div.issue-student-name', Store.displayName(t)), t.hebName ? h('div.he.small.muted', t.hebName) : null,
        t.allergies && t.allergies.trim() ? h('div.allergy-banner.small', h('strong', '⚠ Allergy: '), t.allergies) : null));
      main.appendChild(h('div.page-head',
        h('div', h('h1', { dir: 'auto' }, i.title),
          h('p.muted', 'Sent ' + UI.fmtDate(i.date, { year: 'numeric' }) + (i.talmidName && !t ? ' · about ' + i.talmidName : ''))),
        statusPill(i)));

      main.appendChild(h('div.card',
        h('dl.kv',
          h('dt', 'Status'), h('dd', Issues.statusLabel(i.status)),
          h('dt', 'Sent to'), h('dd', Issues.toLabel(i.to)),
          h('dt', 'Urgency'), h('dd', Issues.priorityLabel(i.priority)),
          i.assignedTo ? [h('dt', 'Handled by'), h('dd', i.assignedTo)] : null,
          i.due ? [h('dt', 'Expected by'), h('dd', UI.fmtDate(i.due))] : null),
        i.details ? h('p.issue-details', { dir: 'auto' }, i.details) : null));

      var notes = i.notes || [];
      var input = h('textarea', { rows: 2, dir: 'auto', placeholder: 'Reply to the office…', 'aria-label': 'Reply' });
      function send() {
        var v = input.value.trim(); if (!v) return;
        Store.update(function (s) {
          i.notes = i.notes || [];
          i.notes.push({ date: Store.todayISO(), by: s.settings.rebbiName || i.by, text: v, office: false });
          i.updatedAt = Store.todayISO();
          if (i.status === 'done') i.status = 'open'; // a new message reopens it
        });
        UI.toast('Reply sent'); App.render();
      }
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
      main.appendChild(h('div.card',
        h('h2', 'Responses'),
        notes.length ? h('div.thread', notes.map(function (n) {
          var office = Issues.isOffice(i, n);
          var when = findMeeting(n.text, n.date);
          return h('div.msg' + (office ? '.from-office' : '.from-me'),
            h('div.small.muted', (office ? n.by || 'Office' : 'You') + ' · ' + UI.fmtDate(n.date)),
            h('div', { dir: 'auto' }, n.text),
            when && HebCal.noMelacha(HebCal.isoToRD(when.date)) ? h('div.shabbos-warn.msg-flag', '⚠ ' + UI.fmtDate(when.date) + ' is ' + HebCal.noMelacha(HebCal.isoToRD(when.date))) : null,
            when ? h('button.btn.small.msg-plan', { type: 'button', onclick: function () {
              Planner.add({ date: when.date, subject: 'Meeting',
                plan: (when.time ? when.time + ' – ' : '') + 'Meeting' + (office ? ' with ' + (n.by || 'Office') : '') + ' re: ' + i.title + '\n"' + n.text + '"' });
            } }, UI.icon('calendar', 14), 'Add to planner') : null,
            when ? h('button.btn.small.msg-plan', { type: 'button', onclick: function () {
              Issues.changeDay(when, i.title, office ? (n.by || 'Office') : '', function (text) {
                Store.update(function (s) {
                  i.notes = i.notes || [];
                  i.notes.push({ date: Store.todayISO(), by: s.settings.rebbiName || i.by, text: text, office: false });
                  i.updatedAt = Store.todayISO();
                  if (i.status === 'done') i.status = 'open';
                });
                App.render();
              });
            } }, UI.icon('edit', 14), 'Change day') : null);
        })) : h('p.muted', 'The office hasn\'t responded yet. Their reply will show up here.'),
        input,
        h('div.row.gap', { style: 'margin-top:8px' }, h('button.btn.primary', { type: 'button', onclick: send }, UI.icon('send', 16), 'Send reply')),
        h('p.small.muted', 'On a shared device the office sees replies right away; otherwise they arrive with your backup file.')));
    }
  });
})();
