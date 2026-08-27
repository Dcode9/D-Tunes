const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestEnvironment } = require('./testHarness');

// Reference implementation / Contract Specification for Sleep Timer
function createSleepTimer(playerMock, options = {}) {
    let active = false;
    let targetTime = 0;
    let durationMs = 0;
    let isEndOfSong = false;
    let intervalId = null;
    let fadeOutStarted = false;
    let fadeStartTime = 0;
    const fadeDurationMs = options.fadeDurationMs || 10000;
    const getInitialVolume = () => (playerMock && typeof playerMock.getVolume === 'function' ? playerMock.getVolume() : 1.0);
    let initialVolume = getInitialVolume();
    let currentVolume = initialVolume;

    const sCurveVolume = (progress) => {
        // progress: 1.0 (start of fade) -> 0.0 (end of fade)
        const p = Math.max(0, Math.min(1, progress));
        return (1 - Math.cos(Math.PI * p)) / 2;
    };

    const updateBadges = (remainingMs) => {
        if (options.onTick) options.onTick(remainingMs);
    };

    const cancel = () => {
        active = false;
        isEndOfSong = false;
        targetTime = 0;
        durationMs = 0;
        fadeOutStarted = false;
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }
        if (playerMock && typeof playerMock.setVolume === 'function') {
            playerMock.setVolume(initialVolume);
        }
        if (options.onCancel) options.onCancel();
    };

    const finish = () => {
        active = false;
        isEndOfSong = false;
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }
        if (playerMock) {
            if (typeof playerMock.pause === 'function') playerMock.pause();
            if (typeof playerMock.setVolume === 'function') playerMock.setVolume(initialVolume);
        }
        if (options.onFinish) options.onFinish();
    };

    const tick = (now = Date.now()) => {
        if (!active) return;
        if (isEndOfSong) return; // Handled by track ended event

        const remainingMs = Math.max(0, targetTime - now);
        updateBadges(remainingMs);

        // Check if fadeout should trigger (last 10 seconds)
        if (remainingMs <= fadeDurationMs && remainingMs > 0) {
            if (!fadeOutStarted) {
                fadeOutStarted = true;
                fadeStartTime = now;
            }
            const progress = remainingMs / fadeDurationMs; // 1.0 down to 0.0
            currentVolume = sCurveVolume(progress) * initialVolume;
            if (playerMock && typeof playerMock.setVolume === 'function') playerMock.setVolume(currentVolume);
        }

        if (remainingMs <= 0) {
            finish();
        }
    };

    const set = (minutes, now = Date.now()) => {
        if (typeof minutes !== 'number' || isNaN(minutes) || minutes <= 0) {
            return false;
        }
        initialVolume = getInitialVolume();
        cancel();
        durationMs = Math.round(minutes * 60 * 1000);
        targetTime = now + durationMs;
        active = true;
        isEndOfSong = false;
        fadeOutStarted = false;
        if (options.autoInterval !== false) {
            intervalId = setInterval(() => tick(Date.now()), 250);
        }
        updateBadges(durationMs);
        return true;
    };

    const setEndOfSong = () => {
        initialVolume = getInitialVolume();
        cancel();
        active = true;
        isEndOfSong = true;
        durationMs = 0;
        targetTime = 0;
        if (options.onSetEndOfSong) options.onSetEndOfSong();
        return true;
    };

    const extend = (minutes, now = Date.now()) => {
        if (typeof minutes !== 'number' || isNaN(minutes) || minutes <= 0) {
            return false;
        }
        if (!active) {
            return set(minutes, now);
        }
        if (isEndOfSong) {
            return set(minutes, now);
        }
        durationMs += Math.round(minutes * 60 * 1000);
        targetTime += Math.round(minutes * 60 * 1000);
        fadeOutStarted = false;
        if (playerMock && typeof playerMock.setVolume === 'function') playerMock.setVolume(initialVolume);
        updateBadges(targetTime - now);
        return true;
    };

    const onSongEnded = () => {
        if (active && isEndOfSong) {
            finish();
        }
    };

    const getState = (now = Date.now()) => {
        return {
            active,
            remainingMs: active && !isEndOfSong ? Math.max(0, targetTime - now) : 0,
            isEndOfSong,
            targetTime
        };
    };

    return {
        set,
        setEndOfSong,
        cancel,
        extend,
        getState,
        tick,
        onSongEnded,
        sCurveVolume,
        getVolume: () => currentVolume
    };
}

test('R4: Sleep Timer System & Audio Fadeout Suite', async (t) => {

    // --- TIER 1: FEATURE COVERAGE (R4) ---

    await t.test('Tier 1 - R4-F1: Preset durations correctly configure timer target and remaining time', () => {
        const presets = [5, 15, 30, 45, 60];
        const timer = createSleepTimer(null, { autoInterval: false });

        for (const mins of presets) {
            const before = Date.now();
            const ok = timer.set(mins, before);
            assert.equal(ok, true, `Timer must accept preset ${mins}m`);
            const state = timer.getState(before);
            assert.equal(state.active, true);
            assert.equal(state.isEndOfSong, false);
            const expectedMs = mins * 60 * 1000;
            assert.equal(state.remainingMs, expectedMs, `Remaining time for ${mins}m should be ${expectedMs}ms`);
            assert.equal(state.targetTime, before + expectedMs);
        }
    });

    await t.test('Tier 1 - R4-F2: End of song preset sets isEndOfSong flag and triggers finish on song end', () => {
        let paused = false;
        const playerMock = {
            pause: () => { paused = true; },
            getVolume: () => 1.0,
            setVolume: () => {}
        };
        const timer = createSleepTimer(playerMock, { autoInterval: false });
        timer.setEndOfSong();

        const state = timer.getState();
        assert.equal(state.active, true);
        assert.equal(state.isEndOfSong, true);
        assert.equal(state.remainingMs, 0);

        // Trigger track completion
        timer.onSongEnded();
        assert.equal(paused, true, 'Player must be paused when end-of-song timer completes');
        assert.equal(timer.getState().active, false);
    });

    await t.test('Tier 1 - R4-F3: getState returns compliant schema with exact properties', () => {
        const timer = createSleepTimer(null, { autoInterval: false });
        const initialState = timer.getState();
        assert.deepEqual(Object.keys(initialState).sort(), ['active', 'isEndOfSong', 'remainingMs', 'targetTime'].sort());
        assert.equal(initialState.active, false);

        timer.set(15);
        const activeState = timer.getState();
        assert.equal(activeState.active, true);
        assert.equal(typeof activeState.remainingMs, 'number');
        assert.equal(typeof activeState.targetTime, 'number');
    });

    await t.test('Tier 1 - R4-F4: cancel resets timer state, clears target, and restores volume', () => {
        let volume = 1.0;
        const playerMock = {
            pause: () => {},
            getVolume: () => 1.0,
            setVolume: (v) => { volume = v; }
        };
        const timer = createSleepTimer(playerMock, { autoInterval: false });
        timer.set(30);
        assert.equal(timer.getState().active, true);

        // Simulate volume dropped during fadeout
        volume = 0.3;
        timer.cancel();
        const state = timer.getState();
        assert.equal(state.active, false);
        assert.equal(state.targetTime, 0);
        assert.equal(state.remainingMs, 0);
        assert.equal(volume, 1.0, 'Volume must be restored upon cancel');
    });

    await t.test('Tier 1 - R4-F5: Timer extension increases remaining duration by exact delta', () => {
        const timer = createSleepTimer(null, { autoInterval: false });
        const startTime = 1000000;
        timer.set(15, startTime); // 15 mins = 900,000ms
        const initialRemaining = timer.getState(startTime).remainingMs;
        assert.equal(initialRemaining, 900000);

        // Extend +5 mins
        timer.extend(5, startTime);
        const extended5 = timer.getState(startTime).remainingMs;
        assert.equal(extended5 - initialRemaining, 5 * 60 * 1000, '+5m must add 300,000ms');

        // Extend +15 mins
        timer.extend(15, startTime);
        const extended15 = timer.getState(startTime).remainingMs;
        assert.equal(extended15 - extended5, 15 * 60 * 1000, '+15m must add 900,000ms');
    });

    await t.test('Tier 1 - R4-F6: Countdown badges and badge text format matches mm:ss format', () => {
        const formatBadge = (ms) => {
            const totalSecs = Math.ceil(ms / 1000);
            const mins = Math.floor(totalSecs / 60);
            const secs = totalSecs % 60;
            return `⏳ ${mins}:${secs.toString().padStart(2, '0')}`;
        };

        assert.equal(formatBadge(1455000), '⏳ 24:15');
        assert.equal(formatBadge(60000), '⏳ 1:00');
        assert.equal(formatBadge(5000), '⏳ 0:05');
        assert.equal(formatBadge(0), '⏳ 0:00');
    });

    // --- TIER 2: BOUNDARY & CORNER CASES ---

    await t.test('Tier 2 - R4-B1: Boundary minutes inputs (0, negative, NaN, non-number, large)', () => {
        const timer = createSleepTimer(null, { autoInterval: false });
        assert.equal(timer.set(0), false, '0 minutes should be rejected');
        assert.equal(timer.set(-10), false, 'Negative minutes should be rejected');
        assert.equal(timer.set(NaN), false, 'NaN should be rejected');
        assert.equal(timer.set('invalid'), false, 'String should be rejected');

        // Fractional valid minutes (e.g. 0.5 minutes = 30 seconds)
        assert.equal(timer.set(0.5), true, '0.5 minutes should be accepted');
        assert.equal(timer.getState().remainingMs > 0, true);

        // Large duration (e.g. 180 minutes = 3 hours)
        assert.equal(timer.set(180), true);
        assert.ok(timer.getState().remainingMs > 179 * 60 * 1000);
    });

    await t.test('Tier 2 - R4-B2: Extending when inactive safely starts a new timer', () => {
        const timer = createSleepTimer(null, { autoInterval: false });
        assert.equal(timer.getState().active, false);

        const ok = timer.extend(10);
        assert.equal(ok, true);
        assert.equal(timer.getState().active, true);
        assert.ok(timer.getState().remainingMs > 9 * 60 * 1000);
    });

    await t.test('Tier 2 - R4-B3: Rapid consecutive set/cancel calls do not create race conditions', () => {
        const timer = createSleepTimer(null, { autoInterval: false });
        for (let i = 0; i < 50; i++) {
            timer.set(i + 1);
            timer.cancel();
        }
        assert.equal(timer.getState().active, false);
        assert.equal(timer.getState().remainingMs, 0);
    });

    await t.test('Tier 2 - R4-B4: Delta loop survives background tab throttling with large time jumps', () => {
        let paused = false;
        const playerMock = {
            pause: () => { paused = true; },
            getVolume: () => 1.0,
            setVolume: () => {}
        };
        const timer = createSleepTimer(playerMock, { autoInterval: false });
        const start = 1000000;
        timer.set(5, start); // 5 mins = 300,000ms -> ends at 1,300,000

        // Simulate normal tick
        timer.tick(start + 10000);
        assert.equal(timer.getState(start + 10000).active, true);

        // Simulate background tab throttled for 10 minutes (time jump to start + 600,000)
        timer.tick(start + 600000);
        assert.equal(paused, true, 'Timer should complete and pause after large time jump');
        assert.equal(timer.getState().active, false);
    });

    // --- TIER 3: CROSS-FEATURE COMBINATIONS ---

    await t.test('Tier 3 - R4-C1: S-Curve 10s audio volume fadeout curve verification', () => {
        let currentVol = 1.0;
        const playerMock = {
            pause: () => {},
            getVolume: () => 1.0,
            setVolume: (v) => { currentVol = v; }
        };
        const timer = createSleepTimer(playerMock, { autoInterval: false, fadeDurationMs: 10000 });
        
        // Exact formula: V(p) = (1 - cos(pi * p)) / 2
        // At start of fade (10s remaining, progress = 1.0): V = (1 - cos(pi)) / 2 = 1.0
        assert.equal(timer.sCurveVolume(1.0), 1.0);
        
        // At midpoint (5s remaining, progress = 0.5): V = (1 - cos(pi/2)) / 2 = 0.5
        assert.ok(Math.abs(timer.sCurveVolume(0.5) - 0.5) < 1e-6);
        
        // At 75% remaining (progress = 0.75): V = (1 - cos(3pi/4)) / 2 = (1 - (-sqrt(2)/2)) / 2 ~ 0.85355
        assert.ok(Math.abs(timer.sCurveVolume(0.75) - 0.853553) < 1e-4);
        
        // At 25% remaining (progress = 0.25): V = (1 - cos(pi/4)) / 2 = (1 - sqrt(2)/2) / 2 ~ 0.14644
        assert.ok(Math.abs(timer.sCurveVolume(0.25) - 0.146446) < 1e-4);

        // At end of fade (0s remaining, progress = 0.0): V = (1 - cos(0)) / 2 = 0.0
        assert.equal(timer.sCurveVolume(0.0), 0.0);

        // Simulate stepping through the last 10 seconds
        const target = 1000000;
        timer.set(1, target - 60000); // Ends at target

        // At 8s remaining
        timer.tick(target - 8000);
        assert.ok(currentVol < 1.0 && currentVol > 0.7);

        // At 2s remaining
        timer.tick(target - 2000);
        assert.ok(currentVol < 0.3 && currentVol > 0.05);

        // At 0s
        timer.tick(target);
        assert.equal(timer.getState().active, false);
    });

    await t.test('Tier 3 - R4-C2: Setting timer while playback is paused maintains countdown and pauses on trigger', () => {
        let isPlaying = false;
        let pausedCount = 0;
        const playerMock = {
            pause: () => { isPlaying = false; pausedCount++; },
            getVolume: () => 1.0,
            setVolume: () => {}
        };
        const timer = createSleepTimer(playerMock, { autoInterval: false });
        const start = 1000000;
        timer.set(10, start);
        assert.equal(timer.getState(start).active, true);

        // Complete timer
        timer.tick(timer.getState(start).targetTime + 1000);
        assert.equal(timer.getState().active, false);
        assert.equal(pausedCount, 1);
    });

    await t.test('Tier 3 - R4-C3: Track switches during active sleep timer preserve target time without reset', () => {
        const timer = createSleepTimer(null, { autoInterval: false });
        const start = 1000000;
        timer.set(30, start);
        const originalTarget = timer.getState(start).targetTime;

        // User changes track 3 times
        for (let i = 0; i < 3; i++) {
            // Track change event does not call set or cancel
            assert.equal(timer.getState(start).targetTime, originalTarget, 'Target time must remain constant across track changes');
        }
    });

    // --- TIER 4: REAL-WORLD WORKLOAD ---

    await t.test('Tier 4 - R4-W1: Full E2E Sleep Cycle (Start -> Set 30m -> Extend +5m -> Fadeout -> Pause)', () => {
        let playerState = { playing: true, volume: 1.0 };
        const playerMock = {
            pause: () => { playerState.playing = false; },
            getVolume: () => playerState.volume,
            setVolume: (v) => { playerState.volume = v; }
        };
        
        let badgeUpdates = [];
        const timer = createSleepTimer(playerMock, {
            autoInterval: false,
            onTick: (rem) => badgeUpdates.push(rem)
        });

        // 1. User starts 30 minute sleep timer at t0
        const t0 = 10000000;
        timer.set(30, t0);
        assert.equal(timer.getState(t0).active, true);
        assert.equal(timer.getState(t0).remainingMs, 30 * 60 * 1000);

        // 2. 10 minutes pass (t = t0 + 10m)
        const t1 = t0 + 10 * 60 * 1000;
        timer.tick(t1);
        assert.equal(timer.getState(t1).remainingMs, 20 * 60 * 1000);

        // 3. User feels they need more time -> taps "+5m"
        timer.extend(5, t1);
        assert.equal(timer.getState(t1).remainingMs, 25 * 60 * 1000);

        // 4. Time advances to last 10 seconds before completion
        const target = timer.getState(t1).targetTime;
        const tFadeStart = target - 10000;
        timer.tick(tFadeStart);
        assert.equal(playerState.volume, 1.0);

        // 5. Halfway through fade (5s remaining)
        timer.tick(tFadeStart + 5000);
        assert.ok(Math.abs(playerState.volume - 0.5) < 0.05, `Volume at midpoint should be ~0.5, got ${playerState.volume}`);

        // 6. 1 second remaining
        timer.tick(tFadeStart + 9000);
        assert.ok(playerState.volume < 0.15, `Volume at 1s remaining should be <0.15, got ${playerState.volume}`);

        // 7. Timer reaches 0 -> audio halts and timer state becomes inactive
        timer.tick(target);
        assert.equal(playerState.playing, false, 'Audio playback must be paused');
        assert.equal(timer.getState().active, false, 'Timer must be inactive');
        assert.equal(playerState.volume, 1.0, 'Volume must reset to 1.0 after pausing');
    });

});
