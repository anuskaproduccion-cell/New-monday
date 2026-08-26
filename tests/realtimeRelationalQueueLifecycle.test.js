const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

(async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app-v2-realtime-relational-parity.js'), 'utf8');
  const callbacks = new Map();
  let nextTimerId = 1;
  let refreshes = 0;

  const fakeSetTimeout = fn => {
    const id = nextTimerId++;
    callbacks.set(id, fn);
    return id;
  };
  const fakeClearTimeout = id => callbacks.delete(id);

  const app = {
    currentBoard: {
      _id: 'board-1',
      columns: [{ id: 'rel', type: 'board_relation', settings: { localBoardIds: ['board-2'] } }]
    },
    boards: [{ _id: 'board-1' }, { _id: 'board-2' }],
    items: [],
    realtimeRefreshing: false,
    scheduleRealtimeRefresh() {},
    currentBoardId() { return this.currentBoard?._id || ''; },
    realtimeIsGlobalChange(change = {}) { return ['global', 'workspace'].includes(change.scope); },
    relationTargetBoards(column) {
      const ids = column?.settings?.localBoardIds || [];
      return this.boards.filter(board => ids.includes(board._id));
    },
    mergeRealtimeChanges(current, incoming) { return current ? { ...incoming, item: null, meta: { itemsOnly: true } } : incoming; },
    realtimeNeedsFullShellRefresh(change = {}) { return !change.item && change?.meta?.itemsOnly !== true; },
    realtimeItemRefreshMode() { return 'single'; },
    realtimeInteractionInProgress() { return false; },
    async refreshRelatedBoardFromRealtime() { refreshes += 1; }
  };

  vm.runInNewContext(source, {
    app,
    navigator: { onLine: true },
    console,
    Map,
    Date,
    setTimeout: fakeSetTimeout,
    clearTimeout: fakeClearTimeout,
    encodeURIComponent
  });

  assert.strictEqual(typeof app.clearRelatedBoardRealtimeQueue, 'function');

  app.scheduleRelatedBoardRealtimeRefresh({ board: 'board-2', item: 'item-1', type: 'item_updated' }, 50);
  assert.strictEqual(app.realtimeRelatedPendingChanges.has('board-2'), true);
  assert.strictEqual(app.realtimeRelatedTimers.has('board-2'), true);
  assert.strictEqual(app.realtimeRelatedBatchStartedAt.has('board-2'), true);
  const scheduledTimer = app.realtimeRelatedTimers.get('board-2');
  assert.ok(callbacks.has(scheduledTimer));

  app.currentBoard = { _id: 'board-9', columns: [] };
  await callbacks.get(scheduledTimer)();
  assert.strictEqual(refreshes, 0, 'a source-board event must not refresh after the user changes to an unrelated board');
  assert.strictEqual(app.realtimeRelatedPendingChanges.has('board-2'), false, 'stale pending change must be discarded');
  assert.strictEqual(app.realtimeRelatedTimers.has('board-2'), false, 'stale timer must be discarded');
  assert.strictEqual(app.realtimeRelatedBatchStartedAt.has('board-2'), false, 'stale latency marker must be discarded');

  app.realtimeRelatedPendingChanges.set('board-2', { board: 'board-2', item: 'old-item' });
  app.realtimeRelatedBatchStartedAt.set('board-2', Date.now());
  const orphanTimer = fakeSetTimeout(() => {}, 100);
  app.realtimeRelatedTimers.set('board-2', orphanTimer);
  app.scheduleRelatedBoardRealtimeRefresh({ board: 'board-2', item: 'new-item', type: 'item_updated' }, 0);
  assert.strictEqual(callbacks.has(orphanTimer), false, 'irrelevant scheduling attempt must cancel an existing stale retry timer');
  assert.strictEqual(app.realtimeRelatedPendingChanges.size, 0);
  assert.strictEqual(app.realtimeRelatedTimers.size, 0);
  assert.strictEqual(app.realtimeRelatedBatchStartedAt.size, 0);

  console.log('related realtime queue lifecycle tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
