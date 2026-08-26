const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'js', 'app-v2-files-view-navigation-parity.js'),
  'utf8'
);

function deferred() {
  let resolve;
  const promise = new Promise(res => { resolve = res; });
  return { promise, resolve };
}

function loadApp() {
  const boardA = { _id: 'board-a', name: 'A', views: [] };
  const boardB = { _id: 'board-b', name: 'B', views: [] };
  const content = {
    innerHTML: '',
    querySelectorAll() { return []; },
    querySelector() { return null; }
  };
  let tabRenders = 0;
  let viewRenders = 0;
  const toasts = [];

  const app = {
    boards: [boardA, boardB],
    currentBoard: boardA,
    currentView: 'board',
    createViewOfType() {},
    currentBoardId() { return this.currentBoard?._id || ''; },
    uniqueViewName() { return 'Archivos'; },
    renderViewTabs() { tabRenders += 1; },
    renderCurrentView() { viewRenders += 1; },
    showToast(message, isError = false) { toasts.push({ message, isError }); },
    filesGalleryEntries() { return []; },
    filesGalleryLayout() { return 'grid'; },
    fileIconFor() { return '📎'; },
    escapeAttr(value) { return String(value ?? ''); },
    escapeHtml(value) { return String(value ?? ''); },
    setFilesGalleryLayout() {},
    openFileStorageManager() {},
    api: async () => []
  };

  vm.runInNewContext(source, {
    app,
    console,
    document: {
      getElementById(id) { return id === 'content' ? content : null; }
    },
    encodeURIComponent
  });

  return {
    app,
    boardA,
    boardB,
    content,
    toasts,
    stats: {
      get tabRenders() { return tabRenders; },
      get viewRenders() { return viewRenders; }
    }
  };
}

(async () => {
  assert.ok(source.includes('filesViewContextStillCurrent'), 'Files needs a board+view context guard');
  assert.ok(source.includes("const sourceBoardId = String(sourceBoard?._id || '')"), 'view creation must freeze its source board before awaiting');
  assert.ok(source.includes("if (String(this.currentBoardId?.() || '') === sourceBoardId)"), 'created Files view must only become active if source board is still active');

  {
    const runtime = loadApp();
    const wait = deferred();
    runtime.app.currentView = 'saved:files-1';
    runtime.app.api = async () => wait.promise;

    const render = runtime.app.renderFilesGallery({ id: 'files-1', name: 'Archivos' });
    runtime.app.currentView = 'board';
    runtime.content.innerHTML = 'BOARD VIEW';
    wait.resolve([]);
    await render;

    assert.strictEqual(runtime.content.innerHTML, 'BOARD VIEW', 'late Files response must not overwrite a different view on the same board');
  }

  {
    const runtime = loadApp();
    const wait = deferred();
    runtime.app.currentView = 'saved:files-1';
    runtime.app.api = async () => wait.promise;

    const render = runtime.app.renderFilesGallery({ id: 'files-1', name: 'Archivos' });
    runtime.app.currentBoard = runtime.boardB;
    runtime.app.currentView = 'board';
    runtime.content.innerHTML = 'BOARD B';
    wait.resolve([]);
    await render;

    assert.strictEqual(runtime.content.innerHTML, 'BOARD B', 'late Files response from board A must not overwrite board B');
  }

  {
    const runtime = loadApp();
    runtime.app.currentView = 'saved:files-1';
    runtime.app.api = async () => [];
    await runtime.app.renderFilesGallery({ id: 'files-1', name: 'Archivos' });
    assert.ok(runtime.content.innerHTML.includes('No hay archivos todavía'), 'current Files view must still render normally');
  }

  {
    const runtime = loadApp();
    const created = { id: 'files-new', name: 'Archivos', type: 'files' };
    runtime.app.api = async () => created;
    await runtime.app.createViewOfType('files');

    assert.ok(runtime.boardA.views.some(view => view.id === 'files-new'), 'created Files view must be cached on source board');
    assert.strictEqual(runtime.app.currentView, 'saved:files-new');
    assert.strictEqual(runtime.stats.tabRenders, 1);
    assert.strictEqual(runtime.stats.viewRenders, 1);
  }

  {
    const runtime = loadApp();
    const created = { id: 'files-new', name: 'Archivos', type: 'files' };
    runtime.app.api = async () => {
      runtime.app.currentBoard = runtime.boardB;
      runtime.app.currentView = 'board';
      return created;
    };
    await runtime.app.createViewOfType('files');

    assert.ok(runtime.boardA.views.some(view => view.id === 'files-new'), 'late creation result must still update board A cache');
    assert.strictEqual(runtime.boardB.views.length, 0, 'view created for A must never be attached to B');
    assert.strictEqual(runtime.app.currentBoard._id, 'board-b');
    assert.strictEqual(runtime.app.currentView, 'board', 'late Files creation must not switch B into A saved view');
    assert.strictEqual(runtime.stats.tabRenders, 0);
    assert.strictEqual(runtime.stats.viewRenders, 0);
  }

  console.log('Files view navigation tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
