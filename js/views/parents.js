(function () {
  'use strict';
  var h = UI.h;
  var tab = 'log';
  var METHODS = ['Phone call', 'Text', 'Email', 'Note home', 'In person', 'PTA', 'In touch'];

  // Every number saved for a talmid's family, labelled.
  function parentPhones(t) {
    if (!t) return [];
    var list = [];
    var add = function (who, name, number) { if (number && String(number).trim()) list.push({ who: who, name: name || '', number: String(number).trim() }); };
    add('Father', t.father, t.fatherPhone);
    add('Mother', t.mother, t.motherPhone);
    return list;
  }
  function telHref(kind, number, body) {
    var n = number.replace(/[^\d+*#]/g, '');
    return kind === 'text' ? 'sms:' + n + (body ? '?&body=' + encodeURIComponent(body) : '') : 'tel:' + n;
  }
  // Pick which parent to reach (asks only when there is more than one number), then call cb(entry).
  function pickNumber(t, kind, cb) {
    var nums = parentPhones(t);
    if (!nums.length) {
      UI.modal('No phone number', h('p', 'There is no phone number saved for ' + Store.displayName(t) + '\'s family yet.'), [
        { label: 'Close' }, { label: 'Add one', primary: true, onClick: function () { window.editTalmid(t); } }]);
      return;
    }
    if (nums.length === 1) { cb(nums[0]); return; }
    var m = UI.modal((kind === 'text' ? 'Text' : 'Call') + ' whom?', h('div.pick-parent', nums.map(function (n) {
      return h('button.btn.big.pick-parent-btn', { type: 'button', onclick: function () { m.close(); cb(n); } },
        UI.icon(kind === 'text' ? 'copy' : 'phone', 18),
        h('span', h('strong', n.who + (n.name ? ' – ' + n.name : '')), h('span.small.muted', ' ' + n.number)));
    })), [{ label: 'Cancel' }]);
  }
  // Open the phone's dialer or Messages, then offer to log it.
  function contactParent(t, kind, body) {
    pickNumber(t, kind, function (n) {
      location.href = telHref(kind, n.number, body);
      setTimeout(function () {
        logContact(t.id, null, { method: kind === 'text' ? 'Text' : 'Phone call', note: (kind === 'text' ? 'Texted ' : 'Called ') + n.who.toLowerCase() + (n.name ? ' (' + n.name + ')' : '') + ': ' });
      }, 600);
    });
  }
  // When the family was last contacted, and a one-tap reset that marks today.
  function lastContact(t) {
    var list = Store.get().contacts.filter(function (c) { return c.talmidId === t.id; }).sort(function (a, b) { return b.date.localeCompare(a.date); });
    return list[0] || null;
  }
  function daysSince(iso) { return HebCal.isoToRD(Store.todayISO()) - HebCal.isoToRD(iso); }
  function lastContactBlock(t) {
    var st = Store.get();
    var limit = parseInt(st.settings.contactReminderDays, 10) || 30;
    var last = lastContact(t);
    var days = last ? daysSince(last.date) : null;
    var over = last ? days >= limit : true;
    var text = !last ? 'No contact logged yet'
      : 'Last in touch ' + UI.fmtDate(last.date) + ' · ' + last.method + ' · ' + (days === 0 ? 'today' : days === 1 ? 'yesterday' : days + ' days ago');
    return h('div.last-contact' + (over ? '.over' : ''),
      h('div', h('span.pill' + (over ? '.neg' : '.pos'), over ? (last ? 'Due' : 'Never') : 'OK'), ' ', h('span.small', text)),
      h('button.btn.small', { type: 'button', title: 'Mark that you were in touch today', onclick: function () {
        Store.update(function (s) { s.contacts.push({ id: Store.uid(), talmidId: t.id, date: Store.todayISO(), method: 'In touch', note: 'In touch with parents (reset)', followUp: '', followUpDone: false }); });
        UI.toast('Marked in touch today'); App.render();
      } }, 'Reset – in touch today'));
  }
  window.lastContactBlock = lastContactBlock;

  function bestNumber(t) { var n = parentPhones(t)[0]; return n ? n.number : ''; }
  window.parentPhones = parentPhones; window.contactParent = contactParent; window.bestNumber = bestNumber;

  function logContact(talmidId, c, preset) {
    var isNew = !c;
    c = c || Object.assign({ talmidId: talmidId || '', date: Store.todayISO(), method: 'Phone call', note: '', followUp: '' }, preset || {});
    var who = UI.select(UI.talmidOptions('— Choose talmid —'), c.talmidId);
    var date = UI.input({ type: 'date', value: c.date });
    var method = UI.select(METHODS, c.method);
    var note = h('textarea', { rows: 4, dir: 'auto', placeholder: 'What was discussed?' }, c.note);
    var fu = UI.input({ type: 'date', value: c.followUp });
    UI.modal(isNew ? 'Log parent call' : 'Edit contact', h('div',
      UI.field('Talmid', who), h('div.form-grid', UI.field('Date', date), UI.field('How', method)),
      UI.field('Notes', note), UI.field('Follow up on', fu, 'Optional – shows on your Today page')), [
      isNew ? null : { label: 'Delete', danger: true, onClick: function () {
        Store.update(function (s) { s.contacts = s.contacts.filter(function (x) { return x.id !== c.id; }); }); App.render();
      } },
      { label: 'Cancel' },
      { label: 'Save', primary: true, onClick: function () {
        if (!who.value) { UI.toast('Choose a talmid'); return false; }
        Store.update(function (s) {
          c.talmidId = who.value; c.date = date.value; c.method = method.value; c.note = note.value.trim(); c.followUp = fu.value;
          if (isNew) { c.id = Store.uid(); s.contacts.push(c); }
        });
        UI.toast('Saved'); App.render();
      } }
    ].filter(Boolean));
  }
  window.logContact = logContact;

  // Everything the app knows that can make a message personal.
  function messageValues(t, detail) {
    var st = Store.get();
    var today = Store.todayISO();
    var p = HebCal.parshaOfWeek(HebCal.isoToRD(today));
    var vals = {
      name: t ? (t.first || t.hebName) : 'your son',
      parent: t ? (t.last && (t.father || t.mother) ? 'Mr. and Mrs. ' + t.last : 'Parents') : 'Parents',
      rebbi: st.settings.rebbiName || 'Rebbi',
      class: st.settings.className || 'our class',
      parsha: p.en,
      date: UI.fmtDate(today, { weekday: 'long', month: 'long', day: 'numeric' }),
      hebdate: UI.hebDate(today),
      detail: detail || '',
      strengths: '', working_on: '', bechina: '', score: '', absences: ''
    };
    if (!t) return vals;
    var open = st.units.filter(function (u) { return !u.archived; }).sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
    var lvl = function (u) { return (st.mastery[u.id] || {})[t.id] || 0; };
    var title = function (u) { return u.title; };
    vals.strengths = MessageTemplates.joinList(open.filter(function (u) { return lvl(u) >= 2; }).slice(0, 3).map(title));
    vals.working_on = MessageTemplates.joinList(open.filter(function (u) { return lvl(u) < 2; }).slice(0, 2).map(title));
    var graded = st.tests.filter(function (x) { var v = (st.scores[x.id] || {})[t.id]; return v !== undefined && v !== '' && v !== null; })
      .sort(function (a, b) { return b.date.localeCompare(a.date); })[0];
    if (graded) {
      var sc = st.scores[graded.id][t.id];
      vals.bechina = graded.title;
      vals.score = sc + ' out of ' + graded.max + ' (' + Math.round(100 * sc / graded.max) + '%)';
    }
    var a = window.attendanceSummary(t.id, UI.addDays(today, -30), today);
    if (a.absent >= 2) vals.absences = String(a.absent);
    return vals;
  }

  Views.register('parents', {
    title: 'Parents', icon: 'phone',
    render: function (main) {
      var st = Store.get();
      main.appendChild(h('div.page-head',
        h('div', h('h1', 'Parent communication')),
        h('div.row.gap.wrap',
          h('div.seg', [['log', 'Contact log'], ['compose', 'Write a message'], ['directory', 'Directory']].map(function (m) {
            return h('button' + (tab === m[0] ? '.on' : ''), { onclick: function () { tab = m[0]; App.render(); } }, m[1]);
          })),
          h('button.btn.primary', { onclick: function () { logContact(); } }, UI.icon('plus'), 'Log parent call'))));

      if (tab === 'log') {
        var items = st.contacts.slice().sort(function (a, b) { return b.date.localeCompare(a.date); });
        if (!items.length) { main.appendChild(UI.empty('No contacts logged yet. Keeping a record of every call and note home makes PTA and report time much easier.')); }
        else main.appendChild(h('div.card', h('ul.list', items.map(function (c) {
          return h('li.contact',
            h('div.row.between',
              h('div', h('strong', Store.displayName(Store.talmid(c.talmidId))), h('span.muted.small', ' · ' + UI.fmtDate(c.date) + ' · ' + c.method)),
              h('button.icon-btn.small', { 'aria-label': 'Edit', onclick: function () { logContact(null, c); } }, UI.icon('edit', 16))),
            h('div', { dir: 'auto' }, c.note),
            c.followUp ? h('label.small' + (c.followUpDone ? '.muted' : c.followUp < Store.todayISO() ? '.overdue' : ''),
              h('input', { type: 'checkbox', checked: c.followUpDone, onchange: function (e) { Store.update(function () { c.followUpDone = e.target.checked; }); App.render(); } }),
              ' Follow up ' + UI.fmtDate(c.followUp)) : null);
        }))));
        // Talmidim whose family hasn't been contacted in a while
        var days = parseInt(st.settings.contactReminderDays, 10) || 30;
        var cutoff = UI.addDays(Store.todayISO(), -days);
        var quiet = Store.activeTalmidim().filter(function (t) {
          return !st.contacts.some(function (c) { return c.talmidId === t.id && c.date >= cutoff; });
        });
        var daysSel = UI.select([[7, '1 week'], [14, '2 weeks'], [21, '3 weeks'], [30, '1 month'], [45, '6 weeks'], [60, '2 months'], [90, '3 months']], days, { 'aria-label': 'Remind me after' });
        daysSel.addEventListener('change', function () { Store.update(function (x) { x.settings.contactReminderDays = +daysSel.value; }); App.render(); });
        if (Store.activeTalmidim().length) {
          main.appendChild(h('div.card',
            h('div.row.between.wrap', h('h2', 'Haven\'t been in touch in ' + days + ' days'),
              h('label.row.gap.small.muted', 'Remind me after ', daysSel)),
            quiet.length ? h('p.muted.small', 'A quick positive call goes a long way. Call or text opens your phone, then logs it.') : h('p.muted', 'You\'ve been in touch with every family. Nice!'),
            quiet.length ? h('ul.list', quiet.map(function (t) {
              var nums = parentPhones(t);
              return h('li.row.between.gap.wrap',
                h('span', h('strong', Store.displayName(t)), nums.length ? h('span.small.muted', ' · ' + nums.map(function (n) { return n.who; }).join(' / ')) : h('span.small.muted', ' · no number')),
                h('span.row.gap',
                  h('button.btn.small.primary', { type: 'button', onclick: function () { contactParent(t, 'call'); } }, UI.icon('phone', 16), 'Call'),
                  h('button.btn.small', { type: 'button', onclick: function () { contactParent(t, 'text'); } }, 'Text'),
                  h('button.btn.small', { type: 'button', onclick: function () { logContact(t.id); } }, 'Log')));
            })) : null));
        }
      }

      if (tab === 'compose') {
        var tplSel = UI.select(st.templates.map(function (t) { return [t.id, t.name]; }), st.templates[0] && st.templates[0].id);
        var who = UI.select(UI.talmidOptions('— Whole class (no name) —'), '');
        var detail = h('textarea', { rows: 3, dir: 'auto' });
        var detailLabel = h('span.field-label');
        var facts = h('p.small.muted');
        var out = h('textarea.letter', { rows: 12, dir: 'auto', 'aria-label': 'Message' });
        var grow = function () { out.style.height = 'auto'; out.style.height = (out.scrollHeight + 4) + 'px'; };
        var draw = function () {
          var tpl = st.templates.find(function (t) { return t.id === tplSel.value; });
          var t = Store.talmid(who.value);
          detailLabel.textContent = (tpl && tpl.ask) || 'Anything specific to add? (optional)';
          detail.placeholder = (tpl && tpl.eg) || '';
          var vals = messageValues(t, detail.value);
          out.value = tpl ? MessageTemplates.fill(tpl.body, vals) : '';
          var used = [];
          if (tpl && t) {
            if (vals.strengths && /\{strengths\}/.test(tpl.body)) used.push('what he knows well');
            if (vals.working_on && /\{working_on\}/.test(tpl.body)) used.push('what he is still learning');
            if (vals.bechina && /\{bechina\}/.test(tpl.body)) used.push('his last bechina');
            if (vals.absences && /\{absences\}/.test(tpl.body)) used.push('his absences');
          }
          facts.textContent = !t ? 'Choose a talmid and the message will include his own limud levels, bechinos and attendance.'
            : used.length ? 'Added from ' + t.first + '\'s records: ' + used.join(', ') + '. You can edit the message before sending.'
            : 'You can edit the message before sending.';
          grow();
        };
        [tplSel, who, detail].forEach(function (el) { el.addEventListener('input', draw); el.addEventListener('change', draw); });
        out.addEventListener('input', grow);
        setTimeout(draw, 0);
        var actions = h('div.row.gap.wrap',
          h('button.btn.primary', { onclick: function () { UI.copyText(out.value); } }, UI.icon('copy'), 'Copy'),
          h('button.btn', { onclick: function () {
            var t = Store.talmid(who.value);
            location.href = 'mailto:' + (t && t.email ? t.email : '') + '?body=' + encodeURIComponent(out.value);
          } }, 'Open in email'),
          h('button.btn', { onclick: function () {
            var t = Store.talmid(who.value);
            if (!t) { location.href = 'sms:?&body=' + encodeURIComponent(out.value); return; }
            pickNumber(t, 'text', function (n) { location.href = telHref('text', n.number, out.value); });
          } }, 'Open in messages'),
          h('button.btn', { onclick: function () {
            if (!who.value) { UI.toast('Choose a talmid to log it'); return; }
            Store.update(function (s) { s.contacts.push({ id: Store.uid(), talmidId: who.value, date: Store.todayISO(), method: 'Note home', note: (tplSel.selectedOptions[0] ? tplSel.selectedOptions[0].text + ': ' : '') + (detail.value.trim() || out.value.slice(0, 200)) }); });
            UI.toast('Logged');
          } }, 'Log as sent'));
        main.appendChild(h('div.grid.two',
          h('div.card', UI.field('What kind of message?', tplSel), UI.field('About which talmid?', who),
            h('label.field', detailLabel, detail),
            h('button.btn', { onclick: editTemplates }, 'Edit templates')),
          h('div.card', h('h2', 'Message'), out, facts, actions)));
      }

      if (tab === 'directory') {
        var talmidim = Store.activeTalmidim();
        main.appendChild(h('div.card.scroll-x',
          h('table.grid-table',
            h('thead', h('tr', ['Talmid', 'Father', 'Mother', 'Phone', 'Email'].map(function (x) { return h('th', x); }))),
            h('tbody', talmidim.map(function (t) {
              return h('tr', h('th', h('a', { href: '#/talmid/' + t.id }, Store.displayName(t))), h('td', t.father || ''), h('td', t.mother || ''),
                h('td', parentPhones(t).map(function (n, i) { return [i ? h('br') : null, h('span.small.muted', n.who + ' '), h('a', { href: telHref('call', n.number) }, n.number)]; })), h('td', t.email ? h('a', { href: 'mailto:' + t.email }, t.email) : ''));
            }))),
          h('div.row.gap',
            h('button.btn', { onclick: function () { window.print(); } }, UI.icon('print'), 'Print'),
            h('button.btn', { onclick: function () {
              var emails = talmidim.map(function (t) { return t.email; }).filter(Boolean);
              if (!emails.length) { UI.toast('No emails saved yet'); return; }
              UI.copyText(emails.join(', '));
            } }, 'Copy all emails'))));
      }
    }
  });

  function editTemplates() {
    var st = Store.get();
    var rows = st.templates.map(function (t) { return { id: t.id, name: t.name, ask: t.ask || '', eg: t.eg || '', body: t.body }; });
    var box = h('div');
    function draw() {
      box.innerHTML = '';
      box.appendChild(h('p.small.muted', 'Words in {curly brackets} are filled in automatically: {name} {parent} {rebbi} {class} {parsha} {date} {hebdate}, ' +
        '{detail} (what you type), {strengths} and {working_on} (from the Limud page), {bechina} and {score} (his last bechina), {absences}. ' +
        'Put [[double brackets]] around a sentence to leave it out when there is nothing to fill in.'));
      rows.forEach(function (r, i) {
        box.appendChild(h('div.card.tight',
          h('div.row.gap', UI.input({ value: r.name, oninput: function (e) { r.name = e.target.value; } }),
            h('button.icon-btn', { 'aria-label': 'Remove template', onclick: function () { rows.splice(i, 1); draw(); } }, UI.icon('trash', 16))),
          UI.field('Question to ask the rebbi', UI.input({ value: r.ask, placeholder: 'e.g. What did he do well?', oninput: function (e) { r.ask = e.target.value; } })),
          h('textarea', { rows: 8, dir: 'auto', 'aria-label': 'Message text', oninput: function (e) { r.body = e.target.value; } }, r.body)));
      });
      box.appendChild(h('button.btn.small', { onclick: function () { rows.push({ id: Store.uid(), name: 'New template', ask: '', eg: '', body: 'Dear {parent},\n\n[[{detail}]]\n\n{rebbi}' }); draw(); } }, UI.icon('plus'), 'Add template'));
    }
    draw();
    UI.modal('Message templates', box, [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: function () {
      Store.update(function (s) { s.templates = rows.filter(function (r) { return r.name.trim(); }); }); App.render();
    } }]);
  }
})();
