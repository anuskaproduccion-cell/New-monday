const assert = require('assert');
const {
  authRequired,
  assertAuthConfiguration,
  safeEqual,
  parseCookies,
  createSessionToken,
  verifySessionToken,
  serializeSessionCookie,
  clearSessionCookie
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

console.log('accessControl tests passed');
