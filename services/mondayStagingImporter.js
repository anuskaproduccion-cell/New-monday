const ImportRun = require('../models/ImportRun');
const StagingWorkspace = require('../models/StagingWorkspace');
const StagingBoard = require('../models/StagingBoard');
const StagingItem = require('../models/StagingItem');
const { getAccountInventory, getBoardSnapshot } = require('./mondayReadOnlyClient');
const { normalizeColumnValues } = require('./mondayNormalizer');
const { fingerprint, boardSchemaPayload, boardDataFingerprint } = require('./stagingFingerprint');

function parseSettings(value) {
  if (!value) return {};
  try { return JSON.parse(value); } catch (e) { return { raw: value }; }
}

function normalizedBoardMetadata(board, importRunId) {
  const normalized = {
    importRun: importRunId,
    mondayId: String(board.id),
    workspaceMondayId: board.workspace?.id ? String(board.workspace.id) : null,
    workspaceName: board.workspace?.name || '',
    name: board.name,
    description: board.description || '',
    state: board.state || '',
    boardKind: board.board_kind || '',
    internal: String(board.name || '').startsWith('Subelementos de '),
    groups: (board.groups || []).map((group, order) => ({
      id: group.id,
      title: group.title,
      color: group.color,
      order
    })),
    columns: (board.columns || []).map((column, order) => ({
      id: column.id,
      title: column.title,
      description: column.description || '',
      type: column.type,
      settings: parseSettings(column.settings_str),
      order
    })),
    views: (board.views || []).map((view, order) => ({
      id: String(view.id),
      name: view.name,
      type: view.type || null,
      order
    })),
    sourceUpdatedAt: board.updated_at ? new Date(board.updated_at) : null,
    sourceDataHash: '',
    rawMeta: {
      readOnlySource: true
    }
  };
  normalized.sourceSchemaHash = fingerprint(boardSchemaPayload(normalized));
  return normalized;
}

function stagedParentItem(item, boardMondayId, importRunId, order) {
  return {
    importRun: importRunId,
    boardMondayId: String(boardMondayId),
    mondayId: String(item.id),
    parentMondayId: null,
    isSubitem: false,
    name: item.name,
    order,
    groupId: item.group?.id || '',
    group: item.group?.title || 'Imported',
    groupColor: item.group?.color || '#579bfc',
    columnValues: normalizeColumnValues(item.column_values || []),
    sourceMeta: {
      createdAt: item.created_at || null,
      updatedAt: item.updated_at || null,
      readOnlySource: true
    }
  };
}

function stagedSubitem(subitem, parent, boardMondayId, importRunId, order) {
  return {
    importRun: importRunId,
    boardMondayId: String(boardMondayId),
    mondayId: String(subitem.id),
    parentMondayId: String(parent.id),
    isSubitem: true,
    name: subitem.name,
    order,
    groupId: parent.group?.id || '',
    group: parent.group?.title || 'Subitems',
    groupColor: parent.group?.color || '#579bfc',
    columnValues: normalizeColumnValues(subitem.column_values || []),
    sourceMeta: {
      createdAt: subitem.created_at || null,
      updatedAt: subitem.updated_at || null,
      readOnlySource: true
    }
  };
}

async function calculateFingerprintAudit(runId) {
  const boards = await StagingBoard.find({ importRun: runId }).lean();
  const mismatchedBoards = [];
  let schemaMatches = 0;
  let dataMatches = 0;
  let dataChecked = 0;

  for (const board of boards) {
    const stagedSchemaHash = fingerprint(boardSchemaPayload(board));
    const schemaOk = Boolean(board.sourceSchemaHash) && board.sourceSchemaHash === stagedSchemaHash;
    if (schemaOk) schemaMatches += 1;

    let dataOk = true;
    let stagedDataHash = '';
    if (!board.internal) {
      dataChecked += 1;
      const items = await StagingItem.find({ importRun: runId, boardMondayId: board.mondayId }).lean();
      stagedDataHash = boardDataFingerprint(items);
      dataOk = Boolean(board.sourceDataHash) && board.sourceDataHash === stagedDataHash;
      if (dataOk) dataMatches += 1;
    }

    if (!schemaOk || !dataOk) {
      mismatchedBoards.push({
        mondayId: board.mondayId,
        name: board.name,
        schemaOk,
        dataOk,
        sourceSchemaHash: board.sourceSchemaHash,
        stagedSchemaHash,
        sourceDataHash: board.sourceDataHash,
        stagedDataHash
      });
    }
  }

  return {
    ok: mismatchedBoards.length === 0,
    boardCount: boards.length,
    schemaMatches,
    dataChecked,
    dataMatches,
    mismatchedBoards
  };
}

async function calculateAudit(runId, sourceCounts = {}) {
  const [workspaces, boards, visibleBoards, internalBoards, items, subitems] = await Promise.all([
    StagingWorkspace.countDocuments({ importRun: runId }),
    StagingBoard.countDocuments({ importRun: runId }),
    StagingBoard.countDocuments({ importRun: runId, internal: false }),
    StagingBoard.countDocuments({ importRun: runId, internal: true }),
    StagingItem.countDocuments({ importRun: runId, isSubitem: false }),
    StagingItem.countDocuments({ importRun: runId, isSubitem: true })
  ]);

  const stagedCounts = { workspaces, boards, visibleBoards, internalBoards, items, subitems };
  const checks = {
    workspaces: sourceCounts.workspaces === undefined || sourceCounts.workspaces === workspaces,
    boards: sourceCounts.boards === undefined || sourceCounts.boards === boards,
    visibleBoards: sourceCounts.visibleBoards === undefined || sourceCounts.visibleBoards === visibleBoards,
    internalBoards: sourceCounts.internalSubitemBoards === undefined || sourceCounts.internalSubitemBoards === internalBoards,
    items: sourceCounts.items === undefined || sourceCounts.items === items,
    subitems: sourceCounts.subitems === undefined || sourceCounts.subitems === subitems
  };
  const fingerprints = await calculateFingerprintAudit(runId);

  return {
    stagedCounts,
    audit: {
      ok: Object.values(checks).every(Boolean) && fingerprints.ok,
      checks,
      fingerprints,
      sourceCounts,
      stagedCounts
    }
  };
}

async function executeStagingImport(runId) {
  const run = await ImportRun.findById(runId);
  if (!run) throw new Error('Import run not found');

  run.status = 'running';
  run.startedAt = new Date();
  run.error = '';
  run.progress = { phase: 'inventory', boardIndex: 0, boardTotal: 0 };
  await run.save();

  try {
    const inventory = await getAccountInventory();
    const sourceCounts = { ...inventory.counts, items: 0, subitems: 0 };
    run.sourceCounts = sourceCounts;
    run.progress = {
      phase: 'workspaces',
      boardIndex: 0,
      boardTotal: inventory.visibleBoards.length
    };
    await run.save();

    if (inventory.workspaces.length) {
      await StagingWorkspace.insertMany(inventory.workspaces.map((workspace, order) => ({
        importRun: run._id,
        mondayId: String(workspace.id),
        name: workspace.name,
        description: workspace.description || '',
        kind: workspace.kind || '',
        order,
        rawMeta: { readOnlySource: true }
      })), { ordered: true });
    }

    const allBoards = inventory.boards || [];
    if (allBoards.length) {
      await StagingBoard.insertMany(allBoards.map(board => normalizedBoardMetadata(board, run._id)), { ordered: true });
    }

    run.progress = {
      phase: 'items',
      boardIndex: 0,
      boardTotal: inventory.visibleBoards.length
    };
    await run.save();

    for (let boardIndex = 0; boardIndex < inventory.visibleBoards.length; boardIndex += 1) {
      const sourceBoard = inventory.visibleBoards[boardIndex];
      const snapshot = await getBoardSnapshot(sourceBoard.id);
      const parentDocs = [];
      const subitemDocs = [];

      snapshot.items.forEach((item, itemOrder) => {
        parentDocs.push(stagedParentItem(item, sourceBoard.id, run._id, itemOrder));
        (item.subitems || []).forEach((subitem, subitemOrder) => {
          subitemDocs.push(stagedSubitem(subitem, item, sourceBoard.id, run._id, subitemOrder));
        });
      });

      if (parentDocs.length) await StagingItem.insertMany(parentDocs, { ordered: true });
      if (subitemDocs.length) await StagingItem.insertMany(subitemDocs, { ordered: true });

      sourceCounts.items += snapshot.counts.items;
      sourceCounts.subitems += snapshot.counts.subitems;
      const sourceDataHash = boardDataFingerprint([...parentDocs, ...subitemDocs]);
      await StagingBoard.findOneAndUpdate(
        { importRun: run._id, mondayId: String(sourceBoard.id) },
        {
          $set: {
            counts: snapshot.counts,
            sourceDataHash,
            sourceUpdatedAt: snapshot.board.updated_at ? new Date(snapshot.board.updated_at) : null
          }
        }
      );

      run.sourceCounts = sourceCounts;
      run.progress = {
        phase: 'items',
        boardIndex: boardIndex + 1,
        boardTotal: inventory.visibleBoards.length,
        currentBoardMondayId: String(sourceBoard.id),
        currentBoardName: sourceBoard.name
      };
      await run.save();
    }

    const auditResult = await calculateAudit(run._id, sourceCounts);
    run.stagedCounts = auditResult.stagedCounts;
    run.audit = auditResult.audit;
    run.status = auditResult.audit.ok ? 'completed' : 'failed';
    run.completedAt = new Date();
    run.progress = { phase: 'complete', boardIndex: inventory.visibleBoards.length, boardTotal: inventory.visibleBoards.length };
    if (!auditResult.audit.ok) run.error = 'Staging audit failed. No production data was changed.';
    await run.save();
    return run;
  } catch (error) {
    run.status = 'failed';
    run.completedAt = new Date();
    run.error = error.message || String(error);
    run.progress = { ...(run.progress || {}), phase: 'failed' };
    await run.save();
    throw error;
  }
}

async function startStagingImport() {
  const active = await ImportRun.findOne({ status: { $in: ['queued', 'running'] } }).sort({ createdAt: -1 });
  if (active) return { run: active, started: false };

  const run = await new ImportRun({
    status: 'queued',
    readOnlyMonday: true,
    policy: 'Monday is query-only. Mutations are forbidden.'
  }).save();

  setImmediate(() => {
    executeStagingImport(run._id).catch(error => {
      console.error('Monday staging import failed:', error.message);
    });
  });

  return { run, started: true };
}

async function getStagingRun(runId) {
  const run = await ImportRun.findById(runId);
  if (!run) throw new Error('Import run not found');
  return run;
}

module.exports = {
  startStagingImport,
  executeStagingImport,
  getStagingRun,
  calculateAudit,
  calculateFingerprintAudit,
  normalizedBoardMetadata,
  stagedParentItem,
  stagedSubitem
};
