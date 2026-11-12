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
    var admin = Store.isAdmin();
    var names = order.filter(function (name) { var v = views[name]; return admin ? v.admin : !v.adminOnly; });
    if (admin) names.sort(function (a, b) { return (a === 'settings') - (b === 'settings'); }); // Settings last
    names.forEach(function (name) {
      var v = views[name];
      var count = v.badge ? v.badge() : 0;
      nav.appendChild(h('a.nav-item' + (name === active || v.matches === active ? '.active' : ''), {
        href: '#/' + name, title: v.title, 'aria-current': name === active ? 'page' : null
      }, UI.icon(v.icon), h('span', v.short || v.title), count ? h('span.nav-badge', String(count)) : null));
    });
  }

  function renderHeader() {
    UI.themeButtons(document.getElementById('theme-seg'), function () { if (currentRoute().name === 'settings') render(); });
    var s = Store.get().settings;
    var rd = HebCal.dateToRD(new Date());
    var hd = HebCal.fromRD(rd);
    var p = HebCal.parshaOfWeek(rd);
    document.getElementById('brand-class').textContent = s.className ? ' · ' + s.className : '';
    document.getElementById('header-date').innerHTML = '';
    var today = new Date();
    document.getElementById('header-date').appendChild(h('span',
      h('span.en-date', today.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })), ' · ',
      h('span.he', HebCal.formatHebrew(hd)), ' · ',
      p.holiday ? p.en : (p.en ? 'Parshas ' + p.en : '')));
  }

  var lastHash = null;
  function render() {
    var route = currentRoute();
    var profile = Store.currentProfile();
    // Nobody logged in: only the login screen is available.
    if (!profile) route = { name: 'login', params: [] };
    else if (route.name === 'login') route = { name: Store.isAdmin() ? 'admin' : 'dashboard', params: [] };
    // An administrator only has the admin pages and settings.
    if (profile && Store.isAdmin() && !(views[route.name] && views[route.name].admin)) route = { name: 'admin', params: [] };
    document.body.classList.toggle('logged-out', !profile);
    var pb = document.getElementById('profile-btn');
    pb.textContent = profile ? Profiles.initials(profile.name) : '';
    pb.setAttribute('aria-label', profile ? 'Profile: ' + profile.name : 'Profile');
    var view = views[route.name] || views[Store.isAdmin() ? 'admin' : 'dashboard'];
    setMenu(false);
    document.getElementById('topbar-title').textContent = view.short || view.title;
    var main = document.getElementById('main');
    // Re-rendering the same page (after an edit) keeps the scroll position.
    var samePage = location.hash === lastHash;
    var keepY = window.scrollY;
    lastHash = location.hash;
    main.innerHTML = '';
    renderNav(view.matches || route.name);
    renderHeader();
    document.title = view.title + ' · Rebbi App';
    try {
      view.render(main, route.params);
    } catch (e) {
      console.error(e);
      main.appendChild(h('div.card', h('h2', 'Something went wrong'), h('pre', String(e && e.stack || e))));
    }
    if (samePage) window.scrollTo(0, keepY);
    else { window.scrollTo(0, 0); main.focus({ preventScroll: true }); }
  }

  // Phone menu (hamburger)
  function setMenu(open) {
    document.body.classList.toggle('nav-open', open);
    var btn = document.getElementById('menu-btn');
    if (btn) {
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    }
  }
  window.addEventListener('DOMContentLoaded', function () {
    document.getElementById('menu-btn').addEventListener('click', function () {
      setMenu(!document.body.classList.contains('nav-open'));
    });
    document.getElementById('nav-backdrop').addEventListener('click', function () { setMenu(false); });
    document.getElementById('nav').addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });
  });

  // Swipe from the left edge to open the menu; swipe left to close it (phones).
  (function () {
    var EDGE = 40, sidebar, backdrop, drag = null;
    function isPhone() { return window.matchMedia('(max-width: 860px)').matches; }
    function width() { return sidebar.getBoundingClientRect().width; }
    function place(x) { // x = how many px of the menu are showing
      var w = width();
      x = Math.max(0, Math.min(w, x));
      sidebar.style.transition = 'none';
      sidebar.classList.add('dragging');
      sidebar.style.transform = 'translateX(' + (x - w) + 'px)';
      backdrop.style.display = 'block';
      backdrop.style.opacity = String(x / w);
    }
    function release() {
      sidebar.style.transition = ''; sidebar.style.transform = ''; sidebar.classList.remove('dragging');
      backdrop.style.display = ''; backdrop.style.opacity = '';
    }
    document.addEventListener('touchstart', function (e) {
      sidebar = sidebar || document.getElementById('sidebar');
      backdrop = backdrop || document.getElementById('nav-backdrop');
      drag = null;
      if (!isPhone() || e.touches.length !== 1 || document.querySelector('.modal-overlay') || document.body.classList.contains('logged-out')) return;
      var t = e.touches[0];
      var open = document.body.classList.contains('nav-open');
      if (!open && t.clientX > EDGE) return;
      drag = { x0: t.clientX, y0: t.clientY, open: open, active: false, x: t.clientX, t0: Date.now() };
    }, { passive: true });
    document.addEventListener('touchmove', function (e) {
      if (!drag) return;
      var t = e.touches[0], dx = t.clientX - drag.x0, dy = t.clientY - drag.y0;
      if (!drag.active) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (Math.abs(dy) > Math.abs(dx) || (drag.open ? dx > 0 : dx < 0)) { drag = null; return; } // scrolling, or wrong way
        drag.active = true;
      }
      if (e.cancelable) e.preventDefault();
      drag.x = t.clientX;
      place(drag.open ? width() + dx : dx);
    }, { passive: false });
    function end() {
      if (!drag) return;
      var d = drag; drag = null;
      if (!d.active) return;
      var dx = d.x - d.x0, fast = Math.abs(dx) / Math.max(1, Date.now() - d.t0) > 0.5;
      var far = Math.abs(dx) > width() * 0.35;
      release();
      setMenu(d.open ? !(far || (fast && dx < -20)) : (far || (fast && dx > 20)));
    }
    document.addEventListener('touchend', end);
    document.addEventListener('touchcancel', end);
  })();

  // Replaced with the commit and build time by the GitHub Pages workflow; 'dev' when run locally.
  var APP_VERSION = 'dev';
  var APP_BUILT = '';

  // Throw away every saved copy of the app and load the newest files from the site.
  function forceUpdate() {
    var urls = ['index.html', 'sw.js'].concat(
      [].slice.call(document.querySelectorAll('script[src]')).map(function (x) { return x.getAttribute('src'); }),
      [].slice.call(document.querySelectorAll('link[rel=stylesheet][href]')).map(function (x) { return x.getAttribute('href'); }).filter(function (u) { return !/^https?:/.test(u); }));
    var sw = 'serviceWorker' in navigator ? navigator.serviceWorker.getRegistrations().then(function (rs) { return Promise.all(rs.map(function (r) { return r.unregister(); })); }) : Promise.resolve();
    var caches_ = window.caches ? caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); }) : Promise.resolve();
    return Promise.all([sw, caches_]).then(function () {
      return Promise.all(urls.map(function (u) { return fetch(u, { cache: 'reload' }).catch(function () {}); }));
    }).then(function () { location.reload(); });
  }

  // If the site has a newer version than the one running, update right away (at most once a minute).
  function checkForUpdate() {
    if (APP_VERSION === 'dev' || location.protocol.indexOf('http') !== 0) return;
    fetch('version.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (v) {
      if (!v || !v.version || v.version === APP_VERSION) return;
      var last = 0;
      try { last = +sessionStorage.getItem('rabbiapp.updateTry') || 0; sessionStorage.setItem('rabbiapp.updateTry', String(Date.now())); } catch (e) { /* ignore */ }
      if (Date.now() - last < 60000) return;
      UI.toast('Updating to the newest version…');
      forceUpdate();
    }).catch(function () { /* offline */ });
  }

  window.App = { render: render, go: function (path) { location.hash = '#/' + path; },
    version: APP_VERSION, built: APP_BUILT, forceUpdate: forceUpdate, checkForUpdate: checkForUpdate };

  window.addEventListener('hashchange', render);
  window.addEventListener('DOMContentLoaded', function () {
    UI.setTheme(UI.getTheme());
    document.getElementById('profile-btn').addEventListener('click', function () { Profiles.menu(); });
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
    // Phones often keep the app open for days: check for a newer version on start and whenever it comes back.
    checkForUpdate();
    document.addEventListener('visibilitychange', function () { if (!document.hidden) checkForUpdate(); });
  });
})();
