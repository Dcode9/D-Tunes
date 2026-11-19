'use strict';

const saavn = require('./saavnClient');
const { callAI } = require('./aiClient');
const {
  cleanId,
  songTitle,
  songArtist,
  normalizeSongKey,
  applyExclusions,
  withDualAliases,
} = require('./recommendationHelpers');

// The pre-API client generated queue autoplay with mercury-2.5 through
// Inception and hydrated every suggestion with the first search result.
const LEGACY_MODEL = 'mercury-2.5';
const LEGACY_PROVIDER = 'inception';

const SYSTEM_PROMPT = 'You output strictly raw JSON with schema {"songs": [{"title": "string", "artist": "string"}]}. No markdown.';

function buildPrompt(seedTitle, seedArtist, count = 8, dislikedSongs = []) {
  const dislikedList = (Array.isArray(dislikedSongs) ? dislikedSongs : [])
    .map((entry) => {
      if (entry && typeof entry === 'object') {
        return `"${entry.name || entry.title || 'Track'}" by ${entry.artist || 'Artist'}`;
      }
      return String(entry);
    })
    .filter(Boolean);

  return `The listener is currently enjoying "${seedTitle}" by "${seedArtist}".
Strict exclusions (never recommend): [${dislikedList.length > 0 ? dislikedList.join(', ') : 'None'}]

Recommend ${count} real, popular, and stylistically similar songs that maintain seamless harmonic, tempo, and emotional continuity with this track for an uninterrupted continuous listening session.
Ensure artist variety (do not repeat the same artist more than once).
Return ONLY raw JSON with schema:
{
  "songs": [
    { "title": "Song Name", "artist": "Artist Name" }
  ]
}`;
}

function isPlayable(song) {
  const url = song && song.url;
  const img = song && song.img;
  return Boolean(
    url && typeof url === 'string' && url.startsWith('http') &&
    img && typeof img === 'string' && img.startsWith('http') &&
    !img.includes('DTunes.svg')
  );
}

async function searchTrackData(song, saavnClient, cache) {
  const query = `${song.title || song.name || ''} ${song.artist || song.primary_artists || ''}`.trim();
  if (!query) return null;
  if (cache.has(query)) return cache.get(query);
  const results = await saavnClient.searchSongs(query, 1).catch(() => []);
  const match = Array.isArray(results) && results.length > 0 && isPlayable(results[0]) ? results[0] : null;
  cache.set(query, match);
  return match;
}

async function hydrateSongs(songs, saavnClient, cache) {
  const hydrated = [];
  const seenIds = new Set();
  const seenKeys = new Set();
  for (const raw of Array.isArray(songs) ? songs : []) {
    if (!raw) continue;
    const track = isPlayable(raw) ? raw : await searchTrackData(raw, saavnClient, cache);
    if (!track) continue;
    const id = String(track.id || track.saavn_id || '').trim();
    const key = normalizeSongKey(track);
    if (id && seenIds.has(id)) continue;
    if (key && seenKeys.has(key)) continue;
    if (id) seenIds.add(id);
    if (key) seenKeys.add(key);
    hydrated.push(track);
  }
  return hydrated;
}

function promptExclusions(input = {}) {
  const seen = new Set();
  const list = [];
  const values = [
    ...(input.negativeTitles || []),
    ...(input.excludedSongIds || []),
    ...(input.dislikedSongIds || []),
  ];
  for (const value of values) {
    const text = String(value || '').trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(text);
    if (list.length >= 25) break;
  }
  return list;
}

async function generateLegacyAutoplay(input = {}, deps = {}) {
  const ai = deps.callAI || callAI;
  const saavnClient = deps.saavn || saavn;
  const count = Number(input.limit) || 8;

  const seedSongId = cleanId(input.seedSongId);
  const seed = seedSongId
    ? await saavnClient.getSong(seedSongId).catch(() => null)
    : null;
  const seedTitle = input.seedTitle || (seed ? songTitle(seed) : '') || 'Starboy';
  const seedArtist = input.seedArtist || (seed ? songArtist(seed) : '') || 'The Weeknd';

  const prompt = buildPrompt(seedTitle, seedArtist, count, promptExclusions(input));
  const parsed = await ai(prompt, SYSTEM_PROMPT, {
    model: LEGACY_MODEL,
    provider: LEGACY_PROVIDER,
  }).catch(() => null);

  const pairs = parsed && Array.isArray(parsed.songs)
    ? parsed.songs.filter((pair) => pair && typeof pair === 'object' && (pair.title || pair.name))
    : [];

  const cache = new Map();
  let songs;
  if (pairs.length > 0) {
    songs = await hydrateSongs(pairs, saavnClient, cache);
  } else {
    const fallback = await saavnClient.searchSongs(`${seedArtist} hits`, count).catch(() => []);
    songs = await hydrateSongs(fallback, saavnClient, cache);
  }

  const filtered = applyExclusions(songs, {
    ids: [
      seedSongId,
      ...(input.excludedSongIds || []),
      ...(input.dislikedSongIds || []),
      ...(input.currentQueueIds || []),
    ],
    negativeTitles: input.negativeTitles || [],
    sessionHistory: input.sessionHistory || [],
  });

  return { songs: filtered.slice(0, count).map(withDualAliases) };
}

module.exports = {
  LEGACY_MODEL,
  LEGACY_PROVIDER,
  SYSTEM_PROMPT,
  buildPrompt,
  promptExclusions,
  isPlayable,
  hydrateSongs,
  generateLegacyAutoplay,
};
