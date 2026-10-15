const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const indexPath = path.join(ROOT, 'index.html');
const serverPath = path.join(ROOT, 'server.js');
const spotifyPath = path.join(ROOT, 'src', 'js', 'spotify.js');
const uiPath = path.join(ROOT, 'src', 'js', 'ui.js');
const aiHubPath = path.join(ROOT, 'src', 'js', 'ai-hub.js');
const contextMenuPath = path.join(ROOT, 'src', 'js', 'context-menu.js');

test('Policy 10.1.2.10: Spotify Playlist URL Parsing and Guard against URL Fallback', async (t) => {
    const spotifyContent = fs.readFileSync(spotifyPath, 'utf8');
    const serverContent = fs.readFileSync(serverPath, 'utf8');

    // 1. Spotify embed server endpoint exists in server.js
    assert.ok(serverContent.includes('/api/music/spotify-playlist'), 'server.js must expose /api/music/spotify-playlist');
    assert.ok(serverContent.includes('open.spotify.com/embed'), 'server.js must fetch Spotify embed URL');
    assert.ok(serverContent.includes('__NEXT_DATA__'), 'server.js must parse __NEXT_DATA__ payload');
    assert.ok(spotifyContent.includes('__NEXT_DATA__'), 'spotify.js must parse __NEXT_DATA__ payload from embed HTML');

    // 2. extractTracksFromInput strictly differentiates Spotify URLs from plain song text
    assert.ok(spotifyContent.includes('isSpotifyUrl: true'), 'extractTracksFromInput must return isSpotifyUrl: true for spotify links');
    assert.ok(spotifyContent.includes('window.electronAPI.fetchSpotifyEmbed'), 'Must use Electron net.fetch IPC if available');
    assert.ok(spotifyContent.includes('/api/music/spotify-playlist?url='), 'Must fallback to server-side proxy for web');

    // 3. Fallback guard: A Spotify URL must NEVER be treated as a single not-found song title
    assert.ok(spotifyContent.includes('extracted.isSpotifyUrl'), 'Must inspect extracted.isSpotifyUrl before fallback');
    assert.ok(spotifyContent.includes('Could not extract tracks from this Spotify link'), 'Must show clear error if playlist cannot be parsed');
});

test('Policy 11.16: Live Generative AI Content Report Modal and UI Entry Points', (t) => {
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    const uiContent = fs.readFileSync(uiPath, 'utf8');
    const aiHubContent = fs.readFileSync(aiHubPath, 'utf8');
    const contextMenuContent = fs.readFileSync(contextMenuPath, 'utf8');

    // 1. ai-report-modal structure in index.html
    assert.ok(indexContent.includes('id="ai-report-modal"'), 'index.html must include #ai-report-modal');
    assert.ok(indexContent.includes('Policy 11.16'), 'Modal must prominently cite Policy 11.16');
    assert.ok(indexContent.includes('id="ai-report-feature-badge"'), 'Modal must have feature badge');
    assert.ok(indexContent.includes('id="ai-report-issue-type"'), 'Modal must have issue category selector');
    assert.ok(indexContent.includes('id="ai-report-details"'), 'Modal must have details textarea');
    assert.ok(indexContent.includes('id="btn-submit-ai-report"'), 'Modal must have submit button');

    // 2. aiReportManager logic in ui.js
    assert.ok(uiContent.includes('aiReportManager = {'), 'ui.js must define aiReportManager');
    assert.ok(uiContent.includes('openReportModal:'), 'aiReportManager must implement openReportModal');
    assert.ok(uiContent.includes('closeReportModal:'), 'aiReportManager must implement closeReportModal');
    assert.ok(uiContent.includes('submitReport:'), 'aiReportManager must implement submitReport');
    assert.ok(uiContent.includes('window.aiReportManager = aiReportManager'), 'Must expose window.aiReportManager');
    assert.ok(uiContent.includes('category: \'ai_safety\''), 'Reports must be submitted with category ai_safety');

    // 3. AI reporting entry points across all generative features:
    // a) Vibe Mix Modal footer
    assert.ok(indexContent.includes('Report AI Output'), 'Vibe Mix modal must include Report AI Output button');
    // b) Made For You AI Hub Header and Shelf rows
    assert.ok(aiHubContent.includes("feature: 'Made For You (Daily Recommendations)'"), 'AI Hub header must have report button');
    assert.ok(aiHubContent.includes("feature: 'Daily AI Mix'"), 'AI Hub shelves must have report button');
    // c) Search View Header
    assert.ok(indexContent.includes('id="btn-report-search"'), 'Search view must have report button');
    // d) Playlist View for AI-generated playlists
    assert.ok(indexContent.includes('id="playlist-ai-report-btn"'), 'Playlist view must have #playlist-ai-report-btn');
    assert.ok(uiContent.includes("feature: 'AI Generated Mix / Playlist'"), 'openGeneratedPlaylist must wire report button');
    // e) Profile Dropdown
    assert.ok(indexContent.includes('Report AI Output'), 'Profile dropdown must include Report AI Output option');
    // f) Settings View
    assert.ok(indexContent.includes('Report Inappropriate AI Content'), 'Settings view must have report button');
    // g) Context Menu
    assert.ok(indexContent.includes('id="cm-report-ai"'), 'Context menu must include #cm-report-ai option');
    assert.ok(contextMenuContent.includes('cmReportAi.onclick'), 'context-menu.js must handle cmReportAi click');
});

test('Reviews & Feedback: Dedicated View, Supabase Integration, and Filters', (t) => {
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    const uiContent = fs.readFileSync(uiPath, 'utf8');

    // 1. View layout and metrics in index.html
    assert.ok(indexContent.includes('id="view-reviews"'), 'index.html must include #view-reviews view container');
    assert.ok(indexContent.includes('id="reviews-avg-rating"'), 'Must have #reviews-avg-rating metric');
    assert.ok(indexContent.includes('id="reviews-total-count"'), 'Must have #reviews-total-count metric');
    assert.ok(indexContent.includes('id="reviews-filter-tabs"'), 'Must have #reviews-filter-tabs container');
    assert.ok(indexContent.includes('id="reviews-list-container"'), 'Must have #reviews-list-container for cards');
    assert.ok(indexContent.includes('id="review-submit-modal"'), 'Must have #review-submit-modal');
    assert.ok(indexContent.includes('id="review-star-selector"'), 'Must have interactive star rating selector');

    // 2. reviewsManager logic in ui.js
    assert.ok(uiContent.includes('reviewsManager = {'), 'ui.js must define reviewsManager');
    assert.ok(uiContent.includes('fetchReviews:'), 'reviewsManager must implement fetchReviews');
    assert.ok(uiContent.includes('setCategoryFilter:'), 'reviewsManager must implement setCategoryFilter');
    assert.ok(uiContent.includes('render:'), 'reviewsManager must implement render');
    assert.ok(uiContent.includes('openSubmitModal:'), 'reviewsManager must implement openSubmitModal');
    assert.ok(uiContent.includes('submitReview:'), 'reviewsManager must implement submitReview');
    assert.ok(uiContent.includes('window.reviewsManager = reviewsManager'), 'Must expose window.reviewsManager');

    // 3. Navigation integration in ui.js
    assert.ok(uiContent.includes("vReviews && !vReviews.classList.contains('hidden')"), 'getCurrentView must support reviews view');
    assert.ok(uiContent.includes("view === 'reviews' && window.reviewsManager"), 'switchView must render reviews when view === reviews');
});
