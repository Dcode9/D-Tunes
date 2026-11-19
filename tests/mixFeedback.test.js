'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  MIX_KEYS,
  MIX_META,
  getMixFeedbackExclusions,
  buildAutoplay,
  buildRecommendations,
  buildMixes,
  recordFeedback,
} = require('../lib/recommendationRoutes');

function makeSong(index, overrides = {}) {
  const title = overrides.title || `Track ${index}`;
  return {
    saavn_id: `s${index}`,
    id: `s${index}`,
    title,
    name: title,
    primary_artists: overrides.artist || `Artist ${index}`,
    artist: overrides.artist || `Artist ${index}`,
    album: overrides.album || `Album ${index}`,
    language: overrides.language || 'English',
    duration: 180 + index,
    url: `https://cdn.example.com/audio/${index}.mp3`,
    img: `https://cdn.example.com/art/${index}.jpg`,
    ...overrides,
  };
}

const LIBRARY = Array.from({ length: 60 }, (_, index) => makeSong(index + 1));

function createFakeSaavn() {
  return {
    getSong: async () => ({ saavn_id: 'seed-1', id: 'seed-1', title: 'Seed Track', primary_artists: 'Seed Artist' }),
    getSongSuggestions: async (_id, limit) => LIBRARY.slice(0, limit),
    getArtistTopSongs: async (_artist, limit) => LIBRARY.slice(5, 5 + limit),
    searchSongs: async (_query, limit) => LIBRARY.slice(10, 10 + limit),
    getTrending: async (limit) => LIBRARY.slice(0, limit),
  };
}

function createFeedbackStore(rows = [], saved = []) {
  return {
    getMixFeedback: async () => rows,
    recordMixFeedback: async (record) => saved.push(record),
    recordEvent: () => {},
  };
}

test('recordFeedback persists mix-only feedback through the injected store', async () => {
  const saved = [];
  const deps = { store: createFeedbackStore([], saved) };

  const result = await recordFeedback(
    {
      userId: 'user-1',
      mixKey: 'chill-vibes',
      mixTitle: 'Chill Vibes',
      isLiked: false,
      reason: 'too slow',
      customFeedback: 'More energy please',
    },
    deps
  );

  assert.deepEqual(result, { ok: true });
  assert.equal(saved.length, 1);
  assert.equal(saved[0].userId, 'user-1');
  assert.equal(saved[0].mixKey, 'chill-vibes');
  assert.equal(saved[0].mixTitle, 'Chill Vibes');
  assert.equal(saved[0].isLiked, false);
  assert.equal(saved[0].reason, 'too slow');
  assert.equal(saved[0].customFeedback, 'More energy please');
  assert.ok(saved[0].createdAt);
});

test('recordFeedback still records a like/unlike event when a songId is present', async () => {
  const saved = [];
  const events = [];
  const store = createFeedbackStore([], saved);
  store.recordEvent = (event) => events.push(event);

  await recordFeedback(
    { userId: 'user-1', songId: 's1', isLiked: true, mixKey: 'mood', reason: 'great mix' },
    { store }
  );

  assert.equal(saved.length, 1);
  assert.equal(saved[0].isLiked, true);
  assert.equal(events.length, 1);
  assert.equal(events[0].songSaavnId, 's1');
  assert.equal(events[0].eventType, 'like');
  assert.equal(events[0].context.mixKey, 'mood');
});

test('recordFeedback never throws and does nothing for bodies without a mix rating', async () => {
  const saved = [];
  const deps = { store: createFeedbackStore([], saved) };

  assert.deepEqual(await recordFeedback({ songId: '', userId: 'user-1' }, deps), { ok: true });
  assert.deepEqual(await recordFeedback({ userId: 'user-1', mixKey: 'mood' }, deps), { ok: true });
  assert.deepEqual(await recordFeedback(null, deps), { ok: true });
  assert.equal(saved.length, 0);
});

test('getMixFeedbackExclusions turns disliked mixes and reasons into hints and keywords', async () => {
  const rows = [
    { mix_key: 'chill-vibes', mix_title: 'Chill Vibes', is_liked: false, reason: 'too sad', created_at: '2026-01-02T00:00:00Z' },
    { mix_key: 'daily-mix-1', mix_title: 'Daily Mix 1', is_liked: false, reason: 'too much rap', created_at: '2026-01-03T00:00:00Z' },
    { mix_key: 'mood', mix_title: 'Mood Mix', is_liked: true, reason: 'loved it', created_at: '2026-01-04T00:00:00Z' },
  ];
  const hints = await getMixFeedbackExclusions('user-1', { store: createFeedbackStore(rows) });

  assert.deepEqual(hints.dislikedMixKeys.sort(), ['chill-vibes', 'daily-mix-1']);
  assert.deepEqual(hints.reasons.sort(), ['too much rap', 'too sad']);
  assert.ok(hints.keywords.includes('sad'));
  assert.ok(hints.keywords.includes('rap'));
  assert.ok(hints.keywords.includes('chill'));
  assert.ok(hints.promptHints.includes('too much rap'));
  assert.ok(!hints.dislikedMixKeys.includes('mood'));
});

test('buildRecommendations passes disliked mix hints to the engine and filters fallback songs', async () => {
  const library = [
    makeSong(1, { title: 'Normal Song', artist: 'Artist One' }),
    makeSong(2, { title: 'Sad Rap Anthem', artist: 'Artist Two' }),
    ...Array.from({ length: 40 }, (_, index) => makeSong(index + 3)),
  ];
  let engineOptions = null;
  const rows = [{ mix_key: 'daily-mix-1', is_liked: false, reason: 'too much rap' }];

  const result = await buildRecommendations(
    { userId: 'user-1', limit: 15 },
    {
      saavn: createFakeSaavn(),
      store: createFeedbackStore(rows),
      getRecommendations: async (_userId, options) => {
        engineOptions = options;
        return library.slice(0, options.limit);
      },
    }
  );

  assert.equal(result.songs.length, 15);
  assert.ok(result.songs.every((song) => song.title !== 'Sad Rap Anthem'));
  assert.deepEqual(engineOptions.avoidedKeywords, ['rap']);
  assert.ok(engineOptions.negativeTitles.includes('rap'));
  assert.deepEqual(engineOptions.dislikedMixKeys, ['daily-mix-1']);
});

test('buildMixes includes disliked mix reasons in the AI prompt', async () => {
  let prompt = '';
  const rows = [{ mix_key: 'chill-vibes', is_liked: false, reason: 'too much rap' }];

  await buildMixes(
    { userId: 'user-1', limit: 15, type: 'your-mix' },
    {
      saavn: createFakeSaavn(),
      store: createFeedbackStore(rows),
      callAI: async (text) => {
        prompt = text;
        return null;
      },
      getRecommendations: async (_userId, options) => LIBRARY.slice(0, options.limit),
    }
  );

  assert.ok(prompt.includes('Disliked mixes to avoid'));
  assert.ok(prompt.includes('too much rap'));
  assert.ok(prompt.includes('rap'));
  assert.ok(prompt.includes('Curate exactly 1'));
});

test('buildAutoplay adds up to 10 session history entries to the AI prompt and defaults to 15 songs', async () => {
  let prompt = '';
  const sessionHistory = Array.from({ length: 12 }, (_, index) => ({
    title: `History ${index + 1}`,
    artist: `History Artist ${index + 1}`,
  }));

  const result = await buildAutoplay(
    { seedSongId: 'seed-1', sessionHistory },
    {
      saavn: createFakeSaavn(),
      callAI: async (text) => {
        prompt = text;
        return null;
      },
    }
  );

  assert.equal(result.songs.length, 15);
  assert.ok(prompt.includes('Seed Track'));
  for (let index = 1; index <= 10; index += 1) {
    assert.ok(prompt.includes(`History ${index}"`), `prompt should include history ${index}`);
  }
  assert.ok(!prompt.includes('History 11'));
  assert.ok(!prompt.includes('History 12'));
});

test('buildAutoplay keeps explicit small counts at the 8-song floor', async () => {
  const result = await buildAutoplay(
    { seedSongId: 'seed-1', limit: 2 },
    { saavn: createFakeSaavn(), callAI: async () => null }
  );
  assert.equal(result.songs.length, 8);

  const eight = await buildAutoplay(
    { seedSongId: 'seed-1', limit: 8 },
    { saavn: createFakeSaavn(), callAI: async () => null }
  );
  assert.equal(eight.songs.length, 8);
});

test('your-mix is a first-class server mix but stays out of the default mix payload', async () => {
  assert.ok(MIX_KEYS.includes('your-mix'));
  assert.equal(MIX_META['your-mix'].title, 'Your Mix');

  const deps = {
    saavn: createFakeSaavn(),
    callAI: async () => null,
    getRecommendations: async (_userId, options) => LIBRARY.slice(0, options.limit),
    store: createFeedbackStore(),
  };

  const requested = await buildMixes({ type: 'your-mix', limit: 15 }, deps);
  assert.equal(requested.mixes.length, 1);
  assert.equal(requested.mixes[0].key, 'your-mix');
  assert.equal(requested.mixes[0].title, 'Your Mix');
  assert.equal(requested.mixes[0].styleIndex, 5);
  assert.equal(requested.mixes[0].songs.length, 15);

  const defaultResult = await buildMixes({ limit: 15 }, deps);
  assert.equal(defaultResult.mixes.length, 4);
  assert.ok(defaultResult.mixes.every((mix) => mix.key !== 'your-mix'));
});

test('migration 007 creates the durable mix feedback contract', () => {
  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'db', 'migrations', '007_mix_feedback.sql'),
    'utf8'
  );

  assert.match(sql, /create table if not exists public\.dtunes_mix_feedback/i);
  assert.match(sql, /user_id uuid/i);
  assert.match(sql, /references auth\.users/i);
  assert.match(sql, /is_liked boolean/i);
  assert.match(sql, /reason text/i);
  assert.match(sql, /custom_feedback text/i);
  assert.match(sql, /Users manage own dtunes_mix_feedback rows/);
  assert.match(sql, /auth\.uid\(\) = user_id/);
  assert.match(sql, /dtunes_mix_feedback_user_created_idx/);
  assert.match(sql, /alter publication supabase_realtime add table public\.dtunes_mix_feedback/);
});
