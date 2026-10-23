/*
 * D'Tunes desktop integration (Windows).
 * Loaded as a classic script after main.js so window.player / state / ui exist.
 * Handles: service-worker app shell, offline (encrypted) downloads, offline
 * playback routing, taskbar media state, and system-level volume sync.
 */
(function () {
  const api = window.electronAPI;
  const isDesktop = Boolean((api && api.isDesktopApp) || window.isDTunesDesktop || window.dtunesDesktop?.isDesktop);
  if (isDesktop && typeof window !== "undefined") {
    window.isDTunesDesktop = true;
    window.dtunesDesktop = { isDesktop: true };
    window.isWindowsApp = () => true;
  }

  const offlineIds = new Set();
  const offlineMeta = new Map();
  let systemVolumeEnabled = false;

  function audioEl() { return document.getElementById('audio-el'); }

  // ----- Service worker: offline app shell (web + desktop) -----
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
    });
  }

  // ----- Offline library -----
  function offlineUrl(id) {
    return 'dtunes-media://track/' + encodeURIComponent(String(id));
  }

  async function refreshOfflineList() {
    if (!isDesktop || !api.listOfflineTracks) return;
    try {
      const list = (await api.listOfflineTracks()) || [];
      offlineIds.clear();
      offlineMeta.clear();
      list.forEach((entry) => {
        offlineIds.add(String(entry.id));
        offlineMeta.set(String(entry.id), entry);
      });
      window.dispatchEvent(new CustomEvent('dtunes:offline-changed', { detail: { list, ids: offlineIds } }));
    } catch (err) {
      /* ignore */
    }
  }

  async function resolveStreamUrl(song) {
    if (!song) return null;
    if (typeof song.url === 'string' && /^https?:/.test(song.url)) return song.url;
    if (Array.isArray(song.downloadUrl) && song.downloadUrl.length) {
      const last = song.downloadUrl[song.downloadUrl.length - 1];
      const candidate = (last && (last.url || last.link)) || last;
      if (typeof candidate === 'string' && /^https?:/.test(candidate)) return candidate;
    }
    if (song.download_url) {
      try {
        const parsed = typeof song.download_url === 'string' ? JSON.parse(song.download_url) : song.download_url;
        if (Array.isArray(parsed) && parsed.length) {
          const candidate = parsed[parsed.length - 1]?.url || parsed[parsed.length - 1]?.link;
          if (candidate) return candidate;
        }
      } catch (err) { /* ignore */ }
    }
    if (window.jiosaavnAPI && window.jiosaavnAPI.getSong) {
      try {
        const fresh = await window.jiosaavnAPI.getSong(String(song.id));
        if (fresh && fresh.url) return fresh.url;
      } catch (err) { /* ignore */ }
    }
    return null;
  }

  window.dtunesDownloadTrack = async function (song) {
    if (!isDesktop) return;
    if (!song || !song.id) return;
    const id = String(song.id);
    if (offlineIds.has(id) || (window.offlineStore && offlineStore.isDownloaded(id))) {
      if (window.ui && ui.showToast) ui.showToast("Already available offline");
      return;
    }
    const streamUrl = await resolveStreamUrl(song);
    if (!streamUrl) {
      if (window.ui && ui.showToast) ui.showToast("Could not resolve audio for download", "error");
      return;
    }
    if (window.ui && ui.showToast) ui.showToast(`Downloading "${song.name || song.title || "track"}"...`);
    try {
      if (api && api.downloadTrack) {
        const res = await api.downloadTrack({
          id,
          name: song.name || song.title,
          artist: song.artist || song.primary_artists || "",
          album: song.album || "",
          img: song.img || song.image || "",
          duration: song.duration,
          url: streamUrl
        });
        if (res && res.success) {
          await refreshOfflineList();
          if (window.ui && ui.showToast) ui.showToast(`Saved "${res.name || song.name || "track"}" for offline`);
          return;
        }
      }
      if (window.offlineStore) {
        await offlineStore.download({ ...song, url: streamUrl });
        await refreshOfflineList();
        if (window.ui && ui.showToast) ui.showToast(`Saved "${song.name || song.title || "track"}" for offline`);
      }
    } catch (err) {
      if (window.ui && ui.showToast) ui.showToast("Download failed", "error");
    }
  };

  window.dtunesDeleteOffline = async function (id) {
    if (!isDesktop || !api.deleteOfflineTrack) return;
    const res = await api.deleteOfflineTrack(String(id));
    if (res && res.success) {
      await refreshOfflineList();
      if (window.ui && ui.showToast) ui.showToast('Removed offline download');
    }
  };

  window.isWindowsApp = () => isDesktop;
  window.dtunesIsOfflineTrack = (id) => offlineIds.has(String(id));
  window.dtunesOfflineUrl = offlineUrl;
  window.dtunesRefreshOfflineList = refreshOfflineList;
  window.dtunesOfflineList = () => Array.from(offlineMeta.values());

  // ----- Native Downloaded Songs Shelf (Windows Desktop) -----
  function renderDownloadedSongsSection() {
    if (!isDesktop) return;
    const section = document.getElementById('section-downloaded-songs');
    const grid = document.getElementById('downloaded-songs-grid');
    const countEl = document.getElementById('downloaded-songs-count');
    const actions = document.getElementById('downloaded-songs-actions');
    if (!section || !grid) return;

    const list = Array.from(offlineMeta.values());
    if (countEl) {
      countEl.textContent = `${list.length} song${list.length === 1 ? '' : 's'}`;
    }

    if (list.length === 0) {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        section.classList.remove('hidden');
        if (actions) actions.classList.add('hidden');
        grid.innerHTML = `
          <div class="w-full px-6 py-8 rounded-2xl glass-panel border border-white/10 bg-white/[0.03] text-center my-2">
            <div class="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-gray-400 mx-auto mb-3">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"/></svg>
            </div>
            <p class="text-sm font-semibold text-white">No Downloaded Songs Yet</p>
            <p class="text-xs text-neutral-400 mt-1 max-w-md mx-auto">When connected, right-click any track or open song options and choose <span class="text-cyan-300 font-semibold">Download for offline</span> to store music on this PC.</p>
          </div>
        `;
      } else {
        section.classList.add('hidden');
      }
      return;
    }

    section.classList.remove('hidden');
    if (actions) actions.classList.remove('hidden');

    // Register all downloaded songs into songStore so clicking cards works immediately!
    list.forEach(song => {
      const appSong = {
        id: String(song.id),
        name: song.name || 'Unknown Track',
        title: song.name || 'Unknown Track',
        artist: song.artist || 'Unknown Artist',
        album: song.album || '',
        img: song.img || '',
        duration: song.duration || 0,
        url: offlineUrl(song.id),
        isOffline: true
      };
      if (window.songStore && songStore.set) {
        songStore.set(String(song.id), appSong);
      }
    });

    grid.innerHTML = list.map(song => {
      const appSong = {
        id: String(song.id),
        name: song.name || 'Unknown Track',
        title: song.name || 'Unknown Track',
        artist: song.artist || 'Unknown Artist',
        album: song.album || '',
        img: song.img || '',
        duration: song.duration || 0,
        url: offlineUrl(song.id),
        isOffline: true
      };
      return window.ui ? ui.createCard(appSong) : '';
    }).join('');

    if (window.updateMarquees) updateMarquees();
    if (window.setupShelfNavButtons) setupShelfNavButtons();
  }

  window.dtunesRenderDownloadedSongs = renderDownloadedSongsSection;

  window.dtunesPlayAllDownloaded = function (shuffle = false) {
    if (!isDesktop) return;
    const list = Array.from(offlineMeta.values());
    if (!list || list.length === 0) {
      if (window.ui && ui.showToast) ui.showToast('No downloaded tracks found', 'warning');
      return;
    }

    const appSongs = list.map(song => ({
      id: String(song.id),
      name: song.name || 'Unknown Track',
      title: song.name || 'Unknown Track',
      artist: song.artist || 'Unknown Artist',
      album: song.album || '',
      img: song.img || '',
      duration: song.duration || 0,
      url: offlineUrl(song.id),
      isOffline: true
    }));

    appSongs.forEach(s => {
      if (window.songStore && songStore.set) songStore.set(s.id, s);
    });

    state.queue = [...appSongs];
    state.userQueue = [];
    state.idx = 0;

    if (shuffle) {
      state.shuffle = true;
      localStorage.setItem('playShuffle', 'true');
      if (window.ui && ui.updateShuffleBtn) ui.updateShuffleBtn();
      if (window.player && player.generateShuffledQueue) player.generateShuffledQueue();
    }

    if (window.ui && ui.renderQueue) ui.renderQueue();
    if (window.player && player.playDirect) player.playDirect(appSongs[0]);
    if (window.deviceMode && deviceMode.isMobileUI && deviceMode.isMobileUI() && window.ui) {
      ui.toggleMobilePlayer(true);
    }
  };

  function applyOfflineModeState(isOffline) {
    if (!isDesktop) return;
    const banner = document.getElementById('offline-mode-banner');
    const trending = document.getElementById('section-trending');
    const downloadedSection = document.getElementById('section-downloaded-songs');
    const aiHubSection = document.getElementById('section-ai-hub');
    const homeView = document.getElementById('view-home');

    if (isOffline) {
      if (banner) banner.classList.remove('hidden');
      if (trending) trending.classList.add('hidden');

      // Place downloaded songs prominently at the top of home view
      if (downloadedSection && homeView && aiHubSection) {
        if (downloadedSection.nextElementSibling !== aiHubSection) {
          homeView.insertBefore(downloadedSection, aiHubSection);
        }
      }
    } else {
      if (banner) banner.classList.add('hidden');
      if (trending) trending.classList.remove('hidden');

      // Return downloaded songs below recent/trending
      if (downloadedSection && homeView) {
        homeView.appendChild(downloadedSection);
      }
    }

    renderDownloadedSongsSection();
  }

  window.dtunesApplyOfflineModeState = applyOfflineModeState;

  window.dtunesCheckConnection = async function () {
    if (window.ui && ui.showToast) ui.showToast('Checking connection...');
    try {
      let fetchSignal;
      let timer;
      if (typeof AbortController !== 'undefined') {
        const controller = new AbortController();
        timer = setTimeout(() => controller.abort(), 3000);
        fetchSignal = controller.signal;
      }
      const res = await fetch('https://tunes.d-verse.in/assets/favicon.png?t=' + Date.now(), {
        method: 'HEAD',
        cache: 'no-store',
        signal: fetchSignal
      });
      if (timer) clearTimeout(timer);
      if (res.ok || res.type === 'opaque') {
        if (window.ui && ui.showToast) ui.showToast('Connected! Online mode active.', 'success');
        applyOfflineModeState(false);
        if (window.homeView && homeView.init) homeView.init();
        return true;
      }
    } catch (e) {
      /* still offline */
    }
    if (window.ui && ui.showToast) ui.showToast('Still offline. Please check your internet connection.', 'warning');
    return false;
  };

  // ----- Offline-first playback routing -----
  function patchPlayback() {
    if (!window.player || window.player.__dtunesOfflinePatched) return;
    window.player.__dtunesOfflinePatched = true;

    const originalPlayDirect = window.player.playDirect;
    window.player.playDirect = function (track) {
      if (track && track.id && offlineIds.has(String(track.id))) {
        const meta = offlineMeta.get(String(track.id));
        const art = (meta && meta.img) || track.img || "DTunes.svg";
        const trackUrl = offlineUrl(track.id);
        return originalPlayDirect.call(window.player, Object.assign({}, track, {
          url: trackUrl,
          img: art,
          isOffline: true
        }));
      }
      if (track && track.id && window.offlineStore && offlineStore.isDownloaded(track.id)) {
        return (async () => {
          const playUrl = await offlineStore.getPlayUrl(track.id);
          return originalPlayDirect.call(window.player, Object.assign({}, track, {
            url: playUrl || track.url,
            isOffline: true
          }));
        })();
      }
      return originalPlayDirect.call(window.player, track);
    };

    const japi = window.jiosaavnAPI;
    if (japi && typeof japi.isStreamingUrl === 'function' && !japi.__dtunesOfflinePatched) {
      japi.__dtunesOfflinePatched = true;
      const originalIsStreaming = japi.isStreamingUrl.bind(japi);
      japi.isStreamingUrl = function (candidate) {
        if (typeof candidate === 'string' && candidate.startsWith('dtunes-media://')) return true;
        return originalIsStreaming(candidate);
      };
    }
  }

  // ----- Taskbar / SMTC media state -----
  function sendMediaState() {
    if (!isDesktop || !api.sendMediaState) return;
    const el = audioEl();
    const track = window.state && window.state.currentTrack;
    const duration = el && Number.isFinite(el.duration) && el.duration > 0
      ? el.duration
      : (Number(track && track.duration) || 0);
    api.sendMediaState({
      playing: Boolean(window.state && window.state.playing),
      hasTrack: Boolean(track),
      position: el && Number.isFinite(el.currentTime) ? Math.max(0, el.currentTime) : 0,
      duration,
      title: (track && (track.name || track.title)) || '',
      artist: (track && track.artist) || '',
      shuffle: Boolean(window.state && window.state.shuffle),
      repeat: (window.state && window.state.repeat) || 0
    });
  }

  function initMediaState() {
    if (!isDesktop || !api.sendMediaState) return;
    const el = audioEl();
    ['play', 'pause', 'playing', 'loadedmetadata', 'ended', 'seeked'].forEach((evt) => {
      if (el) el.addEventListener(evt, sendMediaState);
    });
    let lastTimeUpdate = 0;
    if (el) {
      el.addEventListener('timeupdate', () => {
        const now = Date.now();
        if (now - lastTimeUpdate > 300) {
          lastTimeUpdate = now;
          sendMediaState();
        }
      });
    }
    if (window.player) {
      const origShuffle = window.player.toggleShuffle;
      window.player.toggleShuffle = function () {
        const result = origShuffle.apply(this, arguments);
        setTimeout(sendMediaState, 0);
        return result;
      };
      const origRepeat = window.player.toggleRepeat;
      window.player.toggleRepeat = function () {
        const result = origRepeat.apply(this, arguments);
        setTimeout(sendMediaState, 0);
        return result;
      };
    }
    setInterval(sendMediaState, 1000);
    sendMediaState();
  }

  // ----- System-level volume from the in-app slider -----
  let volumeSendTimer = null;
  function pushSystemVolume(v) {
    if (!api.setSystemVolume) return;
    if (volumeSendTimer) clearTimeout(volumeSendTimer);
    volumeSendTimer = setTimeout(() => {
      volumeSendTimer = null;
      try { api.setSystemVolume(v); } catch (err) { /* ignore */ }
    }, 40);
  }

  function applyVolume(value, fromSystem) {
    const v = Math.max(0, Math.min(1, Number(value)));
    if (!Number.isFinite(v)) return;
    window.dtunesVolume = v;
    const slider = document.getElementById('volume-slider');
    if (slider && !fromSystem) slider.value = v;
    const el = audioEl();
    if (isDesktop && api && api.setSystemVolume) {
      pushSystemVolume(v);
      if (el) el.volume = 1;
    } else if (el) {
      el.volume = v;
    }
  }
  window.dtunesApplyVolume = applyVolume;

  function patchVolume() {
    if (!window.player || window.player.__dtunesVolumePatched) return;
    window.player.__dtunesVolumePatched = true;
    const original = window.player.setVolume;
    window.player.setVolume = function (value) {
      if (isDesktop) { applyVolume(value, false); return; }
      return original.call(window.player, value);
    };
  }

  async function initSystemVolume() {
    if (!isDesktop || !api.getSystemVolume) return;
    const slider = document.getElementById('volume-slider');
    if (slider && !slider._dtunesSystemBound) {
      slider._dtunesSystemBound = true;
      slider.addEventListener('input', (e) => {
        applyVolume(e.target.value, false);
      });
    }
    // The helper compiles its CoreAudio shim on first use, so allow a few retries.
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const current = await api.getSystemVolume();
        if (typeof current === 'number' && current >= 0) {
          systemVolumeEnabled = true;
          applyVolume(current, true);
          const slider = document.getElementById('volume-slider');
          if (slider) slider.value = current;
          window.addEventListener('focus', async () => {
            try {
              const v = await api.getSystemVolume();
              if (typeof v === 'number' && v >= 0) applyVolume(v, true);
            } catch (err) { /* ignore */ }
          });
          return;
        }
      } catch (err) {
        /* retry */
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    // Helper unavailable: fall back to app-only volume (original player.setVolume).
  }

  // ----- Connectivity feedback & mode switching -----
  function initConnectivity() {
    window.addEventListener('online', () => {
      if (isDesktop) {
        applyOfflineModeState(false);
        if (window.homeView && homeView.init) {
          homeView.init();
        }
      }
      if (window.ui && ui.showToast) ui.showToast('Back online! Syncing music...', 'success');
    });
    window.addEventListener('offline', () => {
      if (isDesktop) {
        applyOfflineModeState(true);
      }
      if (window.ui && ui.showToast) ui.showToast('Offline — downloaded songs & cached music ready', 'warning');
    });
  }

  function boot() {
    registerServiceWorker();
    patchPlayback();
    patchVolume();
    initConnectivity();
    if (!isDesktop) return;

    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    if (isOffline) {
      applyOfflineModeState(true);
    }

    refreshOfflineList().then(() => {
      renderDownloadedSongsSection();
    });
    initMediaState();
    initSystemVolume();
    window.addEventListener('dtunes:offline-changed', () => {
      patchPlayback();
      renderDownloadedSongsSection();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
