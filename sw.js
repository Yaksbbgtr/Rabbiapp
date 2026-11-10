/*
 * Offline support.
 * Online: always fetch the newest files (bypassing the browser cache) and keep a copy.
 * Offline: serve the saved copy.
 */
var CACHE = 'rebbi-app-v1';
var ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'icons/logo-white.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
  'js/hebcal.js', 'js/store.js', 'js/demo.js', 'js/ui.js', 'js/scan.js', 'js/app.js',
  'js/views/dashboard.js', 'js/views/talmidim.js', 'js/views/attendance.js', 'js/views/limud.js',
  'js/views/bechinos.js', 'js/views/planner.js', 'js/views/parents.js',
  'js/views/tools.js', 'js/views/reports.js', 'js/views/settings.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(ASSETS.map(function (url) {
      return fetch(url, { cache: 'reload' }).then(function (res) { if (res.ok) return c.put(url, res); });
    }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return; // let the browser handle CDN files
  e.respondWith(
    fetch(req, { cache: 'no-cache' }).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (hit) {
        return hit || caches.match('index.html');
      });
    })
  );
});
