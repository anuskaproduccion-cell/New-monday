const express = require('express');
const router = express.Router();
const Board = require('../models/Board');
const Item = require('../models/Item');
const { cascadeStrictDependencies, timelineDeltaDays } = require('../services/dependencyEngine');
const { recalculateAndSaveItem } = require('../services/formulaEngine');
const { logActivity } = require('../services/activityLogger');
const { buildVersionedItemQuery, parseExpectedUpdatedAt } = require('../services/concurrencyGuard');

router.patch('/:id/columns/:columnId/conditional', async (req, res) => {
  try {
    if (!Object.prototype.hasOwnProperty.call(req.body || {}, 'value')) {
      return res.status(400).json({ error: 'value is required' });
    }

    const expectedUpdatedAt = parseExpectedUpdatedAt(req.body?.expectedUpdatedAt);
    if (!expectedUpdatedAt) {
      return res.status(400).json({ error: 'expectedUpdatedAt is required for a concurrent-safe edit' });
    }

    const before = await Item.findOne({ _id: req.params.id, deletedAt: null });
    if (!before) return res.status(404).json({ error: 'Item not found' });

    const board = await Board.findById(before.board);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    const column = board.columns.find(entry => entry.id === req.params.columnId);
    if (column?.type === 'formula') {
      return res.status(400).json({ error: 'Formula columns are calculated and cannot be edited directly' });
    }

    const values = { ...(before.columnValues || {}) };
    const previousValue = Object.prototype.hasOwnProperty.call(values, req.params.columnId)
      ? values[req.params.columnId]
      : null;
    const nextValue = req.body.value;
    values[req.params.columnId] = nextValue;

    const versionedQuery = buildVersionedItemQuery(req.params.id, expectedUpdatedAt, { deletedAt: null });
    const item = await Item.findOneAndUpdate(
      versionedQuery,
      { $set: { columnValues: values } },
      { new: true, runValidators: true }
    );

    if (!item) {
      return res.status(409).json({
        error: 'La celda cambió en otra sesión. Se ha bloqueado esta edición para no sobrescribir cambios.',
        code: 'EDIT_CONFLICT'
      });
    }

    await recalculateAndSaveItem(item);

    const valueType = column?.type || nextValue?.type || previousValue?.type;
    let cascaded = [];
    if (valueType === 'timeline' || valueType === 'date') {
      const deltaDays = timelineDeltaDays(previousValue, nextValue);
      cascaded = await cascadeStrictDependencies({
        boardId: item.board,
        changedItemId: item._id,
        deltaDays
      });
    }

    await logActivity({
      board: item.board,
      item: item._id,
      type: 'column_value_changed',
      field: req.params.columnId,
      message: `${column?.title || req.params.columnId} actualizado en ${item.name}`,
      meta: {
        columnId: req.params.columnId,
        columnTitle: column?.title || '',
        previousValue,
        nextValue,
        cascadedCount: cascaded.length,
        concurrentSafe: true
      }
    });

    return res.json({ item, cascaded, concurrentSafe: true });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
