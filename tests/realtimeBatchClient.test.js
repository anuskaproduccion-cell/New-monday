const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const realtimeSource = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'js', 'app-v2-realtime-parity.js'),
  'utf8'
);
const batchSource = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'js', 'app-v2-realtime-batch-parity.js'),
  'utf8'
);

const app = { init() {} };
const context = {
  app,
  window: {},
  document: {},
  navigator: {},
  console,
  setTimeout,
  clearTimeout
};
vm.runInNewContext(realtimeSource, context);
vm.runInNewContext(batchSource, context);

const sameItem = app.mergeRealtimeChanges(
  { board: 'board-1', item: 'item-1', type: 'column_value_changed', meta: { cascadedCount: 0 } },
  { board: 'board-1', item: 'item-1', type: 'item_updated' }
);
assert.strictEqual(sameItem.item, 'item-1', 'repeated changes for the same item can collapse to one targeted read');
assert.strictEqual(app.realtimeItemRefreshMode(sameItem), 'single');

const differentItems = app.mergeRealtimeChanges(
  { board: 'board-1', item: 'item-1', type: 'column_value_changed', meta: { cascadedCount: 0 } },
  { board: 'board-1', item: 'item-2', type: 'item_updated' }
);
assert.strictEqual(differentItems.item, null, 'different items must never collapse to only the last item');
assert.strictEqual(differentItems.meta.itemsOnly, true);
assert.strictEqual(differentItems.type, 'realtime_items_batch');
assert.strictEqual(app.realtimeNeedsFullShellRefresh(differentItems), false, 'item batches should not rebuild the shell');
assert.strictEqual(app.realtimeItemRefreshMode(differentItems), 'board', 'item batches refresh the board item set once');

const cascadeThenSingle = app.mergeRealtimeChanges(
  { board: 'board-1', item: 'item-1', type: 'column_value_changed', meta: { cascadedCount: 3 } },
  { board: 'board-1', item: 'item-1', type: 'item_updated' }
);
assert.strictEqual(cascadeThenSingle.meta.itemsOnly, true, 'a cascaded change must preserve board-item refresh breadth');
assert.strictEqual(app.realtimeNeedsFullShellRefresh(cascadeThenSingle), false);
assert.strictEqual(app.realtimeItemRefreshMode(cascadeThenSingle), 'board');

const batchThenThirdItem = app.mergeRealtimeChanges(
  differentItems,
  { board: 'board-1', item: 'item-3', type: 'column_value_changed', meta: { cascadedCount: 0 } }
);
assert.strictEqual(batchThenThirdItem.meta.itemsOnly, true, 'an existing batch must remain broad when more items arrive');
assert.strictEqual(batchThenThirdItem.item, null);
assert.strictEqual(app.realtimeItemRefreshMode(batchThenThirdItem), 'board');

const shellThenItem = app.mergeRealtimeChanges(
  { board: 'board-1', type: 'board_updated', message: 'Board metadata changed' },
  { board: 'board-1', item: 'item-2', type: 'item_updated' }
);
assert.strictEqual(shellThenItem.item, null);
assert.strictEqual(shellThenItem.type, 'board_updated');
assert.strictEqual(app.realtimeNeedsFullShellRefresh(shellThenItem), true, 'structural board changes must still rebuild the shell');

const globalThenItem = app.mergeRealtimeChanges(
  { scope: 'workspace', workspace: 'workspace-1', type: 'workspace_folder_updated' },
  { scope: 'board', board: 'board-1', item: 'item-1', type: 'item_updated' }
);
assert.strictEqual(globalThenItem.scope, 'workspace');
assert.strictEqual(globalThenItem.board, null);
assert.strictEqual(globalThenItem.item, null);
assert.strictEqual(app.realtimeIsGlobalChange(globalThenItem), true);

console.log('realtime batch coalescing tests passed');
