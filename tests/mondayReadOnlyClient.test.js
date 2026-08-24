const assert = require('assert');
const {
  assertReadOnlyDocument,
  mergeWorkspacesWithBoardReferences
} = require('../services/mondayReadOnlyClient');

assert.doesNotThrow(() => assertReadOnlyDocument('query { boards(limit: 1) { id name } }'));
assert.throws(
  () => assertReadOnlyDocument('mutation { create_board(board_name: "NEVER", board_kind: private) { id } }'),
  /mutations are forbidden/i
);
assert.throws(() => assertReadOnlyDocument(''), /query document is required/i);

const merged = mergeWorkspacesWithBoardReferences(
  [{ id: '1', name: 'FILM', description: 'main', kind: 'open' }],
  [
    { id: '10', workspace: { id: '1', name: 'FILM' } },
    { id: '11', workspace: { id: '2', name: '_SHOOTING' } },
    { id: '12', workspace: { id: '2', name: '_SHOOTING' } }
  ]
);

assert.strictEqual(merged.length, 2);
assert.strictEqual(merged[0].id, '1');
assert.strictEqual(merged[0].discoveredFromBoardReference, false);
assert.strictEqual(merged[1].id, '2');
assert.strictEqual(merged[1].name, '_SHOOTING');
assert.strictEqual(merged[1].discoveredFromBoardReference, true);

console.log('mondayReadOnlyClient tests passed');
