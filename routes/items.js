const express = require('express');
const router = express.Router();
const Board = require('../models/Board');
const Item = require('../models/Item');
const { cascadeStrictDependencies, timelineDeltaDays } = require('../services/dependencyEngine');
const { recalculateAndSaveItem } = require('../services/formulaEngine');
const { logActivity } = require('../services/activityLogger');

function activeItemQuery(extra = {}) {
  return {
    deletedAt: null,
    archived: { $ne: true },
    ...extra
  };
}

router.get('/board/:boardId', async (req, res) => {
  try {
    const query = { board: req.params.boardId };
    if (req.query.includeDeleted !== 'true') query.deletedAt = null;
    if (req.query.includeArchived !== 'true') query.archived = { $ne: true };
    if (req.query.includeSubitems !== 'true') query.isSubitem = { $ne: true };

    const items = await Item.find(query).sort({ order: 1, createdAt: 1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const query = {};
    if (req.query.includeDeleted !== 'true') query.deletedAt = null;
    if (req.query.includeArchived !== 'true') query.archived = { $ne: true };
    if (req.query.includeSubitems !== 'true') query.isSubitem = { $ne: true };

    const items = await Item.find(query).populate('board').sort({ order: 1, createdAt: 1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/group', async (req, res) => {
  try {
    const { boardId, groupName, groupId, groupColor } = req.body;
    const query = { deletedAt: null };
    if (boardId) query.board = boardId;
    if (groupId) query.groupId = groupId;
    else if (groupName) query.group = groupName;
    else return res.status(400).json({ error: 'groupId or groupName is required' });

    const patch = {};
    if (groupName) patch.group = groupName;
    if (groupId) patch.groupId = groupId;
    if (groupColor) patch.groupColor = groupColor;

    const result = await Item.updateMany(query, { $set: patch });
    if (boardId) await logActivity({
      board: boardId,
      type: 'group_items_updated',
      message: 'Elementos de grupo actualizados',
      meta: { groupId: groupId || '', groupName: groupName || '', modifiedCount: result.modifiedCount || 0 }
    });
    res.json({ message: 'Group updated' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/:id/columns/:columnId', async (req, res) => {
  try {
    const item = await Item.findOne({ _id: req.params.id, deletedAt: null });
    if (!item) return res.status(404).json({ error: 'Item not found' });
    if (!Object.prototype.hasOwnProperty.call(req.body, 'value')) {
      return res.status(400).json({ error: 'value is required' });
    }

    const board = await Board.findById(item.board);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    const column = board.columns.find(entry => entry.id === req.params.columnId);
    if (column?.type === 'formula') {
      return res.status(400).json({ error: 'Formula columns are calculated and cannot be edited directly' });
    }

    const values = { ...(item.columnValues || {}) };
    const previousValue = values[req.params.columnId] || null;
    const nextValue = req.body.value;
    values[req.params.columnId] = nextValue;
    item.columnValues = values;
    item.markModified('columnValues');
    await item.save();
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
      meta: { columnId: req.params.columnId, columnTitle: column?.title || '', previousValue, nextValue, cascadedCount: cascaded.length }
    });

    res.json({ item, cascaded });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const before = await Item.findOne({ _id: req.params.id, deletedAt: null });
    if (!before) return res.status(404).json({ error: 'Item not found' });
    const item = await Item.findOneAndUpdate(
      { _id: req.params.id, deletedAt: null },
      { $set: req.body },
      { new: true, runValidators: true }
    );
    const changedFields = Object.keys(req.body || {});
    await logActivity({
      board: item.board,
      item: item._id,
      type: 'item_updated',
      field: changedFields.length === 1 ? changedFields[0] : '',
      message: changedFields.includes('name') ? `Elemento renombrado a ${item.name}` : `${item.name} actualizado`,
      meta: { changedFields, previousName: before.name, nextName: item.name }
    });
    res.json(item);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const item = new Item(req.body);
    await item.save();
    await recalculateAndSaveItem(item);
    await logActivity({
      board: item.board,
      item: item._id,
      type: item.isSubitem ? 'subitem_created' : 'item_created',
      message: `${item.isSubitem ? 'Subelemento' : 'Elemento'} creado: ${item.name}`,
      meta: { groupId: item.groupId, group: item.group, parentItem: item.parentItem ? String(item.parentItem) : null }
    });
    res.status(201).json(item);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/duplicate', async (req, res) => {
  try {
    const source = await Item.findOne({ _id: req.params.id, deletedAt: null });
    if (!source) return res.status(404).json({ error: 'Item not found' });

    const sourceObject = source.toObject();
    delete sourceObject._id;
    delete sourceObject.__v;
    delete sourceObject.createdAt;
    delete sourceObject.updatedAt;
    delete sourceObject.mondayId;

    const nextOrder = Number.isFinite(source.order) ? source.order + 1 : 0;
    const sourceGroupFilter = source.groupId
      ? { groupId: source.groupId }
      : { group: source.group };

    await Item.updateMany(
      activeItemQuery({
        board: source.board,
        ...sourceGroupFilter,
        order: { $gte: nextOrder }
      }),
      { $inc: { order: 1 } }
    );

    const duplicate = new Item({
      ...sourceObject,
      name: req.body.name || `${source.name} (copy)`,
      order: nextOrder,
      source: 'local',
      sourceReadOnly: false,
      originMeta: {
        ...(source.originMeta || {}),
        duplicatedFrom: String(source._id),
        duplicatedFromMondayId: source.mondayId || null
      }
    });

    await duplicate.save();
    await recalculateAndSaveItem(duplicate);
    await logActivity({
      board: duplicate.board,
      item: duplicate._id,
      type: 'item_duplicated',
      message: `Elemento duplicado: ${duplicate.name}`,
      meta: { duplicatedFrom: String(source._id), sourceName: source.name }
    });
    res.status(201).json(duplicate);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/move', async (req, res) => {
  try {
    const item = await Item.findOne({ _id: req.params.id, deletedAt: null });
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const previous = { groupId: item.groupId, group: item.group, order: item.order };
    const patch = {};
    for (const field of ['groupId', 'group', 'groupColor', 'order']) {
      if (req.body[field] !== undefined) patch[field] = req.body[field];
    }

    Object.assign(item, patch);
    await item.save();
    await logActivity({
      board: item.board,
      item: item._id,
      type: 'item_moved',
      message: `${item.name} movido a ${item.group}`,
      meta: { from: previous, to: { groupId: item.groupId, group: item.group, order: item.order } }
    });
    res.json(item);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/archive', async (req, res) => {
  try {
    const item = await Item.findOneAndUpdate(
      { _id: req.params.id, deletedAt: null },
      { $set: { archived: true } },
      { new: true }
    );
    if (!item) return res.status(404).json({ error: 'Item not found' });
    await logActivity({ board: item.board, item: item._id, type: 'item_archived', message: `${item.name} archivado` });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/unarchive', async (req, res) => {
  try {
    const item = await Item.findOneAndUpdate(
      { _id: req.params.id, deletedAt: null },
      { $set: { archived: false } },
      { new: true }
    );
    if (!item) return res.status(404).json({ error: 'Item not found' });
    await logActivity({ board: item.board, item: item._id, type: 'item_unarchived', message: `${item.name} restaurado del archivo` });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/restore', async (req, res) => {
  try {
    const item = await Item.findByIdAndUpdate(
      req.params.id,
      { $set: { deletedAt: null, archived: false } },
      { new: true }
    );
    if (!item) return res.status(404).json({ error: 'Item not found' });
    await logActivity({ board: item.board, item: item._id, type: 'item_restored', message: `${item.name} restaurado de la papelera` });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Monday-like trash behavior: DELETE moves the item to trash instead of destroying it.
router.delete('/:id', async (req, res) => {
  try {
    const item = await Item.findOneAndUpdate(
      { _id: req.params.id, deletedAt: null },
      { $set: { deletedAt: new Date() } },
      { new: true }
    );
    if (!item) return res.status(404).json({ error: 'Item not found' });
    await logActivity({ board: item.board, item: item._id, type: 'item_trashed', message: `${item.name} movido a papelera` });
    res.json({ message: 'Item moved to trash', item });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
