'use strict';

const { getRecommendations, PLAYLIST_TYPES } = require('./recommendationEngine');
const { deduplicateSongs } = require('./deduplication');
const saavn = require('./saavnClient');
const store = require('./jsonStore');
const { callAI } = require('./aiClient');
const {
  cleanId,
  songTitle,
  songArtist,
  applyExclusions,
  withDualAliases,
  clampLimit,
  isFestiveText,
} = require('./recommendationHelpers');

const MIX_KEYS = ['daily-mix-1', 'daily-mix-2', 'discover-weekly', 'chill-vibes', 'mood'];
const MIX_META = {
  'daily-mix-1': { categoryTitle: 'Daily Mix 1', title: 'Daily Mix 1', description: 'Familiar favourites and fresh finds built around your taste.', styleIndex: 0 },
  'daily-mix-2': { categoryTitle: 'Daily Mix 2', title: 'Daily Mix 2', description: 'A second daily rotation of the artists and moods you return to.', styleIndex: 1 },
  'discover-weekly': { categoryTitle: 'Discover Weekly', title: 'Discover Weekly', description: 'New artists and deep cuts worth adding to your rotation.', styleIndex: 2 },
  'chill-vibes': { categoryTitle: 'Chill Vibes', title: 'Chill Vibes', description: 'Soft textures, unhurried rhythms, and easy listening.', styleIndex: 3 },
  mood: { categoryTitle: 'Mood Mix', title: 'Mood Mix', description: 'A flexible mix shaped by your listening mood.', styleIndex: 4 },
};

function topKeys(map = {}, count = 3) {
  return Object.entries(map).sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, count).map(([key]) => key).filter(Boolean);
}

async function externalCandidates({ playlistType, profile, options, limit }, saavnClient = saavn) {
  const candidates = [];
  const artists = topKeys(profile.artist_scores_json, 3);
  const languages = topKeys(profile.language_scores_json, 2);

  if (options.seedSongId) {
    const suggestions = await saavnClient.getSongSuggestions(options.seedSongId, limit).catch(() => []);
    candidates.push(...suggestions);

    const seed = await saavnClient.getSong(options.seedSongId).catch(() => null);
    if (seed) {
      options.seedSong = seed;
      if (seed.primary_artists) {
        const primary = String(seed.primary_artists).split(',')[0].trim();
        if (primary) candidates.push(...await saavnClient.getArtistTopSongs(primary, Math.ceil(limit / 2)).catch(() => []));
      }
      candidates.push(...await saavnClient.searchSongs(`${seed.primary_artists} ${seed.title}`, limit).catch(() => []));
      if (seed.album) candidates.push(...await saavnClient.searchSongs(`${seed.album} ${seed.primary_artists}`, limit).catch(() => []));
    }
  }

  if (options.seedArtist) {
    candidates.push(...await saavnClient.getArtistTopSongs(options.seedArtist, limit).catch(() => []));
    candidates.push(...await saavnClient.searchSongs(`${options.seedArtist} top songs`, limit).catch(() => []));
  }

  if (options.language) {
    candidates.push(...await saavnClient.searchSongs(`top ${options.language} hits 2026`, limit).catch(() => []));
  }

  if (playlistType === PLAYLIST_TYPES.LATE_NIGHT || playlistType === PLAYLIST_TYPES.CHILL_VIBES) {
    candidates.push(...await saavnClient.searchSongs('soft acoustic lofi romantic songs', limit).catch(() => []));
    candidates.push(...await saavnClient.searchSongs('midnight chill unplugged melodies', limit).catch(() => []));
  } else if (playlistType === PLAYLIST_TYPES.DISCOVERY || playlistType === PLAYLIST_TYPES.DISCOVER_WEEKLY) {
    candidates.push(...await saavnClient.searchSongs(`${languages[0] || ''} new indie trending songs`.trim(), limit).catch(() => []));
    candidates.push(...await saavnClient.searchSongs('fresh breakthrough indie pop 2026', limit).catch(() => []));
  } else if (playlistType === PLAYLIST_TYPES.DAILY_MIX_1) {
    if (artists[0]) candidates.push(...await saavnClient.getArtistTopSongs(artists[0], limit).catch(() => []));
    candidates.push(...await saavnClient.searchSongs(`${languages[0] || ''} top hits`, limit).catch(() => []));
  } else if (playlistType === PLAYLIST_TYPES.DAILY_MIX_2) {
    if (artists[1] || artists[0]) candidates.push(...await saavnClient.getArtistTopSongs(artists[1] || artists[0], limit).catch(() => []));
    candidates.push(...await saavnClient.searchSongs(`${languages[1] || languages[0] || ''} viral songs`, limit).catch(() => []));
  } else if (playlistType === PLAYLIST_TYPES.RELEASE_RADAR) {
    candidates.push(...await saavnClient.searchSongs(`${languages[0] || ''} new releases 2026`, limit).catch(() => []));
    candidates.push(...await saavnClient.searchSongs('latest new songs 2026', limit).catch(() => []));
  }

  for (const artist of artists) {
    candidates.push(...await saavnClient.getArtistTopSongs(artist, Math.ceil(limit / 2)).catch(() => []));
  }
  for (const language of languages) {
    candidates.push(...await saavnClient.searchSongs(`${language} top hits`, Math.ceil(limit / 2)).catch(() => []));
  }

  candidates.push(...await saavnClient.getTrending(limit).catch(() => []));

  return deduplicateSongs(candidates);
}

function recommendationDeps(options = {}, { storeMod = store, saavnClient = saavn } = {}) {
  return {
    getTasteProfile: storeMod.getTasteProfile,
    getRecentEvents: storeMod.getRecentEvents,
    getUserSongScores: storeMod.getUserSongScores,
    getLocalCandidates: storeMod.getLocalCandidates,
    fetchExternalCandidates: (ctx) => externalCandidates({ ...ctx, options: { ...ctx.options, ...options } }, saavnClient),
  };
}

function exclusionOptions(body = {}) {
  return {
    ids: [
      ...(body.excludedSongIds || []),
      ...(body.dislikedSongIds || []),
      ...(body.currentQueueIds || []),
    ],
    negativeTitles: body.negativeTitles || [],
    currentQueueIds: body.currentQueueIds || [],
    dislikedSongIds: body.dislikedSongIds || [],
    sessionHistory: body.sessionHistory || [],
  };
}

function uniqueSongs(songs, options, limit) {
  return deduplicateSongs(applyExclusions(songs, options)).slice(0, limit);
}

function toPairs(parsed, key = 'songs') {
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed[key])) return [];
  return parsed[key].filter((pair) => pair && typeof pair === 'object' && (pair.title || pair.name));
}

async function hydratePairs(pairs, saavnClient, perPair = 3) {
  const songs = [];
  for (const pair of pairs) {
    const query = `${pair.title || pair.name} ${pair.artist || pair.primary_artists || ''}`.trim();
    if (!query) continue;
    const found = await saavnClient.searchSongs(query, perPair).catch(() => []);
    songs.push(...found);
  }
  return songs;
}

async function backfill(songs, options, limit, saavnClient, extraQueries = []) {
  if (songs.length >= limit) return songs;
  const pool = [];
  pool.push(...await saavnClient.getTrending(limit * 2).catch(() => []));
  for (const query of extraQueries) {
    pool.push(...await saavnClient.searchSongs(query, limit * 2).catch(() => []));
  }
  return uniqueSongs([...songs, ...pool], options, limit);
}

async function buildAutoplay(body = {}, deps = {}) {
  const saavnClient = deps.saavn || saavn;
  const ai = deps.callAI || callAI;
  const limit = clampLimit(body.limit, 8, 25);
  const seedSongId = cleanId(body.seedSongId);
  const options = exclusionOptions(body);
  if (seedSongId) options.ids.push(seedSongId);

  const seed = seedSongId ? await saavnClient.getSong(seedSongId).catch(() => null) : null;

  const parsed = seed
    ? await ai(
        `The listener is playing "${songTitle(seed)}" by "${songArtist(seed)}". Recommend BETWEEN 15 AND 25 real, popular, stylistically similar songs with artist variety. Never include festive, Diwali, holiday, or seasonal content. Return raw JSON: {"songs":[{"title":"Song Name","artist":"Artist Name"}]}`,
        'You are a music curation director. Output strictly raw JSON, no markdown.'
      ).catch(() => null)
    : null;
  const pairs = toPairs(parsed).slice(0, limit);

  const candidates = [];
  if (seedSongId) {
    candidates.push(...await saavnClient.getSongSuggestions(seedSongId, limit).catch(() => []));
    if (seed) {
      const primary = songArtist(seed).split(',')[0].trim();
      if (primary) candidates.push(...await saavnClient.getArtistTopSongs(primary, limit).catch(() => []));
      candidates.push(...await saavnClient.searchSongs(`${songArtist(seed)} ${songTitle(seed)}`.trim(), limit).catch(() => []));
    }
  }
  if (pairs.length) candidates.push(...await hydratePairs(pairs, saavnClient));
  candidates.push(...await saavnClient.getTrending(limit).catch(() => []));

  let songs = uniqueSongs(candidates, options, limit);
  songs = await backfill(songs, options, limit, saavnClient, ['top hits popular songs', 'trending pop songs']);

  return { songs: songs.map(withDualAliases) };
}

async function buildRecommendations(body = {}, deps = {}) {
  const saavnClient = deps.saavn || saavn;
  const engine = deps.getRecommendations || getRecommendations;
  const storeMod = deps.store || store;
  const limit = clampLimit(body.limit, 15, 25);
  const userId = body.userId || 'anonymous';
  const type = body.type || PLAYLIST_TYPES.FOR_YOU;
  const language = body.language || null;
  const options = exclusionOptions(body);

  const ranked = await engine(
    userId,
    { limit: limit * 2, playlistType: type, language },
    recommendationDeps({ language }, { storeMod, saavnClient })
  ).catch(() => []);

  let songs = uniqueSongs(ranked, options, limit);
  songs = await backfill(songs, options, limit, saavnClient, language ? [`top ${language} hits`, 'popular hits'] : ['popular hits']);

  return { songs: songs.map(withDualAliases) };
}

async function buildMixes(body = {}, deps = {}) {
  const saavnClient = deps.saavn || saavn;
  const ai = deps.callAI || callAI;
  const engine = deps.getRecommendations || getRecommendations;
  const storeMod = deps.store || store;
  const limit = clampLimit(body.limit, 15, 25);
  const userId = body.userId || 'anonymous';
  const language = body.language || null;
  const options = exclusionOptions(body);

  const parsed = await ai(
    `Curate exactly ${MIX_KEYS.length} distinct personalized daily mixes for a listener. Use the artist/title hints when provided. Never include festive, Diwali, holiday, or seasonal content.\n` +
    `Hints: ${(body.negativeTitles || []).slice(0, 8).join(', ') || 'none'}\n` +
    `Return raw JSON: {"playlists":[{"categoryTitle":"Daily Mix 1","title":"Mix Title","description":"Short mood description","styleIndex":0,"songs":[{"title":"Song Name","artist":"Artist Name"}]}]}. Each mix must have BETWEEN 15 AND 25 real popular songs.`,
    'You are an elite music curation director. Output strictly raw JSON, no markdown.'
  ).catch(() => null);

  const aiMixes = toPairs(parsed, 'playlists').slice(0, MIX_KEYS.length).map((entry, index) => ({
    ...entry,
    songs: toPairs({ songs: entry.songs }).slice(0, limit),
    index,
  }));

  const mixes = [];
  for (let index = 0; index < MIX_KEYS.length; index++) {
    const key = MIX_KEYS[index];
    const meta = MIX_META[key];
    const aiMix = aiMixes.find((mix) => index === mix.index);
    let songs = [];

    if (aiMix && aiMix.songs.length) {
      const hydrated = await hydratePairs(aiMix.songs, saavnClient);
      songs = uniqueSongs(hydrated, options, limit);
    }

    if (songs.length < limit) {
      const ranked = await engine(
        userId,
        { limit: limit * 2, playlistType: key, language },
        recommendationDeps({ language }, { storeMod, saavnClient })
      ).catch(() => []);
      songs = uniqueSongs([...songs, ...ranked], options, limit);
    }
    songs = await backfill(songs, options, limit, saavnClient, language ? [`top ${language} hits`] : []);

    const categoryTitle = aiMix?.categoryTitle || meta.categoryTitle;
    const title = aiMix?.title || meta.title;
    const description = aiMix?.description || meta.description;
    const safe = !isFestiveText(`${categoryTitle} ${title} ${description}`);

    mixes.push({
      key,
      categoryTitle: safe ? categoryTitle : meta.categoryTitle,
      title: safe ? title : meta.title,
      description: safe ? description : meta.description,
      styleIndex: Number.isFinite(Number(aiMix?.styleIndex)) ? Number(aiMix.styleIndex) : meta.styleIndex,
      songs: songs.map(withDualAliases),
    });
  }

  return { mixes };
}

async function recordFeedback(body = {}, deps = {}) {
  const storeMod = deps.store || store;
  try {
    const songIdValue = cleanId(body.songId || body.saavn_id || body.song?.saavn_id || body.song?.id);
    if (songIdValue && typeof storeMod.recordEvent === 'function') {
      const eventType = body.eventType || (body.isLiked === false ? 'unlike' : 'like');
      storeMod.recordEvent({
        userId: body.userId || 'anonymous',
        songSaavnId: songIdValue,
        eventType,
        context: { mixKey: body.mixKey || null, reason: body.reason || null, source: 'mix-feedback' },
      });
    }
  } catch (error) {
    // Feedback is best-effort; persistence failures must not break the response.
  }
  return { ok: true };
}

module.exports = {
  MIX_KEYS,
  MIX_META,
  topKeys,
  externalCandidates,
  recommendationDeps,
  buildAutoplay,
  buildRecommendations,
  buildMixes,
  recordFeedback,
};
