const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');

test('Taskbar Progress: Paused songs use mode: normal (no yellow line)', () => {
  const mainJs = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');

  // Must NOT use { mode: 'paused' } or { mode: playing ? 'normal' : 'paused' }
  assert.doesNotMatch(mainJs, /setProgressBar\([^,]+,\s*\{\s*mode:\s*playing\s*\?\s*['"]normal['"]\s*:\s*['"]paused['"]\s*\}\)/);
  assert.doesNotMatch(mainJs, /setProgressBar\([^,]+,\s*\{\s*mode:\s*['"]paused['"]\s*\}\)/);

  // Must use mode: 'normal' so Windows renders the progress bar in the normal accent color
  assert.match(mainJs, /setProgressBar\(fraction,\s*\{\s*mode:\s*['"]normal['"]\s*\}\)/);
});

test('Bi-directional Volume Sync: winVolume emits change events without echo-loop', async () => {
  const winVolumeJs = fs.readFileSync(path.join(__dirname, '../winVolume.js'), 'utf8');

  // Verify winVolume extends EventEmitter
  assert.match(winVolumeJs, /class WinVolumeManager extends EventEmitter/);

  // Verify it handles VOL lines from stdout watcher
  assert.match(winVolumeJs, /if\s*\(line\.startsWith\(['"]VOL ['"]\)\)/);
  assert.match(winVolumeJs, /this\.emit\(['"]change['"],\s*vol\)/);

  // Verify Set method sets lastVol under lock to prevent echo
  assert.match(winVolumeJs, /lock\s*\(\s*syncRoot\s*\)\s*\{\s*lastVol\s*=\s*v;\s*\}/);
});

test('Bi-directional Volume Sync: main.js forwards system-volume-changed to renderer', () => {
  const mainJs = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');

  assert.match(mainJs, /winVolume\.on\(['"]change['"],\s*\(vol\)\s*=>\s*\{/);
  assert.match(mainJs, /mainWindow\.webContents\.send\(['"]system-volume-changed['"],\s*vol\)/);
});

test('Bi-directional Volume Sync: preload.js exposes volume and network APIs', () => {
  const preloadJs = fs.readFileSync(path.join(__dirname, '../preload.js'), 'utf8');

  assert.match(preloadJs, /onSystemVolumeChanged:\s*\(cb\)\s*=>/);
  assert.match(preloadJs, /checkNetwork:\s*\(\)\s*=>\s*ipcRenderer\.invoke\(['"]net-is-online['"]\)/);
  assert.match(preloadJs, /onNetworkStatusChanged:\s*\(cb\)\s*=>/);
});

test('Bi-directional Volume Sync: desktop.js applies system volume to slider and avoids echo-back', () => {
  const desktopJs = fs.readFileSync(path.join(__dirname, '../src/js/desktop.js'), 'utf8');

  // Listening to system volume updates
  assert.match(desktopJs, /api\.onSystemVolumeChanged\s*\(/);

  // When fromSystem is true, slider.value is updated, but pushSystemVolume is NOT called
  assert.match(desktopJs, /if\s*\(!fromSystem\s*\|\|\s*!slider\._dtunesUserDragging\)\s*\{\s*slider\.value\s*=\s*v;\s*\}/);
  assert.match(desktopJs, /if\s*\(!fromSystem\)\s*\{\s*pushSystemVolume\(v\);\s*\}/);
});

test('Network Engine: Cold boot offline directly loads local index.html', () => {
  const mainJs = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');

  // Must check net.isOnline() and load local index.html if offline
  assert.match(mainJs, /if\s*\(!net\.isOnline\(\)\s*&&\s*fs\.existsSync\(localIndexPath\)\)\s*\{/);
  assert.match(mainJs, /mainWindow\.loadFile\(localIndexPath\)/);
});

test('Network Engine: Multi-angle connectivity engine with active probing', () => {
  const desktopJs = fs.readFileSync(path.join(__dirname, '../src/js/desktop.js'), 'utf8');

  // dtunesNetwork module exists
  assert.match(desktopJs, /const dtunesNetwork\s*=\s*\(function\s*\(\)\s*\{/);
  assert.match(desktopJs, /window\.dtunesNetwork\s*=\s*dtunesNetwork;/);
  assert.match(desktopJs, /window\.__dtunesIsOffline\s*=\s*\(\)\s*=>\s*dtunesNetwork\.isOffline\(\);/);

  // Active probe verifies actual WAN data
  assert.match(desktopJs, /async function verifyRealInternet\(\)/);
  assert.match(desktopJs, /https:\/\/tunes\.d-verse\.in\/assets\/favicon\.png\?_probe=/);
});

test('Network Engine: Mid-stream disconnect pauses cleanly without infinite retry loop', () => {
  const playerJs = fs.readFileSync(path.join(__dirname, '../src/js/player.js'), 'utf8');

  // Mid-stream stall check when offline
  assert.match(playerJs, /_playbackPausedDueToNetwork/);
  assert.match(playerJs, /if\s*\(isOfflineNow\s*&&\s*!isDownloadedNow\)\s*\{[\s\S]*?audio\.pause\(\);/);

  // Error recovery does not hammer APIs when offline on non-downloaded tracks
  assert.match(playerJs, /recoverFromAudioError\s*=\s*async\s*\(\)\s*=>\s*\{[\s\S]*?if\s*\(isOfflineNow\s*&&\s*!isDownloadedNow\)/);

  // Reconnect listener restores playback
  assert.match(playerJs, /window\.addEventListener\(['"]dtunes:network-restored['"],\s*async\s*\(\)\s*=>/);
});

test('Network Engine: player.next and prev skip non-downloaded tracks while offline', () => {
  const playerJs = fs.readFileSync(path.join(__dirname, '../src/js/player.js'), 'utf8');

  // player.next skips non-downloaded tracks when offline
  assert.match(playerJs, /next:\s*\(force\s*=\s*false\)\s*=>\s*\{[\s\S]*?if\s*\(isOfflineNow\)\s*\{[\s\S]*?!isOfflineBlockedTrack\(candidate\)/);

  // player.prev scans for previous offline-ready track
  assert.match(playerJs, /prev:\s*\(\)\s*=>\s*\{[\s\S]*?if\s*\(isOfflineNow\)\s*\{[\s\S]*?!isOfflineBlockedTrack\(candidate\)/);
});

test('Network Engine: api.js fail-fasts with isNetworkOffline()', () => {
  const apiJs = fs.readFileSync(path.join(__dirname, '../src/js/api.js'), 'utf8');

  assert.match(apiJs, /const isNetworkOffline\s*=\s*\(\)\s*=>/);
  assert.match(apiJs, /if\s*\(isNetworkOffline\(\)\)\s*\{\s*throw new Error\(['"]Offline['"]\);\s*\}/);
});

test('Windows SMTC & Control Center: Media Session metadata and actions are robust', () => {
  const uiJs = fs.readFileSync(path.join(__dirname, '../src/js/ui.js'), 'utf8');
  const playerJs = fs.readFileSync(path.join(__dirname, '../src/js/player.js'), 'utf8');

  // 1. ui.js must NOT reference bare requestPlay / requestPause (which caused ReferenceError)
  assert.doesNotMatch(uiJs, /safeSetHandler\(['"]play['"],\s*requestPlay\)/);
  assert.doesNotMatch(uiJs, /safeSetHandler\(['"]pause['"],\s*requestPause\)/);

  // 2. Artwork must not pass raw SVG to MediaMetadata (Windows SMTC requires raster image)
  assert.match(uiJs, /artwork:\s*artworkList/);

  // 3. player.js registers SMTC action handlers and exposes media handlers
  assert.match(playerJs, /window\.__dtunesMediaHandlers/);
  assert.match(playerJs, /navigator\.mediaSession\.setActionHandler\(act,\s*fn\)/);
  assert.match(playerJs, /safeSet\(['"]play['"],/);
  assert.match(playerJs, /safeSet\(['"]pause['"],/);
  assert.match(playerJs, /safeSet\(['"]nexttrack['"],/);
  assert.match(playerJs, /safeSet\(['"]previoustrack['"],/);
});
