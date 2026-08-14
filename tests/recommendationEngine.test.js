const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateEventScore, diversify, scoreCandidate, rebuildTasteProfile } = require('../lib/recommendationEngine');

test('calculateEventScore applies event weights and completion bonuses', () => {
  assert.equal(calculateEventScore({ eventType: 'like' }), 8);
  assert.equal(calculateEventScore({ eventType: 'play_complete', progressRatio: 0.95 }), 10);
  assert.equal(calculateEventScore({ eventType: 'queue_add', progressRatio: 0.72 }), 6);
});

test('calculateEventScore penalizes short skips and unlikes', () => {
  assert.equal(calculateEventScore({ eventType: 'skip', progressRatio: 0.1 }), -11);
  assert.equal(calculateEventScore({ eventType: 'skip', progressRatio: 0.4 }), -3);
  assert.equal(calculateEventScore({ eventType: 'unlike' }), -8);
});

test('scoreCandidate favors matching artists and languages while penalizing skips', () => {
  const profile = { artist_scores_json: { Asha: 10 }, language_scores_json: { Hindi: 6 }, album_scores_json: { Hits: 4 } };
  const scored = scoreCandidate(
    { id: 's1', primary_artists: 'Asha', language: 'Hindi', album: 'Hits', year: 2024 },
    { profile, userSongScores: new Map([['s1', { score: 20, skip_count: 0 }]]), recentSongIds: new Set(), excludeRecentlyPlayed: true }
  );
  const skipped = scoreCandidate(
    { id: 's2', primary_artists: 'Asha', language: 'Hindi', album: 'Hits', year: 2024 },
    { profile, userSongScores: new Map([['s2', { score: 20, skip_count: 2 }]]), recentSongIds: new Set(), excludeRecentlyPlayed: true }
  );
  assert.ok(scored.recommendationScore > skipped.recommendationScore);
});

test('diversify limits repeated artists', () => {
  const songs = Array.from({ length: 6 }, (_, index) => ({ id: `a${index}`, title: `Track ${index}`, primary_artists: 'Same Artist', recommendationScore: 10 - index }));
  const result = diversify(songs, 25);
  assert.equal(result.length, 3);
});

test('diversify removes duplicate songs from different albums or with different IDs', () => {
  const songs = [
    { id: '101', title: 'Tum Hi Ho', album: 'Aashiqui 2', primary_artists: 'Arijit Singh', duration_seconds: 262, recommendationScore: 99 },
    { id: '202', title: 'Tum Hi Ho (Aashiqui 2)', album: 'Arijit Hits', primary_artists: 'Arijit Singh', duration_seconds: 262, recommendationScore: 95 },
    { id: '303', title: 'Kesariya (From "Brahmastra")', album: 'Brahmastra', primary_artists: 'Pritam, Arijit Singh', duration_seconds: 268, recommendationScore: 90 },
    { id: '404', title: 'Kesariya', album: 'Pritam Best', primary_artists: 'Arijit Singh, Pritam', duration_seconds: 268, recommendationScore: 88 },
    { id: '505', title: 'Apna Bana Le', album: 'Bhediya', primary_artists: 'Arijit Singh, Sachin-Jigar', duration_seconds: 240, recommendationScore: 80 },
  ];
  const result = diversify(songs, 10);
  assert.equal(result.length, 3);
  assert.equal(result[0].id, '101');
  assert.equal(result[1].id, '303');
  assert.equal(result[2].id, '505');
});

test('rebuildTasteProfile aggregates taste dimensions from events', () => {
  const profile = rebuildTasteProfile([
    { eventType: 'like', song: { language: 'Tamil', primary_artists: 'Artist One', album: 'Album One', year: 2018 } },
    { eventType: 'play_complete', progressRatio: 0.95, song: { language: 'Tamil', primary_artists: 'Artist One', album: 'Album Two', year: 2019 } },
  ]);
  assert.ok(profile.language_scores_json.Tamil > 0);
  assert.ok(profile.artist_scores_json['Artist One'] > 0);
  assert.ok(profile.decade_scores_json['2010s'] > 0);
});
