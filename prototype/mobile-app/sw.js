/* PDA离线壳:缓存APP壳与桥接层,单据页走网(M mock保底). */
var CACHE = 'wms-pda-v1';
var CORE = ['./screens/home.html', './screens/scan.html', '../api-client.js',
  './app-bridge.js', './manifest.json'];
self.addEventListener('install', function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(CORE); })
    .then(function(){ return self.skipWaiting(); }));
});
self.addEventListener('fetch', function(e){
  var url = new URL(e.request.url);
  if(url.pathname.indexOf('/api/') > -1) return;
  e.respondWith(caches.match(e.request).then(function(hit){ return hit || fetch(e.request); }));
});
