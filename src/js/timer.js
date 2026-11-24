        // ============================================
        // SLEEP TIMER ENGINE
        // ============================================
        const sleepTimer = {
            intervalId: null,
            targetEndTime: 0,
            durationMs: 0,
            mode: 'off', // 'duration' | 'end-of-track' | 'off'
            fadeDurationMs: 10000,
            originalVolume: 1,
            isFading: false,

            _applyVolume: (vol) => {
                const clamped = Math.max(0, Math.min(1, vol));
                if (typeof player !== 'undefined' && typeof player.setVolume === 'function') {
                    player.setVolume(clamped);
                } else if (typeof audio !== 'undefined' && audio) {
                    audio.volume = clamped;
                }
            },

            start: (minutesOrMode) => {
                sleepTimer.cancel();
                if (!minutesOrMode) return;

                if (minutesOrMode === 'end-of-track') {
                    sleepTimer.mode = 'end-of-track';
                    sleepTimer.updateUI();
                    if (ui.showToast) ui.showToast('Sleep timer set: Pauses after current track', 'info');
                    ui.toggleSleepTimerModal(false);
                    return;
                }

                const mins = parseInt(minutesOrMode);
                if (isNaN(mins) || mins <= 0) return;

                sleepTimer.mode = 'duration';
                sleepTimer.durationMs = mins * 60 * 1000;
                sleepTimer.targetEndTime = Date.now() + sleepTimer.durationMs;
                sleepTimer.originalVolume = (typeof audio !== 'undefined' && audio) ? (audio.volume || 1) : 1;
                sleepTimer.isFading = false;

                sleepTimer.intervalId = setInterval(sleepTimer.tick, 1000);
                sleepTimer.updateUI();
                if (ui.showToast) ui.showToast(`Sleep timer set for ${mins} minutes`, 'info');
                ui.toggleSleepTimerModal(false);
            },

            cancel: () => {
                if (sleepTimer.intervalId) clearInterval(sleepTimer.intervalId);
                if (sleepTimer.isFading) {
                    sleepTimer._applyVolume(sleepTimer.originalVolume);
                }
                sleepTimer.intervalId = null;
                sleepTimer.targetEndTime = 0;
                sleepTimer.durationMs = 0;
                sleepTimer.mode = 'off';
                sleepTimer.isFading = false;
                sleepTimer.updateUI();
            },

            extend: (extraMinutes) => {
                if (sleepTimer.mode !== 'duration' || !sleepTimer.targetEndTime) {
                    sleepTimer.start(extraMinutes);
                    return;
                }
                const extraMs = extraMinutes * 60 * 1000;
                sleepTimer.targetEndTime += extraMs;
                sleepTimer.durationMs += extraMs;
                if (sleepTimer.isFading) {
                    sleepTimer.isFading = false;
                    sleepTimer._applyVolume(sleepTimer.originalVolume);
                }
                sleepTimer.updateUI();
                if (ui.showToast) ui.showToast(`Sleep timer extended by ${extraMinutes} min`, 'info');
            },

            tick: () => {
                if (sleepTimer.mode !== 'duration') return;
                const now = Date.now();
                const remainingMs = Math.max(0, sleepTimer.targetEndTime - now);

                if (remainingMs <= 0) {
                    sleepTimer.finish();
                    return;
                }

                // 10-second volume fade-out before ending
                if (remainingMs <= sleepTimer.fadeDurationMs) {
                    sleepTimer.isFading = true;
                    const fraction = remainingMs / sleepTimer.fadeDurationMs;
                    sleepTimer._applyVolume(sleepTimer.originalVolume * fraction);
                }

                sleepTimer.updateUI(remainingMs);
            },

            finish: () => {
                sleepTimer.cancel();
                if (typeof player !== 'undefined' && player.pause) player.pause();
                sleepTimer._applyVolume(sleepTimer.originalVolume);
                if (ui.showToast) ui.showToast('Sleep timer finished: Playback paused', 'info');
            },

            onTrackEnded: () => {
                if (sleepTimer.mode === 'end-of-track') {
                    sleepTimer.cancel();
                    if (typeof player !== 'undefined' && player.pause) player.pause();
                    if (ui.showToast) ui.showToast('Sleep timer finished: End of track reached', 'info');
                    return true;
                }
                return false;
            },

            updateUI: (remainingMs = null) => {
                const badge = document.getElementById('sleep-timer-badge');
                const badgeText = document.getElementById('sleep-timer-badge-text');
                const statusBox = document.getElementById('sleep-timer-status-box');
                const statusText = document.getElementById('sleep-timer-status-text');

                if (sleepTimer.mode === 'off') {
                    if (badge) { badge.classList.add('hidden'); badge.classList.remove('flex'); }
                    if (statusBox) statusBox.classList.add('hidden');
                    return;
                }

                let label = '';
                if (sleepTimer.mode === 'end-of-track') {
                    label = 'End of song';
                } else {
                    const ms = remainingMs !== null ? remainingMs : Math.max(0, sleepTimer.targetEndTime - Date.now());
                    const totalSec = Math.ceil(ms / 1000);
                    const m = Math.floor(totalSec / 60);
                    const s = totalSec % 60;
                    label = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
                }

                if (badge) {
                    badge.classList.remove('hidden');
                    badge.classList.add('flex');
                    if (badgeText) badgeText.textContent = label;
                }
                if (statusBox) {
                    statusBox.classList.remove('hidden');
                    if (statusText) statusText.textContent = `${label} remaining`;
                }
            }
        };
        window.sleepTimer = sleepTimer;

