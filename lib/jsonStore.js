const fs = require('node:fs');
const path = require('node:path');
const { calculateEventScore, rebuildTasteProfile } = require('./recommendationEngine');

const DATA_DIR = path.join(process.cwd(), 'data');
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
  return { ...initialData(), ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) };
}

function save(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
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

module.exports = { upsertSong, recordEvent, rebuildUserTasteProfile, getTasteProfile, getRecentEvents, getUserSongScores, getLocalCandidates, load };
