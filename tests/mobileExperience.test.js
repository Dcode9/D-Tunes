const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('Mobile Mezzotint CSS: expanded player fixes Beta 1.4.5 DOM drift', () => {
    const css = read('src/css/styles.css');

    // Compact row must stack vertically in expanded mobile player so track meta stays on-screen
    assert.match(
        css,
        /html\[data-ui-mode="mobile"\]\s+body\.mobile-player-open\s+#info-island-compact-row\s*\{[^}]*flex-direction:\s*column\s*!important/s,
        'Expanded mobile player must stack #info-island-compact-row vertically'
    );

    // #player-card must use CSS Grid with display:contents on desktop wrapper groups
    assert.match(
        css,
        /html\[data-ui-mode="mobile"\]\s+body\.mobile-player-open\s+#player-card\s*\{[^}]*display:\s*grid\s*!important/s,
        'Expanded mobile #player-card must use grid layout'
    );
    assert.match(
        css,
        /#player-left-group,\s*[\r\n]+html\[data-ui-mode="mobile"\]\s+body\.mobile-player-open\s+#player-left-group\s*>\s*div,\s*[\r\n]+html\[data-ui-mode="mobile"\]\s+body\.mobile-player-open\s+#player-center-group\s*\{[^}]*display:\s*contents\s*!important/s,
        'Mobile expanded player must flatten desktop transport groups via display:contents'
    );
    assert.match(
        css,
        /html\[data-ui-mode="mobile"\]\s+body\.mobile-player-open\s+#seek-bar-container\s*\{[^}]*grid-column:\s*1\s*\/\s*-1\s*!important/s,
        'Mobile expanded seekbar must span full width in row 1'
    );

    // Desktop sidebar shift must not run on mobile
    assert.match(
        css,
        /html\[data-ui-mode="desktop"\]\s+body\.queue-sidebar-active\s+\.home-signin-banner-btn/,
        'queue-sidebar-active translateX shift must be scoped to desktop'
    );
});

test('Mobile Mezzotint CSS: floating optical chrome, touch cards, bottom sheet & modal layering', () => {
    const css = read('src/css/styles.css');

    assert.match(
        css,
        /html\[data-ui-mode="mobile"\]\s+header\.glass-panel\s*\{[^}]*border-radius:\s*9999px\s*!important[^}]*background:\s*var\(--mezzotint-bg\)\s*!important/s,
        'Mobile header must use floating Mezzotint pill styling'
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
    assert.match(
        css,
        /html\[data-ui-mode="mobile"\]\s+\.sc-meta\s*\{[^}]*padding:\s*0\.62rem\s+2\.35rem/s,
        'Mobile song cards must reserve right padding for the three-dot menu button'
    );
});

test('Mobile JS & HTML: lyrics tab sync, song details guard, back buttons & SW cache bump', () => {
    const ui = read('src/js/ui.js');
    const lyrics = read('src/js/lyrics.js');
    const cm = read('src/js/context-menu.js');
    const html = read('index.html');
    const sw = read('sw.js');

    assert.ok(ui.includes('syncMobilePlayerTabs:'), 'ui.js must expose syncMobilePlayerTabs');
    assert.ok(ui.includes("if (isMobile && !document.body.classList.contains('mobile-player-open'))"), 'toggleSongDetails must open expanded player on mobile mini-player tap');
    assert.ok(ui.includes('ui.toggleMobilePlayer(willExpand);'), 'toggleFullscreenPlayer must delegate to toggleMobilePlayer on mobile');

    assert.ok(lyrics.includes("mobileTabLyrics.classList.toggle('lyrics-unavailable', !available)"), 'lyrics.js must toggle mobile lyrics tab availability');
    assert.ok(lyrics.includes('ui.syncMobilePlayerTabs()'), 'lyrics.js must resync mobile segmented tab count');

    assert.ok(cm.includes("document.body.classList.add('mobile-context-open')"), 'context-menu.js must activate mobile bottom sheet backdrop');

    assert.ok(html.includes('aria-label="Back to Library"'), 'Playlist view must expose a mobile-visible Back button');
    assert.ok(html.includes('aria-label="Go back"'), 'Album view must expose a mobile-visible Back button');
    assert.ok(html.includes('style="--seg-count:3;"'), 'Mobile player tabs must default to 3 visible tabs before lyrics load');
    assert.ok(sw.includes('dtunes-shell-v1.4.11-mobile-mezzotint'), 'Service worker shell cache version must be bumped');
});
