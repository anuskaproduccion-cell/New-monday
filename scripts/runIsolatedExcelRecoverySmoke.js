const assert = require('assert');
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const Workspace = require('../models/Workspace');
const Board = require('../models/Board');
const Item = require('../models/Item');
const ExcelRecoveryRun = require('../models/ExcelRecoveryRun');
const { buildEmergencyWorkbookBuffer } = require('../services/excelBackup');
const { buildRecoveryPreview, applyRecoveryRun } = require('../services/excelRecovery');
const { normalizedMongoTarget } = require('./runIsolatedMondayStaging');

function assertIsolatedRecoveryEnvironment(env = process.env) {
  const stagingUri = env.MONGODB_STAGING_URI;
  if (!stagingUri) throw new Error('MONGODB_STAGING_URI is required');

  const stagingTarget = normalizedMongoTarget(stagingUri);
  if (!stagingTarget.databaseName || !/(staging|test|sandbox)/i.test(stagingTarget.databaseName)) {
    throw new Error(`Safety block: recovery smoke database must contain staging/test/sandbox; received “${stagingTarget.databaseName || '(empty)'}”`);
  }

  if (env.MONGODB_URI) {
    const productionTarget = normalizedMongoTarget(env.MONGODB_URI);
    if (
      productionTarget.protocol === stagingTarget.protocol
      && productionTarget.host === stagingTarget.host
      && productionTarget.databaseName === stagingTarget.databaseName
    ) {
      throw new Error('Safety block: recovery smoke target resolves to the production database');
    }
  }

  return { stagingUri, databaseName: stagingTarget.databaseName };
}

function technicalHeaders(sheet) {
  const map = new Map();
  const row = sheet.getRow(1);
  for (let column = 1; column <= row.cellCount; column += 1) {
    const value = row.getCell(column).value;
    const key = value == null ? '' : String(value).trim();
    if (key) map.set(key, column);
  }
  return map;
}

function boardSheetName(workbook, boardId) {
  const directory = workbook.getWorksheet('_BOARDS');
  if (!directory) throw new Error('Backup is missing _BOARDS');

  let idColumn = 0;
  let sheetColumn = 0;
  directory.getRow(1).eachCell((cell, column) => {
    if (String(cell.value || '') === '_NM_BOARD_ID') idColumn = column;
    if (String(cell.value || '') === '_EXCEL_SHEET') sheetColumn = column;
  });
  if (!idColumn || !sheetColumn) throw new Error('Backup board directory is incomplete');

  for (let rowNumber = 2; rowNumber <= directory.rowCount; rowNumber += 1) {
    const row = directory.getRow(rowNumber);
    if (String(row.getCell(idColumn).value || '') === String(boardId)) {
      return String(row.getCell(sheetColumn).value || '');
    }
  }
  throw new Error(`Test board ${boardId} is not present in backup`);
}

function findItemRow(sheet, headers, itemId) {
  const idColumn = headers.get('_NM_ITEM_ID');
  if (!idColumn) throw new Error('Board sheet is missing _NM_ITEM_ID');
  for (let rowNumber = 3; rowNumber <= sheet.rowCount; rowNumber += 1) {
    if (String(sheet.getRow(rowNumber).getCell(idColumn).value || '') === String(itemId)) return rowNumber;
  }
  throw new Error(`Item ${itemId} is not present in backup sheet`);
}

function setByKey(row, headers, key, value) {
  const column = headers.get(key);
  if (!column) throw new Error(`Backup sheet is missing ${key}`);
  row.getCell(column).value = value;
}

async function editHappyPathWorkbook(buffer, boardId, itemId, archiveItemId, trashItemId, names) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheetName = boardSheetName(workbook, boardId);
  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet) throw new Error(`Backup sheet ${sheetName} is missing`);
  const headers = technicalHeaders(sheet);

  const existingRow = sheet.getRow(findItemRow(sheet, headers, itemId));
  setByKey(existingRow, headers, 'status', 'Done');
  setByKey(existingRow, headers, 'timeline', '2026-09-02 → 2026-09-06');
  setByKey(existingRow, headers, 'notes', 'Editado sin conexión');
  setByKey(existingRow, headers, 'effort', 2.5);
  setByKey(existingRow, headers, 'category', 'B');

  const archiveRow = sheet.getRow(findItemRow(sheet, headers, archiveItemId));
  setByKey(archiveRow, headers, '_ACTION', 'ARCHIVAR');

  const trashRow = sheet.getRow(findItemRow(sheet, headers, trashItemId));
  setByKey(trashRow, headers, '_ACTION', 'PAPELERA');

  const parentRow = sheet.getRow(sheet.rowCount + 1);
  setByKey(parentRow, headers, 'name', names.parent);
  setByKey(parentRow, headers, 'group', 'EDITING');
  setByKey(parentRow, headers, '_TYPE', 'Elemento');
  setByKey(parentRow, headers, '_PARENT_NAME', '');
  setByKey(parentRow, headers, '_ACTION', '');
  setByKey(parentRow, headers, 'status', 'Done');
  setByKey(parentRow, headers, 'notes', 'Creado durante la caída');
  setByKey(parentRow, headers, 'effort', 1.25);
  setByKey(parentRow, headers, 'category', 'A');

  const subitemRow = sheet.getRow(sheet.rowCount + 1);
  setByKey(subitemRow, headers, 'name', names.subitem);
  setByKey(subitemRow, headers, 'group', 'EDITING');
  setByKey(subitemRow, headers, '_TYPE', 'Subelemento');
  setByKey(subitemRow, headers, '_PARENT_NAME', names.parent);
  setByKey(subitemRow, headers, '_ACTION', '');
  setByKey(subitemRow, headers, 'status', 'Done');
  setByKey(subitemRow, headers, 'notes', 'Subelemento creado sin conexión');

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function editConflictWorkbook(buffer, boardId, itemId) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheetName = boardSheetName(workbook, boardId);
  const sheet = workbook.getWorksheet(sheetName);
  const headers = technicalHeaders(sheet);
  const row = sheet.getRow(findItemRow(sheet, headers, itemId));
  setByKey(row, headers, 'notes', 'Cambio hecho en el Excel mientras New Monday también cambió');
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function editReadOnlyFormulaWorkbook(buffer, boardId, itemId) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheetName = boardSheetName(workbook, boardId);
  const sheet = workbook.getWorksheet(sheetName);
  const headers = technicalHeaders(sheet);
  const row = sheet.getRow(findItemRow(sheet, headers, itemId));
  setByKey(row, headers, 'formula', 999);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function runRecoverySmoke(env = process.env) {
  const { stagingUri, databaseName } = assertIsolatedRecoveryEnvironment(env);
  await mongoose.connect(stagingUri);

  const smokeId = `excel-recovery-smoke-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const names = {
    workspace: `RECOVERY_SMOKE_${smokeId}`,
    board: `RECOVERY_SMOKE_BOARD_${smokeId}`,
    parent: `OFFLINE_NEW_ITEM_${smokeId}`,
    subitem: `OFFLINE_NEW_SUBITEM_${smokeId}`
  };
  let workspace = null;
  let board = null;
  let original = null;
  let archiveItem = null;
  let trashItem = null;
  const recoveryRunIds = [];
  let passed = false;

  try {
    workspace = await Workspace.create({
      name: names.workspace,
      classification: 'technical',
      source: 'local',
      originMeta: { smokeTestId: smokeId }
    });

    board = await Board.create({
      name: names.board,
      workspace: names.workspace,
      workspaceRef: workspace._id,
      source: 'local',
      internal: false,
      groups: [
        { id: 'editing', title: 'EDITING', color: '#579bfc', order: 0 },
        { id: 'online', title: 'ONLINE', color: '#9d50dd', order: 1 }
      ],
      columns: [
        {
          id: 'status', title: 'Estado', type: 'status', order: 0,
          settings: { labels: { 0: 'Working on it', 1: 'Done' } }
        },
        { id: 'timeline', title: 'Cronograma', type: 'timeline', order: 1, settings: {} },
        { id: 'notes', title: 'Notas', type: 'text', order: 2, settings: {} },
        { id: 'effort', title: 'Esfuerzo', type: 'numbers', order: 3, settings: {} },
        {
          id: 'category', title: 'Categoría', type: 'dropdown', order: 4,
          settings: { labels: [{ name: 'A' }, { name: 'B' }] }
        },
        {
          id: 'formula', title: 'Fórmula', type: 'formula', order: 5,
          settings: { formula: 'MAX(ROUNDDOWN(WORKDAYS({timeline#End},{timeline#Start})/5,0),0)' }
        }
      ],
      views: [{ id: 'main', name: 'Tabla principal', type: 'table', order: 0 }],
      originMeta: { smokeTestId: smokeId }
    });

    original = await Item.create({
      board: board._id,
      groupId: 'editing',
      group: 'EDITING',
      groupColor: '#579bfc',
      name: 'Elemento base',
      order: 0,
      source: 'local',
      isSubitem: false,
      columnValues: {
        status: { type: 'status', text: 'Working on it', label: 'Working on it' },
        timeline: { type: 'timeline', text: '2026-09-01 → 2026-09-05', from: '2026-09-01', to: '2026-09-05' },
        notes: { type: 'text', text: 'Antes del backup', value: 'Antes del backup' },
        effort: { type: 'numbers', text: '1', value: 1 },
        category: { type: 'dropdown', text: 'A', labels: ['A'] },
        formula: { type: 'formula', text: '1', displayValue: '1', value: 1 }
      },
      originMeta: { smokeTestId: smokeId }
    });

    await Item.create({
      board: board._id,
      groupId: 'editing',
      group: 'EDITING',
      groupColor: '#579bfc',
      name: 'Subelemento existente',
      order: 0,
      source: 'local',
      isSubitem: true,
      parentItem: original._id,
      columnValues: {
        status: { type: 'status', text: 'Working on it', label: 'Working on it' },
        notes: { type: 'text', text: 'Subitem previo', value: 'Subitem previo' }
      },
      originMeta: { smokeTestId: smokeId }
    });

    archiveItem = await Item.create({
      board: board._id,
      groupId: 'online',
      group: 'ONLINE',
      groupColor: '#9d50dd',
      name: 'Elemento para archivar',
      order: 1,
      source: 'local',
      isSubitem: false,
      columnValues: { notes: { type: 'text', text: 'Archivar offline', value: 'Archivar offline' } },
      originMeta: { smokeTestId: smokeId }
    });

    trashItem = await Item.create({
      board: board._id,
      groupId: 'online',
      group: 'ONLINE',
      groupColor: '#9d50dd',
      name: 'Elemento para papelera',
      order: 2,
      source: 'local',
      isSubitem: false,
      columnValues: { notes: { type: 'text', text: 'Papelera offline', value: 'Papelera offline' } },
      originMeta: { smokeTestId: smokeId }
    });

    const initialBackup = await buildEmergencyWorkbookBuffer();
    const editedBuffer = await editHappyPathWorkbook(
      initialBackup.buffer,
      board._id,
      original._id,
      archiveItem._id,
      trashItem._id,
      names
    );
    const preview = await buildRecoveryPreview(editedBuffer, { sourceFilename: `${smokeId}-happy.xlsx` });
    recoveryRunIds.push(preview.runId);

    assert.strictEqual(preview.status, 'previewed', `Happy-path preview blocked: ${JSON.stringify(preview.conflicts)}`);
    assert.strictEqual(preview.conflicts.length, 0, 'Happy-path recovery preview must have zero conflicts');
    assert.strictEqual(preview.summary.updates, 3, 'Expected one edited item plus archive and trash updates');
    assert.strictEqual(preview.summary.creates, 1, 'Expected one new parent item');
    assert.strictEqual(preview.summary.newSubitems, 1, 'Expected one new subitem');
    assert.strictEqual(preview.summary.archiveActions, 1, 'Expected one archive action');
    assert.strictEqual(preview.summary.trashActions, 1, 'Expected one trash action');
    assert.ok(preview.confirmationRequired, 'Recovery preview must require explicit confirmation');
    assert.strictEqual(preview.mondayWriteOperations, 0);

    const applyResult = await applyRecoveryRun(preview.runId, preview.confirmationRequired);
    assert.strictEqual(applyResult.status, 'applied');
    assert.strictEqual(applyResult.mondayWriteOperations, 0);
    assert.strictEqual(applyResult.applied.updated, 3);
    assert.strictEqual(applyResult.applied.created, 1);
    assert.strictEqual(applyResult.applied.subitems, 1);
    assert.strictEqual(applyResult.applied.archived, 1);
    assert.strictEqual(applyResult.applied.trashed, 1);

    const refreshed = await Item.findById(original._id).lean();
    assert.strictEqual(refreshed.columnValues.status.label, 'Done');
    assert.strictEqual(refreshed.columnValues.timeline.from, '2026-09-02');
    assert.strictEqual(refreshed.columnValues.timeline.to, '2026-09-06');
    assert.strictEqual(refreshed.columnValues.notes.value, 'Editado sin conexión');
    assert.strictEqual(refreshed.columnValues.effort.value, 2.5);
    assert.deepStrictEqual(refreshed.columnValues.category.labels, ['B']);

    const archived = await Item.findById(archiveItem._id).lean();
    const trashed = await Item.findById(trashItem._id).lean();
    assert.strictEqual(archived.archived, true, 'ARCHIVAR must mark the item archived');
    assert.ok(trashed.deletedAt, 'PAPELERA must set deletedAt');

    const createdParent = await Item.findOne({ board: board._id, name: names.parent, isSubitem: false }).lean();
    const createdSubitem = await Item.findOne({ board: board._id, name: names.subitem, isSubitem: true }).lean();
    assert.ok(createdParent, 'Offline-created parent item was not restored');
    assert.ok(createdSubitem, 'Offline-created subitem was not restored');
    assert.strictEqual(String(createdSubitem.parentItem), String(createdParent._id));

    // Formula is intentionally read-only in manual Excel recovery.
    const readOnlyBackup = await buildEmergencyWorkbookBuffer();
    const readOnlyBuffer = await editReadOnlyFormulaWorkbook(readOnlyBackup.buffer, board._id, original._id);
    const readOnlyPreview = await buildRecoveryPreview(readOnlyBuffer, { sourceFilename: `${smokeId}-readonly.xlsx` });
    recoveryRunIds.push(readOnlyPreview.runId);
    assert.strictEqual(readOnlyPreview.status, 'blocked');
    assert.ok(
      readOnlyPreview.conflicts.some(conflict => conflict.code === 'read_only_column_edited' && conflict.columnId === 'formula'),
      'Editing a Formula cell must block recovery'
    );
    assert.strictEqual(readOnlyPreview.confirmationRequired, null);

    const afterReadOnlyAttempt = await Item.findById(original._id).lean();
    assert.notStrictEqual(String(afterReadOnlyAttempt.columnValues.formula?.displayValue || ''), '999');

    // Conflict protection: create a fresh backup, edit it offline, then change the same item in New Monday.
    const conflictBackup = await buildEmergencyWorkbookBuffer();
    const conflictBuffer = await editConflictWorkbook(conflictBackup.buffer, board._id, original._id);
    await Item.findByIdAndUpdate(original._id, {
      $set: {
        'columnValues.notes': {
          type: 'text',
          text: 'Cambio concurrente en New Monday',
          value: 'Cambio concurrente en New Monday'
        }
      }
    });

    const conflictPreview = await buildRecoveryPreview(conflictBuffer, { sourceFilename: `${smokeId}-conflict.xlsx` });
    recoveryRunIds.push(conflictPreview.runId);
    assert.strictEqual(conflictPreview.status, 'blocked');
    assert.ok(conflictPreview.conflicts.length > 0, 'Concurrent edit must create a recovery conflict');
    assert.strictEqual(conflictPreview.confirmationRequired, null);
    assert.strictEqual(conflictPreview.mondayWriteOperations, 0);

    const afterConflict = await Item.findById(original._id).lean();
    assert.strictEqual(afterConflict.columnValues.notes.value, 'Cambio concurrente en New Monday');

    passed = true;
    const result = {
      status: 'passed',
      databaseName,
      backupGenerated: true,
      previewApplyVerified: true,
      offlineItemCreationVerified: true,
      offlineSubitemCreationVerified: true,
      archiveActionVerified: true,
      trashActionVerified: true,
      readOnlyFormulaProtectionVerified: true,
      concurrentConflictProtectionVerified: true,
      mondayReadOnly: true,
      mondayMutations: 0,
      productionWrites: 0,
      stagingTestWrites: true
    };
    console.log(JSON.stringify(result, null, 2));
    return result;
  } finally {
    if (board?._id) await Item.deleteMany({ board: board._id }).catch(() => {});
    if (board?._id) await Board.deleteOne({ _id: board._id }).catch(() => {});
    if (workspace?._id) await Workspace.deleteOne({ _id: workspace._id }).catch(() => {});
    if (recoveryRunIds.length) await ExcelRecoveryRun.deleteMany({ _id: { $in: recoveryRunIds } }).catch(() => {});
    console.log(JSON.stringify({ phase: 'cleanup', smokeId, completed: passed }));
    await mongoose.disconnect().catch(() => {});
  }
}

if (require.main === module) {
  runRecoverySmoke(process.env).catch(error => {
    console.error('Isolated Excel recovery smoke failed:', error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  assertIsolatedRecoveryEnvironment,
  technicalHeaders,
  boardSheetName,
  findItemRow,
  editHappyPathWorkbook,
  editConflictWorkbook,
  editReadOnlyFormulaWorkbook,
  runRecoverySmoke
};
