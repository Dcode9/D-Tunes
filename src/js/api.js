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
                    const [songs, albums, artists] = await Promise.all([
                        jiosaavnAPI.searchSongs(query, 20),
                        jiosaavnAPI.searchAlbums(query),
                        jiosaavnAPI.searchArtists(query)
                    ]);

                    const dedupedSongs = utils.deduplicateSongs(songs || []);
                    if (dedupedSongs.length === 0) return { top: null, songs: [], albums: albums || [], artists: artists || [] };
                    const top = dedupedSongs[0];
                    const remainingSongs = dedupedSongs.slice(1).filter(s => !utils.areDuplicateTracks(s, top)).slice(0, 10);
                    return { top, songs: remainingSongs, albums: albums || [], artists: artists || [] };
                } catch(e) {
                    console.warn('[JioSaavn SearchAll] Failed:', e);
                    return { top: null, songs: [], albums: [], artists: [] };
                }
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


window.jiosaavnAPI = jiosaavnAPI;
