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
        UI.confirm('Delete this limud, its source notes, documents and progress marks?', function () {
          Docs.removeAll(u);
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

      var pc = projectsCard(u);
      if (pc) main.appendChild(pc);

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
        main.appendChild(Docs.card(u));
      }

      if (unitTab === 'talmidim') {
        var m = st.mastery[u.id] || {};
        var counts = [0, 0, 0, 0];
        talmidim.forEach(function (t) { counts[m[t.id] || 0]++; });
        main.appendChild(h('div.card',
          h('div.legend', window.MASTERY_LEVELS.map(function (l, i) { return h('span.level.l' + i, counts[i] + ' ' + l); })),
          h('p.small.muted', 'Tap ', UI.icon('chat', 14), ' next to a talmid (or tap his row) to write a comment. It saves as you type; press Enter when you are done.'),
          h('div.row.gap.wrap',
            // Mark every talmid at one level; asks first if that changes boys who already have a different mark.
            h('select.bulk-level', { 'aria-label': 'Mark everyone', onchange: function (e) {
              var lvl = +e.target.value, name = window.MASTERY_LEVELS[lvl];
              e.target.value = '';
              var changes = talmidim.filter(function (t) { return (m[t.id] || 0) !== lvl; });
              if (!changes.length) { UI.toast('Everyone is already "' + name + '"'); return; }
              var marked = changes.filter(function (t) { return m[t.id]; }).length;
              var go = function () {
                Store.update(function (s) { var mm = s.mastery[u.id] = s.mastery[u.id] || {}; talmidim.forEach(function (t) { mm[t.id] = lvl; }); });
                UI.toast('Everyone marked "' + name + '"'); App.render();
              };
              if (marked) UI.confirm('Mark everyone "' + name + '"? This changes ' + marked + (marked === 1 ? ' talmid who already has' : ' talmidim who already have') + ' a different mark.', go, 'Mark everyone');
              else go();
            } },
              h('option', { value: '', selected: true, disabled: true }, 'Mark everyone…'),
              window.MASTERY_LEVELS.map(function (l, i) { return h('option', { value: String(i) }, l); })),
            h('button.btn.small', { onclick: function () { Store.update(function () { u.archived = !u.archived; }); App.render(); } }, u.archived ? 'Reopen this limud' : 'Mark finished'))));
        main.appendChild(talmidim.length ? h('div.card.att-list', talmidim.map(function (t) {
          var cp = UI.limudCommentParts(u.id, t.id, Store.displayName(t));
          return h('div.att-row.lc-row' + '.has-comment', { onclick: function (e) { if (!e.target.closest('a,select,button,textarea')) cp.toggle(); } },
            h('div.att-name', h('a.plain-link', { href: '#/talmid/' + t.id }, Store.displayName(t)), t.hebName && !st.settings.hebrewFirst ? h('span.he.muted.small', t.hebName) : null),
            h('div.lc-controls', cp.button,
              UI.levelSelect(t.id, u.id, Store.displayName(t) + ', ' + u.title)),
            cp.note);
        })) : UI.empty('Add talmidim first.', h('a.btn.primary', { href: '#/talmidim' }, 'Add talmidim')));
      }
    }
  });

  // ---------- Create project: made with Claude (the rebbi's own account), then printed and saved here ----------
  function createProject(u) {
    var st = Store.get();
    var kinds = [
      { key: 'worksheet', label: 'Worksheet', desc: 'Fill-in-the-blank pesukim, matching, and review questions for chazara at home.' },
      { key: 'test', label: 'Test', desc: 'A bechina on this limud with an answer key, ready to print.' }
    ];
    if (st.settings.coloringPages !== false) {
      kinds.push({ key: 'coloring', label: 'Coloring page', desc: 'A picture from the limud to color, with a pasuk or key words to trace.' });
    }
    var m = UI.modal('Create project', h('div',
      h('p.muted', 'For ', h('strong', { dir: 'auto' }, u.title), '. What would you like to make?'),
      h('div.project-kinds', kinds.map(function (k) {
        return h('button.project-kind', { type: 'button', onclick: function () { m.close(); makeWithClaude(u, k.key); } },
          UI.icon(k.key === 'coloring' ? 'image' : k.key === 'test' ? 'clipboard' : 'file', 26),
          h('div', h('div.name', k.label), h('div.small.muted', k.desc)));
      })),
      h('p.small.muted', 'Claude (AI) writes it in your own Claude account. You check it, and print it from Claude or from here.'),
      st.settings.coloringPages === false ? h('p.small.muted', 'Coloring pages are turned off in Settings → Additional settings.') : null), [{ label: 'Close' }]);
  }

  function makeWithClaude(u, kind) {
    var st = Store.get();
    var cls = st.settings.className || 'my class';
    var notes = (u.notes || '').trim();
    var cover = UI.input({ value: u.title, placeholder: 'e.g. Perek 12, pesukim 1-9' });
    var count = UI.select([['6', '6'], ['10', '10'], ['15', '15'], ['20', '20']], kind === 'test' ? '15' : '10');
    var level = UI.select([['easier', 'Easier'], ['on level', 'On grade level'], ['challenging', 'Challenge']], 'on level');
    var lang = UI.select([['English', 'English'], ['Yiddish', 'Yiddish'], ['Hebrew', 'Hebrew (Lashon Kodesh)']], 'English');
    var useNotes = h('input', { type: 'checkbox', checked: !!notes });
    var types = [['blanks', 'Fill in the blank (pesukim)'], ['matching', 'Matching (word – translation)'], ['questions', 'Review questions'], ['multiple', 'Multiple choice']];
    var picked = kind === 'test' ? ['blanks', 'multiple', 'questions'] : ['blanks', 'matching', 'questions'];
    var typeBoxes = types.map(function (t) { return h('label.check-row', h('input', { type: 'checkbox', value: t[0], checked: picked.indexOf(t[0]) >= 0 }), t[1]); });
    var scene = UI.input({ placeholder: 'e.g. Avraham Avinu\'s tent with the three malachim coming' });
    var trace = UI.input({ placeholder: 'e.g. לֶךְ לְךָ', dir: 'auto' });
    var extra = h('textarea', { rows: 2, dir: 'auto', placeholder: 'Anything else? (optional)' });
    var form;
    if (kind === 'coloring') {
      form = h('div', UI.field('What should the picture show?', scene), UI.field('Words to trace under the picture (optional)', trace, 'The app adds these in big hollow letters – Claude only draws the picture.'), UI.field('Anything else', extra));
    } else {
      form = h('div', UI.field('What should it cover?', cover),
        h('div.row.gap.wrap', UI.field('Questions', count), UI.field('Level', level), UI.field('Written in', lang)),
        h('div.field', h('span.field-label', 'Kinds of questions'), typeBoxes),
        notes ? h('label.check-row', useNotes, 'Use my source notes for this limud') : null,
        UI.field('Anything else', extra));
    }
    function chosen() { return typeBoxes.map(function (l) { return l.firstChild; }).filter(function (c) { return c.checked; }).map(function (c) { return types.filter(function (t) { return t[0] === c.value; })[0][1]; }); }
    function build() {
      var lines = [];
      if (kind === 'coloring') {
        lines.push('I am a rebbi in a yeshiva ketana (Orthodox Jewish boys\' elementary school). Please draw a coloring page for my class (' + cls + ').');
        lines.push('', 'Limud: ' + u.title + ' (' + u.subject + ')');
        lines.push('The picture should show: ' + (scene.value.trim() || 'a scene from this limud'));
        if (extra.value.trim()) lines.push('Also: ' + extra.value.trim());
        lines.push('', 'Make it one SVG image:',
          '- black outlines only on a white background: no colored fills, no gray, no shading',
          '- thick, clean lines (stroke-width 3 to 5) and big, simple shapes that a young boy can color in',
          '- viewBox="0 0 800 1000" (a portrait page), filling the space',
          '- no text, letters or words in the picture (I will add them myself)',
          '- appropriate for a yeshiva: modest, traditional dress, and never any image of Hashem',
          '', 'Reply with only the SVG code in one code block.');
      } else {
        var isTest = kind === 'test';
        lines.push('I am a rebbi in a yeshiva ketana (Orthodox Jewish boys\' elementary school). Please write a printable ' + (isTest ? 'test (bechina)' : 'worksheet for chazara') + ' for my class (' + cls + ').');
        lines.push('', 'Limud: ' + u.title + ' (' + u.subject + ')');
        lines.push('Cover: ' + (cover.value.trim() || u.title));
        lines.push('About ' + count.value + ' questions in total. Level: ' + level.value + '.');
        var ch = chosen();
        if (ch.length) lines.push('Kinds of questions: ' + ch.join(', ') + '.');
        lines.push('Write the instructions and questions in ' + lang.value + '. Quote pesukim and Hebrew words in Hebrew with nekudos.');
        if (extra.value.trim()) lines.push('Also: ' + extra.value.trim());
        if (notes && useNotes.checked) lines.push('', 'My source notes for this limud:', '"""', notes, '"""');
        lines.push('', 'Please:',
          '- Stay accurate to the text and to how it is taught in yeshivos. Do not make up pesukim; if you are not sure of the exact words, leave that question out.',
          '- Write it as plain text ready to print: a title line starting with "# ", short instructions, then numbered questions. Use ______ for blanks.',
          '- For matching, number one column (1, 2, 3) and letter the other (a, b, c).',
          isTest ? '- Show the points for each question in brackets, like [5], adding up to 100.' : null,
          '- At the end, add a line "## Answer key" and then the answers.',
          '- No pictures, tables or emojis.');
      }
      return lines.filter(function (l) { return l !== null; }).join('\n');
    }
    var label = AskClaude.KIND[kind];
    AskClaude.handoff({
      title: label + ' with Claude', form: form, build: build,
      intro: kind === 'coloring' ? 'Claude draws the picture. You can print it straight from Claude, or paste it back here to add the tracing words and the yeshiva header.'
        : 'Claude writes it from this limud' + (notes ? ' and your source notes' : '') + '. You can print it from Claude, or paste it back here to print with the yeshiva header and keep it with this limud.',
      pasteTitle: 'Paste it back to print and save here (optional)',
      pasteHint: kind === 'coloring' ? 'In Claude, copy the picture\'s code (the Copy button on it) and paste it here.' : 'Copy Claude\'s whole answer and paste it here.',
      pasteButton: 'Save and print',
      onPaste: function (text) {
        var p = { unitId: u.id, kind: kind };
        if (kind === 'coloring') {
          p.svg = AskClaude.extractSvg(text);
          if (!p.svg) { UI.toast('No picture found – copy the SVG code from Claude'); return false; }
          p.title = scene.value.trim() || u.title;
          p.trace = trace.value.trim();
        } else {
          p.text = text;
          p.title = AskClaude.firstTitle(text) || label + ' – ' + u.title;
        }
        AskClaude.viewProject(AskClaude.saveProject(p));
        App.render();
      }
    });
  }

  function projectsCard(u) {
    var list = AskClaude.projectsFor(u.id);
    if (!list.length) return null;
    return h('div.card', h('h2', 'Projects'),
      h('ul.list', list.slice().reverse().map(function (p) {
        return h('li.dash-issue', { onclick: function () { AskClaude.viewProject(p); } },
          h('div.row.between.gap', h('strong', { dir: 'auto' }, p.title), h('span.pill', AskClaude.KIND[p.kind])),
          h('div.small.muted', 'Made ' + UI.fmtDate(p.created) + ' · tap to view or print'));
      })));
  }
})();
