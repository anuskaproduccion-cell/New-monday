const assert = require('assert');
const {
  currentClientId,
  normalizeClientId,
  requestContextMiddleware,
  runWithRequestContext
} = require('../services/requestContext');

(async () => {
  assert.strictEqual(normalizeClientId('client-1'), 'client-1');
  assert.strictEqual(normalizeClientId(' nm.tab:2 '), 'nm.tab:2');
  assert.strictEqual(normalizeClientId('bad client id'), '');
  assert.strictEqual(normalizeClientId('x'.repeat(97)), '');

  assert.strictEqual(currentClientId(), '');
  await runWithRequestContext({ clientId: 'client-async' }, async () => {
    assert.strictEqual(currentClientId(), 'client-async');
    await Promise.resolve();
    assert.strictEqual(currentClientId(), 'client-async', 'AsyncLocalStorage context must survive awaits');
  });
  assert.strictEqual(currentClientId(), '');

  let nextCalled = false;
  await new Promise((resolve, reject) => {
    const req = {
      headers: { 'x-new-monday-client-id': 'client-header' },
      get(name) { return this.headers[String(name).toLowerCase()] || ''; }
    };
    requestContextMiddleware(req, {}, async () => {
      try {
        nextCalled = true;
        assert.strictEqual(currentClientId(), 'client-header');
        await Promise.resolve();
        assert.strictEqual(currentClientId(), 'client-header');
        resolve();
      } catch (error) { reject(error); }
    });
  });
  assert.strictEqual(nextCalled, true);

  console.log('request context tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
