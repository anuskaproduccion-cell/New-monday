const ExcelJS = require('exceljs');
const Workspace = require('../models/Workspace');
const Board = require('../models/Board');
const Item = require('../models/Item');

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
    case 'formula': return item.formula ?? '';
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

async function buildEmergencyWorkbook() {
  const [workspaces, boards, items] = await Promise.all([
    Workspace.find({ archived: { $ne: true } }).sort({ order: 1, name: 1 }).lean(),
    Board.find({ archived: { $ne: true }, internal: { $ne: true } }).populate('workspaceRef').sort({ order: 1, name: 1 }).lean(),
    Item.find({ archived: { $ne: true }, deletedAt: null }).sort({ board: 1, isSubitem: 1, order: 1, createdAt: 1 }).lean()
  ]);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'New Monday';
  workbook.company = 'New Monday';
  workbook.subject = 'Emergency operational backup';
  workbook.title = 'NEW_MONDAY_BACKUP';
  workbook.created = new Date();
  workbook.modified = new Date();

  const readme = workbook.addWorksheet('_README');
  readme.columns = [{ width: 26 }, { width: 95 }];
  readme.addRows([
    ['NEW MONDAY · BACKUP DE EMERGENCIA', ''],
    ['Uso', 'Este archivo permite continuar trabajando si New Monday no está disponible. Cada tablero visible tiene su propia pestaña.'],
    ['Edición', 'Puedes editar las columnas visibles de las pestañas de tableros. No borres las columnas técnicas que empiezan por _NM_.'],
    ['Recuperación', 'Los IDs técnicos y la copia JSON oculta permiten reconciliar posteriormente los cambios con New Monday.'],
    ['Monday original', 'Este Excel se genera desde New Monday. No escribe ni modifica Monday original.'],
    ['Generado', new Date().toISOString()]
  ]);
  readme.getRow(1).font = { bold: true, size: 16 };
  readme.getColumn(2).alignment = { wrapText: true, vertical: 'top' };

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
    workspace: board.workspaceRef?.name || board.workspace || '',
    name: board.name,
    groups: (board.groups || []).length,
    columns: (board.columns || []).length,
    views: (board.views || []).length
  }));
  boardSheet.views = [{ state: 'frozen', ySplit: 1 }];
  boardSheet.autoFilter = { from: 'A1', to: 'G1' };

  const itemsByBoard = new Map();
  items.forEach(item => {
    const key = String(item.board);
    if (!itemsByBoard.has(key)) itemsByBoard.set(key, []);
    itemsByBoard.get(key).push(item);
  });

  const usedNames = new Set(['_readme', '_workspaces', '_boards']);
  for (const board of boards) {
    const sheet = workbook.addWorksheet(safeSheetName(board.name, usedNames));
    const columns = (board.columns || []).filter(column => !column.hidden).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const technical = [
      { key: '_NM_ITEM_ID', title: '_NM_ITEM_ID', width: 26 },
      { key: '_MONDAY_ITEM_ID', title: '_MONDAY_ITEM_ID', width: 20 },
      { key: '_NM_PARENT_ITEM_ID', title: '_NM_PARENT_ITEM_ID', width: 26 },
      { key: '_IS_SUBITEM', title: '_IS_SUBITEM', width: 12 },
      { key: '_GROUP_ID', title: '_GROUP_ID', width: 20 },
      { key: '_RAW_COLUMN_VALUES_JSON', title: '_RAW_COLUMN_VALUES_JSON', width: 20 }
    ];
    const userColumns = [
      { key: 'name', title: 'Elemento', width: 34 },
      { key: 'group', title: 'Grupo', width: 24 },
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
      const row = [];
      row.push(String(item._id));
      row.push(item.mondayId || '');
      row.push(item.parentItem ? String(item.parentItem) : '');
      row.push(Boolean(item.isSubitem));
      row.push(item.groupId || '');
      row.push(JSON.stringify(item.columnValues || {}));
      row.push(item.name || '');
      row.push(item.group || '');
      for (const column of columns) {
        const hasDynamic = item.columnValues && Object.prototype.hasOwnProperty.call(item.columnValues, column.id);
        const value = hasDynamic ? displayColumnValue(item.columnValues[column.id], column.type) : legacyValue(item, column);
        row.push(value);
      }
      sheet.addRow(row);
    }

    sheet.views = [{ state: 'frozen', xSplit: 8, ySplit: 2 }];
    sheet.autoFilter = { from: { row: 2, column: 7 }, to: { row: 2, column: allColumns.length } };
    for (let colIndex = 1; colIndex <= technical.length; colIndex += 1) sheet.getColumn(colIndex).hidden = true;

    columns.forEach((column, offset) => {
      const excelColumn = technical.length + 2 + offset + 1;
      const range = `${sheet.getColumn(excelColumn).letter}3:${sheet.getColumn(excelColumn).letter}${Math.max(3, sheet.rowCount + 500)}`;
      const labels = column.type === 'status' ? statusLabels(column) : column.type === 'dropdown' ? dropdownLabels(column) : [];
      if (labels.length && labels.join(',').length < 250) {
        sheet.dataValidations.add(range, {
          type: 'list',
          allowBlank: true,
          formulae: [`"${labels.map(label => String(label).replace(/"/g, '""')).join(',')}"`]
        });
      }
      if (column.type === 'formula' || column.type === 'mirror') {
        sheet.getColumn(excelColumn).font = { italic: true };
      }
    });
  }

  return {
    workbook,
    manifest: {
      generatedAt: new Date().toISOString(),
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
  safeSheetName,
  displayColumnValue,
  statusLabels,
  dropdownLabels,
  buildEmergencyWorkbook,
  buildEmergencyWorkbookBuffer
};
