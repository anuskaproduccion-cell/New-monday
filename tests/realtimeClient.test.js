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

  assert.strictEqual(typeof app.realtimeIsGlobalChange, 'function');
  assert.strictEqual(typeof app.realtimeNeedsFullShellRefresh, 'function');
  assert.strictEqual(typeof app.realtimeItemRefreshMode, 'function');
  assert.strictEqual(typeof app.mergeRealtimeChanges, 'function');
  assert.strictEqual(typeof app.realtimeReadySyncChange, 'function');
  assert.strictEqual(typeof app.refreshGlobalStateFromRealtime, 'function');
  assert.strictEqual(app.realtimeIsGlobalChange({ scope: 'workspace' }), true);
  assert.strictEqual(app.realtimeIsGlobalChange({ scope: 'global' }), true);
  assert.strictEqual(app.realtimeIsGlobalChange({ scope: 'board', board: 'board-1' }), false);
  assert.strictEqual(app.realtimeNeedsFullShellRefresh({ board: 'board-1', item: 'item-1', type: 'column_value_changed' }), false);
  assert.strictEqual(app.realtimeNeedsFullShellRefresh({ board: 'board-1', item: 'item-1', type: 'item_updated' }), false);
  assert.strictEqual(app.realtimeNeedsFullShellRefresh({ board: 'board-1', type: 'group_items_updated' }), true);
  assert.strictEqual(app.realtimeNeedsFullShellRefresh({ board: 'board-1', type: 'visibility_refresh' }), true);
  assert.strictEqual(app.realtimeNeedsFullShellRefresh({ scope: 'workspace', workspace: 'workspace-1' }), true);

  assert.strictEqual(app.realtimeItemRefreshMode({ board: 'board-1', item: 'item-1', type: 'column_value_changed', meta: { cascadedCount: 0 } }), 'single');
  assert.strictEqual(app.realtimeItemRefreshMode({ board: 'board-1', item: 'item-1', type: 'column_value_changed', meta: { cascadedCount: 2 } }), 'board');
  assert.strictEqual(app.realtimeItemRefreshMode({ board: 'board-1', item: 'item-1', type: 'item_updated' }), 'single');
  assert.strictEqual(app.realtimeItemRefreshMode({ board: 'board-1', item: 'item-1', type: 'item_moved' }), 'single');
  assert.strictEqual(app.realtimeItemRefreshMode({ board: 'board-1', item: 'item-1', type: 'item_archived' }), 'remove');
  assert.strictEqual(app.realtimeItemRefreshMode({ board: 'board-1', item: 'item-1', type: 'item_trashed' }), 'remove');
  assert.strictEqual(app.realtimeItemRefreshMode({ board: 'board-1', item: 'item-1', type: 'item_duplicated' }), 'board');
  assert.strictEqual(app.realtimeItemRefreshMode({ board: 'board-1', item: 'item-1', type: 'item_bulk_status_changed' }), 'board');

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

  const itemThenWorkspace = app.mergeRealtimeChanges(
    { scope: 'board', board: 'board-1', item: 'item-1', type: 'column_value_changed' },
    { scope: 'workspace', workspace: 'workspace-1', type: 'workspace_folder_updated' }
  );
  assert.strictEqual(itemThenWorkspace.scope, 'workspace');
  assert.strictEqual(itemThenWorkspace.board, null);
  assert.strictEqual(itemThenWorkspace.item, null);
  assert.strictEqual(itemThenWorkspace.type, 'workspace_folder_updated');

  const workspaceThenItem = app.mergeRealtimeChanges(
    { scope: 'workspace', workspace: 'workspace-1', type: 'workspace_folders_reordered' },
    { scope: 'board', board: 'board-1', item: 'item-1', type: 'item_updated' }
  );
  assert.strictEqual(workspaceThenItem.scope, 'workspace');
  assert.strictEqual(workspaceThenItem.board, null);
  assert.strictEqual(workspaceThenItem.item, null);
  assert.strictEqual(workspaceThenItem.type, 'workspace_folders_reordered');

  app.currentBoardId = () => 'board-1';
  assert.strictEqual(app.realtimeReadySyncChange(), null, 'first SSE ready event must not refetch data loaded during init');
  const reconnectChange = app.realtimeReadySyncChange();
  assert.strictEqual(reconnectChange.scope, 'global');
  assert.strictEqual(reconnectChange.board, null);
  assert.strictEqual(reconnectChange.type, 'realtime_reconnected');
  assert.strictEqual(app.realtimeIsGlobalChange(reconnectChange), true);

  app.realtimeEverReady = false;
  app.currentBoardId = () => '';
  assert.strictEqual(app.realtimeReadySyncChange(), null);
  const reconnectWithoutBoard = app.realtimeReadySyncChange();
  assert.strictEqual(reconnectWithoutBoard.scope, 'global', 'reconnect must resync workspace state even without an active board');

  let badgeRestores = 0;
  let currentViewRenders = 0;
  let lastApiUrl = '';
  Object.assign(app, {
    currentBoard: { _id: 'board-1', archived: false },
    boards: [{ _id: 'board-1', archived: false }],
    workspaces: [],
    currentWorkspace: null,
    items: [],
    realtimeRefreshing: false,
    realtimePendingChange: null,
    currentBoardId: () => 'board-1',
    api: async url => {
      lastApiUrl = url;
      if (url.startsWith('/api/boards/')) return { _id: 'board-1', archived: false };
      if (url === '/api/items/item-1') return { _id: 'item-1', board: 'board-1', name: 'Remoto' };
      return [];
    },
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
  lastApiUrl = '';
  await app.refreshCurrentBoardFromRealtime({ board: 'board-1', item: 'item-1', type: 'column_value_changed', meta: { cascadedCount: 0 } });
  assert.strictEqual(lastApiUrl, '/api/items/item-1', 'simple cell changes must fetch only the changed item');
  assert.strictEqual(app.items.length, 1);
  assert.strictEqual(app.items[0].name, 'Remoto');
  assert.strictEqual(badgeRestores, 0, 'item refresh must not rebuild or restore the header badge');
  assert.strictEqual(currentViewRenders, 1);

  lastApiUrl = '';
  await app.refreshCurrentBoardFromRealtime({ board: 'board-1', item: 'item-1', type: 'column_value_changed', meta: { cascadedCount: 2 } });
  assert.strictEqual(lastApiUrl, '/api/items/board/board-1?includeSubitems=true', 'dependency cascades must still refresh the board item set');

  app.items = [{ _id: 'item-1', board: 'board-1' }, { _id: 'item-2', board: 'board-1' }];
  lastApiUrl = '';
  await app.refreshCurrentBoardFromRealtime({ board: 'board-1', item: 'item-1', type: 'item_archived' });
  assert.strictEqual(lastApiUrl, '', 'archive event should not need an extra item request');
  assert.strictEqual(app.items.some(item => item._id === 'item-1'), false);
  assert.strictEqual(app.items.some(item => item._id === 'item-2'), true);

  let globalReloads = 0;
  let globalSidebarRenders = 0;
  badgeRestores = 0;
  currentViewRenders = 0;
  Object.assign(app, {
    currentWorkspace: { _id: 'workspace-1', name: 'Workspace 1' },
    currentBoard: { _id: 'board-1', archived: false, workspaceRef: { _id: 'workspace-1' } },
    workspaces: [{ _id: 'workspace-1', name: 'Workspace 1' }],
    boards: [{ _id: 'board-1', archived: false, workspaceRef: { _id: 'workspace-1' } }],
    currentBoardId() { return this.currentBoard?._id || ''; },
    workspaceKey(workspace) { return workspace?._id || workspace?.name || ''; },
    boardBelongsToWorkspace(board, workspace) {
      return String(board?.workspaceRef?._id || '') === String(workspace?._id || '');
    },
    async reloadAll() {
      globalReloads += 1;
      this.workspaces = [{ _id: 'workspace-1', name: 'Workspace 1 actualizado' }];
      this.boards = [{ _id: 'board-1', archived: false, workspaceRef: { _id: 'workspace-1' } }];
      this.items = [];
      this.crew = [];
    },
    renderWorkspaceSwitcher() {},
    renderSidebar() { globalSidebarRenders += 1; },
    renderCrewDatalist() {},
    renderHeader() {},
    renderViewTabs() {},
    renderCurrentView() { currentViewRenders += 1; },
    ensureRealtimeBadge() { badgeRestores += 1; },
    visibleBoards() { return this.boards; },
    renderEmptyState() {},
    announceA11y() {}
  });

  await app.refreshGlobalStateFromRealtime({ scope: 'workspace', workspace: 'workspace-1', type: 'workspace_folder_updated' });
  assert.strictEqual(globalReloads, 1);
  assert.strictEqual(globalSidebarRenders, 1);
  assert.strictEqual(currentViewRenders, 1);
  assert.strictEqual(badgeRestores, 1);
  assert.strictEqual(app.currentWorkspace.name, 'Workspace 1 actualizado');
  assert.strictEqual(app.currentBoard._id, 'board-1');

  console.log('realtime client refresh policy tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
