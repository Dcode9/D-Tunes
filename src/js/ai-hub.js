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

    async function searchTrackData(title, artist) {
        const query = `${title} ${artist}`.trim();
        if (!query) return null;
        if (searchCache.has(query)) return searchCache.get(query);

        try {
            // Priority 1: JioSaavn API
            if (window.jiosaavnAPI && jiosaavnAPI.searchSongs) {
                const results = await jiosaavnAPI.searchSongs(query, 1);
                if (results && results.length > 0 && results[0]) {
                    const song = results[0];
                    searchCache.set(query, song);
                    return song;
                }
            }

            // Priority 2: iTunes API
            const encoded = encodeURIComponent(query);
            const res = await fetch(`https://itunes.apple.com/search?term=${encoded}&entity=song&limit=1`);
            const data = await res.json();
            if (data.results && data.results.length > 0) {
                const track = data.results[0];
                const normalized = {
                    id: 'itunes_' + track.trackId,
                    name: track.trackName,
                    title: track.trackName,
                    artist: track.artistName,
                    img: track.artworkUrl100 ? track.artworkUrl100.replace('100x100bb', '500x500bb') : FALLBACK_ART,
                    url: track.previewUrl,
                    duration: Math.floor((track.trackTimeMillis || 0) / 1000) || 30,
                    source: 'itunes'
                };
                searchCache.set(query, normalized);
                return normalized;
            }
        } catch (e) {
            console.warn(`[AI Hub] Song search failed for "${query}":`, e);
        }

        const fallback = {
            id: 'gen_' + Math.random().toString(36).slice(2, 9),
            name: title,
            title: title,
            artist: artist || 'Unknown Artist',
            img: FALLBACK_ART,
            url: null,
            duration: 180
        };
        searchCache.set(query, fallback);
        return fallback;
    }

    const aiPlaylistsStore = new Map();

    async function renderAIHome(forceRefresh = false) {
        const container = document.getElementById('ai-hub-container');
        if (!container) return;

        const history = state.playHistory || [];
        const liked = state.likedIds || [];
        const lib = state.libraryIds || [];

        // Show generating banner
        container.innerHTML = `
            <div class="px-4 md:px-8 pt-4 pb-6 animate-fade-in">
                <div class="flex items-center justify-between mb-6">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500/20 to-purple-600/30 border border-amber-500/30 flex items-center justify-center shadow-lg shadow-amber-500/10">
                            <span class="text-lg">✨</span>
                        </div>
                        <div>
                            <div class="flex items-center gap-2">
                                <h2 class="text-xl md:text-2xl font-black text-white tracking-tight">AI Recommendation Engine</h2>
                                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase tracking-wider">Inception Mercury-2.5</span>
                            </div>
                            <p class="text-xs text-neutral-400 mt-0.5">Live personalized mixes tailored to your listening habits...</p>
                        </div>
                    </div>
                </div>

                <div class="flex flex-col items-center justify-center py-14 px-4 text-center rounded-2xl bg-neutral-900/40 border border-white/5 shadow-2xl">
                    <div class="relative mb-4">
                        <div class="absolute inset-0 bg-amber-500/20 blur-xl rounded-full"></div>
                        <div class="w-14 h-14 rounded-full border-2 border-amber-500/30 border-t-amber-400 animate-spin flex items-center justify-center relative z-10">
                            <span class="text-lg animate-pulse">🎵</span>
                        </div>
                    </div>
                    <h3 class="text-base font-bold text-white mb-1">Generating Your Custom Mixes</h3>
                    <p class="text-xs text-neutral-400 max-w-md mb-2">Analyzing your profile & querying Inception LLM...</p>
                    <div class="flex items-center gap-2 text-[11px] font-mono text-amber-400/80 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
                        <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                        Inception Mercury-2.5 Active
                    </div>
                </div>
            </div>
        `;

        try {
            const playlists = await window.ai.generateCustomPlaylists(history, liked, lib, forceRefresh);
            if (!playlists || playlists.length === 0) {
                container.innerHTML = `
                    <div class="px-4 md:px-8 py-8 text-center">
                        <p class="text-neutral-400 text-sm mb-4">No AI mixes generated yet.</p>
                        <button onclick="window.aiHome.renderAIHome(true)" class="px-6 py-2.5 rounded-full bg-[var(--accent-color)] text-black font-bold text-xs hover:scale-105 transition">Generate Mixes</button>
                    </div>
                `;
                return;
            }

            aiPlaylistsStore.clear();
            let sectionsHtml = '';

            for (let pIdx = 0; pIdx < playlists.length; pIdx++) {
                const playlist = playlists[pIdx];
                const playlistId = 'pl_ai_' + pIdx;
                const style = COVER_STYLES[(playlist.styleIndex || pIdx) % COVER_STYLES.length];

                // Hydrate songs in parallel
                const rawSongs = playlist.songs || [];
                const hydratedSongs = await Promise.all(
                    rawSongs.map(s => searchTrackData(s.title, s.artist))
                );
                const validSongs = hydratedSongs.filter(Boolean);

                aiPlaylistsStore.set(playlistId, {
                    ...playlist,
                    songs: validSongs
                });

                // Extract up to 4 cover art images for the 2x2 collage
                const collageArts = validSongs.slice(0, 4).map(s => s.img || FALLBACK_ART);
                while (collageArts.length < 4) {
                    collageArts.push(FALLBACK_ART);
                }

                // Render songs using NATIVE ui.createCard(song) so song cards look EXACTLY as before!
                const songCardsHtml = validSongs.map(song => ui.createCard(song)).join('');

                sectionsHtml += `
                    <div class="mb-10">
                        <div class="flex items-center justify-between px-4 md:px-8 mb-4">
                            <div>
                                <h3 class="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                                    <span>${utils.escapeHtml(playlist.categoryTitle || 'Curated Mix')}</span>
                                </h3>
                                ${playlist.description ? `<p class="text-xs text-gray-400 mt-0.5">${utils.escapeHtml(playlist.description)}</p>` : ''}
                            </div>
                            <button onclick="window.aiHome.playEntirePlaylist('${playlistId}')" class="text-xs font-bold px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition flex items-center gap-1.5 shadow-sm">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                                <span>Play Mix</span>
                            </button>
                        </div>

                        <div class="relative group/track">
                            <div class="row-blur-left"></div>
                            <div class="horizontal-scroll px-4 md:px-8 gap-4">
                                <!-- Dynamic 2x2 Collage Cover (styled to match native scroll-card) -->
                                <div class="scroll-card glass-panel p-3 rounded-xl transition hover-pause group/cover relative flex flex-col w-40 flex-shrink-0 cursor-pointer border border-white/10 hover:border-amber-400/50 shadow-xl overflow-hidden" onclick="window.aiHome.playEntirePlaylist('${playlistId}')">
                                    <div class="relative aspect-square rounded-lg overflow-hidden mb-3 bg-black/60 shadow-md">
                                        <div class="absolute inset-0 grid grid-cols-2 grid-rows-2">
                                            <img src="${collageArts[0]}" class="w-full h-full object-cover" />
                                            <img src="${collageArts[1]}" class="w-full h-full object-cover" />
                                            <img src="${collageArts[2]}" class="w-full h-full object-cover" />
                                            <img src="${collageArts[3]}" class="w-full h-full object-cover" />
                                        </div>
                                        <div class="absolute inset-0 bg-gradient-to-br ${style.bg} ${style.blend} opacity-85 group-hover/cover:opacity-75 transition-opacity"></div>
                                        <div class="absolute inset-0 bg-black/25 backdrop-blur-[1px]"></div>
                                        <div class="absolute inset-0 p-2.5 flex flex-col ${style.textPos} z-10">
                                            <span class="text-[8px] font-black uppercase tracking-widest text-amber-300 px-1.5 py-0.5 rounded bg-black/60 self-start">AI MIX</span>
                                            <h4 class="text-white font-black text-xs sm:text-sm uppercase leading-tight drop-shadow-md mt-auto">${utils.escapeHtml(playlist.title || 'Mix')}</h4>
                                        </div>
                                        <div class="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover/cover:opacity-100 transition z-20">
                                            <span class="bg-[var(--accent-color)] text-black p-3 rounded-full shadow-2xl transform scale-75 group-hover/cover:scale-100 transition">
                                                <svg width="22" height="22" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                            </span>
                                        </div>
                                    </div>
                                    <div class="w-full min-w-0 flex-1">
                                        <div class="marquee-container w-full"><h3 class="font-bold text-white text-sm marquee-text">${utils.escapeHtml(playlist.title || 'Custom Mix')}</h3></div>
                                        <div class="marquee-container w-full mt-1"><p class="text-xs text-amber-400 marquee-text">${validSongs.length} Tracks • AI Curated</p></div>
                                    </div>
                                </div>

                                <!-- Song Cards (Exact D-Tunes Native Design) -->
                                ${songCardsHtml}
                            </div>
                            <div class="row-blur-right"></div>
                        </div>
                    </div>
                `;
            }

            container.innerHTML = `
                <div class="pt-2 animate-fade-in">
                    <!-- Section Header -->
                    <div class="flex items-center justify-between px-4 md:px-8 mb-6 pb-3 border-b border-white/10">
                        <div>
                            <div class="flex items-center gap-2 mb-1">
                                <span class="text-xs text-amber-400 font-extrabold tracking-widest uppercase flex items-center gap-1.5">
                                    <span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                                    Powered by Inception AI
                                </span>
                            </div>
                            <h2 class="text-2xl md:text-3xl font-black text-white tracking-tight">Your AI Mixes</h2>
                            <p class="text-xs text-neutral-400 mt-0.5">Live personalized tracklists curated by Inception Mercury-2.5 based on your music profile.</p>
                        </div>
                        
                        <div class="flex items-center gap-2">
                            <button onclick="window.devOptions && window.devOptions.open()" class="px-3 py-1.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-mono font-bold hover:bg-amber-500/30 transition flex items-center gap-1.5 shadow-sm">
                                <span>🛠️</span>
                                <span class="hidden sm:inline">Dev Options</span>
                            </button>
                            <button onclick="window.aiHome.renderAIHome(true)" title="Regenerate Recommendations" class="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition hover:rotate-180 duration-500 shadow-md">
                                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                            </button>
                        </div>
                    </div>

                    <!-- AI Playlists Shelves -->
                    ${sectionsHtml}
                </div>
            `;

            if (window.updateMarquees) updateMarquees();
            if (window.setupShelfNavButtons) setupShelfNavButtons();
        } catch (err) {
            console.error("[AI Hub] Render error:", err);
            container.innerHTML = `
                <div class="px-4 md:px-8 py-8 text-center text-red-400 text-xs">
                    <p class="font-bold mb-2">Error generating recommendations: ${utils.escapeHtml(err.message)}</p>
                    <button onclick="window.aiHome.renderAIHome(true)" class="px-4 py-2 rounded-full bg-white/10 text-white font-bold hover:bg-white/20 transition">Retry Generation</button>
                </div>
            `;
        }
    }

    function playEntirePlaylist(playlistId) {
        const item = aiPlaylistsStore.get(playlistId);
        if (!item || !item.songs || item.songs.length === 0) return;

        const firstSong = item.songs[0];
        const remaining = item.songs.slice(1);

        // Play first song immediately
        player.playDirect(firstSong);

        // Clear and populate queue with the remaining tracks from the mix
        state.queue = [...remaining];
        state.idx = 0;
        state.shuffledOrder = [];
        state.shufflePointer = 0;

        if (window.ui && ui.renderQueue) ui.renderQueue();
        if (window.ui?.showToast) ui.showToast(`Playing AI Mix: ${item.title}`);
    }

    // Load Trending Hits with solid fallbacks
    async function loadTrendingHits() {
        const grid = document.getElementById('trending-grid');
        if (!grid) return;

        grid.innerHTML = Array(12).fill('<div class="scroll-card h-[220px] rounded-xl glass-panel animate-pulse w-40 flex-shrink-0"></div>').join('');

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
                grid.innerHTML = songs.map(s => ui.createCard(s)).join('');
                if (window.updateMarquees) updateMarquees();
                if (window.setupShelfNavButtons) setupShelfNavButtons();
            } else {
                grid.innerHTML = '<p class="text-neutral-500 pl-8 text-xs">Trending hits temporarily unavailable.</p>';
            }
        } catch (e) {
            console.warn("[Trending] Error loading trending hits, trying fallback:", e);
            if (window.jiosaavnAPI && jiosaavnAPI.searchSongs) {
                try {
                    const fallback = await jiosaavnAPI.searchSongs('Top Hits 2026', 16);
                    if (fallback && fallback.length) {
                        grid.innerHTML = fallback.map(s => ui.createCard(s)).join('');
                        if (window.updateMarquees) updateMarquees();
                        if (window.setupShelfNavButtons) setupShelfNavButtons();
                    }
                } catch (err) {}
            }
        }
    }

    // Load Recently Played from user history
    function loadRecentlyPlayed() {
        const section = document.getElementById('section-recent');
        const grid = document.getElementById('recent-grid');
        if (!section || !grid) return;

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

    // Wrap in global namespace
    window.aiHome = {
        renderAIHome,
        playEntirePlaylist,
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

            // 1. Render AI Recommendation Mixes at the top
            renderAIHome();

            // 2. Render Trending Songs
            loadTrendingHits();

            // 3. Render Recently Played
            loadRecentlyPlayed();

            if (window.updateMarquees) updateMarquees();
            if (window.setupShelfNavButtons) setupShelfNavButtons();
        };

        // Intelligent Infinite Radio Autoplay hook (adds 5-10 songs)
        homeView.autoplayNextIntelligentTracks = async () => {
            const cfg = window.ai ? window.ai.getConfig() : { autoPlayEnabled: true };
            if (!cfg.autoPlayEnabled) return false;

            const currentTrack = state.currentTrack || (state.playHistory && state.playHistory[0]);
            if (!currentTrack) return false;

            const trackTitle = currentTrack.name || currentTrack.title || '';
            const trackArtist = currentTrack.artist || currentTrack.primary_artists || '';
            if (!trackTitle) return false;

            if (window.ui?.showToast) ui.showToast("AI Autoplay: Finding 8 similar songs...");
            
            try {
                let songList = [];
                if (window.ai && window.ai.generateQueueAutoplay) {
                    songList = await window.ai.generateQueueAutoplay(trackTitle, trackArtist, 8);
                }

                if (!songList || songList.length === 0) {
                    if (window.jiosaavnAPI && jiosaavnAPI.searchSongs) {
                        songList = await jiosaavnAPI.searchSongs(`${trackArtist} hits`, 8);
                    }
                }

                const hydrated = [];
                for (const s of songList) {
                    const matchedSong = await searchTrackData(s.title || s.name, s.artist);
                    if (matchedSong && matchedSong.id) {
                        const appTrack = window.recommendationClient ? window.recommendationClient.toAppSong(matchedSong) : matchedSong;
                        if (!state.queue.some(q => q.id === appTrack.id)) {
                            hydrated.push(appTrack);
                        }
                    }
                }

                if (hydrated.length > 0) {
                    state.queue.push(...hydrated);
                    if (window.ui && ui.renderQueue) ui.renderQueue();
                    if (window.ui?.showToast) ui.showToast(`✨ AI Autoplay: Added ${hydrated.length} songs to Queue!`);
                    return true;
                }
            } catch (e) {
                console.warn("[Autoplay] AI Radio error:", e);
            }

            return false;
        };
    }
})();
