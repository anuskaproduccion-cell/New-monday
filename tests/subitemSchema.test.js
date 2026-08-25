const assert = require('assert');
const {
  normalizeName,
  collectBoardIdCandidates,
  resolveInternalSubitemBoard
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

console.log('subitemSchema.test.js passed');
