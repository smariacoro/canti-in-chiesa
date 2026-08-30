// Service worker: rende l'app pienamente utilizzabile senza rete.
// Strategia: cache-first con aggiornamento in background (stale-while-revalidate),
// così in chiesa l'apertura è istantanea anche con una linea pessima.

const VERSION = 'v7';
const CACHE = `canti-in-chiesa-${VERSION}`;

const PRECACHE = [
  './',
  'index.html',
  'guida.html',
  'manifest.webmanifest',
  'config.js',
  'css/app.css',
  'js/main.js',
  'js/router.js',
  'js/store.js',
  'js/sync.js',
  'js/ui.js',
  'js/render.js',
  'js/chords.js',
  'js/audio.js',
  'js/score.js',
  'vendor/abcjs-basic-min.js',
  'js/views/songs.js',
  'js/views/song.js',
  'js/views/setlists.js',
  'js/views/print.js',
  'js/views/settings.js',
  'data/songs.json',
  'icons/logo.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // addAll fallirebbe in blocco al primo 404: qui ogni file è indipendente
    await Promise.all(PRECACHE.map(async (url) => {
      try { await cache.add(new Request(url, { cache: 'reload' })); }
      catch (e) { console.warn('[sw] non messo in cache:', url, e); }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;   // Supabase: sempre dalla rete

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // ignoreSearch solo per le navigazioni (#/... e simili): sulle risorse
    // annullerebbe i parametri di versione, servendo file vecchi.
    const cached = await cache.match(request, { ignoreSearch: request.mode === 'navigate' });

    const network = fetch(request).then((res) => {
      if (res && res.ok) cache.put(request, res.clone());
      return res;
    }).catch(() => null);

    if (cached) {
      event.waitUntil(network);
      return cached;
    }

    const fresh = await network;
    if (fresh) return fresh;

    // offline e mai visitato: per una navigazione serviamo comunque l'app
    if (request.mode === 'navigate') {
      const shell = await cache.match('index.html');
      if (shell) return shell;
    }
    return new Response('Contenuto non disponibile offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  })());
});
