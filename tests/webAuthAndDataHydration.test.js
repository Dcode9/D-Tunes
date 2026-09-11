const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createTestEnvironment } = require('./testHarness');

function setupSandbox(env) {
    const sandbox = env.window;
    sandbox.window = sandbox;
    sandbox.document = env.document;
    sandbox.localStorage = env.localStorage;
    sandbox.sessionStorage = env.sessionStorage;
    sandbox.navigator = env.navigator;
    sandbox.fetch = env.fetch;
    sandbox.URLSearchParams = URLSearchParams;
    sandbox.TextDecoder = TextDecoder;
    sandbox.Uint8Array = Uint8Array;
    sandbox.btoa = btoa;
    sandbox.atob = atob;
    sandbox.console = console;
    sandbox.setTimeout = setTimeout;
    sandbox.clearTimeout = clearTimeout;
    sandbox.setInterval = setInterval;
    sandbox.clearInterval = clearInterval;
    sandbox.crypto = globalThis.crypto || require('crypto').webcrypto;
    sandbox.CustomEvent = globalThis.CustomEvent || class CustomEvent {
        constructor(type, opts = {}) {
            this.type = type;
            this.detail = opts.detail;
        }
    };
    let cookieStore = '';
    Object.defineProperty(env.document, 'cookie', {
        get: () => cookieStore,
        set: (val) => {
            const parts = String(val).split(';')[0].trim();
            if (parts.includes('=')) {
                const k = parts.split('=')[0].trim();
                if (String(val).includes('expires=Thu, 01 Jan 1970')) {
                    cookieStore = cookieStore.split('; ').filter(c => !c.startsWith(k + '=')).join('; ');
                } else {
                    cookieStore = cookieStore ? `${cookieStore}; ${parts}` : parts;
                }
            }
        },
        configurable: true
    });
    return sandbox;
}

test('Web Auth & Data Hydration Test Suite', async (t) => {

    await t.test('Tier 1: dverseClient PKCE code exchange succeeds and cleans URL', async () => {
        const env = createTestEnvironment();
        setupSandbox(env);
        let exchangeCalled = false;
        let exchangedCode = null;
        let replaceStateCalled = false;
        let cleanUrl = null;

        env.window.location = {
            origin: 'https://tunes.d-verse.in',
            pathname: '/',
            search: '?code=pkce_test_code_123&state=test_state',
            hash: '',
            protocol: 'https:',
            hostname: 'tunes.d-verse.in',
            href: 'https://tunes.d-verse.in/?code=pkce_test_code_123&state=test_state'
        };
        env.window.history = {
            replaceState: (state, title, url) => {
                replaceStateCalled = true;
                cleanUrl = url;
                env.window.location.search = url.includes('?') ? url.split('?')[1].split('#')[0] : '';
            }
        };

        const mockSession = {
            access_token: 'valid_access_token_123',
            refresh_token: 'valid_refresh_token_123',
            user: {
                id: 'user_pkce_001',
                email: 'tester@d-verse.in',
                user_metadata: { name: 'DVerse Tester' }
            }
        };

        const mockSupabase = {
            createClient: (url, key, options) => {
                assert.strictEqual(options.auth.detectSessionInUrl, false, 'detectSessionInUrl must be false to avoid Gotrue collision');
                return {
                    auth: {
                        getSession: async () => ({ data: { session: null }, error: null }),
                        exchangeCodeForSession: async (code) => {
                            exchangeCalled = true;
                            exchangedCode = code;
                            return { data: { session: mockSession }, error: null };
                        },
                        setSession: async ({ access_token, refresh_token }) => ({
                            data: { session: mockSession },
                            error: null
                        }),
                        onAuthStateChange: (cb) => ({ data: { subscription: { unsubscribe() {} } } }),
                        signOut: async () => ({ error: null })
                    },
                    from: (table) => ({
                        select: () => ({
                            eq: () => ({
                                maybeSingle: async () => ({ data: null, error: null }),
                                order: () => ({ limit: async () => ({ data: [], error: null }) })
                            })
                        })
                    })
                };
            }
        };

        env.window.supabase = mockSupabase;

        let loadCalled = false;
        env.window.cloudLibrary = {
            session: null,
            updateUI: () => {},
            load: async () => { loadCalled = true; }
        };

        const codeContent = fs.readFileSync(path.join(__dirname, '../src/dverseClient.js'), 'utf8');
        vm.runInNewContext(codeContent, env.window);

        assert.ok(env.window.dverse, 'dverse client initialized');
        const session = await env.window.dverse.getSession();

        assert.ok(exchangeCalled, 'exchangeCodeForSession was called');
        assert.strictEqual(exchangedCode, 'pkce_test_code_123', 'Exchanged correct code');
        assert.ok(session, 'Session was returned');
        assert.strictEqual(session.user.id, 'user_pkce_001');
        assert.ok(replaceStateCalled, 'URL was cleaned via replaceState');
        assert.ok(!cleanUrl.includes('code='), 'Clean URL does not contain code');
        assert.ok(!cleanUrl.includes('state='), 'Clean URL does not contain state');
        assert.strictEqual(env.window.cloudLibrary.session, mockSession, 'cloudLibrary.session was assigned');
        assert.ok(loadCalled, 'cloudLibrary.load() was triggered');
    });

    await t.test('Tier 2: Existing session prevents duplicate exchange and session wipe', async () => {
        const env = createTestEnvironment();
        setupSandbox(env);
        let exchangeAttempted = false;
        let replaceStateCalled = false;

        env.window.location = {
            origin: 'https://tunes.d-verse.in',
            pathname: '/',
            search: '?code=already_exchanged_code&state=xyz',
            hash: '',
            protocol: 'https:',
            hostname: 'tunes.d-verse.in'
        };
        env.window.history = {
            replaceState: (state, title, url) => {
                replaceStateCalled = true;
                env.window.location.search = url.includes('?') ? url.split('?')[1].split('#')[0] : '';
            }
        };

        const existingSession = {
            access_token: 'existing_token_abc',
            refresh_token: 'existing_refresh_abc',
            user: { id: 'user_existing_999', email: 'existing@d-verse.in' }
        };

        env.window.supabase = {
            createClient: () => ({
                auth: {
                    getSession: async () => ({ data: { session: existingSession }, error: null }),
                    exchangeCodeForSession: async () => {
                        exchangeAttempted = true;
                        throw new Error('PKCE code verifier not found in storage (simulated Gotrue wipe)');
                    },
                    setSession: async () => ({ data: { session: existingSession }, error: null }),
                    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
                    signOut: async () => ({ error: null })
                },
                from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) })
            })
        };

        env.window.cloudLibrary = {
            session: null,
            updateUI: () => {},
            load: async () => {}
        };

        const codeContent = fs.readFileSync(path.join(__dirname, '../src/dverseClient.js'), 'utf8');
        vm.runInNewContext(codeContent, env.window);

        const session = await env.window.dverse.getSession();

        assert.strictEqual(exchangeAttempted, false, 'exchangeCodeForSession must NOT be called when session already exists');
        assert.ok(session, 'Existing session returned');
        assert.strictEqual(session.user.id, 'user_existing_999');
        assert.ok(replaceStateCalled, 'URL parameters cleaned');
        assert.ok(!env.window.location.search.includes('code='), 'Code removed from search params');
    });

    await t.test('Tier 3: URL parameters cleaned even if code exchange throws or errors', async () => {
        const env = createTestEnvironment();
        setupSandbox(env);
        let replaceStateCalled = false;
        let cleanUrl = null;

        env.window.location = {
            origin: 'https://tunes.d-verse.in',
            pathname: '/',
            search: '?code=invalid_expired_code&state=err',
            hash: '',
            protocol: 'https:',
            hostname: 'tunes.d-verse.in'
        };
        env.window.history = {
            replaceState: (state, title, url) => {
                replaceStateCalled = true;
                cleanUrl = url;
                env.window.location.search = url.includes('?') ? url.split('?')[1].split('#')[0] : '';
            }
        };

        env.window.supabase = {
            createClient: () => ({
                auth: {
                    getSession: async () => ({ data: { session: null }, error: null }),
                    exchangeCodeForSession: async () => ({ data: null, error: new Error('Invalid authorization code') }),
                    setSession: async () => ({ data: null, error: null }),
                    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
                    signOut: async () => ({ error: null })
                },
                from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) })
            })
        };

        const codeContent = fs.readFileSync(path.join(__dirname, '../src/dverseClient.js'), 'utf8');
        vm.runInNewContext(codeContent, env.window);

        const session = await env.window.dverse.getSession();
        assert.strictEqual(session, null, 'Session is null on error');
        assert.ok(replaceStateCalled, 'replaceState was called on error to clean URL');
        assert.ok(!cleanUrl.includes('code='), 'Clean URL has no code parameter');
    });

    await t.test('Tier 4: Desktop auth bypass (?desktop_auth=1) skips web code exchange', async () => {
        const env = createTestEnvironment();
        setupSandbox(env);
        let exchangeAttempted = false;

        env.window.location = {
            origin: 'https://tunes.d-verse.in',
            pathname: '/',
            search: '?desktop_auth=1&code=desktop_code_xyz',
            hash: '',
            protocol: 'https:',
            hostname: 'tunes.d-verse.in'
        };

        env.window.supabase = {
            createClient: () => ({
                auth: {
                    getSession: async () => ({ data: { session: null }, error: null }),
                    exchangeCodeForSession: async () => {
                        exchangeAttempted = true;
                        return { data: null, error: new Error('Verifier missing in browser') };
                    },
                    setSession: async () => ({ data: null, error: null }),
                    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
                    signOut: async () => ({ error: null })
                },
                from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) })
            })
        };

        const codeContent = fs.readFileSync(path.join(__dirname, '../src/dverseClient.js'), 'utf8');
        vm.runInNewContext(codeContent, env.window);

        const session = await env.window.dverse.getSession();
        assert.strictEqual(session, null);
        assert.strictEqual(exchangeAttempted, false, 'Desktop auth code must not be exchanged in browser');
    });

    await t.test('Tier 5: Profile fetching and updating methods in dverseClient', async () => {
        const env = createTestEnvironment();
        setupSandbox(env);
        const testUser = { id: 'prof_user_42', email: 'prof@d-verse.in' };
        let queriedTable = null;
        let upsertPayload = null;

        env.window.location = {
            origin: 'https://tunes.d-verse.in',
            pathname: '/',
            search: '',
            hash: '',
            protocol: 'https:',
            hostname: 'tunes.d-verse.in'
        };

        const mockProfileRow = {
            id: 'prof_user_42',
            display_name: 'Super Star',
            avatar_url: 'https://example.com/star.png',
            email: 'prof@d-verse.in',
            updated_at: '2026-09-11T12:00:00Z'
        };

        env.window.supabase = {
            createClient: () => ({
                auth: {
                    getSession: async () => ({ data: { session: { user: testUser } }, error: null }),
                    setSession: async () => ({ data: { session: { user: testUser } }, error: null }),
                    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
                    signOut: async () => ({ error: null })
                },
                from: (table) => {
                    queriedTable = table;
                    return {
                        select: (cols) => ({
                            eq: (field, val) => ({
                                maybeSingle: async () => ({ data: mockProfileRow, error: null })
                            })
                        }),
                        upsert: (payload) => {
                            upsertPayload = payload;
                            return {
                                select: () => ({
                                    single: async () => ({ data: { ...mockProfileRow, ...payload }, error: null })
                                })
                            };
                        }
                    };
                }
            })
        };

        const codeContent = fs.readFileSync(path.join(__dirname, '../src/dverseClient.js'), 'utf8');
        vm.runInNewContext(codeContent, env.window);

        assert.ok(typeof env.window.dverse.dtunes.fetchProfile === 'function', 'fetchProfile is exported');
        assert.ok(typeof env.window.dverse.dtunes.updateProfile === 'function', 'updateProfile is exported');

        const profile = await env.window.dverse.dtunes.fetchProfile('prof_user_42');
        assert.strictEqual(queriedTable, 'profiles', 'Queried profiles table');
        assert.strictEqual(profile.display_name, 'Super Star');
        assert.strictEqual(profile.avatar_url, 'https://example.com/star.png');

        const updated = await env.window.dverse.dtunes.updateProfile({ display_name: 'Cosmic Star' });
        assert.strictEqual(upsertPayload.display_name, 'Cosmic Star');
        assert.strictEqual(updated.display_name, 'Cosmic Star');
    });

    await t.test('Tier 6: Full Data Hydration Lifecycle in cloudLibrary.load()', async () => {
        const env = createTestEnvironment();
        setupSandbox(env);
        const testUser = { id: 'user_full_sync', email: 'sync@d-verse.in' };
        const testSession = { user: testUser, access_token: 'tok', refresh_token: 'ref' };

        const mockHistory = [
            { id: 'h1', title: 'History Song 1', artist: 'Artist A', img: 'https://example.com/h1.jpg' }
        ];
        const mockLikes = [
            { id: 'l1', title: 'Liked Song 1', artist: 'Artist B', img: 'https://example.com/l1.jpg' }
        ];
        const mockLibrary = [
            { id: 'lib1', title: 'Library Song 1', artist: 'Artist C', img: 'https://example.com/lib1.jpg' }
        ];
        const mockPlaylists = [
            { id: 'pl1', name: 'Chill Vibes', songs: [{ id: 'cv1', title: 'Chill 1' }], style: { bg: 'bg-blue-500' } }
        ];
        const mockProfile = {
            id: 'user_full_sync',
            display_name: 'Hydrated User',
            avatar_url: 'https://example.com/avatar.jpg'
        };

        const ddUsername = env.document.getElementById('dd-username');
        const headerAvatar = env.document.getElementById('header-avatar');
        const mobileNavAvatar = env.document.getElementById('mobile-nav-avatar');
        const playlistsGrid = env.document.getElementById('playlists-grid');
        const librarySongs = env.document.getElementById('library-songs');
        const libraryHistory = env.document.getElementById('library-history');

        env.document.body.appendChild(ddUsername);
        env.document.body.appendChild(headerAvatar);
        env.document.body.appendChild(mobileNavAvatar);
        env.document.body.appendChild(playlistsGrid);
        env.document.body.appendChild(librarySongs);
        env.document.body.appendChild(libraryHistory);

        env.window.dverse = {
            isConfigured: true,
            getSession: async () => testSession,
            onAuthStateChange: () => ({ unsubscribe() {} }),
            dtunes: {
                listHistory: async () => mockHistory,
                listLikes: async () => mockLikes,
                listLibrary: async () => mockLibrary,
                listPlaylists: async () => mockPlaylists,
                getPlaybackState: async () => null,
                fetchProfile: async () => mockProfile,
                updateProfile: async (patch) => ({ ...mockProfile, ...patch })
            }
        };

        const state = {
            playHistory: [],
            likedIds: [],
            libraryIds: [],
            playlists: {},
            playlistStyles: {},
            username: 'Guest User',
            avatarUrl: ''
        };
        env.window.state = state;

        let playlistsRendered = false;
        let libraryRendered = false;
        let historyRendered = false;
        let recentlyPlayedRendered = false;
        let discoverRendered = false;

        const ui = {
            avatarFallback: () => 'https://example.com/fallback.png',
            updateProfileUI: () => {},
            renderPlaylists: () => { playlistsRendered = true; },
            renderLibraryLists: () => { libraryRendered = true; },
            renderHistory: () => { historyRendered = true; }
        };
        const homeView = {
            renderRecentlyPlayed: () => { recentlyPlayedRendered = true; },
            renderDiscoverSection: () => { discoverRendered = true; }
        };

        const cloudLibrary = {
            session: testSession,
            profile: null,
            syncing: false,
            ready: () => true,
            songId: (song) => String(typeof song === 'object' ? song?.id : song || ''),
            compactSongs: (songs) => {
                const seen = new Set();
                return (songs || []).filter((song) => {
                    const id = cloudLibrary.songId(song);
                    if (!id || seen.has(id)) return false;
                    seen.add(id);
                    return true;
                });
            },
            captureLocalSnapshot: () => ({ playHistory: [], likedIds: [], libraryIds: [], playlists: {} }),
            shouldPushLocalSnapshot: () => false,
            markLocalSnapshotSynced: () => {},
            choosePlaybackState: () => null,
            setStatus: () => {},
            updateUI: () => {
                const displayName = cloudLibrary.profile?.display_name || state.username;
                const avatarUrl = cloudLibrary.profile?.avatar_url || state.avatarUrl;
                state.username = displayName;
                state.avatarUrl = avatarUrl;
                ddUsername.textContent = displayName;
                headerAvatar.src = avatarUrl;
                mobileNavAvatar.src = avatarUrl;
            },
            load: async () => {
                const [historyRes, likesRes, libraryRes, playlistsRes, playbackRes, profileRes] = await Promise.allSettled([
                    env.window.dverse.dtunes.listHistory(),
                    env.window.dverse.dtunes.listLikes(),
                    env.window.dverse.dtunes.listLibrary(),
                    env.window.dverse.dtunes.listPlaylists(),
                    env.window.dverse.dtunes.getPlaybackState(),
                    env.window.dverse.dtunes.fetchProfile(cloudLibrary.session.user.id)
                ]);

                const history = historyRes.status === 'fulfilled' ? historyRes.value : [];
                const likes = likesRes.status === 'fulfilled' ? likesRes.value : [];
                const library = libraryRes.status === 'fulfilled' ? libraryRes.value : [];
                const playlists = playlistsRes.status === 'fulfilled' ? playlistsRes.value : [];
                const profile = profileRes.status === 'fulfilled' ? profileRes.value : null;

                if (profile) {
                    cloudLibrary.profile = profile;
                    if (profile.display_name) state.username = profile.display_name;
                    if (profile.avatar_url) state.avatarUrl = profile.avatar_url;
                }

                state.playHistory = cloudLibrary.compactSongs([...history, ...state.playHistory]);
                state.likedIds = cloudLibrary.compactSongs([...likes, ...state.likedIds]);
                state.libraryIds = cloudLibrary.compactSongs([...library, ...state.libraryIds]);

                const mergedPlaylists = { ...state.playlists };
                const mergedStyles = { ...state.playlistStyles };
                playlists.forEach((pl) => {
                    mergedPlaylists[pl.name] = cloudLibrary.compactSongs([...(pl.songs || []), ...(mergedPlaylists[pl.name] || [])]);
                    if (pl.style) mergedStyles[pl.name] = pl.style;
                });
                state.playlists = mergedPlaylists;
                state.playlistStyles = mergedStyles;

                ui.renderPlaylists();
                ui.renderLibraryLists();
                ui.renderHistory();
                homeView.renderRecentlyPlayed();
                if (homeView.renderDiscoverSection) homeView.renderDiscoverSection(true);
                cloudLibrary.updateUI();
            }
        };

        env.window.cloudLibrary = cloudLibrary;

        await cloudLibrary.load();

        assert.strictEqual(cloudLibrary.profile.display_name, 'Hydrated User');
        assert.strictEqual(state.username, 'Hydrated User');
        assert.strictEqual(state.avatarUrl, 'https://example.com/avatar.jpg');
        assert.strictEqual(ddUsername.textContent, 'Hydrated User');
        assert.strictEqual(headerAvatar.src, 'https://example.com/avatar.jpg');
        assert.strictEqual(mobileNavAvatar.src, 'https://example.com/avatar.jpg');

        assert.strictEqual(state.playHistory.length, 1);
        assert.strictEqual(state.playHistory[0].title, 'History Song 1');
        assert.strictEqual(state.likedIds.length, 1);
        assert.strictEqual(state.likedIds[0].title, 'Liked Song 1');
        assert.strictEqual(state.libraryIds.length, 1);
        assert.strictEqual(state.libraryIds[0].title, 'Library Song 1');
        assert.ok(state.playlists['Chill Vibes'], 'Playlist hydrated');
        assert.strictEqual(state.playlists['Chill Vibes'].length, 1);

        assert.ok(playlistsRendered, 'Playlists were rendered');
        assert.ok(libraryRendered, 'Library lists were rendered');
        assert.ok(historyRendered, 'History was rendered');
        assert.ok(recentlyPlayedRendered, 'Recently played was rendered');
        assert.ok(discoverRendered, 'Discover section was rendered');
    });

    await t.test('Tier 7: recommendationClient resolves user ID from cloudLibrary session', async () => {
        const env = createTestEnvironment();
        setupSandbox(env);
        const recContent = fs.readFileSync(path.join(__dirname, '../src/recommendationClient.js'), 'utf8');

        // Signed out state
        env.window.cloudLibrary = { session: null };
        vm.runInNewContext(recContent, env.window);

        const anonId = env.window.recommendationClient.getUserId();
        assert.ok(anonId.startsWith('anon_'), 'Generates anonymous id when signed out');

        // Signed in state
        env.window.cloudLibrary.session = { user: { id: 'supabase_auth_uid_123' } };
        const authUserId = env.window.recommendationClient.getUserId();
        assert.strictEqual(authUserId, 'supabase_auth_uid_123', 'Returns authenticated user id when signed in');
    });

    await t.test('Tier 8: Static codebase contracts for auth & hydration', () => {
        const dverseCode = fs.readFileSync(path.join(__dirname, '../src/dverseClient.js'), 'utf8');
        const appCode = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');

        // detectSessionInUrl must be false in dverseClient.js
        assert.ok(dverseCode.includes('detectSessionInUrl: false'), 'detectSessionInUrl must be explicitly false');

        // URL cleanup in both success and failure paths
        assert.ok(dverseCode.includes("searchParams.delete('code')"), 'searchParams code deletion present');
        assert.ok(dverseCode.includes("searchParams.delete('state')"), 'searchParams state deletion present');

        // Profile CRUD methods must exist
        assert.ok(dverseCode.includes('fetchProfile'), 'fetchProfile must be exported');
        assert.ok(dverseCode.includes('updateProfile'), 'updateProfile must be exported');

        // app.js must hydrate profile in cloudLibrary.load()
        assert.ok(appCode.includes('window.dverse.dtunes.fetchProfile'), 'app.js calls fetchProfile');
        assert.ok(appCode.includes('cloudLibrary.profile = profile'), 'app.js sets cloudLibrary.profile');

        // app.js must trigger discover render refresh
        assert.ok(appCode.includes('homeView.renderDiscoverSection(true)'), 'app.js triggers discover section refresh');
    });

    await t.test('Tier 9: Web sign-in routes to D\'Verse portal with return_to parameter and sets return cookies', async () => {
        const env = createTestEnvironment();
        setupSandbox(env);

        env.window.location = {
            origin: 'https://tunes.d-verse.in',
            pathname: '/',
            search: '',
            hash: '',
            protocol: 'https:',
            hostname: 'tunes.d-verse.in',
            href: 'https://tunes.d-verse.in/'
        };

        env.window.supabase = {
            createClient: () => ({
                auth: {
                    getSession: async () => ({ data: { session: null }, error: null }),
                    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
                    signOut: async () => ({ error: null })
                },
                from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) })
            })
        };

        const codeContent = fs.readFileSync(path.join(__dirname, '../src/dverseClient.js'), 'utf8');
        vm.runInNewContext(codeContent, env.window);

        await env.window.dverse.signInWithGoogle();

        assert.ok(env.window.location.href.includes('https://d-verse.in/?dverse_return_to='), 'Redirects to D\'Verse portal');
        assert.ok(env.window.location.href.includes(encodeURIComponent('https://tunes.d-verse.in/')), 'Includes correct return URL');
        assert.ok(env.document.cookie.includes('dverse_auth_return_to'), 'Sets dverse_auth_return_to cookie');
    });

    await t.test('Tier 10: Session handoff from URL hash (#dverse_session=...) unpacks and initializes session', async () => {
        const env = createTestEnvironment();
        setupSandbox(env);

        const testSession = {
            access_token: 'portal_access_token_xyz',
            refresh_token: 'portal_refresh_token_xyz',
            user: { id: 'portal_user_789', email: 'portal@d-verse.in' }
        };

        // Helper to encode
        const str = JSON.stringify(testSession);
        const bytes = new TextEncoder().encode(str);
        let bin = '';
        bytes.forEach(b => bin += String.fromCharCode(b));
        const encoded = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

        let setSessionCalled = false;
        let replaceStateCalled = false;

        env.window.location = {
            origin: 'https://tunes.d-verse.in',
            pathname: '/',
            search: '',
            hash: `#dverse_session=${encoded}`,
            protocol: 'https:',
            hostname: 'tunes.d-verse.in',
            href: `https://tunes.d-verse.in/#dverse_session=${encoded}`
        };
        env.window.history = {
            replaceState: (state, title, url) => {
                replaceStateCalled = true;
                env.window.location.hash = url.includes('#') ? url.split('#')[1] : '';
            }
        };

        let loadCalled = false;
        env.window.cloudLibrary = {
            session: null,
            updateUI: () => {},
            load: async () => { loadCalled = true; }
        };

        env.window.supabase = {
            createClient: () => ({
                auth: {
                    getSession: async () => ({ data: { session: null }, error: null }),
                    setSession: async ({ access_token, refresh_token }) => {
                        setSessionCalled = true;
                        assert.strictEqual(access_token, 'portal_access_token_xyz');
                        assert.strictEqual(refresh_token, 'portal_refresh_token_xyz');
                        return { data: { session: testSession }, error: null };
                    },
                    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
                    signOut: async () => ({ error: null })
                },
                from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) })
            })
        };

        const codeContent = fs.readFileSync(path.join(__dirname, '../src/dverseClient.js'), 'utf8');
        vm.runInNewContext(codeContent, env.window);

        const session = await env.window.dverse.getSession();
        assert.ok(setSessionCalled, 'setSession called with handoff tokens');
        assert.ok(session, 'Session returned');
        assert.strictEqual(session.user.id, 'portal_user_789');
        assert.ok(replaceStateCalled, 'URL hash cleaned');
        assert.ok(loadCalled, 'cloudLibrary.load was called');
    });
});
