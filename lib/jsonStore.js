const fs = require('node:fs');
const path = require('node:path');
const { calculateEventScore, rebuildTasteProfile } = require('./recommendationEngine');

const DATA_DIR = process.env.VERCEL ? path.join('/tmp', 'data') : path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'recommendations.json');

function initialData() {
  return {
    nextSongId: 1,
    nextEventId: 1,
    songs: [],
    user_events: [],
    user_song_scores: [],
    user_taste_profiles: [],
    recommendation_cache: [],
  };
}

function load() {
  if (!fs.existsSync(DATA_FILE)) return initialData();
  try {
    return { ...initialData(), ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) };
  } catch {
    return initialData();
  }
}

function save(data) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    // Non-fatal if filesystem is read-only
  }
}

function toDbSong(input = {}) {
  return {
    saavn_id: String(input.saavn_id || input.saavnId || input.id || ''),
    title: input.title || input.name || 'Unknown',
    name: input.title || input.name || 'Unknown',
    primary_artists: input.primary_artists || input.primaryArtists || input.artist || 'Unknown Artist',
    artist: input.primary_artists || input.primaryArtists || input.artist || 'Unknown Artist',
    featured_artists: input.featured_artists || input.featuredArtists || '',
    album: input.album || '',
    language: input.language || '',
    year: input.year || null,
    image_url: input.image_url || input.img || '',
    img: input.image_url || input.img || '',
    duration_seconds: input.duration_seconds || input.duration || null,
    duration: input.duration_seconds || input.duration || 0,
    play_url: input.play_url || input.url || '',
    url: input.play_url || input.url || '',
    raw_metadata_json: input.raw_metadata_json || input.raw || input,
  };
}

function upsertSongInData(data, songInput) {
  const normalized = toDbSong(songInput);
  if (!normalized.saavn_id) throw new Error('songSaavnId or saavn_id is required');
  let song = data.songs.find((item) => item.saavn_id === normalized.saavn_id);
  const now = new Date().toISOString();
  if (song) Object.assign(song, normalized, { updated_at: now });
  else {
    song = { id: data.nextSongId++, ...normalized, created_at: now, updated_at: now };
    data.songs.push(song);
  }
  return song;
}

function upsertSong(songInput) {
  const data = load();
  const song = upsertSongInData(data, songInput);
  save(data);
  return song;
}

function updateScore(data, event, song) {
  let score = data.user_song_scores.find((row) => row.user_id === event.user_id && row.song_id === song.id);
  const now = new Date().toISOString();
  if (!score) {
    score = { user_id: event.user_id, song_id: song.id, saavn_id: song.saavn_id, score: 0, play_count: 0, complete_count: 0, skip_count: 0, like_count: 0, repeat_count: 0, last_played_at: null, updated_at: now };
    data.user_song_scores.push(score);
  }
  score.score = Number((score.score + calculateEventScore(event)).toFixed(2));
  if (['play_start', 'search_play'].includes(event.event_type)) score.play_count += 1;
  if (event.event_type === 'play_complete') score.complete_count += 1;
  if (event.event_type === 'skip') score.skip_count += 1;
  if (event.event_type === 'like') score.like_count += 1;
  if (event.event_type === 'unlike') score.like_count = Math.max(0, score.like_count - 1);
  if (event.event_type === 'repeat') score.repeat_count += 1;
  if (['play_start', 'search_play', 'play_complete', 'repeat'].includes(event.event_type)) score.last_played_at = event.created_at;
  score.updated_at = now;
}

function recordEvent({ userId, song, songSaavnId, eventType, playDurationSeconds, songDurationSeconds, context = {} }) {
  const data = load();
  const dbSong = upsertSongInData(data, song || { saavn_id: songSaavnId });
  const progress = songDurationSeconds ? Math.max(0, Math.min(1, Number(playDurationSeconds || 0) / Number(songDurationSeconds))) : undefined;
  const event = {
    id: data.nextEventId++,
    user_id: String(userId || 'anonymous'),
    song_id: dbSong.id,
    event_type: eventType,
    play_duration_seconds: playDurationSeconds ?? null,
    song_duration_seconds: songDurationSeconds ?? dbSong.duration_seconds ?? null,
    progress_ratio: progress,
    created_at: new Date().toISOString(),
    context,
    song: dbSong,
  };
  data.user_events.push(event);
  updateScore(data, event, dbSong);
  save(data);
  rebuildUserTasteProfile(event.user_id);
  return event;
}

function rebuildUserTasteProfile(userId) {
  const data = load();
  const songsById = new Map(data.songs.map((song) => [song.id, song]));
  const events = data.user_events.filter((event) => event.user_id === userId).map((event) => ({ ...event, song: songsById.get(event.song_id) }));
  const profile = rebuildTasteProfile(events, data.user_song_scores);
  let row = data.user_taste_profiles.find((item) => item.user_id === userId);
  if (!row) {
    row = { user_id: userId };
    data.user_taste_profiles.push(row);
  }
  Object.assign(row, profile);
  save(data);
  return row;
}

function getTasteProfile(userId) {
  return load().user_taste_profiles.find((row) => row.user_id === userId) || { language_scores_json: {}, artist_scores_json: {}, album_scores_json: {}, decade_scores_json: {}, mood_scores_json: {} };
}

function getRecentEvents(userId, hours = 24) {
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  const data = load();
  const songsById = new Map(data.songs.map((song) => [song.id, song]));
  return data.user_events.filter((event) => event.user_id === userId && new Date(event.created_at).getTime() >= cutoff).map((event) => ({ ...event, song: songsById.get(event.song_id) }));
}

function getUserSongScores(userId) {
  const data = load();
  const songsById = new Map(data.songs.map((song) => [song.id, song]));
  return data.user_song_scores.filter((row) => row.user_id === userId).map((row) => ({ ...row, song: songsById.get(row.song_id) }));
}

function getLocalCandidates(userId, { limit = 100 } = {}) {
  const data = load();
  const scoredIds = new Set(data.user_song_scores.filter((row) => row.user_id === userId && row.skip_count >= 2).map((row) => row.song_id));
  return data.songs.filter((song) => !scoredIds.has(song.id)).slice(-limit).reverse();
}

// ---------------------------------------------------------------------------
// Durable taste reads (Supabase PostgREST)
//
// The JSON file above is instance-local (and /tmp on Vercel), so it is only a
// cache/fallback. When remote taste is enabled, read the per-user history,
// likes, and library rows from Supabase and hydrate them into the same event
// shape that calculateEventScore/rebuildTasteProfile already understand.
//
// Route layer usage:
//   const snapshot = await store.getRecommendationTasteData(userId, { hours: 24 }, deps);
//   // -> { profile, recentEvents, userSongScores }
// or call getTasteProfileForUser / hydrateUserEvents / getRecentEventsForUser /
// getUserSongScoresForUser individually. Pass { enabled: true, fetch } in
// tests to avoid the network; production enables this via
// DTUNES_REMOTE_TASTE=1 or Vercel, and falls back to the JSON store on failure.
// ---------------------------------------------------------------------------

const DEFAULT_SUPABASE_URL = 'https://gmwieijbrrztukqpfwkg.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_KX3MYtV84QJJdy9bPDuMEA_V99sLKSE';
const REMOTE_EVENT_LIMIT = 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HISTORY_SELECT = 'id,user_id,track_id,played_at,started_at,ended_at,duration_ms,client,context,client_event_id,dtunes_tracks(id,title,artist,album,duration_ms,artwork_url,metadata)';
const INTERACTION_SELECT = 'user_id,track_id,created_at,dtunes_tracks(id,title,artist,album,duration_ms,artwork_url,metadata)';
const SCORED_EVENT_TYPES = new Set(['play_start', 'search_play', 'play_complete', 'repeat']);
const VALID_EVENT_TYPES = new Set([
  'play_start', 'play_complete', 'skip', 'like', 'unlike',
  'search_play', 'playlist_add', 'repeat', 'queue_add',
]);

function isRemoteTasteEnabled(deps = {}) {
  if (typeof deps.enabled === 'boolean') return deps.enabled;
  if (typeof deps.remote === 'boolean') return deps.remote;
  return process.env.DTUNES_REMOTE_TASTE === '1' || Boolean(process.env.VERCEL);
}

function resolveSupabaseConfig(deps = {}) {
  return {
    url: String(deps.url || process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/+$/, ''),
    key: String(deps.key || process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY),
    accessToken: deps.accessToken || deps.token || process.env.SUPABASE_ACCESS_TOKEN || null,
  };
}

function shouldUseRemote(userId, deps = {}) {
  if (!isRemoteTasteEnabled(deps)) return false;
  // An injected transport is trusted (tests/local adapters). Otherwise only
  // real auth UUIDs can match the uuid-typed user_id columns.
  if (typeof deps.fetch === 'function') return true;
  return UUID_RE.test(String(userId || ''));
}

async function fetchPostgrestRows(table, { select = '*', filters = {}, order, limit } = {}, deps = {}) {
  const { url, key, accessToken } = resolveSupabaseConfig(deps);
  const fetchImpl = deps.fetch || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('Remote taste storage is unavailable: fetch is not implemented');

  const params = new URLSearchParams();
  if (select) params.set('select', select);
  for (const [column, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null) params.set(column, value);
  }
  if (order) params.set('order', order);
  if (limit) params.set('limit', String(limit));

  const response = await fetchImpl(`${url}/rest/v1/${table}?${params.toString()}`, {
    method: 'GET',
    headers: {
      apikey: key,
      authorization: `Bearer ${accessToken || key}`,
      accept: 'application/json',
    },
  });

  if (Array.isArray(response)) return response;

  if (!response || response.ok === false) {
    const status = response && response.status;
    // Never include the key or token in errors.
    throw new Error(`Remote taste request failed for ${table}${status ? ` (HTTP ${status})` : ''}`);
  }

  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
}

function toObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function firstFinite(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return undefined;
}

function clampRatio(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return undefined;
  return Math.max(0, Math.min(1, number));
}

function songFromRemoteRow(row = {}) {
  const context = toObject(row.context);
  const joined = toObject(row.dtunes_tracks);
  const metadata = toObject(joined.metadata);
  const contextSong = toObject(context.song || context.track || context.song_metadata);
  const merged = { ...metadata, ...joined, ...contextSong };

  const saavnId = String(merged.saavn_id || merged.saavnId || merged.id || row.track_id || '');
  const title = merged.title || merged.name || context.title || 'Unknown';
  const artists = merged.primary_artists || merged.primaryArtists || merged.artist || merged.artists || context.artist || context.primary_artists || 'Unknown Artist';
  const totalMs = firstFinite(merged.duration_ms, context.song_duration_ms, context.songDurationMs, context.track_duration_ms);
  const durationSeconds = totalMs !== undefined
    ? totalMs / 1000
    : firstFinite(merged.duration_seconds, merged.duration, context.song_duration_seconds);
  const year = firstFinite(merged.year, context.year);

  return {
    id: saavnId,
    saavn_id: saavnId,
    title,
    name: title,
    primary_artists: String(artists),
    artist: String(artists),
    featured_artists: merged.featured_artists || merged.featuredArtists || '',
    album: merged.album || context.album || '',
    language: merged.language || metadata.language || context.language || '',
    year: year !== undefined ? year : null,
    duration_seconds: durationSeconds !== undefined ? durationSeconds : null,
    duration: durationSeconds !== undefined ? durationSeconds : 0,
    image_url: merged.img || merged.image_url || merged.artwork_url || metadata.img || context.img || '',
    img: merged.img || merged.image_url || merged.artwork_url || metadata.img || context.img || '',
    play_url: merged.play_url || merged.url || merged.audio_url || context.url || '',
    url: merged.play_url || merged.url || merged.audio_url || context.url || '',
    raw_metadata_json: merged,
  };
}

function derivePlayEventType(context, progress) {
  const explicit = context.event_type || context.eventType;
  if (VALID_EVENT_TYPES.has(explicit)) return explicit;
  if (context.completed === true || context.is_complete === true) return 'play_complete';
  if (progress !== undefined) {
    if (progress >= 0.9) return 'play_complete';
    if (progress < 0.2 && context.skipped === true) return 'skip';
  }
  return 'play_start';
}

function mapHistoryRow(row = {}, userId) {
  const context = toObject(row.context);
  const song = songFromRemoteRow(row);
  const playedMs = firstFinite(row.duration_ms, context.played_duration_ms, context.play_duration_ms, context.duration_ms);
  const totalMs = firstFinite(song.duration_seconds !== null ? song.duration_seconds * 1000 : undefined, context.song_duration_ms, context.track_duration_ms);
  const contextProgress = clampRatio(context.progress_ratio ?? context.progressRatio);
  const progress = totalMs && playedMs !== undefined && totalMs > 0
    ? clampRatio(playedMs / totalMs)
    : contextProgress;
  const playedSeconds = playedMs !== undefined ? playedMs / 1000 : firstFinite(context.play_duration_seconds, context.playDurationSeconds);
  const totalSeconds = totalMs !== undefined ? totalMs / 1000 : (song.duration_seconds !== null ? song.duration_seconds : undefined);

  return {
    id: row.client_event_id || row.id,
    user_id: String(row.user_id || userId),
    event_type: derivePlayEventType(context, progress),
    play_duration_seconds: playedSeconds !== undefined ? playedSeconds : null,
    song_duration_seconds: totalSeconds !== undefined ? totalSeconds : null,
    progress_ratio: progress,
    created_at: row.played_at || row.ended_at || row.created_at || row.started_at || null,
    context,
    client: row.client || context.client || null,
    song,
  };
}

function mapInteractionRow(row = {}, userId, eventType) {
  const song = songFromRemoteRow(row);
  return {
    id: row.id,
    user_id: String(row.user_id || userId),
    event_type: eventType,
    play_duration_seconds: null,
    song_duration_seconds: song.duration_seconds,
    progress_ratio: undefined,
    created_at: row.created_at || row.liked_at || row.added_at || null,
    context: toObject(row.context),
    client: row.client || null,
    song,
  };
}

function mapLikeRow(row = {}, userId) {
  const unlike = row.is_liked === false || row.liked === false || row.removed === true
    || row.event_type === 'unlike' || row.eventType === 'unlike';
  return mapInteractionRow(row, userId, unlike ? 'unlike' : 'like');
}

function mapLibraryRow(row = {}, userId) {
  return mapInteractionRow(row, userId, 'playlist_add');
}

async function fetchRemoteTasteEvents(userId, deps = {}) {
  const id = String(userId || 'anonymous');
  const limit = firstFinite(deps.limit, deps.eventLimit) || REMOTE_EVENT_LIMIT;
  const userFilter = { user_id: `eq.${id}` };

  const history = await fetchPostgrestRows('dtunes_history', {
    select: HISTORY_SELECT,
    filters: userFilter,
    order: 'played_at.desc',
    limit,
  }, deps);

  // Likes/library are additive signals; a missing table or RLS denial must not
  // discard the history we already read.
  const [likes, library] = await Promise.all([
    fetchPostgrestRows('dtunes_likes', {
      select: INTERACTION_SELECT,
      filters: userFilter,
      order: 'created_at.desc',
      limit,
    }, deps).catch(() => []),
    fetchPostgrestRows('dtunes_library', {
      select: INTERACTION_SELECT,
      filters: userFilter,
      order: 'created_at.desc',
      limit,
    }, deps).catch(() => []),
  ]);

  const events = [
    ...history.map((row) => mapHistoryRow(row, id)),
    ...likes.map((row) => mapLikeRow(row, id)),
    ...library.map((row) => mapLibraryRow(row, id)),
  ].filter((event) => event && event.song && event.song.saavn_id);

  events.sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
  return events;
}

function localEventsForUser(userId) {
  const data = load();
  const songsById = new Map(data.songs.map((song) => [song.id, song]));
  return data.user_events
    .filter((event) => event.user_id === userId)
    .map((event) => ({ ...event, song: event.song || songsById.get(event.song_id) }));
}

async function hydrateUserEvents(userId, deps = {}) {
  const id = String(userId || 'anonymous');
  if (!shouldUseRemote(id, deps)) return localEventsForUser(id);
  try {
    return await fetchRemoteTasteEvents(id, deps);
  } catch {
    return localEventsForUser(id);
  }
}

function deriveSongScores(events = []) {
  const bySong = new Map();
  for (const event of events) {
    const song = event.song || {};
    const key = String(song.saavn_id || song.id || event.song_id || event.songId || '');
    if (!key) continue;

    let row = bySong.get(key);
    if (!row) {
      row = {
        user_id: event.user_id,
        song_id: key,
        saavn_id: key,
        song,
        score: 0,
        play_count: 0,
        complete_count: 0,
        skip_count: 0,
        like_count: 0,
        repeat_count: 0,
        last_played_at: null,
        updated_at: null,
      };
      bySong.set(key, row);
    }

    row.score += calculateEventScore(event);
    if (['play_start', 'search_play'].includes(event.event_type)) row.play_count += 1;
    if (event.event_type === 'play_complete') row.complete_count += 1;
    if (event.event_type === 'skip') row.skip_count += 1;
    if (event.event_type === 'like') row.like_count += 1;
    if (event.event_type === 'unlike') row.like_count = Math.max(0, row.like_count - 1);
    if (event.event_type === 'repeat') row.repeat_count += 1;
    if (SCORED_EVENT_TYPES.has(event.event_type)) row.last_played_at = event.created_at;
    if (event.created_at && (!row.updated_at || new Date(event.created_at).getTime() > new Date(row.updated_at).getTime())) {
      row.updated_at = event.created_at;
    }
  }

  for (const row of bySong.values()) row.score = Number(row.score.toFixed(2));
  return [...bySong.values()];
}

function buildProfileFromEvents(userId, events = []) {
  const scores = deriveSongScores(events);
  return { user_id: userId, ...rebuildTasteProfile(events, scores) };
}

// Remote-aware taste profile used by the recommendation route. Falls back to
// the local JSON store when remote reads are disabled or fail.
async function getTasteProfileForUser(userId, deps = {}) {
  const id = String(userId || 'anonymous');
  if (!shouldUseRemote(id, deps)) return { ...getTasteProfile(id), user_id: id };
  try {
    return buildProfileFromEvents(id, await fetchRemoteTasteEvents(id, deps));
  } catch {
    return { ...getTasteProfile(id), user_id: id };
  }
}

async function getRecentEventsForUser(userId, hours = 24, deps = {}) {
  const id = String(userId || 'anonymous');
  if (!shouldUseRemote(id, deps)) return getRecentEvents(id, hours);
  try {
    const cutoff = Date.now() - Number(hours) * 60 * 60 * 1000;
    return (await fetchRemoteTasteEvents(id, deps))
      .filter((event) => new Date(event.created_at || 0).getTime() >= cutoff);
  } catch {
    return getRecentEvents(id, hours);
  }
}

async function getUserSongScoresForUser(userId, deps = {}) {
  const id = String(userId || 'anonymous');
  if (!shouldUseRemote(id, deps)) return getUserSongScores(id);
  try {
    return deriveSongScores(await fetchRemoteTasteEvents(id, deps));
  } catch {
    return getUserSongScores(id);
  }
}

// One-shot hydration for recommendationDeps: fetches remote rows once and
// returns everything the engine needs.
async function getRecommendationTasteData(userId, { hours = 24 } = {}, deps = {}) {
  const id = String(userId || 'anonymous');
  if (!shouldUseRemote(id, deps)) {
    return {
      profile: { ...getTasteProfile(id), user_id: id },
      recentEvents: getRecentEvents(id, hours),
      userSongScores: getUserSongScores(id),
    };
  }

  try {
    const events = await fetchRemoteTasteEvents(id, deps);
    const cutoff = Date.now() - Number(hours) * 60 * 60 * 1000;
    return {
      profile: buildProfileFromEvents(id, events),
      recentEvents: events.filter((event) => new Date(event.created_at || 0).getTime() >= cutoff),
      userSongScores: deriveSongScores(events),
    };
  } catch {
    return {
      profile: { ...getTasteProfile(id), user_id: id },
      recentEvents: getRecentEvents(id, hours),
      userSongScores: getUserSongScores(id),
    };
  }
}

module.exports = {
  upsertSong,
  recordEvent,
  rebuildUserTasteProfile,
  getTasteProfile,
  getRecentEvents,
  getUserSongScores,
  getLocalCandidates,
  load,
  isRemoteTasteEnabled,
  fetchRemoteTasteEvents,
  hydrateUserEvents,
  getTasteProfileForUser,
  getRecentEventsForUser,
  getUserSongScoresForUser,
  getRecommendationTasteData,
  deriveSongScores,
};
