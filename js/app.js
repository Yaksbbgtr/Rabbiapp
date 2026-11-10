/* App shell: navigation + hash router. */
(function () {
  'use strict';
  var h = UI.h;
  var views = {};
  var order = [];

  window.Views = {
    register: function (name, def) { views[name] = def; if (!def.hidden) order.push(name); }
  };

  function currentRoute() {
    var hash = location.hash.replace(/^#\/?/, '') || 'dashboard';
    var parts = hash.split('/');
    return { name: parts[0], params: parts.slice(1).map(decodeURIComponent) };
  }

  function renderNav(active) {
    var nav = document.getElementById('nav');
    nav.innerHTML = '';
    order.forEach(function (name) {
      var v = views[name];
      nav.appendChild(h('a.nav-item' + (name === active || v.matches === active ? '.active' : ''), {
        href: '#/' + name, title: v.title, 'aria-current': name === active ? 'page' : null
      }, UI.icon(v.icon), h('span', v.short || v.title)));
    });
    // Phone only: "More" toggles the full menu
    nav.appendChild(h('button.nav-item.nav-more', {
      type: 'button', 'aria-expanded': document.body.classList.contains('nav-open') ? 'true' : 'false',
      onclick: function () { document.body.classList.toggle('nav-open'); renderNav(active); }
    }, UI.icon('plus'), h('span', document.body.classList.contains('nav-open') ? 'Less' : 'More')));
  }

  function renderHeader() {
    var s = Store.get().settings;
    var rd = HebCal.dateToRD(new Date());
    var hd = HebCal.fromRD(rd);
    var p = HebCal.parshaOfWeek(rd);
    document.getElementById('brand-class').textContent = s.className || 'Rebbi App';
    document.getElementById('header-date').innerHTML = '';
    document.getElementById('header-date').appendChild(h('span',
      h('span.he', HebCal.formatHebrew(hd)), ' · ',
      p.holiday ? p.en : (p.en ? 'Parshas ' + p.en : '')));
  }

  function render() {
    var route = currentRoute();
    var view = views[route.name] || views.dashboard;
    document.body.classList.remove('nav-open');
    var main = document.getElementById('main');
    main.innerHTML = '';
    main.scrollTop = 0;
    window.scrollTo(0, 0);
    renderNav(view.matches || route.name);
    renderHeader();
    document.title = view.title + ' · Rebbi App';
    try {
      view.render(main, route.params);
    } catch (e) {
      console.error(e);
      main.appendChild(h('div.card', h('h2', 'Something went wrong'), h('pre', String(e && e.stack || e))));
    }
    main.focus({ preventScroll: true });
  }

  window.App = { render: render, go: function (path) { location.hash = '#/' + path; } };

  window.addEventListener('hashchange', render);
  window.addEventListener('DOMContentLoaded', function () {
    if (!Store.get().settings.setupDone && !location.hash) location.hash = '#/welcome';
    render();
    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
      // When a new version takes over, reload once so the rebbi sees it right away.
      var hadController = !!navigator.serviceWorker.controller;
      var reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (hadController && !reloaded) { reloaded = true; location.reload(); }
      });
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(function (reg) {
        reg.update();
        document.addEventListener('visibilitychange', function () { if (!document.hidden) reg.update(); });
      }).catch(function () {});
    }
  });
})();
