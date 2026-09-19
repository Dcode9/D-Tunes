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
                        <img src="${data.top.img}" class="w-full h-full object-cover opacity-30 blur-md">
                        <div class="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent"></div>
                    </div>
                    <div class="relative z-10 flex flex-col gap-4">
                        <img src="${data.top.img}" class="w-28 h-28 md:w-36 md:h-36 rounded-lg shadow-2xl object-cover" ondblclick="player.likeSong('${utils.escapeJs(data.top.id)}')">
                        
                        <div class="flex flex-col gap-1">
                            <h2 class="text-3xl font-bold text-white line-clamp-2 leading-tight" title="${utils.escapeHtml(data.top.name)}">${utils.escapeHtml(data.top.name)}</h2>
                            <div class="flex items-center gap-2 text-gray-300 text-sm mt-1">
                                <span class="bg-white/10 px-2 py-0.5 rounded text-xs font-semibold tracking-wider">${(data.top.type || 'SONG').toUpperCase()}</span>
                                <span class="font-medium line-clamp-1">${utils.escapeHtml(data.top.artist || '')}</span>
                            </div>
                        </div>
                        
                        <div class="mt-2 flex items-center gap-3">
                            <button class="bg-[var(--accent-color)] text-black px-6 py-2.5 rounded-full font-bold hover:scale-105 transition shadow-lg flex items-center gap-2" onclick="event.stopPropagation(); ui.playFromQuickSearch('${topStoreId}')">
                                <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> Play
                            </button>
                            <button class="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition" title="Play next" onclick="event.stopPropagation(); player.addNext(songStore.get('${topStoreId}'))">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg>
                            </button>
                            <button class="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition" title="Add to queue" onclick="event.stopPropagation(); player.addToQueue(songStore.get('${topStoreId}'))">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h10m-10 4h6"/></svg>
                            </button>
                            <button class="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition" title="Like" onclick="event.stopPropagation(); player.likeSong('${utils.escapeJs(data.top.id)}')">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
                            </button>
                        </div>
                    </div>`;
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

                if (type === 'for-you' && state.forYouSongs?.length > 0 && !options.force && !options.open) {
                    forYouSection?.classList.remove('hidden');
                    forYouActions?.classList.remove('hidden');
                    if (forYouCount) forYouCount.textContent = `${state.forYouSongs.length} songs ready for autoplay`;
                    if (forYouGrid && (!forYouGrid.children.length || forYouGrid.querySelector('.animate-pulse'))) {
                        forYouGrid.innerHTML = state.forYouSongs.slice(0, 18).map(song => ui.createForYouCard(song)).join('');
                    }
                    if (status) status.textContent = 'For You is ready.';
                    return state.forYouSongs;
                }

                if (homeView._forYouLoading && type === 'for-you' && !options.open) {
                    return homeView._forYouLoading;
                }

                if (status && (!state.forYouSongs || !state.forYouSongs.length || options.force)) {
                    status.textContent = `Finding ${type.replace(/-/g, ' ')} picks...`;
                }

                const loadTask = (async () => {
                    try {
                        const preferredLanguage = document.getElementById('preferred-language-select')?.value || localStorage.getItem('preferredLanguage') || '';
                        const songs = window.recommendationClient ? await window.recommendationClient.fetchPlaylist(type, { limit: 25, language: preferredLanguage }) : [];
                        if (songs.length === 0) {
                            if (status) status.textContent = 'Personalized picks are not ready yet. Keep listening or try again later.';
                            if (type === 'for-you' && (!state.forYouSongs || !state.forYouSongs.length)) {
                                state.forYouSongs = [];
                                forYouSection?.classList.add('hidden');
                                forYouActions?.classList.add('hidden');
                            }
                            return state.forYouSongs || [];
                        }
                        const tagged = songs.map(song => ({ ...song, source: 'recommendation', playlistType: type }));
                        if (type === 'for-you') {
                            state.forYouSongs = tagged;
                            forYouSection?.classList.remove('hidden');
                            if (forYouGrid) forYouGrid.innerHTML = tagged.slice(0, 18).map(song => ui.createForYouCard(song)).join('');
                            forYouActions?.classList.remove('hidden');
                            if (forYouCount) forYouCount.textContent = `${tagged.length} songs ready for autoplay`;
                            if (status) status.textContent = 'For You is ready.';
                            if (!options.open) return tagged;
                        }
                        state.queue = tagged; state.userQueue = []; state.idx = 0; ui.renderQueue();
                        ui.openGeneratedPlaylist(type.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), tagged);
                        if (status) status.textContent = `Generated ${tagged.length} rule-based tracks.`;
                        return tagged;
                    } finally {
                        if (type === 'for-you') homeView._forYouLoading = null;
                    }
                })();

                if (type === 'for-you') homeView._forYouLoading = loadTask;
                return loadTask;
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

                if (homeView._discoverLoading) {
                    return homeView._discoverLoading;
                }

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

                const hasExistingCards = grid.children.length > 0 && !grid.querySelector('.animate-pulse');
                if (!hasExistingCards) {
                    grid.innerHTML = DISCOVER_MIX_DEFINITIONS.map(() => 
                        '<div class="scroll-card h-80 w-64 rounded-3xl glass-panel animate-pulse flex-shrink-0"></div>'
                    ).join('');
                }

                homeView._discoverLoading = (async () => {
                    try {
                        const preferredLanguage = document.getElementById('preferred-language-select')?.value || localStorage.getItem('preferredLanguage') || '';

                        const renderedCards = await Promise.all(DISCOVER_MIX_DEFINITIONS.map(async (def) => {
                            let songs = state.discoverMixes[def.key];
                            if (!songs || (forceRefresh && (!songs.length || !hasExistingCards)) || songs.length === 0) {
                                songs = window.recommendationClient ? await window.recommendationClient.fetchPlaylist(def.key, { limit: 20, language: preferredLanguage }) : [];
                                if (songs && songs.length > 0) {
                                    state.discoverMixes[def.key] = songs;
                                }
                            }
                            const fullMix = { ...def, songs: state.discoverMixes[def.key] || songs || [] };
                            return ui.createDiscoverCard(fullMix);
                        }));

                        grid.innerHTML = renderedCards.join('');
                        stripTouchHoverClasses();
                        updateMarquees();
                        if (window.setupShelfNavButtons) setupShelfNavButtons();
                    } finally {
                        homeView._discoverLoading = null;
                    }
                })();

                return homeView._discoverLoading;
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
            generateQuickPicks: async (forceRefresh = false) => {
                const grid = document.getElementById('quick-picks-grid');
                if (!grid) return;

                if (homeView._quickPicksLoading) {
                    return homeView._quickPicksLoading;
                }

                if (!state.quickPicks) state.quickPicks = [];

                const hasExistingCards = grid.children.length > 0 && !grid.querySelector('.animate-pulse');
                if (state.quickPicks.length > 0 && !forceRefresh) {
                    grid.innerHTML = state.quickPicks.map(song => ui.createCard(song)).join('');
                    updateMarquees();
                    return;
                }

                if (!hasExistingCards && state.quickPicks.length === 0) {
                    grid.innerHTML = Array(16).fill('<div class="scroll-card h-[200px] rounded-xl glass-panel animate-pulse w-40 flex-shrink-0"></div>').join('');
                }

                homeView._quickPicksLoading = (async () => {
                    try {
                        const trending = await jiosaavnAPI.getTrending();
                        let picks = [...(trending || []).slice(0, 8)];
                        const artists = Object.keys(state.artistPlayCounts || {})
                            .sort((a, b) => state.artistPlayCounts[b] - state.artistPlayCounts[a])
                            .slice(0, 3);
                        for (const artist of artists) {
                            const artistSongs = await jiosaavnAPI.searchSongs(artist, 6);
                            picks.push(...(artistSongs || []));
                        }
                        const uniquePicks = utils.deduplicateSongs(picks);
                        if (!state.quickPicks.length || forceRefresh) {
                            uniquePicks.sort(() => Math.random() - 0.5);
                        }
                        const finalPicks = uniquePicks.slice(0, 16);
                        if (finalPicks.length > 0) {
                            state.quickPicks = finalPicks;
                            grid.innerHTML = finalPicks.map(song => ui.createCard(song)).join('');
                            updateMarquees();
                        }
                    } catch (e) {
                        if (!hasExistingCards && state.quickPicks.length === 0) {
                            grid.innerHTML = '<p class="text-red-400 pl-8">Could not load Quick Picks.</p>';
                        }
                    } finally {
                        homeView._quickPicksLoading = null;
                    }
                })();

                return homeView._quickPicksLoading;
            }
        };

