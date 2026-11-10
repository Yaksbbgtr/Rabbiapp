/* Small DOM helpers shared by every view. */
(function () {
  'use strict';

  // h('div.card#id', {onclick: fn, style: '...'}, child1, 'text', [children])
  function h(tag, attrs) {
    var m = /^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i.exec(tag) || [];
    var el = document.createElement(m[1] || 'div');
    (m[2] || '').replace(/([.#])([\w-]+)/g, function (_, t, v) {
      if (t === '.') el.classList.add(v); else el.id = v;
    });
    var children = Array.prototype.slice.call(arguments, 2);
    if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
      children.unshift(attrs); attrs = null;
    }
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === undefined || v === null || v === false) return;
        if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'class') el.className += ' ' + v;
        else if (k === 'value') el.value = v;
        else if (k === 'checked' || k === 'selected' || k === 'disabled') el[k] = !!v;
        else if (k === 'html') el.innerHTML = v;
        else el.setAttribute(k, v === true ? '' : v);
      });
    }
    append(el, children);
    return el;
  }
  function append(el, children) {
    children.forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      if (Array.isArray(c)) append(el, c);
      else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    });
  }

  var ICONS = {
    home: 'M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
    users: 'M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0zM4 21c0-4 4-6 8-6s8 2 8 6',
    check: 'M4 12l5 5L20 6',
    book: 'M4 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-5a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h6z',
    star: 'M12 3l2.7 5.6 6.3.9-4.5 4.4 1 6.1-5.5-2.9-5.5 2.9 1-6.1L3 9.5l6.3-.9z',
    clipboard: 'M9 4h6v3H9zM7 5H5v16h14V5h-2M8 12h8M8 16h5',
    calendar: 'M4 6h16v15H4zM4 10h16M8 3v4M16 3v4',
    phone: 'M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z',
    tool: 'M14 6a4 4 0 0 0 5 5l-9 9a2 2 0 0 1-3-3l9-9a4 4 0 0 1-2-2zM14 6l3-3',
    file: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7',
    gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
    plus: 'M12 5v14M5 12h14',
    trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
    edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
    print: 'M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z',
    copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
    shuffle: 'M3 6h4l10 12h4M3 18h4l3-4M14 10l3-4h4M18 3l3 3-3 3M18 15l3 3-3 3',
    chev: 'M9 6l6 6-6 6',
    chevl: 'M15 6l-6 6 6 6'
  };
  function icon(name, size) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', size || 20);
    svg.setAttribute('height', size || 20);
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('icon');
    var p = document.createElementNS(ns, 'path');
    p.setAttribute('d', ICONS[name] || '');
    svg.appendChild(p);
    return svg;
  }

  function modal(title, body, actions) {
    var overlay = h('div.modal-overlay');
    var close = function () { overlay.remove(); document.removeEventListener('keydown', onKey); };
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    var footer = h('div.modal-actions');
    (actions || [{ label: 'Close' }]).forEach(function (a) {
      footer.appendChild(h('button.btn' + (a.primary ? '.primary' : '') + (a.danger ? '.danger' : ''), {
        type: 'button',
        onclick: function () { if (a.onClick && a.onClick() === false) return; close(); }
      }, a.label));
    });
    overlay.appendChild(h('div.modal', { role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div.modal-head', h('h2', title), h('button.icon-btn', { type: 'button', 'aria-label': 'Close', onclick: close }, '×')),
      h('div.modal-body', body),
      footer));
    document.body.appendChild(overlay);
    var first = overlay.querySelector('input, textarea, select');
    if (first) setTimeout(function () { first.focus(); }, 30);
    return { close: close, el: overlay };
  }

  function confirmDialog(message, onYes, label) {
    modal('Are you sure?', h('p', message), [
      { label: 'Cancel' },
      { label: label || 'Delete', danger: true, onClick: onYes }
    ]);
  }

  var toastTimer;
  function toast(msg) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2200);
  }

  // Form field helpers: field('Label', inputEl)
  function field(label, input, hint) {
    return h('label.field', h('span.field-label', label), input, hint ? h('span.hint', hint) : null);
  }
  function input(attrs) { return h('input', Object.assign({ type: 'text', dir: 'auto' }, attrs)); }
  function select(options, value, attrs) {
    var s = h('select', attrs || {});
    options.forEach(function (o) {
      var v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o;
      s.appendChild(h('option', { value: v, selected: String(v) === String(value) }, l));
    });
    return s;
  }

  function fmtDate(iso, opts) {
    if (!iso) return '';
    var p = iso.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return d.toLocaleDateString(undefined, Object.assign({ weekday: 'short', month: 'short', day: 'numeric' }, opts || {}));
  }
  function hebDate(iso, opts) {
    return HebCal.formatHebrew(HebCal.fromRD(HebCal.isoToRD(iso)), opts);
  }
  function addDays(iso, n) { return HebCal.rdToISO(HebCal.isoToRD(iso) + n); }

  function empty(msg, action) {
    return h('div.empty', h('p', msg), action || null);
  }

  function download(filename, text, type) {
    var blob = new Blob([text], { type: type || 'application/json' });
    var a = h('a', { href: URL.createObjectURL(blob), download: filename });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('Copied to clipboard'); });
    } else {
      var ta = h('textarea', { style: 'position:fixed;opacity:0' }, text);
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
      toast('Copied to clipboard');
    }
  }

  function talmidOptions(includeBlank) {
    var opts = Store.activeTalmidim().map(function (t) { return [t.id, Store.displayName(t)]; });
    if (includeBlank) opts.unshift(['', includeBlank === true ? '— Whole class —' : includeBlank]);
    return opts;
  }

  window.UI = {
    h: h, icon: icon, modal: modal, confirm: confirmDialog, toast: toast, field: field,
    input: input, select: select, fmtDate: fmtDate, hebDate: hebDate, addDays: addDays,
    empty: empty, download: download, copyText: copyText, talmidOptions: talmidOptions
  };
})();
