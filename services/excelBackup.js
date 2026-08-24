const ExcelJS = require('exceljs');
const Workspace = require('../models/Workspace');
const Board = require('../models/Board');
const Item = require('../models/Item');

const BACKUP_SCHEMA_VERSION = 2;
const RECOVERY_READ_ONLY_TYPES = new Set(['formula', 'mirror', 'file', 'dependency', 'board_relation']);

function safeSheetName(name, used = new Set()) {
  const cleaned = String(name || 'Board')
    .replace(/[\\/*?:[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Board';
  const base = cleaned.slice(0, 31);
  let candidate = base;
  let index = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${index})`;
    candidate = `${base.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
    index += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function displayColumnValue(value, type) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;

  switch (type || value.type) {
    case 'status': return value.label ?? value.text ?? '';
    case 'people': return value.text ?? '';
    case 'timeline': return [value.from, value.to].filter(Boolean).join(' → ');
    case 'date': return value.date ?? value.text ?? '';
    case 'formula': return value.displayValue ?? value.value ?? value.text ?? '';
    case 'mirror': return value.displayValue ?? value.text ?? '';
    case 'dependency':
    case 'board_relation': return (value.linkedItems || []).map(item => item.name).filter(Boolean).join(', ') || value.text || '';
    case 'world_clock': return value.timezone ?? value.text ?? '';
    case 'dropdown': return Array.isArray(value.labels) ? value.labels.join(', ') : value.text || '';
    case 'email': return value.email ?? value.text ?? '';
    case 'link': return value.url ?? value.text ?? '';
    case 'file': return (value.files || []).map(file => file.name || file.asset?.name || file.url).filter(Boolean).join(', ') || value.text || '';
    case 'numbers': return value.value ?? value.text ?? '';
    case 'text': return value.value ?? value.text ?? '';
    default: return value.displayValue ?? value.text ?? value.value ?? '';
  }
}

function statusLabels(column) {
  const settings = column?.settings || {};
  const labels = settings.labels || settings.labels_colors || {};
  if (Array.isArray(labels)) return labels.map(label => label.label || label.name).filter(Boolean);
  return Object.values(labels).map(label => typeof label === 'string' ? label : label?.name || label?.label).filter(Boolean);
}

function dropdownLabels(column) {
  const labels = column?.settings?.labels || [];
  if (Array.isArray(labels)) return labels.map(label => typeof label === 'string' ? label : label?.name || label?.label).filter(Boolean);
  return [];
}

function legacyValue(item, column) {
  switch (column.id) {
    case 'person': return item.person || '';
    case 'status': return item.status || '';
    case 'timeline': return [item.startDate, item.endDate].filter(Boolean).map(date => new Date(date).toISOString().slice(0, 10)).join(' → ');
    // Item.formula has a legacy schema default of 0. Treat that implicit default as
    // "no legacy value" so a missing dynamic Formula cell is not exported as an
    // apparent manual edit and then rejected by recovery as read-only tampering.
    case 'formula': return item.formula === 0 ? '' : (item.formula ?? '');
    case 'dependency': return item.dependency || '';
    case 'world_clock': return item.extraFields?.timezone || '';
    case 'overlap': return item.extraFields?.overlapWeeks ?? '';
    case 'notes': return item.notes || '';
    default: return '';
  }
}

function styleHeader(row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6161FF' } };
  row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  row.height = 26;
}

function addInlineListValidation(sheet, columnNumber, fromRow, toRow, values) {
  const cleaned = [...new Set((values || []).map(value => String(value || '').trim()).filter(Boolean))];
  if (!cleaned.length || cleaned.join(',').length >= 250) return;
  const column = sheet.getColumn(columnNumber);
  sheet.dataValidations.add(`${column.letter}${fromRow}:${column.letter}${toRow}`, {
    type: 'list',
    allowBlank: true,
    formulae: [`"${cleaned.map(label => label.replace(/"/g, '""')).join(',')}"`]
  });
}

async function buildEmergencyWorkbook() {
  const [workspaces, boards, items] = await Promise.all([
    Workspace.find({ archived: { $ne: true } }).sort({ order: 1, name: 1 }).lean(),
    Board.find({ archived: { $ne: true }, internal: { $ne: true } }).populate('workspaceRef').sort({ order: 1, name: 1 }).lean(),
    Item.find({ archived: { $ne: true }, deletedAt: null }).sort({ board: 1, isSubitem: 1, order: 1, createdAt: 1 }).lean()
  ]);

  const generatedAt = new Date().toISOString();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'New Monday';
  workbook.company = 'New Monday';
  workbook.subject = 'Emergency operational backup';
  workbook.title = 'NEW_MONDAY_BACKUP';
  workbook.created = new Date();
  workbook.modified = new Date();

  const usedNames = new Set(['_readme', '_manifest', '_workspaces', '_boards']);
  const sheetNames = new Map();
  boards.forEach(board => sheetNames.set(String(board._id), safeSheetName(board.name, usedNames)));

  const readme = workbook.addWorksheet('_README');
  readme.columns = [{ width: 28 }, { width: 100 }];
  readme.addRows([
    ['NEW MONDAY · BACKUP DE EMERGENCIA', ''],
    ['Uso', 'Este archivo permite continuar trabajando si New Monday no está disponible. Cada tablero visible tiene su propia pestaña.'],
    ['Editar', 'Puedes cambiar Elemento, Grupo y las columnas editables. Mantén intacta la fila técnica oculta 1 y las columnas técnicas ocultas.'],
    ['Crear elemento', 'Añade una fila nueva, escribe Elemento, Grupo y Tipo = Elemento. Los IDs técnicos deben quedar vacíos.'],
    ['Crear subelemento', 'Añade una fila nueva, Tipo = Subelemento y escribe el nombre exacto del Elemento padre.'],
    ['Archivar / papelera', 'En Acción puedes elegir ARCHIVAR o PAPELERA. Eliminar una fila del Excel NO borra nada en New Monday.'],
    ['Solo lectura en recuperación', 'Fórmula, Espejo, Archivos, Dependencia y Relación entre tableros se conservan pero no se recuperan desde una edición manual del Excel.'],
    ['Recuperación segura', 'Al volver New Monday, el Excel se previsualiza primero. Si hay cambios concurrentes o conflictos, no se sobrescribe nada automáticamente.'],
    ['Monday original', 'Este Excel se genera desde New Monday y su recuperación escribe únicamente en New Monday. Monday original nunca recibe escrituras.'],
    ['Generado', generatedAt]
  ]);
  readme.getRow(1).font = { bold: true, size: 16 };
  readme.getColumn(2).alignment = { wrapText: true, vertical: 'top' };

  const manifestSheet = workbook.addWorksheet('_MANIFEST');
  manifestSheet.addRows([
    ['key', 'value'],
    ['schemaVersion', BACKUP_SCHEMA_VERSION],
    ['generatedAt', generatedAt],
    ['source', 'new-monday'],
    ['recoveryMode', 'preview-before-apply'],
    ['mondayWriteOperations', 0],
    ['workspaces', workspaces.length],
    ['boards', boards.length],
    ['items', items.filter(item => !item.isSubitem).length],
    ['subitems', items.filter(item => item.isSubitem).length]
  ]);
  styleHeader(manifestSheet.getRow(1));
  manifestSheet.state = 'veryHidden';

  const wsSheet = workbook.addWorksheet('_WORKSPACES');
  wsSheet.columns = [
    { header: '_NM_WORKSPACE_ID', key: 'id', width: 26 },
    { header: '_MONDAY_WORKSPACE_ID', key: 'mondayId', width: 22 },
    { header: 'Workspace / Película', key: 'name', width: 36 },
    { header: 'Clasificación', key: 'classification', width: 18 },
    { header: 'Descripción', key: 'description', width: 50 }
  ];
  styleHeader(wsSheet.getRow(1));
  workspaces.forEach(workspace => wsSheet.addRow({
    id: String(workspace._id),
    mondayId: workspace.mondayId || '',
    name: workspace.name,
    classification: workspace.classification || '',
    description: workspace.description || ''
  }));
  wsSheet.views = [{ state: 'frozen', ySplit: 1 }];
  wsSheet.autoFilter = { from: 'A1', to: 'E1' };

  const boardSheet = workbook.addWorksheet('_BOARDS');
  boardSheet.columns = [
    { header: '_NM_BOARD_ID', key: 'id', width: 26 },
    { header: '_MONDAY_BOARD_ID', key: 'mondayId', width: 20 },
    { header: '_NM_BOARD_UPDATED_AT', key: 'updatedAt', width: 26 },
    { header: '_EXCEL_SHEET', key: 'sheetName', width: 32 },
    { header: 'Workspace / Película', key: 'workspace', width: 34 },
    { header: 'Tablero / Fase', key: 'name', width: 38 },
    { header: 'Grupos', key: 'groups', width: 10 },
    { header: 'Columnas', key: 'columns', width: 10 },
    { header: 'Vistas', key: 'views', width: 10 }
  ];
  styleHeader(boardSheet.getRow(1));
  boards.forEach(board => boardSheet.addRow({
    id: String(board._id),
    mondayId: board.mondayId || '',
    updatedAt: board.updatedAt ? new Date(board.updatedAt).toISOString() : '',
    sheetName: sheetNames.get(String(board._id)),
    workspace: board.workspaceRef?.name || board.workspace || '',
    name: board.name,
    groups: (board.groups || []).length,
    columns: (board.columns || []).length,
    views: (board.views || []).length
  }));
  boardSheet.views = [{ state: 'frozen', ySplit: 1 }];
  boardSheet.autoFilter = { from: 'A1', to: 'I1' };

  const itemsByBoard = new Map();
  const itemsById = new Map();
  items.forEach(item => {
    const key = String(item.board);
    if (!itemsByBoard.has(key)) itemsByBoard.set(key, []);
    itemsByBoard.get(key).push(item);
    itemsById.set(String(item._id), item);
  });

  for (const board of boards) {
    const sheet = workbook.addWorksheet(sheetNames.get(String(board._id)));
    const columns = (board.columns || []).filter(column => !column.hidden).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const technical = [
      { key: '_NM_ITEM_ID', title: '_NM_ITEM_ID', width: 26 },
      { key: '_MONDAY_ITEM_ID', title: '_MONDAY_ITEM_ID', width: 20 },
      { key: '_NM_PARENT_ITEM_ID', title: '_NM_PARENT_ITEM_ID', width: 26 },
      { key: '_IS_SUBITEM', title: '_IS_SUBITEM', width: 12 },
      { key: '_GROUP_ID', title: '_GROUP_ID', width: 20 },
      { key: '_RAW_COLUMN_VALUES_JSON', title: '_RAW_COLUMN_VALUES_JSON', width: 20 },
      { key: '_BASELINE_JSON', title: '_BASELINE_JSON', width: 20 }
    ];
    const userColumns = [
      { key: 'name', title: 'Elemento', width: 34 },
      { key: 'group', title: 'Grupo', width: 24 },
      { key: '_TYPE', title: 'Tipo', width: 15 },
      { key: '_PARENT_NAME', title: 'Elemento padre', width: 32 },
      { key: '_ACTION', title: 'Acción', width: 16 },
      ...columns.map(column => ({ key: column.id, title: column.title, width: 20, type: column.type, source: column }))
    ];
    const allColumns = [...technical, ...userColumns];

    sheet.getRow(1).values = allColumns.map(column => column.key);
    sheet.getRow(2).values = allColumns.map(column => column.title);
    styleHeader(sheet.getRow(2));
    sheet.getRow(1).hidden = true;
    allColumns.forEach((column, index) => {
      sheet.getColumn(index + 1).width = column.width;
      sheet.getColumn(index + 1).alignment = { vertical: 'top', wrapText: true };
    });

    const boardItems = itemsByBoard.get(String(board._id)) || [];
    for (const item of boardItems) {
      const parent = item.parentItem ? itemsById.get(String(item.parentItem)) : null;
      const parentName = parent?.name || '';
      const baseline = {
        name: item.name || '',
        group: item.group || '',
        groupId: item.groupId || '',
        isSubitem: Boolean(item.isSubitem),
        parentItem: item.parentItem ? String(item.parentItem) : null,
        parentName,
        columnValues: item.columnValues || {},
        updatedAt: item.updatedAt ? new Date(item.updatedAt).toISOString() : null
      };
      const row = [
        String(item._id),
        item.mondayId || '',
        item.parentItem ? String(item.parentItem) : '',
        Boolean(item.isSubitem),
        item.groupId || '',
        JSON.stringify(item.columnValues || {}),
        JSON.stringify(baseline),
        item.name || '',
        item.group || '',
        item.isSubitem ? 'Subelemento' : 'Elemento',
        parentName,
        ''
      ];
      for (const column of columns) {
        const hasDynamic = item.columnValues && Object.prototype.hasOwnProperty.call(item.columnValues, column.id);
        row.push(hasDynamic ? displayColumnValue(item.columnValues[column.id], column.type) : legacyValue(item, column));
      }
      sheet.addRow(row);
    }

    sheet.views = [{ state: 'frozen', xSplit: technical.length + 5, ySplit: 2 }];
    sheet.autoFilter = { from: { row: 2, column: technical.length + 1 }, to: { row: 2, column: allColumns.length } };
    for (let colIndex = 1; colIndex <= technical.length; colIndex += 1) sheet.getColumn(colIndex).hidden = true;

    const validationEnd = Math.max(3, sheet.rowCount + 500);
    addInlineListValidation(sheet, technical.length + 3, 3, validationEnd, ['Elemento', 'Subelemento']);
    addInlineListValidation(sheet, technical.length + 5, 3, validationEnd, ['ARCHIVAR', 'PAPELERA']);
    addInlineListValidation(sheet, technical.length + 2, 3, validationEnd, (board.groups || []).filter(group => !group.archived).map(group => group.title));

    columns.forEach((column, offset) => {
      const excelColumn = technical.length + 5 + offset + 1;
      const labels = column.type === 'status' ? statusLabels(column) : column.type === 'dropdown' ? dropdownLabels(column) : [];
      addInlineListValidation(sheet, excelColumn, 3, validationEnd, labels);
      if (RECOVERY_READ_ONLY_TYPES.has(column.type)) {
        sheet.getColumn(excelColumn).font = { italic: true, color: { argb: 'FF777777' } };
      }
    });
  }

  return {
    workbook,
    manifest: {
      schemaVersion: BACKUP_SCHEMA_VERSION,
      generatedAt,
      workspaces: workspaces.length,
      boards: boards.length,
      items: items.filter(item => !item.isSubitem).length,
      subitems: items.filter(item => item.isSubitem).length,
      mondayWriteOperations: 0
    }
  };
}

async function buildEmergencyWorkbookBuffer() {
  const { workbook, manifest } = await buildEmergencyWorkbook();
  const buffer = await workbook.xlsx.writeBuffer();
  return { buffer, manifest };
}

module.exports = {
  BACKUP_SCHEMA_VERSION,
  RECOVERY_READ_ONLY_TYPES,
  safeSheetName,
  displayColumnValue,
  statusLabels,
  dropdownLabels,
  legacyValue,
  buildEmergencyWorkbook,
  buildEmergencyWorkbookBuffer
};