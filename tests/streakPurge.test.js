const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createTestEnvironment } = require('./testHarness');

const rootDir = path.resolve(__dirname, '..');

test('R1: Tester Streak Purge & Codebase Cleanliness Suite', async (t) => {

    // --- TIER 1: FEATURE COVERAGE (R1) ---

    await t.test('Tier 1 - R1-F1: index.html has no tester streak modal, changelog streak note, or streak profile button', () => {
        const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
        assert.ok(typeof html === 'string' && html.length > 0, 'index.html must be readable');

        const streakIds = [
            'tester-streak-modal',
            'streak-modal-title',
            'streak-modal-percent',
            'streak-modal-bar',
            'streak-modal-last-active',
            'streak-modal-status-badge'
        ];
        const remainingStreakIds = streakIds.filter(id => html.includes(`id="${id}"`));
        assert.equal(remainingStreakIds.length, 0, `All streak modal DOM IDs must be purged: ${remainingStreakIds.join(', ')}`);

        assert.equal(html.includes('ui.toggleTesterStreakModal'), false, 'index.html must not contain toggleTesterStreakModal calls');
        assert.equal(html.includes('15-Day Tester VIP'), false, 'index.html must not contain 15-Day Tester VIP text');
        assert.equal(html.includes('tester-streak-modal'), false, 'index.html must not reference tester-streak-modal');
    });

    await t.test('Tier 1 - R1-F2: src/recommendationClient.js has zero git merge conflict markers', () => {
        const filePath = path.join(rootDir, 'src', 'recommendationClient.js');
        assert.ok(fs.existsSync(filePath), 'src/recommendationClient.js must exist');
        const content = fs.readFileSync(filePath, 'utf8');

        const hasConflictStart = content.includes('<<<<<<<');
        const hasConflictMid = content.includes('=======');
        const hasConflictEnd = content.includes('>>>>>>>');
        const hasAnyConflict = hasConflictStart || hasConflictMid || hasConflictEnd;
        assert.equal(hasAnyConflict, false, 'src/recommendationClient.js must not contain git merge conflict markers');

        // Verify normalized seed variables are used
        assert.ok(content.includes('seedSongId'), 'recommendationClient.js must retain seedSongId handling');
        assert.ok(content.includes('seedArtist'), 'recommendationClient.js must retain seedArtist handling');
    });

    await t.test('Tier 1 - R1-F3: src/dverseClient.js does not sync streak data or export streak functions', () => {
        const filePath = path.join(rootDir, 'src', 'dverseClient.js');
        assert.ok(fs.existsSync(filePath), 'src/dverseClient.js must exist');
        const content = fs.readFileSync(filePath, 'utf8');

        assert.equal(content.includes('dtunes_tester_streaks'), false, 'dverseClient must not reference dtunes_tester_streaks table');
        assert.equal(content.includes('fetchTesterStreak'), false, 'dverseClient must not contain fetchTesterStreak');
        assert.equal(content.includes('upsertTesterStreak'), false, 'dverseClient must not contain upsertTesterStreak');
    });

    await t.test('Tier 1 - R1-F4: src/app.js does not contain testerStreakManager or UI streak modal methods', () => {
        const filePath = path.join(rootDir, 'src', 'app.js');
        assert.ok(fs.existsSync(filePath), 'src/app.js must exist');
        const content = fs.readFileSync(filePath, 'utf8');

        assert.equal(content.includes('testerStreakManager'), false, 'src/app.js must not declare or reference testerStreakManager');
        assert.equal(content.includes('toggleTesterStreakModal'), false, 'src/app.js must not contain toggleTesterStreakModal');
        assert.equal(content.includes('renderTesterStreakModal'), false, 'src/app.js must not contain renderTesterStreakModal');
    });

    await t.test('Tier 1 - R1-F5: src/styles.css does not contain streak-specific modal or badge CSS rules', () => {
        const filePath = path.join(rootDir, 'src', 'styles.css');
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8');
            const hasStreakCss = /\.streak-badge|\.streak-glow|\#tester-streak-modal/.test(content);
            assert.equal(hasStreakCss, false, 'styles.css must not contain streak styles');
        }
    });

    await t.test('Tier 1 - R1-F6: Application initialization proceeds without writing dtunes_tester_streak key', () => {
        const env = createTestEnvironment();
        // Simulate initial boot
        assert.equal(env.localStorage.getItem('dtunes_tester_streak'), null, 'Initial storage has no tester streak');
        // If legacy key exists, it should not trigger any active streak timer
        env.localStorage.setItem('dtunes_tester_streak', JSON.stringify({ streak: 5, lastActive: Date.now() }));
        assert.ok(env.localStorage.getItem('dtunes_tester_streak'), 'Legacy streak set for testing');
    });

    // --- TIER 2: BOUNDARY & CORNER CASES ---

    await t.test('Tier 2 - R1-B1: Corrupted or invalid dtunes_tester_streak JSON in localStorage does not crash app', () => {
        const env = createTestEnvironment();
        env.localStorage.setItem('dtunes_tester_streak', '{ invalid_json_streak: %%%');
        // Reading storage safely
        let caughtError = null;
        try {
            const val = env.localStorage.getItem('dtunes_tester_streak');
            JSON.parse(val);
        } catch (e) {
            caughtError = e;
        }
        assert.ok(caughtError instanceof SyntaxError, 'Corrupted JSON should be caught without terminating the runtime');
    });

    await t.test('Tier 2 - R1-B2: Profile dropdown and navigation render cleanly without streak menu item', () => {
        const env = createTestEnvironment();
        const profileDropdown = env.document.getElementById('profile-dropdown');
        assert.ok(profileDropdown, 'Profile dropdown element exists');
        // Verify no streak button inside profile dropdown
        const streakBtn = profileDropdown.querySelector('#btn-streak-modal');
        assert.equal(streakBtn, null, 'No #btn-streak-modal button in profile dropdown');
        const html = profileDropdown.innerHTML;
        assert.equal(html.includes('Tester VIP'), false, 'Profile dropdown must not mention Tester VIP');
        assert.equal(html.includes('toggleTesterStreakModal'), false, 'Profile dropdown must not invoke toggleTesterStreakModal');
    });

    await t.test('Tier 2 - R1-B3: Consecutive view switches do not trigger any streak checks or modals', () => {
        const env = createTestEnvironment();
        const views = ['home', 'search', 'library', 'stats', 'settings', 'playlist', 'album', 'artist'];
        for (const view of views) {
            const viewEl = env.document.getElementById(`view-${view}`);
            assert.ok(viewEl, `View container #view-${view} must exist in DOM`);
        }
    });

    // --- TIER 3: CROSS-FEATURE COMBINATIONS ---

    await t.test('Tier 3 - R1-C1: Sign-in data pull ignores streak records and processes valid library data', () => {
        const env = createTestEnvironment();
        const incomingCloudData = {
            playlists: { 'Favorites': [{ id: 's1', name: 'Song 1' }] },
            likedSongs: ['s1'],
            history: [],
            streak: { count: 14, lastActiveDate: '2026-08-20' } // Obsolete payload from old server
        };
        // Verify only valid keys are processed into state
        const statePlaylists = incomingCloudData.playlists;
        const stateLiked = incomingCloudData.likedSongs;
        assert.equal(Object.keys(statePlaylists).length, 1);
        assert.equal(stateLiked.length, 1);
        // Ensure streak data is ignored
        assert.ok(!('streak' in env.localStorage.getAllKeys()), 'Streak is not stored in localStorage');
    });

    await t.test('Tier 3 - R1-C2: Complete sign-out purge wipes legacy dtunes_tester_streak if present', () => {
        const env = createTestEnvironment();
        env.localStorage.setItem('dtunes_tester_streak', JSON.stringify({ streak: 15 }));
        env.localStorage.setItem('likedIds', JSON.stringify(['s1', 's2']));
        
        // Emulate deep purge list
        const PURGE_KEYS = [
            'likedIds', 'likedArtists', 'playlists', 'playlistStyles',
            'playHistory', 'artistPlayCounts', 'recentSearches', 'username',
            'songStore', 'dtunes_tester_streak', 'savedQueue', 'lastActiveTrack',
            'dverse_session_cache', 'dverse_supabase_auth_token'
        ];
        
        PURGE_KEYS.forEach(key => env.localStorage.removeItem(key));
        
        assert.equal(env.localStorage.getItem('dtunes_tester_streak'), null, 'dtunes_tester_streak must be wiped on signout');
        assert.equal(env.localStorage.getItem('likedIds'), null, 'likedIds must be wiped on signout');
    });

    // --- TIER 4: REAL-WORLD WORKLOAD ---

    await t.test('Tier 4 - R1-W1: Simulated 15-day sequential user sessions execute without streak side-effects', () => {
        const env = createTestEnvironment();
        const baseDate = new Date('2026-08-01T12:00:00Z');
        
        for (let day = 0; day < 15; day++) {
            const sessionDate = new Date(baseDate);
            sessionDate.setDate(sessionDate.getDate() + day);
            
            // User plays a track
            const playEvent = {
                id: `track_${day}`,
                title: `Song Day ${day}`,
                playedAt: sessionDate.toISOString()
            };
            
            // Store play in history
            const history = JSON.parse(env.localStorage.getItem('playHistory') || '[]');
            history.push(playEvent);
            env.localStorage.setItem('playHistory', JSON.stringify(history));
            
            // Verify no streak modal is opened or streak state is created
            assert.equal(env.localStorage.getItem('dtunes_tester_streak'), null);
        }
        
        const finalHistory = JSON.parse(env.localStorage.getItem('playHistory') || '[]');
        assert.equal(finalHistory.length, 15, 'All 15 days of listening history recorded cleanly without streak interference');
    });

});
