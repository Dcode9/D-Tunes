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
            },
            formatTime: (secs) => {
                if (isNaN(secs) || secs < 0) return '0:00';
                const m = Math.floor(secs / 60);
                const s = Math.floor(secs % 60);
                return `${m}:${s.toString().padStart(2, '0')}`;
            },
            cleanTitle: (rawTitle = '', album = '') => {
                let t = utils.decodeHtml(rawTitle || '').toLowerCase();
                if (album) {
                    const albClean = utils.decodeHtml(album).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').trim();
                    if (albClean.length > 2) {
                        const escaped = albClean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        t = t.replace(new RegExp(`[\\(\\[\\{]\\s*(?:from\\s+)?["']?${escaped}["']?\\s*[\\)\\]\\}]`, 'gi'), ' ');
                        t = t.replace(new RegExp(`\\s*-\\s*(?:from\\s+)?["']?${escaped}["']?.*$`, 'gi'), ' ');
                    }
                }
                t = t.replace(/\s*[\(\[\{]\s*(?:from\s+["']?[^()\[\]]+["']?|original\s+motion\s+picture\s+soundtrack|original\s+soundtrack|soundtrack\s+version|ost\s+version|ost|(?:official\s+)?(?:music\s+)?video|(?:official\s+)?(?:music\s+)?audio|video\s+song|audio\s+song|full\s+song|lyric\s+video|lyrics|official|clean|explicit|deluxe(?:\s+edition)?|bonus\s+track|single\s+version|album\s+version|remaster(?:ed)?(?:\s+\d+)?)\s*[\)\]\}]/gi, ' ');
                t = t.replace(/\s*-\s*(?:from\s+["']?[^-\n]+["']?|soundtrack(?:\s+version)?|single\s+version|album\s+version|(?:official\s+)?(?:music\s+)?(?:audio|video)|remaster(?:ed)?(?:\s+\d+)?).*$/i, ' ');
                t = t.replace(/\s*[\(\[\{]?(?:feat\.?|ft\.?|featuring|with)\s+[^()\[\]]+[\)\]\}]?/gi, ' ');
                return t.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
            },
            getTitleRoot: (rawTitle = '') => {
                let t = utils.decodeHtml(rawTitle || '').toLowerCase();
                const idx = t.search(/[\(\[\{\-]/);
                if (idx > 0) t = t.slice(0, idx);
                return t.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
            },
            getArtistTokens: (rawArtist = '') => {
                let a = utils.decodeHtml(rawArtist || '').toLowerCase();
                return a.split(/[,&/|]/)
                    .map((p) => p.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim())
                    .filter((p) => p.length > 1);
            },
            areDuplicateTracks: (songA, songB) => {
                if (!songA || !songB) return false;
                const idA = String(songA.id || songA.saavn_id || '');
                const idB = String(songB.id || songB.saavn_id || '');
                if (idA && idB && idA === idB) return true;

                const rawTitleA = songA.name || songA.title || '';
                const rawTitleB = songB.name || songB.title || '';
                if (!rawTitleA || !rawTitleB) return false;

                const altRegex = /remix|acoustic|lofi|lo-fi|live|slowed|sped up|orchestral|piano|instrumental|karaoke|club mix/i;
                const isAltA = altRegex.test(rawTitleA);
                const isAltB = altRegex.test(rawTitleB);
                if (isAltA !== isAltB) return false;

                const durA = Number(songA.duration || songA.duration_seconds || 0);
                const durB = Number(songB.duration || songB.duration_seconds || 0);
                const durationMatches = durA === 0 || durB === 0 || Math.abs(durA - durB) <= 8;

                const titleA = utils.cleanTitle(rawTitleA, songA.album);
                const titleB = utils.cleanTitle(rawTitleB, songB.album);
                const rootA = utils.getTitleRoot(rawTitleA);
                const rootB = utils.getTitleRoot(rawTitleB);

                const isExactTitle = titleA && titleB && titleA === titleB;
                const isRootMatch = durationMatches && rootA && rootB && rootA.length >= 3 && rootB.length >= 3 && (rootA === rootB || titleA.startsWith(rootB) || titleB.startsWith(rootA));

                if (!isExactTitle && !isRootMatch) return false;

                const artistsA = utils.getArtistTokens(songA.artist || songA.primary_artists || songA.primaryArtists || '');
                const artistsB = utils.getArtistTokens(songB.artist || songB.primary_artists || songB.primaryArtists || '');

                if (!artistsA.length || !artistsB.length) return durationMatches;

                const sharedArtist = artistsA.some((a) => artistsB.some((b) => a === b || a.includes(b) || b.includes(a)));
                return sharedArtist && durationMatches;
            },
            deduplicateSongs: (songs = []) => {
                if (!Array.isArray(songs)) return [];
                const result = [];
                for (const song of songs) {
                    if (!song) continue;
                    const existingIndex = result.findIndex((existing) => utils.areDuplicateTracks(existing, song));
                    if (existingIndex === -1) {
                        result.push(song);
                    } else {
                        const existing = result[existingIndex];
                        if (!existing.url && song.url) {
                            result[existingIndex] = { ...existing, ...song };
                        }
                    }
                }
                return result;
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

        let marqueeUpdateScheduled = false;
        const updateMarquees = () => {
            if (marqueeUpdateScheduled) return;
            marqueeUpdateScheduled = true;
            requestAnimationFrame(() => {
                marqueeUpdateScheduled = false;
                if (typeof window.__stripTouchHoverClasses === 'function') window.__stripTouchHoverClasses();
                const containers = document.querySelectorAll('.marquee-container');
                const updates = [];

                for (let i = 0; i < containers.length; i++) {
                    const container = containers[i];
                    if (container.offsetParent === null) continue;
                    const text = container.querySelector('.marquee-text');
                    if (!text) continue;

                    const scrollW = text.scrollWidth;
                    const clientW = container.clientWidth;

                    if (text.classList.contains('is-overflowing') && 
                        text.dataset.scrollWidth === String(scrollW) && 
                        container.dataset.clientWidth === String(clientW)) {
                        continue;
                    }

                    updates.push({ container, text, scrollW, clientW });
                }

                for (let i = 0; i < updates.length; i++) {
                    const { container, text, scrollW, clientW } = updates[i];
                    if (Math.ceil(scrollW) > Math.ceil(clientW) + 2) {
                        const dist = Math.ceil(scrollW - clientW + 8);
                        const dur = Math.max(3.5, dist / 18);
                        text.style.setProperty('--scroll-dist', `-${dist}px`);
                        text.style.setProperty('--scroll-dur', `${dur}s`);
                        text.dataset.scrollWidth = String(scrollW);
                        container.dataset.clientWidth = String(clientW);
                        text.classList.add('is-overflowing');
                        container.classList.add('is-overflowing');
                    } else {
                        text.classList.remove('is-overflowing');
                        container.classList.remove('is-overflowing');
                        text.dataset.scrollWidth = String(scrollW);
                        container.dataset.clientWidth = String(clientW);
                    }
                }
            });
        };

        // ============================================
        // JIOSAAVN API CORE
        // ============================================
        const JIOSAAVN_API_ENDPOINTS = ['https://jiosaavn-api-taupe-phi.vercel.app/api'];
        let currentApiIndex = 0; let JIOSAAVN_API = JIOSAAVN_API_ENDPOINTS[currentApiIndex];
        function switchToNextApi() { currentApiIndex = (currentApiIndex + 1) % JIOSAAVN_API_ENDPOINTS.length; JIOSAAVN_API = JIOSAAVN_API_ENDPOINTS[currentApiIndex]; return currentApiIndex !== 0; }

        const clientSearchCache = new Map();

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
                const normalizedQ = (query || '').toLowerCase().trim();
                if (!normalizedQ) return [];
                const cacheKey = `${normalizedQ}:${limit}`;
                if (clientSearchCache.has(cacheKey)) return clientSearchCache.get(cacheKey);

                try {
                    const fetchCount = Math.max(limit * 2, 20);
                    const data = await jiosaavnAPI.fetchWithRetry(`${JIOSAAVN_API}/search/songs?query=${encodeURIComponent(query)}&limit=${fetchCount}`);
                    const songs = (data.data?.results || []).map(jiosaavnAPI.normalizeSong).filter(Boolean);
                    const result = utils.deduplicateSongs(songs).slice(0, limit);
                    clientSearchCache.set(cacheKey, result);
                    if (clientSearchCache.size > 120) {
                        const oldest = clientSearchCache.keys().next().value;
                        if (oldest) clientSearchCache.delete(oldest);
                    }
                    return result;
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
                    const [songsRaw, albums, artists] = await Promise.all([
                        jiosaavnAPI.searchSongs(query, 12),
                        jiosaavnAPI.searchAlbums(query),
                        jiosaavnAPI.searchArtists(query)
                    ]);
                    const songs = utils.deduplicateSongs(songsRaw);
                    if (songs.length === 0) return { top: null, songs: [], albums: [], artists: [] };
                    const top = songs[0];
                    const remainingSongs = songs.slice(1).filter(s => !utils.areDuplicateTracks(s, top)).slice(0, 6);
                    return { top, songs: remainingSongs, albums, artists };
                } catch(e) { return { top: null, songs: [], albums: [], artists: [] }; }
            },
            getTrending: async (limit = 25) => {
                const trendingPlaylists = ['47599074', '1297282877', '1261305331', '158221835'];
                const allSongs = [];
                for (const plId of trendingPlaylists) {
                    try {
                        const data = await jiosaavnAPI.fetchWithRetry(`${JIOSAAVN_API}/playlists?id=${plId}`);
                        if (data.data?.songs) {
                            const songs = data.data.songs.map(jiosaavnAPI.normalizeSong).filter(Boolean);
                            allSongs.push(...songs);
                        }
                        if (allSongs.length >= limit * 2) break;
                    } catch (e) {}
                }
                if (allSongs.length < limit) {
                    try {
                        const fallback = await jiosaavnAPI.searchSongs('Top Bollywood Hits 2026', limit);
                        allSongs.push(...fallback);
                    } catch (e) {}
                }
                return utils.deduplicateSongs(allSongs).slice(0, limit);
            },
            getSongSuggestions: async (id, limit = 20) => {
                try {
                    const data = await jiosaavnAPI.fetchWithRetry(`${JIOSAAVN_API}/songs/${encodeURIComponent(id)}/suggestions`);
                    const list = Array.isArray(data.data) ? data.data : (data.data?.results || []);
                    const songs = list.map(jiosaavnAPI.normalizeSong).filter(s => s && String(s.id) !== String(id));
                    return utils.deduplicateSongs(songs).slice(0, limit);
                } catch (e) { return []; }
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

        const spotifyImporterWeb = {
            matchedSongs: [],
            playlistTitle: 'Imported Spotify Playlist',
            pasteFromClipboard: async () => {
                try {
                    const text = await navigator.clipboard.readText();
                    const input = document.getElementById('sp-link-input');
                    if (input && text) input.value = text.trim();
                } catch (e) {
                    console.warn('Clipboard read failed', e);
                }
            },
            extractTracksFromInput: async (input) => {
                const trimmed = input.trim();
                const spotifyUrlRegex = /(?:https?:\/\/)?(?:open\.spotify\.com\/(?:embed\/)?|spotify:)(playlist|album|track)[/:]([a-zA-Z0-9]+)/i;
                const match = trimmed.match(spotifyUrlRegex);
                let title = "Imported Spotify List";
                let tracks = [];

                if (match) {
                    const type = match[1].toLowerCase();
                    const id = match[2];
                    try {
                        const embedUrl = `https://open.spotify.com/embed/${type}/${id}`;
                        const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(embedUrl)}`).catch(() => null);
                        if (res && res.ok) {
                            const html = await res.text();
                            const scriptMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
                            if (scriptMatch && scriptMatch[1]) {
                                const json = JSON.parse(scriptMatch[1]);
                                const pageProps = json.props?.pageProps;
                                const stateData = pageProps?.state?.data;
                                const entity = stateData?.entity || pageProps?.entity || stateData?.[type];
                                if (entity) {
                                    title = entity.name || entity.title || `Spotify ${type}`;
                                    const trackList = entity.trackList;
                                    if (Array.isArray(trackList)) {
                                        tracks = trackList.map(t => {
                                            const songTitle = t.title || t.name || '';
                                            const subtitle = t.subtitle || (Array.isArray(t.artists) ? t.artists.map(a => a.name).join(', ') : '');
                                            return { title: songTitle, artist: subtitle };
                                        }).filter(t => t.title);
                                    } else if (type === 'track') {
                                        tracks = [{
                                            title: entity.name || entity.title || '',
                                            artist: entity.subtitle || (Array.isArray(entity.artists) ? entity.artists.map(a => a.name).join(', ') : '')
                                        }];
                                    }
                                }
                            }
                        }
                    } catch (err) {
                        console.warn('[SpotifyImporter] Embed parse fallback', err);
                    }
                }

                if (tracks.length === 0) {
                    const lines = trimmed.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                    tracks = lines.map(line => {
                        if (line.includes(' - ')) {
                            const parts = line.split(' - ');
                            return { title: parts[1].trim(), artist: parts[0].trim() };
                        } else if (/ by /i.test(line)) {
                            const parts = line.split(/ by /i);
                            return { title: parts[0].trim(), artist: parts[1].trim() };
                        }
                        return { title: line, artist: '' };
                    });
                }

                return { title, tracks };
            },
            startImport: async () => {
                const inputEl = document.getElementById('sp-link-input');
                const raw = inputEl ? inputEl.value.trim() : '';
                if (!raw) return;

                const btn = document.getElementById('btn-start-spotify-import');
                if (btn) btn.disabled = true;

                const matchSection = document.getElementById('sp-match-section');
                const actionsBar = document.getElementById('sp-actions-bar');
                const listEl = document.getElementById('sp-matched-tracks-list');
                const titleEl = document.getElementById('sp-imported-title');
                const counterEl = document.getElementById('sp-match-counter');
                const spinner = document.getElementById('sp-match-spinner');

                matchSection.classList.remove('hidden');
                matchSection.classList.add('flex');
                actionsBar.classList.add('hidden');
                listEl.innerHTML = '';
                if (spinner) spinner.classList.remove('hidden');

                const extracted = await spotifyImporterWeb.extractTracksFromInput(raw);
                spotifyImporterWeb.playlistTitle = extracted.title || 'Imported Playlist';
                if (titleEl) titleEl.textContent = spotifyImporterWeb.playlistTitle;

                const tracks = extracted.tracks;
                if (tracks.length === 0) {
                    listEl.innerHTML = '<div class="text-xs text-red-400 py-3 text-center">No tracks could be found. Please check your link or paste song titles.</div>';
                    if (btn) btn.disabled = false;
                    if (spinner) spinner.classList.add('hidden');
                    return;
                }

                spotifyImporterWeb.matchedSongs = [];
                listEl.innerHTML = tracks.map((t, idx) => `
                    <div id="sp-item-${idx}" class="sp-track-item flex items-center justify-between p-2 rounded-xl bg-white/5 border border-white/5 text-xs">
                        <div class="flex items-center gap-2.5 min-w-0">
                            <span class="w-5 text-gray-500 font-mono text-[10px] text-center">${idx + 1}</span>
                            <div class="min-w-0">
                                <p class="font-bold text-white truncate">${utils.escapeHtml(t.title)}</p>
                                <p class="text-[11px] text-gray-400 truncate">${utils.escapeHtml(t.artist || 'Searching...')}</p>
                            </div>
                        </div>
                        <span id="sp-status-${idx}" class="sp-badge-searching px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0">Searching</span>
                    </div>
                `).join('');

                let matchedCount = 0;
                for (let i = 0; i < tracks.length; i++) {
                    const track = tracks[i];
                    const statusEl = document.getElementById(`sp-status-${i}`);
                    const query = track.artist ? `${track.title} ${track.artist}` : track.title;

                    if (counterEl) counterEl.textContent = `Matching ${i + 1} / ${tracks.length} tracks...`;

                    try {
                        const results = await jiosaavnAPI.searchSongs(query, 5);
                        const best = results && results.length > 0 ? results[0] : null;
                        if (best) {
                            spotifyImporterWeb.matchedSongs.push(best);
                            songStore.add(best);
                            matchedCount++;
                            if (statusEl) {
                                statusEl.className = 'sp-badge-matched px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0 flex items-center gap-1';
                                statusEl.innerHTML = `✓ Matched`;
                            }
                        } else {
                            if (statusEl) {
                                statusEl.className = 'sp-badge-error px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0';
                                statusEl.textContent = 'Not found';
                            }
                        }
                    } catch (e) {
                        if (statusEl) {
                            statusEl.className = 'sp-badge-error px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0';
                            statusEl.textContent = 'Error';
                        }
                    }
                }

                if (counterEl) counterEl.textContent = `Matched ${matchedCount} of ${tracks.length} tracks`;
                if (spinner) spinner.classList.add('hidden');
                if (btn) btn.disabled = false;
                actionsBar.classList.remove('hidden');
                actionsBar.classList.add('flex');
            },
            playImported: () => {
                if (spotifyImporterWeb.matchedSongs.length === 0) return;
                state.queue = [...spotifyImporterWeb.matchedSongs];
                state.userQueue = [];
                state.idx = 0;
                player.playDirect(state.queue[0]);
                ui.toggleSpotifyModal(false);
                ui.renderQueue();
            },
            saveAsPlaylist: async () => {
                if (spotifyImporterWeb.matchedSongs.length === 0) return;
                const name = spotifyImporterWeb.playlistTitle || 'Spotify Import';
                state.playlists[name] = [...spotifyImporterWeb.matchedSongs];
                localStorage.setItem('playlists', JSON.stringify(state.playlists));
                if (window.cloudLibrary && cloudLibrary.savePlaylist) {
                    cloudLibrary.savePlaylist(name);
                }
                ui.toggleSpotifyModal(false);
                ui.renderPlaylists();
                ui.openPlaylist(name);
            }
        };
        window.spotifyImporterWeb = spotifyImporterWeb;

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
                if (sleepTimer.isFading && typeof audio !== 'undefined' && audio) {
                    audio.volume = sleepTimer.originalVolume;
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
                if (sleepTimer.isFading && typeof audio !== 'undefined' && audio) {
                    sleepTimer.isFading = false;
                    audio.volume = sleepTimer.originalVolume;
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
                if (remainingMs <= sleepTimer.fadeDurationMs && typeof audio !== 'undefined' && audio) {
                    sleepTimer.isFading = true;
                    const fraction = remainingMs / sleepTimer.fadeDurationMs;
                    audio.volume = Math.max(0, Math.min(1, sleepTimer.originalVolume * fraction));
                }

                sleepTimer.updateUI(remainingMs);
            },

            finish: () => {
                sleepTimer.cancel();
                if (typeof player !== 'undefined' && player.pause) player.pause();
                if (typeof audio !== 'undefined' && audio) audio.volume = sleepTimer.originalVolume;
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
            libraryIds: safeStorage.getJSON('libraryIds', []),
            likedArtists: safeStorage.getJSON('likedArtists', []),
            playHistory: safeStorage.getJSON('playHistory', []),
            artistPlayCounts: safeStorage.getJSON('artistPlayCounts', {}),
            playlists: safeStorage.getJSON('playlists', {}),
            playlistStyles: safeStorage.getJSON('playlistStyles', {}),
            username: safeStorage.get('username', 'Guest User'),
            avatarUrl: safeStorage.get('avatarUrl', ''),
            quality: safeStorage.get('audioQuality', 'high'),
            equalizer: normalizeEqualizerSettings(safeStorage.getJSON('equalizerSettings', {})),
            forYouSongs: [],
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
                const displayName = meta.full_name || meta.name || identityMeta.full_name || identityMeta.name || (email ? email.split('@')[0] : '') || state.username || "D'Verse User";
                const avatarUrl = meta.avatar_url || meta.picture || identityMeta.avatar_url || identityMeta.picture || meta.avatar || identityMeta.avatar || state.avatarUrl || '';

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

                    // If avatar wasn't included in the initial session JWT, asynchronously fetch full profile from Supabase
                    if (!avatarUrl && window.dverse?.supabase?.auth && !cloudLibrary._fetchingUserMeta) {
                        cloudLibrary._fetchingUserMeta = true;
                        window.dverse.supabase.auth.getUser().then(({ data }) => {
                            cloudLibrary._fetchingUserMeta = false;
                            const u = data?.user;
                            const m = u?.user_metadata || u?.raw_user_meta_data || {};
                            const im = u?.identities?.[0]?.identity_data || {};
                            const fetchedAvatar = m.avatar_url || m.picture || im.avatar_url || im.picture || '';
                            if (fetchedAvatar && fetchedAvatar !== state.avatarUrl) {
                                state.avatarUrl = fetchedAvatar;
                                try { localStorage.setItem('avatarUrl', fetchedAvatar); } catch (_) {}
                                if (cloudLibrary.session && cloudLibrary.session.user) {
                                    cloudLibrary.session.user.user_metadata = { ...m, avatar_url: fetchedAvatar };
                                }
                                cloudLibrary.updateUI();
                            }
                        }).catch(() => {
                            cloudLibrary._fetchingUserMeta = false;
                        });
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
                    'playHistory', 'artistPlayCounts', 'recentSearches', 'username', 'avatarUrl',
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
                state.artistPlayCounts = {};
                state.playlists = {};
                state.playlistStyles = {};
                state.username = 'Guest User';
                state.avatarUrl = '';
                state.forYouSongs = [];
                state.queueExpanded = false;
                if (typeof songStore !== 'undefined' && songStore.clear) songStore.clear();

                cloudLibrary.session = null;
                cloudLibrary.user = null;

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
                window.dverse.onAuthStateChange(async (_event, session) => {
                    cloudLibrary.session = session;
                    cloudLibrary.updateUI();
                    if (session) await cloudLibrary.load();
                });
                try {
                    const session = await window.dverse.getSession();
                    cloudLibrary.session = session;
                    cloudLibrary.updateUI();
                    if (session) await cloudLibrary.load();
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
                    const [historyRes, likesRes, libraryRes, playlistsRes, playbackRes] = await Promise.allSettled([
                        window.dverse.dtunes.listHistory(),
                        window.dverse.dtunes.listLikes(),
                        window.dverse.dtunes.listLibrary(),
                        window.dverse.dtunes.listPlaylists(),
                        window.dverse.dtunes.getPlaybackState()
                    ]);

                    const history = historyRes.status === 'fulfilled' ? historyRes.value : [];
                    const likes = likesRes.status === 'fulfilled' ? likesRes.value : [];
                    const library = libraryRes.status === 'fulfilled' ? libraryRes.value : [];
                    const playlists = playlistsRes.status === 'fulfilled' ? playlistsRes.value : [];
                    const playbackState = playbackRes.status === 'fulfilled' ? playbackRes.value : null;

                    if (history && history.length > 0) {
                        state.playHistory = cloudLibrary.compactSongs([...(history || []), ...state.playHistory]).slice(0, 100);
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
                    homeView.renderRecentlyPlayed();
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
                    cloudLibrary.updateUI();
                } catch (error) {
                    console.error('[DVerse] DTunes sync failed:', error);
                    cloudLibrary.setStatus(error?.message || 'Could not sync D\'Tunes library.');
                } finally {
                    cloudLibrary.syncing = false;
                    if (cloudLibrary.pendingSync) {
                        cloudLibrary.pendingSync = false;
                        cloudLibrary.load();
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
                const cmPlNext = document.getElementById('cm-pl-play-next');
                if (cmPlNext) cmPlNext.onclick = () => { player.addPlaylistNext(ctxMenu.activePlaylistName); };
                const cmPlQueue = document.getElementById('cm-pl-add-queue');
                if (cmPlQueue) cmPlQueue.onclick = () => { player.addPlaylistToQueue(ctxMenu.activePlaylistName); };
                const cmPlEdit = document.getElementById('cm-pl-edit');
                if (cmPlEdit) cmPlEdit.onclick = () => { ui.openPlaylistEditor(ctxMenu.activePlaylistName); };
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

                    await audio.play();
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
                        const freshDetails = await jiosaavnAPI.getSong(track.id);
                        if (currentRequestId !== playRequestId) return;

                        const playUrl = freshDetails?.url || track.url;
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

        // ============================================
        // VISUALIZER & AUDIO ENGINE
        // ============================================
        let audioContext, analyser, source, preAmpGain, masterLimiter, eqFilters = {}, isAudioContextInitialized = false;
        let analyserData = null;
        let smoothedLow = 0, smoothedMid = 0, currentProgress = 0, time = 0, hoverIntensity = 0; let visualizerCtx;
        let vizCanvas = null, vizSeekTrack = null, lastClipProgress = -1;
        let resizeCanvas = () => {};

        const applyEqualizer = () => {
            if (!isAudioContextInitialized || !audioContext) return;
            const now = audioContext.currentTime;

            let maxPositiveGain = 0;
            let positiveGainSum = 0;

            EQ_BANDS.forEach((band) => {
                const val = Number(state.equalizer[band.key] || 0);
                if (val > 0) {
                    if (val > maxPositiveGain) maxPositiveGain = val;
                    positiveGainSum += val;
                }
                if (eqFilters[band.key]) {
                    // Smooth exponential transition prevents zipper noise and pops
                    eqFilters[band.key].gain.setTargetAtTime(val, now, 0.02);
                }
            });

            // Dynamic Headroom Staging:
            // When boosting bass (e.g. +6dB to +12dB), automatically trim pre-amp gain
            // so signal peaks never exceed 0dBFS before hitting the limiter.
            let targetPreAmpDb = 0;
            if (maxPositiveGain > 0) {
                targetPreAmpDb = -(maxPositiveGain * 0.7 + (positiveGainSum - maxPositiveGain) * 0.12);
                targetPreAmpDb = Math.max(-12, Math.min(0, targetPreAmpDb));
            }

            if (preAmpGain) {
                const linearPreAmp = Math.pow(10, targetPreAmpDb / 20);
                preAmpGain.gain.setTargetAtTime(linearPreAmp, now, 0.02);
            }

            if (ui && typeof ui.updateEqualizerMonitoring === 'function') {
                ui.updateEqualizerMonitoring(targetPreAmpDb);
            }
        };

        function setupAudioContext() {
            if (isMobileDevice) return; // Do not attach Web Audio API on mobile as it mutes audio in background and silent mode
            if (isAudioContextInitialized) {
                if (audioContext && audioContext.state === 'suspended') {
                    audioContext.resume().catch(() => {});
                }
                return;
            }
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (!AudioCtx) return;
                audioContext = new AudioCtx();
                if (audioContext.state === 'suspended') {
                    audioContext.resume().catch(() => {});
                }
                
                analyser = audioContext.createAnalyser();
                analyser.fftSize = 256;
                analyser.smoothingTimeConstant = 0.8;
                
                source = audioContext.createMediaElementSource(audio);
                
                // 1. Dynamic Headroom Pre-Amp Stage
                preAmpGain = audioContext.createGain();
                preAmpGain.gain.setValueAtTime(1.0, audioContext.currentTime);
                
                let previousNode = source;
                previousNode.connect(preAmpGain);
                previousNode = preAmpGain;
                
                // 2. 10-Band Studio Equalizer Chain with musical Q
                eqFilters = {};
                EQ_BANDS.forEach((band) => {
                    const filter = audioContext.createBiquadFilter();
                    filter.type = band.type;
                    filter.frequency.setValueAtTime(band.frequency, audioContext.currentTime);
                    filter.Q.setValueAtTime(band.q || (band.type === 'peaking' ? 1.414 : 0.707), audioContext.currentTime);
                    filter.gain.setValueAtTime(Number(state.equalizer[band.key] || 0), audioContext.currentTime);
                    
                    eqFilters[band.key] = filter;
                    previousNode.connect(filter);
                    previousNode = filter;
                });
                
                // 3. Studio Mastering Peak Limiter & Anti-Clipping Dynamics Compressor
                masterLimiter = audioContext.createDynamicsCompressor();
                masterLimiter.threshold.setValueAtTime(-0.8, audioContext.currentTime);
                masterLimiter.knee.setValueAtTime(3.0, audioContext.currentTime);
                masterLimiter.ratio.setValueAtTime(20.0, audioContext.currentTime);
                masterLimiter.attack.setValueAtTime(0.002, audioContext.currentTime);
                masterLimiter.release.setValueAtTime(0.050, audioContext.currentTime);
                
                previousNode.connect(masterLimiter);
                masterLimiter.connect(analyser);
                analyser.connect(audioContext.destination);
                
                analyserData = new Uint8Array(analyser.frequencyBinCount);
                isAudioContextInitialized = true;
                
                applyEqualizer();
            } catch(e) {
                console.warn('[DTunes] AudioContext setup notice, falling back to direct audio:', e);
                isAudioContextInitialized = false;
            }
        }
        // Visualizer frequency bin ranges: bins 0-4 = bass/low, bins 10-39 = mid frequencies.
        const VIZ_LOW_BINS_END = 5, VIZ_MID_BINS_START = 10, VIZ_MID_BINS_END = 40;
        const VIZ_SILENCE_THRESHOLD = 0.001;
        let isVizLoopRunning = false;
        const viz = {
            start: () => {
                if (!isVizLoopRunning) {
                    isVizLoopRunning = true;
                    requestAnimationFrame(viz.render);
                }
            },
            render: () => {
                if (!state.loaded) {
                    isVizLoopRunning = false;
                    return;
                }
                const canvas = vizCanvas; const dpr = Math.min(window.devicePixelRatio || 1, 2);
                if (!canvas || !visualizerCtx) {
                    isVizLoopRunning = false;
                    return;
                }
                const width = canvas.width / dpr; const height = canvas.height / dpr; const centerY = height / 2; visualizerCtx.clearRect(0, 0, width, height);
                // Always update the clip-path so the progress line stays visible
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
                    // Paused: decay the wave to flat
                    smoothedLow += (0 - smoothedLow) * 0.15; smoothedMid += (0 - smoothedMid) * 0.15;
                    if (smoothedLow < VIZ_SILENCE_THRESHOLD && smoothedMid < VIZ_SILENCE_THRESHOLD) {
                        visualizerCtx.beginPath();
                        visualizerCtx.moveTo(0, centerY);
                        visualizerCtx.lineTo(width, centerY);
                        visualizerCtx.lineWidth = 2;
                        visualizerCtx.strokeStyle = '#fff';
                        visualizerCtx.shadowColor = 'transparent';
                        visualizerCtx.shadowBlur = 0;
                        visualizerCtx.stroke();
                        isVizLoopRunning = false;
                        return; // Successfully settled: pause the rAF loop to save CPU & battery!
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
                
                requestAnimationFrame(viz.render);
            }
        };

        // ============================================
        // DYNAMIC PALETTE & AMBIENT THEME
        // ============================================
        function updateThemeColor(hexOrRgb) {
            let meta = document.querySelector('meta[name="theme-color"]');
            if (!meta) {
                meta = document.createElement('meta');
                meta.name = 'theme-color';
                document.head.appendChild(meta);
            }
            meta.content = hexOrRgb || '#050505';
        }

        function applyDynamicTrackTheme(imgEl) {
            if (!imgEl) return;
            try {
                let color = [34, 211, 238]; // default cyan
                if (typeof ColorThief !== 'undefined' && imgEl.complete && imgEl.naturalWidth > 0) {
                    try {
                        const thief = new ColorThief();
                        const extracted = thief.getColor(imgEl);
                        if (extracted && extracted.length === 3) color = extracted;
                    } catch (_) {}
                }
                const rgbStr = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
                const hexStr = `#${color.map(x => Math.min(255, Math.max(0, x)).toString(16).padStart(2, '0')).join('')}`;
                document.documentElement.style.setProperty('--album-art-gradient', `conic-gradient(from 0deg, ${rgbStr}, #050505, ${rgbStr})`);
                
                const bgPlaying = document.getElementById('background-playing');
                if (bgPlaying) {
                    bgPlaying.style.background = `radial-gradient(ellipse at 80% 90%, rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.32) 0%, rgba(5,5,5,0) 70%), radial-gradient(ellipse at 20% 20%, rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.18) 0%, rgba(5,5,5,0) 65%)`;
                    bgPlaying.style.opacity = '1';
                }

                const lyricsGlow = document.getElementById('lyrics-modal-glow');
                if (lyricsGlow) {
                    lyricsGlow.style.backgroundColor = rgbStr;
                }

                updateThemeColor(hexStr);
            } catch (_) {}
        }

        // ============================================
        // LYRICS ENGINE & REAL-TIME SYNC
        // ============================================
        const lyricsManager = {
            currentLyrics: null,
            activeLineIndex: -1,
            isLoading: false,
            cache: new Map(),

            cleanTitle: (title = '') => {
                return String(title)
                    .replace(/\s*[\(\[](?:from|feat\.?|featuring|with|prod\.?|official|video|audio|remix|version|deluxe|soundtrack|ost)[^\)\]]*[\)\]]/gi, '')
                    .replace(/\s*-\s*(?:from|feat\.?|featuring|with|prod\.?|remix|version|soundtrack|ost).*$/gi, '')
                    .replace(/\s*-\s*[^-]+$/g, '')
                    .trim();
            },

            cleanArtist: (artist = '') => {
                const first = String(artist).split(/[,/&|]/)[0];
                return (first || artist).trim();
            },

            parseLrc: (lrcString = '') => {
                if (!lrcString || typeof lrcString !== 'string') return [];
                const lines = lrcString.split('\n');
                const result = [];
                const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/g;
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;
                    timeRegex.lastIndex = 0;
                    const matches = [...trimmed.matchAll(timeRegex)];
                    if (!matches || matches.length === 0) continue;
                    const text = trimmed.replace(timeRegex, '').trim();
                    for (const match of matches) {
                        const min = parseInt(match[1], 10);
                        const sec = parseInt(match[2], 10);
                        const msStr = match[3];
                        const ms = msStr.length === 2 ? parseInt(msStr, 10) * 10 : parseInt(msStr.padEnd(3, '0').slice(0, 3), 10);
                        const time = min * 60 + sec + ms / 1000;
                        result.push({ time, text });
                    }
                }
                result.sort((a, b) => a.time - b.time);
                return result;
            },

            fetchLyricsForTrack: async (track) => {
                if (!track || (!track.title && !track.name)) return null;
                const trackTitle = track.title || track.name;
                const trackArtist = track.artist || track.primary_artists || '';
                const cacheKey = `${trackTitle}:::${trackArtist}`.toLowerCase();

                if (lyricsManager.cache.has(cacheKey)) {
                    lyricsManager.currentLyrics = lyricsManager.cache.get(cacheKey);
                    lyricsManager.setIndicator(Boolean(lyricsManager.currentLyrics && (lyricsManager.currentLyrics.syncedLyrics || lyricsManager.currentLyrics.plainLyrics)));
                    lyricsManager.updateUI();
                    return lyricsManager.currentLyrics;
                }

                lyricsManager.isLoading = true;
                lyricsManager.currentLyrics = null;
                lyricsManager.activeLineIndex = -1;
                lyricsManager.setIndicator(false);
                lyricsManager.renderLoading();

                try {
                    const queryParams = new URLSearchParams({
                        track: trackTitle,
                        artist: trackArtist,
                        album: track.album || '',
                        duration: String(track.duration || 0)
                    });
                    let res = await fetch(`/api/music/lyrics?${queryParams.toString()}`).catch(() => null);
                    let data = null;
                    if (res && res.ok) {
                        const json = await res.json();
                        if (json.success && json.lyrics) data = json.lyrics;
                    }

                    // Fallback to direct LRCLIB fetch if backend didn't find lyrics
                    if (!data) {
                        const cleanT = lyricsManager.cleanTitle(trackTitle);
                        const cleanA = lyricsManager.cleanArtist(trackArtist);
                        const directRes = await fetch(`https://lrclib.net/api/get?track_name=${encodeURIComponent(cleanT)}&artist_name=${encodeURIComponent(cleanA)}`).catch(() => null);
                        if (directRes && directRes.ok) {
                            const lrcJson = await directRes.json();
                            if (lrcJson.syncedLyrics || lrcJson.plainLyrics || lrcJson.instrumental) {
                                data = {
                                    track: lrcJson.trackName || trackTitle,
                                    artist: lrcJson.artistName || trackArtist,
                                    syncedLyrics: lrcJson.syncedLyrics || null,
                                    plainLyrics: lrcJson.plainLyrics || null,
                                    instrumental: Boolean(lrcJson.instrumental),
                                    parsedLines: lrcJson.syncedLyrics ? lyricsManager.parseLrc(lrcJson.syncedLyrics) : null
                                };
                            }
                        }
                    }

                    lyricsManager.currentLyrics = data;
                    if (data) {
                        lyricsManager.cache.set(cacheKey, data);
                        lyricsManager.setIndicator(Boolean(data.syncedLyrics || data.plainLyrics));
                    } else {
                        lyricsManager.setIndicator(false);
                    }
                    lyricsManager.updateUI();
                    return data;
                } catch (e) {
                    console.warn('[DTunes] Lyrics fetch warning:', e);
                    lyricsManager.currentLyrics = null;
                    lyricsManager.setIndicator(false);
                    lyricsManager.updateUI();
                    return null;
                } finally {
                    lyricsManager.isLoading = false;
                }
            },

            setIndicator: (hasLyrics) => {
                const dot = document.getElementById('lyrics-indicator-dot');
                if (dot) {
                    dot.style.opacity = hasLyrics ? '1' : '0';
                }
                const badge = document.getElementById('lyrics-sync-badge');
                if (badge) {
                    const isSynced = Boolean(lyricsManager.currentLyrics?.syncedLyrics);
                    badge.classList.toggle('hidden', !isSynced);
                }
            },

            renderLoading: () => {
                const placeholder = '<div class="text-gray-400 my-auto text-sm flex flex-col items-center gap-3 py-10"><svg class="w-8 h-8 text-gray-500 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/></svg><span>Searching synchronized lyrics...</span></div>';
                const desktopCont = document.getElementById('lyrics-scroll-container');
                if (desktopCont) desktopCont.innerHTML = placeholder;
                const mobileCont = document.getElementById('mobile-lyrics-scroll');
                if (mobileCont) mobileCont.innerHTML = placeholder;
            },

            updateUI: () => {
                const lyrics = lyricsManager.currentLyrics;
                const desktopCont = document.getElementById('lyrics-scroll-container');
                const mobileCont = document.getElementById('mobile-lyrics-scroll');

                const titleEl = document.getElementById('lyrics-modal-title');
                const artistEl = document.getElementById('lyrics-modal-artist');
                const artImg = document.getElementById('lyrics-modal-art-img');
                if (titleEl && state.currentTrack) titleEl.textContent = state.currentTrack.name || state.currentTrack.title || 'Unknown';
                if (artistEl && state.currentTrack) artistEl.textContent = state.currentTrack.artist || 'Unknown';
                if (artImg && state.currentTrack) artImg.src = state.currentTrack.img || 'DTunes.svg';

                if (!lyrics) {
                    const emptyHtml = '<div class="text-gray-400 my-auto text-sm py-16 flex flex-col items-center gap-3"><svg class="w-10 h-10 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg><span class="font-semibold text-gray-300">No lyrics available for this track</span><span class="text-xs text-gray-500">Lyrics match based on track title and artist name</span></div>';
                    if (desktopCont) desktopCont.innerHTML = emptyHtml;
                    if (mobileCont) mobileCont.innerHTML = emptyHtml;
                    return;
                }

                if (lyrics.instrumental) {
                    const instHtml = '<div class="text-gray-400 my-auto text-sm py-16 flex flex-col items-center gap-3"><span class="text-3xl">🎵</span><span class="font-bold text-white text-base">Instrumental Piece</span><span class="text-xs text-gray-400">This track has no vocal lyrics. Enjoy the music!</span></div>';
                    if (desktopCont) desktopCont.innerHTML = instHtml;
                    if (mobileCont) mobileCont.innerHTML = instHtml;
                    return;
                }

                if (lyrics.parsedLines && lyrics.parsedLines.length > 0) {
                    const markup = lyrics.parsedLines.map((line, idx) => `
                        <div class="lyric-line" data-index="${idx}" data-time="${line.time}" onclick="player.seek(${line.time})">
                            ${utils.escapeHtml(line.text)}
                        </div>
                    `).join('');
                    if (desktopCont) desktopCont.innerHTML = markup;
                    if (mobileCont) mobileCont.innerHTML = markup;
                    lyricsManager.activeLineIndex = -1;
                    lyricsManager.syncTime(audio.currentTime || 0, true);
                    return;
                }

                if (lyrics.plainLyrics) {
                    const plainHtml = `<div class="plain-lyrics-text">${utils.escapeHtml(lyrics.plainLyrics)}</div>`;
                    if (desktopCont) desktopCont.innerHTML = plainHtml;
                    if (mobileCont) mobileCont.innerHTML = plainHtml;
                }
            },

            syncTime: (currentTime, forceScroll = false) => {
                const lyrics = lyricsManager.currentLyrics;
                if (!lyrics || !lyrics.parsedLines || lyrics.parsedLines.length === 0) return;

                const lines = lyrics.parsedLines;
                let newIndex = -1;

                for (let i = 0; i < lines.length; i++) {
                    if (currentTime >= lines[i].time) {
                        newIndex = i;
                    } else {
                        break;
                    }
                }

                if (newIndex === lyricsManager.activeLineIndex && !forceScroll) return;
                lyricsManager.activeLineIndex = newIndex;

                const updateContainer = (containerId) => {
                    const container = document.getElementById(containerId);
                    if (!container) return;
                    const lineElements = container.querySelectorAll('.lyric-line');
                    lineElements.forEach((el, idx) => {
                        const isActive = idx === newIndex;
                        const isPast = idx < newIndex;
                        el.classList.toggle('active', isActive);
                        el.classList.toggle('past', isPast);
                        if (isActive && (forceScroll || document.visibilityState === 'visible')) {
                            const containerRect = container.getBoundingClientRect();
                            const lineRect = el.getBoundingClientRect();
                            const delta = (lineRect.top + lineRect.height / 2) - (containerRect.top + containerRect.height / 2);
                            if (forceScroll || Math.abs(delta) > 4) {
                                container.scrollBy({
                                    top: delta,
                                    behavior: forceScroll ? 'auto' : 'smooth'
                                });
                            }
                        }
                    });
                };

                updateContainer('lyrics-scroll-container');
                updateContainer('mobile-lyrics-container');
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
                        document.getElementById('queue-wrapper')?.classList.add('queue-expanded');
                        ui.switchQueueTab('upnext');
                    }
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
                const timeBadge = song.playedAt ? `<span class="text-[10px] text-gray-400 font-mono px-2 py-0.5 rounded-md bg-white/5 flex-shrink-0 mr-1.5">${ui.formatRelativeTime(song.playedAt)}</span>` : '';

                return `
                <div class="swipe-song glass-panel rounded-2xl p-2 pr-4 flex items-center shadow-2xl w-full border border-white/10 transition-colors bg-[#121212]/90 hover-pause group cursor-pointer mb-2" data-store-id="${storeId}" onclick="${clickHandlerStr}" ondblclick="player.likeSong('${utils.escapeJs(song.id)}')">
                    ${ui.createSongPillInner(song)}
                    ${timeBadge}
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
                        <span class="swipe-hint block md:hidden text-[10px] text-gray-500 uppercase tracking-wider">Swipe</span>
                        ${removeBtnHtml}
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
                if (tab === 'lyrics') {
                    lyricsManager.updateUI();
                    if (state.currentTrack && !lyricsManager.currentLyrics && !lyricsManager.isLoading) {
                        lyricsManager.fetchLyricsForTrack(state.currentTrack);
                    }
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
                const totalDurationMs = state.playHistory.reduce((sum, s) => sum + (parseInt(s.duration || 0) * 1000 || 180000), 0);
                const topArtists = Object.entries(state.artistPlayCounts || {})
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5);
                const favArtist = topArtists[0]?.[0] || 'None';
                return { uniqueTracks: uniqueTracks.size, totalPlays, totalDurationMs, topArtists, favArtist, source: 'local' };
            },
            renderCards: (summary, topTracks = [], daily = []) => {
                const container = document.getElementById('stats-content');
                const subtitle = document.getElementById('stats-subtitle');
                if (!container) return;
                if (subtitle) {
                    subtitle.textContent = summary.source === 'cloud'
                        ? 'Cross-device listening activity synced with D\'Verse Cloud.'
                        : 'Local listening activity. Sign in to D\'Verse Cloud to sync across devices.';
                }

                const totalListeningTime = statsView.formatDuration(summary.totalDurationMs || (summary.totalPlays * 180000));

                // Top 5 Artists with percentage progress bars
                const maxArtistPlays = summary.topArtists && summary.topArtists.length ? Math.max(...summary.topArtists.map(a => a[1])) : 1;
                const topArtistHtml = (summary.topArtists || []).length
                    ? summary.topArtists.map(([name, count], index) => {
                        const pct = Math.max(8, Math.round((count / maxArtistPlays) * 100));
                        return `
                        <div class="flex flex-col gap-1 py-2 border-b border-white/5">
                            <div class="flex items-center justify-between text-xs font-bold">
                                <span class="text-white flex items-center gap-2 truncate">
                                    <span class="w-5 text-gray-500 font-mono">#${index + 1}</span>
                                    <span class="truncate">${utils.escapeHtml(name)}</span>
                                </span>
                                <span class="text-gray-400 font-mono">${count} plays</span>
                            </div>
                            <div class="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                                <div class="bg-[var(--accent-color)] h-full rounded-full transition-all duration-500" style="width: ${pct}%;"></div>
                            </div>
                        </div>`;
                    }).join('')
                    : '<p class="text-sm text-gray-500 py-3">No artist data yet.</p>';

                // Top 5 Tracks ranking with artwork
                let topTracksList = [];
                if (topTracks.length > 0) {
                    topTracksList = topTracks.slice(0, 5).map(row => {
                        const track = row.dtunes_tracks || row.track || row;
                        return {
                            id: track?.id,
                            name: track?.title || track?.name || 'Unknown',
                            artist: track?.artist || 'Artist',
                            img: track?.img || (track?.image_url ? (Array.isArray(track.image_url) ? track.image_url[track.image_url.length - 1]?.url : track.image_url) : FALLBACK_ART),
                            plays: row.play_count || 0
                        };
                    });
                } else if (state.playHistory.length > 0) {
                    const counts = {};
                    state.playHistory.forEach(s => {
                        if (!s || !s.id) return;
                        if (!counts[s.id]) counts[s.id] = { count: 0, song: s };
                        counts[s.id].count++;
                    });
                    topTracksList = Object.values(counts)
                        .sort((a, b) => b.count - a.count)
                        .slice(0, 5)
                        .map(item => ({ ...item.song, plays: item.count }));
                }

                const topTrackHtml = topTracksList.length
                    ? topTracksList.map((song, index) => {
                        const storeId = songStore.add(song);
                        return `
                        <div class="flex items-center justify-between p-2 rounded-xl bg-white/5 hover:bg-white/10 transition cursor-pointer gap-3" onclick="playSongById('${storeId}')">
                            <span class="w-5 text-center text-xs font-mono font-bold text-gray-400 flex-shrink-0">#${index + 1}</span>
                            <img src="${song.img || FALLBACK_ART}" class="w-10 h-10 rounded-lg object-cover flex-shrink-0">
                            <div class="min-w-0 flex-1">
                                <p class="text-xs font-bold text-white truncate">${utils.escapeHtml(song.name || song.title || 'Track')}</p>
                                <p class="text-[10px] text-gray-400 truncate">${utils.escapeHtml(song.artist || 'Artist')}</p>
                            </div>
                            <div class="text-right flex-shrink-0">
                                <p class="text-xs font-bold text-[var(--accent-color)] font-mono">${song.plays || 1} plays</p>
                            </div>
                        </div>`;
                    }).join('')
                    : '<p class="text-sm text-gray-500 py-3">Play more songs to build track stats.</p>';

                // 7-day / Daily Listening Activity
                let dailyList = daily.length > 0 ? daily.slice(0, 7) : [];
                if (dailyList.length === 0 && state.playHistory.length > 0) {
                    const dayMap = {};
                    state.playHistory.forEach(s => {
                        const d = s.playedAt ? new Date(s.playedAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'Recent';
                        if (!dayMap[d]) dayMap[d] = { day: d, play_count: 0, total_duration_ms: 0 };
                        dayMap[d].play_count++;
                        dayMap[d].total_duration_ms += (parseInt(s.duration || 0) * 1000 || 180000);
                    });
                    dailyList = Object.values(dayMap).slice(0, 7);
                }

                const dailyHtml = dailyList.length
                    ? dailyList.map(row => `
                        <div class="flex items-center justify-between py-2 border-b border-white/5 text-xs">
                            <span class="text-white font-bold">${utils.escapeHtml(row.day)}</span>
                            <span class="text-gray-400 font-mono">${row.play_count || 0} plays · ${statsView.formatDuration(row.total_duration_ms || 0)}</span>
                        </div>
                    `).join('')
                    : '<p class="text-sm text-gray-500 py-3">Listening activity will appear as you play songs.</p>';

                container.innerHTML = `
                    <!-- 4 Metric Cards -->
                    <div class="grid grid-cols-2 gap-4 lg:col-span-2">
                        <div class="glass-panel rounded-2xl p-5 border border-white/10 flex flex-col justify-between">
                            <span class="text-[11px] font-extrabold uppercase tracking-wider text-gray-400">Total Listening Time</span>
                            <p class="text-2xl md:text-3xl font-black text-[var(--accent-color)] mt-2">${totalListeningTime}</p>
                        </div>
                        <div class="glass-panel rounded-2xl p-5 border border-white/10 flex flex-col justify-between">
                            <span class="text-[11px] font-extrabold uppercase tracking-wider text-gray-400">Total Plays</span>
                            <p class="text-2xl md:text-3xl font-black text-white mt-2">${summary.totalPlays || 0}</p>
                        </div>
                        <div class="glass-panel rounded-2xl p-5 border border-white/10 flex flex-col justify-between">
                            <span class="text-[11px] font-extrabold uppercase tracking-wider text-gray-400">Unique Tracks</span>
                            <p class="text-2xl md:text-3xl font-black text-white mt-2">${summary.uniqueTracks || 0}</p>
                        </div>
                        <div class="glass-panel rounded-2xl p-5 border border-white/10 flex flex-col justify-between">
                            <span class="text-[11px] font-extrabold uppercase tracking-wider text-gray-400">Top Artist</span>
                            <p class="text-xl md:text-2xl font-black text-white truncate mt-2">${utils.escapeHtml(summary.favArtist || (summary.topArtists?.[0]?.[0] || 'None'))}</p>
                        </div>
                    </div>

                    <!-- Top 5 Artists Ranking -->
                    <section class="glass-panel rounded-2xl p-6 border border-white/10">
                        <h3 class="text-lg font-black text-white mb-4 flex items-center gap-2">
                            <span>🎤</span>
                            <span>Top Artists</span>
                        </h3>
                        <div class="flex flex-col gap-1">${topArtistHtml}</div>
                    </section>

                    <!-- Top 5 Tracks Ranking -->
                    <section class="glass-panel rounded-2xl p-6 border border-white/10">
                        <h3 class="text-lg font-black text-white mb-4 flex items-center gap-2">
                            <span>🔥</span>
                            <span>Top Tracks</span>
                        </h3>
                        <div class="flex flex-col gap-2">${topTrackHtml}</div>
                    </section>

                    <!-- 7-Day Listening Timeline -->
                    <section class="glass-panel rounded-2xl p-6 border border-white/10 lg:col-span-2">
                        <h3 class="text-lg font-black text-white mb-4 flex items-center gap-2">
                            <span>📅</span>
                            <span>Recent Daily Activity</span>
                        </h3>
                        <div class="flex flex-col">${dailyHtml}</div>
                    </section>
                `;
            },
            render: async () => {
                const container = document.getElementById('stats-content');
                if (!container) return;
                container.innerHTML = '<p class="text-gray-400 col-span-full py-8 text-center"><div class="w-6 h-6 border-2 border-[var(--accent-color)] border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>Loading stats...</p>';
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
                            totalDurationMs: topTracks.reduce((sum, row) => sum + Number(row.total_duration_ms || 0), 0) || local.totalDurationMs,
                            topArtists: local.topArtists,
                            favArtist: local.favArtist,
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
                homeView.renderDiscoverSection();
                const isNewUser = state.playHistory.length === 0;
                
                // Always render Trending so the homescreen has immediate, vibrant hits for both new and returning users
                document.getElementById('section-trending').classList.remove('hidden');
                const trendingGrid = document.getElementById('trending-grid');
                if (trendingGrid && trendingGrid.children.length === 0) {
                    trendingGrid.innerHTML = Array(16).fill('<div class="scroll-card h-[200px] rounded-xl glass-panel animate-pulse w-40 flex-shrink-0"></div>').join('');
                    jiosaavnAPI.getTrending().then(trendingSongs => {
                        if (trendingSongs && trendingSongs.length) {
                            trendingGrid.innerHTML = trendingSongs.slice(0, 16).map(song => ui.createCard(song)).join('');
                            updateMarquees();
                            if (window.setupShelfNavButtons) setupShelfNavButtons();
                        }
                    }).catch(() => {});
                }

                if (!isNewUser) {
                    document.getElementById('section-quick-picks').classList.remove('hidden');
                    document.getElementById('section-recent').classList.remove('hidden');
                    homeView.renderRecentlyPlayed();
                    homeView.generateQuickPicks();
                    homeView.loadGeneratedPlaylist('for-you');
                }
                updateMarquees();
                if (window.setupShelfNavButtons) setupShelfNavButtons();
            },
            renderDiscoverSection: async (forceRefresh = false) => {
                const grid = document.getElementById('discover-grid');
                if (!grid) return;
                
                if (!state.discoverMixes) state.discoverMixes = {};
                
                const DISCOVER_MIX_DEFINITIONS = [
                    {
                        key: 'discover-weekly',
                        title: 'Discover Weekly',
                        subtitle: 'Fresh recommendations tuned to your taste every week',
                        badgeText: 'DISCOVER',
                        gradientBg: 'bg-gradient-to-br from-cyan-600 via-emerald-800 to-indigo-950',
                        accentColor: '#38bdf8'
                    },
                    {
                        key: 'daily-mix-1',
                        title: 'Daily Mix 1',
                        subtitle: 'A custom blend of your favorite artists and hits',
                        badgeText: 'DAILY MIX',
                        gradientBg: 'bg-gradient-to-br from-purple-700 via-indigo-800 to-slate-950',
                        accentColor: '#a855f7'
                    },
                    {
                        key: 'daily-mix-2',
                        title: 'Daily Mix 2',
                        subtitle: 'Vibrant tracks matching your favorite genres',
                        badgeText: 'DAILY MIX',
                        gradientBg: 'bg-gradient-to-br from-rose-600 via-amber-700 to-zinc-950',
                        accentColor: '#f43f5e'
                    },
                    {
                        key: 'release-radar',
                        title: 'Release Radar',
                        subtitle: 'Catch brand new singles & albums from top artists',
                        badgeText: 'NEW RELEASES',
                        gradientBg: 'bg-gradient-to-br from-blue-600 via-sky-800 to-gray-950',
                        accentColor: '#60a5fa'
                    },
                    {
                        key: 'chill-vibes',
                        title: 'Chill Vibes',
                        subtitle: 'Soft acoustic, lo-fi, and relaxing melodies for your mind',
                        badgeText: 'MOOD & VIBE',
                        gradientBg: 'bg-gradient-to-br from-teal-600 via-cyan-900 to-black',
                        accentColor: '#2dd4bf'
                    },
                    {
                        key: 'recently-obsessed',
                        title: 'Recently Obsessed',
                        subtitle: 'Your heavy rotation favorites on repeat',
                        badgeText: 'ON REPEAT',
                        gradientBg: 'bg-gradient-to-br from-fuchsia-600 via-pink-800 to-stone-950',
                        accentColor: '#e879f9'
                    }
                ];

                grid.innerHTML = DISCOVER_MIX_DEFINITIONS.map(() => 
                    '<div class="scroll-card h-80 w-64 rounded-3xl glass-panel animate-pulse flex-shrink-0"></div>'
                ).join('');

                const preferredLanguage = document.getElementById('preferred-language-select')?.value || localStorage.getItem('preferredLanguage') || '';

                const renderedCards = await Promise.all(DISCOVER_MIX_DEFINITIONS.map(async (def) => {
                    let songs = state.discoverMixes[def.key];
                    if (!songs || forceRefresh || songs.length === 0) {
                        songs = window.recommendationClient ? await window.recommendationClient.fetchPlaylist(def.key, { limit: 20, language: preferredLanguage }) : [];
                        state.discoverMixes[def.key] = songs;
                    }
                    const fullMix = { ...def, songs };
                    return ui.createDiscoverCard(fullMix);
                }));

                grid.innerHTML = renderedCards.join('');
                stripTouchHoverClasses();
                updateMarquees();
                if (window.setupShelfNavButtons) setupShelfNavButtons();
            },
            openDiscoverMix: async (key) => {
                const DISCOVER_MIX_DEFINITIONS = {
                    'discover-weekly': { title: 'Discover Weekly', badgeText: 'DISCOVER', gradientBg: 'bg-gradient-to-br from-cyan-600 via-emerald-800 to-indigo-950' },
                    'daily-mix-1': { title: 'Daily Mix 1', badgeText: 'DAILY MIX', gradientBg: 'bg-gradient-to-br from-purple-700 via-indigo-800 to-slate-950' },
                    'daily-mix-2': { title: 'Daily Mix 2', badgeText: 'DAILY MIX', gradientBg: 'bg-gradient-to-br from-rose-600 via-amber-700 to-zinc-950' },
                    'release-radar': { title: 'Release Radar', badgeText: 'NEW RELEASES', gradientBg: 'bg-gradient-to-br from-blue-600 via-sky-800 to-gray-950' },
                    'chill-vibes': { title: 'Chill Vibes', badgeText: 'MOOD & VIBE', gradientBg: 'bg-gradient-to-br from-teal-600 via-cyan-900 to-black' },
                    'recently-obsessed': { title: 'Recently Obsessed', badgeText: 'ON REPEAT', gradientBg: 'bg-gradient-to-br from-fuchsia-600 via-pink-800 to-stone-950' }
                };
                const meta = DISCOVER_MIX_DEFINITIONS[key] || { title: 'Discover Mix', badgeText: 'MADE FOR YOU', gradientBg: 'bg-gradient-to-br from-cyan-600 to-indigo-950' };
                let songs = state.discoverMixes?.[key];
                if (!songs || songs.length === 0) {
                    const preferredLanguage = document.getElementById('preferred-language-select')?.value || localStorage.getItem('preferredLanguage') || '';
                    songs = window.recommendationClient ? await window.recommendationClient.fetchPlaylist(key, { limit: 25, language: preferredLanguage }) : [];
                    if (!state.discoverMixes) state.discoverMixes = {};
                    state.discoverMixes[key] = songs;
                }
                const coverMarkup = ui.generateAbstractCoverMarkup({ ...meta, key }, songs);
                ui.openGeneratedPlaylist(meta.title, songs, coverMarkup);
            },
            playDiscoverMix: async (key) => {
                let songs = state.discoverMixes?.[key];
                if (!songs || songs.length === 0) {
                    const preferredLanguage = document.getElementById('preferred-language-select')?.value || localStorage.getItem('preferredLanguage') || '';
                    songs = window.recommendationClient ? await window.recommendationClient.fetchPlaylist(key, { limit: 25, language: preferredLanguage }) : [];
                }
                if (!songs || songs.length === 0) return;
                state.queue = [...songs]; state.userQueue = []; state.idx = 0; ui.renderQueue();
                player.playDirect(songs[0]);
                if (deviceMode.isMobileUI()) ui.toggleMobilePlayer(true);
                else if (!state.queueExpanded) ui.toggleQueue();
            },
            autoplayNextIntelligentTracks: async () => {
                try {
                    const currentSong = state.currentTrack;
                    const seedId = currentSong?.id;
                    const preferredLanguage = document.getElementById('preferred-language-select')?.value || localStorage.getItem('preferredLanguage') || '';
                    const newSongs = window.recommendationClient 
                        ? await window.recommendationClient.fetchPlaylist('similar', { seedSongId: seedId, limit: 10, language: preferredLanguage })
                        : [];
                    if (newSongs && newSongs.length > 0) {
                        const filtered = newSongs.filter(s => {
                            if (!s || !s.id) return false;
                            if (currentSong && utils.areDuplicateTracks(s, currentSong)) return false;
                            return !state.queue.some(existing => utils.areDuplicateTracks(existing, s));
                        });
                        if (filtered.length > 0) {
                            state.queue.push(...utils.deduplicateSongs(filtered));
                            ui.renderQueue();
                            primeNextTrack();
                            return true;
                        }
                    }
                } catch (e) {
                    console.warn('[Autoplay] Could not fetch intelligent continuation tracks:', e);
                }
                return false;
            },
            renderRecentlyPlayed: () => {
                const grid = document.getElementById('recent-grid'); if(!grid) return;
                if(state.playHistory.length === 0) { grid.innerHTML = '<p class="text-gray-500 pl-8">Play some songs to see them here.</p>'; return; }
                const dedupedHistory = utils.deduplicateSongs(state.playHistory);
                grid.innerHTML = dedupedHistory.slice(0, 8).map(song => ui.createCard(song)).join('');
                updateMarquees();
            },
            generateQuickPicks: async () => {
                const grid = document.getElementById('quick-picks-grid');
                grid.innerHTML = Array(16).fill('<div class="scroll-card h-[200px] rounded-xl glass-panel animate-pulse w-40 flex-shrink-0"></div>').join('');
                try {
                    const trending = await jiosaavnAPI.getTrending(); let picks = [...trending.slice(0, 8)]; 
                    const artists = Object.keys(state.artistPlayCounts || {}).sort((a,b) => state.artistPlayCounts[b] - state.artistPlayCounts[a]).slice(0, 3);
                    for(const artist of artists) { const artistSongs = await jiosaavnAPI.searchSongs(artist, 6); picks.push(...artistSongs); }
                    const uniquePicks = utils.deduplicateSongs(picks);
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
