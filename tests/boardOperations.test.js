const assert = require('assert');
const { localBoardClone, localItemClone } = require('../routes/boardOperations');

const sourceBoard = {
  _id: '64f000000000000000000001',
  __v: 2,
  name: 'MQFR_POST',
  description: 'Postproducción',
  mondayId: '5097801091',
  source: 'monday-import',
  sourceReadOnly: false,
  order: 3,
  workspace: 'MQFR',
  workspaceRef: '64f000000000000000000002',
  groups: [{ id: 'topics', title: 'Post', color: '#579bfc', order: 0 }],
  columns: [{ id: 'status', title: 'Estado', type: 'status', order: 0 }],
  views: [{ id: '123', name: 'Gantt', type: 'gantt', order: 0 }],
  originMeta: { importRunId: 'run1' },
  createdAt: new Date(),
  updatedAt: new Date()
};
const clonedBoard = localBoardClone(sourceBoard, 'MQFR_POST copia', 4);
assert.strictEqual(clonedBoard.name, 'MQFR_POST copia');
assert.strictEqual(clonedBoard.description, 'Postproducción');
assert.strictEqual(clonedBoard.order, 4);
assert.strictEqual(clonedBoard.source, 'local');
assert.strictEqual(clonedBoard.sourceReadOnly, false);
assert.strictEqual(clonedBoard.archived, false);
assert.strictEqual(clonedBoard.internal, false);
assert.strictEqual(clonedBoard.mondayId, undefined);
assert.strictEqual(clonedBoard._id, undefined);
assert.strictEqual(clonedBoard.originMeta.duplicatedFrom, String(sourceBoard._id));
assert.strictEqual(clonedBoard.originMeta.duplicatedFromMondayId, '5097801091');
assert.deepStrictEqual(clonedBoard.groups, sourceBoard.groups);

const sourceItem = {
  _id: '64f000000000000000000010',
  mondayId: '777',
  board: sourceBoard._id,
  name: 'Color grading',
  columnValues: { files: { assets: [{ id: 'abc', source: 'new-monday' }] } },
  source: 'monday-import',
  sourceReadOnly: false,
  archived: false,
  deletedAt: null,
  originMeta: { importRunId: 'run1' }
};
const clonedItem = localItemClone(sourceItem, '64f000000000000000000020', '64f000000000000000000021');
assert.strictEqual(clonedItem.board, '64f000000000000000000020');
assert.strictEqual(clonedItem.parentItem, '64f000000000000000000021');
assert.strictEqual(clonedItem.parentMondayId, null);
assert.strictEqual(clonedItem.mondayId, undefined);
assert.strictEqual(clonedItem.source, 'local');
assert.strictEqual(clonedItem.sourceReadOnly, false);
assert.strictEqual(clonedItem.originMeta.duplicatedFromMondayId, '777');
assert.deepStrictEqual(clonedItem.columnValues, sourceItem.columnValues);

console.log('boardOperations.test.js passed');
