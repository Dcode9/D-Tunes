const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanTrackTitle, cleanArtistName, parseLrc } = require('../lib/lyricsService');

test('cleanTrackTitle strips film tags, feat, and remix clutter', () => {
  assert.equal(cleanTrackTitle('Kesariya (From "Brahmastra")'), 'Kesariya');
  assert.equal(cleanTrackTitle('Tum Hi Ho - Aashiqui 2'), 'Tum Hi Ho');
  assert.equal(cleanTrackTitle('Starboy (feat. Daft Punk)'), 'Starboy');
  assert.equal(cleanTrackTitle('Levitating [Remix]'), 'Levitating');
  assert.equal(cleanTrackTitle('Blinding Lights (Official Music Video)'), 'Blinding Lights');
  assert.equal(cleanTrackTitle('Creepin\' [Prod. Metro Boomin]'), 'Creepin\'');
  assert.equal(cleanTrackTitle('Simple Song'), 'Simple Song');
});

test('cleanArtistName extracts primary lead artist', () => {
  assert.equal(cleanArtistName('Arijit Singh, Pritam, Amitabh Bhattacharya'), 'Arijit Singh');
  assert.equal(cleanArtistName('The Weeknd / Daft Punk'), 'The Weeknd');
  assert.equal(cleanArtistName('Post Malone & Swae Lee'), 'Post Malone');
  assert.equal(cleanArtistName('Taylor Swift'), 'Taylor Swift');
});

test('parseLrc correctly parses timestamps into seconds and text', () => {
  const lrc = `
[00:12.50] First line of the song
[00:15.80] Second line follows
[01:02.00] One minute mark
[02:14.250] Three digit millisecond line
  `;
  const parsed = parseLrc(lrc);
  assert.equal(parsed.length, 4);
  assert.equal(parsed[0].time, 12.5);
  assert.equal(parsed[0].text, 'First line of the song');
  assert.equal(parsed[1].time, 15.8);
  assert.equal(parsed[1].text, 'Second line follows');
  assert.equal(parsed[2].time, 62);
  assert.equal(parsed[2].text, 'One minute mark');
  assert.equal(parsed[3].time, 134.25);
  assert.equal(parsed[3].text, 'Three digit millisecond line');
});

test('parseLrc handles empty or malformed input safely', () => {
  assert.deepEqual(parseLrc(''), []);
  assert.deepEqual(parseLrc(null), []);
  assert.deepEqual(parseLrc('No timestamps here\nJust text'), []);
});
