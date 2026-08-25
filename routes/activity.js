const express = require('express');
const router = express.Router();
const ActivityEvent = require('../models/ActivityEvent');

function boundedLimit(value, fallback = 100) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(500, Math.max(1, Math.floor(parsed)));
}

router.get('/board/:boardId', async (req, res) => {
  try {
    const query = { board: req.params.boardId };
    if (req.query.itemId) query.item = req.query.itemId;
    const events = await ActivityEvent.find(query)
      .sort({ createdAt: -1 })
      .limit(boundedLimit(req.query.limit));
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/item/:itemId', async (req, res) => {
  try {
    const events = await ActivityEvent.find({ item: req.params.itemId })
      .sort({ createdAt: -1 })
      .limit(boundedLimit(req.query.limit));
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
