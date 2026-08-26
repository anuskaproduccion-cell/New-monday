const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

(async () => {
  const realtimeSource = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'js', 'app-v2-realtime-parity.js'),
    'utf8'
  );
  const batchSource = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'js', 'app-v2-realtime-batch-parity.js'),
    'utf8'
  );

  let now = 1000;
  let timerId = 0;
  let scheduledDelay = null;
  let scheduledCallback = null;
  let applied = null;
  const app = {
    init() {},
    currentBoardId: () => 'board-1'
  };

  const context = {
    app,
    window: {},
    document: {},
    navigator: {},
    console,
    Date: { now: () => now },
    setTimeout(callback, delay) {
      timerId += 1;
      scheduledCallback = callback;
      scheduledDelay = delay;
      return timerId;
    },
    clearTimeout() {}
  };

  vm.runInNewContext(realtimeSource, context);
  vm.runInNewContext(batchSource, context);
  app.realtimeInteractionInProgress = () => false;
  app.applyRealtimeChange = async change => { applied = change; };

  app.scheduleRealtimeRefresh(
    { board: 'board-1', item: 'item-1', type: 'column_value_changed', meta: { cascadedCount: 0 } },
    350
  );
  assert.strictEqual(scheduledDelay, 350, 'first event should retain the normal debounce');

  now = 2100;
  app.scheduleRealtimeRefresh(
    { board: 'board-1', item: 'item-2', type: 'item_updated' },
    350
  );
  assert.strictEqual(scheduledDelay, 100, 'sustained events must be capped by the 1200ms batch latency');
  assert.strictEqual(app.realtimePendingChange.meta.itemsOnly, true);

  await scheduledCallback();
  assert.ok(applied, 'bounded timer must eventually apply the pending batch');
  assert.strictEqual(applied.meta.itemsOnly, true);
  assert.strictEqual(app.realtimePendingChange, null);
  assert.strictEqual(app.realtimeBatchStartedAt, 0);

  let interactionRetryDelay = null;
  context.setTimeout = (callback, delay) => {
    scheduledCallback = callback;
    interactionRetryDelay = delay;
    return ++timerId;
  };
  app.realtimeInteractionInProgress = () => true;
  now = 3000;
  app.scheduleRealtimeRefresh({ board: 'board-1', item: 'item-3', type: 'item_updated' }, 0);
  await scheduledCallback();
  assert.strictEqual(interactionRetryDelay, 700, 'active editing/local mutation remains the safety exception to max latency');
  assert.ok(app.realtimePendingChange, 'pending change must be retained while interaction is active');

  console.log('realtime batch latency tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
