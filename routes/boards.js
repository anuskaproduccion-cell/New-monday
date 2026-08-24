const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const Board = require('../models/Board');
const Item = require('../models/Item');

function generatedId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
}

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value));
}

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

router.post('/:id/groups', async (req, res) => {
  try {
    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ error: 'Board not found' });

    const title = String(req.body.title || '').trim();
    if (!title) return res.status(400).json({ error: 'Group title is required' });

    const group = {
      id: req.body.id || generatedId('group'),
      title,
      color: req.body.color || '#579bfc',
      order: Number.isFinite(req.body.order) ? req.body.order : board.groups.length,
      archived: false
    };
    board.groups.push(group);
    await board.save();
    res.status(201).json(group);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/:id/groups/:groupId', async (req, res) => {
  try {
    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ error: 'Board not found' });

    const group = board.groups.find(entry => entry.id === req.params.groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const previousTitle = group.title;
    if (req.body.title !== undefined) group.title = String(req.body.title).trim() || group.title;
    if (req.body.color !== undefined) group.color = req.body.color;
    if (req.body.order !== undefined) group.order = Number(req.body.order);
    if (req.body.archived !== undefined) group.archived = Boolean(req.body.archived);
    await board.save();

    const itemQuery = {
      board: board._id,
      deletedAt: null,
      $or: [
        { groupId: group.id },
        { groupId: { $in: ['', null] }, group: previousTitle }
      ]
    };
    const itemPatch = { groupId: group.id, group: group.title, groupColor: group.color };
    await Item.updateMany(itemQuery, { $set: itemPatch });

    res.json(group);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/groups/:groupId/duplicate', async (req, res) => {
  try {
    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ error: 'Board not found' });

    const sourceGroup = board.groups.find(entry => entry.id === req.params.groupId);
    if (!sourceGroup) return res.status(404).json({ error: 'Group not found' });

    const nextOrder = Number.isFinite(sourceGroup.order) ? sourceGroup.order + 1 : board.groups.length;
    board.groups.forEach(group => {
      if (group.order >= nextOrder) group.order += 1;
    });

    const duplicateGroup = {
      id: generatedId('group'),
      title: req.body.title || `${sourceGroup.title} (copy)`,
      color: req.body.color || sourceGroup.color,
      order: nextOrder,
      archived: false
    };
    board.groups.push(duplicateGroup);
    await board.save();

    const sourceItems = await Item.find({
      board: board._id,
      deletedAt: null,
      archived: { $ne: true },
      isSubitem: { $ne: true },
      $or: [
        { groupId: sourceGroup.id },
        { groupId: { $in: ['', null] }, group: sourceGroup.title }
      ]
    }).sort({ order: 1, createdAt: 1 });

    const parentMap = new Map();
    for (const sourceItem of sourceItems) {
      const object = sourceItem.toObject();
      delete object._id;
      delete object.__v;
      delete object.createdAt;
      delete object.updatedAt;
      delete object.mondayId;
      object.groupId = duplicateGroup.id;
      object.group = duplicateGroup.title;
      object.groupColor = duplicateGroup.color;
      object.source = 'local';
      object.sourceReadOnly = false;
      object.originMeta = {
        ...(object.originMeta || {}),
        duplicatedFrom: String(sourceItem._id),
        duplicatedFromMondayId: sourceItem.mondayId || null
      };
      const duplicateItem = await new Item(object).save();
      parentMap.set(String(sourceItem._id), duplicateItem);
    }

    // Dynamic v2 subitems are separate Item documents. Clone them under their new parents.
    if (parentMap.size) {
      const sourceSubitems = await Item.find({
        parentItem: { $in: [...parentMap.keys()] },
        deletedAt: null
      }).sort({ order: 1, createdAt: 1 });

      for (const sourceSubitem of sourceSubitems) {
        const newParent = parentMap.get(String(sourceSubitem.parentItem));
        if (!newParent) continue;
        const object = sourceSubitem.toObject();
        delete object._id;
        delete object.__v;
        delete object.createdAt;
        delete object.updatedAt;
        delete object.mondayId;
        object.parentItem = newParent._id;
        object.parentMondayId = null;
        object.groupId = duplicateGroup.id;
        object.group = duplicateGroup.title;
        object.groupColor = duplicateGroup.color;
        object.source = 'local';
        object.sourceReadOnly = false;
        object.originMeta = {
          ...(object.originMeta || {}),
          duplicatedFrom: String(sourceSubitem._id),
          duplicatedFromMondayId: sourceSubitem.mondayId || null
        };
        await new Item(object).save();
      }
    }

    res.status(201).json({ group: duplicateGroup, duplicatedItems: sourceItems.length });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/groups/reorder', async (req, res) => {
  try {
    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    if (!Array.isArray(req.body.groupIds)) return res.status(400).json({ error: 'groupIds must be an array' });

    const orderMap = new Map(req.body.groupIds.map((id, index) => [id, index]));
    board.groups.forEach(group => {
      if (orderMap.has(group.id)) group.order = orderMap.get(group.id);
    });
    await board.save();
    res.json(board.groups.sort((a, b) => a.order - b.order));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/columns', async (req, res) => {
  try {
    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ error: 'Board not found' });

    const title = String(req.body.title || '').trim();
    const type = String(req.body.type || '').trim();
    if (!title || !type) return res.status(400).json({ error: 'Column title and type are required' });

    const column = {
      id: req.body.id || generatedId(type),
      title,
      type,
      description: req.body.description || '',
      settings: req.body.settings || {},
      order: Number.isFinite(req.body.order) ? req.body.order : board.columns.length,
      hidden: Boolean(req.body.hidden),
      pinned: Boolean(req.body.pinned)
    };
    board.columns.push(column);
    await board.save();
    res.status(201).json(column);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/:id/columns/:columnId', async (req, res) => {
  try {
    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    const column = board.columns.find(entry => entry.id === req.params.columnId);
    if (!column) return res.status(404).json({ error: 'Column not found' });

    for (const field of ['title', 'description', 'settings', 'order', 'hidden', 'pinned']) {
      if (req.body[field] !== undefined) column[field] = req.body[field];
    }
    await board.save();
    res.json(column);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/columns/:columnId/duplicate', async (req, res) => {
  try {
    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    const sourceColumn = board.columns.find(entry => entry.id === req.params.columnId);
    if (!sourceColumn) return res.status(404).json({ error: 'Column not found' });

    const duplicate = clonePlain(sourceColumn.toObject ? sourceColumn.toObject() : sourceColumn);
    duplicate.id = generatedId(sourceColumn.type);
    duplicate.title = req.body.title || `${sourceColumn.title} (copy)`;
    duplicate.order = Number.isFinite(sourceColumn.order) ? sourceColumn.order + 1 : board.columns.length;

    board.columns.forEach(column => {
      if (column.order >= duplicate.order) column.order += 1;
    });
    board.columns.push(duplicate);

    if (req.body.includeValues === true) {
      const items = await Item.find({ board: board._id, deletedAt: null });
      for (const item of items) {
        const values = { ...(item.columnValues || {}) };
        if (Object.prototype.hasOwnProperty.call(values, sourceColumn.id)) {
          values[duplicate.id] = clonePlain(values[sourceColumn.id]);
          item.columnValues = values;
          item.markModified('columnValues');
          await item.save();
        }
      }
    }

    await board.save();
    res.status(201).json(duplicate);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/columns/reorder', async (req, res) => {
  try {
    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    if (!Array.isArray(req.body.columnIds)) return res.status(400).json({ error: 'columnIds must be an array' });

    const orderMap = new Map(req.body.columnIds.map((id, index) => [id, index]));
    board.columns.forEach(column => {
      if (orderMap.has(column.id)) column.order = orderMap.get(column.id);
    });
    await board.save();
    res.json(board.columns.sort((a, b) => a.order - b.order));
  } catch (err) {
    res.status(400).json({ error: err.message });
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
