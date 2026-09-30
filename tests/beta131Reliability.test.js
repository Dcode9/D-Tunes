const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const indexPath = path.join(ROOT, 'index.html');
const aiHubPath = path.join(ROOT, 'src', 'js', 'ai-hub.js');
const aiPath = path.join(ROOT, 'src', 'js', 'ai.js');
const uiPath = path.join(ROOT, 'src', 'js', 'ui.js');

test('Beta 1.3.1: Version bump and compact Changelog modal formatting', (t) => {
    const indexContent = fs.readFileSync(indexPath, 'utf8');

    // 1. Title and header badge
    assert.match(indexContent, /<title>D'Tunes \(Beta 1\.3\.1\)<\/title>/, 'Page title must show Beta 1.3.1');
    assert.match(indexContent, /class="beta-label[^"]*"[^>]*>Beta 1\.3\.1<\/button>/, 'Header beta badge must show Beta 1.3.1');

    // 2. Changelog modal has Beta 1.3.1 patch section
    assert.ok(indexContent.includes('0.1.3.1'), 'Changelog must contain version 0.1.3.1');
    assert.ok(indexContent.includes('Beta 1.3.1'), 'Changelog must feature Beta 1.3.1');
    assert.ok(indexContent.includes('Seamless Tab Focus & Stability'), 'Changelog must highlight tab focus stability');
    assert.ok(indexContent.includes('Vibe Mix Playlist Generator'), 'Changelog must highlight Vibe Mix');
    assert.ok(indexContent.includes('Streamlined Release Notes'), 'Changelog must highlight streamlined notes');

    // 3. Past versions are wrapped in collapsible <details> to avoid overwhelming the user
    assert.match(indexContent, /<details class="group[^"]*">\s*<summary[^>]*>[\s\S]*?Beta 1\.3[\s\S]*?<\/summary>/, 'Beta 1.3 must be in collapsible <details>');
    assert.match(indexContent, /<details class="group[^"]*">\s*<summary[^>]*>[\s\S]*?Beta 1\.2[\s\S]*?<\/summary>/, 'Beta 1.2 must be in collapsible <details>');
    assert.match(indexContent, /<details class="group[^"]*">\s*<summary[^>]*>[\s\S]*?Beta 1\.1[\s\S]*?<\/summary>/, 'Beta 1.1 must be in collapsible <details>');
});

test('Beta 1.3.1: Tab focus stability and AI recommendation reload prevention', (t) => {
    const aiHubContent = fs.readFileSync(aiHubPath, 'utf8');

    // Caching variables must exist
    assert.ok(aiHubContent.includes('_lastRenderedUserId'), 'Must track rendered user ID');
    assert.ok(aiHubContent.includes('_lastRenderedDateKey'), 'Must track rendered date key');
    assert.ok(aiHubContent.includes('_cachedDailyPlaylists'), 'Must cache daily playlists in memory');
    assert.ok(aiHubContent.includes('_isRenderingAIHome'), 'Must guard against concurrent render calls');

    // Check that onAuthStateChange ignores focus token refreshes
    assert.ok(aiHubContent.includes("TOKEN_REFRESHED"), 'Must explicitly check for TOKEN_REFRESHED event');
    assert.ok(aiHubContent.includes('currentUid === _lastRenderedUserId'), 'Must avoid re-rendering for the same user');

    // Check that renderAIHome skips skeleton flash if already rendered for today
    assert.ok(aiHubContent.includes('!forceRefresh && _lastRenderedUserId === userId && _lastRenderedDateKey === todayKey'), 'Must preserve rendered mixes when forceRefresh is false');
});

test('Beta 1.3.1: Vibe Mix modal and Library entry point', (t) => {
    const indexContent = fs.readFileSync(indexPath, 'utf8');

    // Modal exists
    assert.ok(indexContent.includes('id="vibe-mix-modal"'), 'index.html must contain #vibe-mix-modal');
    assert.ok(indexContent.includes('id="vibe-input"'), 'index.html must contain #vibe-input');
    assert.ok(indexContent.includes('id="vibe-infuse-taste"'), 'index.html must contain taste infusion toggle');
    assert.ok(indexContent.includes('id="btn-create-vibe-mix"'), 'index.html must contain curate button');

    // Quick chips
    assert.ok(indexContent.includes('Time Capsule'), 'Quick chips must include Time Capsule');
    assert.ok(indexContent.includes('Cozy Chill'), 'Quick chips must include Cozy Chill');
    assert.ok(indexContent.includes('Late Night'), 'Quick chips must include Late Night');

    // Library header and playlist modal links
    assert.ok(indexContent.includes('ui.toggleVibeMixModal(true)'), 'Must have button to open Vibe Mix modal');
});

test('Beta 1.3.1: Vibe Mix generator logic in ai.js and ui.js', (t) => {
    const aiContent = fs.readFileSync(aiPath, 'utf8');
    const uiContent = fs.readFileSync(uiPath, 'utf8');

    // ai.js exports generateVibeMix
    assert.ok(aiContent.includes('generateVibeMix'), 'ai.js must contain generateVibeMix function');
    assert.ok(aiContent.includes('window.ai = {'), 'window.ai must export functions');
    assert.ok(aiContent.includes('generateVibeMix,'), 'window.ai must export generateVibeMix');

    // Taste context and Time Capsule support
    assert.ok(aiContent.includes('isTimeCapsule'), 'generateVibeMix must support isTimeCapsule');
    assert.ok(aiContent.includes('infuseTaste'), 'generateVibeMix must support infuseTaste');
    assert.ok(aiContent.includes('dislikedSongs'), 'generateVibeMix must strictly obey dislikedSongs');

    // ui.js UI methods
    assert.ok(uiContent.includes('toggleVibeMixModal:'), 'ui.js must implement toggleVibeMixModal');
    assert.ok(uiContent.includes('selectVibeChip:'), 'ui.js must implement selectVibeChip');
    assert.ok(uiContent.includes('submitVibeMix:'), 'ui.js must implement submitVibeMix');
    assert.ok(uiContent.includes('Vibe Mix'), 'ui.js renderPlaylists must include Vibe Mix card');
});

test('Beta 1.3.1: Auth concurrency single-flight lock and persistent memory in dverseClient.js', (t) => {
    const dversePath = path.join(ROOT, 'src', 'js', 'dverseClient.js');
    const dverseContent = fs.readFileSync(dversePath, 'utf8');

    // 1. Single-flight locks exist to prevent GoTrue token rotation revocation race conditions
    assert.ok(dverseContent.includes('activeGetSessionPromise'), 'Must have activeGetSessionPromise lock');
    assert.ok(dverseContent.includes('activeRefreshPromise'), 'Must have activeRefreshPromise lock');

    // 2. Token expiration validation before deciding to refresh
    assert.ok(dverseContent.includes('expiresAtMs > (Date.now() + 60000)'), 'Must check token expiration with safety buffer');

    // 3. Fallback to persisted supabase token
    assert.ok(dverseContent.includes('dverse_supabase_auth_token'), 'Must check dverse_supabase_auth_token fallback');

    // 4. universalStorage has clear method and robust cookie deletion
    assert.ok(dverseContent.includes('clear: () =>'), 'universalStorage must implement clear()');
    assert.ok(dverseContent.includes('deleteCookie(DVERSE_TOKENS_COOKIE)'), 'clearPersistedTokens must delete tokens cookie');
});

test('Beta 1.3.1: Clean zero-trace purge on sign out and ghost persistence prevention', (t) => {
    const statePath = path.join(ROOT, 'src', 'js', 'state.js');
    const stateContent = fs.readFileSync(statePath, 'utf8');
    const mainPath = path.join(ROOT, 'src', 'js', 'main.js');
    const mainContent = fs.readFileSync(mainPath, 'utf8');

    // 1. persist.save must guard against saving during signout
    assert.ok(stateContent.includes('cloudLibrary?._isSigningOut'), 'persist.save must guard against _isSigningOut');
    assert.ok(stateContent.includes('!state.currentTrack && (!state.queue || state.queue.length === 0)'), 'persist.save must not save ghost state');

    // 2. signOutAndPurgeAll must clear state, storage, timers, and audio
    assert.ok(stateContent.includes('cloudLibrary._isSigningOut = true'), 'signOutAndPurgeAll must set _isSigningOut');
    assert.ok(stateContent.includes('state.username = \'Guest User\''), 'Must reset username to Guest User');
    assert.ok(stateContent.includes('state.avatarUrl = \'\''), 'Must reset avatarUrl to empty');
    assert.ok(stateContent.includes('universalStorage?.clear'), 'Must call universalStorage clear');
    assert.ok(stateContent.includes('sessionStorage.clear()'), 'Must clear sessionStorage');

    // 3. main.js must await cloudLibrary.init before homeView.init
    assert.ok(mainContent.includes('await cloudLibrary.init()'), 'main.js must await cloudLibrary.init()');
    assert.ok(mainContent.indexOf('await cloudLibrary.init()') < mainContent.indexOf('await homeView.init()'), 'cloudLibrary.init() must run before homeView.init()');
});

test('Beta 1.3.1: Trending now cards hover overlay bug fix in styles.css', (t) => {
    const stylesPath = path.join(ROOT, 'src', 'css', 'styles.css');
    const stylesContent = fs.readFileSync(stylesPath, 'utf8');

    // 1. opacity: inherit must NOT be present on group-hover:opacity-100
    assert.ok(!stylesContent.includes('.group-hover\\:opacity-100 {\n    opacity: inherit;'), 'Must not set opacity: inherit on group-hover:opacity-100');
    assert.ok(!stylesContent.includes('.group-hover\\:opacity-100,\nhtml[data-ui-mode="mobile"] .group-hover\\:scale-100'), 'Must not group group-hover:opacity-100 with scale transforms');

    // 2. Touch / Mobile viewports must keep card play overlay hidden
    assert.ok(stylesContent.includes('.scroll-card .opacity-0.group-hover\\:opacity-100'), 'Must explicitly guard scroll-card overlay for touch');
});
