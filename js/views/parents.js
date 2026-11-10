(function () {
  'use strict';
  var h = UI.h;
  var tab = 'log';
  var METHODS = ['Phone call', 'Text', 'Email', 'Note home', 'In person', 'PTA'];

  function logContact(talmidId, c) {
    var isNew = !c;
    c = c || { talmidId: talmidId || '', date: Store.todayISO(), method: 'Phone call', note: '', followUp: '' };
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

  function fillTemplate(body, t, extra) {
    var st = Store.get();
    var p = HebCal.parshaOfWeek(HebCal.isoToRD(Store.todayISO()));
    var vals = Object.assign({
      name: t ? (t.first || t.hebName) : '[name]',
      parent: t ? (t.father || t.mother ? 'Mr. and Mrs. ' + (t.last || '') : 'Parents') : '[parent]',
      rebbi: st.settings.rebbiName || 'Rebbi',
      class: st.settings.className || '',
      parsha: p.holiday ? p.en : p.en,
      date: UI.fmtDate(Store.todayISO(), { weekday: 'long', month: 'long', day: 'numeric' }),
      hebdate: UI.hebDate(Store.todayISO()),
      highlight: '[what he did]'
    }, extra || {});
    return body.replace(/\{(\w+)\}/g, function (m, k) { return vals[k] !== undefined ? vals[k] : m; });
  }

  Views.register('parents', {
    title: 'Parents', icon: 'phone',
    render: function (main) {
      var st = Store.get();
      main.appendChild(h('div.page-head',
        h('div', h('h1', 'Parent communication')),
        h('div.row.gap',
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
        // Talmidim not contacted in 30 days
        var cutoff = UI.addDays(Store.todayISO(), -30);
        var quiet = Store.activeTalmidim().filter(function (t) {
          return !st.contacts.some(function (c) { return c.talmidId === t.id && c.date >= cutoff; });
        });
        if (quiet.length && Store.activeTalmidim().length) {
          main.appendChild(h('div.card', h('h2', 'Haven\'t heard from you in 30 days'),
            h('p.muted.small', 'A quick positive call goes a long way.'),
            h('div.chips', quiet.map(function (t) {
              return h('button.chip', { onclick: function () { logContact(t.id); } }, Store.displayName(t));
            }))));
        }
      }

      if (tab === 'compose') {
        var tplSel = UI.select(st.templates.map(function (t) { return [t.id, t.name]; }), st.templates[0] && st.templates[0].id);
        var who = UI.select(UI.talmidOptions('— Generic (no name) —'), '');
        var highlight = UI.input({ placeholder: 'e.g. knew the whole perek by heart' });
        var out = h('textarea.letter', { rows: 12, dir: 'auto' });
        var draw = function () {
          var tpl = st.templates.find(function (t) { return t.id === tplSel.value; });
          var t = Store.talmid(who.value);
          out.value = tpl ? fillTemplate(tpl.body, t, highlight.value.trim() ? { highlight: highlight.value.trim() } : null) : '';
        };
        [tplSel, who, highlight].forEach(function (el) { el.addEventListener('input', draw); el.addEventListener('change', draw); });
        draw();
        var actions = h('div.row.gap.wrap',
          h('button.btn.primary', { onclick: function () { UI.copyText(out.value); } }, UI.icon('copy'), 'Copy'),
          h('button.btn', { onclick: function () {
            var t = Store.talmid(who.value);
            location.href = 'mailto:' + (t && t.email ? t.email : '') + '?body=' + encodeURIComponent(out.value);
          } }, 'Open in email'),
          h('button.btn', { onclick: function () {
            var t = Store.talmid(who.value);
            location.href = 'sms:' + (t && t.phone ? t.phone.replace(/[^\d+]/g, '') : '') + '?&body=' + encodeURIComponent(out.value);
          } }, 'Open in messages'),
          h('button.btn', { onclick: function () {
            if (!who.value) { UI.toast('Choose a talmid to log it'); return; }
            Store.update(function (s) { s.contacts.push({ id: Store.uid(), talmidId: who.value, date: Store.todayISO(), method: 'Note home', note: out.value.slice(0, 300) }); });
            UI.toast('Logged');
          } }, 'Log as sent'));
        main.appendChild(h('div.grid.two',
          h('div.card', UI.field('Template', tplSel), UI.field('Talmid', who), UI.field('Highlight (for {highlight})', highlight),
            h('button.btn', { onclick: editTemplates }, 'Edit templates')),
          h('div.card', UI.field('Message', out), actions)));
      }

      if (tab === 'directory') {
        var talmidim = Store.activeTalmidim();
        main.appendChild(h('div.card.scroll-x',
          h('table.grid-table',
            h('thead', h('tr', ['Talmid', 'Father', 'Mother', 'Phone', 'Email'].map(function (x) { return h('th', x); }))),
            h('tbody', talmidim.map(function (t) {
              return h('tr', h('th', h('a', { href: '#/talmid/' + t.id }, Store.displayName(t))), h('td', t.father || ''), h('td', t.mother || ''),
                h('td', t.phone ? h('a', { href: 'tel:' + t.phone }, t.phone) : ''), h('td', t.email ? h('a', { href: 'mailto:' + t.email }, t.email) : ''));
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
    var rows = st.templates.map(function (t) { return { id: t.id, name: t.name, body: t.body }; });
    var box = h('div');
    function draw() {
      box.innerHTML = '';
      box.appendChild(h('p.small.muted', 'Placeholders: {name} {parent} {rebbi} {class} {parsha} {date} {hebdate} {highlight}'));
      rows.forEach(function (r, i) {
        box.appendChild(h('div.card.tight',
          h('div.row.gap', UI.input({ value: r.name, oninput: function (e) { r.name = e.target.value; } }),
            h('button.icon-btn', { 'aria-label': 'Remove template', onclick: function () { rows.splice(i, 1); draw(); } }, UI.icon('trash', 16))),
          h('textarea', { rows: 5, dir: 'auto', oninput: function (e) { r.body = e.target.value; } }, r.body)));
      });
      box.appendChild(h('button.btn.small', { onclick: function () { rows.push({ id: Store.uid(), name: 'New template', body: 'Dear {parent},\n\n\n{rebbi}' }); draw(); } }, UI.icon('plus'), 'Add template'));
    }
    draw();
    UI.modal('Message templates', box, [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: function () {
      Store.update(function (s) { s.templates = rows.filter(function (r) { return r.name.trim(); }); }); App.render();
    } }]);
  }
})();
