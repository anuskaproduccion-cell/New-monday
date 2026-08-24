const express = require('express');
const router = express.Router();
const Item = require('../models/Item');

router.post('/reorder', async (req, res) => {
  try {
    const { boardId, itemIds, groupId, group, groupColor } = req.body;
    if (!boardId) return res.status(400).json({ error: 'boardId is required' });
    if (!Array.isArray(itemIds)) return res.status(400).json({ error: 'itemIds must be an array' });

    const updates = itemIds.map((itemId, order) => {
      const patch = { order };
      if (groupId !== undefined) patch.groupId = groupId;
      if (group !== undefined) patch.group = group;
      if (groupColor !== undefined) patch.groupColor = groupColor;
      return Item.updateOne(
        { _id: itemId, board: boardId, deletedAt: null, isSubitem: { $ne: true } },
        { $set: patch }
      );
    });

    await Promise.all(updates);
    const items = await Item.find({
      board: boardId,
      deletedAt: null,
      archived: { $ne: true },
      isSubitem: { $ne: true }
    }).sort({ order: 1, createdAt: 1 });
    res.json(items);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/subitems', async (req, res) => {
  try {
    const parent = await Item.findOne({ _id: req.params.id, deletedAt: null, isSubitem: { $ne: true } });
    if (!parent) return res.status(404).json({ error: 'Parent item not found' });

    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Subitem name is required' });

    const existingCount = await Item.countDocuments({ parentItem: parent._id, deletedAt: null });
    const subitem = await new Item({
      board: parent.board,
      groupId: parent.groupId,
      group: parent.group,
      groupColor: parent.groupColor,
      name,
      order: existingCount,
      columnValues: req.body.columnValues || {},
      parentItem: parent._id,
      parentMondayId: parent.mondayId || null,
      isSubitem: true,
      source: 'local',
      sourceReadOnly: false,
      originMeta: { createdInNewMonday: true }
    }).save();

    res.status(201).json(subitem);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/subitems/reorder', async (req, res) => {
  try {
    const parent = await Item.findOne({ _id: req.params.id, deletedAt: null, isSubitem: { $ne: true } });
    if (!parent) return res.status(404).json({ error: 'Parent item not found' });
    if (!Array.isArray(req.body.itemIds)) return res.status(400).json({ error: 'itemIds must be an array' });

    await Promise.all(req.body.itemIds.map((itemId, order) => Item.updateOne(
      { _id: itemId, parentItem: parent._id, deletedAt: null },
      { $set: { order } }
    )));

    const subitems = await Item.find({ parentItem: parent._id, deletedAt: null }).sort({ order: 1, createdAt: 1 });
    res.json(subitems);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
