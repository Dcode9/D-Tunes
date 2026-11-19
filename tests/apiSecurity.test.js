'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeUserId,
  sanitizeStringList,
  clampLimit,
  validateAutoplayBody,
  validateRecommendationsBody,
  validateMixesBody,
  validateFeedbackBody,
  isAuthRequired,
  verifySupabaseJwt,
} = require('../lib/apiSecurity');

const {
  buildAutoplay,
  buildRecommendations,
  buildMixes,
  recordFeedback,
} = require('../lib/recommendationRoutes');

const VALID_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEyMyJ9.c2lnbmF0dXJlLXBhcnQ';

function fakeFetchFactory(response, tracker = { calls: [] }) {
  const impl = async (url, init) => {
    tracker.calls.push({ url, init });
    if (response instanceof Error) throw response;
    return response;
  };
  impl.tracker = tracker;
  return impl;
}

function jsonResponse(data, ok = true) {
  return { ok, json: async () => data };
}

test('normalizeUserId rejects non-strings, control characters, oversize, and prototype keys', () => {
  assert.equal(normalizeUserId(undefined), 'anonymous');
  assert.equal(normalizeUserId(null), 'anonymous');
  assert.equal(normalizeUserId(42), 'anonymous');
  assert.equal(normalizeUserId({ id: 'attacker' }), 'anonymous');
  assert.equal(normalizeUserId(['a', 'b']), 'anonymous');
  assert.equal(normalizeUserId(''), 'anonymous');
  assert.equal(normalizeUserId('   '), 'anonymous');
  assert.equal(normalizeUserId('__proto__'), 'anonymous');
  assert.equal(normalizeUserId('constructor'), 'anonymous');
  assert.equal(normalizeUserId('x'.repeat(5000)), 'anonymous');
  assert.equal(normalizeUserId(' user\u0000-1 '), 'user-1');
  assert.equal(normalizeUserId('anon_4f89-11d3.9a0c:@ok'), 'anon_4f89-11d3.9a0c:@ok');
});

test('sanitizeStringList strips non-strings, duplicates, blanks, and caps length', () => {
  assert.deepEqual(sanitizeStringList('not-an-array'), []);
  assert.deepEqual(sanitizeStringList(null), []);
  assert.deepEqual(sanitizeStringList([1, ' a ', 'a', '', null, {}, 'b']), ['a', 'b']);
  assert.deepEqual(sanitizeStringList([], 25), []);

  const long = 'z'.repeat(1000);
  const cleanedLong = sanitizeStringList([long]);
  assert.equal(cleanedLong[0].length, 256);

  const many = Array.from({ length: 5000 }, (_, index) => `id-${index}`);
  assert.equal(sanitizeStringList(many).length, 25);
  assert.equal(sanitizeStringList(many, 1000).length, 100);
});

test('clampLimit rejects NaN, negative, and non-numeric values in favour of the fallback', () => {
  assert.equal(clampLimit(undefined, 15, 25, 15), 15);
  assert.equal(clampLimit(null, 8, 25, 8), 8);
  assert.equal(clampLimit('abc', 15, 25, 15), 15);
  assert.equal(clampLimit(Number.NaN, 15, 25, 15), 15);
  assert.equal(clampLimit(Number.POSITIVE_INFINITY, 15, 25, 15), 15);
  assert.equal(clampLimit(-10, 8, 25, 8), 8);
  assert.equal(clampLimit(1e9, 8, 25, 8), 25);
  assert.equal(clampLimit(40, 15, 25, 15), 25);
  assert.equal(clampLimit('18', 8, 25, 8), 18);
  assert.equal(clampLimit(true, 8, 25, 8), 8);
});

test('validateAutoplayBody degrades safely on non-object bodies and clamps its input', () => {
  for (const body of [undefined, null, 'nope', 42, [], true]) {
    const result = validateAutoplayBody(body);
    assert.equal(result.ok, false);
    assert.deepEqual(result.value.excludedSongIds, []);
    assert.equal(result.value.limit, 8);
    assert.equal(result.value.userId, 'anonymous');
  }

  const many = Array.from({ length: 5000 }, (_, index) => `s${index}`);
  const result = validateAutoplayBody({
    userId: { evil: true },
    limit: -3,
    seedSongId: 12,
    excludedSongIds: many,
    negativeTitles: [1, 'Track 1', 'Track 1', 'Track 2'],
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.userId, 'anonymous');
  assert.equal(result.value.limit, 8);
  assert.equal(result.value.seedSongId, '');
  assert.equal(result.value.excludedSongIds.length, 100);
  assert.deepEqual(result.value.negativeTitles, ['Track 1', 'Track 2']);
});

test('validators reject prototype-pollution keys without mutating Object.prototype', () => {
  const bodies = [
    JSON.parse('{"__proto__":{"polluted":true},"limit":20}'),
    JSON.parse('{"constructor":{"prototype":{"polluted":true}}}'),
    JSON.parse('{"currentQueueIds":[{"__proto__":{"polluted":true}}]}'),
  ];

  for (const body of bodies) {
    for (const validator of [validateAutoplayBody, validateRecommendationsBody, validateMixesBody, validateFeedbackBody]) {
      assert.equal(validator(body).ok, false);
    }
  }

  assert.equal({}.polluted, undefined);
  assert.equal(Object.prototype.polluted, undefined);
});

test('validateRecommendationsBody allowlists playlist types and bounds lists', () => {
  const result = validateRecommendationsBody({
    userId: 'anon_1',
    limit: 99,
    type: '../../etc/passwd',
    language: 'Hindi',
    dislikedSongIds: ['s1', 's2'],
    sessionHistory: [{ id: 's1', title: 'Track', artist: 'Artist' }, null, 'nope'],
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.userId, 'anon_1');
  assert.equal(result.value.limit, 25);
  assert.equal(result.value.type, 'for-you');
  assert.equal(result.value.language, 'Hindi');
  assert.deepEqual(result.value.dislikedSongIds, ['s1', 's2']);
  assert.equal(result.value.sessionHistory.length, 1);
  assert.equal(validateRecommendationsBody({ type: 'mood' }).value.type, 'mood');
});

test('validateMixesBody keeps only safe strings ahead of the AI prompt', () => {
  const result = validateMixesBody({
    limit: 'not-a-number',
    negativeTitles: Array.from({ length: 100 }, (_, index) => `title-${index}`).concat({ evil: true }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.limit, 15);
  assert.equal(result.value.negativeTitles.length, 25);
  assert.ok(result.value.negativeTitles.every((title) => typeof title === 'string'));
});

test('validateFeedbackBody derives a safe event type and rejects malformed ids', () => {
  const liked = validateFeedbackBody({ songId: { $gt: '' }, isLiked: false, eventType: { x: 1 } });
  assert.equal(liked.ok, true);
  assert.equal(liked.value.songId, '');
  assert.equal(liked.value.eventType, 'unlike');

  const nested = validateFeedbackBody({ song: { saavn_id: 'abc', id: 'abc' }, isLiked: true });
  assert.equal(nested.value.songId, 'abc');
  assert.equal(nested.value.eventType, 'like');

  const reason = validateFeedbackBody({ songId: 'abc', reason: 'r'.repeat(2000) });
  assert.equal(reason.value.reason.length, 256);

  assert.equal(validateFeedbackBody('nope').ok, false);
});

test('builders return degraded shapes instead of throwing on malformed bodies', async () => {
  assert.deepEqual(await buildAutoplay(null), { songs: [] });
  assert.deepEqual(await buildAutoplay('malformed'), { songs: [] });
  assert.deepEqual(await buildRecommendations([1, 2, 3]), { songs: [] });
  assert.deepEqual(await buildMixes(JSON.parse('{"__proto__":{"polluted":true}}')), { mixes: [] });
  assert.deepEqual(await recordFeedback({ songId: { nested: true } }), { ok: true });
});

test('recordFeedback ignores unsafe bodies and only records validated fields', async () => {
  const recorded = [];
  const deps = { store: { recordEvent: (event) => recorded.push(event) } };

  await recordFeedback(JSON.parse('{"__proto__":{"polluted":true},"songId":"s1"}'), deps);
  await recordFeedback({ songId: '', userId: 'user-1' }, deps);
  assert.equal(recorded.length, 0);

  await recordFeedback(
    { userId: 'user-1', songId: 's1', isLiked: false, mixKey: 'mood', reason: 'too loud' },
    deps
  );
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].userId, 'user-1');
  assert.equal(recorded[0].songSaavnId, 's1');
  assert.equal(recorded[0].eventType, 'unlike');
  assert.equal(recorded[0].context.mixKey, 'mood');
});

test('isAuthRequired is opt-in through DTUNES_REQUIRE_AUTH', () => {
  const previous = process.env.DTUNES_REQUIRE_AUTH;
  try {
    delete process.env.DTUNES_REQUIRE_AUTH;
    assert.equal(isAuthRequired(), false);
    process.env.DTUNES_REQUIRE_AUTH = '0';
    assert.equal(isAuthRequired(), false);
    process.env.DTUNES_REQUIRE_AUTH = '1';
    assert.equal(isAuthRequired(), true);
  } finally {
    if (previous === undefined) delete process.env.DTUNES_REQUIRE_AUTH;
    else process.env.DTUNES_REQUIRE_AUTH = previous;
  }
});

test('verifySupabaseJwt calls the Supabase user endpoint with the bearer token', async () => {
  const fetchImpl = fakeFetchFactory(jsonResponse({ id: 'user-123' }));

  const userId = await verifySupabaseJwt(`Bearer ${VALID_TOKEN}`, {
    fetch: fetchImpl,
    supabaseUrl: 'https://project.supabase.co/',
    apikey: 'anon-key',
  });

  assert.equal(userId, 'user-123');
  assert.equal(fetchImpl.tracker.calls.length, 1);
  assert.equal(fetchImpl.tracker.calls[0].url, 'https://project.supabase.co/auth/v1/user');
  assert.equal(fetchImpl.tracker.calls[0].init.method, 'GET');
  assert.equal(fetchImpl.tracker.calls[0].init.headers.Authorization, `Bearer ${VALID_TOKEN}`);
  assert.equal(fetchImpl.tracker.calls[0].init.headers.apikey, 'anon-key');
});

test('verifySupabaseJwt returns null for missing or malformed authorization headers', async () => {
  const fetchImpl = fakeFetchFactory(jsonResponse({ id: 'user-123' }));
  const options = { fetch: fetchImpl, supabaseUrl: 'https://project.supabase.co' };

  assert.equal(await verifySupabaseJwt(undefined, options), null);
  assert.equal(await verifySupabaseJwt('', options), null);
  assert.equal(await verifySupabaseJwt('Basic abc', options), null);
  assert.equal(await verifySupabaseJwt('Bearer short', options), null);
  assert.equal(await verifySupabaseJwt(`Bearer ${'a'.repeat(9000)}`, options), null);
  assert.equal(await verifySupabaseJwt({ token: VALID_TOKEN }, options), null);
  assert.equal(fetchImpl.tracker.calls.length, 0);
});

test('verifySupabaseJwt returns null when Supabase is unavailable or rejects the token', async () => {
  const options = { supabaseUrl: 'https://project.supabase.co' };

  assert.equal(
    await verifySupabaseJwt(`Bearer ${VALID_TOKEN}`, { ...options, fetch: fakeFetchFactory(jsonResponse({ id: 'u1' }, false)) }),
    null
  );
  assert.equal(
    await verifySupabaseJwt(`Bearer ${VALID_TOKEN}`, { ...options, fetch: fakeFetchFactory(new Error('network down')) }),
    null
  );
  assert.equal(
    await verifySupabaseJwt(`Bearer ${VALID_TOKEN}`, {
      ...options,
      fetch: fakeFetchFactory({ ok: true, json: async () => { throw new Error('bad json'); } }),
    }),
    null
  );
  assert.equal(
    await verifySupabaseJwt(`Bearer ${VALID_TOKEN}`, { ...options, fetch: fakeFetchFactory(jsonResponse({ id: 42 })) }),
    null
  );
});

test('verifySupabaseJwt returns null without SUPABASE_URL and never logs the token', async () => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousLog = console.log;
  const previousWarn = console.warn;
  const previousError = console.error;
  const logs = [];
  const capture = (...args) => logs.push(args.join(' '));

  try {
    delete process.env.SUPABASE_URL;
    console.log = capture;
    console.warn = capture;
    console.error = capture;

    const fetchImpl = fakeFetchFactory(jsonResponse({ id: 'user-123' }));
    assert.equal(await verifySupabaseJwt(`Bearer ${VALID_TOKEN}`, { fetch: fetchImpl }), null);
    assert.equal(await verifySupabaseJwt(`Bearer ${VALID_TOKEN}`, { fetch: fetchImpl, supabaseUrl: '   ' }), null);
    assert.equal(fetchImpl.tracker.calls.length, 0);
    assert.equal(logs.some((line) => line.includes(VALID_TOKEN)), false);
  } finally {
    console.log = previousLog;
    console.warn = previousWarn;
    console.error = previousError;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
  }
});
