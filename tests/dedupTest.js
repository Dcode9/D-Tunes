const { cleanTitle, areDuplicateTracks, deduplicateSongs } = require('../lib/deduplication');

const tests = [
  [{ title: 'Tum Hi Ho (Aashiqui 2)', artist: 'Arijit Singh', duration: 262, album: 'Aashiqui 2' }, { title: 'Tum Hi Ho', artist: 'Arijit Singh', duration: 262, album: 'Arijit Hits' }, true],
  [{ title: 'Kesariya (From "Brahmastra")', artist: 'Pritam, Arijit Singh', duration: 268 }, { title: 'Kesariya', artist: 'Arijit Singh, Pritam', duration: 268 }, true],
  [{ title: 'Gehra Hua (From "Dhurandhar")', artist: 'Shashwat Sachdev, Arijit Singh, Irshad Kamil', duration: 254 }, { title: 'Gehra Hua', artist: 'Irshad Kamil, Arijit Singh, Shashwat Sachdev', duration: 254 }, true],
  [{ title: 'Shape of You', artist: 'Ed Sheeran', duration: 233 }, { title: 'Shape of You (Acoustic)', artist: 'Ed Sheeran', duration: 228 }, false],
  [{ title: 'Starboy', artist: 'The Weeknd', duration: 230 }, { title: 'Starboy (feat. Daft Punk)', artist: 'The Weeknd, Daft Punk', duration: 230 }, true],
  [{ title: 'Blinding Lights - Single', artist: 'The Weeknd', duration: 200 }, { title: 'Blinding Lights', artist: 'The Weeknd', duration: 200 }, true]
];

console.log('Running deduplication tests...');
let allPassed = true;
tests.forEach(([a, b, expected], idx) => {
  const res = areDuplicateTracks(a, b);
  const pass = res === expected;
  if (!pass) allPassed = false;
  console.log(`Test ${idx + 1}: ${a.title} vs ${b.title} => ${res} (${pass ? 'PASS' : 'FAIL'})`);
});

if (allPassed) {
  console.log('ALL DEDUP TESTS PASSED!');
} else {
  console.error('SOME DEDUP TESTS FAILED!');
  process.exit(1);
}
