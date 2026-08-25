const crypto = require('crypto');

const COOKIE_NAME = 'nm_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 10;

function authRequired(env = process.env) {
  return String(env.NEW_MONDAY_REQUIRE_AUTH || '').toLowerCase() === 'true';
}

function assertAuthConfiguration(env = process.env) {
  if (!authRequired(env)) return { required: false };
  const password = String(env.NEW_MONDAY_ACCESS_PASSWORD || '');
  const secret = String(env.NEW_MONDAY_SESSION_SECRET || '');
  if (password.length < 12) throw new Error('NEW_MONDAY_ACCESS_PASSWORD must contain at least 12 characters when auth is required');
  if (secret.length < 32) throw new Error('NEW_MONDAY_SESSION_SECRET must contain at least 32 characters when auth is required');
  return { required: true };
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function parseCookies(header = '') {
  const result = {};
  for (const chunk of String(header || '').split(';')) {
    const index = chunk.indexOf('=');
    if (index < 0) continue;
    const key = chunk.slice(0, index).trim();
    const value = chunk.slice(index + 1).trim();
    if (key) result[key] = decodeURIComponent(value);
  }
  return result;
}

function signPayload(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function createSessionToken(secret, now = Date.now()) {
  const expiresAt = now + SESSION_TTL_MS;
  const nonce = crypto.randomBytes(12).toString('base64url');
  const payload = `${expiresAt}.${nonce}`;
  const signature = signPayload(payload, secret);
  return `${payload}.${signature}`;
}

function verifySessionToken(token, secret, now = Date.now()) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return false;
  const [expiresAtRaw, nonce, signature] = parts;
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= now || !nonce || !signature) return false;
  const expected = signPayload(`${expiresAtRaw}.${nonce}`, secret);
  return safeEqual(signature, expected);
}

function serializeSessionCookie(token, { secure = true } = {}) {
  const flags = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
  ];
  if (secure) flags.push('Secure');
  return flags.join('; ');
}

function clearSessionCookie({ secure = true } = {}) {
  const flags = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0'
  ];
  if (secure) flags.push('Secure');
  return flags.join('; ');
}

function requestUsesHttps(req) {
  return Boolean(req.secure || String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https');
}

function isAuthenticatedRequest(req, env = process.env) {
  if (!authRequired(env)) return true;
  const secret = String(env.NEW_MONDAY_SESSION_SECRET || '');
  const cookies = parseCookies(req.headers.cookie || '');
  return verifySessionToken(cookies[COOKIE_NAME], secret);
}

function accessMiddleware(env = process.env) {
  return (req, res, next) => {
    if (!authRequired(env)) return next();
    if (isAuthenticatedRequest(req, env)) return next();
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Authentication required' });
    return res.redirect(302, '/login');
  };
}

function createLoginAttemptLimiter({
  maxFailures = LOGIN_MAX_FAILURES,
  windowMs = LOGIN_WINDOW_MS,
  now = () => Date.now()
} = {}) {
  const attempts = new Map();

  function current(key) {
    const id = String(key || 'unknown');
    const entry = attempts.get(id);
    const timestamp = now();
    if (!entry || timestamp - entry.firstFailureAt >= windowMs) {
      if (entry) attempts.delete(id);
      return { id, entry: null, timestamp };
    }
    return { id, entry, timestamp };
  }

  function check(key) {
    const { entry, timestamp } = current(key);
    if (!entry || entry.failures < maxFailures) return { allowed: true, retryAfterMs: 0 };
    return {
      allowed: false,
      retryAfterMs: Math.max(1, windowMs - (timestamp - entry.firstFailureAt))
    };
  }

  function failure(key) {
    const { id, entry, timestamp } = current(key);
    if (!entry) {
      attempts.set(id, { failures: 1, firstFailureAt: timestamp });
      return 1;
    }
    entry.failures += 1;
    attempts.set(id, entry);
    return entry.failures;
  }

  function success(key) {
    attempts.delete(String(key || 'unknown'));
  }

  return { check, failure, success };
}

function securityHeadersMiddleware() {
  return (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; connect-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    );
    if (requestUsesHttps(req)) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    return next();
  };
}

module.exports = {
  COOKIE_NAME,
  SESSION_TTL_MS,
  LOGIN_WINDOW_MS,
  LOGIN_MAX_FAILURES,
  authRequired,
  assertAuthConfiguration,
  safeEqual,
  parseCookies,
  createSessionToken,
  verifySessionToken,
  serializeSessionCookie,
  clearSessionCookie,
  requestUsesHttps,
  isAuthenticatedRequest,
  accessMiddleware,
  createLoginAttemptLimiter,
  securityHeadersMiddleware
};
