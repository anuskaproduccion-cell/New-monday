const assert = require('assert');
const {
  normalizeName,
  collectBoardIdCandidates,
  resolveInternalSubitemBoard,
  operationalColumns,
  schemaPayload
} = require('../routes/subitemSchema');

assert.strictEqual(normalizeName('  Subelementos   ÁREA  '), 'subelementos area');

const ids = collectBoardIdCandidates({
  boardId: 123,
  nested: { board_ids: ['456', 789], unrelated: 999 },
  other: { id: '111' }
});
assert.deepStrictEqual([...ids].sort(), ['123', '456', '789']);

const internalBoards = [
  { _id: 'i1', mondayId: '9001', name: 'Subelementos de MQFR_POST', internal: true },
  { _id: 'i2', mondayId: '9002', name: 'Subelementos de OTRO', internal: true, parentBoardMondayId: '5002' }
];

const settingsMatch = resolveInternalSubitemBoard({
  mondayId: '5001',
  name: 'MQFR_POST',
  columns: [{ type: 'subtasks', settings: { linkedBoardId: '9001' } }]
}, internalBoards);
assert.strictEqual(settingsMatch?._id, 'i1');

const parentIdMatch = resolveInternalSubitemBoard({
  mondayId: '5002',
  name: 'Sin coincidencia por nombre',
  columns: []
}, internalBoards);
assert.strictEqual(parentIdMatch?._id, 'i2');

const nameMatch = resolveInternalSubitemBoard({
  mondayId: '5003',
  name: 'MQFR_POST',
  columns: []
}, internalBoards);
assert.strictEqual(nameMatch?._id, 'i1');

const ambiguous = resolveInternalSubitemBoard({
  mondayId: '5004',
  name: 'Duplicado',
  columns: []
}, [
  { _id: 'a', mondayId: '1', name: 'Subelementos de Duplicado' },
  { _id: 'b', mondayId: '2', name: 'Subelementos de Duplicado' }
]);
assert.strictEqual(ambiguous, null);

const normalizedColumns = operationalColumns([
  { id: 'name', title: 'Name', type: 'name', order: 0 },
  { id: 'subtasks', title: 'Subitems', type: 'subtasks', order: 1 },
  { id: 'status', title: 'Estado', type: 'status', order: 7, settings: { labels: { 1: 'Done' } } },
  { id: 'date', title: 'Fecha', type: 'date', order: 3, hidden: true }
]);
assert.deepStrictEqual(normalizedColumns.map(column => column.id), ['date', 'status']);
assert.deepStrictEqual(normalizedColumns.map(column => column.order), [0, 1]);
assert.strictEqual(normalizedColumns[0].hidden, true);
assert.deepStrictEqual(normalizedColumns[1].settings, { labels: { 1: 'Done' } });

const importedPayload = schemaPayload({
  _id: 'parent1',
  mondayId: '5001',
  subitemSchemaCustomized: false,
  subitemColumns: []
}, {
  _id: 'internal1',
  mondayId: '9001',
  name: 'Subelementos de MQFR_POST',
  columns: [{ id: 'status', title: 'Estado', type: 'status', order: 0 }]
});
assert.strictEqual(importedPayload.mode, 'imported');
assert.strictEqual(importedPayload.customized, false);
assert.strictEqual(importedPayload.columns.length, 1);

const localPayload = schemaPayload({
  _id: 'parent1',
  mondayId: '5001',
  subitemSchemaCustomized: true,
  subitemColumns: [{ id: 'local_text', title: 'Notas', type: 'text', order: 0 }]
}, {
  _id: 'internal1',
  mondayId: '9001',
  name: 'Subelementos de MQFR_POST',
  columns: [{ id: 'status', title: 'Estado', type: 'status', order: 0 }]
});
assert.strictEqual(localPayload.mode, 'local');
assert.strictEqual(localPayload.customized, true);
assert.deepStrictEqual(localPayload.columns.map(column => column.id), ['local_text']);

console.log('subitemSchema.test.js passed');
