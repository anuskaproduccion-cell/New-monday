const assert = require('assert');
const ExcelJS = require('exceljs');
const {
  BACKUP_SCHEMA_VERSION,
  confirmationText,
  parseTimeline,
  valueFromExcel,
  readManifest,
  readBoardDirectory
} = require('../services/excelRecovery');

assert.deepStrictEqual(parseTimeline('2026-10-26 → 2026-10-30'), {
  from: '2026-10-26',
  to: '2026-10-30'
});
assert.deepStrictEqual(parseTimeline('2026-10-26'), {
  from: '2026-10-26',
  to: '2026-10-26'
});

const status = valueFromExcel('Done', { type: 'status' }, { type: 'status', label: 'Working on it' });
assert.strictEqual(status.label, 'Done');
assert.strictEqual(status.text, 'Done');

const timeline = valueFromExcel('2026-11-01 -> 2026-11-05', { type: 'timeline' }, { type: 'timeline' });
assert.strictEqual(timeline.from, '2026-11-01');
assert.strictEqual(timeline.to, '2026-11-05');

const number = valueFromExcel('1,5', { type: 'numbers' }, { type: 'numbers' });
assert.strictEqual(number.value, 1.5);

assert.strictEqual(confirmationText('abc123'), 'APPLY_EXCEL_RECOVERY_abc123');

const workbook = new ExcelJS.Workbook();
const manifest = workbook.addWorksheet('_MANIFEST');
manifest.addRows([
  ['key', 'value'],
  ['schemaVersion', BACKUP_SCHEMA_VERSION],
  ['generatedAt', '2026-08-24T14:00:00.000Z']
]);
const boards = workbook.addWorksheet('_BOARDS');
boards.addRow(['_NM_BOARD_ID', '_MONDAY_BOARD_ID', '_NM_BOARD_UPDATED_AT', '_EXCEL_SHEET', 'Tablero / Fase']);
boards.addRow(['64b000000000000000000001', '5097244458', '2026-08-24T13:00:00.000Z', 'GY_POST', 'GY_POST']);

const parsedManifest = readManifest(workbook);
assert.strictEqual(Number(parsedManifest.schemaVersion), BACKUP_SCHEMA_VERSION);
const directory = readBoardDirectory(workbook);
assert.strictEqual(directory.length, 1);
assert.strictEqual(directory[0].sheetName, 'GY_POST');
assert.strictEqual(directory[0].mondayId, '5097244458');

console.log('excelRecovery tests passed');
