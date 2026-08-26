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
  const realtimeBatchSource = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'js', 'app-v2-realtime-batch-parity.js'),
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
  assert.strictEqual(app.localMutationVersion(), 0);
  assert.strictEqual(app.realtimeInteractionInProgress(), false);

  const write = app.updateColumnValue('item-1', 'status', { type: 'status', label: 'Done' });
  await Promise.resolve();
  assert.strictEqual(app.hasLocalMutationInFlight(), true, 'local PATCH must be visible while the request is pending');
  assert.strictEqual(app.localMutationVersion(), 1, 'starting a mutation must advance the monotonic local mutation version');
  assert.strictEqual(app.realtimeInteractionInProgress(), true, 'realtime refresh must defer while a local PATCH is pending');

  releasePatch();
  await write;
  assert.strictEqual(app.hasLocalMutationInFlight(), false, 'local mutation counter must return to zero after success');
  assert.strictEqual(app.localMutationVersion(), 1, 'finishing a mutation must not roll back its version');
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
  assert.strictEqual(failingApp.localMutationVersion(), 1, 'failed mutations still advance the version because they overlapped remote reads while pending');

  let releaseRemoteRead;
  let markRemoteReadStarted;
  const remoteReadGate = new Promise(resolve => { releaseRemoteRead = resolve; });
  const remoteReadStarted = new Promise(resolve => { markRemoteReadStarted = resolve; });
  let overlapRenders = 0;
  const overlapScheduled = [];
  const overlapApp = {
    init() {},
    currentBoard: { _id: 'board-1', archived: false },
    boards: [{ _id: 'board-1', archived: false }],
    workspaces: [],
    currentWorkspace: null,
    items: [{ _id: 'item-1', board: 'board-1', name: 'Valor local vigente' }],
    currentBoardId() { return this.currentBoard?._id || ''; },
    async api(url) {
      if (url === '/api/items/item-1') {
        markRemoteReadStarted();
        await remoteReadGate;
        return { _id: 'item-1', board: 'board-1', name: 'Snapshot remoto antiguo' };
      }
      return [];
    },
    renderCurrentView() { overlapRenders += 1; },
    announceA11y() {},
    setRealtimeState() {}
  };
  vm.runInNewContext(concurrencySource, { app: overlapApp, console });
  vm.runInNewContext(realtimeSource, {
    app: overlapApp,
    window: {},
    document,
    navigator: { onLine: true },
    console,
    setTimeout,
    clearTimeout,
    encodeURIComponent
  });
  overlapApp.scheduleRealtimeRefresh = (change, delay) => overlapScheduled.push({ change, delay });

  const overlappingRefresh = overlapApp.refreshCurrentBoardFromRealtime({
    board: 'board-1',
    item: 'item-1',
    type: 'item_updated'
  });
  await remoteReadStarted;
  const versionBeforeLocalWrite = overlapApp.localMutationVersion();
  overlapApp.beginLocalMutation();
  overlapApp.items[0] = { _id: 'item-1', board: 'board-1', name: 'Valor local más nuevo' };
  overlapApp.endLocalMutation();
  assert.ok(overlapApp.localMutationVersion() > versionBeforeLocalWrite);
  releaseRemoteRead();
  await overlappingRefresh;

  assert.strictEqual(overlapRenders, 0, 'a stale remote snapshot must not be rendered after a local mutation overlapped its read');
  assert.strictEqual(overlapApp.items[0].name, 'Valor local más nuevo', 'stale remote item data must not overwrite the newer local result');
  assert.strictEqual(overlapScheduled.length, 1, 'overlap must schedule one authoritative revalidation');
  assert.strictEqual(overlapScheduled[0].change.board, 'board-1');
  assert.strictEqual(overlapScheduled[0].change.item, null);
  assert.strictEqual(overlapScheduled[0].change.meta.itemsOnly, true, 'simple item overlap should revalidate board items without rebuilding the shell');
  assert.strictEqual(overlapScheduled[0].change.meta.localMutationOverlap, true);

  let releaseGlobalReload;
  let markGlobalReloadStarted;
  const globalReloadGate = new Promise(resolve => { releaseGlobalReload = resolve; });
  const globalReloadStarted = new Promise(resolve => { markGlobalReloadStarted = resolve; });
  let globalRenders = 0;
  const globalScheduled = [];
  const globalApp = {
    init() {},
    currentBoard: { _id: 'board-1', archived: false, workspaceRef: { _id: 'workspace-1' } },
    currentWorkspace: { _id: 'workspace-1', name: 'Workspace local' },
    boards: [{ _id: 'board-1', archived: false, workspaceRef: { _id: 'workspace-1' } }],
    workspaces: [{ _id: 'workspace-1', name: 'Workspace local' }],
    items: [{ _id: 'item-1', board: 'board-1', name: 'Local' }],
    crew: [{ _id: 'crew-1', name: 'Crew local' }],
    currentBoardId() { return this.currentBoard?._id || ''; },
    workspaceKey(workspace) { return workspace?._id || ''; },
    async reloadAll() {
      markGlobalReloadStarted();
      await globalReloadGate;
      this.workspaces = [{ _id: 'workspace-1', name: 'Snapshot global antiguo' }];
      this.boards = [{ _id: 'board-1', archived: false, workspaceRef: { _id: 'workspace-1' } }];
      this.items = [{ _id: 'item-1', board: 'board-1', name: 'Snapshot remoto antiguo' }];
      this.crew = [{ _id: 'crew-1', name: 'Crew remoto antiguo' }];
    },
    boardBelongsToWorkspace() { return true; },
    renderWorkspaceSwitcher() { globalRenders += 1; },
    renderSidebar() { globalRenders += 1; },
    renderCrewDatalist() { globalRenders += 1; },
    renderHeader() { globalRenders += 1; },
    renderViewTabs() { globalRenders += 1; },
    renderCurrentView() { globalRenders += 1; },
    ensureRealtimeBadge() {},
    visibleBoards() { return this.boards; },
    renderEmptyState() { globalRenders += 1; },
    announceA11y() {},
    setRealtimeState() {}
  };
  vm.runInNewContext(concurrencySource, { app: globalApp, console });
  const globalRealtimeContext = {
    app: globalApp,
    window: {},
    document,
    navigator: { onLine: true },
    console,
    setTimeout,
    clearTimeout,
    encodeURIComponent
  };
  vm.runInNewContext(realtimeSource, globalRealtimeContext);
  vm.runInNewContext(realtimeBatchSource, globalRealtimeContext);
  globalApp.scheduleRealtimeRefresh = (change, delay) => globalScheduled.push({ change, delay });

  const globalRefresh = globalApp.refreshGlobalStateFromRealtime({
    scope: 'workspace',
    workspace: 'workspace-1',
    type: 'workspace_updated'
  });
  await globalReloadStarted;
  globalApp.beginLocalMutation();
  globalApp.endLocalMutation();
  releaseGlobalReload();
  await globalRefresh;

  assert.strictEqual(globalRenders, 0, 'an overlapped global snapshot must not repaint the shell before revalidation');
  assert.strictEqual(globalApp.workspaces[0].name, 'Workspace local', 'overlapped reloadAll must not replace live workspace state');
  assert.strictEqual(globalApp.items[0].name, 'Local', 'overlapped reloadAll must not replace live item state');
  assert.strictEqual(globalApp.crew[0].name, 'Crew local', 'overlapped reloadAll must not replace live crew state');
  assert.strictEqual(globalScheduled.length, 1, 'global overlap must schedule one global revalidation');
  assert.strictEqual(globalScheduled[0].change.scope, 'global');
  assert.strictEqual(globalScheduled[0].change.item, null);
  assert.strictEqual(globalScheduled[0].change.meta.localMutationOverlap, true);

  await globalApp.refreshGlobalStateFromRealtime({
    scope: 'global',
    type: 'realtime_reconnected'
  });
  assert.strictEqual(globalApp.workspaces[0].name, 'Snapshot global antiguo', 'non-overlapped realtime reload must apply the validated workspace snapshot');
  assert.strictEqual(globalApp.items[0].name, 'Snapshot remoto antiguo', 'non-overlapped realtime reload must apply the validated item snapshot');
  assert.strictEqual(globalApp.crew[0].name, 'Crew remoto antiguo', 'non-overlapped realtime reload must apply the validated crew snapshot');
  assert.ok(globalRenders > 0, 'validated global snapshot must repaint the shell');

  console.log('local mutation realtime coordination tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});