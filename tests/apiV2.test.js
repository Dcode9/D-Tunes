const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('D-Tunes API v2: vercel.json contains api-v2 rewrites and headers', () => {
  const vercelPath = path.join(__dirname, '../vercel.json');
  const vercelContent = fs.readFileSync(vercelPath, 'utf8');
  const vercel = JSON.parse(vercelContent);

  const hasApiV2Rewrite = vercel.rewrites.some(r => r.source === '/api-v2/(.*)' && r.destination === '/api/v2.py');
  assert.ok(hasApiV2Rewrite, 'vercel.json must rewrite /api-v2/(.*) to /api/v2.py');

  const hasApiV2Header = vercel.headers.some(h => h.source === '/api-v2/(.*)');
  assert.ok(hasApiV2Header, 'vercel.json must define CORS and caching headers for /api-v2/(.*)');
});

test('D-Tunes API v2: Python backend file exists and has required routes and options', () => {
  const v2Path = path.join(__dirname, '../api/v2.py');
  assert.ok(fs.existsSync(v2Path), 'api/v2.py must exist');

  const content = fs.readFileSync(v2Path, 'utf8');
  assert.ok(content.includes('def search_sync'), 'api/v2.py must have search_sync');
  assert.ok(content.includes('def search_ytmusic'), 'api/v2.py must have search_ytmusic');
  assert.ok(content.includes('def resolve_sync'), 'api/v2.py must have resolve_sync');
  assert.ok(content.includes('player_client'), 'api/v2.py must configure YouTube player_client');
  assert.ok(content.includes('/health'), 'api/v2.py must have /health endpoint');
  assert.ok(content.includes('/search'), 'api/v2.py must have /search endpoint');
  assert.ok(content.includes('/related/{video_id}'), 'api/v2.py must have /related/{video_id} endpoint');
  assert.ok(content.includes('/lyrics/{video_id}'), 'api/v2.py must have /lyrics/{video_id} endpoint');
  assert.ok(content.includes('/stream/{video_id}'), 'api/v2.py must have /stream/{video_id} endpoint');
  assert.ok(content.includes('/resolve/{video_id}'), 'api/v2.py must have /resolve/{video_id} endpoint');
  assert.ok(content.includes('prefix="/api-v2"'), 'api/v2.py must mount router with /api-v2 prefix');
});

test('D-Tunes API v2: requirements.txt specifies fastapi, httpx, yt-dlp, pydantic, and ytmusicapi', () => {
  const reqPath = path.join(__dirname, '../requirements.txt');
  assert.ok(fs.existsSync(reqPath), 'requirements.txt must exist');
  const reqContent = fs.readFileSync(reqPath, 'utf8');
  assert.ok(reqContent.includes('fastapi'), 'requirements.txt must include fastapi');
  assert.ok(reqContent.includes('yt-dlp'), 'requirements.txt must include yt-dlp');
  assert.ok(reqContent.includes('httpx'), 'requirements.txt must include httpx');
  assert.ok(reqContent.includes('pydantic'), 'requirements.txt must include pydantic');
  assert.ok(reqContent.includes('ytmusicapi'), 'requirements.txt must include ytmusicapi');
});

test('D-Tunes API v2: src/js/api.js implements mediaAPI and aliases jiosaavnAPI', () => {
  const apiPath = path.join(__dirname, '../src/js/api.js');
  const apiContent = fs.readFileSync(apiPath, 'utf8');

  assert.ok(apiContent.includes('/api-v2'), 'api.js must target /api-v2 base');
  assert.ok(apiContent.includes('window.mediaAPI = mediaAPI'), 'api.js must export mediaAPI');
  assert.ok(apiContent.includes('window.jiosaavnAPI = mediaAPI'), 'api.js must alias jiosaavnAPI for backward compatibility');
  assert.ok(apiContent.includes("source: 'youtube'"), "api.js normalizeTrack must set source to 'youtube'");
  assert.ok(apiContent.includes('isStreamingUrl'), 'api.js must expose isStreamingUrl');
});

test('D-Tunes API v2: server.js proxies /api-v2 in local mode', () => {
  const serverPath = path.join(__dirname, '../server.js');
  const serverContent = fs.readFileSync(serverPath, 'utf8');

  assert.ok(serverContent.includes("url.pathname.startsWith('/api-v2')"), 'server.js must detect /api-v2 requests');
  assert.ok(serverContent.includes('proxyApiV2'), 'server.js must define proxyApiV2');
});

test('D-Tunes API v2: searchSongs does not share a global AbortController across callers', () => {
  const apiContent = fs.readFileSync(path.join(__dirname, '../src/js/api.js'), 'utf8');
  assert.ok(!apiContent.includes('activeSearchAbortController'), 'api.js must not abort concurrent searchSongs calls globally');
  assert.ok(apiContent.includes('options = {}'), 'searchSongs must accept optional signal via options');

  const searchContent = fs.readFileSync(path.join(__dirname, '../src/js/search.js'), 'utf8');
  assert.ok(searchContent.includes('_quickSearchAbort'), 'search.js must scope AbortController to quick-search');
});

test('D-Tunes API v2: no stale JIOSAAVN_API references remain and album/artist endpoints are wired', () => {
  for (const rel of ['../src/js/api.js', '../src/js/player.js', '../src/js/ui.js']) {
    const content = fs.readFileSync(path.join(__dirname, rel), 'utf8');
    assert.ok(!content.includes('JIOSAAVN_API'), `${rel} must not reference removed JIOSAAVN_API`);
  }

  const v2Content = fs.readFileSync(path.join(__dirname, '../api/v2.py'), 'utf8');
  assert.ok(v2Content.includes('/search/albums'), 'api/v2.py must expose /search/albums');
  assert.ok(v2Content.includes('/search/artists'), 'api/v2.py must expose /search/artists');
  assert.ok(v2Content.includes('/album/{album_id}'), 'api/v2.py must expose /album/{album_id}');
  assert.ok(v2Content.includes('/artist/{artist_id}'), 'api/v2.py must expose /artist/{artist_id}');

  const apiContent = fs.readFileSync(path.join(__dirname, '../src/js/api.js'), 'utf8');
  assert.ok(apiContent.includes('getArtist:'), 'api.js must implement getArtist');
});

test('D-Tunes API v2: lyrics, playhead, timer, and YT player adapter stay in sync', () => {
  const lyricsContent = fs.readFileSync(path.join(__dirname, '../src/js/lyrics.js'), 'utf8');
  assert.ok(!lyricsContent.includes("getElementById('audio')"), "lyrics.js must not query nonexistent id='audio'");
  assert.ok(lyricsContent.includes("getElementById('audio-el')"), "lyrics.js must query id='audio-el'");
  assert.ok(lyricsContent.includes('_ytPlayerInstance'), 'lyrics.js must read YT player time when YouTube is active');

  const mainContent = fs.readFileSync(path.join(__dirname, '../src/js/main.js'), 'utf8');
  assert.ok(!mainContent.includes('lyricsManager.syncTime(cur, true)'), 'tickPlayhead must not force-scroll lyrics at 60fps');

  const timerContent = fs.readFileSync(path.join(__dirname, '../src/js/timer.js'), 'utf8');
  assert.ok(timerContent.includes('player.setVolume'), 'timer.js must route volume fades through player.setVolume');

  const playerContent = fs.readFileSync(path.join(__dirname, '../src/js/player.js'), 'utf8');
  assert.ok(playerContent.includes('sleepTimer.onTrackEnded'), 'YT player ENDED handler must honor sleepTimer.onTrackEnded');
  assert.ok(playerContent.includes("recommendationEvents.record('play_complete'"), 'YT progress timer must record play_complete');
});

test('D-Tunes API v2: legacy JioSaavn migration layer is wired across api, player, dverseClient, and v2.py', () => {
  const apiContent = fs.readFileSync(path.join(__dirname, '../src/js/api.js'), 'utf8');
  assert.ok(apiContent.includes('isLegacyJioSaavnTrack'), 'api.js must detect legacy JioSaavn tracks');
  assert.ok(apiContent.includes('resolveLegacyTrack'), 'api.js must resolve legacy tracks to YouTube');
  assert.ok(apiContent.includes('dtunes_yt_migration_map_v1'), 'api.js must persist migration map in localStorage');

  const playerContent = fs.readFileSync(path.join(__dirname, '../src/js/player.js'), 'utf8');
  assert.ok(playerContent.includes('resolveLegacyTrack'), 'player.js playDirect must migrate legacy tracks');
  assert.ok(playerContent.includes('item.saavn_id === songId'), 'isLiked must match legacy saavn_id');

  const dverseContent = fs.readFileSync(path.join(__dirname, '../src/js/dverseClient.js'), 'utf8');
  assert.ok(dverseContent.includes('getCachedMigration'), 'dverseClient.js must hydrate cached migrations');

  const v2Content = fs.readFileSync(path.join(__dirname, '../api/v2.py'), 'utf8');
  assert.ok(v2Content.includes('/migrate/saavn/{saavn_id}'), 'api/v2.py must expose /migrate/saavn/{saavn_id}');
});

test('D-Tunes API v2: Album and Playlist views use Mezzotint detail hero layout', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.ok(html.includes('id="album-hero-bg"'), 'index.html Album view must include #album-hero-bg');
  assert.ok(html.includes('id="playlist-hero-bg"'), 'index.html Playlist view must include #playlist-hero-bg');
  assert.ok(html.includes('class="dt-detail-hero'), 'index.html must apply .dt-detail-hero');

  const css = fs.readFileSync(path.join(__dirname, '../src/css/styles.css'), 'utf8');
  assert.ok(css.includes('.dt-detail-hero'), 'styles.css must define .dt-detail-hero');
  assert.ok(css.includes('.dt-hero-art'), 'styles.css must define .dt-hero-art');
});

test('D-Tunes API v2: dedicated stream host routing, mobile CORS hygiene, and 1:1 square artwork', () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, '../vercel.json'), 'utf8'));
  const streamHeaderBlock = vercel.headers.find(h => h.source === '/api-v2/stream/(.*)');
  assert.ok(streamHeaderBlock, 'vercel.json must define CORS headers for /api-v2/stream/(.*)');
  assert.ok(!streamHeaderBlock.headers.some(h => h.key.toLowerCase() === 'cache-control'),
    'vercel.json must not hardcode Cache-Control on /api-v2/stream/(.*) so 502s are never cached');

  const apiJs = fs.readFileSync(path.join(__dirname, '../src/js/api.js'), 'utf8');
  assert.ok(apiJs.includes('getStreamUrl'), 'api.js must expose getStreamUrl');
  assert.ok(apiJs.includes('discoverStreamHost'), 'api.js must expose discoverStreamHost');
  assert.ok(apiJs.includes('isStreamReady'), 'api.js must expose isStreamReady');

  const playerJs = fs.readFileSync(path.join(__dirname, '../src/js/player.js'), 'utf8');
  assert.ok(playerJs.includes('applyAudioCorsPolicy'), 'player.js must centralize mobile/desktop CORS policy');
  assert.ok(playerJs.includes('registerMediaSessionHandlers'), 'player.js must expose registerMediaSessionHandlers');
  assert.ok(playerJs.includes('attemptNativeAudio'), 'player.js must use bounded attemptNativeAudio recovery');
  assert.ok(playerJs.includes('startYTPlayback'), 'player.js must share clean startYTPlayback fallback');
  assert.doesNotMatch(playerJs, /recoverFromAudioError[\s\S]*?audio\.crossOrigin\s*=\s*['"]anonymous['"]/,
    'recoverFromAudioError must not bypass mobile CORS policy');

  const uiJs = fs.readFileSync(path.join(__dirname, '../src/js/ui.js'), 'utf8');
  assert.ok(!uiJs.includes("type: 'image/png'\n"), 'ui.js must not hardcode image/png for JPEG YouTube thumbnails');

  const utilsJs = fs.readFileSync(path.join(__dirname, '../src/js/utils.js'), 'utf8');
  assert.ok(utilsJs.includes('GOOGLE_ARTWORK_HOST_RE'), 'utils.js sanitizeImageUrl must normalize Google CDN artwork to 1:1 square');

  const css = fs.readFileSync(path.join(__dirname, '../src/css/styles.css'), 'utf8');
  assert.ok(css.includes('img[src*="ytimg.com"]'), 'styles.css must crop 16:9/4:3 ytimg thumbnails into 1:1 squares');
});
