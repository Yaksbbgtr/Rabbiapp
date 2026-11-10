/* Offline support: cache the app shell, serve cache-first, refresh in background. */
var CACHE = 'rebbi-app-v1';
var ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'icons/icon.svg', 'css/app.css',
  'js/hebcal.js', 'js/store.js', 'js/demo.js', 'js/ui.js', 'js/scan.js', 'js/app.js',
  'js/views/dashboard.js', 'js/views/talmidim.js', 'js/views/attendance.js', 'js/views/limud.js',
  'js/views/middos.js', 'js/views/bechinos.js', 'js/views/planner.js', 'js/views/parents.js',
  'js/views/tools.js', 'js/views/reports.js', 'js/views/settings.js'
];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(function (cached) {
    var network = fetch(e.request).then(function (res) {
      if (res && res.ok && new URL(e.request.url).origin === location.origin) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      }
      return res;
    }).catch(function () { return cached; });
    return cached || network;
  }));
});
