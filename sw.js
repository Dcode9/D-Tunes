/*
 * D'Tunes service worker — offline app shell.
 *
 * Pure web-app concern: it precaches the application shell so D'Tunes opens
 * without a network connection (in the browser and inside the Windows shell,
 * which loads the same origin). Downloaded songs are handled separately by
 * src/js/offline.js. Bump VERSION to publish a new shell.
 */
const VERSION = 'dtunes-shell-v1.1.3';
const NETWORK_TIMEOUT_MS = 3000;

// Same-origin shell assets (no query strings; lookups ignore the ?v= cache-buster).
const SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/DTunes.svg',
  '/haptics.js',
  '/favicon.ico',
  '/assets/favicon.png',
  '/assets/apple-touch-icon.png',
  '/src/css/styles.css',
  '/src/js/preload.js',
  '/src/js/dverseClient.js',
  '/src/js/ai.js',
  '/src/js/recommendationClient.js',
  '/src/js/utils.js',
  '/src/js/api.js',
  '/src/js/spotify.js',
  '/src/js/timer.js',
  '/src/js/state.js',
  '/src/js/context-menu.js',
  '/src/js/offline.js',
  '/src/js/player.js',
  '/src/js/visualizer.js',
  '/src/js/theme.js',
  '/src/js/lyrics.js',
  '/src/js/ui.js',
  '/src/js/search.js',
  '/src/js/ai-hub.js',
  '/src/js/ms-store.js',
  '/src/js/main.js',
  '/src/js/desktop.js'
];

// CDN libraries the app boots with; cached so a cold offline start still works.
const CDN_ASSETS = [
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdnjs.cloudflare.com/ajax/libs/color-thief/2.3.2/color-thief.umd.js'
];

// Third-party origins whose static assets are safe to cache.
const CDN_HOSTS = /(^|\.)(tailwindcss\.com|jsdelivr\.net|cloudflare\.com|fontawesome\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|unpkg\.com)$/i;
// Audio streams: never cache (they are large and handled by the offline store).
const NO_CACHE = /\.(m4a|mp3|aac|opus|webm|ogg|mp4|m4s|ts)(\?|$)/i;
// Live data / API hosts: never cache.
const NO_CACHE_HOSTS = /(saavn|jiosaavn|spotify|scdn|supabase\.co|groq|openai|vercel\.app)/i;

async function precache() {
  const cache = await caches.open(VERSION);
  const entries = SHELL.concat(CDN_ASSETS);
  await Promise.all(entries.map(async (entry) => {
    try {
      const response = await fetch(new Request(entry, { cache: 'reload' }));
      if (response && (response.ok || response.type === 'opaque')) {
        await cache.put(entry, response);
      }
    } catch (err) {
      // A missing optional asset must not abort the whole install.
    }
  }));
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const previousShells = keys.filter((key) => key.startsWith('dtunes-shell-') && key !== VERSION);
    await Promise.all(previousShells.map((key) => caches.delete(key)));
    await self.clients.claim();

    // A replaced shell means an open tab is still running the previous
    // deployment. Reload it now; waiting for a manual refresh can leave users
    // on stale JS for days. First installs have no previous shell and skip this.
    if (previousShells.length > 0) {
      const clients = await self.clients.matchAll({ type: 'window' });
      await Promise.all(clients.map((client) => {
        try {
          return client.navigate(client.url).catch(() => null);
        } catch (_) {
          return null;
        }
      }));
    }
  })());
});

function isCacheableSaavnImage(url, request) {
  if (!/(saavn|jiosaavn|scdn)/i.test(url.hostname)) return false;
  if (request && request.destination === 'image') return true;
  return /\.(jpg|jpeg|png|webp|avif|gif)(\?|$)/i.test(url.pathname);
}

function shouldSkip(url, request) {
  if (NO_CACHE.test(url.pathname)) return true;
  if (NO_CACHE_HOSTS.test(url.hostname)) {
    // Album/artist artwork comes from saavn CDNs; cache only the images.
    return !isCacheableSaavnImage(url, request);
  }
  return false;
}

// Navigation: try the network so deploys are picked up immediately, but never
// let a dead/slow connection hold the app hostage. After the timeout we paint
// the cached shell while the network request continues in the background.
async function networkFirst(request, fallbackKey) {
  const cache = await caches.open(VERSION);
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const cached = (await cache.match(fallbackKey))
      || (await cache.match('/index.html'))
      || (await cache.match('/'));
    if (cached) return cached;
  }
  const network = fetch(request).then((response) => {
    if (response && response.ok) cache.put(fallbackKey, response.clone());
    return response;
  });
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('network-timeout')), NETWORK_TIMEOUT_MS);
  });
  try {
    return await Promise.race([network, timeout]);
  } catch (err) {
    const cached = (await cache.match(fallbackKey))
      || (await cache.match('/index.html'))
      || (await cache.match('/'));
    if (cached) {
      network.catch(() => {});
      return cached;
    }
    try {
      return await network;
    } catch (networkErr) {
      return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    }
  } finally {
    clearTimeout(timer);
  }
}

function urlHasSearch(url) {
  return url.includes('?');
}

function unversionedUrl(url) {
  return url.split('?')[0];
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(VERSION);
  // Prefer the exact request; fall back to the unversioned precache entry.
  const cached = (await cache.match(request))
    || (await cache.match(request, { ignoreSearch: true }));
  const network = fetch(request).then((response) => {
    if (response && (response.ok || response.type === 'opaque')) {
      const writes = [cache.put(request, response.clone())];
      // A ?v= request must also refresh the unversioned shell entry. Otherwise
      // the next lookup matches the old precached copy forever after a deploy.
      if (urlHasSearch(request.url)) {
        writes.push(cache.put(unversionedUrl(request.url), response.clone()));
      }
      Promise.allSettled(writes).catch(() => {});
    }
    return response;
  }).catch(() => null);
  if (cached) {
    network.catch(() => {});
    return cached;
  }
  const fresh = await network;
  if (fresh) return fresh;
  return new Response('', { status: 504 });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, '/index.html'));
    return;
  }

  if (shouldSkip(url, request)) return;

  // Same-origin code/styles: cache-first with a background refresh so an
  // offline start is instant. A new shell version refreshes the cache on
  // install, and online visits pick up changes for the next load.
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  if (CDN_HOSTS.test(url.hostname) || isCacheableSaavnImage(url, request)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
