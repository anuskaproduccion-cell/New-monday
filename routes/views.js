const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const Board = require('../models/Board');

function generatedViewId() {
  return `view_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

router.post('/:id/views', async (req, res) => {
  try {
    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ error: 'Board not found' });

    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'View name is required' });

    const view = {
      id: req.body.id || generatedViewId(),
      name,
      type: String(req.body.type || 'table'),
      filter: req.body.filter || { logic: 'and', rules: [] },
      sort: Array.isArray(req.body.sort) ? req.body.sort : [],
      settings: req.body.settings || {},
      order: Number.isFinite(req.body.order) ? Number(req.body.order) : board.views.length
    };

    board.views.push(view);
    await board.save();
    res.status(201).json(view);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/:id/views/:viewId', async (req, res) => {
  try {
    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    const view = board.views.find(entry => String(entry.id) === String(req.params.viewId));
    if (!view) return res.status(404).json({ error: 'View not found' });

    for (const field of ['name', 'type', 'filter', 'sort', 'settings', 'order']) {
      if (req.body[field] !== undefined) view[field] = req.body[field];
    }
    if (!String(view.name || '').trim()) return res.status(400).json({ error: 'View name is required' });

    await board.save();
    res.json(view);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/views/:viewId/duplicate', async (req, res) => {
  try {
    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    const source = board.views.find(entry => String(entry.id) === String(req.params.viewId));
    if (!source) return res.status(404).json({ error: 'View not found' });

    const duplicate = plain(source.toObject ? source.toObject() : source);
    duplicate.id = generatedViewId();
    duplicate.name = String(req.body.name || `${source.name} (copy)`).trim();
    duplicate.order = Number.isFinite(source.order) ? Number(source.order) + 1 : board.views.length;
    board.views.forEach(view => {
      if (view !== source && Number(view.order) >= duplicate.order) view.order = Number(view.order) + 1;
    });
    board.views.push(duplicate);
    await board.save();
    res.status(201).json(duplicate);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/views/reorder', async (req, res) => {
  try {
    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    if (!Array.isArray(req.body.viewIds)) return res.status(400).json({ error: 'viewIds must be an array' });

    const positions = new Map(req.body.viewIds.map((id, index) => [String(id), index]));
    board.views.forEach(view => {
      if (positions.has(String(view.id))) view.order = positions.get(String(view.id));
    });
    await board.save();
    res.json(board.views.sort((a, b) => Number(a.order || 0) - Number(b.order || 0)));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id/views/:viewId', async (req, res) => {
  try {
    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    const index = board.views.findIndex(entry => String(entry.id) === String(req.params.viewId));
    if (index < 0) return res.status(404).json({ error: 'View not found' });

    const [removed] = board.views.splice(index, 1);
    board.views.forEach((view, order) => { view.order = order; });
    await board.save();
    res.json({ removed: removed.id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
