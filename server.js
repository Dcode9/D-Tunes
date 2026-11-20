const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { getRecommendations, PLAYLIST_TYPES } = require('./lib/recommendationEngine');
const { deduplicateSongs } = require('./lib/deduplication');
const store = require('./lib/jsonStore');
const { verifySupabaseJwt, isAuthRequired, normalizeUserId } = require('./lib/apiSecurity');
const lyricsService = require('./lib/lyricsService');
const {
  recommendationDeps,
  buildAutoplay,
  buildRecommendations,
  buildMixes,
  recordFeedback,
} = require('./lib/recommendationRoutes');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_ROOT = __dirname;
const MAX_JSON_BODY_BYTES = 1024 * 1024;
const ALLOWED_EVENT_TYPES = new Set([
  'play_start', 'play_complete', 'skip', 'like', 'unlike',
  'search_play', 'playlist_add', 'repeat', 'queue_add',
]);

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify(body));
}

function bearerToken(req) {
  const header = req.headers && req.headers.authorization;
  if (typeof header !== 'string') return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

async function resolveUserId(req, supplied) {
  if (isAuthRequired()) {
    return verifySupabaseJwt(req.headers && req.headers.authorization);
  }
  return normalizeUserId(supplied);
}

function bodyTooLargeError() {
  const error = new Error('Request body too large');
  error.status = 413;
  return error;
}

function isBodyTooLarge(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_JSON_BODY_BYTES;
  } catch (error) {
    return false;
  }
}

function parseBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object') {
      return isBodyTooLarge(req.body)
        ? Promise.reject(bodyTooLargeError())
        : Promise.resolve(req.body);
    }
    if (typeof req.body === 'string') {
      if (Buffer.byteLength(req.body, 'utf8') > MAX_JSON_BODY_BYTES) return Promise.reject(bodyTooLargeError());
      try {
        const parsed = req.body ? JSON.parse(req.body) : {};
        return Promise.resolve(parsed && typeof parsed === 'object' ? parsed : {});
      } catch (error) { return Promise.reject(error); }
    }
  }
  return new Promise((resolve, reject) => {
    let raw = '';
    let bytes = 0;
    let settled = false;
    req.on('data', (chunk) => {
      if (settled) return;
      bytes += typeof chunk === 'string' ? Buffer.byteLength(chunk, 'utf8') : chunk.length;
      if (bytes > MAX_JSON_BODY_BYTES) {
        settled = true;
        reject(bodyTooLargeError());
        return;
      }
      raw += chunk;
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      if (!raw) return resolve({});
      try {
        const parsed = JSON.parse(raw);
        resolve(parsed && typeof parsed === 'object' ? parsed : {});
      } catch (error) { reject(error); }
    });
    req.on('error', (err) => {
      if (!settled) { settled = true; reject(err); }
    });
  });
}

function parseBodyAllowInvalid(req) {
  return parseBody(req).catch((error) => {
    if (error && error.status === 413) throw error;
    return {};
  });
}

function toIdArray(value) {
  return Array.isArray(value) ? value.map(String) : [];
}

async function handleApi(req, res, url) {
  if (req.method === 'OPTIONS') {
    const requestedHeaders = req.headers['access-control-request-headers'];
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': requestedHeaders || 'content-type, authorization, x-requested-with',
    });
    return res.end();
  }

  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    const declaredLength = Number(req.headers['content-length']);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BODY_BYTES) {
      if (typeof req.resume === 'function') req.resume();
      return sendJson(res, 413, { error: 'Request body too large' });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/music/event') {
    const body = await parseBody(req);
    const songId = body.songSaavnId !== undefined
      ? body.songSaavnId
      : (body.song && (body.song.saavn_id !== undefined ? body.song.saavn_id : body.song.id));
    const validUserId = typeof body.userId === 'string' && body.userId.trim().length > 0;
    const validEventType = typeof body.eventType === 'string' && ALLOWED_EVENT_TYPES.has(body.eventType);
    const validSongId = typeof songId === 'string' && songId.trim().length > 0;
    if (!validUserId || !validEventType || !validSongId) {
      return sendJson(res, 400, { error: 'userId, eventType, and songSaavnId/song are required' });
    }
    const resolvedUserId = await resolveUserId(req, body.userId);
    if (!resolvedUserId) return sendJson(res, 401, { error: 'Unauthorized' });
    body.userId = resolvedUserId;
    const event = store.recordEvent(body);
    return sendJson(res, 201, { event });
  }

  if (req.method === 'POST' && url.pathname === '/api/music/recalculate-profile') {
    const body = await parseBody(req);
    const userId = await resolveUserId(req, body.userId || url.searchParams.get('userId'));
    if (!userId) return sendJson(res, 401, { error: 'Unauthorized' });
    return sendJson(res, 200, { profile: store.rebuildUserTasteProfile(userId) });
  }

  if (req.method === 'POST' && url.pathname === '/api/music/recommendations') {
    const body = await parseBodyAllowInvalid(req);
    const userId = await resolveUserId(req, body.userId);
    if (!userId) return sendJson(res, 401, { error: 'Unauthorized' });
    body.userId = userId;
    return sendJson(res, 200, await buildRecommendations(body, { accessToken: bearerToken(req) }));
  }

  if (req.method === 'POST' && url.pathname === '/api/music/mixes') {
    const body = await parseBodyAllowInvalid(req);
    const userId = await resolveUserId(req, body.userId);
    if (!userId) return sendJson(res, 401, { error: 'Unauthorized' });
    body.userId = userId;
    return sendJson(res, 200, await buildMixes(body, { accessToken: bearerToken(req) }));
  }

  if (req.method === 'POST' && url.pathname === '/api/music/feedback') {
    const body = await parseBodyAllowInvalid(req);
    const userId = await resolveUserId(req, body.userId);
    if (!userId) return sendJson(res, 401, { error: 'Unauthorized' });
    body.userId = userId;
    return sendJson(res, 200, await recordFeedback(body));
  }

  if (req.method === 'GET' && url.pathname === '/api/music/recommendations') {
    const userId = await resolveUserId(req, url.searchParams.get('userId'));
    if (!userId) return sendJson(res, 401, { error: 'Unauthorized' });
    const type = url.searchParams.get('type') || PLAYLIST_TYPES.FOR_YOU;
    const limit = Number(url.searchParams.get('limit') || 25);
    const deps = await recommendationDeps(
      { language: url.searchParams.get('language') },
      { userId, accessToken: bearerToken(req) }
    );
    const songs = await getRecommendations(userId, { limit, playlistType: type, language: url.searchParams.get('language') }, deps);
    return sendJson(res, 200, { songs: deduplicateSongs(songs) });
  }

  if ((req.method === 'POST' || req.method === 'GET') && url.pathname === '/api/music/autoplay') {
    const body = req.method === 'POST' ? await parseBodyAllowInvalid(req) : {};
    const params = url.searchParams;
    const normalized = {
      ...body,
      seedSongId: body.seedSongId || body.songId || params.get('seedSongId') || params.get('songId') || undefined,
      userId: body.userId || params.get('userId') || 'anonymous',
      language: body.language || params.get('language') || undefined,
      limit: Number(body.limit || params.get('limit') || 10),
      currentQueueIds: toIdArray(body.currentQueueIds || params.getAll('currentQueueIds')),
      excludedSongIds: toIdArray(body.excludedSongIds || params.getAll('excludedSongIds')),
    };
    const userId = await resolveUserId(req, normalized.userId);
    if (!userId) return sendJson(res, 401, { error: 'Unauthorized' });
    normalized.userId = userId;
    return sendJson(res, 200, await buildAutoplay(normalized, { accessToken: bearerToken(req) }));
  }

  if (req.method === 'GET' && url.pathname === '/api/music/similar') {
    const seedSongId = url.searchParams.get('songId');
    const limit = Number(url.searchParams.get('limit') || 25);
    const deps = await recommendationDeps({ seedSongId });
    const songs = await getRecommendations('anonymous', { limit, playlistType: PLAYLIST_TYPES.SIMILAR, seedSongId }, deps);
    return sendJson(res, 200, { songs: deduplicateSongs(songs) });
  }

  if (req.method === 'GET' && url.pathname === '/api/music/artist-radio') {
    const seedArtist = url.searchParams.get('artist');
    const userId = url.searchParams.get('userId') || 'anonymous';
    const limit = Number(url.searchParams.get('limit') || 25);
    const deps = await recommendationDeps({ seedArtist });
    const songs = await getRecommendations(userId, { limit, playlistType: PLAYLIST_TYPES.ARTIST_RADIO, seedArtist }, deps);
    return sendJson(res, 200, { songs: deduplicateSongs(songs) });
  }

  if (req.method === 'GET' && url.pathname === '/api/music/playlist') {
    const type = url.searchParams.get('type') || PLAYLIST_TYPES.LATE_NIGHT;
    const userId = url.searchParams.get('userId') || 'anonymous';
    const limit = Number(url.searchParams.get('limit') || 25);
    const deps = await recommendationDeps({ language: url.searchParams.get('language') });
    const songs = await getRecommendations(userId, { limit, playlistType: type, language: url.searchParams.get('language') }, deps);
    return sendJson(res, 200, { songs: deduplicateSongs(songs) });
  }

  if (req.method === 'GET' && url.pathname === '/api/music/lyrics') {
    const track = url.searchParams.get('track') || url.searchParams.get('track_name') || url.searchParams.get('title') || url.searchParams.get('name');
    const artist = url.searchParams.get('artist') || url.searchParams.get('artist_name') || url.searchParams.get('primary_artists') || '';
    const album = url.searchParams.get('album') || '';
    const duration = Number(url.searchParams.get('duration') || 0);

    if (!track) {
      return sendJson(res, 400, { error: 'track or title parameter is required' });
    }

    try {
      const result = await lyricsService.fetchLyrics({ track, artist, album, duration });
      return sendJson(res, 200, {
        lyrics: result,
        success: Boolean(result && (result.syncedLyrics || result.plainLyrics || result.instrumental))
      });
    } catch (err) {
      return sendJson(res, 500, { error: err.message || 'Failed to fetch lyrics' });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/music/spotify-playlist') {
    const rawUrl = url.searchParams.get('url');
    if (!rawUrl) {
      return sendJson(res, 400, { error: 'url parameter is required' });
    }
    try {
      const spotifyUrlRegex = /(?:https?:\/\/)?(?:open\.spotify\.com\/(?:embed\/)?|spotify:)(playlist|album|track)[/:]([a-zA-Z0-9]+)/i;
      const match = rawUrl.trim().match(spotifyUrlRegex);
      if (!match) {
        return sendJson(res, 400, { error: 'Invalid Spotify URL' });
      }
      const type = match[1].toLowerCase();
      const id = match[2];
      const embedUrl = `https://open.spotify.com/embed/${type}/${id}`;
      
      const fetchResponse = await fetch(embedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });
      
      if (!fetchResponse.ok) {
        return sendJson(res, fetchResponse.status, { error: `Spotify embed returned HTTP ${fetchResponse.status}` });
      }
      
      const html = await fetchResponse.text();
      let title = `Spotify ${type}`;
      let tracks = [];
      
      const scriptMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
      if (scriptMatch && scriptMatch[1]) {
        try {
          const json = JSON.parse(scriptMatch[1]);
          const pageProps = json.props?.pageProps;
          const stateData = pageProps?.state?.data;
          const entity = stateData?.entity || pageProps?.entity || stateData?.[type];
          if (entity) {
            title = entity.name || entity.title || title;
            const trackList = entity.trackList || stateData?.playlist?.trackList || stateData?.album?.trackList;
            if (Array.isArray(trackList)) {
              tracks = trackList.map(t => {
                const songTitle = t.title || t.name || '';
                const subtitle = t.subtitle || (Array.isArray(t.artists) ? t.artists.map(a => a.name).join(', ') : '');
                return { title: songTitle, artist: subtitle };
              }).filter(t => t.title);
            } else if (type === 'track') {
              tracks = [{
                title: entity.name || entity.title || '',
                artist: entity.subtitle || (Array.isArray(entity.artists) ? entity.artists.map(a => a.name).join(', ') : '')
              }];
            }
          }
        } catch (parseErr) {
          console.warn('[Server Spotify] Parse __NEXT_DATA__ error:', parseErr);
        }
      }
      
      return sendJson(res, 200, { ok: true, title, tracks });
    } catch (err) {
      return sendJson(res, 500, { error: err.message || 'Failed to fetch Spotify playlist' });
    }
  }

  return sendJson(res, 404, { error: 'Not found' });
}

function serveStatic(req, res, url) {
  const ALIASES = { '/download': '/downloads/index.html', '/downloads': '/downloads/index.html' };
  const requested = url.pathname === '/'
    ? '/index.html'
    : (ALIASES[url.pathname] || decodeURIComponent(url.pathname));
  let filePath = path.normalize(path.join(PUBLIC_ROOT, requested));
  if (!filePath.startsWith(PUBLIC_ROOT)) {
    res.writeHead(403); return res.end('Forbidden');
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }
  fs.readFile(filePath, (error, data) => {
    if (error) { res.writeHead(404); return res.end('Not found'); }
    const ext = path.extname(filePath);
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
    res.writeHead(200, { 'content-type': types[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function proxyApiV2(req, res, url) {
  const targetHost = process.env.YTDLP_API_HOST || '127.0.0.1';
  const targetPort = Number(process.env.YTDLP_API_PORT || 8000);
  const targetPath = url.pathname.replace(/^\/api-v2/, '/api') + url.search;
  const options = {
    hostname: targetHost,
    port: targetPort,
    path: targetPath,
    method: req.method,
    headers: { ...req.headers, host: `${targetHost}:${targetPort}` },
  };
  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxyReq.on('error', (err) => {
    sendJson(res, 502, { error: 'Failed to connect to yt-dlp backend', details: err.message });
  });
  req.pipe(proxyReq);
}

if (require.main === module) {
  http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    try {
      if (url.pathname.startsWith('/api-v2')) return proxyApiV2(req, res, url);
      if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
      return serveStatic(req, res, url);
    } catch (error) {
      const status = error && error.status === 413 ? 413 : 500;
      return sendJson(res, status, { error: error.message });
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
    const status = error && error.status === 413 ? 413 : 500;
    return sendJson(res, status, { error: error.message });
  }
};
