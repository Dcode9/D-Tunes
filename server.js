const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { getRecommendations, PLAYLIST_TYPES } = require('./lib/recommendationEngine');
const { deduplicateSongs } = require('./lib/deduplication');
const store = require('./lib/jsonStore');
const saavn = require('./lib/saavnClient');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_ROOT = process.cwd();

// ---------------------------------------------------------------------------
// Request hardening
// ---------------------------------------------------------------------------
const MAX_BODY_BYTES = 64 * 1024; // event payloads are small; anything bigger is abuse
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const VALID_EVENT_TYPES = new Set([
  'play_start',
  'play_complete',
  'skip',
  'like',
  'unlike',
  'search_play',
  'playlist_add',
  'repeat',
  'queue_add',
]);
const RATE_LIMIT = { max: 60, windowMs: 60 * 1000 };

function sendJson(res, status, body, extraHeaders = {}) {
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    ...extraHeaders,
  });
  res.end(JSON.stringify(body));
}

function parseBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object') return Promise.resolve(req.body);
    if (typeof req.body === 'string') {
      try { return Promise.resolve(req.body ? JSON.parse(req.body) : {}); } catch (error) { return Promise.reject(error); }
    }
  }
  return new Promise((resolve, reject) => {
    let raw = '';
    let overflowed = false;
    req.on('data', (chunk) => {
      if (overflowed) return;
      raw += chunk;
      if (raw.length > MAX_BODY_BYTES) {
        overflowed = true;
        const error = new Error('Request body too large');
        error.statusCode = 413;
        // Pause (not destroy) so the 413 response can still be delivered.
        req.pause();
        reject(error);
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (error) { reject(error); }
    });
    req.on('error', (err) => reject(err));
  });
}

function sanitizeLimit(raw, fallback = DEFAULT_LIMIT) {
  const value = Math.round(Number(raw));
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(value, MAX_LIMIT);
}

function clientIp(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

const rateBuckets = new Map();
function isRateLimited(key) {
  const now = Date.now();
  if (rateBuckets.size > 5000) {
    for (const [bucketKey, bucket] of rateBuckets) {
      if (now - bucket.start > RATE_LIMIT.windowMs) rateBuckets.delete(bucketKey);
    }
  }
  const bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.start > RATE_LIMIT.windowMs) {
    rateBuckets.set(key, { start: now, count: 1 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT.max;
}

function currentYear(offset = 0) {
  return new Date().getFullYear() + offset;
}

function topKeys(map = {}, count = 3) {
  return Object.entries(map).sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, count).map(([key]) => key).filter(Boolean);
}

// ---------------------------------------------------------------------------
// External (JioSaavn) candidate fetching — parallelized with per-task fallbacks
// ---------------------------------------------------------------------------
async function externalCandidates({ playlistType, profile, options, limit }) {
  const candidates = [];
  const artists = topKeys(profile.artist_scores_json, 3);
  const languages = topKeys(profile.language_scores_json, 2);
  const year = currentYear();
  const safe = (p) => p.catch(() => []);
  const tasks = [];

  if (options.seedSongId) {
    // 1. First get direct recommendation suggestions for this exact track from recommendation backend
    tasks.push(safe(saavn.getSongSuggestions(options.seedSongId, limit)));

    // 2. Seed-anchored discovery (artist top songs, title search, album search)
    tasks.push(safe((async () => {
      const seed = await saavn.getSong(options.seedSongId).catch(() => null);
      if (!seed) return [];
      options.seedSong = seed;
      const subTasks = [];
      if (seed.primary_artists) subTasks.push(safe(saavn.getArtistTopSongs(seed.primary_artists, Math.ceil(limit / 2))));
      subTasks.push(safe(saavn.searchSongs(`${seed.primary_artists} ${seed.title}`, limit)));
      if (seed.album) subTasks.push(safe(saavn.searchSongs(`${seed.album} ${seed.primary_artists}`, limit)));
      return (await Promise.all(subTasks)).flat();
    })()));
  }

  if (options.seedArtist) {
    tasks.push(safe(saavn.getArtistTopSongs(options.seedArtist, limit)));
    tasks.push(safe(saavn.searchSongs(`${options.seedArtist} top songs`, limit)));
  }

  if (options.language) {
    tasks.push(safe(saavn.searchSongs(`top ${options.language} hits ${year}`, limit)));
  }

  if (playlistType === PLAYLIST_TYPES.LATE_NIGHT || playlistType === PLAYLIST_TYPES.CHILL_VIBES) {
    tasks.push(safe(saavn.searchSongs('soft acoustic lofi romantic songs', limit)));
    tasks.push(safe(saavn.searchSongs('midnight chill unplugged melodies', limit)));
  } else if (playlistType === PLAYLIST_TYPES.DISCOVERY || playlistType === PLAYLIST_TYPES.DISCOVER_WEEKLY) {
    tasks.push(safe(saavn.searchSongs(`${languages[0] || ''} new indie trending songs`.trim(), limit)));
    tasks.push(safe(saavn.searchSongs(`fresh breakthrough indie pop ${year}`, limit)));
  } else if (playlistType === PLAYLIST_TYPES.DAILY_MIX_1) {
    if (artists[0]) tasks.push(safe(saavn.getArtistTopSongs(artists[0], limit)));
    tasks.push(safe(saavn.searchSongs(`${languages[0] || ''} top hits`, limit)));
  } else if (playlistType === PLAYLIST_TYPES.DAILY_MIX_2) {
    if (artists[1] || artists[0]) tasks.push(safe(saavn.getArtistTopSongs(artists[1] || artists[0], limit)));
    tasks.push(safe(saavn.searchSongs(`${languages[1] || languages[0] || ''} viral songs`, limit)));
  } else if (playlistType === PLAYLIST_TYPES.RELEASE_RADAR) {
    tasks.push(safe(saavn.searchSongs(`${languages[0] || ''} new releases ${year}`, limit)));
    tasks.push(safe(saavn.searchSongs(`latest new songs ${year}`, limit)));
  }

  for (const artist of artists) {
    tasks.push(safe(saavn.getArtistTopSongs(artist, Math.ceil(limit / 2))));
  }
  for (const language of languages) {
    tasks.push(safe(saavn.searchSongs(`${language} top hits`, Math.ceil(limit / 2))));
  }

  // Always bring in rich trending data
  tasks.push(safe(saavn.getTrending(limit)));

  const results = await Promise.all(tasks);
  for (const group of results) candidates.push(...group);

  return deduplicateSongs(candidates);
}

async function recommendationDeps(options = {}) {
  return {
    getTasteProfile: store.getTasteProfile,
    getRecentEvents: store.getRecentEvents,
    getUserSongScores: store.getUserSongScores,
    getLocalCandidates: store.getLocalCandidates,
    // Merge extra options into the engine's own options object so mutations
    // performed inside externalCandidates (e.g. options.seedSong) propagate
    // back to the scoring context.
    fetchExternalCandidates: (ctx) => externalCandidates({ ...ctx, options: Object.assign(ctx.options, options) }),
  };
}

// ---------------------------------------------------------------------------
// Short-lived in-memory recommendation cache (identical queries are common:
// the home screen requests up to 7 playlists at once across users)
// ---------------------------------------------------------------------------
const playlistCache = new Map();
const PLAYLIST_CACHE_TTL_MS = 10 * 60 * 1000;
const PLAYLIST_CACHE_MAX_ENTRIES = 100;

function readPlaylistCache(key) {
  const entry = playlistCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    playlistCache.delete(key);
    return null;
  }
  return entry.songs;
}

function writePlaylistCache(key, songs) {
  if (playlistCache.size >= PLAYLIST_CACHE_MAX_ENTRIES) {
    const oldestKey = playlistCache.keys().next().value;
    playlistCache.delete(oldestKey);
  }
  playlistCache.set(key, { songs, expiresAt: Date.now() + PLAYLIST_CACHE_TTL_MS });
}

async function cachedRecommendations({ cacheKey, userId, options, deps }) {
  if (cacheKey) {
    const cached = readPlaylistCache(cacheKey);
    if (cached) return cached;
  }
  const songs = await getRecommendations(userId, options, deps);
  const unique = deduplicateSongs(songs);
  if (cacheKey) writePlaylistCache(cacheKey, unique);
  return unique;
}

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------
async function handleApi(req, res, url) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' });
    return res.end();
  }

  if (req.method === 'GET' && url.pathname === '/api/music/health') {
    return sendJson(res, 200, { ok: true, uptimeSeconds: Math.round(process.uptime()) });
  }

  if (req.method === 'POST' && url.pathname === '/api/music/event') {
    if (isRateLimited(clientIp(req))) {
      return sendJson(res, 429, { error: 'Too many events, slow down' });
    }
    const body = await parseBody(req);
    const eventType = String(body.eventType || '');
    if (!body.userId || !eventType || (!body.songSaavnId && !body.song?.saavn_id && !body.song?.id)) {
      return sendJson(res, 400, { error: 'userId, eventType, and songSaavnId/song are required' });
    }
    if (!VALID_EVENT_TYPES.has(eventType)) {
      return sendJson(res, 400, { error: `Unsupported eventType '${eventType}'` });
    }
    if (String(body.userId).length > 128) {
      return sendJson(res, 400, { error: 'userId too long' });
    }
    const event = store.recordEvent(body);
    return sendJson(res, 201, { event });
  }

  if (req.method === 'POST' && url.pathname === '/api/music/recalculate-profile') {
    const body = await parseBody(req);
    const userId = body.userId || url.searchParams.get('userId') || 'anonymous';
    if (String(userId).length > 128) {
      return sendJson(res, 400, { error: 'userId too long' });
    }
    return sendJson(res, 200, { profile: store.rebuildUserTasteProfile(userId) });
  }

  if (req.method === 'GET' && url.pathname === '/api/music/recommendations') {
    const userId = url.searchParams.get('userId') || 'anonymous';
    const type = url.searchParams.get('type') || PLAYLIST_TYPES.FOR_YOU;
    const limit = sanitizeLimit(url.searchParams.get('limit'));
    const language = url.searchParams.get('language');
    const deps = await recommendationDeps({ language });
    const songs = await cachedRecommendations({
      cacheKey: `rec:${userId}:${type}:${language}:${limit}`,
      userId,
      options: { limit, playlistType: type, language },
      deps,
    });
    return sendJson(res, 200, { songs });
  }

  if (req.method === 'GET' && url.pathname === '/api/music/similar') {
    const seedSongId = url.searchParams.get('songId');
    const limit = sanitizeLimit(url.searchParams.get('limit'));
    if (!seedSongId) return sendJson(res, 400, { error: 'songId is required' });
    const deps = await recommendationDeps({ seedSongId });
    const songs = await cachedRecommendations({
      cacheKey: seedSongId ? `similar:${seedSongId}:${limit}` : null,
      userId: 'anonymous',
      options: { limit, playlistType: PLAYLIST_TYPES.SIMILAR, seedSongId },
      deps,
    });
    return sendJson(res, 200, { songs });
  }

  if (req.method === 'GET' && url.pathname === '/api/music/artist-radio') {
    const seedArtist = url.searchParams.get('artist');
    const userId = url.searchParams.get('userId') || 'anonymous';
    const limit = sanitizeLimit(url.searchParams.get('limit'));
    if (!seedArtist) return sendJson(res, 400, { error: 'artist is required' });
    const deps = await recommendationDeps({ seedArtist });
    const songs = await cachedRecommendations({
      cacheKey: `radio:${seedArtist}:${userId}:${limit}`,
      userId,
      options: { limit, playlistType: PLAYLIST_TYPES.ARTIST_RADIO, seedArtist },
      deps,
    });
    return sendJson(res, 200, { songs });
  }

  if (req.method === 'GET' && url.pathname === '/api/music/playlist') {
    const type = url.searchParams.get('type') || PLAYLIST_TYPES.LATE_NIGHT;
    const userId = url.searchParams.get('userId') || 'anonymous';
    const limit = sanitizeLimit(url.searchParams.get('limit'));
    const language = url.searchParams.get('language');
    const deps = await recommendationDeps({ language });
    const songs = await cachedRecommendations({
      cacheKey: `playlist:${userId}:${type}:${language}:${limit}`,
      userId,
      options: { limit, playlistType: type, language },
      deps,
    });
    return sendJson(res, 200, { songs });
  }

  return sendJson(res, 404, { error: 'Not found' });
}

// ---------------------------------------------------------------------------
// Static assets — allowlist of public paths + cache headers
// ---------------------------------------------------------------------------
const PRIVATE_PATH_SEGMENTS = new Set([
  'data', 'db', 'lib', 'tests', 'api', 'node_modules', 'downloads', '.git', '.jules', '.agents', '.github', '.idea', '.vscode',
]);
const PRIVATE_ROOT_FILES = new Set([
  'server.js', 'package.json', 'package-lock.json', 'vercel.json', 'metadata.json', '.env', '.env.example', '.gitignore',
]);

function isBlockedStaticPath(pathname) {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.some((segment) => segment.startsWith('.') && segment !== '.')) return true;
  const first = segments[0];
  if (first && PRIVATE_PATH_SEGMENTS.has(first)) return true;
  const lastName = segments[segments.length - 1];
  if (segments.length <= 2 && lastName && PRIVATE_ROOT_FILES.has(lastName)) return true;
  return false;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

const IMMUTABLE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg', '.woff', '.woff2']);

function serveStatic(req, res, url) {
  if (isBlockedStaticPath(url.pathname)) {
    res.writeHead(403, { 'content-type': 'text/plain', 'x-content-type-options': 'nosniff' });
    return res.end('Forbidden');
  }
  const requested = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  let filePath = path.normalize(path.join(PUBLIC_ROOT, requested));
  if (!filePath.startsWith(PUBLIC_ROOT + path.sep) && filePath !== PUBLIC_ROOT) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }
  fs.readFile(filePath, (error, data) => {
    if (error) { res.writeHead(404); return res.end('Not found'); }
    const ext = path.extname(filePath).toLowerCase();
    const stat = fs.statSync(filePath);
    const etag = `W/"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { etag });
      return res.end();
    }
    const headers = {
      'content-type': MIME_TYPES[ext] || 'application/octet-stream',
      etag,
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'cache-control': IMMUTABLE_EXTENSIONS.has(ext)
        ? 'public, max-age=86400'
        : 'no-cache',
    };
    res.writeHead(200, headers);
    res.end(data);
  });
}

if (require.main === module) {
  http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    try {
      if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
      return serveStatic(req, res, url);
    } catch (error) {
      return sendJson(res, error.statusCode || 500, { error: error.statusCode ? error.message : 'Internal server error' });
    }
  }).listen(PORT, '0.0.0.0', () => {
    console.log(`D'Tunes listening on http://0.0.0.0:${PORT}`);
  });
}

module.exports = async (req, res) => {
  try {
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const url = new URL(req.url, `${protocol}://${host}`);
    return await handleApi(req, res, url);
  } catch (error) {
    return sendJson(res, error.statusCode || 500, { error: error.statusCode ? error.message : 'Internal server error' });
  }
};

module.exports.__testables = { sanitizeLimit, isBlockedStaticPath, parseBody, VALID_EVENT_TYPES, currentYear };
