const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

(async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app-v2-realtime-parity.js'), 'utf8');
  const app = { init() {} };

  vm.runInNewContext(source, {
    app,
    window: {},
    document: {},
    navigator: {},
    console,
    setTimeout,
    clearTimeout
  });

  assert.strictEqual(typeof app.realtimeNeedsFullShellRefresh, 'function');
  assert.strictEqual(typeof app.mergeRealtimeChanges, 'function');
  assert.strictEqual(typeof app.realtimeReadySyncChange, 'function');
  assert.strictEqual(app.realtimeNeedsFullShellRefresh({ board: 'board-1', item: 'item-1', type: 'column_value_changed' }), false);
  assert.strictEqual(app.realtimeNeedsFullShellRefresh({ board: 'board-1', item: 'item-1', type: 'item_updated' }), false);
  assert.strictEqual(app.realtimeNeedsFullShellRefresh({ board: 'board-1', type: 'group_items_updated' }), true);
  assert.strictEqual(app.realtimeNeedsFullShellRefresh({ board: 'board-1', type: 'visibility_refresh' }), true);

  const fullThenItem = app.mergeRealtimeChanges(
    { board: 'board-1', type: 'board_updated', message: 'Tablero actualizado' },
    { board: 'board-1', item: 'item-1', type: 'column_value_changed', message: 'Celda actualizada' }
  );
  assert.strictEqual(fullThenItem.item, null);
  assert.strictEqual(fullThenItem.type, 'board_updated');
  assert.strictEqual(app.realtimeNeedsFullShellRefresh(fullThenItem), true);

  const itemThenFull = app.mergeRealtimeChanges(
    { board: 'board-1', item: 'item-1', type: 'column_value_changed' },
    { board: 'board-1', type: 'group_items_updated', message: 'Grupo actualizado' }
  );
  assert.strictEqual(itemThenFull.item, null);
  assert.strictEqual(itemThenFull.type, 'group_items_updated');
  assert.strictEqual(app.realtimeNeedsFullShellRefresh(itemThenFull), true);

  const itemThenItem = app.mergeRealtimeChanges(
    { board: 'board-1', item: 'item-1', type: 'column_value_changed' },
    { board: 'board-1', item: 'item-2', type: 'item_updated' }
  );
  assert.strictEqual(itemThenItem.item, 'item-2');
  assert.strictEqual(itemThenItem.type, 'item_updated');
  assert.strictEqual(app.realtimeNeedsFullShellRefresh(itemThenItem), false);

  app.currentBoardId = () => 'board-1';
  assert.strictEqual(app.realtimeReadySyncChange(), null, 'first SSE ready event must not refetch data loaded during init');
  const reconnectChange = app.realtimeReadySyncChange();
  assert.strictEqual(reconnectChange.board, 'board-1');
  assert.strictEqual(reconnectChange.type, 'realtime_reconnected');
  assert.strictEqual(app.realtimeNeedsFullShellRefresh(reconnectChange), true);

  app.realtimeEverReady = false;
  app.currentBoardId = () => '';
  assert.strictEqual(app.realtimeReadySyncChange(), null);
  assert.strictEqual(app.realtimeReadySyncChange(), null, 'reconnect without an active board has nothing to resynchronize');

  let badgeRestores = 0;
  let currentViewRenders = 0;
  Object.assign(app, {
    currentBoard: { _id: 'board-1', archived: false },
    boards: [{ _id: 'board-1', archived: false }],
    workspaces: [],
    currentWorkspace: null,
    items: [],
    realtimeRefreshing: false,
    realtimePendingChange: null,
    currentBoardId: () => 'board-1',
    api: async url => url.startsWith('/api/boards/')
      ? { _id: 'board-1', archived: false }
      : [],
    boardBelongsToWorkspace: () => false,
    renderWorkspaceSwitcher() {},
    renderSidebar() {},
    renderHeader() {},
    renderViewTabs() {},
    renderCurrentView() { currentViewRenders += 1; },
    ensureRealtimeBadge() { badgeRestores += 1; },
    announceA11y() {}
  });

  await app.refreshCurrentBoardFromRealtime({ board: 'board-1', type: 'board_updated' });
  assert.strictEqual(badgeRestores, 1, 'full shell refresh must restore the realtime badge after rebuilding the header');
  assert.strictEqual(currentViewRenders, 1);

  badgeRestores = 0;
  currentViewRenders = 0;
  await app.refreshCurrentBoardFromRealtime({ board: 'board-1', item: 'item-1', type: 'column_value_changed' });
  assert.strictEqual(badgeRestores, 0, 'item refresh must not rebuild or restore the header badge');
  assert.strictEqual(currentViewRenders, 1);

  console.log('realtime client refresh policy tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
