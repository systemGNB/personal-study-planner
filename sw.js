/* Офлайн-режим.
 * Оболочка и данные кэшируются при установке (данные — по списку из data/manifest.json).
 * Данные и код запрашиваются сначала из сети, без сети — из кэша. Новые файлы из манифеста подхватываются сами.
 * После изменения app.js / styles.css / index.html достаточно поменять CACHE, чтобы сбросить старый кэш. */
var CACHE = 'trainer-v9';
var SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'data/manifest.json'];

function dataFiles() {
  return fetch('data/manifest.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (m) {
    return [m.topics, m.config, m.weeks, m.changelog].concat(m.packs || []).filter(Boolean).map(function (f) { return 'data/' + f; });
  }).catch(function () { return []; });
}

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return c.addAll(SHELL).then(dataFiles).then(function (files) {
      return Promise.all(files.map(function (f) { return c.add(f).catch(function () {}); }));
    });
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  var networkFirst = url.pathname.indexOf('/data/') >= 0 || /\/(app\.js|styles\.css|index\.html)?$/.test(url.pathname);
  if (networkFirst) {
    e.respondWith(fetch(e.request).then(function (res) {
      if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, copy); }); }
      return res;
    }).catch(function () { return caches.match(e.request, { ignoreSearch: true }); }));
  } else {
    e.respondWith(caches.match(e.request).then(function (hit) { return hit || fetch(e.request); }));
  }
});
