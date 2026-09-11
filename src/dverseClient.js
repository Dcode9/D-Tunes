(function () {
  const SUPABASE_URL = window.DVERSE_SUPABASE_URL || 'https://gmwieijbrrztukqpfwkg.supabase.co';
  const SUPABASE_ANON_KEY = window.DVERSE_SUPABASE_ANON_KEY || 'sb_publishable_KX3MYtV84QJJdy9bPDuMEA_V99sLKSE';

  // Resilient multi-storage adapter (localStorage + sessionStorage + cookies + in-memory fallback for iOS WebKit/PWA)
  const memoryStorage = new Map();

  function getCookie(name) {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(new RegExp('(?:^|;\\s*)' + encodeURIComponent(name) + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  }

  function setCookie(name, value, days = 365) {
    if (typeof document === 'undefined') return;
    if (typeof value === 'string' && value.length > 3500) return;
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:';
    const isDverse = typeof window !== 'undefined' && window.location.hostname.endsWith('d-verse.in');
    const domainAttr = isDverse ? '; domain=.d-verse.in' : '';
    document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; expires=${expires}; path=/${domainAttr}; SameSite=Lax${isSecure ? '; Secure' : ''}`;
  }

  function deleteCookie(name) {
    if (typeof document === 'undefined') return;
    const isDverse = typeof window !== 'undefined' && window.location.hostname.endsWith('d-verse.in');
    const domainAttr = isDverse ? '; domain=.d-verse.in' : '';
    document.cookie = `${encodeURIComponent(name)}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domainAttr}; SameSite=Lax; Secure`;
  }

  const universalStorage = {
    getItem: (key) => {
      try {
        const val = localStorage.getItem(key);
        if (val !== null && val !== undefined) {
          memoryStorage.set(key, val);
          return val;
        }
      } catch (_) {}
      try {
        const val = sessionStorage.getItem(key);
        if (val !== null && val !== undefined) {
          memoryStorage.set(key, val);
          return val;
        }
      } catch (_) {}
      try {
        const val = getCookie(key);
        if (val !== null && val !== undefined) {
          memoryStorage.set(key, val);
          return val;
        }
      } catch (_) {}
      if (memoryStorage.has(key)) return memoryStorage.get(key);
      return null;
    },
    setItem: (key, value) => {
      memoryStorage.set(key, value);
      try { localStorage.setItem(key, value); } catch (_) {}
      try { sessionStorage.setItem(key, value); } catch (_) {}
      try { setCookie(key, value); } catch (_) {}
    },
    removeItem: (key) => {
      memoryStorage.delete(key);
      try { localStorage.removeItem(key); } catch (_) {}
      try { sessionStorage.removeItem(key); } catch (_) {}
      try { deleteCookie(key); } catch (_) {}
    }
  };

  const ready = Boolean(window.supabase && SUPABASE_ANON_KEY);
  const client = ready ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: universalStorage,
      storageKey: 'dverse_supabase_auth_token',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: 'pkce'
    }
  }) : null;
  const PORTAL_ORIGIN = (window.DVERSE_PORTAL_ORIGIN || 'https://d-verse.in').replace(/\/$/, '');
  const AUTH_BRIDGE_URL = `${PORTAL_ORIGIN}/auth-bridge.html`;
  const authRedirectUrl = () => `${window.location.origin}/`;
  let portalSessionPromise = null;
  let currentSession = null;
  let checkedUrlHandoff = false;

  // Purge any legacy sticky desktop auth session flag to prevent web sign-in hijacking
  try {
    sessionStorage.removeItem('dverse_desktop_auth');
  } catch (_) {}

  // Immediate Desktop OAuth Return Handler:
  // When returning from Google OAuth in the external system browser with desktop_auth=1,
  // do NOT attempt PKCE code exchange in this browser (the PKCE code_verifier was generated
  // and stored inside the Electron app). Immediately hand off code or tokens to the Windows app
  // via loopback server (http://127.0.0.1:49200/token) and custom protocol (dtunes://auth).
  function checkImmediateDesktopAuthHandoff() {
    if (typeof window === 'undefined' || window.electronAPI || !window.location) return;
    const searchParams = new URLSearchParams(window.location.search);
    const hashText = window.location.hash ? window.location.hash.slice(1) : '';
    const hashParams = new URLSearchParams(hashText.startsWith('?') ? hashText.slice(1) : hashText);

    const isDesktopAuth = searchParams.get('desktop_auth') === '1';

    if (!isDesktopAuth) return;

    const code = searchParams.get('code') || hashParams.get('code');
    const accessToken = hashParams.get('access_token') || searchParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token') || searchParams.get('refresh_token');

    if (code || (accessToken && refreshToken)) {
      try { sessionStorage.removeItem('dverse_desktop_auth'); } catch (_) {}

      const payload = code
        ? { code }
        : {
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_in: hashParams.get('expires_in') || searchParams.get('expires_in'),
            token_type: hashParams.get('token_type') || searchParams.get('token_type')
          };

      const deepLinkUrl = code
        ? `dtunes://auth?code=${encodeURIComponent(code)}`
        : `dtunes://auth?access_token=${encodeURIComponent(accessToken)}&refresh_token=${encodeURIComponent(refreshToken)}`;

      // 1. Post to loopback server on port 49200
      try {
        fetch('http://127.0.0.1:49200/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).catch(() => {});
      } catch (_) {}

      // 2. Render desktop handoff UI in browser
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => renderDesktopHandoffUI(deepLinkUrl));
      } else {
        renderDesktopHandoffUI(deepLinkUrl);
      }

      // 3. Trigger deep link navigation to bring Windows app to front
      try {
        window.location.href = deepLinkUrl;
      } catch (_) {}
    }
  }
  checkImmediateDesktopAuthHandoff();

  function base64UrlDecode(value) {
    const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  function takeSessionHandoffFromUrl() {
    if (checkedUrlHandoff || typeof window === 'undefined') return null;
    checkedUrlHandoff = true;

    // 1. Check for ?dverse_session=... in search query
    const searchParams = new URLSearchParams(window.location.search);
    let encodedSession = searchParams.get('dverse_session');
    if (encodedSession) {
      searchParams.delete('dverse_session');
      const cleanSearch = searchParams.toString();
      const cleanUrl = `${window.location.pathname}${cleanSearch ? `?${cleanSearch}` : ''}${window.location.hash}`;
      try { window.history.replaceState({}, document.title, cleanUrl); } catch (_) {}
      try {
        return base64UrlDecode(encodedSession);
      } catch (err) {
        console.warn('[DVerse] Invalid dverse_session in search params:', err);
      }
    }

    // 2. Check for #dverse_session=... in hash
    const hashText = window.location.hash ? window.location.hash.slice(1) : '';
    if (hashText && hashText.includes('dverse_session=')) {
      const params = new URLSearchParams(hashText.startsWith('?') ? hashText.slice(1) : hashText);
      encodedSession = params.get('dverse_session');
      params.delete('dverse_session');

      const cleanHash = params.toString();
      const cleanUrl = `${window.location.pathname}${window.location.search}${cleanHash ? `#${cleanHash}` : ''}`;
      try { window.history.replaceState({}, document.title, cleanUrl); } catch (_) {}

      if (encodedSession) {
        try {
          return base64UrlDecode(encodedSession);
        } catch (error) {
          console.warn('[DVerse] Ignored invalid session handoff:', error);
        }
      }
    }

    // 3. Check for standard Supabase OAuth hash: #access_token=...&refresh_token=...
    if (hashText && (hashText.includes('access_token=') || hashText.includes('refresh_token='))) {
      const hashParams = new URLSearchParams(hashText.startsWith('?') ? hashText.slice(1) : hashText);
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      if (accessToken && refreshToken) {
        return {
          access_token: accessToken,
          refresh_token: refreshToken
        };
      }
    }

    return null;
  }

  async function restoreSessionFromHandoff() {
    if (!client) return null;

    // 1. Check URL query / hash handoffs
    const session = takeSessionHandoffFromUrl();
    if (session?.access_token && session?.refresh_token) {
      try {
        const { data, error } = await client.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token
        });
        if (!error && data?.session) {
          currentSession = data.session;
          try {
            universalStorage.setItem('dverse_session_cache', JSON.stringify({
              access_token: data.session.access_token,
              refresh_token: data.session.refresh_token
            }));
          } catch (_) {}
          try {
            if (window.location.hash && (window.location.hash.includes('access_token=') || window.location.hash.includes('dverse_session='))) {
              window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
            }
          } catch (_) {}
          syncSessionToPortal(currentSession);
          handleDesktopHandoffIfRequested(currentSession);
          if (typeof window !== 'undefined' && window.cloudLibrary) {
            window.cloudLibrary.session = currentSession;
            window.cloudLibrary.updateUI();
            if (typeof window.cloudLibrary.load === 'function') {
              window.cloudLibrary.load().catch(() => {});
            }
          }
          return currentSession;
        }
      } catch (err) {
        console.warn('[DVerse] Failed to set session from handoff:', err);
      }
    }

    // 2. Check if client already has an active valid session before doing any code exchange
    try {
      const { data: existingData } = await client.auth.getSession();
      if (existingData?.session) {
        currentSession = existingData.session;
        // Clean URL if code/state parameters are present so we never re-exchange
        const searchParams = new URLSearchParams(window.location.search);
        if (searchParams.has('code') || searchParams.has('state')) {
          searchParams.delete('code');
          searchParams.delete('state');
          const cleanSearch = searchParams.toString();
          try {
            window.history.replaceState({}, document.title, `${window.location.pathname}${cleanSearch ? `?${cleanSearch}` : ''}${window.location.hash}`);
          } catch (_) {}
        }
        try {
          universalStorage.setItem('dverse_session_cache', JSON.stringify({
            access_token: currentSession.access_token,
            refresh_token: currentSession.refresh_token
          }));
        } catch (_) {}
        syncSessionToPortal(currentSession);
        handleDesktopHandoffIfRequested(currentSession);
        if (typeof window !== 'undefined' && window.cloudLibrary) {
          window.cloudLibrary.session = currentSession;
          window.cloudLibrary.updateUI();
          if (typeof window.cloudLibrary.load === 'function') {
            window.cloudLibrary.load().catch(() => {});
          }
        }
        return currentSession;
      }
    } catch (_) {}

    // 3. Check for PKCE authorization code exchange (?code=...)
    const searchParams = new URLSearchParams(window.location.search);
    const code = searchParams.get('code');
    if (code && typeof client.auth.exchangeCodeForSession === 'function') {
      const isDesktopAuth = searchParams.get('desktop_auth') === '1';
      if (isDesktopAuth) {
        // Handled directly by checkImmediateDesktopAuthHandoff() and Electron mainWindow
        return null;
      }
      try {
        const { data, error } = await client.auth.exchangeCodeForSession(code);
        // Always clean code and state from URL after exchange attempt to avoid infinite retry loops
        searchParams.delete('code');
        searchParams.delete('state');
        const cleanSearch = searchParams.toString();
        try {
          window.history.replaceState({}, document.title, `${window.location.pathname}${cleanSearch ? `?${cleanSearch}` : ''}${window.location.hash}`);
        } catch (_) {}

        if (!error && data?.session) {
          currentSession = data.session;
          try {
            universalStorage.setItem('dverse_session_cache', JSON.stringify({
              access_token: data.session.access_token,
              refresh_token: data.session.refresh_token
            }));
          } catch (_) {}
          syncSessionToPortal(currentSession);
          handleDesktopHandoffIfRequested(currentSession);
          if (typeof window !== 'undefined' && window.cloudLibrary) {
            window.cloudLibrary.session = currentSession;
            window.cloudLibrary.updateUI();
            if (typeof window.cloudLibrary.load === 'function') {
              window.cloudLibrary.load().catch(() => {});
            }
          }
          return currentSession;
        } else if (error) {
          console.warn('[DVerse] Failed to exchange code for session:', error);
        }
      } catch (err) {
        console.warn('[DVerse] Exception during code exchange:', err);
        try {
          searchParams.delete('code');
          searchParams.delete('state');
          const cleanSearch = searchParams.toString();
          window.history.replaceState({}, document.title, `${window.location.pathname}${cleanSearch ? `?${cleanSearch}` : ''}${window.location.hash}`);
        } catch (_) {}
      }
    }

    return null;
  }

  function bridgeRequest(message, timeoutMs = 2500) {
    if (!PORTAL_ORIGIN || window.location.origin === PORTAL_ORIGIN || typeof document === 'undefined') {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const frame = document.createElement('iframe');
      let finished = false;

      function cleanup(value) {
        if (finished) return;
        finished = true;
        window.removeEventListener('message', onMessage);
        clearTimeout(timer);
        if (typeof frame.remove === 'function') {
          frame.remove();
        } else if (frame.parentElement && typeof frame.parentElement.removeChild === 'function') {
          frame.parentElement.removeChild(frame);
        }
        resolve(value);
      }

      function onMessage(event) {
        if (event.origin !== PORTAL_ORIGIN && !event.origin.includes('d-verse.in') && !event.origin.includes('d-verse.in')) return;
        const data = event.data || {};
        if (data.source !== 'dverse-auth-bridge' || data.requestId !== requestId) return;
        cleanup(data);
      }

      const timer = setTimeout(() => cleanup(null), timeoutMs);
      frame.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;border:0;';
      frame.setAttribute('aria-hidden', 'true');
      frame.addEventListener('load', () => {
        try {
          frame.contentWindow?.postMessage({
            source: 'dverse-app',
            requestId,
            ...message
          }, '*');
        } catch (_) {}
      });
      window.addEventListener('message', onMessage);
      frame.src = AUTH_BRIDGE_URL;
      (document.body || document.documentElement).appendChild(frame);
    });
  }

  async function bootstrapFromPortal() {
    if (!client) return null;
    const handedOffSession = await restoreSessionFromHandoff();
    if (handedOffSession) return handedOffSession;

    const { data, error } = await client.auth.getSession();
    if (!error && data?.session) {
      currentSession = data.session;
      try {
        universalStorage.setItem('dverse_session_cache', JSON.stringify({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token
        }));
      } catch (_) {}
      return data.session;
    }

    // Check cached session
    try {
      const cached = universalStorage.getItem('dverse_session_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.access_token && parsed?.refresh_token) {
          const { data: restored, error: restoreError } = await client.auth.setSession({
            access_token: parsed.access_token,
            refresh_token: parsed.refresh_token
          });
          if (!restoreError && restored?.session) {
            currentSession = restored.session;
            return currentSession;
          }
        }
      }
    } catch (_) {}

    if (!portalSessionPromise) {
      portalSessionPromise = (async () => {
        const response = await bridgeRequest({ type: 'dverse-auth:get-session' });
        const session = response?.session;
        if (!session?.access_token || !session?.refresh_token) return null;
        const { data: restored, error: restoreError } = await client.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token
        });
        if (restoreError) throw restoreError;
        currentSession = restored.session || null;
        if (currentSession) {
          try {
            universalStorage.setItem('dverse_session_cache', JSON.stringify({
              access_token: currentSession.access_token,
              refresh_token: currentSession.refresh_token
            }));
          } catch (_) {}
        }
        return restored.session || null;
      })().finally(() => {
        portalSessionPromise = null;
      });
    }
    return portalSessionPromise;
  }

  
  function notifyDesktopAppIfRunning(session) {
    if (!session || typeof window === 'undefined' || window.electronAPI) return;
    try {
      const payload = {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_in: session.expires_in,
        token_type: session.token_type
      };
      fetch('http://127.0.0.1:49200/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(() => {});
    } catch (_) {}
  }

  function handleDesktopHandoffIfRequested(session) {
    if (!session || typeof window === 'undefined' || window.electronAPI) return;

    const searchParams = new URLSearchParams(window.location.search);
    const isDesktopAuth = searchParams.get('desktop_auth') === '1';
    if (!isDesktopAuth) return;

    try { sessionStorage.removeItem('dverse_desktop_auth'); } catch (_) {}

    try {
      searchParams.delete('desktop_auth');
      const cleanSearch = searchParams.toString();
      const cleanUrl = `${window.location.pathname}${cleanSearch ? `?${cleanSearch}` : ''}${window.location.hash}`;
      window.history.replaceState({}, document.title, cleanUrl);
    } catch (_) {}

    // 1. Notify desktop app via loopback server on port 49200
    notifyDesktopAppIfRunning(session);

    // 2. Build deep link URL
    const deepLinkUrl = `dtunes://auth?access_token=${encodeURIComponent(session.access_token)}&refresh_token=${encodeURIComponent(session.refresh_token)}`;

    // 3. Render desktop handoff UI in browser
    renderDesktopHandoffUI(deepLinkUrl);

    // 4. Trigger deep link navigation
    try {
      window.location.href = deepLinkUrl;
    } catch (_) {}
  }

  function renderDesktopHandoffUI(deepLinkUrl) {
    if (typeof document === 'undefined') return;
    const existing = document.getElementById('dtunes-desktop-handoff-overlay');
    if (existing) {
      if (typeof existing.remove === 'function') {
        existing.remove();
      } else if (existing.parentElement && typeof existing.parentElement.removeChild === 'function') {
        existing.parentElement.removeChild(existing);
      }
    }

    const overlay = document.createElement('div');
    overlay.id = 'dtunes-desktop-handoff-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999999;background:rgba(9,9,11,0.94);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);display:flex;align-items:center;justify-content:center;padding:1.5rem;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#f4f4f5;';

    overlay.innerHTML = `
      <div style="background:rgba(24,24,30,0.96);border:1px solid rgba(255,255,255,0.14);border-radius:1.5rem;padding:2.5rem 2.25rem;max-width:440px;width:100%;text-align:center;box-shadow:0 25px 50px -12px rgba(0,0,0,0.7);">
        <div style="width:60px;height:60px;border-radius:50%;background:rgba(34,211,238,0.15);color:#22d3ee;display:inline-flex;align-items:center;justify-content:center;font-size:30px;margin-bottom:1.25rem;border:1px solid rgba(34,211,238,0.3);">✓</div>
        <h2 style="font-size:1.4rem;font-weight:700;margin:0 0 0.5rem;color:#ffffff;">Signed In Successfully</h2>
        <p style="color:#a1a1aa;font-size:0.95rem;margin:0 0 1.75rem;line-height:1.5;">
          Redirecting back to your <strong>D'Tunes Windows app</strong>. Your library, playlists, and history are now syncing...
        </p>
        <div style="display:flex;flex-direction:column;gap:0.75rem;">
          <a id="dtunes-open-app-btn" href="${deepLinkUrl}" style="display:block;background:#22d3ee;color:#09090b;font-weight:700;font-size:0.95rem;padding:0.8rem 1.5rem;border-radius:9999px;text-decoration:none;box-shadow:0 4px 20px rgba(34,211,238,0.35);">Open D'Tunes App</a>
          <button id="dtunes-dismiss-handoff-btn" style="background:transparent;color:#71717a;border:none;font-size:0.85rem;cursor:pointer;padding:0.5rem;">Continue in Web Player</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const dismissBtn = overlay.querySelector('#dtunes-dismiss-handoff-btn');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        if (typeof overlay.remove === 'function') {
          overlay.remove();
        } else if (overlay.parentElement && typeof overlay.parentElement.removeChild === 'function') {
          overlay.parentElement.removeChild(overlay);
        }
      });
    }

    setTimeout(() => {
      try { window.close(); } catch (_) {}
    }, 4000);
  }

  function syncSessionToPortal(session) {
    if (!session?.access_token || !session?.refresh_token) return;
    try {
      universalStorage.setItem('dverse_session_cache', JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token
      }));
    } catch (_) {}
    bridgeRequest({
      type: 'dverse-auth:set-session',
      session: {
        access_token: session.access_token,
        refresh_token: session.refresh_token
      }
    }, 1500).catch((error) => console.warn('[DVerse] Portal session sync failed:', error));
  }

  async function getSession() {
    if (!client) return null;
    return bootstrapFromPortal();
  }

  function onAuthStateChange(callback) {
    if (!client || typeof callback !== 'function') return { unsubscribe() {} };
    const { data } = client.auth.onAuthStateChange((event, session) => {
      currentSession = session || null;
      if (session && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
        syncSessionToPortal(session);
        handleDesktopHandoffIfRequested(session);
      }
      if (event === 'SIGNED_OUT') {
        try { universalStorage.removeItem('dverse_session_cache'); } catch (_) {}
      }
      callback(event, session);
    });
    return data.subscription;
  }

  async function signInWithGoogle() {
    if (!client) throw new Error('D\'Verse Supabase client is not configured.');

    // 1. Electron Desktop App handling:
    // Route OAuth directly to local loopback server (http://127.0.0.1:49200/callback)
    // so the native Windows app receives the auth code/tokens without redirecting to the web app.
    const isDesktop = Boolean(window.electronAPI || window.isDTunesDesktop);
    if (isDesktop) {
      console.log('[DVerse] Desktop app detected: initiating OAuth with loopback redirect to Windows app...');
      try {
        const loopbackRedirect = 'http://127.0.0.1:49200/callback';
        const { data, error } = await client.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: loopbackRedirect,
            skipBrowserRedirect: true
          }
        });
        if (error) throw error;
        if (data?.url) {
          console.log('[DVerse] Opening OAuth URL in system browser:', data.url);
          if (window.electronAPI && typeof window.electronAPI.openExternalUrl === 'function') {
            await window.electronAPI.openExternalUrl(data.url);
            return;
          } else if (window.electronAPI && typeof window.electronAPI.startGoogleLogin === 'function') {
            await window.electronAPI.startGoogleLogin(data.url);
            return;
          }
        }
      } catch (e) {
        console.warn('[DVerse] Desktop OAuth error, falling back:', e);
        if (window.electronAPI && typeof window.electronAPI.startGoogleLogin === 'function') {
          await window.electronAPI.startGoogleLogin();
          return;
        }
      }
    }
    
    // 2. Standard Web Browser flow
    try {
      const redirectUrl = `${window.location.origin}${window.location.pathname}`;
      setCookie('dverse_auth_return_to', `${window.location.origin}/`, 1);
      setCookie('dverse.auth.returnTo', `${window.location.origin}/`, 1);
      try {
        localStorage.setItem('dverse.auth.returnTo', `${window.location.origin}/`);
        sessionStorage.setItem('dverse.auth.returnTo', `${window.location.origin}/`);
      } catch (_) {}
      const { data, error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl
        }
      });
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
    } catch (err) {
      console.warn('[DVerse] Direct OAuth sign in error, falling back to portal:', err);
      // Fallback: direct to D'Verse portal auth path
      window.location.href = `${PORTAL_ORIGIN}/?dverse_return_to=${encodeURIComponent(window.location.href)}`;
    }
  }

  async function signOut() {
    if (!client) return;
    try { universalStorage.removeItem('dverse_session_cache'); } catch (_) {}
    try { universalStorage.removeItem('dverse_supabase_auth_token'); } catch (_) {}
    currentSession = null;
    const { error } = await client.auth.signOut();
    if (error) console.warn('[DVerse] signOut warning:', error);
    await bridgeRequest({ type: 'dverse-auth:sign-out' }, 1500);
  }

  function normalizeTrack(song) {
    const id = String(typeof song === 'object' ? (song?.id || '') : (song || ''));
    return {
      id,
      title: song?.name || song?.title || 'Unknown Track',
      artist: song?.artist || null,
      album: song?.album || null,
      duration_ms: song?.duration ? Number(song.duration) * 1000 : null,
      artwork_url: song?.img || song?.artwork_url || null,
      source: song?.source || 'jiosaavn',
      metadata: typeof song === 'object' ? song : {}
    };
  }

  function songFromTrack(track, fallbackId = null) {
    const t = Array.isArray(track) ? track[0] : track;
    const effectiveId = String(t?.id || fallbackId || '');
    if (!effectiveId) return null;
    if (!t) {
      return {
        id: effectiveId,
        name: 'Track ' + effectiveId,
        title: 'Track ' + effectiveId,
        artist: '',
        album: '',
        img: 'DTunes.svg',
        source: 'jiosaavn'
      };
    }
    return {
      id: effectiveId,
      name: t.metadata?.name || t.metadata?.title || t.title || 'Unknown Track',
      title: t.metadata?.title || t.title || 'Unknown Track',
      artist: t.metadata?.artist || t.artist || '',
      album: t.metadata?.album || t.album || '',
      duration: t.metadata?.duration || (t.duration_ms ? Math.round(t.duration_ms / 1000) : undefined),
      img: t.metadata?.img || t.artwork_url || 'DTunes.svg',
      source: t.source || t.metadata?.source || 'jiosaavn',
      ...(t.metadata || {})
    };
  }

  async function upsertTrack(song) {
    if (!client || !song) return null;
    const track = normalizeTrack(song);
    if (!track.id) return null;
    try {
      const { error } = await client
        .from('dtunes_tracks')
        .upsert(track, { onConflict: 'id', ignoreDuplicates: true });
      if (error) console.warn('[DVerse] Track upsert warning:', error.message);
    } catch (_) {}
    return track;
  }

  async function recordPlay(song, context = {}) {
    if (!client || !song) return;
    const session = currentSession || await getSession();
    if (!session?.user?.id) return;
    const track = await upsertTrack(song);
    const endedAt = context.ended_at || context.played_at || new Date().toISOString();
    const durationMs = context.duration_ms ?? context.durationMs ?? null;
    const startedAt = context.started_at || (durationMs
      ? new Date(new Date(endedAt).getTime() - durationMs).toISOString()
      : null);
    try {
      const { error } = await client.from('dtunes_history').insert({
        user_id: session.user.id,
        track_id: track?.id || String(song.id || song),
        played_at: endedAt,
        duration_ms: durationMs,
        started_at: startedAt,
        ended_at: endedAt,
        client: 'dtunes-web',
        context: { source: 'dtunes-web', ...context }
      });
      if (error) console.warn('[DVerse] recordPlay error:', error.message);
    } catch (err) {
      console.warn('[DVerse] recordPlay failed:', err);
    }
  }

  async function listHistory(limit = 100) {
    if (!client) return [];
    const session = currentSession || await getSession();
    if (!session?.user?.id) return [];
    try {
      const { data, error } = await client
        .from('dtunes_history')
        .select('played_at, track_id, context, dtunes_tracks(*)')
        .eq('user_id', session.user.id)
        .order('played_at', { ascending: false })
        .limit(limit);
      if (error) {
        console.warn('[DVerse] listHistory select error:', error.message);
        return [];
      }
      return (data || []).map((row) => songFromTrack(row.dtunes_tracks, row.track_id)).filter(Boolean);
    } catch (err) {
      console.warn('[DVerse] listHistory exception:', err);
      return [];
    }
  }

  async function setLiked(song, liked) {
    if (!client || !song) return;
    const session = currentSession || await getSession();
    if (!session?.user?.id) return;
    const track = await upsertTrack(song);
    const trackId = track?.id || String(song.id || song);
    const query = client.from('dtunes_likes');
    const { error } = liked
      ? await query.upsert({ user_id: session.user.id, track_id: trackId })
      : await query.delete().eq('user_id', session.user.id).eq('track_id', trackId);
    if (error) console.warn('[DVerse] setLiked error:', error.message);
  }

  async function listLikes() {
    if (!client) return [];
    const session = currentSession || await getSession();
    if (!session?.user?.id) return [];
    try {
      const { data, error } = await client
        .from('dtunes_likes')
        .select('created_at, track_id, dtunes_tracks(*)')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });
      if (error) {
        console.warn('[DVerse] listLikes select error:', error.message);
        return [];
      }
      return (data || []).map((row) => songFromTrack(row.dtunes_tracks, row.track_id)).filter(Boolean);
    } catch (err) {
      console.warn('[DVerse] listLikes exception:', err);
      return [];
    }
  }

  async function setLibrary(song, inLibrary) {
    if (!client || !song) return;
    const session = currentSession || await getSession();
    if (!session?.user?.id) return;
    const track = await upsertTrack(song);
    const trackId = track?.id || String(song.id || song);
    const query = client.from('dtunes_library');
    const { error } = inLibrary
      ? await query.upsert({ user_id: session.user.id, track_id: trackId })
      : await query.delete().eq('user_id', session.user.id).eq('track_id', trackId);
    if (error) console.warn('[DVerse] setLibrary error:', error.message);
  }

  async function listLibrary() {
    if (!client) return [];
    const session = currentSession || await getSession();
    if (!session?.user?.id) return [];
    try {
      const { data, error } = await client
        .from('dtunes_library')
        .select('created_at, track_id, dtunes_tracks(*)')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });
      if (error) {
        console.warn('[DVerse] listLibrary select error:', error.message);
        return [];
      }
      return (data || []).map((row) => songFromTrack(row.dtunes_tracks, row.track_id)).filter(Boolean);
    } catch (err) {
      console.warn('[DVerse] listLibrary exception:', err);
      return [];
    }
  }

  async function listPlaylists() {
    if (!client) return [];
    const session = currentSession || await getSession();
    if (!session?.user?.id) return [];
    try {
      const { data, error } = await client
        .from('dtunes_playlists')
        .select('*, dtunes_playlist_items(position, track_id, dtunes_tracks(*))')
        .eq('user_id', session.user.id)
        .order('updated_at', { ascending: false });
      if (error) {
        console.warn('[DVerse] listPlaylists select error:', error.message);
        return [];
      }
      return (data || []).map((playlist) => ({
        ...playlist,
        songs: (playlist.dtunes_playlist_items || [])
          .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
          .map((item) => songFromTrack(item.dtunes_tracks, item.track_id))
          .filter(Boolean)
      }));
    } catch (err) {
      console.warn('[DVerse] listPlaylists exception:', err);
      return [];
    }
  }

  async function findPlaylistByName(name) {
    const session = await getSession();
    if (!client || !session || !name) return null;
    const { data, error } = await client
      .from('dtunes_playlists')
      .select('id, name')
      .eq('user_id', session.user.id)
      .eq('name', name)
      .limit(1);
    if (error) throw error;
    return data?.[0] || null;
  }

  async function savePlaylist(name, songs = [], style = null) {
    const session = await getSession();
    if (!client || !session || !name) return null;
    const existing = await findPlaylistByName(name);
    const playlistPatch = {
      user_id: session.user.id,
      name,
      updated_at: new Date().toISOString()
    };
    if (style && typeof style === 'object') {
      playlistPatch.style = style;
    }
    const { data: playlist, error: playlistError } = existing
      ? await client.from('dtunes_playlists').update(playlistPatch).eq('id', existing.id).select().single()
      : await client.from('dtunes_playlists').insert(playlistPatch).select().single();
    if (playlistError) throw playlistError;

    const normalizedSongs = (songs || []).filter((song) => song && song.id);
    for (const song of normalizedSongs) {
      await upsertTrack(song);
    }

    const { error: deleteError } = await client
      .from('dtunes_playlist_items')
      .delete()
      .eq('playlist_id', playlist.id);
    if (deleteError) throw deleteError;

    if (normalizedSongs.length) {
      const { error: itemError } = await client.from('dtunes_playlist_items').insert(
        normalizedSongs.map((song, index) => ({
          playlist_id: playlist.id,
          track_id: String(song.id),
          position: index
        }))
      );
      if (itemError) throw itemError;
    }

    return playlist;
  }

  async function deletePlaylist(name) {
    const existing = await findPlaylistByName(name);
    if (!client || !existing) return;
    const { error } = await client.from('dtunes_playlists').delete().eq('id', existing.id);
    if (error) throw error;
  }

  async function getPlaybackState() {
    const session = await getSession();
    if (!client || !session) return null;
    const { data, error } = await client
      .from('dtunes_playback_state')
      .select('track_id, playback_state, updated_at')
      .eq('user_id', session.user.id)
      .maybeSingle();
    if (error) throw error;
    if (!data?.playback_state) return null;
    return {
      ...data.playback_state,
      track_id: data.track_id,
      updated_at: data.updated_at || data.playback_state.updated_at
    };
  }

  async function savePlaybackState(playbackState = {}) {
    const session = await getSession();
    if (!client || !session || !playbackState?.track?.id) return null;
    const track = await upsertTrack(playbackState.track);
    const payload = {
      ...playbackState,
      updated_at: playbackState.updated_at || new Date().toISOString()
    };
    const { data, error } = await client
      .from('dtunes_playback_state')
      .upsert({
        user_id: session.user.id,
        track_id: track?.id || null,
        playback_state: payload,
        updated_at: payload.updated_at
      }, { onConflict: 'user_id' })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  function savePlaybackStateFast(playbackState = {}) {
    if (!client || !currentSession?.access_token || !playbackState?.track?.id) return false;
    const payload = {
      ...playbackState,
      updated_at: playbackState.updated_at || new Date().toISOString()
    };
    fetch(`${SUPABASE_URL}/rest/v1/dtunes_playback_state?on_conflict=user_id`, {
      method: 'POST',
      keepalive: true,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${currentSession.access_token}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates'
      },
      body: JSON.stringify([{
        user_id: currentSession.user.id,
        track_id: null,
        playback_state: payload,
        updated_at: payload.updated_at
      }])
    }).catch((error) => console.warn('[DVerse] Fast playback save failed:', error));
    return true;
  }

  async function fetchListeningStats(limit = 20) {
    if (!client) return [];
    const session = await getSession();
    if (!session) return [];
    const { data, error } = await client
      .from('dtunes_listening_stats')
      .select('play_count, total_duration_ms, last_played_at, dtunes_tracks(*)')
      .eq('user_id', session.user.id)
      .order('total_duration_ms', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  }

  async function fetchListeningDaily(limit = 14) {
    if (!client) return [];
    const session = await getSession();
    if (!session) return [];
    const { data, error } = await client
      .from('dtunes_listening_daily')
      .select('day, play_count, total_duration_ms')
      .eq('user_id', session.user.id)
      .order('day', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  }

  async function fetchProfile(userId = null) {
    if (!client) return null;
    const session = currentSession || await getSession();
    const effectiveUserId = userId || session?.user?.id;
    if (!effectiveUserId) return null;
    try {
      const { data, error } = await client
        .from('profiles')
        .select('id, display_name, avatar_url, email, updated_at')
        .eq('id', effectiveUserId)
        .maybeSingle();
      if (error) {
        console.warn('[DVerse] fetchProfile select error:', error.message);
        return null;
      }
      return data || null;
    } catch (err) {
      console.warn('[DVerse] fetchProfile exception:', err);
      return null;
    }
  }

  async function updateProfile(profilePatch = {}) {
    if (!client) return null;
    const session = currentSession || await getSession();
    if (!session?.user?.id) return null;
    try {
      const payload = {
        id: session.user.id,
        updated_at: new Date().toISOString()
      };
      if (profilePatch.display_name !== undefined) payload.display_name = profilePatch.display_name;
      if (profilePatch.avatar_url !== undefined) payload.avatar_url = profilePatch.avatar_url;
      if (profilePatch.email !== undefined) payload.email = profilePatch.email;

      const { data, error } = await client
        .from('profiles')
        .upsert(payload, { onConflict: 'id' })
        .select('id, display_name, avatar_url, email, updated_at')
        .single();
      if (error) {
        console.warn('[DVerse] updateProfile error:', error.message);
        return null;
      }
      return data;
    } catch (err) {
      console.warn('[DVerse] updateProfile exception:', err);
      return null;
    }
  }

  window.dverse = {
    supabase: client,
    isConfigured: ready,
    getSession,
    bootstrapFromPortal,
    onAuthStateChange,
    signInWithGoogle,
    signOut,
    dtunes: {
      recordPlay,
      listHistory,
      setLiked,
      listLikes,
      setLibrary,
      listLibrary,
      listPlaylists,
      savePlaylist,
      deletePlaylist,
      upsertTrack,
      getPlaybackState,
      savePlaybackState,
      savePlaybackStateFast,
      fetchListeningStats,
      fetchListeningDaily,
      fetchProfile,
      updateProfile
    }
  };
  window.dispatchEvent(new CustomEvent('dverse:ready', { detail: { configured: ready } }));
})();
