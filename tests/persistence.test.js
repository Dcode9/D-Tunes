const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('../lib/jsonStore');

const USER_ID = '11111111-2222-4333-8444-555555555555';

function jsonResponse(rows, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => rows,
  };
}

function createFakeFetch(tables = {}) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    for (const [table, rows] of Object.entries(tables)) {
      if (url.includes(`/rest/v1/${table}`)) {
        if (typeof rows === 'function') return rows();
        return jsonResponse(rows);
      }
    }
    return jsonResponse([]);
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

const HISTORY_ROW = {
  id: 42,
  user_id: USER_ID,
  track_id: 'track-1',
  played_at: '2026-11-17T10:00:00.000Z',
  started_at: '2026-11-17T09:56:10.000Z',
  ended_at: '2026-11-17T10:00:00.000Z',
  duration_ms: 230000,
  client: 'dtunes-web',
  context: { mood: 'happy', source: 'dtunes-web' },
  client_event_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  dtunes_tracks: {
    id: 'track-1',
    title: 'Song One',
    artist: 'Artist One',
    album: 'Album One',
    duration_ms: 240000,
    artwork_url: 'https://cdn.example.com/art-one.jpg',
    metadata: { language: 'Hindi', year: 2021 },
  },
};

const LIKE_ROW = {
  user_id: USER_ID,
  track_id: 'track-1',
  created_at: '2026-11-16T08:00:00.000Z',
  dtunes_tracks: {
    id: 'track-1',
    title: 'Song One',
    artist: 'Artist One',
    album: 'Album One',
    duration_ms: 240000,
    metadata: { language: 'Hindi', year: 2021 },
  },
};

const LIBRARY_ROW = {
  user_id: USER_ID,
  track_id: 'track-2',
  created_at: '2026-11-15T08:00:00.000Z',
  dtunes_tracks: {
    id: 'track-2',
    title: 'Song Two',
    artist: 'Artist Two',
    album: 'Album Two',
    duration_ms: 200000,
    metadata: { language: 'Tamil', year: 2019 },
  },
};

test('remote history, likes, and library hydrate into engine events', async () => {
  const fakeFetch = createFakeFetch({
    dtunes_history: [HISTORY_ROW],
    dtunes_likes: [LIKE_ROW],
    dtunes_library: [LIBRARY_ROW],
  });

  const events = await store.hydrateUserEvents(USER_ID, { enabled: true, fetch: fakeFetch });
  assert.equal(events.length, 3);
  assert.equal(fakeFetch.calls.length, 3);

  const play = events.find((event) => event.event_type === 'play_complete');
  assert.ok(play, 'a >90% play should map to play_complete');
  assert.equal(play.user_id, USER_ID);
  assert.equal(play.song.saavn_id, 'track-1');
  assert.equal(play.song.title, 'Song One');
  assert.equal(play.song.primary_artists, 'Artist One');
  assert.equal(play.song.album, 'Album One');
  assert.equal(play.song.language, 'Hindi');
  assert.equal(play.song.year, 2021);
  assert.equal(play.song.duration_seconds, 240);
  assert.equal(play.play_duration_seconds, 230);
  assert.ok(play.progress_ratio > 0.9 && play.progress_ratio <= 1);
  assert.equal(play.created_at, HISTORY_ROW.played_at);
  assert.equal(play.context.mood, 'happy');

  const like = events.find((event) => event.event_type === 'like');
  assert.ok(like);
  assert.equal(like.song.saavn_id, 'track-1');

  const saved = events.find((event) => event.event_type === 'playlist_add');
  assert.ok(saved);
  assert.equal(saved.song.saavn_id, 'track-2');
  assert.equal(saved.created_at, LIBRARY_ROW.created_at);

  // Events are replayed oldest-first so scoring is deterministic.
  assert.deepEqual(events.map((event) => event.created_at), [
    LIBRARY_ROW.created_at,
    LIKE_ROW.created_at,
    HISTORY_ROW.played_at,
  ]);

  const scores = await store.getUserSongScoresForUser(USER_ID, { enabled: true, fetch: fakeFetch });
  const trackOne = scores.find((row) => row.saavn_id === 'track-1');
  assert.ok(trackOne);
  assert.equal(trackOne.like_count, 1);
  assert.equal(trackOne.complete_count, 1);
  assert.ok(trackOne.score > 0);
});

test('remote hydration builds a taste profile from durable signals', async () => {
  const fakeFetch = createFakeFetch({
    dtunes_history: [HISTORY_ROW],
    dtunes_likes: [LIKE_ROW],
    dtunes_library: [LIBRARY_ROW],
  });

  const profile = await store.getTasteProfileForUser(USER_ID, { enabled: true, fetch: fakeFetch });

  assert.equal(profile.user_id, USER_ID);
  assert.ok(profile.language_scores_json.Hindi > 0);
  assert.ok(profile.language_scores_json.Tamil > 0);
  assert.ok(profile.artist_scores_json['Artist One'] > 0);
  assert.ok(profile.album_scores_json['Album One'] > 0);
  assert.ok(profile.decade_scores_json['2020s'] > 0);
  assert.ok(profile.decade_scores_json['2010s'] > 0);
  assert.ok(profile.mood_scores_json.happy > 0);
});

test('failed remote reads fall back to the local JSON store', async () => {
  const localProfile = store.getTasteProfile(USER_ID);
  const localScores = store.getUserSongScores(USER_ID);

  const networkFetch = async () => {
    throw new Error('network down');
  };
  const httpErrorFetch = async () => jsonResponse([], 503);

  const profile = await store.getTasteProfileForUser(USER_ID, { enabled: true, fetch: networkFetch });
  assert.deepEqual(profile, { ...localProfile, user_id: USER_ID });

  const snapshot = await store.getRecommendationTasteData(USER_ID, { hours: 24 }, { enabled: true, fetch: httpErrorFetch });
  assert.deepEqual(snapshot.profile, { ...localProfile, user_id: USER_ID });
  assert.deepEqual(snapshot.userSongScores, localScores);
  assert.ok(Array.isArray(snapshot.recentEvents));
});

test('remote reads stay disabled unless the flag is on', async () => {
  let calls = 0;
  const fakeFetch = async () => {
    calls += 1;
    return jsonResponse([]);
  };

  const profile = await store.getTasteProfileForUser(USER_ID, { enabled: false, fetch: fakeFetch });
  assert.equal(calls, 0);
  assert.deepEqual(profile, { ...store.getTasteProfile(USER_ID), user_id: USER_ID });
  assert.equal(store.isRemoteTasteEnabled({ enabled: false }), false);
  assert.equal(store.isRemoteTasteEnabled({ enabled: true }), true);
});
