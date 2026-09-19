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
            // Priority 1: JioSaavn API in D-Tunes
            if (window.jiosaavnAPI && window.jiosaavnAPI.searchSongs) {
                const results = await window.jiosaavnAPI.searchSongs(query, 1);
                if (results && results.length > 0 && results[0]) {
                    const song = results[0];
                    searchCache.set(query, song);
                    return song;
                }
            }

            // Priority 2: iTunes API (from user reference code)
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

        // Fallback placeholder
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

        // Show generating state
        container.innerHTML = `
            <div class="px-4 md:px-8 pt-4 pb-8 animate-fade-in">
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
                            <p class="text-xs text-neutral-400 mt-0.5">Analyzing your unique taste profile to craft 6 personalized mixes...</p>
                        </div>
                    </div>
                </div>

                <div class="flex flex-col items-center justify-center py-16 px-4 text-center rounded-2xl bg-neutral-900/40 border border-white/5 shadow-2xl">
                    <div class="relative mb-5">
                        <div class="absolute inset-0 bg-amber-500/20 blur-xl rounded-full"></div>
                        <div class="w-16 h-16 rounded-full border-2 border-amber-500/30 border-t-amber-400 animate-spin flex items-center justify-center relative z-10">
                            <span class="text-xl animate-pulse">🎵</span>
                        </div>
                    </div>
                    <h3 class="text-lg font-bold text-white mb-1">Curating Your Personalized Hub</h3>
                    <p class="text-xs text-neutral-400 max-w-md mb-2">Connecting to Inception LLM & analyzing streams, likes, and music affinity...</p>
                    <div class="flex items-center gap-2 text-[11px] font-mono text-amber-400/80 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
                        <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                        Model: Inception Mercury-2.5 (d-AI Engine)
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

                // Hydrate songs in parallel for performance
                const rawSongs = playlist.songs || [];
                const hydratedSongs = await Promise.all(
                    rawSongs.map(s => searchTrackData(s.title, s.artist))
                );
                const validSongs = hydratedSongs.filter(Boolean);

                // Store in memory for one-click playlist playback
                aiPlaylistsStore.set(playlistId, {
                    ...playlist,
                    songs: validSongs
                });

                // Extract up to 4 cover art images for the 2x2 collage
                const collageArts = validSongs.slice(0, 4).map(s => s.img || FALLBACK_ART);
                while (collageArts.length < 4) {
                    collageArts.push(FALLBACK_ART);
                }

                // Render individual song cards in the shelf
                const songCardsHtml = validSongs.map(song => {
                    const storeId = songStore.add(song);
                    return `
                        <div class="w-36 md:w-44 flex-shrink-0 cursor-pointer group snap-start bg-neutral-900/60 p-2.5 rounded-xl border border-white/5 hover:bg-neutral-800/80 hover:border-white/10 transition-all shadow-lg flex flex-col" onclick="playSongById('${storeId}')">
                            <div class="relative aspect-square rounded-lg overflow-hidden mb-2.5 bg-black/40 shadow-md">
                                <img src="${song.img || FALLBACK_ART}" alt="${utils.escapeHtml(song.name || song.title)}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300" loading="lazy" onerror="this.src='${FALLBACK_ART}'" />
                                <div class="absolute right-2 bottom-2 bg-[var(--accent-color)] rounded-full p-2.5 opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0 shadow-xl">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="black"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                                </div>
                            </div>
                            <div class="w-full min-w-0 flex-1">
                                <h4 class="font-bold text-xs md:text-sm text-white truncate group-hover:text-[var(--accent-color)] transition-colors">${utils.escapeHtml(song.name || song.title)}</h4>
                                <p class="text-[11px] text-neutral-400 truncate mt-0.5">${utils.escapeHtml(song.artist || 'Unknown')}</p>
                            </div>
                        </div>
                    `;
                }).join('');

                sectionsHtml += `
                    <div class="space-y-3 mb-8">
                        <div class="flex items-center justify-between">
                            <h3 class="text-lg md:text-xl font-black text-white tracking-tight flex items-center gap-2">
                                <span>${utils.escapeHtml(playlist.categoryTitle || 'Curated For You')}</span>
                            </h3>
                            <button onclick="window.aiHome.playEntirePlaylist('${playlistId}')" class="text-xs text-neutral-400 hover:text-[var(--accent-color)] font-bold transition flex items-center gap-1">
                                <span>Play All</span>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                            </button>
                        </div>

                        <div class="flex gap-4 overflow-x-auto pb-3 scrollbar-hide -mx-4 px-4 md:-mx-8 md:px-8 snap-x snap-mandatory">
                            <!-- Dynamic 2x2 Collage Cover (From React design) -->
                            <div class="snap-start relative w-40 h-52 sm:w-44 sm:h-56 md:w-52 md:h-64 rounded-2xl overflow-hidden group cursor-pointer shadow-2xl flex-shrink-0 border border-white/10 hover:border-amber-400/50 transition-all transform hover:scale-[1.02]" onclick="window.aiHome.playEntirePlaylist('${playlistId}')">
                                <div class="absolute inset-0 grid grid-cols-2 grid-rows-2">
                                    <img src="${collageArts[0]}" class="w-full h-full object-cover" />
                                    <img src="${collageArts[1]}" class="w-full h-full object-cover" />
                                    <img src="${collageArts[2]}" class="w-full h-full object-cover" />
                                    <img src="${collageArts[3]}" class="w-full h-full object-cover" />
                                </div>
                                <div class="absolute inset-0 bg-gradient-to-br ${style.bg} ${style.blend} opacity-90 group-hover:opacity-75 transition-opacity"></div>
                                <div class="absolute inset-0 bg-black/30 backdrop-blur-[1px]"></div>
                                
                                <div class="absolute inset-0 p-4 flex flex-col ${style.textPos} z-10">
                                    <span class="text-[9px] font-black uppercase tracking-widest text-amber-300/90 mb-1 px-2 py-0.5 rounded bg-black/40 backdrop-blur-sm self-start">AI Mix</span>
                                    <h3 class="text-white font-black text-base sm:text-lg md:text-xl leading-tight drop-shadow-xl uppercase tracking-tighter">${utils.escapeHtml(playlist.title || 'Custom Mix')}</h3>
                                    ${playlist.description ? `<p class="text-white/80 text-[10px] sm:text-xs mt-1 drop-shadow-md font-medium tracking-wide line-clamp-2">${utils.escapeHtml(playlist.description)}</p>` : ''}
                                </div>

                                <div class="absolute right-3 bottom-3 bg-[var(--accent-color)] rounded-full p-3.5 opacity-0 group-hover:opacity-100 transition-all transform translate-y-3 group-hover:translate-y-0 shadow-2xl z-20">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="black"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                                </div>
                            </div>

                            <!-- Song Cards -->
                            ${songCardsHtml}
                        </div>
                    </div>
                `;
            }

            container.innerHTML = `
                <div class="px-4 md:px-8 pt-2 pb-6 animate-fade-in">
                    <!-- Hero Header -->
                    <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8 pb-4 border-b border-white/10">
                        <div>
                            <div class="flex items-center gap-2 mb-1">
                                <span class="text-xs text-amber-400 font-extrabold tracking-widest uppercase flex items-center gap-1.5">
                                    <span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                                    Powered by Inception AI
                                </span>
                            </div>
                            <h1 class="text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tight">Your Custom AI Hub</h1>
                            <p class="text-xs sm:text-sm text-neutral-400 mt-1">Personalized mixes generated live from your listening affinity & preferences.</p>
                        </div>
                        
                        <div class="flex items-center gap-2.5 self-start sm:self-auto">
                            <button onclick="window.devOptions && window.devOptions.open()" class="px-3.5 py-2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-mono font-bold hover:bg-amber-500/30 transition flex items-center gap-1.5 shadow-lg shadow-amber-500/10">
                                <span>🛠️</span>
                                <span>Dev Options</span>
                            </button>
                            <button onclick="window.aiHome.renderAIHome(true)" title="Regenerate Recommendations" class="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition hover:rotate-180 duration-500 shadow-lg flex items-center justify-center">
                                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                            </button>
                        </div>
                    </div>

                    <!-- AI Playlists Sections -->
                    ${sectionsHtml}
                </div>
            `;

            if (window.updateMarquees) updateMarquees();
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

    // Wrap in global namespace
    window.aiHome = {
        renderAIHome,
        playEntirePlaylist
    };

    // Override homeView.init cleanly without breaking other native sections
    if (typeof homeView !== 'undefined') {
        const originalInit = homeView.init;

        homeView.init = async () => {
            // Strip touch hover classes & update profiles
            if (typeof stripTouchHoverClasses === 'function') stripTouchHoverClasses();
            if (ui.updateProfileUI) ui.updateProfileUI();

            const preferredLanguageSelect = document.getElementById('preferred-language-select');
            if (preferredLanguageSelect) preferredLanguageSelect.value = localStorage.getItem('preferredLanguage') || '';
            const audioQualitySelect = document.getElementById('setting-audio-quality');
            if (audioQualitySelect) audioQualitySelect.value = state.quality || 'high';

            if (ui.renderEqualizerSettings) ui.renderEqualizerSettings();
            if (ui.renderPlaylists) ui.renderPlaylists();
            if (ui.renderLibraryLists) ui.renderLibraryLists();

            // Render AI Hub at top of Home screen
            renderAIHome();

            // Populate Trending shelf safely
            const trendingSection = document.getElementById('section-trending');
            const trendingGrid = document.getElementById('trending-grid');
            if (trendingSection && trendingGrid) {
                trendingSection.classList.remove('hidden');
                if (trendingGrid.children.length === 0) {
                    trendingGrid.innerHTML = Array(12).fill('<div class="scroll-card h-[200px] rounded-xl glass-panel animate-pulse w-40 flex-shrink-0"></div>').join('');
                    if (window.jiosaavnAPI && jiosaavnAPI.getTrending) {
                        jiosaavnAPI.getTrending().then(trendingSongs => {
                            if (trendingSongs && trendingSongs.length) {
                                trendingGrid.innerHTML = trendingSongs.slice(0, 16).map(song => ui.createCard(song)).join('');
                                if (window.updateMarquees) updateMarquees();
                                if (window.setupShelfNavButtons) setupShelfNavButtons();
                            }
                        }).catch(() => {});
                    }
                }
            }

            // Populate Recently Played if user has history
            if (state.playHistory && state.playHistory.length > 0) {
                const recentSection = document.getElementById('section-recent');
                if (recentSection) recentSection.classList.remove('hidden');
                if (homeView.renderRecentlyPlayed) homeView.renderRecentlyPlayed();
            }

            // Populate Discover Mixes
            if (homeView.renderDiscoverSection) {
                homeView.renderDiscoverSection();
            }

            if (window.updateMarquees) updateMarquees();
            if (window.setupShelfNavButtons) setupShelfNavButtons();
        };

        // Intelligent Infinite Radio Autoplay hook
        homeView.autoplayNextIntelligentTracks = async () => {
            const cfg = window.ai ? window.ai.getConfig() : { autoPlayEnabled: true };
            if (!cfg.autoPlayEnabled) return false;

            const currentTrack = state.currentTrack;
            if (!currentTrack) return false;

            const trackTitle = currentTrack.name || currentTrack.title || '';
            const trackArtist = currentTrack.artist || currentTrack.primary_artists || '';
            if (!trackTitle) return false;

            if (window.ui?.showToast) ui.showToast("AI Radio: Finding next track...");
            
            try {
                const recommendation = await window.ai.generateNextSimilar(trackTitle, trackArtist);
                if (recommendation && recommendation.title) {
                    const matchedSong = await searchTrackData(recommendation.title, recommendation.artist);
                    if (matchedSong && matchedSong.id) {
                        const appTrack = window.recommendationClient ? window.recommendationClient.toAppSong(matchedSong) : matchedSong;
                        
                        // Prevent duplicate
                        if (!state.queue.some(s => s.id === appTrack.id)) {
                            state.queue.push(appTrack);
                            if (window.ui && ui.renderQueue) ui.renderQueue();
                            if (window.ui?.showToast) ui.showToast(`AI Radio queued: ${appTrack.name || appTrack.title}`);
                            return true;
                        }
                    }
                }
            } catch (e) {
                console.warn("[Autoplay] AI Radio error:", e);
            }

            return false;
        };
    }
})();
