        // ============================================
        // D'TUNES MEDIA API (v2 / YouTube yt-dlp)
        // ============================================
        const API_V2_BASE = '/api-v2';
        const clientSearchCache = new Map();

        const isNetworkOffline = () => {
            if (typeof window !== 'undefined' && typeof window.__dtunesIsOffline === 'function') {
                return window.__dtunesIsOffline();
            }
            return typeof navigator !== 'undefined' && !navigator.onLine;
        };

        const mediaAPI = {
            fetchWithRetry: async (url, retries = 3) => {
                if (typeof navigator !== 'undefined' && !navigator.onLine) {
                    throw new Error('Offline');
                }
                if (isNetworkOffline()) {
                    throw new Error('Offline');
                }
                for (let i = 0; i < retries; i++) {
                    if (isNetworkOffline()) {
                        throw new Error('Offline');
                    }
                    let timeoutId = null;
                    try {
                        let fetchSignal;
                        if (typeof AbortController !== 'undefined') {
                            const controller = new AbortController();
                            timeoutId = setTimeout(() => controller.abort(), 4000);
                            fetchSignal = controller.signal;
                        }
                        const response = await fetch(url, fetchSignal ? { signal: fetchSignal } : undefined);
                        if (timeoutId) clearTimeout(timeoutId);
                        if (!response.ok) throw new Error(`HTTP ${response.status}`);
                        return await response.json();
                    } catch (error) {
                        if (timeoutId) clearTimeout(timeoutId);
                        if (isNetworkOffline()) throw error;
                        if (i === retries - 1) throw error;
                        await new Promise(r => setTimeout(r, 600));
                    }
                }
            },

            searchSongs: async (query, limit = 20) => {
                if (isNetworkOffline()) return [];
                const normalizedQ = (query || '').toLowerCase().trim();
                if (!normalizedQ) return [];
                const cacheKey = `${normalizedQ}:${limit}`;
                if (clientSearchCache.has(cacheKey)) return clientSearchCache.get(cacheKey);

                try {
                    const data = await mediaAPI.fetchWithRetry(`${API_V2_BASE}/search?q=${encodeURIComponent(query)}&limit=${limit}`);
                    const results = (data.results || []).map(r => mediaAPI.normalizeTrack(r)).filter(Boolean);
                    const deduped = (typeof utils !== 'undefined' && utils.deduplicateSongs) ? utils.deduplicateSongs(results) : results;
                    clientSearchCache.set(cacheKey, deduped);
                    if (clientSearchCache.size > 120) {
                        const oldest = clientSearchCache.keys().next().value;
                        if (oldest) clientSearchCache.delete(oldest);
                    }
                    return deduped;
                } catch (e) {
                    console.warn('[API-v2 Search] Error:', e);
                    return [];
                }
            },

            searchAll: async (query) => {
                if (isNetworkOffline()) return { top: null, songs: [], albums: [], artists: [] };
                try {
                    const songs = await mediaAPI.searchSongs(query, 15);
                    if (!songs || songs.length === 0) {
                        return { top: null, songs: [], albums: [], artists: [] };
                    }
                    const top = songs[0];
                    const remainingSongs = songs.slice(1);
                    return { top, songs: remainingSongs, albums: [], artists: [] };
                } catch (e) {
                    console.warn('[API-v2 SearchAll] Error:', e);
                    return { top: null, songs: [], albums: [], artists: [] };
                }
            },

            searchAlbums: async (query) => {
                return [];
            },

            searchArtists: async (query) => {
                return [];
            },

            getTrending: async (limit = 25) => {
                if (typeof navigator !== 'undefined' && !navigator.onLine) return [];
                if (isNetworkOffline()) return [];
                return await mediaAPI.searchSongs('trending music hits', limit);
            },

            getSongSuggestions: async (id, limit = 20) => {
                return [];
            },

            getSong: async (id) => {
                if (!id) return null;
                try {
                    const data = await mediaAPI.fetchWithRetry(`${API_V2_BASE}/resolve/${encodeURIComponent(id)}`);
                    return mediaAPI.normalizeTrack(data);
                } catch (e) {
                    return null;
                }
            },

            getSongDetails: async (track) => {
                if (!track) return null;
                if (track.url && mediaAPI.isStreamingUrl(track.url)) return track;
                return await mediaAPI.getSong(track.id);
            },

            getAlbum: async (id) => {
                return null;
            },

            normalizeTrack: (item) => {
                if (!item) return null;
                const id = item.id;
                const title = (typeof utils !== 'undefined' && utils.decodeHtml) ? utils.decodeHtml(item.title || item.name || 'Unknown') : (item.title || item.name || 'Unknown');
                const artist = (typeof utils !== 'undefined' && utils.decodeHtml) ? utils.decodeHtml(item.artist || item.uploader || 'Unknown Artist') : (item.artist || item.uploader || 'Unknown Artist');
                const fallbackImg = typeof FALLBACK_ART !== 'undefined' ? FALLBACK_ART : '';
                const rawArtwork = item.artwork || item.img || fallbackImg;
                const artwork = (typeof sanitizeImageUrl === 'function') ? sanitizeImageUrl(rawArtwork) : rawArtwork;
                const duration = Number(item.duration) || 0;
                const playUrl = `${API_V2_BASE}/stream/${id}`;

                return {
                    id: id,
                    name: title,
                    title: title,
                    artist: artist,
                    primaryArtists: artist,
                    img: artwork,
                    artwork: artwork,
                    url: playUrl,
                    play_url: playUrl,
                    duration: duration,
                    duration_seconds: duration,
                    source: 'youtube',
                    type: 'song'
                };
            },

            normalizeSong: (song) => {
                return mediaAPI.normalizeTrack(song);
            },

            isStreamingUrl: (url) => {
                if (!url) return false;
                const str = String(url);
                return str.startsWith('http://') || str.startsWith('https://') || str.startsWith('/') || str.startsWith('blob:');
            }
        };

        window.mediaAPI = mediaAPI;
        window.jiosaavnAPI = mediaAPI;
