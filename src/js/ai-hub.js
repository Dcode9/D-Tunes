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
            // JioSaavn API first
            if (window.jiosaavnAPI && jiosaavnAPI.searchSongs) {
                const results = await jiosaavnAPI.searchSongs(query, 1);
                if (results && results.length > 0 && results[0]) {
                    const song = results[0];
                    searchCache.set(query, song);
                    return song;
                }
            }

            // iTunes API fallback
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
            console.warn(`[AI Hub] Search failed for "${query}":`, e);
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

    // Render instant skeleton layout while generating
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
                        <h2 class="text-2xl md:text-3xl font-black text-white tracking-tight">Made For You</h2>
                        <p class="text-xs md:text-sm text-neutral-400 mt-1">Playlists personalized to your taste and favorites.</p>
                    </div>
                </div>
                ${skeletonShelves}
            </div>
        `;
    }

    async function renderAIHome(forceRefresh = false) {
        const container = document.getElementById('ai-hub-container');
        if (!container) return;

        const history = state.playHistory || [];
        const liked = state.likedIds || [];
        const lib = state.libraryIds || [];
        const disliked = state.dislikedSongs || [];

        // 1. Render normal page with skeletons instantly
        renderSkeletons(container);

        try {
            const playlists = await window.ai.generateCustomPlaylists(history, liked, lib, disliked, forceRefresh);
            if (!playlists || playlists.length === 0) {
                container.innerHTML = '';
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

                // Render native D-Tunes song cards with progressive unblur & fade-in animation
                const songCardsHtml = validSongs.map(song => {
                    let cardHtml = ui.createCard(song);
                    // Inject unblur on image and text
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
                        <!-- Playlist Row Header with options: Play, Add to Queue, Save -->
                        <div class="flex items-center justify-between px-4 md:px-8 mb-4">
                            <div>
                                <h3 class="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                                    <span>${utils.escapeHtml(playlist.categoryTitle || playlist.title)}</span>
                                </h3>
                                ${playlist.description ? `<p class="text-xs text-gray-400 mt-0.5">${utils.escapeHtml(playlist.description)}</p>` : ''}
                            </div>
                            <div class="flex items-center gap-2">
                                <button onclick="window.aiHome.playEntirePlaylist('${playlistId}')" class="px-3.5 py-1.5 rounded-full bg-[var(--accent-color)] text-black text-xs font-bold hover:scale-105 active:scale-95 transition flex items-center gap-1.5 shadow-md" title="Play Playlist">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                                    <span>Play</span>
                                </button>
                                <button onclick="window.aiHome.addPlaylistToQueue('${playlistId}')" class="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-bold active:scale-95 transition flex items-center gap-1.5 shadow-sm" title="Add all songs to queue">
                                    <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                                    <span>Add to Queue</span>
                                </button>
                                <button onclick="window.aiHome.savePlaylistToLibrary('${playlistId}')" class="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white active:scale-95 transition shadow-sm" title="Save to Your Library">
                                    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/></svg>
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
                                        <div class="absolute inset-0 bg-gradient-to-br ${style.bg} ${style.blend} opacity-85 group-hover/cover:opacity-75 transition-opacity"></div>
                                        <div class="absolute inset-0 bg-black/25 backdrop-blur-[1px]"></div>
                                        <div class="absolute inset-0 p-2.5 flex flex-col ${style.textPos} z-10">
                                            <h4 class="text-white font-black text-xs sm:text-sm uppercase leading-tight drop-shadow-md mt-auto">${utils.escapeHtml(playlist.title || 'Mix')}</h4>
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

                                <!-- Native D-Tunes Song Cards -->
                                ${songCardsHtml}
                            </div>
                            <div class="row-blur-right"></div>
                        </div>
                    </div>
                `;
            }

            container.innerHTML = `
                <div class="pt-2 animate-fade-in">
                    <!-- Clean Editorial Header -->
                    <div class="flex items-center justify-between px-4 md:px-8 mb-6 pb-2 border-b border-white/10">
                        <div>
                            <h2 class="text-2xl md:text-3xl font-black text-white tracking-tight">Made For You</h2>
                            <p class="text-xs md:text-sm text-neutral-400 mt-1">Playlists personalized to your taste and favorites.</p>
                        </div>
                        <button onclick="window.aiHome.renderAIHome(true)" title="Refresh Recommendations" class="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition hover:rotate-180 duration-500 shadow-md">
                            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                        </button>
                    </div>

                    ${sectionsHtml}
                </div>
            `;

            // Trigger unblur on any images that loaded from cache instantly
            setTimeout(() => {
                container.querySelectorAll('.reveal-blur-img').forEach(img => {
                    if (img.complete) {
                        img.classList.add('revealed');
                        const card = img.closest('.scroll-card');
                        if (card) card.querySelectorAll('.reveal-text').forEach(el => el.classList.add('revealed'));
                    }
                });
            }, 60);

            if (window.updateMarquees) updateMarquees();
            if (window.setupShelfNavButtons) setupShelfNavButtons();
        } catch (err) {
            console.warn("[AI Hub] Render error:", err);
            container.innerHTML = '';
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

    // Load Trending Hits with solid fallback
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
            console.warn("[Trending] Error loading trending hits:", e);
            if (window.jiosaavnAPI && jiosaavnAPI.searchSongs) {
                try {
                    const fallback = await jiosaavnAPI.searchSongs('Top Hits', 16);
                    if (fallback && fallback.length) {
                        grid.innerHTML = fallback.map(s => ui.createCard(s)).join('');
                        if (window.updateMarquees) updateMarquees();
                        if (window.setupShelfNavButtons) setupShelfNavButtons();
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

            // 1. Render AI Recommendation Mixes with skeletons & unblur animation
            renderAIHome();

            // 2. Render Trending Songs
            loadTrendingHits();

            // 3. Render Recently Played
            loadRecentlyPlayed();

            if (window.updateMarquees) updateMarquees();
            if (window.setupShelfNavButtons) setupShelfNavButtons();
        };

        // Intelligent Infinite Radio Autoplay (adds 8 songs seamlessly)
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
                    if (window.ui?.showToast) ui.showToast(`Autoplay: Added ${hydrated.length} tracks to queue`);
                    return true;
                }
            } catch (e) {
                console.warn("[Autoplay] Error:", e);
            }

            return false;
        };
    }
})();
