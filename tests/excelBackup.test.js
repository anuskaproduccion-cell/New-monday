const assert = require('assert');
const { safeSheetName, displayColumnValue, legacyValue } = require('../services/excelBackup');

const used = new Set();
const long = safeSheetName('MQFR_MI QUERIDA FAMILIA RUSA_POST', used);
assert.ok(long.length <= 31);
const duplicate = safeSheetName('MQFR_MI QUERIDA FAMILIA RUSA_POST', used);
assert.notStrictEqual(duplicate, long);
assert.ok(duplicate.length <= 31);
assert.strictEqual(safeSheetName('A/B:C?D*E[F]G', used).includes('/'), false);

assert.strictEqual(displayColumnValue({ type: 'status', label: 'Done' }, 'status'), 'Done');
assert.strictEqual(displayColumnValue({ type: 'timeline', from: '2026-08-01', to: '2026-08-05' }, 'timeline'), '2026-08-01 → 2026-08-05');
assert.strictEqual(displayColumnValue({ type: 'dependency', linkedItems: [{ name: 'Picture Lock' }, { name: 'VFX' }] }, 'dependency'), 'Picture Lock, VFX');
assert.strictEqual(displayColumnValue({ type: 'file', files: [{ name: 'still.png' }] }, 'file'), 'still.png');

// Item.formula defaults to 0 in the legacy schema. If no dynamic Formula value exists,
// that implicit default must not appear in the workbook as a user-visible Formula edit.
assert.strictEqual(legacyValue({ formula: 0 }, { id: 'formula' }), '');
assert.strictEqual(legacyValue({ formula: 3 }, { id: 'formula' }), 3);

console.log('excelBackup tests passed');
