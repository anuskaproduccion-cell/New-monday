const express = require('express');
const router = express.Router();
const Item = require('../models/Item');

router.get('/board/:boardId', async (req, res) => {
  try {
    const items = await Item.find({ board: req.params.boardId }).sort({ order: 1, createdAt: 1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const items = await Item.find().populate('board').sort({ order: 1, createdAt: 1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/group', async (req, res) => {
  try {
    const { boardId, groupName, groupColor } = req.body;
    const query = { group: groupName };
    if (boardId) query.board = boardId;
    await Item.updateMany(query, { $set: { groupColor } });
    res.json({ message: 'Group updated' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const item = await Item.findByIdAndUpdate(req.params.id, { $set: req.body }, {
      new: true,
      runValidators: true
    });
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

router.delete('/:id', async (req, res) => {
  try {
    const item = await Item.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json({ message: 'Item deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
