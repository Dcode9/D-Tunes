const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildPrompt,
  FALLBACK_PLAYLISTS,
  generateLegacyDailyMixes,
} = require('../lib/legacyDailyMixes');
const { validateMixesBody } = require('../lib/apiSecurity');

function makeSong(index) {
  return {
    saavn_id: `legacy-${index}`,
    id: `legacy-${index}`,
    title: `Legacy Track ${index}`,
    name: `Legacy Track ${index}`,
    primary_artists: `Legacy Artist ${index}`,
    artist: `Legacy Artist ${index}`,
    album: `Legacy Album ${index}`,
    duration: 180 + index,
    url: `https://cdn.example.com/audio/legacy-${index}.mp3`,
    img: `https://cdn.example.com/art/legacy-${index}.jpg`,
  };
}

function tasteFixture() {
  return {
    playlists: [{
      name: 'Road Trip',
      count: 12,
      songs: [{ title: 'Blinding Lights', artist: 'The Weeknd', duration: 200 }],
    }],
    stats: [{ title: 'Kesariya', artist: 'Arijit Singh', playCount: 42, durationMs: 11256000 }],
    history: [{ title: 'Leela', artist: 'Prateek Kuhad', duration: 268, playedAt: '2026-11-19T10:20:30Z' }],
    artists: [{ name: 'The Weeknd', count: 9 }, { name: 'Dua Lipa', count: 4 }],
    liked: [{ title: 'Starboy', artist: 'The Weeknd' }],
    library: [{ title: 'Heat Waves', artist: 'Glass Animals' }],
    disliked: [{ title: 'Sad Rap Anthem', artist: 'Someone' }],
  };
}

function makeAiPlaylists(count = 6, songsPerMix = 5) {
  return {
    playlists: Array.from({ length: count }, (_, mixIndex) => ({
      categoryTitle: `Category ${mixIndex + 1}`,
      title: `Mix ${mixIndex + 1}`,
      description: `Mood ${mixIndex + 1}`,
      styleIndex: mixIndex,
      songs: Array.from({ length: songsPerMix }, (_, songIndex) => ({
        title: `Song ${mixIndex}-${songIndex}`,
        artist: `Artist ${mixIndex}-${songIndex}`,
      })),
    })),
  };
}

test('buildPrompt recreates the pre-API daily mix prompt exactly', () => {
  const { prompt, systemPrompt } = buildPrompt(tasteFixture());

  assert.ok(prompt.includes('Each mix must contain EXACTLY 5'));
  assert.ok(prompt.includes('Generate 6 distinct'));
  assert.ok(!prompt.includes('BETWEEN 15 AND 25'));
  assert.ok(prompt.includes('Playlist "Road Trip" (12 tracks): ["Blinding Lights" by The Weeknd [3:20]]'));
  assert.ok(prompt.includes('"Leela" by Prateek Kuhad (length: 4:28) at 2026-11-19 10:20'));
  assert.ok(prompt.includes('"Kesariya" by Arijit Singh (42 plays, ~188 min listened)'));
  assert.ok(prompt.includes('The Weeknd (9 plays)'));
  assert.ok(prompt.includes('"Sad Rap Anthem" by Someone'));
  assert.match(systemPrompt, /elite music curation director/);
});

test('generateLegacyDailyMixes hydrates six five-song mixes from first search results', async () => {
  let counter = 0;
  const saavn = { searchSongs: async () => [makeSong(++counter)] };
  const result = await generateLegacyDailyMixes(
    { userId: 'user-1', taste: tasteFixture() },
    { saavn, callAI: async () => makeAiPlaylists() }
  );

  assert.equal(result.mixes.length, 6);
  assert.deepEqual(result.mixes.map((mix) => mix.key), [
    'daily-mix-1', 'daily-mix-2', 'daily-mix-3', 'daily-mix-4', 'daily-mix-5', 'daily-mix-6',
  ]);
  result.mixes.forEach((mix) => {
    assert.equal(mix.songs.length, 5);
    mix.songs.forEach((song) => {
      assert.ok(song.url.startsWith('http'));
      assert.ok(song.img.startsWith('http'));
      assert.equal(song.artwork_url, song.img);
    });
  });
});

test('generateLegacyDailyMixes drops mixes with fewer than two playable songs', async () => {
  const saavn = {
    searchSongs: async (query) => (query.startsWith('Broken')
      ? [{ ...makeSong(1), url: '', img: '' }]
      : [makeSong(2)]),
  };
  const result = await generateLegacyDailyMixes(
    { userId: 'user-1', taste: tasteFixture() },
    {
      saavn,
      callAI: async () => ({
        playlists: [
          {
            categoryTitle: 'Broken Mix',
            title: 'Broken',
            description: 'Missing audio',
            styleIndex: 0,
            songs: Array.from({ length: 5 }, (_, i) => ({ title: `Broken ${i}`, artist: 'Nobody' })),
          },
          {
            categoryTitle: 'Good Mix',
            title: 'Good',
            description: 'Playable',
            styleIndex: 1,
            songs: Array.from({ length: 5 }, (_, i) => ({ title: `Good ${i}`, artist: 'Somebody' })),
          },
        ],
      }),
    }
  );

  assert.equal(result.mixes.length, 1);
  assert.equal(result.mixes[0].key, 'daily-mix-1');
  assert.equal(result.mixes[0].title, 'Good');
  assert.equal(result.mixes[0].songs.length, 5);
});

test('generateLegacyDailyMixes uses the hardcoded fallbacks when the AI fails', async () => {
  const saavn = { searchSongs: async (query) => [{ ...makeSong(1), title: query }] };
  const result = await generateLegacyDailyMixes(
    { userId: 'user-1', taste: tasteFixture() },
    { saavn, callAI: async () => null }
  );

  assert.equal(result.mixes.length, FALLBACK_PLAYLISTS.length);
  assert.deepEqual(result.mixes.map((mix) => mix.title), FALLBACK_PLAYLISTS.map((mix) => mix.title));
  result.mixes.forEach((mix) => {
    assert.equal(mix.songs.length, 5);
    assert.ok(!/diwali|festive|festival|holiday|seasonal/i.test(`${mix.categoryTitle} ${mix.title} ${mix.description}`));
  });
});

test('validateMixesBody sanitizes client taste context and drops unknown fields', () => {
  const { ok, value } = validateMixesBody({
    taste: {
      history: [{ title: ' Song ', artist: ' Artist ', duration: 200, extra: 'dropped' }],
      liked: [{ name: 'C', primary_artists: 'D' }],
      playlists: [{ name: ' P ', count: 2, songs: [{ title: 'A', artist: 'B' }] }],
    },
  });

  assert.equal(ok, true);
  assert.deepEqual(value.taste.history, [{ title: 'Song', artist: 'Artist', duration: 200, playedAt: '' }]);
  assert.deepEqual(value.taste.liked, [{ title: 'C', artist: 'D', duration: 0, playedAt: '' }]);
  assert.equal(value.taste.playlists[0].name, 'P');
  assert.equal(value.taste.playlists[0].count, 2);
  assert.equal(value.taste.history[0].extra, undefined);
});
