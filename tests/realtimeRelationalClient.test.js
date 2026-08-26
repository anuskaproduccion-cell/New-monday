const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

(async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app-v2-realtime-relational-parity.js'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const relationalScript = '<script src="/js/app-v2-realtime-relational-parity.js"></script>';
  const originScript = '<script src="/js/app-v2-realtime-origin-parity.js"></script>';
  const batchScript = '<script src="/js/app-v2-realtime-batch-parity.js"></script>';
  let baseSchedules = 0;
  let relatedSchedules = 0;

  assert.ok(indexHtml.includes(relationalScript), 'relational realtime bridge must be loaded by the client');
  assert.ok(indexHtml.indexOf(relationalScript) > indexHtml.indexOf(originScript), 'relational bridge must load after own-origin filtering');
  assert.ok(indexHtml.indexOf(relationalScript) > indexHtml.indexOf(batchScript), 'relational bridge must load after bounded batching so it can preserve that scheduler for current-board events');

  const app = {
    currentBoard: {
      _id: 'board-1',
      columns: [
        { id: 'rel-1', type: 'board_relation', settings: { localBoardIds: ['board-2', 'board-3'] } }
      ]
    },
    boards: [
      { _id: 'board-1', columns: [] },
      { _id: 'board-2', columns: [{ id: 'status', type: 'status' }] },
      { _id: 'board-3', columns: [{ id: 'date', type: 'date' }] }
    ],
    items: [],
    realtimeRefreshing: false,
    realtimeLastRefreshAt: 0,
    scheduleRealtimeRefresh() { baseSchedules += 1; },
    currentBoardId() { return this.currentBoard?._id || ''; },
    realtimeIsGlobalChange(change = {}) {
      return ['global', 'workspace'].includes(String(change.scope || '').toLowerCase());
    },
    relationTargetBoards(column) {
      const ids = column?.settings?.localBoardIds || [];
      return this.boards.filter(board => ids.map(String).includes(String(board._id)));
    },
    mergeRealtimeChanges(current, incoming) {
      if (!current) return incoming;
      if (!current.item || !incoming.item || String(current.item) !== String(incoming.item)) {
        return {
          ...incoming,
          board: incoming.board || current.board,
          item: null,
          type: 'realtime_items_batch',
          meta: { ...(current.meta || {}), ...(incoming.meta || {}), itemsOnly: true }
        };
      }
      return incoming;
    },
    realtimeNeedsFullShellRefresh(change = {}) {
      return this.realtimeIsGlobalChange(change) || (!change.item && change?.meta?.itemsOnly !== true);
    },
    realtimeItemRefreshMode(change = {}) {
      if (change?.meta?.itemsOnly === true) return 'board';
      if (change.type === 'column_value_changed') return Number(change.meta?.cascadedCount || 0) > 0 ? 'board' : 'single';
      if (['item_updated', 'item_moved', 'item_created', 'item_unarchived', 'item_restored'].includes(change.type)) return 'single';
      if (['item_archived', 'item_trashed'].includes(change.type)) return 'remove';
      return 'board';
    },
    realtimeInteractionInProgress() { return false; },
    renderCurrentView() {},
    announceA11y() {},
    setRealtimeState() {}
  };

  vm.runInNewContext(source, {
    app,
    navigator: { onLine: true },
    console,
    Map,
    Date,
    setTimeout,
    clearTimeout,
    encodeURIComponent
  });

  assert.strictEqual(typeof app.realtimeBoardAffectsCurrentBoard, 'function');
  assert.strictEqual(typeof app.refreshRelatedBoardFromRealtime, 'function');
  assert.strictEqual(typeof app.scheduleRelatedBoardRealtimeRefresh, 'function');
  assert.strictEqual(app.realtimeBoardAffectsCurrentBoard({ board: 'board-1' }), true, 'current board must remain relevant');
  assert.strictEqual(app.realtimeBoardAffectsCurrentBoard({ board: 'board-2' }), true, 'first related board must be relevant');
  assert.strictEqual(app.realtimeBoardAffectsCurrentBoard({ board: 'board-3' }), true, 'multi-board relation target must be relevant');
  assert.strictEqual(app.realtimeBoardAffectsCurrentBoard({ board: 'board-9' }), false, 'unrelated board must stay ignored');

  const realRelatedScheduler = app.scheduleRelatedBoardRealtimeRefresh;
  app.scheduleRelatedBoardRealtimeRefresh = () => { relatedSchedules += 1; };
  app.scheduleRealtimeRefresh({ board: 'board-1', item: 'local-1', type: 'item_updated' }, 0);
  app.scheduleRealtimeRefresh({ scope: 'workspace', workspace: 'workspace-1', type: 'workspace_updated' }, 0);
  app.scheduleRealtimeRefresh({ board: 'board-2', item: 'remote-1', type: 'item_updated' }, 0);
  app.scheduleRealtimeRefresh({ board: 'board-9', item: 'ignored-1', type: 'item_updated' }, 0);
  assert.strictEqual(baseSchedules, 2, 'current-board and global events must keep the existing realtime scheduler');
  assert.strictEqual(relatedSchedules, 1, 'only a related external board should use the relational scheduler');
  app.scheduleRelatedBoardRealtimeRefresh = realRelatedScheduler;

  const realRelatedRefresh = app.refreshRelatedBoardFromRealtime;
  const scheduledRelatedChanges = [];
  app.refreshRelatedBoardFromRealtime = async change => { scheduledRelatedChanges.push(change); };
  app.scheduleRelatedBoardRealtimeRefresh({ board: 'board-2', item: 'remote-a', type: 'item_updated' }, 5);
  app.scheduleRelatedBoardRealtimeRefresh({ board: 'board-3', item: 'remote-b', type: 'item_updated' }, 5);
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.strictEqual(scheduledRelatedChanges.length, 2, 'different related boards must keep separate realtime queues');
  assert.deepStrictEqual(new Set(scheduledRelatedChanges.map(change => change.board)), new Set(['board-2', 'board-3']));

  scheduledRelatedChanges.length = 0;
  app.scheduleRelatedBoardRealtimeRefresh({ board: 'board-2', item: 'remote-a', type: 'item_updated' }, 20);
  app.scheduleRelatedBoardRealtimeRefresh({ board: 'board-2', item: 'remote-c', type: 'item_updated' }, 20);
  await new Promise(resolve => setTimeout(resolve, 45));
  assert.strictEqual(scheduledRelatedChanges.length, 1, 'two items from the same related board should coalesce into one source-board refresh');
  assert.strictEqual(scheduledRelatedChanges[0].board, 'board-2');
  assert.strictEqual(scheduledRelatedChanges[0].item, null);
  assert.strictEqual(scheduledRelatedChanges[0].meta.itemsOnly, true);
  app.refreshRelatedBoardFromRealtime = realRelatedRefresh;

  let renders = 0;
  let lastApiUrl = '';
  Object.assign(app, {
    items: [
      { _id: 'local-1', board: 'board-1', name: 'Local' },
      { _id: 'remote-1', board: 'board-2', name: 'Anterior', columnValues: { status: { label: 'Working' } } }
    ],
    renderCurrentView() { renders += 1; },
    api: async url => {
      lastApiUrl = url;
      if (url === '/api/items/remote-1') {
        return { _id: 'remote-1', board: 'board-2', name: 'Actualizado', columnValues: { status: { label: 'Done' } } };
      }
      if (url === '/api/items/board/board-2?includeSubitems=true') {
        return [
          { _id: 'remote-1', board: 'board-2', name: 'Actualizado' },
          { _id: 'remote-2', board: 'board-2', name: 'Nuevo relacionado' }
        ];
      }
      if (url === '/api/boards/board-2') {
        return { _id: 'board-2', name: 'Fuente actualizada', columns: [{ id: 'status', type: 'status', title: 'Estado nuevo' }] };
      }
      return [];
    }
  });

  await app.refreshRelatedBoardFromRealtime({
    board: 'board-2',
    item: 'remote-1',
    type: 'column_value_changed',
    meta: { cascadedCount: 0 },
    message: 'Estado actualizado'
  });
  assert.strictEqual(lastApiUrl, '/api/items/remote-1', 'simple related item change must use the directed item endpoint');
  assert.strictEqual(app.items.find(item => item._id === 'remote-1').name, 'Actualizado');
  assert.strictEqual(app.items.find(item => item._id === 'remote-1').columnValues.status.label, 'Done');
  assert.strictEqual(app.items.some(item => item._id === 'local-1'), true, 'refreshing a source board must preserve current-board items');
  assert.strictEqual(renders, 1, 'a related item change must repaint the current view so Mirror updates immediately');

  lastApiUrl = '';
  await app.refreshRelatedBoardFromRealtime({
    board: 'board-2',
    item: 'remote-1',
    type: 'column_value_changed',
    meta: { cascadedCount: 2 }
  });
  assert.strictEqual(lastApiUrl, '/api/items/board/board-2?includeSubitems=true', 'related cascades must refresh the source board item set');
  assert.strictEqual(app.items.some(item => item._id === 'remote-2'), true);
  assert.strictEqual(app.items.some(item => item._id === 'local-1'), true);

  lastApiUrl = '';
  await app.refreshRelatedBoardFromRealtime({ board: 'board-2', item: 'remote-2', type: 'item_archived' });
  assert.strictEqual(lastApiUrl, '', 'related archive should remove the cached source item without another request');
  assert.strictEqual(app.items.some(item => item._id === 'remote-2'), false);

  await app.refreshRelatedBoardFromRealtime({ board: 'board-2', type: 'board_updated' });
  assert.strictEqual(app.boards.find(board => board._id === 'board-2').name, 'Fuente actualizada', 'source board metadata must refresh for Mirror column metadata changes');
  assert.strictEqual(app.items.some(item => item._id === 'local-1'), true);
  assert.strictEqual(app.items.some(item => item._id === 'remote-2'), true, 'full source refresh must use the latest source item set');

  const rendersBeforeUnrelated = renders;
  await app.refreshRelatedBoardFromRealtime({ board: 'board-9', item: 'ignored-1', type: 'item_updated' });
  assert.strictEqual(renders, rendersBeforeUnrelated, 'unrelated boards must not trigger view work');

  app.items = [{ _id: 'remote-3', board: 'board-3', name: 'Fecha anterior' }];
  app.api = async url => {
    lastApiUrl = url;
    return { _id: 'remote-3', board: 'board-3', name: 'Fecha actualizada' };
  };
  await app.refreshRelatedBoardFromRealtime({ board: 'board-3', item: 'remote-3', type: 'item_updated' });
  assert.strictEqual(lastApiUrl, '/api/items/remote-3', 'second target of a multi-board relation must refresh too');
  assert.strictEqual(app.items[0].name, 'Fecha actualizada');

  console.log('cross-board relation/mirror realtime tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
