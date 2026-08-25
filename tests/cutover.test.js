const assert = require('assert');
const {
  BASELINE,
  PREPARE_CONFIRMATION,
  PROMOTE_CONFIRMATION,
  tokenHash,
  baselineMatches
} = require('../routes/cutover');

assert.strictEqual(PREPARE_CONFIRMATION, 'PREPARE_NEW_MONDAY_CUTOVER');
assert.strictEqual(PROMOTE_CONFIRMATION, 'PROMOTE_NEW_MONDAY_17_103_1230');
assert.strictEqual(tokenHash('secret-token'), tokenHash('secret-token'));
assert.notStrictEqual(tokenHash('secret-token'), tokenHash('other-token'));

const validRun = {
  sourceCounts: {
    workspaces: BASELINE.workspaces,
    boards: BASELINE.boards,
    visibleBoards: BASELINE.visibleBoards,
    internalSubitemBoards: BASELINE.internalSubitemBoards,
    items: BASELINE.items,
    subitems: BASELINE.subitems
  },
  stagedCounts: {
    workspaces: BASELINE.workspaces,
    boards: BASELINE.boards,
    visibleBoards: BASELINE.visibleBoards,
    internalBoards: BASELINE.internalSubitemBoards,
    items: BASELINE.items,
    subitems: BASELINE.subitems
  }
};
assert.strictEqual(baselineMatches(validRun), true);
assert.strictEqual(baselineMatches({ ...validRun, sourceCounts: { ...validRun.sourceCounts, boards: 102 } }), false);
assert.strictEqual(baselineMatches({ ...validRun, stagedCounts: { ...validRun.stagedCounts, subitems: 412 } }), false);

console.log('cutover tests passed');
