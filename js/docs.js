/*
 * Documents on a limud's source notes: worksheets, PDFs, pictures, Word files… picked from the computer or phone.
 *
 * Signed in (sync on): the file goes to the cloud (Supabase Storage), so it opens on every device, and the office
 * can see it like the rest of the class. Not signed in: it's kept on this device only (IndexedDB).
 * The list itself (name, size, where it is) is part of the limud, unit.files, and syncs with the class.
 */
(function () {
  'use strict';
  var h = UI.h;
  var MAX = 25 * 1024 * 1024;

  // ---------- this device's copies (IndexedDB) ----------
  var dbp = null;
  function idb() {
    if (!dbp) dbp = new Promise(function (ok, fail) {
      var r = indexedDB.open('rabbiapp-docs', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('files'); };
      r.onsuccess = function () { ok(r.result); };
      r.onerror = function () { dbp = null; fail(r.error); };
    });
    return dbp;
  }
  function idbDo(mode, fn) {
    return idb().then(function (db) {
      return new Promise(function (ok, fail) {
        var tx = db.transaction('files', mode), req = fn(tx.objectStore('files'));
        tx.oncomplete = function () { ok(req && req.result); };
        tx.onerror = tx.onabort = function () { fail(tx.error || new Error('storage error')); };
      });
    });
  }

  function safeName(n) { return String(n || 'file').replace(/[^\w.\-]+/g, '_').replace(/^_+|_+$/g, '').slice(-120) || 'file'; }
  function sizeText(b) { return b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
  function kind(f) {
    var n = (f.name || '').toLowerCase();
    if (/^image\//.test(f.type)) return 'Picture';
    if (/\.pdf$/.test(n)) return 'PDF';
    if (/\.(docx?|pages|rtf|odt)$/.test(n)) return 'Document';
    if (/\.(xlsx?|csv|numbers)$/.test(n)) return 'Spreadsheet';
    if (/\.(pptx?|key)$/.test(n)) return 'Slides';
    if (/^audio\//.test(f.type)) return 'Audio';
    if (/^video\//.test(f.type)) return 'Video';
    return 'File';
  }
  function cloudOK() {
    var p = Store.currentProfile();
    return !!(window.Sync && Sync.isOn() && p && p.cloud);
  }

  // Adds the picked files to the limud. Resolves when they're all saved (or skipped).
  function add(u, files, status) {
    var p = Store.currentProfile();
    var list = Array.prototype.slice.call(files || []);
    var done = 0, skipped = [];
    function next() {
      if (!list.length) return Promise.resolve();
      var file = list.shift();
      if (file.size > MAX) { skipped.push(file.name + ' (over 25 MB)'); return next(); }
      var id = Store.uid();
      var meta = { id: id, name: file.name || 'file', size: file.size, type: file.type || '', at: new Date().toISOString() };
      status('Adding ' + meta.name + '…');
      var save = cloudOK()
        ? Sync.uploadFile(p.id + '/' + u.id + '/' + id + '/' + safeName(meta.name), file).then(function (d) {
          meta.where = 'cloud'; meta.path = (d && d.path) || p.id + '/' + u.id + '/' + id + '/' + safeName(meta.name);
        })
        : idbDo('readwrite', function (s) { return s.put(file, id); }).then(function () { meta.where = 'device'; });
      return save.then(function () {
        Store.update(function () { u.files = (u.files || []).concat([meta]); });
        done++;
      }, function (e) { skipped.push(meta.name + ' (' + (e && e.message || 'error') + ')'); }).then(next);
    }
    return next().then(function () {
      status('');
      if (done) UI.toast(done === 1 ? 'Document added' : done + ' documents added');
      if (skipped.length) alert('Not added:\n' + skipped.join('\n'));
    });
  }

  // Opens the file in a new tab (PDFs and pictures show; other kinds download).
  function open(f) {
    // Open the tab now, while it still counts as a tap (Safari blocks it after waiting), then send it to the file.
    var w = window.open('', '_blank');
    var go = function (url) { if (w) w.location.href = url; else location.href = url; };
    var fail = function (msg) { if (w) w.close(); UI.toast(msg); };
    if (f.where === 'cloud') {
      if (!window.Sync || !Sync.isOn()) return fail('Sign in (Settings → Sync) to open this document');
      Sync.fileURL(f.path).then(go, function (e) { fail('Couldn\'t open it: ' + e.message); });
    } else {
      idbDo('readonly', function (s) { return s.get(f.id); }).then(function (blob) {
        if (!blob) return fail('This document was added on another device without sync, so it isn\'t on this one');
        go(URL.createObjectURL(blob));
      }, function () { fail('Couldn\'t open it'); });
    }
  }

  function removeStored(files) {
    var cloud = files.filter(function (f) { return f.where === 'cloud' && f.path; }).map(function (f) { return f.path; });
    var local = files.filter(function (f) { return f.where !== 'cloud'; });
    return Promise.all([
      cloud.length && window.Sync ? Sync.removeFiles(cloud).catch(function () { /* already gone / offline */ }) : null,
      local.length ? idbDo('readwrite', function (s) { local.forEach(function (f) { s.delete(f.id); }); }).catch(function () {}) : null
    ]);
  }
  function remove(u, f) {
    UI.confirm('Remove "' + f.name + '" from this limud?', function () {
      Store.update(function () { u.files = (u.files || []).filter(function (x) { return x.id !== f.id; }); });
      removeStored([f]);
      UI.toast('Removed'); App.render();
    }, 'Remove');
  }

  function card(u) {
    var files = u.files || [];
    var status = h('span.small.muted', { 'aria-live': 'polite' });
    var picker = h('input', { type: 'file', multiple: true, hidden: true, onchange: function () {
      var fl = picker.files; if (!fl || !fl.length) return;
      addBtn.disabled = true;
      add(u, fl, function (t) { status.textContent = t; }).then(function () { App.render(); });
    } });
    var addBtn = h('button.btn', { type: 'button', onclick: function () { picker.value = ''; picker.click(); } }, UI.icon('plus', 16), 'Add a document');
    var where = cloudOK() ? 'Saved to the cloud, so they open on all your devices.' : 'Saved on this device only (sign in to sync to keep them on all your devices).';
    return h('div.card.docs-card',
      h('h2', 'Documents'),
      files.length ? h('div.doc-list', files.map(function (f) {
        return h('div.doc-row',
          UI.icon('file', 20),
          h('button.link.grow.doc-open', { type: 'button', title: 'Open', onclick: function () { open(f); } },
            h('span.doc-name', { dir: 'auto' }, f.name),
            h('span.small.muted', kind(f) + ' · ' + sizeText(f.size || 0) + (f.where === 'device' ? ' · this device only' : ''))),
          h('button.lesson-x', { type: 'button', title: 'Remove', 'aria-label': 'Remove ' + f.name, onclick: function () { remove(u, f); } }, UI.icon('x', 16)));
      })) : h('p.small.muted', 'Worksheets, PDFs, pictures of a sefer page… anything you use to teach this limud.'),
      h('div.row.gap.wrap', { style: 'align-items:center' }, addBtn, status, picker),
      h('p.small.muted', { style: 'margin-top:8px' }, where + ' Up to 25 MB each.'));
  }

  window.Docs = { card: card, add: add, open: open, removeAll: function (u) { return removeStored(u.files || []); } };
})();
