const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('D-Tunes API v2: vercel.json contains api-v2 rewrites and headers', () => {
  const vercelPath = path.join(__dirname, '../vercel.json');
  const vercelContent = fs.readFileSync(vercelPath, 'utf8');
  const vercel = JSON.parse(vercelContent);

  const hasApiV2Rewrite = vercel.rewrites.some(r => r.source === '/api-v2/(.*)' && r.destination === '/api/v2.py');
  assert.ok(hasApiV2Rewrite, 'vercel.json must rewrite /api-v2/(.*) to /api/v2.py');

  const hasApiV2Header = vercel.headers.some(h => h.source === '/api-v2/(.*)');
  assert.ok(hasApiV2Header, 'vercel.json must define CORS and caching headers for /api-v2/(.*)');
});

test('D-Tunes API v2: Python backend file exists and has required routes and options', () => {
  const v2Path = path.join(__dirname, '../api/v2.py');
  assert.ok(fs.existsSync(v2Path), 'api/v2.py must exist');

  const content = fs.readFileSync(v2Path, 'utf8');
  assert.ok(content.includes('def search_sync'), 'api/v2.py must have search_sync');
  assert.ok(content.includes('def resolve_sync'), 'api/v2.py must have resolve_sync');
  assert.ok(content.includes('player_client'), 'api/v2.py must configure YouTube player_client');
  assert.ok(content.includes('/health'), 'api/v2.py must have /health endpoint');
  assert.ok(content.includes('/search'), 'api/v2.py must have /search endpoint');
  assert.ok(content.includes('/stream/{video_id}'), 'api/v2.py must have /stream/{video_id} endpoint');
  assert.ok(content.includes('/resolve/{video_id}'), 'api/v2.py must have /resolve/{video_id} endpoint');
  assert.ok(content.includes('prefix="/api-v2"'), 'api/v2.py must mount router with /api-v2 prefix');
});

test('D-Tunes API v2: requirements.txt specifies fastapi, httpx, yt-dlp, and pydantic', () => {
  const reqPath = path.join(__dirname, '../requirements.txt');
  assert.ok(fs.existsSync(reqPath), 'requirements.txt must exist');
  const reqContent = fs.readFileSync(reqPath, 'utf8');
  assert.ok(reqContent.includes('fastapi'), 'requirements.txt must include fastapi');
  assert.ok(reqContent.includes('yt-dlp'), 'requirements.txt must include yt-dlp');
  assert.ok(reqContent.includes('httpx'), 'requirements.txt must include httpx');
  assert.ok(reqContent.includes('pydantic'), 'requirements.txt must include pydantic');
});

test('D-Tunes API v2: src/js/api.js implements mediaAPI and aliases jiosaavnAPI', () => {
  const apiPath = path.join(__dirname, '../src/js/api.js');
  const apiContent = fs.readFileSync(apiPath, 'utf8');

  assert.ok(apiContent.includes('/api-v2'), 'api.js must target /api-v2 base');
  assert.ok(apiContent.includes('window.mediaAPI = mediaAPI'), 'api.js must export mediaAPI');
  assert.ok(apiContent.includes('window.jiosaavnAPI = mediaAPI'), 'api.js must alias jiosaavnAPI for backward compatibility');
  assert.ok(apiContent.includes("source: 'youtube'"), "api.js normalizeTrack must set source to 'youtube'");
  assert.ok(apiContent.includes('isStreamingUrl'), 'api.js must expose isStreamingUrl');
});

test('D-Tunes API v2: server.js proxies /api-v2 in local mode', () => {
  const serverPath = path.join(__dirname, '../server.js');
  const serverContent = fs.readFileSync(serverPath, 'utf8');

  assert.ok(serverContent.includes("url.pathname.startsWith('/api-v2')"), 'server.js must detect /api-v2 requests');
  assert.ok(serverContent.includes('proxyApiV2'), 'server.js must define proxyApiV2');
});
