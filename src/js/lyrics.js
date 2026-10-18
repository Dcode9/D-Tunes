        // ============================================
        // LYRICS ENGINE & REAL-TIME SYNC
        // ============================================
        const lyricsManager = {
            currentLyrics: null,
            activeLineIndex: -1,
            isLoading: false,
            cache: new Map(),

            cleanTitle: (title = '') => {
                return String(title)
                    .replace(/\s*[\(\[](?:from|feat\.?|featuring|with|prod\.?|official|video|audio|remix|version|deluxe|soundtrack|ost)[^\)\]]*[\)\]]/gi, '')
                    .replace(/\s*-\s*(?:from|feat\.?|featuring|with|prod\.?|remix|version|soundtrack|ost).*$/gi, '')
                    .replace(/\s*-\s*[^-]+$/g, '')
                    .trim();
            },

            cleanArtist: (artist = '') => {
                const first = String(artist).split(/[,/&|]/)[0];
                return (first || artist).trim();
            },

            parseLrc: (lrcString = '') => {
                if (!lrcString || typeof lrcString !== 'string') return [];
                const lines = lrcString.split('\n');
                const result = [];
                const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/g;
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;
                    timeRegex.lastIndex = 0;
                    const matches = [...trimmed.matchAll(timeRegex)];
                    if (!matches || matches.length === 0) continue;
                    const text = trimmed.replace(timeRegex, '').trim();
                    for (const match of matches) {
                        const min = parseInt(match[1], 10);
                        const sec = parseInt(match[2], 10);
                        const msStr = match[3];
                        const ms = msStr.length === 2 ? parseInt(msStr, 10) * 10 : parseInt(msStr.padEnd(3, '0').slice(0, 3), 10);
                        const time = min * 60 + sec + ms / 1000;
                        result.push({ time, text });
                    }
                }
                result.sort((a, b) => a.time - b.time);
                return result;
            },

            fetchLyricsForTrack: async (track) => {
                if (!track || (!track.title && !track.name)) return null;
                const trackTitle = track.title || track.name;
                const trackArtist = track.artist || track.primary_artists || '';
                const cacheKey = `${trackTitle}:::${trackArtist}`.toLowerCase();

                if (lyricsManager.cache.has(cacheKey)) {
                    lyricsManager.currentLyrics = lyricsManager.cache.get(cacheKey);
                    lyricsManager.setIndicator(Boolean(lyricsManager.currentLyrics && (lyricsManager.currentLyrics.syncedLyrics || lyricsManager.currentLyrics.plainLyrics)));
                    lyricsManager.updateUI();
                    return lyricsManager.currentLyrics;
                }

                lyricsManager.isLoading = true;
                lyricsManager.currentLyrics = null;
                lyricsManager.activeLineIndex = -1;
                lyricsManager.setIndicator(false);
                lyricsManager.renderLoading();

                try {
                    const queryParams = new URLSearchParams({
                        track: trackTitle,
                        artist: trackArtist,
                        album: track.album || '',
                        duration: String(track.duration || 0)
                    });
                    let res = await fetch(`/api/music/lyrics?${queryParams.toString()}`).catch(() => null);
                    let data = null;
                    if (res && res.ok) {
                        const json = await res.json();
                        if (json.success && json.lyrics) data = json.lyrics;
                    }

                    // Fallback to direct LRCLIB fetch if backend didn't find lyrics
                    if (!data) {
                        const cleanT = lyricsManager.cleanTitle(trackTitle);
                        const cleanA = lyricsManager.cleanArtist(trackArtist);
                        const directRes = await fetch(`https://lrclib.net/api/get?track_name=${encodeURIComponent(cleanT)}&artist_name=${encodeURIComponent(cleanA)}`).catch(() => null);
                        if (directRes && directRes.ok) {
                            const lrcJson = await directRes.json();
                            if (lrcJson.syncedLyrics || lrcJson.plainLyrics || lrcJson.instrumental) {
                                data = {
                                    track: lrcJson.trackName || trackTitle,
                                    artist: lrcJson.artistName || trackArtist,
                                    syncedLyrics: lrcJson.syncedLyrics || null,
                                    plainLyrics: lrcJson.plainLyrics || null,
                                    instrumental: Boolean(lrcJson.instrumental),
                                    parsedLines: lrcJson.syncedLyrics ? lyricsManager.parseLrc(lrcJson.syncedLyrics) : null
                                };
                            }
                        }
                    }

                    lyricsManager.currentLyrics = data;
                    if (data) {
                        lyricsManager.cache.set(cacheKey, data);
                        lyricsManager.setIndicator(Boolean(data.syncedLyrics || data.plainLyrics));
                    } else {
                        lyricsManager.setIndicator(false);
                    }
                    lyricsManager.updateUI();
                    return data;
                } catch (e) {
                    console.warn('[DTunes] Lyrics fetch warning:', e);
                    lyricsManager.currentLyrics = null;
                    lyricsManager.setIndicator(false);
                    lyricsManager.updateUI();
                    return null;
                } finally {
                    lyricsManager.isLoading = false;
                }
            },

            setIndicator: (hasLyrics) => {
                const dot = document.getElementById('lyrics-indicator-dot');
                if (dot) {
                    dot.style.opacity = hasLyrics ? '1' : '0';
                }
                const badge = document.getElementById('lyrics-sync-badge');
                if (badge) {
                    const isSynced = Boolean(lyricsManager.currentLyrics?.syncedLyrics);
                    badge.classList.toggle('hidden', !isSynced);
                }
            },

            renderLoading: () => {
                const placeholder = '<div class="text-gray-400 my-auto text-sm flex flex-col items-center gap-3 py-10"><svg class="w-8 h-8 text-gray-500 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/></svg><span>Searching synchronized lyrics...</span></div>';
                const desktopCont = document.getElementById('lyrics-scroll-container');
                if (desktopCont) desktopCont.innerHTML = placeholder;
                const mobileCont = document.getElementById('mobile-lyrics-scroll');
                if (mobileCont) mobileCont.innerHTML = placeholder;
            },

            updateUI: () => {
                const lyrics = lyricsManager.currentLyrics;
                const desktopCont = document.getElementById('lyrics-scroll-container');
                const mobileCont = document.getElementById('mobile-lyrics-scroll');

                const titleEl = document.getElementById('lyrics-modal-title');
                const artistEl = document.getElementById('lyrics-modal-artist');
                const artImg = document.getElementById('lyrics-modal-art-img');
                if (titleEl && state.currentTrack) titleEl.textContent = state.currentTrack.name || state.currentTrack.title || 'Unknown';
                if (artistEl && state.currentTrack) artistEl.textContent = state.currentTrack.artist || 'Unknown';
                if (artImg && state.currentTrack) artImg.src = state.currentTrack.img || 'DTunes.svg';

                if (!lyrics) {
                    const emptyHtml = '<div class="text-gray-400 my-auto text-sm py-16 flex flex-col items-center gap-3"><svg class="w-10 h-10 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg><span class="font-semibold text-gray-300">No lyrics available for this track</span><span class="text-xs text-gray-500">Lyrics match based on track title and artist name</span></div>';
                    if (desktopCont) desktopCont.innerHTML = emptyHtml;
                    if (mobileCont) mobileCont.innerHTML = emptyHtml;
                    return;
                }

                if (lyrics.instrumental) {
                    const instHtml = '<div class="text-gray-400 my-auto text-sm py-16 flex flex-col items-center gap-3"><span class="text-3xl">🎵</span><span class="font-bold text-white text-base">Instrumental Piece</span><span class="text-xs text-gray-400">This track has no vocal lyrics. Enjoy the music!</span></div>';
                    if (desktopCont) desktopCont.innerHTML = instHtml;
                    if (mobileCont) mobileCont.innerHTML = instHtml;
                    return;
                }

                if (lyrics.parsedLines && lyrics.parsedLines.length > 0) {
                    const markup = lyrics.parsedLines.map((line, idx) => `
                        <div class="lyric-line" data-index="${idx}" data-time="${line.time}" onclick="player.seek(${line.time})">
                            ${utils.escapeHtml(line.text)}
                        </div>
                    `).join('');
                    if (desktopCont) desktopCont.innerHTML = markup;
                    if (mobileCont) mobileCont.innerHTML = markup;
                    lyricsManager.activeLineIndex = -1;
                    lyricsManager.syncTime(audio.currentTime || 0, true);
                    return;
                }

                if (lyrics.plainLyrics) {
                    const plainHtml = `<div class="plain-lyrics-text">${utils.escapeHtml(lyrics.plainLyrics)}</div>`;
                    if (desktopCont) desktopCont.innerHTML = plainHtml;
                    if (mobileCont) mobileCont.innerHTML = plainHtml;
                }
            },

            syncTime: (currentTime, forceScroll = false) => {
                const lyrics = lyricsManager.currentLyrics;
                if (!lyrics || !lyrics.parsedLines || lyrics.parsedLines.length === 0) return;

                const lines = lyrics.parsedLines;
                let newIndex = -1;

                for (let i = 0; i < lines.length; i++) {
                    if (currentTime >= lines[i].time) {
                        newIndex = i;
                    } else {
                        break;
                    }
                }

                if (newIndex === lyricsManager.activeLineIndex && !forceScroll) return;
                lyricsManager.activeLineIndex = newIndex;

                const updateContainer = (containerId) => {
                    const container = document.getElementById(containerId);
                    if (!container) return;
                    const lineElements = container.querySelectorAll('.lyric-line');
                    lineElements.forEach((el, idx) => {
                        const isActive = idx === newIndex;
                        const isPast = idx < newIndex;
                        el.classList.toggle('active', isActive);
                        el.classList.toggle('past', isPast);
                        if (isActive && (forceScroll || document.visibilityState === 'visible')) {
                            const containerRect = container.getBoundingClientRect();
                            const lineRect = el.getBoundingClientRect();
                            const delta = (lineRect.top + lineRect.height / 2) - (containerRect.top + containerRect.height / 2);
                            if (forceScroll || Math.abs(delta) > 4) {
                                container.scrollBy({
                                    top: delta,
                                    behavior: forceScroll ? 'auto' : 'smooth'
                                });
                            }
                        }
                    });
                };

                updateContainer('lyrics-scroll-container');
                updateContainer('mobile-lyrics-container');
            }
        };

