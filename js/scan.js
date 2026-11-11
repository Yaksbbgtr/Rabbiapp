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

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parseClassList: parseClassList };
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
      var worker;
      prepareImage(file).then(function (img) {
        preview.src = img.preview;
        status.textContent = 'Loading the scanner…';
        return loadTesseract().then(function (T) {
          return T.createWorker(lang.value, 1, {
            logger: function (msg) {
              if (msg.status === 'recognizing text') {
                status.textContent = 'Reading names… ' + Math.round(msg.progress * 100) + '%';
                bar.style.width = Math.round(msg.progress * 100) + '%';
              } else if (/loading|initializ/.test(msg.status)) {
                status.textContent = 'Loading the scanner (first time takes a moment)…';
              }
            }
          });
        }).then(function (w) {
          worker = w;
          return w.setParameters({ preserve_interword_spaces: '1', tessedit_pageseg_mode: '4' });
        }).then(function () {
          return worker.recognize(img.canvas);
        });
      }).then(function (res) {
        if (worker) worker.terminate();
        reviewStep(parseClassList(res.data.text), res.data.text);
      }).catch(function (err) {
        if (worker) worker.terminate();
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

  root.ClassListScanner = { open: openScanner, parseClassList: parseClassList };
})(typeof window !== 'undefined' ? window : this);
