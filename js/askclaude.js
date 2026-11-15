/*
 * "Open in Claude": the app writes a ready-made request, opens Claude (claude.ai or the Claude app) with it,
 * and the rebbi uses his own Claude account. No AI key, no server, no cost to the school.
 * He can then paste Claude's answer back here to print it with the yeshiva header and save it.
 * No talmidim names are ever put in a request: letters use [NAME] / [PARENTS] / [REBBI], filled in on paste.
 */
(function () {
  'use strict';
  var h = UI.h;
  var MAX_URL = 6000; // longer requests are copied instead of put in the link

  function silentCopy(text) {
    try { if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).catch(function () {}); } catch (e) {}
  }

  function openClaude(prompt) {
    var q = encodeURIComponent(prompt);
    var fits = q.length <= MAX_URL;
    silentCopy(prompt); // backup in case Claude opens empty
    window.open('https://claude.ai/new' + (fits ? '?q=' + q : ''), '_blank', 'noopener');
    UI.toast(fits ? 'Opening Claude – press send there' : 'Request copied – paste it into Claude and press send');
  }

  /*
   * The hand-over dialog.
   * o.title, o.intro, o.form (element, optional), o.build() -> request text,
   * o.pasteHint, o.onPaste(text) -> return false to keep the dialog open.
   */
  function handoff(o) {
    var req = h('textarea.ai-request', { rows: 8, dir: 'auto', 'aria-label': 'Request for Claude' });
    var edited = false;
    req.addEventListener('input', function () { edited = true; });
    function refresh() { if (!edited) req.value = o.build(); }
    if (o.form) { o.form.addEventListener('input', refresh); o.form.addEventListener('change', refresh); }
    refresh();
    var paste = h('textarea.ai-paste', { rows: 5, dir: 'auto', placeholder: o.pastePlaceholder || 'Paste Claude\'s answer here', 'aria-label': 'Claude\'s answer' });
    var m;
    var body = h('div.ai-handoff',
      o.intro ? h('p.muted', o.intro) : null,
      o.form || null,
      h('details.ai-see', h('summary', 'See or change the request'),
        req,
        h('div.row.gap.wrap', { style: 'margin-top:6px' },
          h('button.btn.small', { type: 'button', onclick: function () { edited = false; refresh(); } }, 'Reset'),
          h('p.small.muted', 'This is exactly what goes to Claude. No talmidim names are in it.'))),
      h('div.ai-step', h('div.ai-num', '1'), h('div.grow',
        h('div', h('strong', 'Open Claude with this request'), h('div.small.muted', 'Uses your own Claude account. Press send in Claude, and ask it for changes there if you like.')),
        h('div.row.gap.wrap', { style: 'margin-top:8px' },
          h('button.btn.primary', { type: 'button', onclick: function () { openClaude(req.value); } }, UI.icon('send', 18), 'Open in Claude'),
          h('button.btn', { type: 'button', onclick: function () { UI.copyText(req.value); } }, UI.icon('copy', 18), 'Copy request')))),
      h('div.ai-step', h('div.ai-num', '2'), h('div.grow',
        h('div', h('strong', o.pasteTitle || 'Paste the answer back (optional)'), h('div.small.muted', o.pasteHint || 'Copy Claude\'s answer and paste it here.')),
        paste,
        h('button.btn.primary', { type: 'button', style: 'margin-top:8px', onclick: function () {
          var t = paste.value.trim();
          if (!t) { paste.focus(); UI.toast('Paste Claude\'s answer first'); return; }
          if (o.onPaste(t) !== false) m.close();
        } }, UI.icon('check', 18), o.pasteButton || 'Use this'))));
    m = UI.modal(o.title, body, [{ label: 'Close' }]);
    return m;
  }

  // ---------- turning Claude's text into a printable sheet ----------
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function inline(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>'); }

  function cleanText(text) {
    return String(text).replace(/\r/g, '').replace(/^```[a-z]*\s*$/gim, '').trim();
  }
  // Splits off the answer key (a line that says "Answer key").
  function splitKey(text) {
    var lines = cleanText(text).split('\n');
    for (var i = 0; i < lines.length; i++) {
      if (/^\s*(#+\s*)?(\*\*)?\s*answer\s*key\b/i.test(lines[i])) return { main: lines.slice(0, i).join('\n').trim(), key: lines.slice(i + 1).join('\n').trim() };
    }
    return { main: lines.join('\n').trim(), key: '' };
  }
  function firstTitle(text) {
    var m = cleanText(text).match(/^\s*#+\s*(.+)$/m);
    return m ? m[1].replace(/\*\*/g, '').trim() : '';
  }
  function textToHtml(text) {
    return cleanText(text).split('\n').map(function (line) {
      var l = line.trimEnd();
      if (!l.trim()) return '<div class="ai-gap"></div>';
      var m = l.match(/^\s*(#{1,6})\s+(.*)$/);
      if (m) return m[1].length === 1 ? '<h1 dir="auto">' + inline(m[2]) + '</h1>' : '<h2 dir="auto">' + inline(m[2]) + '</h2>';
      if (/^\s*(-{3,}|\*{3,}|_{3,}\s*$)/.test(l) && !/\w/.test(l)) return '<hr>';
      var li = /^\s*(\d+[.)]|[a-zA-Zא-ת][.)]|[-•*])\s+/.test(l);
      return '<p dir="auto"' + (li ? ' class="ai-li"' : '') + '>' + inline(l.replace(/^\s*[-•*]\s+/, '• ')) + '</p>';
    }).join('');
  }

  // Pulls one <svg>…</svg> out of the pasted text. It is only ever shown as an <img>, so no script in it can run.
  function extractSvg(text) {
    var m = String(text).match(/<svg[\s\S]*<\/svg>/i);
    if (!m) return '';
    var svg = m[0];
    if (svg.length > 300000) return '';
    try {
      var doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
      if (doc.getElementsByTagName('parsererror').length) return '';
    } catch (e) { return ''; }
    if (!/xmlns=/.test(svg)) svg = svg.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
    return svg;
  }
  function svgImg(svg) {
    return h('img.ai-picture', { alt: 'Coloring picture', src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) });
  }

  // ---------- printing ----------
  function sheetHead(title, withName) {
    var st = Store.get();
    return h('div.ai-sheet-head',
      h('div.row.between', h('div.small', st.settings.school || ''), h('div.small', [st.settings.rebbiName, st.settings.className].filter(Boolean).join(' · '))),
      withName ? h('div.ai-name-line', h('span', 'Name: ______________________'), h('span', 'Date: ____________')) : null);
  }
  // A project as printable elements. opts.key: include the answer key; opts.keyOnly
  function sheet(p, opts) {
    opts = opts || {};
    var wrap = h('div.ai-sheet');
    if (p.kind === 'coloring') {
      wrap.appendChild(sheetHead(p.title, true));
      wrap.appendChild(h('h1.ai-color-title', { dir: 'auto' }, p.title));
      wrap.appendChild(svgImg(p.svg));
      if (p.trace) wrap.appendChild(h('div.ai-trace', { dir: 'auto' }, p.trace));
      return wrap;
    }
    var parts = splitKey(p.text);
    if (!opts.keyOnly) {
      wrap.appendChild(sheetHead(p.title, true));
      var body = h('div.ai-body'); body.innerHTML = textToHtml(parts.main); wrap.appendChild(body);
    }
    if (parts.key && (opts.key || opts.keyOnly)) {
      var key = h('div.ai-body.ai-key' + (opts.keyOnly ? '' : '.ai-newpage'));
      key.innerHTML = '<h1 dir="auto">Answer key – ' + esc(p.title) + '</h1>' + textToHtml(parts.key);
      wrap.appendChild(key);
    }
    return wrap;
  }
  function printEl(el) {
    var old = document.getElementById('ai-print');
    if (old) old.remove();
    var box = h('div#ai-print', el);
    document.body.appendChild(box);
    document.body.classList.add('ai-printing');
    var done = function () { document.body.classList.remove('ai-printing'); box.remove(); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(function () { window.print(); }, 50); // let the picture load
  }

  // ---------- saved projects (s.projects) ----------
  var KIND = { worksheet: 'Worksheet', test: 'Test', coloring: 'Coloring page' };
  function saveProject(p) {
    p.id = Store.uid(); p.created = Store.todayISO();
    Store.update(function (s) { s.projects = s.projects || []; s.projects.push(p); });
    return p;
  }
  function projectsFor(unitId) { return (Store.get().projects || []).filter(function (p) { return p.unitId === unitId; }); }

  function viewProject(p) {
    var hasKey = p.kind !== 'coloring' && !!splitKey(p.text).key;
    var preview = h('div.ai-preview', sheet(p, { key: true }));
    var actions = [
      { label: 'Delete', danger: true, onClick: function () {
        UI.confirm('Delete "' + p.title + '"?', function () { Store.update(function (s) { s.projects = (s.projects || []).filter(function (x) { return x.id !== p.id; }); }); App.render(); });
      } },
      { label: 'Close' }
    ];
    if (hasKey) actions.push({ label: 'Print answer key', onClick: function () { printEl(sheet(p, { keyOnly: true })); return false; } });
    actions.push({ label: hasKey ? 'Print for talmidim' : 'Print', primary: true, onClick: function () { printEl(sheet(p)); return false; } });
    UI.modal(KIND[p.kind] + ' – ' + p.title, preview, actions);
  }

  window.AskClaude = {
    open: openClaude, handoff: handoff, extractSvg: extractSvg, splitKey: splitKey, firstTitle: firstTitle,
    saveProject: saveProject, projectsFor: projectsFor, viewProject: viewProject, KIND: KIND
  };
})();
