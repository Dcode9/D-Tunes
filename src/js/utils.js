// ============================================
        // UTILS & JS MARQUEE ENGINE
        // ============================================
        const utils = {
            decodeHtml: (html) => {
                if(!html) return '';
                const txt = document.createElement("textarea"); txt.innerHTML = html; return txt.value;
            },
            escapeHtml: (text) => text ? text.toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;") : '',
            escapeJs: (text) => text ? text.toString().replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "\\n").replace(/\r/g, "\\r") : '',
            getRelativeDateLabel: (dateStr) => {
                if (!dateStr) return 'Earlier';
                try {
                    const date = new Date(dateStr);
                    const today = new Date();
                    const yesterday = new Date();
                    yesterday.setDate(yesterday.getDate() - 1);
                    
                    if (date.toDateString() === today.toDateString()) {
                        return 'Today';
                    } else if (date.toDateString() === yesterday.toDateString()) {
                        return 'Yesterday';
                    } else {
                        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                    }
                } catch (e) {
                    return 'Earlier';
                }
            },
            formatTime: (secs) => {
                if (isNaN(secs) || secs < 0) return '0:00';
                const m = Math.floor(secs / 60);
                const s = Math.floor(secs % 60);
                return `${m}:${s.toString().padStart(2, '0')}`;
            },
            cleanTitle: (rawTitle = '', album = '') => {
                let t = utils.decodeHtml(rawTitle || '').toLowerCase();
                if (album) {
                    const albClean = utils.decodeHtml(album).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').trim();
                    if (albClean.length > 2) {
                        const escaped = albClean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        t = t.replace(new RegExp(`[\\(\\[\\{]\\s*(?:from\\s+)?["']?${escaped}["']?\\s*[\\)\\]\\}]`, 'gi'), ' ');
                        t = t.replace(new RegExp(`\\s*-\\s*(?:from\\s+)?["']?${escaped}["']?.*$`, 'gi'), ' ');
                    }
                }
                t = t.replace(/\s*[\(\[\{]\s*(?:from\s+["']?[^()\[\]]+["']?|original\s+motion\s+picture\s+soundtrack|original\s+soundtrack|soundtrack\s+version|ost\s+version|ost|(?:official\s+)?(?:music\s+)?video|(?:official\s+)?(?:music\s+)?audio|video\s+song|audio\s+song|full\s+song|lyric\s+video|lyrics|official|clean|explicit|deluxe(?:\s+edition)?|bonus\s+track|single\s+version|album\s+version|remaster(?:ed)?(?:\s+\d+)?)\s*[\)\]\}]/gi, ' ');
                t = t.replace(/\s*-\s*(?:from\s+["']?[^-\n]+["']?|soundtrack(?:\s+version)?|single\s+version|album\s+version|(?:official\s+)?(?:music\s+)?(?:audio|video)|remaster(?:ed)?(?:\s+\d+)?).*$/i, ' ');
                t = t.replace(/\s*[\(\[\{]?(?:feat\.?|ft\.?|featuring|with)\s+[^()\[\]]+[\)\]\}]?/gi, ' ');
                return t.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
            },
            getTitleRoot: (rawTitle = '') => {
                let t = utils.decodeHtml(rawTitle || '').toLowerCase();
                const idx = t.search(/[\(\[\{\-]/);
                if (idx > 0) t = t.slice(0, idx);
                return t.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
            },
            getArtistTokens: (rawArtist = '') => {
                let a = utils.decodeHtml(rawArtist || '').toLowerCase();
                return a.split(/[,&/|]/)
                    .map((p) => p.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim())
                    .filter((p) => p.length > 1);
            },
            areDuplicateTracks: (songA, songB) => {
                if (!songA || !songB) return false;
                const idA = String(songA.id || songA.saavn_id || '');
                const idB = String(songB.id || songB.saavn_id || '');
                if (idA && idB && idA === idB) return true;

                const rawTitleA = songA.name || songA.title || '';
                const rawTitleB = songB.name || songB.title || '';
                if (!rawTitleA || !rawTitleB) return false;

                const altRegex = /remix|acoustic|lofi|lo-fi|live|slowed|sped up|orchestral|piano|instrumental|karaoke|club mix/i;
                const isAltA = altRegex.test(rawTitleA);
                const isAltB = altRegex.test(rawTitleB);
                if (isAltA !== isAltB) return false;

                const durA = Number(songA.duration || songA.duration_seconds || 0);
                const durB = Number(songB.duration || songB.duration_seconds || 0);
                const durationMatches = durA === 0 || durB === 0 || Math.abs(durA - durB) <= 8;

                const titleA = utils.cleanTitle(rawTitleA, songA.album);
                const titleB = utils.cleanTitle(rawTitleB, songB.album);
                const rootA = utils.getTitleRoot(rawTitleA);
                const rootB = utils.getTitleRoot(rawTitleB);

                const isExactTitle = titleA && titleB && titleA === titleB;
                const isRootMatch = durationMatches && rootA && rootB && rootA.length >= 3 && rootB.length >= 3 && (rootA === rootB || titleA.startsWith(rootB) || titleB.startsWith(rootA));

                if (!isExactTitle && !isRootMatch) return false;

                const artistsA = utils.getArtistTokens(songA.artist || songA.primary_artists || songA.primaryArtists || '');
                const artistsB = utils.getArtistTokens(songB.artist || songB.primary_artists || songB.primaryArtists || '');

                if (!artistsA.length || !artistsB.length) return durationMatches;

                const sharedArtist = artistsA.some((a) => artistsB.some((b) => a === b || a.includes(b) || b.includes(a)));
                return sharedArtist && durationMatches;
            },
            deduplicateSongs: (songs = []) => {
                if (!Array.isArray(songs)) return [];
                const result = [];
                for (const song of songs) {
                    if (!song) continue;
                    const existingIndex = result.findIndex((existing) => utils.areDuplicateTracks(existing, song));
                    if (existingIndex === -1) {
                        result.push(song);
                    } else {
                        const existing = result[existingIndex];
                        if (!existing.url && song.url) {
                            result[existingIndex] = { ...existing, ...song };
                        }
                    }
                }
                return result;
            }
        };

        const GITHUB_DETUNED_SVG = 'https://raw.githubusercontent.com/Datamaverik/D-Tunes/main/assets/DTunes2.svg';
        const FALLBACK_ART_CANDIDATES = [
            GITHUB_DETUNED_SVG,
            'assets/DTunes2.svg',
            './assets/DTunes2.svg',
            '/assets/DTunes2.svg',
            'DTunes.svg',
            './DTunes.svg',
            '/DTunes.svg'
        ];
        const FALLBACK_ART = FALLBACK_ART_CANDIDATES[0];

        const sanitizeImageUrl = (value) => {
            const url = String(value || '').trim();
            if (!url || url === 'undefined' || url === 'null') {
                return FALLBACK_ART;
            }
            return url;
        };

        const installGlobalImageFallback = () => {
            document.addEventListener('error', (event) => {
                const target = event.target;
                if (!(target instanceof HTMLImageElement)) {
                    return;
                }

                const nextIndex = Number(target.dataset.fallbackIndex || '0') + 1;
                target.dataset.fallbackIndex = String(nextIndex);

                if (nextIndex < FALLBACK_ART_CANDIDATES.length) {
                    target.src = FALLBACK_ART_CANDIDATES[nextIndex];
                    return;
                }

                if (target.dataset.fallbackLocked === '1') {
                    return;
                }

                target.dataset.fallbackLocked = '1';
                target.alt = target.alt || "D'Tunes artwork unavailable";
            }, true);
        };

        let marqueeUpdateScheduled = false;
        const updateMarquees = () => {
            if (marqueeUpdateScheduled) return;
            marqueeUpdateScheduled = true;
            requestAnimationFrame(() => {
                marqueeUpdateScheduled = false;
                if (typeof window.__stripTouchHoverClasses === 'function') window.__stripTouchHoverClasses();
                const containers = document.querySelectorAll('.marquee-container');
                const updates = [];

                for (let i = 0; i < containers.length; i++) {
                    const container = containers[i];
                    if (container.offsetParent === null) continue;
                    const text = container.querySelector('.marquee-text');
                    if (!text) continue;

                    const scrollW = text.scrollWidth;
                    const clientW = container.clientWidth;

                    if (text.classList.contains('is-overflowing') && 
                        text.dataset.scrollWidth === String(scrollW) && 
                        container.dataset.clientWidth === String(clientW)) {
                        continue;
                    }

                    updates.push({ container, text, scrollW, clientW });
                }

                for (let i = 0; i < updates.length; i++) {
                    const { container, text, scrollW, clientW } = updates[i];
                    if (Math.ceil(scrollW) > Math.ceil(clientW) + 2) {
                        const dist = Math.ceil(scrollW - clientW + 8);
                        const dur = Math.max(3.5, dist / 18);
                        text.style.setProperty('--scroll-dist', `-${dist}px`);
                        text.style.setProperty('--scroll-dur', `${dur}s`);
                        text.dataset.scrollWidth = String(scrollW);
                        container.dataset.clientWidth = String(clientW);
                        text.classList.add('is-overflowing');
                        container.classList.add('is-overflowing');
                    } else {
                        text.classList.remove('is-overflowing');
                        container.classList.remove('is-overflowing');
                        text.dataset.scrollWidth = String(scrollW);
                        container.dataset.clientWidth = String(clientW);
                    }
                }
            });
        };

