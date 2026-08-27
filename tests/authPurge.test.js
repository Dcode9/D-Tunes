const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestEnvironment } = require('./testHarness');

// Reference Cloud Library & Auth Purge Controller
function createCloudLibraryController(env, options = {}) {
    const state = {
        user: null,
        likedIds: [],
        likedArtists: [],
        playlists: {},
        playlistStyles: {},
        playHistory: [],
        userQueue: [],
        currentTrack: null,
        playing: false,
        equalizerPreset: 'flat',
        username: 'Guest'
    };

    const PURGE_KEYS = [
        'likedIds',
        'likedArtists',
        'playlists',
        'playlistStyles',
        'playHistory',
        'artistPlayCounts',
        'recentSearches',
        'username',
        'songStore',
        'dtunes_tester_streak',
        'savedQueue',
        'lastActiveTrack',
        'dverse_session_cache',
        'dverse_supabase_auth_token',
        'equalizerPreset'
    ];

    const toasts = [];
    const showToast = (msg, type) => toasts.push({ msg, type });

    const signInAndSync = async (userData, remoteCloudData = {}) => {
        state.user = userData;
        state.username = userData.username || 'Music Lover';
        env.localStorage.setItem('username', state.username);
        env.localStorage.setItem('dverse_session_cache', JSON.stringify({ user: userData, token: 'mock_jwt_token' }));
        env.localStorage.setItem('dverse_supabase_auth_token', 'mock_jwt_token');

        // Auto-pull remote data from Supabase
        if (remoteCloudData.playlists) {
            state.playlists = { ...remoteCloudData.playlists };
            env.localStorage.setItem('playlists', JSON.stringify(state.playlists));
        }
        if (remoteCloudData.playlistStyles) {
            state.playlistStyles = { ...remoteCloudData.playlistStyles };
            env.localStorage.setItem('playlistStyles', JSON.stringify(state.playlistStyles));
        }
        if (remoteCloudData.likedIds) {
            state.likedIds = [...remoteCloudData.likedIds];
            env.localStorage.setItem('likedIds', JSON.stringify(state.likedIds));
        }
        if (remoteCloudData.likedArtists) {
            state.likedArtists = [...remoteCloudData.likedArtists];
            env.localStorage.setItem('likedArtists', JSON.stringify(state.likedArtists));
        }
        if (remoteCloudData.playHistory) {
            state.playHistory = [...remoteCloudData.playHistory];
            env.localStorage.setItem('playHistory', JSON.stringify(state.playHistory));
        }
        if (remoteCloudData.equalizerPreset) {
            state.equalizerPreset = remoteCloudData.equalizerPreset;
            env.localStorage.setItem('equalizerPreset', state.equalizerPreset);
        }

        showToast(`Signed in as ${state.username}`, 'success');
        return true;
    };

    const signOutAndPurgeAll = (sleepTimerMock = null, playerMock = null) => {
        // 1. Halt audio playback
        if (playerMock && typeof playerMock.pause === 'function') {
            playerMock.pause();
        }
        if (env.audio) {
            env.audio.pause();
            env.audio.src = '';
            env.audio.currentTime = 0;
        }

        // 2. Cancel active sleep timer
        if (sleepTimerMock && typeof sleepTimerMock.cancel === 'function') {
            sleepTimerMock.cancel();
        }

        // 3. Reset in-memory state to clean guest slate
        state.user = null;
        state.username = 'Guest';
        state.likedIds = [];
        state.likedArtists = [];
        state.playlists = {};
        state.playlistStyles = {};
        state.playHistory = [];
        state.userQueue = [];
        state.currentTrack = null;
        state.playing = false;
        state.equalizerPreset = 'flat';

        // 4. Wipe all target localStorage keys and any keys prefixed with dtunes_ or dverse_
        PURGE_KEYS.forEach(key => env.localStorage.removeItem(key));
        
        const allKeys = env.localStorage.getAllKeys();
        allKeys.forEach(k => {
            if (k.startsWith('dtunes_') || k.startsWith('dverse_')) {
                env.localStorage.removeItem(k);
            }
        });

        // 5. Clear session storage
        env.sessionStorage.clear();

        // 6. Reset UI elements in DOM
        const avatarEl = env.document.getElementById('header-avatar');
        if (avatarEl) avatarEl.textContent = 'G';
        const nameEl = env.document.getElementById('dd-username');
        if (nameEl) nameEl.textContent = 'Guest';

        showToast('Signed out and completely wiped all local data', 'info');
        return true;
    };

    return {
        state,
        toasts,
        signInAndSync,
        signOutAndPurgeAll,
        PURGE_KEYS
    };
}

test('R8: Working Cloud Sign In, Account Switcher & Complete Wipe Suite', async (t) => {

    // --- TIER 1: FEATURE COVERAGE (R8) ---

    await t.test('Tier 1 - R8-F1: Cloud Sign-In automatically pulls and sets remote playlists, likes, history, EQ', async () => {
        const env = createTestEnvironment();
        const auth = createCloudLibraryController(env);

        const remoteData = {
            playlists: { 'Road Trip': [{ id: 's1', name: 'Song 1' }] },
            playlistStyles: { 'Road Trip': { color: '#0ea5e9', shape: 'SmoothRect' } },
            likedIds: ['s1', 's2'],
            likedArtists: [{ id: 'art_1', name: 'Coldplay' }],
            playHistory: [{ id: 's1', playedAt: '2026-08-27T10:00:00Z' }],
            equalizerPreset: 'bass_boost'
        };

        const ok = await auth.signInAndSync({ id: 'u_101', username: 'Dhairya' }, remoteData);
        assert.equal(ok, true);
        assert.equal(auth.state.username, 'Dhairya');
        assert.equal(auth.state.likedIds.length, 2);
        assert.equal(auth.state.likedArtists.length, 1);
        assert.equal(auth.state.equalizerPreset, 'bass_boost');
        assert.ok(env.localStorage.getItem('playlists'));
        assert.ok(env.localStorage.getItem('dverse_supabase_auth_token'));
    });

    await t.test('Tier 1 - R8-F2: signOutAndPurgeAll halts audio playback and resets audio element', () => {
        const env = createTestEnvironment();
        let paused = false;
        const playerMock = { pause: () => { paused = true; } };
        const auth = createCloudLibraryController(env);

        env.audio.src = 'https://example.com/audio.mp4';
        env.audio.currentTime = 45;
        env.audio.play();

        auth.signOutAndPurgeAll(null, playerMock);
        assert.equal(paused, true, 'player.pause must be called');
        assert.equal(env.audio.paused, true, 'Audio must be paused');
        assert.equal(env.audio.src, '', 'Audio src must be cleared');
        assert.equal(env.audio.currentTime, 0, 'Audio currentTime must be 0');
    });

    await t.test('Tier 1 - R8-F3: signOutAndPurgeAll wipes ALL 15+ localStorage keys', () => {
        const env = createTestEnvironment();
        const auth = createCloudLibraryController(env);

        // Populate target keys in storage
        auth.PURGE_KEYS.forEach((key, idx) => {
            env.localStorage.setItem(key, `value_${idx}`);
        });
        assert.ok(env.localStorage.length >= 14);

        auth.signOutAndPurgeAll();

        // Verify every key is wiped
        auth.PURGE_KEYS.forEach(key => {
            assert.equal(env.localStorage.getItem(key), null, `Key ${key} must be null after purge`);
        });
    });

    await t.test('Tier 1 - R8-F4: signOutAndPurgeAll clears Supabase auth tokens and cached session', () => {
        const env = createTestEnvironment();
        const auth = createCloudLibraryController(env);

        env.localStorage.setItem('dverse_session_cache', '{"token":"xyz"}');
        env.localStorage.setItem('dverse_supabase_auth_token', 'jwt_token_123');

        auth.signOutAndPurgeAll();

        assert.equal(env.localStorage.getItem('dverse_session_cache'), null);
        assert.equal(env.localStorage.getItem('dverse_supabase_auth_token'), null);
        assert.equal(auth.state.user, null);
    });

    await t.test('Tier 1 - R8-F5: signOutAndPurgeAll resets UI to guest slate', () => {
        const env = createTestEnvironment();
        const auth = createCloudLibraryController(env);

        const avatarEl = env.document.getElementById('header-avatar');
        avatarEl.textContent = 'D';
        const nameEl = env.document.getElementById('dd-username');
        nameEl.textContent = 'Dhairya';

        auth.signOutAndPurgeAll();

        assert.equal(avatarEl.textContent, 'G');
        assert.equal(nameEl.textContent, 'Guest');
        assert.equal(auth.state.username, 'Guest');
    });

    await t.test('Tier 1 - R8-F6: signOutAndPurgeAll triggers confirmation feedback toast', () => {
        const env = createTestEnvironment();
        const auth = createCloudLibraryController(env);

        auth.signOutAndPurgeAll();
        assert.ok(auth.toasts.length > 0);
        assert.ok(auth.toasts[0].msg.toLowerCase().includes('wiped') || auth.toasts[0].msg.toLowerCase().includes('signed out'));
    });

    // --- TIER 2: BOUNDARY & CORNER CASES ---

    await t.test('Tier 2 - R8-B1: Calling signOutAndPurgeAll in guest mode is safe and idempotent', () => {
        const env = createTestEnvironment();
        const auth = createCloudLibraryController(env);

        // Call 3 times consecutively while already logged out
        auth.signOutAndPurgeAll();
        auth.signOutAndPurgeAll();
        auth.signOutAndPurgeAll();

        assert.equal(auth.state.user, null);
        assert.equal(auth.state.username, 'Guest');
        assert.equal(env.localStorage.length, 0);
    });

    await t.test('Tier 2 - R8-B2: Offline hard sign-out completes 100% of local storage wipe', () => {
        const env = createTestEnvironment();
        const auth = createCloudLibraryController(env);

        env.localStorage.setItem('playlists', JSON.stringify({ 'Mix': [] }));
        env.localStorage.setItem('dtunes_custom_key', 'some_data');
        env.localStorage.setItem('dverse_offline_queue', '[]');

        auth.signOutAndPurgeAll();

        assert.equal(env.localStorage.getItem('playlists'), null);
        assert.equal(env.localStorage.getItem('dtunes_custom_key'), null);
        assert.equal(env.localStorage.getItem('dverse_offline_queue'), null);
    });

    // --- TIER 3: CROSS-FEATURE COMBINATIONS ---

    await t.test('Tier 3 - R8-C1: Hard sign-out cancels active sleep timer and resets EQ to flat', () => {
        const env = createTestEnvironment();
        let sleepCancelled = false;
        const sleepTimerMock = {
            cancel: () => { sleepCancelled = true; }
        };
        const auth = createCloudLibraryController(env);
        auth.state.equalizerPreset = 'electronic_club';

        auth.signOutAndPurgeAll(sleepTimerMock);
        assert.equal(sleepCancelled, true, 'Sleep timer must be cancelled upon sign-out');
        assert.equal(auth.state.equalizerPreset, 'flat', 'Equalizer must reset to flat');
    });

    await t.test('Tier 3 - R8-C2: Account switcher isolation: User A data is 100% inaccessible to User B', async () => {
        const env = createTestEnvironment();
        const auth = createCloudLibraryController(env);

        // User A logs in
        await auth.signInAndSync(
            { id: 'user_a', username: 'Alice' },
            { playlists: { 'Secret Alice Mix': [{ id: 'a1' }] }, likedIds: ['a1', 'a2'] }
        );
        assert.equal(auth.state.username, 'Alice');
        assert.ok(auth.state.playlists['Secret Alice Mix']);

        // Hard Sign Out Purge
        auth.signOutAndPurgeAll();
        assert.equal(auth.state.playlists['Secret Alice Mix'], undefined);
        assert.equal(env.localStorage.getItem('playlists'), null);

        // User B logs in
        await auth.signInAndSync(
            { id: 'user_b', username: 'Bob' },
            { playlists: { 'Bob Rock': [{ id: 'b1' }] }, likedIds: ['b1'] }
        );

        assert.equal(auth.state.username, 'Bob');
        assert.ok(auth.state.playlists['Bob Rock']);
        assert.equal(auth.state.playlists['Secret Alice Mix'], undefined, 'No residual data from User A');
        assert.equal(auth.state.likedIds.includes('a1'), false);
    });

    // --- TIER 4: REAL-WORLD WORKLOAD ---

    await t.test('Tier 4 - R8-W1: Full Auth Lifecycle (Guest -> Sign In -> Add Data -> Purge -> Clean Guest)', async () => {
        const env = createTestEnvironment();
        const auth = createCloudLibraryController(env);

        // 1. Initial guest state
        assert.equal(auth.state.username, 'Guest');

        // 2. Sign in with cloud sync
        await auth.signInAndSync(
            { id: 'u_test', username: 'Tester' },
            {
                playlists: { 'Favorites': [{ id: 'fav1', name: 'Favorite 1' }] },
                likedArtists: [{ id: 'art_1', name: 'Queen' }],
                equalizerPreset: 'vocal_boost'
            }
        );
        assert.equal(auth.state.username, 'Tester');
        assert.equal(env.localStorage.getItem('username'), 'Tester');

        // 3. User plays audio
        env.audio.src = 'https://example.com/stream.mp4';
        env.audio.play();
        assert.equal(env.audio.paused, false);

        // 4. Hard sign-out wipe
        auth.signOutAndPurgeAll();

        // 5. Verify final guest state
        assert.equal(auth.state.username, 'Guest');
        assert.equal(auth.state.user, null);
        assert.equal(env.audio.paused, true);
        assert.equal(env.audio.src, '');
        assert.equal(env.localStorage.length, 0);
    });

});
