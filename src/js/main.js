        function initApp() {
            installGlobalImageFallback();

            const vCanvas = document.getElementById('visualizer-canvas'); visualizerCtx = vCanvas.getContext('2d');
            vizCanvas = vCanvas;
            vizSeekTrack = document.getElementById('seek-bar-track');
            resizeCanvas = () => {
                const container = document.getElementById('seek-bar-container'); const dpr = Math.min(window.devicePixelRatio || 1, 2);
                vCanvas.width = container.offsetWidth * dpr; vCanvas.height = container.offsetHeight * dpr;
                visualizerCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
                lastClipProgress = -1; // Force clipPath update on resize
            };
            resizeCanvas(); window.addEventListener('resize', resizeCanvas);

            deviceMode.apply();
            ui.setMobileNavActive('home');
            ui.updateMobileSearchPosition();

            const searchShell = document.getElementById('search-shell');
            if (searchShell) {
                searchShell.addEventListener('click', (e) => {
                    if (!deviceMode.isMobileUI()) return;
                    if (e.target.closest('.mobile-search-cancel')) return;
                    if (document.body.classList.contains('mobile-search-open')) return;
                    e.preventDefault();
                    haptics.trigger('selection');
                    ui.openMobileSearch();
                });
            }

            // Keep haptics user-driven by triggering only on direct pointer interactions.
            document.addEventListener('pointerdown', (e) => {
                const control = e.target.closest('button, [onclick], #mobile-nav [data-nav], #app-logo');
                if (!control) return;
                if (control.tagName === 'BUTTON' && (control.disabled || control.classList.contains('disabled'))) return;

                const id = (control.id || '').toLowerCase();
                const nav = (control.dataset?.nav || '').toLowerCase();
                const clickExpr = (control.getAttribute('onclick') || '').toLowerCase();
                const semantic = `${id} ${nav} ${clickExpr}`;

                if (/delete|remove|error|danger/.test(semantic)) {
                    haptics.trigger('warning');
                    return;
                }
                if (/toggleplay|playsongbyid|playcontext|playplaylist|btn-play|btn-next|btn-prev|next|prev/.test(semantic)) {
                    haptics.trigger('medium');
                    return;
                }
                if (/togglelike|like|shuffle|repeat/.test(semantic)) {
                    haptics.trigger('light');
                    return;
                }
                if (/openmobilesearch|closemobilesearch|switchview|scrolltolibrary|togglemodal|settings|profile|search|home|library/.test(semantic)) {
                    haptics.trigger('selection');
                    return;
                }

                haptics.trigger('selection');
            }, { passive: true });

            if ('virtualKeyboard' in navigator) {
                try {
                    navigator.virtualKeyboard.overlaysContent = true;
                    navigator.virtualKeyboard.addEventListener('geometrychange', () => ui.updateMobileSearchPosition());
                } catch (e) {}
            }

            if (window.visualViewport) {
                const onViewportChange = () => ui.updateMobileSearchPosition();
                window.visualViewport.addEventListener('resize', onViewportChange);
                window.visualViewport.addEventListener('scroll', onViewportChange);
            }

            const seekBar = document.getElementById('seek-bar'); const container = document.getElementById('seek-bar-container'); const tooltip = document.getElementById('seek-tooltip');
            const setDragging = (dragging) => {
                state.isDragging = dragging;
                if (!dragging) persist.save();
            };

            seekBar.addEventListener('mousedown', () => setDragging(true));
            seekBar.addEventListener('pointerdown', () => setDragging(true));
            seekBar.addEventListener('touchstart', () => setDragging(true), { passive: true });

            seekBar.addEventListener('mouseup', () => setDragging(false));
            seekBar.addEventListener('pointerup', () => setDragging(false));
            seekBar.addEventListener('pointercancel', () => setDragging(false));
            seekBar.addEventListener('mouseleave', () => setDragging(false));
            seekBar.addEventListener('touchend', () => setDragging(false), { passive: true });
            seekBar.addEventListener('touchcancel', () => setDragging(false), { passive: true });

            seekBar.addEventListener('input', () => {
                if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
                const nextTime = parseFloat(seekBar.value);
                if (!Number.isFinite(nextTime)) return;
                currentProgress = Math.max(0, Math.min(1, nextTime / audio.duration));
                if (Math.abs(audio.currentTime - nextTime) > 0.08) {
                    audio.currentTime = nextTime;
                    updateMediaPosition();
                    if (typeof lyricsManager !== 'undefined' && lyricsManager.syncTime) {
                        lyricsManager.syncTime(nextTime, true);
                    }
                    if (typeof viz !== 'undefined') viz.start();
                }
            });

            seekBar.addEventListener('change', () => {
                if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
                const nextTime = parseFloat(seekBar.value);
                if (!Number.isFinite(nextTime)) return;
                audio.currentTime = nextTime;
                updateMediaPosition();
                currentProgress = Math.max(0, Math.min(1, nextTime / audio.duration));
                if (typeof lyricsManager !== 'undefined' && lyricsManager.syncTime) {
                    lyricsManager.syncTime(nextTime, true);
                }
                if (typeof viz !== 'undefined') viz.start();
                setDragging(false);
            });

            audio.addEventListener('loadedmetadata', () => {
                if (Number.isFinite(audio.duration) && audio.duration > 0) {
                    seekBar.max = audio.duration;
                    updateMediaPosition();
                    primeNextTrack();
                }
            });

            container.addEventListener('mousemove', (e) => {
                if(!state.loaded || !audio.duration) return; const rect = container.getBoundingClientRect();
                if (e.clientY - rect.top < rect.height / 2) { state.hoverProgress = -1; tooltip.classList.remove('visible'); return; }
                const progress = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)); state.hoverProgress = progress; state.lastHoverProgress = progress;
                const hoverTime = progress * audio.duration; tooltip.textContent = `${Math.floor(hoverTime / 60)}:${Math.floor(hoverTime % 60).toString().padStart(2, '0')}`;
                tooltip.style.left = `${(e.clientX - rect.left)}px`; tooltip.classList.add('visible');
            });
            container.addEventListener('mouseleave', () => { state.hoverProgress = -1; tooltip.classList.remove('visible'); });

            // Mobile compact player: drag horizontally to preview and slide into previous/next track.
            let touchStartX = 0; let touchStartY = 0; let touchDeltaX = 0; let touchDeltaY = 0; let compactSwipeActive = false;
            const island = document.getElementById('info-island');
            const activeArea = document.getElementById('player-active-area');
            const resetCompactSwipe = () => {
                compactSwipeActive = false;
                touchDeltaX = 0;
                touchDeltaY = 0;
                activeArea?.style.setProperty('--swipe-x', '0px');
                activeArea?.classList.remove('swiping', 'swipe-left', 'swipe-right', 'commit-next', 'commit-prev');
            };
            island.addEventListener('touchstart', e => {
                if (!deviceMode.isMobileUI() || !state.currentTrack || document.body.classList.contains('mobile-player-open') || e.target.closest('button')) return;
                touchStartX = e.changedTouches[0].screenX;
                touchStartY = e.changedTouches[0].screenY;
                touchDeltaX = 0;
                touchDeltaY = 0;
                compactSwipeActive = true;
                ui.renderCompactSwipePreview();
                activeArea?.classList.add('swiping');
            }, {passive: true});
            island.addEventListener('touchmove', e => {
                if (!compactSwipeActive || !deviceMode.isMobileUI() || document.body.classList.contains('mobile-player-open')) return;
                touchDeltaX = e.changedTouches[0].screenX - touchStartX;
                touchDeltaY = e.changedTouches[0].screenY - touchStartY;
                if (Math.abs(touchDeltaX) < 8 && Math.abs(touchDeltaY) < 8) return;
                if (Math.abs(touchDeltaX) > Math.abs(touchDeltaY)) {
                    const clamped = Math.max(-112, Math.min(112, touchDeltaX));
                    activeArea?.style.setProperty('--swipe-x', `${clamped}px`);
                    activeArea?.classList.toggle('swipe-left', clamped < -12);
                    activeArea?.classList.toggle('swipe-right', clamped > 12);
                }
            }, {passive: true});
            island.addEventListener('touchend', e => {
                if (!deviceMode.isMobileUI() || !state.currentTrack || document.body.classList.contains('mobile-player-open')) return;
                if (e.target.closest('button')) { resetCompactSwipe(); return; }
                const touchEndX = e.changedTouches[0].screenX; const touchEndY = e.changedTouches[0].screenY;
                const deltaX = touchEndX - touchStartX; const deltaY = touchEndY - touchStartY;

                if (Math.abs(deltaX) < 12 && Math.abs(deltaY) < 12) {
                    resetCompactSwipe();
                    haptics.pulse('medium');
                    ui.toggleMobilePlayer(true);
                    return;
                }

                if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 56) {
                    haptics.pulse('soft');
                    const goNext = deltaX < 0;
                    activeArea?.classList.add(goNext ? 'commit-next' : 'commit-prev');
                    activeArea?.style.setProperty('--swipe-x', goNext ? '-130%' : '130%');
                    setTimeout(() => {
                        if (goNext) player.next(); else player.prev();
                        resetCompactSwipe();
                    }, 170);
                } else if (deltaY < -40) {
                    resetCompactSwipe();
                    haptics.pulse('medium');
                    ui.toggleMobilePlayer(true);
                } else {
                    resetCompactSwipe();
                }
            }, {passive: true});
            island.addEventListener('touchcancel', resetCompactSwipe, {passive: true});

            const albumArtSwipeTarget = document.getElementById('album-art-wrapper');
            let albumSwipeStart = null;
            const resetAlbumSwipe = () => {
                albumSwipeStart = null;
                albumArtSwipeTarget?.style.setProperty('--album-swipe-x', '0px');
                albumArtSwipeTarget?.classList.remove('album-swiping');
            };
            albumArtSwipeTarget?.addEventListener('touchstart', e => {
                if (!deviceMode.isMobileUI() || !document.body.classList.contains('mobile-player-open') || !state.currentTrack) return;
                const touch = e.changedTouches[0];
                albumSwipeStart = { x: touch.clientX, y: touch.clientY };
                albumArtSwipeTarget.classList.add('album-swiping');
            }, { passive: true });
            albumArtSwipeTarget?.addEventListener('touchmove', e => {
                if (!albumSwipeStart) return;
                const touch = e.changedTouches[0];
                const dx = touch.clientX - albumSwipeStart.x;
                const dy = touch.clientY - albumSwipeStart.y;
                if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
                    albumArtSwipeTarget.style.setProperty('--album-swipe-x', `${Math.max(-120, Math.min(120, dx))}px`);
                }
            }, { passive: true });
            albumArtSwipeTarget?.addEventListener('touchend', e => {
                if (!albumSwipeStart) return;
                const touch = e.changedTouches[0];
                const dx = touch.clientX - albumSwipeStart.x;
                const dy = touch.clientY - albumSwipeStart.y;
                if (Math.abs(dx) > 72 && Math.abs(dx) > Math.abs(dy) * 1.2) {
                    const goNext = dx < 0;
                    albumArtSwipeTarget.style.setProperty('--album-swipe-x', goNext ? '-120%' : '120%');
                    haptics.pulse('soft');
                    setTimeout(() => { if (goNext) player.next(); else player.prev(); resetAlbumSwipe(); }, 180);
                } else {
                    resetAlbumSwipe();
                }
            }, { passive: true });
            albumArtSwipeTarget?.addEventListener('touchcancel', resetAlbumSwipe, { passive: true });

            // Expanded mobile player: pull down on header to collapse
            const playerFooter = document.getElementById('player-footer');
            const mobileHeader = document.querySelector('.mobile-player-header');
            let expandedPlayerTouchStartY = 0;

            const resetExpandedPlayerScroll = () => {
                if (playerFooter) playerFooter.scrollTop = 0;
            };

            mobileHeader?.addEventListener('touchstart', e => {
                if (!deviceMode.isMobileUI() || !document.body.classList.contains('mobile-player-open')) return;
                expandedPlayerTouchStartY = e.changedTouches[0].clientY;
            }, {passive: true});

            mobileHeader?.addEventListener('touchmove', e => {
                if (!deviceMode.isMobileUI() || !document.body.classList.contains('mobile-player-open') || !expandedPlayerTouchStartY) return;
                const pullDistance = e.changedTouches[0].clientY - expandedPlayerTouchStartY;
                if (pullDistance > 55) {
                    expandedPlayerTouchStartY = 0;
                    haptics.pulse('soft');
                    ui.toggleMobilePlayer(false);
                }
            }, {passive: true});

            mobileHeader?.addEventListener('touchend', () => {
                expandedPlayerTouchStartY = 0;
            }, {passive: true});

            document.addEventListener('mobile-player-opened', resetExpandedPlayerScroll);

            let queueDragSource = null;
            document.addEventListener('dragstart', (e) => {
                const row = e.target.closest('.queue-reorder-row');
                if (!row) return;
                queueDragSource = { section: row.dataset.queueSection, index: Number(row.dataset.queueIndex) };
                row.classList.add('is-dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', JSON.stringify(queueDragSource));
            });
            document.addEventListener('dragover', (e) => {
                const row = e.target.closest('.queue-reorder-row');
                if (!row || !queueDragSource) return;
                e.preventDefault();
                row.classList.add('drag-over');
            });
            document.addEventListener('dragleave', (e) => {
                e.target.closest('.queue-reorder-row')?.classList.remove('drag-over');
            });
            document.addEventListener('drop', (e) => {
                const row = e.target.closest('.queue-reorder-row');
                if (!row || !queueDragSource) return;
                e.preventDefault();
                ui.reorderQueueItem(queueDragSource.section, queueDragSource.index, row.dataset.queueSection, Number(row.dataset.queueIndex));
                document.querySelectorAll('.queue-reorder-row').forEach(el => el.classList.remove('drag-over', 'is-dragging'));
                queueDragSource = null;
            });
            document.addEventListener('dragend', () => {
                document.querySelectorAll('.queue-reorder-row').forEach(el => el.classList.remove('drag-over', 'is-dragging'));
                queueDragSource = null;
            });

            let swipeSongStart = null;
            document.addEventListener('touchstart', (e) => {
                const row = e.target.closest('.swipe-song');
                if (!row || !deviceMode.isMobileUI() || e.target.closest('button, input, select, textarea')) return;
                const touch = e.changedTouches[0];
                swipeSongStart = { row, x: touch.clientX, y: touch.clientY, moved: false };
            }, { passive: true });
            document.addEventListener('touchmove', (e) => {
                if (!swipeSongStart) return;
                const touch = e.changedTouches[0];
                const dx = touch.clientX - swipeSongStart.x;
                const dy = touch.clientY - swipeSongStart.y;
                if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
                    swipeSongStart.moved = true;
                    const clamped = Math.max(-128, Math.min(128, dx));
                    const progress = Math.min(1, Math.abs(clamped) / 96);
                    swipeSongStart.row.style.setProperty('--song-swipe-x', `${clamped}px`);
                    swipeSongStart.row.style.setProperty('--swipe-scale', progress.toFixed(3));
                    swipeSongStart.row.classList.add('is-swiping');
                    swipeSongStart.row.classList.toggle('swipe-show-next', dx > 14);
                    swipeSongStart.row.classList.toggle('swipe-show-queue', dx < -14);
                }
            }, { passive: true });
            document.addEventListener('touchend', (e) => {
                if (!swipeSongStart) return;
                const { row, x, y } = swipeSongStart;
                const touch = e.changedTouches[0];
                const dx = touch.clientX - x;
                const dy = touch.clientY - y;
                row.style.setProperty('--song-swipe-x', '0px');
                row.style.setProperty('--swipe-scale', '0');
                row.classList.remove('is-swiping', 'swipe-show-next', 'swipe-show-queue');
                swipeSongStart = null;
                if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.2) {
                    const song = songStore.get(row.dataset.storeId);
                    if (!song) return;
                    const isPlayNext = dx > 0;
                    const commitClass = isPlayNext ? 'swipe-committed-next' : 'swipe-committed-queue';
                    row.classList.add(commitClass);
                    row.style.setProperty('--song-swipe-x', isPlayNext ? '115%' : '-115%');
                    if (isPlayNext) player.addNext(song); else player.addToQueue(song);
                    haptics.pulse('medium');
                    setTimeout(() => { row.classList.remove(commitClass); row.style.setProperty('--song-swipe-x', '0px'); row.style.setProperty('--swipe-scale', '0'); }, 420);
                    e.preventDefault();
                }
            }, { passive: false });

            // Touch swiping / dragging for overflowing marquee text
            let marqueeTouchStart = null;
            document.addEventListener('touchstart', (e) => {
                const container = e.target.closest('.marquee-container.is-overflowing');
                if (!container) return;
                const text = container.querySelector('.marquee-text');
                if (!text) return;

                const touch = e.changedTouches[0];
                const computed = window.getComputedStyle(text);
                const matrix = new DOMMatrixReadOnly(computed.transform);
                marqueeTouchStart = {
                    container,
                    text,
                    startX: touch.clientX,
                    startMatrixX: matrix.m41 || 0,
                    scrollDist: parseFloat(text.style.getPropertyValue('--scroll-dist')) || 0,
                    moved: false
                };
            }, { passive: true });

            document.addEventListener('touchmove', (e) => {
                if (!marqueeTouchStart) return;
                const touch = e.changedTouches[0];
                const dx = touch.clientX - marqueeTouchStart.startX;
                if (Math.abs(dx) > 4) {
                    marqueeTouchStart.moved = true;
                    marqueeTouchStart.text.style.animationPlayState = 'paused';
                    const maxScroll = marqueeTouchStart.scrollDist; // negative e.g. -120px
                    const clampedX = Math.max(maxScroll - 12, Math.min(12, marqueeTouchStart.startMatrixX + dx));
                    marqueeTouchStart.text.style.transform = `translateX(${clampedX}px)`;
                }
            }, { passive: true });

            document.addEventListener('touchend', () => {
                if (!marqueeTouchStart) return;
                const { text, moved } = marqueeTouchStart;
                marqueeTouchStart = null;
                if (moved) {
                    setTimeout(() => {
                        text.style.transform = '';
                        text.style.animationPlayState = 'running';
                    }, 1200);
                }
            }, { passive: true });

            let lastPersistSecond = -1;
            audio.addEventListener('timeupdate', () => {
                if (typeof lyricsManager !== 'undefined' && lyricsManager.syncTime) lyricsManager.syncTime(audio.currentTime);
                if (window.listeningSession) listeningSession.update();
                if (Number.isFinite(audio.duration) && audio.duration > 0 && !state.isDragging) {
                    seekBar.max = audio.duration; seekBar.value = audio.currentTime;
                    currentProgress = audio.currentTime / audio.duration;

                    // Immediately synchronize visualizer seekbar clip paths
                    if (vizSeekTrack && Number.isFinite(currentProgress)) {
                        vizSeekTrack.style.clipPath = `inset(0 0 0 ${currentProgress * 100}%)`;
                    }
                    if (vizCanvas && Number.isFinite(currentProgress)) {
                        const dpr = Math.min(window.devicePixelRatio || 1, 2);
                        const canvasW = vizCanvas.width / dpr;
                        const progressWidth = canvasW * currentProgress;
                        vizCanvas.style.clipPath = `inset(0 ${canvasW - progressWidth}px 0 0)`;
                    }
                    if (state.playing && !isVizLoopRunning && typeof viz !== 'undefined' && viz.start) {
                        viz.start();
                    }

                    const currTimeEl = document.getElementById('seek-current-time');
                    const durTimeEl = document.getElementById('seek-duration-time');
                    if (currTimeEl) currTimeEl.textContent = utils.formatTime(audio.currentTime || 0);
                    if (durTimeEl) durTimeEl.textContent = utils.formatTime(audio.duration || 0);

                    if ('mediaSession' in navigator && typeof navigator.mediaSession.setPositionState === 'function' && state.currentTrack) {
                        updateMediaPosition();
                    }
                    if (currentProgress >= 0.9 && state.currentTrack && recommendationEvents.completedSongId !== state.currentTrack.id) {
                        recommendationEvents.completedSongId = state.currentTrack.id;
                        recommendationEvents.record('play_complete', state.currentTrack, {
                            playDurationSeconds: Math.floor(audio.currentTime),
                            songDurationSeconds: Math.floor(audio.duration),
                        });
                    }

                    const currentSecond = Math.floor(audio.currentTime);
                    if (currentSecond % 5 === 0 && currentSecond !== lastPersistSecond) {
                        lastPersistSecond = currentSecond;
                        persist.save();
                    }

                    // Morphing 10s Preview Logic (Hardened against duration jitter)
                    const timeRemaining = audio.duration - audio.currentTime;
                    const hasNext = Boolean(getUpcomingTrack());
                    const wrap = document.getElementById('queue-wrapper');
                    
                    if (Number.isFinite(audio.duration) && audio.duration > 20 && audio.currentTime > 5 && timeRemaining <= 10 && timeRemaining > 0 && hasNext) {
                        if (!state.upNextTriggered && !state.queueExpanded) {
                            state.upNextTriggered = true;
                            let nextTrack = getUpcomingTrack();
                            primeNextTrack();
                            if (nextTrack) {
                                document.getElementById('queue-preview-pill').innerHTML = ui.createSongPillInner(nextTrack);
                                document.getElementById('queue-preview-pill').className = "glass-panel rounded-2xl p-2 pr-4 flex items-center shadow-2xl w-full border border-white/10 bg-[#121212]/90 transition-all duration-400";
                                wrap.classList.add('preview-expanded');
                                updateMarquees();
                            }
                        }
                    } else if (state.upNextTriggered && timeRemaining > 10) {
                        state.upNextTriggered = false;
                        wrap.classList.remove('preview-expanded');
                    }
                }
            });
            
            // Seamless Swap Out Track Animation
            audio.addEventListener('ended', () => {
                resetSeekbarAndTimes(null);
                if (state.currentTrack && recommendationEvents.completedSongId !== state.currentTrack.id) {
                    recommendationEvents.completedSongId = state.currentTrack.id;
                    recommendationEvents.record('play_complete', state.currentTrack, {
                        playDurationSeconds: Math.floor(audio.duration || audio.currentTime || 0),
                        songDurationSeconds: Math.floor(audio.duration || 0),
                    });
                }

                // If sleep timer is set to end-of-track, pause and finish
                if (sleepTimer.onTrackEnded()) {
                    return;
                }

                const wrap = document.getElementById('queue-wrapper');
                if(state.upNextTriggered && !state.queueExpanded) {
                    wrap.classList.add('track-swap-out');
                    setTimeout(() => {
                        wrap.classList.remove('preview-expanded', 'track-swap-out');
                        if(state.repeat === 2) { audio.currentTime = 0; requestPlay(); state.upNextTriggered = false; } else player.next();
                    }, document.visibilityState === 'hidden' ? 0 : 400); // Wait for CSS swap out morph only when visible
                } else {
                    wrap.classList.remove('preview-expanded', 'track-swap-out');
                    if(state.repeat === 2) { audio.currentTime = 0; requestPlay(); state.upNextTriggered = false; } else player.next();
                }
            });

            // Global Cross-Platform Keyboard Shortcuts (Windows / macOS / Web)
            document.addEventListener('keydown', (e) => {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
                const key = e.key.toLowerCase();
                switch(key) {
                    case ' ':
                        e.preventDefault();
                        player.togglePlay();
                        break;
                    case 'arrowleft':
                    case 'a':
                        if (e.shiftKey) player.prev();
                        else player.seek(audio.currentTime - 5);
                        break;
                    case 'arrowright':
                    case 'd':
                        if (e.shiftKey) player.next();
                        else player.seek(audio.currentTime + 5);
                        break;
                    case 'arrowup':
                        e.preventDefault();
                        player.setVolume(audio.volume + 0.05);
                        const vSliderUp = document.getElementById('volume-slider');
                        if (vSliderUp) vSliderUp.value = audio.volume;
                        break;
                    case 'arrowdown':
                        e.preventDefault();
                        player.setVolume(audio.volume - 0.05);
                        const vSliderDown = document.getElementById('volume-slider');
                        if (vSliderDown) vSliderDown.value = audio.volume;
                        break;
                    case 'j':
                        player.seek(audio.currentTime - 10);
                        break;
                    case 'k':
                        player.togglePlay();
                        break;
                    case 'l':
                        if (e.shiftKey) {
                            player.seek(audio.currentTime + 10);
                        } else {
                            ui.toggleLyricsModal();
                        }
                        break;
                    case 'q':
                        ui.toggleQueue();
                        break;
                    case 'e':
                        ui.toggleEqualizerModal();
                        break;
                    case '/':
                        e.preventDefault();
                        const searchInp = document.getElementById('search-input');
                        if (searchInp) {
                            searchInp.focus();
                            searchInp.select();
                        }
                        break;
                    case 'm':
                        player.setVolume(audio.volume > 0 ? 0 : 0.8);
                        const vSliderMute = document.getElementById('volume-slider');
                        if (vSliderMute) vSliderMute.value = audio.volume;
                        break;
                    case 'escape':
                        ui.toggleLyricsModal(false);
                        ui.toggleEqualizerModal(false);
                        if (document.body.classList.contains('mobile-player-open')) ui.toggleMobilePlayer(false);
                        if (state.queueExpanded && !deviceMode.isMobileUI()) ui.toggleQueue();
                        break;
                    case 'mediaplaypause':
                        player.togglePlay();
                        break;
                    case 'mediatracknext':
                        player.next();
                        break;
                    case 'mediatrackprevious':
                        player.prev();
                        break;
                    case 'mediastop':
                        if (state.playing) player.togglePlay();
                        break;
                }
            });

            // Android Hardware Back Button / Swipe-Back Navigation (popstate)
            window.addEventListener('popstate', () => {
                const lyricsModal = document.getElementById('lyrics-modal');
                if (lyricsModal && !lyricsModal.classList.contains('hidden')) {
                    ui.toggleLyricsModal(false);
                    return;
                }
                const eqModal = document.getElementById('equalizer-modal');
                if (eqModal && !eqModal.classList.contains('hidden')) {
                    ui.toggleEqualizerModal(false);
                    return;
                }
                if (document.body.classList.contains('mobile-player-open')) {
                    ui.toggleMobilePlayer(false);
                    return;
                }
                if (state.queueExpanded && !deviceMode.isMobileUI()) {
                    ui.toggleQueue();
                    return;
                }
                const currentView = ui.getCurrentView();
                if (currentView && currentView !== 'home') {
                    ui.switchView('home');
                    return;
                }
            });

            // Strict Scrolling Isolation: Vertical scroll moves page, horizontal gestures/drag move shelf
            document.addEventListener('wheel', (e) => {
                const scrollShelf = e.target.closest('.horizontal-scroll');
                if (!scrollShelf) return;

                const isHorizontalIntent = e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY);
                if (isHorizontalIntent) {
                    const canScrollLeft = scrollShelf.scrollLeft > 0;
                    const canScrollRight = scrollShelf.scrollLeft < (scrollShelf.scrollWidth - scrollShelf.clientWidth - 1);
                    const delta = e.shiftKey ? e.deltaY : e.deltaX;
                    if ((delta < 0 && canScrollLeft) || (delta > 0 && canScrollRight)) {
                        e.preventDefault();
                        scrollShelf.style.scrollBehavior = 'auto';
                        scrollShelf.scrollLeft += delta;
                        clearTimeout(scrollShelf._wheelTimer);
                        scrollShelf._wheelTimer = setTimeout(() => {
                            scrollShelf.style.scrollBehavior = '';
                        }, 120);
                    }
                }
                // When deltaY > deltaX without ShiftKey: Do NOT preventDefault, let vertical document scrolling proceed naturally!
            }, { passive: false });

            // Desktop Mouse Drag-to-Scroll & Panning
            let activeDragShelf = null;
            let dragStartX = 0;
            let dragStartScrollLeft = 0;
            let isDraggingShelf = false;

            document.addEventListener('pointerdown', (e) => {
                if (e.pointerType !== 'mouse' || e.button !== 0) return;
                const shelf = e.target.closest('.horizontal-scroll');
                if (!shelf) return;
                activeDragShelf = shelf;
                dragStartX = e.clientX;
                dragStartScrollLeft = shelf.scrollLeft;
                isDraggingShelf = false;
            });

            document.addEventListener('pointermove', (e) => {
                if (!activeDragShelf) return;
                const deltaX = e.clientX - dragStartX;
                if (!isDraggingShelf && Math.abs(deltaX) > 4) {
                    isDraggingShelf = true;
                    activeDragShelf.classList.add('is-dragging');
                    activeDragShelf.style.scrollBehavior = 'auto';
                }
                if (isDraggingShelf) {
                    activeDragShelf.scrollLeft = dragStartScrollLeft - deltaX;
                }
            });

            const endShelfDrag = () => {
                if (!activeDragShelf) return;
                const shelf = activeDragShelf;
                activeDragShelf = null;
                shelf.classList.remove('is-dragging');
                shelf.style.scrollBehavior = '';
                if (isDraggingShelf) {
                    isDraggingShelf = false;
                    // Suppress accidental click on song cards when ending a mouse drag gesture
                    const captureClick = (clickEvt) => {
                        clickEvt.stopPropagation();
                        clickEvt.preventDefault();
                        window.removeEventListener('click', captureClick, true);
                    };
                    window.addEventListener('click', captureClick, true);
                    setTimeout(() => window.removeEventListener('click', captureClick, true), 60);
                }
            };

            document.addEventListener('pointerup', endShelfDrag);
            document.addEventListener('pointercancel', endShelfDrag);

            // Desktop Shelf Navigation Chevrons (< and >) & Permanent Edge Blur Updates
            window.setupShelfNavButtons = () => {
                document.querySelectorAll('.relative.group\\/track').forEach((wrapper) => {
                    const shelf = wrapper.querySelector('.horizontal-scroll');
                    if (!shelf) return;

                    let prevBtn = wrapper.querySelector('.shelf-nav-prev');
                    if (!prevBtn) {
                        prevBtn = document.createElement('button');
                        prevBtn.type = 'button';
                        prevBtn.className = 'shelf-nav-btn shelf-nav-prev';
                        prevBtn.setAttribute('aria-label', 'Scroll left');
                        prevBtn.innerHTML = '<svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"/></svg>';
                        prevBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            shelf.scrollBy({ left: -Math.max(260, shelf.clientWidth * 0.7), behavior: 'smooth' });
                        });
                        wrapper.appendChild(prevBtn);
                    }

                    let nextBtn = wrapper.querySelector('.shelf-nav-next');
                    if (!nextBtn) {
                        nextBtn = document.createElement('button');
                        nextBtn.type = 'button';
                        nextBtn.className = 'shelf-nav-btn shelf-nav-next';
                        nextBtn.setAttribute('aria-label', 'Scroll right');
                        nextBtn.innerHTML = '<svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/></svg>';
                        nextBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            shelf.scrollBy({ left: Math.max(260, shelf.clientWidth * 0.7), behavior: 'smooth' });
                        });
                        wrapper.appendChild(nextBtn);
                    }

                    const updateShelfVisuals = () => {
                        const maxScroll = shelf.scrollWidth - shelf.clientWidth;
                        const hasScrollableContent = maxScroll > 4;
                        const leftBlur = wrapper.querySelector('.row-blur-left');
                        const rightBlur = wrapper.querySelector('.row-blur-right');

                        if (prevBtn) prevBtn.classList.toggle('is-visible', hasScrollableContent && shelf.scrollLeft > 6);
                        if (nextBtn) nextBtn.classList.toggle('is-visible', hasScrollableContent && shelf.scrollLeft < maxScroll - 6);

                        // Edge blurs are permanently visible by default, only hidden when at boundary extremes
                        if (leftBlur) leftBlur.classList.toggle('edge-hidden', !hasScrollableContent || shelf.scrollLeft <= 2);
                        if (rightBlur) rightBlur.classList.toggle('edge-hidden', !hasScrollableContent || shelf.scrollLeft >= maxScroll - 2);
                    };

                    if (!shelf._navListenerBound) {
                        shelf._navListenerBound = true;
                        shelf.addEventListener('scroll', updateShelfVisuals, { passive: true });
                    }
                    updateShelfVisuals();
                });
            };

            // Dynamic backdrop recalculation when hovering cards that intersect edge blur zones
            document.addEventListener('mouseover', (e) => {
                const card = e.target.closest('.scroll-card, .for-you-card, .discover-card');
                if (!card) return;
                const shelf = card.closest('.horizontal-scroll');
                if (!shelf) return;
                const wrapper = shelf.closest('.relative');
                if (!wrapper) return;

                const cardRect = card.getBoundingClientRect();
                const shelfRect = shelf.getBoundingClientRect();
                const leftBlur = wrapper.querySelector('.row-blur-left');
                const rightBlur = wrapper.querySelector('.row-blur-right');

                const nearLeft = cardRect.left < shelfRect.left + 72 && cardRect.right > shelfRect.left;
                const nearRight = cardRect.right > shelfRect.right - 72 && cardRect.left < shelfRect.right;

                if (nearLeft && leftBlur) {
                    leftBlur.style.backdropFilter = 'blur(14.1px)';
                    setTimeout(() => { if (leftBlur) leftBlur.style.backdropFilter = ''; }, 260);
                }
                if (nearRight && rightBlur) {
                    rightBlur.style.backdropFilter = 'blur(14.1px)';
                    setTimeout(() => { if (rightBlur) rightBlur.style.backdropFilter = ''; }, 260);
                }
            });

            document.addEventListener('mouseout', (e) => {
                const card = e.target.closest('.scroll-card, .for-you-card, .discover-card');
                if (!card) return;
                const shelf = card.closest('.horizontal-scroll');
                if (!shelf) return;
                const wrapper = shelf.closest('.relative');
                if (!wrapper) return;

                const cardRect = card.getBoundingClientRect();
                const shelfRect = shelf.getBoundingClientRect();
                const leftBlur = wrapper.querySelector('.row-blur-left');
                const rightBlur = wrapper.querySelector('.row-blur-right');

                const nearLeft = cardRect.left < shelfRect.left + 72 && cardRect.right > shelfRect.left;
                const nearRight = cardRect.right > shelfRect.right - 72 && cardRect.left < shelfRect.right;

                if (nearLeft && leftBlur) {
                    leftBlur.style.backdropFilter = 'blur(13.9px)';
                    setTimeout(() => { if (leftBlur) leftBlur.style.backdropFilter = ''; }, 260);
                }
                if (nearRight && rightBlur) {
                    rightBlur.style.backdropFilter = 'blur(13.9px)';
                    setTimeout(() => { if (rightBlur) rightBlur.style.backdropFilter = ''; }, 260);
                }
            });

            // iOS Platform Optimizations (Hardware Volume & AudioContext Unlock)
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
            if (isIOS) {
                const volWrap = document.getElementById('volume-control-wrapper');
                const iosBadge = document.getElementById('ios-quality-badge');
                if (volWrap) volWrap.classList.add('hidden');
                if (iosBadge) iosBadge.classList.remove('hidden');
            }

            const unlockAudioContext = () => {
                if (window.audioCtx && window.audioCtx.state === 'suspended') {
                    window.audioCtx.resume().catch(() => {});
                }
                document.removeEventListener('touchstart', unlockAudioContext, { passive: true });
                document.removeEventListener('pointerdown', unlockAudioContext, { passive: true });
            };
            document.addEventListener('touchstart', unlockAudioContext, { passive: true });
            document.addEventListener('pointerdown', unlockAudioContext, { passive: true });

            // Playlist Staging Search Logic
            let plSearchDebounce;
            document.getElementById('pl-song-search').addEventListener('input', (e) => {
                clearTimeout(plSearchDebounce); const query = e.target.value.trim();
                const resultsBox = document.getElementById('pl-search-results');
                if (query.length < 2) { resultsBox.innerHTML = ''; return; }
                plSearchDebounce = setTimeout(async () => {
                    resultsBox.innerHTML = '<div class="p-2 text-xs text-gray-400">Searching...</div>';
                    const songs = await jiosaavnAPI.searchSongs(query, 5);
                    if(songs.length === 0) { resultsBox.innerHTML = '<div class="p-2 text-xs text-gray-500">No results.</div>'; return; }
                    resultsBox.innerHTML = songs.map(song => {
                        const id = songStore.add(song);
                        return `<div class="flex items-center gap-2 p-1.5 hover:bg-white/10 rounded cursor-pointer transition" onclick="window.stageSongForPlaylist('${id}')">
                            <img src="${song.img}" class="w-8 h-8 rounded object-cover">
                            <div class="flex-1 min-w-0"><p class="text-xs text-white truncate">${utils.escapeHtml(song.name)}</p><p class="text-[10px] text-gray-400 truncate">${utils.escapeHtml(song.artist)}</p></div>
                            <svg class="w-4 h-4 text-[var(--accent-color)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                        </div>`;
                    }).join('');
                }, 400);
            });

            window.stageSongForPlaylist = (storeId) => {
                const song = songStore.get(storeId);
                if(song && !stagedPlaylistSongs.find(s => s.id === song.id)) {
                    stagedPlaylistSongs.push(song);
                    ui.renderStagedSongs();
                    document.getElementById('pl-song-search').value = '';
                    document.getElementById('pl-search-results').innerHTML = '';
                }
            };

            spotifyManager.checkToken();

            window.player = player;
            window.ui = ui;
            window.lyricsManager = lyricsManager;

            ctxMenu.init(); searchManager.init(); persist.load(); ui.updateRepeatBtn(); ui.updateShuffleBtn(); homeView.init(); cloudLibrary.init(); requestAnimationFrame(viz.render);
            deviceMode.apply();
            setupShelfNavButtons();

            window.addEventListener('resize', () => { 
                deviceMode.apply(); 
                ui.updateMobileSearchPosition(); 
                updateMarquees(); 
                if (window.setupShelfNavButtons) setupShelfNavButtons();
            });
        }

        initApp();
