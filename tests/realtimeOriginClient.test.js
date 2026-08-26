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
  const assertEchoSafe = async (url, method, message) => {
    await app.api(url, { method, body: '{}' });
    assert.strictEqual(apiOptions.headers['X-New-Monday-Client-Id'], app.clientSessionId, message);
  };
  const assertEchoRequired = async (url, method, message) => {
    await app.api(url, { method, body: '{}' });
    assert.strictEqual(apiOptions.headers['X-New-Monday-Client-Id'], undefined, message);
  };

  await assertEchoSafe(
    '/api/items/item-1/columns/status/conditional',
    'PATCH',
    'conditional cell PATCH is echo-safe'
  );
  await assertEchoSafe('/api/items', 'POST', 'item creation is canonical in its local response');
  await assertEchoSafe('/api/items/item-1/move', 'POST', 'item move only mutates the returned item');
  await assertEchoSafe('/api/items/item-1/archive', 'POST', 'item archive only mutates the returned item');
  await assertEchoSafe('/api/items/item-1/unarchive', 'POST', 'item unarchive only mutates the returned item');
  await assertEchoSafe('/api/items/item-1/restore', 'POST', 'item restore only mutates the returned item');
  await assertEchoSafe('/api/items/item-1', 'DELETE', 'moving an item to trash only mutates that item');
  await assertEchoSafe(
    '/api/item-ordering/reorder',
    'POST',
    'top-level item ordering is echo-safe because its client call sites perform an authoritative reload'
  );

  await assertEchoRequired(
    '/api/items/item-1',
    'PATCH',
    'generic item PATCH keeps its echo until all call sites are proven rerender-safe'
  );
  await assertEchoRequired(
    '/api/items/item-1/duplicate',
    'POST',
    'duplicate must keep its echo because the server also shifts sibling ordering'
  );
  await assertEchoRequired(
    '/api/item-ordering/item-1/subitems/reorder',
    'POST',
    'subitem ordering keeps its echo until a client reconciliation path is proven'
  );

  app.connectRealtime();
  assert.strictEqual(closed, 1, 'reconnecting must close the previous SSE stream');
  console.log('realtime origin client tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
