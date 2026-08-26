const ImportRun = require('../models/ImportRun');
const StagingWorkspace = require('../models/StagingWorkspace');
const StagingBoard = require('../models/StagingBoard');
const StagingItem = require('../models/StagingItem');
const Workspace = require('../models/Workspace');
const Board = require('../models/Board');
const Item = require('../models/Item');

function confirmationFor(runId) {
  return `PROMOTE_STAGING_${String(runId)}`;
}

function classifyWorkspace(name) {
  return String(name || '').startsWith('_') ? 'technical' : 'film';
}

function validateRunForPromotion(run) {
  if (!run) throw new Error('Import run not found');
  if (run.status !== 'completed') throw new Error('Only a completed staging run can be promoted');
  if (!run.audit?.ok) throw new Error('Staging audit must be fully green before promotion');
  if (run.readOnlyMonday !== true) throw new Error('Promotion blocked: source run is not marked read-only');
  return true;
}

function actionForExisting(existing) {
  if (!existing) return 'insert';
  if (existing.source === 'monday-import') return 'update-imported';
  return 'conflict-local';
}

async function buildPromotionPreview(runId) {
  const run = await ImportRun.findById(runId);
  validateRunForPromotion(run);

  const [stagingWorkspaces, stagingBoards, stagingItems] = await Promise.all([
    StagingWorkspace.find({ importRun: run._id }).lean(),
    StagingBoard.find({ importRun: run._id }).lean(),
    StagingItem.find({ importRun: run._id }).lean()
  ]);

  const [existingWorkspaces, existingBoards, existingItems] = await Promise.all([
    Workspace.find({ mondayId: { $in: stagingWorkspaces.map(row => row.mondayId) } }).lean(),
    Board.find({ mondayId: { $in: stagingBoards.map(row => row.mondayId) } }).lean(),
    Item.find({ mondayId: { $in: stagingItems.map(row => row.mondayId) } }).lean()
  ]);

  const existingWorkspaceMap = new Map(existingWorkspaces.map(row => [String(row.mondayId), row]));
  const existingBoardMap = new Map(existingBoards.map(row => [String(row.mondayId), row]));
  const existingItemMap = new Map(existingItems.map(row => [String(row.mondayId), row]));

  const buckets = {
    workspaces: { insert: 0, updateImported: 0, conflictLocal: 0 },
    boards: { insert: 0, updateImported: 0, conflictLocal: 0 },
    items: { insert: 0, updateImported: 0, conflictLocal: 0 }
  };
  const conflicts = [];

  function count(kind, mondayId, name, existing) {
    const action = actionForExisting(existing);
    if (action === 'insert') buckets[kind].insert += 1;
    if (action === 'update-imported') buckets[kind].updateImported += 1;
    if (action === 'conflict-local') {
      buckets[kind].conflictLocal += 1;
      conflicts.push({ kind, mondayId: String(mondayId), name, localId: String(existing._id) });
    }
  }

  stagingWorkspaces.forEach(row => count('workspaces', row.mondayId, row.name, existingWorkspaceMap.get(String(row.mondayId))));
  stagingBoards.forEach(row => count('boards', row.mondayId, row.name, existingBoardMap.get(String(row.mondayId))));
  stagingItems.forEach(row => count('items', row.mondayId, row.name, existingItemMap.get(String(row.mondayId))));

  return {
    runId: String(run._id),
    ready: conflicts.length === 0,
    auditOk: true,
    mondayReadOnly: true,
    deletesPlanned: 0,
    existingLocalDataWillBeDeleted: false,
    counts: {
      stagingWorkspaces: stagingWorkspaces.length,
      stagingBoards: stagingBoards.length,
      stagingItems: stagingItems.length
    },
    actions: buckets,
    conflicts,
    requiredConfirmation: confirmationFor(run._id),
    policy: 'Promotion writes only to New Monday MongoDB. Monday is never modified.'
  };
}

async function promoteStagingRun(runId, confirmation) {
  const run = await ImportRun.findById(runId);
  validateRunForPromotion(run);
  const expected = confirmationFor(run._id);
  if (confirmation !== expected) throw new Error('Explicit staging promotion confirmation is required');

  const preview = await buildPromotionPreview(run._id);
  if (!preview.ready) throw new Error(`Promotion blocked by ${preview.conflicts.length} local-data conflict(s)`);

  const stagingWorkspaces = await StagingWorkspace.find({ importRun: run._id }).sort({ order: 1 });
  const workspaceMap = new Map();
  let workspacesUpserted = 0;

  for (const source of stagingWorkspaces) {
    const workspace = await Workspace.findOneAndUpdate(
      { mondayId: source.mondayId },
      {
        $set: {
          name: source.name,
          description: source.description || '',
          kind: source.kind || 'open',
          classification: classifyWorkspace(source.name),
          order: source.order || 0,
          archived: false,
          source: 'monday-import',
          sourceReadOnly: false,
          originMeta: {
            ...(source.rawMeta || {}),
            importRunId: String(run._id),
            importedFromMondayReadOnly: true
          }
        }
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    workspaceMap.set(String(source.mondayId), workspace);
    workspacesUpserted += 1;
  }

  const stagingBoards = await StagingBoard.find({ importRun: run._id }).sort({ workspaceName: 1, name: 1 });
  const boardMap = new Map();
  let boardsUpserted = 0;

  for (const source of stagingBoards) {
    const workspace = source.workspaceMondayId ? workspaceMap.get(String(source.workspaceMondayId)) : null;
    const board = await Board.findOneAndUpdate(
      { mondayId: source.mondayId },
      {
        $set: {
          name: source.name,
          description: source.description || '',
          workspace: source.workspaceName || workspace?.name || 'Sin workspace',
          workspaceRef: workspace?._id || null,
          order: 0,
          groups: source.groups || [],
          columns: source.columns || [],
          views: source.views || [],
          internal: Boolean(source.internal),
          technical: Boolean(source.internal) || String(source.workspaceName || '').startsWith('_'),
          archived: false,
          source: 'monday-import',
          sourceReadOnly: false,
          originMeta: {
            ...(source.rawMeta || {}),
            importRunId: String(run._id),
            importedFromMondayReadOnly: true,
            sourceUpdatedAt: source.sourceUpdatedAt || null
          }
        }
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    boardMap.set(String(source.mondayId), board);
    boardsUpserted += 1;
  }

  const parents = await StagingItem.find({ importRun: run._id, isSubitem: false }).sort({ boardMondayId: 1, order: 1 });
  const parentMap = new Map();
  let itemsUpserted = 0;

  for (const source of parents) {
    const board = boardMap.get(String(source.boardMondayId));
    if (!board) throw new Error(`Missing promoted board for Monday board ${source.boardMondayId}`);
    const item = await Item.findOneAndUpdate(
      { mondayId: source.mondayId },
      {
        $set: {
          board: board._id,
          groupId: source.groupId || '',
          group: source.group || 'Imported',
          groupColor: source.groupColor || '#579bfc',
          name: source.name,
          order: source.order || 0,
          columnValues: source.columnValues || {},
          parentItem: null,
          parentMondayId: null,
          isSubitem: false,
          archived: false,
          deletedAt: null,
          source: 'monday-import',
          sourceReadOnly: false,
          originMeta: {
            ...(source.sourceMeta || {}),
            importRunId: String(run._id),
            importedFromMondayReadOnly: true
          }
        }
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    parentMap.set(String(source.mondayId), item);
    itemsUpserted += 1;
  }

  const subitems = await StagingItem.find({ importRun: run._id, isSubitem: true }).sort({ boardMondayId: 1, parentMondayId: 1, order: 1 });
  for (const source of subitems) {
    const board = boardMap.get(String(source.boardMondayId));
    const parent = parentMap.get(String(source.parentMondayId));
    if (!board) throw new Error(`Missing promoted board for subitem ${source.mondayId}`);
    if (!parent) throw new Error(`Missing promoted parent ${source.parentMondayId} for subitem ${source.mondayId}`);
    await Item.findOneAndUpdate(
      { mondayId: source.mondayId },
      {
        $set: {
          board: board._id,
          groupId: source.groupId || parent.groupId || '',
          group: source.group || parent.group || 'Subitems',
          groupColor: source.groupColor || parent.groupColor || '#579bfc',
          name: source.name,
          order: source.order || 0,
          columnValues: source.columnValues || {},
          parentItem: parent._id,
          parentMondayId: String(source.parentMondayId),
          isSubitem: true,
          archived: false,
          deletedAt: null,
          source: 'monday-import',
          sourceReadOnly: false,
          originMeta: {
            ...(source.sourceMeta || {}),
            importRunId: String(run._id),
            importedFromMondayReadOnly: true
          }
        }
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    itemsUpserted += 1;
  }

  return {
    promoted: true,
    runId: String(run._id),
    mondayReadOnly: true,
    mondayMutations: 0,
    productionDeletes: 0,
    workspacesUpserted,
    boardsUpserted,
    itemsUpserted,
    policy: 'All writes occurred only inside New Monday MongoDB.'
  };
}

module.exports = {
  confirmationFor,
  classifyWorkspace,
  validateRunForPromotion,
  actionForExisting,
  buildPromotionPreview,
  promoteStagingRun
};
