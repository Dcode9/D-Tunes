const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createTestEnvironment } = require('./testHarness');

const rootDir = path.resolve(__dirname, '..');

test('CHALLENGER M1: Adversarial Stress Test Suite', async (t) => {

    // =========================================================================
    // 1. ADVERSARIAL ASSET SCANNER: ZERO STREAK / TESTER / 15-DAY OCCURRENCES
    // =========================================================================
    await t.test('Section 1: Exhaustive frontend scan for streak/tester/15-day tokens', async (st) => {
        const frontendFiles = [
            'index.html',
            'src/app.js',
            'src/dverseClient.js',
            'src/recommendationClient.js',
            'src/styles.css',
            'src/preload.js',
            'manifest.json',
            'metadata.json',
            'feedback/index.html',
            'privacy_policy/index.html'
        ];

        const prohibitedPatterns = [
            /\bstreak\b/i,
            /\btester\b/i,
            /\b15-day\b/i,
            /\b15\s+day\b/i,
            /\btesterStreak/i,
            /\btoggleTesterStreakModal/i,
            /\brenderTesterStreakModal/i,
            /\bdtunes_tester_streaks/i,
            /#tester-streak-modal/i,
            /\.streak-/i
        ];

        for (const relPath of frontendFiles) {
            const absPath = path.join(rootDir, relPath);
            if (!fs.existsSync(absPath)) continue;

            const content = fs.readFileSync(absPath, 'utf8');
            const lines = content.split('\n');

            lines.forEach((line, index) => {
                for (const pattern of prohibitedPatterns) {
                    const match = pattern.test(line);
                    assert.equal(
                        match,
                        false,
                        `Prohibited token match in ${relPath}:${index + 1} (pattern: ${pattern.toString()}): "${line.trim()}"`
                    );
                }
            });
        }
    });

    // =========================================================================
    // 2. MERGE CONFLICT RESOLUTION & RECOMMENDATION CLIENT ADVERSARIAL TESTING
    // =========================================================================
    await t.test('Section 2: RecommendationClient conflict resolution and API event pipeline', async (st) => {
        const filePath = path.join(rootDir, 'src', 'recommendationClient.js');
        const code = fs.readFileSync(filePath, 'utf8');

        // Verify zero git conflict markers
        assert.equal(code.includes('<<<<<<<'), false, 'No conflict start marker in recommendationClient.js');
        assert.equal(code.includes('======='), false, 'No conflict mid marker in recommendationClient.js');
        assert.equal(code.includes('>>>>>>>'), false, 'No conflict end marker in recommendationClient.js');

        // Create VM context to execute recommendationClient.js
        const env = createTestEnvironment();
        const fetchCalls = [];
        let currentFetchImpl = async (url, opts) => {
            fetchCalls.push({ url: String(url), opts });
            if (String(url).includes('/api/music/similar')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        songs: [
                            { saavn_id: 'rec_s1', title: 'Rec Song 1', artist: 'Rec Artist 1', duration: 200, play_url: 'http://rec1.mp3', image_url: 'http://rec1.jpg' }
                        ]
                    })
                };
            }
            if (String(url).includes('/api/music/artist-radio')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        songs: [
                            { saavn_id: 'rad_s1', title: 'Radio Song 1', artist: 'Radio Artist 1', duration: 180, play_url: 'http://rad1.mp3', image_url: 'http://rad1.jpg' }
                        ]
                    })
                };
            }
            if (String(url).includes('/api/music/playlist')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        songs: [
                            { saavn_id: 'pl_s1', title: 'Curated Playlist Song', artist: 'Curated Artist', duration: 220, play_url: 'http://pl1.mp3', image_url: 'http://pl1.jpg' }
                        ]
                    })
                };
            }
            if (String(url).includes('/api/music/event')) {
                return { ok: true, status: 200, json: async () => ({ success: true }) };
            }
            return { ok: true, status: 200, json: async () => ({ songs: [] }) };
        };

        const context = vm.createContext({
            window: env.window,
            localStorage: env.localStorage,
            fetch: (url, opts) => currentFetchImpl(url, opts),
            crypto: { randomUUID: () => 'mock-uuid-12345' },
            console: { warn: () => {}, log: () => {}, error: () => {} },
            URLSearchParams,
            encodeURIComponent,
            Date,
            JSON,
            Array,
            Map,
            AbortSignal: { timeout: (ms) => ({ timeout: ms }) }
        });
        env.window.localStorage = env.localStorage;
        env.window.fetch = (url, opts) => currentFetchImpl(url, opts);

        vm.runInContext(code, context);

        const recClient = context.window.recommendationClient;
        assert.ok(recClient, 'recommendationClient is exported on window');

        // Test 2.1: Anonymous User ID generation & caching
        const uid1 = recClient.getUserId();
        assert.equal(uid1, 'anon_mock-uuid-12345', 'Should generate anon_mock-uuid-12345');
        assert.equal(env.localStorage.getItem('dtunesAnonymousUserId'), 'anon_mock-uuid-12345');
        const uid2 = recClient.getUserId();
        assert.equal(uid2, uid1, 'Subsequent getUserId calls return cached ID');

        // Test 2.2: toApiSong and toAppSong normalization with null / missing / partial structures
        assert.equal(recClient.toApiSong(null), null);
        assert.equal(recClient.toApiSong(undefined), null);
        const minimalAppSong = { id: 's_min' };
        const minimalApi = recClient.toApiSong(minimalAppSong);
        assert.equal(minimalApi.saavn_id, 's_min');
        assert.equal(minimalApi.title, undefined);

        const fullAppSong = { id: 'saavn_99', name: 'Test Song', artist: 'Singer A, Singer B', img: 'http://art.jpg', url: 'http://audio.mp3', duration: 250 };
        const apiSong = recClient.toApiSong(fullAppSong);
        assert.equal(apiSong.saavn_id, 'saavn_99');
        assert.equal(apiSong.title, 'Test Song');
        assert.equal(apiSong.primary_artists, 'Singer A, Singer B');
        assert.equal(apiSong.duration_seconds, 250);

        const convertedBack = recClient.toAppSong(apiSong);
        assert.equal(convertedBack.id, 'saavn_99');
        assert.equal(convertedBack.name, 'Test Song');
        assert.equal(convertedBack.artist, 'Singer A, Singer B');
        assert.equal(convertedBack.source, 'recommendation');

        // Test 2.3: fetchPlaylist with 'similar' (testing both songId and seedSongId parameter styles)
        const similarRes1 = await recClient.fetchPlaylist('similar', { songId: 'track_alpha', limit: 10 });
        assert.equal(similarRes1.length, 1);
        assert.equal(similarRes1[0].id, 'rec_s1');
        assert.ok(fetchCalls.some(c => c.url.includes('/api/music/similar?songId=track_alpha&limit=10')));

        const similarRes2 = await recClient.fetchPlaylist('similar', { seedSongId: 'track_beta', limit: 15 });
        assert.equal(similarRes2.length, 1);
        assert.ok(fetchCalls.some(c => c.url.includes('/api/music/similar?songId=track_beta&limit=15')));

        // Test 2.4: fetchPlaylist with 'artist-radio' (testing both artist and seedArtist parameter styles + Unicode characters)
        const radioRes1 = await recClient.fetchPlaylist('artist-radio', { artist: 'A.R. Rahman & जावेद अली', limit: 20 });
        assert.equal(radioRes1.length, 1);
        assert.ok(fetchCalls.some(c => c.url.includes('artist-radio?artist=' + encodeURIComponent('A.R. Rahman & जावेद अली'))));

        const radioRes2 = await recClient.fetchPlaylist('artist-radio', { seedArtist: 'Pritam / KK / 🔥', limit: 12 });
        assert.equal(radioRes2.length, 1);
        assert.ok(fetchCalls.some(c => c.url.includes('artist-radio?artist=' + encodeURIComponent('Pritam / KK / 🔥'))));

        // Test 2.5: fetchPlaylist with generic playlist types
        const plRes = await recClient.fetchPlaylist('late-night', { language: 'hindi', limit: 10 });
        assert.equal(plRes.length, 1);
        assert.equal(plRes[0].id, 'pl_s1');
        assert.ok(fetchCalls.some(c => c.url.includes('/api/music/playlist?') && c.url.includes('type=late-night') && c.url.includes('language=hindi')));

        // Test 2.6: fetchPlaylist error handling / offline fallback
        currentFetchImpl = async () => { throw new Error('Network Offline'); };
        context.window.jiosaavnAPI = {
            searchSongs: async (q, limit) => [
                { id: 'fallback_1', name: 'Fallback Track', artist: 'Offline Artist', duration: 120 }
            ],
            getSong: async (id) => ({ id, name: 'Offline Song', artist: 'Artist X' }),
            getTrending: async () => []
        };
        const offlineRes = await recClient.fetchPlaylist('similar', { songId: 'fallback_seed' });
        assert.equal(offlineRes.length, 1);
        assert.equal(offlineRes[0].id, 'fallback_1');

        // Test 2.7: recordEvent deduplication & queue overflow stress test
        currentFetchImpl = async () => ({ ok: true, status: 200, json: async () => ({}) });
        // Rapid duplicate event firing for same song -> should be deduplicated within DUPLICATE_WINDOW_MS
        await recClient.recordEvent('play', { id: 'dup_track', title: 'Duplicate Track' });
        await recClient.recordEvent('play', { id: 'dup_track', title: 'Duplicate Track' });
        await recClient.recordEvent('play', { id: 'dup_track', title: 'Duplicate Track' });
        
        // Rapid event firing: 600 distinct events
        for (let i = 0; i < 600; i++) {
            await recClient.recordEvent('play', { id: `stress_song_${i}`, title: `Song ${i}` });
        }
        const storedEvents = JSON.parse(env.localStorage.getItem('dtunesRecommendationEvents') || '[]');
        assert.ok(storedEvents.length <= 500, `Local events queue must cap at 500 entries (got: ${storedEvents.length})`);
    });

    // =========================================================================
    // 3. PLAYBACK & PLAYER ADVERSARIAL STRESS TEST
    // =========================================================================
    await t.test('Section 3: Playback functions and decoupled streak hooks', async (st) => {
        const env = createTestEnvironment();
        
        const state = {
            currentTrack: null,
            playing: false,
            loaded: false,
            userQueue: [],
            playHistory: []
        };

        const mockSongStore = new Map();
        const songStore = {
            add: (s) => { const id = `s_${mockSongStore.size}`; mockSongStore.set(id, s); return id; },
            get: (id) => mockSongStore.get(id)
        };

        let playDirectCallCount = 0;

        const player = {
            playDirect: (track) => {
                if (!track) return;
                playDirectCallCount++;
                state.currentTrack = track;
                state.playing = true;
                state.loaded = true;
                env.audio.src = track.url || '';
                env.audio.play();
                state.playHistory.unshift({ id: track.id, title: track.title || track.name, playedAt: new Date().toISOString() });
            },
            togglePlay: () => {
                if (state.playing) {
                    state.playing = false;
                    env.audio.pause();
                } else {
                    state.playing = true;
                    env.audio.play();
                }
            },
            next: () => {
                if (state.userQueue.length > 0) {
                    const nextTrack = state.userQueue.shift();
                    player.playDirect(nextTrack);
                }
            }
        };

        // Adversarial Test 3.1: Null / Undefined / Corrupted track inputs
        assert.doesNotThrow(() => player.playDirect(null), 'playDirect(null) must not throw');
        assert.doesNotThrow(() => player.playDirect(undefined), 'playDirect(undefined) must not throw');
        assert.doesNotThrow(() => player.playDirect({}), 'playDirect({}) must not throw');

        // Adversarial Test 3.2: Rapid 200 sequential track playback calls
        for (let i = 0; i < 200; i++) {
            const track = {
                id: `song_${i}`,
                name: `Song ${i}`,
                artist: `Artist ${i % 10}`,
                url: `http://audio.cdn/song_${i}.mp3`,
                duration: 180 + (i % 60)
            };
            player.playDirect(track);
        }
        assert.equal(playDirectCallCount, 201); // 1 from {} + 200
        assert.equal(state.currentTrack.id, 'song_199');
        assert.equal(state.playing, true);
        assert.equal(env.audio.paused, false);

        // Adversarial Test 3.3: Verify window.testerStreakManager absence does not impede playback
        assert.equal(env.window.testerStreakManager, undefined);
        assert.equal(env.localStorage.getItem('dtunes_tester_streak'), null);
    });

    // =========================================================================
    // 4. AUTHENTICATION & HARD SIGN-OUT DEEP PURGE STRESS TEST
    // =========================================================================
    await t.test('Section 4: Hard sign out purge and storage wipe robustness', async (st) => {
        const env = createTestEnvironment();

        const ALL_KEYS = [
            'likedIds', 'likedArtists', 'playlists', 'playlistStyles',
            'playHistory', 'artistPlayCounts', 'recentSearches', 'username',
            'songStore', 'dtunes_tester_streak', 'savedQueue', 'lastActiveTrack',
            'dverse_session_cache', 'dverse_supabase_auth_token',
            'dtunesAnonymousUserId', 'dtunesRecommendationEvents'
        ];

        // Seed storage with populated data + legacy streak data + garbage keys
        ALL_KEYS.forEach(key => {
            env.localStorage.setItem(key, JSON.stringify({ mock: 'data_for_' + key, timestamp: Date.now() }));
        });
        env.localStorage.setItem('dtunes_tester_streak', JSON.stringify({ streak: 14, badge: 'gold' }));
        env.localStorage.setItem('custom_user_pref', 'dark_mode');

        const state = {
            currentTrack: { id: 's1', title: 'Playing Track' },
            playing: true,
            userQueue: [{ id: 's2' }, { id: 's3' }]
        };

        const cloudLibrary = {
            signOutAndPurgeAll: () => {
                // Halt playback
                state.playing = false;
                state.currentTrack = null;
                state.userQueue = [];
                env.audio.pause();
                env.audio.src = '';
                env.audio.currentTime = 0;

                // Wipe all defined keys
                ALL_KEYS.forEach(key => env.localStorage.removeItem(key));
            }
        };

        // Execute deep purge
        cloudLibrary.signOutAndPurgeAll();

        // Verify player state is halted
        assert.equal(state.playing, false, 'Playback must be paused on hard sign out');
        assert.equal(state.currentTrack, null, 'Current track must be nullified');
        assert.equal(state.userQueue.length, 0, 'Queue must be cleared');
        assert.equal(env.audio.paused, true, 'Audio element must be paused');
        assert.equal(env.audio.src, '', 'Audio src must be cleared');

        // Verify all 16 target storage keys are completely nullified
        ALL_KEYS.forEach(key => {
            assert.equal(env.localStorage.getItem(key), null, `Key ${key} must be wiped`);
        });

        // Verify dtunes_tester_streak specifically is wiped
        assert.equal(env.localStorage.getItem('dtunes_tester_streak'), null, 'dtunes_tester_streak must be wiped');

        // Adversarial Test 4.1: Idempotency - Calling signOutAndPurgeAll 50 times consecutively
        for (let i = 0; i < 50; i++) {
            assert.doesNotThrow(() => cloudLibrary.signOutAndPurgeAll(), 'Repeated sign out calls must be idempotent and not throw');
        }
    });

});
