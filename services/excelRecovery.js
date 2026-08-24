const crypto = require('crypto');
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const Board = require('../models/Board');
const Item = require('../models/Item');
const ExcelRecoveryRun = require('../models/ExcelRecoveryRun');
const { displayColumnValue, statusLabels, dropdownLabels } = require('./excelBackup');
const { recalculateFormulaValues } = require('./formulaEngine');

const BACKUP_SCHEMA_VERSION = 2;
const READ_ONLY_TYPES = new Set(['formula', 'mirror', 'file', 'dependency', 'board_relation']);
const EDITABLE_TYPES = new Set(['text', 'numbers', 'status', 'people', 'timeline', 'date', 'world_clock', 'dropdown', 'email', 'link']);

function confirmationText(runId) {
  return `APPLY_EXCEL_RECOVERY_${String(runId)}`;
}

function cellScalar(cell) {
  const value = cell?.value;
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if (Object.prototype.hasOwnProperty.call(value, 'result')) return value.result ?? '';
    if (Array.isArray(value.richText)) return value.richText.map(entry => entry.text || '').join('');
    if (Object.prototype.hasOwnProperty.call(value, 'text')) return value.text ?? '';
  }
  return value;
}

function textValue(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

function comparable(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return textValue(value).replace(/\s+/g, ' ').trim();
}

function sameMoment(left, right) {
  if (!left && !right) return true;
  if (!left || !right) return false;
  const a = new Date(left).getTime();
  const b = new Date(right).getTime();
  return Number.isFinite(a) && Number.isFinite(b) && a === b;
}

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(String(value)); } catch (e) { return fallback; }
}

function isoDate(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const raw = textValue(value);
  const iso = raw.match(/^\d{4}-\d{2}-\d{2}$/)?.[0];
  if (iso) return iso;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function parseTimeline(value) {
  const raw = textValue(value);
  if (!raw) return { from: null, to: null };
  const parts = raw.split(/\s*(?:→|->|—|–)\s*/).filter(Boolean);
  const from = isoDate(parts[0]);
  const to = isoDate(parts[1] || parts[0]);
  if (!from || !to) throw new Error(`Cronograma inválido: ${raw}`);
  return { from, to };
}

function parseNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  const raw = textValue(value).replace(/\s/g, '');
  const normalized = raw.includes(',') && !raw.includes('.') ? raw.replace(',', '.') : raw.replace(/,/g, '');
  const number = Number(normalized);
  if (Number.isNaN(number)) throw new Error(`Número inválido: ${raw}`);
  return number;
}

function valueFromExcel(value, column, previous = null) {
  const type = column.type;
  if (!EDITABLE_TYPES.has(type)) return previous;
  const text = textValue(value);
  const base = previous && typeof previous === 'object' ? { ...previous } : { type };

  switch (type) {
    case 'text':
      return { ...base, type, text, value: text };
    case 'numbers': {
      const number = parseNumber(value);
      return { ...base, type, text: number === null ? '' : String(number), value: number };
    }
    case 'status':
      return { ...base, type, text, label: text };
    case 'people':
      return { ...base, type, text };
    case 'timeline': {
      const range = parseTimeline(value);
      return { ...base, type, text, ...range };
    }
    case 'date': {
      const date = text ? isoDate(value) : null;
      if (text && !date) throw new Error(`Fecha inválida: ${text}`);
      return { ...base, type, text: date || '', date };
    }
    case 'world_clock':
      return { ...base, type, text, timezone: text || null };
    case 'dropdown': {
      const labels = text ? text.split(',').map(label => label.trim()).filter(Boolean) : [];
      return { ...base, type, text, labels };
    }
    case 'email':
      return { ...base, type, text, email: text };
    case 'link':
      return { ...base, type, text, url: text, label: base.label || text };
    default:
      return previous;
  }
}

function headerMap(sheet, rowNumber = 1) {
  const map = new Map();
  const row = sheet.getRow(rowNumber);
  for (let column = 1; column <= row.cellCount; column += 1) {
    const key = textValue(cellScalar(row.getCell(column)));
    if (key) map.set(key, column);
  }
  return map;
}

function readManifest(workbook) {
  const sheet = workbook.getWorksheet('_MANIFEST');
  if (!sheet) throw new Error('No es un backup recuperable de New Monday: falta _MANIFEST');
  const manifest = {};
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const key = textValue(cellScalar(row.getCell(1)));
    if (!key) return;
    manifest[key] = cellScalar(row.getCell(2));
  });
  const version = Number(manifest.schemaVersion || 0);
  if (version !== BACKUP_SCHEMA_VERSION) {
    throw new Error(`Versión de backup no compatible: ${version || 'desconocida'}`);
  }
  return manifest;
}

function readBoardDirectory(workbook) {
  const sheet = workbook.getWorksheet('_BOARDS');
  if (!sheet) throw new Error('No es un backup recuperable de New Monday: falta _BOARDS');
  const headers = headerMap(sheet, 1);
  for (const required of ['_NM_BOARD_ID', '_EXCEL_SHEET']) {
    if (!headers.has(required)) throw new Error(`_BOARDS no contiene ${required}`);
  }
  const rows = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const boardId = textValue(cellScalar(row.getCell(headers.get('_NM_BOARD_ID'))));
    if (!boardId) continue;
    rows.push({
      boardId,
      mondayId: headers.has('_MONDAY_BOARD_ID') ? textValue(cellScalar(row.getCell(headers.get('_MONDAY_BOARD_ID')))) : '',
      name: headers.has('Tablero / Fase') ? textValue(cellScalar(row.getCell(headers.get('Tablero / Fase')))) : '',
      sheetName: textValue(cellScalar(row.getCell(headers.get('_EXCEL_SHEET')))),
      updatedAt: headers.has('_NM_BOARD_UPDATED_AT') ? textValue(cellScalar(row.getCell(headers.get('_NM_BOARD_UPDATED_AT')))) : ''
    });
  }
  return rows;
}

function allowedLabelsFor(column) {
  if (column.type === 'status') return statusLabels(column);
  if (column.type === 'dropdown') return dropdownLabels(column);
  return [];
}

function groupByName(board, name) {
  const needle = textValue(name).toLowerCase();
  return (board.groups || []).find(group => String(group.title || '').trim().toLowerCase() === needle && !group.archived) || null;
}

function parentCandidates(items, boardId, name) {
  const needle = textValue(name).toLowerCase();
  return items.filter(item =>
    String(item.board) === String(boardId) &&
    !item.isSubitem &&
    !item.archived &&
    !item.deletedAt &&
    String(item.name || '').trim().toLowerCase() === needle
  );
}

function buildColumnValuesFromRow({ row, keys, board, baselineValues = {}, conflicts, sheetName, rowNumber }) {
  const next = { ...(baselineValues || {}) };
  const changes = [];
  const boardColumns = new Map((board.columns || []).map(column => [column.id, column]));

  for (const [key, columnIndex] of keys.entries()) {
    const column = boardColumns.get(key);
    if (!column) continue;
    const cellValue = cellScalar(row.getCell(columnIndex));
    const previous = baselineValues?.[key] ?? null;
    const previousDisplay = comparable(displayColumnValue(previous, column.type));
    const nextDisplay = comparable(cellValue);

    if (READ_ONLY_TYPES.has(column.type)) {
      if (nextDisplay !== previousDisplay) {
        conflicts.push({
          code: 'read_only_column_edited',
          sheet: sheetName,
          row: rowNumber,
          columnId: column.id,
          column: column.title,
          type: column.type,
          message: `${column.title} es de solo lectura en el Excel de recuperación.`
        });
      }
      continue;
    }

    if (!EDITABLE_TYPES.has(column.type) || nextDisplay === previousDisplay) continue;

    try {
      const allowed = allowedLabelsFor(column);
      if (allowed.length && (column.type === 'status' || column.type === 'dropdown')) {
        const requested = column.type === 'dropdown'
          ? textValue(cellValue).split(',').map(value => value.trim()).filter(Boolean)
          : [textValue(cellValue)].filter(Boolean);
        const invalid = requested.filter(label => !allowed.includes(label));
        if (invalid.length) {
          conflicts.push({
            code: 'invalid_label', sheet: sheetName, row: rowNumber,
            columnId: column.id, column: column.title, invalid,
            message: `Valor no permitido en ${column.title}: ${invalid.join(', ')}`
          });
          continue;
        }
      }

      next[key] = valueFromExcel(cellValue, column, previous);
      changes.push({ columnId: key, title: column.title, type: column.type, from: previousDisplay, to: nextDisplay });
    } catch (error) {
      conflicts.push({
        code: 'invalid_cell_value', sheet: sheetName, row: rowNumber,
        columnId: column.id, column: column.title,
        message: error.message
      });
    }
  }

  return { columnValues: next, changes };
}

async function buildRecoveryPreview(buffer, { sourceFilename = '' } = {}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('Se requiere un archivo .xlsx');
  const workbookFingerprint = crypto.createHash('sha256').update(buffer).digest('hex');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const manifest = readManifest(workbook);
  const directory = readBoardDirectory(workbook);
  const boardIds = directory.map(entry => entry.boardId);
  const [boards, items] = await Promise.all([
    Board.find({ _id: { $in: boardIds }, archived: { $ne: true } }).lean(),
    Item.find({ board: { $in: boardIds } }).lean()
  ]);
  const boardMap = new Map(boards.map(board => [String(board._id), board]));
  const itemMap = new Map(items.map(item => [String(item._id), item]));
  const conflicts = [];
  const warnings = [];
  const operations = [];
  const createByTempKey = new Map();

  for (const entry of directory) {
    const board = boardMap.get(entry.boardId);
    if (!board) {
      conflicts.push({ code: 'board_missing', boardId: entry.boardId, message: `El tablero ${entry.name || entry.boardId} ya no existe en New Monday.` });
      continue;
    }
    const sheet = workbook.getWorksheet(entry.sheetName);
    if (!sheet) {
      conflicts.push({ code: 'sheet_missing', boardId: entry.boardId, sheet: entry.sheetName, message: `Falta la hoja ${entry.sheetName}.` });
      continue;
    }

    const schemaChanged = entry.updatedAt && !sameMoment(entry.updatedAt, board.updatedAt);
    if (schemaChanged) {
      warnings.push({ code: 'board_changed_since_backup', boardId: entry.boardId, sheet: entry.sheetName, message: 'El tablero cambió en New Monday después de generarse el Excel; cualquier fila editada se bloqueará por seguridad.' });
    }

    const keys = headerMap(sheet, 1);
    for (const required of ['_NM_ITEM_ID', '_BASELINE_JSON', 'name', 'group', '_TYPE', '_PARENT_NAME', '_ACTION']) {
      if (!keys.has(required)) {
        conflicts.push({ code: 'technical_column_missing', boardId: entry.boardId, sheet: entry.sheetName, key: required, message: `La hoja ${entry.sheetName} perdió la columna técnica ${required}.` });
      }
    }
    if (conflicts.some(conflict => conflict.sheet === entry.sheetName && conflict.code === 'technical_column_missing')) continue;

    for (let rowNumber = 3; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      const itemId = textValue(cellScalar(row.getCell(keys.get('_NM_ITEM_ID'))));
      const name = textValue(cellScalar(row.getCell(keys.get('name'))));
      const groupName = textValue(cellScalar(row.getCell(keys.get('group'))));
      const typeLabel = textValue(cellScalar(row.getCell(keys.get('_TYPE')))) || 'Elemento';
      const parentName = textValue(cellScalar(row.getCell(keys.get('_PARENT_NAME'))));
      const action = textValue(cellScalar(row.getCell(keys.get('_ACTION')))).toUpperCase();
      const baseline = parseJson(cellScalar(row.getCell(keys.get('_BASELINE_JSON'))), null);

      const hasAnything = Boolean(itemId || name || groupName || parentName || action);
      if (!hasAnything) continue;
      if (!name) {
        conflicts.push({ code: 'name_required', sheet: entry.sheetName, row: rowNumber, message: 'Una fila con datos no puede tener Elemento vacío.' });
        continue;
      }
      if (action && !['ARCHIVAR', 'PAPELERA'].includes(action)) {
        conflicts.push({ code: 'invalid_action', sheet: entry.sheetName, row: rowNumber, action, message: `Acción no válida: ${action}` });
        continue;
      }

      if (itemId) {
        const current = itemMap.get(itemId);
        if (!current || String(current.board) !== String(board._id)) {
          conflicts.push({ code: 'item_missing_or_moved', sheet: entry.sheetName, row: rowNumber, itemId, message: `El elemento ${name} ya no está en este tablero.` });
          continue;
        }
        if (!baseline) {
          conflicts.push({ code: 'baseline_missing', sheet: entry.sheetName, row: rowNumber, itemId, message: `Falta la línea base técnica de ${name}.` });
          continue;
        }

        const baselineValues = baseline.columnValues || {};
        const parsed = buildColumnValuesFromRow({ row, keys, board, baselineValues, conflicts, sheetName: entry.sheetName, rowNumber });
        const patch = {};
        const changes = [...parsed.changes];
        if (name !== String(baseline.name || '')) {
          patch.name = name;
          changes.push({ field: 'name', from: baseline.name || '', to: name });
        }
        if (groupName !== String(baseline.group || '')) {
          const group = groupByName(board, groupName);
          if (!group) {
            conflicts.push({ code: 'group_not_found', sheet: entry.sheetName, row: rowNumber, group: groupName, message: `El grupo ${groupName} no existe en ${board.name}.` });
          } else {
            patch.group = group.title;
            patch.groupId = group.id;
            patch.groupColor = group.color || current.groupColor;
            changes.push({ field: 'group', from: baseline.group || '', to: group.title });
          }
        }

        const baselineType = baseline.isSubitem ? 'Subelemento' : 'Elemento';
        if (typeLabel !== baselineType) {
          conflicts.push({ code: 'item_type_change_not_supported', sheet: entry.sheetName, row: rowNumber, message: 'No se puede convertir un elemento en subelemento o viceversa desde el Excel.' });
        }

        if (current.isSubitem && parentName !== String(baseline.parentName || '')) {
          const candidates = parentCandidates(items, board._id, parentName);
          if (candidates.length !== 1) {
            conflicts.push({ code: 'parent_ambiguous', sheet: entry.sheetName, row: rowNumber, parentName, message: `No se puede identificar de forma única el elemento padre ${parentName}.` });
          } else {
            patch.parentItem = String(candidates[0]._id);
            changes.push({ field: 'parent', from: baseline.parentName || '', to: parentName });
          }
        }

        if (parsed.changes.length) patch.columnValues = parsed.columnValues;
        if (action === 'ARCHIVAR') {
          patch.archived = true;
          changes.push({ field: 'action', to: 'ARCHIVAR' });
        }
        if (action === 'PAPELERA') {
          patch.deletedAt = '__NOW__';
          changes.push({ field: 'action', to: 'PAPELERA' });
        }

        if (!changes.length) continue;
        if (schemaChanged || !sameMoment(baseline.updatedAt, current.updatedAt)) {
          conflicts.push({
            code: 'concurrent_change', sheet: entry.sheetName, row: rowNumber, itemId,
            message: `${current.name} cambió en New Monday después de generarse el backup. No se sobrescribirá automáticamente.`
          });
          continue;
        }
        operations.push({
          kind: 'update', boardId: String(board._id), itemId, expectedUpdatedAt: current.updatedAt,
          patch, changes, sheet: entry.sheetName, row: rowNumber
        });
        continue;
      }

      const group = groupByName(board, groupName);
      if (!group) {
        conflicts.push({ code: 'group_not_found', sheet: entry.sheetName, row: rowNumber, group: groupName, message: `Para crear ${name}, el grupo ${groupName || '(vacío)'} debe existir en ${board.name}.` });
        continue;
      }
      const isSubitem = typeLabel.toLowerCase().startsWith('sub');
      const parsed = buildColumnValuesFromRow({ row, keys, board, baselineValues: {}, conflicts, sheetName: entry.sheetName, rowNumber });
      const tempKey = `${entry.sheetName}:${rowNumber}`;
      const operation = {
        kind: 'create', tempKey, boardId: String(board._id), name, group: group.title,
        groupId: group.id, groupColor: group.color || '#579bfc', isSubitem,
        parentName: isSubitem ? parentName : '', parentRef: null,
        columnValues: parsed.columnValues, sheet: entry.sheetName, row: rowNumber
      };
      operations.push(operation);
      createByTempKey.set(tempKey, operation);
    }
  }

  const createParentsByBoardName = new Map();
  for (const operation of operations.filter(operation => operation.kind === 'create' && !operation.isSubitem)) {
    const key = `${operation.boardId}:${operation.name.trim().toLowerCase()}`;
    if (!createParentsByBoardName.has(key)) createParentsByBoardName.set(key, []);
    createParentsByBoardName.get(key).push(operation);
  }

  for (const operation of operations.filter(operation => operation.kind === 'create' && operation.isSubitem)) {
    if (!operation.parentName) {
      conflicts.push({ code: 'parent_required', sheet: operation.sheet, row: operation.row, message: `El subelemento ${operation.name} necesita Elemento padre.` });
      continue;
    }
    const existing = parentCandidates(items, operation.boardId, operation.parentName);
    const newParents = createParentsByBoardName.get(`${operation.boardId}:${operation.parentName.trim().toLowerCase()}`) || [];
    if (existing.length + newParents.length !== 1) {
      conflicts.push({ code: 'parent_ambiguous', sheet: operation.sheet, row: operation.row, parentName: operation.parentName, message: `No se puede identificar de forma única el padre ${operation.parentName}.` });
      continue;
    }
    operation.parentRef = existing.length ? { kind: 'existing', id: String(existing[0]._id) } : { kind: 'temp', tempKey: newParents[0].tempKey };
  }

  const summary = {
    operations: operations.length,
    updates: operations.filter(operation => operation.kind === 'update').length,
    creates: operations.filter(operation => operation.kind === 'create' && !operation.isSubitem).length,
    newSubitems: operations.filter(operation => operation.kind === 'create' && operation.isSubitem).length,
    archiveActions: operations.filter(operation => operation.kind === 'update' && operation.patch.archived === true).length,
    trashActions: operations.filter(operation => operation.kind === 'update' && operation.patch.deletedAt === '__NOW__').length,
    conflicts: conflicts.length,
    warnings: warnings.length,
    mondayWriteOperations: 0
  };

  const run = await new ExcelRecoveryRun({
    status: conflicts.length ? 'blocked' : 'previewed',
    schemaVersion: BACKUP_SCHEMA_VERSION,
    workbookFingerprint,
    backupGeneratedAt: manifest.generatedAt ? new Date(manifest.generatedAt) : null,
    sourceFilename,
    readOnlyMonday: true,
    mondayWriteOperations: 0,
    summary,
    conflicts,
    warnings,
    operations
  }).save();

  return {
    runId: String(run._id),
    status: run.status,
    summary,
    conflicts,
    warnings,
    confirmationRequired: conflicts.length ? null : confirmationText(run._id),
    readOnlyMonday: true,
    mondayWriteOperations: 0
  };
}

async function applyRecoveryRun(runId, confirmation) {
  const run = await ExcelRecoveryRun.findById(runId);
  if (!run) throw new Error('Excel recovery run not found');
  if (run.status !== 'previewed') throw new Error(`Recovery run is not applicable: ${run.status}`);
  if ((run.conflicts || []).length) throw new Error('Recovery run has conflicts and cannot be applied');
  if (confirmation !== confirmationText(run._id)) throw new Error('Recovery confirmation text is invalid');

  const existingOperations = (run.operations || []).filter(operation => operation.kind === 'update');
  for (const operation of existingOperations) {
    const current = await Item.findById(operation.itemId).select('_id board updatedAt');
    if (!current || String(current.board) !== String(operation.boardId) || !sameMoment(current.updatedAt, operation.expectedUpdatedAt)) {
      throw new Error(`Recovery aborted: item ${operation.itemId} changed after preview`);
    }
  }

  const boardIds = [...new Set((run.operations || []).map(operation => String(operation.boardId)))];
  const boards = await Board.find({ _id: { $in: boardIds } });
  const boardMap = new Map(boards.map(board => [String(board._id), board]));
  const session = await mongoose.startSession();
  const createdMap = new Map();
  const applied = { updated: 0, created: 0, subitems: 0, archived: 0, trashed: 0 };

  try {
    await session.withTransaction(async () => {
      run.status = 'applying';
      await run.save({ session });

      for (const operation of (run.operations || []).filter(operation => operation.kind === 'create' && !operation.isSubitem)) {
        const max = await Item.findOne({ board: operation.boardId, groupId: operation.groupId, isSubitem: { $ne: true }, deletedAt: null })
          .sort({ order: -1 }).session(session).select('order');
        const item = new Item({
          board: operation.boardId,
          groupId: operation.groupId,
          group: operation.group,
          groupColor: operation.groupColor,
          name: operation.name,
          order: (max?.order ?? -1) + 1,
          columnValues: operation.columnValues || {},
          isSubitem: false,
          source: 'local',
          sourceReadOnly: false,
          originMeta: { recoveredFromExcelRun: String(run._id), recoveredAt: new Date().toISOString() }
        });
        const board = boardMap.get(String(operation.boardId));
        if (board) recalculateFormulaValues(board, item);
        await item.save({ session });
        createdMap.set(operation.tempKey, String(item._id));
        applied.created += 1;
      }

      for (const operation of (run.operations || []).filter(operation => operation.kind === 'create' && operation.isSubitem)) {
        const parentItem = operation.parentRef?.kind === 'existing'
          ? operation.parentRef.id
          : createdMap.get(operation.parentRef?.tempKey);
        if (!parentItem) throw new Error(`Could not resolve parent for ${operation.name}`);
        const max = await Item.findOne({ board: operation.boardId, parentItem, isSubitem: true, deletedAt: null })
          .sort({ order: -1 }).session(session).select('order');
        const item = new Item({
          board: operation.boardId,
          groupId: operation.groupId,
          group: operation.group,
          groupColor: operation.groupColor,
          name: operation.name,
          order: (max?.order ?? -1) + 1,
          columnValues: operation.columnValues || {},
          isSubitem: true,
          parentItem,
          source: 'local',
          sourceReadOnly: false,
          originMeta: { recoveredFromExcelRun: String(run._id), recoveredAt: new Date().toISOString() }
        });
        const board = boardMap.get(String(operation.boardId));
        if (board) recalculateFormulaValues(board, item);
        await item.save({ session });
        createdMap.set(operation.tempKey, String(item._id));
        applied.subitems += 1;
      }

      for (const operation of existingOperations) {
        const item = await Item.findById(operation.itemId).session(session);
        if (!item) throw new Error(`Item ${operation.itemId} disappeared during recovery`);
        const patch = { ...(operation.patch || {}) };
        if (patch.deletedAt === '__NOW__') patch.deletedAt = new Date();
        Object.assign(item, patch);
        if (patch.columnValues) item.markModified('columnValues');
        const board = boardMap.get(String(operation.boardId));
        if (board) recalculateFormulaValues(board, item);
        await item.save({ session });
        applied.updated += 1;
        if (patch.archived === true) applied.archived += 1;
        if (patch.deletedAt) applied.trashed += 1;
      }

      run.status = 'applied';
      run.appliedAt = new Date();
      run.summary = { ...(run.summary || {}), applied, mondayWriteOperations: 0 };
      await run.save({ session });
    });
  } catch (error) {
    run.status = 'failed';
    run.error = error.message || String(error);
    await run.save().catch(() => {});
    throw error;
  } finally {
    await session.endSession();
  }

  return {
    runId: String(run._id),
    status: 'applied',
    applied,
    readOnlyMonday: true,
    mondayWriteOperations: 0
  };
}

module.exports = {
  BACKUP_SCHEMA_VERSION,
  READ_ONLY_TYPES,
  EDITABLE_TYPES,
  confirmationText,
  cellScalar,
  textValue,
  comparable,
  parseTimeline,
  valueFromExcel,
  readManifest,
  readBoardDirectory,
  buildRecoveryPreview,
  applyRecoveryRun
};
