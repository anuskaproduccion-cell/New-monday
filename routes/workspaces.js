const express = require('express');
const router = express.Router();
const Workspace = require('../models/Workspace');
const Board = require('../models/Board');

router.get('/', async (req, res) => {
  try {
    const includeArchived = req.query.includeArchived === 'true';
    const query = includeArchived ? {} : { archived: { $ne: true } };
    const workspaces = await Workspace.find(query).sort({ order: 1, name: 1 });

    if (workspaces.length) return res.json(workspaces);

    // Backward-compatible fallback for v1 data, where workspace is a string on Board.
    const boardQuery = includeArchived ? {} : { archived: { $ne: true } };
    const names = (await Board.distinct('workspace', boardQuery)).filter(Boolean).sort();
    res.json(names.map((name, order) => ({
      _id: null,
      name,
      order,
      classification: 'unknown',
      legacy: true
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const workspace = new Workspace(req.body);
    await workspace.save();
    res.status(201).json(workspace);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const workspace = await Workspace.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
    res.json(workspace);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const workspace = await Workspace.findByIdAndUpdate(
      req.params.id,
      { $set: { archived: true } },
      { new: true }
    );
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
    res.json(workspace);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
