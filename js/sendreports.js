/*
 * Send report cards to the school office as separate PDFs.
 *
 * The app has no server, so it cannot email by itself. Instead it:
 *   1. makes one PDF per talmid on this device (html2canvas + jsPDF, both MIT,
 *      loaded from a CDN only when needed), then
 *   2. hands them to the phone's share sheet (Mail, WhatsApp, etc.) with the
 *      PDFs attached, or downloads them on computers that can't share files.
 */
(function () {
  'use strict';
  var h = UI.h;
  var LIBS = [
    ['html2canvas', 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js'],
    ['jspdf', 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js']
  ];

  function loadScript(globalName, url) {
    if (window[globalName]) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = url;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Could not load the PDF maker. Making PDFs needs an internet connection the first time.')); };
      document.head.appendChild(s);
    });
  }

  function fileName(t) {
    var name = [t.last, t.first].filter(Boolean).join(', ') || t.hebName || 'Talmid';
    return (name + ' - Progress Report.pdf').replace(/[\\/:*?"<>|]/g, '');
  }

  // Draw one report card off-screen (always in light colors) and turn it into a one-page PDF.
  function makePdf(t) {
    var stage = h('div.pdf-render', { 'aria-hidden': 'true' }, window.buildReportCard(t));
    document.body.appendChild(stage);
    return window.html2canvas(stage.firstChild, { scale: 2, backgroundColor: '#ffffff', logging: false, windowWidth: 820 })
      .then(function (canvas) {
        stage.remove();
        var pdf = new window.jspdf.jsPDF({ unit: 'pt', format: 'letter' });
        var pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight(), m = 30;
        var w = pw - 2 * m, hgt = canvas.height * w / canvas.width;
        if (hgt > ph - 2 * m) { hgt = ph - 2 * m; w = canvas.width * hgt / canvas.height; }
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', (pw - w) / 2, m, w, hgt);
        return new File([pdf.output('blob')], fileName(t), { type: 'application/pdf' });
      }, function (e) { stage.remove(); throw e; });
  }

  function open(talmidim) {
    var st = Store.get();
    var body = h('div');
    var m = UI.modal(talmidim.length === 1 ? 'Send report to the office' : 'Send reports to the office', body, [{ label: 'Close' }]);
    var subject = 'Progress report' + (talmidim.length === 1 ? ' – ' + Store.displayName(talmidim[0]) : 's') +
      (st.settings.className ? ' – ' + st.settings.className : '') + (st.settings.rebbiName ? ' – ' + st.settings.rebbiName : '');

    function startStep() {
      body.innerHTML = '';
      var email = UI.input({ type: 'email', value: st.settings.officeEmail || '', placeholder: 'office@yeshiva.org', autocomplete: 'email' });
      var missing = talmidim.filter(function (t) { return !st.comments[t.id]; });
      body.appendChild(h('div',
        h('p', talmidim.length === 1
          ? 'This makes a PDF of ' + Store.displayName(talmidim[0]) + '\'s report card, ready to send.'
          : 'This makes ' + talmidim.length + ' separate PDFs, one for each talmid, ready to send.'),
        UI.field('School office email', email, 'Saved on this device for next time.'),
        missing.length ? h('div.card.warn.tight', missing.length === 1 && talmidim.length === 1
          ? 'This report has no comment yet.'
          : missing.length + ' of these reports have no comment yet: ' + missing.map(function (t) { return Store.displayName(t); }).join(', ') + '.') : null,
        h('button.btn.primary.big', { type: 'button', onclick: function () {
          Store.update(function (s) { s.settings.officeEmail = email.value.trim(); });
          buildStep();
        } }, UI.icon('file'), talmidim.length === 1 ? 'Make the PDF' : 'Make the ' + talmidim.length + ' PDFs')));
    }

    function buildStep() {
      body.innerHTML = '';
      var bar = h('div.progress-bar');
      var status = h('p.muted', 'Getting ready…');
      body.appendChild(h('div', h('div.progress', bar), status));
      var files = [];
      var cancelled = false;
      LIBS.reduce(function (p, lib) { return p.then(function () { return loadScript(lib[0], lib[1]); }); }, Promise.resolve())
        .then(function () {
          return talmidim.reduce(function (p, t, i) {
            return p.then(function () {
              if (!document.body.contains(m.el)) { cancelled = true; return null; }
              status.textContent = 'Making PDF ' + (i + 1) + ' of ' + talmidim.length + ': ' + Store.displayName(t);
              return makePdf(t).then(function (f) {
                files.push(f);
                bar.style.width = Math.round(100 * (i + 1) / talmidim.length) + '%';
              });
            });
          }, Promise.resolve());
        })
        .then(function () { if (!cancelled) sendStep(files); })
        .catch(function (err) {
          body.innerHTML = '';
          body.appendChild(h('div', h('p.overdue', err.message || 'Something went wrong making the PDFs.'),
            h('button.btn', { type: 'button', onclick: startStep }, 'Try again')));
        });
    }

    function sendStep(files) {
      body.innerHTML = '';
      var office = Store.get().settings.officeEmail || '';
      var canShare = !!(navigator.canShare && navigator.canShare({ files: files }));
      var text = 'Attached ' + (files.length === 1 ? 'is the progress report' : 'are ' + files.length + ' progress reports, one PDF per talmid') +
        (st.settings.className ? ' for ' + st.settings.className : '') + '.\n\n' + (st.settings.rebbiName || '');
      var note = h('p.small.muted');

      function download() {
        files.forEach(function (f, i) {
          setTimeout(function () {
            var a = h('a', { href: URL.createObjectURL(f), download: f.name });
            document.body.appendChild(a); a.click();
            setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
          }, i * 350);
        });
        note.textContent = 'Saved to your downloads. If your browser asks, allow it to download several files.';
      }

      body.appendChild(h('div',
        h('p', h('strong', files.length === 1 ? 'The PDF is ready.' : 'All ' + files.length + ' PDFs are ready.')),
        h('ul.small.muted.tips', files.slice(0, 4).map(function (f) { return h('li', f.name); }),
          files.length > 4 ? h('li', '…and ' + (files.length - 4) + ' more') : null),
        canShare ? h('div',
          h('p', 'Tap Send, then choose ', h('strong', 'Mail'), '. The PDFs will already be attached.' +
            (office ? ' The office address is copied for you: press and hold the "To" line and tap Paste.' : '')),
          office ? h('p.small', 'To: ', h('strong', office)) : null,
          h('button.btn.primary.big', { type: 'button', onclick: function () {
            if (office && navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(office).catch(function () {});
            navigator.share({ files: files, title: subject, text: text }).then(function () {
              note.textContent = 'Handed to your phone to send. Check your Mail app\'s Sent folder to be sure it went.';
            }).catch(function (e) {
              if (e && e.name === 'AbortError') return;
              note.textContent = 'Your phone could not share the files. Use "Save the PDFs" instead and attach them to an email.';
            });
          } }, UI.icon('send'), files.length === 1 ? 'Send the PDF' : 'Send ' + files.length + ' PDFs'))
        : h('div',
          h('p', 'This browser can\'t attach files to an email by itself. Save the PDFs, then attach them to the email that opens.'),
          h('button.btn.primary.big', { type: 'button', onclick: function () {
            download();
            setTimeout(function () {
              location.href = 'mailto:' + encodeURIComponent(office) + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(text);
            }, files.length * 350 + 600);
          } }, UI.icon('send'), 'Save PDFs & open email')),
        h('div.row.gap.wrap', { style: 'margin-top:10px' },
          canShare ? h('button.btn.small', { type: 'button', onclick: download }, 'Save the PDFs instead') : null),
        note));
    }

    startStep();
  }

  window.SendReports = { open: open, makePdf: makePdf, fileName: fileName };
})();
