const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const indexPath = path.join(ROOT, 'index.html');
const apiPath = path.join(ROOT, 'src', 'js', 'api.js');
const aiPath = path.join(ROOT, 'src', 'js', 'ai.js');
const aiHubPath = path.join(ROOT, 'src', 'js', 'ai-hub.js');
const desktopPath = path.join(ROOT, 'src', 'js', 'desktop.js');
const statePath = path.join(ROOT, 'src', 'js', 'state.js');
const playerPath = path.join(ROOT, 'src', 'js', 'player.js');
const pkgPath = path.join(ROOT, 'package.json');
const preloadPath = path.join(ROOT, 'preload.js');
const uiPath = path.join(ROOT, 'src', 'js', 'ui.js');

test('Beta 1.4 Contract: Version bumps across files', (t) => {
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const preloadContent = fs.readFileSync(preloadPath, 'utf8');
    const uiContent = fs.readFileSync(uiPath, 'utf8');

    // 1. index.html title and beta badge
    assert.match(indexContent, /<title>D'Tunes \(Beta 1\.4\)<\/title>/, 'index.html title must be Beta 1.4');
    assert.match(indexContent, /class="beta-label[^"]*"[^>]*>Beta 1\.4<\/button>/, 'Header beta badge must show Beta 1.4');

    // 2. Changelog contains Beta 1.4 (0.1.4)
    assert.ok(indexContent.includes('0.1.4'), 'Changelog must contain 0.1.4');
    assert.ok(indexContent.includes('Beta 1.4'), 'Changelog must contain Beta 1.4');
    assert.ok(indexContent.includes('Instant Offline Boot'), 'Changelog must detail Instant Offline Boot');
    assert.ok(indexContent.includes('Downloaded Songs Front & Center'), 'Changelog must detail Downloaded Songs');
    assert.ok(indexContent.includes('Made For You Daily Caching & Expiry'), 'Changelog must detail Made For You caching');

    // 3. package.json and preload.js
    assert.equal(pkg.version, '1.4.0', 'package.json version must be 1.4.0');
    assert.match(preloadContent, /version:\s*'1\.4\.0'/, 'preload.js version must be 1.4.0');

    // 4. ui.js app_version
    assert.ok(uiContent.includes('1.4.0-win-desktop'), 'ui.js app_version must be 1.4.0-win-desktop');
    assert.ok(uiContent.includes('1.4.0-web'), 'ui.js app_version must be 1.4.0-web');
});

test('Beta 1.4 Bug 1: Instant offline execution without timeout stalls', (t) => {
    const apiContent = fs.readFileSync(apiPath, 'utf8');
    const aiContent = fs.readFileSync(aiPath, 'utf8');
    const stateContent = fs.readFileSync(statePath, 'utf8');
    const playerContent = fs.readFileSync(playerPath, 'utf8');

    // api.js checks navigator.onLine and throws immediately without retrying
    assert.ok(apiContent.includes("!navigator.onLine"), 'api.js fetchWithRetry must check !navigator.onLine');
    assert.ok(apiContent.includes("throw new Error('Offline')"), 'api.js fetchWithRetry must throw Offline immediately');
    assert.ok(apiContent.includes("AbortController"), 'api.js fetchWithRetry must use AbortController for bounded timeouts');

    // api.js getTrending checks offline
    assert.ok(apiContent.includes("if (typeof navigator !== 'undefined' && !navigator.onLine) return [];"), 'getTrending must return [] immediately when offline');

    // ai.js checks navigator.onLine
    assert.ok(aiContent.includes("!navigator.onLine"), 'ai.js must check !navigator.onLine');
    assert.ok(aiContent.includes("generateCustomPlaylists") && aiContent.includes("return [];"), 'generateCustomPlaylists must return [] when offline');

    // state.js cloudLibrary checks offline on desktop
    assert.ok(stateContent.includes("Offline mode (Windows)"), 'cloudLibrary must detect desktop offline and avoid Supabase network calls');

    // player.js playDirect prevents network calls for non-downloaded songs when offline
    assert.ok(playerContent.includes("is not downloaded for offline playback"), 'player.playDirect must warn and halt for non-downloaded tracks when offline');
});

test('Beta 1.4 Bug 2: Proper Offline Mode Home Page structure (Downloaded Songs on Top, Cached Below)', (t) => {
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    const desktopContent = fs.readFileSync(desktopPath, 'utf8');

    // index.html elements
    assert.ok(indexContent.includes('id="offline-mode-banner"'), 'index.html must have #offline-mode-banner');
    assert.ok(indexContent.includes('id="section-downloaded-songs"'), 'index.html must have #section-downloaded-songs');
    assert.ok(indexContent.includes('id="downloaded-songs-grid"'), 'index.html must have #downloaded-songs-grid');
    assert.ok(indexContent.includes('window.dtunesPlayAllDownloaded'), 'index.html must have play downloaded button');

    // desktop.js offline UI orchestration
    assert.ok(desktopContent.includes('renderDownloadedSongsSection'), 'desktop.js must have renderDownloadedSongsSection');
    assert.ok(desktopContent.includes('applyOfflineModeState'), 'desktop.js must have applyOfflineModeState');
    assert.ok(desktopContent.includes('dtunesPlayAllDownloaded'), 'desktop.js must provide dtunesPlayAllDownloaded');
    assert.ok(desktopContent.includes('dtunesCheckConnection'), 'desktop.js must provide dtunesCheckConnection');

    // DOM reordering: in offline mode, downloaded songs is placed before ai hub
    assert.ok(desktopContent.includes('insertBefore(downloadedSection, aiHubSection)'), 'Downloaded songs must be moved above AI hub in offline mode');
});

test('Beta 1.4 Bug 3: Made For You Caching with Expiry tracking', (t) => {
    const aiHubContent = fs.readFileSync(aiHubPath, 'utf8');

    // LocalStorage cache key and helper functions
    assert.ok(aiHubContent.includes('dtunes_made_for_you_cache'), 'ai-hub.js must use dtunes_made_for_you_cache key');
    assert.ok(aiHubContent.includes('readLocalDailyCache'), 'ai-hub.js must have readLocalDailyCache');
    assert.ok(aiHubContent.includes('writeLocalDailyCache'), 'ai-hub.js must have writeLocalDailyCache');
    assert.ok(aiHubContent.includes('formatDailyExpiry'), 'ai-hub.js must format daily expiry time');

    // Expiry check and "if expired then not" logic
    assert.ok(aiHubContent.includes('isCacheValid'), 'ai-hub.js must check whether local cache is valid and not expired');
    assert.ok(aiHubContent.includes('activeExpiryTs'), 'ai-hub.js must track activeExpiryTs');
    assert.ok(aiHubContent.includes('Expires at') || aiHubContent.includes('Valid till'), 'ai-hub.js must render expiry time in UI');

    // Expired offline handling: clears container ("if expired then not")
    assert.ok(aiHubContent.includes("container.innerHTML = '';") && aiHubContent.includes("_isRenderingAIHome = false;"), 'Expired cache in offline mode must not show');
});

test('Beta 1.4 Bug 4: Desktop-only gate for offline features (disabled on web version)', (t) => {
    const desktopContent = fs.readFileSync(desktopPath, 'utf8');
    const aiHubContent = fs.readFileSync(aiHubPath, 'utf8');
    const contextMenuContent = fs.readFileSync(path.join(ROOT, 'src', 'js', 'context-menu.js'), 'utf8');

    // desktop.js checks isDesktop
    assert.ok(desktopContent.includes('if (!isDesktop) return;'), 'desktop.js offline UI functions must return early on non-desktop');

    // context-menu.js checks isDesktop before showing download option
    assert.ok(contextMenuContent.includes('isDesktop'), 'context-menu.js must gate download option to desktop');

    // ai-hub.js gates local daily caching and offline banner to desktop
    assert.ok(aiHubContent.includes('if (isDesktop)'), 'ai-hub.js must gate local caching and offline mode to desktop');
});
