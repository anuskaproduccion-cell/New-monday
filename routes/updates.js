const express = require('express');
const router = express.Router();
const Item = require('../models/Item');
const ItemUpdate = require('../models/ItemUpdate');
const { logActivity } = require('../services/activityLogger');

router.get('/item/:itemId', async (req, res) => {
  try {
    const updates = await ItemUpdate.find({ item: req.params.itemId, archived: { $ne: true } })
      .sort({ createdAt: -1 });
    res.json(updates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/item/:itemId', async (req, res) => {
  try {
    const body = String(req.body.body || '').trim();
    if (!body) return res.status(400).json({ error: 'Update body is required' });
    const item = await Item.findOne({ _id: req.params.itemId, deletedAt: null });
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const update = await ItemUpdate.create({
      board: item.board,
      item: item._id,
      body,
      author: String(req.body.author || 'New Monday').trim() || 'New Monday'
    });
    await logActivity({
      board: item.board,
      item: item._id,
      type: 'update_added',
      message: `Actualización añadida a ${item.name}`,
      meta: { updateId: String(update._id) }
    });
    res.status(201).json(update);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:updateId/replies', async (req, res) => {
  try {
    const body = String(req.body.body || '').trim();
    if (!body) return res.status(400).json({ error: 'Reply body is required' });
    const update = await ItemUpdate.findOne({ _id: req.params.updateId, archived: { $ne: true } });
    if (!update) return res.status(404).json({ error: 'Update not found' });
    update.replies.push({
      body,
      author: String(req.body.author || 'New Monday').trim() || 'New Monday'
    });
    await update.save();
    await logActivity({
      board: update.board,
      item: update.item,
      type: 'update_reply_added',
      message: 'Respuesta añadida a una actualización',
      meta: { updateId: String(update._id) }
    });
    res.status(201).json(update);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:updateId', async (req, res) => {
  try {
    const update = await ItemUpdate.findByIdAndUpdate(
      req.params.updateId,
      { $set: { archived: true } },
      { new: true }
    );
    if (!update) return res.status(404).json({ error: 'Update not found' });
    await logActivity({
      board: update.board,
      item: update.item,
      type: 'update_archived',
      message: 'Actualización archivada',
      meta: { updateId: String(update._id) }
    });
    res.json(update);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
