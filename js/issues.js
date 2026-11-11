/*
 * Issues reported to the office. A rebbi (or any staff profile) files an issue;
 * it is saved in that profile's own data, so it travels in his backup file.
 * The administrator sees every profile's issues on this device as tasks.
 */
(function () {
  'use strict';
  var h = UI.h;
  var PRIORITIES = [['normal', 'Normal'], ['high', 'High – soon'], ['urgent', 'Urgent – today']];
  var STATUSES = [['open', 'Open'], ['progress', 'In progress'], ['done', 'Done']];

  function statusLabel(s) { return (STATUSES.filter(function (x) { return x[0] === s; })[0] || STATUSES[0])[1]; }
  function priorityLabel(s) { return (PRIORITIES.filter(function (x) { return x[0] === s; })[0] || PRIORITIES[0])[1]; }

  // Report an issue from the logged-in profile (rebbi, staff or office).
  function report(talmidId, done) {
    var st = Store.get();
    var who = UI.select(UI.talmidOptions('— Not about one talmid —'), talmidId || '');
    var title = UI.input({ placeholder: 'e.g. Broken chair, boy needs a tutor, parent complaint…' });
    var details = h('textarea', { rows: 4, dir: 'auto', placeholder: 'What happened, what you need, and anything the office should know.' });
    var pri = UI.select(PRIORITIES, 'normal');
    var phone = UI.input({ type: 'tel', value: st.settings.rebbiPhone || '', placeholder: 'Your cell, so the office can call you back' });
    UI.modal('Report to the office', h('div',
      UI.field('What is it?', title), UI.field('About which talmid? (optional)', who), UI.field('Details', details),
      h('div.form-grid', UI.field('How urgent', pri), UI.field('Your cell', phone))), [
      { label: 'Cancel' },
      { label: 'Send to office', primary: true, onClick: function () {
        if (!title.value.trim()) { UI.toast('Say what the issue is'); title.focus(); return false; }
        var t = Store.talmid(who.value);
        Store.update(function (s) {
          if (phone.value.trim()) s.settings.rebbiPhone = phone.value.trim();
          s.issues = s.issues || [];
          s.issues.push({
            id: Store.uid(), date: Store.todayISO(), by: s.settings.rebbiName || 'Rebbi', byPhone: phone.value.trim(),
            className: s.settings.className || '', talmidId: t ? t.id : '', talmidName: t ? Store.displayName(t) : '',
            title: title.value.trim(), details: details.value.trim(), priority: pri.value, status: 'open', assignedTo: '', due: '',
            notes: [], updatedAt: Store.todayISO()
          });
        });
        UI.toast('Sent to the office');
        if (done) done(); else App.render();
      } }
    ]);
  }

  // All issues on this device, newest first, with the profile they belong to and the parents' numbers if about a talmid.
  function all() {
    var out = [];
    Store.profiles().forEach(function (p) {
      var data = Store.peek(p.id);
      (data.issues || []).forEach(function (i) {
        var t = i.talmidId ? (data.talmidim || []).filter(function (x) { return x.id === i.talmidId; })[0] : null;
        out.push({ issue: i, profileId: p.id, profile: p, talmid: t, byPhone: i.byPhone || data.settings.rebbiPhone || '' });
      });
    });
    var rank = { urgent: 0, high: 1, normal: 2 };
    return out.sort(function (a, b) {
      var sa = a.issue.status === 'done' ? 1 : 0, sb = b.issue.status === 'done' ? 1 : 0;
      return sa - sb || rank[a.issue.priority] - rank[b.issue.priority] || b.issue.date.localeCompare(a.issue.date);
    });
  }

  function change(item, fn) {
    Store.updateProfile(item.profileId, function (d) {
      var i = (d.issues || []).filter(function (x) { return x.id === item.issue.id; })[0];
      if (i) { fn(i); i.updatedAt = Store.todayISO(); }
    });
  }

  // Task card for the office.
  function taskCard(item, onChange) {
    var i = item.issue, t = item.talmid;
    var me = Store.get().settings.rebbiName || 'Office';
    var status = UI.select(STATUSES, i.status, { 'aria-label': 'Status' });
    status.addEventListener('change', function () { change(item, function (x) { x.status = status.value; }); UI.toast(statusLabel(status.value)); onChange(); });
    var assigned = UI.input({ value: i.assignedTo || '', placeholder: 'Assigned to…', 'aria-label': 'Assigned to' });
    assigned.addEventListener('change', function () { change(item, function (x) { x.assignedTo = assigned.value.trim(); }); });
    var due = UI.input({ type: 'date', value: i.due || '', 'aria-label': 'Due' });
    due.addEventListener('change', function () { change(item, function (x) { x.due = due.value; }); onChange(); });
    var note = UI.input({ placeholder: 'Add a note…', 'aria-label': 'Add a note' });
    var addNote = function () {
      if (!note.value.trim()) return;
      change(item, function (x) { x.notes = x.notes || []; x.notes.push({ date: Store.todayISO(), by: me, text: note.value.trim() }); });
      note.value = ''; onChange();
    };
    note.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addNote(); } });
    var tel = function (label, name, number) {
      if (!number) return null;
      var n = number.replace(/[^\d+]/g, '');
      return h('span.row.gap.wrap.issue-phone', h('span.small.muted', label + (name ? ' – ' + name : '') + ':'),
        h('a.btn.small', { href: 'tel:' + n }, UI.icon('phone', 14), number), h('a.btn.small', { href: 'sms:' + n }, 'Text'));
    };
    var overdue = i.due && i.status !== 'done' && i.due < Store.todayISO();
    return h('div.card.issue.pri-' + (i.priority || 'normal') + (i.status === 'done' ? '.done' : ''),
      h('div.row.between.gap.wrap',
        h('div.grow', h('div.issue-title', { dir: 'auto' }, i.title),
          h('div.small.muted', 'From ' + i.by + (item.profile.className ? ' (' + item.profile.className + ')' : '') + ' · ' + UI.fmtDate(i.date) +
            (i.talmidName ? ' · about ' + i.talmidName : ''))),
        h('span.pill' + (i.priority === 'urgent' ? '.neg' : i.priority === 'high' ? '.gold' : ''), priorityLabel(i.priority))),
      i.details ? h('p.issue-details', { dir: 'auto' }, i.details) : null,
      h('div.issue-phones',
        tel('Rebbi', i.by, item.byPhone) || h('span.small.muted', 'No cell saved for ' + i.by + '.'),
        t ? [tel('Father', t.father, t.fatherPhone), tel('Mother', t.mother, t.motherPhone),
          !t.fatherPhone && !t.motherPhone ? h('span.small.muted', 'No parent number saved for ' + i.talmidName + '.') : null] : null),
      h('div.issue-controls', UI.field('Status', status), UI.field('Assigned to', assigned), UI.field('Due' + (overdue ? ' – overdue' : ''), due)),
      (i.notes || []).length ? h('ul.list.small', i.notes.map(function (n) { return h('li', h('span.muted', UI.fmtDate(n.date) + ' · ' + n.by + ': '), h('span', { dir: 'auto' }, n.text)); })) : null,
      h('div.row.gap', note, h('button.btn.small', { type: 'button', onclick: addNote }, 'Add note')),
      h('div.row.gap.wrap',
        i.status !== 'done' ? h('button.btn.small.primary', { type: 'button', onclick: function () { change(item, function (x) { x.status = 'done'; }); UI.toast('Marked done'); onChange(); } }, UI.icon('check', 16), 'Mark done') : null,
        h('button.btn.small.danger', { type: 'button', onclick: function () {
          UI.confirm('Delete this issue?', function () { Store.updateProfile(item.profileId, function (d) { d.issues = (d.issues || []).filter(function (x) { return x.id !== i.id; }); }); onChange(); });
        } }, 'Delete')));
  }

  // What a rebbi sees of his own reports.
  function mine() {
    return (Store.get().issues || []).slice().sort(function (a, b) { return b.date.localeCompare(a.date); });
  }

  window.Issues = { report: report, all: all, taskCard: taskCard, mine: mine, statusLabel: statusLabel, priorityLabel: priorityLabel, STATUSES: STATUSES };
})();
