// ODT Service Worker
// Bumping CACHE_VERSION forces all clients to download fresh assets on next visit.
const CACHE_VERSION = 'odt-v1';

// Assets pre-cached on install — everything needed for full offline use.
// Large files (contours.pmtiles ~87MB) are included so the map works
// completely offline. This is a one-time download, best done on WiFi.
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/styles.css',
  '/lib/maplibre-gl.js',
  '/lib/maplibre-gl.css',
  '/lib/pmtiles.js',
  '/js/app.js',
  '/js/config.js',
  '/js/elevation.js',
  '/js/gps.js',
  '/js/map.js',
  '/js/modals.js',
  '/js/moon.js',
  '/js/utils.js',
  '/js/weather.js',
  '/waypoints.json',
  '/water.json',
  '/towns.json',
  '/navigation.json',
  '/toilets.json',
  '/elevation-profile.json',
  '/basemap.pmtiles',
  '/route.pmtiles',
  '/overlay.pmtiles',
  '/contours.pmtiles',
];

// ─── Install ──────────────────────────────────────────────────────────────────
// Open the cache and pre-fetch everything. If any fetch fails the install
// fails too, so the old SW stays active — safe fallback behaviour.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  // Take control immediately rather than waiting for old tabs to close.
  self.skipWaiting();
});

// ─── Activate ─────────────────────────────────────────────────────────────────
// Delete any caches from previous versions so stale assets don't linger.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ─── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests (skip external analytics, etc.)
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith('.pmtiles')) {
    event.respondWith(handlePmtiles(request));
  } else if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApi(request));
  } else {
    event.respondWith(handleStatic(request));
  }
});

// ─── Static assets (cache-first) ──────────────────────────────────────────────
// JS, CSS, JSON, HTML — serve from cache, fall back to network.
async function handleStatic(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_VERSION);
    cache.put(request, response.clone());
  }
  return response;
}

// ─── Weather API (network-first with cache fallback) ──────────────────────────
// Always try the network for fresh forecasts. If offline, serve the last
// cached response. The app also keeps its own localStorage cache as a second
// fallback, so even an old SW cache is belt-and-suspenders.
async function handleApi(request) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    return cached || new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ─── PMTiles (range-request aware cache) ──────────────────────────────────────
// PMTiles fetches byte ranges from the .pmtiles files.  A standard cache
// match won't satisfy a Range request, so we slice the cached ArrayBuffer
// ourselves and return a 206 Partial Content response.
async function handlePmtiles(request) {
  const rangeHeader = request.headers.get('range');
  const cache = await caches.open(CACHE_VERSION);

  // Look up the full file in cache (without a Range header).
  const baseRequest = new Request(request.url);
  const cached = await cache.match(baseRequest);

  if (cached && rangeHeader) {
    return sliceResponse(cached, rangeHeader);
  }

  if (cached) return cached;

  // Not in cache yet — fetch from network, cache full response, then slice.
  try {
    const fullRequest = new Request(request.url);
    const response = await fetch(fullRequest);
    if (response.ok) {
      cache.put(baseRequest, response.clone());
      if (rangeHeader) return sliceResponse(response.clone(), rangeHeader);
    }
    return response;
  } catch {
    return new Response('Offline — map tiles not cached', { status: 503 });
  }
}

// Parse a "bytes=start-end" Range header and return a 206 response.
async function sliceResponse(response, rangeHeader) {
  const buffer = await response.arrayBuffer();
  const total = buffer.byteLength;
  const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
  if (!match) return new Response(buffer, { status: 200 });

  const start = parseInt(match[1], 10);
  const end = match[2] ? parseInt(match[2], 10) : total - 1;
  const sliced = buffer.slice(start, end + 1);

  return new Response(sliced, {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Content-Length': String(sliced.byteLength),
    },
  });
}
