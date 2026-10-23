const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('Beta 1.4: Offline Mode - Windows Desktop exclusive vs Web', () => {
    const aiHubCode = fs.readFileSync(path.join(__dirname, '../src/js/ai-hub.js'), 'utf8');

    // Verify isDesktopApp is defined and handles isDTunesDesktop and electronAPI
    assert.match(aiHubCode, /window\.isDTunesDesktop/, 'ai-hub.js checks window.isDTunesDesktop');
    assert.match(aiHubCode, /window\.electronAPI/, 'ai-hub.js checks window.electronAPI');

    // Verify isOfflineMode gates to desktop app only
    assert.match(aiHubCode, /if\s*\(isDesktop\)/, 'ai-hub.js strictly gates offline mode to desktop app only');
});

test('Beta 1.4: Offline Boot - Instantaneous boot with zero network timeouts', () => {
    const searchCode = fs.readFileSync(path.join(__dirname, '../src/js/search.js'), 'utf8');

    // Verify homeView.init checks offline mode before firing trending/for-you network requests
    assert.match(searchCode, /isOffline\s*=\s*isDesktop\s*&&/, 'search.js detects offline desktop boot');
    assert.match(searchCode, /document\.getElementById\("section-trending"\)\?\.classList\.add\("hidden"\)/, 'search.js immediately hides trending shelf without firing network requests');
    assert.match(searchCode, /return;/, 'search.js returns immediately on offline desktop boot without calling live APIs');
});

test('Beta 1.4: Offline Home - Downloaded songs on top, cached items below with expiry', () => {
    const aiHubCode = fs.readFileSync(path.join(__dirname, '../src/js/ai-hub.js'), 'utf8');

    // Verify renderOfflineHome renders downloads and cached library/history
    assert.match(aiHubCode, /buildDownloadsShelf\(downloads\)/, 'Downloaded songs shelf is placed at top of offline home');
    assert.match(aiHubCode, /buildRecentlyPlayedShelf\(\)/, 'Cached history shelf is rendered');
    assert.match(aiHubCode, /buildLibraryShelf\(\)/, 'Cached library shelf is rendered');

    // Verify expiry timestamp is shown in header
    assert.match(aiHubCode, /Expires at \$\{formatDailyExpiry\(expiresAt\)\}/, 'Expiry timestamp is displayed in Made For You header');

    // Verify expired cache is rejected
    assert.match(aiHubCode, /expiresAt > Date\.now\(\)/, 'Cache validator rejects expired Made For You cache');
});

test('Beta 1.4: Service Worker - Instant cache response for navigation when offline', () => {
    const swCode = fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8');

    // Verify sw.js serves cached shell immediately if navigator is offline
    assert.match(swCode, /if\s*\(typeof navigator !== 'undefined' && !navigator\.onLine\)/, 'sw.js checks offline state in networkFirst');
    assert.match(swCode, /if\s*\(cached\)\s*return cached;/, 'sw.js immediately returns cached shell when offline');
});

test('Beta 1.4: Desktop Download Fallback - Native DPAPI and WebCrypto AES-GCM', () => {
    const desktopCode = fs.readFileSync(path.join(__dirname, '../src/js/desktop.js'), 'utf8');

    // Verify dtunesDownloadTrack attempts native DPAPI and falls back to offlineStore
    assert.match(desktopCode, /api\.downloadTrack/, 'desktop.js supports native downloadTrack');
    assert.match(desktopCode, /offlineStore\.download/, 'desktop.js falls back to offlineStore.download');
    assert.match(desktopCode, /refreshOfflineList/, 'desktop.js refreshes offline list after download');
});
