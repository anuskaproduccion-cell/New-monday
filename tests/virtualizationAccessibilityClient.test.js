const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const virtualizationSource = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'js', 'app-v2-virtualization-parity.js'),
  'utf8'
);

let scroller = null;
const virtualizationApp = {
  renderBoard() {},
  itemRowHtml() { return '<tr class="item-row"></tr>'; },
  async selectBoard() {},
  currentBoardId() { return 'board-1'; },
  filteredBoardItems() { return Array.from({ length: 300 }, (_, index) => ({ _id: `item-${index}` })); },
  effectiveGroups() { return []; },
  escapeAttr(value) { return String(value); }
};

vm.runInNewContext(virtualizationSource, {
  app: virtualizationApp,
  document: { getElementById: () => scroller },
  requestAnimationFrame: callback => { callback(); return 1; },
  cancelAnimationFrame() {},
  console
});

assert.strictEqual(typeof virtualizationApp.ensureVirtualBoardScrollListener, 'function');
assert.strictEqual(typeof virtualizationApp.unbindVirtualBoardScroll, 'function');
assert.strictEqual(typeof virtualizationApp.virtualRowCountForGroup, 'function');
assert.strictEqual(typeof virtualizationApp.virtualEstimatedSpanHeight, 'function');
assert.strictEqual(typeof virtualizationApp.virtualIndexForOffset, 'function');
assert.strictEqual(typeof virtualizationApp.measureVirtualExpandedRows, 'function');

let addCount = 0;
let removeCount = 0;
const board = {
  dataset: {},
  querySelectorAll(selector) {
    if (selector === '.item-row[data-item-id]') return [];
    if (selector === '.group-section[data-group-id]') return [];
    return [];
  }
};
scroller = {
  scrollTop: 0,
  clientHeight: 800,
  querySelector(selector) {
    if (selector === '.board-scroll') return board;
    if (selector === '.board-toolbar') return null;
    return null;
  },
  querySelectorAll() { return []; },
  addEventListener(type, handler) {
    if (type === 'scroll') {
      addCount += 1;
      this.handler = handler;
    }
  },
  removeEventListener(type, handler) {
    if (type === 'scroll' && handler === this.handler) removeCount += 1;
  }
};

virtualizationApp.virtualBoardEnabled = true;
virtualizationApp.bindVirtualBoardScroll();
virtualizationApp.bindVirtualBoardScroll();
assert.strictEqual(addCount, 1, 're-rendering a virtual board must not accumulate scroll listeners');

virtualizationApp.unbindVirtualBoardScroll();
assert.strictEqual(removeCount, 1, 'virtual scroll listener must be removable when virtualization is disabled or host changes');
assert.strictEqual(virtualizationApp.virtualScrollHost, null);
assert.strictEqual(virtualizationApp.virtualScrollHandler, null);

virtualizationApp.virtualBoardRanges.set('group-a', { start: 120, end: 240, total: 500 });
assert.strictEqual(virtualizationApp.virtualRowCountForGroup('group-a'), 501, 'ARIA rowcount includes the header row and the full virtual group size');

virtualizationApp.virtualGroupItemIds.set('group-a', ['item-a', 'item-b', 'item-c']);
virtualizationApp.virtualItemExtraHeights.set('item-b', 80);
assert.strictEqual(
  virtualizationApp.virtualEstimatedSpanHeight('group-a', 0, 3),
  200,
  'virtual spacers must include measured expanded content below parent rows'
);
assert.strictEqual(virtualizationApp.virtualIndexForOffset('group-a', 39), 0);
assert.strictEqual(virtualizationApp.virtualIndexForOffset('group-a', 40), 1);
assert.strictEqual(virtualizationApp.virtualIndexForOffset('group-a', 159), 1, 'expanded item height must occupy its full measured scroll interval');
assert.strictEqual(virtualizationApp.virtualIndexForOffset('group-a', 160), 2);
const spacer = virtualizationApp.virtualSpacerRowHtml(3, 'group-a', 'top', [], 0, 3);
assert.ok(spacer.includes('height:200px'), 'spacer HTML must use measured model height instead of count × fixed row height');

const accessibilitySource = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'js', 'app-v2-accessibility-parity.js'),
  'utf8'
);
const accessibilityApp = {
  bindStaticEvents() {},
  bindBoardEvents() {},
  renderViewTabs() {},
  renderSidebar() {}
};
const accessibilityContext = vm.createContext({
  app: accessibilityApp,
  document: {},
  requestAnimationFrame: callback => callback(),
  console
});
vm.runInContext(accessibilitySource, accessibilityContext);

assert.strictEqual(typeof accessibilityApp.accessibilityRowIndexForItem, 'function');
vm.runInContext(`
  app.virtualBoardEnabled = true;
  app.virtualItemPositions = new Map([
    ['item-350', { groupId: 'group-a', index: 349, total: 500 }]
  ]);
`, accessibilityContext);
assert.strictEqual(
  accessibilityApp.accessibilityRowIndexForItem('item-350', 2),
  351,
  'virtualized rows must expose their model position rather than their DOM-window position'
);

accessibilityApp.virtualBoardEnabled = false;
assert.strictEqual(accessibilityApp.accessibilityRowIndexForItem('item-350', 7), 7);

console.log('virtualizationAccessibilityClient tests passed');
