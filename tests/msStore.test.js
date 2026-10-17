const test = require('node:test');
const assert = require('node:assert');
const msStoreManager = require('../src/js/ms-store.js');

test('Microsoft Store Integration Suite for Windows PC Users', async (t) => {

    await t.test('Platform Detection: isWindowsPC returns true for Windows user agents', () => {
        const originalWindow = global.window;
        const originalNavigator = global.navigator;

        try {
            // Test Windows 10/11 Chrome UA
            const winNav = {
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                platform: 'Win32'
            };
            global.window = {
                matchMedia: () => ({ matches: false }),
                location: { search: '' },
                navigator: winNav
            };
            global.navigator = winNav;
            assert.strictEqual(msStoreManager.isWindowsPC(), true);

            // Test Windows Client Hints
            const hintsNav = {
                userAgentData: { platform: 'Windows' },
                userAgent: '',
                platform: ''
            };
            global.window.navigator = hintsNav;
            global.navigator = hintsNav;
            assert.strictEqual(msStoreManager.isWindowsPC(), true);

            // Test 32-bit Windows
            const win32Nav = {
                userAgent: 'Mozilla/5.0 (Windows NT 6.1; WOW64; rv:40.0) Gecko/20100101 Firefox/40.1',
                platform: 'Win32'
            };
            global.window.navigator = win32Nav;
            global.navigator = win32Nav;
            assert.strictEqual(msStoreManager.isWindowsPC(), true);
        } finally {
            global.window = originalWindow;
            global.navigator = originalNavigator;
        }
    });

    await t.test('Platform Detection: isWindowsPC returns false for non-Windows platforms', () => {
        const originalWindow = global.window;
        const originalNavigator = global.navigator;

        try {
            // macOS
            const macNav = {
                userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                platform: 'MacIntel'
            };
            global.window = {
                matchMedia: () => ({ matches: false }),
                location: { search: '' },
                navigator: macNav
            };
            global.navigator = macNav;
            assert.strictEqual(msStoreManager.isWindowsPC(), false);

            // iPhone / iOS
            const iosNav = {
                userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
                platform: 'iPhone'
            };
            global.window.navigator = iosNav;
            global.navigator = iosNav;
            assert.strictEqual(msStoreManager.isWindowsPC(), false);

            // Android
            const androidNav = {
                userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36',
                platform: 'Linux armv8l'
            };
            global.window.navigator = androidNav;
            global.navigator = androidNav;
            assert.strictEqual(msStoreManager.isWindowsPC(), false);

            // Linux
            const linuxNav = {
                userAgent: 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:109.0) Gecko/20100101',
                platform: 'Linux x86_64'
            };
            global.window.navigator = linuxNav;
            global.navigator = linuxNav;
            assert.strictEqual(msStoreManager.isWindowsPC(), false);
        } finally {
            global.window = originalWindow;
            global.navigator = originalNavigator;
        }
    });

    await t.test('Platform Detection: isWindowsPC returns false when running in desktop app or standalone PWA', () => {
        const originalWindow = global.window;
        const originalNavigator = global.navigator;

        try {
            const winNav = {
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                platform: 'Win32'
            };

            // Standalone display mode matchMedia
            global.window = {
                matchMedia: (query) => ({ matches: query.includes('standalone') }),
                location: { search: '' },
                navigator: winNav
            };
            global.navigator = winNav;
            assert.strictEqual(msStoreManager.isWindowsPC(), false);

            // Desktop query param: ?desktop=1
            global.window = {
                matchMedia: () => ({ matches: false }),
                location: { search: '?desktop=1' },
                navigator: winNav
            };
            assert.strictEqual(msStoreManager.isWindowsPC(), false);

            // Desktop query param: ?desktop_auth=1
            global.window = {
                matchMedia: () => ({ matches: false }),
                location: { search: '?desktop_auth=1' },
                navigator: winNav
            };
            assert.strictEqual(msStoreManager.isWindowsPC(), false);

            // Desktop flag: window.__IS_DESKTOP_APP__
            global.window = {
                matchMedia: () => ({ matches: false }),
                location: { search: '' },
                __IS_DESKTOP_APP__: true,
                navigator: winNav
            };
            assert.strictEqual(msStoreManager.isWindowsPC(), false);
        } finally {
            global.window = originalWindow;
            global.navigator = originalNavigator;
        }
    });

    await t.test('Preference Lifecycle: Default state shows banner, setPreference updates local and account storage', () => {
        const mockStorage = new Map();
        const originalWindow = global.window;
        const originalNavigator = global.navigator;

        try {
            const winNav = {
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                platform: 'Win32'
            };
            global.window = {
                matchMedia: () => ({ matches: false }),
                location: { search: '' },
                navigator: winNav,
                localStorage: {
                    getItem: (key) => mockStorage.get(key) || null,
                    setItem: (key, val) => mockStorage.set(key, String(val)),
                    removeItem: (key) => mockStorage.delete(key)
                },
                cloudLibrary: {
                    session: {
                        user: { id: 'usr_test_123' }
                    }
                }
            };
            global.navigator = winNav;

            // First visit: shouldShowBanner is true
            assert.strictEqual(msStoreManager.shouldShowBanner(), true);

            // User clicks "Maybe Later"
            const prefLater = msStoreManager.setPreference('later');
            assert.strictEqual(prefLater.status, 'later');
            assert.ok(prefLater.dismissedUntil > Date.now());
            // Account-level preference should be recorded
            assert.ok(mockStorage.has(`dtunes_ms_store_pref_usr_test_123`));
            assert.ok(mockStorage.has(`dtunes_ms_store_pref`));

            // While snooze is active (within 7 days), shouldShowBanner must be false
            assert.strictEqual(msStoreManager.shouldShowBanner(), false);

            // Simulate snooze expiration (7 days later)
            const expiredPref = {
                status: 'later',
                updatedAt: Date.now() - (8 * 86400000),
                dismissedUntil: Date.now() - 1000 // In the past
            };
            mockStorage.set('dtunes_ms_store_pref', JSON.stringify(expiredPref));
            mockStorage.set('dtunes_ms_store_pref_usr_test_123', JSON.stringify(expiredPref));
            assert.strictEqual(msStoreManager.shouldShowBanner(), true);

            // User clicks "Already Installed"
            msStoreManager.setPreference('installed');
            assert.strictEqual(msStoreManager.shouldShowBanner(), false);

            // User clicks "Get from Store" (checked_out)
            msStoreManager.setPreference('checked_out');
            assert.strictEqual(msStoreManager.shouldShowBanner(), false);
        } finally {
            global.window = originalWindow;
            global.navigator = originalNavigator;
        }
    });

    await t.test('Store Protocol and URLs: Correct Product ID and deep link structure', () => {
        assert.strictEqual(msStoreManager.PROTOCOL, 'ms-windows-store://pdp/?productid=9P4W2JHQ03N1');
        assert.strictEqual(msStoreManager.URL, 'https://apps.microsoft.com/store/detail/9P4W2JHQ03N1?cid=DevShareMCLPCS');
    });

    await t.test('Action Handlers: markInstalled, dismiss, openStore update UI and status', () => {
        const mockStorage = new Map();
        let toastMessage = '';
        let toastType = '';

        const originalWindow = global.window;
        const originalNavigator = global.navigator;

        try {
            const winNav = {
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                platform: 'Win32'
            };
            global.window = {
                matchMedia: () => ({ matches: false }),
                location: { href: 'https://dtunes.app', search: '' },
                navigator: winNav,
                localStorage: {
                    getItem: (key) => mockStorage.get(key) || null,
                    setItem: (key, val) => mockStorage.set(key, String(val)),
                    removeItem: (key) => mockStorage.delete(key)
                },
                ui: {
                    showToast: (msg, type) => {
                        toastMessage = msg;
                        toastType = type;
                    }
                },
                open: () => {}
            };
            global.navigator = winNav;

            // 1. Test markInstalled
            msStoreManager.markInstalled();
            assert.strictEqual(msStoreManager.getPreference().status, 'installed');
            assert.ok(toastMessage.includes('installed'));

            // 2. Test dismiss with later=true
            msStoreManager.dismiss(true);
            assert.strictEqual(msStoreManager.getPreference().status, 'later');
            assert.ok(toastMessage.includes('Settings'));

            // 3. Test openStore
            msStoreManager.openStore('test');
            assert.strictEqual(msStoreManager.getPreference().status, 'checked_out');
            assert.strictEqual(toastMessage, 'Opening Microsoft Store...');
            assert.strictEqual(toastType, 'success');
        } finally {
            global.window = originalWindow;
            global.navigator = originalNavigator;
        }
    });
});
