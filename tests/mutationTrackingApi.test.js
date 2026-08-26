const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

(async () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'js', 'app-v2-mutation-tracking-parity.js'),
    'utf8'
  );

  let releaseMutation;
  let lastOptions = null;
  const gate = new Promise(resolve => { releaseMutation = resolve; });
  const app = {
    localMutationsInFlight: 0,
    beginLocalMutation() { this.localMutationsInFlight += 1; },
    endLocalMutation() { this.localMutationsInFlight = Math.max(0, this.localMutationsInFlight - 1); },
    async api(url, options = {}) {
      lastOptions = options;
      if (String(options.method || 'GET').toUpperCase() === 'PATCH') {
        await gate;
        return { ok: true };
      }
      return { ok: true };
    }
  };

  vm.runInNewContext(source, {
    app,
    console,
    crypto: { randomUUID: () => '11111111-2222-4333-8444-555555555555' }
  });

  assert.strictEqual(app.clientSessionId, 'nm-11111111-2222-4333-8444-555555555555');
  await app.api('/api/items');
  assert.strictEqual(app.localMutationsInFlight, 0, 'GET requests must not block realtime');
  assert.strictEqual(
    lastOptions.headers['X-New-Monday-Client-Id'],
    app.clientSessionId,
    'API requests must carry the same ephemeral client id used by realtime'
  );

  const mutation = app.api('/api/items/item-1', {
    method: 'PATCH',
    body: '{}',
    headers: { 'X-Custom-Test': 'kept' }
  });
  await Promise.resolve();
  assert.strictEqual(app.localMutationsInFlight, 1, 'PATCH must remain tracked while request is in flight');
  assert.strictEqual(lastOptions.headers['X-Custom-Test'], 'kept', 'existing request headers must be preserved');
  assert.strictEqual(lastOptions.headers['X-New-Monday-Client-Id'], app.clientSessionId);
  releaseMutation();
  await mutation;
  assert.strictEqual(app.localMutationsInFlight, 0, 'successful mutation must release the tracker');

  const failingApp = {
    localMutationsInFlight: 0,
    beginLocalMutation() { this.localMutationsInFlight += 1; },
    endLocalMutation() { this.localMutationsInFlight = Math.max(0, this.localMutationsInFlight - 1); },
    async api() { throw new Error('request failed'); }
  };
  vm.runInNewContext(source, {
    app: failingApp,
    console,
    crypto: { randomUUID: () => 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' }
  });
  await assert.rejects(() => failingApp.api('/api/items/item-2', { method: 'DELETE' }), /request failed/);
  assert.strictEqual(failingApp.localMutationsInFlight, 0, 'failed mutation must release the tracker in finally');

  console.log('local API mutation tracking tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
