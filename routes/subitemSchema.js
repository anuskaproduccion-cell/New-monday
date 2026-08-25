const express = require('express');
const router = express.Router();
const Board = require('../models/Board');

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

router.get('/:id/subitem-schema', async (req, res) => {
  try {
    const parentBoard = await Board.findById(req.params.id).lean();
    if (!parentBoard) return res.status(404).json({ error: 'Board not found' });

    const internalBoards = await Board.find({ internal: true, archived: { $ne: true } }).lean();
    const internal = resolveInternalSubitemBoard(parentBoard, internalBoards);
    if (!internal) {
      return res.json({
        found: false,
        parentBoardId: String(parentBoard._id),
        parentMondayId: parentBoard.mondayId || null,
        columns: []
      });
    }

    return res.json({
      found: true,
      parentBoardId: String(parentBoard._id),
      parentMondayId: parentBoard.mondayId || null,
      internalBoardId: String(internal._id),
      internalMondayId: internal.mondayId || null,
      internalBoardName: internal.name,
      columns: (internal.columns || []).map(column => ({
        id: column.id,
        title: column.title,
        type: column.type,
        description: column.description || '',
        settings: column.settings || {},
        order: column.order ?? 0,
        hidden: Boolean(column.hidden),
        pinned: Boolean(column.pinned)
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.normalizeName = normalizeName;
module.exports.collectBoardIdCandidates = collectBoardIdCandidates;
module.exports.resolveInternalSubitemBoard = resolveInternalSubitemBoard;
