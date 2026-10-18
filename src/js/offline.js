        // ============================================
        // OFFLINE DOWNLOADS (IndexedDB + WebCrypto)
        // ============================================
        // Saved tracks are encrypted with AES-GCM before they touch disk. The key is
        // generated as a NON-EXTRACTABLE CryptoKey, so the raw bytes sitting in
        // IndexedDB are useless outside of this origin — only D'Tunes can play them.
        const offlineStore = (() => {
            const DB_NAME = 'dtunes-offline';
            const DB_VERSION = 1;
            const TRACK_STORE = 'tracks';
            const META_STORE = 'meta';
            const MASTER_KEY_ID = 'master-key';
            const META_PREFIX = 'meta:';
            const AUDIO_MIME = 'audio/mp4';
            const IV_BYTES = 12;
            const MAX_TRACK_BYTES = 200 * 1024 * 1024;
            const MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;

            const memoryTracks = new Map();
            const memoryMeta = new Map();
            const blobUrls = new Map();
            const inFlight = new Map();
            const progress = new Map();
            const listeners = new Set();
            const downloadedIds = new Set();
            const downloadedSizes = new Map();

            let dbPromise = null;
            let keyPromise = null;
            let memoryOnly = false;

            const hasIndexedDB = () => typeof indexedDB !== 'undefined' && indexedDB && typeof indexedDB.open === 'function';

            const getCrypto = () => {
                if (typeof crypto !== 'undefined' && crypto && crypto.subtle) return crypto;
                if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) return window.crypto;
                return null;
            };

            const abortError = () => (typeof DOMException === 'function'
                ? new DOMException('Download cancelled', 'AbortError')
                : Object.assign(new Error('Download cancelled'), { name: 'AbortError' }));

            const songId = (song) => {
                if (!song) return null;
                const raw = song.saavn_id || song.id || song.songid || null;
                return raw === null || raw === undefined || raw === '' ? null : String(raw);
            };

            const metaKey = (id) => `${META_PREFIX}${id}`;

            const requestToPromise = (request) => new Promise((resolve, reject) => {
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
            });

            const txDone = (tx) => new Promise((resolve, reject) => {
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
                tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
            });

            const openDb = () => {
                if (!hasIndexedDB()) {
                    memoryOnly = true;
                    return Promise.resolve(null);
                }
                if (dbPromise) return dbPromise;
                dbPromise = new Promise((resolve) => {
                    let request;
                    try {
                        request = indexedDB.open(DB_NAME, DB_VERSION);
                    } catch (err) {
                        memoryOnly = true;
                        resolve(null);
                        return;
                    }
                    request.onupgradeneeded = () => {
                        const db = request.result;
                        if (!db.objectStoreNames.contains(TRACK_STORE)) db.createObjectStore(TRACK_STORE, { keyPath: 'id' });
                        if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
                    };
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => { memoryOnly = true; resolve(null); };
                    request.onblocked = () => { memoryOnly = true; resolve(null); };
                });
                return dbPromise;
            };

            const readTrack = async (id) => {
                const db = await openDb();
                if (!db) return memoryTracks.get(id) || null;
                const tx = db.transaction(TRACK_STORE, 'readonly');
                return requestToPromise(tx.objectStore(TRACK_STORE).get(id));
            };

            const writeTrack = async (record) => {
                const db = await openDb();
                if (!db) { memoryTracks.set(record.id, record); return; }
                const tx = db.transaction(TRACK_STORE, 'readwrite');
                tx.objectStore(TRACK_STORE).put(record);
                await txDone(tx);
            };

            const deleteTrackRecord = async (id) => {
                const db = await openDb();
                if (!db) { memoryTracks.delete(id); return; }
                const tx = db.transaction(TRACK_STORE, 'readwrite');
                tx.objectStore(TRACK_STORE).delete(id);
                await txDone(tx);
            };

            const readMeta = async (key) => {
                const db = await openDb();
                if (!db) return memoryMeta.has(key) ? memoryMeta.get(key) : undefined;
                const tx = db.transaction(META_STORE, 'readonly');
                return requestToPromise(tx.objectStore(META_STORE).get(key));
            };

            const writeMeta = async (key, value) => {
                const db = await openDb();
                if (!db) { memoryMeta.set(key, value); return; }
                const tx = db.transaction(META_STORE, 'readwrite');
                tx.objectStore(META_STORE).put(value, key);
                await txDone(tx);
            };

            const deleteMeta = async (key) => {
                const db = await openDb();
                if (!db) { memoryMeta.delete(key); return; }
                const tx = db.transaction(META_STORE, 'readwrite');
                tx.objectStore(META_STORE).delete(key);
                await txDone(tx);
            };

            const readAllMeta = async () => {
                const db = await openDb();
                if (!db) {
                    return Array.from(memoryMeta.entries())
                        .filter(([key]) => String(key).startsWith(META_PREFIX))
                        .map(([, value]) => value);
                }
                const tx = db.transaction(META_STORE, 'readonly');
                const store = tx.objectStore(META_STORE);
                // Both requests must be issued before awaiting: an IndexedDB transaction
                // auto-commits as soon as control returns to the event loop with no
                // pending requests, which would make the second request invalid.
                const valuesRequest = requestToPromise(store.getAll());
                const keysRequest = requestToPromise(store.getAllKeys());
                const values = await valuesRequest;
                const keys = await keysRequest;
                return keys
                    .map((key, index) => (String(key).startsWith(META_PREFIX) ? values[index] : null))
                    .filter(Boolean);
            };

            const clearRecords = async () => {
                const db = await openDb();
                if (!db) { memoryTracks.clear(); memoryMeta.clear(); return; }
                const tx = db.transaction([TRACK_STORE, META_STORE], 'readwrite');
                tx.objectStore(TRACK_STORE).clear();
                tx.objectStore(META_STORE).clear();
                await txDone(tx);
            };

            const getKey = () => {
                if (keyPromise) return keyPromise;
                keyPromise = (async () => {
                    const cryptoObj = getCrypto();
                    if (!cryptoObj) throw new Error('Offline downloads need WebCrypto, which this browser does not provide.');
                    const existing = await readMeta(MASTER_KEY_ID);
                    if (existing && existing.type === 'secret' && existing.algorithm) return existing;
                    const generated = await cryptoObj.subtle.generateKey(
                        { name: 'AES-GCM', length: 256 },
                        false,
                        ['encrypt', 'decrypt']
                    );
                    await writeMeta(MASTER_KEY_ID, generated);
                    return generated;
                })().catch((err) => {
                    keyPromise = null;
                    throw err;
                });
                return keyPromise;
            };

            const encryptBytes = async (buffer) => {
                const cryptoObj = getCrypto();
                const key = await getKey();
                const iv = cryptoObj.getRandomValues(new Uint8Array(IV_BYTES));
                const bytes = await cryptoObj.subtle.encrypt({ name: 'AES-GCM', iv }, key, buffer);
                return { iv, bytes };
            };

            const decryptBytes = async (iv, bytes) => {
                const cryptoObj = getCrypto();
                const key = await getKey();
                return cryptoObj.subtle.decrypt({ name: 'AES-GCM', iv }, key, bytes);
            };

            const formatBytes = (value) => {
                const bytes = Number(value) || 0;
                if (bytes < 1024) return `${bytes} B`;
                const units = ['KB', 'MB', 'GB'];
                let size = bytes / 1024;
                let unit = 0;
                while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit += 1; }
                return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
            };

            const setProgress = (id, patch) => {
                const current = progress.get(id) || { received: 0, total: 0, status: 'idle' };
                progress.set(id, { ...current, ...patch });
            };

            const notify = () => {
                listeners.forEach((listener) => {
                    try { listener(offlineStore); } catch (_) {}
                });
            };

            const metaFromSong = (song, size, savedAt) => ({
                id: songId(song),
                name: song.name || song.title || 'Unknown',
                artist: song.artist || 'Unknown Artist',
                img: song.img || song.image || (typeof FALLBACK_ART !== 'undefined' ? FALLBACK_ART : ''),
                duration: Number(song.duration) || 0,
                quality: song.quality || (typeof state !== 'undefined' && state ? state.quality : 'high') || 'high',
                size: Number(size) || 0,
                mime: AUDIO_MIME,
                savedAt,
                source: 'offline'
            });

            const blobUrlFor = (id, bytes, mime) => {
                if (blobUrls.has(id)) return blobUrls.get(id);
                if (typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
                const url = URL.createObjectURL(new Blob([bytes], { type: mime || AUDIO_MIME }));
                blobUrls.set(id, url);
                return url;
            };

            const releaseUrl = (id) => {
                const url = blobUrls.get(id);
                if (!url) return;
                if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
                    try { URL.revokeObjectURL(url); } catch (_) {}
                }
                blobUrls.delete(id);
            };

            const readBody = async (response, id, controller) => {
                const declared = Number(response && response.headers && typeof response.headers.get === 'function'
                    ? response.headers.get('content-length')
                    : 0) || 0;
                const stream = response && response.body && typeof response.body.getReader === 'function' ? response.body : null;
                if (!stream) {
                    const buffer = await response.arrayBuffer();
                    if (Number(buffer.byteLength) > MAX_TRACK_BYTES) throw new Error('This track is too large to store offline.');
                    setProgress(id, { received: buffer.byteLength, total: buffer.byteLength || declared, status: 'encrypting' });
                    notify();
                    return buffer;
                }
                const reader = stream.getReader();
                const chunks = [];
                let received = 0;
                const abortCheck = () => {
                    if (controller.signal.aborted) {
                        try { reader.cancel().catch(() => {}); } catch (_) {}
                        throw abortError();
                    }
                };
                while (true) {
                    abortCheck();
                    const { done, value } = await reader.read();
                    if (done) break;
                    if (!value) continue;
                    chunks.push(value);
                    received += value.byteLength;
                    if (received > MAX_TRACK_BYTES) {
                        try { await reader.cancel(); } catch (_) {}
                        throw new Error('This track is too large to store offline.');
                    }
                    setProgress(id, { received, total: declared, status: 'downloading' });
                    notify();
                }
                abortCheck();
                const merged = new Uint8Array(received);
                let offset = 0;
                for (const chunk of chunks) {
                    merged.set(chunk, offset);
                    offset += chunk.byteLength;
                }
                setProgress(id, { received, total: declared || received, status: 'encrypting' });
                notify();
                return merged.buffer;
            };

            const getMeta = async (id) => (await readMeta(metaKey(id))) || null;

            const download = (song) => {
                const id = songId(song);
                if (!id) return Promise.reject(new Error('This track is missing an id, so it cannot be saved offline.'));
                if (downloadedIds.has(id)) return Promise.resolve(getMeta(id));
                if (inFlight.has(id)) return inFlight.get(id).promise;

                const sourceUrl = song.url || song.streamUrl || (Array.isArray(song.downloadUrl) ? song.downloadUrl[song.downloadUrl.length - 1]?.url : null);
                if (!sourceUrl || !/^https?:/i.test(String(sourceUrl))) {
                    return Promise.reject(new Error('This track has no downloadable audio source.'));
                }
                if (!offlineStore.supported()) {
                    return Promise.reject(new Error('Offline downloads are not supported in this browser.'));
                }
                if (offlineStore.usage().bytes >= MAX_TOTAL_BYTES) {
                    return Promise.reject(new Error('Offline storage is full. Remove a few downloads and try again.'));
                }

                const controller = typeof AbortController === 'function'
                    ? new AbortController()
                    : { signal: { aborted: false }, abort() { this.signal.aborted = true; } };

                setProgress(id, { received: 0, total: 0, status: 'downloading' });
                notify();

                const promise = (async () => {
                    try {
                        const response = await fetch(sourceUrl, { mode: 'cors', credentials: 'omit', signal: controller.signal });
                        if (!response || !response.ok) {
                            throw new Error(`Download failed (HTTP ${response && response.status ? response.status : 'network error'}).`);
                        }
                        const plain = await readBody(response, id, controller);
                        if (controller.signal.aborted) throw abortError();
                        const sealed = await encryptBytes(plain);
                        const savedAt = new Date().toISOString();
                        await writeTrack({ id, iv: sealed.iv, bytes: sealed.bytes, mime: AUDIO_MIME, savedAt });
                        const meta = metaFromSong(song, sealed.bytes.byteLength, savedAt);
                        await writeMeta(metaKey(id), meta);
                        downloadedIds.add(id);
                        downloadedSizes.set(id, meta.size);
                        setProgress(id, { received: meta.size, total: meta.size, status: 'done' });
                        notify();
                        return meta;
                    } catch (err) {
                        setProgress(id, {
                            received: 0,
                            total: 0,
                            status: controller.signal.aborted ? 'cancelled' : 'error',
                            error: err && err.message ? err.message : 'Download failed'
                        });
                        notify();
                        throw err;
                    } finally {
                        inFlight.delete(id);
                        setTimeout(() => {
                            const last = progress.get(id);
                            if (last && last.status !== 'downloading' && last.status !== 'encrypting') {
                                progress.delete(id);
                                notify();
                            }
                        }, 3000);
                    }
                })();

                inFlight.set(id, { controller, promise });
                return promise;
            };

            const remove = async (id) => {
                const key = songId({ id });
                if (!key) return;
                if (inFlight.has(key)) {
                    try { inFlight.get(key).controller.abort(); } catch (_) {}
                }
                await deleteTrackRecord(key);
                await deleteMeta(metaKey(key));
                downloadedIds.delete(key);
                downloadedSizes.delete(key);
                progress.delete(key);
                releaseUrl(key);
                notify();
            };

            const getPlayUrl = async (id) => {
                const key = songId({ id });
                if (!key) return null;
                if (blobUrls.has(key)) return blobUrls.get(key);
                const record = await readTrack(key);
                if (!record || !record.bytes || !record.iv) return null;
                try {
                    const plain = await decryptBytes(record.iv, record.bytes);
                    return blobUrlFor(key, plain, record.mime);
                } catch (_) {
                    return null;
                }
            };

            const offlineStore = {
                init: async () => {
                    await openDb();
                    const metas = await readAllMeta().catch(() => []);
                    downloadedIds.clear();
                    downloadedSizes.clear();
                    metas.forEach((meta) => {
                        if (meta && meta.id) {
                            downloadedIds.add(String(meta.id));
                            downloadedSizes.set(String(meta.id), Number(meta.size) || 0);
                        }
                    });
                    notify();
                    return offlineStore;
                },
                download,
                remove,
                cancel: (id) => {
                    const key = songId({ id });
                    if (!key || !inFlight.has(key)) return false;
                    try { inFlight.get(key).controller.abort(); } catch (_) {}
                    return true;
                },
                getPlayUrl,
                getPlayUrlSync: (id) => {
                    const key = songId({ id });
                    return key && blobUrls.has(key) ? blobUrls.get(key) : null;
                },
                resolvePlayUrl: async (track, fallbackUrl = null) => {
                    const key = songId(track);
                    if (key && downloadedIds.has(key)) {
                        const url = await getPlayUrl(key).catch(() => null);
                        if (url) return url;
                    }
                    return fallbackUrl || (track && track.url) || null;
                },
                isDownloaded: (id) => {
                    const key = songId({ id });
                    return Boolean(key) && downloadedIds.has(key);
                },
                getMeta,
                list: async () => (await readAllMeta().catch(() => []))
                    .filter(Boolean)
                    .sort((a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || ''))),
                usage: () => ({
                    count: downloadedIds.size,
                    bytes: Array.from(downloadedSizes.values()).reduce((total, size) => total + (Number(size) || 0), 0)
                }),
                getProgress: (id) => {
                    const key = songId({ id });
                    return key ? progress.get(key) || null : null;
                },
                formatProgress: (state) => {
                    if (!state) return '';
                    if (state.status === 'encrypting') return 'Securing…';
                    if (state.status === 'done') return 'Saved';
                    if (state.status === 'cancelled') return 'Cancelled';
                    if (state.status === 'error') return 'Failed';
                    if (state.total > 0) return `${Math.min(100, Math.round((state.received / state.total) * 100))}%`;
                    return formatBytes(state.received);
                },
                formatBytes,
                storageEstimate: async () => {
                    try {
                        if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
                            return await navigator.storage.estimate();
                        }
                    } catch (_) {}
                    return null;
                },
                clear: async () => {
                    inFlight.forEach((entry) => { try { entry.controller.abort(); } catch (_) {} });
                    inFlight.clear();
                    await clearRecords();
                    downloadedIds.clear();
                    downloadedSizes.clear();
                    progress.clear();
                    Array.from(blobUrls.keys()).forEach(releaseUrl);
                    notify();
                },
                onChange: (listener) => {
                    if (typeof listener !== 'function') return () => {};
                    listeners.add(listener);
                    return () => listeners.delete(listener);
                },
                supported: () => Boolean(getCrypto() && getCrypto().subtle && typeof getCrypto().subtle.encrypt === 'function'),
                isMemoryOnly: () => memoryOnly || !hasIndexedDB(),
                releaseUrl,
                _internals: { encryptBytes, decryptBytes, getKey, readTrack, readAllMeta, writeMeta, metaKey, dbName: DB_NAME }
            };

            return offlineStore;
        })();

        window.offlineStore = offlineStore;
