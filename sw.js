/* BidEst Take-Off Studio — offline cache.
   Bump VERSION whenever you change index.html or js/ so users get the update. */
const VERSION = 'bidest-takeoff-v1.0.0';
const APP_SHELL = [
  './',
  'index.html',
  'js/host.js',
  'js/takeoff.js',
  'assets/demo-gf-plan.pdf',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png'
];
const CDN = [
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(APP_SHELL);
    await Promise.all(CDN.map(u => c.add(new Request(u, { mode: 'cors' })).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const cacheable = sameOrigin || /cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com/.test(url.host);
  if (!cacheable) return;

  // App pages: network first so updates arrive, cache when offline.
  if (sameOrigin && (req.mode === 'navigate' || /\.(html|js|webmanifest)$/.test(url.pathname))) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) (await caches.open(VERSION)).put(req, res.clone());
        return res;
      } catch (_) {
        return (await caches.match(req)) || (await caches.match('index.html'));
      }
    })());
    return;
  }
  // Libraries, fonts, icons: cache first.
  e.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') (await caches.open(VERSION)).put(req, res.clone());
      return res;
    } catch (_) {
      return new Response('', { status: 504 });
    }
  })());
});
