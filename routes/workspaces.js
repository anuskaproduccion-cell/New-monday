const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const Workspace = require('../models/Workspace');
const Board = require('../models/Board');

function generatedFolderId() {
  return `folder_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
}

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
      folders: [],
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

router.post('/:id/folders', async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
    const title = String(req.body.title || '').trim();
    if (!title) return res.status(400).json({ error: 'Folder title is required' });

    const folder = {
      id: String(req.body.id || generatedFolderId()),
      title,
      order: Number.isFinite(Number(req.body.order)) ? Number(req.body.order) : workspace.folders.length,
      archived: false
    };
    if (workspace.folders.some(entry => String(entry.id) === folder.id)) {
      return res.status(409).json({ error: 'Folder id already exists' });
    }
    workspace.folders.push(folder);
    await workspace.save();
    return res.status(201).json(folder);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.patch('/:id/folders/:folderId', async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
    const folder = workspace.folders.find(entry => String(entry.id) === String(req.params.folderId));
    if (!folder) return res.status(404).json({ error: 'Folder not found' });

    if (req.body.title !== undefined) {
      const title = String(req.body.title || '').trim();
      if (title) folder.title = title;
    }
    if (req.body.order !== undefined) folder.order = Number(req.body.order);
    if (req.body.archived !== undefined) folder.archived = Boolean(req.body.archived);
    await workspace.save();
    return res.json(folder);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.post('/:id/folders/reorder', async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
    if (!Array.isArray(req.body.folderIds)) return res.status(400).json({ error: 'folderIds must be an array' });
    const active = workspace.folders.filter(folder => !folder.archived);
    const requested = req.body.folderIds.map(String);
    const currentIds = active.map(folder => String(folder.id));
    if (requested.length !== currentIds.length || requested.some(id => !currentIds.includes(id))) {
      return res.status(400).json({ error: 'folderIds must contain every active folder exactly once' });
    }
    const orderMap = new Map(requested.map((id, index) => [id, index]));
    workspace.folders.forEach(folder => {
      if (orderMap.has(String(folder.id))) folder.order = orderMap.get(String(folder.id));
    });
    await workspace.save();
    return res.json(workspace.folders.filter(folder => !folder.archived).sort((a, b) => a.order - b.order));
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.delete('/:id/folders/:folderId', async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
    const folder = workspace.folders.find(entry => String(entry.id) === String(req.params.folderId));
    if (!folder) return res.status(404).json({ error: 'Folder not found' });

    folder.archived = true;
    await workspace.save();
    await Board.updateMany(
      { workspaceRef: workspace._id, folderId: String(folder.id) },
      { $set: { folderId: '' } }
    );
    return res.json({ folder, boardsUnassigned: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
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
module.exports.generatedFolderId = generatedFolderId;
