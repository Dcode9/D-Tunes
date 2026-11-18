'use strict';

const { cleanTitle, getArtistTokens } = require('./deduplication');

const FESTIVE_RE = /diwali|deepavali|navratri|durga puja|holi|eid|christmas|new year|thanksgiving|valentine|festive|festival|holiday|seasonal/i;

function asString(value) {
  return value === null || value === undefined ? '' : String(value);
}

function cleanId(value) {
  return asString(value).replace(/^jiosaavn:\/\//, '').trim();
}

function songTitle(song = {}) {
  return asString(song.title || song.name || song.song || '');
}

function songArtist(song = {}) {
  return asString(song.primary_artists || song.primaryArtists || song.artist || song.artists || '');
}

function songId(song = {}) {
  return cleanId(song.saavn_id || song.saavnId || song.id || '');
}

function normalizeText(value = '') {
  return asString(value)
    .toLowerCase()
    .replace(/[\(\[][^\)\]]*[\)\]]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizedTitle(song) {
  return song && typeof song === 'object' ? normalizeText(songTitle(song)) : normalizeText(song);
}

function normalizedArtist(song = {}) {
  return getArtistTokens(songArtist(song)).sort().join(' ');
}

function normalizeSongKey(input) {
  if (input && typeof input === 'object') {
    const title = normalizeText(songTitle(input));
    const artist = normalizedArtist(input);
    return artist ? `${title}::${artist}` : title;
  }
  const raw = asString(input);
  if (raw.includes('::')) {
    const [title, ...rest] = raw.split('::');
    const normalized = [normalizeText(title), normalizeText(rest.join('::'))].filter(Boolean).join('::');
    return normalized;
  }
  return normalizeText(raw);
}

function toIdSet(values = []) {
  const list = Array.isArray(values) ? values : [values];
  return new Set(list.map(cleanId).filter(Boolean));
}

function toKeySet(values = []) {
  const list = Array.isArray(values) ? values : [values];
  const keys = new Set();
  for (const value of list) {
    const key = normalizeSongKey(value);
    if (key) keys.add(key);
    if (typeof value === 'string') {
      const plain = normalizeText(value);
      if (plain) keys.add(plain);
    }
  }
  return keys;
}

function applyExclusions(songs = [], options = {}) {
  if (!Array.isArray(songs)) return [];
  const ids = toIdSet([
    ...(options.ids || []),
    ...(options.excludedSongIds || []),
    ...(options.currentQueueIds || []),
    ...(options.dislikedSongIds || []),
  ]);
  const keys = toKeySet([
    ...(options.keys || []),
    ...(options.negativeTitles || []),
  ]);

  for (const history of options.sessionHistory || []) {
    if (!history || typeof history !== 'object') continue;
    const id = songId(history);
    if (id) ids.add(id);
    const key = normalizeSongKey(history);
    if (key) keys.add(key);
  }

  return songs.filter((song) => {
    if (!song || typeof song !== 'object') return false;
    const id = songId(song);
    if (id && ids.has(id)) return false;
    const key = normalizeSongKey(song);
    if (key && keys.has(key)) return false;
    const title = normalizedTitle(song);
    if (title && keys.has(title)) return false;
    return true;
  });
}

function withDualAliases(song = {}) {
  const id = songId(song);
  const title = songTitle(song);
  const artist = songArtist(song);
  const img = asString(song.img || song.image_url || song.artwork_url || song.image || '');
  const url = asString(song.url || song.play_url || song.download_url || '');
  const duration = Number(song.duration_seconds ?? song.duration ?? 0) || 0;
  const year = Number(song.year || 0) || null;

  return {
    ...song,
    id: id || asString(song.id),
    saavn_id: id,
    title,
    name: asString(song.name || title),
    primary_artists: artist,
    primaryArtists: asString(song.primaryArtists || artist),
    artist,
    album: asString(song.album || ''),
    duration,
    duration_seconds: Number(song.duration_seconds || duration) || null,
    url,
    play_url: asString(song.play_url || url),
    img,
    image_url: asString(song.image_url || img),
    artwork_url: asString(song.artwork_url || img),
    language: asString(song.language || ''),
    year,
  };
}

function clampLimit(value, min = 15, max = 25) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function isFestiveText(value = '') {
  return FESTIVE_RE.test(asString(value));
}

module.exports = {
  FESTIVE_RE,
  asString,
  cleanId,
  songTitle,
  songArtist,
  songId,
  normalizeText,
  normalizedTitle,
  normalizedArtist,
  normalizeSongKey,
  applyExclusions,
  withDualAliases,
  clampLimit,
  isFestiveText,
};
