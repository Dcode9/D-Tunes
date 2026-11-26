const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('Mobile Mezzotint CSS: expanded player fixes Beta 1.4.5 DOM drift and ordering', () => {
    const css = read('src/css/styles.css');
    const ios = read('src/css/glass-ios.css');

    // Legacy nth-child(3) display:none rule that hid seekbar/prev/next must be gone
    assert.ok(
        !css.includes('body.mobile-player-open #player-card > div:nth-child(3)'),
        'Broken legacy nth-child(3) rule hiding #player-center-group must be removed'
    );

    // Collapsed mobile player must strictly hide desktop #player-card
    assert.match(
        css,
        /html\[data-ui-mode="mobile"\]\s+body:not\(\.mobile-player-open\)\s+#player-card\s*\{\s*display:\s*none\s*!important;/,
        'Collapsed mobile state must hide #player-card with !important'
    );
    assert.match(
        ios,
        /html\[data-os="ios"\]\[data-ui-mode="mobile"\]\s+body:not\(\.mobile-player-open\)\s+#player-card\s*\{\s*display:\s*none\s*!important;/,
        'iOS stylesheet must also hide #player-card when collapsed'
    );

    // Compact row must stack vertically in expanded mobile player so track meta stays on-screen
    assert.match(
        css,
        /html\[data-ui-mode="mobile"\]\s+body\.mobile-player-open\s+#info-island-compact-row\s*\{[^}]*flex-direction:\s*column\s*!important/s,
        'Expanded mobile player must stack #info-island-compact-row vertically'
    );

    // Expanded album art must be a rounded square (not a circle inside a square)
    assert.match(
        css,
        /html\[data-ui-mode="mobile"\]\s+body\.mobile-player-open\s+#album-art-wrapper\s+img[\s\S]*?border-radius:\s*26px\s*!important/,
        'Expanded mobile album art image must use 26px rounded-square corners'
    );

    // #player-card must use CSS Grid with order: 10 so controls stay pinned at the bottom on all tabs (including Lyrics)
    assert.match(
        css,
        /html\[data-ui-mode="mobile"\]\s+body\.mobile-player-open\s+#player-card\s*\{[^}]*display:\s*grid\s*!important/s,
        'Expanded mobile #player-card must use grid layout'
    );
    assert.match(
        css,
        /html\[data-ui-mode="mobile"\]\s+body\.mobile-player-open\s+#player-card\s*\{[^}]*order:\s*10\s*!important/s,
        'Expanded mobile #player-card must have order: 10 so it stays below Lyrics'
    );

    // Desktop sidebar shift must not run on mobile
    assert.match(
        css,
        /html\[data-ui-mode="desktop"\]\s+body\.queue-sidebar-active\s+\.home-signin-banner-btn/,
        'queue-sidebar-active translateX shift must be scoped to desktop'
    );
});

test('Mobile Mezzotint CSS: floating optical chrome, playlist cards, recent search pills & bottom sheet', () => {
    const css = read('src/css/styles.css');

    assert.match(
        css,
        /html\[data-ui-mode="mobile"\]\s+header\.glass-panel\s*\{[^}]*overflow:\s*hidden\s*!important/s,
        'Mobile header must clip backdrop-filter to prevent WebKit square blur bleed'
    );
    assert.match(
        css,
        /html\[data-ui-mode="mobile"\]\s+#mobile-nav\s*\{[^}]*border-radius:\s*9999px\s*!important[^}]*background:\s*var\(--mezzotint-bg\)\s*!important/s,
        'Mobile bottom nav must use floating Mezzotint pill dock'
    );
    assert.match(
        css,
        /html\[data-ui-mode="mobile"\]\s+#context-menu\s*\{[^}]*bottom:\s*calc\(10px\s*\+\s*env\(safe-area-inset-bottom\)\)\s*!important[^}]*z-index:\s*350\s*!important/s,
        'Mobile context menu must render as a bottom action sheet above the player'
    );
    assert.ok(css.includes('.pl-card {'), 'Redesigned Mezzotint playlist cards must be styled');
    assert.ok(css.includes('.recent-search-pill {'), 'Redesigned Mezzotint recent search pills must be styled');
});

test('Mobile JS & HTML: playlist cards, recent searches, lyrics tab sync, back buttons & SW cache bump', () => {
    const ui = read('src/js/ui.js');
    const search = read('src/js/search.js');
    const lyrics = read('src/js/lyrics.js');
    const cm = read('src/js/context-menu.js');
    const html = read('index.html');
    const sw = read('sw.js');

    assert.ok(ui.includes('pl-card pl-action-card pl-action-card--create'), 'ui.js must render redesigned Mezzotint playlist cards');
    assert.ok(search.includes('recent-search-pill'), 'search.js must render Mezzotint pill rows for recent searches');
    assert.ok(ui.includes('syncMobilePlayerTabs:'), 'ui.js must expose syncMobilePlayerTabs');
    assert.ok(ui.includes("if (isMobile && !document.body.classList.contains('mobile-player-open'))"), 'toggleSongDetails must open expanded player on mobile mini-player tap');
    assert.ok(ui.includes('ui.toggleMobilePlayer(willExpand);'), 'toggleFullscreenPlayer must delegate to toggleMobilePlayer on mobile');

    assert.ok(lyrics.includes("mobileTabLyrics.classList.toggle('lyrics-unavailable', !available)"), 'lyrics.js must toggle mobile lyrics tab availability');
    assert.ok(lyrics.includes('ui.syncMobilePlayerTabs()'), 'lyrics.js must resync mobile segmented tab count');

    assert.ok(cm.includes("document.body.classList.add('mobile-context-open')"), 'context-menu.js must activate mobile bottom sheet backdrop');

    assert.ok(html.includes('aria-label="Back to Library"'), 'Playlist view must expose a mobile-visible Back button');
    assert.ok(html.includes('aria-label="Go back"'), 'Album view must expose a mobile-visible Back button');
    assert.ok(html.includes('style="--seg-count:3;"'), 'Mobile player tabs must default to 3 visible tabs before lyrics load');
    assert.ok(sw.includes('dtunes-shell-v1.4.15-mobile-smooth-sheet'), 'Service worker shell cache version must be bumped');
});

test('Mobile Motion & Search Cleanup: sliding dock pill, FLIP player morph & clean search header', () => {
    const css = read('src/css/styles.css');
    const ui = read('src/js/ui.js');
    const html = read('index.html');

    assert.ok(html.includes('id="mobile-nav-indicator"'), 'Bottom dock must include sliding glass indicator element');
    assert.ok(css.includes('translate3d(calc(var(--nav-index, 0) * 100%), 0, 0)'), 'Bottom dock indicator must glide smoothly via --nav-index');
    assert.ok(ui.includes("nav.style.setProperty('--nav-index'"), 'setMobileNavActive must update --nav-index');

    assert.ok(ui.includes("footer.style.transform = 'translate3d(0, 100%, 0)'"), 'toggleMobilePlayer must use GPU-only translate3d sheet transition');
    assert.ok(css.includes('backdrop-filter: none !important;'), 'Expanded opaque mobile player sheet must disable backdrop-filter to stay 60/120fps on iOS');

    assert.ok(css.includes('html[data-ui-mode="mobile"] #search-view-header'), 'Redundant Search title and Report row must be hidden on mobile');
    assert.ok(html.includes('id="search-history-section"') && html.indexOf('id="btn-clear-search-history"') > html.indexOf('id="search-history-section"'), 'Clear History button must live in the Recent Searches header row');
});

test('Mobile Quick Search, Mezzotint Album View & Playlist Creator Redesign', () => {
    const css = read('src/css/styles.css');
    const html = read('index.html');
    const search = read('src/js/search.js');
    const ui = read('src/js/ui.js');

    assert.match(
        css,
        /html\[data-ui-mode="mobile"\]\s+body\.mobile-search-open\s+#search-shell\s*\{[^}]*overflow:\s*visible\s*!important/s,
        'Mobile search shell must set overflow: visible when open so quick search dropdown is not clipped'
    );
    assert.ok(search.includes('quick-search-all-btn'), 'Quick search must include a See all results action button');
    assert.ok(html.includes('class="album-hero-card'), 'Album detail view must use Mezzotint album-hero-card');
    assert.ok(ui.includes("document.getElementById('album-hero-ambient')"), 'openAlbum must sync ambient album backdrop');
    assert.ok(html.includes('mezzotint-modal-card') && html.includes('id="playlist-modal"'), 'Playlist creator modal must use Mezzotint modal card');
});
