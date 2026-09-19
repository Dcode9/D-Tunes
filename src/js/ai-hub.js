(function() {
    const COVER_STYLES = [
      { bg: "from-purple-900 to-black", blend: "mix-blend-overlay", textPos: "justify-end items-start" },
      { bg: "from-emerald-800 to-gray-900", blend: "mix-blend-luminosity", textPos: "justify-center items-center text-center" },
      { bg: "from-orange-600 to-red-900", blend: "mix-blend-multiply", textPos: "justify-start items-start" },
      { bg: "from-blue-700 to-cyan-900", blend: "mix-blend-color-burn", textPos: "justify-end items-end text-right" },
      { bg: "from-pink-600 to-purple-900", blend: "mix-blend-hard-light", textPos: "justify-start items-center" },
      { bg: "from-gray-800 to-black", blend: "mix-blend-exclusion", textPos: "justify-end items-center" },
      { bg: "from-rose-800 to-indigo-900", blend: "mix-blend-color-dodge", textPos: "justify-center items-end text-center" }
    ];

    async function searchTrackData(query, limit = 1) {
        if (!window.jiosaavnAPI) return [];
        const res = await window.jiosaavnAPI.searchSongs(query, limit);
        return res || [];
    }

    async function renderAIHome() {
        const container = document.getElementById('ai-hub-container');
        if (!container) return;

        const history = state.playHistory || [];
        const liked = state.likedIds || [];
        const lib = state.libraryIds || [];

        if (history.length < 2) {
            container.innerHTML = `
                <div class="flex flex-col items-center justify-center py-20 px-6 text-center animate-fade-in">
                   <div class="w-24 h-24 bg-gradient-to-br from-neutral-800 to-neutral-900 rounded-full flex items-center justify-center mb-6 shadow-2xl">
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-[var(--accent-color)]"><path d="M12 2l3 6 7 1-5 5 1 7-7-4-7 4 1-7-5-5 7-1z"></path></svg>
                   </div>
                   <h2 class="text-3xl font-black mb-3 text-white tracking-tight">Train Your AI</h2>
                   <p class="text-neutral-400 mb-8 max-w-sm text-sm leading-relaxed">
                     Listen to songs, hit the heart button, or add tracks to your library. The AI will learn your unique taste and generate personalized mixes.
                   </p>
                   <button onclick="document.getElementById('nav-search').click();" class="bg-white text-black px-8 py-3.5 rounded-full font-bold text-[15px] hover:scale-105 transition uppercase tracking-wide">
                      Find Music
                   </button>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-32 opacity-80 animate-pulse">
              <div class="relative">
                 <div class="absolute inset-0 bg-[var(--accent-color)] blur-xl opacity-20 rounded-full"></div>
                 <svg class="animate-spin mb-4 text-[var(--accent-color)] relative z-10" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>
              </div>
              <p class="text-lg text-white font-bold tracking-wide mt-4">AI DJ is analyzing your profile</p>
              <p class="text-xs text-neutral-400 mt-2 uppercase tracking-widest">Processing ${history.length} streams, ${liked.length} likes...</p>
            </div>
        `;

        const playlists = await window.ai.generateCustomPlaylists(history, liked, lib);
        
        let html = `
            <div class="px-4 space-y-10 animate-fade-in pb-10">
                <div class="flex items-end justify-between mt-2">
                   <div>
                     <p class="text-xs text-[var(--accent-color)] font-bold tracking-widest uppercase mb-1">Made For You</p>
                     <h1 class="text-3xl font-black text-white tracking-tighter">Your Custom Hub</h1>
                   </div>
                   <button onclick="window.homeView.init()" class="bg-neutral-800 hover:bg-neutral-700 text-white p-2 rounded-full transition shadow-lg">
                     <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3 6 7 1-5 5 1 7-7-4-7 4 1-7-5-5 7-1z"></path></svg>
                   </button>
                </div>
        `;

        for (const section of playlists) {
            html += `
                <div class="space-y-4">
                    <h2 class="text-xl text-white font-bold tracking-tight border-b border-white/10 pb-2 inline-block pr-6">${section.categoryTitle}</h2>
                    <div class="flex gap-4 overflow-x-auto pb-4 scrollbar-hide -mx-4 px-4 snap-x snap-mandatory">
                        <!-- Dynamic Cover -->
            `;

            const style = COVER_STYLES[section.styleIndex % COVER_STYLES.length];
            const safeTitle = (section.title || "").replace(/'/g, "\\'");
            
            // Resolve songs
            let songHtml = '';
            let coverImages = [];
            
            for (const s of section.songs) {
                const results = await searchTrackData(`${s.title} ${s.artist}`, 1);
                if (results && results.length > 0) {
                    const track = results[0];
                    coverImages.push(track.image_url || track.image || track.img || 'DTunes.svg');
                    songHtml += `
                        <div class="w-32 md:w-40 flex-shrink-0 cursor-pointer group snap-start" onclick='window.aiPlaySong(${JSON.stringify(track).replace(/'/g, "\\'")})'>
                            <div class="relative mb-3">
                                <img src="${track.image_url || track.image || track.img || 'DTunes.svg'}" class="w-full aspect-square object-cover rounded-md shadow-lg" />
                                <div class="absolute right-2 bottom-2 bg-[var(--accent-color)] rounded-full p-2 opacity-0 group-hover:opacity-100 transition-all shadow-xl">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="black"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                                </div>
                            </div>
                            <div class="overflow-hidden w-full relative h-5">
                                <h4 class="font-semibold text-sm text-white truncate">${track.title || track.name}</h4>
                            </div>
                            <p class="text-xs text-neutral-400 truncate mt-1">${track.primary_artists || track.artist}</p>
                        </div>
                    `;
                }
            }

            if(coverImages.length > 0) {
                const imgCoverHtml = coverImages.slice(0, 4).map(img => `<img src="${img}" class="w-full h-full object-cover" />`).join('');
                
                html += `
                    <div class="snap-start relative w-36 h-36 md:w-48 md:h-48 rounded-xl overflow-hidden group cursor-pointer shadow-2xl flex-shrink-0 border border-white/10" onclick="alert('Playing Mix: ${safeTitle}')">
                        <div class="absolute inset-0 grid grid-cols-2 grid-rows-2">
                            ${imgCoverHtml}
                        </div>
                        <div class="absolute inset-0 bg-gradient-to-br ${style.bg} ${style.blend} opacity-90 transition-opacity group-hover:opacity-75"></div>
                        <div class="absolute inset-0 bg-black/20 backdrop-blur-[2px]"></div>
                        <div class="absolute inset-0 p-4 flex flex-col ${style.textPos}">
                            <h3 class="text-white font-black text-lg md:text-xl leading-tight drop-shadow-xl uppercase tracking-tighter">${section.title}</h3>
                            <p class="text-white/90 text-[10px] md:text-xs mt-1 drop-shadow-md font-bold uppercase tracking-widest">${section.description || ''}</p>
                        </div>
                        <div class="absolute right-3 bottom-3 bg-[var(--accent-color)] rounded-full p-3 opacity-0 group-hover:opacity-100 transition-all transform translate-y-3 group-hover:translate-y-0 shadow-2xl">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="black"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                        </div>
                    </div>
                `;
            }

            html += songHtml;
            html += `
                    </div>
                </div>
            `;
        }
        
        html += `</div>`;
        container.innerHTML = html;
        if(window.updateMarquees) window.updateMarquees();
    }

    window.aiPlaySong = function(track) {
        if(window.player && window.player.playSong) {
            window.player.playSong(track);
        } else if (window.playSong) {
            window.playSong(track);
        }
    };

    // Override the original homeView.init to trigger our AI hub logic instead of static logic
    const origInit = homeView.init;
    homeView.init = async () => {
        // Run original initialization stuff (like language, profile UI, equalizer)
        if(ui.updateProfileUI) ui.updateProfileUI();
        if(ui.renderEqualizerSettings) ui.renderEqualizerSettings();
        if(ui.renderPlaylists) ui.renderPlaylists();
        if(ui.renderLibraryLists) ui.renderLibraryLists();
        
        await renderAIHome();
    };

    // Auto-Playing / Infinite Radio Feature
    // Patch player.js functionality 
    if(window.homeView) {
        homeView.autoplayNextIntelligentTracks = async () => {
            const currentTrack = state.currentSong;
            if(!currentTrack) return false;

            ui.showToast("AI Radio: Finding next track...");
            const recommendation = await window.ai.generateNextSimilar(currentTrack.name || currentTrack.title, currentTrack.artist || currentTrack.primary_artists);
            
            if(recommendation && recommendation.title) {
                const results = await searchTrackData(`${recommendation.title} ${recommendation.artist}`, 1);
                if(results && results.length > 0) {
                    const track = results[0];
                    const appTrack = window.recommendationClient ? window.recommendationClient.toAppSong(track) : track;
                    state.queue.push(appTrack);
                    if(window.ui && ui.renderQueue) ui.renderQueue();
                    ui.showToast(`AI Radio added: ${track.name || track.title}`);
                    return true;
                }
            }
            ui.showToast("AI Radio: Reached end of recommendations");
            return false;
        };
    }
})();
