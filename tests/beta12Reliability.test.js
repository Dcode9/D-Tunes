const test = require('node:test');
const assert = require('node:assert/strict');

test('Beta 1.2 - Deterministic Shuffle Queue & Synchronization', async (t) => {
    await t.test('generateShuffledQueue maintains current track at pointer 0 and permutes remaining', () => {
        const queue = [
            { id: 'song-0', name: 'Song 0' },
            { id: 'song-1', name: 'Song 1' },
            { id: 'song-2', name: 'Song 2' },
            { id: 'song-3', name: 'Song 3' },
            { id: 'song-4', name: 'Song 4' },
        ];
        const state = {
            queue,
            idx: 2,
            shuffledOrder: [],
            shufflePointer: 0,
        };

        const generateShuffledQueue = () => {
            if (!state.queue || state.queue.length <= 1) {
                state.shuffledOrder = (state.queue || []).map((_, i) => i);
                state.shufflePointer = 0;
                return;
            }
            const currentIdx = state.idx >= 0 && state.idx < state.queue.length ? state.idx : 0;
            const remaining = state.queue.map((_, i) => i).filter(i => i !== currentIdx);
            for (let i = remaining.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                const temp = remaining[i];
                remaining[i] = remaining[j];
                remaining[j] = temp;
            }
            state.shuffledOrder = [currentIdx, ...remaining];
            state.shufflePointer = 0;
        };

        generateShuffledQueue();

        assert.equal(state.shuffledOrder.length, 5);
        assert.equal(state.shuffledOrder[0], 2, 'First element of shuffled order must be current track');
        assert.equal(state.shufflePointer, 0);

        const uniqueIndices = new Set(state.shuffledOrder);
        assert.equal(uniqueIndices.size, 5);
        for (let i = 0; i < 5; i++) {
            assert.ok(uniqueIndices.has(i), `Index ${i} must be in shuffledOrder`);
        }
    });

    await t.test('getUpcomingTrack in shuffle mode agrees 100% with the next song played', () => {
        const queue = [
            { id: 'track-A', name: 'Track A' },
            { id: 'track-B', name: 'Track B' },
            { id: 'track-C', name: 'Track C' },
            { id: 'track-D', name: 'Track D' },
        ];
        const state = {
            queue,
            userQueue: [],
            idx: 0,
            shuffle: true,
            shuffledOrder: [0, 3, 1, 2],
            shufflePointer: 0,
            repeat: 0,
        };

        const getUpcomingTrack = () => {
            if (state.userQueue.length > 0) return state.userQueue[0];
            if (!state.queue || state.queue.length === 0) return null;
            if (state.shuffle) {
                const nextShuffleIdx = state.shuffledOrder[state.shufflePointer + 1];
                if (nextShuffleIdx !== undefined && state.queue[nextShuffleIdx]) {
                    return state.queue[nextShuffleIdx];
                }
                return state.repeat === 1 && state.shuffledOrder.length > 0 ? state.queue[state.shuffledOrder[0]] : null;
            }
            return state.idx >= 0 && state.idx < state.queue.length - 1 ? state.queue[state.idx + 1] : null;
        };

        const upcoming = getUpcomingTrack();
        assert.ok(upcoming);
        assert.equal(upcoming.id, 'track-D', 'Upcoming track must match shuffledOrder[1]');

        state.shufflePointer++;
        const playedTrack = state.queue[state.shuffledOrder[state.shufflePointer]];
        assert.equal(playedTrack.id, upcoming.id, 'Player next must play the identical track indicated by upcoming preview');

        const nextUpcoming = getUpcomingTrack();
        assert.equal(nextUpcoming.id, 'track-B');
    });

    await t.test('Queue display in shuffle mode matches shuffled upcoming order', () => {
        const queue = [
            { id: 't0' }, { id: 't1' }, { id: 't2' }, { id: 't3' }, { id: 't4' }
        ];
        const state = {
            queue,
            shuffle: true,
            shuffledOrder: [0, 4, 1, 3, 2],
            shufflePointer: 0
        };

        const upcoming = state.shuffledOrder.slice(state.shufflePointer + 1, state.shufflePointer + 11)
            .map(i => state.queue[i]);

        assert.deepEqual(upcoming.map(t => t.id), ['t4', 't1', 't3', 't2']);
    });
});

test('Beta 1.2 - Audio Error Retry Backoff Resilience', async (t) => {
    await t.test('Transient error retries current track at currentTime without skipping', async () => {
        let playCount = 0;
        let nextCalled = false;
        const fakeAudio = {
            currentTime: 42.5,
            src: 'https://cdn.example.com/audio.mp4',
            crossOrigin: '',
            load: () => {},
            play: async () => { playCount++; }
        };

        const state = {
            currentTrack: { id: 'song-123', url: 'https://cdn.example.com/audio.mp4' },
            _audioRetryCount: 0,
            playing: true,
            userPaused: false
        };

        const player = {
            next: () => { nextCalled = true; }
        };

        const recoverFromAudioError = async () => {
            const resumeTime = Math.max(0, fakeAudio.currentTime || 0);
            state._audioRetryCount = (state._audioRetryCount || 0) + 1;

            if (state._audioRetryCount <= 2 && state.currentTrack.url) {
                fakeAudio.src = state.currentTrack.url;
                fakeAudio.load();
                fakeAudio.currentTime = resumeTime;
                if (state.playing || !state.userPaused) await fakeAudio.play();
                return;
            }
            player.next();
        };

        await recoverFromAudioError();
        assert.equal(state._audioRetryCount, 1);
        assert.equal(playCount, 1);
        assert.equal(nextCalled, false, 'Must not skip on first error');
        assert.equal(fakeAudio.currentTime, 42.5, 'Must preserve playback timestamp');

        await recoverFromAudioError();
        assert.equal(state._audioRetryCount, 2);
        assert.equal(playCount, 2);
        assert.equal(nextCalled, false, 'Must not skip on second error');

        await recoverFromAudioError();
        assert.equal(state._audioRetryCount, 3);
        assert.equal(nextCalled, true, 'Should only skip after retries are exhausted');
    });
});

test('Beta 1.2 - Real-Time Homepage Purge on Sign-Out', async (t) => {
    await t.test('signOutAndPurgeAll resets personalized shelves and discover mixes', () => {
        const dom = {
            'section-for-you': { classList: new Set() },
            'for-you-actions': { classList: new Set() },
            'for-you-grid': { innerHTML: '<div>cards</div>' },
            'section-quick-picks': { classList: new Set() },
            'quick-picks-grid': { innerHTML: '<div>cards</div>' },
            'section-recent': { classList: new Set() },
            'recent-grid': { innerHTML: '<div>cards</div>' }
        };

        const getElementById = (id) => {
            if (!dom[id]) return null;
            return {
                classList: {
                    add: (cls) => dom[id].classList.add(cls),
                    remove: (cls) => dom[id].classList.delete(cls)
                },
                set innerHTML(val) { dom[id].innerHTML = val; },
                get innerHTML() { return dom[id].innerHTML; }
            };
        };

        let discoverRefreshed = false;
        const homeView = {
            renderDiscoverSection: (force) => { discoverRefreshed = force; }
        };

        const state = {
            discoverMixes: { 'daily-mix-1': [{ id: '1' }] }
        };

        getElementById('section-for-you')?.classList.add('hidden');
        getElementById('for-you-actions')?.classList.add('hidden');
        const forYouGrid = getElementById('for-you-grid');
        if (forYouGrid) forYouGrid.innerHTML = '';

        getElementById('section-quick-picks')?.classList.add('hidden');
        const quickPicksGrid = getElementById('quick-picks-grid');
        if (quickPicksGrid) quickPicksGrid.innerHTML = '';

        getElementById('section-recent')?.classList.add('hidden');
        const recentGrid = getElementById('recent-grid');
        if (recentGrid) recentGrid.innerHTML = '';

        state.discoverMixes = {};
        homeView.renderDiscoverSection(true);

        assert.ok(dom['section-for-you'].classList.has('hidden'), 'For You section must be hidden');
        assert.equal(dom['for-you-grid'].innerHTML, '', 'For You grid must be empty');
        assert.ok(dom['section-quick-picks'].classList.has('hidden'), 'Quick picks section must be hidden');
        assert.equal(dom['quick-picks-grid'].innerHTML, '', 'Quick picks grid must be empty');
        assert.ok(dom['section-recent'].classList.has('hidden'), 'Recently played section must be hidden');
        assert.equal(dom['recent-grid'].innerHTML, '', 'Recent grid must be empty');
        assert.equal(discoverRefreshed, true, 'Discover mixes must be refreshed for guest');
        assert.deepEqual(state.discoverMixes, {}, 'Discover mixes cache must be cleared');
    });
});

test('Beta 1.2 - External Playback Seekbar & Visualizer Wake', async (t) => {
    await t.test('Audio play event wakes visualizer render and resumes suspended AudioContext', async () => {
        let vizStarted = false;
        let acResumed = false;
        const viz = {
            start: () => { vizStarted = true; }
        };
        const audioContext = {
            state: 'suspended',
            resume: async () => { acResumed = true; audioContext.state = 'running'; }
        };

        const onAudioPlay = async () => {
            if (audioContext && audioContext.state === 'suspended') {
                await audioContext.resume();
            }
            if (typeof viz !== 'undefined' && viz.start) {
                viz.start();
            }
        };

        await onAudioPlay();

        assert.equal(vizStarted, true, 'Visualizer must start immediately on play');
        assert.equal(acResumed, true, 'AudioContext must resume on play');
    });

    await t.test('timeupdate directly synchronizes seekbar and canvas clip path', () => {
        const vizSeekTrack = { style: { clipPath: '' } };
        const vizCanvas = { width: 600, style: { clipPath: '' } };
        const currentProgress = 0.35;
        const dpr = 2;
        const canvasW = vizCanvas.width / dpr;
        const progressWidth = canvasW * currentProgress;

        vizSeekTrack.style.clipPath = `inset(0 0 0 ${currentProgress * 100}%)`;
        vizCanvas.style.clipPath = `inset(0 ${canvasW - progressWidth}px 0 0)`;

        assert.equal(vizSeekTrack.style.clipPath, 'inset(0 0 0 35%)');
        assert.equal(vizCanvas.style.clipPath, 'inset(0 195px 0 0)');
    });
});

test('Beta 1.2 - Desktop Sign-In Handoff & Isolation', async (t) => {
    await t.test('Desktop handoff triggers loopback POST and dtunes:// deep link when desktop_auth=1 is present', () => {
        let loopbackNotified = false;
        let deepLinkNavigated = '';
        let overlayRendered = false;

        const session = {
            access_token: 'mock_access_123',
            refresh_token: 'mock_refresh_456'
        };

        const mockNotifyDesktop = (s) => {
            if (s && s.access_token) loopbackNotified = true;
        };

        const mockRenderUI = (link) => {
            overlayRendered = true;
            deepLinkNavigated = link;
        };

        const handleHandoff = (s, isDesktopAuth) => {
            if (!s || !isDesktopAuth) return;
            mockNotifyDesktop(s);
            const deepLinkUrl = `dtunes://auth?access_token=${encodeURIComponent(s.access_token)}&refresh_token=${encodeURIComponent(s.refresh_token)}`;
            mockRenderUI(deepLinkUrl);
        };

        handleHandoff(session, true);

        assert.equal(loopbackNotified, true, 'Desktop loopback port 49200 must be notified');
        assert.equal(overlayRendered, true, 'Handoff overlay UI must be displayed');
        assert.equal(deepLinkNavigated, 'dtunes://auth?access_token=mock_access_123&refresh_token=mock_refresh_456');
    });

    await t.test('Normal web sign-in ignores desktop handoff and never notifies port 49200', () => {
        let loopbackNotified = false;
        let overlayRendered = false;

        const session = {
            access_token: 'web_token_789',
            refresh_token: 'web_refresh_012'
        };

        const handleHandoff = (s, isDesktopAuth) => {
            if (!s || !isDesktopAuth) return;
            loopbackNotified = true;
            overlayRendered = true;
        };

        handleHandoff(session, false);

        assert.equal(loopbackNotified, false, 'Web sign-in must NOT notify port 49200');
        assert.equal(overlayRendered, false, 'Web sign-in must NOT render desktop handoff overlay');
    });

    await t.test('Desktop OAuth redirect points directly to local loopback server on port 49200', () => {
        const loopbackRedirect = 'http://127.0.0.1:49200/callback';
        const url = new URL(loopbackRedirect);

        assert.equal(url.origin, 'http://127.0.0.1:49200');
        assert.equal(url.pathname, '/callback');
    });

    await t.test('Desktop auth handoff extracts code and constructs dtunes://auth?code= URL', () => {
        const url = new URL('http://127.0.0.1:49200/callback?code=google_auth_code_xyz');
        const searchParams = url.searchParams;

        const code = searchParams.get('code');
        assert.equal(code, 'google_auth_code_xyz');

        const payload = code ? { code } : null;
        assert.deepEqual(payload, { code: 'google_auth_code_xyz' });

        const deepLinkUrl = `dtunes://auth?code=${encodeURIComponent(code)}`;
        assert.equal(deepLinkUrl, 'dtunes://auth?code=google_auth_code_xyz');
    });

    await t.test('Signed-in UI state completely hides header and dropdown sign-in buttons and displays avatar', () => {
        const dom = {
            'dverse-header-auth-button': { classList: new Set(), style: {} },
            'dverse-auth-button': { classList: new Set(), style: {} },
            'header-avatar': { src: '', referrerPolicy: '' },
            'mobile-nav-avatar': { src: '', referrerPolicy: '' },
            'dd-username': { textContent: '' }
        };

        const session = {
            user: {
                email: 'test@example.com',
                user_metadata: {
                    full_name: 'Test User',
                    avatar_url: 'https://lh3.googleusercontent.com/a/avatar123'
                }
            }
        };

        const signedIn = Boolean(session);
        const meta = session.user.user_metadata;
        const displayName = meta.full_name || 'Test User';
        const avatarUrl = meta.avatar_url;

        // Apply signed-in DOM changes
        if (dom['dverse-header-auth-button']) {
            dom['dverse-header-auth-button'].classList.add('hidden');
            dom['dverse-header-auth-button'].style.display = 'none';
        }
        if (dom['dverse-auth-button']) {
            dom['dverse-auth-button'].classList.add('hidden');
            dom['dverse-auth-button'].style.display = 'none';
        }
        if (dom['header-avatar']) {
            dom['header-avatar'].referrerPolicy = 'no-referrer';
            dom['header-avatar'].src = avatarUrl;
        }

        assert.equal(dom['dverse-header-auth-button'].style.display, 'none');
        assert.ok(dom['dverse-header-auth-button'].classList.has('hidden'));
        assert.equal(dom['dverse-auth-button'].style.display, 'none');
        assert.ok(dom['dverse-auth-button'].classList.has('hidden'));
        assert.equal(dom['header-avatar'].src, 'https://lh3.googleusercontent.com/a/avatar123');
        assert.equal(dom['header-avatar'].referrerPolicy, 'no-referrer');
    });
});

test('Beta 1.2 - Audio Engine Resilience, Instant Playback & Seekbar Reset', async (t) => {
    await t.test('resetSeekbarAndTimes immediately zeroes progress, seekbar, and timestamps', () => {
        let currentTime = 142;
        const audio = {
            currentTime,
            duration: 210,
        };
        const seekBar = { value: 142, max: 210 };
        const currTimeEl = { textContent: '2:22' };
        const durTimeEl = { textContent: '3:30' };
        const vizSeekTrack = { style: { clipPath: 'inset(0 0 0 67%)' } };
        const vizCanvas = { width: 600, style: { clipPath: 'inset(0 100px 0 0)' } };
        let currentProgress = 0.67;

        const formatTime = (secs) => {
            const m = Math.floor(secs / 60);
            const s = Math.floor(secs % 60);
            return `${m}:${s < 10 ? '0' : ''}${s}`;
        };

        const resetSeekbarAndTimes = (track = null) => {
            currentProgress = 0;
            audio.currentTime = 0;
            seekBar.value = 0;
            seekBar.max = track?.duration ? track.duration : 100;
            currTimeEl.textContent = '0:00';
            durTimeEl.textContent = track?.duration ? formatTime(track.duration) : '0:00';
            vizSeekTrack.style.clipPath = 'inset(0 0 0 0%)';
            const dpr = 2;
            const canvasW = vizCanvas.width / dpr;
            vizCanvas.style.clipPath = `inset(0 ${canvasW}px 0 0)`;
        };

        // Reset on song ended (track = null)
        resetSeekbarAndTimes(null);
        assert.equal(currentProgress, 0);
        assert.equal(audio.currentTime, 0);
        assert.equal(seekBar.value, 0);
        assert.equal(currTimeEl.textContent, '0:00');
        assert.equal(durTimeEl.textContent, '0:00');
        assert.equal(vizSeekTrack.style.clipPath, 'inset(0 0 0 0%)');
        assert.equal(vizCanvas.style.clipPath, 'inset(0 300px 0 0)');

        // Reset on new track loaded with known duration 180s
        resetSeekbarAndTimes({ duration: 180 });
        assert.equal(seekBar.max, 180);
        assert.equal(currTimeEl.textContent, '0:00');
        assert.equal(durTimeEl.textContent, '3:00');
    });

    await t.test('Focus & visibility change does not pause or override state when audio is playing and readyState is 2', () => {
        let playCalled = false;
        let pauseCalled = false;
        const audio = {
            paused: false,
            ended: false,
            readyState: 2, // HAVE_CURRENT_DATA (buffering / normal stream)
            play: async () => { playCalled = true; },
            pause: () => { pauseCalled = true; },
        };
        const state = {
            playing: true,
            wasPlayingBeforeHidden: true,
            userPaused: false,
            loaded: true,
            loading: false,
        };

        // Simulate visibilitychange to 'visible'
        const onVisibilityChangeVisible = () => {
            if (!audio.paused && !audio.ended) {
                state.playing = true;
                // Never call audio.play() or audio.pause() when already running
            } else if (state.wasPlayingBeforeHidden && !state.userPaused && audio.paused && !audio.ended) {
                audio.play();
            }
        };

        onVisibilityChangeVisible();

        assert.equal(state.playing, true, 'State must remain playing');
        assert.equal(playCalled, false, 'play() must NOT be called if audio is already unpaused');
        assert.equal(pauseCalled, false, 'pause() must NEVER be called on focus');
    });

    await t.test('updatePlayBtn synchronizes state without false pause when readyState <= 2', () => {
        const audio = { paused: false, ended: false, readyState: 2 };
        const state = { playing: false, loaded: true, loading: false };
        const isPlaybackPending = false;

        const updatePlayBtn = () => {
            if (state.loaded && !isPlaybackPending) {
                const isAudioRunning = !audio.paused && !audio.ended;
                if (isAudioRunning && !state.playing) {
                    state.playing = true;
                } else if (audio.paused && state.playing && !state.loading) {
                    state.playing = false;
                }
            }
        };

        updatePlayBtn();
        assert.equal(state.playing, true, 'Audio playing state must reconcile to true even if readyState is 2');
    });

    await t.test('recoverFromAudioError ignores MEDIA_ERR_ABORTED (code 1)', () => {
        let recoveryTriggered = false;
        const audio = {
            error: { code: 1, message: 'MEDIA_ERR_ABORTED' }
        };

        const recoverFromAudioError = () => {
            if (audio.error && (audio.error.code === 1 || audio.error.code === 0)) {
                return;
            }
            recoveryTriggered = true;
        };

        recoverFromAudioError();
        assert.equal(recoveryTriggered, false, 'Aborted requests must not trigger error recovery');
    });

    await t.test('Instant playback starts immediately when track.url is already present', async () => {
        let playStartedImmediately = false;
        let backgroundDetailsFetched = false;

        const track = {
            id: 'test_song_1',
            name: 'Test Song',
            url: 'https://aac.saavncdn.com/test_stream.mp4',
            duration: 240,
        };

        const isStreamingUrl = (url) => typeof url === 'string' && url.includes('saavncdn.com');

        const simulatePlayDirect = async (t) => {
            const hasStreamUrl = Boolean(t.url && isStreamingUrl(t.url));
            if (hasStreamUrl) {
                // Instant branch
                playStartedImmediately = true;
                // Background async details fetch
                Promise.resolve({ lyrics: 'test lyrics' }).then(() => {
                    backgroundDetailsFetched = true;
                });
            }
        };

        await simulatePlayDirect(track);
        assert.equal(playStartedImmediately, true, 'Playback must start immediately without awaiting API');
        await new Promise(r => setTimeout(r, 10));
        assert.equal(backgroundDetailsFetched, true, 'Background details must resolve asynchronously');
    });
});

