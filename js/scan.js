/*
 * Scan a class list with the camera.
 * Text recognition runs on the device with Tesseract.js (Apache-2.0), loaded
 * from a CDN only when the rebbi scans. The photo itself never leaves the device.
 *
 * parseClassList() is pure and is unit-tested in tests/scan.test.js.
 */
(function (root) {
  'use strict';

  var TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  var HEB = /[א-ת]/;
  var HEB_RUN = /[א-ת][א-תְ-ׇ'"׳״\- ]*[א-ת'׳]/g;
  var PHONE = /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
  var HEADER = /\b(class|kitah|kita|list|names?|students?|talmidim|talmid|rebbi|rabbi|teacher|morah|grade|room|phone|tel|cell|parents?|date|page|school|yeshiva|cheder|boys|period)\b|רשימת|שמות|כיתה|כתה/i;
  var NOT_A_NAME = /\b(mr|mrs|ms|dr)\b\.?/gi;

  function cap(w) {
    if (!w) return w;
    if (/^(ben|bar|bat|bas|de|van|von|le|la)$/i.test(w)) return w.toLowerCase();
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }

  // Common OCR slips in names: digits for letters, stray symbols.
  function cleanEnglish(s) {
    return s
      .replace(/[A-Za-z0-9]+/g, function (w) {
        return /[A-Za-z]/.test(w) ? w.replace(/0/g, 'o').replace(/1/g, 'l').replace(/5/g, 's') : w;
      })
      .replace(/[|\\_~`^*#@<>{}\[\]=+]/g, ' ')
      .replace(/[^A-Za-z'\-,. ]/g, ' ')
      .replace(NOT_A_NAME, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Turn recognized text into rows: [{ first, last, hebName, phone }]
   */
  function parseClassList(text) {
    var rows = [];
    var seen = {};
    String(text || '').split(/\r?\n/).forEach(function (raw) {
      var line = raw.trim();
      if (!line) return;

      var phoneMatch = line.match(PHONE);
      var phone = phoneMatch ? phoneMatch[0].trim() : '';
      if (phoneMatch) line = line.replace(phoneMatch[0], ' ');

      // Skip headings like "Kitah Gimmel – Class List 5787"
      var latinWords = (line.match(/[A-Za-z]{2,}/g) || []);
      if (HEADER.test(line) && latinWords.length <= 4 && !phone) return;

      // Leading numbering: "1.", "12)", "•", "-", "#3"
      line = line.replace(/^\s*(?:[#•·*\-–—o]|\(?\d{1,3}[.):\]]?|[a-z][.)])\s+/i, '');

      var heb = (line.match(HEB_RUN) || []).map(function (s) { return s.trim(); })
        .filter(function (s) { return s.replace(/[^א-ת]/g, '').length >= 2; });
      var hebName = heb.join(' ').replace(/\s+/g, ' ').trim();
      var eng = cleanEnglish(line.replace(HEB_RUN, ' '));

      var first = '', last = '';
      if (eng) {
        if (eng.indexOf(',') > 0) {           // "Cohen, Avraham"
          var parts = eng.split(',');
          last = parts[0].trim();
          first = parts.slice(1).join(' ').replace(/[,.]/g, ' ').trim();
        } else {
          var words = eng.replace(/[,.]/g, ' ').split(/\s+/).filter(Boolean);
          first = words.shift() || '';
          last = words.join(' ');
        }
        first = first.split(/\s+/).map(cap).join(' ');
        last = last.split(/\s+/).map(cap).join(' ');
        // Single letters / very short garbage are not names
        if (first.replace(/[^A-Za-z]/g, '').length < 2) { first = last; last = ''; }
        if (first.replace(/[^A-Za-z]/g, '').length < 2) first = '';
      }
      if (!first && !hebName) return;

      var key = (first + ' ' + last + ' ' + hebName).toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      rows.push({ first: first, last: last, hebName: hebName, phone: phone });
    });
    return rows;
  }

  // ---------------- graded bechina (one paper) ----------------
  function lev(a, b) {
    if (a === b) return 0;
    var m = a.length, n = b.length, prev = [], cur, i, j;
    for (j = 0; j <= n; j++) prev[j] = j;
    for (i = 1; i <= m; i++) {
      cur = [i];
      for (j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }
  function norm(x) { return String(x || '').toLowerCase().replace(/[֑-ׇ]/g, '').replace(/[^a-zא-ת0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); }

  /**
   * Read a photographed, graded bechina.
   * roster: [{ id, first, last, hebName }], max: points the bechina is out of.
   * Returns { talmid, options: [talmid] (when unsure), score: number|null, how: text }
   */
  function parseBechinaScan(text, roster, max) {
    var t = ' ' + norm(text) + ' ';
    var words = t.split(' ').filter(Boolean);
    max = +max || 100;

    // --- whose paper is it?
    var scored = roster.map(function (st) {
      var first = norm(st.first), last = norm(st.last);
      var heb = norm((st.hebName || '').split(/\s+ב[ןת]\s+/)[0]);
      var pts = 0;
      var near = function (name) { var allow = name.length >= 7 ? 2 : name.length >= 5 ? 1 : 0; return allow > 0 && words.some(function (w) { return Math.abs(w.length - name.length) <= 1 && lev(w, name) <= allow; }); };
      var hasFirst = first && t.indexOf(' ' + first + ' ') >= 0, hasLast = last && t.indexOf(' ' + last + ' ') >= 0;
      var nearFirst = !hasFirst && near(first), nearLast = !hasLast && near(last);
      var lastUnique = !roster.some(function (o) { return o !== st && norm(o.last) === last; });
      var firstUnique = !roster.some(function (o) { return o !== st && norm(o.first) === first; });
      if (first && last && (t.indexOf(' ' + first + ' ' + last + ' ') >= 0 || t.indexOf(' ' + last + ' ' + first + ' ') >= 0)) pts = 6;
      else if (hasFirst && hasLast) pts = 5;
      else if ((hasFirst && nearLast) || (nearFirst && hasLast)) pts = 4.5;
      else if (nearFirst && nearLast) pts = 4;
      else if (hasLast) pts = lastUnique ? 3 : 1.5;
      else if (nearLast) pts = lastUnique ? 2 : 1;
      else if (hasFirst) pts = firstUnique ? 2 : 1;
      else if (nearFirst) pts = firstUnique ? 1 : 0.5;
      if (heb && heb.length >= 2 && t.indexOf(' ' + heb + ' ') >= 0) {
        var hebUnique = !roster.some(function (o) { return o !== st && norm((o.hebName || '').split(/\s+ב[ןת]\s+/)[0]) === heb; });
        pts += pts >= 3 ? 1 : hebUnique ? 3 : 1.5;
      }
      return { st: st, pts: pts };
    }).filter(function (x) { return x.pts > 0; }).sort(function (a, b) { return b.pts - a.pts; });
    var best = scored[0], talmid = null, options = [];
    if (best) {
      var ties = scored.filter(function (x) { return x.pts === best.pts; });
      if (ties.length === 1 && best.pts >= 3) talmid = best.st;
      else options = scored.slice(0, 4).map(function (x) { return x.st; });
    }

    // --- the score
    var raw = String(text || '');
    var score = null, how = '';
    var m;
    // "85/100": a mark standing on its own, with a sensible total. The one out of `max` wins; otherwise the last plausible one on the page.
    var totals = [max, 100, 50, 40, 30, 25, 20, 15, 12, 10, 5];
    var frac = /(?:^|[^\d])(\d{1,3})\s*[\/⁄]\s*(\d{1,3})(?![\d\/⁄])/g;
    var fallback = null;
    while ((m = frac.exec(raw))) {
      var num = +m[1], den = +m[2];
      if (num > den) continue;
      if (den === max) { score = num; how = m[1] + '/' + m[2]; break; }
      if (totals.indexOf(den) >= 0) fallback = { score: Math.round(num / den * max), how: m[1] + '/' + m[2] };
    }
    if (score === null && fallback) { score = fallback.score; how = fallback.how; }
    if (score === null && (m = /(?:^|[^\d])(\d{1,3})\s*%/.exec(raw)) && +m[1] <= 100) { score = Math.round(+m[1] / 100 * max); how = m[1] + '%'; }
    if (score === null && (m = /(?:score|grade|total|mark|points|ציון|נקודות)\s*[:\-=]?\s*(\d{1,3})/i.exec(raw)) && +m[1] <= max) { score = +m[1]; how = m[0]; }
    if (score === null) {
      // a lone number on its own line (the big circled mark), not a date or question number
      var lines = raw.split(/\r?\n/);
      for (var i = lines.length - 1; i >= 0; i--) {
        var L = lines[i].trim();
        var bare = L.replace(/^[\(\[]\s*|\s*[\)\]]$/g, ''); // "(85)" -> "85"; "1." stays "1." and is skipped
        if (/^\d{1,3}$/.test(bare)) { var n = +bare; if (n <= max && n > 0) { score = n; how = L; break; } }
      }
    }
    return { talmid: talmid, options: options, score: score, how: how };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parseClassList: parseClassList, parseBechinaScan: parseBechinaScan };
    return;
  }

  // ---------------- browser UI ----------------
  var h = root.UI && root.UI.h;

  function loadTesseract() {
    if (root.Tesseract) return Promise.resolve(root.Tesseract);
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = TESSERACT_URL;
      s.onload = function () { resolve(root.Tesseract); };
      s.onerror = function () { reject(new Error('Could not load the scanner. Scanning needs an internet connection.')); };
      document.head.appendChild(s);
    });
  }

  // Shrink big phone photos and boost contrast so recognition is faster and better.
  function prepareImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var max = 2200;
        var scale = Math.min(1, max / Math.max(img.width, img.height));
        var c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        var ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, c.width, c.height);
        var d = ctx.getImageData(0, 0, c.width, c.height);
        var p = d.data;
        for (var i = 0; i < p.length; i += 4) {
          var g = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
          g = Math.max(0, Math.min(255, (g - 128) * 1.35 + 128)); // contrast
          p[i] = p[i + 1] = p[i + 2] = g;
        }
        ctx.putImageData(d, 0, 0);
        URL.revokeObjectURL(url);
        resolve({ canvas: c, preview: c.toDataURL('image/jpeg', 0.6) });
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('That file is not a photo we can read.')); };
      img.src = url;
    });
  }

  // Photo -> text, showing progress in the given elements. Resolves { text, preview }.
  function recognizeFile(file, lang, ui) {
    var worker;
    return prepareImage(file).then(function (img) {
      if (ui.preview) ui.preview.src = img.preview;
      ui.status.textContent = 'Loading the scanner…';
      return loadTesseract().then(function (T) {
        return T.createWorker(lang, 1, {
          logger: function (msg) {
            if (msg.status === 'recognizing text') {
              ui.status.textContent = 'Reading… ' + Math.round(msg.progress * 100) + '%';
              ui.bar.style.width = Math.round(msg.progress * 100) + '%';
            } else if (/loading|initializ/.test(msg.status)) {
              ui.status.textContent = 'Loading the scanner (first time takes a moment)…';
            }
          }
        });
      }).then(function (w) {
        worker = w;
        return w.setParameters({ preserve_interword_spaces: '1', tessedit_pageseg_mode: ui.psm || '4' });
      }).then(function () { return worker.recognize(img.canvas); })
        .then(function (res) {
          var text = res.data.text;
          // Optional second look (e.g. just for a big handwritten mark) when the first pass didn't find what we need.
          if (ui.secondPass && ui.secondPass.needed(text)) {
            ui.status.textContent = ui.secondPass.label || 'Looking again…';
            return worker.setParameters(ui.secondPass.params).then(function () { return worker.recognize(img.canvas); })
              .then(function (res2) { worker.terminate(); return { text: text + '\n' + res2.data.text, preview: img.preview }; });
          }
          worker.terminate();
          return { text: text, preview: img.preview };
        });
    }).catch(function (err) { if (worker) worker.terminate(); throw err; });
  }

  // ---------------- scan a graded bechina ----------------
  function openBechinaScanner(test) {
    var body = h('div.scan');
    var saved = 0;
    var m = UI.modal('Scan papers – ' + test.title, body, [{ label: 'Done' }]);

    function pickStep() {
      body.innerHTML = '';
      var camera = h('input', { type: 'file', accept: 'image/*', capture: 'environment', style: 'display:none' });
      var library = h('input', { type: 'file', accept: 'image/*', style: 'display:none' });
      [camera, library].forEach(function (inp) {
        inp.addEventListener('change', function () { if (inp.files[0]) readStep(inp.files[0]); });
      });
      body.appendChild(h('div',
        saved ? h('p.pill.pos', saved + ' paper' + (saved === 1 ? '' : 's') + ' saved') : null,
        h('p', 'Take a photo of a graded bechina. The app reads the talmid\'s name and his mark; you check both before saving.'),
        h('ul.small.muted.tips',
          h('li', 'Get the name and the mark in the picture, flat and in good light.'),
          h('li', 'Marks like "85/' + test.max + '", "85%" or a circled number are read best.'),
          h('li', 'The photo stays on this device.')),
        h('div.scan-buttons',
          h('button.btn.primary.big', { type: 'button', onclick: function () { camera.click(); } }, UI.icon('camera'), 'Take photo'),
          h('button.btn.big', { type: 'button', onclick: function () { library.click(); } }, UI.icon('image'), 'Choose a photo')),
        camera, library));
    }

    function readStep(file) {
      body.innerHTML = '';
      var bar = h('div.progress-bar');
      var status = h('p.muted', 'Preparing photo…');
      var preview = h('img.scan-preview', { alt: 'Your photo' });
      body.appendChild(h('div', preview, h('div.progress', bar), status));
      var roster = Store.activeTalmidim();
      recognizeFile(file, 'eng+heb', { bar: bar, status: status, preview: preview, psm: '6', secondPass: {
        label: 'Looking for the mark…',
        needed: function (text) { return parseBechinaScan(text, roster, test.max).score === null; },
        params: { tessedit_pageseg_mode: '11', tessedit_char_whitelist: '0123456789/%' }
      } }).then(function (r) {
        reviewStep(parseBechinaScan(r.text, Store.activeTalmidim(), test.max), r.preview, r.text);
      }).catch(function (err) {
        body.innerHTML = '';
        body.appendChild(h('div', h('p.overdue', err.message || 'Something went wrong while scanning.'),
          h('button.btn', { type: 'button', onclick: pickStep }, 'Try again')));
      });
    }

    function reviewStep(r, preview, rawText) {
      body.innerHTML = '';
      var st = Store.get();
      var who = UI.select(UI.talmidOptions('— Choose talmid —'), r.talmid ? r.talmid.id : '');
      var score = UI.input({ type: 'number', inputmode: 'decimal', min: 0, max: test.max, value: r.score === null ? '' : r.score, 'aria-label': 'Score' });
      var pct = h('span.muted');
      var existing = h('p.small.overdue');
      function upd() {
        pct.textContent = score.value === '' ? '' : Math.round(100 * score.value / test.max) + '%';
        var cur = who.value && (st.scores[test.id] || {})[who.value];
        existing.textContent = cur !== undefined && cur !== '' && who.value ? 'Already has ' + cur + '/' + test.max + ' – saving will replace it.' : '';
      }
      score.addEventListener('input', upd); who.addEventListener('change', upd); upd();
      function save() {
        if (!who.value) { UI.toast('Choose the talmid'); return false; }
        if (score.value === '' || isNaN(score.value)) { UI.toast('Enter the mark'); return false; }
        Store.update(function (s) { s.scores[test.id] = s.scores[test.id] || {}; s.scores[test.id][who.value] = Number(score.value); });
        saved++;
        UI.toast('Saved ' + Store.displayName(Store.talmid(who.value)) + ': ' + score.value + '/' + test.max);
        return true;
      }
      body.appendChild(h('div',
        h('img.scan-preview.scan-preview-lg', { src: preview, alt: 'The paper' }),
        r.talmid ? h('p.small.pos-text', '✓ Looks like ' + Store.displayName(r.talmid) + '\'s paper.')
          : r.options.length ? h('p.small.overdue', '❓ Not sure whose paper this is – it could be ' + r.options.map(function (t) { return Store.displayName(t); }).join(' or ') + '.')
          : h('p.small.overdue', '❓ Couldn\'t read a name. Choose the talmid below.'),
        UI.field('Talmid', who),
        h('label.field', h('span.field-label', 'Mark out of ' + test.max + (r.how ? ' (read "' + r.how.trim() + '")' : ' – not found, please type it')),
          h('div.row.gap', score, pct)),
        existing,
        h('div.row.gap.wrap',
          h('button.btn.primary', { type: 'button', onclick: function () { if (save()) { App.render(); pickStep(); } } }, UI.icon('camera'), 'Save & scan next'),
          h('button.btn', { type: 'button', onclick: function () { if (save()) { m.close(); App.render(); } } }, 'Save & finish'),
          h('button.btn', { type: 'button', onclick: pickStep }, 'Skip this one')),
        h('details.small.muted', h('summary', 'What the scanner read'), h('pre.scan-raw', rawText || ''))));
    }

    pickStep();
  }

  function openScanner() {
    var body = h('div.scan');
    var m = UI.modal('Scan a class list', body, [{ label: 'Close' }]);
    var lang = UI.select([['eng+heb', 'English & Hebrew names'], ['eng', 'English names only'], ['heb', 'Hebrew names only']], 'eng+heb');

    function pickStep() {
      body.innerHTML = '';
      var camera = h('input', { type: 'file', accept: 'image/*', capture: 'environment', style: 'display:none' });
      var library = h('input', { type: 'file', accept: 'image/*', style: 'display:none' });
      [camera, library].forEach(function (inp) {
        inp.addEventListener('change', function () { if (inp.files[0]) readStep(inp.files[0]); });
      });
      body.appendChild(h('div',
        h('p', 'Take a photo of a printed or neatly handwritten class list. You\'ll be able to check and fix every name before anything is added.'),
        h('ul.small.muted.tips',
          h('li', 'Lay the page flat, in good light, and fill the screen with the list.'),
          h('li', 'One talmid per line works best. Phone numbers on the same line are picked up too.'),
          h('li', 'The photo stays on this device. Scanning needs an internet connection the first time.')),
        UI.field('The list has', lang),
        h('div.scan-buttons',
          h('button.btn.primary.big', { type: 'button', onclick: function () { camera.click(); } }, UI.icon('camera'), 'Take photo'),
          h('button.btn.big', { type: 'button', onclick: function () { library.click(); } }, UI.icon('image'), 'Choose a photo')),
        camera, library));
    }

    function readStep(file) {
      body.innerHTML = '';
      var bar = h('div.progress-bar');
      var status = h('p.muted', 'Preparing photo…');
      var preview = h('img.scan-preview', { alt: 'Your photo' });
      body.appendChild(h('div', preview, h('div.progress', bar), status));
      recognizeFile(file, lang.value, { bar: bar, status: status, preview: preview }).then(function (r) {
        reviewStep(parseClassList(r.text), r.text);
      }).catch(function (err) {
        body.innerHTML = '';
        body.appendChild(h('div',
          h('p.overdue', err.message || 'Something went wrong while scanning.'),
          h('button.btn', { type: 'button', onclick: pickStep }, 'Try again')));
      });
    }

    function reviewStep(rows, rawText) {
      var existing = Store.activeTalmidim().map(function (t) {
        return ((t.first || '') + ' ' + (t.last || '')).trim().toLowerCase();
      });
      rows.forEach(function (r) {
        r.dup = existing.indexOf((r.first + ' ' + r.last).trim().toLowerCase()) >= 0;
        r.on = !r.dup;
      });
      body.innerHTML = '';
      var list = h('div.scan-rows');
      var addBtn = h('button.btn.primary', { type: 'button' });
      function count() { return rows.filter(function (r) { return r.on && (r.first || r.hebName); }).length; }
      function refreshBtn() { var n = count(); addBtn.textContent = 'Add ' + n + ' talmid' + (n === 1 ? '' : 'im'); addBtn.disabled = !n; }
      function draw() {
        list.innerHTML = '';
        rows.forEach(function (r, i) {
          var inp = function (key, ph, attrs) {
            return UI.input(Object.assign({ value: r[key], placeholder: ph, 'aria-label': ph + ' (row ' + (i + 1) + ')',
              oninput: function (e) { r[key] = e.target.value; refreshBtn(); } }, attrs || {}));
          };
          list.appendChild(h('div.scan-row' + (r.on ? '' : '.off'),
            h('input', { type: 'checkbox', checked: r.on, 'aria-label': 'Include row ' + (i + 1),
              onchange: function (e) { r.on = e.target.checked; draw(); } }),
            h('div.scan-fields',
              inp('first', 'First name'), inp('last', 'Last name'),
              inp('hebName', 'Hebrew name', { dir: 'rtl' }), inp('phone', 'Father\'s cell', { type: 'tel' })),
            r.dup ? h('span.pill.muted.small', 'already in class') : null));
        });
        refreshBtn();
      }
      addBtn.addEventListener('click', function () {
        var chosen = rows.filter(function (r) { return r.on && (r.first.trim() || r.hebName.trim()); });
        Store.update(function (s) {
          chosen.forEach(function (r) {
            s.talmidim.push({ id: Store.uid(), first: r.first.trim(), last: r.last.trim(), hebName: r.hebName.trim(),
              fatherPhone: r.phone.trim(), archived: false });
          });
        });
        m.close();
        UI.toast(chosen.length + ' talmidim added');
        App.go('talmidim');
        App.render();
      });

      body.appendChild(h('div',
        rows.length
          ? h('p', 'Found ', h('strong', String(rows.length)), ' name' + (rows.length === 1 ? '' : 's') + '. Fix any mistakes, untick anything that isn\'t a talmid, then add.')
          : h('p.overdue', 'No names were found. Try a clearer photo, or type them in below.'),
        list,
        h('div.row.gap.wrap',
          h('button.btn.small', { type: 'button', onclick: function () { rows.push({ first: '', last: '', hebName: '', phone: '', on: true }); draw(); } }, UI.icon('plus', 16), 'Add a row'),
          h('button.btn.small', { type: 'button', onclick: pickStep }, UI.icon('camera', 16), 'Scan again')),
        h('details.small.muted', h('summary', 'What the scanner read'), h('pre.scan-raw', rawText || '')),
        h('div.scan-add', addBtn)));
      draw();
    }

    pickStep();
  }

  root.ClassListScanner = { open: openScanner, openBechina: openBechinaScanner, parseClassList: parseClassList, parseBechinaScan: parseBechinaScan };
})(typeof window !== 'undefined' ? window : this);
