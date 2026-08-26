const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'js', 'app-v2-lifecycle-view-navigation-parity.js'),
  'utf8'
);

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function loadApp() {
  const boardA = { _id: 'board-a', name: 'A' };
  const boardB = { _id: 'board-b', name: 'B' };
  const content = {
    innerHTML: '',
    restoreButtons: [],
    querySelectorAll(selector) {
      return selector === '[data-lifecycle-restore]' ? this.restoreButtons : [];
    }
  };
  const replaced = [];
  const toasts = [];

  const app = {
    currentBoard: boardA,
    currentView: 'board',
    items: [],
    currentBoardId() { return this.currentBoard?._id || ''; },
    escapeHtml(value) { return String(value ?? ''); },
    lifecycleItemHtml(item, kind) { return `<article>${item.name}:${kind}</article>`; },
    replaceItem(item) { replaced.push(item); },
    showToast(message, isError = false) { toasts.push({ message, isError }); },
    api: async () => []
  };

  vm.runInNewContext(source, {
    app,
    console,
    document: {
      getElementById(id) { return id === 'content' ? content : null; }
    },
    encodeURIComponent,
    Intl,
    Date,
    Map
  });

  return { app, boardA, boardB, content, replaced, toasts };
}

function fakeRestoreButton(itemId) {
  return {
    dataset: { lifecycleRestore: itemId },
    disabled: false,
    handlers: {},
    addEventListener(type, handler) { this.handlers[type] = handler; }
  };
}

(async () => {
  assert.ok(source.includes('boardLifecycleViewStillCurrent'), 'lifecycle views need an explicit board+view guard');
  assert.ok(source.includes('if (!this.boardLifecycleViewStillCurrent(boardId, viewId)) return;'), 'async view responses must be discarded after navigation');
  assert.ok(source.includes('this.replaceItem?.(restoredItem)'), 'restore should use the authoritative returned item');
  assert.strictEqual(source.includes('reloadItems()'), false, 'lifecycle restore should not trigger a global item reload');

  {
    const runtime = loadApp();
    const wait = deferred();
    runtime.app.currentView = 'activity';
    runtime.app.api = async () => wait.promise;

    const render = runtime.app.renderBoardActivity();
    runtime.app.currentBoard = runtime.boardB;
    runtime.app.currentView = 'board';
    runtime.content.innerHTML = 'BOARD B';
    wait.resolve([]);
    await render;

    assert.strictEqual(runtime.content.innerHTML, 'BOARD B', 'late activity response from board A must not overwrite board B');
  }

  {
    const runtime = loadApp();
    const wait = deferred();
    runtime.app.currentView = 'archive';
    runtime.app.api = async () => wait.promise;

    const render = runtime.app.renderLifecycleView('archive');
    runtime.app.currentBoard = runtime.boardB;
    runtime.app.currentView = 'board';
    runtime.content.innerHTML = 'BOARD B';
    wait.resolve([]);
    await render;

    assert.strictEqual(runtime.content.innerHTML, 'BOARD B', 'late archive response from board A must not overwrite board B');
  }

  {
    const runtime = loadApp();
    runtime.app.currentView = 'trash';
    runtime.app.api = async () => [];
    await runtime.app.renderLifecycleView('trash');
    assert.ok(runtime.content.innerHTML.includes('No hay elementos en papelera'), 'current lifecycle view should still render normally');
  }

  {
    const runtime = loadApp();
    const button = fakeRestoreButton('item-1');
    runtime.content.restoreButtons = [button];
    runtime.app.currentView = 'archive';
    let calls = 0;
    runtime.app.api = async (url) => {
      calls += 1;
      if (calls === 1) return [{ _id: 'item-1', name: 'Archived', archived: true }];
      if (url === '/api/items/item-1/unarchive') return { _id: 'item-1', name: 'Archived', archived: false, board: 'board-a' };
      return [];
    };

    await runtime.app.renderLifecycleView('archive');
    assert.strictEqual(typeof button.handlers.click, 'function');
    await button.handlers.click();

    assert.strictEqual(runtime.replaced.length, 1, 'restored item should immediately update local cache');
    assert.strictEqual(runtime.replaced[0].archived, false);
    assert.ok(calls >= 3, 'same-view restore should refresh the lifecycle list after applying returned item');
  }

  {
    const runtime = loadApp();
    const button = fakeRestoreButton('item-2');
    runtime.content.restoreButtons = [button];
    runtime.app.currentView = 'trash';
    let calls = 0;
    runtime.app.api = async (url) => {
      calls += 1;
      if (calls === 1) return [{ _id: 'item-2', name: 'Deleted', deletedAt: '2026-08-26T00:00:00Z' }];
      if (url === '/api/items/item-2/restore') {
        runtime.app.currentBoard = runtime.boardB;
        runtime.app.currentView = 'board';
        return { _id: 'item-2', name: 'Deleted', deletedAt: null, archived: false, board: 'board-a' };
      }
      throw new Error(`Unexpected request after navigation: ${url}`);
    };

    await runtime.app.renderLifecycleView('trash');
    await button.handlers.click();

    assert.strictEqual(runtime.app.currentBoard._id, 'board-b');
    assert.strictEqual(runtime.replaced.length, 1, 'successful restore should still update cache after navigation');
    assert.strictEqual(calls, 2, 'restore completed after navigation must not reload or repaint the old lifecycle view');
  }

  console.log('lifecycle view navigation tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
