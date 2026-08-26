const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

(async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app-v2-keyboard.js'), 'utf8');
  const app = {
    bindStaticEvents() {},
    bindBoardEvents() {}
  };

  vm.runInNewContext(source, {
    app,
    document: {
      addEventListener() {},
      getElementById() { return null; },
      querySelectorAll() { return []; }
    },
    console
  });

  const items = Array.from({ length: 300 }, (_, index) => ({ _id: `item-${index}` }));
  const columns = [
    { id: 'text-a', title: 'Texto A', type: 'text' },
    { id: 'text-b', title: 'Texto B', type: 'text' }
  ];
  const applied = [];
  let rendered = 0;
  let focused = null;

  Object.assign(app, {
    activeCell: { itemId: 'item-119', columnId: 'text-a' },
    keyboardVisibleItems: () => items,
    effectiveColumns: () => columns,
    updateColumnValue: async (itemId, columnId, value) => {
      applied.push({ itemId: String(itemId), columnId, value });
      return true;
    },
    renderBoard: () => { rendered += 1; },
    focusModelCell: (itemId, columnId) => { focused = { itemId, columnId }; },
    showToast() {}
  });

  assert.strictEqual(typeof app.keyboardPasteItems, 'function');
  assert.strictEqual(app.keyboardPasteItems().length, 300);

  await app.pasteClipboardGrid([
    ['A119', 'B119'],
    ['A120', 'B120'],
    ['A121', 'B121']
  ]);

  assert.deepStrictEqual(
    applied.map(entry => `${entry.itemId}:${entry.columnId}`),
    [
      'item-119:text-a', 'item-119:text-b',
      'item-120:text-a', 'item-120:text-b',
      'item-121:text-a', 'item-121:text-b'
    ],
    'range paste must continue through model rows even when the next rows are outside the rendered virtual window'
  );
  assert.strictEqual(rendered, 1);
  assert.deepStrictEqual(focused, { itemId: 'item-119', columnId: 'text-a' });

  console.log('keyboardVirtualPaste tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
