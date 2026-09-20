        // ============================================
        // STATE & PERSISTENCE
        // ============================================
        const EQ_BANDS = [
            { key: 'eq32', label: '32Hz', subLabel: 'Sub-Bass', frequency: 32, type: 'lowshelf', q: 0.707 },
            { key: 'eq64', label: '64Hz', subLabel: 'Punch', frequency: 64, type: 'peaking', q: 1.414 },
            { key: 'eq125', label: '125Hz', subLabel: 'Warmth', frequency: 125, type: 'peaking', q: 1.414 },
            { key: 'eq250', label: '250Hz', subLabel: 'Body', frequency: 250, type: 'peaking', q: 1.414 },
            { key: 'eq500', label: '500Hz', subLabel: 'Mid', frequency: 500, type: 'peaking', q: 1.414 },
            { key: 'eq1k', label: '1kHz', subLabel: 'Vocal', frequency: 1000, type: 'peaking', q: 1.414 },
            { key: 'eq2k', label: '2kHz', subLabel: 'Presence', frequency: 2000, type: 'peaking', q: 1.414 },
            { key: 'eq4k', label: '4kHz', subLabel: 'Detail', frequency: 4000, type: 'peaking', q: 1.414 },
            { key: 'eq8k', label: '8kHz', subLabel: 'Brilliance', frequency: 8000, type: 'peaking', q: 1.414 },
            { key: 'eq16k', label: '16kHz', subLabel: 'Air', frequency: 16000, type: 'highshelf', q: 0.707 }
        ];
        const EQ_PRESETS = {
            flat: {
                id: 'flat',
                name: 'Flat',
                icon: '⚖️',
                desc: 'True studio master reproduction',
                values: { eq32: 0, eq64: 0, eq125: 0, eq250: 0, eq500: 0, eq1k: 0, eq2k: 0, eq4k: 0, eq8k: 0, eq16k: 0 }
            },
            bass_boost: {
                id: 'bass_boost',
                name: 'Bass Boost',
                icon: '🔊',
                desc: 'Deep sub-bass & punchy kick with zero crackle',
                values: { eq32: 6, eq64: 5, eq125: 3, eq250: 1, eq500: 0, eq1k: 0, eq2k: 1, eq4k: 2, eq8k: 2, eq16k: 1 }
            },
            sub_heavy: {
                id: 'sub_heavy',
                name: 'Sub-Bass Max',
                icon: '💥',
                desc: 'Massive low-end rumble for heavy 808s and EDM',
                values: { eq32: 8, eq64: 7, eq125: 4, eq250: 1, eq500: -1, eq1k: 0, eq2k: 1, eq4k: 2, eq8k: 3, eq16k: 2 }
            },
            vocal: {
                id: 'vocal',
                name: 'Vocal Clarity',
                icon: '🎙️',
                desc: 'Crisp upfront voices and reduced low-end muddiness',
                values: { eq32: -3, eq64: -2, eq125: 0, eq250: 2, eq500: 4, eq1k: 5, eq2k: 4, eq4k: 3, eq8k: 2, eq16k: 1 }
            },
            hiphop: {
                id: 'hiphop',
                name: 'Hip-Hop / R&B',
                icon: '🎧',
                desc: 'Deep 808 weight with snappy punch and crisp hi-hats',
                values: { eq32: 7, eq64: 6, eq125: 3, eq250: 0, eq500: -1, eq1k: 1, eq2k: 2, eq4k: 3, eq8k: 4, eq16k: 3 }
            },
            electronic: {
                id: 'electronic',
                name: 'Electronic / EDM',
                icon: '⚡',
                desc: 'Driving bass foundation with wide, energized synth presence',
                values: { eq32: 6, eq64: 5, eq125: 2, eq250: -1, eq500: 0, eq1k: 1, eq2k: 3, eq4k: 4, eq8k: 5, eq16k: 4 }
            },
            rock: {
                id: 'rock',
                name: 'Rock & Metal',
                icon: '🎸',
                desc: 'Punchy kick, scooped boxiness, and roaring guitars',
                values: { eq32: 5, eq64: 4, eq125: 2, eq250: -1, eq500: -2, eq1k: 1, eq2k: 3, eq4k: 5, eq8k: 5, eq16k: 4 }
            },
            pop: {
                id: 'pop',
                name: 'Pop / Modern',
                icon: '✨',
                desc: 'Radio-ready balance with tight bass and shimmering highs',
                values: { eq32: 4, eq64: 3, eq125: 2, eq250: 0, eq500: 1, eq1k: 2, eq2k: 3, eq4k: 4, eq8k: 4, eq16k: 3 }
            },
            late_night: {
                id: 'late_night',
                name: 'Late Night',
                icon: '🌙',
                desc: 'Warm, fatigue-free audio for smooth evening listening',
                values: { eq32: 3, eq64: 3, eq125: 2, eq250: 1, eq500: 0, eq1k: -1, eq2k: -2, eq4k: -3, eq8k: -4, eq16k: -5 }
            },
            treble: {
                id: 'treble',
                name: 'Treble & Air',
                icon: '🪶',
                desc: 'Enhanced brilliance, acoustic strings, and sparkle',
                values: { eq32: -2, eq64: -1, eq125: 0, eq250: 0, eq500: 1, eq1k: 2, eq2k: 4, eq4k: 6, eq8k: 7, eq16k: 8 }
            }
        };
        const FLAT_EQUALIZER = Object.fromEntries(EQ_BANDS.map((band) => [band.key, 0]));
        const getCurrentPresetId = (eqMap = state.equalizer) => {
            for (const [key, preset] of Object.entries(EQ_PRESETS)) {
                const matches = EQ_BANDS.every(band => Number(eqMap[band.key] || 0) === Number(preset.values[band.key] || 0));
                if (matches) return key;
            }
            return 'custom';
        };
        const normalizeEqualizerSettings = (stored = {}) => {
            const normalized = { ...FLAT_EQUALIZER };
            EQ_BANDS.forEach((band) => {
                if (Number.isFinite(Number(stored[band.key]))) normalized[band.key] = Number(stored[band.key]);
            });
            if (Number.isFinite(Number(stored.bass))) {
                normalized.eq32 = normalized.eq64 = normalized.eq125 = Number(stored.bass);
            }
            if (Number.isFinite(Number(stored.mid))) {
                normalized.eq500 = normalized.eq1k = normalized.eq2k = Number(stored.mid);
            }
            if (Number.isFinite(Number(stored.treble))) {
                normalized.eq4k = normalized.eq8k = normalized.eq16k = Number(stored.treble);
            }
            return normalized;
        };

        const safeStorage = {
            get: (key, fallback = null) => {
                try {
                    const v = localStorage.getItem(key);
                    return v !== null && v !== undefined ? v : fallback;
                } catch (_) {
                    return fallback;
                }
            },
            getJSON: (key, fallback = null) => {
                try {
                    const v = localStorage.getItem(key);
                    return v ? JSON.parse(v) : fallback;
                } catch (_) {
                    return fallback;
                }
            },
            set: (key, val) => {
                try { localStorage.setItem(key, typeof val === 'string' ? val : JSON.stringify(val)); } catch (_) {}
            },
            remove: (key) => {
                try { localStorage.removeItem(key); } catch (_) {}
            }
        };

        const state = { 
            queue: [], userQueue: [], idx: -1, playing: false, loading: false, loaded: false,
            shuffle: safeStorage.get('playShuffle') === 'true',
            repeat: parseInt(safeStorage.get('playRepeat', '0'), 10) || 0,
            shuffledOrder: [], shufflePointer: 0, _audioRetryCount: 0,
            currentTrack: null,
            likedIds: safeStorage.getJSON('likedIds', []),
            dislikedSongs: safeStorage.getJSON('dislikedSongs', []),
            libraryIds: safeStorage.getJSON('libraryIds', []),
            likedArtists: safeStorage.getJSON('likedArtists', []),
            playHistory: safeStorage.getJSON('playHistory', []),
            searchHistory: safeStorage.getJSON('searchHistory', safeStorage.getJSON('recentSearches', [])),
            artistPlayCounts: safeStorage.getJSON('artistPlayCounts', {}),
            playlists: safeStorage.getJSON('playlists', {}),
            playlistStyles: safeStorage.getJSON('playlistStyles', {}),
            username: safeStorage.get('username', 'Guest User'),
            avatarUrl: safeStorage.get('avatarUrl', ''),
            quality: safeStorage.get('audioQuality', 'high'),
            equalizer: normalizeEqualizerSettings(safeStorage.getJSON('equalizerSettings', {})),
            forYouSongs: [],
            quickPicks: [],
            discoverMixes: {},
            searchDebounce: null, hoverProgress: -1, lastHoverProgress: 0.5, isDragging: false, 
            upNextTriggered: false, queueExpanded: false, activeQueueTab: 'upnext', mobileSearchOriginView: null, mobileQueueAutoOpened: false, nextTrackPreloadId: null,
            wasPlayingBeforeHidden: false, userPaused: false
        };
        window.state = state;

        const deviceMode = {
            detectMobileBrowser: () => {
                if (typeof window.__dtunesDetectMobileBrowser === 'function') {
                    return window.__dtunesDetectMobileBrowser();
                }
                const ua = navigator.userAgent || '';
                const hasTouch = (navigator.maxTouchPoints || 0) > 0;
                const desktopRequestUA = (
                    /(Windows NT|X11; Linux x86_64|CrOS)/i.test(ua) ||
                    (/(Macintosh)/i.test(ua) && !hasTouch)
                ) && !/(Android|iPhone|iPad|iPod)/i.test(ua);
                const uaDataMobile = !!(navigator.userAgentData && navigator.userAgentData.mobile);
                const hasMobileToken = /(android|iphone|ipod|ipad|iemobile|opera mini|mobile|blackberry|windows phone)/i.test(ua);
                const coarsePointer = !!(window.matchMedia && (window.matchMedia('(any-pointer: coarse)').matches || window.matchMedia('(pointer: coarse)').matches));
                const noHover = !!(window.matchMedia && window.matchMedia('(any-hover: none)').matches);
                const shortestViewport = Math.min(window.innerWidth || 0, window.innerHeight || 0);
                const shortestScreen = Math.min(window.screen?.width || shortestViewport, window.screen?.height || shortestViewport);
                const likelyHandheld = hasTouch && (coarsePointer || noHover) && (shortestViewport <= 1024 || shortestScreen <= 1366);
                if (uaDataMobile) return true;
                if (desktopRequestUA) return false;
                if (hasMobileToken) return true;
                if (likelyHandheld) return true;
                return false;
            },

            resolveMode: () => {
                return deviceMode.detectMobileBrowser() ? 'mobile' : 'desktop';
            },

            isMobileUI: () => document.documentElement.getAttribute('data-ui-mode') === 'mobile',

            apply: () => {
                const resolvedMode = deviceMode.resolveMode();

                document.documentElement.setAttribute('data-ui-mode', resolvedMode);
                document.documentElement.setAttribute('data-ui-preference', 'browser');
                document.documentElement.setAttribute('data-ui-detected-mobile', deviceMode.detectMobileBrowser() ? '1' : '0');

                if (resolvedMode !== 'mobile') {
                    document.body.classList.remove('mobile-player-open');
                    document.body.classList.remove('mobile-search-open');
                    document.documentElement.style.setProperty('--mobile-keyboard-offset', '0px');
                }

                if (typeof ui !== 'undefined' && typeof ui.setMobileNavActive === 'function') {
                    ui.setMobileNavActive(typeof ui.getCurrentView === 'function' ? ui.getCurrentView() : 'home');
                }
                if (typeof ui !== 'undefined' && typeof ui.updateMobileSearchPosition === 'function') {
                    ui.updateMobileSearchPosition();
                }
            }
        };


        const stripTouchHoverClasses = () => {
            if (!deviceMode.isMobileUI()) return;
            document.querySelectorAll('[class*="hover:"], [class*="group-hover:"]').forEach((el) => {
                const kept = String(el.className)
                    .split(/\s+/)
                    .filter(Boolean)
                    .filter(cls => !cls.includes('hover:') && !cls.includes('group-hover:'));
                el.className = kept.join(' ');
            });
        };

        window.__stripTouchHoverClasses = stripTouchHoverClasses;

        const haptics = {
            presets: {
                success: [{ duration: 30, intensity: 0.5 }, { delay: 60, duration: 40, intensity: 1 }],
                warning: [{ duration: 40, intensity: 0.8 }, { delay: 100, duration: 40, intensity: 0.6 }],
                error: [{ duration: 40, intensity: 0.7 }, { delay: 40, duration: 40, intensity: 0.7 }, { delay: 40, duration: 40, intensity: 0.9 }, { delay: 40, duration: 50, intensity: 0.6 }],
                light: [{ duration: 15, intensity: 0.4 }],
                medium: [{ duration: 25, intensity: 0.7 }],
                heavy: [{ duration: 35, intensity: 1 }],
                soft: [{ duration: 40, intensity: 0.5 }],
                rigid: [{ duration: 10, intensity: 1 }],
                selection: [{ duration: 8, intensity: 0.3 }],
                nudge: [{ duration: 80, intensity: 0.8 }, { delay: 80, duration: 50, intensity: 0.3 }],
                buzz: [{ duration: 1000, intensity: 1 }]
            },
            lastPulseAt: 0,
            minPulseGapMs: 30,

            canVibrate: () => {
                if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false;
                if (document.visibilityState !== 'visible') return false;
                if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
                return true;
            },

            resolvePattern: (presetOrPattern) => {
                if (Array.isArray(presetOrPattern)) return presetOrPattern;
                return haptics.presets[presetOrPattern] || haptics.presets.selection;
            },

            toVibrationSequence: (pattern, intensity = 1) => {
                const safeIntensity = Math.max(0.2, Math.min(1, intensity));
                const sequence = [];
                pattern.forEach((step) => {
                    const delay = Number.isFinite(step.delay) ? Math.max(0, Math.round(step.delay)) : 0;
                    const rawDuration = Number.isFinite(step.duration) ? Math.max(1, Math.min(1000, step.duration)) : 0;
                    const stepIntensity = Number.isFinite(step.intensity) ? Math.max(0.1, Math.min(1, step.intensity)) : 1;
                    const duration = Math.max(1, Math.round(rawDuration * stepIntensity * safeIntensity));
                    if (delay > 0) sequence.push(delay);
                    if (duration > 0) sequence.push(duration);
                });
                return sequence.length > 0 ? sequence : [8];
            },

            trigger: (preset = 'selection', options = {}) => {
                if (!haptics.canVibrate()) return;

                const now = Date.now();
                if (now - haptics.lastPulseAt < haptics.minPulseGapMs) return;
                haptics.lastPulseAt = now;

                const pattern = haptics.resolvePattern(preset);
                const sequence = haptics.toVibrationSequence(pattern, Number.isFinite(options.intensity) ? options.intensity : 1);

                try { navigator.vibrate(sequence); } catch (e) {}
            },

            pulse: (pattern = 'tap') => {
                const legacyMap = {
                    tap: 'selection',
                    soft: 'light',
                    medium: 'medium',
                    strong: 'heavy'
                };
                haptics.trigger(legacyMap[pattern] || pattern);
            }
        };

        const songStore = {
            songs: new Map(), counter: 0,
            add: (song) => { const id = `song_${songStore.counter++}`; songStore.songs.set(id, song); return id; },
            get: (id) => songStore.songs.get(id)
        };

        const persist = {
            snapshot: () => {
                if(!state.currentTrack) return null;
                return {
                    track: state.currentTrack,
                    q: state.queue,
                    uq: state.userQueue,
                    idx: state.idx,
                    time: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
                    duration: Number.isFinite(audio.duration) ? audio.duration : null,
                    playing: Boolean(state.playing),
                    updated_at: new Date().toISOString()
                };
            },
            apply: (data) => {
                if(!data || !data.track) return false;
                state.currentTrack = data.track; state.queue = data.q || []; state.userQueue = data.uq || []; state.idx = data.idx || 0;
                state.loaded = true;

                document.getElementById('player-footer').classList.remove('translate-y-[150%]', 'opacity-0');
                ui.enableControls(); ui.updateMetadata(state.currentTrack); ui.renderQueue(); ui.renderHistory();

                audio.src = state.currentTrack.url;
                audio.addEventListener('loadedmetadata', function onMetaLoad() {
                    audio.currentTime = data.time || 0; currentProgress = audio.duration ? audio.currentTime / audio.duration : 0;
                    document.getElementById('seek-bar').value = data.time || 0; audio.removeEventListener('loadedmetadata', onMetaLoad);
                });
                return true;
            },
            save: () => {
                const data = persist.snapshot();
                if(!data) return;
                localStorage.setItem('playbackState', JSON.stringify(data));
                window.cloudLibrary?.schedulePlaybackSave?.();
                return data;
            },
            load: () => {
                try {
                    const data = JSON.parse(localStorage.getItem('playbackState'));
                    persist.apply(data);
                } catch(e) {}
            }
        };

        const cloudLibrary = {
            session: null,
            profile: null,
            syncing: false,
            playbackSaveTimer: null,
            ready: () => Boolean(window.dverse?.isConfigured && window.dverse?.dtunes),
            songId: (song) => String(typeof song === 'object' ? song?.id : song || ''),
            compactSongs: (songs) => {
                const seen = new Set();
                return (songs || []).filter((song) => {
                    const id = cloudLibrary.songId(song);
                    if (!id || seen.has(id)) return false;
                    seen.add(id);
                    return true;
                });
            },
            resolveSong: (item) => {
                if (!item) return null;
                if (typeof item === 'object') return item;
                const id = String(item);
                return state.currentTrack?.id === id ? state.currentTrack
                    : state.playHistory.find(song => song.id === id)
                    || state.queue.find(song => song.id === id)
                    || state.userQueue.find(song => song.id === id)
                    || null;
            },
            importKey: () => cloudLibrary.session?.user?.id ? `dtunesCloudImport:${cloudLibrary.session.user.id}` : null,
            captureLocalSnapshot: () => ({
                playHistory: [...(state.playHistory || [])],
                likedIds: [...(state.likedIds || [])],
                libraryIds: [...(state.libraryIds || [])],
                playlists: Object.fromEntries(Object.entries(state.playlists || {}).map(([name, songs]) => [name, [...(songs || [])]])),
                playbackState: (() => {
                    try { return JSON.parse(localStorage.getItem('playbackState') || 'null'); } catch (e) { return null; }
                })()
            }),
            snapshotHasContent: (snapshot) => Boolean(
                snapshot?.playHistory?.length ||
                snapshot?.likedIds?.length ||
                snapshot?.libraryIds?.length ||
                Object.keys(snapshot?.playlists || {}).length ||
                snapshot?.playbackState?.track?.id
            ),
            snapshotFingerprint: (snapshot) => {
                if (!snapshot) return '';
                const songId = (song) => cloudLibrary.songId(song);
                const playlists = Object.fromEntries(Object.entries(snapshot.playlists || {}).map(([name, songs]) => [
                    name,
                    (songs || []).map(songId).filter(Boolean)
                ]));
                return JSON.stringify({
                    history: (snapshot.playHistory || []).map(songId).filter(Boolean),
                    likes: (snapshot.likedIds || []).map(songId).filter(Boolean),
                    library: (snapshot.libraryIds || []).map(songId).filter(Boolean),
                    playlists,
                    playback: snapshot.playbackState?.track?.id
                        ? {
                            id: snapshot.playbackState.track.id,
                            time: Math.floor(Number(snapshot.playbackState.time || 0))
                        }
                        : null
                });
            },
            shouldPushLocalSnapshot: (snapshot) => {
                const key = cloudLibrary.importKey();
                if (!key || !cloudLibrary.snapshotHasContent(snapshot)) return false;
                return localStorage.getItem(key) !== cloudLibrary.snapshotFingerprint(snapshot);
            },
            markLocalSnapshotSynced: (snapshot) => {
                const key = cloudLibrary.importKey();
                if (!key) return;
                localStorage.setItem(key, cloudLibrary.snapshotFingerprint(snapshot));
            },
            resolveSnapshotSong: (item, snapshot) => {
                if (!item) return null;
                if (typeof item === 'object') return item;
                const id = String(item);
                return (snapshot.playHistory || []).find(song => song?.id === id)
                    || Object.values(snapshot.playlists || {}).flat().find(song => song?.id === id)
                    || (snapshot.playbackState?.track?.id === id ? snapshot.playbackState.track : null);
            },
            choosePlaybackState: (localPlayback, cloudPlayback) => {
                if (!localPlayback?.track?.id) return cloudPlayback?.track?.id ? cloudPlayback : null;
                if (!cloudPlayback?.track?.id) return localPlayback;
                const localTime = new Date(localPlayback.updated_at || 0).getTime();
                const cloudTime = new Date(cloudPlayback.updated_at || 0).getTime();
                return cloudTime > localTime ? cloudPlayback : localPlayback;
            },
            setStatus: (message) => {
                const profile = document.getElementById('dverse-account-status');
                const settings = document.getElementById('dverse-settings-status');
                if (profile) profile.textContent = message;
                if (settings) settings.textContent = message;
            },
            updateUI: () => {
                const signedIn = Boolean(cloudLibrary.session);
                const user = cloudLibrary.session?.user;
                const email = user?.email || '';
                const meta = user?.user_metadata || user?.raw_user_meta_data || {};
                const identityMeta = user?.identities?.[0]?.identity_data || {};
                const profile = cloudLibrary.profile || {};
                const displayName = profile.display_name || meta.full_name || meta.name || identityMeta.full_name || identityMeta.name || (email ? email.split('@')[0] : '') || state.username || "D'Verse User";
                const avatarUrl = profile.avatar_url || meta.avatar_url || meta.picture || identityMeta.avatar_url || identityMeta.picture || meta.avatar || identityMeta.avatar || state.avatarUrl || '';

                const label = document.getElementById('dverse-account-label');
                const authButton = document.getElementById('dverse-auth-button');
                const headerAuthButton = document.getElementById('dverse-header-auth-button');
                const settingsButton = document.getElementById('dverse-settings-auth-button');

                if (label) label.textContent = signedIn ? (email || displayName) : "D'Verse Cloud";
                
                // When signed in, completely hide / remove the header Sign In button
                if (headerAuthButton) {
                    headerAuthButton.classList.toggle('hidden', signedIn);
                    headerAuthButton.style.display = signedIn ? 'none' : '';
                }
                // In the profile dropdown, provide a clear Sign Out action when signed in
                if (authButton) {
                    authButton.textContent = signedIn ? 'Sign out' : 'Sign in';
                    if (signedIn) {
                        authButton.classList.remove('bg-[var(--accent-color)]', 'text-black');
                        authButton.classList.add('bg-red-500/20', 'text-red-400', 'hover:bg-red-500/30', 'border', 'border-red-500/30');
                    } else {
                        authButton.classList.add('bg-[var(--accent-color)]', 'text-black');
                        authButton.classList.remove('bg-red-500/20', 'text-red-400', 'hover:bg-red-500/30', 'border', 'border-red-500/30');
                    }
                }
                if (settingsButton) {
                    settingsButton.textContent = signedIn ? 'Sign out' : 'Sign in';
                }

                if (signedIn) {
                    state.username = displayName;
                    if (avatarUrl) state.avatarUrl = avatarUrl;
                    try {
                        localStorage.setItem('username', displayName);
                        if (avatarUrl) localStorage.setItem('avatarUrl', avatarUrl);
                    } catch (_) {}

                    const username = document.getElementById('dd-username');
                    if (username) username.textContent = displayName;

                    const headerAvatar = document.getElementById('header-avatar');
                    const mobileAvatar = document.getElementById('mobile-nav-avatar');
                    const effectiveAvatar = avatarUrl || (ui.avatarFallback ? ui.avatarFallback() : `https://placehold.co/100x100/111/fff?text=${encodeURIComponent(displayName.charAt(0).toUpperCase())}`);
                    if (headerAvatar) {
                        headerAvatar.referrerPolicy = 'no-referrer';
                        headerAvatar.src = effectiveAvatar;
                    }
                    if (mobileAvatar) {
                        mobileAvatar.referrerPolicy = 'no-referrer';
                        mobileAvatar.src = effectiveAvatar;
                    }

                    cloudLibrary.setStatus(`Signed in as ${email || displayName}. Syncing library...`);
                    ui.updateProfileUI();

                    // If profile avatar or name is missing, asynchronously fetch profile from Supabase
                    if ((!avatarUrl || !profile.display_name) && !cloudLibrary._fetchingUserMeta) {
                        cloudLibrary._fetchingUserMeta = true;
                        (async () => {
                            try {
                                if (window.dverse?.dtunes?.fetchProfile && cloudLibrary.session?.user?.id) {
                                    const fetchedProfile = await window.dverse.dtunes.fetchProfile(cloudLibrary.session.user.id);
                                    if (fetchedProfile) {
                                        cloudLibrary.profile = { ...(cloudLibrary.profile || {}), ...fetchedProfile };
                                        let updated = false;
                                        if (fetchedProfile.display_name && fetchedProfile.display_name !== state.username) {
                                            state.username = fetchedProfile.display_name;
                                            try { localStorage.setItem('username', fetchedProfile.display_name); } catch (_) {}
                                            updated = true;
                                        }
                                        if (fetchedProfile.avatar_url && fetchedProfile.avatar_url !== state.avatarUrl) {
                                            state.avatarUrl = fetchedProfile.avatar_url;
                                            try { localStorage.setItem('avatarUrl', fetchedProfile.avatar_url); } catch (_) {}
                                            updated = true;
                                        }
                                        if (updated) {
                                            ui.updateProfileUI();
                                            cloudLibrary.updateUI();
                                            return;
                                        }
                                    }
                                }
                                if (window.dverse?.supabase?.auth) {
                                    const { data } = await window.dverse.supabase.auth.getUser();
                                    const u = data?.user;
                                    const m = u?.user_metadata || u?.raw_user_meta_data || {};
                                    const im = u?.identities?.[0]?.identity_data || {};
                                    const fetchedAvatar = m.avatar_url || m.picture || im.avatar_url || im.picture || '';
                                    const fetchedName = m.full_name || m.name || im.full_name || im.name || '';
                                    let metaUpdated = false;
                                    if (fetchedAvatar && fetchedAvatar !== state.avatarUrl) {
                                        state.avatarUrl = fetchedAvatar;
                                        try { localStorage.setItem('avatarUrl', fetchedAvatar); } catch (_) {}
                                        if (cloudLibrary.session && cloudLibrary.session.user) {
                                            cloudLibrary.session.user.user_metadata = { ...m, avatar_url: fetchedAvatar };
                                        }
                                        metaUpdated = true;
                                    }
                                    if (fetchedName && (state.username === 'Guest User' || !state.username)) {
                                        state.username = fetchedName;
                                        try { localStorage.setItem('username', fetchedName); } catch (_) {}
                                        metaUpdated = true;
                                    }
                                    if (metaUpdated) {
                                        ui.updateProfileUI();
                                        cloudLibrary.updateUI();
                                    }
                                }
                            } catch (_) {}
                            finally {
                                cloudLibrary._fetchingUserMeta = false;
                            }
                        })();
                    }
                } else {
                    state.avatarUrl = '';
                    try { localStorage.removeItem('avatarUrl'); } catch (_) {}
                    ui.updateProfileUI();
                    cloudLibrary.setStatus('Sign in to sync history, library, likes, and playlists.');
                }
            },
            toggleAuth: async () => {
                try {
                    if (!cloudLibrary.ready()) throw new Error('D\'Verse Supabase client is not available.');
                    if (cloudLibrary.session) await cloudLibrary.signOutAndPurgeAll();
                    else await window.dverse.signInWithGoogle();
                } catch (error) {
                    cloudLibrary.setStatus(error?.message || 'D\'Verse sign-in failed.');
                }
            },
            signOutAndPurgeAll: async () => {
                try {
                    if (window.dverse && typeof window.dverse.signOut === 'function') {
                        await window.dverse.signOut();
                    }
                } catch (e) {
                    console.warn('[DVerse] Sign-out error:', e);
                }

                // Halt playback and detach audio source
                if (typeof audio !== 'undefined' && audio) {
                    audio.pause();
                    audio.removeAttribute('src');
                    audio.load();
                }

                // Cancel sleep timer
                if (typeof sleepTimer !== 'undefined' && sleepTimer.cancel) {
                    sleepTimer.cancel();
                }

                // Completely purge all local storage keys
                const targetKeys = [
                    'likedIds', 'libraryIds', 'likedArtists', 'playlists', 'playlistStyles',
                    'playHistory', 'artistPlayCounts', 'recentSearches', 'searchHistory', 'username', 'avatarUrl',
                    'songStore', 'dtunes_tester_streak', 'savedQueue', 'lastActiveTrack',
                    'playbackState', 'equalizerSettings', 'audioQuality', 'preferredLanguage',
                    'dverse_session_cache', 'dverse_supabase_auth_token', 'sb-supabase-auth-token',
                    'sb-qvvnhvowffvbbhfgwypw-auth-token'
                ];
                targetKeys.forEach(k => localStorage.removeItem(k));
                Object.keys(localStorage).forEach(k => {
                    if (k.startsWith('sb-') || k.startsWith('dverse_') || k.startsWith('recommendation')) {
                        localStorage.removeItem(k);
                    }
                });

                // Clear memory state
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
                state.searchHistory = [];
                state.artistPlayCounts = {};
                state.playlists = {};
                state.playlistStyles = {};
                state.username = 'Guest User';
                state.avatarUrl = '';
                state.forYouSongs = [];
                state.quickPicks = [];
                state.queueExpanded = false;
                if (typeof songStore !== 'undefined' && songStore.clear) songStore.clear();

                cloudLibrary.session = null;
                cloudLibrary.user = null;
                cloudLibrary.profile = null;
                cloudLibrary._loadedUserId = null;

                // Reset UI elements
                document.getElementById('queue-wrapper')?.classList.remove('queue-expanded', 'preview-expanded', 'track-swap-out');
                document.getElementById('player-footer')?.classList.add('translate-y-[150%]', 'opacity-0');
                document.body.classList.remove('mobile-player-open');
                const title = document.getElementById('p-title');
                const artist = document.getElementById('p-artist');
                const art = document.getElementById('curr-art-img');
                if (title) title.textContent = 'Not Playing';
                if (artist) artist.textContent = 'Select song';
                if (art) art.src = FALLBACK_ART;

                ui.setPlayerLoading(false);
                ui.updateProfileUI();
                ui.renderPlaylists();
                ui.renderLibraryLists();
                ui.renderQueue();
                ui.renderHistory();
                ui.updatePlayBtn();
                cloudLibrary.updateUI();
                ui.switchView('home');

                // Immediately purge and hide personalized shelves on the homepage without requiring page reload
                document.getElementById('section-for-you')?.classList.add('hidden');
                document.getElementById('for-you-actions')?.classList.add('hidden');
                const forYouGrid = document.getElementById('for-you-grid');
                if (forYouGrid) forYouGrid.innerHTML = '';

                document.getElementById('section-quick-picks')?.classList.add('hidden');
                const quickPicksGrid = document.getElementById('quick-picks-grid');
                if (quickPicksGrid) quickPicksGrid.innerHTML = '';

                document.getElementById('section-recent')?.classList.add('hidden');
                const recentGrid = document.getElementById('recent-grid');
                if (recentGrid) recentGrid.innerHTML = '';

                state.discoverMixes = {};
                homeView.renderDiscoverSection(true);

                if (ui.showToast) ui.showToast('Account data cleared and signed out', 'info');
            },
            init: async () => {
                if (!cloudLibrary.ready()) {
                    cloudLibrary.updateUI();
                    cloudLibrary.setStatus('D\'Verse sync is not configured.');
                    return;
                }
                const triggerLoadOnce = async (source, userSession) => {
                    const uid = userSession?.user?.id;
                    if (!uid) return;
                    if (cloudLibrary._loadedUserId === uid && source !== 'MANUAL_FORCE') return;
                    cloudLibrary._loadedUserId = uid;
                    await cloudLibrary.load();
                };

                window.dverse.onAuthStateChange(async (_event, session) => {
                    cloudLibrary.session = session;
                    cloudLibrary.updateUI();
                    if (session) await triggerLoadOnce(_event, session);
                    else cloudLibrary._loadedUserId = null;
                });
                try {
                    const session = await window.dverse.getSession();
                    cloudLibrary.session = session;
                    cloudLibrary.updateUI();
                    if (session) await triggerLoadOnce('SESSION', session);
                } catch (error) {
                    console.warn('[DVerse] Initial session check warning:', error);
                    cloudLibrary.setStatus(error?.message || 'Could not check D\'Verse session.');
                }
            },
            load: async () => {
                if (!cloudLibrary.session) {
                    cloudLibrary.session = await window.dverse.getSession();
                }
                if (!cloudLibrary.session) {
                    cloudLibrary.updateUI();
                    return;
                }
                if (cloudLibrary.syncing) {
                    cloudLibrary.pendingSync = true;
                    return;
                }
                cloudLibrary.syncing = true;
                cloudLibrary.setStatus('Syncing your D\'Tunes library...');
                try {
                    const localSnapshot = cloudLibrary.captureLocalSnapshot();
                    const shouldImportLocal = cloudLibrary.shouldPushLocalSnapshot(localSnapshot);
                    const [historyRes, likesRes, libraryRes, playlistsRes, playbackRes, profileRes] = await Promise.allSettled([
                        window.dverse.dtunes.listHistory(),
                        window.dverse.dtunes.listLikes(),
                        window.dverse.dtunes.listLibrary(),
                        window.dverse.dtunes.listPlaylists(),
                        window.dverse.dtunes.getPlaybackState(),
                        window.dverse.dtunes.fetchProfile ? window.dverse.dtunes.fetchProfile(cloudLibrary.session?.user?.id) : Promise.resolve(null)
                    ]);

                    const history = historyRes.status === 'fulfilled' ? historyRes.value : [];
                    const likes = likesRes.status === 'fulfilled' ? likesRes.value : [];
                    const library = libraryRes.status === 'fulfilled' ? libraryRes.value : [];
                    const playlists = playlistsRes.status === 'fulfilled' ? playlistsRes.value : [];
                    const playbackState = playbackRes.status === 'fulfilled' ? playbackRes.value : null;
                    const profile = profileRes.status === 'fulfilled' ? profileRes.value : null;

                    const user = cloudLibrary.session?.user;
                    const meta = user?.user_metadata || user?.raw_user_meta_data || {};
                    const identityMeta = user?.identities?.[0]?.identity_data || {};
                    const email = user?.email || '';

                    const effectiveName = profile?.display_name 
                        || meta.full_name 
                        || meta.name 
                        || identityMeta.full_name 
                        || identityMeta.name 
                        || (email ? email.split('@')[0] : '') 
                        || state.username 
                        || "D'Verse User";

                    const effectiveAvatar = profile?.avatar_url 
                        || meta.avatar_url 
                        || meta.picture 
                        || identityMeta.avatar_url 
                        || identityMeta.picture 
                        || meta.avatar 
                        || identityMeta.avatar 
                        || state.avatarUrl 
                        || '';

                    cloudLibrary.profile = profile || {
                        id: user?.id,
                        display_name: effectiveName,
                        avatar_url: effectiveAvatar
                    };
                    if (cloudLibrary.profile && !cloudLibrary.profile.display_name) {
                        cloudLibrary.profile.display_name = effectiveName;
                    }
                    if (cloudLibrary.profile && !cloudLibrary.profile.avatar_url && effectiveAvatar) {
                        cloudLibrary.profile.avatar_url = effectiveAvatar;
                    }

                    if (effectiveName) {
                        state.username = effectiveName;
                        try { localStorage.setItem('username', effectiveName); } catch (_) {}
                    }
                    if (effectiveAvatar) {
                        state.avatarUrl = effectiveAvatar;
                        try { localStorage.setItem('avatarUrl', effectiveAvatar); } catch (_) {}
                    }

                    // Auto-sync profile to Supabase if missing from public.profiles
                    if ((!profile || !profile.display_name || !profile.avatar_url) && window.dverse?.dtunes?.updateProfile) {
                        window.dverse.dtunes.updateProfile({
                            display_name: effectiveName,
                            avatar_url: effectiveAvatar
                        }).catch(e => console.warn('[DVerse] Auto-upsert profile warning:', e));
                    }

                    if (history && history.length > 0) {
                        state.playHistory = cloudLibrary.compactSongs([...(history || []), ...state.playHistory]).slice(0, 100);
                        document.getElementById('section-recent')?.classList.remove('hidden');
                        document.getElementById('section-quick-picks')?.classList.remove('hidden');
                        document.getElementById('section-for-you')?.classList.remove('hidden');
                    }
                    if (likes && likes.length > 0) {
                        state.likedIds = cloudLibrary.compactSongs([...(likes || []), ...state.likedIds]);
                    }
                    if (library && library.length > 0) {
                        state.libraryIds = cloudLibrary.compactSongs([...(library || []), ...state.libraryIds]);
                    }

                    const mergedPlaylists = { ...state.playlists };
                    const mergedStyles = { ...state.playlistStyles };
                    (playlists || []).forEach((playlist) => {
                        const localSongs = mergedPlaylists[playlist.name] || [];
                        mergedPlaylists[playlist.name] = cloudLibrary.compactSongs([...(playlist.songs || []), ...localSongs]);
                        if (playlist.style && typeof playlist.style === 'object') {
                            mergedStyles[playlist.name] = {
                                ...(mergedStyles[playlist.name] || {}),
                                ...playlist.style
                            };
                        }
                    });
                    state.playlists = mergedPlaylists;
                    state.playlistStyles = mergedStyles;

                    localStorage.setItem('playHistory', JSON.stringify(state.playHistory));
                    localStorage.setItem('likedIds', JSON.stringify(state.likedIds));
                    localStorage.setItem('libraryIds', JSON.stringify(state.libraryIds));
                    localStorage.setItem('playlists', JSON.stringify(state.playlists));
                    localStorage.setItem('playlistStyles', JSON.stringify(state.playlistStyles));

                    const preferredPlayback = cloudLibrary.choosePlaybackState(localSnapshot.playbackState, playbackState);
                    if (preferredPlayback?.track?.id) {
                        persist.apply(preferredPlayback);
                        localStorage.setItem('playbackState', JSON.stringify(preferredPlayback));
                    }

                    ui.renderPlaylists();
                    ui.renderLibraryLists();
                    ui.renderHistory();
                    if (state.playHistory.length > 0) {
                        document.getElementById('section-recent')?.classList.remove('hidden');
                        document.getElementById('section-quick-picks')?.classList.remove('hidden');
                        document.getElementById('section-for-you')?.classList.remove('hidden');
                        homeView.renderRecentlyPlayed();
                        if (homeView.generateQuickPicks) homeView.generateQuickPicks();
                        if (homeView.loadGeneratedPlaylist) homeView.loadGeneratedPlaylist('for-you');
                    } else {
                        homeView.renderRecentlyPlayed();
                    }
                    if (homeView.renderDiscoverSection) {
                        homeView.renderDiscoverSection(true);
                    }
                    if (typeof statsView !== 'undefined' && statsView.render && document.getElementById('view-stats') && !document.getElementById('view-stats').classList.contains('hidden')) {
                        statsView.render();
                    }
                    if (shouldImportLocal) {
                        await cloudLibrary.pushLocalSnapshot(localSnapshot, { history, likes, library, playlists });
                        cloudLibrary.markLocalSnapshotSynced(cloudLibrary.captureLocalSnapshot());
                        cloudLibrary.setStatus('Local library imported to D\'Verse Cloud.');
                    } else {
                        cloudLibrary.markLocalSnapshotSynced(cloudLibrary.captureLocalSnapshot());
                        cloudLibrary.setStatus('Synced with D\'Verse Cloud.');
                    }
                    ui.updateProfileUI();
                    cloudLibrary.updateUI();
                } catch (error) {
                    console.error('[DVerse] DTunes sync failed:', error);
                    cloudLibrary.setStatus(error?.message || 'Could not sync D\'Tunes library.');
                } finally {
                    cloudLibrary.syncing = false;
                    if (cloudLibrary.pendingSync) {
                        cloudLibrary.pendingSync = false;
                        setTimeout(() => {
                            if (!cloudLibrary.syncing && cloudLibrary.session) {
                                cloudLibrary.load().catch(() => {});
                            }
                        }, 1200);
                    }
                }
            },
            pushLocalSnapshot: async (snapshot = cloudLibrary.captureLocalSnapshot(), remote = {}) => {
                if (!cloudLibrary.session) return;
                const remoteHistoryIds = new Set((remote.history || []).map(song => song?.id).filter(Boolean));
                const likedSongs = (snapshot.likedIds || [])
                    .map((item) => cloudLibrary.resolveSnapshotSong(item, snapshot))
                    .filter(Boolean);
                for (const song of likedSongs) {
                    await window.dverse.dtunes.setLiked(song, true);
                }
                const librarySongs = (snapshot.libraryIds || [])
                    .map((item) => cloudLibrary.resolveSnapshotSong(item, snapshot))
                    .filter(Boolean);
                for (const song of librarySongs) {
                    await window.dverse.dtunes.setLibrary(song, true);
                }
                for (const song of (snapshot.playHistory || []).slice().reverse().slice(-50)) {
                    if (remoteHistoryIds.has(song?.id)) continue;
                    await window.dverse.dtunes.recordPlay(song, { source: 'local-import' });
                }
                for (const [name, songs] of Object.entries(snapshot.playlists || {})) {
                    await window.dverse.dtunes.savePlaylist(name, songs);
                }
                if (snapshot.playbackState?.track?.id) {
                    await window.dverse.dtunes.savePlaybackState(snapshot.playbackState);
                }
            },
            schedulePlaybackSave: () => {
                if (!cloudLibrary.session || !state.currentTrack) return;
                clearTimeout(cloudLibrary.playbackSaveTimer);
                cloudLibrary.playbackSaveTimer = setTimeout(() => {
                    cloudLibrary.flushPlaybackState(false);
                }, 4500);
            },
            flushPlaybackState: (fast = false) => {
                if (!cloudLibrary.session || !state.currentTrack) return;
                const playbackState = persist.snapshot();
                if (!playbackState) return;
                if (fast && window.dverse.dtunes.savePlaybackStateFast?.(playbackState)) return;
                window.dverse.dtunes.savePlaybackState(playbackState).catch((error) => {
                    console.error('[DVerse] Failed to sync playback state:', error);
                });
            },
            setLibrary: (song, inLibrary) => {
                if (!cloudLibrary.session || !song?.id) return;
                window.dverse.dtunes.setLibrary(song, inLibrary).catch((error) => {
                    console.error('[DVerse] Failed to sync library:', error);
                    cloudLibrary.setStatus('Could not sync library songs.');
                });
            },
            recordPlay: (song) => {
                if (!cloudLibrary.session || !song?.id) return;
                window.dverse.dtunes.recordPlay(song, { source: 'dtunes-web' }).catch((error) => {
                    console.error('[DVerse] Failed to record play:', error);
                    cloudLibrary.setStatus('Could not save latest play.');
                });
            },
            setLiked: (song, liked) => {
                if (!cloudLibrary.session || !song?.id) return;
                window.dverse.dtunes.setLiked(song, liked).catch((error) => {
                    console.error('[DVerse] Failed to sync like:', error);
                    cloudLibrary.setStatus('Could not sync liked songs.');
                });
            },
            savePlaylist: (name) => {
                if (!cloudLibrary.session || !name || !state.playlists[name]) return;
                window.dverse.dtunes.savePlaylist(
                    name,
                    state.playlists[name],
                    state.playlistStyles[name] || null
                ).catch((error) => {
                    console.error('[DVerse] Failed to sync playlist:', error);
                    cloudLibrary.setStatus('Could not sync playlist changes.');
                });
            },
            deletePlaylist: (name) => {
                if (!cloudLibrary.session || !name) return;
                window.dverse.dtunes.deletePlaylist(name).catch((error) => {
                    console.error('[DVerse] Failed to delete cloud playlist:', error);
                    cloudLibrary.setStatus('Could not delete cloud playlist.');
                });
            }
        };
        window.cloudLibrary = cloudLibrary;

        const listeningSession = {
            songId: null,
            track: null,
            startedAt: 0,
            accumulatedMs: 0,
            lastUpdate: 0,
            isPlaying: false,
            
            start: (track) => {
                listeningSession.finalize();
                if (!track) return;
                listeningSession.songId = track.id;
                listeningSession.track = track;
                listeningSession.startedAt = Date.now();
                listeningSession.accumulatedMs = 0;
                listeningSession.lastUpdate = Date.now();
                listeningSession.isPlaying = !audio.paused;
            },
            
            update: () => {
                if (!listeningSession.songId || !listeningSession.isPlaying) return;
                const now = Date.now();
                listeningSession.accumulatedMs += (now - listeningSession.lastUpdate);
                listeningSession.lastUpdate = now;
            },
            
            setPlaying: (playing) => {
                listeningSession.update();
                listeningSession.isPlaying = playing;
                listeningSession.lastUpdate = Date.now();
            },
            
            finalize: () => {
                listeningSession.update();
                const song = listeningSession.track;
                const ms = listeningSession.accumulatedMs;
                if (song && ms >= 5000) { // minimum 5 seconds
                    const endedAt = new Date().toISOString();
                    const startedAt = new Date(Date.now() - ms).toISOString();
                    if (cloudLibrary.session) {
                        window.dverse.dtunes.recordPlay(song, {
                            duration_ms: ms,
                            started_at: startedAt,
                            ended_at: endedAt,
                            source: 'dtunes-web'
                        }).catch(e => console.warn('[DVerse] recordPlay failed:', e));
                    }
                }
                listeningSession.songId = null;
                listeningSession.track = null;
                listeningSession.accumulatedMs = 0;
            }
        };
        window.listeningSession = listeningSession;

