        // ============================================
        // D'TUNES MEDIA API (v2 / YouTube yt-dlp)
        // ============================================
        const API_V2_BASE = '/api-v2';
        const clientSearchCache = new Map();
        const LEGACY_MIGRATION_STORAGE_KEY = 'dtunes_yt_migration_map_v1';
        const YT_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

        const _normalizeStreamBase = (raw) => {
            let base = String(raw || '').trim().replace(/\/+$/, '');
            if (!base) return '';
            base = base.replace(/\/api-v2$|\/api\/v2$|\/api$/, '');
            return base;
        };

        let _streamBaseOrigin = (() => {
            try {
                if (typeof window !== 'undefined' && window.DTUNES_STREAM_BASE) {
                    return _normalizeStreamBase(window.DTUNES_STREAM_BASE);
                }
                if (typeof document !== 'undefined') {
                    const meta = document.querySelector('meta[name="dtunes-stream-base"]');
                    if (meta && meta.content) return _normalizeStreamBase(meta.content);
                }
            } catch (_) {}
            return '';
        })();
        let _streamConfigPromise = null;
        let _streamReady = _streamBaseOrigin ? true : null;

        const _discoverStreamBase = async () => {
            if (_streamBaseOrigin) {
                _streamReady = true;
                return _streamBaseOrigin;
            }
            if (isNetworkOffline() || typeof fetch !== 'function') return '';
            if (!_streamConfigPromise) {
                _streamConfigPromise = (async () => {
                    let timer = null;
                    try {
                        const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
                        if (ctrl) timer = setTimeout(() => ctrl.abort(), 2500);
                        const res = await fetch(`${API_V2_BASE}/config`, {
                            cache: 'no-store',
                            signal: ctrl ? ctrl.signal : undefined,
                        });
                        if (res && res.ok) {
                            const data = await res.json();
                            if (data && data.stream_base_url) {
                                _streamBaseOrigin = _normalizeStreamBase(data.stream_base_url);
                            }
                            if (data && typeof data.stream_ready === 'boolean') {
                                _streamReady = Boolean(_streamBaseOrigin) || data.stream_ready;
                            }
                        }
                    } catch (_) {
                    } finally {
                        if (timer) clearTimeout(timer);
                    }
                    return _streamBaseOrigin;
                })();
            }
            return _streamConfigPromise;
        };

        const _loadMigrationMap = () => {
            try {
                const raw = localStorage.getItem(LEGACY_MIGRATION_STORAGE_KEY);
                const parsed = raw ? JSON.parse(raw) : {};
                return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
            } catch (_) {
                return {};
            }
        };

        const _saveMigrationEntry = (legacyId, resolvedTrack) => {
            if (!legacyId || !resolvedTrack || !resolvedTrack.id) return;
            try {
                const map = _loadMigrationMap();
                map[String(legacyId)] = {
                    id: resolvedTrack.id,
                    title: resolvedTrack.title || resolvedTrack.name || 'Unknown',
                    artist: resolvedTrack.artist || 'Unknown Artist',
                    album: resolvedTrack.album || '',
                    artwork: resolvedTrack.artwork || resolvedTrack.img || '',
                    duration: Number(resolvedTrack.duration) || 0,
                    source: 'youtube',
                    legacy_id: String(legacyId),
                    saavn_id: String(legacyId),
                };
                const keys = Object.keys(map);
                if (keys.length > 1000) {
                    keys.slice(0, keys.length - 1000).forEach(k => delete map[k]);
                }
                localStorage.setItem(LEGACY_MIGRATION_STORAGE_KEY, JSON.stringify(map));
            } catch (_) {}
        };

        const isNetworkOffline = () => {
            if (typeof window !== 'undefined' && typeof window.__dtunesIsOffline === 'function') {
                return window.__dtunesIsOffline();
            }
            return typeof navigator !== 'undefined' && !navigator.onLine;
        };

        const mediaAPI = {
            fetchWithRetry: async (url, retries = 2, customSignal = null) => {
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
                        const controller = new AbortController();
                        timeoutId = setTimeout(() => controller.abort(), 10000);
                        
                        // Combine customSignal with timeout controller if provided
                        let fetchSignal = controller.signal;
                        if (customSignal) {
                            if (customSignal.aborted) throw new DOMException('Aborted', 'AbortError');
                            customSignal.addEventListener('abort', () => controller.abort(), { once: true });
                        }

                        const response = await fetch(url, { signal: fetchSignal });
                        if (timeoutId) clearTimeout(timeoutId);
                        if (!response.ok) throw new Error(`HTTP ${response.status}`);
                        return await response.json();
                    } catch (error) {
                        if (timeoutId) clearTimeout(timeoutId);
                        if (error && error.name === 'AbortError') throw error;
                        if (isNetworkOffline()) throw error;
                        if (i === retries - 1) throw error;
                        await new Promise(r => setTimeout(r, 400));
                    }
                }
            },

            searchSongs: async (query, limit = 20, options = {}) => {
                if (isNetworkOffline()) return [];
                const normalizedQ = (query || '').toLowerCase().trim();
                if (!normalizedQ) return [];
                const cacheKey = `${normalizedQ}:${limit}`;
                if (clientSearchCache.has(cacheKey)) return clientSearchCache.get(cacheKey);

                const signal = options && options.signal ? options.signal : null;

                try {
                    const data = await mediaAPI.fetchWithRetry(`${API_V2_BASE}/search?q=${encodeURIComponent(query)}&limit=${limit}`, 2, signal);
                    const results = (data.results || []).map(r => mediaAPI.normalizeTrack(r)).filter(Boolean);
                    const deduped = (typeof utils !== 'undefined' && utils.deduplicateSongs) ? utils.deduplicateSongs(results) : results;
                    clientSearchCache.set(cacheKey, deduped);
                    if (clientSearchCache.size > 120) {
                        const oldest = clientSearchCache.keys().next().value;
                        if (oldest) clientSearchCache.delete(oldest);
                    }
                    return deduped;
                } catch (e) {
                    if (e && e.name === 'AbortError') return [];
                    console.warn('[API-v2 Search] Error:', e);
                    return [];
                }
            },

            searchAll: async (query) => {
                if (isNetworkOffline()) return { top: null, songs: [], albums: [], artists: [] };
                try {
                    const [songs, albums, artists] = await Promise.all([
                        mediaAPI.searchSongs(query, 15),
                        mediaAPI.searchAlbums(query, 8),
                        mediaAPI.searchArtists(query, 8),
                    ]);
                    if (!songs || songs.length === 0) {
                        return { top: null, songs: [], albums: albums || [], artists: artists || [] };
                    }
                    const top = songs[0];
                    const remainingSongs = songs.slice(1);
                    return { top, songs: remainingSongs, albums: albums || [], artists: artists || [] };
                } catch (e) {
                    console.warn('[API-v2 SearchAll] Error:', e);
                    return { top: null, songs: [], albums: [], artists: [] };
                }
            },

            searchAlbums: async (query, limit = 8) => {
                if (!query || isNetworkOffline()) return [];
                try {
                    const data = await mediaAPI.fetchWithRetry(`${API_V2_BASE}/search/albums?q=${encodeURIComponent(query)}&limit=${limit}`);
                    const fallbackImg = typeof FALLBACK_ART !== 'undefined' ? FALLBACK_ART : '';
                    return (data.results || []).map(a => ({
                        id: a.id,
                        name: (typeof utils !== 'undefined' && utils.decodeHtml) ? utils.decodeHtml(a.name || a.title || 'Unknown') : (a.name || a.title || 'Unknown'),
                        artist: (typeof utils !== 'undefined' && utils.decodeHtml) ? utils.decodeHtml(a.artist || 'Album') : (a.artist || 'Album'),
                        year: a.year || '',
                        img: (typeof sanitizeImageUrl === 'function') ? sanitizeImageUrl(a.img || a.artwork || fallbackImg) : (a.img || a.artwork || fallbackImg),
                        type: 'album'
                    })).filter(a => a.id);
                } catch (e) {
                    return [];
                }
            },

            searchArtists: async (query, limit = 8) => {
                if (!query || isNetworkOffline()) return [];
                try {
                    const data = await mediaAPI.fetchWithRetry(`${API_V2_BASE}/search/artists?q=${encodeURIComponent(query)}&limit=${limit}`);
                    const fallbackImg = typeof FALLBACK_ART !== 'undefined' ? FALLBACK_ART : '';
                    return (data.results || []).map(a => ({
                        id: a.id,
                        name: (typeof utils !== 'undefined' && utils.decodeHtml) ? utils.decodeHtml(a.name || a.title || 'Unknown') : (a.name || a.title || 'Unknown'),
                        artist: a.artist || 'Artist',
                        img: (typeof sanitizeImageUrl === 'function') ? sanitizeImageUrl(a.img || a.artwork || fallbackImg) : (a.img || a.artwork || fallbackImg),
                        type: 'artist'
                    })).filter(a => a.id);
                } catch (e) {
                    return [];
                }
            },

            getTrending: async (limit = 25, country = 'IN') => {
                if (typeof navigator !== 'undefined' && !navigator.onLine) return [];
                if (isNetworkOffline()) return [];
                try {
                    const data = await mediaAPI.fetchWithRetry(`${API_V2_BASE}/trending?country=${encodeURIComponent(country)}&limit=${limit}`);
                    const results = (data.results || []).map(r => mediaAPI.normalizeTrack(r)).filter(Boolean);
                    if (results.length > 0) {
                        return (typeof utils !== 'undefined' && utils.deduplicateSongs) ? utils.deduplicateSongs(results).slice(0, limit) : results.slice(0, limit);
                    }
                } catch (_) {}
                return await mediaAPI.searchSongs('Bollywood and global pop hits', limit);
            },

            getSongSuggestions: async (id, limit = 20) => {
                if (!id || isNetworkOffline()) return [];
                try {
                    const data = await mediaAPI.fetchWithRetry(`${API_V2_BASE}/related/${encodeURIComponent(id)}?limit=${limit}`);
                    if (Array.isArray(data)) {
                        return data.map(r => mediaAPI.normalizeTrack(r)).filter(Boolean);
                    }
                    return [];
                } catch (e) {
                    return [];
                }
            },

            getLyrics: async (id) => {
                if (!id || isNetworkOffline()) return null;
                try {
                    const data = await mediaAPI.fetchWithRetry(`${API_V2_BASE}/lyrics/${encodeURIComponent(id)}`);
                    return data?.lyrics || null;
                } catch (e) {
                    return null;
                }
            },

            isYouTubeVideoId: (id) => {
                return YT_VIDEO_ID_RE.test(String(id || '').trim());
            },

            isLegacyJioSaavnTrack: (track) => {
                if (!track) return false;
                if (typeof track === 'string') return !mediaAPI.isYouTubeVideoId(track);
                const id = String(track.id || '').trim();
                const url = String(track.url || track.play_url || '');
                const src = String(track.source || '').toLowerCase();
                if (url.includes('saavncdn.com') || url.includes('jiosaavn')) return true;
                if (src === 'jiosaavn') return true;
                if (id && !mediaAPI.isYouTubeVideoId(id)) return true;
                return false;
            },

            getCachedMigration: (legacyId) => {
                if (!legacyId) return null;
                const map = _loadMigrationMap();
                const entry = map[String(legacyId)];
                if (!entry || !mediaAPI.isYouTubeVideoId(entry.id)) return null;
                const normalized = mediaAPI.normalizeTrack(entry);
                if (normalized) {
                    normalized.legacy_id = String(legacyId);
                    normalized.saavn_id = String(legacyId);
                }
                return normalized;
            },

            resolveLegacyTrack: async (track) => {
                if (!track) return null;
                if (typeof track === 'string') {
                    return await mediaAPI.getSong(track);
                }
                if (!mediaAPI.isLegacyJioSaavnTrack(track)) {
                    return track;
                }
                const legacyId = String(track.saavn_id || track.legacy_id || track.id || '').trim();
                if (legacyId) {
                    const cached = mediaAPI.getCachedMigration(legacyId);
                    if (cached) {
                        return {
                            ...track,
                            ...cached,
                            id: cached.id,
                            url: cached.url,
                            play_url: cached.url,
                            source: 'youtube',
                            legacy_id: legacyId,
                            saavn_id: legacyId,
                            img: cached.img || track.img,
                            artwork: cached.artwork || track.artwork || track.img,
                        };
                    }
                }

                // Match on YouTube Music using cleaned title + artist + closest duration
                const rawTitle = String(track.title || track.name || '').trim();
                const rawArtist = String(track.artist || track.primaryArtists || '').trim();
                const cleanTitle = (typeof lyricsManager !== 'undefined' && lyricsManager.cleanTitle)
                    ? lyricsManager.cleanTitle(rawTitle)
                    : rawTitle;
                const query = `${cleanTitle || rawTitle} ${rawArtist}`.trim();

                let matched = null;
                if (query) {
                    const candidates = await mediaAPI.searchSongs(query, 5);
                    if (candidates && candidates.length > 0) {
                        const targetDur = Number(track.duration || track.duration_seconds || 0);
                        if (targetDur > 0) {
                            matched = candidates.reduce((best, cand) => {
                                const bestDiff = best.duration ? Math.abs(best.duration - targetDur) : 9999;
                                const candDiff = cand.duration ? Math.abs(cand.duration - targetDur) : 9999;
                                return candDiff < bestDiff ? cand : best;
                            }, candidates[0]);
                        } else {
                            matched = candidates[0];
                        }
                    }
                }

                // Last resort for bare legacy IDs with no title/artist: ask backend migration bridge
                if (!matched && legacyId && !mediaAPI.isYouTubeVideoId(legacyId)) {
                    try {
                        const data = await mediaAPI.fetchWithRetry(`${API_V2_BASE}/migrate/saavn/${encodeURIComponent(legacyId)}`);
                        if (data && data.id) matched = mediaAPI.normalizeTrack(data);
                    } catch (_) {}
                }

                if (!matched) return null;
                const migrated = {
                    ...track,
                    ...matched,
                    id: matched.id,
                    url: matched.url,
                    play_url: matched.url,
                    source: 'youtube',
                    legacy_id: legacyId || undefined,
                    saavn_id: legacyId || undefined,
                    img: matched.img || track.img,
                    artwork: matched.artwork || track.artwork || track.img,
                };
                if (legacyId) _saveMigrationEntry(legacyId, migrated);
                return migrated;
            },

            getStreamBaseUrl: () => {
                return _streamBaseOrigin ? `${_streamBaseOrigin}${API_V2_BASE}` : API_V2_BASE;
            },

            getStreamUrl: (id, options = {}) => {
                const encodedId = encodeURIComponent(String(id || '').trim());
                const base = mediaAPI.getStreamBaseUrl();
                const params = [];
                if (options && options.refresh) params.push('refresh=1');
                if (options && options.cacheBust) params.push(`r=${encodeURIComponent(String(options.cacheBust))}`);
                const qs = params.length ? `?${params.join('&')}` : '';
                return `${base}/stream/${encodedId}${qs}`;
            },

            getResolveUrl: (id, options = {}) => {
                const encodedId = encodeURIComponent(String(id || '').trim());
                const base = mediaAPI.getStreamBaseUrl();
                const qs = options && options.refresh ? '?refresh=1' : '';
                return `${base}/resolve/${encodedId}${qs}`;
            },

            discoverStreamHost: _discoverStreamBase,

            isStreamReady: () => {
                if (_streamBaseOrigin) return true;
                return _streamReady !== false;
            },

            markStreamUnavailable: () => {
                if (!_streamBaseOrigin) _streamReady = false;
            },

            getSong: async (id) => {
                if (!id) return null;
                const strId = String(id).trim();
                if (!mediaAPI.isYouTubeVideoId(strId)) {
                    const cached = mediaAPI.getCachedMigration(strId);
                    if (cached) return cached;
                    try {
                        const data = await mediaAPI.fetchWithRetry(`${API_V2_BASE}/migrate/saavn/${encodeURIComponent(strId)}`);
                        const normalized = mediaAPI.normalizeTrack(data);
                        if (normalized) {
                            normalized.legacy_id = strId;
                            normalized.saavn_id = strId;
                            _saveMigrationEntry(strId, normalized);
                        }
                        return normalized;
                    } catch (_) {
                        return null;
                    }
                }
                try {
                    await _discoverStreamBase();
                    const data = await mediaAPI.fetchWithRetry(mediaAPI.getResolveUrl(strId));
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
                if (!id || isNetworkOffline()) return null;
                try {
                    const data = await mediaAPI.fetchWithRetry(`${API_V2_BASE}/album/${encodeURIComponent(id)}`);
                    if (!data) return null;
                    const fallbackImg = typeof FALLBACK_ART !== 'undefined' ? FALLBACK_ART : '';
                    const rawImg = data.artwork || data.img || fallbackImg;
                    return {
                        id: data.id || id,
                        name: (typeof utils !== 'undefined' && utils.decodeHtml) ? utils.decodeHtml(data.name || data.title || 'Album') : (data.name || data.title || 'Album'),
                        title: (typeof utils !== 'undefined' && utils.decodeHtml) ? utils.decodeHtml(data.title || data.name || 'Album') : (data.title || data.name || 'Album'),
                        artist: (typeof utils !== 'undefined' && utils.decodeHtml) ? utils.decodeHtml(data.artist || 'Artist') : (data.artist || 'Artist'),
                        artistId: data.artistId || '',
                        year: data.year || '',
                        img: (typeof sanitizeImageUrl === 'function') ? sanitizeImageUrl(rawImg) : rawImg,
                        songs: (data.songs || []).map(s => mediaAPI.normalizeTrack(s)).filter(Boolean)
                    };
                } catch (e) {
                    return null;
                }
            },

            getArtist: async (id) => {
                if (!id || isNetworkOffline()) return null;
                try {
                    const data = await mediaAPI.fetchWithRetry(`${API_V2_BASE}/artist/${encodeURIComponent(id)}`);
                    if (!data) return null;
                    const fallbackImg = typeof FALLBACK_ART !== 'undefined' ? FALLBACK_ART : '';
                    const rawImg = data.artwork || data.img || fallbackImg;
                    return {
                        id: data.id || id,
                        name: (typeof utils !== 'undefined' && utils.decodeHtml) ? utils.decodeHtml(data.name || 'Artist') : (data.name || 'Artist'),
                        img: (typeof sanitizeImageUrl === 'function') ? sanitizeImageUrl(rawImg) : rawImg,
                        subscribers: data.subscribers || '',
                        topSongs: (data.topSongs || []).map(s => mediaAPI.normalizeTrack(s)).filter(Boolean),
                        topAlbums: (data.topAlbums || []).map(a => ({
                            id: a.id,
                            name: a.name || a.title || 'Album',
                            year: a.year || '',
                            img: (typeof sanitizeImageUrl === 'function') ? sanitizeImageUrl(a.img || a.artwork || fallbackImg) : (a.img || a.artwork || fallbackImg),
                            type: 'album'
                        })).filter(a => a.id)
                    };
                } catch (e) {
                    return null;
                }
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
                const playUrl = mediaAPI.getStreamUrl(id);

                return {
                    id: id,
                    name: title,
                    title: title,
                    artist: artist,
                    primaryArtists: artist,
                    album: item.album || '',
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
        if (typeof window !== 'undefined' && typeof document !== 'undefined') {
            _discoverStreamBase();
        }
