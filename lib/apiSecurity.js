'use strict';

const MAX_USER_ID_LENGTH = 128;
const MAX_STRING_LENGTH = 256;
const DEFAULT_LIST_MAX = 25;
const MAX_ID_LIST = 100;
const MAX_SESSION_HISTORY = 50;
const MAX_BODY_NODES = 5000;
const MAX_AUTH_TOKEN_LENGTH = 8192;
const DEFAULT_AUTH_TIMEOUT_MS = 5000;

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const DEFAULT_PLAYLIST_TYPE = 'for-you';
const PLAYLIST_TYPES_ALLOWED = new Set([
  'for-you',
  'recently-obsessed',
  'similar',
  'artist-radio',
  'late-night',
  'language-mix',
  'discovery',
  'discover-weekly',
  'daily-mix-1',
  'daily-mix-2',
  'release-radar',
  'chill-vibes',
  'mood',
]);

const EVENT_TYPES_ALLOWED = new Set([
  'play_start',
  'search_play',
  'play_complete',
  'play_pause',
  'skip',
  'like',
  'unlike',
  'repeat',
  'queue_add',
  'playlist_add',
  'share',
]);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isSafeKey(key) {
  return typeof key === 'string' && !FORBIDDEN_KEYS.has(key);
}

function hasUnsafeKeys(value, budget = { count: 0 }) {
  if (value === null || typeof value !== 'object') return false;
  if (budget.count++ > MAX_BODY_NODES) return true;
  if (Array.isArray(value)) {
    for (const item of value) {
      if (hasUnsafeKeys(item, budget)) return true;
    }
    return false;
  }
  for (const key of Object.keys(value)) {
    if (!isSafeKey(key)) return true;
    if (hasUnsafeKeys(value[key], budget)) return true;
  }
  return false;
}

function sanitizeBody(body) {
  if (!isPlainObject(body)) return { ok: false, value: {} };
  if (hasUnsafeKeys(body)) return { ok: false, value: {} };
  return { ok: true, value: body };
}

function toSafeString(value, maxLength = MAX_STRING_LENGTH) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

/**
 * Normalizes a client-supplied user identifier so it can never be an object,
 * contain control characters, pollute prototypes, or grow without bound.
 * Invalid values collapse to the shared "anonymous" identity.
 */
function normalizeUserId(value) {
  if (typeof value !== 'string') return 'anonymous';
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .replace(/[^A-Za-z0-9._:@-]/g, '');
  if (!cleaned) return 'anonymous';
  if (cleaned.length > MAX_USER_ID_LENGTH) return 'anonymous';
  if (FORBIDDEN_KEYS.has(cleaned)) return 'anonymous';
  return cleaned;
}

/**
 * Returns a bounded, de-duplicated array of trimmed strings. Non-array input
 * and non-string entries are dropped rather than coerced.
 */
function sanitizeStringList(value, max = DEFAULT_LIST_MAX) {
  if (!Array.isArray(value)) return [];
  const cap = clampLimit(max, 0, MAX_ID_LIST, DEFAULT_LIST_MAX);
  const seen = new Set();
  const result = [];
  for (const entry of value) {
    if (result.length >= cap) break;
    if (typeof entry !== 'string') continue;
    const cleaned = entry.trim().slice(0, MAX_STRING_LENGTH);
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    result.push(cleaned);
  }
  return result;
}

/**
 * Clamps a limit to [min, max]. NaN, negative, non-numeric, or missing values
 * fall back to `fallback` (defaults to `min`) instead of reaching the engine.
 */
function clampLimit(value, min = 1, max = 100, fallback = min) {
  const low = Number.isFinite(Number(min)) ? Math.max(0, Math.trunc(Number(min))) : 0;
  const high = Number.isFinite(Number(max)) ? Math.max(low, Math.trunc(Number(max))) : low;
  const fallbackValue = Number.isFinite(Number(fallback))
    ? Math.min(high, Math.max(low, Math.trunc(Number(fallback))))
    : low;

  if (value === null || value === undefined || value === '') return fallbackValue;
  if (typeof value !== 'number' && typeof value !== 'string') return fallbackValue;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallbackValue;
  return Math.max(low, Math.min(high, Math.round(parsed)));
}

function sanitizeSessionHistory(value, max = MAX_SESSION_HISTORY) {
  if (!Array.isArray(value)) return [];
  const result = [];
  for (const entry of value) {
    if (result.length >= max) break;
    if (!isPlainObject(entry) || hasUnsafeKeys(entry)) continue;
    const cleaned = {
      id: toSafeString(entry.id, 128),
      saavn_id: toSafeString(entry.saavn_id ?? entry.saavnId, 128),
      saavnId: toSafeString(entry.saavnId, 128),
      title: toSafeString(entry.title, MAX_STRING_LENGTH),
      name: toSafeString(entry.name, MAX_STRING_LENGTH),
      artist: toSafeString(entry.artist, MAX_STRING_LENGTH),
      primary_artists: toSafeString(entry.primary_artists ?? entry.primaryArtists, MAX_STRING_LENGTH),
      primaryArtists: toSafeString(entry.primaryArtists, MAX_STRING_LENGTH),
    };
    if (Object.values(cleaned).some(Boolean)) result.push(cleaned);
  }
  return result;
}

function normalizePlaylistType(value) {
  const cleaned = toSafeString(value, 40);
  return PLAYLIST_TYPES_ALLOWED.has(cleaned) ? cleaned : DEFAULT_PLAYLIST_TYPE;
}

function exclusionFields(value) {
  return {
    excludedSongIds: sanitizeStringList(value.excludedSongIds, MAX_ID_LIST),
    dislikedSongIds: sanitizeStringList(value.dislikedSongIds, MAX_ID_LIST),
    currentQueueIds: sanitizeStringList(value.currentQueueIds, MAX_ID_LIST),
    negativeTitles: sanitizeStringList(value.negativeTitles, DEFAULT_LIST_MAX),
    sessionHistory: sanitizeSessionHistory(value.sessionHistory),
  };
}

/**
 * Validates an autoplay request body. Always returns `{ ok, value }`; `ok` is
 * false for non-object bodies, prototype-pollution keys, or pathologically
 * large payloads. `value` is always safe to consume with defaults applied.
 */
function validateAutoplayBody(body) {
  const { ok, value } = sanitizeBody(body);
  return {
    ok,
    value: {
      userId: normalizeUserId(value.userId),
      limit: clampLimit(value.limit, 8, 25, 8),
      seedSongId: toSafeString(value.seedSongId, 128),
      seedArtist: toSafeString(value.seedArtist, 128),
      language: toSafeString(value.language, 64),
      ...exclusionFields(value),
    },
  };
}

/**
 * Validates a recommendations request body. See validateAutoplayBody.
 */
function validateRecommendationsBody(body) {
  const { ok, value } = sanitizeBody(body);
  return {
    ok,
    value: {
      userId: normalizeUserId(value.userId),
      limit: clampLimit(value.limit, 15, 25, 15),
      type: normalizePlaylistType(value.type),
      language: toSafeString(value.language, 64),
      ...exclusionFields(value),
    },
  };
}

const MAX_TASTE_LIST = 200;
const MAX_TASTE_PLAYLISTS = 10;
const MAX_PLAYLIST_SONGS = 10;

function sanitizeTasteSong(entry) {
  if (!isPlainObject(entry) || hasUnsafeKeys(entry)) return null;
  const title = toSafeString(entry.title ?? entry.name, MAX_STRING_LENGTH);
  const artist = toSafeString(entry.artist ?? entry.primary_artists ?? entry.primaryArtists, MAX_STRING_LENGTH);
  if (!title && !artist) return null;
  return {
    title,
    artist,
    duration: clampLimit(entry.duration, 0, 86400, 0),
    playedAt: toSafeString(entry.playedAt ?? entry.played_at, 64),
  };
}

function sanitizeTasteSongs(value, max) {
  if (!Array.isArray(value)) return [];
  const result = [];
  for (const entry of value) {
    if (result.length >= max) break;
    const clean = sanitizeTasteSong(entry);
    if (clean) result.push(clean);
  }
  return result;
}

function sanitizeTasteStats(value) {
  if (!Array.isArray(value)) return [];
  const result = [];
  for (const entry of value) {
    if (result.length >= 25) break;
    if (!isPlainObject(entry) || hasUnsafeKeys(entry)) continue;
    const title = toSafeString(entry.title ?? entry.name, MAX_STRING_LENGTH);
    if (!title) continue;
    result.push({
      title,
      artist: toSafeString(entry.artist ?? entry.primary_artists, MAX_STRING_LENGTH),
      playCount: clampLimit(entry.playCount ?? entry.play_count, 0, 1000000, 0),
      durationMs: clampLimit(entry.durationMs ?? entry.total_duration_ms, 0, 1e12, 0),
    });
  }
  return result;
}

function sanitizeTasteArtists(value) {
  if (!Array.isArray(value)) return [];
  const result = [];
  for (const entry of value) {
    if (result.length >= 15) break;
    if (!isPlainObject(entry) || hasUnsafeKeys(entry)) continue;
    const name = toSafeString(entry.name ?? entry.artist, 128);
    if (!name) continue;
    result.push({ name, count: clampLimit(entry.count ?? entry.playCount, 0, 1000000, 0) });
  }
  return result;
}

function sanitizeTastePlaylists(value) {
  if (!Array.isArray(value)) return [];
  const result = [];
  for (const entry of value) {
    if (result.length >= MAX_TASTE_PLAYLISTS) break;
    if (!isPlainObject(entry) || hasUnsafeKeys(entry)) continue;
    const name = toSafeString(entry.name, 128);
    if (!name) continue;
    const songs = sanitizeTasteSongs(entry.songs, MAX_PLAYLIST_SONGS);
    result.push({ name, count: clampLimit(entry.count, 0, 100000, songs.length), songs });
  }
  return result;
}

function sanitizeTaste(value) {
  if (!isPlainObject(value) || hasUnsafeKeys(value)) return null;
  return {
    playlists: sanitizeTastePlaylists(value.playlists),
    stats: sanitizeTasteStats(value.stats),
    history: sanitizeTasteSongs(value.history, 50),
    artists: sanitizeTasteArtists(value.artists),
    liked: sanitizeTasteSongs(value.liked ?? value.likedSongs, MAX_TASTE_LIST),
    library: sanitizeTasteSongs(value.library ?? value.librarySongs, MAX_TASTE_LIST),
    disliked: sanitizeTasteSongs(value.disliked ?? value.dislikedSongs, MAX_TASTE_LIST),
  };
}

/**
 * Validates a daily-mixes request body. See validateAutoplayBody.
 */
function validateMixesBody(body) {
  const { ok, value } = sanitizeBody(body);
  return {
    ok,
    value: {
      userId: normalizeUserId(value.userId),
      limit: clampLimit(value.limit, 15, 25, 15),
      language: toSafeString(value.language, 64),
      taste: sanitizeTaste(value.taste),
      ...exclusionFields(value),
    },
  };
}

/**
 * Validates a feedback request body and derives the event type. Always returns
 * `{ ok, value }`; an empty `songId` means the caller should no-op.
 */
function validateFeedbackBody(body) {
  const { ok, value } = sanitizeBody(body);
  const song = isPlainObject(value.song) && !hasUnsafeKeys(value.song) ? value.song : {};

  const isLiked = value.isLiked === true ? true : value.isLiked === false ? false : undefined;
  const rawEventType = toSafeString(value.eventType, 40);
  const eventType = EVENT_TYPES_ALLOWED.has(rawEventType)
    ? rawEventType
    : (isLiked === false ? 'unlike' : 'like');

  return {
    ok,
    value: {
      userId: normalizeUserId(value.userId),
      songId: toSafeString(value.songId ?? value.saavn_id ?? song.saavn_id ?? song.id, 128),
      eventType,
      mixKey: toSafeString(value.mixKey, 64) || null,
      reason: toSafeString(value.reason, MAX_STRING_LENGTH) || null,
      isLiked,
    },
  };
}

/**
 * Opt-in authentication switch. Existing anonymous clients and tests keep
 * working unless DTUNES_REQUIRE_AUTH is explicitly set to "1".
 */
function isAuthRequired() {
  return process.env.DTUNES_REQUIRE_AUTH === '1';
}

/**
 * Verifies a Supabase access token by calling GET {SUPABASE_URL}/auth/v1/user
 * with the supplied Bearer token. Returns the authenticated user id, or null
 * when the header, environment, or token is missing/invalid. Never logs the
 * header or token.
 *
 * Wiring in server.js (do not enable unless DTUNES_REQUIRE_AUTH === '1'):
 *
 *   const { verifySupabaseJwt, isAuthRequired, normalizeUserId } = require('./lib/apiSecurity');
 *
 *   // inside handleApi, before calling a recommendation builder:
 *   const body = await parseBody(req).catch(() => ({}));
 *   if (isAuthRequired()) {
 *     const verifiedUserId = await verifySupabaseJwt(req.headers.authorization);
 *     if (!verifiedUserId) return sendJson(res, 401, { error: 'Unauthorized' });
 *     body.userId = verifiedUserId; // override any client-supplied id
 *   } else {
 *     body.userId = normalizeUserId(body.userId);
 *   }
 *
 * @param {string} authorizationHeader Raw `Authorization` header value.
 * @param {{ fetch?: Function, supabaseUrl?: string, apikey?: string, timeoutMs?: number }} [options]
 * @returns {Promise<string|null>}
 */
async function verifySupabaseJwt(authorizationHeader, options = {}) {
  if (typeof authorizationHeader !== 'string') return null;

  const match = /^Bearer\s+([A-Za-z0-9._-]{20,8192})$/i.exec(authorizationHeader.trim());
  if (!match) return null;
  const token = match[1];
  if (token.length > MAX_AUTH_TOKEN_LENGTH) return null;

  const fetchImpl = options.fetch || (typeof fetch === 'function' ? fetch : null);
  if (typeof fetchImpl !== 'function') return null;

  const supabaseUrl = options.supabaseUrl || process.env.SUPABASE_URL;
  if (typeof supabaseUrl !== 'string' || !supabaseUrl.trim()) return null;

  const baseUrl = supabaseUrl.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(baseUrl)) return null;

  const headers = { Authorization: `Bearer ${token}` };
  const apikey = options.apikey || process.env.SUPABASE_ANON_KEY;
  if (typeof apikey === 'string' && apikey.trim()) headers.apikey = apikey.trim();

  const timeoutMs = clampLimit(options.timeoutMs, 1000, 30000, DEFAULT_AUTH_TIMEOUT_MS);
  const request = { method: 'GET', headers };
  if (typeof AbortSignal === 'function' && typeof AbortSignal.timeout === 'function') {
    request.signal = AbortSignal.timeout(timeoutMs);
  }

  try {
    const response = await fetchImpl(`${baseUrl}/auth/v1/user`, request);
    if (!response || !response.ok) return null;
    const payload = await response.json().catch(() => null);
    const rawId = payload && (payload.id || (payload.user && payload.user.id));
    const userId = normalizeUserId(rawId);
    return userId === 'anonymous' ? null : userId;
  } catch (error) {
    return null;
  }
}

module.exports = {
  normalizeUserId,
  sanitizeStringList,
  clampLimit,
  validateMixesBody,
  validateAutoplayBody,
  validateRecommendationsBody,
  validateFeedbackBody,
  isAuthRequired,
  verifySupabaseJwt,
};
