const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'js', 'app-v2-board-lifecycle-navigation-parity.js'),
  'utf8'
);

function loadApp({ navigateDuringDuplicate = false, failDuplicateSnapshot = false, navigateDuringArchive = false } = {}) {
  const boardA = { _id: 'board-a', name: 'A', workspaceRef: { _id: 'workspace-a' } };
  const boardB = { _id: 'board-b', name: 'B', workspaceRef: { _id: 'workspace-a' } };
  const boardC = { _id: 'board-c', name: 'C', workspaceRef: { _id: 'workspace-a' } };
  const duplicate = { _id: 'board-copy', name: 'A copia', workspaceRef: { _id: 'workspace-a' } };
  const duplicateItems = [
    { _id: 'copy-parent', board: 'board-copy', name: 'Parent', isSubitem: false },
    { _id: 'copy-child', board: 'board-copy', name: 'Child', isSubitem: true, parentItem: 'copy-parent' }
  ];

  const apiCalls = [];
  const toasts = [];
  const selected = [];
  let sidebarRenders = 0;
  let emptyRenders = 0;

  const app = {
    boards: [boardA, boardB, boardC],
    items: [{ _id: 'a-item', board: 'board-a' }, { _id: 'b-item', board: 'board-b' }],
    currentBoard: boardA,
    currentWorkspace: { _id: 'workspace-a', name: 'Workspace A' },
    currentBoardId() { return this.currentBoard?._id || ''; },
    renderSidebar() { sidebarRenders += 1; },
    renderEmptyState() { emptyRenders += 1; },
    showToast(message, isError = false) { toasts.push({ message, isError }); },
    favoriteBoardIds() { return new Set(['board-a']); },
    saveFavoriteBoardIds(ids) { this.savedFavoriteIds = [...ids]; },
    visibleBoards() {
      return this.boards.filter(board => !board.archived && !board.internal);
    },
    async selectBoard(board) {
      selected.push(String(board._id));
      this.currentBoard = board;
    },
    async api(url, options = {}) {
      apiCalls.push({ url, options });
      if (url === '/api/boards/board-a/duplicate') {
        if (navigateDuringDuplicate) this.currentBoard = boardB;
        return { board: duplicate, itemsDuplicated: 1, subitemsDuplicated: 1 };
      }
      if (url === '/api/boards') {
        if (failDuplicateSnapshot) throw new Error('snapshot failed');
        return [boardA, boardB, boardC, duplicate];
      }
      if (url === '/api/items/board/board-copy?includeSubitems=true') {
        if (failDuplicateSnapshot) throw new Error('items failed');
        return duplicateItems;
      }
      if (url === '/api/boards/board-a' && options.method === 'DELETE') {
        if (navigateDuringArchive) this.currentBoard = boardB;
        return { ok: true };
      }
      throw new Error(`Unexpected API call: ${url}`);
    }
  };

  vm.runInNewContext(source, {
    app,
    console,
    encodeURIComponent,
    window: {
      prompt() { return 'A copia'; },
      confirm() { return true; }
    }
  });

  return {
    app,
    apiCalls,
    toasts,
    selected,
    stats: {
      get sidebarRenders() { return sidebarRenders; },
      get emptyRenders() { return emptyRenders; }
    }
  };
}

(async () => {
  assert.ok(source.includes('reconcileDuplicatedBoardSnapshot'), 'duplicate reconciliation helper must remain present');
  assert.ok(source.includes('/api/items/board/${encodeURIComponent(duplicateId)}?includeSubitems=true'), 'duplicate must fetch only its own items');
  assert.strictEqual(source.includes('reloadAll()'), false, 'duplicate lifecycle layer must not use global reloadAll');
  assert.ok(source.includes('boardLifecycleSourceStillActive(sourceBoardId)'), 'lifecycle actions must re-check navigation after awaits');

  {
    const runtime = loadApp();
    await runtime.app.duplicateCurrentBoard();

    assert.deepStrictEqual(runtime.selected, ['board-copy'], 'staying on source board should open the duplicate');
    assert.strictEqual(runtime.app.currentBoard._id, 'board-copy');
    assert.ok(runtime.app.boards.some(board => board._id === 'board-copy'), 'duplicate must exist in authoritative board cache');
    assert.ok(runtime.app.items.some(item => item._id === 'copy-parent'), 'duplicate parent items must be cached');
    assert.ok(runtime.app.items.some(item => item._id === 'copy-child'), 'duplicate subitems must be cached');
    assert.ok(runtime.apiCalls.some(call => call.url === '/api/boards'));
    assert.ok(runtime.apiCalls.some(call => call.url === '/api/items/board/board-copy?includeSubitems=true'));
  }

  {
    const runtime = loadApp({ navigateDuringDuplicate: true });
    await runtime.app.duplicateCurrentBoard();

    assert.deepStrictEqual(runtime.selected, [], 'late duplicate response must not navigate away from board B');
    assert.strictEqual(runtime.app.currentBoard._id, 'board-b', 'board B must remain active after duplicating A');
    assert.ok(runtime.app.boards.some(board => board._id === 'board-copy'), 'duplicate must still appear in board cache');
    assert.ok(runtime.app.items.some(item => item._id === 'copy-child'), 'duplicate items must be ready for later selection');
    assert.ok(runtime.stats.sidebarRenders >= 1, 'sidebar should reveal the duplicated board without stealing navigation');
  }

  {
    const runtime = loadApp({ failDuplicateSnapshot: true });
    await runtime.app.duplicateCurrentBoard();

    assert.deepStrictEqual(runtime.selected, [], 'incomplete duplicate snapshot must not open an empty copy');
    assert.strictEqual(runtime.app.currentBoard._id, 'board-a');
    assert.ok(runtime.app.boards.some(board => board._id === 'board-copy'), 'successful duplicate mutation must still be represented in cache');
    assert.ok(runtime.toasts.some(toast => toast.isError && toast.message.includes('falta resincronizar')), 'sync failure should be reported as a reconciliation issue, not mutation failure');
  }

  {
    const runtime = loadApp({ navigateDuringArchive: true });
    await runtime.app.archiveCurrentBoard();

    assert.strictEqual(runtime.app.currentBoard._id, 'board-b', 'late archive response from A must not steal navigation from B');
    assert.deepStrictEqual(runtime.selected, [], 'archive must not auto-select another board after user already moved');
    assert.ok(!runtime.app.boards.some(board => board._id === 'board-a'), 'archived board must leave local board cache');
    assert.ok(!runtime.app.savedFavoriteIds.includes('board-a'), 'archived board must leave favorites');
    assert.ok(runtime.stats.sidebarRenders >= 1, 'sidebar should update after remote-context archive completion');
  }

  {
    const runtime = loadApp();
    await runtime.app.archiveCurrentBoard();

    assert.deepStrictEqual(runtime.selected, ['board-b'], 'archiving the active board should keep the existing next-board behavior');
    assert.strictEqual(runtime.app.currentBoard._id, 'board-b');
    assert.ok(!runtime.app.boards.some(board => board._id === 'board-a'));
  }

  console.log('board lifecycle navigation tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
