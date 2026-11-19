'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildPrompt,
  isPlayable,
  generateLegacyAutoplay,
} = require('../lib/legacyAutoplay');

function makeSong(index) {
  return {
    id: `s${index}`,
    saavn_id: `s${index}`,
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

test('buildPrompt matches the pre-API autoplay prompt exactly', () => {
  const expected = `The listener is currently enjoying "Midnight City" by "M83".
Strict exclusions (never recommend): ["Blinding Lights" by The Weeknd, Shape of You]

Recommend 8 real, popular, and stylistically similar songs that maintain seamless harmonic, tempo, and emotional continuity with this track for an uninterrupted continuous listening session.
Ensure artist variety (do not repeat the same artist more than once).
Return ONLY raw JSON with schema:
{
  "songs": [
    { "title": "Song Name", "artist": "Artist Name" }
  ]
}`;

  assert.equal(
    buildPrompt('Midnight City', 'M83', 8, [
      { title: 'Blinding Lights', artist: 'The Weeknd' },
      'Shape of You',
    ]),
    expected
  );
});

test('generateLegacyAutoplay hydrates the first search result and drops unplayable tracks', async () => {
  const saavn = {
    getSong: async () => makeSong(100),
    searchSongs: async (query) => {
      if (query.startsWith('Good One')) return [makeSong(1), makeSong(50)];
      if (query.startsWith('Good Two')) return [makeSong(2)];
      if (query.startsWith('Broken')) return [{ ...makeSong(3), url: '' }];
      return [];
    },
  };

  const result = await generateLegacyAutoplay(
    { seedSongId: 'seed-1', seedTitle: 'Seed', seedArtist: 'Artist', limit: 8 },
    {
      saavn,
      callAI: async () => ({
        songs: [
          { title: 'Good One', artist: 'A' },
          { title: 'Good Two', artist: 'B' },
          { title: 'Broken', artist: 'C' },
        ],
      }),
    }
  );

  assert.deepEqual(result.songs.map((song) => song.id), ['s1', 's2']);
  assert.equal(result.songs[0].name, 'Track 1');
  assert.equal(result.songs[0].primary_artists, 'Artist 1');
  assert.equal(result.songs[0].url, 'https://cdn.example.com/audio/1.mp3');
  assert.equal(result.songs[0].artwork_url, 'https://cdn.example.com/art/1.jpg');
});

test('generateLegacyAutoplay falls back to artist hits and honors queue exclusions', async () => {
  const saavn = {
    getSong: async () => null,
    searchSongs: async (query, limit) => (
      query === 'Artist hits' ? [makeSong(10), makeSong(11), makeSong(12)].slice(0, limit) : []
    ),
  };

  const result = await generateLegacyAutoplay(
    { seedArtist: 'Artist', limit: 8, currentQueueIds: ['s10'] },
    { saavn, callAI: async () => null }
  );

  assert.deepEqual(result.songs.map((song) => song.id), ['s11', 's12']);
});

test('isPlayable requires http audio and artwork and rejects fallback art', () => {
  assert.equal(isPlayable(makeSong(1)), true);
  assert.equal(isPlayable({ ...makeSong(1), url: '' }), false);
  assert.equal(isPlayable({ ...makeSong(1), img: 'https://cdn.example.com/DTunes.svg' }), false);
  assert.equal(isPlayable({ ...makeSong(1), img: '/art.jpg' }), false);
});
