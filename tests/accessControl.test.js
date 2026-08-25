const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  authRequired,
  assertAuthConfiguration,
  safeEqual,
  parseCookies,
  createSessionToken,
  verifySessionToken,
  serializeSessionCookie,
  clearSessionCookie,
  createLoginAttemptLimiter,
  securityHeadersMiddleware
} = require('../services/accessControl');

assert.strictEqual(authRequired({ NEW_MONDAY_REQUIRE_AUTH: 'true' }), true);
assert.strictEqual(authRequired({ NEW_MONDAY_REQUIRE_AUTH: 'false' }), false);
assert.deepStrictEqual(assertAuthConfiguration({ NEW_MONDAY_REQUIRE_AUTH: 'false' }), { required: false });
assert.throws(() => assertAuthConfiguration({ NEW_MONDAY_REQUIRE_AUTH: 'true' }), /ACCESS_PASSWORD/);
assert.throws(() => assertAuthConfiguration({
  NEW_MONDAY_REQUIRE_AUTH: 'true',
  NEW_MONDAY_ACCESS_PASSWORD: '123456789012',
  NEW_MONDAY_SESSION_SECRET: 'short'
}), /SESSION_SECRET/);
assert.deepStrictEqual(assertAuthConfiguration({
  NEW_MONDAY_REQUIRE_AUTH: 'true',
  NEW_MONDAY_ACCESS_PASSWORD: '123456789012',
  NEW_MONDAY_SESSION_SECRET: 'x'.repeat(32)
}), { required: true });

assert.strictEqual(safeEqual('same', 'same'), true);
assert.strictEqual(safeEqual('same', 'different'), false);
assert.deepStrictEqual(parseCookies('a=1; nm_session=abc%2Edef; z=9'), { a: '1', nm_session: 'abc.def', z: '9' });

const secret = 's'.repeat(48);
const now = 1_700_000_000_000;
const token = createSessionToken(secret, now);
assert.strictEqual(verifySessionToken(token, secret, now + 1000), true);
assert.strictEqual(verifySessionToken(token, 'wrong'.repeat(10), now + 1000), false);
assert.strictEqual(verifySessionToken(token, secret, now + (13 * 60 * 60 * 1000)), false);
assert.strictEqual(verifySessionToken(`${token}tamper`, secret, now + 1000), false);

const cookie = serializeSessionCookie(token, { secure: true });
assert.ok(cookie.includes('HttpOnly'));
assert.ok(cookie.includes('SameSite=Strict'));
assert.ok(cookie.includes('Secure'));
assert.ok(clearSessionCookie({ secure: false }).includes('Max-Age=0'));

let clock = 1000;
const limiter = createLoginAttemptLimiter({ maxFailures: 3, windowMs: 5000, now: () => clock });
assert.deepStrictEqual(limiter.check('ip'), { allowed: true, retryAfterMs: 0 });
assert.strictEqual(limiter.failure('ip'), 1);
assert.strictEqual(limiter.failure('ip'), 2);
assert.strictEqual(limiter.failure('ip'), 3);
assert.strictEqual(limiter.check('ip').allowed, false);
assert.ok(limiter.check('ip').retryAfterMs > 0);
limiter.success('ip');
assert.strictEqual(limiter.check('ip').allowed, true);
limiter.failure('ip');
clock += 5001;
assert.strictEqual(limiter.check('ip').allowed, true);

const headers = {};
let nextCalled = false;
securityHeadersMiddleware()(
  { secure: true, headers: {} },
  { setHeader: (key, value) => { headers[key] = value; } },
  () => { nextCalled = true; }
);
assert.strictEqual(nextCalled, true);
assert.strictEqual(headers['X-Frame-Options'], 'DENY');
assert.strictEqual(headers['X-Content-Type-Options'], 'nosniff');
assert.ok(headers['Content-Security-Policy'].includes("frame-ancestors 'none'"));
assert.ok(headers['Strict-Transport-Security'].includes('max-age='));

const loginHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'login.html'), 'utf8');
assert.ok(loginHtml.includes('<script src="/js/login.js"></script>'));
assert.strictEqual(/<script(?![^>]*\bsrc=)[^>]*>/i.test(loginHtml), false, 'login page must not contain inline scripts under strict CSP');

console.log('accessControl tests passed');
