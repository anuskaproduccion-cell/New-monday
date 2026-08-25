const express = require('express');
const router = express.Router();
const Item = require('../models/Item');
const ItemUpdate = require('../models/ItemUpdate');
const { logActivity } = require('../services/activityLogger');

function normalizeAttachments(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).map(entry => {
    const name = String(entry?.name || entry?.filename || 'Archivo').trim().slice(0, 240) || 'Archivo';
    const id = String(entry?.id || '').trim().slice(0, 80);
    const url = String(entry?.url || '').trim().slice(0, 2000);
    const source = String(entry?.source || 'new-monday').trim().slice(0, 40) || 'new-monday';
    const mimetype = String(entry?.mimetype || '').trim().slice(0, 160);
    const size = Number.isFinite(Number(entry?.size)) && Number(entry.size) >= 0 ? Number(entry.size) : null;
    return { id, name, url, source, mimetype, size };
  });
}

router.get('/item/:itemId', async (req, res) => {
  try {
    const updates = await ItemUpdate.find({ item: req.params.itemId, archived: { $ne: true } })
      .sort({ createdAt: -1 });
    res.json(updates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/board/:boardId', async (req, res) => {
  try {
    const updates = await ItemUpdate.find({ board: req.params.boardId, archived: { $ne: true } })
      .sort({ createdAt: -1 });
    res.json(updates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/item/:itemId', async (req, res) => {
  try {
    const body = String(req.body.body || '').trim();
    const attachments = normalizeAttachments(req.body.attachments);
    if (!body && !attachments.length) return res.status(400).json({ error: 'Update body or attachment is required' });
    const item = await Item.findOne({ _id: req.params.itemId, deletedAt: null });
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const update = await ItemUpdate.create({
      board: item.board,
      item: item._id,
      body,
      attachments,
      author: String(req.body.author || 'New Monday').trim() || 'New Monday'
    });
    await logActivity({
      board: item.board,
      item: item._id,
      type: 'update_added',
      message: attachments.length
        ? `Actualización con ${attachments.length} archivo${attachments.length === 1 ? '' : 's'} añadida a ${item.name}`
        : `Actualización añadida a ${item.name}`,
      meta: { updateId: String(update._id), attachmentCount: attachments.length }
    });
    res.status(201).json(update);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:updateId/replies', async (req, res) => {
  try {
    const body = String(req.body.body || '').trim();
    const attachments = normalizeAttachments(req.body.attachments);
    if (!body && !attachments.length) return res.status(400).json({ error: 'Reply body or attachment is required' });
    const update = await ItemUpdate.findOne({ _id: req.params.updateId, archived: { $ne: true } });
    if (!update) return res.status(404).json({ error: 'Update not found' });
    update.replies.push({
      body,
      attachments,
      author: String(req.body.author || 'New Monday').trim() || 'New Monday'
    });
    await update.save();
    await logActivity({
      board: update.board,
      item: update.item,
      type: 'update_reply_added',
      message: attachments.length ? 'Respuesta con archivo añadida a una actualización' : 'Respuesta añadida a una actualización',
      meta: { updateId: String(update._id), attachmentCount: attachments.length }
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
module.exports.normalizeAttachments = normalizeAttachments;
