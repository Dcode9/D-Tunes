const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestEnvironment } = require('./testHarness');

// Reference Gesture Manager and Toast System Controller
function createGestureManager(env, playerMock, options = {}) {
    const threshold = options.threshold || 50;
    const miniPlayerThreshold = options.miniPlayerThreshold || 40;
    let activeToast = null;
    const toastLog = [];

    const handleSongSwipe = (song, deltaX, deltaY = 0) => {
        // Vertical scroll lock check: if vertical movement exceeds horizontal, ignore horizontal swipe
        if (Math.abs(deltaY) > Math.abs(deltaX)) {
            return { action: 'scroll', committed: false, translateX: 0 };
        }

        if (deltaX > threshold) {
            // Swipe Right -> Play Next (Green pill)
            if (env.navigator && typeof env.navigator.vibrate === 'function') {
                env.navigator.vibrate(15);
            }
            if (playerMock && typeof playerMock.addSongNext === 'function') {
                playerMock.addSongNext(song);
            }
            showToast(`Playing "${song.name || song.title}" next`, 'success');
            return {
                action: 'play-next',
                pillColor: 'green',
                committed: true,
                badge: '✓ Added Next'
            };
        } else if (deltaX < -threshold) {
            // Swipe Left -> Add to Queue (Cyan pill)
            if (env.navigator && typeof env.navigator.vibrate === 'function') {
                env.navigator.vibrate(15);
            }
            if (playerMock && typeof playerMock.addSongToQueue === 'function') {
                playerMock.addSongToQueue(song);
            }
            showToast(`Added "${song.name || song.title}" to queue`, 'info');
            return {
                action: 'add-queue',
                pillColor: 'cyan',
                committed: true,
                badge: '✓ Queued'
            };
        } else {
            // Cancel / Rubber-band spring back
            return {
                action: 'cancel',
                committed: false,
                translateX: 0
            };
        }
    };

    const handleMiniPlayerSwipe = (deltaX) => {
        if (deltaX < -miniPlayerThreshold) {
            if (playerMock && typeof playerMock.next === 'function') {
                playerMock.next();
            }
            return { action: 'next', committed: true };
        } else if (deltaX > miniPlayerThreshold) {
            if (playerMock && typeof playerMock.prev === 'function') {
                playerMock.prev();
            }
            return { action: 'prev', committed: true };
        }
        return { action: 'none', committed: false };
    };

    const showToast = (message, type = 'info', duration = 3000) => {
        const toast = { message, type, duration, timestamp: Date.now(), active: true };
        activeToast = toast;
        toastLog.push(toast);

        const toastEl = env.document.getElementById('toast-notification') || env.document.createElement('div');
        toastEl.id = 'toast-notification';
        toastEl.className = `toast-bottom toast-${type} visible`;
        toastEl.textContent = message;

        return toast;
    };

    return {
        handleSongSwipe,
        handleMiniPlayerSwipe,
        showToast,
        getActiveToast: () => activeToast,
        getToastLog: () => toastLog
    };
}

test('R6: Touch Gestures & Toast Notifications Suite', async (t) => {

    // --- TIER 1: FEATURE COVERAGE (R6) ---

    await t.test('Tier 1 - R6-F1: Swipe Right (>50px) triggers Play Next with green pill and commits', () => {
        const env = createTestEnvironment();
        let addedNext = null;
        const playerMock = { addSongNext: (s) => { addedNext = s; } };
        const gestures = createGestureManager(env, playerMock);

        const song = { id: 's1', name: 'Song One' };
        const res = gestures.handleSongSwipe(song, 65);

        assert.equal(res.action, 'play-next');
        assert.equal(res.pillColor, 'green');
        assert.equal(res.committed, true);
        assert.equal(addedNext.id, 's1');
        assert.ok(env.vibrations.length > 0, 'Haptic feedback must be triggered');
    });

    await t.test('Tier 1 - R6-F2: Swipe Left (>50px) triggers Add to Queue with cyan pill and commits', () => {
        const env = createTestEnvironment();
        let addedQueue = null;
        const playerMock = { addSongToQueue: (s) => { addedQueue = s; } };
        const gestures = createGestureManager(env, playerMock);

        const song = { id: 's2', name: 'Song Two' };
        const res = gestures.handleSongSwipe(song, -70);

        assert.equal(res.action, 'add-queue');
        assert.equal(res.pillColor, 'cyan');
        assert.equal(res.committed, true);
        assert.equal(addedQueue.id, 's2');
        assert.ok(env.vibrations.length > 0, 'Haptic feedback must be triggered');
    });

    await t.test('Tier 1 - R6-F3: Swipe Cancel (<50px) springs back to 0px without queue mutation', () => {
        const env = createTestEnvironment();
        let modified = false;
        const playerMock = {
            addSongNext: () => { modified = true; },
            addSongToQueue: () => { modified = true; }
        };
        const gestures = createGestureManager(env, playerMock);

        const resRight = gestures.handleSongSwipe({ id: 's3' }, 35);
        assert.equal(resRight.committed, false);
        assert.equal(resRight.translateX, 0);

        const resLeft = gestures.handleSongSwipe({ id: 's3' }, -25);
        assert.equal(resLeft.committed, false);
        assert.equal(resLeft.translateX, 0);

        assert.equal(modified, false);
    });

    await t.test('Tier 1 - R6-F4: Mini-player horizontal swipe skips to next / previous track', () => {
        const env = createTestEnvironment();
        let nextCalled = false;
        let prevCalled = false;
        const playerMock = {
            next: () => { nextCalled = true; },
            prev: () => { prevCalled = true; }
        };
        const gestures = createGestureManager(env, playerMock);

        // Swipe Left on mini-player -> skip next
        const resNext = gestures.handleMiniPlayerSwipe(-55);
        assert.equal(resNext.action, 'next');
        assert.equal(nextCalled, true);

        // Swipe Right on mini-player -> skip prev
        const resPrev = gestures.handleMiniPlayerSwipe(55);
        assert.equal(resPrev.action, 'prev');
        assert.equal(prevCalled, true);
    });

    await t.test('Tier 1 - R6-F5: Toast notification manager creates glassmorphic bottom toast', () => {
        const env = createTestEnvironment();
        const gestures = createGestureManager(env, null);

        const toast = gestures.showToast('Song added to playlist', 'success');
        assert.equal(toast.message, 'Song added to playlist');
        assert.equal(toast.type, 'success');

        const toastEl = env.document.getElementById('toast-notification');
        assert.ok(toastEl.className.includes('toast-bottom'));
        assert.ok(toastEl.className.includes('toast-success'));
        assert.equal(toastEl.textContent, 'Song added to playlist');
    });

    // --- TIER 2: BOUNDARY & CORNER CASES ---

    await t.test('Tier 2 - R6-B1: Vertical scroll dominance prevents accidental horizontal swipe triggers', () => {
        const env = createTestEnvironment();
        let queueModified = false;
        const playerMock = { addSongNext: () => { queueModified = true; } };
        const gestures = createGestureManager(env, playerMock);

        // User moves 60px right, but 100px down (vertical scrolling intent)
        const res = gestures.handleSongSwipe({ id: 's1' }, 60, 100);
        assert.equal(res.action, 'scroll');
        assert.equal(res.committed, false);
        assert.equal(queueModified, false);
    });

    await t.test('Tier 2 - R6-B2: Execution when navigator.vibrate is unsupported does not throw', () => {
        const env = createTestEnvironment();
        env.navigator.vibrate = undefined; // Unsupported browser API
        const playerMock = { addSongNext: () => {} };
        const gestures = createGestureManager(env, playerMock);

        let error = null;
        try {
            gestures.handleSongSwipe({ id: 's1' }, 80);
        } catch (e) {
            error = e;
        }
        assert.equal(error, null, 'Must not throw when vibrate is missing');
    });

    await t.test('Tier 2 - R6-B3: Consecutive rapid toasts update message without DOM corruption', () => {
        const env = createTestEnvironment();
        const gestures = createGestureManager(env, null);

        for (let i = 0; i < 20; i++) {
            gestures.showToast(`Toast message #${i}`, 'info');
        }

        assert.equal(gestures.getToastLog().length, 20);
        assert.equal(gestures.getActiveToast().message, 'Toast message #19');
    });

    // --- TIER 3: CROSS-FEATURE COMBINATIONS ---

    await t.test('Tier 3 - R6-C1: Swiping song adds to queue and triggers feedback toast seamlessly', () => {
        const env = createTestEnvironment();
        const queue = [];
        const playerMock = {
            addSongToQueue: (s) => queue.push(s)
        };
        const gestures = createGestureManager(env, playerMock);

        const song = { id: 'track_test', name: 'Test Track' };
        const res = gestures.handleSongSwipe(song, -80);

        assert.equal(res.committed, true);
        assert.equal(queue.length, 1);
        assert.equal(queue[0].id, 'track_test');
        assert.ok(gestures.getActiveToast().message.includes('Test Track'));
    });

    // --- TIER 4: REAL-WORLD WORKLOAD ---

    await t.test('Tier 4 - R6-W1: Real-world touch gesture interaction session', () => {
        const env = createTestEnvironment();
        const state = { queue: [], playingIndex: 0, tracks: ['Song 1', 'Song 2', 'Song 3'] };
        const playerMock = {
            addSongNext: (s) => state.queue.unshift(s),
            addSongToQueue: (s) => state.queue.push(s),
            next: () => { state.playingIndex++; },
            prev: () => { state.playingIndex = Math.max(0, state.playingIndex - 1); }
        };
        const gestures = createGestureManager(env, playerMock);

        // 1. User swipes Song 1 Right (Play Next)
        gestures.handleSongSwipe({ id: 's1', name: 'Song 1' }, 70);
        assert.equal(state.queue[0].id, 's1');

        // 2. User swipes Song 2 Left (Add Queue)
        gestures.handleSongSwipe({ id: 's2', name: 'Song 2' }, -75);
        assert.equal(state.queue[1].id, 's2');

        // 3. User attempts swipe on Song 3 but cancels
        gestures.handleSongSwipe({ id: 's3', name: 'Song 3' }, 20);
        assert.equal(state.queue.length, 2);

        // 4. User swipes mini-player left to skip track
        gestures.handleMiniPlayerSwipe(-60);
        assert.equal(state.playingIndex, 1);
    });

});
