const { app, BrowserWindow, ipcMain, shell, globalShortcut, Menu, session, protocol, safeStorage, nativeImage, net } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const url = require('url');
const crypto = require('crypto');
const winVolume = require('./winVolume');

const TARGET_URL = 'https://tunes.d-verse.in';
const MODERN_CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const AUTH_PORT = 49200;

let mainWindow = null;
let isQuitting = false;
let authServer = null;
let pendingAuthUrl = null;
let lastHandledCode = null;
let lastHandledToken = null;

// Modern Chrome User-Agent
app.userAgentFallback = MODERN_CHROME_UA;

// Enables Windows taskbar integration (thumbnail toolbar buttons, progress, jump list)
app.setAppUserModelId('DhairyaShah.DTunes');

// Internal scheme used to stream decrypted offline downloads. It is only known
// to this app: no OS handler exists, so files cannot be played elsewhere.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'dtunes-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true,
      corsEnabled: true
    }
  }
]);

// Register custom protocol for deep-linking
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('dtunes', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  if (!app.isDefaultProtocolClient('dtunes')) {
    app.setAsDefaultProtocolClient('dtunes');
  }
}

// Check if launched via deep-link argument
const initialDeepLink = process.argv && process.argv.find(arg => arg && arg.includes('dtunes://'));
if (initialDeepLink) {
  pendingAuthUrl = initialDeepLink.replace(/["']/g, '');
}

// Hardware media keys & autoplay
app.commandLine.appendSwitch('enable-features', 'MediaSessionService,HardwareMediaKeyHandling');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// Single-Instance Lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    bringWindowToFront();
    // Check for deep link auth URL in commandLine
    const deepLink = commandLine && commandLine.find(arg => arg && arg.includes('dtunes://'));
    if (deepLink) {
      handleDeepLinkAuth(deepLink.replace(/["']/g, ''));
    }
  });
}

// macOS / system protocol handler
app.on('open-url', (event, urlStr) => {
  event.preventDefault();
  bringWindowToFront();
  if (urlStr && urlStr.includes('dtunes://')) {
    if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isLoading()) {
      handleDeepLinkAuth(urlStr.replace(/["']/g, ''));
    } else {
      pendingAuthUrl = urlStr.replace(/["']/g, '');
    }
  }
});

function bringWindowToFront() {
  if (!mainWindow) return;
  try {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.setAlwaysOnTop(true);
    mainWindow.show();
    mainWindow.focus();
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setAlwaysOnTop(false);
      }
    }, 600);
  } catch (e) {
    console.warn('[Window] bringWindowToFront error:', e);
  }
}

function handleDeepLinkAuth(deepLinkUrl) {
  try {
    console.log('[DeepLink] Processing deep link URL:', deepLinkUrl);
    const raw = deepLinkUrl.replace('dtunes://', '');
    const [pathPart, queryOrHash] = raw.split(/[?#]/);
    const fallbackParams = new URLSearchParams(queryOrHash || pathPart);

    const questionIndex = raw.indexOf('?');
    const hashIndex = raw.indexOf('#');
    let queryParams = new URLSearchParams();
    let hashParams = new URLSearchParams();

    if (questionIndex !== -1) {
      const qStr = hashIndex !== -1 && hashIndex > questionIndex
        ? raw.substring(questionIndex + 1, hashIndex)
        : raw.substring(questionIndex + 1);
      queryParams = new URLSearchParams(qStr);
    }
    if (hashIndex !== -1) {
      const hStr = questionIndex !== -1 && questionIndex > hashIndex
        ? raw.substring(hashIndex + 1, questionIndex)
        : raw.substring(hashIndex + 1);
      hashParams = new URLSearchParams(hStr);
    }

    const accessToken = hashParams.get('access_token') || queryParams.get('access_token') || fallbackParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token') || queryParams.get('refresh_token') || fallbackParams.get('refresh_token');
    const code = queryParams.get('code') || hashParams.get('code') || fallbackParams.get('code');

    if (accessToken && refreshToken) {
      applySessionToWindow({ access_token: accessToken, refresh_token: refreshToken });
    } else if (code) {
      applyCodeToWindow(code);
    } else {
      bringWindowToFront();
    }
  } catch (err) {
    console.warn('[DeepLink] Failed to parse deep link:', err);
  }
}

function applyCodeToWindow(code) {
  if (!mainWindow || !mainWindow.webContents || !code) return;
  if (lastHandledCode === code) {
    console.log('[Auth] Code already handled, focusing window...');
    bringWindowToFront();
    return;
  }
  lastHandledCode = code;
  console.log('[Auth] Applying auth code to mainWindow...');
  const script = `
    (async () => {
      try {
        let attempts = 0;
        while ((!window.dverse || !window.dverse.supabase) && attempts < 50) {
          await new Promise(r => setTimeout(r, 100));
          attempts++;
        }
        if (!window.dverse || !window.dverse.supabase) {
          console.warn('[Auth] Supabase client not ready in mainWindow after waiting');
          return;
        }

        console.log('[Auth] Exchanging code for session in renderer...');
        let { data: resData, error: resError } = await window.dverse.supabase.auth.exchangeCodeForSession(${JSON.stringify(code)});
        if (resError) {
          console.error('[Auth] Code exchange error:', resError);
          const { data: curSession } = await window.dverse.supabase.auth.getSession();
          if (curSession?.session) {
            resData = curSession;
          } else {
            return;
          }
        }

        if (resData?.session) {
          console.log('[Auth] Code exchange succeeded, syncing library and profile...');
          const session = resData.session;
          try {
            localStorage.setItem('dverse_session_cache', JSON.stringify({
              access_token: session.access_token,
              refresh_token: session.refresh_token
            }));
            const user = session.user;
            if (user) {
              const meta = user.user_metadata || user.raw_user_meta_data || {};
              const avatar = meta.avatar_url || meta.picture || (user.identities && user.identities[0]?.identity_data?.avatar_url);
              if (avatar) {
                localStorage.setItem('avatarUrl', avatar);
                if (window.state) window.state.avatarUrl = avatar;
              }
              const name = meta.full_name || meta.name || user.email?.split('@')[0];
              if (name && window.state) window.state.userName = name;
            }
          } catch (e) { }

          let clAttempts = 0;
          while (!window.cloudLibrary && clAttempts < 30) {
            await new Promise(r => setTimeout(r, 100));
            clAttempts++;
          }

          if (window.cloudLibrary) {
            window.cloudLibrary.session = session;
            window.cloudLibrary.updateUI();
            await window.cloudLibrary.load();
          }

          if (window.ui && typeof window.ui.updateProfileUI === 'function') {
            window.ui.updateProfileUI();
          }

          if (window.ui && typeof window.ui.showToast === 'function') {
            window.ui.showToast('Signed in successfully! Cloud library synced.', 'success');
          }
        }
      } catch (e) {
        console.error('[Auth] Code exchange exception:', e);
      }
    })();
  `;
  mainWindow.webContents.executeJavaScript(script);
  bringWindowToFront();
}

function applySessionToWindow(sessionData) {
  if (!mainWindow || !mainWindow.webContents || !sessionData?.access_token) return;
  if (lastHandledToken === sessionData.access_token) {
    console.log('[Auth] Session token already handled, focusing window...');
    bringWindowToFront();
    return;
  }
  lastHandledToken = sessionData.access_token;
  console.log('[Auth] Applying session to mainWindow...');
  const script = `
    (async () => {
      try {
        try {
          localStorage.setItem('dverse_session_cache', JSON.stringify({
            access_token: ${JSON.stringify(sessionData.access_token)},
            refresh_token: ${JSON.stringify(sessionData.refresh_token || '')}
          }));
        } catch (e) { }

        let attempts = 0;
        while ((!window.dverse || !window.dverse.supabase) && attempts < 50) {
          await new Promise(r => setTimeout(r, 100));
          attempts++;
        }

        if (window.dverse && window.dverse.supabase) {
          const { data: resData, error: resError } = await window.dverse.supabase.auth.setSession({
            access_token: ${JSON.stringify(sessionData.access_token)},
            refresh_token: ${JSON.stringify(sessionData.refresh_token || '')}
          });
          if (resError) {
            console.error('[Auth] Set session error:', resError);
          } else {
            console.log('[Auth] Set session succeeded! Syncing library and profile...');
            const session = resData?.session;
            if (session?.user) {
              try {
                const meta = session.user.user_metadata || session.user.raw_user_meta_data || {};
                const avatar = meta.avatar_url || meta.picture || (session.user.identities && session.user.identities[0]?.identity_data?.avatar_url);
                if (avatar) {
                  localStorage.setItem('avatarUrl', avatar);
                  if (window.state) window.state.avatarUrl = avatar;
                }
                const name = meta.full_name || meta.name || session.user.email?.split('@')[0];
                if (name && window.state) window.state.userName = name;
              } catch (e) { }
            }

            let clAttempts = 0;
            while (!window.cloudLibrary && clAttempts < 30) {
              await new Promise(r => setTimeout(r, 100));
              clAttempts++;
            }

            if (window.cloudLibrary) {
              window.cloudLibrary.session = session;
              window.cloudLibrary.updateUI();
              await window.cloudLibrary.load();
            }

            if (window.ui && typeof window.ui.updateProfileUI === 'function') {
              window.ui.updateProfileUI();
            }

            if (window.ui && typeof window.ui.showToast === 'function') {
              window.ui.showToast('Signed in successfully! Cloud library synced.', 'success');
            }
            return;
          }
        }

        const handoff = ${JSON.stringify(sessionData)};
        const encoded = btoa(JSON.stringify(handoff)).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
        window.location.href = window.location.origin + window.location.pathname + '#dverse_session=' + encoded;
        window.location.reload();
      } catch (e) {
        console.error('[Auth] Session injection failed:', e);
      }
    })();
  `;
  mainWindow.webContents.executeJavaScript(script);
  bringWindowToFront();
}

function startAuthLoopbackServer() {
  if (authServer) return;

  authServer = http.createServer((req, res) => {
    // CORS headers and Private Network Access headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = url.parse(req.url, true);

    if (parsedUrl.pathname === '/callback') {
      const queryCode = parsedUrl.query?.code;
      const queryAccessToken = parsedUrl.query?.access_token;
      const queryRefreshToken = parsedUrl.query?.refresh_token;

      if (queryAccessToken && queryRefreshToken) {
        console.log('[Auth Server] Captured session tokens directly from /callback query');
        applySessionToWindow({ access_token: queryAccessToken, refresh_token: queryRefreshToken });
      } else if (queryCode) {
        console.log('[Auth Server] Captured auth code directly from /callback query');
        applyCodeToWindow(queryCode);
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>D'Tunes - Sign In Successful</title>
          <style>
            body {
              background: #09090b;
              color: #f4f4f5;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
              text-align: center;
            }
            .card {
              background: rgba(24, 24, 27, 0.85);
              border: 1px solid rgba(255, 255, 255, 0.12);
              padding: 2.5rem 3rem;
              border-radius: 1.5rem;
              box-shadow: 0 20px 40px rgba(0,0,0,0.5);
              max-width: 380px;
            }
            .check {
              width: 56px;
              height: 56px;
              border-radius: 50%;
              background: rgba(34, 211, 238, 0.15);
              color: #22d3ee;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              font-size: 28px;
              margin-bottom: 1.25rem;
            }
            h1 { font-size: 1.45rem; margin: 0 0 0.5rem; font-weight: 700; color: #fff; }
            p { color: #a1a1aa; font-size: 0.95rem; margin: 0 0 1.5rem; line-height: 1.4; }
            .btn {
              display: inline-block;
              background: #22d3ee;
              color: #000;
              font-weight: 700;
              font-size: 0.9rem;
              padding: 0.65rem 1.4rem;
              border-radius: 9999px;
              text-decoration: none;
              box-shadow: 0 4px 14px rgba(34, 211, 238, 0.35);
              transition: transform 0.2s, background 0.2s;
            }
            .btn:hover {
              background: #67e8f9;
              transform: scale(1.04);
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="check">✓</div>
            <h1>Signed In Successfully</h1>
            <p id="status-msg">Redirecting you back to the D'Tunes app...</p>
            <a id="btn-open-app" href="dtunes://auth" class="btn">Open D'Tunes</a>
          </div>
          <script>
            const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
            const searchParams = new URLSearchParams(window.location.search.replace(/^\?/, ''));
            
            const payload = {
              access_token: hashParams.get('access_token') || searchParams.get('access_token'),
              refresh_token: hashParams.get('refresh_token') || searchParams.get('refresh_token'),
              expires_in: hashParams.get('expires_in') || searchParams.get('expires_in'),
              token_type: hashParams.get('token_type') || searchParams.get('token_type'),
              code: searchParams.get('code') || hashParams.get('code')
            };

            const deepLinkUrl = 'dtunes://auth' + window.location.search + (window.location.hash || '');
            const openBtn = document.getElementById('btn-open-app');
            if (openBtn) openBtn.href = deepLinkUrl;

            fetch('/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            }).then(() => {
              window.location.href = deepLinkUrl;
              const status = document.getElementById('status-msg');
              if (status) status.textContent = "You can close this tab now.";
              setTimeout(() => { window.close(); }, 1500);
            }).catch(() => {
              window.location.href = deepLinkUrl;
              setTimeout(() => { window.close(); }, 1500);
            });
          </script>
        </body>
        </html>
      `);
      return;
    }

    if (parsedUrl.pathname === '/token' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const data = JSON.parse(body || '{}');
          if (data.access_token && data.refresh_token) {
            applySessionToWindow(data);
          } else if (data.code) {
            applyCodeToWindow(data.code);
          }

          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Private-Network': 'true'
          });
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(400, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Private-Network': 'true'
          });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  authServer.listen(AUTH_PORT, '127.0.0.1', () => {
    console.log(`[Auth Server] Listening on http://127.0.0.1:${AUTH_PORT}/callback`);
  });

  authServer.on('error', (err) => {
    console.warn('[Auth Server] Error:', err.message);
  });
}

function handleExternalGoogleAuth(customUrl) {
  const loopbackCallback = `http://127.0.0.1:${AUTH_PORT}/callback`;
  let oauthUrl = customUrl;
  if (oauthUrl) {
    try {
      const u = new URL(oauthUrl);
      if (u.searchParams.has('redirect_to')) {
        u.searchParams.set('redirect_to', loopbackCallback);
      }
      if (u.searchParams.has('redirect_url')) {
        u.searchParams.set('redirect_url', loopbackCallback);
      }
      oauthUrl = u.toString();
    } catch (e) {
      console.warn('[Auth] Error adjusting redirect in customUrl:', e);
    }
  } else {
    oauthUrl = `https://gmwieijbrrztukqpfwkg.supabase.co/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(loopbackCallback)}`;
  }
  console.log('[Auth] Opening native system browser for secure Google OAuth:', oauthUrl);
  shell.openExternal(oauthUrl);
}

// ============================================================
// OFFLINE LIBRARY (AES-256-GCM, key protected by Windows DPAPI)
// ============================================================
const OFFLINE_DIR = path.join(app.getPath('userData'), 'offline_media');
const OFFLINE_INDEX = path.join(app.getPath('userData'), 'offline_index.json');
const OFFLINE_KEY_FILE = path.join(app.getPath('userData'), 'offline.key');
const OFFLINE_MAGIC = Buffer.from('DTUNE1');
let offlineKeyCache = null;

function getOfflineKey() {
  if (offlineKeyCache) return offlineKeyCache;
  try {
    if (fs.existsSync(OFFLINE_KEY_FILE)) {
      const stored = fs.readFileSync(OFFLINE_KEY_FILE);
      const hex = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(stored) : stored.toString('utf8');
      offlineKeyCache = Buffer.from(hex, 'hex');
      if (offlineKeyCache.length === 32) return offlineKeyCache;
    }
    const key = crypto.randomBytes(32);
    const hex = key.toString('hex');
    const payload = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(hex) : Buffer.from(hex, 'utf8');
    fs.mkdirSync(path.dirname(OFFLINE_KEY_FILE), { recursive: true });
    fs.writeFileSync(OFFLINE_KEY_FILE, payload, { mode: 0o600 });
    offlineKeyCache = key;
    return key;
  } catch (err) {
    console.warn('[Offline] Key unavailable, using ephemeral key:', err.message);
    offlineKeyCache = crypto.randomBytes(32);
    return offlineKeyCache;
  }
}

function encryptBuffer(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getOfflineKey(), iv);
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([OFFLINE_MAGIC, iv, cipher.getAuthTag(), enc]);
}

function decryptBuffer(payload) {
  if (payload.length < 33 || !payload.slice(0, 6).equals(OFFLINE_MAGIC)) {
    throw new Error('Not a D-Tunes offline file');
  }
  const iv = payload.slice(6, 18);
  const tag = payload.slice(18, 34);
  const decipher = crypto.createDecipheriv('aes-256-gcm', getOfflineKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(payload.slice(34)), decipher.final()]);
}

function readOfflineIndex() {
  try { return JSON.parse(fs.readFileSync(OFFLINE_INDEX, 'utf8')) || {}; } catch (err) { return {}; }
}

function writeOfflineIndex(index) {
  fs.mkdirSync(path.dirname(OFFLINE_INDEX), { recursive: true });
  fs.writeFileSync(OFFLINE_INDEX, JSON.stringify(index, null, 2));
}

function offlineFileName(id) {
  return `${String(id).replace(/[^a-zA-Z0-9_-]/g, '_')}.dtune`;
}

async function handleDownloadTrack(data = {}) {
  const trackId = String(data.id || data.trackId || '').trim();
  const streamUrl = data.url || data.streamUrl || '';
  if (!trackId) return { success: false, error: 'Missing track id' };
  if (!streamUrl) return { success: false, error: 'Missing stream URL' };
  try {
    const response = await net.fetch(streamUrl, {
      headers: {
        'User-Agent': MODERN_CHROME_UA,
        'Accept': '*/*',
        'Referer': 'https://www.jiosaavn.com/'
      }
    });
    if (!response.ok) return { success: false, error: `HTTP ${response.status}` };
    const plain = Buffer.from(await response.arrayBuffer());
    if (!plain.length) return { success: false, error: 'Empty audio data' };

    fs.mkdirSync(OFFLINE_DIR, { recursive: true });
    const file = offlineFileName(trackId);
    fs.writeFileSync(path.join(OFFLINE_DIR, file), encryptBuffer(plain));

    let artFile = null;
    const imgUrl = data.img || data.image;
    if (imgUrl && /^https?:\/\//i.test(imgUrl)) {
      try {
        const artResp = await net.fetch(imgUrl, {
          headers: { 'User-Agent': MODERN_CHROME_UA, 'Accept': 'image/*' }
        });
        if (artResp.ok) {
          const artBuf = Buffer.from(await artResp.arrayBuffer());
          if (artBuf.length > 0) {
            artFile = `${String(trackId).replace(/[^a-zA-Z0-9_-]/g, '_')}.art`;
            fs.writeFileSync(path.join(OFFLINE_DIR, artFile), artBuf);
          }
        }
      } catch (artErr) {
        console.warn('[Offline] Could not cache track artwork:', artErr.message);
      }
    }

    const index = readOfflineIndex();
    index[trackId] = {
      id: trackId,
      name: data.name || data.title || 'Unknown Track',
      artist: data.artist || '',
      album: data.album || '',
      img: artFile ? `dtunes-media://art/${trackId}` : (data.img || data.image || ''),
      artFile: artFile || undefined,
      duration: Number(data.duration) || 0,
      file,
      size: plain.length,
      downloadedAt: Date.now()
    };
    writeOfflineIndex(index);
    console.log(`[Offline] Encrypted "${index[trackId].name}" (${(plain.length / 1048576).toFixed(2)} MB)`);
    return { success: true, id: trackId, name: index[trackId].name, size: plain.length };
  } catch (err) {
    console.error('[Offline] Download failed:', err);
    return { success: false, error: err.message };
  }
}

function registerOfflineProtocol() {
  protocol.handle('dtunes-media', async (request) => {
    try {
      const reqUrl = new URL(request.url);
      const isArt = reqUrl.hostname === 'art' || reqUrl.pathname.startsWith('/art/');
      if (isArt) {
        const trackId = reqUrl.hostname === 'art'
          ? decodeURIComponent(reqUrl.pathname.replace(/^\/+/, ''))
          : decodeURIComponent(reqUrl.pathname.replace(/^\/art\//, ''));
        const entry = readOfflineIndex()[trackId];
        if (entry && entry.artFile) {
          const artPath = path.join(OFFLINE_DIR, entry.artFile);
          if (fs.existsSync(artPath)) {
            const artData = fs.readFileSync(artPath);
            return new Response(artData, {
              status: 200,
              headers: {
                'Content-Type': 'image/jpeg',
                'Cache-Control': 'public, max-age=31536000',
                'Access-Control-Allow-Origin': '*'
              }
            });
          }
        }
        const fallbackPath = path.join(__dirname, 'assets', 'icon.png');
        if (fs.existsSync(fallbackPath)) {
          return new Response(fs.readFileSync(fallbackPath), {
            status: 200,
            headers: { 'Content-Type': 'image/png', 'Access-Control-Allow-Origin': '*' }
          });
        }
        return new Response('Not found', { status: 404 });
      }

      const id = reqUrl.hostname === 'track'
        ? decodeURIComponent(reqUrl.pathname.replace(/^\/+/, ''))
        : decodeURIComponent(reqUrl.pathname.replace(/^\/track\//, '')) || decodeURIComponent(reqUrl.hostname);
      const entry = readOfflineIndex()[id];
      if (!entry) return new Response('Not found', { status: 404 });
      const filePath = path.join(OFFLINE_DIR, entry.file);
      if (!fs.existsSync(filePath)) return new Response('Missing media', { status: 404 });

      const audio = decryptBuffer(fs.readFileSync(filePath));
      const total = audio.length;
      const headers = {
        'Content-Type': 'audio/mpeg',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*'
      };

      const rangeHeader = request.headers.get('range');
      if (rangeHeader) {
        const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
        if (match) {
          let start = match[1] ? parseInt(match[1], 10) : 0;
          let end = match[2] ? parseInt(match[2], 10) : total - 1;
          if (!Number.isFinite(start)) start = 0;
          if (!Number.isFinite(end) || end >= total) end = total - 1;
          if (start > end) { start = 0; end = total - 1; }
          const slice = audio.slice(start, end + 1);
          headers['Content-Range'] = `bytes ${start}-${end}/${total}`;
          headers['Content-Length'] = String(slice.length);
          return new Response(slice, { status: 206, headers });
        }
      }

      headers['Content-Length'] = String(total);
      return new Response(audio, { status: 200, headers });
    } catch (err) {
      console.error('[Offline] Protocol error:', err);
      return new Response('Error', { status: 500 });
    }
  });
}

// ============================================================
// WINDOWS TASKBAR (progress + thumbnail toolbar buttons)
// ============================================================
let lastMediaState = { playing: false, position: 0, duration: 0, hasTrack: false, shuffle: false, repeat: 0 };
const thumbarIconCache = new Map();

function thumbarIcon(name) {
  if (thumbarIconCache.has(name)) return thumbarIconCache.get(name);
  let image = null;
  try {
    const file = path.join(__dirname, 'assets', 'thumbar', `${name}.png`);
    if (fs.existsSync(file)) {
      image = nativeImage.createFromPath(file);
      if (image.isEmpty()) image = null;
    }
  } catch (err) {
    image = null;
  }
  thumbarIconCache.set(name, image);
  return image;
}

function updateTaskbarProgress() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const { hasTrack, duration, position, playing } = lastMediaState;
  if (!hasTrack || !duration || duration <= 0) {
    mainWindow.setProgressBar(-1);
    return;
  }
  const fraction = Math.max(0, Math.min(1, position / duration));
  mainWindow.setProgressBar(fraction, { mode: playing ? 'normal' : 'paused' });
}

function updateThumbarButtons() {
  if (process.platform !== 'win32' || !mainWindow || mainWindow.isDestroyed()) return;
  const playing = Boolean(lastMediaState.playing);
  const shuffleOn = Boolean(lastMediaState.shuffle);
  const repeat = lastMediaState.repeat || 0;
  const buttons = [
    { tooltip: 'Previous', icon: thumbarIcon('prev'), click: () => triggerWebMediaAction('previoustrack') },
    playing
      ? { tooltip: 'Pause', icon: thumbarIcon('pause'), click: () => triggerWebMediaAction('playpause') }
      : { tooltip: 'Play', icon: thumbarIcon('play'), click: () => triggerWebMediaAction('playpause') },
    { tooltip: 'Next', icon: thumbarIcon('next'), click: () => triggerWebMediaAction('nexttrack') },
    {
      tooltip: shuffleOn ? 'Shuffle: On' : 'Shuffle: Off',
      icon: thumbarIcon(shuffleOn ? 'shuffle-on' : 'shuffle'),
      click: () => mainWindow.webContents.executeJavaScript('window.player?.toggleShuffle?.()')
    },
    {
      tooltip: repeat === 0 ? 'Repeat: Off' : (repeat === 1 ? 'Repeat: All' : 'Repeat: One'),
      icon: thumbarIcon(repeat === 2 ? 'repeat-one' : 'repeat'),
      click: () => mainWindow.webContents.executeJavaScript('window.player?.toggleRepeat?.()')
    }
  ].filter(button => button.icon);
  try {
    mainWindow.setThumbarButtons(buttons);
  } catch (err) {
    console.warn('[Taskbar] setThumbarButtons failed:', err.message);
  }
}

function createWindow() {
  const iconIco = path.join(__dirname, 'assets', 'icon.ico');
  const iconPng = path.join(__dirname, 'assets', 'icon.png');
  const appIcon = fs.existsSync(iconIco) ? iconIco : (fs.existsSync(iconPng) ? iconPng : undefined);

  const ses = session.fromPartition('persist:dtunes_main', { cache: true });
  ses.setUserAgent(MODERN_CHROME_UA);

  // Network-level interceptor: NEVER allow accounts.google.com to load inside Electron
  ses.webRequest.onBeforeRequest({
    urls: [
      '*://accounts.google.com/*',
      '*://*.supabase.co/auth/v1/authorize*provider=google*'
    ]
  }, (details, callback) => {
    if (details.resourceType === 'main_frame' || details.resourceType === 'sub_frame') {
      console.log('[Network Guard] Intercepted Google OAuth request at network level:', details.url);
      handleExternalGoogleAuth(details.url);
      callback({ cancel: true });
      return;
    }
    callback({ cancel: false });
  });

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 920,
    minHeight: 640,
    frame: false,
    title: "D'Tunes",
    backgroundColor: '#09090b',
    icon: appIcon,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      session: ses,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      backgroundThrottling: false
    }
  });

  Menu.setApplicationMenu(null);

  mainWindow.loadURL(TARGET_URL);

  mainWindow.webContents.on('did-finish-load', () => {
    if (pendingAuthUrl) {
      console.log('[Window] Applying pending deep link auth on load finish:', pendingAuthUrl);
      handleDeepLinkAuth(pendingAuthUrl);
      pendingAuthUrl = null;
    }
    updateThumbarButtons();
    updateTaskbarProgress();
  });

  mainWindow.on('show', () => updateThumbarButtons());

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    if (errorCode === -3) return; // Ignore aborted navigation
    console.warn(`[Window] did-fail-load: ${errorCode} (${errorDescription}) on ${validatedURL}`);
    const localIndexPath = path.join(__dirname, 'index.html');
    const errorHtmlPath = path.join(__dirname, 'error.html');
    if (fs.existsSync(localIndexPath)) {
      console.log('[Window] Loading local index.html for offline playback');
      mainWindow.loadFile(localIndexPath);
    } else if (fs.existsSync(errorHtmlPath)) {
      mainWindow.loadFile(errorHtmlPath);
    }
  });

  mainWindow.webContents.on('console-message', (_event, level, message) => {
    console.log('[Renderer]', message);
  });

  mainWindow.on('maximize', () => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('window-maximized-change', true);
    }
  });

  mainWindow.on('unmaximize', () => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('window-maximized-change', false);
    }
  });

  // Handle popup windows
  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    if (targetUrl.includes('accounts.google.com') || targetUrl.includes('provider=google')) {
      handleExternalGoogleAuth(targetUrl);
      return { action: 'deny' };
    }

    const isInternal = targetUrl.includes('tunes.d-verse.in') || targetUrl.includes('d-verse.in');
    if (isInternal) {
      mainWindow.loadURL(targetUrl);
      return { action: 'deny' };
    }

    shell.openExternal(targetUrl);
    return { action: 'deny' };
  });

  // Intercept in-window navigation
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    if (targetUrl.includes('accounts.google.com') || targetUrl.includes('provider=google')) {
      event.preventDefault();
      handleExternalGoogleAuth(targetUrl);
    }
  });

  // Intercept HTTP redirects (e.g. 302 from Supabase to Google)
  mainWindow.webContents.on('will-redirect', (event, targetUrl) => {
    if (targetUrl.includes('accounts.google.com') || targetUrl.includes('provider=google')) {
      event.preventDefault();
      handleExternalGoogleAuth(targetUrl);
    }
  });

  // Dedicated Music Player Right-Click Context Menu
  mainWindow.webContents.on('context-menu', (event, params) => {
    const musicMenuTemplate = [
      {
        label: 'Play / Pause',
        accelerator: 'Space',
        click: () => triggerWebMediaAction('playpause')
      },
      {
        label: 'Next Track',
        accelerator: 'CmdOrCtrl+Right',
        click: () => triggerWebMediaAction('nexttrack')
      },
      {
        label: 'Previous Track',
        accelerator: 'CmdOrCtrl+Left',
        click: () => triggerWebMediaAction('previoustrack')
      },
      { type: 'separator' },
      {
        label: 'Toggle Repeat',
        click: () => mainWindow.webContents.executeJavaScript('window.player?.toggleRepeat?.()')
      },
      {
        label: 'Toggle Shuffle',
        click: () => mainWindow.webContents.executeJavaScript('window.player?.toggleShuffle?.()')
      },
      {
        label: 'Studio Equalizer',
        click: () => mainWindow.webContents.executeJavaScript('window.ui?.toggleEqualizerModal?.(true)')
      },
      { type: 'separator' },
      {
        label: 'Reload Page',
        accelerator: 'CmdOrCtrl+R',
        click: () => mainWindow.webContents.reload()
      }
    ];

    const contextMenu = Menu.buildFromTemplate(musicMenuTemplate);
    contextMenu.popup();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  setupGlobalMediaShortcuts();
}

function triggerWebMediaAction(action) {
  if (!mainWindow || !mainWindow.webContents) return;
  mainWindow.webContents.executeJavaScript(`
    try {
      const handlers = window.__dtunesMediaHandlers || {};
      if (handlers['${action}']) {
        handlers['${action}']();
      } else {
        const audio = document.querySelector('audio');
        if (audio) {
          if ('${action}' === 'playpause') {
            if (audio.paused) audio.play(); else audio.pause();
          } else if ('${action}' === 'play') {
            audio.play();
          } else if ('${action}' === 'pause') {
            audio.pause();
          } else if ('${action}' === 'nexttrack' && window.player?.next) {
            window.player.next();
          } else if ('${action}' === 'previoustrack' && window.player?.prev) {
            window.player.prev();
          }
        }
      }
    } catch (e) { }
  `);
}

function setupGlobalMediaShortcuts() {
  try {
    globalShortcut.register('MediaPlayPause', () => triggerWebMediaAction('playpause'));
    globalShortcut.register('MediaNextTrack', () => triggerWebMediaAction('nexttrack'));
    globalShortcut.register('MediaPreviousTrack', () => triggerWebMediaAction('previoustrack'));
    globalShortcut.register('MediaStop', () => triggerWebMediaAction('pause'));
  } catch (err) { }
}

ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('is-window-maximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

ipcMain.handle('app-start-google-login', (_event, customUrl) => {
  handleExternalGoogleAuth(customUrl);
  return { ok: true };
});

ipcMain.handle('app-open-external-url', async (_event, targetUrl) => {
  try {
    if (targetUrl) {
      console.log('[Shell] Opening external URL:', targetUrl);
      await shell.openExternal(targetUrl);
    }
    return { ok: true };
  } catch (err) {
    console.error('[Shell] Failed to open external URL:', err);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('fetch-spotify-embed', async (_event, embedUrl) => {
  try {
    const { net } = require('electron');
    console.log('[Spotify Parser] Electron net.fetch fetching:', embedUrl);
    const response = await net.fetch(embedUrl, {
      headers: {
        'User-Agent': MODERN_CHROME_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    if (!response.ok) {
      console.warn('[Spotify Parser] Fetch responded with HTTP', response.status);
      return { ok: false, status: response.status, error: `HTTP ${response.status}` };
    }
    const html = await response.text();
    return { ok: true, html };
  } catch (err) {
    console.error('[Spotify Parser] Error fetching embed:', err);
    return { ok: false, error: err.message };
  }
});

ipcMain.on('app-clear-storage-and-logout', async () => {
  try {
    const ses = session.fromPartition('persist:dtunes_main');
    // Keep service workers + cache storage so the offline app shell survives sign-out.
    await ses.clearStorageData({
      storages: ['cookies', 'localstorage', 'indexdb', 'websql']
    });
    await ses.clearCache();
    await ses.clearAuthCache();
    console.log('[App] Cleared all local storage, cookies, and cache on sign-out.');
  } catch (err) {
    console.warn('[App] Error clearing storage data:', err);
  }

  if (mainWindow) {
    mainWindow.loadURL(TARGET_URL);
  }
});

// ----- Native desktop integrations -----
ipcMain.on('media-state-update', (_event, state = {}) => {
  const previous = lastMediaState;
  lastMediaState = { ...lastMediaState, ...state };
  updateTaskbarProgress();
  if (previous.playing !== lastMediaState.playing ||
      previous.shuffle !== lastMediaState.shuffle ||
      previous.repeat !== lastMediaState.repeat ||
      previous.hasTrack !== lastMediaState.hasTrack) {
    updateThumbarButtons();
  }
});

ipcMain.handle('download-track', (_event, data) => handleDownloadTrack(data));
ipcMain.handle('offline-list', () => Object.values(readOfflineIndex()));
ipcMain.handle('offline-delete', (_event, id) => {
  try {
    const index = readOfflineIndex();
    const entry = index[id];
    if (entry) {
      const filePath = path.join(OFFLINE_DIR, entry.file);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      if (entry.artFile) {
        const artPath = path.join(OFFLINE_DIR, entry.artFile);
        if (fs.existsSync(artPath)) fs.unlinkSync(artPath);
      }
      delete index[id];
      writeOfflineIndex(index);
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.on('system-volume-set', (_event, value) => winVolume.setVolume(value));
ipcMain.handle('system-volume-get', () => winVolume.getVolume());

app.whenReady().then(() => {
  startAuthLoopbackServer();
  registerOfflineProtocol();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (authServer) {
    authServer.close();
  }
  winVolume.dispose();
});

app.on('window-all-closed', () => {
  isQuitting = true;
  if (process.platform !== 'darwin') app.quit();
});
