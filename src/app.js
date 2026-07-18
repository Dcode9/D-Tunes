// ============================================
        // UTILS & JS MARQUEE ENGINE
        // ============================================
        const utils = {
            decodeHtml: (html) => {
                if(!html) return '';
                const txt = document.createElement("textarea"); txt.innerHTML = html; return txt.value;
            },
            escapeHtml: (text) => text ? text.toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;") : '',
            escapeJs: (text) => text ? text.toString().replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "\\n").replace(/\r/g, "\\r") : '',
            getRelativeDateLabel: (dateStr) => {
                if (!dateStr) return 'Earlier';
                try {
                    const date = new Date(dateStr);
                    const today = new Date();
                    const yesterday = new Date();
                    yesterday.setDate(yesterday.getDate() - 1);
                    
                    if (date.toDateString() === today.toDateString()) {
                        return 'Today';
                    } else if (date.toDateString() === yesterday.toDateString()) {
                        return 'Yesterday';
                    } else {
                        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                    }
                } catch (e) {
                    return 'Earlier';
                }
            }
        };

        const GITHUB_DETUNED_SVG = 'https://raw.githubusercontent.com/Datamaverik/D-Tunes/main/assets/DTunes2.svg';
        const FALLBACK_ART_CANDIDATES = [
            GITHUB_DETUNED_SVG,
            'assets/DTunes2.svg',
            './assets/DTunes2.svg',
            '/assets/DTunes2.svg',
            'DTunes.svg',
            './DTunes.svg',
            '/DTunes.svg'
        ];
        const FALLBACK_ART = FALLBACK_ART_CANDIDATES[0];

        const sanitizeImageUrl = (value) => {
            const url = String(value || '').trim();
            if (!url || url === 'undefined' || url === 'null') {
                return FALLBACK_ART;
            }
            return url;
        };

        const installGlobalImageFallback = () => {
            document.addEventListener('error', (event) => {
                const target = event.target;
                if (!(target instanceof HTMLImageElement)) {
                    return;
                }

                const nextIndex = Number(target.dataset.fallbackIndex || '0') + 1;
                target.dataset.fallbackIndex = String(nextIndex);

                if (nextIndex < FALLBACK_ART_CANDIDATES.length) {
                    target.src = FALLBACK_ART_CANDIDATES[nextIndex];
                    return;
                }

                if (target.dataset.fallbackLocked === '1') {
                    return;
                }

                target.dataset.fallbackLocked = '1';
                target.alt = target.alt || "D'Tunes artwork unavailable";
            }, true);
        };

        const updateMarquees = () => {
            if (typeof window.__stripTouchHoverClasses === 'function') window.__stripTouchHoverClasses();
            document.querySelectorAll('.marquee-container').forEach(container => {
                if(container.offsetParent === null) return;
                const text = container.querySelector('.marquee-text');
                if(!text) return;
                
                if(text.classList.contains('is-overflowing') && text.dataset.scrollWidth === String(text.scrollWidth)) return;

                text.style.animation = 'none'; text.classList.remove('is-overflowing'); container.classList.remove('is-overflowing');
                
                if (Math.ceil(text.scrollWidth) > Math.ceil(container.clientWidth) + 4) {
                    const dist = text.scrollWidth - container.clientWidth;
                    const dur = Math.max(3, dist / 15);
                    text.style.setProperty('--scroll-dist', `-${dist}px`);
                    text.style.setProperty('--scroll-dur', `${dur}s`);
                    text.dataset.scrollWidth = text.scrollWidth;
                    
                    void text.offsetWidth; 
                    text.style.animation = ''; text.classList.add('is-overflowing'); container.classList.add('is-overflowing');
                }
            });
        };

        // ============================================
        // JIOSAAVN API CORE
        // ============================================
        const JIOSAAVN_API_ENDPOINTS = ['https://jiosaavn-api-taupe-phi.vercel.app/api', 'https://jiosaavn-api-v2.vercel.app/api', 'https://saavn.me/api', 'https://jio-saavn-api-red.vercel.app/api'];
        let currentApiIndex = 0; let JIOSAAVN_API = JIOSAAVN_API_ENDPOINTS[currentApiIndex];
        function switchToNextApi() { currentApiIndex = (currentApiIndex + 1) % JIOSAAVN_API_ENDPOINTS.length; JIOSAAVN_API = JIOSAAVN_API_ENDPOINTS[currentApiIndex]; return currentApiIndex !== 0; }

        const jiosaavnAPI = {
            fetchWithRetry: async (url, retries = 3) => {
                let apiSwitchAttempts = JIOSAAVN_API_ENDPOINTS.length;
                while (apiSwitchAttempts > 0) {
                    for (let i = 0; i < retries; i++) {
                        try {
                            const currentUrl = url.replace(/https:\/\/[^\/]+\/api/, JIOSAAVN_API);
                            const response = await fetch(currentUrl);
                            if (!response.ok) throw new Error(`HTTP ${response.status}`);
                            const data = await response.json();
                            if (data.success === false) throw new Error(data.message);
                            return data;
                        } catch (error) {
                            if (i === retries - 1) { if (switchToNextApi()) { apiSwitchAttempts--; break; } }
                            if (i === retries - 1) throw error; await new Promise(r => setTimeout(r, 1000));
                        }
                    }
                    if (apiSwitchAttempts > 0 && apiSwitchAttempts < JIOSAAVN_API_ENDPOINTS.length) continue; break;
                }
            },
            searchSongs: async (query, limit = 20) => {
                try {
                    const data = await jiosaavnAPI.fetchWithRetry(`${JIOSAAVN_API}/search/songs?query=${encodeURIComponent(query)}&limit=${limit}`);
                    return (data.data?.results || []).map(jiosaavnAPI.normalizeSong).filter(Boolean);
                } catch (e) { return []; }
            },
            searchAlbums: async (query) => {
                try {
                    const res = await jiosaavnAPI.fetchWithRetry(`${JIOSAAVN_API}/search/albums?query=${encodeURIComponent(query)}&limit=8`);
                    return (res.data?.results || []).map(a => ({
                        id: a.id, name: utils.decodeHtml(a.title || a.name || 'Unknown'), artist: utils.decodeHtml(a.description || a.music || 'Album'),
                        img: sanitizeImageUrl(a.image?.[2]?.url || a.image?.[1]?.url || a.image?.[0]?.url || FALLBACK_ART), type: 'album'
                    }));
                } catch(e) { return []; }
            },
            searchArtists: async (query) => {
                try {
                    const res = await jiosaavnAPI.fetchWithRetry(`${JIOSAAVN_API}/search/artists?query=${encodeURIComponent(query)}&limit=8`);
                    return (res.data?.results || []).map(a => ({
                        id: a.id, name: utils.decodeHtml(a.title || a.name || 'Unknown'), artist: utils.decodeHtml(a.description || a.role || 'Artist'),
                        img: sanitizeImageUrl(a.image?.[2]?.url || a.image?.[1]?.url || a.image?.[0]?.url || FALLBACK_ART), type: 'artist'
                    }));
                } catch(e) { return []; }
            },
            searchAll: async (query) => {
                try {
                    const [songs, albums, artists] = await Promise.all([ jiosaavnAPI.searchSongs(query, 6), jiosaavnAPI.searchAlbums(query), jiosaavnAPI.searchArtists(query) ]);
                    if(songs.length === 0) return { top: null, songs: [], albums: [], artists: [] };
                    return { top: songs[0], songs: songs.slice(1, 6), albums, artists };
                } catch(e) { return { top: null, songs: [], albums: [], artists: [] }; }
            },
            getTrending: async () => {
                try {
                    const data = await jiosaavnAPI.fetchWithRetry(`${JIOSAAVN_API}/playlists?id=110858205`);
                    if (data.data?.songs) return data.data.songs.map(jiosaavnAPI.normalizeSong); return [];
                } catch (e) { return jiosaavnAPI.searchSongs('trending hindi', 16); }
            },
            getSong: async (id) => {
                try {
                    const data = await jiosaavnAPI.fetchWithRetry(`${JIOSAAVN_API}/songs/${id}`);
                    if (data.data && data.data.length > 0) return jiosaavnAPI.normalizeSong(data.data[0]); return null;
                } catch (e) { return null; }
            },
            getAlbum: async (id) => {
                try {
                    const data = await jiosaavnAPI.fetchWithRetry(`${JIOSAAVN_API}/albums?id=${id}`);
                    if (data.data) {
                        return {
                            id: data.data.id, name: utils.decodeHtml(data.data.name || data.data.title),
                            img: sanitizeImageUrl(data.data.image?.[2]?.url || data.data.image?.[1]?.url || FALLBACK_ART),
                            songs: (data.data.songs || []).map(jiosaavnAPI.normalizeSong).filter(Boolean)
                        };
                    }
                    return null;
                } catch(e) { return null; }
            },
            normalizeSong: (song) => {
                if (!song) return null; let bestUrl = null; const dUrls = song.downloadUrl || [];
                
                if(dUrls.length > 0) {
                    if (state.quality === 'low') bestUrl = dUrls[0].url; 
                    else if (state.quality === 'medium') bestUrl = dUrls[Math.floor(dUrls.length/2)].url; 
                    else bestUrl = dUrls[dUrls.length - 1].url; 
                }
                
                const rawName = song.name || song.title || 'Unknown';
                const rawArtist = song.artists?.primary?.map(a => a.name).join(', ') || song.primaryArtists || 'Unknown Artist';
                return {
                    id: song.id, name: utils.decodeHtml(rawName), artist: utils.decodeHtml(rawArtist),
                    img: sanitizeImageUrl(song.image?.[2]?.url || song.image?.[1]?.url || song.image?.[0]?.url || FALLBACK_ART),
                    url: jiosaavnAPI.isStreamingUrl(bestUrl) ? bestUrl : null,
                    duration: song.duration || 0,
                    source: 'jiosaavn'
                };
            },
            isStreamingUrl: (url) => !!(url && (url.startsWith('http://') || url.startsWith('https://')))
        };

        // ============================================
        // SPOTIFY API INTEGRATION
        // ============================================
        const spotifyManager = {
            clientId: '8fba37005d964e2599ce567c69ee7f1d', // 🔴 ADD YOUR SPOTIFY CLIENT ID HERE
            redirectUri: window.location.href.split('#')[0].split('?')[0],
            token: null,

            login: () => {
                if(!spotifyManager.clientId) {
                    alert("Developer setup required: Please open the HTML file and add your Spotify Client ID to the 'spotifyManager.clientId' variable.");
                    return;
                }
                const scopes = 'playlist-read-private playlist-read-collaborative';
                const authUrl = `https://accounts.spotify.com/authorize?client_id=${spotifyManager.clientId}&response_type=token&redirect_uri=${encodeURIComponent(spotifyManager.redirectUri)}&scope=${encodeURIComponent(scopes)}`;
                window.location.href = authUrl;
            },
            
            checkToken: () => {
                const hash = window.location.hash;
                if (hash && hash.includes('access_token=')) {
                    const params = new URLSearchParams(hash.substring(1));
                    spotifyManager.token = params.get('access_token');
                    window.location.hash = ''; 
                    setTimeout(() => ui.toggleSpotifyModal(true), 500); 
                }
            },

            getPlaylists: async () => {
                if(!spotifyManager.token) return [];
                try {
                    const res = await fetch('https://api.spotify.com/v1/me/playlists?limit=50', {
                        headers: { 'Authorization': `Bearer ${spotifyManager.token}` }
                    });
                    const data = await res.json();
                    return data.items || [];
                } catch(e) { return []; }
            },

            importPlaylist: async (playlistId, playlistName) => {
                if(!spotifyManager.token) return;
                ui.setSpotifyState('importing');
                
                try {
                    let tracks = [];
                    let nextUrl = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=50`;
                    
                    while (nextUrl) {
                        const res = await fetch(nextUrl, { headers: { 'Authorization': `Bearer ${spotifyManager.token}` } });
                        const data = await res.json();
                        tracks = [...tracks, ...(data.items || [])];
                        nextUrl = data.next;
                    }

                    tracks = tracks.filter(item => item.track && !item.is_local);
                    
                    const jioSongs = [];
                    const progressText = document.getElementById('sp-import-progress');
                    
                    // Match tracks against JioSaavn
                    for (let i = 0; i < tracks.length; i++) {
                        const track = tracks[i].track;
                        progressText.textContent = `Matching "${track.name}" (${i+1}/${tracks.length})...`;
                        
                        const artistName = track.artists && track.artists.length > 0 ? track.artists[0].name : '';
                        const query = `${track.name} ${artistName}`.trim();
                        
                        const results = await jiosaavnAPI.searchSongs(query, 1);
                        if (results && results.length > 0) {
                            jioSongs.push(results[0]);
                        }
                        // Sleep to prevent rate-limiting JioSaavn endpoints
                        await new Promise(r => setTimeout(r, 200));
                    }
                    
                    // Ensure unique name if conflict exists
                    let baseName = playlistName;
                    let num = 1;
                    while (state.playlists[baseName]) { baseName = `${playlistName} (${num++})`; }
                    
                    state.playlists[baseName] = jioSongs;
                    localStorage.setItem('playlists', JSON.stringify(state.playlists));
                    cloudLibrary.savePlaylist(baseName);
                    
                    ui.toggleSpotifyModal(false);
                    ui.renderPlaylists();
                    ui.openPlaylist(baseName);
                    
                } catch (e) {
                    alert("Error importing playlist.");
                    ui.setSpotifyState('list');
                }
            }
        };

        // ============================================
        // STATE & PERSISTENCE
        // ============================================
        const EQ_BANDS = [
            { key: 'eq32', label: '32', frequency: 32, type: 'lowshelf' },
            { key: 'eq64', label: '64', frequency: 64, type: 'peaking' },
            { key: 'eq125', label: '125', frequency: 125, type: 'peaking' },
            { key: 'eq250', label: '250', frequency: 250, type: 'peaking' },
            { key: 'eq500', label: '500', frequency: 500, type: 'peaking' },
            { key: 'eq1k', label: '1k', frequency: 1000, type: 'peaking' },
            { key: 'eq2k', label: '2k', frequency: 2000, type: 'peaking' },
            { key: 'eq4k', label: '4k', frequency: 4000, type: 'peaking' },
            { key: 'eq8k', label: '8k', frequency: 8000, type: 'peaking' },
            { key: 'eq16k', label: '16k', frequency: 16000, type: 'highshelf' }
        ];
        const FLAT_EQUALIZER = Object.fromEntries(EQ_BANDS.map((band) => [band.key, 0]));
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

        const state = { 
            queue: [], userQueue: [], idx: -1, playing: false, loading: false, loaded: false,
            shuffle: localStorage.getItem('playShuffle') === 'true',
            repeat: parseInt(localStorage.getItem('playRepeat') || '0', 10),
            currentTrack: null,
            likedIds: JSON.parse(localStorage.getItem('likedIds') || '[]'),
            libraryIds: JSON.parse(localStorage.getItem('libraryIds') || '[]'),
            likedArtists: JSON.parse(localStorage.getItem('likedArtists') || '[]'),
            playHistory: JSON.parse(localStorage.getItem('playHistory') || '[]'),
            artistPlayCounts: JSON.parse(localStorage.getItem('artistPlayCounts') || '{}'),
            playlists: JSON.parse(localStorage.getItem('playlists') || '{}'),
            playlistStyles: JSON.parse(localStorage.getItem('playlistStyles') || '{}'),
            username: localStorage.getItem('username') || 'Guest User',
            quality: localStorage.getItem('audioQuality') || 'high',
            equalizer: normalizeEqualizerSettings(JSON.parse(localStorage.getItem('equalizerSettings') || '{}')),
            forYouSongs: [],
            searchDebounce: null, hoverProgress: -1, lastHoverProgress: 0.5, isDragging: false, 
            upNextTriggered: false, queueExpanded: false, activeQueueTab: 'upnext', mobileSearchOriginView: null, mobileQueueAutoOpened: false, nextTrackPreloadId: null,
            wasPlayingBeforeHidden: false
        };

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
                const email = cloudLibrary.session?.user?.email || '';
                const meta = cloudLibrary.session?.user?.user_metadata || {};
                const displayName = meta.full_name || meta.name || email || state.username || "D'Verse User";
                const avatarUrl = meta.avatar_url || meta.picture || `https://placehold.co/100x100/111/fff?text=${encodeURIComponent(displayName.charAt(0).toUpperCase())}`;
                const label = document.getElementById('dverse-account-label');
                const authButton = document.getElementById('dverse-auth-button');
                const headerAuthButton = document.getElementById('dverse-header-auth-button');
                const settingsButton = document.getElementById('dverse-settings-auth-button');
                if (label) label.textContent = signedIn ? email : "D'Verse Cloud";
                if (authButton) authButton.textContent = signedIn ? 'Sign out' : 'Sign in';
                if (headerAuthButton) headerAuthButton.classList.toggle('hidden', signedIn);
                if (settingsButton) settingsButton.textContent = signedIn ? 'Sign out' : 'Sign in';
                if (signedIn) {
                    const username = document.getElementById('dd-username');
                    const headerAvatar = document.getElementById('header-avatar');
                    const mobileAvatar = document.getElementById('mobile-nav-avatar');
                    state.username = displayName;
                    localStorage.setItem('username', displayName);
                    if (username) username.textContent = displayName;
                    if (headerAvatar) headerAvatar.src = avatarUrl;
                    if (mobileAvatar) mobileAvatar.src = avatarUrl;
                    cloudLibrary.setStatus(`Signed in as ${email || displayName}. Syncing library...`);
                } else {
                    ui.updateProfileUI();
                    cloudLibrary.setStatus('Sign in to sync history, library, likes, and playlists.');
                }
            },
            toggleAuth: async () => {
                try {
                    if (!cloudLibrary.ready()) throw new Error('D\'Verse Supabase client is not available.');
                    if (cloudLibrary.session) await window.dverse.signOut();
                    else await window.dverse.signInWithGoogle();
                } catch (error) {
                    cloudLibrary.setStatus(error?.message || 'D\'Verse sign-in failed.');
                }
            },
            init: async () => {
                if (!cloudLibrary.ready()) {
                    cloudLibrary.updateUI();
                    cloudLibrary.setStatus('D\'Verse sync is not configured.');
                    return;
                }
                window.dverse.onAuthStateChange((_event, session) => {
                    cloudLibrary.session = session;
                    cloudLibrary.updateUI();
                    if (session) cloudLibrary.load();
                });
                try {
                    cloudLibrary.session = await window.dverse.getSession();
                    cloudLibrary.updateUI();
                    if (cloudLibrary.session) await cloudLibrary.load();
                } catch (error) {
                    cloudLibrary.setStatus(error?.message || 'Could not check D\'Verse session.');
                }
            },
            load: async () => {
                if (!cloudLibrary.session || cloudLibrary.syncing) return;
                cloudLibrary.syncing = true;
                cloudLibrary.setStatus('Syncing your D\'Tunes library...');
                try {
                    const localSnapshot = cloudLibrary.captureLocalSnapshot();
                    const shouldImportLocal = cloudLibrary.shouldPushLocalSnapshot(localSnapshot);
                    const [history, likes, library, playlists, playbackState] = await Promise.all([
                        window.dverse.dtunes.listHistory(),
                        window.dverse.dtunes.listLikes(),
                        window.dverse.dtunes.listLibrary(),
                        window.dverse.dtunes.listPlaylists(),
                        window.dverse.dtunes.getPlaybackState()
                    ]);

                    state.playHistory = cloudLibrary.compactSongs([...(history || []), ...state.playHistory]).slice(0, 100);
                    state.likedIds = cloudLibrary.compactSongs([...(likes || []), ...state.likedIds]);
                    state.libraryIds = cloudLibrary.compactSongs([...(library || []), ...state.libraryIds]);
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
                    homeView.renderRecentlyPlayed();
                    if (document.getElementById('view-stats') && !document.getElementById('view-stats').classList.contains('hidden')) {
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
                } catch (error) {
                    console.error('[DVerse] DTunes sync failed:', error);
                    cloudLibrary.setStatus(error?.message || 'Could not sync D\'Tunes library.');
                } finally {
                    cloudLibrary.syncing = false;
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

        // ============================================
        // CONTEXT MENU LOGIC
        // ============================================
        const ctxMenu = {
            activeStoreId: null, activePlaylistName: null,
            init: () => {
                const menu = document.getElementById('context-menu');
                document.addEventListener('click', (e) => { 
                    menu.classList.add('hidden'); 
                    if (!e.target.closest('#profile-dropdown') && !e.target.closest('[onclick*="profile-dropdown"]')) {
                        document.getElementById('profile-dropdown').classList.add('hidden');
                    }
                });
                document.getElementById('cm-play-next').onclick = () => { const s = songStore.get(ctxMenu.activeStoreId); if(s) player.addNext(s); };
                document.getElementById('cm-add-queue').onclick = () => { const s = songStore.get(ctxMenu.activeStoreId); if(s) player.addToQueue(s); };
                document.getElementById('cm-add-playlist').onclick = (e) => { e.stopPropagation(); menu.classList.add('hidden'); ctxMenu.showPlaylistSelector(); };
                document.getElementById('cm-like-song').onclick = () => { const s = songStore.get(ctxMenu.activeStoreId); if(s) player.likeSong(s.id); menu.classList.add('hidden'); };
                document.getElementById('cm-add-library').onclick = () => { const s = songStore.get(ctxMenu.activeStoreId); if(s) player.addToLibrary(s.id); menu.classList.add('hidden'); };
                document.getElementById('cm-pl-play').onclick = () => { ui.playPlaylist(ctxMenu.activePlaylistName); };
                document.getElementById('cm-pl-delete').onclick = () => { ui.deletePlaylist(ctxMenu.activePlaylistName); };
            },
            showSong: (event, storeId) => {
                ctxMenu.activeStoreId = storeId; const menu = document.getElementById('context-menu');
                const song = songStore.get(storeId);
                const likeLabel = document.getElementById('cm-like-song-label');
                const libraryLabel = document.getElementById('cm-add-library-label');
                if (likeLabel && song) likeLabel.textContent = player.isLiked(song.id) ? 'Unlike song' : 'Like song';
                if (libraryLabel && song) libraryLabel.textContent = player.isInLibrary(song.id) ? 'Remove from Library' : 'Add to Library';
                document.getElementById('cm-song-options').classList.remove('hidden'); document.getElementById('cm-playlist-options').classList.add('hidden');
                menu.classList.remove('hidden'); const x = Math.min(event.clientX, window.innerWidth - 200); const y = Math.min(event.clientY, window.innerHeight - 150);
                menu.style.left = `${x}px`; menu.style.top = `${y}px`;
            },
            showPlaylist: (event, playlistName) => {
                ctxMenu.activePlaylistName = playlistName; const menu = document.getElementById('context-menu');
                document.getElementById('cm-song-options').classList.add('hidden'); document.getElementById('cm-playlist-options').classList.remove('hidden');
                menu.classList.remove('hidden'); const x = Math.min(event.clientX, window.innerWidth - 200); const y = Math.min(event.clientY, window.innerHeight - 150);
                menu.style.left = `${x}px`; menu.style.top = `${y}px`;
            },
            showPlaylistSelector: () => {
                const song = songStore.get(ctxMenu.activeStoreId); if(!song) return;
                const modal = document.getElementById('playlist-selector-modal'); const list = document.getElementById('playlist-selector-list');
                let html = '';
                Object.keys(state.playlists).forEach(name => {
                    html += `<button class="w-full text-left px-4 py-3 glass-panel rounded-lg hover:bg-white/10 text-white transition" onclick="ui.addSongToPlaylist('${utils.escapeJs(name)}')">${utils.escapeHtml(name)}</button>`;
                });
                if(Object.keys(state.playlists).length === 0) html = '<p class="text-gray-400 text-sm py-2">No playlists created yet.</p>';
                list.innerHTML = html; modal.classList.remove('hidden');
            }
        };

        // ============================================
        // PLAYER LOGIC & MEDIA SESSION
        // ============================================
        const audio = document.getElementById('audio-el');
        const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        audio.setAttribute('playsinline', '');
        audio.setAttribute('webkit-playsinline', '');
        audio.preload = 'auto';
        const preloadAudio = new Audio();
        preloadAudio.preload = 'auto';
        preloadAudio.crossOrigin = 'anonymous';
        let isPlaybackPending = false;
        let isAudioRecoveryPending = false;


        const getUpcomingTrack = () => {
            if (state.userQueue.length > 0) return state.userQueue[0];
            if (state.queue.length === 0) return null;
            if (state.shuffle) return state.queue.find((_, i) => i !== state.idx) || null;
            return state.idx >= 0 && state.idx < state.queue.length - 1 ? state.queue[state.idx + 1] : null;
        };

        const getPreviousTrack = () => {
            if (state.queue.length === 0) return null;
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
                preloadAudio.src = playUrl;
                preloadAudio.load();
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

        const requestPlay = async () => {
            if (!state.loaded) return;
            try {
                if (audioContext && audioContext.state === 'suspended') {
                    try {
                        await audioContext.resume();
                    } catch (acErr) {
                        console.warn('[DTunes] Could not resume audioContext in background:', acErr);
                    }
                }
                await audio.play();
            } catch (e) {
                console.error('[DTunes] Playback failed:', e);
                state.playing = false;
                ui.updatePlayBtn();
            }
        };

        const requestPause = () => {
            if (!state.loaded) return;
            audio.pause();
        };

        const recoverFromAudioError = async () => {
            if (!state.currentTrack || isAudioRecoveryPending) return;
            isAudioRecoveryPending = true;

            try {
                const refreshed = await jiosaavnAPI.getSong(state.currentTrack.id);
                if (refreshed?.url && refreshed.url !== state.currentTrack.url) {
                    state.currentTrack.url = refreshed.url;
                    audio.src = refreshed.url;
                    if (state.playing) await audio.play();
                    return;
                }

                // Rotate API endpoint once and retry before skipping to next track.
                if (switchToNextApi()) {
                    const retried = await jiosaavnAPI.getSong(state.currentTrack.id);
                    if (retried?.url) {
                        state.currentTrack.url = retried.url;
                        audio.src = retried.url;
                        if (state.playing) await audio.play();
                        return;
                    }
                }

                player.next();
            } catch (e) {
                player.next();
            } finally {
                isAudioRecoveryPending = false;
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
                if (!track || isPlaybackPending) return;
                recommendationEvents.maybeRecordSkip();
                isPlaybackPending = true;
                
                state.upNextTriggered = false;
                state.loading = true;
                state.loaded = false;
                state.currentTrack = { ...track };
                document.getElementById('queue-wrapper').classList.remove('preview-expanded', 'track-swap-out');
                document.getElementById('player-footer').classList.remove('translate-y-[150%]', 'opacity-0');
                ui.updateMetadata(state.currentTrack, { loading: true });
                ui.updatePlayBtn();
                ui.renderQueue();
                persist.save();
                
                try {
                    const freshDetails = await jiosaavnAPI.getSong(track.id);
                    const playUrl = freshDetails?.url || track.url;
                    
                    if (!playUrl) throw new Error('No URL');
                    
                    track = { ...track, ...freshDetails, url: playUrl };
                    audio.preload = 'auto';
                    audio.src = playUrl;
                    audio.load();
                    state.currentTrack = track;
                    state.loaded = true;
                    state.loading = true;
                    ui.updateMetadata(track, { loading: true });
                    
                    ui.enableControls();
                    audio.loop = (state.repeat === 2);
                    await audio.play();
                    state.loading = false;
                    ui.setPlayerLoading(false);
                    const isRepeatStart = recommendationEvents.lastStartedSongId === track.id && Date.now() - recommendationEvents.currentPlayStartAt < 15 * 60 * 1000;
                    recommendationEvents.currentPlayStartAt = Date.now();
                    recommendationEvents.lastStartedSongId = track.id;
                    recommendationEvents.completedSongId = null;
                    recommendationEvents.record(isRepeatStart ? 'repeat' : (recommendationEvents.contextForTrack(track).source === 'search' ? 'search_play' : 'play_start'), track, {
                        songDurationSeconds: track.duration,
                        context: recommendationEvents.contextForTrack(track),
                    });
                    
                    if (audioContext && audioContext.state === 'suspended') {
                        audioContext.resume().catch(err => console.warn('[DTunes] Could not resume audioContext in playDirect:', err));
                    }
                    if (Object.values(state.equalizer).some(value => Number(value) !== 0) && !isAudioContextInitialized) setupAudioContext();
                    
                    ui.updateMetadata(track); ui.renderQueue(); primeNextTrack(); 
                    
                    const trackWithTime = { ...track, playedAt: new Date().toISOString() };
                    state.playHistory = state.playHistory.filter(t => t.id !== track.id);
                    state.playHistory.unshift(trackWithTime);
                    if(state.playHistory.length > 100) state.playHistory.pop();
                    localStorage.setItem('playHistory', JSON.stringify(state.playHistory));
                    
                    listeningSession.start(track);
                    
                    ui.renderHistory();
                    if(!document.getElementById('view-home').classList.contains('hidden')) homeView.renderRecentlyPlayed();
                    
                    persist.save();
                } catch (error) {
                    state.playing = false;
                    state.loading = false;
                    ui.setPlayerLoading(false);
                    ui.updatePlayBtn();
                } 
                finally { isPlaybackPending = false; }
            },
            togglePlay: () => {
                if(!state.loaded) return;
                if(state.playing || !audio.paused) { requestPause(); } else { requestPlay(); }
            },
            next: (force = false) => { 
                if (state.userQueue.length > 0) { const nextSong = state.userQueue.shift(); player.playDirect(nextSong); } 
                else if (state.queue.length > 0) {
                    let nextIdx = state.shuffle ? Math.floor(Math.random() * state.queue.length) : state.idx + 1;
                    if (nextIdx >= state.queue.length) {
                        if (state.repeat === 1 || force) {
                            nextIdx = 0;
                        } else {
                            audio.pause();
                            audio.currentTime = 0;
                            state.playing = false;
                            state.loading = false;
                            ui.setPlayerLoading(false);
                            ui.updatePlayBtn();
                            persist.save();
                            return;
                        }
                    }
                    state.idx = nextIdx; player.playDirect(state.queue[nextIdx]);
                }
            },
            prev: () => { 
                if(state.queue.length === 0) return;
                let prevIdx = state.idx - 1; if(prevIdx < 0) prevIdx = state.queue.length - 1;
                state.idx = prevIdx; player.playDirect(state.queue[prevIdx]);
            },
            setVolume: (val) => { audio.volume = Math.max(0, Math.min(1, val)); },
            toggleShuffle: () => { 
                state.shuffle = !state.shuffle; 
                localStorage.setItem('playShuffle', state.shuffle);
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
            addNext: (song) => { state.userQueue.unshift(song); recommendationEvents.record('queue_add', song, { context: { source: 'manual' } }); ui.renderQueue(); primeNextTrack(); persist.save(); },
            addToQueue: (song) => { state.userQueue.push(song); recommendationEvents.record('queue_add', song, { context: { source: 'manual' } }); ui.renderQueue(); primeNextTrack(); persist.save(); },
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
            if (window.listeningSession) listeningSession.setPlaying(true);
            ui.updatePlayBtn();
            persist.save();
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
        });
        audio.addEventListener('pause', () => { 
            // Only treat as a real user/app pause if the page is visible.
            // Browsers suspend audio when the tab is hidden; we must not
            // clobber state.playing in that case or the visibilitychange
            // handler won't know to resume.
            if (document.visibilityState !== 'hidden') {
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
        });

        ['loadstart', 'waiting', 'stalled'].forEach((eventName) => {
            audio.addEventListener(eventName, () => {
                if (!state.currentTrack) return;
                state.loading = true;
                ui.setPlayerLoading(true);
            });
        });
        ['canplay', 'canplaythrough', 'playing', 'loadeddata', 'loadedmetadata'].forEach((eventName) => {
            audio.addEventListener(eventName, () => {
                state.loading = false;
                ui.setPlayerLoading(false);
            });
        });

        audio.addEventListener('error', recoverFromAudioError);

        setInterval(() => {
            if (!state.playing || state.repeat === 2 || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
            if (audio.ended || audio.duration - audio.currentTime <= 0.35) {
                player.next();
            }
        }, 1000);

        // Periodic state reconciliation: catches any desync between audio
        // element and UI state (especially on mobile expanded player).
        setInterval(() => {
            if (!state.loaded || isPlaybackPending) return;
            const audioActuallyPlaying = !audio.paused && !audio.ended && audio.readyState > 2;
            const stateDesync = (audioActuallyPlaying !== state.playing) && document.visibilityState !== 'hidden' && !state.wasPlayingBeforeHidden;
            if (stateDesync) {
                state.playing = audioActuallyPlaying;
                ui.updatePlayBtn();
            }
        }, 2000);

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                // Remember whether we were playing before the tab goes hidden.
                // The browser may fire a 'pause' event on the audio element
                // while the page is hidden, which our pause handler now guards
                // against clobbering state.playing — but we still want a
                // separate flag for maximum reliability.
                state.wasPlayingBeforeHidden = state.playing || !audio.paused;
                const preservedVolume = audio.volume;
                audio.muted = false;
                persist.save();
                cloudLibrary.flushPlaybackState(true);
                setTimeout(() => { audio.volume = preservedVolume; audio.muted = false; }, 0);
            } else {
                // Page became visible. Check if playback was interrupted.
                const shouldResume = state.wasPlayingBeforeHidden || state.playing;
                if (shouldResume) {
                    audio.muted = false;
                    if (audioContext && audioContext.state === 'suspended') {
                        audioContext.resume().catch(err => console.warn('[DTunes] audioContext resume failed:', err));
                    }
                    if (audio.paused) {
                        audio.play().then(() => {
                            state.playing = true;
                            ui.updatePlayBtn();
                        }).catch(err => {
                            console.warn('[DTunes] Could not resume audio on focus:', err);
                            // If autoplay is blocked, reconcile state
                            state.playing = false;
                            state.wasPlayingBeforeHidden = false;
                            ui.updatePlayBtn();
                        });
                    } else {
                        // Audio is already playing, just make sure state is correct
                        state.playing = true;
                        ui.updatePlayBtn();
                    }
                }
            }
            if ('mediaSession' in navigator && document.visibilityState === 'hidden' && (state.playing || state.wasPlayingBeforeHidden)) {
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

        // ============================================
        // VISUALIZER
        // ============================================
        let audioContext, analyser, source, eqFilters = {}, isAudioContextInitialized = false;
        let analyserData = null;
        let smoothedLow = 0, smoothedMid = 0, currentProgress = 0, time = 0, hoverIntensity = 0; let visualizerCtx;
        let vizCanvas = null, vizSeekTrack = null, lastClipProgress = -1;
        let resizeCanvas = () => {};
        const applyEqualizer = () => {
            EQ_BANDS.forEach((band) => {
                if (eqFilters[band.key]) eqFilters[band.key].gain.value = Number(state.equalizer[band.key] || 0);
            });
        };
        function setupAudioContext() {
            try {
                audioContext = new (window.AudioContext || window.webkitAudioContext)(); analyser = audioContext.createAnalyser(); source = audioContext.createMediaElementSource(audio);
                eqFilters = {};
                let previousNode = source;
                EQ_BANDS.forEach((band) => {
                    const filter = audioContext.createBiquadFilter();
                    filter.type = band.type;
                    filter.frequency.value = band.frequency;
                    filter.Q.value = 1.1;
                    eqFilters[band.key] = filter;
                    previousNode.connect(filter);
                    previousNode = filter;
                });
                previousNode.connect(analyser); analyser.connect(audioContext.destination); analyser.fftSize = 256;
                applyEqualizer();
                analyserData = new Uint8Array(analyser.frequencyBinCount);
                isAudioContextInitialized = true;
            } catch(e) {}
        }
        // Visualizer frequency bin ranges: bins 0-4 = bass/low, bins 10-39 = mid frequencies.
        const VIZ_LOW_BINS_END = 5, VIZ_MID_BINS_START = 10, VIZ_MID_BINS_END = 40;
        const VIZ_SILENCE_THRESHOLD = 0.001;
        const viz = {
            render: () => {
                requestAnimationFrame(viz.render);
                if (!state.loaded) return;
                const canvas = vizCanvas; const dpr = Math.min(window.devicePixelRatio || 1, 2);
                const width = canvas.width / dpr; const height = canvas.height / dpr; const centerY = height / 2; visualizerCtx.clearRect(0, 0, width, height);
                // Always update the clip-path so the progress line stays visible
                // even when paused.
                if(vizSeekTrack && currentProgress !== lastClipProgress) {
                    const progressWidth = width * currentProgress;
                    canvas.style.clipPath = `inset(0 ${width - progressWidth}px 0 0)`;
                    vizSeekTrack.style.clipPath = `inset(0 0 0 ${currentProgress * 100}%)`;
                    lastClipProgress = currentProgress;
                }
                time += 0.05; let targetLow = 0, targetMid = 0;
                if (state.playing && isAudioContextInitialized && analyserData) {
                    analyser.getByteFrequencyData(analyserData);
                    let sumLow = 0; for (let i = 0; i < VIZ_LOW_BINS_END; i++) sumLow += analyserData[i];
                    let sumMid = 0; for (let i = VIZ_MID_BINS_START; i < VIZ_MID_BINS_END; i++) sumMid += analyserData[i];
                    targetLow = sumLow / VIZ_LOW_BINS_END / 255; targetMid = sumMid / (VIZ_MID_BINS_END - VIZ_MID_BINS_START) / 255;
                } else if (state.playing) {
                    // Fallback motion when frequency data is unavailable (e.g., iOS restrictions).
                    targetLow = 0.2 + (0.16 * (0.5 + 0.5 * Math.sin(time * 2.8)));
                    targetMid = 0.12 + (0.09 * (0.5 + 0.5 * Math.cos(time * 3.4)));
                } else {
                    // Paused: decay the wave to flat, but always draw a flat
                    // progress line so the completed portion stays visible.
                    smoothedLow += (0 - smoothedLow) * 0.1; smoothedMid += (0 - smoothedMid) * 0.1;
                    if (smoothedLow < VIZ_SILENCE_THRESHOLD && smoothedMid < VIZ_SILENCE_THRESHOLD) {
                        // Draw a flat line across the canvas at centerY so the
                        // clip-path on the canvas still shows as a thin white
                        // progress indicator.
                        visualizerCtx.beginPath();
                        visualizerCtx.moveTo(0, centerY);
                        visualizerCtx.lineTo(width, centerY);
                        visualizerCtx.lineWidth = 2;
                        visualizerCtx.strokeStyle = '#fff';
                        visualizerCtx.shadowColor = 'transparent';
                        visualizerCtx.shadowBlur = 0;
                        visualizerCtx.stroke();
                        return;
                    }
                }
                smoothedLow += (targetLow - smoothedLow) * 0.1; smoothedMid += (targetMid - smoothedMid) * 0.1;
                let verticalScale = audio.duration > 0 ? (0.3 + 0.7 * Math.min(1, currentProgress / 0.4)) * 0.8 : 1.0;
                visualizerCtx.beginPath(); visualizerCtx.moveTo(0, centerY);
                const waveCount = Math.min(14, Math.max(2, (width * currentProgress) * 0.03)); const intensity = audio.volume; const isHovering = state.hoverProgress >= 0;
                hoverIntensity += ((isHovering ? 1.0 : 0.0) - hoverIntensity) * 0.1;
                for (let x = 0; x <= width; x++) {
                    const localProgress = x / (width * currentProgress || 1); const taper = Math.sin(localProgress * Math.PI);
                    const baseWave = Math.sin((x / width) * waveCount * Math.PI); const fastWave = Math.sin((x / width) * waveCount * 2.5 * Math.PI + time);
                    const loudness = Math.max(0.45, intensity);
                    const baseAmplitude = (centerY * 1.05) * Math.pow(smoothedLow, 1.7) * loudness * verticalScale;
                    const detailAmplitude = (centerY * 0.34) * Math.pow(smoothedMid, 1.35) * loudness * verticalScale;
                    let interactionFactor = 1.0;
                    if (hoverIntensity > 0.01) { const hoverX = (isHovering ? state.hoverProgress : state.lastHoverProgress) * width; const dist = Math.abs(x - hoverX); if (dist < 60) interactionFactor = 1.0 - (hoverIntensity * (1.0 - (dist/60)*(dist/60)*(3-2*(dist/60)))); }
                    visualizerCtx.lineTo(x, centerY + (baseWave * baseAmplitude + fastWave * detailAmplitude) * taper * interactionFactor);
                }
                visualizerCtx.lineWidth = 2; visualizerCtx.strokeStyle = '#fff'; visualizerCtx.shadowColor = 'rgba(255, 255, 255, 0.7)'; visualizerCtx.shadowBlur = smoothedLow > 0.3 ? 4 : 0; visualizerCtx.stroke();
            }
        };

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
                if (!window.visualViewport) {
                    resetKeyboardVars();
                    return;
                }
                const vv = window.visualViewport;
                const offset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
                const lift = Math.min(offset, 120);
                document.documentElement.style.setProperty('--mobile-keyboard-offset', `${offset}px`);
                document.documentElement.style.setProperty('--mobile-keyboard-lift', `${lift}px`);
                const keyboardOpen = offset > 12 && document.body.classList.contains('mobile-search-open');
                document.body.classList.toggle('mobile-keyboard-open', keyboardOpen);
                if (keyboardOpen) window.scrollTo(0, 0);
            },

            switchView: (view) => {
                document.getElementById('view-home').classList.add('hidden'); document.getElementById('view-search').classList.add('hidden'); document.getElementById('view-playlist').classList.add('hidden'); document.getElementById('view-library').classList.add('hidden'); document.getElementById('view-settings').classList.add('hidden'); document.getElementById('view-stats').classList.add('hidden');
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
                    if (!state.mobileQueueAutoOpened) {
                        state.mobileQueueAutoOpened = true;
                        state.queueExpanded = true;
                        document.getElementById('queue-wrapper').classList.add('queue-expanded');
                        ui.switchQueueTab('upnext');
                    }
                    requestAnimationFrame(resizeCanvas);
                    setTimeout(resizeCanvas, 120);
                    setTimeout(resizeCanvas, 320);
                } else {
                    document.body.classList.remove('mobile-player-open');
                }
                updateMarquees();
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
            toggleSpotifyModal: async (show) => {
                const modal = document.getElementById('spotify-modal');
                if(show) {
                    modal.classList.remove('hidden');
                    if (spotifyManager.token) {
                        ui.setSpotifyState('list');
                        const container = document.getElementById('sp-playlists-container');
                        container.innerHTML = '<div class="text-center text-gray-400 py-4 text-sm">Fetching playlists...</div>';
                        const playlists = await spotifyManager.getPlaylists();
                        
                        if(playlists.length === 0) {
                            container.innerHTML = '<div class="text-center text-gray-500 py-4 text-sm">No playlists found.</div>';
                        } else {
                            container.innerHTML = playlists.map(pl => `
                                <div class="flex items-center justify-between p-2 glass-panel rounded-lg hover:bg-white/10 transition group cursor-pointer" onclick="spotifyManager.importPlaylist('${pl.id}', '${utils.escapeJs(pl.name)}')">
                                    <div class="flex items-center gap-3 min-w-0">
                                        <img src="${pl.images?.[0]?.url || 'https://placehold.co/40'}" class="w-10 h-10 rounded-md object-cover">
                                        <div class="min-w-0">
                                            <p class="text-sm text-white font-bold truncate">${utils.escapeHtml(pl.name)}</p>
                                            <p class="text-xs text-gray-400">${pl.tracks?.total || 0} tracks</p>
                                        </div>
                                    </div>
                                    <svg class="w-5 h-5 text-gray-500 group-hover:text-[var(--accent-color)] transition" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                                </div>
                            `).join('');
                        }
                    } else {
                        ui.setSpotifyState('connect');
                    }
                } else {
                    modal.classList.add('hidden');
                }
            },
            setSpotifyState: (state) => {
                document.getElementById('sp-state-connect').classList.add('hidden');
                document.getElementById('sp-state-list').classList.add('hidden');
                document.getElementById('sp-state-importing').classList.add('hidden');
                
                const activeEl = document.getElementById(`sp-state-${state}`);
                activeEl.classList.remove('hidden');
                if (state === 'list') activeEl.classList.add('flex');
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
                ui.updateProfileUI();
                ui.toggleProfileModal(false);
            },
            updateProfileUI: () => {
                document.getElementById('dd-username').textContent = state.username;
                const initial = state.username.charAt(0).toUpperCase();
                document.getElementById('header-avatar').src = `https://placehold.co/100x100/111/fff?text=${initial}`;
                document.getElementById('mobile-nav-avatar').src = `https://placehold.co/100x100/111/fff?text=${initial}`;
            },
            updateSettings: (key, val) => {
                if(key === 'quality') {
                    state.quality = val;
                    localStorage.setItem('audioQuality', val);
                }
            },
            renderEqualizerSettings: () => {
                const container = document.getElementById('eq-bands');
                if (!container) return;
                if (!container.dataset.rendered) {
                    container.innerHTML = EQ_BANDS.map((band) => `
                        <label class="eq-band" title="${band.frequency} Hz">
                            <span id="${band.key}-value" class="eq-value">0 dB</span>
                            <input id="${band.key}" type="range" min="-12" max="12" step="1" value="0" orient="vertical" aria-label="${band.label} Hz" oninput="ui.updateEqualizer('${band.key}', this.value)">
                            <span class="eq-label">${band.label}</span>
                        </label>
                    `).join('');
                    container.dataset.rendered = 'true';
                }
                EQ_BANDS.forEach((band) => {
                    const value = Number(state.equalizer[band.key] || 0);
                    const input = document.getElementById(band.key);
                    const label = document.getElementById(`${band.key}-value`);
                    if (input) input.value = value;
                    if (label) label.textContent = `${value > 0 ? '+' : ''}${value} dB`;
                });
            },
            updateEqualizer: (band, value) => {
                if (!Object.prototype.hasOwnProperty.call(FLAT_EQUALIZER, band)) return;
                state.equalizer[band] = Number(value);
                localStorage.setItem('equalizerSettings', JSON.stringify(state.equalizer));
                ui.renderEqualizerSettings();
                if (!isAudioContextInitialized && state.currentTrack && Object.values(state.equalizer).some(value => Number(value) !== 0)) setupAudioContext();
                applyEqualizer();
            },
            resetEqualizer: () => {
                state.equalizer = { ...FLAT_EQUALIZER };
                localStorage.setItem('equalizerSettings', JSON.stringify(state.equalizer));
                ui.renderEqualizerSettings();
                applyEqualizer();
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
            openPlaylist: async (name) => {
                ui.switchView('playlist'); document.getElementById('playlist-view-title').textContent = utils.escapeHtml(name);
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
                document.getElementById('playlist-view-count').textContent = `${songs.length} tracks`;
                
                const style = ui.getPlaylistStyle(name);
                document.getElementById('pl-view-art').className = `w-48 h-48 md:w-full md:aspect-square rounded-2xl shadow-2xl flex items-center justify-center text-5xl md:text-6xl font-bold text-white shadow-black/50 overflow-hidden ${style.bg}`;
                document.getElementById('pl-view-art').innerHTML = style.customHtml || style.icon;

                const listEl = document.getElementById('playlist-songs-list');
                if (songs.length === 0) { listEl.innerHTML = '<p class="text-gray-400 py-4">No songs in this playlist yet.</p>'; } 
                else { listEl.innerHTML = songs.map(song => ui.createListRow(song, name)).join(''); }
                document.getElementById('playlist-play-all').onclick = () => ui.playPlaylist(name);
                updateMarquees();
            },
            openAlbum: async (id) => {
                ui.switchView('playlist'); document.getElementById('playlist-songs-list').innerHTML = '<p class="text-gray-400 py-4">Loading album...</p>';
                const album = await jiosaavnAPI.getAlbum(id);
                if(album) {
                    document.getElementById('playlist-view-title').textContent = utils.escapeHtml(album.name);
                    document.getElementById('playlist-view-count').textContent = `${album.songs.length} tracks`;
                    document.getElementById('pl-view-art').className = `w-48 h-48 md:w-full md:aspect-square rounded-2xl shadow-2xl overflow-hidden`;
                    document.getElementById('pl-view-art').innerHTML = `<img src="${album.img}" class="w-full h-full object-cover">`;
                    document.getElementById('playlist-songs-list').innerHTML = album.songs.map(song => ui.createListRow(song)).join('');
                    document.getElementById('playlist-play-all').onclick = () => {
                        if(album.songs.length > 0) { state.queue = [...album.songs]; state.userQueue = []; state.idx = 0; player.playDirect(album.songs[0]); }
                    };
                    updateMarquees();
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
                        <img src="${item.img}" class="w-full h-full object-cover group-hover:scale-105 transition duration-500" loading="lazy">
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
                return `
                    <div class="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 shadow-md border border-white/20 ml-1">
                        <img src="${song.img}" onerror="this.src='${FALLBACK_ART}'" class="w-full h-full object-cover" loading="lazy">
                    </div>
                    <div class="flex-1 min-w-0 flex flex-col justify-center ml-3">
                        <div class="marquee-container w-full"><div class="font-bold text-white text-sm marquee-text">${utils.escapeHtml(song.name)}</div></div>
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
                <div class="queue-reorder-row glass-panel rounded-2xl p-2 pr-2 flex items-center shadow-2xl w-full border border-white/10 transition-colors bg-[#121212]/90 cursor-pointer mb-2" draggable="true" data-queue-section="${safeSection}" data-queue-index="${index}" data-store-id="${storeId}" onclick="playSongById('${storeId}')" ondblclick="player.likeSong('${utils.escapeJs(song.id)}')">
                    ${ui.createSongPillInner(song)}
                    <button class="queue-drag-handle" title="Drag to rearrange" aria-label="Rearrange ${utils.escapeHtml(song.name)}" onclick="event.stopPropagation()" type="button">
                        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M9 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm10 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM9 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm10 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM9 19a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm10 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z"/></svg>
                    </button>
                </div>`;
            },
            createSongPill: (song, clickHandlerStr, context = 'queue') => {
                const storeId = songStore.add(song);
                const hoverBtnVis = context === 'quicksearch' ? 'opacity-100' : 'opacity-100 md:opacity-0 group-hover:opacity-100';
                
                return `
                <div class="swipe-song glass-panel rounded-2xl p-2 pr-4 flex items-center shadow-2xl w-full border border-white/10 transition-colors bg-[#121212]/90 hover-pause group cursor-pointer mb-2" data-store-id="${storeId}" onclick="${clickHandlerStr}" ondblclick="player.likeSong('${utils.escapeJs(song.id)}')">
                    ${ui.createSongPillInner(song)}
                    <div class="flex items-center ${hoverBtnVis} transition-opacity duration-200 mr-1">
                        <button class="p-1.5 text-gray-400 hover:text-white rounded-full hover:bg-white/10 transition hidden md:flex" title="Play Next" onclick="event.stopPropagation(); player.addNext(songStore.get('${storeId}'))"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg></button>
                        <button class="p-1.5 text-gray-400 hover:text-white rounded-full hover:bg-white/10 transition hidden md:flex" title="Add to Queue" onclick="event.stopPropagation(); player.addToQueue(songStore.get('${storeId}'))"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h10m-10 4h6"/></svg></button>
                        <span class="swipe-hint md:hidden text-[10px] text-gray-500 uppercase tracking-wider">Swipe</span>
                    </div>
                </div>`;
            },
            createListRow: (song, contextPlaylistName = null) => {
                const storeId = songStore.add(song);
                const removeBtnHtml = contextPlaylistName ? `<button class="p-2 text-red-400 hover:text-red-500 rounded-full hover:bg-red-500/10 hidden md:block" title="Remove" onclick="event.stopPropagation(); ui.removeSongFromPlaylist('${utils.escapeJs(contextPlaylistName)}', '${utils.escapeJs(song.id)}')"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>` : '';
                
                return `
                <div class="swipe-song group flex items-center gap-4 p-2 rounded-lg glass-panel hover:bg-white/10 transition hover-pause" data-store-id="${storeId}" ondblclick="player.likeSong('${utils.escapeJs(song.id)}')">
                    <div class="relative w-12 h-12 flex-shrink-0 cursor-pointer rounded-md overflow-hidden" onclick="playSongById('${storeId}')">
                        <img src="${song.img}" class="w-full h-full object-cover" loading="lazy">
                        <div class="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition"><svg class="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
                    </div>
                    <div class="flex-1 min-w-0 cursor-pointer flex flex-col justify-center" onclick="playSongById('${storeId}')">
                        <div class="marquee-container w-full"><h4 class="text-white font-medium text-sm marquee-text">${utils.escapeHtml(song.name)}</h4></div>
                        <div class="marquee-container w-full mt-0.5"><p class="text-gray-400 text-xs marquee-text">${utils.escapeHtml(song.artist)}</p></div>
                    </div>
                    <div class="flex items-center gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition mr-2">
                        <button class="p-2 text-gray-400 hover:text-white rounded-full hover:bg-white/10 hidden md:block" title="Play Next" onclick="event.stopPropagation(); player.addNext(songStore.get('${storeId}'))"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg></button>
                        <button class="p-2 text-gray-400 hover:text-white rounded-full hover:bg-white/10 hidden md:block" title="Add to Queue" onclick="event.stopPropagation(); player.addToQueue(songStore.get('${storeId}'))"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h10m-10 4h6"/></svg></button>
                        <span class="swipe-hint block md:hidden text-[10px] text-gray-500 uppercase tracking-wider">Swipe</span>
                        ${removeBtnHtml}
                    </div>
                </div>`;
            },
            createForYouCard: (song) => {
                const storeId = songStore.add(song);
                return `
                <div class="for-you-card glass-panel rounded-3xl overflow-hidden relative flex-shrink-0 w-64 h-80 group cursor-pointer hover-pause" onclick="playSongById('${storeId}')">
                    <img src="${song.img}" class="absolute inset-0 w-full h-full object-cover transition duration-700 group-hover:scale-110" loading="lazy">
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
            openGeneratedPlaylist: (title, songs) => {
                ui.switchView('playlist');
                document.getElementById('playlist-view-title').textContent = title;
                document.getElementById('playlist-view-count').textContent = `${songs.length} tracks`;
                document.getElementById('pl-view-art').innerHTML = '<div class="w-full h-full bg-gradient-to-br from-[var(--accent-color)] to-cyan-950 flex items-center justify-center"><svg class="w-20 h-20 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>';
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
                document.getElementById('curr-art-img').src = safeArt;
                ui.setPlayerLoading(!!options.loading);
                const likeBtn = document.getElementById('p-like-btn');
                const isLiked = state.likedIds.some(item => (typeof item === 'string' ? item === track.id : item.id === track.id));
                likeBtn.className = isLiked ? 'text-red-500 transition flex-shrink-0 ml-2' : 'text-gray-400 hover:text-red-500 transition flex-shrink-0 ml-2';

                if ('mediaSession' in navigator) {
                    navigator.mediaSession.metadata = new MediaMetadata({
                        title: track.name, artist: options.loading ? `Loading • ${track.artist || ''}` : track.artist,
                        artwork: [{ src: safeArt, sizes: '500x500', type: 'image/jpeg' }]
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
            updatePlayBtn: () => {
                // Reconcile state.playing with actual audio element state.
                // If the audio is playing but state says otherwise (or vice versa),
                // use the audio element as the source of truth — unless we're
                // in the middle of loading a new track.
                if (state.loaded && !isPlaybackPending) {
                    const audioActuallyPlaying = !audio.paused && !audio.ended && audio.readyState > 2;
                    if (audioActuallyPlaying && !state.playing) {
                        state.playing = true;
                    } else if (!audioActuallyPlaying && state.playing && document.visibilityState !== 'hidden') {
                        // Only correct when visible; when hidden the browser may
                        // have suspended audio but we still intend to play.
                        state.playing = false;
                    }
                }
                const playing = state.playing;
                document.getElementById('icon-play').className = playing ? 'hidden' : 'flex ml-1';
                document.getElementById('icon-pause').className = playing ? 'flex' : 'hidden';
                const mPlayBtn = document.getElementById('m-icon-play');
                const mPauseBtn = document.getElementById('m-icon-pause');
                if(mPlayBtn && mPauseBtn) {
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
                if(tab === 'upnext') {
                    document.getElementById('tab-upnext').className = "text-xs font-bold uppercase tracking-wider text-white";
                    document.getElementById('tab-history').className = "text-xs font-bold uppercase tracking-wider text-gray-500 hover:text-gray-300";
                    document.getElementById('queue-list').classList.remove('hidden');
                    document.getElementById('history-list').classList.add('hidden');
                } else {
                    document.getElementById('tab-history').className = "text-xs font-bold uppercase tracking-wider text-white";
                    document.getElementById('tab-upnext').className = "text-xs font-bold uppercase tracking-wider text-gray-500 hover:text-gray-300";
                    document.getElementById('history-list').classList.remove('hidden');
                    document.getElementById('queue-list').classList.add('hidden');
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
                const autoCount = state.shuffle ? state.queue.filter((_, i) => i !== state.idx).length : Math.max(0, state.queue.length - state.idx - 1);
                if (clearBtn) {
                    clearBtn.disabled = manualCount + autoCount === 0;
                    clearBtn.textContent = manualCount > 0 ? `Clear Queue (${manualCount})` : 'Clear Queue';
                }
                let html = '';
                if (state.userQueue.length > 0) {
                    html += `<div class="text-[10px] text-white font-bold uppercase tracking-wider mb-1 pl-2 mt-1 drop-shadow-md">Queue</div>`;
                    html += state.userQueue.map((song, index) => ui.createQueuePill(song, 'manual', index)).join('');
                }
                const upcoming = state.shuffle ? state.queue.filter((_, i) => i !== state.idx).slice(0, 10) : state.queue.slice(state.idx + 1, state.idx + 11);
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

        // ============================================
        // SEARCH VIEW MANAGER & STAGED PLAYLISTS
        // ============================================
        let lastFullSearch = '';
        let stagedPlaylistSongs = [];
        const playlistCoverDraft = {
            color: '#0ea5e9',
            icon: 'MusicNote',
            shape: 'Circle',
            cornerRadius: 20,
            smoothness: 100,
            starSides: 5,
            starCurve: 0.15,
            starRotation: 0,
            starScale: 1
        };
        const PLAYLIST_COVER_COLORS = [
            '#0ea5e9', '#38bdf8', '#22c55e', '#86efac', '#a855f7',
            '#d8b4fe', '#f97316', '#fdba74', '#ef4444', '#111827'
        ];
        const PLAYLIST_COVER_ICONS = {
            MusicNote: '<svg viewBox="0 0 24 24" class="w-6 h-6" fill="currentColor"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>',
            Headphones: '<svg viewBox="0 0 24 24" class="w-6 h-6" fill="currentColor"><path d="M12 3a9 9 0 0 0-9 9v7a2 2 0 0 0 2 2h3v-8H5v-1a7 7 0 0 1 14 0v1h-3v8h3a2 2 0 0 0 2-2v-7a9 9 0 0 0-9-9z"/></svg>',
            Album: '<svg viewBox="0 0 24 24" class="w-6 h-6" fill="currentColor"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 14.5A4.5 4.5 0 1 1 16.5 12 4.5 4.5 0 0 1 12 16.5z"/></svg>',
            Mic: '<svg viewBox="0 0 24 24" class="w-6 h-6" fill="currentColor"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11z"/></svg>',
            Speaker: '<svg viewBox="0 0 24 24" class="w-6 h-6" fill="currentColor"><path d="M17 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zm-5 2a1.5 1.5 0 1 1-1.5 1.5A1.5 1.5 0 0 1 12 4zm0 16a4 4 0 1 1 4-4 4 4 0 0 1-4 4z"/></svg>',
            Favorite: '<svg viewBox="0 0 24 24" class="w-6 h-6" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54z"/></svg>',
            Piano: '<svg viewBox="0 0 24 24" class="w-6 h-6" fill="currentColor"><path d="M20 3H4a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1zM9 19H5v-6h1.5v4H9zm5 0h-4v-6H11v4h2v-4h1zm5 0h-4v-6H16v4H19z"/></svg>',
            Queue: '<svg viewBox="0 0 24 24" class="w-6 h-6" fill="currentColor"><path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zm19-8v10l-7-5 7-5z"/></svg>'
        };
        const PLAYLIST_COVER_SHAPES = ['Circle', 'SmoothRect', 'RotatedPill', 'Star'];

        function playlistShapeCss(style = {}) {
            const shape = style.shape || 'Circle';
            if (shape === 'SmoothRect') {
                const radius = Math.max(0, Math.min(50, Number(style.cornerRadius ?? 20)));
                return `border-radius:${radius}px`;
            }
            if (shape === 'RotatedPill') {
                return 'border-radius:999px; transform: rotate(45deg) scale(0.85)';
            }
            if (shape === 'Star') {
                const sides = Math.max(3, Math.min(20, Number(style.starSides ?? 5)));
                // CSS approximation via clip-path polygon for a star-like look
                return `clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%); border-radius:0`;
            }
            return 'border-radius:9999px';
        }

        function renderPlaylistCoverMarkup(style = {}, sizeClass = 'w-12 h-12') {
            const color = style.color || '#0ea5e9';
            const icon = PLAYLIST_COVER_ICONS[style.icon] || PLAYLIST_COVER_ICONS.MusicNote;
            const shapeStyle = playlistShapeCss(style);
            const iconWrap = style.shape === 'RotatedPill'
                ? `<span style="transform: rotate(-45deg)">${icon}</span>`
                : icon;
            return `<div class="${sizeClass} flex items-center justify-center text-white overflow-hidden" style="background:${color}; ${shapeStyle}">${iconWrap}</div>`;
        }
        
        const searchManager = {
            init: () => {
                const input = document.getElementById('search-input'); 
                const dropWrapper = document.getElementById('search-dropdown');
                const results = document.getElementById('search-results');
                
                input.addEventListener('focus', () => { 
                    const q = input.value.trim();
                    if (q.length >= 2 && results.innerHTML !== '') dropWrapper.classList.add('active'); 
                });
                
                input.addEventListener('blur', () => { setTimeout(() => { dropWrapper.classList.remove('active'); }, 200); });
                
                input.addEventListener('input', (e) => {
                    clearTimeout(state.searchDebounce); const query = e.target.value.trim();
                    if (query.length < 2) { dropWrapper.classList.remove('active'); results.innerHTML = ''; return; }
                    dropWrapper.classList.add('active');
                    results.classList.add('is-updating');
                    const requestedQuery = query;
                    state.searchDebounce = setTimeout(async () => {
                        const songs = await jiosaavnAPI.searchSongs(requestedQuery, 6);
                        if (input.value.trim() !== requestedQuery) return;
                        results.classList.remove('is-updating');
                        if(songs.length === 0) {
                            results.innerHTML = '<div class="p-4 text-center text-gray-400 text-sm">No songs found</div>';
                            return;
                        }
                        results.innerHTML = '<div class="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1 pl-2 drop-shadow-md">Songs</div>' + songs.map(song => {
                            const storeId = songStore.add(song);
                            return ui.createSongPill(song, `ui.playFromQuickSearch('${storeId}')`, 'quicksearch');
                        }).join('');
                        stripTouchHoverClasses();
                        updateMarquees();
                    }, deviceMode.isMobileUI() ? 120 : 180);
                });
                
                input.addEventListener('keydown', (e) => {
                    if(e.key === 'Enter') {
                        e.preventDefault(); const query = e.target.value.trim();
                        if(query.length > 0) { 
                            if (deviceMode.isMobileUI()) {
                                e.target.blur();
                                ui.closeMobileSearch();
                            }
                            lastFullSearch = query; 
                            dropWrapper.classList.remove('active'); results.innerHTML = ''; 
                            searchManager.performFullSearch(query); 
                        }
                    }
                });
            },
            performFullSearch: async (query) => {
                ui.switchView('search'); document.getElementById('search-title').textContent = `Results for "${query}"`;
                document.getElementById('search-content').classList.add('hidden'); document.getElementById('search-loading').classList.remove('hidden');

                const data = await jiosaavnAPI.searchAll(query);
                document.getElementById('search-loading').classList.add('hidden'); document.getElementById('search-content').classList.remove('hidden');
                if(!data.top) { document.getElementById('search-content').innerHTML = '<p class="text-gray-400 pl-8">No results found.</p>'; return; }

                const topStoreId = songStore.add(data.top);
                document.getElementById('search-top-result').innerHTML = `
                    <div class="absolute inset-0 z-0" ondblclick="player.likeSong('${utils.escapeJs(data.top.id)}')">
                        <img src="${data.top.img}" class="w-full h-full object-cover opacity-20 blur-sm">
                        <div class="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-transparent"></div>
                    </div>
                    <div class="relative z-10 flex flex-col justify-end h-full">
                        <img src="${data.top.img}" class="w-32 h-32 md:w-40 md:h-40 rounded-lg shadow-2xl mb-4 border border-white/10 object-cover" ondblclick="player.likeSong('${utils.escapeJs(data.top.id)}')">
                        
                        <div class="flex items-start justify-between gap-4">
                            <div class="flex-1 min-w-0" ondblclick="player.likeSong('${utils.escapeJs(data.top.id)}')">
                                <h2 class="text-3xl font-bold text-white mb-2 line-clamp-2" title="${utils.escapeHtml(data.top.name)}">${utils.escapeHtml(data.top.name)}</h2>
                                <div class="flex items-center gap-2 text-gray-300 text-sm mb-4">
                                    <span class="bg-white/10 px-2 py-0.5 rounded text-xs font-semibold">SONG</span>
                                    <div class="marquee-container w-full ml-2"><span class="marquee-text">${utils.escapeHtml(data.top.artist)}</span></div>
                                </div>
                            </div>
                            <div class="top-result-actions flex items-center gap-2 flex-shrink-0 z-20">
                                <button class="top-result-action" title="Play next" onclick="event.stopPropagation(); player.addNext(songStore.get('${topStoreId}'))">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg>
                                </button>
                                <button class="top-result-action" title="Add to queue" onclick="event.stopPropagation(); player.addToQueue(songStore.get('${topStoreId}'))">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h10m-10 4h6"/></svg>
                                </button>
                                <button class="top-result-action" title="Add to library" onclick="event.stopPropagation(); player.addToLibrary('${utils.escapeJs(data.top.id)}')">
                                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                                </button>
                            </div>
                        </div>

                        <div class="flex items-center gap-3">
                            <button onclick="playSongById('${topStoreId}')" class="bg-[var(--accent-color)] text-black px-6 py-2 rounded-full font-bold hover:scale-105 transition shadow-lg shadow-cyan-500/30 flex items-center gap-2 z-20 relative">
                                <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> Play
                            </button>
                        </div>
                    </div>
                `;
                document.getElementById('search-songs-list').innerHTML = data.songs.map(song => ui.createListRow(song)).join('');
                document.getElementById('search-albums-grid').innerHTML = data.albums.map(item => ui.createCard(item)).join('');
                document.getElementById('search-artists-grid').innerHTML = data.artists.map(item => ui.createCard(item)).join('');
                updateMarquees();
            }
        };

        const statsView = {
            formatDuration: (ms) => {
                const totalMinutes = Math.max(0, Math.round(Number(ms || 0) / 60000));
                if (totalMinutes < 60) return `${totalMinutes} min`;
                const hours = Math.floor(totalMinutes / 60);
                const minutes = totalMinutes % 60;
                return minutes ? `${hours} hr ${minutes} min` : `${hours} hr`;
            },
            localSummary: () => {
                const uniqueTracks = new Set(state.playHistory.map(song => song?.id).filter(Boolean));
                const totalPlays = state.playHistory.length;
                const topArtists = Object.entries(state.artistPlayCounts || {})
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5);
                return { uniqueTracks: uniqueTracks.size, totalPlays, topArtists, source: 'local' };
            },
            renderCards: (summary, topTracks = [], daily = []) => {
                const container = document.getElementById('stats-content');
                const subtitle = document.getElementById('stats-subtitle');
                if (!container) return;
                if (subtitle) {
                    subtitle.textContent = summary.source === 'cloud'
                        ? 'Synced from D\'Verse Cloud — same data as the Android app.'
                        : 'Local browser stats. Sign in to D\'Verse Cloud for full cross-device listening stats.';
                }
                const topArtistHtml = (summary.topArtists || []).length
                    ? summary.topArtists.map(([name, count]) => `<div class="flex items-center justify-between py-2 border-b border-white/5"><span class="text-white truncate">${utils.escapeHtml(name)}</span><span class="text-gray-400 text-sm">${count} plays</span></div>`).join('')
                    : '<p class="text-sm text-gray-500">No artist data yet.</p>';
                const topTrackHtml = topTracks.length
                    ? topTracks.map(row => {
                        const track = row.dtunes_tracks || row.track || row;
                        const title = track?.title || track?.name || 'Unknown';
                        const artist = track?.artist || 'Artist';
                        const plays = row.play_count || 0;
                        const duration = statsView.formatDuration(row.total_duration_ms || 0);
                        return `<div class="flex items-center justify-between py-2 border-b border-white/5 gap-3"><div class="min-w-0"><p class="text-white truncate">${utils.escapeHtml(title)}</p><p class="text-xs text-gray-400 truncate">${utils.escapeHtml(artist)}</p></div><div class="text-right flex-shrink-0"><p class="text-sm text-white">${plays} plays</p><p class="text-xs text-gray-400">${duration}</p></div></div>`;
                    }).join('')
                    : '<p class="text-sm text-gray-500">Play more songs to build track stats.</p>';
                const dailyHtml = daily.length
                    ? daily.map(row => `<div class="flex items-center justify-between py-2 border-b border-white/5"><span class="text-white">${utils.escapeHtml(row.day)}</span><span class="text-gray-400 text-sm">${row.play_count || 0} plays · ${statsView.formatDuration(row.total_duration_ms || 0)}</span></div>`).join('')
                    : '<p class="text-sm text-gray-500">Daily stats appear after cloud listening sessions are recorded.</p>';
                container.innerHTML = `
                    <section class="glass-panel rounded-2xl p-6">
                        <h3 class="text-lg font-bold text-white mb-4">Overview</h3>
                        <div class="grid grid-cols-2 gap-4">
                            <div class="rounded-xl bg-white/5 p-4"><p class="text-xs text-gray-400">Unique tracks</p><p class="text-2xl font-bold text-white">${summary.uniqueTracks || 0}</p></div>
                            <div class="rounded-xl bg-white/5 p-4"><p class="text-xs text-gray-400">Total plays</p><p class="text-2xl font-bold text-white">${summary.totalPlays || 0}</p></div>
                        </div>
                    </section>
                    <section class="glass-panel rounded-2xl p-6">
                        <h3 class="text-lg font-bold text-white mb-4">Top Artists</h3>
                        ${topArtistHtml}
                    </section>
                    <section class="glass-panel rounded-2xl p-6 lg:col-span-2">
                        <h3 class="text-lg font-bold text-white mb-4">Top Tracks</h3>
                        ${topTrackHtml}
                    </section>
                    <section class="glass-panel rounded-2xl p-6 lg:col-span-2">
                        <h3 class="text-lg font-bold text-white mb-4">Daily Listening</h3>
                        ${dailyHtml}
                    </section>`;
            },
            render: async () => {
                const container = document.getElementById('stats-content');
                if (!container) return;
                container.innerHTML = '<p class="text-gray-400">Loading stats...</p>';
                try {
                    if (cloudLibrary.session && window.dverse?.dtunes?.fetchListeningStats) {
                        const [topTracks, daily] = await Promise.all([
                            window.dverse.dtunes.fetchListeningStats(10),
                            window.dverse.dtunes.fetchListeningDaily(14)
                        ]);
                        const local = statsView.localSummary();
                        statsView.renderCards({
                            uniqueTracks: topTracks.length || local.uniqueTracks,
                            totalPlays: topTracks.reduce((sum, row) => sum + Number(row.play_count || 0), 0) || local.totalPlays,
                            topArtists: local.topArtists,
                            source: 'cloud'
                        }, topTracks, daily);
                        return;
                    }
                    statsView.renderCards(statsView.localSummary(), [], []);
                } catch (error) {
                    console.error('[Stats] Failed to render stats:', error);
                    statsView.renderCards(statsView.localSummary(), [], []);
                }
            }
        };

        const homeView = {
            loadGeneratedPlaylist: async (type = 'for-you', options = {}) => {
                const status = document.getElementById('generated-playlist-status');
                const forYouSection = document.getElementById('section-for-you');
                const forYouGrid = document.getElementById('for-you-grid');
                const forYouActions = document.getElementById('for-you-actions');
                const forYouCount = document.getElementById('for-you-count');
                if(status) status.textContent = `Finding ${type.replace(/-/g, ' ')} picks...`;
                const preferredLanguage = document.getElementById('preferred-language-select')?.value || localStorage.getItem('preferredLanguage') || '';
                const songs = window.recommendationClient ? await window.recommendationClient.fetchPlaylist(type, { limit: 25, language: preferredLanguage }) : [];
                if (songs.length === 0) {
                    if(status) status.textContent = 'Personalized picks are not ready yet. Keep listening or try again later.';
                    if (type === 'for-you') {
                        state.forYouSongs = [];
                        forYouSection?.classList.add('hidden');
                        forYouActions?.classList.add('hidden');
                    }
                    return [];
                }
                const tagged = songs.map(song => ({ ...song, source: 'recommendation', playlistType: type }));
                if (type === 'for-you') {
                    state.forYouSongs = tagged;
                    forYouSection?.classList.remove('hidden');
                    if (forYouGrid) forYouGrid.innerHTML = tagged.slice(0, 18).map(song => ui.createForYouCard(song)).join('');
                    forYouActions?.classList.remove('hidden');
                    if (forYouCount) forYouCount.textContent = `${tagged.length} songs ready for autoplay`;
                    if(status) status.textContent = 'For You is ready.';
                    if (!options.open) return tagged;
                }
                state.queue = tagged; state.userQueue = []; state.idx = 0; ui.renderQueue();
                ui.openGeneratedPlaylist(type.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), tagged);
                if(status) status.textContent = `Generated ${tagged.length} rule-based tracks.`;
                return tagged;
            },
            playForYou: async () => {
                const songs = state.forYouSongs.length ? state.forYouSongs : await homeView.loadGeneratedPlaylist('for-you');
                if (!songs || songs.length === 0) return;
                state.queue = [...songs]; state.userQueue = []; state.idx = 0; ui.renderQueue();
                player.playDirect(songs[0]);
                if (deviceMode.isMobileUI()) ui.toggleMobilePlayer(true);
                else if (!state.queueExpanded) ui.toggleQueue();
            },
            queueForYou: async () => {
                const songs = state.forYouSongs.length ? state.forYouSongs : await homeView.loadGeneratedPlaylist('for-you');
                if (!songs || songs.length === 0) return;
                state.queue = [...songs]; state.userQueue = []; state.idx = state.currentTrack ? -1 : 0; ui.renderQueue(); persist.save();
                if (!state.queueExpanded) ui.toggleQueue();
            },
            init: async () => {
                stripTouchHoverClasses();
                ui.updateProfileUI();
                const preferredLanguageSelect = document.getElementById('preferred-language-select');
                if (preferredLanguageSelect) preferredLanguageSelect.value = localStorage.getItem('preferredLanguage') || '';
                document.getElementById('setting-audio-quality').value = state.quality;
                ui.renderEqualizerSettings();
                
                ui.renderPlaylists(); ui.renderLibraryLists(); 
                const isNewUser = state.playHistory.length === 0;
                if (isNewUser) {
                    document.getElementById('section-trending').classList.remove('hidden');
                    const grid = document.getElementById('trending-grid');
                    grid.innerHTML = Array(16).fill('<div class="scroll-card h-[200px] rounded-xl glass-panel animate-pulse w-40 flex-shrink-0"></div>').join('');
                    const trendingSongs = await jiosaavnAPI.getTrending();
                    grid.innerHTML = trendingSongs.slice(0, 16).map(song => ui.createCard(song)).join('');
                } else {
                    document.getElementById('section-quick-picks').classList.remove('hidden');
                    document.getElementById('section-recent').classList.remove('hidden');
                    homeView.renderRecentlyPlayed(); homeView.generateQuickPicks(); homeView.loadGeneratedPlaylist('for-you');
                }
                updateMarquees();
            },
            renderRecentlyPlayed: () => {
                const grid = document.getElementById('recent-grid'); if(!grid) return;
                if(state.playHistory.length === 0) { grid.innerHTML = '<p class="text-gray-500 pl-8">Play some songs to see them here.</p>'; return; }
                grid.innerHTML = state.playHistory.slice(0, 8).map(song => ui.createCard(song)).join('');
                updateMarquees();
            },
            generateQuickPicks: async () => {
                const grid = document.getElementById('quick-picks-grid');
                grid.innerHTML = Array(16).fill('<div class="scroll-card h-[200px] rounded-xl glass-panel animate-pulse w-40 flex-shrink-0"></div>').join('');
                try {
                    const trending = await jiosaavnAPI.getTrending(); let picks = [...trending.slice(0, 6)]; 
                    const artists = Object.keys(state.artistPlayCounts).sort((a,b) => state.artistPlayCounts[b] - state.artistPlayCounts[a]).slice(0, 2);
                    for(const artist of artists) { const artistSongs = await jiosaavnAPI.searchSongs(artist, 5); picks = [...picks, ...artistSongs]; }
                    const uniquePicks = []; const seenIds = new Set();
                    for(const song of picks) { if(song && !seenIds.has(song.id)) { uniquePicks.push(song); seenIds.add(song.id); } }
                    uniquePicks.sort(() => Math.random() - 0.5); const finalPicks = uniquePicks.slice(0, 16);
                    grid.innerHTML = finalPicks.map(song => ui.createCard(song)).join('');
                    updateMarquees();
                } catch(e) { grid.innerHTML = '<p class="text-red-400 pl-8">Could not load Quick Picks.</p>'; }
            }
        };

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
                }
            });

            seekBar.addEventListener('change', () => {
                if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
                const nextTime = parseFloat(seekBar.value);
                if (!Number.isFinite(nextTime)) return;
                audio.currentTime = nextTime;
                updateMediaPosition();
                currentProgress = Math.max(0, Math.min(1, nextTime / audio.duration));
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

            // Expanded mobile player: let the sheet scroll to the queue, but collapse
            // when the user returns to the top or pulls down from the top.
            const playerFooter = document.getElementById('player-footer');
            let expandedPlayerLastScrollTop = 0;
            let expandedPlayerTouchStartY = 0;
            let expandedPlayerStartedAtTop = false;

            const resetExpandedPlayerScroll = () => {
                expandedPlayerLastScrollTop = 0;
                if (playerFooter) playerFooter.scrollTop = 0;
            };

            playerFooter?.addEventListener('scroll', () => {
                if (!deviceMode.isMobileUI() || !document.body.classList.contains('mobile-player-open')) return;
                const currentTop = playerFooter.scrollTop;
                if (expandedPlayerLastScrollTop > 72 && currentTop <= 2) {
                    ui.toggleMobilePlayer(false);
                    return;
                }
                expandedPlayerLastScrollTop = currentTop;
            }, {passive: true});

            playerFooter?.addEventListener('touchstart', e => {
                if (!deviceMode.isMobileUI() || !document.body.classList.contains('mobile-player-open')) return;
                expandedPlayerTouchStartY = e.changedTouches[0].clientY;
                expandedPlayerStartedAtTop = playerFooter.scrollTop <= 2;
            }, {passive: true});

            playerFooter?.addEventListener('touchmove', e => {
                if (!deviceMode.isMobileUI() || !document.body.classList.contains('mobile-player-open') || !expandedPlayerStartedAtTop) return;
                const pullDistance = e.changedTouches[0].clientY - expandedPlayerTouchStartY;
                if (pullDistance > 58) {
                    expandedPlayerStartedAtTop = false;
                    haptics.pulse('soft');
                    ui.toggleMobilePlayer(false);
                }
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
                    swipeSongStart.row.classList.toggle('swipe-show-next', dx < -14);
                    swipeSongStart.row.classList.toggle('swipe-show-queue', dx > 14);
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
                if (Math.abs(dx) > 72 && Math.abs(dx) > Math.abs(dy) * 1.2) {
                    const song = songStore.get(row.dataset.storeId);
                    if (!song) return;
                    const addNext = dx < 0;
                    const commitClass = addNext ? 'swipe-committed-next' : 'swipe-committed-queue';
                    row.classList.add(commitClass);
                    row.style.setProperty('--song-swipe-x', addNext ? '-115%' : '115%');
                    if (addNext) player.addNext(song); else player.addToQueue(song);
                    haptics.pulse('medium');
                    setTimeout(() => { row.classList.remove(commitClass); row.style.setProperty('--song-swipe-x', '0px'); row.style.setProperty('--swipe-scale', '0'); }, 420);
                    e.preventDefault();
                }
            }, { passive: false });

            let lastPersistSecond = -1;
            audio.addEventListener('timeupdate', () => {
                if (window.listeningSession) listeningSession.update();
                if (Number.isFinite(audio.duration) && audio.duration > 0 && !state.isDragging) {
                    seekBar.max = audio.duration; seekBar.value = audio.currentTime;
                    currentProgress = audio.currentTime / audio.duration;
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

                    // Morphing 10s Preview Logic 
                    const timeRemaining = audio.duration - audio.currentTime;
                    const hasNext = Boolean(getUpcomingTrack());
                    const wrap = document.getElementById('queue-wrapper');
                    
                    if (timeRemaining <= 10 && timeRemaining > 0 && hasNext) {
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
                if (state.currentTrack && recommendationEvents.completedSongId !== state.currentTrack.id) {
                    recommendationEvents.completedSongId = state.currentTrack.id;
                    recommendationEvents.record('play_complete', state.currentTrack, {
                        playDurationSeconds: Math.floor(audio.duration || audio.currentTime || 0),
                        songDurationSeconds: Math.floor(audio.duration || 0),
                    });
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

            // Keyboard Shortcuts
            document.addEventListener('keydown', (e) => {
                if(e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
                switch(e.key.toLowerCase()) {
                    case ' ': e.preventDefault(); player.togglePlay(); break;
                    case 'arrowleft':
                    case 'a': player.prev(); break;
                    case 'arrowright':
                    case 'd': player.next(); break;
                    case 'q': ui.toggleQueue(); break;
                    case 'e': 
                    case '/': e.preventDefault(); document.getElementById('search-input').focus(); break;
                    case 'w': player.setVolume(audio.volume + 0.1); break;
                    case 's': player.setVolume(audio.volume - 0.1); break;
                }
            });

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

            ctxMenu.init(); searchManager.init(); persist.load(); ui.updateRepeatBtn(); ui.updateShuffleBtn(); homeView.init(); cloudLibrary.init(); requestAnimationFrame(viz.render);
            deviceMode.apply();
            
            window.addEventListener('resize', () => { deviceMode.apply(); ui.updateMobileSearchPosition(); updateMarquees(); });
        }

        initApp();
