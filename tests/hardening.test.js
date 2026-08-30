/**
 * Hardening regression tests: security, validation, and resilience fixes
 * for the D'Tunes server, data store, and clients.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const rootDir = path.join(__dirname, '..');
const TEST_PORT = Number(process.env.HARDENING_TEST_PORT || 4123);
const BASE = `http://127.0.0.1:${TEST_PORT}`;

const { sanitizeLimit, isBlockedStaticPath, VALID_EVENT_TYPES } = require('../server').__testables;

const apiFetch = (url, options = {}) => fetch(url, {
  ...options,
  headers: { ...(options.headers || {}), connection: 'close' },
});



// ---------------------------------------------------------------------------
// 1. Query limit sanitization (fix: ?limit=abc used to silently return [])
// ---------------------------------------------------------------------------
test('sanitizeLimit clamps, defaults, and rejects garbage', () => {
  assert.equal(sanitizeLimit('abc'), 25);
  assert.equal(sanitizeLimit(''), 25);
  assert.equal(sanitizeLimit('-5'), 25);
  assert.equal(sanitizeLimit('0'), 25);
  assert.equal(sanitizeLimit('7'), 7);
  assert.equal(sanitizeLimit('100000'), 100);
  assert.equal(sanitizeLimit('1e9'), 100);
});

// ---------------------------------------------------------------------------
// 2. Static path blocking (fix: .git/config, server.js, data/ were served)
// ---------------------------------------------------------------------------
test('isBlockedStaticPath hides repo internals and user data', () => {
  for (const blocked of ['/.git/config', '/.git/HEAD', '/.env', '/.env.example', '/data/recommendations.json', '/db/migrations/001_recommendations.sql', '/lib/jsonStore.js', '/tests/testHarness.js', '/server.js', '/package.json', '/node_modules/foo/index.js', '/api/index.js']) {
    assert.equal(isBlockedStaticPath(blocked), true, `${blocked} must be blocked`);
  }
  for (const allowed of ['/', '/index.html', '/src/app.js', '/src/styles.css', '/assets/favicon.png', '/DTunes.svg', '/manifest.json', '/feedback/index.html', '/privacy_policy/index.html']) {
    assert.equal(isBlockedStaticPath(allowed), false, `${allowed} must be servable`);
  }
});

test('event type whitelist contains exactly the documented events', () => {
  assert.deepEqual([...VALID_EVENT_TYPES].sort(), [
    'like', 'play_complete', 'play_start', 'playlist_add', 'queue_add',
    'repeat', 'search_play', 'skip', 'unlike',
  ]);
});

// ---------------------------------------------------------------------------
// 3. Live server end-to-end: validation, rate limiting, static hardening
// ---------------------------------------------------------------------------
test('live server enforces API validation, rate limits, and static rules', { timeout: 60000 }, async (t) => {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: rootDir,
    env: { ...process.env, PORT: String(TEST_PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await new Promise((resolve, reject) => {
      child.stdout.on('data', (chunk) => { if (String(chunk).includes('listening')) resolve(); });
      child.once('error', reject);
      setTimeout(() => reject(new Error('server did not start')), 10000);
    });

    await t.test('event endpoint validates payload shape and eventType', async () => {
      const missing = await apiFetch(`${BASE}/api/music/event`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: 'u1' }) });
      assert.equal(missing.status, 400);

      const badType = await apiFetch(`${BASE}/api/music/event`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: 'u1', eventType: '<script>alert(1)</script>', songSaavnId: 's1' }) });
      assert.equal(badType.status, 400);
      assert.match(await badType.text(), /Unsupported eventType/);

      const ok = await apiFetch(`${BASE}/api/music/event`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: 'u1', eventType: 'play_start', songSaavnId: 's1', song: { saavn_id: 's1', title: 'T', artist: 'A' } }) });
      assert.equal(ok.status, 201);
      const body = await ok.json();
      assert.equal(body.event.event_type, 'play_start');
    });

    await t.test('oversized request bodies are rejected with 413', async () => {
      const huge = JSON.stringify({ userId: 'u1', eventType: 'like', songSaavnId: 's1', junk: 'x'.repeat(200 * 1024) });
      const res = await apiFetch(`${BASE}/api/music/event`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: huge });
      assert.equal(res.status, 413);
    });

    await t.test('playlist endpoint tolerates bad limits', async () => {
      const res = await apiFetch(`${BASE}/api/music/playlist?type=late-night&limit=abc`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data.songs));
    });

    await t.test('health endpoint responds', async () => {
      const res = await apiFetch(`${BASE}/api/music/health`);
      assert.equal(res.status, 200);
      assert.equal((await res.json()).ok, true);
    });

    await t.test('repo internals are not served', async () => {
      assert.equal((await apiFetch(`${BASE}/.git/config`)).status, 403);
      assert.equal((await apiFetch(`${BASE}/server.js`)).status, 403);
      assert.equal((await apiFetch(`${BASE}/data/recommendations.json`)).status, 403);
      assert.equal((await apiFetch(`${BASE}/.env.example`)).status, 403);
    });

    await t.test('public assets are served with hardening + cache headers', async () => {
      const home = await apiFetch(`${BASE}/`);
      assert.equal(home.status, 200);
      assert.match(home.headers.get('content-type') || '', /text\/html/);
      assert.equal(home.headers.get('x-content-type-options'), 'nosniff');

      const appJs = await apiFetch(`${BASE}/src/app.js`);
      assert.equal(appJs.status, 200);
      assert.match(appJs.headers.get('content-type') || '', /javascript/);
      assert.ok(appJs.headers.get('etag'), 'etag expected');
      const etag = appJs.headers.get('etag');
      const revalidate = await apiFetch(`${BASE}/src/app.js`, { headers: { 'if-none-match': etag } });
      assert.equal(revalidate.status, 304);

      const img = await apiFetch(`${BASE}/assets/favicon.png`);
      assert.equal(img.status, 200);
      assert.match(img.headers.get('cache-control') || '', /max-age/);
    });

    await t.test('event endpoint is rate limited', async () => {
      let saw429 = false;
      for (let i = 0; i < 70 && !saw429; i++) {
        const res = await apiFetch(`${BASE}/api/music/event`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: 'rate-test', eventType: 'skip', songSaavnId: `s${i}` }) });
        if (res.status === 429) saw429 = true;
      }
      assert.ok(saw429, 'expected a 429 after exceeding the event rate limit');
    });
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => { child.once('exit', resolve); setTimeout(resolve, 3000); });
    fs.rmSync(path.join(rootDir, 'data'), { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 4. JioSaavn client failover (improvement: multiple upstream mirrors)
// ---------------------------------------------------------------------------
test('saavnClient fails over to the next mirror endpoint', { timeout: 30000 }, async () => {
  const originalFetch = global.fetch;
  const attempted = [];
  global.fetch = async (url, options) => {
    attempted.push(String(url));
    if (String(url).includes('jiosaavn-api-taupe-phi')) throw new Error('mirror 1 down');
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { results: [] } }),
    };
  };
  try {
    const saavn = require('../lib/saavnClient');
    const data = await saavn.fetchJson('/search/songs?query=x');
    assert.equal(data.success, true);
    assert.ok(attempted.length >= 2, `expected at least 2 attempts, got ${attempted.length}`);
    assert.match(attempted[1], /jiosaavn-api-v2/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('saavnClient throws only after trying every mirror', { timeout: 30000 }, async () => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => { calls += 1; throw new Error('down'); };
  try {
    const saavn = require('../lib/saavnClient');
    await assert.rejects(() => saavn.fetchJson('/search/songs?query=x'), /down/);
    assert.equal(calls, saavn.API_ENDPOINTS.length);
  } finally {
    global.fetch = originalFetch;
  }
});

// ---------------------------------------------------------------------------
// 5. JSON store: single-write events, raw-metadata compaction, event pruning
// ---------------------------------------------------------------------------
test('jsonStore prunes events and compacts raw metadata', { timeout: 30000 }, async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dtunes-store-'));
  const previousCwd = process.cwd();
  const previousMax = process.env.DTUNES_MAX_EVENTS;
  process.env.DTUNES_MAX_EVENTS = '60';
  process.chdir(tmpDir);
  const storePath = path.join(rootDir, 'lib', 'jsonStore.js');
  delete require.cache[require.resolve(storePath)];
  const store = require(storePath);

  try {
    for (let i = 0; i < 90; i++) {
      store.recordEvent({ userId: 'prune-user', eventType: 'play_start', songSaavnId: `song_${i}` });
    }
    const data = store.load();
    assert.ok(data.user_events.length <= 60, `expected <= 60 events after pruning, got ${data.user_events.length}`);
    assert.ok(data.user_events.every((event) => event.user_id === 'prune-user'));

    await t.test('raw metadata is compacted and cannot balloon the store', () => {
      store.recordEvent({
        userId: 'prune-user',
        eventType: 'like',
        songSaavnId: 'fat_song',
        song: { saavn_id: 'fat_song', title: 'Fat', junk: 'x'.repeat(50000) },
      });
      const stored = store.load().songs.find((song) => song.saavn_id === 'fat_song');
      assert.ok(stored);
      const rawSize = JSON.stringify(stored.raw_metadata_json || {}).length;
      assert.ok(rawSize <= 2100, `raw metadata must stay tiny, got ${rawSize} bytes`);
      assert.equal(stored.raw_metadata_json.junk, undefined);
    });

    await t.test('profile is rebuilt and persisted by recordEvent', () => {
      const profile = store.getTasteProfile('prune-user');
      assert.ok(profile && typeof profile === 'object');
      assert.ok(profile.updated_at || profile.artist_scores_json !== undefined);
    });
  } finally {
    process.env.DTUNES_MAX_EVENTS = previousMax;
    process.chdir(previousCwd);
    delete require.cache[require.resolve(storePath)];
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 6. Frontend fix smoke checks (source-level regression pins)
// ---------------------------------------------------------------------------
test('frontend fixes are present in src/app.js', () => {
  const source = fs.readFileSync(path.join(rootDir, 'src', 'app.js'), 'utf8');

  // Shuffle "next" must never re-pick the currently playing track.
  assert.match(source, /while \(nextIdx === state\.idx\)/);

  // fetchWithRetry must use a timeout so a hung upstream cannot freeze the UI.
  assert.match(source, /AbortSignal\.timeout\(8000\)/);

  // Full-search race guard.
  assert.match(source, /requestId !== searchManager\.fullSearchSeq/);

  // Keyboard shortcuts must not hijack browser combos.
  assert.match(source, /e\.ctrlKey \|\| e\.metaKey \|\| e\.altKey/);

  // Volume persistence.
  assert.match(source, /playerVolume/);

  // Stale playback URL refresh on restore.
  assert.match(source, /audio\.removeAttribute\('src'\)/);

  // Lazy images in list rows.
  assert.ok((source.match(/decoding="async"/g) || []).length >= 10, 'lazy/async image attributes expected');
});

test('recommendation client keeps its API, prunes dedup keys, and can flush offline events', () => {
  const source = fs.readFileSync(path.join(rootDir, 'src', 'recommendationClient.js'), 'utf8');
  assert.match(source, /window\.recommendationClient = \{ getUserId, recordEvent, fetchPlaylist, toAppSong, toApiSong, flushQueuedEvents \}/);
  assert.match(source, /recentKeys\.size > 500/);
  assert.match(source, /flushQueuedEvents/);
  assert.match(source, /window\.addEventListener\('online'/);
  // Events must no longer embed the whole song object as raw metadata.
  assert.doesNotMatch(source, /raw_metadata_json: song\.raw_metadata_json \|\| song,/);
});
