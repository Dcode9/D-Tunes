const test = require('node:test');
const assert = require('node:assert/strict');
const { clampLimit, applyExclusions, withDualAliases, normalizeSongKey } = require('../lib/recommendationHelpers');
const { parseJsonSafe } = require('../lib/aiClient');
const { buildAutoplay, buildRecommendations, buildMixes } = require('../lib/recommendationRoutes');

function makeSong(index) {
  return {
    saavn_id: `s${index}`,
    id: `s${index}`,
    title: `Track ${index}`,
    name: `Track ${index}`,
    primary_artists: `Artist ${index}`,
    artist: `Artist ${index}`,
    album: `Album ${index}`,
    duration: 180 + index,
    url: `https://cdn.example.com/audio/${index}.mp3`,
    img: `https://cdn.example.com/art/${index}.jpg`,
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

function assertDualAliases(song) {
  assert.ok(song.id, 'id must be present');
  assert.equal(song.saavn_id, song.id);
  assert.equal(song.name, song.title);
  assert.equal(song.artist, song.primary_artists);
  assert.ok(typeof song.album === 'string');
  assert.ok(Number.isFinite(song.duration));
  assert.ok(song.url);
  assert.ok(song.img);
  assert.equal(song.artwork_url, song.img);
}

test('clampLimit enforces min/max and tolerates invalid input', () => {
  assert.equal(clampLimit(2, 8, 25), 8);
  assert.equal(clampLimit(99, 8, 25), 25);
  assert.equal(clampLimit('18', 8, 25), 18);
  assert.equal(clampLimit(undefined), 15);
  assert.equal(clampLimit(7, 15, 25), 15);
  assert.equal(clampLimit(30), 25);
});

test('normalizeSongKey strips brackets, casing, and punctuation', () => {
  assert.equal(normalizeSongKey({ title: 'Blinding Lights (Official Video)', primary_artists: 'The Weeknd' }), 'blinding lights::the weeknd');
  assert.equal(normalizeSongKey('Blinding Lights::The Weeknd'), 'blinding lights::the weeknd');
});

test('applyExclusions filters by id, normalized key, negative title, queue, and session history', () => {
  const songs = [
    { id: 'a1', title: 'Blinding Lights (Official Video)', primary_artists: 'The Weeknd' },
    { id: 'a2', title: 'Shape of You', primary_artists: 'Ed Sheeran' },
    { id: 'a3', title: 'Levitating', primary_artists: 'Dua Lipa' },
    { id: 'a4', title: 'Stay', primary_artists: 'The Kid LAROI' },
  ];

  const result = applyExclusions(songs, {
    ids: ['jiosaavn://a2'],
    keys: ['Blinding Lights::The Weeknd'],
    negativeTitles: ['levitating!'],
    currentQueueIds: ['a4'],
  });
  assert.equal(result.length, 0);

  assert.equal(applyExclusions(songs, { sessionHistory: [{ id: 'a3' }] }).length, 3);
  assert.equal(applyExclusions(songs, { sessionHistory: [{ title: 'Shape of You', artist: 'Ed Sheeran' }] }).length, 3);
  assert.equal(applyExclusions(songs, {}).length, 4);
});

test('withDualAliases exposes both web and Android-compatible keys', () => {
  const aliased = withDualAliases({
    saavn_id: 'x1',
    name: 'Song',
    artist: 'Artist',
    artwork_url: 'https://cdn.example.com/art.jpg',
    play_url: 'https://cdn.example.com/audio.mp3',
  });
  assert.equal(aliased.id, 'x1');
  assert.equal(aliased.saavn_id, 'x1');
  assert.equal(aliased.title, 'Song');
  assert.equal(aliased.name, 'Song');
  assert.equal(aliased.primary_artists, 'Artist');
  assert.equal(aliased.artist, 'Artist');
  assert.equal(aliased.img, 'https://cdn.example.com/art.jpg');
  assert.equal(aliased.artwork_url, 'https://cdn.example.com/art.jpg');
  assert.equal(aliased.url, 'https://cdn.example.com/audio.mp3');
  assert.equal(aliased.play_url, 'https://cdn.example.com/audio.mp3');
});

test('parseJsonSafe handles fenced and surrounded JSON without throwing', () => {
  assert.deepEqual(parseJsonSafe('```json\n{"songs":[]}\n```'), { songs: [] });
  assert.deepEqual(parseJsonSafe('Here you go: {"songs":[{"title":"A"}]} hope this helps'), { songs: [{ title: 'A' }] });
  assert.equal(parseJsonSafe('not json'), null);
});

test('buildAutoplay backfills to the requested limit when AI returns null', async () => {
  const result = await buildAutoplay(
    {
      seedSongId: 'jiosaavn://seed-1',
      limit: 40,
      currentQueueIds: ['s1'],
      excludedSongIds: ['s2'],
      negativeTitles: ['Track 3'],
    },
    { saavn: createFakeSaavn(), callAI: async () => null }
  );

  assert.equal(result.songs.length, 25);
  assert.equal(new Set(result.songs.map((song) => song.id)).size, result.songs.length);
  assert.ok(result.songs.every((song) => song.id !== 's1' && song.id !== 's2' && song.id !== 'seed-1'));
  assert.ok(result.songs.every((song) => song.title !== 'Track 3'));
  result.songs.forEach(assertDualAliases);
});

test('buildRecommendations suppresses dislikes and meets the 15-song minimum', async () => {
  const result = await buildRecommendations(
    { limit: 2, dislikedSongIds: ['s1', 's2'], negativeTitles: ['Track 3'] },
    {
      saavn: createFakeSaavn(),
      getRecommendations: async (_userId, options) => LIBRARY.slice(0, options.limit),
      store: {},
    }
  );

  assert.equal(result.songs.length, 15);
  assert.ok(result.songs.every((song) => !['s1', 's2', 's3'].includes(song.id)));
  result.songs.forEach(assertDualAliases);
});

test('buildMixes falls back to the legacy daily mixes when AI returns null', async () => {
  const result = await buildMixes(
    { limit: 15, currentQueueIds: ['s1'], negativeTitles: ['Track 2'] },
    {
      saavn: createFakeSaavn(),
      callAI: async () => null,
      getRecommendations: async (_userId, options) => LIBRARY.slice(0, options.limit),
      store: {},
    }
  );

  assert.equal(result.mixes.length, 4);
  assert.deepEqual(result.mixes.map((mix) => mix.key), ['daily-mix-1', 'daily-mix-2', 'daily-mix-3', 'daily-mix-4']);
  for (const mix of result.mixes) {
    assert.equal(mix.songs.length, 5);
    assert.ok(!/diwali|festival|festive|holiday|seasonal/i.test(`${mix.title} ${mix.description}`));
    mix.songs.forEach(assertDualAliases);
  }
});

test('buildMixes drops festive AI mixes and hydrates the legacy fallbacks instead', async () => {
  const result = await buildMixes(
    { limit: 15 },
    {
      saavn: createFakeSaavn(),
      callAI: async () => ({
        playlists: [{ categoryTitle: 'Diwali Special', title: 'Festive Lights', description: 'Celebration', styleIndex: 0, songs: [] }],
      }),
      getRecommendations: async (_userId, options) => LIBRARY.slice(0, options.limit),
      store: {},
    }
  );

  assert.deepEqual(result.mixes.map((mix) => mix.key), ['daily-mix-1', 'daily-mix-2', 'daily-mix-3', 'daily-mix-4']);
  assert.ok(result.mixes.every((mix) => mix.songs.length === 5));
  assert.ok(result.mixes.every((mix) => !/diwali|festive|festival/i.test(`${mix.categoryTitle} ${mix.title} ${mix.description}`)));
});
