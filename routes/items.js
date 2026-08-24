const express = require('express');
const router = express.Router();
const Item = require('../models/Item');

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

    await Item.updateMany(query, { $set: patch });
    res.json({ message: 'Group updated' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const item = await Item.findOneAndUpdate(
      { _id: req.params.id, deletedAt: null },
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json(item);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const item = new Item(req.body);
    await item.save();
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
    res.status(201).json(duplicate);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/move', async (req, res) => {
  try {
    const item = await Item.findOne({ _id: req.params.id, deletedAt: null });
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const patch = {};
    for (const field of ['groupId', 'group', 'groupColor', 'order']) {
      if (req.body[field] !== undefined) patch[field] = req.body[field];
    }

    Object.assign(item, patch);
    await item.save();
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
    res.json({ message: 'Item moved to trash', item });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
