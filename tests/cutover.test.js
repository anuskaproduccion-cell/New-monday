const assert = require('assert');
const {
  BASELINE,
  PREPARE_CONFIRMATION,
  PROMOTE_CONFIRMATION,
  tokenHash,
  productionCountsAreEmpty,
  baselineMatches,
  runIsEligibleForPromotion,
  previewIsSafe,
  finalCountsMatch
} = require('../routes/cutover');

assert.strictEqual(PREPARE_CONFIRMATION, 'PREPARE_NEW_MONDAY_CUTOVER');
assert.strictEqual(PROMOTE_CONFIRMATION, 'PROMOTE_NEW_MONDAY_17_103_1230');
assert.strictEqual(tokenHash('secret-token'), tokenHash('secret-token'));
assert.notStrictEqual(tokenHash('secret-token'), tokenHash('other-token'));

assert.strictEqual(productionCountsAreEmpty({ workspaces: 0, boards: 0, items: 0 }), true);
assert.strictEqual(productionCountsAreEmpty({ workspaces: 0, boards: 1, items: 0 }), false);
assert.strictEqual(productionCountsAreEmpty({ workspaces: 1, boards: 0, items: 0 }), false);
assert.strictEqual(productionCountsAreEmpty({ workspaces: 0, boards: 0, items: 1 }), false);

const validRun = {
  status: 'completed',
  audit: { ok: true },
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
assert.strictEqual(runIsEligibleForPromotion(validRun), true);
assert.strictEqual(runIsEligibleForPromotion({ ...validRun, status: 'running' }), false);
assert.strictEqual(runIsEligibleForPromotion({ ...validRun, audit: { ok: false } }), false);
assert.strictEqual(runIsEligibleForPromotion({ ...validRun, sourceCounts: { ...validRun.sourceCounts, items: 1229 } }), false);

assert.strictEqual(previewIsSafe({ ready: true, deletesPlanned: 0, conflicts: [] }), true);
assert.strictEqual(previewIsSafe({ ready: false, deletesPlanned: 0, conflicts: [] }), false);
assert.strictEqual(previewIsSafe({ ready: true, deletesPlanned: 1, conflicts: [] }), false);
assert.strictEqual(previewIsSafe({ ready: true, deletesPlanned: 0, conflicts: [{ kind: 'board' }] }), false);

const validFinalCounts = {
  workspaces: BASELINE.workspaces,
  boards: BASELINE.boards,
  items: BASELINE.items + BASELINE.subitems
};
assert.strictEqual(finalCountsMatch(validFinalCounts), true);
assert.strictEqual(finalCountsMatch({ ...validFinalCounts, boards: 102 }), false);
assert.strictEqual(finalCountsMatch({ ...validFinalCounts, items: validFinalCounts.items - 1 }), false);

console.log('cutover tests passed');
