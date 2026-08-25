const express = require('express');
const router = express.Router();
const Board = require('../models/Board');
const Item = require('../models/Item');
const { logActivity } = require('../services/activityLogger');

const MAX_BULK_ITEMS = 500;

function normalizeIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(id => String(id || '').trim()).filter(Boolean))];
}

function statusLabels(column) {
  const labels = column?.settings?.labels;
  if (Array.isArray(labels)) {
    return labels.map(entry => ({
      label: entry?.label ?? entry?.name ?? String(entry ?? ''),
      color: entry?.hex || entry?.color || '#c4c4c4'
    })).filter(entry => entry.label);
  }
  if (labels && typeof labels === 'object') {
    return Object.values(labels).map(entry => ({
      label: typeof entry === 'string' ? entry : entry?.label || entry?.name || '',
      color: typeof entry === 'object' ? (entry?.hex || entry?.color || '#c4c4c4') : '#c4c4c4'
    })).filter(entry => entry.label);
  }
  return [];
}

router.post('/bulk', async (req, res) => {
  try {
    const boardId = String(req.body.boardId || '').trim();
    const itemIds = normalizeIds(req.body.itemIds);
    const action = String(req.body.action || '').trim();

    if (!boardId) return res.status(400).json({ error: 'boardId is required' });
    if (!itemIds.length) return res.status(400).json({ error: 'itemIds is required' });
    if (itemIds.length > MAX_BULK_ITEMS) return res.status(400).json({ error: `Maximum ${MAX_BULK_ITEMS} items per bulk action` });

    const board = await Board.findById(boardId);
    if (!board) return res.status(404).json({ error: 'Board not found' });

    const items = await Item.find({
      _id: { $in: itemIds },
      board: board._id,
      deletedAt: null,
      archived: { $ne: true }
    }).sort({ order: 1, createdAt: 1 });

    if (items.length !== itemIds.length) {
      return res.status(409).json({ error: 'One or more selected items are unavailable or belong to another board' });
    }

    if (action === 'move') {
      const groupId = String(req.body.groupId || '').trim();
      const group = (board.groups || []).find(entry => String(entry.id) === groupId && !entry.archived);
      if (!group) return res.status(400).json({ error: 'Target group not found' });

      const selectedSet = new Set(itemIds);
      const baseOrder = await Item.countDocuments({
        board: board._id,
        groupId: group.id,
        isSubitem: { $ne: true },
        archived: { $ne: true },
        deletedAt: null,
        _id: { $nin: [...selectedSet] }
      });

      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        const previous = { groupId: item.groupId, group: item.group, order: item.order };
        item.groupId = group.id;
        item.group = group.title;
        item.groupColor = group.color;
        item.order = baseOrder + index;
        await item.save();
        await logActivity({
          board: board._id,
          item: item._id,
          type: 'item_bulk_moved',
          message: `${item.name} movido a ${group.title} mediante acción masiva`,
          meta: { from: previous, to: { groupId: group.id, group: group.title, order: item.order } }
        });
      }
    } else if (action === 'status') {
      const columnId = String(req.body.columnId || '').trim();
      const label = String(req.body.label ?? '').trim();
      const column = (board.columns || []).find(entry => String(entry.id) === columnId);
      if (!column || column.type !== 'status') return res.status(400).json({ error: 'A Status column is required' });

      const labels = statusLabels(column);
      const matched = labels.find(entry => entry.label === label);
      if (label && labels.length && !matched) return res.status(400).json({ error: `Status label is not allowed: ${label}` });
      const color = matched?.color || '#c4c4c4';

      for (const item of items) {
        const previousValue = item.columnValues?.[columnId] || null;
        item.columnValues = {
          ...(item.columnValues || {}),
          [columnId]: { type: 'status', label, text: label, color }
        };
        item.markModified('columnValues');
        await item.save();
        await logActivity({
          board: board._id,
          item: item._id,
          type: 'item_bulk_status_changed',
          field: columnId,
          message: `${column.title} actualizado en ${item.name} mediante acción masiva`,
          meta: { columnId, previousValue, nextValue: item.columnValues[columnId] }
        });
      }
    } else if (action === 'archive') {
      for (const item of items) {
        item.archived = true;
        await item.save();
        await logActivity({
          board: board._id,
          item: item._id,
          type: 'item_bulk_archived',
          message: `${item.name} archivado mediante acción masiva`
        });
      }
    } else if (action === 'trash') {
      const deletedAt = new Date();
      for (const item of items) {
        item.deletedAt = deletedAt;
        await item.save();
        await logActivity({
          board: board._id,
          item: item._id,
          type: 'item_bulk_trashed',
          message: `${item.name} movido a papelera mediante acción masiva`
        });
      }
    } else {
      return res.status(400).json({ error: 'Unsupported bulk action' });
    }

    res.json({
      action,
      count: items.length,
      items
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
module.exports.MAX_BULK_ITEMS = MAX_BULK_ITEMS;
module.exports.normalizeIds = normalizeIds;
module.exports.statusLabels = statusLabels;
