const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const indexSource = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'js', 'app-v2-virtualization-index-parity.js'),
  'utf8'
);

const app = {
  virtualBoardEnabled: true,
  virtualGroupItemIds: new Map([
    ['group-a', ['a', 'b', 'c', 'd', 'e']]
  ]),
  virtualItemBaseHeights: new Map([
    ['a', 38], ['b', 38], ['c', 50], ['d', 38], ['e', 38]
  ]),
  virtualItemExtraHeights: new Map([
    ['c', 70]
  ]),
  virtualItemPositions: new Map([
    ['a', { groupId: 'group-a', index: 0 }],
    ['b', { groupId: 'group-a', index: 1 }],
    ['c', { groupId: 'group-a', index: 2 }],
    ['d', { groupId: 'group-a', index: 3 }],
    ['e', { groupId: 'group-a', index: 4 }]
  ]),
  prepareVirtualBoard() {},
  virtualEstimatedItemHeight(itemId) {
    const base = this.virtualItemBaseHeights.get(String(itemId)) || 38;
    const extra = this.virtualItemExtraHeights.get(String(itemId)) || 0;
    return base + extra;
  }
};

vm.runInNewContext(indexSource, { app, console });

const prefix = app.rebuildVirtualHeightPrefix('group-a');
assert.deepStrictEqual(Array.from(prefix), [0, 38, 76, 196, 234, 272]);
assert.strictEqual(app.virtualEstimatedSpanHeight('group-a', 0, 2), 76);
assert.strictEqual(app.virtualEstimatedSpanHeight('group-a', 2, 3), 120);
assert.strictEqual(app.virtualEstimatedSpanHeight('group-a', 1, 4), 196);

assert.strictEqual(app.virtualIndexForOffset('group-a', 0), 0);
assert.strictEqual(app.virtualIndexForOffset('group-a', 37), 0);
assert.strictEqual(app.virtualIndexForOffset('group-a', 38), 1);
assert.strictEqual(app.virtualIndexForOffset('group-a', 75), 1);
assert.strictEqual(app.virtualIndexForOffset('group-a', 76), 2);
assert.strictEqual(app.virtualIndexForOffset('group-a', 195), 2);
assert.strictEqual(app.virtualIndexForOffset('group-a', 196), 3);
assert.strictEqual(app.virtualIndexForOffset('group-a', 9999), 4);

let estimatedCalls = 0;
const originalEstimated = app.virtualEstimatedItemHeight;
app.virtualEstimatedItemHeight = function countedEstimate(itemId) {
  estimatedCalls += 1;
  return originalEstimated.call(this, itemId);
};
app.virtualIndexForOffset('group-a', 150);
assert.strictEqual(estimatedCalls, 0, 'binary offset lookup must use the prefix index instead of rescanning row heights');

console.log('virtualization height index tests passed');
