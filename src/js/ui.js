        // ============================================
        // UI & RENDERING
        // ============================================
        const ui = {
            getCurrentView: () => {
                if (!document.getElementById('view-home').classList.contains('hidden')) return 'home';
                if (!document.getElementById('view-search').classList.contains('hidden')) return 'search';
                if (!document.getElementById('view-playlist').classList.contains('hidden')) return 'playlist';
                if (!document.getElementById('view-library').classList.contains('hidden')) return 'library';
                if (!document.getElementById('view-settings').classList.contains('hidden')) return 'settings';
                if (!document.getElementById('view-stats').classList.contains('hidden')) return 'stats';
                if (!document.getElementById('view-album').classList.contains('hidden')) return 'album';
                if (!document.getElementById('view-artist').classList.contains('hidden')) return 'artist';
                const vReviews = document.getElementById('view-reviews');
                if (vReviews && !vReviews.classList.contains('hidden')) return 'reviews';
                return 'home';
            },

            setMobileNavActive: (view) => {
                const navButtons = document.querySelectorAll('#mobile-nav [data-nav]');
                const map = {
                    home: 'home',
                    search: 'search',
                    playlist: 'library',
                    settings: 'profile',
                    library: 'library',
                    profile: 'profile'
                };
                const active = map[view] || 'home';
                navButtons.forEach((btn) => {
                    if (btn.dataset.nav === active) btn.classList.add('active');
                    else btn.classList.remove('active');
                });
            },

            updateMobileSearchPosition: () => {
                const resetKeyboardVars = () => {
                    document.documentElement.style.setProperty('--mobile-keyboard-offset', '0px');
                    document.documentElement.style.setProperty('--mobile-keyboard-lift', '0px');
                    document.body.classList.remove('mobile-keyboard-open');
                };

                if (!deviceMode.isMobileUI()) {
                    resetKeyboardVars();
                    return;
                }

                const isAndroid = /Android/i.test(navigator.userAgent);
                const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

                // Android Chrome VirtualKeyboard API
                if ('virtualKeyboard' in navigator && isAndroid) {
                    try {
                        navigator.virtualKeyboard.overlaysContent = true;
                        const vk = navigator.virtualKeyboard.boundingRect;
                        if (vk && vk.height > 0) {
                            const vkHeight = Math.round(vk.height);
                            document.documentElement.style.setProperty('--mobile-keyboard-offset', `${vkHeight}px`);
                            document.documentElement.style.setProperty('--mobile-keyboard-lift', `${vkHeight}px`);
                            document.body.classList.toggle('mobile-keyboard-open', document.body.classList.contains('mobile-search-open'));
                            return;
                        }
                    } catch (e) {}
                }

                // iOS Safari & Fallback via VisualViewport
                if (!window.visualViewport) {
                    resetKeyboardVars();
                    return;
                }

                const vv = window.visualViewport;
                const offset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
                const lift = isIOS ? Math.min(offset, Math.round(window.innerHeight * 0.48)) : Math.min(offset, 280);

                document.documentElement.style.setProperty('--mobile-keyboard-offset', `${offset}px`);
                document.documentElement.style.setProperty('--mobile-keyboard-lift', `${lift}px`);
                const keyboardOpen = offset > 12 && document.body.classList.contains('mobile-search-open');
                document.body.classList.toggle('mobile-keyboard-open', keyboardOpen);
                if (keyboardOpen && isIOS) {
                    window.scrollTo({ top: 0, behavior: 'instant' });
                }
            },

            goHome: () => {
                const searchInput = document.getElementById('search-input');
                if (searchInput) searchInput.value = '';
                ui.closeMobileSearch({ clearQuickState: true, restoreOrigin: true });
                document.getElementById('search-dropdown')?.classList.remove('active');
                ui.switchView('home');
                if (typeof homeView !== 'undefined' && homeView.init) {
                    homeView.init();
                }
                document.getElementById('main-container')?.scrollTo({ top: 0, behavior: 'smooth' });
            },

            switchView: (view) => {
                if (view === 'reviews') {
                    const isDev = typeof window.isAuthorizedDev === 'function' ? window.isAuthorizedDev() : false;
                    const isTestEnv = typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test';
                    if (!isDev && !isTestEnv && typeof window !== 'undefined' && window.location) {
                        if (window.toastManager) window.toastManager.show({ message: 'Access restricted to authorized developer (9dhairy@gmail.com)', type: 'warning' });
                        return;
                    }
                }
                document.getElementById('view-home').classList.add('hidden'); document.getElementById('view-search').classList.add('hidden'); document.getElementById('view-playlist').classList.add('hidden'); document.getElementById('view-library').classList.add('hidden'); document.getElementById('view-settings').classList.add('hidden'); document.getElementById('view-stats').classList.add('hidden'); document.getElementById('view-album').classList.add('hidden'); document.getElementById('view-artist').classList.add('hidden');
                const viewReviews = document.getElementById('view-reviews');
                if (viewReviews) viewReviews.classList.add('hidden');
                const targetView = document.getElementById(`view-${view}`);
                if (targetView) targetView.classList.remove('hidden');
                document.getElementById('main-container')?.scrollTo({ top: 0, behavior: 'smooth' });

                if (view === 'stats') statsView.render();
                if (view === 'library') ui.renderLibrary();
                if (view === 'reviews' && window.reviewsManager) reviewsManager.render();
                if (view === 'search') {
                    const input = document.getElementById('search-input');
                    const q = input ? input.value.trim() : '';
                    if (!q && typeof searchManager !== 'undefined' && searchManager.renderSearchHistory) {
                        searchManager.renderSearchHistory();
                        document.getElementById('search-history-section')?.classList.remove('hidden');
                        document.getElementById('search-content')?.classList.add('hidden');
                        document.getElementById('search-loading')?.classList.add('hidden');
                        const title = document.getElementById('search-title');
                        if (title) title.textContent = 'Search';
                    }
                }

                if (view !== 'search') {
                    document.getElementById('search-dropdown').classList.remove('active');
                }

                if (view !== 'home' && deviceMode.isMobileUI()) {
                    document.body.classList.remove('mobile-player-open');
                    if (view !== 'search') {
                        document.body.classList.remove('mobile-search-open');
                        document.documentElement.style.setProperty('--mobile-keyboard-offset', '0px');
                        document.documentElement.style.setProperty('--mobile-keyboard-lift', '0px');
                        document.body.classList.remove('mobile-keyboard-open');
                    }
                }

                ui.setMobileNavActive(view);
                updateMarquees();
            },

            scrollToLibrary: () => {
                ui.closeMobileSearch();
                ui.renderLibrary();
                ui.switchView('library');
                ui.setMobileNavActive('library');
            },

            toggleMobilePlayer: (expand) => {
                if (!deviceMode.isMobileUI()) return;
                if(expand) {
                    if (!state.currentTrack) return;
                    ui.closeMobileSearch();
                    document.body.classList.add('mobile-player-open');
                    ui.switchMobilePlayerTab('track');
                    if (ui.updateAlbumCarouselPeeks) ui.updateAlbumCarouselPeeks();
                if (ui.initQueuePointerReorder) ui.initQueuePointerReorder();
                if (state.fullscreenMode && ui.updateFullscreenQueue) ui.updateFullscreenQueue();
                    requestAnimationFrame(resizeCanvas);
                    setTimeout(resizeCanvas, 120);
                    setTimeout(resizeCanvas, 320);
                } else {
                    document.body.classList.remove('mobile-player-open');
                }
                updateMarquees();
                setTimeout(updateMarquees, 120);
                setTimeout(updateMarquees, 420);
            },

            openMobileSearch: () => {
                ui.switchView('search');
                if (!deviceMode.isMobileUI()) {
                    document.getElementById('search-input')?.focus({ preventScroll: true });
                    return;
                }
                const input = document.getElementById('search-input');
                document.body.classList.remove('mobile-player-open');
                document.body.classList.add('mobile-search-open');
                ui.setMobileNavActive('search');

                if (input && !input.value.trim() && typeof searchManager !== 'undefined' && searchManager.renderSearchHistory) {
                    searchManager.renderSearchHistory();
                    document.getElementById('search-history-section')?.classList.remove('hidden');
                    document.getElementById('search-content')?.classList.add('hidden');
                    document.getElementById('search-loading')?.classList.add('hidden');
                    const title = document.getElementById('search-title');
                    if (title) title.textContent = 'Search';
                }

                const focusInput = () => {
                    try {
                        input.focus({ preventScroll: true });
                        const cursor = input.value.length;
                        input.setSelectionRange(cursor, cursor);
                    } catch (e) {
                        input.focus();
                    }
                    window.scrollTo(0, 0);
                    ui.updateMobileSearchPosition();
                };

                focusInput();
                requestAnimationFrame(focusInput);
                setTimeout(focusInput, 120);
            },

            closeMobileSearch: (options = {}) => {
                const { clearQuickState = false, restoreOrigin = false } = options;
                const input = document.getElementById('search-input');
                const dropdown = document.getElementById('search-dropdown');
                const results = document.getElementById('search-results');

                input.blur();
                dropdown.classList.remove('active');
                document.body.classList.remove('mobile-search-open');
                document.documentElement.style.setProperty('--mobile-keyboard-offset', '0px');
                document.documentElement.style.setProperty('--mobile-keyboard-lift', '0px');
                document.body.classList.remove('mobile-keyboard-open');

                if (clearQuickState) {
                    input.value = '';
                    results.innerHTML = '';
                    lastFullSearch = '';
                    if (typeof searchManager !== 'undefined' && searchManager.renderSearchHistory) {
                        searchManager.renderSearchHistory();
                        document.getElementById('search-history-section')?.classList.remove('hidden');
                        document.getElementById('search-content')?.classList.add('hidden');
                        document.getElementById('search-loading')?.classList.add('hidden');
                        const title = document.getElementById('search-title');
                        if (title) title.textContent = 'Search';
                    }
                }

                if (restoreOrigin && state.mobileSearchOriginView) {
                    const origin = state.mobileSearchOriginView;
                    if (origin !== 'search' && ui.getCurrentView() !== origin) {
                        ui.switchView(origin);
                    }
                }

                state.mobileSearchOriginView = null;
                ui.setMobileNavActive(ui.getCurrentView());
            },

            playFromQuickSearch: (storeId) => {
                const song = songStore.get(storeId);
                if (song && typeof searchManager !== 'undefined' && searchManager.addToRecentSearches) {
                    searchManager.addToRecentSearches(song);
                }
                playSongById(storeId);
                document.getElementById('search-dropdown')?.classList.remove('active');
                document.getElementById('search-input')?.blur();
                if (deviceMode.isMobileUI() && document.body.classList.contains('mobile-search-open')) {
                    ui.closeMobileSearch({ clearQuickState: true, restoreOrigin: false });
                }
            },

            toggleProfileDropdown: (e) => {
                if (e) {
                    try { e.stopPropagation(); } catch (_) {}
                }
                const dd = document.getElementById('profile-dropdown');
                if (!dd) return;
                const isClosed = dd.classList.contains('hidden');
                dd.classList.toggle('hidden', !isClosed);
            },

            closeProfileDropdown: () => {
                document.getElementById('profile-dropdown')?.classList.add('hidden');
            },

            toggleChangelogAccordion: (id) => {
                const item = document.getElementById(`changelog-item-${id}`);
                if (!item) return;
                const wasOpen = item.classList.contains('is-open');
                item.classList.toggle('is-open', !wasOpen);
            },

            toggleModal: (show) => {
                const modal = document.getElementById('playlist-modal');
                if(show) { 
                    modal.classList.remove('hidden'); 
                    document.getElementById('new-playlist-name').value = '';
                    document.getElementById('pl-song-search').value = '';
                    document.getElementById('pl-search-results').innerHTML = '';
                    stagedPlaylistSongs = [];
                    Object.assign(playlistCoverDraft, {
                        color: '#0ea5e9',
                        icon: 'MusicNote',
                        shape: 'Circle',
                        cornerRadius: 20,
                        smoothness: 100,
                        starSides: 5,
                        starCurve: 0.15,
                        starRotation: 0,
                        starScale: 1
                    });
                    ui.initPlaylistCoverControls();
                    ui.renderStagedSongs();
                    document.getElementById('new-playlist-name').focus(); 
                }
                else { modal.classList.add('hidden'); }
            },
            toggleVibeMixModal: (show) => {
                const modal = document.getElementById('vibe-mix-modal');
                if (!modal) return;
                const willOpen = show !== undefined ? Boolean(show) : modal.classList.contains('hidden');
                if (willOpen) {
                    modal.classList.remove('hidden');
                    const input = document.getElementById('vibe-input');
                    if (input) {
                        input.value = '';
                        setTimeout(() => input.focus(), 100);
                    }
                    const status = document.getElementById('vibe-loading-status');
                    if (status) status.classList.add('hidden');
                    const btn = document.getElementById('btn-create-vibe-mix');
                    if (btn) {
                        btn.disabled = false;
                        btn.classList.remove('opacity-50', 'pointer-events-none');
                    }
                } else {
                    modal.classList.add('hidden');
                }
            },
            selectVibeChip: (text, isTimeCapsule = false) => {
                const input = document.getElementById('vibe-input');
                if (input) {
                    input.value = text;
                    input.focus();
                }
                const chipBtns = document.querySelectorAll('.vibe-chip');
                chipBtns.forEach(btn => {
                    const label = text.split(':')[0].trim().substring(0, 8);
                    if (btn.textContent.includes(label)) {
                        btn.classList.add('border-[var(--accent-color)]/50', 'bg-white/10', 'text-white');
                    } else {
                        btn.classList.remove('border-[var(--accent-color)]/50', 'bg-white/10', 'text-white');
                    }
                });
            },
            submitVibeMix: async () => {
                const input = document.getElementById('vibe-input');
                const promptVal = input ? input.value.trim() : '';
                const infuseTaste = document.getElementById('vibe-infuse-taste')?.checked ?? true;
                const isTimeCapsule = promptVal.toLowerCase().includes('time capsule') || promptVal.toLowerCase().includes('forgotten');

                const statusEl = document.getElementById('vibe-loading-status');
                const statusText = document.getElementById('vibe-loading-text');
                const createBtn = document.getElementById('btn-create-vibe-mix');

                if (createBtn) {
                    createBtn.disabled = true;
                    createBtn.classList.add('opacity-50', 'pointer-events-none');
                }
                if (statusEl) {
                    statusEl.classList.remove('hidden');
                    if (statusText) statusText.textContent = isTimeCapsule ? 'Resurrecting nostalgic favorites...' : 'Curating tracks matching your vibe...';
                }

                try {
                    let generated = null;
                    if (window.ai && window.ai.generateVibeMix) {
                        generated = await window.ai.generateVibeMix(promptVal || 'Late Night Chill', {
                            isTimeCapsule,
                            infuseTaste
                        });
                    }

                    if (!generated || !Array.isArray(generated.songs) || generated.songs.length === 0) {
                        throw new Error('Could not generate tracks for this vibe.');
                    }

                    if (statusText) statusText.textContent = 'Verifying audio streams & artwork...';

                    const hydrated = [];
                    const searchFn = (window.aiHome && window.aiHome.searchTrackData) || (async (title, artist) => {
                        if (window.jiosaavnAPI?.searchSongs) {
                            const res = await window.jiosaavnAPI.searchSongs(`${title} ${artist}`, 1);
                            if (res && res[0] && res[0].url) return res[0];
                        }
                        return null;
                    });

                    for (const s of generated.songs) {
                        const matched = await searchFn(s.title, s.artist);
                        if (matched && matched.url && matched.img && !matched.img.includes('DTunes.svg') && matched.img !== FALLBACK_ART) {
                            const appSong = window.recommendationClient ? window.recommendationClient.toAppSong(matched) : matched;
                            if (!hydrated.some(h => h.id === appSong.id)) {
                                hydrated.push(appSong);
                            }
                        }
                    }

                    if (hydrated.length === 0) {
                        throw new Error('Unable to find verified playable tracks for this mix.');
                    }

                    let baseName = generated.title || (isTimeCapsule ? 'Time Capsule' : 'Vibe Mix');
                    let playlistName = baseName;
                    let counter = 1;
                    while (state.playlists[playlistName]) {
                        playlistName = `${baseName} (${++counter})`;
                    }

                    state.playlists[playlistName] = hydrated;
                    const paletteColors = ['#06b6d4', '#6366f1', '#a855f7', '#ec4899', '#f97316', '#10b981', '#3b82f6'];
                    const pickedColor = paletteColors[(generated.styleIndex || 0) % paletteColors.length];
                    state.playlistStyles[playlistName] = {
                        color: pickedColor,
                        icon: isTimeCapsule ? 'history' : 'sparkles',
                        shape: 'squircle',
                        cornerRadius: 24,
                        smoothness: 100,
                        starSides: 5,
                        starCurve: 0.15,
                        starRotation: 0,
                        starScale: 1
                    };

                    localStorage.setItem('playlists', JSON.stringify(state.playlists));
                    localStorage.setItem('playlistStyles', JSON.stringify(state.playlistStyles));

                    if (window.cloudLibrary && cloudLibrary.savePlaylist) {
                        cloudLibrary.savePlaylist(playlistName);
                    }

                    ui.renderPlaylists();
                    ui.toggleVibeMixModal(false);

                    if (ui.showToast) {
                        ui.showToast(`Created "${playlistName}" (${hydrated.length} tracks)`, 'success');
                    }

                    ui.openPlaylist(playlistName);
                } catch (err) {
                    console.error('[VibeMix] Error creating vibe mix:', err);
                    if (ui.showToast) {
                        ui.showToast(err.message || 'Failed to create Vibe Mix. Please try again.', 'error');
                    }
                } finally {
                    if (createBtn) {
                        createBtn.disabled = false;
                        createBtn.classList.remove('opacity-50', 'pointer-events-none');
                    }
                    if (statusEl) statusEl.classList.add('hidden');
                }
            },
            initPlaylistCoverControls: () => {
                const colorEl = document.getElementById('pl-color-picker');
                const iconEl = document.getElementById('pl-icon-picker');
                const shapeEl = document.getElementById('pl-shape-picker');
                if (!colorEl || !iconEl || !shapeEl) return;

                colorEl.innerHTML = PLAYLIST_COVER_COLORS.map((color) => `
                    <button type="button" data-color="${color}" class="w-8 h-8 rounded-full border-2 ${playlistCoverDraft.color === color ? 'border-white scale-110' : 'border-transparent'} transition" style="background:${color}"></button>
                `).join('');
                iconEl.innerHTML = Object.keys(PLAYLIST_COVER_ICONS).map((name) => `
                    <button type="button" data-icon="${name}" class="w-10 h-10 rounded-xl flex items-center justify-center ${playlistCoverDraft.icon === name ? 'bg-white text-black font-bold' : 'bg-white/10 text-white'} transition">${PLAYLIST_COVER_ICONS[name]}</button>
                `).join('');
                shapeEl.innerHTML = PLAYLIST_COVER_SHAPES.map((shape) => `
                    <button type="button" data-shape="${shape}" class="px-3 py-1.5 rounded-full text-xs font-bold ${playlistCoverDraft.shape === shape ? 'bg-white text-black font-bold' : 'bg-white/10 text-gray-200'} transition">${shape}</button>
                `).join('');

                colorEl.querySelectorAll('button').forEach((btn) => {
                    btn.onclick = () => {
                        playlistCoverDraft.color = btn.dataset.color;
                        ui.initPlaylistCoverControls();
                    };
                });
                iconEl.querySelectorAll('button').forEach((btn) => {
                    btn.onclick = () => {
                        playlistCoverDraft.icon = btn.dataset.icon;
                        ui.initPlaylistCoverControls();
                    };
                });
                shapeEl.querySelectorAll('button').forEach((btn) => {
                    btn.onclick = () => {
                        playlistCoverDraft.shape = btn.dataset.shape;
                        ui.initPlaylistCoverControls();
                    };
                });

                const params = document.getElementById('pl-shape-params');
                const cornerLabel = document.getElementById('pl-corner-label');
                const sidesLabel = document.getElementById('pl-sides-label');
                const cornerInput = document.getElementById('pl-corner-radius');
                const sidesInput = document.getElementById('pl-star-sides');
                params.classList.toggle('hidden', !(playlistCoverDraft.shape === 'SmoothRect' || playlistCoverDraft.shape === 'Star'));
                cornerLabel.classList.toggle('hidden', playlistCoverDraft.shape !== 'SmoothRect');
                sidesLabel.classList.toggle('hidden', playlistCoverDraft.shape !== 'Star');
                if (cornerInput) {
                    cornerInput.value = playlistCoverDraft.cornerRadius;
                    document.getElementById('pl-corner-value').textContent = playlistCoverDraft.cornerRadius;
                    cornerInput.oninput = () => {
                        playlistCoverDraft.cornerRadius = Number(cornerInput.value);
                        document.getElementById('pl-corner-value').textContent = playlistCoverDraft.cornerRadius;
                        ui.refreshPlaylistCoverPreview();
                    };
                }
                if (sidesInput) {
                    sidesInput.value = playlistCoverDraft.starSides;
                    document.getElementById('pl-sides-value').textContent = playlistCoverDraft.starSides;
                    sidesInput.oninput = () => {
                        playlistCoverDraft.starSides = Number(sidesInput.value);
                        document.getElementById('pl-sides-value').textContent = playlistCoverDraft.starSides;
                        ui.refreshPlaylistCoverPreview();
                    };
                }
                ui.refreshPlaylistCoverPreview();
            },
            refreshPlaylistCoverPreview: () => {
                const preview = document.getElementById('pl-cover-preview');
                if (!preview) return;
                preview.className = '';
                preview.style.cssText = '';
                preview.innerHTML = renderPlaylistCoverMarkup(playlistCoverDraft, 'w-14 h-14');
            },
            formatRelativeTime: (dateInput) => {
                if (!dateInput) return 'Just now';
                const date = typeof dateInput === 'number' ? new Date(dateInput) : new Date(dateInput);
                if (isNaN(date.getTime())) return 'Recently';
                const now = new Date();
                const diffSeconds = Math.max(0, Math.floor((now - date) / 1000));
                if (diffSeconds < 60) return 'Just now';
                const diffMins = Math.floor(diffSeconds / 60);
                if (diffMins < 60) return `${diffMins}m ago`;
                const diffHours = Math.floor(diffMins / 60);
                if (diffHours < 24) return `${diffHours}h ago`;
                const diffDays = Math.floor(diffHours / 24);
                if (diffDays === 1) return 'Yesterday';
                if (diffDays < 7) return `${diffDays}d ago`;
                return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            },
            toggleSpotifyModal: (show) => {
                const modal = document.getElementById('spotify-modal');
                if (show) {
                    modal.classList.remove('hidden');
                    const input = document.getElementById('sp-link-input');
                    if (input) {
                        input.value = '';
                        setTimeout(() => input.focus(), 100);
                    }
                    document.getElementById('sp-match-section')?.classList.add('hidden');
                    document.getElementById('sp-actions-bar')?.classList.add('hidden');
                } else {
                    modal.classList.add('hidden');
                }
            },
            toggleChangelogModal: (show) => {
                const modal = document.getElementById('changelog-modal');
                if (show) modal.classList.remove('hidden');
                else modal.classList.add('hidden');
            },
            toggleProfileModal: (show) => {
                const modal = document.getElementById('profile-modal');
                document.getElementById('profile-dropdown').classList.add('hidden');
                if(show) {
                    modal.classList.remove('hidden');
                    document.getElementById('edit-username-input').value = state.username;
                    document.getElementById('edit-username-input').focus();
                } else {
                    modal.classList.add('hidden');
                }
            },
            saveProfile: () => {
                const name = document.getElementById('edit-username-input').value.trim() || 'Guest User';
                state.username = name;
                localStorage.setItem('username', name);
                if (window.cloudLibrary?.session && window.dverse?.dtunes?.updateProfile) {
                    window.dverse.dtunes.updateProfile({ display_name: name }).then((updated) => {
                        if (updated) {
                            window.cloudLibrary.profile = { ...(window.cloudLibrary.profile || {}), ...updated };
                            window.cloudLibrary.updateUI();
                        }
                    }).catch(() => {});
                }
                ui.updateProfileUI();
                ui.toggleProfileModal(false);
            },
            avatarFallback: () => {
                const initial = (state.username || 'U').charAt(0).toUpperCase();
                return 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" rx="50" fill="#172329"/><text x="50" y="66" text-anchor="middle" font-family="sans-serif" font-size="45" fill="#a5c8cd">${initial.replace(/[<>&"']/g, '')}</text></svg>`);
            },
            updateProfileUI: () => {
                const usernameEl = document.getElementById('dd-username');
                if (usernameEl) usernameEl.textContent = state.username || 'Guest User';
                const avatar = state.avatarUrl || (ui.avatarFallback ? ui.avatarFallback() : 'https://placehold.co/100x100/111/fff?text=U');
                const headerAvatar = document.getElementById('header-avatar');
                const mobileAvatar = document.getElementById('mobile-nav-avatar');
                if (headerAvatar) {
                    headerAvatar.referrerPolicy = 'no-referrer';
                    headerAvatar.src = avatar;
                }
                if (mobileAvatar) {
                    mobileAvatar.referrerPolicy = 'no-referrer';
                    mobileAvatar.src = avatar;
                }
            },
            updateSettings: (key, val) => {
                if(key === 'quality') {
                    state.quality = val;
                    localStorage.setItem('audioQuality', val);
                }
            },
            renderEqualizerSettings: () => {
                const containers = [
                    { bandsId: 'eq-bands', presetsId: 'eq-settings-presets', prefix: 'set' },
                    { bandsId: 'eq-modal-bands', presetsId: 'eq-modal-presets', prefix: 'mod' }
                ];

                const currentPreset = getCurrentPresetId();

                containers.forEach(({ bandsId, presetsId, prefix }) => {
                    const bandsContainer = document.getElementById(bandsId);
                    const presetsContainer = document.getElementById(presetsId);

                    if (presetsContainer) {
                        presetsContainer.innerHTML = Object.entries(EQ_PRESETS).map(([key, preset]) => `
                            <button onclick="ui.setEqualizerPreset('${key}')" class="eq-preset-chip ${key === currentPreset ? 'active' : ''}" title="${preset.desc}">
                                <span>${preset.name}</span>
                            </button>
                        `).join('') + `
                            <button class="eq-preset-chip ${currentPreset === 'custom' ? 'active' : ''}" style="pointer-events:none;">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-width="2" d="M12 5v14M6 8v8M18 8v8"/></svg>
                                <span>Custom</span>
                            </button>
                        `;
                    }

                    if (bandsContainer) {
                        if (!bandsContainer.dataset.rendered) {
                            bandsContainer.innerHTML = EQ_BANDS.map((band) => `
                                <div class="eq-band">
                                    <span id="${prefix}-${band.key}-value" class="eq-value">0 dB</span>
                                    <div class="eq-slider-container custom-slider-container group" id="${prefix}-${band.key}-container">
                                        <div class="eq-track-bg"></div>
                                        <div class="eq-zero-line"></div>
                                        <div id="${prefix}-${band.key}-fill" class="eq-fill" style="top: 50%; height: 0;"></div>
                                        <div id="${prefix}-${band.key}-marker" class="eq-rounded-edge" style="top: 50%;"></div>
                                        <input id="${prefix}-${band.key}" type="range" min="-12" max="12" step="1" value="0" orient="vertical" aria-label="${band.label}" oninput="ui.updateEqualizer('${band.key}', this.value)" class="eq-custom-input">
                                    </div>
                                    <div class="flex flex-col items-center leading-none">
                                        <span class="eq-label">${band.label}</span>
                                        <span class="eq-sublabel">${band.subLabel}</span>
                                    </div>
                                </div>
                            `).join('');
                            bandsContainer.dataset.rendered = 'true';
                        }

                        EQ_BANDS.forEach((band) => {
                            const val = Number(state.equalizer[band.key] || 0);
                            const input = document.getElementById(`${prefix}-${band.key}`);
                            const label = document.getElementById(`${prefix}-${band.key}-value`);
                            const fill = document.getElementById(`${prefix}-${band.key}-fill`);
                            const marker = document.getElementById(`${prefix}-${band.key}-marker`);
                            if (input) input.value = val;
                            if (label) label.textContent = `${val > 0 ? '+' : ''}${val} dB`;

                            const pct = (val - (-12)) / 24;
                            const topPercent = (1 - pct) * 100;
                            if (marker) marker.style.top = `${topPercent}%`;
                            if (fill) {
                                if (val >= 0) {
                                    fill.style.top = `${topPercent}%`;
                                    fill.style.height = `${(pct - 0.5) * 100}%`;
                                } else {
                                    fill.style.top = '50%';
                                    fill.style.height = `${(0.5 - pct) * 100}%`;
                                }
                            }
                        });
                    }
                });
            },
            updateEqualizerMonitoring: (preampDb = 0) => {
                // No-op: headroom badges removed from UI
            },
            setEqualizerPreset: (presetId) => {
                const preset = EQ_PRESETS[presetId];
                if (!preset) return;
                EQ_BANDS.forEach((band) => {
                    state.equalizer[band.key] = preset.values[band.key] !== undefined ? preset.values[band.key] : 0;
                });
                localStorage.setItem('equalizerSettings', JSON.stringify(state.equalizer));
                if (!isAudioContextInitialized && state.currentTrack) setupAudioContext();
                ui.renderEqualizerSettings();
                applyEqualizer();
            },
            updateEqualizer: (band, value) => {
                if (!Object.prototype.hasOwnProperty.call(FLAT_EQUALIZER, band)) return;
                state.equalizer[band] = Number(value);
                localStorage.setItem('equalizerSettings', JSON.stringify(state.equalizer));
                ui.renderEqualizerSettings();
                if (!isAudioContextInitialized && state.currentTrack && Object.values(state.equalizer).some(v => Number(v) !== 0)) setupAudioContext();
                applyEqualizer();
            },
            resetEqualizer: () => {
                state.equalizer = { ...FLAT_EQUALIZER };
                localStorage.setItem('equalizerSettings', JSON.stringify(state.equalizer));
                ui.renderEqualizerSettings();
                applyEqualizer();
            },
            toggleEqualizerModal: (show) => {
                const modal = document.getElementById('equalizer-modal');
                if (!modal) return;
                if (show) {
                    ui.renderEqualizerSettings();
                    modal.classList.remove('hidden');
                } else {
                    modal.classList.add('hidden');
                }
            },
            clearAllData: () => {
                const confirmed = window.confirm("Clear all D'Tunes data saved in this browser? This cannot be undone.");
                if (!confirmed) return;
                audio.pause();
                audio.removeAttribute('src');
                audio.load();
                Object.keys(localStorage).forEach((key) => {
                    if ([
                        'likedIds', 'libraryIds', 'likedArtists', 'playHistory', 'artistPlayCounts', 'playlists', 'username',
                        'audioQuality', 'equalizerSettings', 'playbackState', 'preferredLanguage'
                    ].includes(key) || key.startsWith('recommendation')) {
                        localStorage.removeItem(key);
                    }
                });
                state.queue = [];
                state.userQueue = [];
                state.idx = -1;
                state.playing = false;
                state.loading = false;
                state.loaded = false;
                state.currentTrack = null;
                state.likedIds = [];
                state.libraryIds = [];
                state.likedArtists = [];
                state.playHistory = [];
                state.artistPlayCounts = {};
                state.playlists = {};
                state.username = 'Guest User';
                state.quality = 'high';
                state.equalizer = { ...FLAT_EQUALIZER };
                state.forYouSongs = [];
                state.queueExpanded = false;
                state.songDetailsExpanded = false;
                const rWrap = document.getElementById('queue-wrapper');
                if (rWrap) {
                    rWrap.classList.remove('queue-expanded', 'has-song-details', 'preview-expanded', 'track-swap-out');
                    rWrap.style.height = '';
                }
                const rExpand = document.getElementById('queue-expandable-area');
                if (rExpand) rExpand.style.maxHeight = '0px';
                document.getElementById('info-island')?.classList.remove('details-expanded');
                document.body.classList.remove('queue-sidebar-active');
                document.getElementById('player-footer').classList.add('translate-y-[150%]', 'opacity-0');
                document.body.classList.remove('mobile-player-open');
                document.getElementById('p-title').textContent = 'Not Playing';
                document.getElementById('p-artist').textContent = 'Select song';
                document.getElementById('curr-art-img').src = FALLBACK_ART;
                ui.setPlayerLoading(false);
                ui.updateProfileUI();
                ui.renderEqualizerSettings();
                applyEqualizer();
                ui.renderPlaylists();
                ui.renderLibraryLists();
                ui.renderQueue();
                ui.renderHistory();
                ui.updatePlayBtn();
                alert("D'Tunes data has been cleared.");
            },
            createPlaylist: () => {
                const name = document.getElementById('new-playlist-name').value.trim();
                if(name && !state.playlists[name]) { 
                    state.playlists[name] = [...stagedPlaylistSongs];
                    state.playlistStyles[name] = {
                        color: playlistCoverDraft.color,
                        icon: playlistCoverDraft.icon,
                        shape: playlistCoverDraft.shape,
                        cornerRadius: playlistCoverDraft.cornerRadius,
                        smoothness: 100,
                        starSides: playlistCoverDraft.starSides,
                        starCurve: 0.15,
                        starRotation: 0,
                        starScale: 1
                    };
                    localStorage.setItem('playlists', JSON.stringify(state.playlists));
                    localStorage.setItem('playlistStyles', JSON.stringify(state.playlistStyles));
                    cloudLibrary.savePlaylist(name);
                    ui.renderPlaylists(); 
                    ui.toggleModal(false); 
                }
            },
            renderStagedSongs: () => {
                const area = document.getElementById('pl-staged-area');
                const list = document.getElementById('pl-staged-songs');
                if(stagedPlaylistSongs.length > 0) {
                    area.classList.remove('hidden');
                    list.innerHTML = stagedPlaylistSongs.map(song => `
                        <div class="flex items-center gap-3 p-2 bg-white/5 rounded-lg border border-white/5">
                            <img src="${song.img}" class="w-8 h-8 rounded-md object-cover">
                            <div class="flex-1 min-w-0"><p class="text-xs text-white truncate">${utils.escapeHtml(song.name)}</p></div>
                        </div>
                    `).join('');
                } else { area.classList.add('hidden'); }
            },
            addSongToPlaylist: (playlistName) => {
                const song = songStore.get(ctxMenu.activeStoreId);
                if (song && state.playlists[playlistName]) {
                    if (!state.playlists[playlistName].some(s => s.id === song.id)) { state.playlists[playlistName].push(song); recommendationEvents.record('playlist_add', song, { context: { source: 'playlist' } }); localStorage.setItem('playlists', JSON.stringify(state.playlists)); cloudLibrary.savePlaylist(playlistName); ui.renderPlaylists(); }
                }
                document.getElementById('playlist-selector-modal').classList.add('hidden');
            },
            removeSongFromPlaylist: (playlistName, songId) => {
                if(playlistName === 'Liked Songs') { 
                    const song = state.likedIds.find(item => (typeof item === 'string' ? item : item.id) === songId) || state.playHistory.find(item => item.id === songId);
                    state.likedIds = state.likedIds.filter(item => (typeof item === 'string' ? item : item.id) !== songId); 
                    localStorage.setItem('likedIds', JSON.stringify(state.likedIds)); 
                    cloudLibrary.setLiked(typeof song === 'object' ? song : { id: songId }, false);
                } 
                else if (state.playlists[playlistName]) { 
                    state.playlists[playlistName] = state.playlists[playlistName].filter(s => s.id !== songId); 
                    localStorage.setItem('playlists', JSON.stringify(state.playlists)); 
                    cloudLibrary.savePlaylist(playlistName);
                }
                ui.renderPlaylists(); ui.openPlaylist(playlistName);
                if(state.currentTrack && state.currentTrack.id === songId) ui.updateMetadata(state.currentTrack);
            },
            deletePlaylist: (name) => {
                if(name === 'Liked Songs') return;
                delete state.playlists[name];
                delete state.playlistStyles[name];
                localStorage.setItem('playlists', JSON.stringify(state.playlists));
                localStorage.setItem('playlistStyles', JSON.stringify(state.playlistStyles));
                cloudLibrary.deletePlaylist(name);
                ui.renderPlaylists(); ui.switchView('home');
            },
            playPlaylist: async (name) => {
                let songs = [];
                if (name === 'Liked Songs') { 
                    songs = state.likedIds.map(item => typeof item === 'object' ? item : null).filter(Boolean);
                    if(songs.length !== state.likedIds.length) {
                        const fetched = await Promise.all(state.likedIds.map(async id => typeof id === 'string' ? await jiosaavnAPI.getSong(id) : id));
                        songs = fetched.filter(Boolean);
                    }
                } 
                else { songs = state.playlists[name] || []; }
                if (songs.length > 0) { state.queue = [...songs]; state.userQueue = []; state.idx = 0; player.playDirect(songs[0]); }
            },
            getPlaylistStyle: (name) => {
                if (name === 'Liked Songs') return { bg: 'bg-gradient-to-br from-red-900/70 via-zinc-950 to-black', icon: '<svg class="w-20 h-20 text-red-500 drop-shadow-xl" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>', customHtml: null };
                const custom = state.playlistStyles?.[name];
                if (custom) {
                    return {
                        bg: '',
                        icon: '',
                        customHtml: renderPlaylistCoverMarkup(custom, 'w-full h-full')
                    };
                }
                const themes = ['bg-gradient-to-br from-zinc-800/80 to-zinc-950', 'bg-gradient-to-br from-zinc-800/60 to-black', 'bg-gradient-to-tr from-zinc-900 to-zinc-950', 'bg-gradient-to-bl from-zinc-800/70 to-zinc-950', 'bg-gradient-to-tr from-zinc-900/80 to-black'];
                const index = name.length % themes.length;
                return { bg: themes[index], icon: `<span class="text-gray-300 drop-shadow-md uppercase">${name.substring(0, 2)}</span>`, customHtml: null };
            },
            showToast: (message, type = 'info', duration = 3000) => {
                const container = document.getElementById('toast-container');
                if (!container) return;
                const toast = document.createElement('div');
                const borderClass = type === 'error' ? 'border-red-500/40 bg-red-950/90 text-red-200' : (type === 'success' ? 'border-emerald-500/40 bg-emerald-950/90 text-emerald-200' : 'border-white/15 bg-zinc-900/90 text-white');
                const iconHtml = type === 'error'
                    ? '<svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>'
                    : (type === 'success'
                        ? '<svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>'
                        : '<svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>');

                toast.className = `flex items-center gap-2 px-4 py-2.5 rounded-2xl glass-panel shadow-2xl border text-xs font-bold pointer-events-auto transform transition-all duration-300 translate-y-4 opacity-0 ${borderClass}`;
                toast.innerHTML = `<span>${iconHtml}</span><span>${utils.escapeHtml(message)}</span>`;
                container.appendChild(toast);

                requestAnimationFrame(() => {
                    toast.classList.remove('translate-y-4', 'opacity-0');
                    toast.classList.add('translate-y-0', 'opacity-100');
                });

                setTimeout(() => {
                    toast.classList.remove('translate-y-0', 'opacity-100');
                    toast.classList.add('translate-y-2', 'opacity-0');
                    setTimeout(() => toast.remove(), 300);
                }, duration);
            },
            toggleSleepTimerModal: (show) => {
                const modal = document.getElementById('sleep-timer-modal');
                if (!modal) return;
                if (show) {
                    sleepTimer.updateUI();
                    modal.classList.remove('hidden');
                } else {
                    modal.classList.add('hidden');
                }
            },
            togglePlaylistEditorModal: (show) => {
                const modal = document.getElementById('playlist-editor-modal');
                if (!modal) return;
                if (show) {
                    modal.classList.remove('hidden');
                } else {
                    modal.classList.add('hidden');
                }
            },
            openPlaylistEditor: (name) => {
                const currentSongs = state.playlists[name] || [];
                const currentStyle = state.playlistStyles[name] || {
                    color: playlistCoverDraft.color,
                    icon: playlistCoverDraft.icon,
                    shape: playlistCoverDraft.shape,
                    cornerRadius: 20
                };

                ui.currentEditingPlaylistName = name;
                ui.editingPlaylistSongs = [...currentSongs];
                ui.editingPlaylistStyle = { ...currentStyle };

                const nameInput = document.getElementById('edit-pl-name-input');
                if (nameInput) nameInput.value = name;

                const countLabel = document.getElementById('edit-pl-song-count');
                if (countLabel) countLabel.textContent = `${ui.editingPlaylistSongs.length} tracks`;

                // Render Colors
                const colorPicker = document.getElementById('edit-pl-color-picker');
                if (colorPicker) {
                    colorPicker.innerHTML = PLAYLIST_COVER_COLORS.map(c => `
                        <button type="button" class="w-8 h-8 rounded-full border-2 transition ${ui.editingPlaylistStyle.color === c ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-75 hover:opacity-100'}" style="background-color: ${c};" onclick="ui.selectEditingColor('${c}')"></button>
                    `).join('');
                }

                // Render Icons
                const iconPicker = document.getElementById('edit-pl-icon-picker');
                if (iconPicker) {
                    iconPicker.innerHTML = Object.entries(PLAYLIST_COVER_ICONS).map(([key, svg]) => `
                        <button type="button" class="p-2.5 rounded-xl border transition ${ui.editingPlaylistStyle.icon === key ? 'border-[var(--accent-color)] bg-white/15 text-white' : 'border-white/10 bg-white/5 text-gray-400 hover:text-white'}" onclick="ui.selectEditingIcon('${key}')">
                            ${svg}
                        </button>
                    `).join('');
                }

                // Render Shapes
                const shapePicker = document.getElementById('edit-pl-shape-picker');
                if (shapePicker) {
                    const shapes = ['SmoothRect', 'Circle', 'Star', 'Diamond', 'RotatedPill'];
                    shapePicker.innerHTML = shapes.map(s => `
                        <button type="button" class="px-3 py-1.5 rounded-xl text-xs font-bold border transition ${ui.editingPlaylistStyle.shape === s ? 'border-[var(--accent-color)] bg-white/15 text-white' : 'border-white/10 bg-white/5 text-gray-400 hover:text-white'}" onclick="ui.selectEditingShape('${s}')">
                            ${s}
                        </button>
                    `).join('');
                }

                ui.renderEditingSongsList();
                ui.togglePlaylistEditorModal(true);
            },
            selectEditingColor: (color) => {
                ui.editingPlaylistStyle.color = color;
                document.querySelectorAll('#edit-pl-color-picker button').forEach((btn, i) => {
                    const c = PLAYLIST_COVER_COLORS[i];
                    btn.className = `w-8 h-8 rounded-full border-2 transition ${color === c ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-75 hover:opacity-100'}`;
                });
            },
            selectEditingIcon: (iconKey) => {
                ui.editingPlaylistStyle.icon = iconKey;
                document.querySelectorAll('#edit-pl-icon-picker button').forEach((btn, i) => {
                    const k = Object.keys(PLAYLIST_COVER_ICONS)[i];
                    btn.className = `p-2.5 rounded-xl border transition ${iconKey === k ? 'border-[var(--accent-color)] bg-white/15 text-white' : 'border-white/10 bg-white/5 text-gray-400 hover:text-white'}`;
                });
            },
            selectEditingShape: (shape) => {
                ui.editingPlaylistStyle.shape = shape;
                const shapes = ['SmoothRect', 'Circle', 'Star', 'Diamond', 'RotatedPill'];
                document.querySelectorAll('#edit-pl-shape-picker button').forEach((btn, i) => {
                    const s = shapes[i];
                    btn.className = `px-3 py-1.5 rounded-xl text-xs font-bold border transition ${shape === s ? 'border-[var(--accent-color)] bg-white/15 text-white' : 'border-white/10 bg-white/5 text-gray-400 hover:text-white'}`;
                });
            },
            renderEditingSongsList: () => {
                const listEl = document.getElementById('edit-pl-songs-list');
                const countLabel = document.getElementById('edit-pl-song-count');
                if (countLabel) countLabel.textContent = `${ui.editingPlaylistSongs.length} tracks`;
                if (!listEl) return;

                if (ui.editingPlaylistSongs.length === 0) {
                    listEl.innerHTML = '<p class="text-xs text-gray-500 py-3 text-center">No songs in playlist.</p>';
                    return;
                }

                listEl.innerHTML = ui.editingPlaylistSongs.map((song, index) => `
                    <div class="flex items-center justify-between p-2 rounded-xl bg-white/5 border border-white/5 gap-2">
                        <img src="${song.img}" class="w-8 h-8 rounded-lg object-cover flex-shrink-0">
                        <div class="flex-1 min-w-0">
                            <p class="text-xs font-bold text-white truncate">${utils.escapeHtml(song.name)}</p>
                            <p class="text-[10px] text-gray-400 truncate">${utils.escapeHtml(song.artist)}</p>
                        </div>
                        <div class="flex items-center gap-1 flex-shrink-0">
                            <button type="button" class="p-1 text-gray-400 hover:text-white rounded hover:bg-white/10 disabled:opacity-30" ${index === 0 ? 'disabled' : ''} onclick="ui.moveEditingSong(${index}, -1)" title="Move up">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"/></svg>
                            </button>
                            <button type="button" class="p-1 text-gray-400 hover:text-white rounded hover:bg-white/10 disabled:opacity-30" ${index === ui.editingPlaylistSongs.length - 1 ? 'disabled' : ''} onclick="ui.moveEditingSong(${index}, 1)" title="Move down">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                            </button>
                            <button type="button" class="p-1 text-red-400 hover:text-red-300 rounded hover:bg-red-500/10" onclick="ui.removeEditingSong(${index})" title="Remove">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                            </button>
                        </div>
                    </div>
                `).join('');
            },
            moveEditingSong: (index, direction) => {
                const target = index + direction;
                if (target < 0 || target >= ui.editingPlaylistSongs.length) return;
                const item = ui.editingPlaylistSongs.splice(index, 1)[0];
                ui.editingPlaylistSongs.splice(target, 0, item);
                ui.renderEditingSongsList();
            },
            removeEditingSong: (index) => {
                ui.editingPlaylistSongs.splice(index, 1);
                ui.renderEditingSongsList();
            },
            savePlaylistEditorChanges: () => {
                const oldName = ui.currentEditingPlaylistName;
                const newName = document.getElementById('edit-pl-name-input').value.trim() || oldName;

                if (oldName !== newName && state.playlists[newName]) {
                    alert('A playlist with this name already exists.');
                    return;
                }

                if (oldName !== newName) {
                    delete state.playlists[oldName];
                    delete state.playlistStyles[oldName];
                    cloudLibrary.deletePlaylist(oldName);
                }

                state.playlists[newName] = [...ui.editingPlaylistSongs];
                state.playlistStyles[newName] = { ...ui.editingPlaylistStyle };

                localStorage.setItem('playlists', JSON.stringify(state.playlists));
                localStorage.setItem('playlistStyles', JSON.stringify(state.playlistStyles));
                cloudLibrary.savePlaylist(newName);

                ui.togglePlaylistEditorModal(false);
                ui.renderPlaylists();
                ui.openPlaylist(newName);
                ui.showToast(`Saved changes to "${newName}"`, 'success');
            },
            openPlaylist: async (name) => {
                ui.switchView('playlist');
                document.getElementById('playlist-view-title').textContent = utils.escapeHtml(name);
                let songs = [];
                if (name === 'Liked Songs') { 
                    const loaded = [];
                    for (let i = 0; i < state.likedIds.length; i++) {
                        if(typeof state.likedIds[i] === 'string') {
                            const fetched = await jiosaavnAPI.getSong(state.likedIds[i]);
                            if(fetched) { loaded.push(fetched); state.likedIds[i] = fetched; }
                        } else { loaded.push(state.likedIds[i]); }
                    }
                    localStorage.setItem('likedIds', JSON.stringify(state.likedIds));
                    songs = loaded;
                } 
                else { songs = state.playlists[name] || []; }

                let totalSec = songs.reduce((acc, s) => acc + (parseInt(s.duration) || 0), 0);
                let durationStr = totalSec > 3600 ? `${Math.floor(totalSec / 3600)} hr ${Math.floor((totalSec % 3600) / 60)} min` : `${Math.floor(totalSec / 60)} min`;
                document.getElementById('playlist-view-count').textContent = `${songs.length} tracks • ${durationStr}`;
                
                const style = ui.getPlaylistStyle(name);
                document.getElementById('pl-view-art').className = `w-48 h-48 md:w-full md:aspect-square rounded-2xl shadow-2xl flex items-center justify-center text-5xl md:text-6xl font-bold text-white shadow-black/50 overflow-hidden ${style.bg}`;
                document.getElementById('pl-view-art').innerHTML = style.customHtml || style.icon;

                const customActions = document.getElementById('playlist-custom-actions');
                if (customActions) {
                    if (name === 'Liked Songs') customActions.classList.add('hidden');
                    else customActions.classList.remove('hidden');
                }

                const listEl = document.getElementById('playlist-songs-list');
                if (songs.length === 0) { listEl.innerHTML = '<p class="text-gray-400 py-4">No songs in this playlist yet.</p>'; } 
                else { listEl.innerHTML = songs.map(song => ui.createListRow(song, name)).join(''); }
                
                document.getElementById('playlist-play-all').onclick = () => ui.playPlaylist(name);
                const plPlayNext = document.getElementById('playlist-play-next');
                if (plPlayNext) plPlayNext.onclick = () => player.addPlaylistNext(name);
                const plAddQueue = document.getElementById('playlist-add-queue');
                if (plAddQueue) plAddQueue.onclick = () => player.addPlaylistToQueue(name);
                const plBtnEdit = document.getElementById('playlist-btn-edit');
                if (plBtnEdit) plBtnEdit.onclick = () => ui.openPlaylistEditor(name);
                const plBtnDelete = document.getElementById('playlist-btn-delete');
                if (plBtnDelete) plBtnDelete.onclick = () => ui.deletePlaylist(name);
                const aiReportBtn = document.getElementById('playlist-ai-report-btn');
                const isAiPlaylist = /vibe|capsule|daily|mix|ai|generated/i.test(name) || (state.playlistStyles && (state.playlistStyles[name]?.icon === 'sparkles' || state.playlistStyles[name]?.icon === 'history'));
                if (aiReportBtn) {
                    if (isAiPlaylist) {
                        aiReportBtn.classList.remove('hidden');
                        aiReportBtn.classList.add('flex');
                        aiReportBtn.onclick = () => {
                            if (window.aiReportManager) {
                                window.aiReportManager.openReportModal({
                                    feature: 'AI Vibe / Mix Playlist',
                                    contentSummary: `Playlist: "${name}" (${songs.length} tracks)`,
                                    context: {
                                        title: name,
                                        trackCount: songs.length,
                                        sampleTracks: songs.slice(0, 5).map(s => `${s.name || s.title} - ${s.artist || ''}`)
                                    }
                                });
                            }
                        };
                    } else {
                        aiReportBtn.classList.add('hidden');
                        aiReportBtn.classList.remove('flex');
                    }
                }

                updateMarquees();
            },
            openAlbum: async (albumId) => {
                ui.switchView('album');
                const titleEl = document.getElementById('album-view-title');
                const artistEl = document.getElementById('album-view-artist');
                const metaEl = document.getElementById('album-view-meta');
                const artEl = document.getElementById('album-view-art');
                const listEl = document.getElementById('album-songs-list');

                if (titleEl) titleEl.textContent = 'Loading album...';
                if (artistEl) artistEl.textContent = '';
                if (metaEl) metaEl.textContent = '';
                if (artEl) artEl.src = FALLBACK_ART;
                if (listEl) listEl.innerHTML = '<div class="text-gray-400 py-8 text-center"><div class="w-6 h-6 border-2 border-[var(--accent-color)] border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>Loading tracks...</div>';

                try {
                    const data = await jiosaavnAPI.fetchWithRetry(`${JIOSAAVN_API}/albums?id=${albumId}`);
                    const albumData = data.data || {};
                    const title = albumData.name || albumData.title || 'Album';
                    const artist = albumData.artist || albumData.primaryArtists || 'Artist';
                    const artistId = albumData.artistId || albumData.primaryArtistsId || '';
                    const year = albumData.year || '';
                    const img = albumData.image ? (Array.isArray(albumData.image) ? albumData.image[albumData.image.length - 1]?.url || albumData.image[0]?.url : albumData.image) : FALLBACK_ART;
                    const songs = (albumData.songs || []).map(jiosaavnAPI.normalizeSong).filter(Boolean);

                    if (titleEl) titleEl.textContent = title;
                    if (artistEl) {
                        artistEl.textContent = artist;
                        artistEl.onclick = () => { if (artistId) ui.openArtist(artistId, artist); };
                    }
                    
                    let totalSec = songs.reduce((acc, s) => acc + (parseInt(s.duration) || 0), 0);
                    let durationStr = totalSec > 3600 ? `${Math.floor(totalSec / 3600)} hr ${Math.floor((totalSec % 3600) / 60)} min` : `${Math.floor(totalSec / 60)} min`;
                    if (metaEl) metaEl.textContent = `${year ? year + ' • ' : ''}${songs.length} tracks • ${durationStr}`;
                    if (artEl) artEl.src = img;

                    if (songs.length === 0) {
                        if (listEl) listEl.innerHTML = '<p class="text-gray-400 py-4">No songs found in this album.</p>';
                    } else {
                        if (listEl) {
                            listEl.innerHTML = songs.map(song => ui.createListRow(song)).join('');
                        }
                    }

                    const albumPlayAll = document.getElementById('album-play-all');
                    if (albumPlayAll) {
                        albumPlayAll.onclick = () => {
                            if (songs.length > 0) {
                                state.queue = [...songs];
                                state.userQueue = [];
                                state.idx = 0;
                                player.playDirect(songs[0]);
                            }
                        };
                    }
                    const albumPlayNext = document.getElementById('album-play-next');
                    if (albumPlayNext) albumPlayNext.onclick = () => player.addAlbumNext(albumId);
                    const albumAddQueue = document.getElementById('album-add-queue');
                    if (albumAddQueue) albumAddQueue.onclick = () => player.addAlbumToQueue(albumId);

                    updateMarquees();
                } catch (e) {
                    if (titleEl) titleEl.textContent = 'Failed to load album';
                    if (listEl) listEl.innerHTML = '<p class="text-red-400 py-4">Error loading album details. Please try again.</p>';
                }
            },
            openArtist: async (artistId, fallbackName = 'Artist') => {
                ui.switchView('artist');
                const nameEl = document.getElementById('artist-view-name');
                const subtitleEl = document.getElementById('artist-view-subtitle');
                const avatarEl = document.getElementById('artist-view-avatar');
                const heroBgEl = document.getElementById('artist-hero-bg');
                const topSongsEl = document.getElementById('artist-top-songs-list');
                const albumsGridEl = document.getElementById('artist-albums-grid');
                const followBtn = document.getElementById('artist-follow-btn');
                const followText = document.getElementById('artist-follow-text');

                if (nameEl) nameEl.textContent = fallbackName;
                if (subtitleEl) subtitleEl.textContent = 'Loading artist...';
                if (avatarEl) avatarEl.src = FALLBACK_ART;
                if (topSongsEl) topSongsEl.innerHTML = '<div class="text-gray-400 py-8 text-center"><div class="w-6 h-6 border-2 border-[var(--accent-color)] border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>Loading top songs...</div>';
                if (albumsGridEl) albumsGridEl.innerHTML = '';

                const isFollowing = state.likedArtists.some(a => (a.id || a.name) === artistId || a.name === fallbackName);
                if (followText) followText.textContent = isFollowing ? 'Following' : 'Follow';
                if (followBtn) followBtn.className = isFollowing ? 'px-5 py-2.5 rounded-full bg-white text-black font-bold text-xs font-bold transition flex items-center gap-1.5' : 'px-5 py-2.5 rounded-full border border-white/20 bg-white/5 text-white text-xs font-bold hover:bg-white/15 transition flex items-center gap-1.5';

                try {
                    let artistData = null;
                    if (artistId) {
                        const data = await jiosaavnAPI.fetchWithRetry(`${JIOSAAVN_API}/artists?id=${artistId}`);
                        artistData = data.data || {};
                    } else {
                        const data = await jiosaavnAPI.fetchWithRetry(`${JIOSAAVN_API}/search/artists?query=${encodeURIComponent(fallbackName)}`);
                        const first = data.data?.results?.[0];
                        if (first?.id) {
                            const full = await jiosaavnAPI.fetchWithRetry(`${JIOSAAVN_API}/artists?id=${first.id}`);
                            artistData = full.data || {};
                        }
                    }

                    const name = artistData?.name || fallbackName;
                    const img = artistData?.image ? (Array.isArray(artistData.image) ? artistData.image[artistData.image.length - 1]?.url || artistData.image[0]?.url : artistData.image) : FALLBACK_ART;
                    const topSongs = (artistData?.topSongs || []).map(jiosaavnAPI.normalizeSong).filter(Boolean);
                    const topAlbums = artistData?.topAlbums || [];

                    if (nameEl) nameEl.textContent = name;
                    if (subtitleEl) subtitleEl.textContent = artistData?.fanCount ? `${parseInt(artistData.fanCount).toLocaleString()} Monthly Listeners` : 'Top Artist';
                    if (avatarEl) avatarEl.src = img;
                    if (heroBgEl) heroBgEl.style.backgroundImage = `url('${img}')`;

                    if (followBtn) {
                        followBtn.onclick = () => {
                            ui.toggleArtistLike({ id: artistId || name, name, img, type: 'artist' });
                            const nowFollowing = state.likedArtists.some(a => (a.id || a.name) === (artistId || name));
                            if (followText) followText.textContent = nowFollowing ? 'Following' : 'Follow';
                            followBtn.className = nowFollowing ? 'px-5 py-2.5 rounded-full bg-white text-black font-bold text-xs font-bold transition flex items-center gap-1.5' : 'px-5 py-2.5 rounded-full border border-white/20 bg-white/5 text-white text-xs font-bold hover:bg-white/15 transition flex items-center gap-1.5';
                        };
                    }

                    if (topSongs.length === 0) {
                        if (topSongsEl) topSongsEl.innerHTML = '<p class="text-gray-400 py-4">No top songs found for this artist.</p>';
                    } else {
                        if (topSongsEl) {
                            topSongsEl.innerHTML = topSongs.slice(0, 10).map(song => ui.createListRow(song)).join('');
                        }
                    }

                    const artistPlayAll = document.getElementById('artist-play-all');
                    if (artistPlayAll) {
                        artistPlayAll.onclick = () => {
                            if (topSongs.length > 0) {
                                state.queue = [...topSongs];
                                state.userQueue = [];
                                state.idx = 0;
                                player.playDirect(topSongs[0]);
                            }
                        };
                    }
                    const artistAddQueue = document.getElementById('artist-add-queue');
                    if (artistAddQueue) {
                        artistAddQueue.onclick = () => {
                            if (topSongs.length > 0) {
                                state.userQueue.push(...topSongs);
                                ui.renderQueue();
                                primeNextTrack();
                                persist.save();
                                ui.showToast(`Added ${topSongs.length} top songs to queue`);
                            }
                        };
                    }

                    if (topAlbums.length === 0) {
                        if (albumsGridEl) albumsGridEl.innerHTML = '<p class="text-gray-400 py-4 col-span-full">No albums found for this artist.</p>';
                    } else {
                        if (albumsGridEl) {
                            albumsGridEl.innerHTML = topAlbums.map(alb => {
                                const albImg = alb.image ? (Array.isArray(alb.image) ? alb.image[alb.image.length - 1]?.url || alb.image[0]?.url : alb.image) : FALLBACK_ART;
                                const albId = utils.escapeJs(alb.id || alb.albumId || '');
                                return `
                                <div class="scroll-card glass-panel p-3 rounded-xl transition hover-pause group relative flex flex-col w-full cursor-pointer" onclick="ui.openAlbum('${albId}')">
                                    <div class="relative aspect-square rounded-lg overflow-hidden mb-3 bg-gray-800 shadow-md">
                                        <img src="${albImg}" class="w-full h-full object-cover group-hover:scale-105 transition duration-500" loading="lazy">
                                        <div class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                                            <span class="bg-white text-black font-bold p-3 rounded-full shadow-xl transform scale-75 group-hover:scale-100 transition"><svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>
                                        </div>
                                    </div>
                                    <div class="w-full min-w-0 flex-1">
                                        <div class="marquee-container w-full"><h4 class="font-bold text-white text-xs marquee-text">${utils.escapeHtml(alb.name || alb.title || 'Album')}</h4></div>
                                        <p class="text-[11px] text-gray-400 mt-1">${alb.year ? alb.year : 'Album'}</p>
                                    </div>
                                </div>`;
                            }).join('');
                        }
                    }

                    updateMarquees();
                } catch (e) {
                    if (subtitleEl) subtitleEl.textContent = 'Error loading artist details.';
                }
            },
            activeLibraryTab: 'all',
            switchLibraryTab: (tab) => {
                ui.activeLibraryTab = tab || 'all';
                document.querySelectorAll('.library-filter-tab').forEach(btn => {
                    btn.classList.toggle('is-active', btn.getAttribute('data-tab') === ui.activeLibraryTab);
                });
                document.querySelectorAll('.library-tab-panel').forEach(panel => {
                    panel.classList.add('hidden');
                });
                const activePanel = document.getElementById(`library-tab-content-${ui.activeLibraryTab}`);
                if (activePanel) {
                    activePanel.classList.remove('hidden');
                }
                ui.renderLibrary();
            },
            filterLibraryContent: (query) => {
                const q = (query || '').trim().toLowerCase();
                const activePanel = document.getElementById(`library-tab-content-${ui.activeLibraryTab || 'all'}`);
                if (!activePanel) return;
                const items = activePanel.querySelectorAll('.scroll-card, .np-row, .swipe-song');
                items.forEach(el => {
                    if (!q) {
                        el.style.display = '';
                    } else {
                        const txt = el.textContent.toLowerCase();
                        el.style.display = txt.includes(q) ? '' : 'none';
                    }
                });
            },
            renderPlaylists: () => {
                const grid = document.getElementById('playlists-grid');
                const fullGrid = document.getElementById('full-playlists-grid');
                if (!grid && !fullGrid) return;
                let html = '';

                // Create Playlist Action Card
                html += `
                <div class="scroll-card glass-panel p-3 rounded-2xl transition hover-pause group relative flex flex-col w-full cursor-pointer border border-dashed border-white/20 hover:border-white/40 bg-white/[0.02]" onclick="ui.toggleModal(true)">
                    <div class="relative aspect-square rounded-xl overflow-hidden mb-3 shadow-md flex items-center justify-center bg-white/5 border border-white/10 group-hover:bg-white/10 transition">
                        <span class="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center group-hover:scale-110 transition shadow-lg">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/></svg>
                        </span>
                    </div>
                    <div class="w-full min-w-0 flex-1">
                        <div class="marquee-container w-full"><h3 class="font-bold text-white text-sm marquee-text">Create Playlist</h3></div>
                        <p class="text-xs text-zinc-400 mt-0.5">New mix</p>
                    </div>
                </div>`;

                // Vibe Mix Card
                html += `
                <div class="scroll-card glass-panel p-3 rounded-2xl transition hover-pause group relative flex flex-col w-full cursor-pointer border border-white/10 hover:border-white/20 bg-white/[0.02]" onclick="ui.toggleVibeMixModal(true)">
                    <div class="relative aspect-square rounded-xl overflow-hidden mb-3 shadow-md flex items-center justify-center bg-gradient-to-br from-zinc-800/80 to-zinc-950 border border-white/10 group-hover:border-white/20 transition">
                        <span class="relative w-12 h-12 rounded-full bg-white/15 border border-white/20 text-white flex items-center justify-center group-hover:scale-110 transition">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                        </span>
                    </div>
                    <div class="w-full min-w-0 flex-1">
                        <div class="marquee-container w-full"><h3 class="font-bold text-white text-sm marquee-text">Vibe Mix</h3></div>
                        <p class="text-xs text-zinc-400 mt-0.5">Curate any mood</p>
                    </div>
                </div>`;

                // Spotify Import Card
                html += `
                <div class="scroll-card glass-panel p-3 rounded-2xl transition hover-pause group relative flex flex-col w-full cursor-pointer border border-white/10 hover:border-white/20" onclick="ui.toggleSpotifyModal(true)">
                    <div class="relative aspect-square rounded-xl overflow-hidden mb-3 shadow-md flex items-center justify-center bg-[#181818] border border-[#1DB954]/20 group-hover:border-[#1DB954]/50 transition">
                        <svg viewBox="0 0 24 24" width="44" height="44" fill="#1DB954" class="opacity-80 group-hover:opacity-100 group-hover:scale-110 transition"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.24 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.6.18-1.2.72-1.38 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.239.54-.959.72-1.56.3z"/></svg>
                    </div>
                    <div class="w-full min-w-0 flex-1">
                        <div class="marquee-container w-full"><h3 class="font-bold text-[#1DB954] text-sm marquee-text">Import Spotify</h3></div>
                        <p class="text-xs text-zinc-400 mt-0.5">Connect Account</p>
                    </div>
                </div>`;

                Object.keys(state.playlists).forEach(name => {
                    const style = ui.getPlaylistStyle(name);
                    html += `
                    <div class="scroll-card glass-panel p-3 rounded-2xl transition hover-pause group relative flex flex-col w-full cursor-pointer border border-white/10 hover:border-white/20" onclick="ui.openPlaylist('${utils.escapeJs(name)}')">
                        <div class="relative aspect-square rounded-xl overflow-hidden mb-3 shadow-md flex items-center justify-center text-4xl font-bold ${style.bg}">
                            ${style.customHtml || style.icon}
                            <div class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                                <span class="bg-white text-black font-bold p-3 rounded-full shadow-xl transform scale-75 group-hover:scale-100 transition"><svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>
                            </div>
                        </div>
                        <button class="absolute top-4 right-4 p-1.5 bg-black/60 backdrop-blur-md rounded-full text-white opacity-100 md:opacity-0 md:group-hover:opacity-100 transition shadow-lg hover:bg-white/20 z-10" onclick="event.stopPropagation(); ctxMenu.showPlaylist(event, '${utils.escapeJs(name)}')">
                            <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M3 9.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/></svg>
                        </button>
                        <div class="w-full min-w-0 flex-1">
                            <div class="marquee-container w-full"><h3 class="font-bold text-white text-sm marquee-text">${utils.escapeHtml(name)}</h3></div>
                            <p class="text-xs text-zinc-400 mt-0.5">${state.playlists[name].length} tracks</p>
                        </div>
                    </div>`;
                });
                if (grid) grid.innerHTML = html;
                if (fullGrid) fullGrid.innerHTML = html;
                ui.renderLibraryLists();
                updateMarquees();
            },
            libraryEmptyState: ({ icon, title, message, actionLabel = '', action = '', wrapClass = '' }) => {
                const actionHtml = action ? `
                    <button onclick="${action}" class="mt-1 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-gray-200 hover:text-white transition cursor-pointer">
                        ${actionLabel}
                    </button>` : '';
                return `
                <div class="flex flex-col items-center text-center gap-2 px-5 py-8 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] ${wrapClass}">
                    <div class="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-400">
                        ${icon}
                    </div>
                    <p class="text-sm font-bold text-gray-200 mt-1">${title}</p>
                    <p class="text-xs text-gray-500 max-w-[240px] leading-relaxed">${message}</p>
                    ${actionHtml}
                </div>`;
            },
            resolveStoredSongList: (entries) => {
                const idOf = item => {
                    const id = item && typeof item === 'object' ? item.id : item;
                    return typeof id === 'string' || typeof id === 'number' ? String(id) : '';
                };
                const isSong = item => item && typeof item === 'object' && idOf(item) && (item.name || item.title);
                const knownSongs = new Map();
                [state.playHistory, state.libraryIds, state.likedIds, state.queue, state.userQueue,
                    [state.currentTrack], [...songStore.songs.values()]].forEach(list => {
                    (Array.isArray(list) ? list : []).forEach(song => {
                        if (isSong(song)) knownSongs.set(idOf(song), song);
                    });
                });
                const songs = [];
                const seen = new Set();
                let unresolved = 0;
                (Array.isArray(entries) ? entries : []).forEach(item => {
                    const id = idOf(item);
                    if (!id || seen.has(id)) return;
                    seen.add(id);
                    const song = isSong(item) ? item : knownSongs.get(id);
                    if (song) songs.push(song);
                    else unresolved++;
                });
                return { songs, unresolved };
            },
            renderLibraryLists: () => {
                const librarySongs = document.getElementById('library-songs');
                const fullLikedList = document.getElementById('full-liked-list');
                const likedArtists = document.getElementById('library-liked-artists');
                const fullArtistsGrid = document.getElementById('full-artists-grid');
                const history = document.getElementById('library-history');
                const goSearch = "ui.switchView('search'); setTimeout(() => document.getElementById('search-input')?.focus(), 60)";
                if (librarySongs || fullLikedList) {
                    const liked = ui.resolveStoredSongList(state.likedIds);
                    let songsHtml = liked.songs.map(song => ui.createSongPill(song, `playSongById('${songStore.add(song)}')`, 'library')).join('');
                    if (!songsHtml && !liked.unresolved) songsHtml = ui.libraryEmptyState({
                        icon: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>',
                        title: 'No liked songs yet',
                        message: 'Double-click any song or click the heart icon to save favorites.',
                        actionLabel: 'Discover songs',
                        action: goSearch
                    });
                    if (liked.unresolved) songsHtml += ui.libraryEmptyState({
                        icon: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>',
                        title: 'Some liked songs need details',
                        message: 'Your likes are saved. Open the Liked Songs playlist to load their details.',
                        actionLabel: 'Open Liked Songs',
                        action: "ui.openPlaylist('Liked Songs')"
                    });
                    if (librarySongs) librarySongs.innerHTML = songsHtml;
                    if (fullLikedList) fullLikedList.innerHTML = songsHtml;
                }
                if (likedArtists) {
                    const artistsHtml = state.likedArtists.length
                        ? state.likedArtists.map(artist => ui.createArtistCard(artist)).join('')
                        : null;
                    if (fullArtistsGrid) fullArtistsGrid.innerHTML = artistsHtml || ui.libraryEmptyState({
                        icon: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>',
                        title: 'No liked artists yet',
                        message: 'Like artists from search or album pages and they will appear here.',
                        actionLabel: 'Search artists',
                        action: goSearch
                    });
                    likedArtists.innerHTML = artistsHtml || ui.libraryEmptyState({
                            icon: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>',
                            title: 'No liked artists yet',
                            message: 'Like artists from search and they’ll gather here.',
                            actionLabel: 'Search artists',
                            action: goSearch,
                            wrapClass: 'col-span-full'
                        });
                }
                if (history) {
                    history.innerHTML = state.playHistory.length
                        ? state.playHistory.map(song => ui.createSongPill(song, `playSongById('${songStore.add(song)}')`, 'history')).join('')
                        : ui.libraryEmptyState({
                            icon: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
                            title: 'Nothing played yet',
                            message: 'Songs you play will show up here so you can replay them.',
                            actionLabel: 'Start listening',
                            action: "ui.switchView('home')"
                        });
                }
                updateMarquees();
                ui.updateLibraryStats();
                ui.renderDownloads();
            },
            renderDownloads: () => {
                const container = document.getElementById('library-downloads');
                if (!container) return;
                const storageEl = document.getElementById('library-downloads-storage');
                const token = (ui._downloadsPaintToken || 0) + 1;
                ui._downloadsPaintToken = token;
                const paint = (items) => {
                    if (ui._downloadsPaintToken !== token) return;
                    if (storageEl) {
                        const usage = offlineStore.usage();
                        storageEl.textContent = items.length ? `${items.length} saved • ${offlineStore.formatBytes(usage.bytes)}` : '';
                    }
                    container.innerHTML = items.length
                        ? items.map(song => ui.createSongPill(song, `playSongById('${songStore.add(song)}')`, 'downloads')).join('')
                        : ui.libraryEmptyState({
                            icon: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v10m0 0l-4-4m4 4l4-4"/></svg>',
                            title: 'Nothing saved offline yet',
                            message: 'Use “Download for offline” on any song to keep it playable without a connection.',
                            actionLabel: 'Find songs',
                            action: "ui.switchView('search'); setTimeout(() => document.getElementById('search-input')?.focus(), 60)"
                        });
                    updateMarquees();
                };
                const cached = offlineStore.getMeta && offlineStore.usage().count;
                if (cached) paint([]);
                offlineStore.list().then(paint).catch(() => paint([]));
            },
            updateDownloadContextLabel: (song) => {
                const label = document.getElementById('cm-download-label');
                const progressEl = document.getElementById('cm-download-progress');
                if (!label) return;
                const id = song ? (song.id || song.saavn_id) : null;
                if (!id) {
                    label.textContent = 'Download for offline';
                    if (progressEl) progressEl.textContent = '';
                    return;
                }
                if (offlineStore.isDownloaded(id)) {
                    label.textContent = 'Remove download';
                    if (progressEl) progressEl.textContent = 'Saved';
                    return;
                }
                const job = offlineStore.getProgress(id);
                if (job && (job.status === 'downloading' || job.status === 'encrypting')) {
                    label.textContent = 'Downloading…';
                    if (progressEl) progressEl.textContent = offlineStore.formatProgress(job);
                    return;
                }
                label.textContent = 'Download for offline';
                if (progressEl) progressEl.textContent = '';
            },
            toggleOfflineDownload: (song) => {
                if (!song) return;
                const id = song.id || song.saavn_id;
                if (!id) {
                    ui.showToast('This track cannot be saved offline.', 'error');
                    return;
                }
                if (offlineStore.isDownloaded(id)) {
                    offlineStore.remove(id)
                        .then(() => {
                            ui.showToast('Removed from Offline Downloads');
                            ui.renderDownloads();
                        })
                        .catch(() => ui.showToast('Could not remove the download.', 'error'));
                    return;
                }
                if (!offlineStore.supported()) {
                    ui.showToast('Offline downloads are not supported in this browser.', 'error');
                    return;
                }
                ui.showToast('Saving for offline…');
                offlineStore.download(song)
                    .then(() => {
                        ui.showToast(`“${song.name || 'Track'}” saved for offline`, 'success');
                        ui.renderDownloads();
                    })
                    .catch((err) => {
                        const message = err && err.message ? err.message : 'Download failed.';
                        if (!/cancel|abort/i.test(message)) ui.showToast(message, 'error');
                        ui.renderDownloads();
                    });
            },
            renderLibrary: () => {
                ui.renderPlaylists();
                ui.renderLibraryLists();
            },
            updateLibraryStats: () => {
                const statEl = document.getElementById('library-stats-text');
                const playlistCount = Object.keys(state.playlists).length;
                const likedCount = state.likedIds.length;
                const artistCount = state.likedArtists.length;
                let downloadCount = 0;
                let downloadBytes = 0;
                if (typeof offlineStore !== 'undefined' && offlineStore.usage) {
                    const u = offlineStore.usage();
                    downloadCount = u.count || 0;
                    downloadBytes = u.bytes || 0;
                }

                // Update tab badges
                const bP = document.getElementById('lib-count-playlists');
                const bL = document.getElementById('lib-count-liked');
                const bA = document.getElementById('lib-count-artists');
                const bD = document.getElementById('lib-count-downloads');
                if (bP) bP.textContent = playlistCount;
                if (bL) bL.textContent = likedCount;
                if (bA) bA.textContent = artistCount;
                if (bD) bD.textContent = downloadCount;

                // Update featured cards
                const cardLiked = document.getElementById('card-liked-count');
                const cardDown = document.getElementById('card-downloads-count');
                const cardDownStorage = document.getElementById('card-downloads-storage');
                if (cardLiked) cardLiked.textContent = `${likedCount} track${likedCount === 1 ? '' : 's'}`;
                if (cardDown) cardDown.textContent = `${downloadCount} offline track${downloadCount === 1 ? '' : 's'}`;
                if (cardDownStorage && typeof offlineStore !== 'undefined' && offlineStore.formatBytes) {
                    cardDownStorage.textContent = offlineStore.formatBytes(downloadBytes);
                }

                // Update section badges
                const sP = document.getElementById('section-playlists-count');
                const sL = document.getElementById('section-liked-count');
                const sA = document.getElementById('section-artists-count');
                if (sP) sP.textContent = `${playlistCount} playlists`;
                if (sL) sL.textContent = `${likedCount} songs`;
                if (sA) sA.textContent = `${artistCount} artists`;

                if (statEl) {
                    if (playlistCount + likedCount + artistCount + downloadCount === 0) {
                        statEl.textContent = 'Playlists, liked songs and artists all live here once you start collecting.';
                    } else {
                        const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
                        statEl.textContent = [
                            plural(playlistCount, 'playlist'),
                            plural(likedCount, 'liked song'),
                            plural(artistCount, 'artist'),
                            plural(downloadCount, 'offline track')
                        ].join('  •  ');
                    }
                }
            },
            createArtistCard: (artist) => {
                const id = utils.escapeJs(artist.id || artist.name);
                return `
                <div class="scroll-card glass-panel p-3 rounded-xl transition hover-pause group relative flex flex-col w-full cursor-pointer" onclick="playContext('artist', '${id}')">
                    <div class="relative aspect-square rounded-lg overflow-hidden mb-3 bg-gray-800 shadow-md">
                        <img src="${artist.img || FALLBACK_ART}" class="w-full h-full object-cover group-hover:scale-105 transition duration-500" loading="lazy">
                        <button class="absolute top-2 right-2 p-2 rounded-full bg-red-500 text-white shadow-lg" onclick="event.stopPropagation(); ui.toggleArtistLike({ id: '${id}', name: '${utils.escapeJs(artist.name)}', artist: '${utils.escapeJs(artist.artist || 'Artist')}', img: '${utils.escapeJs(artist.img || FALLBACK_ART)}', type: 'artist' })" title="Unlike artist">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                        </button>
                    </div>
                    <div class="min-w-0"><div class="marquee-container"><h4 class="text-sm font-bold text-white marquee-text">${utils.escapeHtml(artist.name)}</h4></div><p class="text-xs text-gray-400">Artist</p></div>
                </div>`;
            },
            toggleArtistLike: (artist) => {
                const id = artist.id || artist.name;
                const idx = state.likedArtists.findIndex(item => (item.id || item.name) === id);
                if (idx === -1) state.likedArtists.push(artist);
                else state.likedArtists.splice(idx, 1);
                localStorage.setItem('likedArtists', JSON.stringify(state.likedArtists));
                ui.renderLibraryLists();
            },
            isOfflineUnavailable: (song) => {
                if (!song) return false;
                if (song.type && song.type !== 'song') return false;
                const offline = (typeof window !== 'undefined' && typeof window.__dtunesIsOffline === 'function')
                    ? window.__dtunesIsOffline()
                    : (typeof navigator !== 'undefined' && navigator.onLine === false);
                if (!offline) return false;
                if (typeof offlineStore === 'undefined' || !offlineStore || typeof offlineStore.isDownloaded !== 'function') return true;
                return !offlineStore.isDownloaded(song.saavn_id || song.id);
            },
            notifyOfflineUnavailable: (name) => {
                const label = name ? `"${name}" is not downloaded` : 'This song is not downloaded';
                if (ui.showToast) ui.showToast(`${label} — connect to the internet or download it to play offline.`);
            },
            notDownloadedBadge: (extraClass = '') => `
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/10 border border-white/15 text-[9px] font-bold uppercase tracking-wide text-gray-300 flex-shrink-0 ${extraClass}">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"/></svg>
                    <span>Not downloaded</span>
                </span>`,

            createCard: (item) => {
                const storeId = songStore.add(item);
                const isContext = item.type === 'album' || item.type === 'artist';
                const offlineBlocked = !isContext && ui.isOfflineUnavailable(item);
                const fallbackArt = typeof FALLBACK_ART !== 'undefined' ? FALLBACK_ART : 'DTunes.svg';
                const rawImg = item.img || fallbackArt;
                const safeImg = typeof sanitizeImageUrl === 'function' ? sanitizeImageUrl(rawImg) : (typeof utils !== 'undefined' && typeof utils.sanitizeImageUrl === 'function' ? utils.sanitizeImageUrl(rawImg) : rawImg);
                if (offlineBlocked) {
                    const blockedArtist = utils.escapeHtml(item.artist);
                    return `
                    <div class="scroll-card glass-panel p-3 rounded-2xl flex flex-col w-40 opacity-45 grayscale cursor-not-allowed select-none relative overflow-hidden" aria-disabled="true" title="Not downloaded — unavailable offline">
                        <div class="scroll-card-ambient" aria-hidden="true"><img src="${safeImg}" class="scroll-card-ambient-img" alt="" onerror="this.src='${FALLBACK_ART}'"></div>
                        <div class="relative aspect-square rounded-xl overflow-hidden mb-2.5 bg-zinc-900 shadow-md z-10">
                            <img src="${safeImg}" onerror="this.src='${FALLBACK_ART}'" class="w-full h-full object-cover" decoding="async">
                            <div class="absolute inset-0 bg-black/55 flex flex-col items-center justify-center gap-1.5">
                                <svg class="w-5 h-5 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"/></svg>
                                <span class="text-[9px] font-bold text-white/85 uppercase tracking-wide">Not downloaded</span>
                            </div>
                        </div>
                        <div class="w-full min-w-0 flex-1 z-10 relative">
                            <div class="marquee-container w-full"><h3 class="font-bold text-gray-400 text-sm marquee-text">${utils.escapeHtml(item.name)}</h3></div>
                            <div class="marquee-container w-full mt-0.5"><p class="text-xs text-gray-500 marquee-text">${blockedArtist}</p></div>
                        </div>
                    </div>`;
                }
                const clickHandler = item.type === 'album' ? `ui.openAlbum('${utils.escapeJs(item.id)}')` : (isContext ? `playContext('${item.type}', '${utils.escapeJs(item.id)}')` : `playSongById('${storeId}')`);
                const dblClickHandler = isContext ? "" : `ondblclick="player.likeSong('${utils.escapeJs(item.id)}')"`;
                const artistLiked = item.type === 'artist' && state.likedArtists.some(artist => (artist.id || artist.name) === item.id);
                
                // Three-dot menu button at bottom-right corner beside song name, ONLY appears on hover
                const bottomMenuBtn = isContext && item.type === 'artist' ? `
                    <button class="scroll-card-menu-btn opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1.5 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white flex-shrink-0" onclick="event.stopPropagation(); ui.toggleArtistLike({ id: '${utils.escapeJs(item.id)}', name: '${utils.escapeJs(item.name)}', artist: '${utils.escapeJs(item.artist || 'Artist')}', img: '${utils.escapeJs(item.img || FALLBACK_ART)}', type: 'artist' })" title="${artistLiked ? 'Unlike artist' : 'Like artist'}" aria-label="Like artist">
                        <svg class="w-4 h-4 ${artistLiked ? 'text-red-500 fill-current' : ''}" viewBox="0 0 24 24" fill="${artistLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54z"/></svg>
                    </button>` : `
                    <button type="button" class="scroll-card-menu-btn opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1.5 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white flex-shrink-0" onclick="event.stopPropagation(); ctxMenu.showSong(event, '${storeId}')" title="More Options" aria-label="More Options">
                        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>
                    </button>`;

                return `
                <div class="scroll-card glass-panel p-3 rounded-2xl transition hover-pause group relative flex flex-col w-40 overflow-hidden" ${dblClickHandler}>
                    <div class="scroll-card-ambient" aria-hidden="true"><img src="${safeImg}" class="scroll-card-ambient-img" alt="" onerror="this.src='${FALLBACK_ART}'"></div>
                    <div class="relative aspect-square rounded-xl overflow-hidden mb-2.5 bg-zinc-900 shadow-md cursor-pointer z-10" onclick="${clickHandler}">
                        <img src="${safeImg}" onerror="this.src='${FALLBACK_ART}'" class="w-full h-full object-cover group-hover:scale-105 transition duration-500" decoding="async">
                        <div class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                            <span class="bg-white text-black font-bold p-3 rounded-full shadow-xl transform scale-75 group-hover:scale-100 transition"><svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>
                        </div>
                    </div>
                    <div class="w-full min-w-0 flex items-center justify-between gap-1.5 z-10 relative mt-0.5">
                        <div class="min-w-0 flex-1">
                            <div class="marquee-container w-full"><h3 class="font-bold text-white text-sm marquee-text">${utils.escapeHtml(item.name)}</h3></div>
                            <div class="marquee-container w-full mt-0.5"><p class="text-xs text-zinc-400 marquee-text">${utils.escapeHtml(item.artist)}</p></div>
                        </div>
                        ${bottomMenuBtn}
                    </div>
                </div>`;
            },
            heartMarkup: () => `<svg class="heart-glyph" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`,
            createNowPlayingInner: (song, artistSuffix = '', storeId = null, context = 'island') => {
                const title = utils.escapeHtml(song.name || song.title || 'Unknown');
                const artist = utils.escapeHtml(song.artist || 'Unknown');
                const img = song.img || FALLBACK_ART;
                const liked = typeof player !== 'undefined' && player.isLiked && player.isLiked(song.id);
                const safeId = utils.escapeJs(song.id);

                let rightControls = '';
                if (context === 'island') {
                    rightControls = `<button type="button" class="np-heart ${liked ? 'is-liked text-red-500' : ''}" aria-label="${liked ? 'Unlike' : 'Like'}" onclick="event.stopPropagation(); player.likeSong('${safeId}')">${ui.heartMarkup()}</button>`;
                } else {
                    const sid = storeId || songStore.add(song);
                    rightControls = `
                        <div class="np-actions flex items-center gap-0.5 ml-2 mr-0.5 flex-shrink-0" onclick="event.stopPropagation()">
                            <button type="button" class="np-action-btn" title="Play Next" aria-label="Play Next" onclick="event.stopPropagation(); player.addNext(songStore.get('${sid}'))">
                                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg>
                            </button>
                            <button type="button" class="np-action-btn" title="Add to Queue" aria-label="Add to Queue" onclick="event.stopPropagation(); player.addToQueue(songStore.get('${sid}'))">
                                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h10M4 18h7"/><path d="M18 15v6m-3-3h6"/></svg>
                            </button>
                            <button type="button" class="np-action-btn" title="More Options" aria-label="More Options" onclick="event.stopPropagation(); ctxMenu.showSong(event, '${sid}')">
                                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>
                            </button>
                        </div>
                    `;
                }
                return `
                    <div class="np-art">
                        <img src="${img}" onerror="this.src='${FALLBACK_ART}'" alt="" class="np-art-img" decoding="async">
                    </div>
                    <div class="np-copy">
                        <div class="marquee-container w-full"><div class="np-title marquee-text">${title}</div></div>
                        <div class="marquee-container w-full"><div class="np-artist marquee-text">${artist}${artistSuffix}</div></div>
                    </div>
                    ${rightControls}
                `;
            },
            createPlayerListPill: (song, clickHandlerStr, context = 'queue', reorder = null) => {
                const storeId = songStore.add(song);
                const click = clickHandlerStr || `playSongById('${storeId}')`;
                const suffix = (context === 'history' && song.playedAt) ? ` · ${utils.escapeHtml(ui.formatRelativeTime(song.playedAt))}` : '';
                const inner = ui.createNowPlayingInner(song, suffix, storeId, context);
                if (ui.isOfflineUnavailable(song)) {
                    return `<div class="np-row" data-store-id="${storeId}"><div class="np-pill is-disabled" aria-disabled="true" title="Not downloaded — unavailable offline">${inner}${ui.notDownloadedBadge('ml-2')}</div></div>`;
                }
                const reorderAttrs = reorder
                    ? `draggable="true" data-queue-section="${utils.escapeHtml(reorder.section)}" data-queue-index="${reorder.index}"`
                    : '';
                const drag = reorder ? `<button class="queue-drag-handle np-drag" title="Drag to rearrange" aria-label="Rearrange ${utils.escapeHtml(song.name || '')}" onclick="event.stopPropagation()" type="button"><svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M9 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm10 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM9 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm10 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM9 19a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm10 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z"/></svg></button>` : '';
                const rowClass = reorder ? 'queue-reorder-row swipe-song np-row relative overflow-hidden group select-none flex-shrink-0 w-full' : 'swipe-song np-row relative overflow-hidden group select-none flex-shrink-0 w-full';
                return `
                <div class="${rowClass}" ${reorderAttrs} data-store-id="${storeId}">
                    <div class="swipe-reveal-left absolute inset-y-0 left-0 flex items-center overflow-hidden pointer-events-none rounded-full z-0 bg-emerald-600 text-white font-bold text-xs" style="width:0px;">
                        <div class="swipe-reveal-content flex items-center gap-2 px-4 whitespace-nowrap min-w-max h-full">
                            <svg class="swipe-reveal-icon w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg>
                            <span class="swipe-reveal-text font-bold text-xs tracking-wide">Play Next</span>
                        </div>
                    </div>
                    <div class="swipe-reveal-right absolute inset-y-0 right-0 flex items-center justify-end overflow-hidden pointer-events-none rounded-full z-0 bg-white/20 text-white font-bold text-xs" style="width:0px;">
                        <div class="swipe-reveal-content flex items-center justify-end gap-2 px-4 whitespace-nowrap min-w-max h-full">
                            <span class="swipe-reveal-text font-bold text-xs tracking-wide">Add to Queue</span>
                            <svg class="swipe-reveal-icon w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 10h16M4 14h10m-10 4h6"/></svg>
                        </div>
                    </div>
                    <div class="swipe-song-card np-pill cursor-pointer relative z-10" onclick="${click}" ondblclick="player.likeSong('${utils.escapeJs(song.id)}')">
                        ${inner}
                        ${drag}
                    </div>
                </div>`;
            },
            createSongPillInner: (song) => {
                const isCurrent = state.currentTrack && state.currentTrack.id === song.id;
                const isOffline = typeof offlineStore !== 'undefined' && offlineStore.isDownloaded && offlineStore.isDownloaded(song.id);
                const offlineBadge = isOffline ? '<svg class="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" title="Available offline" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>' : '';
                const eqMarkup = isCurrent ? `
                    <div class="playing-eq-icon ${state.playing ? '' : 'paused'} flex-shrink-0" title="Playing">
                        <span class="playing-eq-bar"></span>
                        <span class="playing-eq-bar"></span>
                        <span class="playing-eq-bar"></span>
                    </div>
                ` : '';
                return `
                    <div class="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 shadow-md border border-white/20 ml-1 relative">
                        <img src="${song.img}" onerror="this.src='${FALLBACK_ART}'" class="w-full h-full object-cover" decoding="async">
                        ${isCurrent ? `<div class="absolute inset-0 bg-black/45 flex items-center justify-center">${eqMarkup}</div>` : ''}
                    </div>
                    <div class="flex-1 min-w-0 flex flex-col justify-center ml-3">
                        <div class="marquee-container w-full flex items-center gap-1.5"><div class="font-bold text-white text-sm marquee-text">${utils.escapeHtml(song.name)}</div>${offlineBadge}${isCurrent ? eqMarkup : ''}</div>
                        <div class="marquee-container w-full mt-0.5"><div class="text-xs text-gray-400 marquee-text">${utils.escapeHtml(song.artist)}</div></div>
                    </div>
                `;
            },
            renderCompactSwipePreview: () => {
                const prev = document.getElementById('compact-swipe-prev');
                const next = document.getElementById('compact-swipe-next');
                const render = (song, label) => song ? `<div class="mobile-swipe-preview-card glass-panel rounded-2xl p-2 pr-4 flex items-center shadow-2xl w-full border border-white/10 bg-[#121212]/90"><span class="mobile-swipe-label">${label}</span>${ui.createSongPillInner(song)}</div>` : '';
                if (prev) prev.innerHTML = render(getPreviousTrack(), 'Previous');
                if (next) next.innerHTML = render(getUpcomingTrack(), 'Next');
                updateMarquees();
            },
            createQueuePill: (song, section, index) => {
                const storeId = songStore.add(song);
                const title = utils.escapeHtml(song.name || song.title || 'Unknown');
                const artist = utils.escapeHtml(song.artist || 'Unknown');
                const img = song.img || FALLBACK_ART;
                const safeSection = utils.escapeJs(section);
                const safeIndex = Number(index);

                return `
                <div class="queue-reorder-row swipe-song np-row relative overflow-hidden group select-none flex-shrink-0 w-full" draggable="true" data-queue-section="${safeSection}" data-queue-index="${safeIndex}" data-store-id="${storeId}">
                    <div class="swipe-song-card np-pill cursor-pointer relative z-10 flex items-center w-full" onclick="playSongById('${storeId}')" ondblclick="player.likeSong('${utils.escapeJs(song.id)}')">
                        <!-- Drag Handle -->
                        <button class="queue-drag-handle np-drag text-zinc-500 hover:text-white transition p-1 flex-shrink-0 cursor-grab active:cursor-grabbing ml-0.5 mr-1" title="Drag to rearrange" aria-label="Rearrange track" onclick="event.stopPropagation()" type="button">
                            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M9 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm10 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM9 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm10 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM9 19a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm10 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z"/>
                            </svg>
                        </button>

                        <!-- Album Art -->
                        <div class="np-art flex-shrink-0">
                            <img src="${img}" onerror="this.src='${FALLBACK_ART}'" alt="" class="np-art-img" decoding="async">
                        </div>

                        <!-- Track Info -->
                        <div class="np-copy flex-1 min-w-0 ml-2.5">
                            <div class="marquee-container w-full"><div class="np-title marquee-text">${title}</div></div>
                            <div class="marquee-container w-full"><div class="np-artist marquee-text">${artist}</div></div>
                        </div>

                        <!-- Cross button to remove from queue -->
                        <button type="button" class="np-action-btn w-7 h-7 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition active:scale-90 flex-shrink-0 ml-auto mr-1" title="Remove from queue" aria-label="Remove from queue" onclick="event.stopPropagation(); player.removeFromQueue('${safeSection}', ${safeIndex})">
                            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M18 6L6 18M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>
                </div>`;
            },
            createSongPill: (song, clickHandlerStr, context = 'queue') => {
                if (context === 'queue' || context === 'history') {
                    return ui.createPlayerListPill(song, clickHandlerStr, context);
                }
                const storeId = songStore.add(song);
                if (ui.isOfflineUnavailable(song)) {
                    return `
                    <div class="relative overflow-hidden rounded-2xl mb-2 flex-shrink-0 w-full" data-store-id="${storeId}">
                        <div class="glass-panel rounded-2xl p-2 pr-4 flex items-center shadow-2xl w-full border border-white/10 bg-[#121212]/95 opacity-45 grayscale cursor-not-allowed select-none" aria-disabled="true" title="Not downloaded — unavailable offline">
                            ${ui.createSongPillInner(song)}
                            ${ui.notDownloadedBadge('ml-2')}
                        </div>
                    </div>`;
                }
                const hoverBtnVis = context === 'quicksearch' ? 'opacity-100' : 'opacity-100 md:opacity-0 group-hover:opacity-100';
                const timeBadge = song.playedAt ? `<span class="text-[10px] text-gray-400 font-mono px-2 py-0.5 rounded-md bg-white/5 flex-shrink-0 mr-1.5">${ui.formatRelativeTime(song.playedAt)}</span>` : '';

                return `
                <div class="swipe-song relative overflow-hidden rounded-2xl mb-2 group select-none flex-shrink-0 w-full" data-store-id="${storeId}">
                    <div class="swipe-reveal-left absolute inset-y-0 left-0 flex items-center overflow-hidden pointer-events-none rounded-2xl z-0 bg-emerald-600 text-white font-bold text-xs" style="width:0px;">
                        <div class="swipe-reveal-content flex items-center gap-2 px-4 whitespace-nowrap min-w-max h-full">
                            <svg class="swipe-reveal-icon w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg>
                            <span class="swipe-reveal-text font-bold text-xs tracking-wide">Play Next</span>
                        </div>
                    </div>
                    <div class="swipe-reveal-right absolute inset-y-0 right-0 flex items-center justify-end overflow-hidden pointer-events-none rounded-2xl z-0 bg-white/20 text-white font-bold text-xs" style="width:0px;">
                        <div class="swipe-reveal-content flex items-center justify-end gap-2 px-4 whitespace-nowrap min-w-max h-full">
                            <span class="swipe-reveal-text font-bold text-xs tracking-wide">Add to Queue</span>
                            <svg class="swipe-reveal-icon w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 10h16M4 14h10m-10 4h6"/></svg>
                        </div>
                    </div>
                    <div class="swipe-song-card glass-panel rounded-2xl p-2 pr-4 flex items-center shadow-2xl w-full border border-white/10 transition-colors bg-[#121212]/95 cursor-pointer relative z-10" onclick="${clickHandlerStr}" ondblclick="player.likeSong('${utils.escapeJs(song.id)}')">
                        ${ui.createSongPillInner(song)}
                        ${timeBadge}
                        <div class="flex items-center gap-0.5 ml-auto mr-1 flex-shrink-0" onclick="event.stopPropagation()">
                            <button type="button" class="np-action-btn" title="Play Next" aria-label="Play Next" onclick="event.stopPropagation(); player.addNext(songStore.get('${storeId}'))">
                                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg>
                            </button>
                            <button type="button" class="np-action-btn" title="Add to Queue" aria-label="Add to Queue" onclick="event.stopPropagation(); player.addToQueue(songStore.get('${storeId}'))">
                                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h10M4 18h7"/><path d="M18 15v6m-3-3h6"/></svg>
                            </button>
                            <button type="button" class="np-action-btn" title="More Options" aria-label="More Options" onclick="event.stopPropagation(); ctxMenu.showSong(event, '${storeId}')">
                                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>
                            </button>
                        </div>
                    </div>
                </div>`;
            },
            createListRow: (song, contextPlaylistName = null) => {
                const storeId = songStore.add(song);
                const removeBtnHtml = contextPlaylistName ? `<button class="p-2 text-red-400 hover:text-red-500 rounded-full hover:bg-red-500/10 hidden md:block" title="Remove" onclick="event.stopPropagation(); ui.removeSongFromPlaylist('${utils.escapeJs(contextPlaylistName)}', '${utils.escapeJs(song.id)}')"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>` : '';
                if (ui.isOfflineUnavailable(song)) {
                    return `
                    <div class="relative overflow-hidden rounded-2xl mb-2 flex-shrink-0 w-full" data-store-id="${storeId}">
                        <div class="flex items-center gap-4 p-2 rounded-2xl glass-panel w-full bg-[#121212]/95 border border-white/10 opacity-45 grayscale select-none" aria-disabled="true" title="Not downloaded — unavailable offline">
                            <div class="relative w-12 h-12 flex-shrink-0 rounded-md overflow-hidden cursor-not-allowed">
                                <img src="${song.img}" class="w-full h-full object-cover" decoding="async">
                            </div>
                            <div class="flex-1 min-w-0 flex flex-col justify-center cursor-not-allowed">
                                <div class="marquee-container w-full"><h4 class="text-gray-400 font-medium text-sm marquee-text">${utils.escapeHtml(song.name)}</h4></div>
                                <div class="marquee-container w-full mt-0.5"><p class="text-gray-500 text-xs marquee-text">${utils.escapeHtml(song.artist)}</p></div>
                            </div>
                            <div class="flex items-center gap-2 mr-2">
                                ${ui.notDownloadedBadge()}
                                ${removeBtnHtml}
                            </div>
                        </div>
                    </div>`;
                }
                
                return `
                <div class="swipe-song relative overflow-hidden rounded-2xl mb-2 group select-none flex-shrink-0 w-full" data-store-id="${storeId}">
                    <div class="swipe-reveal-left absolute inset-y-0 left-0 flex items-center overflow-hidden pointer-events-none rounded-2xl z-0 bg-emerald-600 text-white font-bold text-xs" style="width:0px;">
                        <div class="swipe-reveal-content flex items-center gap-2 px-4 whitespace-nowrap min-w-max h-full">
                            <svg class="swipe-reveal-icon w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg>
                            <span class="swipe-reveal-text font-bold text-xs tracking-wide">Play Next</span>
                        </div>
                    </div>
                    <div class="swipe-reveal-right absolute inset-y-0 right-0 flex items-center justify-end overflow-hidden pointer-events-none rounded-2xl z-0 bg-white/20 text-white font-bold text-xs" style="width:0px;">
                        <div class="swipe-reveal-content flex items-center justify-end gap-2 px-4 whitespace-nowrap min-w-max h-full">
                            <span class="swipe-reveal-text font-bold text-xs tracking-wide">Add to Queue</span>
                            <svg class="swipe-reveal-icon w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 10h16M4 14h10m-10 4h6"/></svg>
                        </div>
                    </div>
                    <div class="swipe-song-card flex items-center gap-4 p-2 rounded-2xl glass-panel hover:bg-white/10 transition relative z-10 w-full bg-[#121212]/95 border border-white/10" ondblclick="player.likeSong('${utils.escapeJs(song.id)}')">
                        <div class="relative w-12 h-12 flex-shrink-0 cursor-pointer rounded-md overflow-hidden" onclick="playSongById('${storeId}')">
                            <img src="${song.img}" class="w-full h-full object-cover" decoding="async">
                            <div class="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition"><svg class="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
                        </div>
                        <div class="flex-1 min-w-0 cursor-pointer flex flex-col justify-center" onclick="playSongById('${storeId}')">
                            <div class="marquee-container w-full"><h4 class="text-white font-medium text-sm marquee-text">${utils.escapeHtml(song.name)}</h4></div>
                            <div class="marquee-container w-full mt-0.5"><p class="text-gray-400 text-xs marquee-text">${utils.escapeHtml(song.artist)}</p></div>
                        </div>
                        <div class="flex items-center gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition mr-2">
                            <button class="p-2 text-gray-400 hover:text-white rounded-full hover:bg-white/10 hidden md:block" title="Play Next" onclick="event.stopPropagation(); player.addNext(songStore.get('${storeId}'))"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg></button>
                            <button class="p-2 text-gray-400 hover:text-white rounded-full hover:bg-white/10 hidden md:block" title="Add to Queue" onclick="event.stopPropagation(); player.addToQueue(songStore.get('${storeId}'))"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h10m-10 4h6"/></svg></button>
                            ${removeBtnHtml}
                        </div>
                    </div>
                </div>`;
            },
            createForYouCard: (song) => {
                const storeId = songStore.add(song);
                if (ui.isOfflineUnavailable(song)) {
                    return `
                    <div class="for-you-card glass-panel rounded-3xl overflow-hidden relative flex-shrink-0 w-64 h-80 opacity-45 grayscale cursor-not-allowed select-none" aria-disabled="true" title="Not downloaded — unavailable offline">
                        <img src="${song.img}" class="absolute inset-0 w-full h-full object-cover" decoding="async">
                        <div class="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-transparent"></div>
                        <div class="absolute inset-0 flex flex-col items-center justify-center gap-2 cursor-not-allowed">
                            <svg class="w-6 h-6 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"/></svg>
                            <span class="px-2 py-1 rounded-full bg-black/60 border border-white/20 text-[9px] font-bold uppercase tracking-wide text-white/85">Not downloaded</span>
                        </div>
                        <div class="absolute bottom-0 left-0 right-0 p-5">
                            <div class="marquee-container"><h3 class="text-xl font-bold text-gray-400 marquee-text">${utils.escapeHtml(song.name)}</h3></div>
                            <div class="marquee-container mt-1"><p class="text-sm text-gray-500 marquee-text">${utils.escapeHtml(song.artist)}</p></div>
                        </div>
                    </div>`;
                }
                return `
                <div class="for-you-card glass-panel rounded-3xl overflow-hidden relative flex-shrink-0 w-64 h-80 group cursor-pointer hover-pause" onclick="playSongById('${storeId}')">
                    <img src="${song.img}" class="absolute inset-0 w-full h-full object-cover transition duration-700 group-hover:scale-110" decoding="async">
                    <div class="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-transparent"></div>
                    <button class="absolute top-4 right-4 w-10 h-10 rounded-full bg-white text-black font-bold flex items-center justify-center shadow-xl opacity-95 group-hover:scale-110 transition" onclick="event.stopPropagation(); playSongById('${storeId}')">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    </button>
                    <div class="absolute bottom-0 left-0 right-0 p-5">
                        <div class="inline-flex px-2 py-1 rounded-full bg-white/10 text-[10px] uppercase tracking-wider text-white mb-3">For You</div>
                        <div class="marquee-container"><h3 class="text-xl font-bold text-white marquee-text">${utils.escapeHtml(song.name)}</h3></div>
                        <div class="marquee-container mt-1"><p class="text-sm text-gray-300 marquee-text">${utils.escapeHtml(song.artist)}</p></div>
                    </div>
                </div>`;
            },
            createDiscoverCard: (mix) => {
                const songs = mix.songs || [];
                const imgs = songs.map(s => s.img).filter(Boolean).slice(0, 3);
                
                let collageHtml = '';
                if (imgs.length >= 3) {
                    collageHtml = `
                    <div class="absolute top-4 right-4 w-28 h-28 pointer-events-none">
                        <img src="${imgs[0]}" decoding="async" class="absolute top-0 right-0 w-16 h-16 rounded-xl object-cover shadow-2xl border border-white/20 transform rotate-6 z-10">
                        <img src="${imgs[1]}" decoding="async" class="absolute top-3 right-5 w-14 h-14 rounded-xl object-cover shadow-2xl border border-white/20 transform -rotate-12 z-20">
                        <img src="${imgs[2]}" decoding="async" class="absolute top-7 right-2 w-14 h-14 rounded-xl object-cover shadow-2xl border border-white/20 transform rotate-3 z-30">
                    </div>`;
                } else if (imgs.length > 0) {
                    collageHtml = `
                    <div class="absolute top-4 right-4 w-24 h-24 pointer-events-none">
                        <img src="${imgs[0]}" decoding="async" class="w-full h-full rounded-2xl object-cover shadow-2xl border border-white/20 transform rotate-3">
                    </div>`;
                } else {
                    collageHtml = `
                    <div class="absolute top-5 right-5 w-20 h-20 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/10 pointer-events-none">
                        <svg class="w-10 h-10 text-white/70" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>
                    </div>`;
                }

                return `
                <div class="discover-card glass-panel rounded-3xl overflow-hidden relative flex-shrink-0 w-64 h-80 group cursor-pointer hover-pause ${mix.gradientBg || 'bg-gradient-to-br from-zinc-800/80 to-zinc-950'}" onclick="homeView.openDiscoverMix('${mix.key}')">
                    <div class="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.2),transparent_70%)] pointer-events-none"></div>
                    <div class="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent pointer-events-none"></div>
                    
                    ${collageHtml}
                    
                    <button class="absolute bottom-5 right-5 w-12 h-12 rounded-full bg-white text-black font-bold flex items-center justify-center shadow-2xl opacity-90 group-hover:scale-110 transition z-30" onclick="event.stopPropagation(); homeView.playDiscoverMix('${mix.key}')">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    </button>
                    
                    <div class="absolute bottom-0 left-0 right-16 p-5 z-20 pointer-events-none">
                        <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-[10px] font-extrabold tracking-wider uppercase text-white mb-2 shadow-lg">
                            <span class="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
                            ${utils.escapeHtml(mix.badgeText || 'MADE FOR YOU')}
                        </div>
                        <div class="marquee-container"><h3 class="text-xl font-bold text-white marquee-text tracking-tight drop-shadow-md">${utils.escapeHtml(mix.title)}</h3></div>
                        <p class="text-xs text-gray-300 mt-1 line-clamp-2 drop-shadow-sm font-medium">${utils.escapeHtml(mix.subtitle)}</p>
                    </div>
                </div>`;
            },
            generateAbstractCoverMarkup: (mix, songs = []) => {
                const imgs = songs.map(s => s.img).filter(Boolean).slice(0, 4);
                let inner = '';
                if (imgs.length >= 4) {
                    inner = `<div class="grid grid-cols-2 gap-1 w-full h-full p-1.5">
                        <img src="${imgs[0]}" class="w-full h-full object-cover rounded">
                        <img src="${imgs[1]}" class="w-full h-full object-cover rounded">
                        <img src="${imgs[2]}" class="w-full h-full object-cover rounded">
                        <img src="${imgs[3]}" class="w-full h-full object-cover rounded">
                    </div>`;
                } else if (imgs.length > 0) {
                    inner = `<img src="${imgs[0]}" class="w-full h-full object-cover">`;
                } else {
                    inner = `<div class="w-full h-full flex items-center justify-center text-white/80"><svg class="w-16 h-16" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg></div>`;
                }
                return `<div class="w-full h-full ${mix.gradientBg || 'bg-gradient-to-br from-zinc-800/80 to-zinc-950'} relative flex items-center justify-center overflow-hidden">
                    <div class="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.25),transparent_75%)] pointer-events-none"></div>
                    <div class="absolute inset-0 bg-black/30 backdrop-blur-[2px]"></div>
                    <div class="relative z-10 w-full h-full p-4 flex flex-col justify-between">
                        <div class="text-[10px] font-extrabold uppercase tracking-widest text-white bg-black/50 backdrop-blur-md px-2.5 py-1 rounded-full w-max border border-white/10 shadow-lg">${utils.escapeHtml(mix.badgeText || 'D\'TUNES MIX')}</div>
                        <div class="w-28 h-28 mx-auto rounded-2xl overflow-hidden shadow-2xl border border-white/20">${inner}</div>
                        <div class="text-center font-bold text-white text-base tracking-tight truncate drop-shadow-md">${utils.escapeHtml(mix.title)}</div>
                    </div>
                </div>`;
            },
            openGeneratedPlaylist: (title, songs, coverHtml = null) => {
                ui.switchView('playlist');
                document.getElementById('playlist-view-title').textContent = title;
                document.getElementById('playlist-view-count').textContent = `${songs.length} tracks`;
                const artEl = document.getElementById('pl-view-art');
                if (coverHtml) {
                    artEl.className = 'w-48 h-48 md:w-full md:aspect-square rounded-2xl shadow-2xl overflow-hidden shadow-black/50';
                    artEl.innerHTML = coverHtml;
                } else {
                    artEl.className = 'w-48 h-48 md:w-full md:aspect-square rounded-2xl shadow-2xl flex items-center justify-center text-5xl md:text-6xl font-bold text-white shadow-black/50 overflow-hidden';
                    artEl.innerHTML = '<div class="w-full h-full bg-gradient-to-br from-zinc-800/80 to-zinc-950 flex items-center justify-center"><svg class="w-20 h-20 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>';
                }
                const customActions = document.getElementById('playlist-custom-actions');
                if (customActions) customActions.classList.add('hidden');

                const aiReportBtn = document.getElementById('playlist-ai-report-btn');
                if (aiReportBtn) {
                    aiReportBtn.classList.remove('hidden');
                    aiReportBtn.classList.add('flex');
                    aiReportBtn.onclick = () => {
                        if (window.aiReportManager) {
                            window.aiReportManager.openReportModal({
                                feature: 'AI Generated Mix / Playlist',
                                contentSummary: `Playlist: "${title}" (${songs.length} tracks)`,
                                context: {
                                    title,
                                    trackCount: songs.length,
                                    sampleTracks: songs.slice(0, 5).map(s => `${s.name || s.title} - ${s.artist || ''}`)
                                }
                            });
                        }
                    };
                }

                document.getElementById('playlist-songs-list').innerHTML = songs.map(song => ui.createListRow(song)).join('');
                document.getElementById('playlist-play-all').onclick = () => {
                    if(songs.length > 0) { state.queue = [...songs]; state.userQueue = []; state.idx = 0; player.playDirect(songs[0]); }
                };
                updateMarquees();
            },
            enableControls: () => {
                ['seek-bar-container', 'seek-bar', 'btn-play', 'btn-prev', 'btn-next', 'p-like-btn', 'btn-shuffle', 'btn-repeat'].forEach(id => {
                    const el = document.getElementById(id); if(el) { el.classList.remove('disabled'); el.disabled = false; }
                });
            },
            setPlayerLoading: (loading) => {
                const island = document.getElementById('info-island');
                const title = document.getElementById('p-title');
                const artist = document.getElementById('p-artist');
                const activeLoading = !!loading && (state.playing || isPlaybackPending || state.loading);
                island?.classList.toggle('is-loading', activeLoading);
                document.getElementById('album-art-wrapper')?.classList.toggle('is-loading', activeLoading);
                if (state.currentTrack) {
                    if (state.currentTrack.name && (!title.textContent || title.textContent === 'Not Playing')) {
                        title.textContent = state.currentTrack.name;
                    }
                    if (state.currentTrack.artist) {
                        artist.textContent = state.currentTrack.artist;
                    }
                }
                if ('mediaSession' in navigator) {
                    navigator.mediaSession.playbackState = state.playing ? 'playing' : 'paused';
                }
                updateMarquees();
            },
            updateRepeatBtn: () => {
                const btn = document.getElementById('btn-repeat');
                if (!btn) return;
                if (state.repeat === 0) {
                    btn.classList.remove('active-state');
                    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`;
                    btn.title = "Repeat Off";
                } else if (state.repeat === 1) {
                    btn.classList.add('active-state');
                    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`;
                    btn.title = "Repeat All";
                } else {
                    btn.classList.add('active-state');
                    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/><text x="12" y="15" font-size="8" font-weight="bold" fill="currentColor" stroke="none" text-anchor="middle">1</text></svg>`;
                    btn.title = "Repeat One";
                }
                audio.loop = (state.repeat === 2);
            },
            updateShuffleBtn: () => {
                const btn = document.getElementById('btn-shuffle');
                if (!btn) return;
                if (state.shuffle) {
                    btn.classList.add('active-state');
                    btn.title = "Shuffle On";
                } else {
                    btn.classList.remove('active-state');
                    btn.title = "Shuffle Off";
                }
            },
            updateMetadata: (track, options = {}) => {
                if (!track) return;
                document.getElementById('p-title').textContent = track.name || track.title || 'Unknown Track'; 
                document.getElementById('p-artist').textContent = (options.loading && !track.artist) ? 'Loading...' : (track.artist || 'Unknown Artist');
                const safeArt = sanitizeImageUrl(track.img);
                const artImg = document.getElementById('curr-art-img');
                if (artImg) {
                    artImg.removeAttribute('crossorigin');
                    artImg.onerror = function () {
                        if (this.src && this.src.includes('500x500')) {
                            this.src = this.src.replace('500x500', '150x150');
                            return;
                        }
                        if (this.src && this.src.includes('150x150')) {
                            this.src = this.src.replace('150x150', '50x50');
                            return;
                        }
                        this.onerror = null;
                        this.src = FALLBACK_ART;
                    };
                    artImg.onload = () => applyDynamicTrackTheme(artImg);
                    if (artImg.src !== safeArt) {
                        artImg.src = safeArt;
                    }
                    if (artImg.complete && artImg.naturalWidth > 0) applyDynamicTrackTheme(artImg);
                }
                ui.setPlayerLoading(!!options.loading);
                if (ui.updateFullscreenPlayer) ui.updateFullscreenPlayer();
                const likeBtn = document.getElementById('p-like-btn');
                const isLiked = state.likedIds.some(item => (typeof item === 'string' ? item === track.id : item.id === track.id));
                likeBtn.className = isLiked ? 'np-like is-liked text-red-500' : 'np-like text-gray-400 hover:text-white';

                if ('mediaSession' in navigator && typeof MediaMetadata !== 'undefined') {
                    try {
                        let artUrl = safeArt;
                        if (!artUrl || typeof artUrl !== 'string' || artUrl.endsWith('.svg') || artUrl.includes('.svg?')) {
                            artUrl = 'assets/icon.png';
                        }
                        if (typeof window !== 'undefined' && window.location) {
                            try { artUrl = new URL(artUrl, window.location.href).href; } catch (_) {}
                        }
                        const artworkList = [
                            { src: artUrl, sizes: '96x96', type: 'image/png' },
                            { src: artUrl, sizes: '128x128', type: 'image/png' },
                            { src: artUrl, sizes: '192x192', type: 'image/png' },
                            { src: artUrl, sizes: '256x256', type: 'image/png' },
                            { src: artUrl, sizes: '384x384', type: 'image/png' },
                            { src: artUrl, sizes: '512x512', type: 'image/png' }
                        ];
                        navigator.mediaSession.metadata = new MediaMetadata({
                            title: track.name || track.title || 'Unknown Track',
                            artist: options.loading ? `Loading • ${track.artist || ''}` : (track.artist || 'Unknown Artist'),
                            album: track.album || "D'Tunes",
                            artwork: artworkList
                        });
                        navigator.mediaSession.playbackState = (state.playing || !document.getElementById('audio-el')?.paused) ? 'playing' : 'paused';
                    } catch (e) {
                        console.warn('[MediaSession] Metadata update error:', e);
                    }
                    }
const mPlayBtn = document.getElementById('m-icon-play');
                const mPauseBtn = document.getElementById('m-icon-pause');
                if(mPlayBtn && mPauseBtn) {
                    mPlayBtn.className = state.playing ? 'hidden' : 'flex';
                    mPauseBtn.className = state.playing ? 'flex' : 'hidden';
                }
                updateMarquees();
                if (ui.updateAlbumCarouselPeeks) ui.updateAlbumCarouselPeeks();
                if (ui.initQueuePointerReorder) ui.initQueuePointerReorder();
                if (state.fullscreenMode && ui.updateFullscreenQueue) ui.updateFullscreenQueue();
            },
            toggleLyricsModal: (expand) => {
                const modal = document.getElementById('lyrics-modal');
                if (!modal) return;
                const willOpen = expand !== undefined ? Boolean(expand) : modal.classList.contains('hidden');
                if (willOpen) {
                    modal.classList.remove('hidden');
                    lyricsManager.updateUI();
                    if (state.currentTrack && !lyricsManager.currentLyrics && !lyricsManager.isLoading) {
                        lyricsManager.fetchLyricsForTrack(state.currentTrack);
                    }
                    if (window.history && window.history.pushState) {
                        window.history.pushState({ dtunesModal: 'lyrics' }, '');
                    }
                } else {
                    modal.classList.add('hidden');
                }
            },
            switchMobilePlayerTab: (tab) => {
                const mobileTabs = ['track', 'queue', 'history', 'lyrics'];
                const tabIndex = Math.max(0, mobileTabs.indexOf(tab));
                document.body.dataset.mobileTab = tab;
                const tabSwitch = document.querySelector('.mobile-player-tabs');
                if (tabSwitch) tabSwitch.style.setProperty('--seg-index', String(tabIndex));
                document.querySelectorAll('.mobile-tab-btn').forEach(btn => {
                    const isCurrent = btn.id === `m-tab-${tab}`;
                    btn.classList.toggle('is-active', isCurrent);
                    btn.setAttribute('aria-selected', String(isCurrent));
                });
                if (tab === 'queue') {
                    ui.switchQueueTab('upnext');
                    ui.renderQueue();
                } else if (tab === 'history') {
                    ui.switchQueueTab('history');
                    ui.renderHistory();
                } else if (tab === 'lyrics') {
                    lyricsManager.updateUI();
                    if (state.currentTrack && !lyricsManager.currentLyrics && !lyricsManager.isLoading) {
                        lyricsManager.fetchLyricsForTrack(state.currentTrack);
                    }
                }
                updateMarquees();
            },
            morphPlayIcon: (playing) => {
                const buttons = [
                    document.getElementById('btn-play'),
                    document.getElementById('fs-btn-play')
                ].filter(Boolean);
                const paths = buttons.map(b => b.querySelector('.pp-poly')).filter(Boolean);
                if (paths.length === 0) return;

                buttons.forEach(b => {
                    b.classList.toggle('is-playing', playing);
                    b.classList.toggle('is-paused', !playing);
                    b.setAttribute('aria-label', playing ? 'Pause' : 'Play');
                });

                if (ui._ppPlaying === playing) return;
                const first = ui._ppPlaying === undefined;
                ui._ppPlaying = playing;

                // 36 coordinate values per shape (18 points for 6 cubic bezier segments each)
                // In Pause: two rounded vertical pill capsules
                const PAUSE = [
                    // Subpath 1: Left pill
                    5.8, 6.6,
                    5.8, 5.5, 6.7, 4.6, 7.8, 4.6,
                    8.9, 4.6, 9.8, 5.5, 9.8, 6.6,
                    9.8, 10.0, 9.8, 14.0, 9.8, 17.4,
                    9.8, 18.5, 8.9, 19.4, 7.8, 19.4,
                    6.7, 19.4, 5.8, 18.5, 5.8, 17.4,
                    5.8, 14.0, 5.8, 10.0,
                    // Subpath 2: Right pill
                    14.2, 6.6,
                    14.2, 5.5, 15.1, 4.6, 16.2, 4.6,
                    17.3, 4.6, 18.2, 5.5, 18.2, 6.6,
                    18.2, 10.0, 18.2, 14.0, 18.2, 17.4,
                    18.2, 18.5, 17.3, 19.4, 16.2, 19.4,
                    15.1, 19.4, 14.2, 18.5, 14.2, 17.4,
                    14.2, 14.0, 14.2, 10.0
                ];

                // In Play: the two shapes melt together to form the rounded play triangle
                const PLAY = [
                    // Subpath 1: Left base & shoulders of play triangle
                    7.0, 7.4,
                    7.0, 6.2, 7.8, 5.3, 8.9, 6.0,
                    10.2, 6.8, 11.5, 7.6, 12.0, 8.0,
                    12.0, 10.5, 12.0, 13.5, 12.0, 16.0,
                    11.5, 16.4, 10.2, 17.2, 8.9, 18.0,
                    7.8, 18.7, 7.0, 17.8, 7.0, 16.6,
                    7.0, 13.5, 7.0, 10.5,
                    // Subpath 2: Right apex tip of play triangle
                    12.0, 8.0,
                    13.2, 8.8, 15.6, 10.2, 17.5, 11.2,
                    18.8, 11.8, 18.8, 12.2, 17.5, 12.8,
                    15.6, 13.8, 13.2, 15.2, 12.0, 16.0,
                    12.0, 16.0, 12.0, 16.0, 12.0, 16.0,
                    12.0, 12.0, 12.0, 12.0, 12.0, 8.0,
                    12.0, 8.0, 12.0, 8.0
                ];

                const target = playing ? PAUSE : PLAY;
                if (!ui._ppFrom) ui._ppFrom = (first ? (playing ? PAUSE : PLAY) : target).slice();

                if (first) {
                    ui._ppFrom = target.slice();
                    const d = ui._ppPath(ui._ppFrom);
                    paths.forEach(p => p.setAttribute('d', d));
                    return;
                }

                const start = ui._ppFrom.slice();
                const t0 = performance.now();
                if (ui._ppFrame) cancelAnimationFrame(ui._ppFrame);

                // Smooth organic spring easing
                const ease = (t) => 1 - Math.pow(1 - t, 3.2);

                const step = (now) => {
                    const p = Math.min(1, (now - t0) / 280);
                    const e = ease(p);
                    for (let i = 0; i < start.length; i++) {
                        ui._ppFrom[i] = start[i] + (target[i] - start[i]) * e;
                    }
                    const d = ui._ppPath(ui._ppFrom);
                    paths.forEach(pathEl => pathEl.setAttribute('d', d));
                    if (p < 1) ui._ppFrame = requestAnimationFrame(step);
                };
                ui._ppFrame = requestAnimationFrame(step);
            },
            _ppPath: (pts) => {
                const sub = (offset) => {
                    const p = (i) => pts[offset + i].toFixed(2);
                    return `M ${p(0)} ${p(1)} ` +
                           `C ${p(2)} ${p(3)}, ${p(4)} ${p(5)}, ${p(6)} ${p(7)} ` +
                           `C ${p(8)} ${p(9)}, ${p(10)} ${p(11)}, ${p(12)} ${p(13)} ` +
                           `C ${p(14)} ${p(15)}, ${p(16)} ${p(17)}, ${p(18)} ${p(19)} ` +
                           `C ${p(20)} ${p(21)}, ${p(22)} ${p(23)}, ${p(24)} ${p(25)} ` +
                           `C ${p(26)} ${p(27)}, ${p(28)} ${p(29)}, ${p(30)} ${p(31)} ` +
                           `C ${p(32)} ${p(33)}, ${p(34)} ${p(35)}, ${p(0)} ${p(1)} Z`;
                };
                return `${sub(0)} ${sub(36)}`;
            },
            adjustQueueMaxHeight: () => {
                if (typeof window === 'undefined') return;
                const header = document.querySelector('header');
                const playerCard = document.getElementById('player-card');
                const infoIsland = document.getElementById('info-island');
                const queueWrap = document.getElementById('queue-wrapper');
                const queueExpand = document.getElementById('queue-expandable-area');
                if (!queueWrap || !queueExpand) return;

                const vh = window.innerHeight;
                const headerBottom = (header && header.offsetHeight > 0) ? header.getBoundingClientRect().bottom : 82;
                let playerCardTop = (playerCard && playerCard.offsetHeight > 0) ? playerCard.getBoundingClientRect().top : (vh - 82);
                if (playerCardTop > vh - 40 || playerCardTop < 200) {
                    playerCardTop = vh - 82;
                }
                const infoIslandHeight = (infoIsland && infoIsland.offsetHeight > 0) ? infoIsland.offsetHeight : 58;

                // Full sidebar height from 16px below top header down to 8px above player card:
                const wrapFullH = Math.max(260, Math.floor((playerCardTop - 8) - (headerBottom + 12)));
                const maxQueueH = Math.max(140, Math.floor(wrapFullH - infoIslandHeight - 8));

                queueWrap.style.setProperty('--queue-full-height', wrapFullH + 'px');
                queueWrap.style.setProperty('--queue-max-height', maxQueueH + 'px');
                queueExpand.style.setProperty('--queue-max-height', maxQueueH + 'px');

                if (queueWrap.classList.contains('queue-expanded')) {
                    queueWrap.style.height = wrapFullH + 'px';
                    queueExpand.style.maxHeight = maxQueueH + 'px';
                } else {
                    queueWrap.style.height = '';
                    queueExpand.style.maxHeight = '0px';
                }
            },
            updatePlayBtn: () => {
                // Audio element is the source of truth: if not paused and not ended, it IS playing.
                if (state.loaded && !isPlaybackPending) {
                    const isAudioRunning = !audio.paused && !audio.ended;
                    if (isAudioRunning && !state.playing) {
                        state.playing = true;
                    } else if (audio.paused && state.playing && !state.loading) {
                        state.playing = false;
                    }
                }
                const playing = state.playing;
                ui.morphPlayIcon(playing);
                const mPlayBtn = document.getElementById('m-icon-play');
                const mPauseBtn = document.getElementById('m-icon-pause');
                if (mPlayBtn && mPauseBtn) {
                    mPlayBtn.className = playing ? 'hidden' : 'flex';
                    mPauseBtn.className = playing ? 'flex' : 'hidden';
                }
                const fsPlayIcon = document.getElementById('fs-icon-play');
                const fsPauseIcon = document.getElementById('fs-icon-pause');
                if (fsPlayIcon && fsPauseIcon) {
                    fsPlayIcon.classList.toggle('hidden', playing);
                    fsPauseIcon.classList.toggle('hidden', !playing);
                }
            },
            toggleQueue: (forceState) => {
                const wrap = document.getElementById('queue-wrapper');
                if (!wrap) return;

                const isCurrentlyQueue = state.queueExpanded && state.sidebarMode !== 'lyrics';
                const willExpand = (typeof forceState === 'boolean') ? forceState : !isCurrentlyQueue;

                if (!willExpand) {
                    state.queueExpanded = false;
                    state.sidebarMode = null;
                    wrap.classList.remove('queue-expanded', 'sidebar-show-lyrics');
                    wrap.style.height = '';
                    const queueExpand = document.getElementById('queue-expandable-area');
                    if (queueExpand) queueExpand.style.maxHeight = '0px';
                    document.getElementById('btn-queue-desktop')?.classList.remove('active-state', 'is-active');
                    document.getElementById('btn-lyrics')?.classList.remove('is-active');
                    if (!state.songDetailsExpanded) {
                        document.body.classList.remove('queue-sidebar-active');
                    }
                    document.querySelector('.mobile-queue-btn')?.classList.remove('queue-open');
                    return;
                }

                // Expand or switch to Queue mode inside exact container
                state.sidebarMode = 'queue';
                state.queueExpanded = true;
                wrap.classList.remove('sidebar-show-lyrics');
                wrap.classList.add('queue-expanded');
                ui.adjustQueueMaxHeight();
                setTimeout(() => {
                    document.querySelectorAll('.horizontal-scroll').forEach(shelf => {
                        const maxScroll = shelf.scrollWidth - shelf.clientWidth;
                        if (maxScroll > 10 && shelf.scrollLeft >= maxScroll - 20) {
                            shelf.scrollBy({ left: -400, behavior: 'smooth' });
                        }
                    });
                }, 60);
                document.getElementById('btn-queue-desktop')?.classList.add('active-state', 'is-active');
                document.getElementById('btn-lyrics')?.classList.remove('is-active');
                document.body.classList.add('queue-sidebar-active');
                ui.switchQueueTab(state.activeQueueTab || 'upnext');
                document.querySelector('.mobile-queue-btn')?.classList.add('queue-open');
            },
            toggleSidebarLyrics: async (forceState) => {
                const wrap = document.getElementById('queue-wrapper');
                if (!wrap) return;

                const isCurrentlyLyrics = state.queueExpanded && state.sidebarMode === 'lyrics';
                const willOpen = (typeof forceState === 'boolean') ? forceState : !isCurrentlyLyrics;

                if (!willOpen) {
                    state.sidebarMode = null;
                    state.queueExpanded = false;
                    wrap.classList.remove('queue-expanded', 'sidebar-show-lyrics');
                    wrap.style.height = '';
                    const queueExpand = document.getElementById('queue-expandable-area');
                    if (queueExpand) queueExpand.style.maxHeight = '0px';
                    document.getElementById('btn-lyrics')?.classList.remove('is-active');
                    document.getElementById('btn-queue-desktop')?.classList.remove('active-state', 'is-active');
                    if (!state.songDetailsExpanded) {
                        document.body.classList.remove('queue-sidebar-active');
                    }
                    return;
                }

                // Expand or switch to Lyrics mode inside exact container
                state.sidebarMode = 'lyrics';
                state.queueExpanded = true;
                wrap.classList.add('queue-expanded', 'sidebar-show-lyrics');
                ui.adjustQueueMaxHeight();
                setTimeout(() => {
                    document.querySelectorAll('.horizontal-scroll').forEach(shelf => {
                        const maxScroll = shelf.scrollWidth - shelf.clientWidth;
                        if (maxScroll > 10 && shelf.scrollLeft >= maxScroll - 20) {
                            shelf.scrollBy({ left: -400, behavior: 'smooth' });
                        }
                    });
                }, 60);
                document.getElementById('btn-lyrics')?.classList.add('is-active');
                document.getElementById('btn-queue-desktop')?.classList.remove('active-state', 'is-active');
                document.body.classList.add('queue-sidebar-active');

                if (state.currentTrack && window.lyricsManager) {
                    await lyricsManager.fetchLyricsForTrack(state.currentTrack);
                }
            },
            toggleQueueBarButton: () => {
                ui.toggleQueue();
            },
            toggleQueueExpandButton: () => {
                ui.toggleQueue();
            },
            toggleSongDetails: async (e) => {
                if (e) {
                    try { e.stopPropagation(); } catch (_) {}
                }
                const infoIsland = document.getElementById('info-island');
                const queueWrap = document.getElementById('queue-wrapper');
                if (!infoIsland) return;

                if (!state.currentTrack) {
                    ui.showToast('Play a song to view details', 'info');
                    return;
                }

                const willOpen = !state.songDetailsExpanded;
                state.songDetailsExpanded = willOpen;

                if (!willOpen) {
                    infoIsland.classList.remove('details-expanded');
                    queueWrap?.classList.remove('has-song-details');
                    ui.adjustQueueMaxHeight();
                    if (!state.queueExpanded) {
                        document.body.classList.remove('queue-sidebar-active');
                    }
                    return;
                }

                infoIsland.classList.add('details-expanded');
                queueWrap?.classList.add('has-song-details');
                document.body.classList.add('queue-sidebar-active');
                await ui.loadSongDetails(state.currentTrack);
            },
            loadSongDetails: async (track) => {
                if (!track) return;
                const skeleton = document.getElementById('song-details-skeleton');
                const content = document.getElementById('song-details-content');
                if (skeleton) skeleton.classList.remove('hidden');
                if (content) content.classList.add('hidden');

                try {
                    const details = (window.jiosaavnAPI && window.jiosaavnAPI.getSongDetails)
                        ? await window.jiosaavnAPI.getSongDetails(track)
                        : null;
                    if (state.currentTrack && (state.currentTrack.id === track.id || state.currentTrack.name === track.name)) {
                        ui.renderSongDetails(details);
                    }
                } catch (e) {
                    console.error('[loadSongDetails] Error:', e);
                    ui.renderSongDetails(null);
                }
            },
            renderSongDetails: (details) => {
                const skeleton = document.getElementById('song-details-skeleton');
                const content = document.getElementById('song-details-content');
                if (!content) return;

                if (!details) {
                    if (skeleton) skeleton.classList.add('hidden');
                    content.classList.remove('hidden');
                    content.innerHTML = '<div class="text-xs text-zinc-400 py-3 text-center font-sans">No metadata available for this track.</div>';
                    return;
                }

                const albumName = utils.escapeHtml(details.album || 'Single');
                const releaseYear = utils.escapeHtml(details.releaseDate || details.year || 'Unknown');
                const genreLang = utils.escapeHtml((details.genre || 'Music') + (details.language && details.language !== 'Unknown' && details.language !== 'Original' ? (' · ' + details.language) : ''));
                const labelName = utils.escapeHtml(details.label || 'Digital Release');
                const durationFormatted = utils.formatTime(details.duration || 0);
                const playCountStr = details.playCount ? (details.playCount + ' streams') : null;

                content.innerHTML = `
                    <div class="grid grid-cols-2 gap-2 text-left font-sans">
                        <div class="flex items-start gap-2.5 bg-white/[0.03] hover:bg-white/[0.05] rounded-xl p-2.5 border border-white/[0.08] min-w-0 transition-colors">
                            <svg class="w-3.5 h-3.5 text-zinc-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/></svg>
                            <div class="min-w-0 flex-1">
                                <div class="text-[9.5px] text-zinc-400 uppercase font-semibold tracking-wider leading-none mb-1">Album</div>
                                <div class="text-[11.5px] font-medium text-white truncate" title="${albumName}">${albumName}</div>
                            </div>
                        </div>

                        <div class="flex items-start gap-2.5 bg-white/[0.03] hover:bg-white/[0.05] rounded-xl p-2.5 border border-white/[0.08] min-w-0 transition-colors">
                            <svg class="w-3.5 h-3.5 text-zinc-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                            <div class="min-w-0 flex-1">
                                <div class="text-[9.5px] text-zinc-400 uppercase font-semibold tracking-wider leading-none mb-1">Released</div>
                                <div class="text-[11.5px] font-medium text-white truncate" title="${releaseYear}">${releaseYear}</div>
                            </div>
                        </div>

                        <div class="flex items-start gap-2.5 bg-white/[0.03] hover:bg-white/[0.05] rounded-xl p-2.5 border border-white/[0.08] min-w-0 transition-colors">
                            <svg class="w-3.5 h-3.5 text-zinc-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/></svg>
                            <div class="min-w-0 flex-1">
                                <div class="text-[9.5px] text-zinc-400 uppercase font-semibold tracking-wider leading-none mb-1">Genre & Lang</div>
                                <div class="text-[11.5px] font-medium text-white truncate" title="${genreLang}">${genreLang}</div>
                            </div>
                        </div>

                        <div class="flex items-start gap-2.5 bg-white/[0.03] hover:bg-white/[0.05] rounded-xl p-2.5 border border-white/[0.08] min-w-0 transition-colors">
                            <svg class="w-3.5 h-3.5 text-zinc-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
                            <div class="min-w-0 flex-1">
                                <div class="text-[9.5px] text-zinc-400 uppercase font-semibold tracking-wider leading-none mb-1">Label</div>
                                <div class="text-[11.5px] font-medium text-white truncate" title="${labelName}">${labelName}</div>
                            </div>
                        </div>
                    </div>

                    <div class="flex items-center justify-between pt-1.5 px-0.5 text-[11px] font-sans">
                        <div class="flex items-center gap-2 text-zinc-400 font-medium">
                            <span class="flex items-center gap-1.5 font-mono">
                                <svg class="w-3 h-3 text-zinc-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                ${durationFormatted}
                            </span>
                            ${playCountStr ? ('<span class="text-zinc-600">·</span><span class="text-zinc-300 font-mono">' + playCountStr + '</span>') : ''}
                        </div>
                        <div class="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-mono tracking-wider uppercase bg-white/[0.06] text-zinc-300 border border-white/10">
                            320 KBPS HI-FI
                        </div>
                    </div>
                `;

                if (skeleton) skeleton.classList.add('hidden');
                content.classList.remove('hidden');
            },
            switchQueueTab: (tab) => {
                state.activeQueueTab = tab;
                const isUpNext = tab === 'upnext';
                const tabUpNext = document.getElementById('tab-upnext');
                const tabHist = document.getElementById('tab-history');
                const tabSwitch = document.getElementById('queue-tab-switch');

                const activeBtn = isUpNext ? tabUpNext : tabHist;
                if (tabSwitch && activeBtn) {
                    const left = activeBtn.offsetLeft;
                    const width = activeBtn.offsetWidth;
                    tabSwitch.style.setProperty('--pill-x', `${left}px`);
                    tabSwitch.style.setProperty('--pill-w', `${width}px`);
                }
                const qList = document.getElementById('queue-list');
                const hList = document.getElementById('history-list');
                const clearQ = document.getElementById('btn-clear-queue');
                const clearH = document.getElementById('btn-clear-history');

                if (tabSwitch) tabSwitch.style.setProperty('--seg-index', isUpNext ? '0' : '1');
                if (tabUpNext) {
                    tabUpNext.classList.toggle('is-active', isUpNext);
                    tabUpNext.setAttribute('aria-selected', String(isUpNext));
                }
                if (tabHist) {
                    tabHist.classList.toggle('is-active', !isUpNext);
                    tabHist.setAttribute('aria-selected', String(!isUpNext));
                }
                if (qList) qList.classList.toggle('hidden', !isUpNext);
                if (hList) hList.classList.toggle('hidden', isUpNext);
                if (clearQ) clearQ.classList.toggle('hidden', !isUpNext);
                if (clearH) clearH.classList.toggle('hidden', isUpNext);
                ui.adjustQueueMaxHeight();

                if (deviceMode.isMobileUI() && document.body.classList.contains('mobile-player-open')) {
                    const targetMobileTab = isUpNext ? 'queue' : 'history';
                    if (document.body.dataset.mobileTab !== targetMobileTab) {
                        document.body.dataset.mobileTab = targetMobileTab;
                        const mobileSwitch = document.querySelector('.mobile-player-tabs');
                        if (mobileSwitch) mobileSwitch.style.setProperty('--seg-index', isUpNext ? '1' : '2');
                        document.querySelectorAll('.mobile-tab-btn').forEach(btn => {
                            const isCurrent = btn.id === `m-tab-${targetMobileTab}`;
                            btn.classList.toggle('is-active', isCurrent);
                            btn.setAttribute('aria-selected', String(isCurrent));
                        });
                    }
                }
                updateMarquees();
            },
            queueTrackForSection: (section, index) => {
                if (section === 'manual') return state.userQueue[index] || null;
                const upcoming = state.shuffle ? state.queue.filter((_, i) => i !== state.idx) : state.queue.slice(state.idx + 1);
                return upcoming[index] || null;
            },
            reorderQueueItem: (fromSection, fromIndex, toSection, toIndex) => {
                if (fromSection !== toSection) return;
                const from = Number(fromIndex);
                const to = Number(toIndex);
                if (!Number.isInteger(from) || !Number.isInteger(to) || from === to) return;
                if (fromSection === 'manual') {
                    const [item] = state.userQueue.splice(from, 1);
                    if (!item) return;
                    state.userQueue.splice(to, 0, item);
                } else if (fromSection === 'auto' && !state.shuffle) {
                    const base = state.idx + 1;
                    const [item] = state.queue.splice(base + from, 1);
                    if (!item) return;
                    state.queue.splice(base + to, 0, item);
                } else {
                    return;
                }
                ui.renderQueue();
                primeNextTrack();
                persist.save();
            },
            renderQueue: () => {
                const listEl = document.getElementById('queue-list');
                const clearBtn = document.getElementById('btn-clear-queue');
                const manualCount = state.userQueue.length;
                if (state.shuffle && (!state.shuffledOrder || state.shuffledOrder.length !== state.queue.length)) {
                    generateShuffledQueue();
                }
                const autoCount = state.shuffle 
                    ? Math.max(0, state.shuffledOrder.length - state.shufflePointer - 1)
                    : Math.max(0, state.queue.length - state.idx - 1);
                if (clearBtn) {
                    clearBtn.disabled = manualCount + autoCount === 0;
                    const clearLabel = document.getElementById('btn-clear-queue-label');
                    if (clearLabel) clearLabel.textContent = 'Clear';
                }
                const totalQueueCount = manualCount + autoCount;
                const badge = document.getElementById('queue-badge-count');
                if (badge) badge.remove();
                ui.adjustQueueMaxHeight();
                let html = '';
                if (state.userQueue.length > 0) {
                    html += `<div class="queue-section-label">Queued by you</div>`;
                    html += state.userQueue.map((song, index) => ui.createQueuePill(song, 'manual', index)).join('');
                }
                const upcoming = state.shuffle 
                    ? state.shuffledOrder.slice(state.shufflePointer + 1, state.shufflePointer + 11).map(i => state.queue[i]).filter(Boolean)
                    : state.queue.slice(state.idx + 1, state.idx + 11);
                if (upcoming.length > 0) {
                    html += `<div class="queue-section-label" style="margin-top:12px">Next in line</div>`;
                    html += upcoming.map((song, index) => ui.createQueuePill(song, 'auto', index)).join('');
                }
                listEl.innerHTML = html === '' ? '<div class="queue-empty-state">Queue is empty. Add songs and they will appear here instantly.</div>' : html;
                updateMarquees();
                if (ui.updateAlbumCarouselPeeks) ui.updateAlbumCarouselPeeks();
                if (ui.initQueuePointerReorder) ui.initQueuePointerReorder();
                if (state.fullscreenMode && ui.updateFullscreenQueue) ui.updateFullscreenQueue();
            },
            renderHistory: () => {
                const histEl = document.getElementById('history-list');
                if (!histEl) return;
                const historySongs = state.playHistory || [];
                if (historySongs.length === 0) {
                    histEl.innerHTML = '<div class="queue-empty-state">No history yet. Played tracks will appear here.</div>';
                    return;
                }
                
                // Group by relative date label
                const groups = {};
                historySongs.forEach(song => {
                    const label = utils.getRelativeDateLabel(song.playedAt);
                    if (!groups[label]) groups[label] = [];
                    groups[label].push(song);
                });
                
                let html = '';
                for (const [label, songs] of Object.entries(groups)) {
                    html += `<div class="queue-section-label queue-section-date">${utils.escapeHtml(label)}</div>`;
                    html += songs.map(song => ui.createPlayerListPill(song, `playSongById('${songStore.add(song)}')`, 'history')).join('');
                }
                
                histEl.innerHTML = html;
                updateMarquees();
                ui.adjustQueueMaxHeight();
            },
            initQueuePointerReorder: () => {
                const list = document.getElementById('queue-list');
                if (!list) return;

                let activeDrag = null;

                const onPointerDown = (e) => {
                    const handle = e.target.closest('.queue-drag-handle');
                    const row = e.target.closest('.queue-reorder-row');
                    if (!row || !handle) return;
                    if (!handle.contains(e.target)) return;

                    const section = row.dataset.queueSection;
                    const fromIndex = Number(row.dataset.queueIndex);
                    if (!Number.isInteger(fromIndex)) return;

                    const allRows = Array.from(list.querySelectorAll(`.queue-reorder-row[data-queue-section="${section}"]`));
                    if (allRows.length <= 1) return;

                    e.preventDefault();
                    try { handle.setPointerCapture(e.pointerId); } catch (_) {}

                    const rowRect = row.getBoundingClientRect();
                    const rowHeight = rowRect.height || 54;
                    const startY = e.clientY;
                    const itemTops = allRows.map(r => r.getBoundingClientRect().top);

                    row.classList.add('is-pointer-dragging');
                    row.style.zIndex = '60';

                    activeDrag = {
                        pointerId: e.pointerId,
                        handle,
                        row,
                        section,
                        fromIndex,
                        currentIndex: fromIndex,
                        rowHeight,
                        startY,
                        allRows,
                        itemTops
                    };

                    const onPointerMove = (moveEvt) => {
                        if (!activeDrag || moveEvt.pointerId !== activeDrag.pointerId) return;
                        const deltaY = moveEvt.clientY - activeDrag.startY;
                        activeDrag.row.style.transform = `translateY(${deltaY}px)`;

                        const currentCenterY = activeDrag.itemTops[activeDrag.fromIndex] + deltaY + activeDrag.rowHeight / 2;
                        let targetIndex = activeDrag.fromIndex;

                        for (let i = 0; i < activeDrag.allRows.length; i++) {
                            const top = activeDrag.itemTops[i];
                            const bottom = top + activeDrag.rowHeight;
                            if (currentCenterY >= top && currentCenterY <= bottom) {
                                targetIndex = i;
                                break;
                            } else if (i === 0 && currentCenterY < top) {
                                targetIndex = 0;
                                break;
                            } else if (i === activeDrag.allRows.length - 1 && currentCenterY > bottom) {
                                targetIndex = activeDrag.allRows.length - 1;
                                break;
                            }
                        }

                        if (targetIndex !== activeDrag.currentIndex) {
                            activeDrag.currentIndex = targetIndex;
                            activeDrag.allRows.forEach((r, idx) => {
                                if (idx === activeDrag.fromIndex) return;
                                let shift = 0;
                                if (activeDrag.fromIndex < activeDrag.currentIndex) {
                                    if (idx > activeDrag.fromIndex && idx <= activeDrag.currentIndex) {
                                        shift = -activeDrag.rowHeight;
                                    }
                                } else if (activeDrag.fromIndex > activeDrag.currentIndex) {
                                    if (idx >= activeDrag.currentIndex && idx < activeDrag.fromIndex) {
                                        shift = activeDrag.rowHeight;
                                    }
                                }
                                r.style.transition = 'transform 0.24s cubic-bezier(0.2, 0.8, 0.2, 1)';
                                r.style.transform = shift ? `translateY(${shift}px)` : 'none';
                            });
                        }
                    };

                    const onPointerUp = (upEvt) => {
                        if (!activeDrag || upEvt.pointerId !== activeDrag.pointerId) return;
                        window.removeEventListener('pointermove', onPointerMove);
                        window.removeEventListener('pointerup', onPointerUp);
                        window.removeEventListener('pointercancel', onPointerUp);

                        try { activeDrag.handle.releasePointerCapture(upEvt.pointerId); } catch (_) {}

                        const { row: draggedRow, fromIndex: fIdx, currentIndex: cIdx, section: s, rowHeight: rh, allRows: rows } = activeDrag;
                        activeDrag = null;

                        const finalShift = (cIdx - fIdx) * rh;
                        draggedRow.classList.remove('is-pointer-dragging');
                        draggedRow.classList.add('is-landing');
                        draggedRow.style.transition = 'transform 0.24s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.25s ease';
                        draggedRow.style.transform = `translateY(${finalShift}px)`;
                        draggedRow.style.boxShadow = '0 0 0 rgba(0,0,0,0)';

                        setTimeout(() => {
                            rows.forEach(r => {
                                r.style.transform = '';
                                r.style.transition = '';
                                r.style.boxShadow = '';
                                r.style.zIndex = '';
                                r.classList.remove('is-landing', 'is-pointer-dragging');
                            });
                            if (fIdx !== cIdx) {
                                ui.reorderQueueItem(s, fIdx, s, cIdx);
                            }
                        }, 250);
                    };

                    window.addEventListener('pointermove', onPointerMove, { passive: false });
                    window.addEventListener('pointerup', onPointerUp, { passive: false });
                    window.addEventListener('pointercancel', onPointerUp, { passive: false });
                };

                list.removeEventListener('pointerdown', list._pointerDownHandler);
                list._pointerDownHandler = onPointerDown;
                list.addEventListener('pointerdown', onPointerDown);
            },
            toggleFullscreenPlayer: (forceState) => {
                const fsEl = document.getElementById('fullscreen-player');
                const fsContainer = document.getElementById('fullscreen-container');
                if (!fsEl || !fsContainer) return;

                const willOpen = (typeof forceState === 'boolean') ? forceState : !state.fullscreenMode;

                const sourceEl = document.getElementById('info-island') || document.getElementById('queue-wrapper') || document.body;
                const rect = sourceEl.getBoundingClientRect();
                const originX = rect.left + rect.width / 2;
                const originY = rect.top + rect.height / 2;
                const scaleX = Math.max(0.15, rect.width / (window.innerWidth || 1));
                const scaleY = Math.max(0.15, rect.height / (window.innerHeight || 1));
                const deltaX = originX - window.innerWidth / 2;
                const deltaY = originY - window.innerHeight / 2;

                if (!willOpen) {
                    state.fullscreenMode = false;
                    fsContainer.style.transition = 'transform 0.42s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.35s ease, border-radius 0.42s ease';
                    fsContainer.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(${scaleX}, ${scaleY})`;
                    fsContainer.style.borderRadius = '1.75rem';
                    fsContainer.style.opacity = '0';
                    fsEl.classList.remove('is-active');

                    setTimeout(() => {
                        if (!state.fullscreenMode) {
                            fsEl.classList.add('hidden');
                            fsContainer.style.transform = '';
                            fsContainer.style.borderRadius = '';
                            fsContainer.style.opacity = '';
                        }
                    }, 420);
                    return;
                }

                state.fullscreenMode = true;
                ui.updateFullscreenPlayer();
                ui.updateFullscreenQueue();
                ui.setFullscreenTab(state.fullscreenTab || 'split');

                // Start from exact dock bounds
                fsContainer.style.transition = 'none';
                fsContainer.style.transformOrigin = 'center center';
                fsContainer.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(${scaleX}, ${scaleY})`;
                fsContainer.style.borderRadius = '1.75rem';
                fsContainer.style.opacity = '0.35';
                fsEl.classList.remove('hidden');

                // Force reflow
                void fsEl.offsetWidth;

                // Animate smoothly to fullscreen
                fsEl.classList.add('is-active');
                fsContainer.style.transition = 'transform 0.48s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.35s ease, border-radius 0.48s ease';
                fsContainer.style.transform = 'none';
                fsContainer.style.borderRadius = '0px';
                fsContainer.style.opacity = '1';

                if (state.currentTrack && window.lyricsManager && lyricsManager.syncTime) {
                    lyricsManager.syncTime(audio.currentTime || 0, true);
                }
            },
            setFullscreenTab: (tab = 'split') => {
                state.fullscreenTab = tab;
                const body = document.getElementById('fullscreen-body');
                if (body) body.setAttribute('data-view', tab);

                const tabs = ['lyrics', 'split', 'queue'];
                tabs.forEach(t => {
                    const btn = document.getElementById(`fs-tab-${t}`);
                    if (btn) btn.classList.toggle('is-active', t === tab);
                });

                if (tab === 'queue') {
                    ui.updateFullscreenQueue();
                } else if (tab === 'lyrics' || tab === 'split') {
                    if (state.currentTrack && window.lyricsManager && lyricsManager.syncTime) {
                        lyricsManager.syncTime(audio.currentTime || 0, true);
                    }
                }
            },
            updateFullscreenPlayer: () => {
                const track = state.currentTrack;
                if (!track) return;

                const miniArt = document.getElementById('fullscreen-mini-art');
                const miniTitle = document.getElementById('fullscreen-mini-title');
                const miniArtist = document.getElementById('fullscreen-mini-artist');
                const heroImg = document.getElementById('fullscreen-hero-img');
                const heroTitle = document.getElementById('fullscreen-hero-title');
                const heroArtist = document.getElementById('fullscreen-hero-artist');

                const title = track.name || track.title || 'Unknown Track';
                const artist = track.artist || 'Unknown Artist';
                const art = sanitizeImageUrl(track.img || 'DTunes.svg');

                if (miniTitle) miniTitle.textContent = title;
                if (miniArtist) miniArtist.textContent = artist;
                if (miniArt) miniArt.src = art;

                if (heroTitle) heroTitle.textContent = title;
                if (heroArtist) heroArtist.textContent = artist;
                if (heroImg) heroImg.src = art;

                const playBtn = document.getElementById('fs-btn-play');
                const playIcon = document.getElementById('fs-icon-play');
                const pauseIcon = document.getElementById('fs-icon-pause');
                if (playBtn && playIcon && pauseIcon) {
                    playIcon.classList.toggle('hidden', state.playing);
                    pauseIcon.classList.toggle('hidden', !state.playing);
                }

                document.getElementById('fs-btn-shuffle')?.classList.toggle('active-state', !!state.shuffle);
                document.getElementById('fs-btn-repeat')?.classList.toggle('active-state', !!state.repeat);
            },
            updateFullscreenQueue: () => {
                const queueCont = document.getElementById('fullscreen-queue-list');
                const countCont = document.getElementById('fullscreen-queue-count');
                if (!queueCont) return;

                const manual = state.userQueue || [];
                const auto = (state.queue || []).slice(state.idx + 1);
                const allSongs = [...manual, ...auto];

                if (countCont) countCont.textContent = `${allSongs.length} track${allSongs.length === 1 ? '' : 's'}`;

                if (allSongs.length === 0) {
                    queueCont.innerHTML = '<div class="text-zinc-500 text-xs py-8 text-center">Queue is empty</div>';
                    return;
                }

                queueCont.innerHTML = allSongs.slice(0, 50).map((s, idx) => {
                    const isLiked = (typeof player !== 'undefined' && player.isLiked) ? player.isLiked(s.id) : (Array.isArray(state.likedIds) ? state.likedIds.includes(String(s.id)) : false);
                    return `
                    <div class="swipe-song np-row flex items-center justify-between p-2.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/5 hover:border-white/10 transition-all cursor-pointer group" onclick="playSongById('${songStore.add(s)}')">
                        <div class="flex items-center gap-3 min-w-0">
                            <span class="text-[11px] font-mono text-zinc-500 w-5 text-center group-hover:text-white transition-colors">${idx + 1}</span>
                            <img src="${sanitizeImageUrl(s.img || 'DTunes.svg')}" class="w-10 h-10 rounded-xl object-cover shadow-md flex-shrink-0" alt="">
                            <div class="min-w-0">
                                <div class="text-xs font-semibold text-white truncate group-hover:text-white transition-colors">${utils.escapeHtml(s.name || s.title || '')}</div>
                                <div class="text-[11px] text-zinc-400 truncate mt-0.5">${utils.escapeHtml(s.artist || '')}</div>
                            </div>
                        </div>
                        <div class="flex items-center gap-3 flex-shrink-0">
                            <button onclick="player.toggleLike('${s.id}'); event.stopPropagation();" class="text-zinc-500 hover:text-white p-1 rounded-full transition active:scale-90 ${isLiked ? 'text-white' : ''}" title="Like">
                                <svg class="heart-glyph" width="15" height="15" viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                            </button>
                            <span class="text-[11px] font-mono text-zinc-500">${utils.formatTime(s.duration || 0)}</span>
                        </div>
                    </div>`;
                }).join('');
            },
            handleFullscreenSeek: (e) => {
                const track = document.getElementById('fs-seek-bar-container') || document.getElementById('fs-seek-track');
                if (!track || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
                const rect = track.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const ratio = Math.max(0, Math.min(1, clickX / rect.width));
                player.seek(ratio * audio.duration);
            },
            handleFullscreenSeekHover: (e) => {
                const track = document.getElementById('fs-seek-bar-container');
                const tooltip = document.getElementById('fs-seek-tooltip');
                if (!track || !tooltip || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
                const rect = track.getBoundingClientRect();
                const offsetX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
                const ratio = offsetX / rect.width;
                tooltip.textContent = utils.formatTime(ratio * audio.duration);
                tooltip.style.left = `${offsetX}px`;
                tooltip.classList.add('visible');
            },
            handleFullscreenSeekLeave: () => {
                const tooltip = document.getElementById('fs-seek-tooltip');
                if (tooltip) tooltip.classList.remove('visible');
            },
            updateAlbumCarouselPeeks: () => {
                const prevCard = document.getElementById('peek-prev-card');
                const nextCard = document.getElementById('peek-next-card');
                const prevImg = document.getElementById('peek-prev-img');
                const nextImg = document.getElementById('peek-next-img');
                if (!prevCard || !nextCard || !prevImg || !nextImg) return;

                const prevTrack = typeof player !== 'undefined' && player.getPreviousTrack ? player.getPreviousTrack() : null;
                const nextTrack = typeof player !== 'undefined' && player.getUpcomingTrack ? player.getUpcomingTrack() : null;

                if (prevTrack && (prevTrack.img || prevTrack.image)) {
                    prevImg.src = sanitizeImageUrl(prevTrack.img || prevTrack.image);
                    prevCard.classList.remove('hidden');
                } else {
                    prevImg.src = FALLBACK_ART;
                    prevCard.classList.add('hidden');
                }

                if (nextTrack && (nextTrack.img || nextTrack.image)) {
                    nextImg.src = sanitizeImageUrl(nextTrack.img || nextTrack.image);
                    nextCard.classList.remove('hidden');
                } else {
                    nextImg.src = FALLBACK_ART;
                    nextCard.classList.add('hidden');
                }
            }
        };

        // ============================================
        // AI SAFETY REPORT MANAGER (Policy 11.16)
        // ============================================
        const aiReportManager = {
            currentContext: null,

            openReportModal: function(options = {}) {
                this.currentContext = options;
                if (typeof document === 'undefined') return;
                const modal = document.getElementById('ai-report-modal');
                if (!modal) return;

                const featureBadge = document.getElementById('ai-report-feature-badge');
                const summaryText = document.getElementById('ai-report-summary');
                const issueType = document.getElementById('ai-report-issue-type');
                const detailsInput = document.getElementById('ai-report-details');
                const userName = document.getElementById('ai-report-name');
                const errorBanner = document.getElementById('ai-report-error');

                if (featureBadge) featureBadge.textContent = options.feature || 'Generative AI Content';
                if (summaryText) summaryText.textContent = options.contentSummary || 'User-initiated AI music curation';
                if (issueType) issueType.selectedIndex = 0;
                if (detailsInput) detailsInput.value = '';
                if (userName && !userName.value && typeof state !== 'undefined' && state.username && state.username !== 'Guest User') {
                    userName.value = state.username;
                }
                if (errorBanner) {
                    errorBanner.textContent = '';
                    errorBanner.classList.add('hidden');
                }

                modal.classList.remove('hidden');
                if (detailsInput) detailsInput.focus();
            },

            closeReportModal: function() {
                if (typeof document === 'undefined') return;
                const modal = document.getElementById('ai-report-modal');
                if (modal) modal.classList.add('hidden');
                this.currentContext = null;
            },

            submitReport: async function() {
                if (typeof document === 'undefined') return;
                const detailsInput = document.getElementById('ai-report-details');
                const issueType = document.getElementById('ai-report-issue-type');
                const userName = document.getElementById('ai-report-name');
                const userEmail = document.getElementById('ai-report-email');
                const errorBanner = document.getElementById('ai-report-error');
                const submitBtn = document.getElementById('btn-submit-ai-report');

                const details = detailsInput ? detailsInput.value.trim() : '';
                if (!details) {
                    if (errorBanner) {
                        errorBanner.textContent = 'Please describe why this content is problematic or inappropriate.';
                        errorBanner.classList.remove('hidden');
                    }
                    if (detailsInput) detailsInput.focus();
                    return;
                }

                const feature = this.currentContext?.feature || 'Generative AI Output';
                const contentSummary = this.currentContext?.contentSummary || '';
                const issue = issueType ? issueType.value : 'Inappropriate Content';
                const name = userName ? userName.value.trim() : '';
                const email = userEmail ? userEmail.value.trim() : '';

                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.textContent = 'Submitting report...';
                }

                try {
                    const reportPayload = {
                        name: name || (typeof state !== 'undefined' && state.username && state.username !== 'Guest User' ? state.username : 'Anonymous Listener'),
                        email: email || null,
                        category: 'ai_safety',
                        rating: 1,
                        message: `[AI Safety Report - Policy 11.16]\nFeature: ${feature}\nIssue Type: ${issue}\nSummary: ${contentSummary}\nDetails: ${details}\nMeta: ${JSON.stringify(this.currentContext?.context || {})}`,
                        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Antigravity-Client',
                        app_version: (typeof window !== 'undefined' && window.electronAPI) ? '1.4.0-win-desktop' : '1.4.0-web'
                    };

                    const endpoint = 'https://gmwieijbrrztukqpfwkg.supabase.co/rest/v1/dtunes_feedback';
                    const headers = {
                        'apikey': 'sb_publishable_KX3MYtV84QJJdy9bPDuMEA_V99sLKSE',
                        'Content-Type': 'application/json',
                        'Prefer': 'return=minimal'
                    };

                    const response = await fetch(endpoint, {
                        method: 'POST',
                        headers: headers,
                        body: JSON.stringify(reportPayload)
                    });

                    if (!response.ok) {
                        throw new Error(`Server returned HTTP ${response.status}`);
                    }

                    aiReportManager.closeReportModal();
                    if (typeof ui !== 'undefined' && ui.showToast) {
                        ui.showToast('Report submitted. Our moderation team has flagged this content for review.', 'success');
                    }
                } catch (err) {
                    console.error('[AI Report] Submission failed:', err);
                    if (errorBanner) {
                        errorBanner.textContent = `Report submission failed (${err.message || 'Check connection'}). Please try again.`;
                        errorBanner.classList.remove('hidden');
                    }
                } finally {
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.textContent = 'Submit Safety Report';
                    }
                }
            }
        };

        // ============================================
        // REVIEWS & COMMUNITY FEEDBACK MANAGER
        // ============================================
        const reviewsManager = {
            reviews: [],
            filter: 'all',
            isLoading: false,

            fetchReviews: async function(force = false) {
                if (this.isLoading) return;
                if (!force && this.reviews.length > 0) return this.reviews;

                this.isLoading = true;
                const container = typeof document !== 'undefined' ? document.getElementById('reviews-list-container') : null;
                if (container && this.reviews.length === 0) {
                    container.innerHTML = '<div class="text-sm text-gray-400 py-12 col-span-full text-center flex items-center justify-center gap-2"><div class="w-4 h-4 border-2 border-[var(--accent-color)] border-t-transparent rounded-full animate-spin"></div><span>Loading community reviews...</span></div>';
                }

                try {
                    const endpoint = 'https://gmwieijbrrztukqpfwkg.supabase.co/rest/v1/dtunes_feedback?select=*&order=created_at.desc&limit=60';
                    const headers = {
                        'apikey': 'sb_publishable_KX3MYtV84QJJdy9bPDuMEA_V99sLKSE'
                    };

                    const res = await fetch(endpoint, { headers });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const data = await res.json();
                    this.reviews = Array.isArray(data) ? data : [];
                } catch (err) {
                    console.warn('[Reviews] Fetch failed, using fallback display:', err);
                    if (this.reviews.length === 0) {
                        this.reviews = [
                            {
                                id: 'demo-1',
                                name: 'AcousticFan99',
                                rating: 5,
                                category: 'general',
                                message: "The sound quality and instant Vibe Mix generator are stunning. Best music streaming experience on Windows!",
                                created_at: new Date(Date.now() - 3600000 * 24).toISOString()
                            },
                            {
                                id: 'demo-2',
                                name: 'CyberBeat',
                                rating: 5,
                                category: 'ai',
                                message: "The daily AI mixes actually hit my taste. Love how smooth the queue and lyrics sync are.",
                                created_at: new Date(Date.now() - 3600000 * 48).toISOString()
                            }
                        ];
                    }
                } finally {
                    this.isLoading = false;
                    this.render();
                }
            },

            setCategoryFilter: function(category) {
                this.filter = category;
                if (typeof document !== 'undefined') {
                    const tabButtons = document.querySelectorAll('#reviews-filter-tabs .reviews-tab-btn');
                    tabButtons.forEach(btn => {
                        if (btn.dataset.category === category) {
                            btn.className = 'reviews-tab-btn active px-4 py-1.5 rounded-full text-xs font-bold transition bg-white/15 text-white';
                        } else {
                            btn.className = 'reviews-tab-btn px-4 py-1.5 rounded-full text-xs font-bold transition bg-white/5 text-gray-400 hover:text-white';
                        }
                    });
                }
                this.renderList();
            },

            render: function() {
                if (typeof document === 'undefined') return;
                if (this.reviews.length === 0 && !this.isLoading) {
                    this.fetchReviews();
                    return;
                }

                const ratedReviews = this.reviews.filter(r => typeof r.rating === 'number' && r.rating > 0);
                const avg = ratedReviews.length > 0
                    ? (ratedReviews.reduce((sum, r) => sum + r.rating, 0) / ratedReviews.length).toFixed(1)
                    : '4.9';

                const avgEl = document.getElementById('reviews-avg-rating');
                const countEl = document.getElementById('reviews-total-count');
                const badgeCount = document.getElementById('reviews-badge-count');

                if (avgEl) avgEl.textContent = `${avg} / 5.0`;
                if (countEl) countEl.textContent = this.reviews.length;
                if (badgeCount) badgeCount.textContent = `${this.reviews.length} Reviews`;

                this.renderList();
            },

            renderList: function() {
                if (typeof document === 'undefined') return;
                const container = document.getElementById('reviews-list-container');
                if (!container) return;

                let filtered = this.reviews;
                if (this.filter === '5star') {
                    filtered = this.reviews.filter(r => r.rating === 5);
                } else if (this.filter === 'ai') {
                    filtered = this.reviews.filter(r => r.category === 'ai' || r.category === 'ai_report' || r.category === 'ai_safety' || /vibe|mix|ai|capsule/i.test(r.message || ''));
                } else if (this.filter === 'general') {
                    filtered = this.reviews.filter(r => r.category === 'general');
                }

                if (filtered.length === 0) {
                    container.innerHTML = '<div class="text-sm text-gray-400 py-12 col-span-full text-center">No reviews in this category yet. Be the first to share feedback!</div>';
                    return;
                }

                container.innerHTML = filtered.map(r => this.createReviewCard(r)).join('');
            },

            createReviewCard: function(r) {
                const rating = r.rating || 5;
                const starsHtml = Array(5).fill(0).map((_, i) =>
                    i < rating
                        ? '<svg class="w-3.5 h-3.5 text-amber-400 fill-current" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>'
                        : '<svg class="w-3.5 h-3.5 text-gray-600 fill-current" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>'
                ).join('');

                const name = (r.name || "D'Tunes Listener").trim();
                const dateStr = r.created_at ? new Date(r.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Verified Review';
                const categoryTag = (r.category || 'general').replace('_', ' ');
                const escape = (str) => typeof utils !== 'undefined' && utils.escapeHtml ? utils.escapeHtml(str) : String(str || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

                return `
                    <div class="glass-panel p-5 rounded-2xl border border-white/10 flex flex-col justify-between hover:border-white/20 transition-all hover:scale-[1.01] shadow-lg">
                        <div>
                            <div class="flex items-center justify-between mb-3">
                                <div class="flex items-center gap-1.5">${starsHtml}</div>
                                <span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/10 text-gray-300">${escape(categoryTag)}</span>
                            </div>
                            <p class="text-sm text-gray-200 leading-relaxed whitespace-pre-line mb-4 break-words">${escape(r.message || '')}</p>
                        </div>
                        <div class="flex items-center justify-between pt-3 border-t border-white/5 text-xs text-gray-400">
                            <div class="flex items-center gap-2">
                                <div class="w-6 h-6 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-[10px] font-bold text-gray-200 uppercase">${escape(name.charAt(0))}</div>
                                <span class="font-medium text-gray-300 truncate max-w-[120px]">${escape(name)}</span>
                            </div>
                            <span class="text-[11px] text-gray-500">${dateStr}</span>
                        </div>
                    </div>
                `;
            },

            openSubmitModal: function() {
                if (typeof document === 'undefined') return;
                const modal = document.getElementById('review-submit-modal');
                if (!modal) return;
                const userName = document.getElementById('review-author-name');
                if (userName && !userName.value && typeof state !== 'undefined' && state.username && state.username !== 'Guest User') {
                    userName.value = state.username;
                }
                const errorBanner = document.getElementById('review-submit-error');
                if (errorBanner) errorBanner.classList.add('hidden');
                this.setSubmitRating(5);
                modal.classList.remove('hidden');
            },

            closeSubmitModal: function() {
                if (typeof document === 'undefined') return;
                const modal = document.getElementById('review-submit-modal');
                if (modal) modal.classList.add('hidden');
            },

            selectedRating: 5,
            setSubmitRating: function(rating) {
                this.selectedRating = rating;
                if (typeof document === 'undefined') return;
                const stars = document.querySelectorAll('#review-star-selector .star-btn');
                stars.forEach(btn => {
                    const val = parseInt(btn.dataset.value);
                    if (val <= rating) {
                        btn.classList.add('text-amber-400');
                        btn.classList.remove('text-gray-600');
                    } else {
                        btn.classList.remove('text-amber-400');
                        btn.classList.add('text-gray-600');
                    }
                });
                const ratingLabel = document.getElementById('review-rating-label');
                const labels = { 1: '1/5 - Poor', 2: '2/5 - Fair', 3: '3/5 - Good', 4: '4/5 - Very Good', 5: '5/5 - Outstanding!' };
                if (ratingLabel) ratingLabel.textContent = labels[rating] || `${rating}/5`;
            },

            submitReview: async function() {
                if (typeof document === 'undefined') return;
                const msgInput = document.getElementById('review-text-message');
                const nameInput = document.getElementById('review-author-name');
                const emailInput = document.getElementById('review-author-email');
                const catSelect = document.getElementById('review-category-select');
                const errorBanner = document.getElementById('review-submit-error');
                const submitBtn = document.getElementById('btn-submit-review');

                const message = msgInput ? msgInput.value.trim() : '';
                if (!message) {
                    if (errorBanner) {
                        errorBanner.textContent = 'Please write a brief review or feedback.';
                        errorBanner.classList.remove('hidden');
                    }
                    if (msgInput) msgInput.focus();
                    return;
                }

                const name = nameInput ? nameInput.value.trim() : '';
                const email = emailInput ? emailInput.value.trim() : '';
                const category = catSelect ? catSelect.value : 'general';

                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.textContent = 'Posting review...';
                }

                try {
                    const payload = {
                        name: name || (typeof state !== 'undefined' && state.username && state.username !== 'Guest User' ? state.username : 'Anonymous Listener'),
                        email: email || null,
                        category: category,
                        rating: this.selectedRating || 5,
                        message: message,
                        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Antigravity-Client',
                        app_version: (typeof window !== 'undefined' && window.electronAPI) ? '1.4.0-win-desktop' : '1.4.0-web'
                    };

                    const endpoint = 'https://gmwieijbrrztukqpfwkg.supabase.co/rest/v1/dtunes_feedback';
                    const headers = {
                        'apikey': 'sb_publishable_KX3MYtV84QJJdy9bPDuMEA_V99sLKSE',
                        'Content-Type': 'application/json',
                        'Prefer': 'return=minimal'
                    };

                    const response = await fetch(endpoint, {
                        method: 'POST',
                        headers: headers,
                        body: JSON.stringify(payload)
                    });

                    if (!response.ok) {
                        throw new Error(`Server responded with ${response.status}`);
                    }

                    this.reviews.unshift({
                        ...payload,
                        id: 'local-' + Date.now(),
                        created_at: new Date().toISOString()
                    });

                    this.closeSubmitModal();
                    this.render();

                    if (typeof ui !== 'undefined' && ui.showToast) {
                        ui.showToast('Thank you! Your review has been published.', 'success');
                    }
                } catch (err) {
                    console.error('[Review Submit] Failed:', err);
                    if (errorBanner) {
                        errorBanner.textContent = `Submission error: ${err.message || 'Please check connection.'}`;
                        errorBanner.classList.remove('hidden');
                    }
                } finally {
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.textContent = 'Publish Review';
                    }
                }
            }
        };

        if (typeof window !== 'undefined') {
            window.aiReportManager = aiReportManager;
            window.reviewsManager = reviewsManager;
            window.ui = ui;
        }

        // Re-evaluate offline gating for song lists when connectivity changes.
        if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
            const refreshOfflineStates = () => {
                try { ui.renderLibraryLists(); } catch (_) {}
                try { if (typeof ui.renderQueue === 'function') ui.renderQueue(); } catch (_) {}
            };
            window.addEventListener('online', refreshOfflineStates);
            window.addEventListener('offline', refreshOfflineStates);
        }

        if (typeof module !== 'undefined' && module.exports) {
            module.exports = { ui, aiReportManager, reviewsManager };
        }

// Outside click dismiss for profile dropdown
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('pointerdown', (e) => {
        const acc = document.getElementById('header-account');
        const dd = document.getElementById('profile-dropdown');
        if (dd && !dd.classList.contains('hidden') && acc && !acc.contains(e.target)) {
            dd.classList.add('hidden');
        }
    });
                        }
