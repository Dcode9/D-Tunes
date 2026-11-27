        // ============================================
        // PLAYER LOGIC & MEDIA SESSION
        // ============================================
        const audio = document.getElementById('audio-el');
        const isMobileDevice = /Mobi|Android|iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        const applyAudioCorsPolicy = (el) => {
            if (!el) return;
            if (!isMobileDevice) {
                el.crossOrigin = 'anonymous';
                el.setAttribute('crossorigin', 'anonymous');
            } else {
                el.removeAttribute('crossorigin');
            }
        };
        applyAudioCorsPolicy(audio);
        audio.setAttribute('playsinline', '');
        audio.setAttribute('webkit-playsinline', '');
        audio.preload = 'auto';
        const preloadAudio = isMobileDevice ? null : new Audio();
        if (preloadAudio) {
            applyAudioCorsPolicy(preloadAudio);
            preloadAudio.preload = 'auto';
        }
        let isPlaybackPending = false;
        let isAudioRecoveryPending = false;
        let playRequestId = 0;

        // Pure native <audio> playback engine (supports iOS background playback, MediaSession & desktop SMTC)
        let _streamStartupTimer = null;
        let _consecutiveStreamFailures = 0;

        if (typeof window !== 'undefined') {
            window._dtunesActiveEngine = 'audio';
            window.getActivePlaybackClock = () => {
                const cur = Number(audio?.currentTime || 0);
                const audioDur = Number(audio?.duration || 0);
                const dur = (Number.isFinite(audioDur) && audioDur > 0)
                    ? audioDur
                    : Number(state.currentTrack?.duration || state.currentTrack?.duration_seconds || 0);
                return { currentTime: Number.isFinite(cur) ? cur : 0, duration: Number.isFinite(dur) ? dur : 0, engine: 'audio' };
            };
        }


        const generateShuffledQueue = () => {
            if (!state.queue || state.queue.length <= 1) {
                state.shuffledOrder = (state.queue || []).map((_, i) => i);
                state.shufflePointer = 0;
                return;
            }
            const currentIdx = state.idx >= 0 && state.idx < state.queue.length ? state.idx : 0;
            const remaining = state.queue.map((_, i) => i).filter(i => i !== currentIdx);
            // Deterministic Fisher-Yates shuffle of remaining queue tracks
            for (let i = remaining.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                const temp = remaining[i];
                remaining[i] = remaining[j];
                remaining[j] = temp;
            }
            state.shuffledOrder = [currentIdx, ...remaining];
            state.shufflePointer = 0;
        };

        const getUpcomingTrack = () => {
            if (state.userQueue.length > 0) return state.userQueue[0];
            if (!state.queue || state.queue.length === 0) return null;
            if (state.shuffle) {
                if (!state.shuffledOrder || state.shuffledOrder.length !== state.queue.length) {
                    generateShuffledQueue();
                }
                const nextShuffleIdx = state.shuffledOrder[state.shufflePointer + 1];
                if (nextShuffleIdx !== undefined && state.queue[nextShuffleIdx]) {
                    return state.queue[nextShuffleIdx];
                }
                return state.repeat === 1 && state.shuffledOrder.length > 0 ? state.queue[state.shuffledOrder[0]] : null;
            }
            return state.idx >= 0 && state.idx < state.queue.length - 1 ? state.queue[state.idx + 1] : null;
        };

        const getPreviousTrack = () => {
            if (state.queue && state.queue.length > 0) {
                if (state.shuffle) {
                    if (!state.shuffledOrder || state.shuffledOrder.length !== state.queue.length) {
                        generateShuffledQueue();
                    }
                    if (state.shufflePointer > 0) {
                        const prevShuffleIdx = state.shuffledOrder[state.shufflePointer - 1];
                        if (state.queue[prevShuffleIdx]) return state.queue[prevShuffleIdx];
                    }
                    if (state.queue.length > 1 && state.shuffledOrder.length > 0) {
                        return state.queue[state.shuffledOrder[state.shuffledOrder.length - 1]];
                    }
                } else if (state.idx > 0) {
                    return state.queue[state.idx - 1];
                } else if (state.queue.length > 1) {
                    return state.queue[state.queue.length - 1];
                }
            }
            if (state.playHistory && state.playHistory.length > 1) {
                return state.playHistory[1];
            }
            return null;
        };

        const primeNextTrack = async () => {
            const nextTrack = getUpcomingTrack();
            if (!nextTrack?.id || state.nextTrackPreloadId === nextTrack.id) return;
            state.nextTrackPreloadId = nextTrack.id;
            try {
                const offlineUrl = (typeof offlineStore !== 'undefined' && offlineStore.isDownloaded(nextTrack.id))
                    ? await offlineStore.getPlayUrl(nextTrack.id).catch(() => null)
                    : null;
                if (!offlineUrl && typeof mediaAPI !== 'undefined' && mediaAPI.discoverStreamHost) {
                    await mediaAPI.discoverStreamHost().catch(() => {});
                }
                const ytStreamFallback = (nextTrack.source === 'youtube' && nextTrack.id)
                    ? (typeof mediaAPI !== 'undefined' && mediaAPI.getStreamUrl
                        ? mediaAPI.getStreamUrl(nextTrack.id)
                        : `/api-v2/stream/${encodeURIComponent(nextTrack.id)}`)
                    : '';
                const freshDetails = nextTrack.url || offlineUrl ? null : await jiosaavnAPI.getSong(nextTrack.id);
                const playUrl = offlineUrl || freshDetails?.url || nextTrack.url || ytStreamFallback;
                if (!playUrl || state.nextTrackPreloadId !== nextTrack.id) return;
                if (freshDetails) Object.assign(nextTrack, freshDetails, { url: playUrl });
                // Pre-warm backend audio stream cache so next track plays instantly
                if (!offlineUrl && nextTrack.source === 'youtube' && nextTrack.id && !isNetworkOffline()) {
                    const resolveUrl = (typeof mediaAPI !== 'undefined' && mediaAPI.getResolveUrl)
                        ? mediaAPI.getResolveUrl(nextTrack.id)
                        : `/api-v2/resolve/${encodeURIComponent(nextTrack.id)}`;
                    fetch(resolveUrl).catch(() => {});
                }
                if (preloadAudio) {
                    applyAudioCorsPolicy(preloadAudio);
                    preloadAudio.src = playUrl;
                    preloadAudio.load();
                }
            } catch (e) {}
        };

        const updateMediaPosition = () => {
            if (!('mediaSession' in navigator) || typeof navigator.mediaSession.setPositionState !== 'function' || !state.currentTrack) return;
            const clock = typeof window.getActivePlaybackClock === 'function'
                ? window.getActivePlaybackClock()
                : { currentTime: audio.currentTime || 0, duration: audio.duration || Number(state.currentTrack.duration) || 0 };
            const duration = Number.isFinite(clock.duration) && clock.duration > 0 ? clock.duration : Number(state.currentTrack.duration) || 0;
            const position = Number.isFinite(clock.currentTime) ? Math.max(0, Math.min(clock.currentTime, duration || clock.currentTime)) : 0;
            const rate = (clock.engine === 'audio' && Number.isFinite(audio.playbackRate) && audio.playbackRate > 0) ? audio.playbackRate : 1;
            if (duration > 0) {
                try { navigator.mediaSession.setPositionState({ duration, playbackRate: rate, position }); } catch (e) {}
            }
        };

        const resetSeekbarAndTimes = (track = null) => {
            currentProgress = 0;
            const seekBarEl = document.getElementById('seek-bar');
            if (seekBarEl) {
                seekBarEl.value = 0;
                seekBarEl.max = track?.duration ? track.duration : 100;
            }
            const currTimeEl = document.getElementById('seek-current-time');
            const durTimeEl = document.getElementById('seek-duration-time');
            if (currTimeEl) currTimeEl.textContent = '0:00';
            if (durTimeEl) durTimeEl.textContent = track?.duration ? utils.formatTime(track.duration) : '0:00';
            const tooltipEl = document.getElementById('seek-tooltip');
            if (tooltipEl) tooltipEl.textContent = '0:00';
            const vizTrackEl = document.getElementById('seek-bar-track');
            if (vizTrackEl) {
                vizTrackEl.style.clipPath = 'inset(0 0 0 0%)';
            }
            const vizCanvasEl = document.getElementById('viz-canvas');
            if (vizCanvasEl) {
                const dpr = Math.min(window.devicePixelRatio || 1, 2);
                const canvasW = (vizCanvasEl.width || 0) / dpr;
                vizCanvasEl.style.clipPath = `inset(0 ${canvasW}px 0 0)`;
            }
        };

        const requestPlay = async () => {
            if (!state.loaded && !state.currentTrack) return;
            state.userPaused = false;
            if (state.currentTrack && (!audio.src || !(jiosaavnAPI.isStreamingUrl(audio.src) || String(audio.src).startsWith('blob:')))) {
                await player.playDirect(state.currentTrack);
                return;
            }
            try {
                if (!isAudioContextInitialized) setupAudioContext();
                if (audioContext && audioContext.state === 'suspended') {
                    try { await audioContext.resume(); } catch (acErr) {}
                }
                if (typeof viz !== 'undefined' && viz.start) viz.start();
                await audio.play();
                state.playing = true;
                state.wasPlayingBeforeHidden = true;
                ui.updatePlayBtn();
                if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
                updateMediaPosition();
                if (typeof desktop !== 'undefined' && desktop.sendMediaState) desktop.sendMediaState();
            } catch (e) {
                console.warn('[DTunes] Playback failed, resetting state:', e);
                state.playing = false;
                state.loading = false;
                ui.setPlayerLoading(false);
                ui.updatePlayBtn();
                if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
                if (typeof desktop !== 'undefined' && desktop.sendMediaState) desktop.sendMediaState();
            }
        };

        const requestPause = () => {
            state.userPaused = true;
            state.wasPlayingBeforeHidden = false;
            audio.pause();
            state.playing = false;
            ui.updatePlayBtn();
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
            updateMediaPosition();
            if (typeof desktop !== 'undefined' && desktop.sendMediaState) desktop.sendMediaState();
        };

        let _finalizedPlayRequestId = -1;
        const finalizeTrackPlayback = (track, requestId = playRequestId) => {
            if (!track || requestId !== playRequestId || _finalizedPlayRequestId === requestId) return;
            _finalizedPlayRequestId = requestId;

            const isRepeatStart = recommendationEvents.lastStartedSongId === track.id && Date.now() - recommendationEvents.currentPlayStartAt < 15 * 60 * 1000;
            recommendationEvents.currentPlayStartAt = Date.now();
            recommendationEvents.lastStartedSongId = track.id;
            recommendationEvents.completedSongId = null;
            recommendationEvents.record(isRepeatStart ? 'repeat' : (recommendationEvents.contextForTrack(track).source === 'search' ? 'search_play' : 'play_start'), track, {
                songDurationSeconds: track.duration,
                context: recommendationEvents.contextForTrack(track),
            });

            if (!isAudioContextInitialized) setupAudioContext();
            if (audioContext && audioContext.state === 'suspended') {
                audioContext.resume().catch(err => console.warn('[DTunes] Could not resume audioContext in playDirect:', err));
            }
            applyEqualizer();

            ui.updateMetadata(state.currentTrack);
            ui.renderQueue();
            primeNextTrack();
            if (typeof lyricsManager !== 'undefined') lyricsManager.fetchLyricsForTrack(state.currentTrack);
            if (typeof viz !== 'undefined') viz.start();

            const trackWithTime = { ...state.currentTrack, playedAt: new Date().toISOString() };
            state.playHistory = state.playHistory.filter(t => t.id !== track.id);
            state.playHistory.unshift(trackWithTime);
            if (state.playHistory.length > 100) state.playHistory.pop();
            localStorage.setItem('playHistory', JSON.stringify(state.playHistory));

            if (typeof searchManager !== 'undefined' && searchManager.addToRecentSearches) {
                const isSearchView = (typeof ui !== 'undefined' && ui.getCurrentView && ui.getCurrentView() === 'search') || document.body.classList.contains('mobile-search-open');
                if (isSearchView || track.source === 'search' || track.isSearchResult) {
                    searchManager.addToRecentSearches(track);
                }
            }

            if (window.listeningSession) listeningSession.start(state.currentTrack);
            ui.renderHistory();
            if (ui.updateAlbumCarouselPeeks) ui.updateAlbumCarouselPeeks();
            if (!document.getElementById('view-home').classList.contains('hidden')) homeView.renderRecentlyPlayed();
            persist.save();
        };

        const attemptNativeAudio = (url, resumeTime = 0, timeoutMs = 6000, requestId = playRequestId) => {
            return new Promise((resolve) => {
                if (!url || requestId !== playRequestId) { resolve(false); return; }
                let settled = false;
                let timer = null;
                const cleanup = () => {
                    if (timer) { clearTimeout(timer); timer = null; }
                    audio.removeEventListener('playing', onSuccess);
                    audio.removeEventListener('canplay', onSuccess);
                    audio.removeEventListener('error', onFail);
                };
                const finish = (ok) => {
                    if (settled) return;
                    settled = true;
                    cleanup();
                    resolve(ok);
                };
                const onSuccess = () => {
                    if (requestId !== playRequestId) { finish(false); return; }
                    finish(true);
                };
                const onFail = () => finish(false);

                audio.addEventListener('playing', onSuccess, { once: true });
                audio.addEventListener('canplay', onSuccess, { once: true });
                audio.addEventListener('error', onFail, { once: true });
                timer = setTimeout(() => finish(false), timeoutMs);

                applyAudioCorsPolicy(audio);
                audio.src = url;
                if (!isMobileDevice) audio.load();
                if (resumeTime > 0) {
                    try { audio.currentTime = resumeTime; } catch (_) {}
                }
                if (state.playing || !state.userPaused) {
                    const playPromise = audio.play();
                    if (playPromise && typeof playPromise.then === 'function') {
                        playPromise.then(() => {
                            if (requestId === playRequestId && !audio.error) finish(true);
                        }).catch(() => finish(false));
                    }
                }
            });
        };

        const recoverFromAudioError = async () => {
            if (!state.currentTrack || isAudioRecoveryPending) return;
            // Ignore aborts (e.g. from rapid track skipping or new track load) and non-errors
            if (audio.error && (audio.error.code === 1 || audio.error.code === 0)) {
                return;
            }
            if (_streamStartupTimer) { clearTimeout(_streamStartupTimer); _streamStartupTimer = null; }

            const isOfflineNow = typeof window !== 'undefined' && typeof window.__dtunesIsOffline === 'function'
                ? window.__dtunesIsOffline()
                : (typeof navigator !== 'undefined' && !navigator.onLine);
            const isDownloadedNow = typeof offlineStore !== 'undefined' && offlineStore && offlineStore.isDownloaded && offlineStore.isDownloaded(state.currentTrack.id);

            if (isOfflineNow && !isDownloadedNow) {
                const pausedTime = Math.max(0, audio.currentTime || 0);
                audio.pause();
                state.playing = false;
                state.loading = false;
                isAudioRecoveryPending = false;
                isPlaybackPending = false;
                state._playbackPausedDueToNetwork = {
                    trackId: state.currentTrack.id,
                    position: pausedTime
                };
                ui.setPlayerLoading(false);
                ui.updatePlayBtn();
                if (typeof desktop !== 'undefined' && desktop.sendMediaState) desktop.sendMediaState();
                if (window.ui && ui.showToast) {
                    ui.showToast('Offline — streaming paused. Downloaded songs are ready to play.', 'warning', 4000);
                }
                return;
            }

            isAudioRecoveryPending = true;
            state.loading = true;
            ui.setPlayerLoading(true);

            const recoveryRequestId = playRequestId;
            const track = state.currentTrack;
            const resumeTime = Math.max(0, audio.currentTime || 0);
            state._audioRetryCount = (state._audioRetryCount || 0) + 1;

            try {
                // Attempt 0: an offline copy is always preferred over the network
                if (typeof offlineStore !== 'undefined' && offlineStore.isDownloaded(track.id)) {
                    const offlineUrl = await offlineStore.getPlayUrl(track.id).catch(() => null);
                    if (offlineUrl && await attemptNativeAudio(offlineUrl, resumeTime, 5000, recoveryRequestId)) {
                        finalizeTrackPlayback(track, recoveryRequestId);
                        return;
                    }
                }

                // Attempt 1: For YouTube tracks, retry native stream once with fresh backend resolution
                if (track.source === 'youtube' && !track.isOffline && track.id) {
                    const streamAllowed = !mediaAPI?.isStreamReady || mediaAPI.isStreamReady();
                    if (streamAllowed && !track._nativeStreamFailed && state._audioRetryCount === 1) {
                        await new Promise(r => setTimeout(r, 250));
                        if (recoveryRequestId !== playRequestId) return;
                        const retryUrl = (typeof mediaAPI !== 'undefined' && mediaAPI.getStreamUrl)
                            ? mediaAPI.getStreamUrl(track.id, { refresh: true, cacheBust: Date.now() })
                            : `/api-v2/stream/${encodeURIComponent(track.id)}?refresh=1&r=${Date.now()}`;
                        if (await attemptNativeAudio(retryUrl, resumeTime, 8000, recoveryRequestId)) {
                            state._audioRetryCount = 0;
                            _consecutiveStreamFailures = 0;
                            state.playing = true;
                            ui.updatePlayBtn();
                            finalizeTrackPlayback(track, recoveryRequestId);
                            return;
                        }
                    }

                    track._nativeStreamFailed = true;
                }

                if (state._audioRetryCount <= 2 && track.url && !track._nativeStreamFailed) {
                    await new Promise(r => setTimeout(r, 300));
                    if (recoveryRequestId !== playRequestId) return;
                    if (await attemptNativeAudio(track.url, resumeTime, 6000, recoveryRequestId)) {
                        finalizeTrackPlayback(track, recoveryRequestId);
                        return;
                    }
                }

                // Refresh song details from API for non-YouTube or stale URLs
                if (!track._nativeStreamFailed) {
                    const refreshed = await jiosaavnAPI.getSong(track.id);
                    if (recoveryRequestId !== playRequestId) return;
                    if (refreshed?.url) {
                        track.url = refreshed.url;
                        if (await attemptNativeAudio(refreshed.url, resumeTime, 6000, recoveryRequestId)) {
                            finalizeTrackPlayback(track, recoveryRequestId);
                            return;
                        }
                    }
                    if (switchToNextApi()) {
                        const retried = await jiosaavnAPI.getSong(track.id);
                        if (recoveryRequestId !== playRequestId) return;
                        if (retried?.url) {
                            track.url = retried.url;
                            if (await attemptNativeAudio(retried.url, resumeTime, 6000, recoveryRequestId)) {
                                finalizeTrackPlayback(track, recoveryRequestId);
                                return;
                            }
                        }
                    }
                }

                if (recoveryRequestId === playRequestId) {
                    _consecutiveStreamFailures += 1;
                    state.playing = false;
                    state.loading = false;
                    ui.setPlayerLoading(false);
                    ui.updatePlayBtn();
                    if (window.ui && ui.showToast) {
                        const isBlockedServer = track.source === 'youtube' && mediaAPI?.isStreamReady && !mediaAPI.isStreamReady();
                        const msg = isBlockedServer
                            ? 'YouTube audio stream is blocked on this server. Set STREAM_BACKEND_URL or YouTube cookies/PO-token.'
                            : 'Unable to load audio stream for this track.';
                        ui.showToast(msg, 'warning', isBlockedServer ? 5000 : 3000);
                    }
                    if (state.queue && state.queue.length > 1 && state._audioRetryCount <= 2 && _consecutiveStreamFailures < 2) {
                        player.next();
                    }
                }
            } catch (e) {
                console.warn('[DTunes] Recovery failed:', e);
                if (recoveryRequestId === playRequestId) {
                    state.playing = false;
                    ui.updatePlayBtn();
                }
            } finally {
                isAudioRecoveryPending = false;
                if (recoveryRequestId === playRequestId) {
                    isPlaybackPending = false;
                    state.loading = false;
                    ui.setPlayerLoading(false);
                }
            }
        };

        // Offline safety net: a track that is not saved on this device can never
        // start playback while the app has no connection, whatever UI path led here.
        const isOfflineBlockedTrack = (track) => {
            if (!track) return false;
            try {
                const offline = typeof window !== 'undefined' &&
                    typeof window.__dtunesIsOffline === 'function' &&
                    window.__dtunesIsOffline();
                if (!offline) return false;
                if (typeof offlineStore === 'undefined' || !offlineStore || typeof offlineStore.isDownloaded !== 'function') return true;
                return !offlineStore.isDownloaded(track.saavn_id || track.id);
            } catch (_) {
                return false;
            }
        };

        const notifyOfflineBlockedTrack = (track) => {
            if (typeof ui !== 'undefined' && ui.showToast) {
                const name = track && track.name ? `"${track.name}" ` : 'This song ';
                ui.showToast(`${name}is not downloaded for offline playback`, 'warning', 3000);
            }
        };

        window.playSongById = (storeId) => {
            const song = songStore.get(storeId);
            if (song) {
                if (isOfflineBlockedTrack(song)) {
                    notifyOfflineBlockedTrack(song);
                    return;
                }
                const isSearch = !document.getElementById('view-search')?.classList.contains('hidden') ||
                                 document.body.classList.contains('mobile-search-open');
                if (isSearch && typeof searchManager !== 'undefined' && searchManager.addToRecentSearches) {
                    searchManager.addToRecentSearches(song);
                }
                player.playDirect(song);
            } 
        };

        window.playContext = async (type, id) => {
            try {
                let songs = [];
                if (type === 'album' && jiosaavnAPI.getAlbum) {
                    const album = await jiosaavnAPI.getAlbum(id);
                    songs = (album?.songs || []).filter(Boolean);
                } else if (type === 'artist' && jiosaavnAPI.getArtist) {
                    const artist = await jiosaavnAPI.getArtist(id);
                    songs = (artist?.topSongs || []).filter(Boolean);
                }
                if (songs.length > 0) { state.queue = songs; state.userQueue = []; state.idx = 0; player.playDirect(songs[0]); }
            } catch(e) {}
        };

        const recommendationEvents = {
            currentPlayStartAt: 0,
            lastStartedSongId: null,
            completedSongId: null,
            contextForTrack: (track, extra = {}) => {
                const source = track?.source === 'recommendation'
                    ? 'recommendation'
                    : (!document.getElementById('view-search').classList.contains('hidden') ? 'search' : 'manual');
                return { source, playlistType: track?.playlistType, ...extra };
            },
            record: (eventType, song, details = {}) => {
                if (!window.recommendationClient) return;
                window.recommendationClient.recordEvent(eventType, song, {
                    ...details,
                    context: details.context || recommendationEvents.contextForTrack(song),
                });
            },
            maybeRecordSkip: () => {
                if (!state.currentTrack) return;
                const clock = typeof window.getActivePlaybackClock === 'function'
                    ? window.getActivePlaybackClock()
                    : { currentTime: audio.currentTime || 0, duration: audio.duration || 0 };
                if (!Number.isFinite(clock.duration) || clock.duration <= 0) return;
                const progress = clock.currentTime / clock.duration;
                if (progress > 0.02 && progress < 0.5 && recommendationEvents.completedSongId !== state.currentTrack.id) {
                    recommendationEvents.record('skip', state.currentTrack, {
                        playDurationSeconds: Math.floor(clock.currentTime),
                        songDurationSeconds: Math.floor(clock.duration),
                    });
                }
            }
        };

        const player = {
            removeFromQueue: (section, index) => {
                index = Number(index);
                if (section === 'manual') {
                    if (state.userQueue && index >= 0 && index < state.userQueue.length) {
                        state.userQueue.splice(index, 1);
                    }
                } else if (section === 'auto') {
                    if (state.shuffle && state.shuffledOrder) {
                        const targetPointer = state.shufflePointer + 1 + index;
                        if (targetPointer < state.shuffledOrder.length) {
                            const origIdx = state.shuffledOrder[targetPointer];
                            state.shuffledOrder.splice(targetPointer, 1);
                            if (origIdx >= 0 && origIdx < state.queue.length) {
                                state.queue.splice(origIdx, 1);
                                for (let i = 0; i < state.shuffledOrder.length; i++) {
                                    if (state.shuffledOrder[i] > origIdx) {
                                        state.shuffledOrder[i]--;
                                    }
                                }
                            }
                        }
                    } else if (state.queue) {
                        const targetIdx = state.idx + 1 + index;
                        if (targetIdx < state.queue.length) {
                            state.queue.splice(targetIdx, 1);
                        }
                    }
                }
                ui.renderQueue();
                persist.save();
                if (typeof desktop !== 'undefined' && desktop.sendMediaState) desktop.sendMediaState();
            },
            triggerUpNextHandoff: () => {
                // Desktop Next button entry point. It used to bail out unless `state.nextTrack` was
                // truthy, but nothing in the app ever sets that field, so Next silently did nothing.
                player.next();
            },
            smoothGlideToStart: () => {
                audio.currentTime = 0;
            },

            playDirect: async (track) => {
                if (!track) return;
                if (isOfflineBlockedTrack(track)) {
                    notifyOfflineBlockedTrack(track);
                    return;
                }
                const currentRequestId = ++playRequestId;
                recommendationEvents.maybeRecordSkip();
                isPlaybackPending = true;
                
                state.upNextTriggered = false;
                state.loading = true;
                state.loaded = false;
                state.currentTrack = { ...track };
                resetSeekbarAndTimes(track);

                document.body.classList.add('has-active-track');
                document.getElementById('queue-wrapper')?.classList.remove('preview-expanded', 'track-swap-out');
                document.getElementById('player-footer')?.classList.remove('translate-y-[150%]', 'opacity-0');
                ui.updateMetadata(state.currentTrack, { loading: true });
                ui.setPlayerLoading(true);
                ui.updatePlayBtn();
                ui.renderQueue();
                persist.save();
                
                const safetyTimer = setTimeout(() => {
                    if (currentRequestId === playRequestId && isPlaybackPending) {
                        isPlaybackPending = false;
                        state.loading = false;
                        ui.setPlayerLoading(false);
                    }
                }, 8000);

                const setupAndStartPlayback = async (urlToPlay) => {
                    if (_streamStartupTimer) { clearTimeout(_streamStartupTimer); _streamStartupTimer = null; }
                    if (typeof window !== 'undefined') window._dtunesActiveEngine = 'audio';
                    applyAudioCorsPolicy(audio);
                    audio.preload = 'auto';
                    audio.src = urlToPlay;
                    if (!isMobileDevice) {
                        audio.load();
                    }

                    state.loaded = true;
                    state.userPaused = false;
                    ui.enableControls();
                    audio.loop = (state.repeat === 2);

                    _streamStartupTimer = setTimeout(() => {
                        _streamStartupTimer = null;
                        if (currentRequestId === playRequestId && !isAudioRecoveryPending && !state.userPaused && audio.readyState < 2) {
                            console.warn('[DTunes] Audio stream startup timeout; triggering recovery');
                            recoverFromAudioError();
                        }
                    }, 9000);

                    try {
                        await audio.play();
                    } catch (playErr) {
                        if (audio.crossOrigin) {
                            console.warn('[DTunes] Retrying audio play without crossOrigin:', playErr);
                            audio.removeAttribute('crossorigin');
                            audio.load();
                            await audio.play();
                        } else if (currentRequestId === playRequestId && !state.userPaused && playErr?.name !== 'AbortError') {
                            if (_streamStartupTimer) { clearTimeout(_streamStartupTimer); _streamStartupTimer = null; }
                            await recoverFromAudioError();
                            return false;
                        } else {
                            throw playErr;
                        }
                    }
                    if (_streamStartupTimer) { clearTimeout(_streamStartupTimer); _streamStartupTimer = null; }
                    if (currentRequestId !== playRequestId) return false;

                    isPlaybackPending = false;
                    state._audioRetryCount = 0;
                    state.playing = true;
                    state.wasPlayingBeforeHidden = true;
                    state.loading = false;
                    ui.setPlayerLoading(false);
                    ui.updatePlayBtn();
                    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
                    updateMediaPosition();
                    if (typeof desktop !== 'undefined' && desktop.sendMediaState) desktop.sendMediaState();

                    finalizeTrackPlayback(track, currentRequestId);
                    return true;
                };

                try {
                    // Offline copies play instantly and need no network round-trip
                    const offlineId = track.saavn_id || track.id;
                    if (typeof offlineStore !== 'undefined' && offlineStore.isDownloaded(offlineId)) {
                        const offlineUrl = await offlineStore.getPlayUrl(offlineId).catch(() => null);
                        if (offlineUrl) {
                            await setupAndStartPlayback(offlineUrl);
                            return;
                        }
                    }

                    // Seamless legacy JioSaavn -> YouTube migration (preserves legacy_id/saavn_id for likes & offline)
                    if (!track.isOffline && typeof mediaAPI !== 'undefined' && mediaAPI.isLegacyJioSaavnTrack && mediaAPI.isLegacyJioSaavnTrack(track)) {
                        const legacyId = String(track.saavn_id || track.legacy_id || track.id || '');
                        const migrated = await mediaAPI.resolveLegacyTrack(track);
                        if (currentRequestId !== playRequestId) return;
                        if (migrated && migrated.id) {
                            track = migrated;
                            state.currentTrack = migrated;
                            if (legacyId) {
                                const replaceInList = (arr) => {
                                    if (!Array.isArray(arr)) return false;
                                    let changed = false;
                                    for (let i = 0; i < arr.length; i++) {
                                        const item = arr[i];
                                        const itemId = typeof item === 'string' ? item : String(item?.id || item?.saavn_id || '');
                                        if (itemId === legacyId) {
                                            arr[i] = migrated;
                                            changed = true;
                                        }
                                    }
                                    return changed;
                                };
                                replaceInList(state.queue);
                                replaceInList(state.userQueue);
                                if (replaceInList(state.likedIds)) {
                                    try { localStorage.setItem('likedIds', JSON.stringify(state.likedIds)); } catch (_) {}
                                }
                                if (replaceInList(state.library)) {
                                    try { localStorage.setItem('library', JSON.stringify(state.library)); } catch (_) {}
                                }
                                if (state.playlists && typeof state.playlists === 'object') {
                                    let plChanged = false;
                                    Object.keys(state.playlists).forEach(plName => {
                                        if (replaceInList(state.playlists[plName])) plChanged = true;
                                    });
                                    if (plChanged) {
                                        try { localStorage.setItem('playlists', JSON.stringify(state.playlists)); } catch (_) {}
                                    }
                                }
                            }
                        }
                    }

                    // Native HTML5 <audio> streaming via dedicated stream host or /api-v2/stream/{id}
                    // (supports iOS background play, lock-screen controls, EQ & live visualizer).
                    if (track.source === 'youtube' && !track.isOffline && track.id) {
                        state._audioRetryCount = 0;
                        track._nativeStreamFailed = false;
                        const preferredStreamUrl = (typeof mediaAPI !== 'undefined' && mediaAPI.getStreamUrl)
                            ? mediaAPI.getStreamUrl(track.id)
                            : `/api-v2/stream/${encodeURIComponent(track.id)}`;
                        const nativeStreamUrl = (track.url && String(track.url).includes('/api-v2/stream/') && preferredStreamUrl.startsWith('/api-v2/'))
                            ? track.url
                            : preferredStreamUrl;
                        track.url = nativeStreamUrl;
                        track.play_url = nativeStreamUrl;
                        state.currentTrack = { ...state.currentTrack, url: nativeStreamUrl, play_url: nativeStreamUrl };
                        await setupAndStartPlayback(nativeStreamUrl);
                        return;
                    }

                    const hasStreamUrl = Boolean(track.url && (jiosaavnAPI.isStreamingUrl(track.url) || track.url.startsWith('http')));
                    if (hasStreamUrl) {
                        // Instant playback with known streaming URL
                        await setupAndStartPlayback(track.url);
                        // Refresh details asynchronously in background for 320kbps upgrade and accurate lyrics (online only)
                        if (!track.isOffline && !String(track.url).startsWith('dtunes-media://')) {
                            jiosaavnAPI.getSong(track.id).then((freshDetails) => {
                                if (currentRequestId === playRequestId && freshDetails) {
                                    state.currentTrack = { ...state.currentTrack, ...freshDetails };
                                    ui.updateMetadata(state.currentTrack);
                                    if (typeof lyricsManager !== 'undefined') lyricsManager.fetchLyricsForTrack(state.currentTrack);
                                }
                            }).catch(() => {});
                        }
                    } else {
                        // URL not in memory; fetch before playing
                        let freshDetails = await jiosaavnAPI.getSong(track.id);
                        if (currentRequestId !== playRequestId) return;

                        let playUrl = freshDetails?.url || track.url;
                        if (!playUrl) {
                            const searchQuery = `${track.name || track.title || ''} ${track.artist || ''}`.trim();
                            if (searchQuery) {
                                try {
                                    const searchResults = await jiosaavnAPI.searchSongs(searchQuery, 1);
                                    if (searchResults && searchResults.length > 0 && searchResults[0].url) {
                                        freshDetails = searchResults[0];
                                        playUrl = searchResults[0].url;
                                    }
                                } catch (_) {}
                            }
                        }
                        if (!playUrl) throw new Error('No audio URL found');
                        
                        track = { ...track, ...freshDetails, url: playUrl };
                        state.currentTrack = track;
                        await setupAndStartPlayback(playUrl);
                    }
                } catch (error) {
                    if (currentRequestId === playRequestId && !isAudioRecoveryPending) {
                        console.error('[DTunes] Error playing track:', error);
                        state.playing = false;
                        state.loading = false;
                        ui.setPlayerLoading(false);
                        ui.updatePlayBtn();
                    }
                } finally {
                    clearTimeout(safetyTimer);
                    if (currentRequestId === playRequestId && !isAudioRecoveryPending) {
                        isPlaybackPending = false;
                    }
                }
            },
            togglePlay: () => {
                if(!state.loaded) return;
                if (typeof viz !== 'undefined') viz.start();
                const isRunning = Boolean(state.playing || !audio.paused);
                if (isRunning) { requestPause(); } else { requestPlay(); }
            },
            seek: (time) => {
                if (!state.loaded || !Number.isFinite(time)) return;
                const targetTime = Math.max(0, Math.min(time, audio.duration || time));
                audio.currentTime = targetTime;
                currentProgress = audio.duration ? targetTime / audio.duration : 0;
                const sb = document.getElementById('seek-bar');
                if (sb) sb.value = targetTime;
                if (typeof lyricsManager !== 'undefined') lyricsManager.syncTime(targetTime, true);
                if (typeof viz !== 'undefined') viz.start();
                updateMediaPosition();
            },
            next: (force = false) => { 
                const isOfflineNow = typeof window !== 'undefined' && typeof window.__dtunesIsOffline === 'function'
                    ? window.__dtunesIsOffline()
                    : (typeof navigator !== 'undefined' && !navigator.onLine);

                if (isOfflineNow) {
                    while (state.userQueue.length > 0) {
                        const candidate = state.userQueue.shift();
                        if (!isOfflineBlockedTrack(candidate)) {
                            player.playDirect(candidate);
                            return;
                        }
                    }
                    if (state.queue.length > 0) {
                        for (let offset = 1; offset <= state.queue.length; offset++) {
                            const nextIdx = (state.idx + offset) % state.queue.length;
                            if (nextIdx === 0 && state.repeat !== 1 && !force) break;
                            const candidate = state.queue[nextIdx];
                            if (candidate && !isOfflineBlockedTrack(candidate)) {
                                state.idx = nextIdx;
                                player.playDirect(candidate);
                                return;
                            }
                        }
                        audio.pause();
                        state.playing = false;
                        state.loading = false;
                        ui.setPlayerLoading(false);
                        ui.updatePlayBtn();
                        if (ui.showToast) ui.showToast('No more downloaded songs in queue', 'warning');
                        return;
                    }
                }

                if (state.userQueue.length > 0) {
                    const nextSong = state.userQueue.shift();
                    player.playDirect(nextSong);
                } else if (state.queue.length > 0) {
                    let nextIdx;
                    if (state.shuffle) {
                        if (!state.shuffledOrder || state.shuffledOrder.length !== state.queue.length) {
                            generateShuffledQueue();
                        }
                        state.shufflePointer++;
                        if (state.shufflePointer >= state.shuffledOrder.length) {
                            if (state.repeat === 1 || force) {
                                generateShuffledQueue();
                                state.shufflePointer = 0;
                            } else {
                                homeView.autoplayNextIntelligentTracks().then(success => {
                                    if (success && state.idx + 1 < state.queue.length) {
                                        state.idx = state.idx + 1;
                                        player.playDirect(state.queue[state.idx]);
                                    } else {
                                        audio.pause();
                                        audio.currentTime = 0;
                                        state.playing = false;
                                        state.loading = false;
                                        ui.setPlayerLoading(false);
                                        ui.updatePlayBtn();
                                        persist.save();
                                    }
                                });
                                return;
                            }
                        }
                        nextIdx = state.shuffledOrder[state.shufflePointer];
                    } else {
                        nextIdx = state.idx + 1;
                        if (nextIdx >= state.queue.length) {
                            if (state.repeat === 1 || force) {
                                nextIdx = 0;
                            } else {
                                homeView.autoplayNextIntelligentTracks().then(success => {
                                    if (success && state.idx + 1 < state.queue.length) {
                                        state.idx = state.idx + 1;
                                        player.playDirect(state.queue[state.idx]);
                                    } else {
                                        audio.pause();
                                        audio.currentTime = 0;
                                        state.playing = false;
                                        state.loading = false;
                                        ui.setPlayerLoading(false);
                                        ui.updatePlayBtn();
                                        persist.save();
                                    }
                                });
                                return;
                            }
                        }
                    }
                    if (nextIdx !== undefined && state.queue[nextIdx]) {
                        state.idx = nextIdx;
                        player.playDirect(state.queue[nextIdx]);
                    }
                }
            },
            prev: () => { 
                if (state.queue.length === 0) return;
                const clock = typeof window.getActivePlaybackClock === 'function'
                    ? window.getActivePlaybackClock()
                    : { currentTime: audio.currentTime || 0, engine: 'audio' };
                if (clock.currentTime > 3) {
                    player.seek(0);
                    return;
                }
                const isOfflineNow = typeof window !== 'undefined' && typeof window.__dtunesIsOffline === 'function'
                    ? window.__dtunesIsOffline()
                    : (typeof navigator !== 'undefined' && !navigator.onLine);

                if (isOfflineNow) {
                    for (let offset = 1; offset <= state.queue.length; offset++) {
                        let prevIdx = state.idx - offset;
                        if (prevIdx < 0) {
                            if (state.repeat === 1) prevIdx = state.queue.length - 1;
                            else break;
                        }
                        const candidate = state.queue[prevIdx];
                        if (candidate && !isOfflineBlockedTrack(candidate)) {
                            state.idx = prevIdx;
                            player.playDirect(candidate);
                            return;
                        }
                    }
                    audio.currentTime = 0;
                    updateMediaPosition();
                    return;
                }
                let prevIdx;
                if (state.shuffle) {
                    if (!state.shuffledOrder || state.shuffledOrder.length !== state.queue.length) {
                        generateShuffledQueue();
                    }
                    if (state.shufflePointer > 0) {
                        state.shufflePointer--;
                        prevIdx = state.shuffledOrder[state.shufflePointer];
                    } else {
                        prevIdx = state.shuffledOrder[state.shuffledOrder.length - 1];
                    }
                } else {
                    prevIdx = state.idx - 1;
                    if (prevIdx < 0) prevIdx = state.queue.length - 1;
                }
                if (prevIdx !== undefined && state.queue[prevIdx]) {
                    state.idx = prevIdx;
                    player.playDirect(state.queue[prevIdx]);
                }
            },
            setVolume: (val) => {
                audio.volume = Math.max(0, Math.min(1, val));
            },
            toggleShuffle: () => { 
                state.shuffle = !state.shuffle; 
                localStorage.setItem('playShuffle', state.shuffle);
                if (state.shuffle) {
                    generateShuffledQueue();
                }
                ui.updateShuffleBtn();
                ui.renderQueue(); 
                persist.save(); 
            },
            toggleRepeat: () => { 
                state.repeat = (state.repeat + 1) % 3; 
                localStorage.setItem('playRepeat', state.repeat);
                ui.updateRepeatBtn(); 
                persist.save(); 
            },
            likeSong: (songId = null) => {
                let songToLike = null;
                if(!songId) { 
                    if(!state.currentTrack) return; 
                    songId = state.currentTrack.id; 
                    songToLike = state.currentTrack;
                } else {
                    songToLike = state.currentTrack?.id === songId ? state.currentTrack : 
                                 state.queue.find(s => s.id === songId) || 
                                 state.userQueue.find(s => s.id === songId) || 
                                 state.playHistory.find(s => s.id === songId);
                    if (!songToLike) {
                        for (let s of songStore.songs.values()) {
                            if (s.id === songId) { songToLike = s; break; }
                        }
                    }
                }

                const idx = state.likedIds.findIndex(item => (typeof item === 'string' ? item === songId : item.id === songId));
                const nextLiked = idx === -1;
                if(idx === -1) { 
                    state.likedIds.push(songToLike || songId); 
                    recommendationEvents.record('like', songToLike || { id: songId }, { context: { source: 'manual' } });
                } else { 
                    state.likedIds.splice(idx, 1); 
                    recommendationEvents.record('unlike', songToLike || { id: songId }, { context: { source: 'manual' } });
                }
                
                localStorage.setItem('likedIds', JSON.stringify(state.likedIds));
                cloudLibrary.setLiked(songToLike || { id: songId }, nextLiked);
                // Liking always adds to Library Songs; unliking does not remove from library.
                if (nextLiked && !player.isInLibrary(songId)) {
                    state.libraryIds.push(songToLike || songId);
                    localStorage.setItem('libraryIds', JSON.stringify(state.libraryIds));
                    cloudLibrary.setLibrary(songToLike || { id: songId }, true);
                    ui.renderLibraryLists();
                }
                if(state.currentTrack && state.currentTrack.id === songId) ui.updateMetadata(state.currentTrack); 
                ui.renderPlaylists(); 
                if (!document.getElementById('view-playlist').classList.contains('hidden') && document.getElementById('playlist-view-title').textContent === 'Liked Songs') { ui.openPlaylist('Liked Songs'); }
            },
            toggleLike: () => { player.likeSong(); },
            isLiked: (songId) => state.likedIds.some(item => {
                if (typeof item === 'string') return item === songId;
                return item && (item.id === songId || item.saavn_id === songId || item.legacy_id === songId);
            }),
            isDisliked: (songId) => {
                if (!state.dislikedSongs) return false;
                return state.dislikedSongs.some(item => (typeof item === 'object' ? item.id : item) === songId);
            },
            dislikeSong: (songId = null) => {
                let song = null;
                if (!songId) {
                    if (!state.currentTrack) return;
                    song = state.currentTrack;
                } else {
                    song = (songStore && songStore.get) ? songStore.get(songId) : null;
                    if (!song) {
                        song = state.currentTrack?.id === songId ? state.currentTrack :
                            state.queue.find(s => s.id === songId) ||
                            state.userQueue.find(s => s.id === songId) ||
                            state.playHistory.find(s => s.id === songId);
                    }
                }
                if (!song) return;

                if (!state.dislikedSongs) state.dislikedSongs = [];
                const sId = song.id;
                const sName = song.name || song.title || 'Unknown';
                const sArtist = song.artist || song.primary_artists || '';

                const idx = state.dislikedSongs.findIndex(item => {
                    const id = typeof item === 'object' ? item.id : item;
                    return id === sId || (item.name === sName && item.artist === sArtist);
                });

                if (idx === -1) {
                    state.dislikedSongs.push({ id: sId, name: sName, artist: sArtist });
                    if (ui.showToast) ui.showToast(`We won't recommend "${sName}" anymore`);
                } else {
                    state.dislikedSongs.splice(idx, 1);
                    if (ui.showToast) ui.showToast(`Removed "${sName}" from hidden songs`);
                }

                localStorage.setItem('dislikedSongs', JSON.stringify(state.dislikedSongs));
            },
            isInLibrary: (songId) => state.libraryIds.some(item => (typeof item === 'object' ? item.id : item) === songId),
            addToLibrary: (songId = null) => {
                let songToAdd = null;
                if (!songId) {
                    if (!state.currentTrack) return;
                    songId = state.currentTrack.id;
                    songToAdd = state.currentTrack;
                } else {
                    songToAdd = state.currentTrack?.id === songId ? state.currentTrack :
                        state.queue.find(s => s.id === songId) ||
                        state.userQueue.find(s => s.id === songId) ||
                        state.playHistory.find(s => s.id === songId);
                    if (!songToAdd) {
                        for (let s of songStore.songs.values()) {
                            if (s.id === songId) { songToAdd = s; break; }
                        }
                    }
                }
                const idx = state.libraryIds.findIndex(item => (typeof item === 'string' ? item === songId : item.id === songId));
                const nextInLibrary = idx === -1;
                if (idx === -1) state.libraryIds.push(songToAdd || songId);
                else state.libraryIds.splice(idx, 1);
                localStorage.setItem('libraryIds', JSON.stringify(state.libraryIds));
                cloudLibrary.setLibrary(songToAdd || { id: songId }, nextInLibrary);
                ui.renderLibraryLists();
            },
            addNext: (song) => { 
                state.userQueue.unshift(song); 
                recommendationEvents.record('queue_add', song, { context: { source: 'manual' } }); 
                ui.renderQueue(); 
                primeNextTrack(); 
                persist.save(); 
                if (ui.showToast) ui.showToast(`Playing "${song.name || 'Song'}" next`);
            },
            addToQueue: (song) => { 
                state.userQueue.push(song); 
                recommendationEvents.record('queue_add', song, { context: { source: 'manual' } }); 
                ui.renderQueue(); 
                primeNextTrack(); 
                persist.save(); 
                if (ui.showToast) ui.showToast(`Added "${song.name || 'Song'}" to queue`);
            },
            addPlaylistNext: async (name) => {
                let songs = [];
                if (name === 'Liked Songs') {
                    const loaded = [];
                    for (let i = 0; i < state.likedIds.length; i++) {
                        if (typeof state.likedIds[i] === 'string') {
                            const fetched = await jiosaavnAPI.getSong(state.likedIds[i]);
                            if (fetched) { loaded.push(fetched); state.likedIds[i] = fetched; }
                        } else { loaded.push(state.likedIds[i]); }
                    }
                    songs = loaded;
                } else {
                    songs = state.playlists[name] || [];
                }
                if (songs.length === 0) { if (ui.showToast) ui.showToast('No tracks in playlist to add', 'error'); return; }
                state.userQueue.unshift(...songs);
                ui.renderQueue();
                primeNextTrack();
                persist.save();
                if (ui.showToast) ui.showToast(`Added ${songs.length} tracks to play next`);
            },
            addPlaylistToQueue: async (name) => {
                let songs = [];
                if (name === 'Liked Songs') {
                    const loaded = [];
                    for (let i = 0; i < state.likedIds.length; i++) {
                        if (typeof state.likedIds[i] === 'string') {
                            const fetched = await jiosaavnAPI.getSong(state.likedIds[i]);
                            if (fetched) { loaded.push(fetched); state.likedIds[i] = fetched; }
                        } else { loaded.push(state.likedIds[i]); }
                    }
                    songs = loaded;
                } else {
                    songs = state.playlists[name] || [];
                }
                if (songs.length === 0) { if (ui.showToast) ui.showToast('No tracks in playlist to add', 'error'); return; }
                state.userQueue.push(...songs);
                ui.renderQueue();
                primeNextTrack();
                persist.save();
                if (ui.showToast) ui.showToast(`Added ${songs.length} tracks to queue`);
            },
            addAlbumNext: async (albumId) => {
                try {
                    const album = await jiosaavnAPI.getAlbum(albumId);
                    const songs = (album?.songs || []).filter(Boolean);
                    if (songs.length === 0) { if (ui.showToast) ui.showToast('No album songs found', 'error'); return; }
                    state.userQueue.unshift(...songs);
                    ui.renderQueue();
                    primeNextTrack();
                    persist.save();
                    if (ui.showToast) ui.showToast(`Added ${songs.length} album tracks to play next`);
                } catch (e) {
                    if (ui.showToast) ui.showToast('Failed to load album tracks', 'error');
                }
            },
            addAlbumToQueue: async (albumId) => {
                try {
                    const album = await jiosaavnAPI.getAlbum(albumId);
                    const songs = (album?.songs || []).filter(Boolean);
                    if (songs.length === 0) { if (ui.showToast) ui.showToast('No album songs found', 'error'); return; }
                    state.userQueue.push(...songs);
                    ui.renderQueue();
                    primeNextTrack();
                    persist.save();
                    if (ui.showToast) ui.showToast(`Added ${songs.length} album tracks to queue`);
                } catch (e) {
                    if (ui.showToast) ui.showToast('Failed to load album tracks', 'error');
                }
            },
            triggerQueueAutoplay: async (count = 8) => {
                const current = state.currentTrack || (state.playHistory && state.playHistory[0]);
                const seedTitle = current?.name || current?.title || 'Starboy';
                const seedArtist = current?.artist || current?.primary_artists || 'The Weeknd';

                if (window.ui?.showToast) ui.showToast(`Finding ${count} songs for autoplay...`);

                try {
                    const disliked = state.dislikedSongs || [];
                    let songList = [];
                    if (window.ai && window.ai.fetchServerAutoplay) {
                        songList = await window.ai.fetchServerAutoplay({
                            seedSongId: current?.saavn_id || current?.id,
                            seedTitle,
                            seedArtist,
                            limit: count,
                            currentQueueIds: (state.queue || []).map(s => s.saavn_id || s.id),
                            excludedSongIds: disliked.map(d => typeof d === 'object' ? (d.id || d.saavn_id) : d).filter(Boolean),
                            negativeTitles: disliked.map(d => typeof d === 'object' ? (d.name || d.title) : d).filter(Boolean)
                        }) || [];
                    }

                    if (songList.length === 0 && window.jiosaavnAPI && jiosaavnAPI.searchSongs) {
                        songList = await jiosaavnAPI.searchSongs(`${seedArtist} hits`, count);
                    }

                    if (songList.length === 0 && window.ai && window.ai.generateQueueAutoplay) {
                        songList = await window.ai.generateQueueAutoplay(seedTitle, seedArtist, count, disliked);
                    }

                    const hydrated = [];
                    for (const s of songList) {
                        let track = null;
                        if (s.id && s.url && s.img && !s.img.includes('DTunes.svg')) {
                            track = s;
                        } else if (window.aiHome && window.aiHome.searchTrackData) {
                            track = await window.aiHome.searchTrackData(s.title || s.name, s.artist);
                        } else if (window.jiosaavnAPI && jiosaavnAPI.searchSongs) {
                            const results = await jiosaavnAPI.searchSongs(`${s.title || s.name} ${s.artist}`, 1);
                            if (results && results.length > 0) track = results[0];
                        }
                        if (track && track.url && track.img && !track.img.includes('DTunes.svg') && track.img !== FALLBACK_ART) {
                            hydrated.push(track);
                        }
                    }

                    if (hydrated.length > 0) {
                        // Filter out duplicates already in queue
                        const uniqueToAdd = hydrated.filter(h => !state.queue.some(q => q.id === h.id));
                        const songsToAdd = uniqueToAdd.length > 0 ? uniqueToAdd : hydrated;
                        
                        state.queue.push(...songsToAdd);
                        ui.renderQueue();
                        primeNextTrack();
                        persist.save();
                        if (window.ui?.showToast) ui.showToast(`Added ${songsToAdd.length} songs to Queue`);
                        return true;
                    }
                } catch (err) {
                    console.error("[Autoplay] Failed to queue autoplay tracks:", err);
                }
                if (window.ui?.showToast) ui.showToast("Could not find autoplay tracks", "error");
                return false;
            },
            clearQueue: () => {
                state.userQueue = [];
                state.queue = state.currentTrack ? [state.currentTrack] : [];
                state.idx = state.currentTrack ? 0 : -1;
                state.upNextTriggered = false;
                document.getElementById('queue-wrapper').classList.remove('preview-expanded', 'track-swap-out');
                ui.renderQueue();
                primeNextTrack();
                persist.save();
            },
            clearHistory: () => {
                state.playHistory = [];
                localStorage.setItem('playHistory', JSON.stringify([]));
                ui.renderHistory();
                if (ui.renderLibraryLists) ui.renderLibraryLists();
                persist.save();
            },
            getUpcomingTrack,
            getPreviousTrack,
            showSimilarSongs: async () => {
                if (!state.currentTrack || !window.recommendationClient) return;
                const songs = await window.recommendationClient.fetchPlaylist('similar', { songId: state.currentTrack.id, limit: 25 });
                if (songs.length === 0) return alert('No similar songs found yet. Try again after the API warms up.');
                state.queue = songs.map(song => ({ ...song, source: 'recommendation', playlistType: 'similar' })); state.userQueue = []; state.idx = 0;
                ui.openGeneratedPlaylist('Similar Songs', state.queue);
            },
            startRadioFromCurrent: async () => {
                if (!state.currentTrack || !window.recommendationClient) return;
                const artist = (state.currentTrack.artist || '').split(',')[0].trim();
                const songs = await window.recommendationClient.fetchPlaylist('artist-radio', { artist, limit: 25 });
                if (songs.length === 0) return alert('No radio songs found yet.');
                state.queue = songs.map(song => ({ ...song, source: 'recommendation', playlistType: 'artist-radio' })); state.userQueue = []; state.idx = 0;
                ui.openGeneratedPlaylist(`${artist} Radio`, state.queue);
            }
        };

        audio.addEventListener('play', () => { 
            state.playing = true;
            state.wasPlayingBeforeHidden = true;
            state.userPaused = false;
            if (window.listeningSession) listeningSession.setPlaying(true);
            ui.updatePlayBtn();
            persist.save();
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
            updateMediaPosition();
            if (typeof desktop !== 'undefined' && desktop.sendMediaState) desktop.sendMediaState();

            // Ensure AudioContext and Visualizer animate smoothly on external/system play
            if (!isAudioContextInitialized) setupAudioContext();
            if (audioContext && audioContext.state === 'suspended') {
                audioContext.resume().catch(() => {});
            }
            if (typeof viz !== 'undefined' && viz.start) viz.start();
        });
        audio.addEventListener('pause', () => {
            if (isPlaybackPending && !state.userPaused) return;
            state.playing = false;
            if (state.userPaused || audio.ended) {
                state.wasPlayingBeforeHidden = false;
            }
            if (window.listeningSession) listeningSession.setPlaying(false);
            state.loading = false;
            ui.setPlayerLoading(false);
            ui.updatePlayBtn();
            if (document.visibilityState !== 'hidden') {
                persist.save();
            }
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
            updateMediaPosition();
            if (typeof desktop !== 'undefined' && desktop.sendMediaState) desktop.sendMediaState();
            if (typeof viz !== 'undefined' && viz.start) viz.start();
        });

        audio.addEventListener('playing', () => {
            if (_streamStartupTimer) { clearTimeout(_streamStartupTimer); _streamStartupTimer = null; }
            state._audioRetryCount = 0;
            _consecutiveStreamFailures = 0;
            state.playing = true;
            state.loading = false;
            ui.setPlayerLoading(false);
            ui.updatePlayBtn();
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
            updateMediaPosition();
            if (typeof desktop !== 'undefined' && desktop.sendMediaState) desktop.sendMediaState();
            if (typeof viz !== 'undefined' && viz.start) viz.start();
        });

        let stallCheckTimer = null;
        ['loadstart', 'waiting', 'stalled'].forEach((eventName) => {
            audio.addEventListener(eventName, () => {
                if (!state.currentTrack || !audio.src || isAudioRecoveryPending) return;
                state.loading = true;
                ui.setPlayerLoading(true);

                if (eventName === 'waiting' || eventName === 'stalled') {
                    if (stallCheckTimer) clearTimeout(stallCheckTimer);
                    stallCheckTimer = setTimeout(() => {
                        stallCheckTimer = null;
                        if (!state.playing || !state.currentTrack) return;
                        const isOffline = typeof window !== 'undefined' && typeof window.__dtunesIsOffline === 'function'
                            ? window.__dtunesIsOffline()
                            : (typeof navigator !== 'undefined' && !navigator.onLine);
                        const isDownloaded = typeof offlineStore !== 'undefined' && offlineStore && offlineStore.isDownloaded && offlineStore.isDownloaded(state.currentTrack.id);
                        if (isOffline && !isDownloaded) {
                            const pausedTime = Math.max(0, audio.currentTime || 0);
                            audio.pause();
                            state.playing = false;
                            state.loading = false;
                            state._playbackPausedDueToNetwork = {
                                trackId: state.currentTrack.id,
                                position: pausedTime
                            };
                            ui.setPlayerLoading(false);
                            ui.updatePlayBtn();
                            if (typeof desktop !== 'undefined' && desktop.sendMediaState) {
                                desktop.sendMediaState();
                            }
                            if (window.ui && ui.showToast) {
                                const min = Math.floor(pausedTime / 60);
                                const sec = Math.floor(pausedTime % 60).toString().padStart(2, '0');
                                ui.showToast(`Streaming paused — connection lost at ${min}:${sec}. Downloaded songs ready.`, 'warning', 4500);
                            }
                        }
                    }, 1800);
                }
            });
        });

        // Resume stream if connection is restored
        window.addEventListener('dtunes:network-restored', async () => {
            if (state._playbackPausedDueToNetwork && state.currentTrack && state._playbackPausedDueToNetwork.trackId === state.currentTrack.id) {
                const resumePos = state._playbackPausedDueToNetwork.position || 0;
                state._playbackPausedDueToNetwork = null;
                if (window.ui && ui.showToast) {
                    ui.showToast('Connection restored! Resuming music...', 'success', 3000);
                }
                try {
                    if (state.currentTrack.url) {
                        applyAudioCorsPolicy(audio);
                        audio.src = state.currentTrack.url;
                        if (!isMobileDevice) audio.load();
                        if (resumePos > 0) {
                            try { audio.currentTime = resumePos; } catch (_) {}
                        }
                        await audio.play();
                        state.playing = true;
                        ui.updatePlayBtn();
                        if (typeof desktop !== 'undefined' && desktop.sendMediaState) {
                            desktop.sendMediaState();
                        }
                    }
                } catch (err) {
                    console.warn('[DTunes] Reconnect resume error:', err);
                }
            }
        });
        ['canplay', 'canplaythrough', 'loadeddata', 'loadedmetadata'].forEach((eventName) => {
            audio.addEventListener(eventName, () => {
                if (_streamStartupTimer && (eventName === 'canplay' || eventName === 'canplaythrough')) {
                    clearTimeout(_streamStartupTimer);
                    _streamStartupTimer = null;
                }
                state.loading = false;
                ui.setPlayerLoading(false);
                if (eventName === 'loadedmetadata') {
                    updateMediaPosition();
                    if (typeof desktop !== 'undefined' && desktop.sendMediaState) desktop.sendMediaState();
                }
            });
        });
        ['durationchange', 'seeked'].forEach((eventName) => {
            audio.addEventListener(eventName, () => {
                updateMediaPosition();
                if (typeof desktop !== 'undefined' && desktop.sendMediaState) desktop.sendMediaState();
            });
        });

        audio.addEventListener('error', recoverFromAudioError);

        // Periodic state reconciliation against native <audio>
        setInterval(() => {
            if (!state.loaded || isPlaybackPending) return;
            const isAudioRunning = !audio.paused && !audio.ended;
            if (isAudioRunning !== state.playing && !state.loading) {
                state.playing = isAudioRunning;
                ui.updatePlayBtn();
            }
        }, 2000);

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                state.wasPlayingBeforeHidden = Boolean(state.playing || !audio.paused);
                persist.save();
                cloudLibrary.flushPlaybackState(true);
            } else {
                isPlaybackPending = false;
                state.loading = false;
                ui.setPlayerLoading(false);

                if (audioContext && audioContext.state === 'suspended') {
                    audioContext.resume().catch(err => console.warn('[DTunes] audioContext resume failed:', err));
                }

                // If audio is already playing smoothly in the background, DO NOT touch or restart it!
                if (!audio.paused && !audio.ended) {
                    state.playing = true;
                    ui.updatePlayBtn();
                } else if (state.wasPlayingBeforeHidden && !state.userPaused && audio.paused && !audio.ended) {
                    // Only resume if OS/browser paused the element while hidden
                    audio.play().then(() => {
                        state.playing = true;
                        ui.updatePlayBtn();
                    }).catch(err => {
                        console.warn('[DTunes] Could not resume audio on focus:', err);
                    });
                }
            }
            if ('mediaSession' in navigator && (state.playing || !audio.paused)) {
                navigator.mediaSession.playbackState = 'playing';
            }
        });
        window.addEventListener('pagehide', () => {
            if (window.listeningSession) listeningSession.finalize();
            persist.save();
            cloudLibrary.flushPlaybackState(true);
        });
        window.addEventListener('beforeunload', () => {
            if (window.listeningSession) listeningSession.finalize();
            persist.save();
            cloudLibrary.flushPlaybackState(true);
        });


        window.requestPlay = requestPlay;
        window.requestPause = requestPause;
        player.updateMediaPosition = updateMediaPosition;

        // Register initial MediaSession action handlers so iOS Lock Screen & Windows SMTC detect transport capability immediately
        const registerMediaSessionHandlers = () => {
            if (!('mediaSession' in navigator) || typeof navigator.mediaSession.setActionHandler !== 'function') return;
            const safeSet = (act, fn) => {
                try { navigator.mediaSession.setActionHandler(act, fn); } catch (_) {}
            };
            safeSet('play', () => requestPlay());
            safeSet('pause', () => requestPause());
            safeSet('stop', () => requestPause());
            safeSet('previoustrack', () => player.prev());
            safeSet('nexttrack', () => player.next(true));
            safeSet('seekbackward', (details) => {
                const clock = window.getActivePlaybackClock();
                player.seek(Math.max(clock.currentTime - (details?.seekOffset || 10), 0));
                updateMediaPosition();
            });
            safeSet('seekforward', (details) => {
                const clock = window.getActivePlaybackClock();
                player.seek(Math.min(clock.currentTime + (details?.seekOffset || 10), clock.duration || 0));
                updateMediaPosition();
            });
            safeSet('seekto', (details) => {
                if (!details || !Number.isFinite(details.seekTime)) return;
                const clock = window.getActivePlaybackClock();
                player.seek(Math.max(0, Math.min(details.seekTime, clock.duration || details.seekTime)));
                updateMediaPosition();
            });
        };
        registerMediaSessionHandlers();
        if (typeof window !== 'undefined') {
            window.registerMediaSessionHandlers = registerMediaSessionHandlers;
        }

        window.__dtunesMediaHandlers = {
            play: () => requestPlay(),
            pause: () => requestPause(),
            playpause: () => {
                const isRunning = Boolean(state.playing || !audio.paused);
                if (isRunning) requestPause(); else requestPlay();
            },
            nexttrack: () => player.next(true),
            previoustrack: () => player.prev()
        };

        window.player = player;
