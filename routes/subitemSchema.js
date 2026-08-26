const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const Board = require('../models/Board');
const { logActivity } = require('../services/activityLogger');

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function collectBoardIdCandidates(value, key = '', out = new Set()) {
  if (Array.isArray(value)) {
    value.forEach(entry => collectBoardIdCandidates(entry, key, out));
    return out;
  }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([childKey, child]) => collectBoardIdCandidates(child, childKey, out));
    return out;
  }
  if (!/board/i.test(String(key || ''))) return out;
  const candidate = String(value ?? '').trim();
  if (/^\d+$/.test(candidate)) out.add(candidate);
  return out;
}

function resolveInternalSubitemBoard(parentBoard, internalBoards = []) {
  if (!parentBoard) return null;
  const subtasksColumns = (parentBoard.columns || []).filter(column => column.type === 'subtasks');
  const linkedBoardIds = new Set();
  subtasksColumns.forEach(column => collectBoardIdCandidates(column.settings || {}, '', linkedBoardIds));

  let match = internalBoards.find(board => board.mondayId && linkedBoardIds.has(String(board.mondayId)));
  if (match) return match;

  if (parentBoard.mondayId) {
    match = internalBoards.find(board => String(board.parentBoardMondayId || board.originMeta?.parentBoardMondayId || '') === String(parentBoard.mondayId));
    if (match) return match;
  }

  const parentName = normalizeName(parentBoard.name);
  const parentMondayId = String(parentBoard.mondayId || '');
  const nameMatches = internalBoards.filter(board => {
    const stripped = String(board.name || '').replace(/^Subelementos de\s+/i, '');
    const normalized = normalizeName(stripped);
    return normalized === parentName || (parentMondayId && normalized === normalizeName(parentMondayId));
  });
  return nameMatches.length === 1 ? nameMatches[0] : null;
}

function plainColumn(column) {
  const source = column?.toObject ? column.toObject() : column || {};
  return {
    id: String(source.id || ''),
    title: String(source.title || ''),
    type: String(source.type || 'text'),
    description: String(source.description || ''),
    settings: JSON.parse(JSON.stringify(source.settings || {})),
    order: Number.isFinite(Number(source.order)) ? Number(source.order) : 0,
    hidden: Boolean(source.hidden),
    pinned: Boolean(source.pinned)
  };
}

function operationalColumns(columns = []) {
  return columns
    .map(plainColumn)
    .filter(column => column.id && !['name', 'subtasks'].includes(String(column.type || '').toLowerCase()))
    .sort((a, b) => a.order - b.order)
    .map((column, index) => ({ ...column, order: index }));
}

function schemaPayload(parentBoard, internal = null) {
  const customized = Boolean(parentBoard?.subitemSchemaCustomized);
  const columns = customized
    ? operationalColumns(parentBoard.subitemColumns || [])
    : operationalColumns(internal?.columns || []);
  const found = customized || Boolean(internal);

  return {
    found,
    mode: customized ? 'local' : internal ? 'imported' : 'none',
    customized,
    editable: true,
    parentBoardId: String(parentBoard?._id || ''),
    parentMondayId: parentBoard?.mondayId || null,
    internalBoardId: internal?._id ? String(internal._id) : null,
    internalMondayId: internal?.mondayId || null,
    internalBoardName: internal?.name || null,
    columns
  };
}

async function resolveForParent(parentBoard) {
  const internalBoards = await Board.find({ internal: true, archived: { $ne: true } }).lean();
  return resolveInternalSubitemBoard(parentBoard, internalBoards);
}

async function ensureLocalSubitemSchema(parentBoard, internal = null) {
  if (parentBoard.subitemSchemaCustomized) return parentBoard;
  parentBoard.subitemColumns = operationalColumns(internal?.columns || []);
  parentBoard.subitemSchemaCustomized = true;
  await parentBoard.save();
  return parentBoard;
}

function generatedColumnId(type = 'text') {
  return `sub_${String(type || 'text').replace(/[^a-z0-9_]+/gi, '_')}_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
}

router.get('/:id/subitem-schema', async (req, res) => {
  try {
    const parentBoard = await Board.findById(req.params.id);
    if (!parentBoard) return res.status(404).json({ error: 'Board not found' });
    const internal = await resolveForParent(parentBoard.toObject());
    return res.json(schemaPayload(parentBoard, internal));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/:id/subitem-schema/initialize', async (req, res) => {
  try {
    const parentBoard = await Board.findById(req.params.id);
    if (!parentBoard) return res.status(404).json({ error: 'Board not found' });
    const internal = await resolveForParent(parentBoard.toObject());
    await ensureLocalSubitemSchema(parentBoard, internal);
    await logActivity({
      board: parentBoard._id,
      type: 'subitem_schema_customized',
      field: 'subitem_schema',
      message: 'Esquema local de subitems activado',
      meta: { inheritedColumns: parentBoard.subitemColumns.length, internalMondayId: internal?.mondayId || null }
    });
    return res.json(schemaPayload(parentBoard, internal));
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.post('/:id/subitem-columns', async (req, res) => {
  try {
    const parentBoard = await Board.findById(req.params.id);
    if (!parentBoard) return res.status(404).json({ error: 'Board not found' });
    const internal = await resolveForParent(parentBoard.toObject());
    await ensureLocalSubitemSchema(parentBoard, internal);

    const title = String(req.body.title || '').trim();
    const type = String(req.body.type || '').trim().toLowerCase();
    if (!title || !type) return res.status(400).json({ error: 'Column title and type are required' });

    const column = {
      id: String(req.body.id || generatedColumnId(type)),
      title,
      type,
      description: String(req.body.description || ''),
      settings: req.body.settings || {},
      order: parentBoard.subitemColumns.length,
      hidden: Boolean(req.body.hidden),
      pinned: Boolean(req.body.pinned)
    };
    if (parentBoard.subitemColumns.some(entry => String(entry.id) === column.id)) {
      return res.status(409).json({ error: 'A subitem column with that id already exists' });
    }

    parentBoard.subitemColumns.push(column);
    await parentBoard.save();
    await logActivity({
      board: parentBoard._id,
      type: 'subitem_column_created',
      field: column.id,
      message: `Columna de subitems “${column.title}” creada`,
      meta: { columnId: column.id, columnType: column.type }
    });
    return res.status(201).json(plainColumn(column));
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.patch('/:id/subitem-columns/:columnId', async (req, res) => {
  try {
    const parentBoard = await Board.findById(req.params.id);
    if (!parentBoard) return res.status(404).json({ error: 'Board not found' });
    const internal = await resolveForParent(parentBoard.toObject());
    await ensureLocalSubitemSchema(parentBoard, internal);

    const column = parentBoard.subitemColumns.find(entry => String(entry.id) === String(req.params.columnId));
    if (!column) return res.status(404).json({ error: 'Subitem column not found' });
    const previousTitle = column.title;
    for (const field of ['title', 'description', 'settings', 'order', 'hidden', 'pinned']) {
      if (req.body[field] !== undefined) column[field] = req.body[field];
    }
    if (!String(column.title || '').trim()) column.title = previousTitle;
    await parentBoard.save();
    await logActivity({
      board: parentBoard._id,
      type: 'subitem_column_updated',
      field: column.id,
      message: `Columna de subitems “${column.title}” actualizada`,
      meta: { columnId: column.id, previousTitle, title: column.title }
    });
    return res.json(plainColumn(column));
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.post('/:id/subitem-columns/reorder', async (req, res) => {
  try {
    const parentBoard = await Board.findById(req.params.id);
    if (!parentBoard) return res.status(404).json({ error: 'Board not found' });
    if (!Array.isArray(req.body.columnIds)) return res.status(400).json({ error: 'columnIds must be an array' });
    const internal = await resolveForParent(parentBoard.toObject());
    await ensureLocalSubitemSchema(parentBoard, internal);

    const currentIds = parentBoard.subitemColumns.map(column => String(column.id));
    const requested = req.body.columnIds.map(String);
    if (requested.length !== currentIds.length || requested.some(id => !currentIds.includes(id))) {
      return res.status(400).json({ error: 'columnIds must contain every local subitem column exactly once' });
    }
    const orderMap = new Map(requested.map((id, index) => [id, index]));
    parentBoard.subitemColumns.forEach(column => { column.order = orderMap.get(String(column.id)); });
    await parentBoard.save();
    await logActivity({
      board: parentBoard._id,
      type: 'subitem_columns_reordered',
      field: 'subitem_schema',
      message: 'Columnas de subitems reordenadas',
      meta: { columnIds: requested }
    });
    return res.json(operationalColumns(parentBoard.subitemColumns));
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.delete('/:id/subitem-columns/:columnId', async (req, res) => {
  try {
    const parentBoard = await Board.findById(req.params.id);
    if (!parentBoard) return res.status(404).json({ error: 'Board not found' });
    const internal = await resolveForParent(parentBoard.toObject());
    await ensureLocalSubitemSchema(parentBoard, internal);

    const index = parentBoard.subitemColumns.findIndex(entry => String(entry.id) === String(req.params.columnId));
    if (index < 0) return res.status(404).json({ error: 'Subitem column not found' });
    const [removed] = parentBoard.subitemColumns.splice(index, 1);
    parentBoard.subitemColumns.forEach((column, order) => { column.order = order; });
    await parentBoard.save();
    await logActivity({
      board: parentBoard._id,
      type: 'subitem_column_removed',
      field: removed.id,
      message: `Columna de subitems “${removed.title}” retirada del esquema local`,
      meta: { columnId: removed.id, valuesPreserved: true }
    });
    return res.json({ removed: plainColumn(removed), valuesPreserved: true });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
module.exports.normalizeName = normalizeName;
module.exports.collectBoardIdCandidates = collectBoardIdCandidates;
module.exports.resolveInternalSubitemBoard = resolveInternalSubitemBoard;
module.exports.operationalColumns = operationalColumns;
module.exports.schemaPayload = schemaPayload;
