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

