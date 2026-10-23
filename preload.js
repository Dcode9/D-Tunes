const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isDesktopApp: true,
  platform: 'windows',
  version: '1.4.0',
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('is-window-maximized'),
  openExternalUrl: (url) => ipcRenderer.invoke('app-open-external-url', url),
  startGoogleLogin: (customUrl) => ipcRenderer.invoke('app-start-google-login', customUrl),
  clearStorageAndLogout: () => ipcRenderer.send('app-clear-storage-and-logout'),
  sendMediaState: (state) => ipcRenderer.send('media-state-update', state),
  downloadTrack: (data) => ipcRenderer.invoke('download-track', data),
  listOfflineTracks: () => ipcRenderer.invoke('offline-list'),
  deleteOfflineTrack: (id) => ipcRenderer.invoke('offline-delete', id),
  setSystemVolume: (value) => ipcRenderer.send('system-volume-set', value),
  getSystemVolume: () => ipcRenderer.invoke('system-volume-get'),
  fetchSpotifyEmbed: (url) => ipcRenderer.invoke('fetch-spotify-embed', url)
});

function injectCustomWindowControls() {
  if (document.getElementById('dtunes-window-controls')) return;

  const controls = document.createElement('div');
  controls.id = 'dtunes-window-controls';
  controls.className = 'dtunes-window-controls';
  controls.innerHTML = `
    <button id="dtunes-btn-minimize" class="dtunes-win-btn" title="Minimize" aria-label="Minimize">
      <svg width="11" height="2" viewBox="0 0 11 2" fill="currentColor"><rect width="11" height="2" rx="1"/></svg>
    </button>
    <button id="dtunes-btn-maximize" class="dtunes-win-btn" title="Maximize" aria-label="Maximize">
      <svg id="dtunes-max-icon" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="1" width="8" height="8" rx="1.5"/></svg>
    </button>
    <button id="dtunes-btn-close" class="dtunes-win-btn dtunes-btn-close" title="Close" aria-label="Close">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5"/></svg>
    </button>
  `;

  const minBtn = controls.querySelector('#dtunes-btn-minimize');
  const maxBtn = controls.querySelector('#dtunes-btn-maximize');
  const closeBtn = controls.querySelector('#dtunes-btn-close');
  const maxIcon = controls.querySelector('#dtunes-max-icon');

  if (minBtn) minBtn.addEventListener('click', (e) => { e.stopPropagation(); ipcRenderer.send('window-minimize'); });
  if (maxBtn) maxBtn.addEventListener('click', (e) => { e.stopPropagation(); ipcRenderer.send('window-maximize'); });
  if (closeBtn) closeBtn.addEventListener('click', (e) => { e.stopPropagation(); ipcRenderer.send('window-close'); });

  ipcRenderer.invoke('is-window-maximized').then(isMax => updateMaxIcon(isMax, maxIcon));
  ipcRenderer.on('window-maximized-change', (_e, isMax) => updateMaxIcon(isMax, maxIcon));

  document.body.appendChild(controls);
}

function updateMaxIcon(isMax, iconElem) {
  if (!iconElem) iconElem = document.getElementById('dtunes-max-icon');
  if (!iconElem) return;
  if (isMax) {
    iconElem.innerHTML = `<path d="M2.5 1.5H8.5V7.5M1.5 3.5H7.5V9.5H1.5V3.5Z" stroke="currentColor" stroke-width="1.2"/>`;
  } else {
    iconElem.innerHTML = `<rect x="1" y="1" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.5"/>`;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.isDTunesDesktop = true;

  const style = document.createElement('style');
  style.id = 'dtunes-desktop-styles';
  style.textContent = `
    .dtunes-window-controls {
      position: fixed;
      top: 16px;
      right: 24px;
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 3px 5px;
      background: rgba(18, 18, 24, 0.75);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 9999px;
      height: 38px;
      -webkit-app-region: no-drag !important;
      pointer-events: auto !important;
      z-index: 999999;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
      flex-shrink: 0;
    }

    .dtunes-win-btn {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      color: #a1a1aa;
      cursor: pointer;
      transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
      -webkit-app-region: no-drag !important;
      padding: 0;
    }

    .dtunes-win-btn:hover {
      background: rgba(255, 255, 255, 0.15);
      color: #ffffff;
      transform: scale(1.06);
    }

    .dtunes-win-btn.dtunes-btn-close:hover {
      background: rgba(239, 68, 68, 0.85);
      color: #ffffff;
      transform: scale(1.06);
      box-shadow: 0 0 12px rgba(239, 68, 68, 0.5);
    }

    .dtunes-win-btn:active {
      transform: scale(0.94);
    }

    @media (min-width: 768px) {
      header {
        padding-right: 148px !important;
      }
      #search-positioner {
        padding-right: 148px !important;
      }
    }

    header {
      -webkit-app-region: drag !important;
    }
    
    button, input, a, select, textarea, [role="button"], .clickable, #dtunes-window-controls, #header-account, #app-logo, #search-positioner, .desktop-auth-button, #profile-dropdown, img {
      -webkit-app-region: no-drag !important;
    }

    ::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }
    ::-webkit-scrollbar-track {
      background: transparent;
    }
    ::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.18);
      border-radius: 8px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.35);
    }

    body {
      user-select: none;
      -webkit-user-select: none;
    }
    input, textarea {
      user-select: auto;
      -webkit-user-select: auto;
    }
  `;
  document.head.appendChild(style);

  injectCustomWindowControls();

  const observer = new MutationObserver(() => {
    if (!document.getElementById('dtunes-window-controls')) {
      injectCustomWindowControls();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  function patchAuthHooks() {
    if (window.dverse && !window.dverse.__desktopHooked) {
      window.dverse.__desktopHooked = true;
      const originalSignOut = window.dverse.signOut;
      window.dverse.signOut = async function() {
        try {
          if (originalSignOut) await originalSignOut();
        } catch (e) { }

        try {
          localStorage.clear();
          sessionStorage.clear();
        } catch (e) { }

        ipcRenderer.send('app-clear-storage-and-logout');
      };
    }
  }

  patchAuthHooks();
  window.addEventListener('dverse:ready', patchAuthHooks);
  setInterval(patchAuthHooks, 1000);
});
