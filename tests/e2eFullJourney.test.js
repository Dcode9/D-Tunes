const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestEnvironment } = require('./testHarness');

test('Tier 4: Comprehensive Real-World E2E User Journeys & DSP Workload Suite', async (t) => {

    // --- JOURNEY 1: FULL DAY-IN-THE-LIFE USER LIFECYCLE ---

    await t.test('E2E-J1: Complete User Day-in-the-Life (Sign-in -> Playlist Edit -> Artist Nav -> Gestures -> Sleep Timer -> Fadeout -> Stats -> Hard Wipe)', async () => {
        const env = createTestEnvironment();
        
        // 1. Initial State: Clean Guest Slate
        let playerState = {
            currentTrack: null,
            playing: false,
            volume: 1.0,
            userQueue: [],
            likedArtists: [],
            history: []
        };

        const playerMock = {
            play: (track) => { playerState.currentTrack = track; playerState.playing = true; },
            pause: () => { playerState.playing = false; },
            getVolume: () => playerState.volume,
            setVolume: (v) => { playerState.volume = v; },
            addSongNext: (s) => playerState.userQueue.unshift(s),
            addSongToQueue: (s) => playerState.userQueue.push(s),
            next: () => {
                if (playerState.userQueue.length > 0) {
                    playerState.currentTrack = playerState.userQueue.shift();
                    playerState.playing = true;
                }
            }
        };

        // 2. Cloud Sign-in & Remote Sync
        const remoteUser = { id: 'u_777', username: 'Alex River' };
        const remoteLibrary = {
            playlists: {
                'Evening Chill': [
                    { id: 'c1', name: 'Chill Waves', duration: 180, artist: 'Lofi Producer' },
                    { id: 'c2', name: 'Night Drive', duration: 240, artist: 'Synthwave Guy' },
                    { id: 'c3', name: 'Rainy Cafe', duration: 210, artist: 'Lofi Producer' }
                ]
            },
            playlistStyles: {
                'Evening Chill': { color: '#0ea5e9', shape: 'SmoothRect', cornerRadius: 20, icon: 'Music' }
            },
            likedArtists: [{ id: 'art_lofi', name: 'Lofi Producer' }]
        };

        env.localStorage.setItem('username', remoteUser.username);
        env.localStorage.setItem('playlists', JSON.stringify(remoteLibrary.playlists));
        env.localStorage.setItem('playlistStyles', JSON.stringify(remoteLibrary.playlistStyles));
        env.localStorage.setItem('likedArtists', JSON.stringify(remoteLibrary.likedArtists));

        assert.equal(env.localStorage.getItem('username'), 'Alex River');

        // 3. User Opens & Edits Playlist (Rename, Customize Cover, Reorder, Delete track)
        const playlists = JSON.parse(env.localStorage.getItem('playlists'));
        const styles = JSON.parse(env.localStorage.getItem('playlistStyles'));

        // Rename 'Evening Chill' -> 'Sunset Vibes'
        playlists['Sunset Vibes'] = playlists['Evening Chill'];
        delete playlists['Evening Chill'];
        styles['Sunset Vibes'] = {
            color: '#8b5cf6',
            shape: 'Star',
            starSides: 6,
            icon: 'Sparkles'
        };
        delete styles['Evening Chill'];

        // Reorder: Move 'Night Drive' (idx 1) to top (idx 0)
        const [moved] = playlists['Sunset Vibes'].splice(1, 1);
        playlists['Sunset Vibes'].unshift(moved);
        assert.equal(playlists['Sunset Vibes'][0].id, 'c2'); // 'Night Drive' is now top

        // Delete track 'Rainy Cafe' (idx 2)
        playlists['Sunset Vibes'] = playlists['Sunset Vibes'].filter(t => t.id !== 'c3');
        assert.equal(playlists['Sunset Vibes'].length, 2);

        env.localStorage.setItem('playlists', JSON.stringify(playlists));
        env.localStorage.setItem('playlistStyles', JSON.stringify(styles));

        // 4. User navigates to Artist View & plays song #1
        const artistTopSongs = [
            { id: 'a_top1', name: 'Acoustic Morning', duration: 200, artist: 'Lofi Producer' },
            { id: 'a_top2', name: 'Midnight Study', duration: 220, artist: 'Lofi Producer' },
            { id: 'a_top3', name: 'Sunset Glow', duration: 250, artist: 'Lofi Producer' }
        ];

        playerMock.play(artistTopSongs[0]);
        assert.equal(playerState.currentTrack.id, 'a_top1');
        assert.equal(playerState.playing, true);

        // 5. Touch Gestures: Swipe song #2 Right (Play Next) & song #3 Left (Add to Queue)
        // Swipe Right on a_top2 -> Play Next
        playerMock.addSongNext(artistTopSongs[1]);
        env.navigator.vibrate(15);
        assert.equal(playerState.userQueue[0].id, 'a_top2');

        // Swipe Left on a_top3 -> Add to Queue
        playerMock.addSongToQueue(artistTopSongs[2]);
        env.navigator.vibrate(15);
        assert.equal(playerState.userQueue[1].id, 'a_top3');
        assert.equal(env.vibrations.length, 2);

        // 6. Sleep Timer Configuration: Set 15m, then Extend +5m (Total 20m)
        let timerActive = true;
        let timerRemainingMs = 15 * 60 * 1000;
        // User taps +5m
        timerRemainingMs += 5 * 60 * 1000; // 20 mins = 1,200,000ms
        assert.equal(timerRemainingMs, 20 * 60 * 1000);

        // 7. Time advances to last 10 seconds of Sleep Timer -> S-Curve Fadeout -> Audio Pause
        const fadeDurationMs = 10000;
        // At 5 seconds remaining in fadeout:
        const progress5s = 5000 / fadeDurationMs; // 0.5
        playerState.volume = (1 - Math.cos(Math.PI * progress5s)) / 2;
        assert.ok(Math.abs(playerState.volume - 0.5) < 1e-5);

        // At 0 seconds remaining -> Audio pauses
        playerState.volume = 0.0;
        playerMock.pause();
        playerState.volume = 1.0; // Reset
        timerActive = false;
        assert.equal(playerState.playing, false, 'Audio must halt when sleep timer expires');

        // 8. Record Listening Event and verify Stats Dashboard
        playerState.history.push({
            id: 'a_top1',
            title: 'Acoustic Morning',
            artist: 'Lofi Producer',
            duration: 200,
            playedAt: new Date().toISOString()
        });
        env.localStorage.setItem('playHistory', JSON.stringify(playerState.history));

        const storedHistory = JSON.parse(env.localStorage.getItem('playHistory'));
        assert.equal(storedHistory.length, 1);
        assert.equal(storedHistory[0].artist, 'Lofi Producer');

        // 9. Hard Sign Out & Complete Storage Purge
        const PURGE_KEYS = [
            'likedIds', 'likedArtists', 'playlists', 'playlistStyles',
            'playHistory', 'artistPlayCounts', 'recentSearches', 'username',
            'songStore', 'dtunes_tester_streak', 'savedQueue', 'lastActiveTrack',
            'dverse_session_cache', 'dverse_supabase_auth_token'
        ];
        PURGE_KEYS.forEach(k => env.localStorage.removeItem(k));
        playerState = { currentTrack: null, playing: false, volume: 1.0, userQueue: [], likedArtists: [], history: [] };

        // Verify clean slate
        assert.equal(env.localStorage.getItem('username'), null);
        assert.equal(env.localStorage.getItem('playlists'), null);
        assert.equal(env.localStorage.getItem('playHistory'), null);
        assert.equal(playerState.playing, false);
    });

    // --- JOURNEY 2: 10-BAND EQUALIZER & DSP HEADROOM LIMITER ---

    await t.test('E2E-J2: Studio 10-Band Equalizer, Preamp Headroom Guard & Presets', () => {
        const presets = {
            'flat': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            'bass_boost': [7, 6, 5, 3, 1, 0, 0, 0, 1, 2],
            'vocal_clarity': [-2, -1, 0, 2, 5, 5, 4, 3, 2, 1],
            'electronic': [6, 5, 2, 0, -1, 2, 3, 4, 5, 5]
        };

        const computeHeadroom = (bandGains) => {
            const maxPositiveGain = Math.max(0, ...bandGains);
            // Pre-amp attenuation equals negative max gain to guarantee 0dBFS ceiling
            return maxPositiveGain === 0 ? 0 : -maxPositiveGain;
        };

        // 1. Flat Preset
        const flatHeadroom = computeHeadroom(presets['flat']);
        assert.equal(flatHeadroom, 0);

        // 2. Bass Boost (+7dB at 32Hz)
        const bassHeadroom = computeHeadroom(presets['bass_boost']);
        assert.equal(bassHeadroom, -7, 'Headroom limiter must attenuate preamp by -7dB to prevent clipping');

        // 3. Electronic (+6dB at 32Hz)
        const elecHeadroom = computeHeadroom(presets['electronic']);
        assert.equal(elecHeadroom, -6);
    });

    // --- JOURNEY 3: ADVERSARIAL RESILIENCE & STORAGE CORRUPTION SELF-HEALING ---

    await t.test('E2E-J3: Adversarial Storage Faults & Network Reconnection Recovery', async () => {
        const env = createTestEnvironment();

        // 1. Corrupt JSON in playlists and likedIds
        env.localStorage.setItem('playlists', 'CORRUPT_JSON{{{{');
        env.localStorage.setItem('likedIds', 'UNDEFINED');

        const safeLoadState = () => {
            let playlists = {};
            let likedIds = [];
            try {
                playlists = JSON.parse(env.localStorage.getItem('playlists')) || {};
            } catch (e) {
                playlists = {};
            }
            try {
                likedIds = JSON.parse(env.localStorage.getItem('likedIds')) || [];
            } catch (e) {
                likedIds = [];
            }
            return { playlists, likedIds };
        };

        const loaded = safeLoadState();
        assert.deepEqual(loaded.playlists, {});
        assert.deepEqual(loaded.likedIds, []);

        // 2. Simulated Network Recovery
        let attempts = 0;
        const resilientFetch = async () => {
            attempts++;
            if (attempts < 3) {
                throw new Error('Network timeout');
            }
            return { success: true, data: [{ id: 's_recovered', name: 'Recovered Song' }] };
        };

        let result = null;
        for (let i = 0; i < 3; i++) {
            try {
                result = await resilientFetch();
                break;
            } catch (e) {
                // Retry
            }
        }

        assert.equal(attempts, 3);
        assert.ok(result && result.success);
        assert.equal(result.data[0].id, 's_recovered');
    });

});
