const assert = require('assert');
const { assertReadOnlyDocument } = require('../services/mondayReadOnlyClient');

assert.doesNotThrow(() => assertReadOnlyDocument('query { boards(limit: 1) { id name } }'));
assert.throws(
  () => assertReadOnlyDocument('mutation { create_board(board_name: "NEVER", board_kind: private) { id } }'),
  /mutations are forbidden/i
);
assert.throws(() => assertReadOnlyDocument(''), /query document is required/i);

console.log('mondayReadOnlyClient tests passed');
