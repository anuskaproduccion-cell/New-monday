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
  const relatedChanges = [];
  const app = {
    localMutationsInFlight: 0,
    currentBoard: { _id: 'board-1' },
    beginLocalMutation() { this.localMutationsInFlight += 1; },
    endLocalMutation() { this.localMutationsInFlight = Math.max(0, this.localMutationsInFlight - 1); },
    currentBoardId() { return this.currentBoard?._id || ''; },
    realtimeBoardAffectsCurrentBoard(change = {}) {
      return String(change.board || '') === 'board-1' && this.currentBoardId() === 'board-2';
    },
    scheduleRelatedBoardRealtimeRefresh(change, delay) {
      relatedChanges.push({ change, delay });
    },
    async api(url, options = {}) {
      lastOptions = options;
      if (String(options.method || 'GET').toUpperCase() === 'PATCH') {
        await gate;
        return {
          item: { _id: 'item-1', board: 'board-1' },
          cascaded: []
        };
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
  assert.strictEqual(app.realtimeOwnEchoSafeRequest('/api/items/a/columns/status/conditional', 'PATCH'), true);
  assert.strictEqual(app.realtimeOwnEchoSafeRequest('/api/item-ordering/reorder', 'POST'), true);
  assert.strictEqual(app.realtimeOwnEchoSafeRequest('/api/item-ordering/reorder?source=drag', 'POST'), true);
  assert.strictEqual(app.realtimeOwnEchoSafeRequest('/api/item-ordering/a/subitems/reorder', 'POST'), false);
  assert.strictEqual(app.realtimeOwnEchoSafeRequest('/api/items/a', 'PATCH'), false);
  assert.strictEqual(app.realtimeOwnEchoSafeRequest('/api/items', 'GET'), false);

  const cellChange = app.realtimeOwnEchoChangeForRequest(
    '/api/items/item%201/columns/status%20x/conditional',
    'PATCH',
    { cascaded: [{ _id: 'a' }, { _id: 'b' }] }
  );
  assert.strictEqual(cellChange.item, 'item 1');
  assert.strictEqual(cellChange.field, 'status x');
  assert.strictEqual(cellChange.type, 'column_value_changed');
  assert.strictEqual(cellChange.meta.cascadedCount, 2);
  assert.strictEqual(app.realtimeOwnEchoChangeForRequest('/api/items', 'POST', { _id: 'new-1' }).type, 'item_created');
  assert.strictEqual(app.realtimeOwnEchoChangeForRequest('/api/items/sub-1/move', 'POST', {}).type, 'item_moved');
  assert.strictEqual(app.realtimeOwnEchoChangeForRequest('/api/items/sub-1/archive', 'POST', {}).type, 'item_archived');
  assert.strictEqual(app.realtimeOwnEchoChangeForRequest('/api/items/sub-1/unarchive', 'POST', {}).type, 'item_unarchived');
  assert.strictEqual(app.realtimeOwnEchoChangeForRequest('/api/items/sub-1/restore', 'POST', {}).type, 'item_restored');
  assert.strictEqual(app.realtimeOwnEchoChangeForRequest('/api/items/sub-1', 'DELETE', { item: { _id: 'sub-1' } }).type, 'item_trashed');
  assert.strictEqual(app.realtimeOwnEchoChangeForRequest('/api/item-ordering/reorder', 'POST', {}).type, 'item_ordering_changed');

  await app.api('/api/items');
  assert.strictEqual(app.localMutationsInFlight, 0, 'GET requests must not block realtime');
  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(lastOptions.headers, 'X-New-Monday-Client-Id'),
    false,
    'ordinary reads must not carry the realtime suppression id'
  );

  const mutation = app.api('/api/items/item-1/columns/status/conditional', {
    method: 'PATCH',
    body: '{}',
    headers: { 'X-Custom-Test': 'kept' }
  });
  await Promise.resolve();
  assert.strictEqual(app.localMutationsInFlight, 1, 'PATCH must remain tracked while request is in flight');
  assert.strictEqual(lastOptions.headers['X-Custom-Test'], 'kept', 'existing request headers must be preserved');
  assert.strictEqual(
    lastOptions.headers['X-New-Monday-Client-Id'],
    app.clientSessionId,
    'concurrent-safe cell writes may suppress their own redundant SSE echo'
  );

  app.currentBoard = { _id: 'board-2' };
  releaseMutation();
  await mutation;
  assert.strictEqual(app.localMutationsInFlight, 0, 'successful mutation must release the tracker');
  assert.strictEqual(relatedChanges.length, 1, 'navigating to a board related to the mutation source must restore reconciliation after own-echo suppression');
  assert.strictEqual(relatedChanges[0].delay, 0);
  assert.strictEqual(relatedChanges[0].change.board, 'board-1');
  assert.strictEqual(relatedChanges[0].change.item, 'item-1');
  assert.strictEqual(relatedChanges[0].change.type, 'column_value_changed');
  assert.strictEqual(relatedChanges[0].change.meta.cascadedCount, 0);

  app.currentBoard = { _id: 'board-1' };
  await app.api('/api/item-ordering/reorder', { method: 'POST', body: '{}' });
  assert.strictEqual(
    lastOptions.headers['X-New-Monday-Client-Id'],
    app.clientSessionId,
    'proven-safe item ordering must carry the realtime suppression id'
  );
  assert.strictEqual(relatedChanges.length, 1, 'staying on the source board must not schedule a relational refresh');

  app.currentBoard = { _id: 'board-3' };
  await app.api('/api/items/new-1/archive', { method: 'POST', body: '{}' });
  assert.strictEqual(relatedChanges.length, 1, 'navigating to an unrelated board must not schedule extra work');

  let structuralOptions = null;
  const structuralApp = {
    localMutationsInFlight: 0,
    beginLocalMutation() { this.localMutationsInFlight += 1; },
    endLocalMutation() { this.localMutationsInFlight = Math.max(0, this.localMutationsInFlight - 1); },
    async api(url, options = {}) { structuralOptions = options; return { ok: true }; }
  };
  vm.runInNewContext(source, {
    app: structuralApp,
    console,
    crypto: { randomUUID: () => 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff' }
  });
  await structuralApp.api('/api/workspaces/workspace-1/folders', { method: 'POST', body: '{}' });
  assert.strictEqual(structuralApp.localMutationsInFlight, 0);
  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(structuralOptions.headers, 'X-New-Monday-Client-Id'),
    false,
    'structural writes keep their realtime reconciliation echo until explicitly proven safe'
  );

  let failedRelatedRefreshes = 0;
  const failingApp = {
    localMutationsInFlight: 0,
    currentBoard: { _id: 'board-1' },
    beginLocalMutation() { this.localMutationsInFlight += 1; },
    endLocalMutation() { this.localMutationsInFlight = Math.max(0, this.localMutationsInFlight - 1); },
    currentBoardId() { return this.currentBoard?._id || ''; },
    realtimeBoardAffectsCurrentBoard() { return true; },
    scheduleRelatedBoardRealtimeRefresh() { failedRelatedRefreshes += 1; },
    async api() { throw new Error('request failed'); }
  };
  vm.runInNewContext(source, {
    app: failingApp,
    console,
    crypto: { randomUUID: () => 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' }
  });
  failingApp.currentBoard = { _id: 'board-2' };
  await assert.rejects(() => failingApp.api('/api/items/item-2', { method: 'DELETE' }), /request failed/);
  assert.strictEqual(failingApp.localMutationsInFlight, 0, 'failed mutation must release the tracker in finally');
  assert.strictEqual(failedRelatedRefreshes, 0, 'failed writes must never schedule synthetic related-board reconciliation');

  let warnings = 0;
  const resilientApp = {
    localMutationsInFlight: 0,
    currentBoard: { _id: 'board-1' },
    beginLocalMutation() { this.localMutationsInFlight += 1; },
    endLocalMutation() { this.localMutationsInFlight = Math.max(0, this.localMutationsInFlight - 1); },
    currentBoardId() { return this.currentBoard?._id || ''; },
    realtimeBoardAffectsCurrentBoard() { return true; },
    scheduleRelatedBoardRealtimeRefresh() { throw new Error('visual refresh failed'); },
    async api() { return { item: { _id: 'item-9' }, cascaded: [] }; }
  };
  vm.runInNewContext(source, {
    app: resilientApp,
    console: { ...console, warn() { warnings += 1; } },
    crypto: { randomUUID: () => '99999999-bbbb-4ccc-8ddd-eeeeeeeeeeee' }
  });
  const resilientWrite = resilientApp.api('/api/items/item-9/columns/status/conditional', { method: 'PATCH', body: '{}' });
  resilientApp.currentBoard = { _id: 'board-2' };
  const resilientResponse = await resilientWrite;
  assert.strictEqual(resilientResponse.item._id, 'item-9', 'a successful data mutation must remain successful even if related-board repaint scheduling fails');
  assert.strictEqual(warnings, 1, 'reconciliation failures should be isolated and observable');

  console.log('local API mutation tracking tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
