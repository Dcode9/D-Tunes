const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { getRecommendations, PLAYLIST_TYPES } = require('./lib/recommendationEngine');
const store = require('./lib/jsonStore');
const saavn = require('./lib/saavnClient');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_ROOT = process.cwd();

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify(body));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (error) { reject(error); }
    });
  });
}

function topKeys(map = {}, count = 3) {
  return Object.entries(map).sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, count).map(([key]) => key).filter(Boolean);
}

async function externalCandidates({ playlistType, profile, options, limit }) {
  const candidates = [];
  const artists = topKeys(profile.artist_scores_json, 3);
  const languages = topKeys(profile.language_scores_json, 2);

  if (options.seedSongId) {
    const seed = await saavn.getSong(options.seedSongId).catch(() => null);
    if (seed) {
      options.seedSong = seed;
      candidates.push(...await saavn.searchSongs(`${seed.primary_artists} ${seed.title}`, limit).catch(() => []));
      if (seed.album) candidates.push(...await saavn.searchSongs(`${seed.album} ${seed.primary_artists}`, limit).catch(() => []));
    }
  }

  if (options.seedArtist) candidates.push(...await saavn.searchSongs(options.seedArtist, limit).catch(() => []));
  if (options.language) candidates.push(...await saavn.searchSongs(`${options.language} songs`, limit).catch(() => []));

  if (playlistType === PLAYLIST_TYPES.LATE_NIGHT) {
    candidates.push(...await saavn.searchSongs('soft acoustic romantic songs', limit).catch(() => []));
  } else if (playlistType === PLAYLIST_TYPES.DISCOVERY) {
    candidates.push(...await saavn.searchSongs(`${languages[0] || ''} new indie songs`.trim(), limit).catch(() => []));
  }

  for (const artist of artists) candidates.push(...await saavn.searchSongs(artist, Math.ceil(limit / 2)).catch(() => []));
  for (const language of languages) candidates.push(...await saavn.searchSongs(`${language} songs`, Math.ceil(limit / 2)).catch(() => []));
  candidates.push(...await saavn.getTrending(limit).catch(() => []));
  return candidates;
}

async function recommendationDeps(options = {}) {
  return {
    getTasteProfile: store.getTasteProfile,
    getRecentEvents: store.getRecentEvents,
    getUserSongScores: store.getUserSongScores,
    getLocalCandidates: store.getLocalCandidates,
    fetchExternalCandidates: (ctx) => externalCandidates({ ...ctx, options: { ...ctx.options, ...options } }),
  };
}

async function handleApi(req, res, url) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' });
    return res.end();
  }

  if (req.method === 'POST' && url.pathname === '/api/music/event') {
    const body = await parseBody(req);
    if (!body.userId || !body.eventType || (!body.songSaavnId && !body.song?.saavn_id && !body.song?.id)) {
      return sendJson(res, 400, { error: 'userId, eventType, and songSaavnId/song are required' });
    }
    const event = store.recordEvent(body);
    return sendJson(res, 201, { event });
  }

  if (req.method === 'POST' && url.pathname === '/api/music/recalculate-profile') {
    const body = await parseBody(req);
    const userId = body.userId || url.searchParams.get('userId') || 'anonymous';
    return sendJson(res, 200, { profile: store.rebuildUserTasteProfile(userId) });
  }

  if (req.method === 'GET' && url.pathname === '/api/music/recommendations') {
    const userId = url.searchParams.get('userId') || 'anonymous';
    const type = url.searchParams.get('type') || PLAYLIST_TYPES.FOR_YOU;
    const limit = Number(url.searchParams.get('limit') || 25);
    const deps = await recommendationDeps({ language: url.searchParams.get('language') });
    const songs = await getRecommendations(userId, { limit, playlistType: type, language: url.searchParams.get('language') }, deps);
    return sendJson(res, 200, { songs });
  }

  if (req.method === 'GET' && url.pathname === '/api/music/similar') {
    const seedSongId = url.searchParams.get('songId');
    const limit = Number(url.searchParams.get('limit') || 25);
    const deps = await recommendationDeps({ seedSongId });
    const songs = await getRecommendations('anonymous', { limit, playlistType: PLAYLIST_TYPES.SIMILAR, seedSongId }, deps);
    return sendJson(res, 200, { songs });
  }

  if (req.method === 'GET' && url.pathname === '/api/music/artist-radio') {
    const seedArtist = url.searchParams.get('artist');
    const userId = url.searchParams.get('userId') || 'anonymous';
    const limit = Number(url.searchParams.get('limit') || 25);
    const deps = await recommendationDeps({ seedArtist });
    const songs = await getRecommendations(userId, { limit, playlistType: PLAYLIST_TYPES.ARTIST_RADIO, seedArtist }, deps);
    return sendJson(res, 200, { songs });
  }

  if (req.method === 'GET' && url.pathname === '/api/music/playlist') {
    const type = url.searchParams.get('type') || PLAYLIST_TYPES.LATE_NIGHT;
    const userId = url.searchParams.get('userId') || 'anonymous';
    const limit = Number(url.searchParams.get('limit') || 25);
    const deps = await recommendationDeps({ language: url.searchParams.get('language') });
    const songs = await getRecommendations(userId, { limit, playlistType: type, language: url.searchParams.get('language') }, deps);
    return sendJson(res, 200, { songs });
  }

  return sendJson(res, 404, { error: 'Not found' });
}

function serveStatic(req, res, url) {
  const requested = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(PUBLIC_ROOT, requested));
  if (!filePath.startsWith(PUBLIC_ROOT)) {
    res.writeHead(403); return res.end('Forbidden');
  }
  fs.readFile(filePath, (error, data) => {
    if (error) { res.writeHead(404); return res.end('Not found'); }
    const ext = path.extname(filePath);
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
    res.writeHead(200, { 'content-type': types[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    return serveStatic(req, res, url);
  } catch (error) {
    return sendJson(res, 500, { error: error.message });
  }
}).listen(PORT, () => {
  console.log(`D'Tunes listening on http://localhost:${PORT}`);
});
