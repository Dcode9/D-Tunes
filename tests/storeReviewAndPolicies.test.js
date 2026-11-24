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

test('AI Feedback UX: Clean AI marks, Like/Dislike Supabase feedback modal, and AI-only song menu gating', () => {
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    const uiContent = fs.readFileSync(uiPath, 'utf8');
    const aiHubContent = fs.readFileSync(aiHubPath, 'utf8');
    const contextMenuContent = fs.readFileSync(contextMenuPath, 'utf8');

    // 1. Cluttered standalone Report AI Output buttons & modal are removed
    assert.ok(!indexContent.includes('id="ai-report-modal"'), 'index.html must not contain cluttered #ai-report-modal');
    assert.ok(!indexContent.includes('id="playlist-ai-report-btn"'), 'Playlist view must replace Report AI Playlist with Like/Dislike');
    assert.ok(!indexContent.includes('id="btn-report-search"'), 'Search view must not have standalone Report button');
    assert.ok(!aiHubContent.includes('Report AI Content'), 'Made For You must not have Report AI Content button');

    // 2. AI playlists & Made For You have AI mark + Like/Dislike connected to Supabase dtunes_feedback
    assert.ok(indexContent.includes('id="playlist-ai-feedback-bar"'), 'Playlist view must include #playlist-ai-feedback-bar');
    assert.ok(indexContent.includes('id="playlist-ai-like"'), 'Playlist view must include #playlist-ai-like');
    assert.ok(indexContent.includes('id="playlist-ai-dislike"'), 'Playlist view must include #playlist-ai-dislike');
    assert.ok(uiContent.includes('SUPABASE_FEEDBACK_ENDPOINT'), 'mixFeedbackManager must connect to Supabase dtunes_feedback');
    assert.ok(aiHubContent.includes("mixFeedbackManager.openFeedbackModal({ sentiment: 'like'"), 'Made For You must wire Like to mixFeedbackManager');

    // 3. Song context menu gates Don't recommend & AI feedback strictly to AI-generated tracks
    assert.ok(contextMenuContent.includes('const isAiSong = Boolean'), 'context-menu.js must gate AI options with isAiSong');
    assert.ok(contextMenuContent.includes("dislikeBtn.classList.toggle('hidden', !isAiSong)"), "Don't recommend must be hidden for non-AI songs");
    assert.ok(contextMenuContent.includes("reportAiBtn.classList.toggle('hidden', !isAiSong)"), 'AI feedback must be hidden for non-AI songs');
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

    // 4. Restricted Developer Access strictly for 9dhairy@gmail.com
    const statePath = path.join(ROOT, 'src', 'js', 'state.js');
    const stateContent = fs.readFileSync(statePath, 'utf8');
    assert.ok(stateContent.includes("AUTHORIZED_DEV_EMAIL = '9dhairy@gmail.com'"), 'Must strictly configure 9dhairy@gmail.com as authorized developer');
    assert.ok(stateContent.includes('isAuthorizedDev'), 'Must provide isAuthorizedDev verification');
});
