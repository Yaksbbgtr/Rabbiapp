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

  // Office edits an issue: change any of its details and optionally send the rebbi an update.
  function edit(item, onChange) {
    var i = item.issue;
    var me = Store.get().settings.rebbiName || 'Office';
    var title = UI.input({ value: i.title || '' });
    var details = h('textarea', { rows: 4, dir: 'auto' }, i.details || '');
    var pri = UI.select(PRIORITIES, i.priority || 'normal');
    var status = UI.select(STATUSES, i.status || 'open');
    var assigned = UI.input({ value: i.assignedTo || '', placeholder: 'Assigned to…' });
    var due = UI.input({ type: 'date', value: i.due || '' });
    var msg = h('textarea', { rows: 2, dir: 'auto', placeholder: 'Optional – the rebbi will see this as an update.' });
    UI.modal('Update issue', h('div',
      UI.field('What is it?', title), UI.field('Details', details),
      h('div.form-grid', UI.field('How urgent', pri), UI.field('Status', status)),
      h('div.form-grid', UI.field('Assigned to', assigned), UI.field('Due', due)),
      UI.field('Update for the rebbi', msg)), [
      { label: 'Cancel' },
      { label: 'Save', primary: true, onClick: function () {
        if (!title.value.trim()) { UI.toast('Say what the issue is'); title.focus(); return false; }
        change(item, function (x) {
          x.title = title.value.trim(); x.details = details.value.trim(); x.priority = pri.value; x.status = status.value;
          x.assignedTo = assigned.value.trim(); x.due = due.value;
          if (msg.value.trim()) { x.notes = x.notes || []; x.notes.push({ date: Store.todayISO(), by: me, text: msg.value.trim(), office: true }); }
        });
        UI.toast('Issue updated');
        onChange();
      } }
    ]);
  }

  // Finds a meeting date (and time, if given) in a message, e.g. "11:00 am 14 november", "Nov 14 at 3pm",
  // "11/14", "tomorrow", "Thursday". Dates without a year are the next one on or after the message's date.
  var MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  var MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
  var DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function findMeeting(text, baseISO) {
    var t = (text || '').toLowerCase(), m, date = null;
    var base = new Date(+baseISO.slice(0, 4), +baseISO.slice(5, 7) - 1, +baseISO.slice(8, 10));
    var onOrAfter = function (mon, day, year) {
      if (mon < 0 || mon > 11 || day < 1 || day > 31) return null;
      var d = new Date(year || base.getFullYear(), mon, day);
      if (d.getMonth() !== mon) return null;
      if (!year && d < base) d.setFullYear(d.getFullYear() + 1);
      return iso(d);
    };
    var mi = function (s) { return MONTHS.indexOf(s.slice(0, 3)); };
    if ((m = t.match(new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?' + MONTH_RE + '(?:\\s*,?\\s*(\\d{4}))?\\b')))) date = onOrAfter(mi(m[2]), +m[1], m[3] && +m[3]);
    else if ((m = t.match(new RegExp('\\b' + MONTH_RE + '\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:\\s*,?\\s*(\\d{4}))?')))) date = onOrAfter(mi(m[1]), +m[2], m[3] && +m[3]);
    else if ((m = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))) date = onOrAfter(+m[1] - 1, +m[2], m[3] && (m[3].length === 2 ? 2000 + +m[3] : +m[3]));
    else if (/\btomorrow\b/.test(t)) { var tm = new Date(base); tm.setDate(tm.getDate() + 1); date = iso(tm); }
    else if (/\btoday\b|\btonight\b/.test(t)) date = baseISO;
    else if ((m = t.match(new RegExp('\\b(' + DAYS.join('|') + ')\\b')))) {
      var wd = new Date(base); wd.setDate(wd.getDate() + (DAYS.indexOf(m[1]) - base.getDay() + 7) % 7); date = iso(wd);
    }
    if (!date) return null;
    // Times like 3pm, 3:00 pm, 11:00, and the typo 3;00. The hour can't follow another digit or separator.
    var tt = t.match(/(?:^|[^\d:;.])(\d{1,2})(?:[:;.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)(?![a-z])/) || t.match(/(?:^|[^\d:;.\/])(\d{1,2})[:;](\d{2})\b/);
    var time = tt ? +tt[1] + ':' + (tt[2] || '00') + (tt[3] ? ' ' + tt[3].replace(/\./g, '') : '') : '';
    return { date: date, time: time };
  }

  // "3:00 pm" -> "15:00" for a time box (no am/pm: 1–6 is taken as afternoon).
  function to24(t) {
    var m = (t || '').match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/);
    if (!m) return '';
    var hr = +m[1] % 12;
    if (m[3] === 'pm' || (!m[3] && hr >= 1 && hr <= 6)) hr += 12;
    return String(hr).padStart(2, '0') + ':' + m[2];
  }
  // "15:00" -> "3:00 pm"
  function to12(v) {
    if (!v) return '';
    var hr = +v.slice(0, 2);
    return (hr % 12 || 12) + ':' + v.slice(3, 5) + (hr < 12 ? ' am' : ' pm');
  }

  // Move a meeting found in a message to another day (and time), and send the change back as a reply.
  // post(text) saves the reply on the right side; withWho names the other party for the planner entry.
  function changeDay(when, issueTitle, withWho, post) {
    var startRD = HebCal.isoToRD(when.date);
    while (HebCal.noMelacha(startRD)) startRD++; // suggest the next day melacha is allowed
    var d = UI.input({ type: 'date', value: HebCal.rdToISO(startRD) });
    var tm = UI.input({ type: 'time', value: to24(when.time) });
    var note = h('textarea', { rows: 2, dir: 'auto', placeholder: 'Optional – add a note with the change.' });
    var plan = h('input', { type: 'checkbox', checked: true });
    var warn = h('div.shabbos-warn', { role: 'alert' });
    var saveBtn = null;
    var check = function () {
      var day = d.value ? HebCal.noMelacha(HebCal.isoToRD(d.value)) : '';
      warn.textContent = '⚠ This date is ' + day + '. Pick another day.';
      warn.hidden = !day; d.classList.toggle('invalid', !!day);
      if (saveBtn) { saveBtn.disabled = !!day || !d.value; saveBtn.title = day ? 'Can\'t meet on ' + day : ''; }
      return !day && !!d.value;
    };
    d.addEventListener('input', check); d.addEventListener('change', check);
    var dlg = UI.modal('Change the day', h('div',
      h('p.small.muted', 'Was: ' + UI.fmtDate(when.date) + (when.time ? ' at ' + when.time : '')),
      h('div.form-grid', UI.field('New day', d), UI.field('Time (optional)', tm)), warn,
      UI.field('Note', note),
      h('label.row.gap', plan, 'Also add the new day to my planner')), [
      { label: 'Cancel' },
      { label: 'Send change', primary: true, onClick: function () {
        if (!check()) return false;
        var whenText = UI.fmtDate(d.value) + (tm.value ? ' at ' + to12(tm.value) : '');
        post('Meeting changed to ' + whenText + '.' + (note.value.trim() ? '\n' + note.value.trim() : ''));
        if (plan.checked) {
          Store.update(function (s) {
            s.lessons = s.lessons || [];
            s.lessons.push({ id: Store.uid(), date: d.value, subject: 'Meeting', done: false, notes: '',
              plan: (tm.value ? to12(tm.value) + ' – ' : '') + 'Meeting' + (withWho ? ' with ' + withWho : '') + ' re: ' + issueTitle });
          });
        }
        UI.toast('Change sent' + (plan.checked ? ' and added to planner' : ''));
      } }
    ]);
    saveBtn = dlg.el.querySelector('.modal-actions .btn.primary');
    check();
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
      change(item, function (x) { x.notes = x.notes || []; x.notes.push({ date: Store.todayISO(), by: me, text: note.value.trim(), office: true }); });
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
    var student = t ? h('div.issue-student',
      h('div.row.between.gap.wrap',
        h('div', h('div.issue-student-name', (t.first || '') + ' ' + (t.last || '')),
          h('div.small.muted', [t.hebName ? h('span.he', t.hebName) : null, t.hebName ? ' · ' : '', item.profile.className || '', ' · ', item.profile.name].filter(Boolean))),
        h('span.small.muted', 'Talmid')),
      t.allergies && t.allergies.trim() ? h('div.allergy-banner.small', h('strong', '⚠ Allergy: '), t.allergies) : null,
      h('div.issue-phones',
        tel('Father', t.father, t.fatherPhone), tel('Mother', t.mother, t.motherPhone),
        !t.fatherPhone && !t.motherPhone ? h('span.small.muted', 'No parent number saved.') : null)) : null;
    return h('div.card.issue.pri-' + (i.priority || 'normal') + (i.status === 'done' ? '.done' : ''),
      student,
      h('div.row.between.gap.wrap',
        h('div.grow', h('div.issue-title', { dir: 'auto' }, i.title),
          h('div.small.muted', 'From ' + i.by + (item.profile.className ? ' (' + item.profile.className + ')' : '') + ' · ' + UI.fmtDate(i.date))),
        h('span.pill' + (i.priority === 'urgent' ? '.neg' : i.priority === 'high' ? '.gold' : ''), priorityLabel(i.priority))),
      i.details ? h('p.issue-details', { dir: 'auto' }, i.details) : null,
      h('div.issue-phones', tel('Rebbi', i.by, item.byPhone) || h('span.small.muted', 'No cell saved for ' + i.by + '.')),
      h('div.issue-controls', UI.field('Status', status), UI.field('Assigned to', assigned), UI.field('Due' + (overdue ? ' – overdue' : ''), due)),
      (i.notes || []).length ? h('ul.list.small', i.notes.map(function (n) {
        var when = findMeeting(n.text, n.date), bad = when && HebCal.noMelacha(HebCal.isoToRD(when.date));
        return h('li', h('span.muted', UI.fmtDate(n.date) + ' · ' + n.by + (isOffice(i, n) ? '' : ' (rebbi)') + ': '), h('span', { dir: 'auto' }, n.text),
          bad ? h('span.pill.neg', '⚠ ' + UI.fmtDate(when.date) + ' is ' + bad) : null,
          when ? h('button.link.small', { type: 'button', onclick: function () {
            changeDay(when, i.title, isOffice(i, n) ? '' : i.by, function (text) {
              change(item, function (x) { x.notes = x.notes || []; x.notes.push({ date: Store.todayISO(), by: me, text: text, office: true }); });
              onChange();
            });
          } }, 'Change day') : null);
      })) : null,
      h('div.row.gap.issue-note-row', note, h('button.btn.small', { type: 'button', onclick: addNote }, 'Add note')),
      h('div.row.gap.wrap.issue-actions',
        h('button.btn.small', { type: 'button', onclick: function () { edit(item, onChange); } }, UI.icon('edit', 16), 'Update issue'),
        i.status !== 'done' ? h('button.btn.small.primary', { type: 'button', onclick: function () { change(item, function (x) { x.status = 'done'; }); UI.toast('Marked done'); onChange(); } }, UI.icon('check', 16), 'Mark done') : null,
        h('button.btn.small.danger', { type: 'button', onclick: function () {
          UI.confirm('Delete this issue?', function () { Store.updateProfile(item.profileId, function (d) { d.issues = (d.issues || []).filter(function (x) { return x.id !== i.id; }); }); onChange(); });
        } }, 'Delete')));
  }

  // A note written by the office (as opposed to the rebbi's own reply).
  function isOffice(i, n) { return n.office !== undefined ? !!n.office : n.by !== i.by; }
  // Office responses the rebbi hasn't opened yet.
  function unread(i) { var office = (i.notes || []).filter(function (n) { return isOffice(i, n); }).length; return Math.max(0, office - (i.seenOffice || 0)); }
  // For the office: the report itself plus each rebbi reply count as messages; unseen ones light the indicator.
  function rebbiMessages(i) { return 1 + (i.notes || []).filter(function (n) { return !isOffice(i, n); }).length; }
  function officeUnread(i) { return rebbiMessages(i) > (i.officeSeen || 0); }
  function officeUnreadCount() { return all().filter(function (x) { return officeUnread(x.issue); }).length; }
  function markOfficeSeen(item) { change(item, function (x) { x.officeSeen = rebbiMessages(x); }); }
  function unreadCount() { return (Store.get().issues || []).reduce(function (n, i) { return n + (unread(i) ? 1 : 0); }, 0); }

  // What a rebbi sees of his own reports.
  function mine() {
    return (Store.get().issues || []).slice().sort(function (a, b) { return b.date.localeCompare(a.date); });
  }

  window.Issues = { report: report, all: all, taskCard: taskCard, mine: mine, statusLabel: statusLabel, priorityLabel: priorityLabel, STATUSES: STATUSES, isOffice: isOffice, unread: unread, unreadCount: unreadCount, officeUnread: officeUnread, officeUnreadCount: officeUnreadCount, markOfficeSeen: markOfficeSeen, findMeeting: findMeeting, changeDay: changeDay };
})();
