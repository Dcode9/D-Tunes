const handler = require('../server');

const API_CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'Content-Type, Authorization, X-Requested-With',
  'access-control-max-age': '86400',
};

function applyApiHeaders(res, pathname) {
  if (typeof res.setHeader !== 'function') return;
  for (const [key, value] of Object.entries(API_CORS_HEADERS)) {
    try { res.setHeader(key, value); } catch (_) {}
  }
  if (pathname && pathname.startsWith('/api/')) {
    try { res.setHeader('cache-control', 'no-store, private'); } catch (_) {}
  }
}

module.exports = async (req, res) => {
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  let pathname = '/';
  try {
    pathname = new URL(req.url || '/', `${protocol}://${host}`).pathname;
  } catch (_) {}

  if (req.method === 'OPTIONS') {
    applyApiHeaders(res, pathname);
    res.statusCode = 204;
    if (typeof res.end === 'function') return res.end();
    return;
  }

  const originalWriteHead = typeof res.writeHead === 'function' ? res.writeHead.bind(res) : null;
  if (originalWriteHead) {
    res.writeHead = (statusCode, statusMessage, headers) => {
      let outHeaders = headers;
      let outStatusMessage = statusMessage;
      if (statusMessage && typeof statusMessage === 'object' && !Array.isArray(statusMessage)) {
        outHeaders = statusMessage;
        outStatusMessage = undefined;
      }
      const merged = { ...(outHeaders || {}) };
      for (const [key, value] of Object.entries(API_CORS_HEADERS)) merged[key] = value;
      if (pathname && pathname.startsWith('/api/')) merged['cache-control'] = 'no-store, private';
      return outStatusMessage !== undefined
        ? originalWriteHead(statusCode, outStatusMessage, merged)
        : originalWriteHead(statusCode, merged);
    };
  } else {
    applyApiHeaders(res, pathname);
  }

  try {
    return await handler(req, res);
  } finally {
    if (originalWriteHead) res.writeHead = originalWriteHead;
  }
};
