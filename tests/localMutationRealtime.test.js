const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

(async () => {
  const concurrencySource = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'js', 'app-v2-concurrency-parity.js'),
    'utf8'
  );
  const realtimeSource = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'js', 'app-v2-realtime-parity.js'),
    'utf8'
  );

  let releasePatch;
  const patchGate = new Promise(resolve => { releasePatch = resolve; });
  const app = {
    init() {},
    items: [{ _id: 'item-1', updatedAt: '2026-08-26T10:00:00.000Z' }],
    findItem(id) { return this.items.find(item => String(item._id) === String(id)); },
    async reloadItems() {},
    async api(url) {
      if (url.includes('/conditional')) {
        await patchGate;
        return { item: { _id: 'item-1', updatedAt: '2026-08-26T10:01:00.000Z' }, cascaded: [] };
      }
      return {};
    },
    replaceItem(updated) {
      const index = this.items.findIndex(item => item._id === updated._id);
      if (index >= 0) this.items[index] = updated;
    },
    showToast() {},
    renderCurrentView() {}
  };

  const document = {
    activeElement: { matches: () => false },
    querySelector: () => null
  };

  vm.runInNewContext(concurrencySource, { app, console });
  vm.runInNewContext(realtimeSource, {
    app,
    window: {},
    document,
    navigator: {},
    console,
    setTimeout,
    clearTimeout
  });

  assert.strictEqual(app.hasLocalMutationInFlight(), false);
  assert.strictEqual(app.realtimeInteractionInProgress(), false);

  const write = app.updateColumnValue('item-1', 'status', { type: 'status', label: 'Done' });
  await Promise.resolve();
  assert.strictEqual(app.hasLocalMutationInFlight(), true, 'local PATCH must be visible while the request is pending');
  assert.strictEqual(app.realtimeInteractionInProgress(), true, 'realtime refresh must defer while a local PATCH is pending');

  releasePatch();
  await write;
  assert.strictEqual(app.hasLocalMutationInFlight(), false, 'local mutation counter must return to zero after success');
  assert.strictEqual(app.realtimeInteractionInProgress(), false);

  const failingApp = {
    init() {},
    items: [{ _id: 'item-2', updatedAt: '2026-08-26T10:00:00.000Z' }],
    findItem(id) { return this.items.find(item => String(item._id) === String(id)); },
    async reloadItems() {},
    async api() { throw new Error('network failed'); },
    replaceItem() {},
    showToast() {},
    renderCurrentView() {}
  };
  vm.runInNewContext(concurrencySource, { app: failingApp, console });
  const failed = await failingApp.updateColumnValue('item-2', 'status', { type: 'status', label: 'Stuck' });
  assert.strictEqual(failed, null);
  assert.strictEqual(failingApp.hasLocalMutationInFlight(), false, 'counter must be released after a failed PATCH');

  console.log('local mutation realtime coordination tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
