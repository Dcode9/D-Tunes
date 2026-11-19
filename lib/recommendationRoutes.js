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
  isFestiveText,
  normalizeText,
} = require('./recommendationHelpers');
const {
  validateAutoplayBody,
  validateRecommendationsBody,
  validateMixesBody,
  validateFeedbackBody,
} = require('./apiSecurity');

const MIX_KEYS = ['daily-mix-1', 'daily-mix-2', 'discover-weekly', 'chill-vibes', 'mood', 'your-mix'];
const MIX_META = {
  'daily-mix-1': { categoryTitle: 'Daily Mix 1', title: 'Daily Mix 1', description: 'Familiar favourites and fresh finds built around your taste.', styleIndex: 0 },
  'daily-mix-2': { categoryTitle: 'Daily Mix 2', title: 'Daily Mix 2', description: 'A second daily rotation of the artists and moods you return to.', styleIndex: 1 },
  'discover-weekly': { categoryTitle: 'Discover Weekly', title: 'Discover Weekly', description: 'New artists and deep cuts worth adding to your rotation.', styleIndex: 2 },
  'chill-vibes': { categoryTitle: 'Chill Vibes', title: 'Chill Vibes', description: 'Soft textures, unhurried rhythms, and easy listening.', styleIndex: 3 },
  mood: { categoryTitle: 'Mood Mix', title: 'Mood Mix', description: 'A flexible mix shaped by your listening mood.', styleIndex: 4 },
  'your-mix': { categoryTitle: 'Your Mix', title: 'Your Mix', description: 'A personal blend built from your listening history and favourite artists.', styleIndex: 5 },
};

// The default /api/music/mixes response keeps its five established mixes.
// "your-mix" is curated on request so Android gets a real server-backed mix
// without changing the existing payload for older clients.
const DEFAULT_MIX_KEYS = MIX_KEYS.filter((key) => key !== 'your-mix');

const MAX_MIX_FEEDBACK_TEXT = 512;
const MIX_FEEDBACK_READ_LIMIT = 50;
const DEFAULT_AUTOPLAY_LIMIT = 15;
const MAX_PROMPT_SESSION_HISTORY = 10;
const MIX_KEYWORD_STOPWORDS = new Set([
  'mix', 'mixes', 'daily', 'weekly', 'discover', 'discovery', 'your', 'the',
  'and', 'for', 'with', 'from', 'this', 'that', 'these', 'those', 'song',
  'songs', 'music', 'track', 'tracks', 'too', 'much', 'more', 'less',
  'very', 'not', 'but', 'was', 'were', 'have', 'has', 'had', 'they',
  'them', 'then', 'than', 'just', 'some', 'any', 'all', 'can', 'could',
  'should', 'would', 'about', 'after', 'before', 'when', 'what', 'who',
  'why', 'how', 'its', 'like', 'really', 'kind', 'sort', 'lot', 'lots',
  'need', 'want', 'make', 'makes', 'made', 'bad', 'good', 'okay', 'bit',
  'little', 'dont', 'does', 'doesn', 'did', 'didn', 'isn', 'aren', 'wasn',
]);

function topKeys(map = {}, count = 3) {
  return Object.entries(map).sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, count).map(([key]) => key).filter(Boolean);
}

function safeFeedbackText(value, max = MAX_MIX_FEEDBACK_TEXT) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function firstCallable(candidates = []) {
  for (const candidate of candidates) {
    if (candidate && typeof candidate.fn === 'function') return candidate;
  }
  return null;
}

function mixFeedbackStoreMethods(deps = {}) {
  const storeMod = deps.store || store;
  const nested = deps.mixFeedbackStore || deps.mixFeedbackPersistence || null;
  const bind = (fn, thisArg) => (typeof fn === 'function' ? { fn, thisArg } : null);
  return {
    read: firstCallable([
      bind(deps.getMixFeedback, deps),
      bind(deps.loadMixFeedback, deps),
      bind(deps.listMixFeedback, deps),
      bind(deps.getMixFeedbackForUser, deps),
      bind(storeMod.getMixFeedback, storeMod),
      bind(storeMod.getMixFeedbackForUser, storeMod),
      bind(storeMod.listMixFeedback, storeMod),
      bind(storeMod.loadMixFeedback, storeMod),
      bind(nested && nested.get, nested),
      bind(nested && nested.list, nested),
      bind(nested && nested.load, nested),
      bind(nested && nested.all, nested),
    ]),
    write: firstCallable([
      bind(deps.persistMixFeedback, deps),
      bind(deps.recordMixFeedback, deps),
      bind(deps.saveMixFeedback, deps),
      bind(storeMod.recordMixFeedback, storeMod),
      bind(storeMod.persistMixFeedback, storeMod),
      bind(storeMod.saveMixFeedback, storeMod),
      bind(storeMod.insertMixFeedback, storeMod),
      bind(nested && nested.record, nested),
      bind(nested && nested.persist, nested),
      bind(nested && nested.save, nested),
      bind(nested && nested.insert, nested),
      bind(nested && nested.add, nested),
    ]),
  };
}

function normalizeMixFeedbackRow(row = {}) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const mixKey = safeFeedbackText(row.mix_key || row.mixKey, 64).toLowerCase();
  if (!mixKey) return null;
  const likedValue = row.is_liked !== undefined ? row.is_liked : row.isLiked;
  const isLiked = likedValue === false || likedValue === 'false'
    ? false
    : likedValue === true || likedValue === 'true'
      ? true
      : null;
  return {
    mixKey,
    mixTitle: safeFeedbackText(row.mix_title || row.mixTitle, 256),
    isLiked,
    reason: safeFeedbackText(row.reason),
    customFeedback: safeFeedbackText(row.custom_feedback || row.customFeedback),
    createdAt: row.created_at || row.createdAt || null,
  };
}

function feedbackTimestamp(row = {}) {
  const value = row.created_at || row.createdAt;
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function mixFeedbackKeywords(values = []) {
  const keywords = new Set();
  for (const value of values) {
    const text = safeFeedbackText(value).toLowerCase();
    for (const token of text.split(/[^a-z0-9]+/)) {
      if (token.length < 3 || token.length > 32) continue;
      if (MIX_KEYWORD_STOPWORDS.has(token)) continue;
      keywords.add(token);
    }
  }
  return [...keywords];
}

async function readMixFeedbackRows(userId, deps = {}) {
  if (!userId) return [];
  const { read } = mixFeedbackStoreMethods(deps);
  if (!read) return [];
  try {
    const result = await read.fn.call(read.thisArg, userId, { limit: MIX_FEEDBACK_READ_LIMIT }, deps);
    if (Array.isArray(result)) return result;
    if (result && Array.isArray(result.rows)) return result.rows;
    if (result && Array.isArray(result.feedback)) return result.feedback;
    return [];
  } catch {
    return [];
  }
}

/**
 * Reads a user's mix feedback and converts disliked mixes into prompt hints and
 * avoided title keywords. Never throws: feedback lookups are best-effort and
 * the recommendation path must still work when no feedback store is wired.
 */
async function getMixFeedbackExclusions(userId, deps = {}) {
  const rows = await readMixFeedbackRows(userId, deps);
  const latest = new Map();
  const sorted = rows.slice().sort((a, b) => feedbackTimestamp(b) - feedbackTimestamp(a));
  for (const row of sorted) {
    const entry = normalizeMixFeedbackRow(row);
    if (!entry || latest.has(entry.mixKey)) continue;
    latest.set(entry.mixKey, entry);
  }

  const disliked = [...latest.values()].filter((entry) => entry.isLiked === false);
  const reasons = [];
  const hints = [];
  for (const entry of disliked) {
    const detail = entry.reason || entry.customFeedback;
    if (detail) reasons.push(detail);
    hints.push(detail ? `${entry.mixKey} (${detail})` : entry.mixKey);
  }
  const uniqueReasons = [...new Set(reasons)];
  const keywords = mixFeedbackKeywords([
    ...disliked.map((entry) => entry.mixKey.replace(/-/g, ' ')),
    ...uniqueReasons,
  ]);

  const dislikedMixKeys = disliked.map((entry) => entry.mixKey);
  return {
    dislikedMixKeys,
    excludedMixKeys: dislikedMixKeys,
    reasons: uniqueReasons,
    keywords,
    avoidedKeywords: keywords,
    negativeTitles: keywords,
    hints: hints.slice(),
    promptHints: hints.join('; '),
  };
}

async function persistMixFeedback(record, deps = {}) {
  const { write } = mixFeedbackStoreMethods(deps);
  if (!write) return false;
  try {
    await write.fn.call(write.thisArg, record, deps);
    return true;
  } catch {
    return false;
  }
}

function toMixFeedbackRecord(input, body = {}) {
  if (!input.mixKey) return null;
  const customFeedback = safeFeedbackText(body.customFeedback);
  const hasRating = typeof input.isLiked === 'boolean' || Boolean(input.reason);
  if (!hasRating && !customFeedback) return null;
  const record = {
    userId: input.userId,
    mixKey: input.mixKey,
    mixTitle: safeFeedbackText(body.mixTitle, 256) || input.mixKey,
    isLiked: typeof input.isLiked === 'boolean' ? input.isLiked : null,
    reason: input.reason,
    customFeedback: customFeedback || null,
    createdAt: new Date().toISOString(),
  };
  // Non-enumerable column aliases keep PostgREST-shaped adapters working
  // without changing the canonical camelCase record or Object.keys() output.
  for (const [alias, value] of Object.entries({
    user_id: record.userId,
    mix_key: record.mixKey,
    mix_title: record.mixTitle,
    is_liked: record.isLiked,
    custom_feedback: record.customFeedback,
    created_at: record.createdAt,
  })) {
    Object.defineProperty(record, alias, { value, enumerable: false });
  }
  return record;
}

function requestedMixKeys(body = {}, deps = {}) {
  const rawType = body && typeof body === 'object' && !Array.isArray(body)
    ? (body.type || body.mixType)
    : '';
  const requested = safeFeedbackText(rawType, 40).toLowerCase() || safeFeedbackText(deps.type, 40).toLowerCase();
  return requested === 'your-mix' ? ['your-mix'] : DEFAULT_MIX_KEYS;
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

async function recommendationDeps(options = {}, {
  storeMod = store,
  saavnClient = saavn,
  userId = null,
  accessToken = null,
} = {}) {
  let remote = null;
  if (userId && typeof storeMod.getRecommendationTasteData === 'function') {
    remote = await storeMod.getRecommendationTasteData(userId, { hours: 24 }, { accessToken }).catch(() => null);
  }
  const useRemote = Boolean(remote && remote.profile);
  return {
    getTasteProfile: useRemote
      ? () => Promise.resolve(remote.profile)
      : (id) => storeMod.getTasteProfile(id),
    getRecentEvents: useRemote
      ? () => Promise.resolve(remote.recentEvents || [])
      : (id, hours) => storeMod.getRecentEvents(id, hours),
    getUserSongScores: useRemote
      ? () => Promise.resolve(remote.userSongScores || [])
      : (id) => storeMod.getUserSongScores(id),
    getLocalCandidates: storeMod.getLocalCandidates,
    fetchExternalCandidates: (ctx) => externalCandidates({ ...ctx, options: { ...ctx.options, ...options } }, saavnClient),
    tasteProfile: useRemote ? remote.profile : null,
  };
}

function exclusionOptions(input = {}) {
  return {
    ids: [
      ...(input.excludedSongIds || []),
      ...(input.dislikedSongIds || []),
      ...(input.currentQueueIds || []),
    ],
    negativeTitles: input.negativeTitles || [],
    currentQueueIds: input.currentQueueIds || [],
    dislikedSongIds: input.dislikedSongIds || [],
    sessionHistory: input.sessionHistory || [],
  };
}

function uniqueSongs(songs, options, limit) {
  const excluded = applyExclusions(songs, options);
  const keywords = (Array.isArray(options.avoidedKeywords) ? options.avoidedKeywords : [])
    .map((keyword) => normalizeText(keyword))
    .filter(Boolean);
  const filtered = keywords.length
    ? excluded.filter((song) => {
        const words = new Set(normalizeText(`${songTitle(song)} ${song?.album || ''} ${song?.language || ''}`).split(' '));
        return !keywords.some((keyword) => words.has(keyword));
      })
    : excluded;
  return deduplicateSongs(filtered).slice(0, limit);
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
  const { ok, value: input } = validateAutoplayBody(body);
  if (!ok) return { songs: [] };

  const saavnClient = deps.saavn || saavn;
  const ai = deps.callAI || callAI;
  const rawLimit = body && typeof body === 'object' && !Array.isArray(body) ? body.limit : undefined;
  const hasExplicitLimit = rawLimit !== undefined && rawLimit !== null && rawLimit !== '';
  const limit = hasExplicitLimit ? input.limit : DEFAULT_AUTOPLAY_LIMIT;
  const seedSongId = cleanId(input.seedSongId);
  const options = exclusionOptions(input);
  if (seedSongId) options.ids.push(seedSongId);

  const seed = seedSongId ? await saavnClient.getSong(seedSongId).catch(() => null) : null;
  const sessionHistory = (Array.isArray(input.sessionHistory) ? input.sessionHistory : [])
    .map((entry) => {
      const title = songTitle(entry);
      if (!title) return '';
      const artist = songArtist(entry);
      return artist ? `"${title}" by ${artist}` : `"${title}"`;
    })
    .filter(Boolean)
    .slice(0, MAX_PROMPT_SESSION_HISTORY);
  const sessionLine = sessionHistory.length
    ? ` Already played this session: ${sessionHistory.join('; ')}. Do not repeat those tracks.`
    : '';

  const parsed = seed
    ? await ai(
        `The listener is playing "${songTitle(seed)}" by "${songArtist(seed)}".${sessionLine} Recommend BETWEEN 15 AND 25 real, popular, stylistically similar songs with artist variety. Never include festive, Diwali, holiday, or seasonal content. Return raw JSON: {"songs":[{"title":"Song Name","artist":"Artist Name"}]}`,
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
  const { ok, value: input } = validateRecommendationsBody(body);
  if (!ok) return { songs: [] };

  const saavnClient = deps.saavn || saavn;
  const engine = deps.getRecommendations || getRecommendations;
  const storeMod = deps.store || store;
  const limit = input.limit;
  const userId = input.userId;
  const type = input.type || PLAYLIST_TYPES.FOR_YOU;
  const language = input.language || null;
  const mixFeedback = await getMixFeedbackExclusions(userId, { ...deps, store: storeMod });
  const options = { ...exclusionOptions(input), avoidedKeywords: mixFeedback.keywords };
  const engineDeps = await recommendationDeps(
    { language },
    { storeMod, saavnClient, userId, accessToken: deps.accessToken || null }
  );

  const ranked = await engine(
    userId,
    {
      limit: limit * 2,
      playlistType: type,
      language,
      negativeTitles: [...input.negativeTitles, ...mixFeedback.keywords],
      avoidedKeywords: mixFeedback.keywords,
      dislikedMixKeys: mixFeedback.dislikedMixKeys,
    },
    engineDeps
  ).catch(() => []);

  let songs = uniqueSongs(ranked, options, limit);
  songs = await backfill(songs, options, limit, saavnClient, language ? [`top ${language} hits`, 'popular hits'] : ['popular hits']);

  return { songs: songs.map(withDualAliases) };
}

async function buildMixes(body = {}, deps = {}) {
  const { ok, value: input } = validateMixesBody(body);
  if (!ok) return { mixes: [] };

  const saavnClient = deps.saavn || saavn;
  const ai = deps.callAI || callAI;
  const engine = deps.getRecommendations || getRecommendations;
  const storeMod = deps.store || store;
  const limit = input.limit;
  const userId = input.userId;
  const language = input.language || null;
  const requestedKeys = requestedMixKeys(body, deps);
  const mixFeedback = await getMixFeedbackExclusions(userId, { ...deps, store: storeMod });
  const options = { ...exclusionOptions(input), avoidedKeywords: mixFeedback.keywords };
  const engineDeps = await recommendationDeps(
    { language },
    { storeMod, saavnClient, userId, accessToken: deps.accessToken || null }
  );
  const tasteHints = engineDeps.tasteProfile
    ? [topKeys(engineDeps.tasteProfile.artist_scores_json, 3), topKeys(engineDeps.tasteProfile.language_scores_json, 2)]
        .flat().filter(Boolean).slice(0, 5).join(', ')
    : '';
  const negativeHints = [...input.negativeTitles, ...mixFeedback.keywords]
    .filter(Boolean)
    .slice(0, 8)
    .join(', ');
  const dislikedLine = mixFeedback.promptHints
    ? `Disliked mixes to avoid: ${mixFeedback.promptHints}.\n`
    : '';

  const parsed = await ai(
    `Curate exactly ${requestedKeys.length} distinct personalized daily mixes for a listener. Use the artist/title hints when provided. Never include festive, Diwali, holiday, or seasonal content.\n` +
    `Hints: ${negativeHints || 'none'}\n` +
    dislikedLine +
    `Listener taste: ${tasteHints || 'unknown'}\n` +
    `Return raw JSON: {"playlists":[{"categoryTitle":"Daily Mix 1","title":"Mix Title","description":"Short mood description","styleIndex":0,"songs":[{"title":"Song Name","artist":"Artist Name"}]}]}. Each mix must have BETWEEN 15 AND 25 real popular songs.`,
    'You are an elite music curation director. Output strictly raw JSON, no markdown.'
  ).catch(() => null);

  const aiMixes = toPairs(parsed, 'playlists').slice(0, requestedKeys.length).map((entry, index) => ({
    ...entry,
    songs: toPairs({ songs: entry.songs }).slice(0, limit),
    index,
  }));

  const mixes = [];
  for (let index = 0; index < requestedKeys.length; index++) {
    const key = requestedKeys[index];
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
        {
          limit: limit * 2,
          playlistType: key,
          language,
          negativeTitles: [...input.negativeTitles, ...mixFeedback.keywords],
          avoidedKeywords: mixFeedback.keywords,
          dislikedMixKeys: mixFeedback.dislikedMixKeys,
        },
        engineDeps
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
    const { ok, value: input } = validateFeedbackBody(body);
    if (!ok) return { ok: true };

    const mixRecord = toMixFeedbackRecord(input, body);
    if (mixRecord) await persistMixFeedback(mixRecord, deps);

    const songIdValue = cleanId(input.songId);
    if (songIdValue && typeof storeMod.recordEvent === 'function') {
      storeMod.recordEvent({
        userId: input.userId,
        songSaavnId: songIdValue,
        eventType: input.eventType,
        context: {
          mixKey: input.mixKey,
          reason: input.reason,
          customFeedback: mixRecord ? mixRecord.customFeedback : null,
          source: 'mix-feedback',
        },
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
  DEFAULT_MIX_KEYS,
  topKeys,
  externalCandidates,
  recommendationDeps,
  getMixFeedbackExclusions,
  buildAutoplay,
  buildRecommendations,
  buildMixes,
  recordFeedback,
};
