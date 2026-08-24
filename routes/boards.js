const express = require('express');
const router = express.Router();
const Board = require('../models/Board');

router.get('/', async (req, res) => {
  try {
    const query = {};
    if (req.query.includeInternal !== 'true') query.internal = { $ne: true };
    if (req.query.includeArchived !== 'true') query.archived = { $ne: true };
    if (req.query.workspaceRef) query.workspaceRef = req.query.workspaceRef;
    if (req.query.workspace) query.workspace = req.query.workspace;

    const boards = await Board.find(query)
      .populate('workspaceRef')
      .sort({ order: 1, createdAt: 1 });
    res.json(boards);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const board = await Board.findById(req.params.id).populate('workspaceRef');
    if (!board) return res.status(404).json({ error: 'Board not found' });
    res.json(board);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const board = new Board(req.body);
    await board.save();
    res.status(201).json(board);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const board = await Board.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    ).populate('workspaceRef');
    if (!board) return res.status(404).json({ error: 'Board not found' });
    res.json(board);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const board = await Board.findByIdAndUpdate(
      req.params.id,
      { $set: { archived: true } },
      { new: true }
    );
    if (!board) return res.status(404).json({ error: 'Board not found' });
    res.json(board);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
