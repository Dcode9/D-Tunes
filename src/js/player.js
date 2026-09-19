        // ============================================
        // PLAYER LOGIC & MEDIA SESSION
        // ============================================
        const audio = document.getElementById('audio-el');
        const isMobileDevice = /Mobi|Android|iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        audio.crossOrigin = 'anonymous';
        audio.setAttribute('crossorigin', 'anonymous');
        audio.setAttribute('playsinline', '');
        audio.setAttribute('webkit-playsinline', '');
        audio.preload = 'auto';
        const preloadAudio = isMobileDevice ? null : new Audio();
        if (preloadAudio) {
            preloadAudio.crossOrigin = 'anonymous';
            preloadAudio.setAttribute('crossorigin', 'anonymous');
            preloadAudio.preload = 'auto';
        }
        let isPlaybackPending = false;
        let isAudioRecoveryPending = false;
        let playRequestId = 0;


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
            if (!state.queue || state.queue.length === 0) return null;
            if (state.shuffle) {
                if (!state.shuffledOrder || state.shuffledOrder.length !== state.queue.length) {
                    generateShuffledQueue();
                }
                if (state.shufflePointer > 0) {
                    const prevShuffleIdx = state.shuffledOrder[state.shufflePointer - 1];
                    return state.queue[prevShuffleIdx] || null;
                }
                return state.queue.length > 1 ? state.queue[state.shuffledOrder[state.shuffledOrder.length - 1]] : null;
            }
            if (state.idx > 0) return state.queue[state.idx - 1];
            return state.queue.length > 1 ? state.queue[state.queue.length - 1] : null;
        };

        const primeNextTrack = async () => {
            const nextTrack = getUpcomingTrack();
            if (!nextTrack?.id || state.nextTrackPreloadId === nextTrack.id) return;
            state.nextTrackPreloadId = nextTrack.id;
            try {
                const freshDetails = nextTrack.url ? null : await jiosaavnAPI.getSong(nextTrack.id);
                const playUrl = freshDetails?.url || nextTrack.url;
                if (!playUrl || state.nextTrackPreloadId !== nextTrack.id) return;
                Object.assign(nextTrack, freshDetails || {}, { url: playUrl });
                if (preloadAudio) {
                    preloadAudio.src = playUrl;
                    preloadAudio.load();
                }
            } catch (e) {}
        };

        const updateMediaPosition = () => {
            if (!('mediaSession' in navigator) || typeof navigator.mediaSession.setPositionState !== 'function' || !state.currentTrack) return;
            const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : Number(state.currentTrack.duration) || 0;
            const position = Number.isFinite(audio.currentTime) ? Math.max(0, Math.min(audio.currentTime, duration || audio.currentTime)) : 0;
            if (duration > 0) {
                try { navigator.mediaSession.setPositionState({ duration, playbackRate: audio.playbackRate || 1, position }); } catch (e) {}
            }
        };

        const resetSeekbarAndTimes = (track = null) => {
            currentProgress = 0;
            if (audio) {
                try { audio.currentTime = 0; } catch (_) {}
            }
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
            if (state.currentTrack && (!audio.src || !jiosaavnAPI.isStreamingUrl(audio.src))) {
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
                ui.updatePlayBtn();
            } catch (e) {
                console.warn('[DTunes] Playback failed, resetting state:', e);
                state.playing = false;
                state.loading = false;
                ui.setPlayerLoading(false);
                ui.updatePlayBtn();
            }
        };

        const requestPause = () => {
            state.userPaused = true;
            audio.pause();
            state.playing = false;
            ui.updatePlayBtn();
        };

        const recoverFromAudioError = async () => {
            if (!state.currentTrack || isAudioRecoveryPending) return;
            // Ignore aborts (e.g. from rapid track skipping or new track load) and non-errors
            if (audio.error && (audio.error.code === 1 || audio.error.code === 0)) {
                return;
            }
            isAudioRecoveryPending = true;
            state.loading = true;
            ui.setPlayerLoading(true);

            const resumeTime = Math.max(0, audio.currentTime || 0);
            state._audioRetryCount = (state._audioRetryCount || 0) + 1;

            try {
                // Attempts 1 & 2: Smooth retry at current timestamp before skipping track
                if (state._audioRetryCount <= 2 && state.currentTrack.url) {
                    await new Promise(r => setTimeout(r, 400));
                    audio.crossOrigin = 'anonymous';
                    audio.src = state.currentTrack.url;
                    audio.load();
                    if (resumeTime > 0) {
                        try { audio.currentTime = resumeTime; } catch (_) {}
                    }
                    if (state.playing || !state.userPaused) await audio.play();
                    return;
                }

                // Attempt 3: Refresh song details from API
                const refreshed = await jiosaavnAPI.getSong(state.currentTrack.id);
                if (refreshed?.url) {
                    state.currentTrack.url = refreshed.url;
                    audio.crossOrigin = 'anonymous';
                    audio.src = refreshed.url;
                    audio.load();
                    if (resumeTime > 0) {
                        try { audio.currentTime = resumeTime; } catch (_) {}
                    }
                    if (state.playing || !state.userPaused) await audio.play();
                    return;
                }

                if (switchToNextApi()) {
                    const retried = await jiosaavnAPI.getSong(state.currentTrack.id);
                    if (retried?.url) {
                        state.currentTrack.url = retried.url;
                        audio.crossOrigin = 'anonymous';
                        audio.src = retried.url;
                        audio.load();
                        if (resumeTime > 0) {
                            try { audio.currentTime = resumeTime; } catch (_) {}
                        }
                        if (state.playing || !state.userPaused) await audio.play();
                        return;
                    }
                }

                player.next();
            } catch (e) {
                if (state._audioRetryCount > 2) {
                    player.next();
                }
            } finally {
                isAudioRecoveryPending = false;
                state.loading = false;
                ui.setPlayerLoading(false);
            }
        };

        window.playSongById = (storeId) => {
            const song = songStore.get(storeId);
            if (song) { player.playDirect(song); } 
        };

        window.playContext = async (type, id) => {
            try {
                const data = await jiosaavnAPI.fetchWithRetry(`${JIOSAAVN_API}/${type}s?id=${id}`);
                let songs = [];
                if(type === 'album') songs = (data.data?.songs || []).map(jiosaavnAPI.normalizeSong).filter(Boolean);
                else if (type === 'artist') songs = (data.data?.topSongs || data.data?.songs || []).map(jiosaavnAPI.normalizeSong).filter(Boolean);
                
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
                if (!state.currentTrack || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
                const progress = audio.currentTime / audio.duration;
                if (progress > 0.02 && progress < 0.5 && recommendationEvents.completedSongId !== state.currentTrack.id) {
                    recommendationEvents.record('skip', state.currentTrack, {
                        playDurationSeconds: Math.floor(audio.currentTime),
                        songDurationSeconds: Math.floor(audio.duration),
                    });
                }
            }
        };

        const player = {
            playDirect: async (track) => {
                if (!track) return;
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
                    audio.crossOrigin = 'anonymous';
                    audio.preload = 'auto';
                    audio.src = urlToPlay;
                    audio.load();

                    state.loaded = true;
                    ui.enableControls();
                    audio.loop = (state.repeat === 2);

                    try {
                        await audio.play();
                    } catch (playErr) {
                        if (audio.crossOrigin) {
                            console.warn('[DTunes] Retrying audio play without crossOrigin:', playErr);
                            audio.removeAttribute('crossorigin');
                            audio.load();
                            await audio.play();
                        } else {
                            throw playErr;
                        }
                    }
                    if (currentRequestId !== playRequestId) return false;

                    state.playing = true;
                    state.loading = false;
                    ui.setPlayerLoading(false);
                    ui.updatePlayBtn();

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
                    if(state.playHistory.length > 100) state.playHistory.pop();
                    localStorage.setItem('playHistory', JSON.stringify(state.playHistory));
                    
                    if (window.listeningSession) listeningSession.start(state.currentTrack);
                    ui.renderHistory();
                    if(!document.getElementById('view-home').classList.contains('hidden')) homeView.renderRecentlyPlayed();
                    persist.save();
                    return true;
                };

                try {
                    const hasStreamUrl = Boolean(track.url && (jiosaavnAPI.isStreamingUrl(track.url) || track.url.startsWith('http')));
                    if (hasStreamUrl) {
                        // Instant playback with known streaming URL
                        await setupAndStartPlayback(track.url);
                        // Refresh details asynchronously in background for 320kbps upgrade and accurate lyrics
                        jiosaavnAPI.getSong(track.id).then((freshDetails) => {
                            if (currentRequestId === playRequestId && freshDetails) {
                                state.currentTrack = { ...state.currentTrack, ...freshDetails };
                                ui.updateMetadata(state.currentTrack);
                                if (typeof lyricsManager !== 'undefined') lyricsManager.fetchLyricsForTrack(state.currentTrack);
                            }
                        }).catch(() => {});
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
                    if (currentRequestId === playRequestId) {
                        console.error('[DTunes] Error playing track:', error);
                        state.playing = false;
                        state.loading = false;
                        ui.setPlayerLoading(false);
                        ui.updatePlayBtn();
                    }
                } finally {
                    clearTimeout(safetyTimer);
                    if (currentRequestId === playRequestId) {
                        isPlaybackPending = false;
                    }
                }
            },
            togglePlay: () => {
                if(!state.loaded) return;
                if (typeof viz !== 'undefined') viz.start();
                if(state.playing || !audio.paused) { requestPause(); } else { requestPlay(); }
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
                if (audio.currentTime > 3) {
                    audio.currentTime = 0;
                    if (typeof viz !== 'undefined' && viz.start) viz.start();
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
            setVolume: (val) => { audio.volume = Math.max(0, Math.min(1, val)); },
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
            isLiked: (songId) => state.likedIds.some(item => (typeof item === 'object' ? item.id : item) === songId),
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
                    const data = await jiosaavnAPI.fetchWithRetry(`${JIOSAAVN_API}/albums?id=${albumId}`);
                    const songs = (data.data?.songs || []).map(jiosaavnAPI.normalizeSong).filter(Boolean);
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
                    const data = await jiosaavnAPI.fetchWithRetry(`${JIOSAAVN_API}/albums?id=${albumId}`);
                    const songs = (data.data?.songs || []).map(jiosaavnAPI.normalizeSong).filter(Boolean);
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

            // Ensure AudioContext and Visualizer animate smoothly on external/system play
            if (!isAudioContextInitialized) setupAudioContext();
            if (audioContext && audioContext.state === 'suspended') {
                audioContext.resume().catch(() => {});
            }
            if (typeof viz !== 'undefined' && viz.start) viz.start();
        });
        audio.addEventListener('pause', () => { 
            // Only update play state if the user explicitly requested a pause,
            // or if the playback naturally ended, or if the page is visible.
            if (state.userPaused || audio.ended || document.visibilityState !== 'hidden') {
                state.playing = false;
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
            if (typeof viz !== 'undefined' && viz.start) viz.start();
        });

        audio.addEventListener('playing', () => {
            state._audioRetryCount = 0;
            state.loading = false;
            ui.setPlayerLoading(false);
            if (typeof viz !== 'undefined' && viz.start) viz.start();
        });

        ['loadstart', 'waiting', 'stalled'].forEach((eventName) => {
            audio.addEventListener(eventName, () => {
                if (!state.currentTrack) return;
                state.loading = true;
                ui.setPlayerLoading(true);
            });
        });
        ['canplay', 'canplaythrough', 'loadeddata', 'loadedmetadata'].forEach((eventName) => {
            audio.addEventListener(eventName, () => {
                state.loading = false;
                ui.setPlayerLoading(false);
            });
        });

        audio.addEventListener('error', recoverFromAudioError);

        // Periodic state reconciliation: catches any desync between audio
        // element and UI state without false triggers from buffering readyState.
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

