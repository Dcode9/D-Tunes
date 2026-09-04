const LRCLIB_BASE = 'https://lrclib.net/api';

// In-memory cache: key -> { data, timestamp }
const lyricsCache = new Map();
const MAX_CACHE_ENTRIES = 200;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function cleanTrackTitle(title = '') {
  return String(title)
    .replace(/\s*[\(\[](?:from|feat\.?|featuring|with|prod\.?|official|video|audio|remix|version|deluxe|soundtrack|ost)[^\)\]]*[\)\]]/gi, '')
    .replace(/\s*-\s*(?:from|feat\.?|featuring|with|prod\.?|remix|version|soundtrack|ost).*$/gi, '')
    .replace(/\s*-\s*[^-]+$/g, '') // Remove trailing " - Album Name" or " - Movie Name"
    .trim();
}

function cleanArtistName(artist = '') {
  const first = String(artist).split(/[,/&|]/)[0];
  return (first || artist).trim();
}

function parseLrc(lrcString = '') {
  if (!lrcString || typeof lrcString !== 'string') return [];
  const lines = lrcString.split('\n');
  const result = [];
  const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/g;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    timeRegex.lastIndex = 0;
    const matches = [...trimmed.matchAll(timeRegex)];
    if (!matches || matches.length === 0) continue;

    const text = trimmed.replace(timeRegex, '').trim();
    for (const match of matches) {
      const min = parseInt(match[1], 10);
      const sec = parseInt(match[2], 10);
      const msStr = match[3];
      const ms = msStr.length === 2 ? parseInt(msStr, 10) * 10 : parseInt(msStr.padEnd(3, '0').slice(0, 3), 10);
      const time = min * 60 + sec + ms / 1000;
      result.push({ time, text });
    }
  }

  result.sort((a, b) => a.time - b.time);
  return result;
}

function getCacheKey(track, artist) {
  return `${String(track).toLowerCase().trim()}:::${String(artist).toLowerCase().trim()}`;
}

function setCache(key, data) {
  if (lyricsCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = lyricsCache.keys().next().value;
    if (oldestKey) lyricsCache.delete(oldestKey);
  }
  lyricsCache.set(key, { data, timestamp: Date.now() });
}

function getFromCache(key) {
  const cached = lyricsCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    lyricsCache.delete(key);
    return null;
  }
  return cached.data;
}

async function fetchLyrics({ track, artist, album, duration }) {
  if (!track) return null;

  const cacheKey = getCacheKey(track, artist);
  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  const rawTitle = String(track).trim();
  const cleanedTitle = cleanTrackTitle(rawTitle);
  const rawArtist = String(artist || '').trim();
  const cleanedArtist = cleanArtistName(rawArtist);
  const dur = Number(duration || 0);

  // Attempt 1: Exact match with raw names + duration if available
  let data = await attemptGet({ track: rawTitle, artist: rawArtist, album, duration: dur });

  // Attempt 2: Match with cleaned title and cleaned artist
  if (!data && (cleanedTitle !== rawTitle || cleanedArtist !== rawArtist)) {
    data = await attemptGet({ track: cleanedTitle, artist: cleanedArtist });
  }

  // Attempt 3: Match with cleaned title only
  if (!data && cleanedTitle !== rawTitle) {
    data = await attemptGet({ track: cleanedTitle, artist: rawArtist });
  }

  // Attempt 4: Fallback search if exact get fails
  if (!data) {
    data = await attemptSearch(`${cleanedTitle} ${cleanedArtist}`);
  }

  const result = {
    track: data?.trackName || rawTitle,
    artist: data?.artistName || rawArtist,
    syncedLyrics: data?.syncedLyrics || null,
    plainLyrics: data?.plainLyrics || null,
    instrumental: Boolean(data?.instrumental),
    parsedLines: data?.syncedLyrics ? parseLrc(data.syncedLyrics) : null
  };

  setCache(cacheKey, result);
  return result;
}

async function attemptGet({ track, artist, album, duration }) {
  if (!track) return null;
  try {
    const params = new URLSearchParams({ track_name: track });
    if (artist) params.append('artist_name', artist);
    if (album) params.append('album_name', album);
    if (duration > 0) params.append('duration', String(Math.round(duration)));

    const res = await fetch(`${LRCLIB_BASE}/get?${params.toString()}`, {
      headers: { 'User-Agent': 'DTunes/1.0.0 (https://tunes.d-verse.in)' }
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.syncedLyrics || json.plainLyrics || json.instrumental) return json;
    return null;
  } catch (_) {
    return null;
  }
}

async function attemptSearch(query) {
  if (!query || !query.trim()) return null;
  try {
    const params = new URLSearchParams({ q: query.trim() });
    const res = await fetch(`${LRCLIB_BASE}/search?${params.toString()}`, {
      headers: { 'User-Agent': 'DTunes/1.0.0 (https://tunes.d-verse.in)' }
    });
    if (!res.ok) return null;
    const list = await res.json();
    if (!Array.isArray(list) || list.length === 0) return null;
    // Prefer first item with synced lyrics
    const withSynced = list.find(item => item.syncedLyrics);
    return withSynced || list[0];
  } catch (_) {
    return null;
  }
}

module.exports = {
  fetchLyrics,
  cleanTrackTitle,
  cleanArtistName,
  parseLrc,
  _lyricsCache: lyricsCache
};
