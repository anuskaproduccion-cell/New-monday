const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app-v2-range.js'), 'utf8');
const app = {
  bindBoardEvents() {},
  setActiveCell(itemId, columnId) { this.activeCell = { itemId: String(itemId), columnId: String(columnId) }; },
  clipboardTextForCell() { return 'DOM'; }
};

vm.runInNewContext(source, {
  app,
  document: {
    querySelectorAll() { return []; },
    getElementById() { return null; },
    addEventListener() {}
  },
  console
});

const items = Array.from({ length: 300 }, (_, index) => ({
  _id: `item-${index}`,
  columnValues: {
    a: { text: `A${index}` },
    b: { text: `B${index}` }
  }
}));
const columns = [
  { id: 'a', title: 'A', type: 'text' },
  { id: 'b', title: 'B', type: 'text' }
];
let ensured = null;

Object.assign(app, {
  activeCell: { itemId: 'item-119', columnId: 'a' },
  keyboardVisibleItems: () => items,
  effectiveColumns: () => columns,
  ensureVirtualItemRendered: itemId => { ensured = String(itemId); return true; },
  valueFor: (item, column) => item.columnValues[column.id],
  displayValue: value => value?.text || '',
  showToast() {}
});

app.setRange({ itemId: 'item-119', columnId: 'a' });
app.extendRangeByKey('ArrowDown');
assert.strictEqual(app.rangeFocus.itemId, 'item-120', 'Shift+ArrowDown must move into the next model row beyond a virtual DOM window');
assert.strictEqual(ensured, 'item-120', 'next virtual row must be rendered before focus is requested');

app.setRange(
  { itemId: 'item-119', columnId: 'a' },
  { itemId: 'item-121', columnId: 'b' }
);
assert.strictEqual(app.rangeSelectionCount(), 6);
assert.strictEqual(
  app.rangeClipboardText(),
  'A119\tB119\nA120\tB120\nA121\tB121',
  'copying a range must include non-rendered model rows'
);
assert.strictEqual(
  app.clipboardTextForCell({}),
  'A119\tB119\nA120\tB120\nA121\tB121',
  'clipboard wrapper must use model range size rather than rendered cell count'
);

console.log('rangeVirtualization tests passed');
