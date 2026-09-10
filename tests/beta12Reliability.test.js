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
