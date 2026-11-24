        // ============================================
        // CONTEXT MENU LOGIC
        // ============================================
        const ctxMenu = {
            activeStoreId: null,
            activePlaylistName: null,

            hide: () => {
                const menu = document.getElementById('context-menu');
                if (menu) menu.classList.add('hidden');
            },

            _positionMenu: (menu, event) => {
                if (!menu) return;
                menu.classList.remove('hidden');
                menu.style.visibility = 'hidden';
                menu.style.left = '0px';
                menu.style.top = '0px';

                const rect = menu.getBoundingClientRect();
                const menuW = rect.width || 224;
                const menuH = rect.height || 240;
                const pad = 12;

                let anchorX = event && typeof event.clientX === 'number' ? event.clientX : 0;
                let anchorY = event && typeof event.clientY === 'number' ? event.clientY : 0;

                // Keyboard-triggered clicks have clientX/Y === 0; anchor to the trigger button
                if (anchorX === 0 && anchorY === 0 && event && event.currentTarget && typeof event.currentTarget.getBoundingClientRect === 'function') {
                    const btnRect = event.currentTarget.getBoundingClientRect();
                    anchorX = btnRect.left;
                    anchorY = btnRect.bottom + 6;
                }

                // Flip left/up when near viewport edges, then strictly clamp inside viewport
                let x = anchorX + menuW + pad > window.innerWidth ? (anchorX - menuW) : anchorX;
                let y = anchorY + menuH + pad > window.innerHeight ? (anchorY - menuH) : anchorY;

                x = Math.max(pad, Math.min(x, window.innerWidth - menuW - pad));
                y = Math.max(pad, Math.min(y, window.innerHeight - menuH - pad));

                menu.style.left = `${Math.round(x)}px`;
                menu.style.top = `${Math.round(y)}px`;
                menu.style.visibility = '';
            },

            init: () => {
                const menu = document.getElementById('context-menu');
                if (!menu) return;

                // Prevent clicks inside menu from bubbling to document close handler prematurely
                menu.addEventListener('click', (e) => e.stopPropagation());

                document.addEventListener('click', (e) => {
                    if (!e.target.closest('#context-menu')) {
                        ctxMenu.hide();
                    }
                    if (!e.target.closest('#profile-dropdown') && !e.target.closest('[onclick*="profile-dropdown"]')) {
                        document.getElementById('profile-dropdown')?.classList.add('hidden');
                    }
                });

                document.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape') ctxMenu.hide();
                });

                window.addEventListener('resize', () => ctxMenu.hide(), { passive: true });
                document.addEventListener('scroll', (e) => {
                    if (e.target && e.target.closest && e.target.closest('#context-menu')) return;
                    ctxMenu.hide();
                }, { capture: true, passive: true });

                // True right-click support on song cards, track rows, and playlist cards
                document.addEventListener('contextmenu', (e) => {
                    const cardOrRow = e.target && e.target.closest ? e.target.closest('.sc-card, .scroll-card, .np-row, [data-sc-id]') : null;
                    if (!cardOrRow) return;
                    const songTrigger = cardOrRow.querySelector('[onclick*="ctxMenu.showSong"]');
                    if (songTrigger) {
                        const m = String(songTrigger.getAttribute('onclick') || '').match(/ctxMenu\.showSong\(event,\s*'([^']+)'\)/);
                        if (m && m[1]) {
                            e.preventDefault();
                            e.stopPropagation();
                            ctxMenu.showSong(e, m[1]);
                            return;
                        }
                    }
                    const plTrigger = cardOrRow.querySelector('[onclick*="ctxMenu.showPlaylist"]');
                    if (plTrigger) {
                        const m = String(plTrigger.getAttribute('onclick') || '').match(/ctxMenu\.showPlaylist\(event,\s*'([^']+)'\)/);
                        if (m && m[1]) {
                            e.preventDefault();
                            e.stopPropagation();
                            ctxMenu.showPlaylist(e, m[1]);
                        }
                    }
                });

                const bind = (id, fn) => {
                    const el = document.getElementById(id);
                    if (el) el.onclick = (e) => { e.stopPropagation(); ctxMenu.hide(); fn(e); };
                };

                bind('cm-play-next', () => { const s = songStore.get(ctxMenu.activeStoreId); if (s) player.addNext(s); });
                bind('cm-add-queue', () => { const s = songStore.get(ctxMenu.activeStoreId); if (s) player.addToQueue(s); });
                bind('cm-add-playlist', () => { ctxMenu.showPlaylistSelector(); });
                bind('cm-like-song', () => { const s = songStore.get(ctxMenu.activeStoreId); if (s) player.likeSong(s.id); });
                bind('cm-add-library', () => { const s = songStore.get(ctxMenu.activeStoreId); if (s) player.addToLibrary(s.id); });

                const cmDownload = document.getElementById('cm-download') || document.getElementById('cm-download-song');
                if (cmDownload) {
                    cmDownload.onclick = (e) => {
                        e.stopPropagation();
                        const s = songStore.get(ctxMenu.activeStoreId);
                        ctxMenu.hide();
                        if (!s) return;
                        if (window.dtunesIsOfflineTrack && window.dtunesIsOfflineTrack(s.id)) {
                            if (window.dtunesDeleteOffline) window.dtunesDeleteOffline(s.id);
                        } else if (window.dtunesDownloadTrack) {
                            window.dtunesDownloadTrack(s);
                        }
                    };
                }

                bind('cm-dislike-song', () => {
                    const s = songStore.get(ctxMenu.activeStoreId);
                    if (s && player.dislikeSong) player.dislikeSong(s.id);
                });

                const cmReportAi = document.getElementById('cm-report-ai');
                if (cmReportAi) {
                    cmReportAi.onclick = (e) => {
                        e.stopPropagation();
                        const s = songStore.get(ctxMenu.activeStoreId);
                        ctxMenu.hide();
                        if (window.mixFeedbackManager && window.mixFeedbackManager.openFeedbackModal) {
                            window.mixFeedbackManager.openFeedbackModal({
                                sentiment: 'dislike',
                                feature: 'AI Song Recommendation',
                                mixTitle: s ? `${s.name || s.title} — ${s.artist || 'Unknown'}` : 'AI Track',
                                context: s || {}
                            });
                        }
                    };
                }

                bind('cm-pl-play', () => { ui.playPlaylist(ctxMenu.activePlaylistName); });
                bind('cm-pl-play-next', () => { player.addPlaylistNext(ctxMenu.activePlaylistName); });
                bind('cm-pl-add-queue', () => { player.addPlaylistToQueue(ctxMenu.activePlaylistName); });
                bind('cm-pl-edit', () => { ui.openPlaylistEditor(ctxMenu.activePlaylistName); });
                bind('cm-pl-delete', () => { ui.deletePlaylist(ctxMenu.activePlaylistName); });
            },

            showSong: (event, storeId) => {
                ctxMenu.activeStoreId = storeId;
                const menu = document.getElementById('context-menu');
                if (!menu) return;
                const song = songStore.get(storeId);
                if (!song) return;

                const likeLabel = document.getElementById('cm-like-song-label');
                const libraryLabel = document.getElementById('cm-add-library-label');
                if (likeLabel) likeLabel.textContent = player.isLiked(song.id) ? 'Unlike song' : 'Like song';
                if (libraryLabel) libraryLabel.textContent = player.isInLibrary(song.id) ? 'Remove from Library' : 'Add to Library';

                const downloadBtn = document.getElementById('cm-download') || document.getElementById('cm-download-song');
                if (downloadBtn) {
                    const isDesktop = Boolean((window.electronAPI && window.electronAPI.isDesktopApp) || window.isDTunesDesktop);
                    downloadBtn.classList.toggle('hidden', !isDesktop);
                    const label = document.getElementById('cm-download-label') || document.getElementById('cm-download-song-label');
                    if (label) {
                        label.textContent = (window.dtunesIsOfflineTrack && window.dtunesIsOfflineTrack(song.id))
                            ? 'Remove offline download'
                            : 'Download for offline';
                    }
                }

                const isAiSong = Boolean(song && (song._aiGenerated || song.aiGenerated || song.playlistType || song.source === 'recommendation'));
                const recDivider = document.getElementById('cm-rec-divider');
                const dislikeBtn = document.getElementById('cm-dislike-song');
                const reportAiBtn = document.getElementById('cm-report-ai');
                if (recDivider) recDivider.classList.toggle('hidden', !isAiSong);
                if (dislikeBtn) dislikeBtn.classList.toggle('hidden', !isAiSong);
                if (reportAiBtn) reportAiBtn.classList.toggle('hidden', !isAiSong);
                const dislikeLabel = document.getElementById('cm-dislike-song-label');
                if (dislikeLabel) {
                    dislikeLabel.textContent = (player.isDisliked && player.isDisliked(song.id)) ? 'Remove from hidden' : "Don't recommend this";
                }

                document.getElementById('cm-song-options')?.classList.remove('hidden');
                document.getElementById('cm-playlist-options')?.classList.add('hidden');
                ctxMenu._positionMenu(menu, event);
            },

            showPlaylist: (event, playlistName) => {
                ctxMenu.activePlaylistName = playlistName;
                const menu = document.getElementById('context-menu');
                if (!menu) return;
                const isProtected = playlistName === 'Liked Songs';
                document.getElementById('cm-pl-edit')?.classList.toggle('hidden', isProtected);
                document.getElementById('cm-pl-delete')?.classList.toggle('hidden', isProtected);

                document.getElementById('cm-song-options')?.classList.add('hidden');
                document.getElementById('cm-playlist-options')?.classList.remove('hidden');
                ctxMenu._positionMenu(menu, event);
            },

            showPlaylistSelector: () => {
                const song = songStore.get(ctxMenu.activeStoreId);
                if (!song) return;
                const modal = document.getElementById('playlist-selector-modal');
                const list = document.getElementById('playlist-selector-list');
                let html = '';
                Object.keys(state.playlists).forEach(name => {
                    html += `<button class="w-full text-left px-4 py-3 glass-panel rounded-lg hover:bg-white/10 text-white transition" onclick="ui.addSongToPlaylist('${utils.escapeJs(name)}')">${utils.escapeHtml(name)}</button>`;
                });
                if (Object.keys(state.playlists).length === 0) html = '<p class="text-gray-400 text-sm py-2">No playlists created yet.</p>';
                list.innerHTML = html;
                modal.classList.remove('hidden');
            }
        };
