(function() {
    'use strict';

    const MS_STORE_URL = 'https://apps.microsoft.com/store/detail/9P4W2JHQ03N1?cid=DevShareMCLPCS';
    const MS_STORE_PROTOCOL = 'ms-windows-store://pdp/?productid=9P4W2JHQ03N1';
    const DOWNLOAD_PATH = '/download';
    const STORAGE_KEY = 'dtunes_ms_store_pref';
    const SNOOZE_DAYS = 7;
    const SNOOZE_MS = SNOOZE_DAYS * 24 * 60 * 60 * 1000;

    const getWin = () => (typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {}));

    const msStoreManager = {
        URL: MS_STORE_URL,
        PROTOCOL: MS_STORE_PROTOCOL,
        DOWNLOAD_PATH: DOWNLOAD_PATH,
        STORAGE_KEY: STORAGE_KEY,
        SNOOZE_MS: SNOOZE_MS,

        isDevForced: () => {
            const win = getWin();
            const search = win.location?.search || '';
            const hash = win.location?.hash || '';
            const params = new URLSearchParams(search);

            // 1. Query parameters: ?ms_store=1 | ?ms_store=force | ?test_ms_store=1 | ?dev_banner=1 | ?dev=ms_store
            if (params.has('ms_store') && params.get('ms_store') !== '0' && params.get('ms_store') !== 'false') return true;
            if (params.has('test_ms_store') || params.has('dev_banner')) return true;
            if (params.get('dev') === 'ms_store' || params.get('dev') === 'banner') return true;

            // 2. Hash triggers: #ms-store | #test-ms-store | #dev-banner
            if (/#(ms-store|test-ms-store|dev-banner)/i.test(hash)) return true;

            // 3. Global developer flags
            if (win.__FORCE_MS_STORE__ || win.__DTUNES_DEV_MS_STORE__) return true;

            return false;
        },

        isWindowsPC: () => {
            const win = getWin();

            // Check if already running in a standalone desktop wrapper, PWA mode, or desktop query param
            const isStandalone = Boolean(
                (win.matchMedia && win.matchMedia('(display-mode: standalone)').matches) ||
                (win.navigator && win.navigator.standalone === true) ||
                win.__IS_DESKTOP_APP__ ||
                win.electron ||
                (win.location?.search && new URLSearchParams(win.location.search).has('desktop')) ||
                (win.location?.search && new URLSearchParams(win.location.search).has('desktop_auth'))
            );
            if (isStandalone) return false;

            const nav = win.navigator || (typeof navigator !== 'undefined' ? navigator : null);
            if (!nav) return false;

            // Check navigator.userAgentData (modern platform detection)
            if (nav.userAgentData?.platform) {
                return /windows/i.test(nav.userAgentData.platform);
            }

            // Fallback for userAgent and platform
            const ua = ((nav.userAgent || '') + ' ' + (nav.platform || '')).toLowerCase();
            const isWin = (ua.includes('windows') || /\b(win32|win64|wow64)\b/.test(ua)) && !ua.includes('windows phone') && !ua.includes('android');
            return isWin;
        },

        isWindowsPlatform: () => {
            const win = getWin();
            const nav = win.navigator || (typeof navigator !== 'undefined' ? navigator : null);
            if (!nav) return false;

            if (nav.userAgentData?.platform) {
                return /windows/i.test(nav.userAgentData.platform);
            }

            const ua = ((nav.userAgent || '') + ' ' + (nav.platform || '')).toLowerCase();
            return (ua.includes('windows') || /\b(win32|win64|wow64)\b/.test(ua)) && !ua.includes('windows phone') && !ua.includes('android');
        },

        getUserId: () => {
            try {
                const win = getWin();
                return win.cloudLibrary?.session?.user?.id || null;
            } catch (_) {
                return null;
            }
        },

        getPreference: () => {
            const win = getWin();
            let pref = null;
            const uid = msStoreManager.getUserId();

            // 1. Try user account preference if signed in
            if (uid) {
                const accountKey = `${STORAGE_KEY}_${uid}`;
                if (typeof safeStorage !== 'undefined') {
                    pref = safeStorage.getJSON(accountKey, null);
                } else {
                    try {
                        const raw = win.localStorage?.getItem(accountKey);
                        if (raw) pref = JSON.parse(raw);
                    } catch (_) {}
                }
            }

            // 2. Fallback to local PC preference
            if (!pref) {
                if (typeof safeStorage !== 'undefined') {
                    pref = safeStorage.getJSON(STORAGE_KEY, null);
                } else {
                    try {
                        const raw = win.localStorage?.getItem(STORAGE_KEY);
                        if (raw) pref = JSON.parse(raw);
                    } catch (_) {}
                }
            }

            return pref;
        },

        setPreference: (status, extra = {}) => {
            const win = getWin();
            const now = Date.now();
            const pref = {
                status: status, // 'pending' | 'checked_out' | 'installed' | 'later'
                updatedAt: now,
                dismissedUntil: status === 'later' ? now + SNOOZE_MS : null,
                ...extra
            };

            // Save to local PC storage
            if (typeof safeStorage !== 'undefined') {
                safeStorage.set(STORAGE_KEY, pref);
            } else {
                try {
                    win.localStorage?.setItem(STORAGE_KEY, JSON.stringify(pref));
                } catch (_) {}
            }

            // Save to account-based storage if signed in
            const uid = msStoreManager.getUserId();
            if (uid) {
                const accountKey = `${STORAGE_KEY}_${uid}`;
                if (typeof safeStorage !== 'undefined') {
                    safeStorage.set(accountKey, pref);
                } else {
                    try {
                        win.localStorage?.setItem(accountKey, JSON.stringify(pref));
                    } catch (_) {}
                }
            }

            msStoreManager.updateUI();
            return pref;
        },

        shouldShowBanner: () => {
            // Dev override bypasses all checks
            if (msStoreManager.isDevForced()) return true;

            if (!msStoreManager.isWindowsPC()) return false;

            const pref = msStoreManager.getPreference();
            if (!pref) return true;

            if (pref.status === 'installed' || pref.status === 'checked_out') {
                return false;
            }

            if (pref.status === 'later') {
                if (pref.dismissedUntil && Date.now() < pref.dismissedUntil) {
                    return false; // Snooze is active
                }
                return true; // Snooze period has elapsed
            }

            return false;
        },

        showBanner: () => {
            if (typeof document === 'undefined') return;
            const banner = document.getElementById('ms-store-banner');
            if (!banner) return;
            banner.classList.remove('translate-y-12', 'opacity-0', 'pointer-events-none');
            banner.classList.add('translate-y-0', 'opacity-100');
        },

        hideBanner: () => {
            if (typeof document === 'undefined') return;
            const banner = document.getElementById('ms-store-banner');
            if (!banner) return;
            banner.classList.remove('translate-y-0', 'opacity-100');
            banner.classList.add('translate-y-12', 'opacity-0', 'pointer-events-none');
        },

        forceShow: () => {
            const win = getWin();
            msStoreManager.showBanner();
            if (win.ui && typeof win.ui.showToast === 'function') {
                win.ui.showToast('Dev: Displaying Microsoft Store banner', 'info', 2000);
            }
        },

        reset: () => {
            const win = getWin();
            try {
                win.localStorage?.removeItem(STORAGE_KEY);
                const uid = msStoreManager.getUserId();
                if (uid) win.localStorage?.removeItem(`${STORAGE_KEY}_${uid}`);
            } catch (_) {}
            if (typeof safeStorage !== 'undefined') {
                safeStorage.remove(STORAGE_KEY);
                const uid = msStoreManager.getUserId();
                if (uid) safeStorage.remove(`${STORAGE_KEY}_${uid}`);
            }
            msStoreManager.updateUI();
            msStoreManager.forceShow();
            if (win.ui && typeof win.ui.showToast === 'function') {
                win.ui.showToast('Dev: Microsoft Store preferences reset', 'success', 2000);
            }
        },

        openWebListing: () => {
            const win = getWin();
            try {
                if (typeof win.open === 'function') {
                    win.open(MS_STORE_URL, '_blank', 'noopener,noreferrer');
                }
            } catch (_) {}
        },

        openStore: (source = 'banner') => {
            const win = getWin();
            msStoreManager.setPreference('checked_out', { source: source });
            msStoreManager.hideBanner();

            if (win.ui && typeof win.ui.showToast === 'function') {
                win.ui.showToast('Opening Microsoft Store...', 'success');
            }

            // Only Windows handles the native ms-windows-store:// protocol.
            if (!msStoreManager.isWindowsPlatform()) {
                msStoreManager.openWebListing();
                return;
            }

            // Trigger the protocol without navigating the current page away, by using
            // a hidden iframe instead of assigning window.location.href.
            let launched = false;
            if (typeof document !== 'undefined' && document.body) {
                try {
                    const iframe = document.createElement('iframe');
                    iframe.style.display = 'none';
                    iframe.setAttribute('aria-hidden', 'true');
                    iframe.src = MS_STORE_PROTOCOL;
                    document.body.appendChild(iframe);
                    setTimeout(() => {
                        try { iframe.remove(); } catch (_) {}
                    }, 2000);
                    launched = true;
                } catch (_) {
                    launched = false;
                }
            }

            // If the protocol did not take over the page, fall back to the web listing.
            setTimeout(() => {
                if (typeof document !== 'undefined' && document.hidden) return;
                msStoreManager.openWebListing();
            }, 1200);

            if (!launched) {
                msStoreManager.openWebListing();
            }
        },

        markInstalled: () => {
            const win = getWin();
            msStoreManager.setPreference('installed');
            msStoreManager.hideBanner();
            if (win.ui && typeof win.ui.showToast === 'function') {
                win.ui.showToast("Awesome! D'Tunes marked as installed.", 'success');
            }
        },

        dismiss: (isLater = true) => {
            const win = getWin();
            if (isLater) {
                msStoreManager.setPreference('later');
                if (win.ui && typeof win.ui.showToast === 'function') {
                    win.ui.showToast("No problem! Find D'Tunes for Windows in Settings anytime.", 'info', 2500);
                }
            } else {
                msStoreManager.setPreference('checked_out');
            }
            msStoreManager.hideBanner();
        },

        toggleInstalledSetting: () => {
            const win = getWin();
            const pref = msStoreManager.getPreference();
            const isInstalled = pref?.status === 'installed';
            if (isInstalled) {
                msStoreManager.setPreference('pending');
                if (win.ui && typeof win.ui.showToast === 'function') {
                    win.ui.showToast('Status updated to available', 'info');
                }
            } else {
                msStoreManager.markInstalled();
            }
            msStoreManager.updateUI();
        },

        updateUI: () => {
            if (typeof document === 'undefined') return;
            const pref = msStoreManager.getPreference();
            const isInstalled = pref?.status === 'installed';
            const isCheckedOut = pref?.status === 'checked_out';

            // Settings View elements
            const settingsStatusBadge = document.getElementById('settings-ms-store-status-badge');
            const settingsDesc = document.getElementById('settings-ms-store-description');
            const settingsBtn = document.getElementById('settings-ms-store-status-btn');

            if (settingsStatusBadge) {
                if (isInstalled) {
                    settingsStatusBadge.textContent = 'Installed';
                    settingsStatusBadge.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 border border-emerald-500/30 text-emerald-300';
                } else if (isInstalled) {
                    settingsStatusBadge.textContent = 'Installed';
                    settingsStatusBadge.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/5 border border-white/10 text-gray-300';
                } else {
                    settingsStatusBadge.textContent = 'Microsoft Store';
                    settingsStatusBadge.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/5 border border-white/10 text-gray-300';
                }
            }

            if (settingsDesc) {
                if (isInstalled) {
                    settingsDesc.textContent = "D'Tunes is installed on this PC. Launch it from your Start menu or check Microsoft Store for updates.";
                } else {
                    settingsDesc.textContent = "Available on the Microsoft Store with hardware media keys, system tray audio, and native desktop performance.";
                }
            }

            if (settingsBtn) {
                settingsBtn.textContent = isInstalled ? 'Change: Not installed' : 'Mark as installed';
            }
        },

        init: () => {
            const win = getWin();
            const search = win.location?.search || '';
            const params = new URLSearchParams(search);

            // Check for dev reset parameter: ?ms_store=reset or ?ms_store_reset=1
            if (params.get('ms_store') === 'reset' || params.has('ms_store_reset')) {
                msStoreManager.reset();
                return;
            }

            msStoreManager.updateUI();

            // Dev override: show immediately for test verification
            if (msStoreManager.isDevForced()) {
                setTimeout(() => {
                    msStoreManager.showBanner();
                }, 300);
                return;
            }

            if (msStoreManager.shouldShowBanner()) {
                setTimeout(() => {
                    if (msStoreManager.shouldShowBanner()) {
                        msStoreManager.showBanner();
                    }
                }, 1500);
            }
        }
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = msStoreManager;
    }
    const win = getWin();
    if (win) {
        win.msStoreManager = msStoreManager;
        win.msStorePromo = msStoreManager;
    }
})();
