const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

(async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'itemOrdering.js'), 'utf8');
  const dndSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app-v2-dnd.js'), 'utf8');
  const mutationSource = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'js', 'app-v2-mutation-tracking-parity.js'),
    'utf8'
  );

  assert.ok(source.includes("const { logActivity } = require('../services/activityLogger');"));
  assert.ok(source.includes("type: 'item_ordering_changed'"), 'top-level item reorder must notify other realtime sessions');
  assert.ok(source.includes("type: 'subitem_created'"), 'subitem creation through the ordering router must notify other realtime sessions');
  assert.ok(source.includes("type: 'subitem_ordering_changed'"), 'subitem reorder must notify other realtime sessions');

  const itemReorderBlock = source.match(/router\.post\('\/reorder'[\s\S]*?res\.json\(items\);/);
  assert.ok(itemReorderBlock, 'item reorder route must remain detectable');
  assert.strictEqual(/\n\s*item:\s/.test(itemReorderBlock[0]), false, 'multi-item reorder should emit a board-scoped realtime event');

  const subitemReorderBlock = source.match(/router\.post\('\/:id\/subitems\/reorder'[\s\S]*?res\.json\(subitems\);/);
  assert.ok(subitemReorderBlock, 'subitem reorder route must remain detectable');
  assert.strictEqual(/\n\s*item:\s/.test(subitemReorderBlock[0]), false, 'subitem reorder should emit a board-scoped realtime event');

  const reorderItemClientBlock = dndSource.match(/app\.reorderItemByDrop\s*=\s*async function[\s\S]*?\n\s*app\.moveItemToGroupEnd/);
  assert.ok(reorderItemClientBlock, 'drag reorder client flow must remain detectable');
  assert.ok(
    reorderItemClientBlock[0].includes("this.api('/api/item-ordering/reorder'"),
    'drag reorder must use the audited top-level ordering endpoint'
  );
  assert.ok(
    reorderItemClientBlock[0].includes("const sourceBoardId = String(this.currentBoardId() || '')"),
    'drag reorder must freeze its source board before any network await'
  );
  assert.ok(
    reorderItemClientBlock[0].includes('const sourceItemsSnapshot = this.boardItems();'),
    'drag reorder must freeze source-board item membership before the first request'
  );
  assert.ok(
    reorderItemClientBlock[0].includes('this.applyOrderedBoardPrimaryItems(sourceBoardId, orderedItems)'),
    'drag reorder must apply the authoritative ordering response to the source-board cache'
  );
  assert.strictEqual(
    reorderItemClientBlock[0].includes('await this.reloadBoardState()'),
    false,
    'drag reorder must not reload whichever board happens to be active after navigation'
  );

  const moveToGroupClientBlock = dndSource.match(/app\.moveItemToGroupEnd\s*=\s*async function[\s\S]*?\n\s*app\.reorderGroupByDrop/);
  assert.ok(moveToGroupClientBlock, 'move-to-group ordering client flow must remain detectable');
  assert.ok(
    moveToGroupClientBlock[0].includes("this.api('/api/item-ordering/reorder'"),
    'move-to-group must use the audited top-level ordering endpoint'
  );
  assert.ok(
    moveToGroupClientBlock[0].includes('this.applyOrderedBoardPrimaryItems(sourceBoardId, orderedItems)'),
    'move-to-group must reconcile directly from the authoritative ordering response'
  );
  assert.strictEqual(
    moveToGroupClientBlock[0].includes('await this.reloadBoardState()'),
    false,
    'move-to-group must not reload a different active board after navigation'
  );

  const applyOrderingBlock = dndSource.match(/app\.applyOrderedBoardPrimaryItems[\s\S]*?\n\s*app\.reorderItemByDrop/);
  assert.ok(applyOrderingBlock, 'authoritative ordering cache helper must remain detectable');
  assert.ok(applyOrderingBlock[0].includes('Boolean(item.isSubitem)'), 'ordering cache replacement must preserve source-board subitems');

  assert.ok(
    mutationSource.includes("/^\\/api\\/item-ordering\\/reorder(?:\\?|$)/"),
    'only the exact top-level item ordering endpoint should be classified as own-echo safe'
  );
  assert.ok(
    mutationSource.includes('const orderingBoardId = body?.boardId;'),
    'ordering own-echo reconciliation must derive the source board from request body instead of the later active board'
  );
  assert.ok(
    mutationSource.includes('this.realtimeOwnEchoSourceBoardId(url, method, options)'),
    'mutation tracking must use the request-aware source-board resolver'
  );
  assert.ok(
    !mutationSource.includes('subitems/reorder(?:\\?|$)'),
    'subitem reorder must remain outside the own-echo safe allowlist until its client reconciliation path is proven'
  );

  const apiBodies = [];
  let reloads = 0;
  let renders = 0;
  const runtimeApp = {
    currentBoard: { _id: 'board-a', columns: [] },
    items: [
      { _id: 'drag', board: 'board-a', groupId: 'g1', group: 'One', order: 0 },
      { _id: 'source-sibling', board: 'board-a', groupId: 'g1', group: 'One', order: 1 },
      { _id: 'target', board: 'board-a', groupId: 'g2', group: 'Two', order: 0 },
      { _id: 'sub-a', board: 'board-a', isSubitem: true, parentItem: 'drag', order: 0 },
      { _id: 'b-item', board: 'board-b', groupId: 'g1', group: 'One', order: 0 }
    ],
    expandedSubitems: new Set(),
    bindBoardEvents() {},
    openItemMenu() {},
    currentBoardId() { return this.currentBoard?._id || ''; },
    findItem(id) { return this.items.find(item => String(item._id) === String(id)); },
    effectiveGroups() {
      return [
        { id: 'g1', title: 'One', color: '#111111' },
        { id: 'g2', title: 'Two', color: '#222222' }
      ];
    },
    boardItems() {
      const boardId = String(this.currentBoardId() || '');
      return this.items
        .filter(item => String(item.board?._id || item.board) === boardId && !item.isSubitem)
        .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
    },
    async api(url, options = {}) {
      assert.strictEqual(url, '/api/item-ordering/reorder');
      const body = JSON.parse(options.body || '{}');
      apiBodies.push(body);
      if (apiBodies.length === 1) {
        this.currentBoard = { _id: 'board-b', columns: [] };
        return [
          { _id: 'source-sibling', board: 'board-a', groupId: 'g1', group: 'One', order: 0 },
          { _id: 'drag', board: 'board-a', groupId: 'g2', group: 'Two', order: 0 },
          { _id: 'target', board: 'board-a', groupId: 'g2', group: 'Two', order: 1 }
        ];
      }
      return [
        { _id: 'source-sibling', board: 'board-a', groupId: 'g1', group: 'One', order: 0 },
        { _id: 'drag', board: 'board-a', groupId: 'g2', group: 'Two', order: 0 },
        { _id: 'target', board: 'board-a', groupId: 'g2', group: 'Two', order: 1 }
      ];
    },
    async reloadBoardState() { reloads += 1; },
    renderCurrentView() { renders += 1; },
    renderBoard() { renders += 1; },
    showToast() {}
  };

  vm.runInNewContext(dndSource, {
    app: runtimeApp,
    console,
    document: {
      getElementById() { return null; },
      querySelectorAll() { return []; },
      createElement() { return {}; }
    },
    prompt() { return null; },
    Set
  });

  await runtimeApp.reorderItemByDrop('drag', 'target');
  assert.strictEqual(apiBodies.length, 2, 'moving an item between groups must complete both source and target ordering writes');
  assert.ok(apiBodies.every(body => body.boardId === 'board-a'), 'every ordering write must retain the board captured before navigation');
  assert.deepStrictEqual(apiBodies[1].itemIds, ['source-sibling'], 'second ordering write must use the frozen source-board snapshot, never items from the newly active board');
  assert.strictEqual(reloads, 0, 'cross-board navigation during ordering must never call reloadBoardState on the new board');
  assert.strictEqual(renders, 0, 'the source board must not repaint over the newly selected board');
  assert.ok(runtimeApp.items.some(item => item._id === 'sub-a' && item.isSubitem), 'source-board subitems must survive authoritative primary-item replacement');
  assert.ok(runtimeApp.items.some(item => item._id === 'b-item' && item.board === 'board-b'), 'items belonging to the newly active board must stay untouched');
  assert.strictEqual(runtimeApp.items.find(item => item._id === 'drag').groupId, 'g2', 'authoritative ordering response must update the cached source item');

  console.log('realtime ordering coverage tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
