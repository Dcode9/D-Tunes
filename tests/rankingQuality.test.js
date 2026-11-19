const test = require('node:test');
const assert = require('node:assert/strict');
const { getRecommendations, diversify, scoreCandidate, DEFAULT_WEIGHTS } = require('../lib/recommendationEngine');
const { areDuplicateTracks, cleanTitle, getTitleRoot, deduplicateSongs } = require('../lib/deduplication');

function makeSong(id, overrides = {}) {
  return {
    id,
    saavn_id: id,
    title: `Track ${id}`,
    name: `Track ${id}`,
    primary_artists: `Artist ${id}`,
    artist: `Artist ${id}`,
    album: `Album ${id}`,
    duration_seconds: 180,
    duration: 180,
    year: 2001,
    popularity: 10,
    language: 'Hindi',
    url: `https://cdn.example.com/audio/${id}.mp3`,
    play_url: `https://cdn.example.com/audio/${id}.mp3`,
    ...overrides,
  };
}

function depsWith(pool, overrides = {}) {
  return {
    getTasteProfile: async () => ({ language_scores_json: {}, artist_scores_json: {}, album_scores_json: {} }),
    getRecentEvents: async () => [],
    getUserSongScores: async () => [],
    getLocalCandidates: async () => pool,
    fetchExternalCandidates: async () => [],
    ...overrides,
  };
}

function assertNoDuplicatePairs(songs) {
  for (let i = 0; i < songs.length; i += 1) {
    for (let j = i + 1; j < songs.length; j += 1) {
      assert.equal(areDuplicateTracks(songs[i], songs[j]), false, `${songs[i].title} vs ${songs[j].title}`);
    }
  }
}

test('getRecommendations backfills to the 15-song floor when the artist cap starves a small pool', async () => {
  const pool = [
    ...Array.from({ length: 14 }, (_, i) => makeSong(`solo${i}`, { title: `Solo Cut ${i}`, primary_artists: 'Solo Star', artist: 'Solo Star' })),
    ...Array.from({ length: 4 }, (_, i) => makeSong(`duo${i}`, { title: `Duo Cut ${i}`, primary_artists: 'Duo Act', artist: 'Duo Act' })),
  ];
  const result = await getRecommendations('user-1', { limit: 15, playlistType: 'for-you' }, depsWith(pool));

  assert.equal(result.length, 15);
  assert.equal(new Set(result.map((song) => song.id)).size, result.length);
  assertNoDuplicatePairs(result);
});

test('diversify relaxes the artist cap only when a floor is requested', () => {
  const pool = [
    ...Array.from({ length: 14 }, (_, i) => makeSong(`solo${i}`, { title: `Solo Cut ${i}`, primary_artists: 'Solo Star', artist: 'Solo Star' })),
    ...Array.from({ length: 4 }, (_, i) => makeSong(`duo${i}`, { title: `Duo Cut ${i}`, primary_artists: 'Duo Act', artist: 'Duo Act' })),
  ];

  const strict = diversify(pool, 15);
  assert.equal(strict.length, 6);

  const filled = diversify(pool, 15, DEFAULT_WEIGHTS, { minSongs: 15 });
  assert.equal(filled.length, 15);
  assert.equal(new Set(filled.map((song) => song.id)).size, filled.length);
});

test('artist cap still holds when the pool is diverse enough for the full request', async () => {
  const pool = [];
  for (let artist = 0; artist < 10; artist += 1) {
    for (let track = 0; track < 4; track += 1) {
      pool.push(makeSong(`a${artist}s${track}`, {
        title: `Band ${artist} Song ${track}`,
        primary_artists: `Band ${artist}`,
        artist: `Band ${artist}`,
      }));
    }
  }
  const result = await getRecommendations('user-1', { limit: 25, playlistType: 'for-you' }, depsWith(pool));

  assert.equal(result.length, 25);
  const counts = new Map();
  for (const song of result) {
    const artist = song.primary_artists;
    counts.set(artist, (counts.get(artist) || 0) + 1);
    assert.ok(counts.get(artist) <= DEFAULT_WEIGHTS.maxSongsPerArtist, `${artist} exceeded cap`);
  }
});

test('title normalization matches feat/OST/unicode-dash/remaster variants', () => {
  assert.equal(getTitleRoot('Gehra Hua – From "Dhurandhar"'), 'gehra hua');
  assert.equal(cleanTitle('Kesariya – From "Brahmastra"', ''), 'kesariya');
  assert.equal(cleanTitle('Song - OST', 'Some Album'), 'song');
  assert.equal(cleanTitle('Shape of You (feat. Daft Punk)', ''), 'shape of you');
  assert.equal(cleanTitle('Tum Hi Ho [2011 Remaster]', ''), 'tum hi ho');
  assert.equal(deduplicateSongs([
    { id: 'a', title: 'Neon Nights', primary_artists: 'Nova Star', duration: 200 },
    { id: 'b', title: 'Neon Nights – OST', primary_artists: 'Nova Star', duration: 200 },
    { id: 'c', title: 'Neon Nights (Acoustic)', primary_artists: 'Nova Star', duration: 200 },
  ]).length, 2);
});

test('alternate versions stay distinct while cross-field ids collapse duplicates', () => {
  assert.equal(areDuplicateTracks(
    { title: 'Starboy', artist: 'The Weeknd', duration: 230 },
    { title: 'Starboy (Sped-Up)', artist: 'The Weeknd', duration: 230 }
  ), false);
  assert.equal(areDuplicateTracks(
    { title: 'Blinding Lights', artist: 'The Weeknd', duration: 200 },
    { title: 'Blinding Lights (Radio Edit)', artist: 'The Weeknd', duration: 200 }
  ), false);
  assert.equal(areDuplicateTracks(
    { id: 'album-9', saavn_id: 'track-1', title: 'One' },
    { id: 'track-1', title: 'Completely Different Name' }
  ), true);
});

test('duplicate variants collapse inside a ranked mix while real alternates survive', async () => {
  const pool = [
    makeSong('n1', { title: 'Neon Nights', primary_artists: 'Nova Star', artist: 'Nova Star', duration_seconds: 200, duration: 200 }),
    makeSong('n2', { title: 'Neon Nights (From "Afterglow")', album: 'Afterglow', primary_artists: 'Nova Star', artist: 'Nova Star', duration_seconds: 200, duration: 200 }),
    makeSong('n3', { title: 'Neon Nights – OST', primary_artists: 'Nova Star', artist: 'Nova Star', duration_seconds: 202, duration: 202 }),
    makeSong('n4', { title: 'Neon Nights (feat. Zara)', primary_artists: 'Nova Star, Zara', artist: 'Nova Star, Zara', duration_seconds: 200, duration: 200 }),
    makeSong('n5', { title: 'Neon Nights (Acoustic)', primary_artists: 'Nova Star', artist: 'Nova Star', duration_seconds: 195, duration: 195 }),
    makeSong('n6', { title: 'Neon Nights (Sped-Up)', primary_artists: 'Nova Star', artist: 'Nova Star', duration_seconds: 150, duration: 150 }),
    ...Array.from({ length: 12 }, (_, i) => makeSong(`f${i}`, { title: `Filler Song ${i}` })),
  ];
  const result = await getRecommendations('user-1', { limit: 15, playlistType: 'for-you' }, depsWith(pool));

  assert.equal(result.length, 15);
  const neon = result.filter((song) => song.title.startsWith('Neon Nights'));
  assert.equal(neon.length, 3);
  assert.ok(neon.some((song) => ['n1', 'n2', 'n3', 'n4'].includes(song.id)));
  assert.ok(result.some((song) => song.id === 'n5'));
  assert.ok(result.some((song) => song.id === 'n6'));
  assertNoDuplicatePairs(result);
});

test('dislikes suppress harder than recent plays and skips on one shared scale', () => {
  const profile = { artist_scores_json: { Anchor: 5 }, language_scores_json: { Hindi: 3 }, album_scores_json: {} };
  const base = { id: 'same', title: 'Plain Song', primary_artists: 'Anchor', language: 'Hindi', year: 2005 };
  const scoreFor = (row, recent = false) => scoreCandidate(base, {
    profile,
    userSongScores: new Map(row ? [['same', row]] : []),
    recentSongIds: new Set(recent ? ['same'] : []),
    excludeRecentlyPlayed: true,
    playlistType: 'for-you',
  });

  const neutral = scoreFor(null);
  const liked = scoreFor({ score: 40 });
  const disliked = scoreFor({ score: -40 });
  const oneSkip = scoreFor({ score: 0, skip_count: 1 });
  const recent = scoreFor({ score: 0 }, true);

  assert.ok(liked.recommendationScore > neutral.recommendationScore);
  assert.ok(neutral.recommendationScore > disliked.recommendationScore);
  assert.ok(neutral.recommendationScore > oneSkip.recommendationScore);
  assert.ok(neutral.recommendationScore > recent.recommendationScore);
  assert.ok(disliked.recommendationScore < oneSkip.recommendationScore);
  assert.ok(disliked.recommendationScore < recent.recommendationScore);

  const recentGap = neutral.recommendationScore - recent.recommendationScore;
  const skipGap = neutral.recommendationScore - oneSkip.recommendationScore;
  const dislikeGap = neutral.recommendationScore - disliked.recommendationScore;
  assert.ok(recentGap > 1 && recentGap < 2, `recent gap ${recentGap}`);
  assert.ok(skipGap > 0 && skipGap < 1, `skip gap ${skipGap}`);
  assert.ok(dislikeGap > 3, `dislike gap ${dislikeGap}`);
});

test('a strongly disliked track falls out of the ranked cut despite max freshness and popularity', async () => {
  const pool = [
    makeSong('chart', { title: 'Chart Topper', year: 2024, popularity: 100 }),
    ...Array.from({ length: 19 }, (_, i) => makeSong(`fill${i}`, { title: `Filler Song ${i}`, year: 1995, popularity: 5 })),
  ];
  const deps = depsWith(pool, {
    getUserSongScores: async () => [{ saavn_id: 'chart', score: -40, skip_count: 0 }],
  });
  const result = await getRecommendations('user-1', { limit: 15, playlistType: 'for-you' }, deps);

  assert.equal(result.length, 15);
  assert.ok(!result.some((song) => song.id === 'chart'));
});

test('queue, session, dislike, and negative-title exclusions are honored inside ranking', async () => {
  const pool = [
    makeSong('q1', { title: 'Queued Song' }),
    makeSong('q2', { title: 'Queued Song Two' }),
    makeSong('d1', { title: 'Disliked Song' }),
    makeSong('h1', { title: 'History Song' }),
    makeSong('s1', { title: 'Session Hit', primary_artists: 'Alpha Wave', artist: 'Alpha Wave' }),
    makeSong('x1', { title: 'Explicitly Excluded' }),
    makeSong('neg', { title: 'Negative Title Song' }),
    ...Array.from({ length: 20 }, (_, i) => makeSong(`keep${i}`, { title: `Keeper Song ${i}` })),
  ];
  const result = await getRecommendations('user-1', {
    limit: 15,
    playlistType: 'for-you',
    currentQueueIds: ['q1', 'q2'],
    dislikedSongIds: ['d1'],
    ids: ['x1'],
    negativeTitles: ['Negative Title Song'],
    sessionHistory: [{ id: 'h1' }, { title: 'Session Hit', artist: 'Alpha Wave' }],
  }, depsWith(pool));

  assert.equal(result.length, 15);
  const ids = new Set(result.map((song) => song.id));
  for (const excluded of ['q1', 'q2', 'd1', 'h1', 'x1', 'neg']) {
    assert.ok(!ids.has(excluded), `${excluded} leaked into ranked output`);
  }
  assert.ok(!result.some((song) => song.title === 'Session Hit'));
  assert.ok(result.some((song) => song.id.startsWith('keep')));
});

test('requests stay inside the 15-25 band and invalid limits fall back safely', async () => {
  const pool = Array.from({ length: 40 }, (_, i) => makeSong(`p${i}`, { title: `Bound Song ${i}` }));
  const run = (options) => getRecommendations('user-1', { playlistType: 'for-you', ...options }, depsWith(pool));

  assert.equal((await run({ limit: 15 })).length, 15);
  assert.equal((await run({ limit: 25 })).length, 25);
  assert.equal((await run({ limit: 500 })).length, 25);
  assert.equal((await run({ limit: 'abc' })).length, 25);
  assert.equal((await run({})).length, 25);
  assert.equal((await run({ limit: 8 })).length, 8);
});

test('identical pools ordered for different mix types do not replay the same sequence', async () => {
  const pool = Array.from({ length: 20 }, (_, i) => makeSong(`m${i}`, { title: `Mirror Song ${i}` }));
  const forYou = await getRecommendations('user-1', { limit: 15, playlistType: 'for-you' }, depsWith(pool));
  const dailyMix = await getRecommendations('user-1', { limit: 15, playlistType: 'daily-mix-1' }, depsWith(pool));

  const forYouOrder = forYou.map((song) => song.id).join(',');
  const dailyOrder = dailyMix.map((song) => song.id).join(',');
  assert.notEqual(forYouOrder, dailyOrder);
});
