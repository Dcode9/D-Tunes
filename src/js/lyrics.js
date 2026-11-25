        // ============================================
        // LYRICS ENGINE & REAL-TIME SYNC
        // ============================================
        const lyricsManager = {
            currentLyrics: null,
            activeLineIndex: -1,
            isLoading: false,
            cache: new Map(),

            CONTAINER_IDS: ['sidebar-lyrics-scroll', 'fullscreen-lyrics-scroll', 'mobile-lyrics-scroll'],

            cleanTitle: (title = '') => {
                let cleaned = String(title || '')
                    .replace(/\s*[\(\[](?:from|feat\.?|featuring|with|prod\.?|official|video|music video|audio|remix|version|deluxe|soundtrack|ost|mashup|edit|slowed|reverb|4k|hd|lyrics)[^\)\]]*[\)\]]/gi, '')
                    .replace(/\s*\|\s*.*$/g, '')
                    .replace(/\s*-\s*(?:from|feat\.?|featuring|with|prod\.?|remix|version|soundtrack|ost|mashup).*$/gi, '')
                    .trim();

                // If "Artist - Song", extract the song part
                if (cleaned.includes(' - ')) {
                    const parts = cleaned.split(' - ');
                    if (parts.length >= 2 && parts[1].trim()) {
                        cleaned = parts.slice(1).join(' - ').trim();
                    }
                }
                return cleaned.trim();
            },

            cleanArtist: (artist = '', fullTitle = '') => {
                let art = String(artist || '').trim();
                // If artist is generic or YouTube channel, check if title had "Artist - Title"
                if ((!art || art.toLowerCase().includes('vevo') || art.toLowerCase().includes('records') || art.toLowerCase().includes('topic')) && fullTitle.includes(' - ')) {
                    const parts = fullTitle.split(' - ');
                    if (parts[0].trim()) art = parts[0].trim();
                }
                const first = art.split(/[,/&|]/)[0];
                return (first || art).trim();
            },

            isDerivativeOrMashup: (title = '', artist = '') => {
                const t = String(title || '');
                const a = String(artist || '');
                const combined = `${t} ${a}`;
                if (/\s+(?:[xX×]|vs\.?|VS\.?)\s+/.test(t)) return true;
                if (/\b(?:mashup|mash-up|medley|megamix|jukebox|nonstop|non-stop|remix|bootleg|flip|slowed|reverb|sped\s*up|speed\s*up|nightcore|8d\s*audio|8d|lofi|lo-fi|karaoke|instrumental|ringtone|bgm)\b/i.test(combined)) {
                    return true;
                }
                if (/\bdj\s+[a-z0-9]/i.test(t)) return true;
                return false;
            },

            isDurationCompatible: (trackDurationSec, candidateDurationSec) => {
                const tDur = Number(trackDurationSec || 0);
                const cDur = Number(candidateDurationSec || 0);
                if (!Number.isFinite(tDur) || tDur <= 0 || !Number.isFinite(cDur) || cDur <= 0) return true;
                return Math.abs(tDur - cDur) <= 20;
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
                const videoId = track.id || track.videoId || '';
                const cacheKey = `${trackTitle}:::${trackArtist}:::${videoId}`.toLowerCase();

                if (lyricsManager.cache.has(cacheKey)) {
                    lyricsManager.currentLyrics = lyricsManager.cache.get(cacheKey);
                    lyricsManager.setIndicator(Boolean(lyricsManager.currentLyrics && (lyricsManager.currentLyrics.syncedLyrics || lyricsManager.currentLyrics.plainLyrics || lyricsManager.currentLyrics.parsedLines)));
                    lyricsManager.updateUI();
                    return lyricsManager.currentLyrics;
                }

                lyricsManager.isLoading = true;
                lyricsManager.currentLyrics = null;
                lyricsManager.activeLineIndex = -1;
                lyricsManager.setIndicator(false);
                lyricsManager.renderLoading();

                try {
                    let data = null;

                    // 1. Primary: YouTube Music Lyrics by video ID (/api-v2/lyrics/:id)
                    if (videoId && (typeof mediaAPI !== 'undefined' || videoId.length === 11)) {
                        try {
                            const ytmRes = await fetch(`/api-v2/lyrics/${encodeURIComponent(videoId)}`).catch(() => null);
                            if (ytmRes && ytmRes.ok) {
                                const ytmJson = await ytmRes.json();
                                if (ytmJson && ytmJson.lyrics) {
                                    const parsed = lyricsManager.parseLrc(ytmJson.lyrics);
                                    data = {
                                        track: trackTitle,
                                        artist: trackArtist,
                                        syncedLyrics: parsed.length > 0 ? ytmJson.lyrics : null,
                                        plainLyrics: ytmJson.lyrics,
                                        instrumental: false,
                                        parsedLines: parsed.length > 0 ? parsed : null,
                                        source: 'YouTube Music'
                                    };
                                }
                            }
                        } catch (_) {}
                    }

                    // Never fall back to keyword lyrics search for mashups, remixes, slowed/reverb, or DJ edits:
                    // if YouTube Music has no lyrics attached to this exact video_id, showing wrong lyrics from
                    // only one half of a mashup (e.g. "Levitating" for "Levitating X Woh Ladki Jo") is broken.
                    const isDerivative = lyricsManager.isDerivativeOrMashup(trackTitle, trackArtist);
                    const trackDurationSec = Number(track.duration || track.duration_seconds || 0);

                    // 2. Secondary (standard tracks only): D'Tunes LRCLIB backend proxy (/api/music/lyrics)
                    if (!data && !isDerivative) {
                        try {
                            const cleanT = lyricsManager.cleanTitle(trackTitle);
                            const cleanA = lyricsManager.cleanArtist(trackArtist, trackTitle);
                            const queryParams = new URLSearchParams({
                                track: cleanT,
                                artist: cleanA,
                                album: track.album || '',
                                duration: String(trackDurationSec || 0)
                            });
                            const res = await fetch(`/api/music/lyrics?${queryParams.toString()}`).catch(() => null);
                            if (res && res.ok) {
                                const json = await res.json();
                                if (json.success && json.lyrics && lyricsManager.isDurationCompatible(trackDurationSec, json.lyrics.duration)) {
                                    data = json.lyrics;
                                }
                            }
                        } catch (_) {}
                    }

                    // 3. Tertiary (standard tracks only): Direct LRCLIB client fallback with duration verification
                    if (!data && !isDerivative) {
                        const cleanT = lyricsManager.cleanTitle(trackTitle);
                        const cleanA = lyricsManager.cleanArtist(trackArtist, trackTitle);
                        const directRes = await fetch(`https://lrclib.net/api/get?track_name=${encodeURIComponent(cleanT)}&artist_name=${encodeURIComponent(cleanA)}`).catch(() => null);
                        if (directRes && directRes.ok) {
                            const lrcJson = await directRes.json();
                            if ((lrcJson.syncedLyrics || lrcJson.plainLyrics || lrcJson.instrumental) && lyricsManager.isDurationCompatible(trackDurationSec, lrcJson.duration)) {
                                data = {
                                    track: lrcJson.trackName || trackTitle,
                                    artist: lrcJson.artistName || trackArtist,
                                    syncedLyrics: lrcJson.syncedLyrics || null,
                                    plainLyrics: lrcJson.plainLyrics || null,
                                    instrumental: Boolean(lrcJson.instrumental),
                                    parsedLines: lrcJson.syncedLyrics ? lyricsManager.parseLrc(lrcJson.syncedLyrics) : null,
                                    source: 'LRCLIB'
                                };
                            }
                        }
                    }

                    lyricsManager.currentLyrics = data;
                    if (data) {
                        lyricsManager.cache.set(cacheKey, data);
                        lyricsManager.setIndicator(Boolean(data.syncedLyrics || data.plainLyrics || data.parsedLines));
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
                // Toggle availability on desktop lyrics button
                const btnLyrics = document.getElementById('btn-lyrics');
                if (btnLyrics) {
                    btnLyrics.classList.toggle('lyrics-unavailable', !hasLyrics);
                }
                // Toggle availability on mobile tab
                const mobileTab = document.getElementById('m-tab-lyrics');
                if (mobileTab) {
                    mobileTab.classList.toggle('lyrics-unavailable', !hasLyrics);
                }
                // Update sync status badge
                const syncBadge = document.getElementById('sidebar-lyrics-sync-badge');
                if (syncBadge) {
                    const isSynced = Boolean(lyricsManager.currentLyrics?.parsedLines?.length);
                    syncBadge.textContent = isSynced ? 'SYNCED' : 'PLAIN';
                    syncBadge.classList.toggle('hidden', !hasLyrics);
                }
            },

            renderLoading: () => {
                const placeholder = '<div class="text-zinc-400 my-auto text-sm flex flex-col items-center gap-3 py-12"><svg class="w-8 h-8 text-zinc-500 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/></svg><span>Searching synchronized lyrics...</span></div>';
                lyricsManager.CONTAINER_IDS.forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.innerHTML = placeholder;
                });
            },

            updateUI: () => {
                const lyrics = lyricsManager.currentLyrics;

                if (!lyrics) {
                    const isCurrentDerivative = typeof state !== 'undefined' && state.currentTrack && lyricsManager.isDerivativeOrMashup(state.currentTrack.title || state.currentTrack.name || '', state.currentTrack.artist || '');
                    const emptySub = isCurrentDerivative ? 'Lyrics are skipped for mashups and remixes unless provided directly by YouTube Music' : 'No official lyrics found for this track';
                    const emptyHtml = `<div class="text-zinc-400 my-auto text-sm py-16 flex flex-col items-center gap-3 text-center px-4"><svg class="w-10 h-10 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg><span class="font-semibold text-zinc-300">No lyrics available for this track</span><span class="text-xs text-zinc-500">${emptySub}</span></div>`;
                    lyricsManager.CONTAINER_IDS.forEach(id => {
                        const el = document.getElementById(id);
                        if (el) el.innerHTML = emptyHtml;
                    });
                    return;
                }

                if (lyrics.instrumental) {
                    const instHtml = '<div class="text-zinc-400 my-auto text-sm py-16 flex flex-col items-center gap-3"><svg class="w-8 h-8 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9 19V6l12-2v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z"/></svg><span class="font-bold text-white text-base">Instrumental Piece</span><span class="text-xs text-zinc-400">This track has no vocal lyrics. Enjoy the music!</span></div>';
                    lyricsManager.CONTAINER_IDS.forEach(id => {
                        const el = document.getElementById(id);
                        if (el) el.innerHTML = instHtml;
                    });
                    return;
                }

                if (lyrics.parsedLines && lyrics.parsedLines.length > 0) {
                    const markup = lyrics.parsedLines.map((line, idx) => `
                        <div class="lyric-line cursor-pointer" data-index="${idx}" data-time="${line.time}" onclick="player.seek(${line.time})">
                            ${(typeof utils !== 'undefined' && utils.escapeHtml) ? utils.escapeHtml(line.text) : line.text}
                        </div>
                    `).join('');

                    lyricsManager.CONTAINER_IDS.forEach(id => {
                        const el = document.getElementById(id);
                        if (el) el.innerHTML = markup;
                    });

                    lyricsManager.activeLineIndex = -1;
                    const currentPlaybackTime = (typeof window.getActivePlaybackClock === 'function')
                        ? (window.getActivePlaybackClock().currentTime || 0)
                        : ((window._dtunesActiveEngine === 'yt' && window._ytPlayerInstance && typeof window._ytPlayerInstance.getCurrentTime === 'function')
                            ? (window._ytPlayerInstance.getCurrentTime() || 0)
                            : (document.getElementById('audio-el')?.currentTime || 0));
                    lyricsManager.syncTime(currentPlaybackTime, true);
                    return;
                }

                if (lyrics.plainLyrics) {
                    const plainHtml = `<div class="plain-lyrics-text px-4 py-6">${(typeof utils !== 'undefined' && utils.escapeHtml) ? utils.escapeHtml(lyrics.plainLyrics) : lyrics.plainLyrics}</div>`;
                    lyricsManager.CONTAINER_IDS.forEach(id => {
                        const el = document.getElementById(id);
                        if (el) el.innerHTML = plainHtml;
                    });
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

                lyricsManager.CONTAINER_IDS.forEach(containerId => {
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
                });
            }
        };

