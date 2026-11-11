(function () {
  'use strict';
  var h = UI.h;

  function editTalmid(t) {
    var isNew = !t;
    t = t || { first: '', last: '', hebName: '', father: '', mother: '', fatherPhone: '', motherPhone: '', phone: '', phone2: '', email: '', birthday: '', address: '', notes: '', seat: '' };
    var f = {
      first: UI.input({ value: t.first, placeholder: 'First name', required: true }),
      last: UI.input({ value: t.last, placeholder: 'Last name' }),
      hebName: UI.input({ value: t.hebName, placeholder: 'שם בן שם האב', dir: 'rtl' }),
      birthday: UI.input({ type: 'date', value: t.birthday }),
      father: UI.input({ value: t.father }),
      mother: UI.input({ value: t.mother }),
      fatherPhone: UI.input({ type: 'tel', value: t.fatherPhone || '', placeholder: 'Cell' }),
      motherPhone: UI.input({ type: 'tel', value: t.motherPhone || '', placeholder: 'Cell' }),
      phone: UI.input({ type: 'tel', value: t.phone }),
      phone2: UI.input({ type: 'tel', value: t.phone2 || '' }),
      email: UI.input({ type: 'email', value: t.email }),
      address: UI.input({ value: t.address }),
      notes: h('textarea', { rows: 3, dir: 'auto', placeholder: 'Allergies, learning needs, what motivates him…' }, t.notes || '')
    };
    var body = h('div.form-grid',
      UI.field('First name', f.first), UI.field('Last name', f.last),
      UI.field('Hebrew name', f.hebName), UI.field('Birthday', f.birthday, 'Hebrew birthday is calculated automatically'),
      UI.field('Father', f.father), UI.field('Father\'s cell', f.fatherPhone),
      UI.field('Mother', f.mother), UI.field('Mother\'s cell', f.motherPhone),
      UI.field('Home phone', f.phone), UI.field('Other phone', f.phone2),
      UI.field('Email', f.email), UI.field('Address', f.address),
      h('div.span2', UI.field('Notes (private)', f.notes)));
    UI.modal(isNew ? 'Add talmid' : 'Edit ' + Store.displayName(t), body, [
      { label: 'Cancel' },
      {
        label: isNew ? 'Add' : 'Save', primary: true, onClick: function () {
          if (!f.first.value.trim() && !f.hebName.value.trim()) { f.first.focus(); UI.toast('Please enter a name'); return false; }
          Store.update(function (s) {
            Object.keys(f).forEach(function (k) { t[k] = f[k].value.trim(); });
            if (isNew) { t.id = Store.uid(); t.archived = false; s.talmidim.push(t); }
          });
          UI.toast(isNew ? 'Talmid added' : 'Saved');
          App.render();
        }
      }
    ]);
  }
  window.editTalmid = editTalmid;

  function bulkAdd() {
    var ta = h('textarea', { rows: 10, dir: 'auto', placeholder: 'One talmid per line:\nAvraham Cohen\nYitzchak Levy, יצחק בן דוד\n…' });
    UI.modal('Add a whole class', h('div',
      h('p.muted', 'Paste one name per line. Optionally add the Hebrew name after a comma.'), ta), [
      { label: 'Cancel' },
      {
        label: 'Add all', primary: true, onClick: function () {
          var lines = ta.value.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
          Store.update(function (s) {
            lines.forEach(function (l) {
              var parts = l.split(/[,\t]/);
              var name = parts[0].trim().split(/\s+/);
              s.talmidim.push({
                id: Store.uid(), first: name.shift() || '', last: name.join(' '),
                hebName: (parts[1] || '').trim(), archived: false
              });
            });
          });
          UI.toast(lines.length + ' talmidim added');
          App.render();
        }
      }
    ]);
  }

  Views.register('talmidim', {
    title: 'Talmidim', icon: 'users',
    render: function (main) {
      var all = Store.activeTalmidim();
      var search = UI.input({ type: 'search', placeholder: 'Search…', 'aria-label': 'Search talmidim' });
      var list = h('div.talmid-grid');
      function draw() {
        var q = search.value.trim().toLowerCase();
        list.innerHTML = '';
        var shown = all.filter(function (t) {
          return !q || [t.first, t.last, t.hebName, t.father, t.mother].join(' ').toLowerCase().indexOf(q) >= 0;
        });
        if (!all.length) {
          list.appendChild(UI.empty('No talmidim yet. Scan a class list with your camera, paste one, or add talmidim one at a time.',
            h('button.btn.primary', { onclick: function () { window.ClassListScanner.open(); } }, UI.icon('camera'), 'Scan class list')));
          return;
        }
        shown.forEach(function (t) {
          list.appendChild(h('a.card.talmid-card', { href: '#/talmid/' + t.id },
            h('div.avatar', initials(t)),
            h('div.grow',
              h('div.name', (t.first || '') + ' ' + (t.last || '')),
              t.hebName ? h('div.he.muted', t.hebName) : null)));
        });
      }
      search.addEventListener('input', draw);
      main.appendChild(h('div.page-head',
        h('div', h('h1', 'Talmidim'), h('p.muted', all.length + ' in class')),
        h('div.row.gap.wrap',
          h('button.btn', { onclick: function () { window.ClassListScanner.open(); } }, UI.icon('camera'), 'Scan class list'),
          h('button.btn', { onclick: bulkAdd }, 'Paste class list'),
          h('button.btn.primary', { onclick: function () { editTalmid(); } }, UI.icon('plus'), 'Add talmid'))));
      main.appendChild(search);
      main.appendChild(list);
      draw();

      var archived = Store.get().talmidim.filter(function (t) { return t.archived; });
      if (archived.length) {
        main.appendChild(h('details.card',
          h('summary', 'Archived talmidim (' + archived.length + ')'),
          h('ul.list', archived.map(function (t) {
            return h('li.row.between', h('span', Store.displayName(t)),
              h('button.btn.small', { onclick: function () { Store.update(function () { t.archived = false; }); App.render(); } }, 'Restore'));
          }))));
      }
    }
  });

  function initials(t) {
    var s = ((t.first || '')[0] || '') + ((t.last || '')[0] || '');
    return s || (t.hebName || '?')[0];
  }
  window.talmidInitials = initials;

  Views.register('talmid', {
    title: 'Talmid', hidden: true, matches: 'talmidim',
    render: function (main, params) {
      var t = Store.talmid(params[0]);
      if (!t) { main.appendChild(UI.empty('Talmid not found.', h('a.btn', { href: '#/talmidim' }, 'Back'))); return; }
      var st = Store.get();
      var today = Store.todayISO();

      main.appendChild(h('a.back', { href: '#/talmidim' }, UI.icon('chevl', 16), 'All talmidim'));
      var bdayInfo = null;
      if (t.birthday) {
        var orig = HebCal.isoToRD(t.birthday);
        var next = HebCal.nextHebrewAnniversary(orig, HebCal.isoToRD(today));
        bdayInfo = h('div.small.muted', 'Born ' + UI.fmtDate(t.birthday, { year: 'numeric', weekday: undefined }) + ' · ' +
          HebCal.formatHebrew(HebCal.fromRD(orig)) + ' · next Hebrew birthday ' + UI.fmtDate(HebCal.rdToISO(next)));
      }
      main.appendChild(h('div.page-head',
        h('div.row.gap',
          h('div.avatar.lg', initials(t)),
          h('div', h('h1', (t.first || '') + ' ' + (t.last || '')), t.hebName ? h('div.he.big', t.hebName) : null, bdayInfo)),
        h('div.row.gap',
          h('a.btn', { href: '#/reports/' + t.id }, UI.icon('print'), 'Report card'),
          h('button.btn', { onclick: function () { editTalmid(t); } }, UI.icon('edit'), 'Edit'),
          h('button.btn', {
            onclick: function () {
              UI.confirm('Archive ' + Store.displayName(t) + '? His records are kept and he can be restored later.', function () {
                Store.update(function () { t.archived = true; }); App.go('talmidim');
              }, 'Archive');
            }
          }, 'Archive'))));

      var grid = h('div.grid');
      main.appendChild(grid);

      // Contact
      grid.appendChild(h('div.card',
        h('h2', 'Family'),
        h('dl.kv',
          kv('Father', [t.father || '', t.fatherPhone ? [t.father ? ' · ' : '', h('a', { href: 'tel:' + t.fatherPhone.replace(/[^\d+]/g, '') }, t.fatherPhone)] : null]),
          kv('Mother', [t.mother || '', t.motherPhone ? [t.mother ? ' · ' : '', h('a', { href: 'tel:' + t.motherPhone.replace(/[^\d+]/g, '') }, t.motherPhone)] : null]),
          kv('Home', t.phone ? h('a', { href: 'tel:' + t.phone.replace(/[^\d+]/g, '') }, t.phone) : ''),
          kv('Other', t.phone2 ? h('a', { href: 'tel:' + t.phone2.replace(/[^\d+]/g, '') }, t.phone2) : ''),
          kv('Email', t.email ? h('a', { href: 'mailto:' + t.email }, t.email) : ''),
          kv('Address', t.address)),
        t.notes ? h('div.note-box', { dir: 'auto' }, t.notes) : null,
        window.lastContactBlock(t),
        h('div.row.gap.wrap',
          h('button.btn.primary', { type: 'button', onclick: function () { window.contactParent(t, 'call'); } }, UI.icon('phone'), 'Call'),
          h('button.btn', { type: 'button', onclick: function () { window.contactParent(t, 'text'); } }, 'Text'),
          h('button.btn', { type: 'button', onclick: function () { window.logContact && window.logContact(t.id); } }, 'Log parent call'))));

      // Stats
      var a = attendanceSummary(t.id);
      var avg = averageScore(t.id);
      grid.appendChild(h('div.card',
        h('h2', 'At a glance'),
        h('div.stats',
          stat(a.days ? Math.round(100 * a.present / a.days) + '%' : '–', 'attendance'),
          stat(a.absent, 'absences'), stat(a.late, 'lates'),
          stat(avg === null ? '–' : Math.round(avg) + '%', 'bechina avg'))));

      // Mastery
      var units = st.units.filter(function (u) { return !u.archived; });
      grid.appendChild(h('div.card',
        h('h2', 'Limud progress'),
        units.length ? h('p.small.muted', 'Tap a level to change it.') : null,
        units.length ? h('ul.list', units.map(function (u) {
          return h('li.row.between', h('a.plain-link', { href: '#/unit/' + u.id }, h('strong', u.subject), ' ', u.title),
            UI.levelSelect(t.id, u.id, u.title));
        })) : h('p.muted', 'No limudim yet.')));

      // Scores: every bechina, so missing ones can be filled in
      var tests = st.tests.slice().sort(function (a, b) { return b.date.localeCompare(a.date); });
      grid.appendChild(h('div.card',
        h('h2', 'Bechinos'),
        tests.length ? h('p.small.muted', 'Tap a score to change it.') : null,
        tests.length ? h('ul.list', tests.map(function (x) {
          var sc = st.scores[x.id] && st.scores[x.id][t.id];
          var has = sc !== undefined && sc !== '' && sc !== null;
          return h('li', h('button.edit-row', { type: 'button', onclick: function () { editScore(t, x); }, 'aria-label': 'Edit score for ' + x.title },
            h('span', h('span.small.muted', UI.fmtDate(x.date)), ' ', x.title),
            h('strong.score' + (has ? '' : '.muted'), has ? sc + '/' + x.max : 'add')));
        })) : h('p.muted', 'No bechinos yet.')));

      // Contacts
      var contacts = st.contacts.filter(function (c) { return c.talmidId === t.id; }).slice().reverse();
      grid.appendChild(h('div.card',
        h('h2', 'Parent contact log'),
        contacts.length ? h('ul.list', contacts.map(function (c) {
          return h('li', h('div.small.muted', UI.fmtDate(c.date) + ' · ' + c.method), h('div', { dir: 'auto' }, c.note));
        })) : h('p.muted', 'No contacts logged.')));

      // Report comment
      var comment = h('textarea', { rows: 4, dir: 'auto', placeholder: 'Comment for the report card…' }, st.comments[t.id] || '');
      comment.addEventListener('change', function () { Store.update(function (s) { s.comments[t.id] = comment.value; }); UI.toast('Comment saved'); });
      grid.appendChild(h('div.card', h('h2', 'Report card comment'), comment));
      void today;
    }
  });


  function editScore(t, x) {
    var st = Store.get();
    var cur = st.scores[x.id] && st.scores[x.id][t.id];
    var inp = UI.input({ type: 'number', inputmode: 'decimal', value: cur === undefined ? '' : cur, min: 0, max: x.max });
    var pct = h('div.muted', '');
    function upd() { pct.textContent = inp.value === '' ? '' : Math.round(100 * inp.value / x.max) + '%'; }
    inp.addEventListener('input', upd); upd();
    function save() {
      if (inp.value !== '' && (isNaN(inp.value) || Number(inp.value) < 0)) { UI.toast('Enter a number'); return false; }
      Store.update(function (s) {
        s.scores[x.id] = s.scores[x.id] || {};
        if (inp.value === '') delete s.scores[x.id][t.id]; else s.scores[x.id][t.id] = Number(inp.value);
      });
      UI.toast('Saved'); App.render();
    }
    var m = UI.modal(x.title + ' – ' + Store.displayName(t), h('div',
      h('p.small.muted', x.subject + ' · ' + UI.fmtDate(x.date)),
      UI.field('Score out of ' + x.max, inp), pct), [
      cur === undefined ? null : { label: 'Clear score', danger: true, onClick: function () { inp.value = ''; return save(); } },
      { label: 'Cancel' },
      { label: 'Save', primary: true, onClick: save }
    ].filter(Boolean));
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); if (save() !== false) m.close(); } });
  }

  function kv(k, v) {
    var empty = !v || (Array.isArray(v) && !v.some(function (x) { return x && (typeof x !== 'string' || x.trim()); }));
    return empty ? null : [h('dt', k), h('dd', { dir: 'auto' }, v)];
  }
  function stat(n, label) { return h('div.stat', h('div.stat-n', String(n)), h('div.stat-l', label)); }

  function attendanceSummary(id, from, to) {
    var att = Store.get().attendance;
    var r = { days: 0, present: 0, absent: 0, late: 0, excused: 0 };
    Object.keys(att).forEach(function (date) {
      if (from && date < from) return;
      if (to && date > to) return;
      var v = att[date][id];
      if (!v) return;
      r.days++;
      if (v === 'P') r.present++;
      if (v === 'L') { r.late++; r.present++; }
      if (v === 'A') r.absent++;
      if (v === 'E') { r.excused++; r.absent++; }
    });
    return r;
  }
  function averageScore(id) {
    var st = Store.get();
    var sum = 0, n = 0;
    st.tests.forEach(function (x) {
      var v = st.scores[x.id] && st.scores[x.id][id];
      if (v === undefined || v === '' || v === null || isNaN(v)) return;
      sum += 100 * Number(v) / (Number(x.max) || 100); n++;
    });
    return n ? sum / n : null;
  }
  window.attendanceSummary = attendanceSummary;
  window.averageScore = averageScore;
})();
