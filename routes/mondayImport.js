const express = require('express');
const router = express.Router();
const ImportRun = require('../models/ImportRun');
const StagingBoard = require('../models/StagingBoard');
const StagingItem = require('../models/StagingItem');
const StagingWorkspace = require('../models/StagingWorkspace');
const { getAccountInventory, getBoardSnapshot } = require('../services/mondayReadOnlyClient');
const { startStagingImport, calculateAudit } = require('../services/mondayStagingImporter');
const { buildPromotionPreview, promoteStagingRun } = require('../services/stagingPromotion');

// Absolute project rule:
// Monday is a source/reference only. This router may read Monday, but never write to it.
router.get('/preview', async (req, res) => {
  try {
    const inventory = await getAccountInventory();
    res.json({
      readOnly: true,
      policy: 'Monday is a source/reference only. Mutations are forbidden.',
      counts: inventory.counts,
      workspaces: inventory.workspaces,
      visibleBoards: inventory.visibleBoards.map(board => ({
        id: board.id,
        name: board.name,
        state: board.state,
        kind: board.board_kind,
        workspace: board.workspace,
        groupCount: board.groups?.length || 0,
        columns: (board.columns || []).map(column => ({
          id: column.id,
          title: column.title,
          type: column.type,
          description: column.description,
          settings: parseSettings(column.settings_str)
        })),
        views: board.views || []
      })),
      internalSubitemBoards: inventory.internalSubitemBoards.map(board => ({
        id: board.id,
        name: board.name,
        workspace: board.workspace
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message, readOnly: true });
  }
});

router.get('/preview/board/:mondayBoardId', async (req, res) => {
  try {
    const snapshot = await getBoardSnapshot(req.params.mondayBoardId);
    res.json({
      ...snapshot,
      policy: 'Monday is read-only. This endpoint only reads a snapshot.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message, readOnly: true });
  }
});

// Starts a full copy into isolated staging collections in New Monday's MongoDB.
// It does NOT promote data into production collections and it does NOT mutate Monday.
router.post('/staging/start', async (req, res) => {
  try {
    const result = await startStagingImport();
    res.status(result.started ? 202 : 200).json({
      started: result.started,
      run: result.run,
      readOnlyMonday: true,
      productionCollectionsChanged: false,
      policy: 'Monday remains query-only. Staging writes occur only in New Monday MongoDB.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message, readOnlyMonday: true });
  }
});

router.get('/staging/runs', async (req, res) => {
  try {
    const runs = await ImportRun.find().sort({ createdAt: -1 }).limit(20);
    res.json(runs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/staging/runs/:runId', async (req, res) => {
  try {
    const run = await ImportRun.findById(req.params.runId);
    if (!run) return res.status(404).json({ error: 'Import run not found' });
    res.json(run);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/staging/runs/:runId/audit', async (req, res) => {
  try {
    const run = await ImportRun.findById(req.params.runId);
    if (!run) return res.status(404).json({ error: 'Import run not found' });
    const result = await calculateAudit(run._id, run.sourceCounts || {});
    res.json({
      runId: String(run._id),
      status: run.status,
      readOnlyMonday: run.readOnlyMonday,
      ...result,
      productionCollectionsChanged: false
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/staging/runs/:runId/workspaces', async (req, res) => {
  try {
    const workspaces = await StagingWorkspace.find({ importRun: req.params.runId }).sort({ order: 1, name: 1 });
    res.json(workspaces);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/staging/runs/:runId/boards', async (req, res) => {
  try {
    const query = { importRun: req.params.runId };
    if (req.query.includeInternal !== 'true') query.internal = false;
    const boards = await StagingBoard.find(query).sort({ workspaceName: 1, name: 1 });
    res.json(boards);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/staging/runs/:runId/boards/:mondayBoardId/items', async (req, res) => {
  try {
    const query = {
      importRun: req.params.runId,
      boardMondayId: String(req.params.mondayBoardId)
    };
    if (req.query.includeSubitems !== 'true') query.isSubitem = false;
    const items = await StagingItem.find(query).sort({ isSubitem: 1, order: 1, createdAt: 1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Safe promotion is a New Monday-only operation. It never contacts Monday.
// Preview must be green before promotion; local records are never deleted.
router.get('/staging/runs/:runId/promotion-preview', async (req, res) => {
  try {
    const preview = await buildPromotionPreview(req.params.runId);
    res.json(preview);
  } catch (err) {
    res.status(400).json({ error: err.message, mondayReadOnly: true, productionDeletes: 0 });
  }
});

router.post('/staging/runs/:runId/promote', async (req, res) => {
  try {
    const result = await promoteStagingRun(req.params.runId, req.body?.confirmation);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message, mondayReadOnly: true, mondayMutations: 0 });
  }
});

function parseSettings(settings) {
  if (!settings) return {};
  try { return JSON.parse(settings); } catch (e) { return { raw: settings }; }
}

module.exports = router;
