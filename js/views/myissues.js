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
      var got = Issues.received().filter(function (x) { var i = x.issue; return filter === 'all' || (filter === 'done' ? i.status === 'done' : i.status !== 'done'); });
      var shown = all.filter(function (i) { return filter === 'all' || (filter === 'done' ? i.status === 'done' : i.status !== 'done'); });
      main.appendChild(h('div.page-head',
        h('div', h('h1', 'Issues'), h('p.muted', 'What you\'ve sent to the office, the principal, maintenance or other rebbeim, and what other rebbeim sent you.')),
        h('button.btn.primary', { type: 'button', onclick: function () { Issues.report(''); } }, UI.icon('send'), 'Report an issue')));
      main.appendChild(h('div.seg', { style: 'margin-bottom:14px' }, [['open', 'Open'], ['done', 'Done'], ['all', 'All']].map(function (f) {
        return h('button' + (filter === f[0] ? '.on' : ''), { type: 'button', onclick: function () { filter = f[0]; App.render(); } }, f[1]);
      })));
      if (got.length) {
        main.appendChild(h('h2.section-title', 'Sent to you'));
        main.appendChild(h('div.list-cards', got.map(function (x) {
          var i = x.issue, n = Issues.receivedUnread(i);
          var last = (i.notes || []).filter(function (m) { return !Issues.isOffice(i, m); }).slice(-1)[0];
          return h('a.card.unit-card.issue-row.pri-' + (i.priority || 'normal') + (n ? '.unread' : ''), { href: '#/issue/' + i.id },
            h('div.grow',
              h('div.small.muted', 'From ' + (i.by || 'a rebbi') + (i.className ? ' (' + i.className + ')' : '') + ' · ' + UI.fmtDate(i.date) + (i.talmidName ? ' · about ' + i.talmidName : '')),
              h('div.name', { dir: 'auto' }, i.title),
              h('div.small' + (n ? '.reply-new' : '.muted'), (n ? 'New: ' : '') + (last ? last.text : i.details || '').slice(0, 90))),
            h('div.issue-side', statusPill(i), n ? h('span.nav-badge', String(n)) : null),
            UI.icon('chev', 18));
        })));
        main.appendChild(h('h2.section-title', 'Sent by you'));
      }
      if (!shown.length) {
        main.appendChild(UI.empty(all.length ? 'Nothing here.' : 'You haven\'t sent anything yet. Something broken, a concern about a talmid, anything the office, maintenance or another rebbi should know? Tap "Report an issue".'));
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
            last ? h('div.small' + (unread ? '.reply-new' : '.muted'), (unread ? 'New reply from ' + (last.by || 'Office') + ': ' : (last.by || 'Office') + ': ') + last.text.slice(0, 90) + (last.text.length > 90 ? '…' : ''))
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
      if (!i) { var got = Issues.received().filter(function (x) { return x.issue.id === params[0]; })[0]; if (got) { receivedView(main, got); return; } }
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
          h('dt', 'Sent to'), h('dd', Issues.toLabel(i)),
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
          i.notes.push({ id: Store.uid(), at: new Date().toISOString(), date: Store.todayISO(), by: s.settings.rebbiName || i.by, text: v, office: false, from: Store.currentProfile().id });
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
                  i.notes.push({ id: Store.uid(), at: new Date().toISOString(), date: Store.todayISO(), by: s.settings.rebbiName || i.by, text: text, office: false });
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
  // An issue another rebbi sent to this rebbi: read it and reply. Replies are saved in the sender's issue.
  function receivedView(main, item) {
    var i = item.issue, me = Store.currentProfile(), myName = Store.get().settings.rebbiName || me.name;
    if (Issues.receivedUnread(i)) { Issues.markReceivedSeen(item); setTimeout(App.render, 0); }
    var mine = function (n) { return n.from ? n.from === me.id : Issues.isOffice(i, n) && n.by === myName; };
    main.appendChild(h('a.back', { href: '#/issues' }, UI.icon('chevl', 16), 'All issues'));
    main.appendChild(h('div.page-head',
      h('div', h('h1', { dir: 'auto' }, i.title),
        h('p.muted', 'From ' + (i.by || 'a rebbi') + (i.className ? ' (' + i.className + ')' : '') + ' · ' + UI.fmtDate(i.date, { year: 'numeric' }) + (i.talmidName ? ' · about ' + i.talmidName : ''))),
      statusPill(i)));
    var phone = (item.byPhone || '').replace(/[^\d+]/g, '');
    main.appendChild(h('div.card',
      h('dl.kv',
        h('dt', 'Sent to'), h('dd', Issues.toLabel(i)),
        h('dt', 'Urgency'), h('dd', Issues.priorityLabel(i.priority)),
        item.byPhone ? [h('dt', (i.by || 'Rebbi') + '\'s cell'), h('dd', h('a', { href: 'tel:' + phone }, item.byPhone))] : null),
      i.details ? h('p.issue-details', { dir: 'auto' }, i.details) : null));
    var input = h('textarea', { rows: 2, dir: 'auto', placeholder: 'Reply to ' + (i.by || 'the rebbi') + '…', 'aria-label': 'Reply' });
    var post = function (text) {
      var note = { id: Store.uid(), at: new Date().toISOString(), date: Store.todayISO(), by: myName, text: text, office: true, from: me.id };
      if (item.shared) { Sync.replyShared(i.id, note); return; }
      Store.updateProfile(item.profileId, function (d) {
        (d.issues || []).forEach(function (x) {
          if (x.id !== i.id) return;
          x.notes = x.notes || [];
          x.notes.push(note);
          x.updatedAt = Store.todayISO();
        });
      });
    };
    var send = function () { var v = input.value.trim(); if (!v) return; post(v); UI.toast('Reply sent'); App.render(); };
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    var notes = [{ date: i.date, by: i.by, text: i.details || i.title, first: true }].concat(i.notes || []);
    main.appendChild(h('div.card', h('h2', 'Conversation'),
      h('div.thread', notes.map(function (n) {
        var isMe = !n.first && mine(n);
        var when = n.first ? null : findMeeting(n.text, n.date);
        return h('div.msg' + (isMe ? '.from-me' : '.from-office'),
          h('div.small.muted', (isMe ? 'You' : n.by || 'Rebbi') + ' · ' + UI.fmtDate(n.date)),
          h('div', { dir: 'auto' }, n.text),
          when && HebCal.noMelacha(HebCal.isoToRD(when.date)) ? h('div.shabbos-warn.msg-flag', '⚠ ' + UI.fmtDate(when.date) + ' is ' + HebCal.noMelacha(HebCal.isoToRD(when.date))) : null,
          when ? h('button.btn.small.msg-plan', { type: 'button', onclick: function () {
            Planner.add({ date: when.date, subject: 'Meeting', plan: (when.time ? when.time + ' – ' : '') + 'Meeting with ' + (isMe ? i.by : n.by || i.by) + ' re: ' + i.title + '\n"' + n.text + '"' });
          } }, UI.icon('calendar', 14), 'Add to planner') : null,
          when ? h('button.btn.small.msg-plan', { type: 'button', onclick: function () {
            Issues.changeDay(when, i.title, i.by, function (text) { post(text); App.render(); });
          } }, UI.icon('edit', 14), 'Change day') : null);
      })),
      input,
      h('div.row.gap', { style: 'margin-top:8px' }, h('button.btn.primary', { type: 'button', onclick: send }, UI.icon('send', 16), 'Send reply'))));
  }
})();
