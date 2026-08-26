const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const mutationSource = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'js', 'app-v2-mutation-tracking-parity.js'),
  'utf8'
);
const originSource = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'js', 'app-v2-realtime-origin-parity.js'),
  'utf8'
);

let apiOptions = null;
let createdUrl = '';
let closed = 0;
const listeners = new Map();

class FakeEventSource {
  static CLOSED = 2;
  constructor(url) {
    createdUrl = url;
    this.readyState = 1;
  }
  addEventListener(type, handler) { listeners.set(type, handler); }
  close() { closed += 1; this.readyState = FakeEventSource.CLOSED; }
}

const app = {
  async api(url, options = {}) {
    apiOptions = options;
    return { ok: true };
  },
  beginLocalMutation() {},
  endLocalMutation() {},
  realtimeSource: null,
  realtimeEverReady: false,
  setRealtimeState() {},
  realtimeReadySyncChange() { return null; },
  scheduleRealtimeRefresh() {},
  realtimeIsGlobalChange(change) { return change.scope === 'global' || change.scope === 'workspace'; }
};

const context = {
  app,
  console,
  crypto: { randomUUID: () => '12345678-1234-4234-8234-123456789abc' },
  EventSource: FakeEventSource,
  window: { EventSource: FakeEventSource },
  navigator: { onLine: true },
  encodeURIComponent
};

vm.runInNewContext(mutationSource, context);
vm.runInNewContext(originSource, context);

assert.strictEqual(app.clientSessionId, 'nm-12345678-1234-4234-8234-123456789abc');
app.connectRealtime();
assert.strictEqual(
  createdUrl,
  `/api/realtime/stream?clientId=${encodeURIComponent(app.clientSessionId)}`,
  'SSE stream must register the same ephemeral client id used by echo-safe API requests'
);
assert.ok(listeners.has('ready'));
assert.ok(listeners.has('change'));

(async () => {
  await app.api('/api/items/item-1/columns/status/conditional', { method: 'PATCH', body: '{}' });
  assert.strictEqual(
    apiOptions.headers['X-New-Monday-Client-Id'],
    app.clientSessionId,
    'conditional cell PATCH is echo-safe and must carry the ephemeral origin id'
  );

  await app.api('/api/items/item-1', { method: 'PATCH', body: '{}' });
  assert.strictEqual(
    apiOptions.headers['X-New-Monday-Client-Id'],
    undefined,
    'generic mutations must keep their SSE echo until their local side-effects are explicitly proven echo-safe'
  );

  app.connectRealtime();
  assert.strictEqual(closed, 1, 'reconnecting must close the previous SSE stream');
  console.log('realtime origin client tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
