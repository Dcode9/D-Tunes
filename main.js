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

// App name and Windows Application User Model ID for system integration & Action Center
app.setName("D'Tunes");
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
const OFFLINE_MASTER_SALT = Buffer.from('DTunes.Offline.MasterSecret.v1.4', 'utf8');
let offlineKeyCache = null;

function getMachineIdentity() {
  let machineGuid = '';
  try {
    const { execSync } = require('child_process');
    const out = execSync('reg query HKLM\\SOFTWARE\\Microsoft\\Cryptography /v MachineGuid', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const m = /MachineGuid\s+REG_SZ\s+(\S+)/i.exec(out);
    if (m && m[1]) machineGuid = m[1].trim();
  } catch (_) {}
  const username = process.env.USERNAME || process.env.USER || 'dtunes_user';
  const hostname = process.env.COMPUTERNAME || 'dtunes_host';
  return `${machineGuid || hostname}:${username}`;
}

function getOfflineKey() {
  if (offlineKeyCache && offlineKeyCache.length === 32) return offlineKeyCache;

  // 1. Try reading stored key with safeStorage if available
  try {
    if (fs.existsSync(OFFLINE_KEY_FILE)) {
      const stored = fs.readFileSync(OFFLINE_KEY_FILE);
      if (safeStorage.isEncryptionAvailable()) {
        try {
          const hex = safeStorage.decryptString(stored);
          const buf = Buffer.from(hex, 'hex');
          if (buf.length === 32) {
            offlineKeyCache = buf;
            return offlineKeyCache;
          }
        } catch (_) {
          // safeStorage failed (e.g. Local State reset); fall through to persistent machine key
        }
      }
    }
  } catch (_) {}

  // 2. Derive stable, machine-specific 256-bit AES key (bound to this PC and user account)
  const identity = getMachineIdentity();
  const derivedKey = crypto.pbkdf2Sync(identity, OFFLINE_MASTER_SALT, 100000, 32, 'sha256');

  // Attempt to persist for safeStorage if possible, but key is always recoverable from machine identity
  try {
    if (safeStorage.isEncryptionAvailable()) {
      const payload = safeStorage.encryptString(derivedKey.toString('hex'));
      fs.mkdirSync(path.dirname(OFFLINE_KEY_FILE), { recursive: true });
      fs.writeFileSync(OFFLINE_KEY_FILE, payload, { mode: 0o600 });
    }
  } catch (_) {}

  offlineKeyCache = derivedKey;
  return derivedKey;
}

function encryptBuffer(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getOfflineKey(), iv);
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([OFFLINE_MAGIC, iv, cipher.getAuthTag(), enc]);
}

function decryptBuffer(payload) {
  if (payload.length < 33 || !payload.subarray(0, 6).equals(OFFLINE_MAGIC)) {
    throw new Error('Not a D-Tunes offline file');
  }
  const iv = payload.subarray(6, 18);
  const tag = payload.subarray(18, 34);
  const decipher = crypto.createDecipheriv('aes-256-gcm', getOfflineKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(payload.subarray(34)), decipher.final()]);
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

function extractArtworkUrl(data) {
  if (!data) return '';
  const candidate = data.img || data.image;
  if (typeof candidate === 'string' && /^https?:\/\//i.test(candidate)) return candidate;
  if (Array.isArray(candidate) && candidate.length > 0) {
    const last = candidate[candidate.length - 1];
    const u = (last && (last.url || last.link)) || (typeof last === 'string' ? last : '');
    if (typeof u === 'string' && /^https?:\/\//i.test(u)) return u;
  }
  if (Array.isArray(data.image) && data.image.length > 0) {
    const last = data.image[data.image.length - 1];
    const u = (last && (last.url || last.link)) || (typeof last === 'string' ? last : '');
    if (typeof u === 'string' && /^https?:\/\//i.test(u)) return u;
  }
  return '';
}

function detectAudioMime(buf) {
  if (!buf || buf.length < 8) return 'audio/mp4';
  if (buf.length >= 12 && buf.subarray(4, 8).toString('binary') === 'ftyp') {
    return 'audio/mp4';
  }
  if (buf.subarray(0, 3).toString('binary') === 'ID3' || (buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0)) {
    return 'audio/mpeg';
  }
  if (buf.subarray(0, 4).toString('binary') === 'OggS') {
    return 'audio/ogg';
  }
  if (buf.subarray(0, 4).toString('binary') === 'fLaC') {
    return 'audio/flac';
  }
  return 'audio/mp4';
}

function detectImageMime(buf) {
  if (!buf || buf.length < 4) return 'image/jpeg';
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
  if (buf[0] === 0x89 && buf.subarray(1, 4).toString('binary') === 'PNG') return 'image/png';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('binary') === 'RIFF' && buf.subarray(8, 12).toString('binary') === 'WEBP') return 'image/webp';
  return 'image/jpeg';
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
    const imgUrl = extractArtworkUrl(data);
    if (imgUrl) {
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
            const mime = detectImageMime(artData);
            return new Response(new Uint8Array(artData), {
              status: 200,
              headers: {
                'Content-Type': mime,
                'Cache-Control': 'public, max-age=31536000',
                'Access-Control-Allow-Origin': '*'
              }
            });
          }
        }
        const fallbackCandidates = [
          path.join(__dirname, 'assets', 'icon.png'),
          path.join(__dirname, 'assets', 'DTunes_logo.png'),
          path.join(__dirname, 'DTunes.svg')
        ];
        for (const fb of fallbackCandidates) {
          if (fs.existsSync(fb)) {
            const fbData = fs.readFileSync(fb);
            const fbMime = fb.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
            return new Response(new Uint8Array(fbData), {
              status: 200,
              headers: { 'Content-Type': fbMime, 'Access-Control-Allow-Origin': '*' }
            });
          }
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
      const mime = detectAudioMime(audio);
      const headers = {
        'Content-Type': mime,
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
          const slice = audio.subarray(start, end + 1);
          headers['Content-Range'] = `bytes ${start}-${end}/${total}`;
          headers['Content-Length'] = String(slice.length);
          return new Response(new Uint8Array(slice), { status: 206, headers });
        }
      }

      headers['Content-Length'] = String(total);
      return new Response(new Uint8Array(audio), { status: 200, headers });
    } catch (err) {
      console.error('[Offline] Protocol error:', err);
      return new Response('Error', { status: 500 });
    }
  });
}

function ensureWindowsAppIdentity() {
  if (process.platform !== 'win32') return;
  try {
    const lnkDir = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs');
    if (!fs.existsSync(lnkDir)) return;
    const lnkPath = path.join(lnkDir, "D'Tunes.lnk");
    const exePath = process.execPath;
    const iconPath = path.join(__dirname, 'assets', 'icon.ico');

    const script = `
$lnk = [System.IO.Path]::Combine($env:APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'D''Tunes.lnk')
$exe = '${exePath.replace(/'/g, "''")}'
$icon = '${iconPath.replace(/'/g, "''")}'
$code = @"
using System;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;

public class AppIdentityShortcut {
    [ComImport, Guid("00021401-0000-0000-C000-000000000046")]
    internal class ShellLink {}

    [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("000214F9-0000-0000-C000-000000000046")]
    internal interface IShellLinkW {
        void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder pszFile, int cch, IntPtr pfd, int fFlags);
        void GetIDList(out IntPtr ppidl);
        void SetIDList(IntPtr pidl);
        void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder pszName, int cch);
        void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string pszName);
        void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder pszDir, int cch);
        void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string pszDir);
        void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder pszArgs, int cch);
        void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string pszArgs);
        void GetHotkey(out short pwHotkey);
        void SetHotkey(short wHotkey);
        void GetShowCmd(out int piShowCmd);
        void SetShowCmd(int iShowCmd);
        void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder pszIconPath, int cch, out int piIcon);
        void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string pszIconPath, int iIcon);
        void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string pszPathRel, int dwReserved);
        void Resolve(IntPtr hwnd, int fFlags);
        void SetPath([MarshalAs(UnmanagedType.LPWStr)] string pszFile);
    }

    [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99")]
    internal interface IPropertyStore {
        void GetCount(out uint cProps);
        void GetAt(uint iProp, out PropertyKey pkey);
        void GetValue(ref PropertyKey key, out PropVariant pv);
        void SetValue(ref PropertyKey key, ref PropVariant pv);
        void Commit();
    }

    [StructLayout(LayoutKind.Sequential, Pack = 4)]
    internal struct PropertyKey {
        public Guid fmtid;
        public uint pid;
        public PropertyKey(Guid guid, uint id) { fmtid = guid; pid = id; }
    }

    [StructLayout(LayoutKind.Explicit)]
    internal struct PropVariant {
        [FieldOffset(0)] public ushort vt;
        [FieldOffset(8)] public IntPtr pwszVal;
    }

    public static void CreateOrUpdate(string lnk, string exe, string appId, string icon, string desc) {
        var link = (IShellLinkW)new ShellLink();
        link.SetPath(exe);
        link.SetWorkingDirectory(System.IO.Path.GetDirectoryName(exe));
        if (!string.IsNullOrEmpty(icon) && System.IO.File.Exists(icon)) link.SetIconLocation(icon, 0);
        if (!string.IsNullOrEmpty(desc)) link.SetDescription(desc);
        var propStore = (IPropertyStore)link;
        var pkey = new PropertyKey(new Guid("9F4C2855-9F79-48A1-6840-02C66A2B3D25"), 5);
        var pv = new PropVariant();
        pv.vt = 31;
        pv.pwszVal = Marshal.StringToCoTaskMemUni(appId);
        try {
            propStore.SetValue(ref pkey, ref pv);
            propStore.Commit();
        } finally {
            Marshal.FreeCoTaskMem(pv.pwszVal);
        }
        var file = (IPersistFile)link;
        file.Save(lnk, true);
    }
}
"@
Add-Type -TypeDefinition $code -Language CSharp
[AppIdentityShortcut]::CreateOrUpdate($lnk, $exe, "DhairyaShah.DTunes", $icon, "D''Tunes Music")
`;
    const cp = require('child_process');
    cp.exec(`powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "${script.replace(/\r?\n/g, ' ')}"`, (err) => {
      if (err) console.warn('[AppIdentity] Shortcut setup note:', err.message);
      else console.log('[AppIdentity] Windows Start Menu identity verified');
    });
  } catch (err) {
    console.warn('[AppIdentity] Error ensuring identity:', err);
  }
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
  const { hasTrack, duration, position } = lastMediaState;
  if (!hasTrack || !duration || duration <= 0) {
    mainWindow.setProgressBar(-1);
    return;
  }
  const fraction = Math.max(0, Math.min(1, position / duration));
  // Keep mode: 'normal' (accent/green) at all times so Windows renders the task
  // as active and progressing/frozen at the current point, rather than yellow.
  mainWindow.setProgressBar(fraction, { mode: 'normal' });
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

  const localIndexPath = path.join(__dirname, 'index.html');
  const errorHtmlPath = path.join(__dirname, 'error.html');

  // Cold boot network check: if offline at start, immediately load local index.html
  // without waiting 30 seconds for remote loadURL to time out.
  if (!net.isOnline() && fs.existsSync(localIndexPath)) {
    console.log('[Window] Cold boot offline: loading local index.html directly');
    mainWindow.loadFile(localIndexPath);
  } else {
    mainWindow.loadURL(TARGET_URL);
  }

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
  // Chromium's MediaSessionService + HardwareMediaKeyHandling communicates
  // natively with Windows SystemMediaTransportControls (SMTC) to display Now Playing
  // media controls in Windows 11 Control Center / Quick Settings.
  // Registering globalShortcut for Media keys on Windows steals the key from SMTC,
  // so we let SMTC bind naturally while keeping web fallback handlers available.
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
ipcMain.handle('net-is-online', () => net.isOnline());

// Forward system master volume changes (from hardware volume keys / taskbar)
// to the renderer to keep the in-app volume slider in exact sync.
winVolume.on('change', (vol) => {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
    mainWindow.webContents.send('system-volume-changed', vol);
  }
});

// Periodic background network reachability check to notify renderer
let lastKnownNetState = net.isOnline();
setInterval(() => {
  try {
    const cur = net.isOnline();
    if (cur !== lastKnownNetState) {
      lastKnownNetState = cur;
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
        mainWindow.webContents.send('network-status-changed', cur);
      }
    }
  } catch (_) {}
}, 2500);

app.whenReady().then(() => {
  ensureWindowsAppIdentity();
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
