const express = require('express');
const router = express.Router();
const Board = require('../models/Board');

router.get('/', async (req, res) => {
  try {
    const boards = await Board.find().sort({ order: 1, createdAt: 1 });
    res.json(boards);
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

module.exports = router;
