const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const Board = require('../models/Board');
const Item = require('../models/Item');
const { logActivity } = require('../services/activityLogger');

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
    await logActivity({ board: board._id, type: 'group_created', field: 'group', message: `Grupo “${group.title}” creado`, meta: { groupId: group.id } });
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
    const previousColor = group.color;
    const previousArchived = group.archived;
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

    const changes = [];
    if (previousTitle !== group.title) changes.push(`renombrado de “${previousTitle}” a “${group.title}”`);
    if (previousColor !== group.color) changes.push(`color cambiado a ${group.color}`);
    if (previousArchived !== group.archived) changes.push(group.archived ? 'archivado' : 'restaurado');
    if (req.body.order !== undefined) changes.push('orden actualizado');
    await logActivity({
      board: board._id,
      type: 'group_updated',
      field: 'group',
      message: changes.length ? `Grupo ${changes.join(' · ')}` : `Grupo “${group.title}” actualizado`,
      meta: { groupId: group.id, previousTitle, title: group.title }
    });

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

    await logActivity({
      board: board._id,
      type: 'group_duplicated',
      field: 'group',
      message: `Grupo “${sourceGroup.title}” duplicado como “${duplicateGroup.title}”`,
      meta: { sourceGroupId: sourceGroup.id, groupId: duplicateGroup.id, duplicatedItems: sourceItems.length }
    });
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
    await logActivity({ board: board._id, type: 'groups_reordered', field: 'group', message: 'Grupos reordenados', meta: { groupIds: req.body.groupIds } });
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
    await logActivity({ board: board._id, type: 'column_created', field: column.id, message: `Columna “${column.title}” creada`, meta: { columnId: column.id, columnType: column.type } });
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

    const previous = clonePlain(column.toObject ? column.toObject() : column);
    for (const field of ['title', 'description', 'settings', 'order', 'hidden', 'pinned']) {
      if (req.body[field] !== undefined) column[field] = req.body[field];
    }
    await board.save();

    const changes = [];
    if (previous.title !== column.title) changes.push(`renombrada de “${previous.title}” a “${column.title}”`);
    if (previous.description !== column.description) changes.push('descripción actualizada');
    if (previous.hidden !== column.hidden) changes.push(column.hidden ? 'ocultada' : 'mostrada');
    if (previous.pinned !== column.pinned) changes.push(column.pinned ? 'fijada' : 'desfijada');
    if (req.body.settings !== undefined) changes.push('configuración actualizada');
    if (req.body.order !== undefined) changes.push('orden actualizado');
    await logActivity({
      board: board._id,
      type: 'column_updated',
      field: column.id,
      message: changes.length ? `Columna ${changes.join(' · ')}` : `Columna “${column.title}” actualizada`,
      meta: { columnId: column.id, columnType: column.type, previousTitle: previous.title, title: column.title }
    });
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
    await logActivity({
      board: board._id,
      type: 'column_duplicated',
      field: duplicate.id,
      message: `Columna “${sourceColumn.title}” duplicada como “${duplicate.title}”`,
      meta: { sourceColumnId: sourceColumn.id, columnId: duplicate.id, includeValues: req.body.includeValues === true }
    });
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
    await logActivity({ board: board._id, type: 'columns_reordered', field: 'column', message: 'Columnas reordenadas', meta: { columnIds: req.body.columnIds } });
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
    await logActivity({ board: board._id, type: 'board_created', field: 'board', message: `Tablero “${board.name}” creado` });
    res.status(201).json(board);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const before = await Board.findById(req.params.id).lean();
    const board = await Board.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    ).populate('workspaceRef');
    if (!board) return res.status(404).json({ error: 'Board not found' });
    const changes = [];
    if (before?.name !== board.name) changes.push(`renombrado de “${before?.name || ''}” a “${board.name}”`);
    if (req.body.icon !== undefined && before?.icon !== board.icon) changes.push('icono actualizado');
    if (req.body.order !== undefined) changes.push('orden actualizado');
    await logActivity({ board: board._id, type: 'board_updated', field: 'board', message: changes.length ? `Tablero ${changes.join(' · ')}` : `Tablero “${board.name}” actualizado` });
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
    await logActivity({ board: board._id, type: 'board_archived', field: 'board', message: `Tablero “${board.name}” archivado` });
    res.json(board);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
