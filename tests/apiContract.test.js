const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const clientPath = path.join(__dirname, '..', 'src', 'js', 'recommendationClient.js');
const clientSource = fs.readFileSync(clientPath, 'utf8');

function createLocalStorage(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    getItem(key) { return store.has(String(key)) ? store.get(String(key)) : null; },
    setItem(key, value) { store.set(String(key), String(value)); },
    removeItem(key) { store.delete(String(key)); },
    clear() { store.clear(); },
    _dump() { return new Map(store); },
  };
}

function loadClient({ localStorage, fetchImpl, navigator = { onLine: true }, cloudUserId = null, jiosaavnAPI = null, now = 1700000000000 } = {}) {
  const ls = localStorage || createLocalStorage();
  const sandboxWindow = {};
  const sandbox = {
    window: sandboxWindow,
    localStorage: ls,
    fetch: fetchImpl,
    navigator,
    console: { warn() {}, log() {}, error() {} },
    crypto: { randomUUID: () => 'uuid-test' },
    Date: class extends Date {
      constructor(...args) { super(...(args.length ? args : [now])); }
      static now() { return now; }
    },
    AbortSignal: global.AbortSignal,
    URLSearchParams: global.URLSearchParams,
    JSON,
    Math,
    setTimeout,
    clearTimeout,
  };
  if (cloudUserId) {
    sandboxWindow.cloudLibrary = { session: { user: { id: cloudUserId } } };
  }
  if (jiosaavnAPI) {
    sandboxWindow.jiosaavnAPI = jiosaavnAPI;
  }
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(clientSource, sandbox, { filename: clientPath });
  return { client: sandboxWindow.recommendationClient, window: sandboxWindow, localStorage: ls, sandbox };
}

test('API contract: maps app song fields to event payload fields', () => {
  const { client } = loadClient({ fetchImpl: async () => ({ ok: true, json: async () => ({}) }) });
  const mapped = client.toApiSong({
    id: 's1',
    name: 'Track One',
    artist: 'Artist A',
    img: 'https://img.test/1.jpg',
    url: 'https://media.test/1.mp3',
    duration: 210,
    language: 'hi',
    album: 'Album X',
  });
  assert.equal(mapped.saavn_id, 's1');
  assert.equal(mapped.title, 'Track One');
  assert.equal(mapped.primary_artists, 'Artist A');
  assert.equal(mapped.image_url, 'https://img.test/1.jpg');
  assert.equal(mapped.play_url, 'https://media.test/1.mp3');
  assert.equal(mapped.duration_seconds, 210);
});

test('API contract: maps API song fields to app song fields and dedupes', () => {
  const { client } = loadClient({ fetchImpl: async () => ({ ok: true, json: async () => ({ songs: [] }) }) });
  const app = client.toAppSong({
    saavn_id: 's2',
    title: 'Track Two',
    primary_artists: 'Artist B',
    image_url: 'https://img.test/2.jpg',
    play_url: 'https://media.test/2.mp3',
    duration_seconds: 180,
  });
  assert.equal(app.id, 's2');
  assert.equal(app.name, 'Track Two');
  assert.equal(app.artist, 'Artist B');
  assert.equal(app.img, 'https://img.test/2.jpg');
  assert.equal(app.url, 'https://media.test/2.mp3');
  assert.equal(app.duration, 180);
});

test('API contract: recordEvent posts required fields to /api/music/event', async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts });
    return { ok: true, status: 201, json: async () => ({ event: { id: 'e1' } }) };
  };
  const ls = createLocalStorage({ dtunesAnonymousUserId: 'anon_fixed' });
  const { client } = loadClient({ localStorage: ls, fetchImpl });
  await client.recordEvent('play_complete', { id: 'song-9', name: 'N', artist: 'A', duration: 200 }, { playDurationSeconds: 195, context: { source: 'player' } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/music/event');
  assert.equal(calls[0].opts.method, 'POST');
  assert.match(String(calls[0].opts.headers['content-type'] || calls[0].opts.headers['Content-Type']), /application\/json/i);
  const body = JSON.parse(calls[0].opts.body);
  assert.equal(body.userId, 'anon_fixed');
  assert.equal(body.songSaavnId, 'song-9');
  assert.equal(body.eventType, 'play_complete');
  assert.equal(body.playDurationSeconds, 195);
  assert.equal(body.song.duration_seconds, 200);
  assert.equal(body.context.source, 'player');
});

test('limit policy: clamps playlist limits to 15-25 and uses correct endpoint contract', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return { ok: true, json: async () => ({ songs: [{ saavn_id: 'x', title: 'X', primary_artists: 'A' }] }) };
  };
  const { client } = loadClient({ fetchImpl, localStorage: createLocalStorage({ dtunesAnonymousUserId: 'anon_u' }) });
  assert.equal(client.normalizeLimit(5), 15);
  assert.equal(client.normalizeLimit(50), 25);
  assert.equal(client.normalizeLimit(undefined), 20);
  await client.fetchPlaylist('late-night', { limit: 5, language: 'hi' });
  await client.fetchPlaylist('similar', { songId: 'seed1', limit: 99 });
  await client.fetchPlaylist('artist-radio', { artist: 'Arijit Singh', limit: 10 });
  assert.equal(calls.length, 3);
  const u1 = new URL(calls[0], 'http://local');
  assert.equal(u1.pathname, '/api/music/playlist');
  assert.equal(u1.searchParams.get('type'), 'late-night');
  assert.equal(u1.searchParams.get('limit'), '15');
  assert.equal(u1.searchParams.get('userId'), 'anon_u');
  assert.equal(u1.searchParams.get('language'), 'hi');
  const u2 = new URL(calls[1], 'http://local');
  assert.equal(u2.pathname, '/api/music/similar');
  assert.equal(u2.searchParams.get('songId'), 'seed1');
  assert.equal(u2.searchParams.get('limit'), '25');
  const u3 = new URL(calls[2], 'http://local');
  assert.equal(u3.pathname, '/api/music/artist-radio');
  assert.equal(u3.searchParams.get('artist'), 'Arijit Singh');
  assert.equal(u3.searchParams.get('userId'), 'anon_u');
  assert.equal(u3.searchParams.get('limit'), '15');
});

test('fallback behavior: HTTP error/empty/malformed responses fall back to local JioSaavn results', async () => {
  const badResponses = [
    { ok: false, status: 500, json: async () => ({ error: 'boom' }) },
    { ok: true, json: async () => ({ songs: [] }) },
    { ok: true, json: async () => { throw new Error('bad json'); } },
  ];
  let i = 0;
  const fetchImpl = async () => badResponses[i++];
  const jiosaavnAPI = {
    async searchSongs() { return [{ id: 'j1', name: 'J One', artist: 'JA', img: '', url: '', duration: 1 }]; },
    async getTrending() { return []; },
    async getSong() { return null; },
  };
  const { client } = loadClient({ fetchImpl, jiosaavnAPI, localStorage: createLocalStorage({ dtunesAnonymousUserId: 'anon_u' }) });
  for (const type of ['late-night', 'artist-radio', 'discovery']) {
    const songs = await client.fetchPlaylist(type, { artist: 'x', limit: 20 });
    assert.ok(Array.isArray(songs), 'returns array');
    assert.ok(songs.length >= 1, 'falls back to jiosaavn results');
    assert.equal(songs[0].id, 'j1');
    assert.equal(songs[0].name, 'J One');
  }
});

test('fallback behavior: network throw/offline degrades gracefully to empty array when no local source', async () => {
  const fetchImpl = async () => { throw new Error('network down'); };
  const { client } = loadClient({ fetchImpl });
  const songs = await client.fetchPlaylist('late-night', { limit: 20 });
  assert.ok(Array.isArray(songs));
  assert.equal(songs.length, 0);
});

test('fallback behavior: offline uses local jiosaavn fallback instead of returning empty immediately', async () => {
  let fetchCalled = false;
  const fetchImpl = async () => { fetchCalled = true; return { ok: true, json: async () => ({ songs: [] }) }; };
  const jiosaavnAPI = {
    async searchSongs() { return [{ id: 'o1', name: 'Offline Song', artist: 'OA' }]; },
    async getTrending() { return []; },
    async getSong() { return null; },
  };
  const { client } = loadClient({ fetchImpl, jiosaavnAPI, navigator: { onLine: false } });
  const songs = await client.fetchPlaylist('discovery', { limit: 20 });
  assert.equal(fetchCalled, false, 'does not hit network while offline');
  assert.equal(songs.length, 1);
  assert.equal(songs[0].id, 'o1');
});

test('contract hardening: normalizes/dedupes API song arrays and preserves anonymous user id', async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({
      songs: [
        { saavn_id: 'dup', title: 'A', primary_artists: 'X' },
        { id: 'dup', name: 'A copy', artist: 'X' },
        { saavn_id: 'u2', title: 'B', primary_artists: 'Y' },
        null,
        {},
      ],
    }),
  });
  const ls = createLocalStorage({ dtunesAnonymousUserId: 'anon_keep' });
  const { client } = loadClient({ fetchImpl, localStorage: ls });
  assert.equal(client.getUserId(), 'anon_keep');
  const songs = await client.fetchPlaylist('late-night', { limit: 20 });
  assert.ok(Array.isArray(songs));
  assert.equal(songs.length, 2);
  assert.equal(songs[0].id, 'dup');
  assert.equal(songs[1].id, 'u2');
  assert.equal(ls.getItem('dtunesAnonymousUserId'), 'anon_keep');
});
