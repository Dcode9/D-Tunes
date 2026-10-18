        // ============================================
        // DESKTOP BRIDGE (Windows / Electron shell)
        // ============================================
        // The Windows app loads this exact page inside an Electron shell that
        // exposes window.electronAPI. In a normal browser that object is absent,
        // so everything below is a no-op and the web app is unchanged.
        //
        // Responsibilities:
        //   * drive the Windows master volume from the in-app slider
        //   * feed playback state to the taskbar (progress bar + thumbnail buttons)
        //   * expose media handlers so the native thumbnail toolbar and media keys
        //     can control playback
        (function () {
            'use strict';

            const api = (typeof window !== 'undefined') ? window.electronAPI : null;
            if (!api || typeof api !== 'object') return;

            const audioEl = () => document.getElementById('audio-el');
            const getState = () => window.state || null;
            const getPlayer = () => window.player || null;

            // ----------------------------------------------------------------
            // System volume: the in-app slider controls the Windows master volume
            // ----------------------------------------------------------------
            let systemVolume = typeof api.setSystemVolume === 'function';
            let pushTimer = null;

            function pushSystemVolume(value) {
                if (!systemVolume || typeof api.setSystemVolume !== 'function') return;
                if (pushTimer) clearTimeout(pushTimer);
                pushTimer = setTimeout(() => {
                    pushTimer = null;
                    try { api.setSystemVolume(value); } catch (_) {}
                }, 40);
            }

            function applyVolume(raw) {
                const value = Math.max(0, Math.min(1, Number(raw)));
                if (!Number.isFinite(value)) return;
                window.dtunesVolume = value;

                const slider = document.getElementById('volume-slider');
                if (slider && Math.abs(Number(slider.value) - value) > 0.001) slider.value = value;

                const el = audioEl();
                if (systemVolume) {
                    // One authority only: the OS master volume. Keep the element at unity
                    // so the two controls never multiply into double attenuation.
                    if (el) el.volume = 1;
                    pushSystemVolume(value);
                } else if (el) {
                    el.volume = value;
                }
            }

            function wrapSetVolume() {
                const p = getPlayer();
                if (!p || typeof p.setVolume !== 'function' || p.__dtunesVolumeWrapped) return;
                const original = p.setVolume.bind(p);
                p.setVolume = function (value) {
                    if (!systemVolume) return original(value);
                    applyVolume(value);
                };
                p.__dtunesVolumeWrapped = true;
            }

            // ----------------------------------------------------------------
            // Media state -> taskbar progress bar + thumbnail toolbar
            // ----------------------------------------------------------------
            let lastKey = '';

            function snapshot() {
                const el = audioEl();
                const s = getState();
                return {
                    playing: Boolean(s && s.playing) && !(el && el.paused),
                    position: (el && Number.isFinite(el.currentTime)) ? el.currentTime : 0,
                    duration: (el && Number.isFinite(el.duration)) ? el.duration : 0,
                    hasTrack: Boolean(s && s.currentTrack),
                    shuffle: Boolean(s && s.shuffle),
                    repeat: (s && Number(s.repeat)) || 0
                };
            }

            function sendMediaState() {
                if (typeof api.sendMediaState !== 'function') return;
                const mediaState = snapshot();
                const key = [
                    mediaState.playing,
                    mediaState.hasTrack,
                    mediaState.shuffle,
                    mediaState.repeat,
                    Math.round(mediaState.position),
                    Math.round(mediaState.duration)
                ].join('|');
                if (key === lastKey) return;
                lastKey = key;
                try { api.sendMediaState(mediaState); } catch (_) {}
            }

            function wrapToggle(name) {
                const p = getPlayer();
                const flag = `__dtunes${name}Wrapped`;
                if (!p || typeof p[name] !== 'function' || p[flag]) return;
                const original = p[name].bind(p);
                p[name] = function () {
                    const result = original.apply(this, arguments);
                    lastKey = '';
                    sendMediaState();
                    return result;
                };
                p[flag] = true;
            }

            // The native thumbnail toolbar buttons and global media keys look for
            // window.__dtunesMediaHandlers first.
            window.__dtunesMediaHandlers = {
                playpause: () => { const p = getPlayer(); if (p && p.togglePlay) p.togglePlay(); },
                play: () => { const el = audioEl(); const p = getPlayer(); if (el && el.paused && p && p.togglePlay) p.togglePlay(); },
                pause: () => { const el = audioEl(); const p = getPlayer(); if (el && !el.paused && p && p.togglePlay) p.togglePlay(); },
                stop: () => { const el = audioEl(); if (el) { try { el.pause(); el.currentTime = 0; } catch (_) {} } },
                nexttrack: () => { const p = getPlayer(); if (p && p.next) p.next(); },
                previoustrack: () => { const p = getPlayer(); if (p && p.prev) p.prev(); }
            };

            // ----------------------------------------------------------------
            // Boot
            // ----------------------------------------------------------------
            async function initSystemVolume(fallbackVolume) {
                if (typeof api.getSystemVolume !== 'function') { systemVolume = false; applyVolume(fallbackVolume); return; }
                try {
                    const value = await api.getSystemVolume();
                    if (typeof value === 'number' && value >= 0 && value <= 1) {
                        applyVolume(value);
                    } else {
                        systemVolume = false;
                        applyVolume(fallbackVolume);
                    }
                } catch (_) {
                    systemVolume = false;
                    applyVolume(fallbackVolume);
                }
            }

            function boot() {
                wrapSetVolume();
                wrapToggle('toggleShuffle');
                wrapToggle('toggleRepeat');

                const el = audioEl();
                const fallbackVolume = el ? el.volume : 0.8;
                if (el) {
                    ['play', 'pause', 'ended', 'timeupdate', 'loadedmetadata', 'durationchange', 'seeked', 'ratechange']
                        .forEach((event) => el.addEventListener(event, sendMediaState, { passive: true }));
                }
                document.addEventListener('visibilitychange', sendMediaState);
                setInterval(sendMediaState, 1000);

                initSystemVolume(fallbackVolume).then(sendMediaState);
                sendMediaState();
            }

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', boot, { once: true });
            } else {
                boot();
            }
        })();
