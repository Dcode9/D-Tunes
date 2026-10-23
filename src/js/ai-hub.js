(function () {
    const COVER_STYLES = [
        { bg: "from-purple-900 to-black", blend: "mix-blend-overlay", textPos: "justify-end items-start" },
        { bg: "from-emerald-800 to-gray-900", blend: "mix-blend-luminosity", textPos: "justify-center items-center text-center" },
        { bg: "from-orange-600 to-red-900", blend: "mix-blend-multiply", textPos: "justify-start items-start" },
        { bg: "from-blue-700 to-cyan-900", blend: "mix-blend-color-burn", textPos: "justify-end items-end text-right" },
        { bg: "from-pink-600 to-purple-900", blend: "mix-blend-hard-light", textPos: "justify-start items-center" },
        { bg: "from-gray-800 to-black", blend: "mix-blend-exclusion", textPos: "justify-end items-center" },
        { bg: "from-rose-800 to-indigo-900", blend: "mix-blend-color-dodge", textPos: "justify-center items-end text-center" }
    ];

    const searchCache = new Map();

    let _lastRenderedUserId = null;
    let _lastRenderedDateKey = null;
    let _isRenderingAIHome = false;
    let _cachedDailyPlaylists = null;
    var state = (typeof window !== "undefined" && window.state) ? window.state : ((typeof globalThis !== "undefined" && globalThis.state) ? globalThis.state : {});
    var jiosaavnAPI = (typeof window !== "undefined" && window.jiosaavnAPI) ? window.jiosaavnAPI : ((typeof globalThis !== "undefined" && globalThis.jiosaavnAPI) ? globalThis.jiosaavnAPI : {});
    var songStore = (typeof window !== "undefined" && window.songStore) ? window.songStore : ((typeof globalThis !== "undefined" && globalThis.songStore) ? globalThis.songStore : {});
    var ui = (typeof window !== "undefined" && window.ui) ? window.ui : ((typeof globalThis !== "undefined" && globalThis.ui) ? globalThis.ui : {});

    const DAILY_MIXES_CACHE_KEY = 'dtunes_daily_mixes_cache_v1';
    const LOCAL_MADE_FOR_YOU_CACHE_KEY = 'dtunes_made_for_you_cache';
    let activeExpiryTs = null;
    function formatDailyExpiry(ts) { return formatCacheExpiry(ts); }
    function readLocalDailyCache(uid) { return readDailyMixCache(); }
    function writeLocalDailyCache(uid, pl) { const r = writeDailyMixCache(uid, pl); if (r) { try { localStorage.setItem(LOCAL_MADE_FOR_YOU_CACHE_KEY, JSON.stringify(r)); } catch (_) {} } return r; }

    const DAILY_MIXES_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
    const TRENDING_CACHE_KEY = 'dtunes_trending_cache_v1';
    const TRENDING_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

    const isDesktopApp = () => {
        if (typeof window === "undefined") return false;
        return Boolean(
            window.isDTunesDesktop ||
            (window.electronAPI && window.electronAPI.isDesktopApp) ||
            window.dtunesDesktop?.isDesktop ||
            (window.process && window.process.type === "renderer") ||
            (typeof window.isWindowsApp === "function" && window.isWindowsApp())
        );
    };

    const isOfflineMode = () => {
        try {
            if (typeof window !== "undefined" && typeof window.__dtunesIsOffline === "function") {
                return window.__dtunesIsOffline();
            }
            // Strict constraint: offline features are ONLY for Windows desktop version, never web
            const isDesktop = isDesktopApp();
            if (isDesktop) {
                // desktop offline mode active
            } else {
                return false;
            }
            return typeof navigator !== "undefined" && navigator.onLine === false;
        } catch (_) {
            return false;
        }
    };

    if (typeof window !== "undefined") {
        window.isDesktopApp = isDesktopApp;
        window.isDTunesOfflineMode = isOfflineMode;
    }

    function localDateKey(date = new Date()) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    function readDailyMixCache() {
        try {
            const raw = localStorage.getItem(DAILY_MIXES_CACHE_KEY);
            if (!raw) return null;
            const data = JSON.parse(raw);
            if (!data || !Array.isArray(data.playlists) || data.playlists.length === 0) return null;
            const expiresAt = Date.parse(data.expiresAt);
            const isCacheValid = Number.isFinite(expiresAt) && expiresAt > Date.now();
            if (!isCacheValid) return null;
            activeExpiryTs = expiresAt;
            return data;
        } catch (_) {
            return null;
        }
    }

    function writeDailyMixCache(userId, playlists) {
        try {
            if (!Array.isArray(playlists) || playlists.length === 0) return null;
            const now = new Date();
            const payload = {
                userId: userId || null,
                dateKey: localDateKey(now),
                generatedAt: now.toISOString(),
                expiresAt: new Date(now.getTime() + DAILY_MIXES_CACHE_TTL_MS).toISOString(),
                playlists
            };
            localStorage.setItem(DAILY_MIXES_CACHE_KEY, JSON.stringify(payload));
            return payload;
        } catch (e) {
            console.warn('[Daily Mixes] Could not save offline cache:', e);
            return null;
        }
    }

    function clearDailyMixCache() {
        try { localStorage.removeItem(DAILY_MIXES_CACHE_KEY); } catch (_) {}
    }

    function formatCacheExpiry(expiresAt) {
        const date = new Date(expiresAt);
        if (!Number.isFinite(date.getTime())) return '';
        try {
            return date.toLocaleString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
            });
        } catch (_) {
            return date.toLocaleString();
        }
    }

    function readTrendingCache() {
        try {
            const raw = localStorage.getItem(TRENDING_CACHE_KEY);
            if (!raw) return null;
            const data = JSON.parse(raw);
            if (!data || !Array.isArray(data.songs) || data.songs.length === 0) return null;
            const expiresAt = Date.parse(data.expiresAt);
            const isCacheValid = Number.isFinite(expiresAt) && expiresAt > Date.now();
            if (!isCacheValid) return null;
            activeExpiryTs = expiresAt;
            return data;
        } catch (_) {
            return null;
        }
    }

    function writeTrendingCache(songs) {
        try {
            if (!Array.isArray(songs) || songs.length === 0) return;
            localStorage.setItem(TRENDING_CACHE_KEY, JSON.stringify({
                songs,
                savedAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + TRENDING_CACHE_TTL_MS).toISOString()
            }));
        } catch (_) {}
    }

    /**
     * Searches for a track and strictly validates both the playable audio track
     * and album artwork. If either is missing, invalid, or fallback art, returns null
     * so that the track is NOT displayed.
     */
    async function searchTrackData(title, artist) {
        const query = `${title} ${artist}`.trim();
        if (!query) return null;
        if (searchCache.has(query)) return searchCache.get(query);

        try {
            // 1. JioSaavn API query
            if (window.jiosaavnAPI && jiosaavnAPI.searchSongs) {
                const results = await jiosaavnAPI.searchSongs(query, 1);
                if (results && results.length > 0 && results[0]) {
                    const song = results[0];
                    const hasValidUrl = song.url && typeof song.url === 'string' && song.url.startsWith('http');
                    const hasValidArt = song.img && typeof song.img === 'string' &&
                                        song.img.startsWith('http') &&
                                        !song.img.includes('DTunes.svg') &&
                                        song.img !== FALLBACK_ART;
                    if (hasValidUrl && hasValidArt) {
                        searchCache.set(query, song);
                        if (window.songStore && window.songStore.add) window.songStore.add(song);
                        return song;
                    }
                }
            }
        } catch (e) {
            console.warn(`[Track Search] Search failed for "${query}":`, e);
        }

        // Return null if playable track or artwork failed to load
        searchCache.set(query, null);
        return null;
    }

    const aiPlaylistsStore = new Map();

    // Render skeleton layout with shimmering placeholders
    function renderSkeletons(container) {
        let skeletonShelves = '';
        for (let i = 0; i < 3; i++) {
            skeletonShelves += `
                <div class="mb-10 animate-fade-in">
                    <div class="flex items-center justify-between px-4 md:px-8 mb-4">
                        <div>
                            <div class="h-6 w-48 bg-white/10 rounded-md animate-pulse mb-2"></div>
                            <div class="h-3 w-64 bg-white/5 rounded animate-pulse"></div>
                        </div>
                        <div class="flex items-center gap-2">
                            <div class="h-7 w-16 bg-white/10 rounded-full animate-pulse"></div>
                            <div class="h-7 w-24 bg-white/5 rounded-full animate-pulse"></div>
                        </div>
                    </div>
                    <div class="relative group/track">
                        <div class="row-blur-left"></div>
                        <div class="horizontal-scroll px-4 md:px-8 gap-4">
                            <!-- 1 Cover skeleton + 4 song skeletons -->
                            <div class="scroll-card glass-panel p-3 rounded-xl flex flex-col w-40 flex-shrink-0 animate-pulse">
                                <div class="aspect-square rounded-lg bg-white/10 mb-3"></div>
                                <div class="h-3.5 w-3/4 bg-white/10 rounded mb-2"></div>
                                <div class="h-2.5 w-1/2 bg-white/5 rounded"></div>
                            </div>
                            ${Array(4).fill(`
                                <div class="scroll-card glass-panel p-3 rounded-xl flex flex-col w-40 flex-shrink-0 animate-pulse">
                                    <div class="aspect-square rounded-lg bg-white/10 mb-3"></div>
                                    <div class="h-3.5 w-3/4 bg-white/10 rounded mb-2"></div>
                                    <div class="h-2.5 w-1/2 bg-white/5 rounded"></div>
                                </div>
                            `).join('')}
                        </div>
                        <div class="row-blur-right"></div>
                    </div>
                </div>
            `;
        }

        container.innerHTML = `
            <div class="pt-2 animate-fade-in">
                <div class="flex items-center justify-between px-4 md:px-8 mb-6 pb-2 border-b border-white/10">
                    <div>
                        <h2 class="text-2xl md:text-3xl font-bold font-display text-white tracking-tight">Made For You</h2>
                        <p class="text-xs md:text-sm text-neutral-400 mt-1">Playlists personalized to your taste and favorites, updated daily.</p>
                    </div>
                </div>
                ${skeletonShelves}
            </div>
        `;
    }

    // Render clean prompt when user is not signed in
    function renderSignedOutState(container) {
        container.innerHTML = `
            <div class="pt-2 animate-fade-in px-4 md:px-8">
                <div class="p-6 md:p-8 rounded-2xl glass-panel border border-white/10 flex flex-col md:flex-row items-center justify-between gap-6 bg-white/[0.02]">
                    <div class="max-w-xl">
                        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-white text-xs font-semibold mb-3">
                            <span>Daily Mixes</span>
                        </div>
                        <h2 class="text-2xl md:text-3xl font-bold font-display text-white tracking-tight">Your Music, Tailored For You</h2>
                        <p class="text-sm text-neutral-300 mt-2 leading-relaxed">Sign in to unlock personalized daily mixes based on your listening history, favorite tracks, and custom playlists.</p>
                    </div>
                    <button onclick="if(window.dverse && dverse.signInWithGoogle) dverse.signInWithGoogle();" class="px-6 py-3 rounded-full bg-[var(--accent-color)] text-black font-bold text-sm hover:brightness-110 active:scale-[0.98] transition flex-shrink-0 cursor-pointer flex items-center gap-2">
                        <span>Sign In to D-Tunes</span>
                        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
                    </button>
                </div>
            </div>
        `;
    }

    function renderPlaylistView(container, playlists, options = {}) {
        const {
            userId = null,
            todayKey = localDateKey(),
            expiresAt = null,
            offline = false,
            prependHtml = '',
            appendHtml = '',
            emptyMessage = '',
            description = 'Playlists tailored to your taste and favorites, updated daily.'
        } = options;

        aiPlaylistsStore.clear();
        let sectionsHtml = '';

        for (let pIdx = 0; pIdx < playlists.length; pIdx++) {
            const playlist = playlists[pIdx];
            const playlistId = 'pl_daily_' + pIdx;
            const style = COVER_STYLES[(playlist.styleIndex || pIdx) % COVER_STYLES.length];

            // Ensure every song is stored in songStore
            const validSongs = (playlist.songs || []).filter(s =>
                s && s.url && typeof s.url === 'string' && s.url.startsWith('http') &&
                s.img && typeof s.img === 'string' && s.img.startsWith('http') &&
                !s.img.includes('DTunes.svg') && s.img !== FALLBACK_ART
            );

            validSongs.forEach(s => {
                if (s && window.songStore && window.songStore.add) window.songStore.add(s);
            });

            if (validSongs.length === 0) continue;

            aiPlaylistsStore.set(playlistId, {
                ...playlist,
                songs: validSongs
            });

            // Extract 4 genuine cover art images for the 2x2 collage (no fallback art)
            const collageArts = [];
            for (let c = 0; c < 4; c++) {
                collageArts.push(validSongs[c % validSongs.length].img);
            }

            // Render native D-Tunes song cards with progressive unblur & fade-in animation
            const songCardsHtml = validSongs.map(song => {
                let cardHtml = ui.createCard(song);
                cardHtml = cardHtml.replace(
                    'class="w-full h-full object-cover',
                    'class="w-full h-full object-cover reveal-blur-img" onload="this.classList.add(\'revealed\'); const p=this.closest(\'.scroll-card\'); if(p) p.querySelectorAll(\'.reveal-text\').forEach(el=>el.classList.add(\'revealed\'));"'
                );
                cardHtml = cardHtml.replace(
                    /<div class="marquee-container w-full">/g,
                    '<div class="marquee-container w-full reveal-text">'
                );
                return cardHtml;
            }).join('');

            sectionsHtml += `
                <div class="mb-10 animate-fade-in">
                    <!-- Playlist Row Header: Play, Add to Queue, Save -->
                    <div class="flex items-center justify-between px-4 md:px-8 mb-4">
                        <div>
                            <h3 class="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                                <span>${utils.escapeHtml(playlist.categoryTitle || playlist.title)}</span>
                            </h3>
                            ${playlist.description ? `<p class="text-xs text-gray-400 mt-0.5">${utils.escapeHtml(playlist.description)}</p>` : ''}
                        </div>
                        <div class="flex items-center gap-2">
                            ${offline ? '' : `<button onclick="window.aiHome.playEntirePlaylist('${playlistId}')" class="px-3.5 py-1.5 rounded-full bg-[var(--accent-color)] text-black text-xs font-bold hover:brightness-110 active:scale-[0.98] transition flex items-center gap-1.5" title="Play Playlist">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                                <span>Play</span>
                            </button>
                            <button onclick="window.aiHome.addPlaylistToQueue('${playlistId}')" class="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-bold active:scale-95 transition flex items-center gap-1.5 shadow-sm" title="Add all songs to queue">
                                <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                                <span>Add to Queue</span>
                            </button>`}
                            <button onclick="window.aiHome.savePlaylistToLibrary('${playlistId}')" class="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white active:scale-95 transition shadow-sm" title="Save to Your Library">
                                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/></svg>
                            </button>
                            <button onclick="if(window.aiReportManager) window.aiReportManager.openReportModal({ feature: 'Daily AI Mix', contentSummary: 'Playlist: ${utils.escapeHtml(playlist.categoryTitle || playlist.title)}' })" class="p-1.5 rounded-full bg-white/10 hover:bg-amber-500/20 text-gray-400 hover:text-amber-300 active:scale-95 transition shadow-sm cursor-pointer" title="Report inappropriate AI output (Policy 11.16)">
                                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                            </button>
                        </div>
                    </div>

                    <div class="relative group/track">
                        <div class="row-blur-left"></div>
                        <div class="horizontal-scroll px-4 md:px-8 gap-4">
                            <!-- 2x2 Collage Playlist Cover -->
                            <div class="scroll-card glass-panel p-3 rounded-xl transition hover-pause group/cover relative flex flex-col w-40 flex-shrink-0 cursor-pointer border border-white/10 hover:border-white/20 shadow-xl overflow-hidden" onclick="window.aiHome.playEntirePlaylist('${playlistId}')">
                                <div class="relative aspect-square rounded-lg overflow-hidden mb-3 bg-black/60 shadow-md">
                                    <div class="absolute inset-0 grid grid-cols-2 grid-rows-2">
                                        <img src="${collageArts[0]}" class="w-full h-full object-cover reveal-blur-img" onload="this.classList.add('revealed')" />
                                        <img src="${collageArts[1]}" class="w-full h-full object-cover reveal-blur-img" onload="this.classList.add('revealed')" />
                                        <img src="${collageArts[2]}" class="w-full h-full object-cover reveal-blur-img" onload="this.classList.add('revealed')" />
                                        <img src="${collageArts[3]}" class="w-full h-full object-cover reveal-blur-img" onload="this.classList.add('revealed')" />
                                    </div>
                                    <div class="absolute inset-0 bg-gradient-to-br ${style.bg} ${style.blend} opacity-70 group-hover/cover:opacity-60 transition-opacity"></div>
                                    <div class="absolute inset-0 bg-black/25 backdrop-blur-[1px]"></div>
                                    <div class="absolute inset-0 p-2.5 flex flex-col ${style.textPos} z-10">
                                        <h4 class="text-white font-bold text-xs sm:text-sm uppercase leading-tight drop-shadow-md mt-auto">${utils.escapeHtml(playlist.title || 'Mix')}</h4>
                                    </div>
                                    <div class="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover/cover:opacity-100 transition z-20">
                                        <span class="bg-[var(--accent-color)] text-black p-3 rounded-full shadow-2xl transform scale-75 group-hover/cover:scale-100 transition">
                                            <svg width="22" height="22" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                        </span>
                                    </div>
                                </div>
                                <div class="w-full min-w-0 flex-1">
                                    <div class="marquee-container w-full reveal-text"><h3 class="font-bold text-white text-sm marquee-text">${utils.escapeHtml(playlist.title || 'Mix')}</h3></div>
                                    <div class="marquee-container w-full mt-1 reveal-text"><p class="text-xs text-gray-400 marquee-text">${validSongs.length} Tracks</p></div>
                                </div>
                            </div>

                            <!-- Native Verified Song Cards -->
                            ${songCardsHtml}
                        </div>
                        <div class="row-blur-right"></div>
                    </div>
                </div>
            `;
        }

        const emptyHtml = !sectionsHtml && emptyMessage
            ? `<div class="px-4 md:px-8 mb-10">
                    <div class="glass-panel rounded-xl px-5 py-6 text-sm text-neutral-400 leading-relaxed">${utils.escapeHtml(emptyMessage)}</div>
               </div>`
            : '';

        container.innerHTML = `
            ${prependHtml}
            ${(playlists && playlists.length > 0) ? `
            <div class="pt-2 animate-fade-in">
                <!-- Clean Editorial Header -->
                <div class="flex items-center justify-between px-4 md:px-8 mb-6 pb-2 border-b border-white/10">
                    <div>
                        <h2 class="text-2xl md:text-3xl font-bold font-display text-white tracking-tight">Made For You</h2>
                        <p class="text-xs md:text-sm text-neutral-400 mt-1">${utils.escapeHtml(description)}${expiresAt ? ` <span class="text-xs text-brand-primary font-medium ml-2 bg-brand-primary/10 border border-brand-primary/20 px-2 py-0.5 rounded-full">Expires at ${formatDailyExpiry(expiresAt)}</span>` : ""}</p>
                    </div>
                    <div class="flex items-center gap-2">
                        <button onclick="if(window.aiReportManager) window.aiReportManager.openReportModal({ feature: 'Made For You (Daily Recommendations)' })" class="text-xs text-amber-400/90 hover:text-amber-300 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 transition hover:bg-amber-500/20 cursor-pointer" title="Report issue with AI-generated recommendations (Policy 11.16)">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                            <span>Report AI Content</span>
                        </button>
                        ${offline ? '' : `<button onclick="window.aiHome.renderAIHome(true)" title="Refresh Daily Mixes" class="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition hover:rotate-180 duration-500 shadow-md">
                            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                        </button>`}
                    </div>
                </div>

                ${sectionsHtml}
                ${emptyHtml}
            </div>` : (emptyHtml ? `<div class="pt-2">${emptyHtml}</div>` : "")}
            ${appendHtml || ""}
        `;

        // Reveal any images that are already complete from cache
        setTimeout(() => {
            container.querySelectorAll('.reveal-blur-img').forEach(img => {
                if (img.complete) {
                    img.classList.add('revealed');
                    const card = img.closest('.scroll-card');
                    if (card) card.querySelectorAll('.reveal-text').forEach(el => el.classList.add('revealed'));
                }
            });
        }, 60);

        _cachedDailyPlaylists = playlists;
        _lastRenderedUserId = userId;
        _lastRenderedDateKey = todayKey;

        if (window.updateMarquees) updateMarquees();
        if (window.setupShelfNavButtons) setupShelfNavButtons();
    }

    function buildOfflineBanner(downloads) {
        const count = downloads.length;
        return `
            <div class="px-4 md:px-8 mb-6 animate-fade-in">
                <div class="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                    <div class="w-10 h-10 rounded-full bg-amber-400/15 border border-amber-400/25 flex items-center justify-center flex-shrink-0">
                        <svg class="w-5 h-5 text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 5.636a9 9 0 010 12.728M5.636 18.364a9 9 0 010-12.728M8.464 8.464a5 5 0 000 7.072m7.072 0a5 5 0 000-7.072M12 12h.01"/></svg>
                    </div>
                    <div class="min-w-0 flex-1">
                        <h2 class="text-sm font-bold text-white tracking-tight">Offline mode</h2>
                        <p class="text-xs text-amber-100/70 mt-0.5">You're connected to this device only. ${count ? `${count} downloaded ${count === 1 ? 'song' : 'songs'} play without internet — cached content is shown below.` : 'Download songs while online to play them here without internet.'}</p>
                    </div>
                    <button onclick="ui.switchView('library')" class="px-4 py-2 rounded-full bg-amber-400/20 hover:bg-amber-400/30 text-amber-100 text-xs font-bold transition flex-shrink-0">Open Library</button>
                </div>
            </div>
        `;
    }

    function buildDownloadsShelf(downloads) {
        const cards = downloads.map(song => ui.createCard(song)).join('');
        const content = downloads.length
            ? `<div class="relative group/track">
                    <div class="row-blur-left"></div>
                    <div class="horizontal-scroll px-4 md:px-8 gap-4">${cards}</div>
                    <div class="row-blur-right"></div>
               </div>`
            : `<div class="px-4 md:px-8">
                    <div class="glass-panel rounded-xl px-5 py-6 text-sm text-neutral-400">No downloaded songs yet. Tap the download icon on any song while online and it will appear here.</div>
               </div>`;

        return `
            <div class="mb-10 animate-fade-in">
                <div class="flex items-center justify-between px-4 md:px-8 mb-4">
                    <div>
                        <h3 class="text-xl font-bold text-white tracking-tight">Downloaded Songs</h3>
                        <p class="text-xs text-gray-400 mt-0.5">${downloads.length ? `${downloads.length} ${downloads.length === 1 ? 'song' : 'songs'} saved on this device — plays without a connection.` : 'Your offline collection lives here.'}</p>
                    </div>
                </div>
                ${content}
            </div>
        `;
    }

    function buildLibraryShelf() {
        const librarySongs = [];
        const seen = new Set();
        const pushSong = (song) => {
            if (!song) return;
            const key = song.id || song.saavn_id || song.url || song.name;
            if (!key || seen.has(key)) return;
            seen.add(key);
            librarySongs.push(song);
        };

        (state.libraryIds || []).forEach(item => {
            if (typeof item === 'object') pushSong(item);
            else pushSong((state.playHistory || []).find(song => song.id === item));
        });
        (state.likedIds || []).forEach(item => {
            if (typeof item === 'object') pushSong(item);
            else pushSong((state.playHistory || []).find(song => song.id === item));
        });

        if (librarySongs.length === 0) return '';

        const cards = librarySongs.slice(0, 16).map(song => ui.createCard(song)).join('');
        return `
            <div class="mb-10 animate-fade-in">
                <div class="flex items-center justify-between px-4 md:px-8 mb-4">
                    <div>
                        <h3 class="text-xl font-bold text-white tracking-tight">Your Library</h3>
                        <p class="text-xs text-gray-400 mt-0.5">Songs and favorites saved on this device.</p>
                    </div>
                </div>
                <div class="relative group/track">
                    <div class="row-blur-left"></div>
                    <div class="horizontal-scroll px-4 md:px-8 gap-4">${cards}</div>
                    <div class="row-blur-right"></div>
                </div>
            </div>
        `;
    }

    function buildRecentlyPlayedShelf() {
        const history = Array.isArray(state.playHistory) ? state.playHistory : [];
        if (history.length === 0) return '';
        const deduped = utils.deduplicateSongs(history).slice(0, 16);
        if (deduped.length === 0) return '';
        const cards = deduped.map(song => ui.createCard(song)).join('');
        return `
            <div class="mb-10 animate-fade-in">
                <div class="flex items-center justify-between px-4 md:px-8 mb-4">
                    <div>
                        <h3 class="text-xl font-bold text-white tracking-tight">Recently Played</h3>
                        <p class="text-xs text-gray-400 mt-0.5">Downloaded songs play offline; everything else is greyed out.</p>
                    </div>
                </div>
                <div class="relative group/track">
                    <div class="row-blur-left"></div>
                    <div class="horizontal-scroll px-4 md:px-8 gap-4">${cards}</div>
                    <div class="row-blur-right"></div>
                </div>
            </div>
        `;
    }

        function buildCachedTrendingShelf() {
        const cached = readTrendingCache();
        if (!cached || !Array.isArray(cached.songs) || cached.songs.length === 0) return "";
        const cards = cached.songs.slice(0, 16).map(song => ui.createCard(song)).join("");
        return `
            <div class="mb-10 animate-fade-in">
                <div class="flex items-center justify-between px-4 md:px-8 mb-4">
                    <div>
                        <h3 class="text-xl font-bold text-white tracking-tight">Trending Hits (Cached)</h3>
                        <p class="text-xs text-gray-400 mt-0.5">Popular tracks cached from your recent sessions.</p>
                    </div>
                </div>
                <div class="relative group/track">
                    <div class="row-blur-left"></div>
                    <div class="horizontal-scroll px-4 md:px-8 gap-4">${cards}</div>
                    <div class="row-blur-right"></div>
                </div>
            </div>
        `;
    }

async function renderOfflineHome(container) {
        let downloads = [];
        if (window.offlineStore && typeof window.offlineStore.list === "function") {
            try {
                downloads = await window.offlineStore.list();
            } catch (e) {
                console.warn("[Offline] Could not read downloads:", e);
            }
        }
        if (window.dtunesOfflineList) {
            try {
                const nativeList = window.dtunesOfflineList() || [];
                const seen = new Set(downloads.map(d => String(d.id)));
                nativeList.forEach(item => {
                    if (!seen.has(String(item.id))) {
                        seen.add(String(item.id));
                        downloads.push({
                            id: String(item.id),
                            name: item.name || "Unknown",
                            artist: item.artist || "Unknown Artist",
                            img: item.img || "",
                            duration: item.duration || 0,
                            url: window.dtunesOfflineUrl ? window.dtunesOfflineUrl(item.id) : "",
                            isOffline: true
                        });
                    }
                });
            } catch (_) {}
        }

        downloads.forEach(song => {
            if (window.songStore && songStore.set) songStore.set(String(song.id), song);
        });

        document.getElementById("section-trending")?.classList.add("hidden");
        document.getElementById("section-recent")?.classList.add("hidden");
        document.getElementById("section-quick-picks")?.classList.add("hidden");
        document.getElementById("section-for-you")?.classList.add("hidden");
        document.getElementById("section-downloaded-songs")?.classList.add("hidden");

        const cached = readDailyMixCache();
        const playlistSource = cached?.playlists || [];

        renderPlaylistView(container, playlistSource, {
            userId: cached?.userId || null,
            todayKey: cached?.dateKey || localDateKey(),
            expiresAt: cached?.expiresAt || null,
            offline: true,
            prependHtml: buildOfflineBanner(downloads) + buildDownloadsShelf(downloads) + buildRecentlyPlayedShelf() + buildLibraryShelf() + buildCachedTrendingShelf(),
            description: cached
                ? "Your daily mixes, ready for offline listening."
                : "Daily mixes appear here automatically after you open D-Tunes online.",
            emptyMessage: "Made For You is not saved on this device yet. Open D-Tunes with a connection once and today's mixes will be cached here automatically."
        });

        _lastRenderedDateKey = cached?.dateKey || localDateKey();
    }

    /**
     * Renders daily mixes:
     * - Only works if signed in.
     * - Checks Supabase table dtunes_daily_mixes for today's generated mixes.
     * - If present, loads without generating.
     * - If not present (or forced refresh), generates, hydrates, strictly excludes invalid songs,
     *   and updates the user's row in Supabase.
     */
    async function renderAIHome(forceRefresh = false) {
        const container = document.getElementById('ai-hub-container');
        if (!container) return;

        // Offline boot: render purely from local downloads/library/cache. Never
        // touch Supabase or the AI endpoint while the device has no connection.
        if (isOfflineMode()) {
            await renderOfflineHome(container);
            return;
        }

        // 1. Session check: only work if signed in
        const session = (window.cloudLibrary && cloudLibrary.session) ||
                        (window.dverse && window.dverse.getSession ? await window.dverse.getSession() : null);

        if (!session || !session.user || !session.user.id) {
            _lastRenderedUserId = null;
            _cachedDailyPlaylists = null;
            renderSignedOutState(container);
            return;
        }

        const userId = session.user.id;
        const todayKey = localDateKey();

        // If recommendations are already rendered for today and same user, and forceRefresh is false, do NOT reload!
        const hasExistingCards = Boolean(container.querySelector('.scroll-card, .daily-mix-shelf, h2'));
        if (!forceRefresh && _lastRenderedUserId === userId && _lastRenderedDateKey === todayKey && _cachedDailyPlaylists && _cachedDailyPlaylists.length > 0 && hasExistingCards) {
            return;
        }

        // Cached mixes generated today: paint them immediately and skip both the
        // Supabase read and the AI generation. A cache from a previous day is
        // ignored online (so mixes still refresh daily) but kept for offline use.
        const localCache = readDailyMixCache();
        const cacheIsFromToday = localCache?.dateKey === todayKey;
        if (!forceRefresh && cacheIsFromToday && localCache.playlists?.length && (!localCache.userId || localCache.userId === userId)) {
            renderPlaylistView(container, localCache.playlists, {
                userId,
                todayKey: localCache.dateKey || todayKey,
                expiresAt: localCache.expiresAt
            });
            return;
        }

        if (_isRenderingAIHome) return;
        _isRenderingAIHome = true;

        // 2. Render skeletons while loading
        renderSkeletons(container);

        try {
            let playlists = null;
            const supabase = window.dverse?.supabase;

            // 3. First check Supabase for today's saved mixes
            if (!forceRefresh && supabase) {
                try {
                    const { data, error } = await supabase
                        .from('dtunes_daily_mixes')
                        .select('date_key, playlists')
                        .eq('user_id', userId)
                        .maybeSingle();

                    if (!error && data && data.date_key === todayKey && Array.isArray(data.playlists) && data.playlists.length > 0) {
                        playlists = data.playlists;
                    }
                } catch (e) {
                    console.warn('[Daily Mixes] Supabase read failed:', e);
                }
            }

            // 4. If not generated for today, generate and hydrate
            if (!playlists || playlists.length === 0) {
                const history = state.playHistory || [];
                const liked = state.likedIds || [];
                const lib = state.libraryIds || [];
                const disliked = state.dislikedSongs || [];

                const generated = await window.ai.generateCustomPlaylists(history, liked, lib, disliked, forceRefresh);
                if (!generated || generated.length === 0) {
                    container.innerHTML = '';
                    return;
                }

                // Hydrate songs and strictly exclude any that fail to load audio or album art
                const hydratedPlaylists = [];
                for (let i = 0; i < generated.length; i++) {
                    const pl = generated[i];
                    const rawSongs = pl.songs || [];
                    const hydratedSongs = await Promise.all(
                        rawSongs.map(s => searchTrackData(s.title, s.artist))
                    );

                    // Must have a streamable URL and genuine artwork
                    const validSongs = hydratedSongs.filter(s =>
                        s && s.url && typeof s.url === 'string' && s.url.startsWith('http') &&
                        s.img && typeof s.img === 'string' && s.img.startsWith('http') &&
                        !s.img.includes('DTunes.svg') && s.img !== FALLBACK_ART
                    );

                    // Only include playlist if at least 2 valid songs exist
                    if (validSongs.length >= 2) {
                        hydratedPlaylists.push({
                            categoryTitle: pl.categoryTitle || pl.title || 'Mix',
                            title: pl.title || pl.categoryTitle || 'Mix',
                            description: pl.description || '',
                            styleIndex: pl.styleIndex !== undefined ? pl.styleIndex : i,
                            songs: validSongs
                        });
                    }
                }

                playlists = hydratedPlaylists;

                // 5. Update user's single row in Supabase for today
                if (supabase && playlists.length > 0) {
                    try {
                        await supabase.from('dtunes_daily_mixes').upsert({
                            user_id: userId,
                            date_key: todayKey,
                            playlists: playlists,
                            updated_at: new Date().toISOString()
                        }, { onConflict: 'user_id' });
                    } catch (e) {
                        console.warn('[Daily Mixes] Failed to store daily mixes in Supabase:', e);
                    }
                }
            }

            if (!playlists || playlists.length === 0) {
                container.innerHTML = '';
                return;
            }

            // 6. Save today's mixes locally before painting so an offline reload can
            // show them without Supabase or the AI endpoint.
            const cachePayload = writeDailyMixCache(userId, playlists);
            renderPlaylistView(container, playlists, {
                userId,
                todayKey,
                expiresAt: cachePayload?.expiresAt || null
            });

            // Cache diagnostics are developer-only; regular listeners never see them.
            const isDev = typeof window.isAuthorizedDev === 'function' && window.isAuthorizedDev();
            if (cachePayload && isDev && window.ui?.showToast) {
                ui.showToast(`Made For You saved offline until ${formatCacheExpiry(cachePayload.expiresAt)}`);
            }
        } catch (err) {
            console.warn("[Daily Mixes] Render error:", err);
            container.innerHTML = '';
        } finally {
            _isRenderingAIHome = false;
        }
    }

    function playEntirePlaylist(playlistId) {
        const item = aiPlaylistsStore.get(playlistId);
        if (!item || !item.songs || item.songs.length === 0) return;

        const firstSong = item.songs[0];
        const remaining = item.songs.slice(1);

        player.playDirect(firstSong);

        state.queue = [...remaining];
        state.idx = 0;
        state.shuffledOrder = [];
        state.shufflePointer = 0;

        if (window.ui && ui.renderQueue) ui.renderQueue();
        if (window.ui?.showToast) ui.showToast(`Playing ${item.title}`);
    }

    function addPlaylistToQueue(playlistId) {
        const item = aiPlaylistsStore.get(playlistId);
        if (!item || !item.songs || item.songs.length === 0) return;

        state.queue.push(...item.songs);
        if (window.ui && ui.renderQueue) ui.renderQueue();
        if (window.ui?.showToast) ui.showToast(`Added ${item.songs.length} songs to Queue`);
    }

    function savePlaylistToLibrary(playlistId) {
        const item = aiPlaylistsStore.get(playlistId);
        if (!item || !item.songs || item.songs.length === 0) return;

        const name = item.title || 'Saved Mix';
        if (!state.playlists) state.playlists = {};
        state.playlists[name] = [...item.songs];

        localStorage.setItem('playlists', JSON.stringify(state.playlists));
        if (window.ui && ui.renderPlaylists) ui.renderPlaylists();
        if (window.ui?.showToast) ui.showToast(`Saved "${name}" to your Library Playlists!`);
    }

    // Load Trending Hits
    async function loadTrendingHits() {
        const grid = document.getElementById('trending-grid');
        const section = document.getElementById('section-trending');
        if (!grid) return;

        const paint = (songs) => {
            grid.innerHTML = songs.map(s => ui.createCard(s)).join('');
            if (section) section.classList.remove('hidden');
            if (window.updateMarquees) updateMarquees();
            if (window.setupShelfNavButtons) setupShelfNavButtons();
        };

        // Offline: the home view is built around downloaded songs, so the
        // network-only Trending shelf is hidden rather than shown greyed out.
        if (isOfflineMode()) {
            grid.innerHTML = '';
            if (section) section.classList.add('hidden');
            return;
        }

        const cached = readTrendingCache();
        if (cached?.songs?.length) {
            paint(cached.songs);
        } else {
            grid.innerHTML = Array(12).fill('<div class="scroll-card h-[220px] rounded-xl glass-panel animate-pulse w-40 flex-shrink-0"></div>').join('');
        }

        try {
            let songs = [];
            if (window.jiosaavnAPI && jiosaavnAPI.getTrending) {
                songs = await jiosaavnAPI.getTrending(20);
            }
            if (!songs || songs.length === 0) {
                if (window.jiosaavnAPI && jiosaavnAPI.searchSongs) {
                    songs = await jiosaavnAPI.searchSongs('Top Bollywood Hits 2026', 16);
                }
            }
            if (songs && songs.length > 0) {
                writeTrendingCache(songs);
                paint(songs);
            } else if (!cached?.songs?.length) {
                grid.innerHTML = '<p class="text-neutral-500 pl-8 text-xs">Trending hits temporarily unavailable.</p>';
            }
        } catch (e) {
            console.warn("[Trending] Error loading trending hits:", e);
            if (isOfflineMode()) return;
            if (window.jiosaavnAPI && jiosaavnAPI.searchSongs) {
                try {
                    const fallback = await jiosaavnAPI.searchSongs('Top Hits', 16);
                    if (fallback && fallback.length) {
                        writeTrendingCache(fallback);
                        paint(fallback);
                    }
                } catch (err) {}
            }
        }
    }

    // Load Recently Played
    function loadRecentlyPlayed() {
        const section = document.getElementById('section-recent');
        const grid = document.getElementById('recent-grid');
        if (!section || !grid) return;

        // Offline home renders its own Recently Played shelf inside the hub.
        if (isOfflineMode()) {
            grid.innerHTML = '';
            section.classList.add('hidden');
            return;
        }

        if (!state.playHistory || state.playHistory.length === 0) {
            section.classList.add('hidden');
            return;
        }

        section.classList.remove('hidden');
        const deduped = utils.deduplicateSongs(state.playHistory);
        grid.innerHTML = deduped.slice(0, 16).map(s => ui.createCard(s)).join('');
        if (window.updateMarquees) updateMarquees();
        if (window.setupShelfNavButtons) setupShelfNavButtons();
    }

    window.aiHome = {
        renderAIHome,
        writeTrendingCache,
        readTrendingCache,
        renderOfflineHome,
        playEntirePlaylist,
        addPlaylistToQueue,
        savePlaylistToLibrary,
        loadTrendingHits,
        loadRecentlyPlayed,
        searchTrackData
    };

    // Override homeView cleanly
    if (typeof homeView !== 'undefined') {
        homeView.init = async () => {
            if (typeof stripTouchHoverClasses === 'function') stripTouchHoverClasses();
            if (ui.updateProfileUI) ui.updateProfileUI();

            const preferredLanguageSelect = document.getElementById('preferred-language-select');
            if (preferredLanguageSelect) preferredLanguageSelect.value = localStorage.getItem('preferredLanguage') || '';
            const audioQualitySelect = document.getElementById('setting-audio-quality');
            if (audioQualitySelect) audioQualitySelect.value = state.quality || 'high';

            if (ui.renderEqualizerSettings) ui.renderEqualizerSettings();
            if (ui.renderPlaylists) ui.renderPlaylists();
            if (ui.renderLibraryLists) ui.renderLibraryLists();

            // 1. Render Daily Mixes
            renderAIHome();

            // 2. Render Trending Songs
            loadTrendingHits();

            // 3. Render Recently Played
            loadRecentlyPlayed();

            if (window.updateMarquees) updateMarquees();
            if (window.setupShelfNavButtons) setupShelfNavButtons();
        };

        // Continuous Autoplay
        homeView.autoplayNextIntelligentTracks = async () => {
            const currentTrack = state.currentTrack || (state.playHistory && state.playHistory[0]);
            if (!currentTrack) return false;

            const trackTitle = currentTrack.name || currentTrack.title || '';
            const trackArtist = currentTrack.artist || currentTrack.primary_artists || '';
            if (!trackTitle) return false;

            if (window.ui?.showToast) ui.showToast("Autoplay: Queuing next tracks...");
            
            try {
                let songList = [];
                const disliked = state.dislikedSongs || [];
                if (window.ai && window.ai.generateQueueAutoplay) {
                    songList = await window.ai.generateQueueAutoplay(trackTitle, trackArtist, 8, disliked);
                }

                if (!songList || songList.length === 0) {
                    if (window.jiosaavnAPI && jiosaavnAPI.searchSongs) {
                        songList = await jiosaavnAPI.searchSongs(`${trackArtist} hits`, 8);
                    }
                }

                const hydrated = [];
                for (const s of songList) {
                    const matchedSong = await searchTrackData(s.title || s.name, s.artist);
                    if (matchedSong && matchedSong.url && matchedSong.img && !matchedSong.img.includes('DTunes.svg') && matchedSong.img !== FALLBACK_ART) {
                        const appTrack = window.recommendationClient ? window.recommendationClient.toAppSong(matchedSong) : matchedSong;
                        if (!state.queue.some(q => q.id === appTrack.id)) {
                            hydrated.push(appTrack);
                        }
                    }
                }

                if (hydrated.length > 0) {
                    state.queue.push(...hydrated);
                    if (window.ui && ui.renderQueue) ui.renderQueue();
                    if (window.ui?.showToast) ui.showToast(`Autoplay: Added ${hydrated.length} tracks to queue`);
                    return true;
                }
            } catch (e) {
                console.warn("[Autoplay] Error:", e);
            }

            return false;
        };
    }

    // React to connectivity transitions without a page reload: offline shows the
    // local-only home, coming back online refreshes trending and daily mixes.
    let _lastConnectivityOffline = isOfflineMode();
    const handleConnectivityChange = () => {
        const offline = isOfflineMode();
        if (offline === _lastConnectivityOffline) return;
        _lastConnectivityOffline = offline;
        if (!document.getElementById('ai-hub-container')) return;
        const refreshHome = async () => {
            if (!offline && window.cloudLibrary?.init) {
                try { await window.cloudLibrary.init(); } catch (_) {}
            }
            await renderAIHome();
            loadTrendingHits();
            loadRecentlyPlayed();
        };
        refreshHome().catch((e) => console.warn('[Offline] Home transition failed:', e));
    };
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('offline', handleConnectivityChange);
        window.addEventListener('online', handleConnectivityChange);
    }

    // Re-render only when auth identity actually changes (ignore tab focus/token refresh)
    if (window.dverse && window.dverse.onAuthStateChange) {
        window.dverse.onAuthStateChange((event, session) => {
            const currentUid = session?.user?.id || null;
            if (event === 'SIGNED_OUT' || !currentUid) {
                _lastRenderedUserId = null;
                _cachedDailyPlaylists = null;
                clearDailyMixCache();
                const container = document.getElementById('ai-hub-container');
                if (container) renderSignedOutState(container);
                return;
            }
            // Ignore focus-triggered token refresh or identical user events!
            if (event === 'TOKEN_REFRESHED' || currentUid === _lastRenderedUserId) {
                return;
            }
            // User identity actually changed
            renderAIHome(false);
        });
    }
})();
