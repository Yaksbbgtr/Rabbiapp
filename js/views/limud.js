(function () {
  'use strict';
  var h = UI.h;
  window.MASTERY_LEVELS = ['Not yet', 'Learning', 'Knows it', 'Fluent'];
  var SUBJECTS = ['Chumash', 'Rashi', 'Mishnayos', 'Gemara', 'Navi', 'Dinim', 'Halacha', 'Kriah', 'Tefillah', 'Parsha', 'Yahadus', 'Mussar', 'Other'];
  var filter = 'All';
  var showArchived = false;
  var unitTab = 'notes';

  function editUnit(u) {
    var isNew = !u;
    u = u || { subject: filter !== 'All' ? filter : 'Chumash', title: '', date: Store.todayISO() };
    var subj = UI.select(SUBJECTS.indexOf(u.subject) < 0 ? [u.subject].concat(SUBJECTS) : SUBJECTS, u.subject);
    var dl = h('datalist#parsha-list', HebCal.PARSHIYOS.map(function (p) { return h('option', { value: 'Parshas ' + p[0] }); }));
    var title = UI.input({ value: u.title, placeholder: 'e.g. Parshas Noach – Perek 6, or Brachos 1:1-3', list: 'parsha-list' });
    var date = UI.input({ type: 'date', value: u.date });
    UI.modal(isNew ? 'New limud' : 'Edit limud', h('div', dl,
      UI.field('Subject', subj), UI.field('What is being learned', title), UI.field('Started', date)), [
      isNew ? null : { label: 'Delete', danger: true, onClick: function () {
        UI.confirm('Delete this limud, its source notes and its progress marks?', function () {
          Store.update(function (s) { s.units = s.units.filter(function (x) { return x.id !== u.id; }); delete s.mastery[u.id]; });
          App.go('limud');
        });
      } },
      { label: 'Cancel' },
      { label: isNew ? 'Add' : 'Save', primary: true, onClick: function () {
        if (!title.value.trim()) { UI.toast('Please describe the limud'); return false; }
        Store.update(function (s) {
          u.subject = subj.value; u.title = title.value.trim(); u.date = date.value;
          if (isNew) { u.id = Store.uid(); u.notes = ''; s.units.push(u); s.mastery[u.id] = {}; }
        });
        if (isNew) { unitTab = 'notes'; App.go('unit/' + u.id); } else App.render();
      } }
    ].filter(Boolean));
  }

  function knownCount(u, talmidim) {
    var m = Store.get().mastery[u.id] || {};
    return talmidim.filter(function (t) { return (m[t.id] || 0) >= 2; }).length;
  }

  // ---------- Limud list ----------
  Views.register('limud', {
    title: 'Limud', icon: 'book',
    render: function (main) {
      var st = Store.get();
      var talmidim = Store.activeTalmidim();
      var used = SUBJECTS.concat(st.units.map(function (u) { return u.subject; })).filter(function (s, i, arr) {
        return arr.indexOf(s) === i && st.units.some(function (u) { return u.subject === s; });
      });

      main.appendChild(h('div.page-head',
        h('div', h('h1', 'Limud'), h('p.muted', 'Tap a limud for its source notes, the talmidim\'s progress, and projects.')),
        h('button.btn.primary', { onclick: function () { editUnit(); } }, UI.icon('plus'), 'New limud')));

      if (used.length > 1) {
        main.appendChild(h('div.chips',
          ['All'].concat(used).map(function (s) {
            return h('button.chip' + (filter === s ? '.on' : ''), { onclick: function () { filter = s; App.render(); } }, s);
          }),
          h('label.chip.check', h('input', { type: 'checkbox', checked: showArchived, onchange: function (e) { showArchived = e.target.checked; App.render(); } }), 'Show finished')));
      }

      var units = st.units.filter(function (u) { return (filter === 'All' || u.subject === filter) && (showArchived || !u.archived); })
        .sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
      if (!units.length) {
        main.appendChild(UI.empty('No limudim yet. Add one for what you\'re learning now (e.g. "Parshas Lech Lecha – Perek 12").',
          h('button.btn.primary', { onclick: function () { editUnit(); } }, UI.icon('plus'), 'New limud')));
        return;
      }

      main.appendChild(h('div.list-cards', units.map(function (u) {
        var known = knownCount(u, talmidim);
        var pct = talmidim.length ? Math.round(100 * known / talmidim.length) : 0;
        return h('a.card.unit-card' + (u.archived ? '.finished' : ''), { href: '#/unit/' + u.id },
          h('div.grow',
            h('div.small.muted', u.subject + (u.archived ? ' · finished' : '') + (u.date ? ' · started ' + UI.fmtDate(u.date, { weekday: undefined }) : '')),
            h('div.name', { dir: 'auto' }, u.title),
            talmidim.length ? h('div.unit-bar', h('div.unit-bar-fill', { style: 'width:' + pct + '%' })) : null,
            h('div.small.muted', talmidim.length ? known + ' of ' + talmidim.length + ' know it' : 'No talmidim yet',
              u.notes && u.notes.trim() ? ' · has source notes' : '')),
          UI.icon('chev', 18));
      })));

      // Who needs help: talmidim with most "not yet / learning" in open limudim
      var open = st.units.filter(function (u) { return !u.archived; });
      var needs = talmidim.map(function (t) {
        var weak = open.filter(function (u) { return ((st.mastery[u.id] || {})[t.id] || 0) < 2; });
        return { t: t, weak: weak };
      }).filter(function (x) { return x.weak.length; }).sort(function (a, b) { return b.weak.length - a.weak.length; }).slice(0, 6);
      if (needs.length) {
        main.appendChild(h('div.card',
          h('h2', 'Chazara focus'),
          h('p.muted.small', 'Talmidim who still need help on open limudim, for a chazara chavrusa or extra time.'),
          h('ul.list', needs.map(function (x) {
            return h('li', h('strong', Store.displayName(x.t)), ': ', x.weak.map(function (u) { return u.title; }).join(', '));
          }))));
      }
    }
  });

  // ---------- One limud ----------
  Views.register('unit', {
    title: 'Limud', hidden: true, matches: 'limud',
    render: function (main, params) {
      var st = Store.get();
      var u = st.units.find(function (x) { return x.id === params[0]; });
      if (!u) { main.appendChild(UI.empty('This limud was not found.', h('a.btn', { href: '#/limud' }, 'All limudim'))); return; }
      var talmidim = Store.activeTalmidim();
      var known = knownCount(u, talmidim);

      main.appendChild(h('a.back', { href: '#/limud' }, UI.icon('chevl', 16), 'All limudim'));
      main.appendChild(h('div.page-head',
        h('div', h('div.small.muted', u.subject + (u.archived ? ' · finished' : '')), h('h1', { dir: 'auto' }, u.title),
          h('p.muted', talmidim.length ? known + ' of ' + talmidim.length + ' talmidim know it' : 'No talmidim yet')),
        h('div.row.gap.wrap',
          h('button.btn.primary', { onclick: function () { createProject(u); } }, UI.icon('plus'), 'Create project'),
          h('button.btn', { onclick: function () { editUnit(u); } }, UI.icon('edit'), 'Edit'))));

      main.appendChild(h('div.seg', [['notes', 'Source notes'], ['talmidim', 'Talmidim']].map(function (m) {
        return h('button' + (unitTab === m[0] ? '.on' : ''), { onclick: function () { unitTab = m[0]; App.render(); } }, m[1]);
      })));

      if (unitTab === 'notes') {
        var saved = h('span.rc-saved', { 'aria-live': 'polite' });
        var ta = h('textarea.source-notes', {
          dir: 'auto', 'aria-label': 'Source notes',
          placeholder: 'Mareh mekomos, Rashis and meforshim to bring, kashyos to ask, where the class got stuck, what to review…'
        }, u.notes || '');
        var grow = function () { ta.style.height = 'auto'; ta.style.height = Math.max(220, ta.scrollHeight + 4) + 'px'; };
        var timer;
        ta.addEventListener('input', function () {
          grow();
          Store.update(function () { u.notes = ta.value; });
          saved.textContent = 'Saved ✓';
          clearTimeout(timer); timer = setTimeout(function () { saved.textContent = ''; }, 1500);
        });
        setTimeout(grow, 0);
        main.appendChild(h('div.card',
          h('div.row.between', h('h2', 'Source notes ', saved)),
          h('p.small.muted', 'Your own notes for teaching this limud. They save as you type and stay with this limud.'),
          ta));
      }

      if (unitTab === 'talmidim') {
        var m = st.mastery[u.id] || {};
        var counts = [0, 0, 0, 0];
        talmidim.forEach(function (t) { counts[m[t.id] || 0]++; });
        main.appendChild(h('div.card',
          h('div.legend', window.MASTERY_LEVELS.map(function (l, i) { return h('span.level.l' + i, counts[i] + ' ' + l); })),
          h('div.row.gap.wrap',
            h('button.btn.small', { onclick: function () {
              Store.update(function (s) { var mm = s.mastery[u.id] = s.mastery[u.id] || {}; talmidim.forEach(function (t) { if (!mm[t.id]) mm[t.id] = 1; }); });
              App.render();
            } }, 'Mark everyone "Learning"'),
            h('button.btn.small', { onclick: function () { Store.update(function () { u.archived = !u.archived; }); App.render(); } }, u.archived ? 'Reopen this limud' : 'Mark finished'))));
        main.appendChild(talmidim.length ? h('div.card.att-list', talmidim.map(function (t) {
          return h('div.att-row',
            h('div.att-name', h('a.plain-link', { href: '#/talmid/' + t.id }, Store.displayName(t)), t.hebName && !st.settings.hebrewFirst ? h('span.he.muted.small', t.hebName) : null),
            UI.levelSelect(t.id, u.id, Store.displayName(t) + ', ' + u.title));
        })) : UI.empty('Add talmidim first.', h('a.btn.primary', { href: '#/talmidim' }, 'Add talmidim')));
      }
    }
  });

  // ---------- Create project (demo for now) ----------
  function createProject(u) {
    var st = Store.get();
    var kinds = [
      { key: 'worksheet', label: 'Worksheet', desc: 'Fill-in-the-blank pesukim, matching, and review questions for chazara at home.' },
      { key: 'test', label: 'Test', desc: 'A bechina on this limud with an answer key, ready to print.' }
    ];
    if (st.settings.coloringPages !== false) {
      kinds.push({ key: 'coloring', label: 'Coloring page', desc: 'A picture from the limud to color, with a pasuk or key words to trace.' });
    }
    var body = h('div');
    var m = UI.modal('Create project', body, [{ label: 'Close' }]);
    function pick() {
      body.innerHTML = '';
      body.appendChild(h('p.muted', 'For ', h('strong', { dir: 'auto' }, u.title), '. What would you like to make?'));
      body.appendChild(h('div.project-kinds', kinds.map(function (k) {
        return h('button.project-kind', { type: 'button', onclick: function () { demo(k); } },
          UI.icon(k.key === 'coloring' ? 'image' : k.key === 'test' ? 'clipboard' : 'file', 26),
          h('div', h('div.name', k.label), h('div.small.muted', k.desc)));
      })));
      if (st.settings.coloringPages === false) body.appendChild(h('p.small.muted', 'Coloring pages are turned off in Profile settings.'));
    }
    function demo(k) {
      body.innerHTML = '';
      body.appendChild(h('div',
        h('div.pill.gold', 'Demo'),
        h('h3', { style: 'margin-top:10px' }, k.label + ' – ' + u.title),
        h('p', 'This is a preview of the button. Making the ' + k.label.toLowerCase() + ' itself is not built yet.'),
        h('p.small.muted', 'When it is, it will use your source notes' + (u.notes && u.notes.trim() ? ' (you have some for this limud)' : '') +
          ' and make a printable ' + k.label.toLowerCase() + ' for ' + (st.settings.className || 'your class') + '.'),
        h('div.row.gap.wrap',
          h('button.btn', { type: 'button', onclick: pick }, UI.icon('chevl', 16), 'Back'),
          h('button.btn.primary', { type: 'button', onclick: function () { m.close(); UI.toast('Demo only – nothing was created'); } }, 'OK'))));
    }
    pick();
  }
})();
