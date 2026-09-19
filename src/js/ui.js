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
                document.getElementById('view-home').classList.add('hidden'); document.getElementById('view-search').classList.add('hidden'); document.getElementById('view-playlist').classList.add('hidden'); document.getElementById('view-library').classList.add('hidden'); document.getElementById('view-settings').classList.add('hidden'); document.getElementById('view-stats').classList.add('hidden'); document.getElementById('view-album').classList.add('hidden'); document.getElementById('view-artist').classList.add('hidden');
                document.getElementById(`view-${view}`).classList.remove('hidden'); document.getElementById('main-container').scrollTo({ top: 0, behavior: 'smooth' });

                if (view === 'stats') statsView.render();

                if (view !== 'search') {
                    document.getElementById('search-dropdown').classList.remove('active');
                }

                if (view !== 'home' && deviceMode.isMobileUI()) {
                    document.body.classList.remove('mobile-player-open');
                    document.body.classList.remove('mobile-search-open');
                    document.documentElement.style.setProperty('--mobile-keyboard-offset', '0px');
                    document.documentElement.style.setProperty('--mobile-keyboard-lift', '0px');
                    document.body.classList.remove('mobile-keyboard-open');
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
                    const initialTab = document.body.dataset.mobileTab || 'track';
                    ui.switchMobilePlayerTab(initialTab);
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
                if (!deviceMode.isMobileUI()) {
                    document.getElementById('search-input').focus({ preventScroll: true });
                    return;
                }
                const input = document.getElementById('search-input');
                state.mobileSearchOriginView = ui.getCurrentView();
                document.body.classList.remove('mobile-player-open');
                document.body.classList.add('mobile-search-open');
                ui.setMobileNavActive('search');

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
                playSongById(storeId);
                document.getElementById('search-dropdown').classList.remove('active');
                if (deviceMode.isMobileUI() && document.body.classList.contains('mobile-search-open')) {
                    ui.closeMobileSearch({ clearQuickState: true, restoreOrigin: true });
                }
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
            initPlaylistCoverControls: () => {
                const colorEl = document.getElementById('pl-color-picker');
                const iconEl = document.getElementById('pl-icon-picker');
                const shapeEl = document.getElementById('pl-shape-picker');
                if (!colorEl || !iconEl || !shapeEl) return;

                colorEl.innerHTML = PLAYLIST_COVER_COLORS.map((color) => `
                    <button type="button" data-color="${color}" class="w-8 h-8 rounded-full border-2 ${playlistCoverDraft.color === color ? 'border-white scale-110' : 'border-transparent'} transition" style="background:${color}"></button>
                `).join('');
                iconEl.innerHTML = Object.keys(PLAYLIST_COVER_ICONS).map((name) => `
                    <button type="button" data-icon="${name}" class="w-10 h-10 rounded-xl flex items-center justify-center ${playlistCoverDraft.icon === name ? 'bg-[var(--accent-color)] text-black' : 'bg-white/10 text-white'} transition">${PLAYLIST_COVER_ICONS[name]}</button>
                `).join('');
                shapeEl.innerHTML = PLAYLIST_COVER_SHAPES.map((shape) => `
                    <button type="button" data-shape="${shape}" class="px-3 py-1.5 rounded-full text-xs font-bold ${playlistCoverDraft.shape === shape ? 'bg-[var(--accent-color)] text-black' : 'bg-white/10 text-gray-200'} transition">${shape}</button>
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
                return `https://placehold.co/100x100/111/fff?text=${encodeURIComponent(initial)}`;
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
                    { bandsId: 'eq-bands', presetsId: 'eq-settings-presets', descId: 'eq-settings-preset-desc', headroomId: 'eq-settings-headroom-badge', prefix: 'set' },
                    { bandsId: 'eq-modal-bands', presetsId: 'eq-modal-presets', descId: 'eq-modal-preset-desc', headroomId: 'eq-modal-headroom-badge', prefix: 'mod' }
                ];

                const currentPreset = getCurrentPresetId();
                const activePresetObj = EQ_PRESETS[currentPreset];
                const descText = activePresetObj ? activePresetObj.desc : 'Custom studio equalizer profile';

                containers.forEach(({ bandsId, presetsId, descId, prefix }) => {
                    const bandsContainer = document.getElementById(bandsId);
                    const presetsContainer = document.getElementById(presetsId);
                    const descEl = document.getElementById(descId);

                    if (descEl) descEl.textContent = descText;

                    if (presetsContainer) {
                        presetsContainer.innerHTML = Object.entries(EQ_PRESETS).map(([key, preset]) => `
                            <button onclick="ui.setEqualizerPreset('${key}')" class="eq-preset-chip ${key === currentPreset ? 'active' : ''}" title="${preset.desc}">
                                <span>${preset.icon}</span>
                                <span>${preset.name}</span>
                            </button>
                        `).join('') + `
                            <button class="eq-preset-chip ${currentPreset === 'custom' ? 'active' : ''}" style="pointer-events:none;">
                                <span>🎛️</span>
                                <span>Custom</span>
                            </button>
                        `;
                    }

                    if (bandsContainer) {
                        if (!bandsContainer.dataset.rendered) {
                            bandsContainer.innerHTML = EQ_BANDS.map((band) => `
                                <div class="eq-band" title="${band.frequency} Hz (${band.subLabel})">
                                    <span id="${prefix}-${band.key}-value" class="eq-value">0 dB</span>
                                    <div class="eq-slider-container">
                                        <div class="eq-zero-line"></div>
                                        <input id="${prefix}-${band.key}" type="range" min="-12" max="12" step="1" value="0" orient="vertical" aria-label="${band.label} (${band.subLabel})" oninput="ui.updateEqualizer('${band.key}', this.value)" class="eq-slider">
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
                            if (input) input.value = val;
                            if (label) label.textContent = `${val > 0 ? '+' : ''}${val} dB`;
                        });
                    }
                });
            },
            updateEqualizerMonitoring: (preampDb = 0) => {
                const headroomText = `Headroom: ${preampDb < 0 ? preampDb.toFixed(1) : '0.0'} dB`;
                const setBadge = document.getElementById('eq-settings-headroom-badge');
                const modBadge = document.getElementById('eq-modal-headroom-badge');
                if (setBadge) setBadge.textContent = headroomText;
                if (modBadge) modBadge.textContent = headroomText;
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
                document.getElementById('queue-wrapper').classList.remove('queue-expanded', 'preview-expanded', 'track-swap-out');
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
                if (name === 'Liked Songs') return { bg: 'bg-gradient-to-br from-red-600 to-red-900', icon: '<svg class="w-20 h-20 text-red-500 drop-shadow-xl" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>', customHtml: null };
                const custom = state.playlistStyles?.[name];
                if (custom) {
                    return {
                        bg: '',
                        icon: '',
                        customHtml: renderPlaylistCoverMarkup(custom, 'w-full h-full')
                    };
                }
                const themes = ['bg-gradient-to-br from-purple-500 to-indigo-600', 'bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-400 to-emerald-500', 'bg-[conic-gradient(at_bottom_left,_var(--tw-gradient-stops))] from-yellow-400 via-red-500 to-pink-500', 'bg-gradient-to-bl from-teal-400 to-blue-600', 'bg-gradient-to-tr from-pink-500 to-orange-400'];
                const index = name.length % themes.length;
                return { bg: themes[index], icon: `<span class="text-white drop-shadow-md uppercase">${name.substring(0, 2)}</span>`, customHtml: null };
            },
            showToast: (message, type = 'info', duration = 3000) => {
                const container = document.getElementById('toast-container');
                if (!container) return;
                const toast = document.createElement('div');
                const borderClass = type === 'error' ? 'border-red-500/40 bg-red-950/90 text-red-200' : (type === 'success' ? 'border-emerald-500/40 bg-emerald-950/90 text-emerald-200' : 'border-white/15 bg-zinc-900/90 text-white');
                const iconHtml = type === 'error' ? '⚠️' : (type === 'success' ? '✓' : '✨');

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
                            listEl.innerHTML = songs.map((song, idx) => {
                                const storeId = songStore.add(song);
                                return `
                                <div class="swipe-song group flex items-center gap-3 p-2 rounded-xl glass-panel hover:bg-white/10 transition hover-pause" data-store-id="${storeId}" ondblclick="player.likeSong('${utils.escapeJs(song.id)}')">
                                    <span class="w-6 text-center text-xs font-mono text-gray-500 flex-shrink-0">${idx + 1}</span>
                                    <div class="relative w-11 h-11 flex-shrink-0 cursor-pointer rounded-lg overflow-hidden" onclick="playSongById('${storeId}')">
                                        <img src="${song.img}" class="w-full h-full object-cover" loading="lazy">
                                        <div class="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition"><svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
                                    </div>
                                    <div class="flex-1 min-w-0 cursor-pointer flex flex-col justify-center" onclick="playSongById('${storeId}')">
                                        <div class="marquee-container w-full"><h4 class="text-white font-medium text-sm marquee-text">${utils.escapeHtml(song.name)}</h4></div>
                                        <div class="marquee-container w-full mt-0.5"><p class="text-gray-400 text-xs marquee-text">${utils.escapeHtml(song.artist)}</p></div>
                                    </div>
                                    <span class="text-xs text-gray-500 font-mono flex-shrink-0">${song.duration ? utils.formatTime(song.duration) : ''}</span>
                                    <div class="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition">
                                        <button class="p-1.5 text-gray-400 hover:text-white rounded-full hover:bg-white/10 hidden md:block" title="Play Next" onclick="event.stopPropagation(); player.addNext(songStore.get('${storeId}'))"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg></button>
                                        <button class="p-1.5 text-gray-400 hover:text-white rounded-full hover:bg-white/10 hidden md:block" title="Add to Queue" onclick="event.stopPropagation(); player.addToQueue(songStore.get('${storeId}'))"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h10m-10 4h6"/></svg></button>
                                        <button class="p-1.5 text-gray-400 hover:text-white rounded-full hover:bg-white/10" title="Options" onclick="event.stopPropagation(); ctxMenu.showSong(event, '${storeId}')"><svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M3 9.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/></svg></button>
                                    </div>
                                </div>`;
                            }).join('');
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
                if (followBtn) followBtn.className = isFollowing ? 'px-5 py-2.5 rounded-full bg-[var(--accent-color)] text-black text-xs font-bold transition flex items-center gap-1.5' : 'px-5 py-2.5 rounded-full border border-white/20 bg-white/5 text-white text-xs font-bold hover:bg-white/15 transition flex items-center gap-1.5';

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
                            followBtn.className = nowFollowing ? 'px-5 py-2.5 rounded-full bg-[var(--accent-color)] text-black text-xs font-bold transition flex items-center gap-1.5' : 'px-5 py-2.5 rounded-full border border-white/20 bg-white/5 text-white text-xs font-bold hover:bg-white/15 transition flex items-center gap-1.5';
                        };
                    }

                    if (topSongs.length === 0) {
                        if (topSongsEl) topSongsEl.innerHTML = '<p class="text-gray-400 py-4">No top songs found for this artist.</p>';
                    } else {
                        if (topSongsEl) {
                            topSongsEl.innerHTML = topSongs.slice(0, 10).map((song, idx) => {
                                const storeId = songStore.add(song);
                                return `
                                <div class="swipe-song group flex items-center gap-3 p-2 rounded-xl glass-panel hover:bg-white/10 transition hover-pause" data-store-id="${storeId}" ondblclick="player.likeSong('${utils.escapeJs(song.id)}')">
                                    <span class="w-6 text-center text-xs font-mono text-gray-500 flex-shrink-0">${idx + 1}</span>
                                    <div class="relative w-11 h-11 flex-shrink-0 cursor-pointer rounded-lg overflow-hidden" onclick="playSongById('${storeId}')">
                                        <img src="${song.img}" class="w-full h-full object-cover" loading="lazy">
                                        <div class="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition"><svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
                                    </div>
                                    <div class="flex-1 min-w-0 cursor-pointer flex flex-col justify-center" onclick="playSongById('${storeId}')">
                                        <div class="marquee-container w-full"><h4 class="text-white font-medium text-sm marquee-text">${utils.escapeHtml(song.name)}</h4></div>
                                        <div class="marquee-container w-full mt-0.5"><p class="text-gray-400 text-xs marquee-text">${utils.escapeHtml(song.artist)}</p></div>
                                    </div>
                                    <span class="text-xs text-gray-500 font-mono flex-shrink-0">${song.duration ? utils.formatTime(song.duration) : ''}</span>
                                    <div class="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition">
                                        <button class="p-1.5 text-gray-400 hover:text-white rounded-full hover:bg-white/10 hidden md:block" title="Play Next" onclick="event.stopPropagation(); player.addNext(songStore.get('${storeId}'))"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg></button>
                                        <button class="p-1.5 text-gray-400 hover:text-white rounded-full hover:bg-white/10 hidden md:block" title="Add to Queue" onclick="event.stopPropagation(); player.addToQueue(songStore.get('${storeId}'))"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h10m-10 4h6"/></svg></button>
                                        <button class="p-1.5 text-gray-400 hover:text-white rounded-full hover:bg-white/10" title="Options" onclick="event.stopPropagation(); ctxMenu.showSong(event, '${storeId}')"><svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M3 9.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/></svg></button>
                                    </div>
                                </div>`;
                            }).join('');
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
                                            <span class="bg-[var(--accent-color)] text-black p-3 rounded-full shadow-xl transform scale-75 group-hover:scale-100 transition"><svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>
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
            renderPlaylists: () => {
                const grid = document.getElementById('playlists-grid');
                if (!grid) return;
                const likedStyle = ui.getPlaylistStyle('Liked Songs');
                let html = `
                <div class="scroll-card glass-panel p-3 rounded-xl transition hover-pause group relative flex flex-col w-40 cursor-pointer" onclick="ui.openPlaylist('Liked Songs')">
                    <div class="relative aspect-square rounded-lg overflow-hidden mb-3 shadow-md flex items-center justify-center text-4xl ${likedStyle.bg}">
                        ${(likedStyle.customHtml || likedStyle.icon).replace('w-20 h-20', 'w-12 h-12')}
                        <div class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                            <span class="bg-[var(--accent-color)] text-black p-3 rounded-full shadow-xl transform scale-75 group-hover:scale-100 transition"><svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>
                        </div>
                    </div>
                    <button class="absolute top-4 right-4 p-1.5 bg-black/60 backdrop-blur-md rounded-full text-white opacity-100 md:opacity-0 md:group-hover:opacity-100 transition shadow-lg hover:bg-white/20 z-10" onclick="event.stopPropagation(); ctxMenu.showPlaylist(event, 'Liked Songs')">
                        <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M3 9.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/></svg>
                    </button>
                    <div class="w-full min-w-0 flex-1">
                        <div class="marquee-container w-full"><h3 class="font-bold text-white text-sm marquee-text">Liked Songs</h3></div>
                        <p class="text-xs text-gray-400 mt-1">${state.likedIds.length} tracks</p>
                    </div>
                </div>`;

                html += `
                <div class="scroll-card glass-panel p-3 rounded-xl transition hover-pause group relative flex flex-col w-40 cursor-pointer create-playlist-card" onclick="ui.toggleModal(true)">
                    <div class="relative aspect-square rounded-lg overflow-hidden mb-3 shadow-md flex items-center justify-center liked-songs-art bg-gradient-to-br from-cyan-500/35 via-cyan-950/45 to-zinc-950 border transition">
                        <div class="absolute inset-0" style="background: radial-gradient(circle at 30% 20%, rgba(255,255,255,0.28), transparent 34%);"></div>
                        <span class="relative w-14 h-14 rounded-full bg-[var(--accent-color)] text-black flex items-center justify-center shadow-xl shadow-cyan-500/25 group-hover:scale-110 transition">
                            <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/></svg>
                        </span>
                    </div>
                    <div class="w-full min-w-0 flex-1">
                        <div class="marquee-container w-full"><h3 class="font-bold text-white text-sm marquee-text">Create Playlist</h3></div>
                        <p class="text-xs text-gray-400 mt-1">New mix</p>
                    </div>
                </div>`;
                
                // Spotify Import Card
                html += `
                <div class="scroll-card glass-panel p-3 rounded-xl transition hover-pause group relative flex flex-col w-40 cursor-pointer" onclick="ui.toggleSpotifyModal(true)">
                    <div class="relative aspect-square rounded-lg overflow-hidden mb-3 shadow-md flex items-center justify-center bg-[#181818] border border-[#1DB954]/20 group-hover:border-[#1DB954]/50 transition">
                        <svg viewBox="0 0 24 24" width="48" height="48" fill="#1DB954" class="opacity-80 group-hover:opacity-100 group-hover:scale-110 transition"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.24 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.6.18-1.2.72-1.38 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.239.54-.959.72-1.56.3z"/></svg>
                    </div>
                    <div class="w-full min-w-0 flex-1">
                        <div class="marquee-container w-full"><h3 class="font-bold text-[#1DB954] text-sm marquee-text">Import Spotify</h3></div>
                        <p class="text-xs text-gray-400 mt-1">Connect Account</p>
                    </div>
                </div>`;

                Object.keys(state.playlists).forEach(name => {
                    const style = ui.getPlaylistStyle(name);
                    html += `
                    <div class="scroll-card glass-panel p-3 rounded-xl transition hover-pause group relative flex flex-col w-40 cursor-pointer" onclick="ui.openPlaylist('${utils.escapeJs(name)}')">
                        <div class="relative aspect-square rounded-lg overflow-hidden mb-3 shadow-md flex items-center justify-center text-4xl font-bold ${style.bg}">
                            ${style.customHtml || style.icon}
                            <div class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                                <span class="bg-[var(--accent-color)] text-black p-3 rounded-full shadow-xl transform scale-75 group-hover:scale-100 transition"><svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>
                            </div>
                        </div>
                        <button class="absolute top-4 right-4 p-1.5 bg-black/60 backdrop-blur-md rounded-full text-white opacity-100 md:opacity-0 md:group-hover:opacity-100 transition shadow-lg hover:bg-white/20 z-10" onclick="event.stopPropagation(); ctxMenu.showPlaylist(event, '${utils.escapeJs(name)}')">
                            <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M3 9.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/></svg>
                        </button>
                        <div class="w-full min-w-0 flex-1">
                            <div class="marquee-container w-full"><h3 class="font-bold text-white text-sm marquee-text">${utils.escapeHtml(name)}</h3></div>
                            <p class="text-xs text-gray-400 mt-1">${state.playlists[name].length} tracks</p>
                        </div>
                    </div>`;
                });
                grid.innerHTML = html;
                ui.renderLibraryLists();
                updateMarquees();
            },
            renderLibraryLists: () => {
                const librarySongs = document.getElementById('library-songs');
                const likedArtists = document.getElementById('library-liked-artists');
                const history = document.getElementById('library-history');
                if (librarySongs) {
                    const songs = state.libraryIds.map(item => typeof item === 'object' ? item : state.playHistory.find(song => song.id === item) || state.likedIds.find(item2 => (typeof item2 === 'object' ? item2.id : item2) === item)).filter(Boolean);
                    librarySongs.innerHTML = songs.length ? songs.map(song => ui.createListRow(song)).join('') : '<p class="text-sm text-gray-500">Add songs to your library from search or the song menu.</p>';
                }
                if (likedArtists) {
                    likedArtists.innerHTML = state.likedArtists.length ? state.likedArtists.map(artist => ui.createArtistCard(artist)).join('') : '<p class="text-sm text-gray-500 col-span-full">Like artists from search results to collect them here.</p>';
                }
                if (history) {
                    history.innerHTML = state.playHistory.length ? state.playHistory.map(song => ui.createListRow(song)).join('') : '<p class="text-sm text-gray-500">Played songs will appear here.</p>';
                }
                updateMarquees();
            },
            renderLibrary: () => {
                ui.renderPlaylists();
                ui.renderLibraryLists();
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
            createCard: (item) => {
                const storeId = songStore.add(item);
                const isContext = item.type === 'album' || item.type === 'artist';
                const clickHandler = item.type === 'album' ? `ui.openAlbum('${utils.escapeJs(item.id)}')` : (isContext ? `playContext('${item.type}', '${utils.escapeJs(item.id)}')` : `playSongById('${storeId}')`);
                const dblClickHandler = isContext ? "" : `ondblclick="player.likeSong('${utils.escapeJs(item.id)}')"`;
                const artistLiked = item.type === 'artist' && state.likedArtists.some(artist => (artist.id || artist.name) === item.id);
                const menuBtn = item.type === 'artist' ? `
                    <button class="absolute top-4 right-4 p-1.5 ${artistLiked ? 'bg-red-500 text-white' : 'bg-black/60 text-white'} backdrop-blur-md rounded-full opacity-100 md:opacity-0 md:group-hover:opacity-100 transition shadow-lg hover:bg-red-500 z-10" onclick="event.stopPropagation(); ui.toggleArtistLike({ id: '${utils.escapeJs(item.id)}', name: '${utils.escapeJs(item.name)}', artist: '${utils.escapeJs(item.artist || 'Artist')}', img: '${utils.escapeJs(item.img || FALLBACK_ART)}', type: 'artist' })" title="${artistLiked ? 'Unlike artist' : 'Like artist'}">
                        <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                    </button>` : (isContext ? "" : `
                    <button class="absolute top-4 right-4 p-1.5 bg-black/60 backdrop-blur-md rounded-full text-white opacity-100 md:opacity-0 md:group-hover:opacity-100 transition shadow-lg hover:bg-white/20 z-10" onclick="event.stopPropagation(); ctxMenu.showSong(event, '${storeId}')">
                        <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M3 9.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/></svg>
                    </button>`);

                return `
                <div class="scroll-card glass-panel p-3 rounded-xl transition hover-pause group relative flex flex-col w-40" ${dblClickHandler}>
                    <div class="relative aspect-square rounded-lg overflow-hidden mb-3 bg-gray-800 shadow-md cursor-pointer" onclick="${clickHandler}">
                        <img src="${item.img}" onerror="this.src='${FALLBACK_ART}'" class="w-full h-full object-cover group-hover:scale-105 transition duration-500" decoding="async">
                        <div class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                            <span class="bg-[var(--accent-color)] text-black p-3 rounded-full shadow-xl transform scale-75 group-hover:scale-100 transition"><svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>
                        </div>
                    </div>
                    ${menuBtn}
                    <div class="w-full min-w-0 flex-1">
                        <div class="marquee-container w-full"><h3 class="font-bold text-white text-sm marquee-text">${utils.escapeHtml(item.name)}</h3></div>
                        <div class="marquee-container w-full mt-1"><p class="text-xs text-gray-400 marquee-text">${utils.escapeHtml(item.artist)}</p></div>
                    </div>
                </div>`;
            },
            createSongPillInner: (song) => {
                const isCurrent = state.currentTrack && state.currentTrack.id === song.id;
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
                        <div class="marquee-container w-full flex items-center gap-1.5"><div class="font-bold text-white text-sm marquee-text">${utils.escapeHtml(song.name)}</div>${isCurrent ? eqMarkup : ''}</div>
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
                const safeSection = utils.escapeHtml(section);
                return `
                <div class="queue-reorder-row swipe-song relative overflow-hidden rounded-2xl mb-2 group select-none" draggable="true" data-queue-section="${safeSection}" data-queue-index="${index}" data-store-id="${storeId}">
                    <div class="swipe-reveal-left absolute inset-y-0 left-0 flex items-center px-4 pointer-events-none rounded-2xl z-0 bg-emerald-600/90 text-black font-bold text-xs" style="width:0; opacity:0;">
                        <svg class="swipe-icon w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg>
                        <span class="swipe-label ml-2 whitespace-nowrap font-bold text-xs tracking-wide opacity-0">Play Next</span>
                    </div>
                    <div class="swipe-reveal-right absolute inset-y-0 right-0 flex items-center justify-end px-4 pointer-events-none rounded-2xl z-0 bg-cyan-600/90 text-black font-bold text-xs" style="width:0; opacity:0;">
                        <span class="swipe-label mr-2 whitespace-nowrap font-bold text-xs tracking-wide opacity-0">Add to Queue</span>
                        <svg class="swipe-icon w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 10h16M4 14h10m-10 4h6"/></svg>
                    </div>
                    <div class="swipe-song-card glass-panel rounded-2xl p-2 pr-2 flex items-center shadow-2xl w-full border border-white/10 transition-colors bg-[#121212]/95 cursor-pointer relative z-10" onclick="playSongById('${storeId}')" ondblclick="player.likeSong('${utils.escapeJs(song.id)}')">
                        ${ui.createSongPillInner(song)}
                        <button class="queue-drag-handle" title="Drag to rearrange" aria-label="Rearrange ${utils.escapeHtml(song.name)}" onclick="event.stopPropagation()" type="button">
                            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M9 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm10 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM9 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm10 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM9 19a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm10 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z"/></svg>
                        </button>
                    </div>
                </div>`;
            },
            createSongPill: (song, clickHandlerStr, context = 'queue') => {
                const storeId = songStore.add(song);
                const hoverBtnVis = context === 'quicksearch' ? 'opacity-100' : 'opacity-100 md:opacity-0 group-hover:opacity-100';
                const timeBadge = song.playedAt ? `<span class="text-[10px] text-gray-400 font-mono px-2 py-0.5 rounded-md bg-white/5 flex-shrink-0 mr-1.5">${ui.formatRelativeTime(song.playedAt)}</span>` : '';

                return `
                <div class="swipe-song relative overflow-hidden rounded-2xl mb-2 group select-none" data-store-id="${storeId}">
                    <div class="swipe-reveal-left absolute inset-y-0 left-0 flex items-center px-4 pointer-events-none rounded-2xl z-0 bg-emerald-600/90 text-black font-bold text-xs" style="width:0; opacity:0;">
                        <svg class="swipe-icon w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg>
                        <span class="swipe-label ml-2 whitespace-nowrap font-bold text-xs tracking-wide opacity-0">Play Next</span>
                    </div>
                    <div class="swipe-reveal-right absolute inset-y-0 right-0 flex items-center justify-end px-4 pointer-events-none rounded-2xl z-0 bg-cyan-600/90 text-black font-bold text-xs" style="width:0; opacity:0;">
                        <span class="swipe-label mr-2 whitespace-nowrap font-bold text-xs tracking-wide opacity-0">Add to Queue</span>
                        <svg class="swipe-icon w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 10h16M4 14h10m-10 4h6"/></svg>
                    </div>
                    <div class="swipe-song-card glass-panel rounded-2xl p-2 pr-4 flex items-center shadow-2xl w-full border border-white/10 transition-colors bg-[#121212]/95 hover-pause cursor-pointer relative z-10" onclick="${clickHandlerStr}" ondblclick="player.likeSong('${utils.escapeJs(song.id)}')">
                        ${ui.createSongPillInner(song)}
                        ${timeBadge}
                        <div class="flex items-center ${hoverBtnVis} transition-opacity duration-200 mr-1">
                            <button class="p-1.5 text-gray-400 hover:text-white rounded-full hover:bg-white/10 transition hidden md:flex" title="Play Next" onclick="event.stopPropagation(); player.addNext(songStore.get('${storeId}'))"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg></button>
                            <button class="p-1.5 text-gray-400 hover:text-white rounded-full hover:bg-white/10 transition hidden md:flex" title="Add to Queue" onclick="event.stopPropagation(); player.addToQueue(songStore.get('${storeId}'))"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h10m-10 4h6"/></svg></button>
                        </div>
                    </div>
                </div>`;
            },
            createListRow: (song, contextPlaylistName = null) => {
                const storeId = songStore.add(song);
                const removeBtnHtml = contextPlaylistName ? `<button class="p-2 text-red-400 hover:text-red-500 rounded-full hover:bg-red-500/10 hidden md:block" title="Remove" onclick="event.stopPropagation(); ui.removeSongFromPlaylist('${utils.escapeJs(contextPlaylistName)}', '${utils.escapeJs(song.id)}')"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>` : '';
                
                return `
                <div class="swipe-song relative overflow-hidden rounded-xl mb-1.5 group select-none" data-store-id="${storeId}">
                    <div class="swipe-reveal-left absolute inset-y-0 left-0 flex items-center px-4 pointer-events-none rounded-xl z-0 bg-emerald-600/90 text-black font-bold text-xs" style="width:0; opacity:0;">
                        <svg class="swipe-icon w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg>
                        <span class="swipe-label ml-2 whitespace-nowrap font-bold text-xs tracking-wide opacity-0">Play Next</span>
                    </div>
                    <div class="swipe-reveal-right absolute inset-y-0 right-0 flex items-center justify-end px-4 pointer-events-none rounded-xl z-0 bg-cyan-600/90 text-black font-bold text-xs" style="width:0; opacity:0;">
                        <span class="swipe-label mr-2 whitespace-nowrap font-bold text-xs tracking-wide opacity-0">Add to Queue</span>
                        <svg class="swipe-icon w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 10h16M4 14h10m-10 4h6"/></svg>
                    </div>
                    <div class="swipe-song-card group flex items-center gap-4 p-2 rounded-xl glass-panel hover:bg-white/10 transition hover-pause relative z-10 w-full bg-[#121212]/95 border border-white/10" ondblclick="player.likeSong('${utils.escapeJs(song.id)}')">
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
                return `
                <div class="for-you-card glass-panel rounded-3xl overflow-hidden relative flex-shrink-0 w-64 h-80 group cursor-pointer hover-pause" onclick="playSongById('${storeId}')">
                    <img src="${song.img}" class="absolute inset-0 w-full h-full object-cover transition duration-700 group-hover:scale-110" decoding="async">
                    <div class="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-transparent"></div>
                    <button class="absolute top-4 right-4 w-10 h-10 rounded-full bg-[var(--accent-color)] text-black flex items-center justify-center shadow-xl opacity-95 group-hover:scale-110 transition" onclick="event.stopPropagation(); playSongById('${storeId}')">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    </button>
                    <div class="absolute bottom-0 left-0 right-0 p-5">
                        <div class="inline-flex px-2 py-1 rounded-full bg-white/10 text-[10px] uppercase tracking-wider text-[var(--accent-color)] mb-3">For You</div>
                        <div class="marquee-container"><h3 class="text-xl font-black text-white marquee-text">${utils.escapeHtml(song.name)}</h3></div>
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
                <div class="discover-card glass-panel rounded-3xl overflow-hidden relative flex-shrink-0 w-64 h-80 group cursor-pointer hover-pause ${mix.gradientBg || 'bg-gradient-to-br from-cyan-600 to-indigo-900'}" onclick="homeView.openDiscoverMix('${mix.key}')">
                    <div class="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.2),transparent_70%)] pointer-events-none"></div>
                    <div class="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent pointer-events-none"></div>
                    
                    ${collageHtml}
                    
                    <button class="absolute bottom-5 right-5 w-12 h-12 rounded-full bg-[var(--accent-color)] text-black flex items-center justify-center shadow-2xl opacity-90 group-hover:scale-110 transition z-30" onclick="event.stopPropagation(); homeView.playDiscoverMix('${mix.key}')">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    </button>
                    
                    <div class="absolute bottom-0 left-0 right-16 p-5 z-20 pointer-events-none">
                        <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-[10px] font-extrabold tracking-wider uppercase text-[var(--accent-color)] mb-2 shadow-lg">
                            <span class="w-1.5 h-1.5 rounded-full bg-[var(--accent-color)] animate-pulse"></span>
                            ${utils.escapeHtml(mix.badgeText || 'MADE FOR YOU')}
                        </div>
                        <div class="marquee-container"><h3 class="text-xl font-black text-white marquee-text tracking-tight drop-shadow-md">${utils.escapeHtml(mix.title)}</h3></div>
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
                return `<div class="w-full h-full ${mix.gradientBg || 'bg-gradient-to-br from-cyan-600 to-indigo-950'} relative flex items-center justify-center overflow-hidden">
                    <div class="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.25),transparent_75%)] pointer-events-none"></div>
                    <div class="absolute inset-0 bg-black/30 backdrop-blur-[2px]"></div>
                    <div class="relative z-10 w-full h-full p-4 flex flex-col justify-between">
                        <div class="text-[10px] font-extrabold uppercase tracking-widest text-[var(--accent-color)] bg-black/50 backdrop-blur-md px-2.5 py-1 rounded-full w-max border border-white/10 shadow-lg">${utils.escapeHtml(mix.badgeText || 'D\'TUNES MIX')}</div>
                        <div class="w-28 h-28 mx-auto rounded-2xl overflow-hidden shadow-2xl border border-white/20">${inner}</div>
                        <div class="text-center font-black text-white text-base tracking-tight truncate drop-shadow-md">${utils.escapeHtml(mix.title)}</div>
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
                    artEl.innerHTML = '<div class="w-full h-full bg-gradient-to-br from-[var(--accent-color)] to-cyan-950 flex items-center justify-center"><svg class="w-20 h-20 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>';
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
                    title.textContent = state.currentTrack.name || 'Loading track';
                    artist.textContent = activeLoading ? `Loading • ${state.currentTrack.artist || 'Preparing audio'}` : (state.currentTrack.artist || 'Unknown Artist');
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
                document.getElementById('p-title').textContent = track.name; 
                document.getElementById('p-artist').textContent = options.loading ? `Loading • ${track.artist || 'Preparing audio'}` : track.artist;
                const safeArt = sanitizeImageUrl(track.img);
                const artImg = document.getElementById('curr-art-img');
                if (artImg) {
                    artImg.crossOrigin = 'anonymous';
                    artImg.src = safeArt;
                    artImg.onload = () => applyDynamicTrackTheme(artImg);
                    if (artImg.complete && artImg.naturalWidth > 0) applyDynamicTrackTheme(artImg);
                }
                ui.setPlayerLoading(!!options.loading);
                const likeBtn = document.getElementById('p-like-btn');
                const isLiked = state.likedIds.some(item => (typeof item === 'string' ? item === track.id : item.id === track.id));
                likeBtn.className = isLiked ? 'text-red-500 transition flex-shrink-0 ml-2' : 'text-gray-400 hover:text-red-500 transition flex-shrink-0 ml-2';

                if ('mediaSession' in navigator) {
                    navigator.mediaSession.metadata = new MediaMetadata({
                        title: track.name || track.title || 'Unknown Track',
                        artist: options.loading ? `Loading • ${track.artist || ''}` : (track.artist || 'Unknown Artist'),
                        album: track.album || 'D\'Tunes',
                        artwork: [
                            { src: safeArt, sizes: '96x96', type: 'image/jpeg' },
                            { src: safeArt, sizes: '128x128', type: 'image/jpeg' },
                            { src: safeArt, sizes: '192x192', type: 'image/jpeg' },
                            { src: safeArt, sizes: '256x256', type: 'image/jpeg' },
                            { src: safeArt, sizes: '384x384', type: 'image/jpeg' },
                            { src: safeArt, sizes: '512x512', type: 'image/jpeg' }
                        ]
                    });
                    const safeSetHandler = (action, handler) => {
                        try { navigator.mediaSession.setActionHandler(action, handler); } catch (e) {}
                    };
                    safeSetHandler('play', requestPlay);
                    safeSetHandler('pause', requestPause);
                    safeSetHandler('previoustrack', player.prev);
                    safeSetHandler('nexttrack', () => player.next(true));
                    safeSetHandler('seekbackward', (details) => { audio.currentTime = Math.max(audio.currentTime - (details.seekOffset || 10), 0); updateMediaPosition(); });
                    safeSetHandler('seekforward', (details) => { audio.currentTime = Math.min(audio.currentTime + (details.seekOffset || 10), audio.duration || 0); updateMediaPosition(); });
                    safeSetHandler('seekto', (details) => {
                        if (!details || !Number.isFinite(details.seekTime)) return;
                        audio.currentTime = Math.max(0, Math.min(details.seekTime, audio.duration || details.seekTime)); updateMediaPosition();
                    });
                }
                
                const mPlayBtn = document.getElementById('m-icon-play');
                const mPauseBtn = document.getElementById('m-icon-pause');
                if(mPlayBtn && mPauseBtn) {
                    mPlayBtn.className = state.playing ? 'hidden' : 'flex';
                    mPauseBtn.className = state.playing ? 'flex' : 'hidden';
                }
                updateMarquees();
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
                document.body.dataset.mobileTab = tab;
                document.querySelectorAll('.mobile-tab-btn').forEach(btn => {
                    const isCurrent = btn.id === `m-tab-${tab}`;
                    btn.classList.toggle('active', isCurrent);
                    btn.classList.toggle('text-white', isCurrent);
                    btn.classList.toggle('text-gray-400', !isCurrent);
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
                const playIcon = document.getElementById('icon-play');
                const pauseIcon = document.getElementById('icon-pause');
                if (playIcon) playIcon.className = playing ? 'hidden' : 'flex ml-1';
                if (pauseIcon) pauseIcon.className = playing ? 'flex' : 'hidden';
                const mPlayBtn = document.getElementById('m-icon-play');
                const mPauseBtn = document.getElementById('m-icon-pause');
                if (mPlayBtn && mPauseBtn) {
                    mPlayBtn.className = playing ? 'hidden' : 'flex';
                    mPauseBtn.className = playing ? 'flex' : 'hidden';
                }
            },
            toggleQueue: () => {
                state.queueExpanded = !state.queueExpanded;
                const wrap = document.getElementById('queue-wrapper');
                if (state.queueExpanded) {
                    wrap.classList.add('queue-expanded');
                    ui.switchQueueTab(state.activeQueueTab);
                } else {
                    wrap.classList.remove('queue-expanded');
                }
                document.querySelector('.mobile-queue-btn')?.classList.toggle('queue-open', state.queueExpanded);
            },
            switchQueueTab: (tab) => {
                state.activeQueueTab = tab;
                const isUpNext = tab === 'upnext';
                const tabUpNext = document.getElementById('tab-upnext');
                const tabHist = document.getElementById('tab-history');
                const qList = document.getElementById('queue-list');
                const hList = document.getElementById('history-list');
                const clearQ = document.getElementById('btn-clear-queue');
                const autoQ = document.getElementById('btn-queue-autoplay');
                const clearH = document.getElementById('btn-clear-history');

                if (tabUpNext) tabUpNext.className = isUpNext ? "text-xs font-bold uppercase tracking-wider text-white" : "text-xs font-bold uppercase tracking-wider text-gray-500 hover:text-gray-300";
                if (tabHist) tabHist.className = isUpNext ? "text-xs font-bold uppercase tracking-wider text-gray-500 hover:text-gray-300" : "text-xs font-bold uppercase tracking-wider text-white";
                if (qList) qList.classList.toggle('hidden', !isUpNext);
                if (hList) hList.classList.toggle('hidden', isUpNext);
                if (clearQ) clearQ.classList.toggle('hidden', !isUpNext);
                if (autoQ) autoQ.classList.toggle('hidden', !isUpNext);
                if (clearH) clearH.classList.toggle('hidden', isUpNext);
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
                    clearBtn.textContent = manualCount > 0 ? `Clear Queue (${manualCount})` : 'Clear Queue';
                }
                const totalQueueCount = manualCount + autoCount;
                const badge = document.getElementById('queue-badge-count');
                if (badge) {
                    badge.textContent = manualCount > 0 ? String(manualCount) : String(totalQueueCount);
                    badge.classList.toggle('hidden', totalQueueCount === 0);
                }
                let html = '';
                if (state.userQueue.length > 0) {
                    html += `<div class="text-[10px] text-white font-bold uppercase tracking-wider mb-1 pl-2 mt-1 drop-shadow-md">Queue</div>`;
                    html += state.userQueue.map((song, index) => ui.createQueuePill(song, 'manual', index)).join('');
                }
                const upcoming = state.shuffle 
                    ? state.shuffledOrder.slice(state.shufflePointer + 1, state.shufflePointer + 11).map(i => state.queue[i]).filter(Boolean)
                    : state.queue.slice(state.idx + 1, state.idx + 11);
                if (upcoming.length > 0) {
                    html += `<div class="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1 pl-2 mt-3 drop-shadow-md">Autoplay</div>`;
                    html += upcoming.map((song, index) => ui.createQueuePill(song, 'auto', index)).join('');
                }
                listEl.innerHTML = html === '' ? '<div class="text-xs text-gray-500 p-3 rounded-xl border border-white/5 bg-white/5">Queue is empty. Add songs and they will appear here instantly.</div>' : html;
                updateMarquees();
            },
            renderHistory: () => {
                const histEl = document.getElementById('history-list');
                if(state.playHistory.length <= 1) {
                    histEl.innerHTML = '<div class="text-xs text-gray-500 p-2">No history yet</div>'; return;
                }
                
                // Group by relative date label
                const groups = {};
                state.playHistory.slice(1).forEach(song => {
                    const label = utils.getRelativeDateLabel(song.playedAt);
                    if (!groups[label]) groups[label] = [];
                    groups[label].push(song);
                });
                
                let html = '';
                for (const [label, songs] of Object.entries(groups)) {
                    html += `<div class="text-[10px] text-[var(--accent-color)] font-extrabold uppercase tracking-wider mt-4 mb-2 pl-2 border-l-2 border-[var(--accent-color)]">${utils.escapeHtml(label)}</div>`;
                    html += songs.map(song => ui.createSongPill(song, `playSongById('${songStore.add(song)}')`)).join('');
                }
                
                histEl.innerHTML = html;
                updateMarquees();
            }
        };

