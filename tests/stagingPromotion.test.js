const assert = require('assert');
const {
  confirmationFor,
  classifyWorkspace,
  validateRunForPromotion,
  actionForExisting
} = require('../services/stagingPromotion');

assert.strictEqual(confirmationFor('abc123'), 'PROMOTE_STAGING_abc123');
assert.strictEqual(classifyWorkspace('GY_GUAYOTA'), 'film');
assert.strictEqual(classifyWorkspace('_POST'), 'technical');

assert.strictEqual(actionForExisting(null), 'insert');
assert.strictEqual(actionForExisting({ source: 'monday-import' }), 'update-imported');
assert.strictEqual(actionForExisting({ source: 'local' }), 'conflict-local');

assert.strictEqual(validateRunForPromotion({
  status: 'completed',
  audit: { ok: true },
  readOnlyMonday: true
}), true);

assert.throws(() => validateRunForPromotion({
  status: 'running',
  audit: { ok: true },
  readOnlyMonday: true
}), /completed staging run/);

assert.throws(() => validateRunForPromotion({
  status: 'completed',
  audit: { ok: false },
  readOnlyMonday: true
}), /audit must be fully green/);

assert.throws(() => validateRunForPromotion({
  status: 'completed',
  audit: { ok: true },
  readOnlyMonday: false
}), /not marked read-only/);

console.log('stagingPromotion tests passed');
