const { areDuplicateTracks, deduplicateSongs } = require('./deduplication');

const DEFAULT_WEIGHTS = Object.freeze({
  eventScores: {
    like: 8,
    playlist_add: 7,
    repeat: 6,
    play_complete: 5,
    search_play: 4,
    queue_add: 3,
    play_start: 1,
    unlike: -8,
  },
  completionScores: [
    { min: 0.9, score: 5 },
    { min: 0.7, score: 3 },
    { min: 0.5, score: 1 },
    { maxExclusive: 0.2, score: -5 },
  ],
  ranking: {
    artistMatch: 0.3,
    languageMatch: 0.2,
    albumMatch: 0.15,
    userSongScore: 0.15,
    freshness: 0.1,
    popularityFallback: 0.1,
  },
  skipPenaltyPerSkip: 8,
  recentPenalty: 20,
  recentHours: 24,
  maxSongsPerArtist: 3,
  cacheMinutes: 30,
});

const PLAYLIST_TYPES = Object.freeze({
  FOR_YOU: 'for-you',
  RECENTLY_OBSESSED: 'recently-obsessed',
  SIMILAR: 'similar',
  ARTIST_RADIO: 'artist-radio',
  LATE_NIGHT: 'late-night',
  LANGUAGE_MIX: 'language-mix',
  DISCOVERY: 'discovery',
  DISCOVER_WEEKLY: 'discover-weekly',
  DAILY_MIX_1: 'daily-mix-1',
  DAILY_MIX_2: 'daily-mix-2',
  RELEASE_RADAR: 'release-radar',
  CHILL_VIBES: 'chill-vibes',
  MOOD: 'mood',
});

function clamp(value, min = 0, max = 1) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function normalizeProgress(event = {}) {
  if (Number.isFinite(Number(event.progress_ratio))) return clamp(Number(event.progress_ratio));
  if (Number.isFinite(Number(event.progressRatio))) return clamp(Number(event.progressRatio));
  const played = Number(event.play_duration_seconds ?? event.playDurationSeconds);
  const duration = Number(event.song_duration_seconds ?? event.songDurationSeconds);
  if (Number.isFinite(played) && Number.isFinite(duration) && duration > 0) return clamp(played / duration);
  return undefined;
}

// Converts one behavior signal into a taste score. It combines the explicit
// event value with completion quality so short skips can offset low-value plays.
function calculateEventScore(event = {}, config = DEFAULT_WEIGHTS) {
  const type = event.event_type || event.eventType;
  let score = config.eventScores[type] || 0;
  const progress = normalizeProgress(event);

  if (type === 'skip') {
    if (progress !== undefined && progress < 0.2) score += -6;
    else if (progress !== undefined && progress < 0.5) score += -3;
  }

  if (progress !== undefined) {
    const completionRule = config.completionScores.find((rule) => (
      rule.min !== undefined ? progress >= rule.min : progress < rule.maxExclusive
    ));
    if (completionRule) score += completionRule.score;
  }

  return score;
}

function splitArtists(song = {}) {
  const value = song.primary_artists || song.primaryArtists || song.artist || '';
  return String(value).split(',').map((name) => name.trim()).filter(Boolean);
}

function songKey(song = {}) {
  return String(song.saavn_id || song.saavnId || song.id || '');
}

function decadeForYear(year) {
  const y = Number(year);
  if (!Number.isFinite(y) || y <= 0) return 'unknown';
  return `${Math.floor(y / 10) * 10}s`;
}

function increment(map, key, amount) {
  if (!key) return;
  map[key] = (map[key] || 0) + amount;
}

function rebuildTasteProfile(events = [], scores = []) {
  const bySong = new Map(scores.map((row) => [String(row.song_id || row.songId || songKey(row.song || {})), row]));
  const profile = {
    language_scores_json: {},
    artist_scores_json: {},
    album_scores_json: {},
    decade_scores_json: {},
    mood_scores_json: {},
    updated_at: new Date().toISOString(),
  };

  for (const event of events) {
    const song = event.song || bySong.get(String(event.song_id || event.songId))?.song;
    if (!song) continue;
    const amount = calculateEventScore(event);
    increment(profile.language_scores_json, song.language || 'unknown', amount);
    increment(profile.album_scores_json, song.album || 'unknown', amount);
    increment(profile.decade_scores_json, decadeForYear(song.year), amount);
    for (const artist of splitArtists(song)) increment(profile.artist_scores_json, artist, amount);
    const contextMood = event.context?.mood || event.mood;
    if (contextMood) increment(profile.mood_scores_json, contextMood, amount);
  }

  return profile;
}

function normalizeMap(map = {}) {
  const values = Object.values(map).map(Number).filter((v) => v > 0);
  const max = values.length ? Math.max(...values) : 0;
  if (!max) return {};
  return Object.fromEntries(Object.entries(map).map(([key, value]) => [key, clamp(Number(value) / max)]));
}

function scoreCandidate(song, ctx, config = DEFAULT_WEIGHTS) {
  const artists = splitArtists(song);
  const artistScores = normalizeMap(ctx.profile.artist_scores_json || ctx.profile.artistScores || {});
  const languageScores = normalizeMap(ctx.profile.language_scores_json || ctx.profile.languageScores || {});
  const albumScores = normalizeMap(ctx.profile.album_scores_json || ctx.profile.albumScores || {});
  const userSongScores = ctx.userSongScores || new Map();
  const candidateId = songKey(song);
  const knownScore = userSongScores.get(candidateId) || userSongScores.get(String(song.id));

  const artistMatchScore = artists.reduce((best, artist) => Math.max(best, artistScores[artist] || 0), 0);
  const languageMatchScore = languageScores[song.language] || (ctx.language && song.language === ctx.language ? 1 : 0);
  const albumMatchScore = albumScores[song.album] || 0;
  const userSongScore = knownScore ? clamp(Number(knownScore.score) / 40, -1, 1) : 0;
  const freshnessScore = song.year ? clamp((Number(song.year) - 1990) / 40) : 0.5;
  const popularityFallbackScore = clamp(Number(song.popularity || song.play_count || song.playCount || 0) / 100);

  // Acoustic & Mood Vibe Vector Match
  const titleText = `${song.title || song.name || ''} ${song.album || ''} ${song.primary_artists || song.artist || ''}`.toLowerCase();
  let vibeScore = 0;
  if (ctx.playlistType === PLAYLIST_TYPES.CHILL_VIBES || ctx.playlistType === PLAYLIST_TYPES.LATE_NIGHT) {
    if (/chill|acoustic|lofi|lo-fi|soft|unplugged|romantic|midnight|sleep|piano|relax|ambient/.test(titleText)) vibeScore += 0.8;
  } else if (ctx.playlistType === PLAYLIST_TYPES.RELEASE_RADAR || ctx.playlistType === PLAYLIST_TYPES.DISCOVER_WEEKLY) {
    if (song.year && Number(song.year) >= 2022) vibeScore += 0.6;
    if (/remix|dance|beat|indie|hit|trending|pop|edm|rock|viral/.test(titleText)) vibeScore += 0.4;
  }

  // Time of Day Context Tuning (Morning vs Evening vs Night)
  const currentHour = new Date().getHours();
  let temporalFactor = 0;
  if (currentHour >= 22 || currentHour < 5) {
    if (/acoustic|soft|unplugged|slow|lullaby|romantic|lofi|chill/.test(titleText)) temporalFactor += 0.3;
  } else if (currentHour >= 6 && currentHour <= 12) {
    if (/energetic|morning|upbeat|workout|coffee|bhangra|dance|pop/.test(titleText)) temporalFactor += 0.3;
  }

  // Repeat & Complete Play Affinity Boost
  const repeatCount = Number(knownScore?.repeat_count || knownScore?.repeatCount || 0);
  const completeCount = Number(knownScore?.complete_count || knownScore?.completeCount || 0);
  const repeatBonus = Math.min(1.2, (repeatCount * 0.25) + (completeCount * 0.15));

  const recentlyPlayed = ctx.recentSongIds?.has(candidateId) || ctx.recentSongIds?.has(String(song.id));
  const recentPenalty = recentlyPlayed && ctx.excludeRecentlyPlayed ? config.recentPenalty : 0;
  const skipPenalty = (knownScore?.skip_count || knownScore?.skipCount || 0) * config.skipPenaltyPerSkip;

  // Serendipity & Micro-Jitter (prevents stale static output)
  const serendipityJitter = (Math.sin(candidateId.length * 13.37) + 1) * 0.05;

  let finalScore =
    config.ranking.artistMatch * artistMatchScore +
    config.ranking.languageMatch * languageMatchScore +
    config.ranking.albumMatch * albumMatchScore +
    config.ranking.userSongScore * userSongScore +
    config.ranking.freshness * freshnessScore +
    config.ranking.popularityFallback * popularityFallbackScore +
    vibeScore +
    temporalFactor +
    repeatBonus +
    serendipityJitter -
    recentPenalty -
    skipPenalty;

  if (ctx.playlistType === PLAYLIST_TYPES.DISCOVERY || ctx.playlistType === PLAYLIST_TYPES.DISCOVER_WEEKLY) finalScore += freshnessScore * 0.35;
  if (ctx.seedArtist && artists.some((a) => a.toLowerCase() === ctx.seedArtist.toLowerCase())) finalScore += 1.4;
  if (ctx.seedSong && song.album && song.album === ctx.seedSong.album) finalScore += 0.75;
  if (ctx.seedSong && song.language && song.language === ctx.seedSong.language) finalScore += 0.45;
  if (ctx.seedSong && song.year && ctx.seedSong.year) finalScore += Math.max(0, 0.4 - Math.abs(song.year - ctx.seedSong.year) / 10);

  return { ...song, recommendationScore: finalScore };
}

function diversify(scoredSongs, limit, config = DEFAULT_WEIGHTS) {
  const picked = [];
  const perArtist = new Map();

  for (const song of scoredSongs) {
    const id = songKey(song);
    if (!id) continue;
    // Strictly prevent duplicate songs (same audio track under different releases / album IDs)
    const isDuplicate = picked.some((existing) => areDuplicateTracks(existing, song));
    if (isDuplicate) continue;

    const artists = splitArtists(song);
    const blocked = artists.some((artist) => (perArtist.get(artist) || 0) >= config.maxSongsPerArtist);
    if (blocked) continue;

    picked.push(song);
    for (const artist of artists) perArtist.set(artist, (perArtist.get(artist) || 0) + 1);
    if (picked.length >= limit) break;
  }
  return picked;
}

async function getRecommendations(userId, options = {}, deps = {}) {
  const config = options.config || DEFAULT_WEIGHTS;
  const limit = Number(options.limit || 25);
  const playlistType = options.playlistType || options.type || PLAYLIST_TYPES.FOR_YOU;
  const excludeRecentlyPlayed = options.excludeRecentlyPlayed !== false && playlistType !== PLAYLIST_TYPES.RECENTLY_OBSESSED;

  const profile = await deps.getTasteProfile?.(userId) || { language_scores_json: {}, artist_scores_json: {}, album_scores_json: {} };
  const recentEvents = await deps.getRecentEvents?.(userId, config.recentHours) || [];
  const scores = await deps.getUserSongScores?.(userId) || [];
  const userSongScores = new Map(scores.map((row) => [String(row.saavn_id || row.saavnId || row.song?.saavn_id || row.song_id || row.songId), row]));
  const recentSongIds = new Set(recentEvents.map((event) => String(event.song?.saavn_id || event.saavn_id || event.song_id || event.songId)));

  let rawCandidates = [];
  if (deps.getLocalCandidates) rawCandidates.push(...await deps.getLocalCandidates(userId, { playlistType, limit: limit * 4, options, profile }));
  if (deps.fetchExternalCandidates) rawCandidates.push(...await deps.fetchExternalCandidates({ userId, playlistType, limit: limit * 3, profile, options }));

  if (playlistType === PLAYLIST_TYPES.RECENTLY_OBSESSED) {
    rawCandidates.push(...scores.filter((row) => row.song).sort((a, b) =>
      (b.repeat_count || 0) - (a.repeat_count || 0) || (b.complete_count || 0) - (a.complete_count || 0)
    ).map((row) => row.song));
  }

  // Pre-deduplicate raw candidates
  const candidates = deduplicateSongs(rawCandidates);

  const ctx = {
    profile,
    playlistType,
    excludeRecentlyPlayed,
    recentSongIds,
    userSongScores,
    language: options.language,
    seedArtist: options.seedArtist,
    seedSong: options.seedSong,
  };

  const scored = candidates
    .filter((song) => {
      if (!song || !songKey(song)) return false;
      if (options.seedSongId && songKey(song) === String(options.seedSongId)) return false;
      if (options.seedSong && areDuplicateTracks(song, options.seedSong)) return false;
      return true;
    })
    .map((song) => scoreCandidate(song, ctx, config))
    .sort((a, b) => b.recommendationScore - a.recommendationScore);

  return diversify(scored, limit, config);
}

module.exports = {
  DEFAULT_WEIGHTS,
  PLAYLIST_TYPES,
  calculateEventScore,
  normalizeProgress,
  rebuildTasteProfile,
  scoreCandidate,
  diversify,
  getRecommendations,
  splitArtists,
  decadeForYear,
};
