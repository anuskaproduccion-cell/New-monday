const express = require('express');
const Board = require('../models/Board');
const Item = require('../models/Item');
const { logActivity } = require('../services/activityLogger');

const router = express.Router();

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function localBoardClone(source, name, order) {
  const object = plain(source.toObject ? source.toObject() : source);
  delete object._id;
  delete object.__v;
  delete object.createdAt;
  delete object.updatedAt;
  delete object.mondayId;
  object.name = String(name || `${source.name} (copia)`).trim() || `${source.name} (copia)`;
  object.order = order;
  object.archived = false;
  object.internal = false;
  object.source = 'local';
  object.sourceReadOnly = false;
  object.parentBoardMondayId = null;
  object.originMeta = {
    duplicatedFrom: String(source._id),
    duplicatedFromMondayId: source.mondayId || null,
    duplicatedAt: new Date().toISOString()
  };
  return object;
}

function localItemClone(source, boardId, parentItem = null) {
  const object = plain(source.toObject ? source.toObject() : source);
  delete object._id;
  delete object.__v;
  delete object.createdAt;
  delete object.updatedAt;
  delete object.mondayId;
  object.board = boardId;
  object.parentItem = parentItem;
  object.parentMondayId = null;
  object.archived = false;
  object.deletedAt = null;
  object.source = 'local';
  object.sourceReadOnly = false;
  object.originMeta = {
    duplicatedFrom: String(source._id),
    duplicatedFromMondayId: source.mondayId || null,
    duplicatedAt: new Date().toISOString()
  };
  return object;
}

router.post('/:id/duplicate', async (req, res) => {
  try {
    const source = await Board.findById(req.params.id);
    if (!source) return res.status(404).json({ error: 'Board not found' });
    if (source.internal) return res.status(400).json({ error: 'Internal subitem boards cannot be duplicated directly' });

    const siblingQuery = source.workspaceRef
      ? { workspaceRef: source.workspaceRef, archived: { $ne: true } }
      : { workspace: source.workspace, archived: { $ne: true } };
    const nextOrder = Number.isFinite(source.order) ? Number(source.order) + 1 : 0;
    await Board.updateMany({ ...siblingQuery, order: { $gte: nextOrder } }, { $inc: { order: 1 } });

    const duplicate = await new Board(localBoardClone(source, req.body?.name, nextOrder)).save();
    const parents = await Item.find({
      board: source._id,
      deletedAt: null,
      archived: { $ne: true },
      isSubitem: { $ne: true }
    }).sort({ order: 1, createdAt: 1 });

    const parentMap = new Map();
    for (const parent of parents) {
      const created = await new Item(localItemClone(parent, duplicate._id, null)).save();
      parentMap.set(String(parent._id), created);
    }

    let subitemsDuplicated = 0;
    if (parentMap.size) {
      const subitems = await Item.find({
        board: source._id,
        parentItem: { $in: [...parentMap.keys()] },
        deletedAt: null,
        archived: { $ne: true },
        isSubitem: true
      }).sort({ parentItem: 1, order: 1, createdAt: 1 });
      for (const subitem of subitems) {
        const parent = parentMap.get(String(subitem.parentItem));
        if (!parent) continue;
        await new Item(localItemClone(subitem, duplicate._id, parent._id)).save();
        subitemsDuplicated += 1;
      }
    }

    await logActivity({
      board: duplicate._id,
      type: 'board_duplicated',
      field: 'board',
      message: `Tablero duplicado desde “${source.name}”`,
      meta: {
        sourceBoardId: String(source._id),
        sourceMondayId: source.mondayId || null,
        itemsDuplicated: parents.length,
        subitemsDuplicated
      }
    });

    return res.status(201).json({
      board: duplicate,
      itemsDuplicated: parents.length,
      subitemsDuplicated,
      mondayMutations: 0
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
module.exports.localBoardClone = localBoardClone;
module.exports.localItemClone = localItemClone;
