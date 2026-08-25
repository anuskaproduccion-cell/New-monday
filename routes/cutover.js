const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const ImportRun = require('../models/ImportRun');
const Workspace = require('../models/Workspace');
const Board = require('../models/Board');
const Item = require('../models/Item');
const { executeStagingImport } = require('../services/mondayStagingImporter');
const { buildPromotionPreview, promoteStagingRun } = require('../services/stagingPromotion');

const BASELINE = Object.freeze({
  workspaces: 17,
  boards: 103,
  visibleBoards: 55,
  internalSubitemBoards: 48,
  items: 1230,
  subitems: 413
});

const PREPARE_CONFIRMATION = 'PREPARE_NEW_MONDAY_CUTOVER';
const PROMOTE_CONFIRMATION = 'PROMOTE_NEW_MONDAY_17_103_1230';

function enabled() {
  return String(process.env.ALLOW_MONDAY_IMPORT_CUTOVER || '').toLowerCase() === 'true';
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(String(token || ''), 'utf8').digest('hex');
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function readToken(req) {
  return String(req.get('x-monday-read-token') || '').trim();
}

async function productionCounts() {
  const [workspaces, boards, items] = await Promise.all([
    Workspace.countDocuments({}),
    Board.countDocuments({}),
    Item.countDocuments({})
  ]);
  return { workspaces, boards, items };
}

function productionCountsAreEmpty(counts = {}) {
  return Number(counts.workspaces || 0) === 0
    && Number(counts.boards || 0) === 0
    && Number(counts.items || 0) === 0;
}

// `sourceCounts` is a Mixed Mongoose field. During long imports, in-place
// increments can remain visible on the live document instance while an earlier
// persisted snapshot still contains zero item counts. The audit stores a fresh
// immutable copy of the exact source counts used to compare staging, so that is
// the canonical value after an audit has completed.
function effectiveSourceCounts(run = {}) {
  const audited = run?.audit?.sourceCounts;
  if (audited && typeof audited === 'object') return audited;
  return run?.sourceCounts || {};
}

function baselineMatches(run) {
  const source = effectiveSourceCounts(run);
  const staged = run?.stagedCounts || {};
  return (
    Number(source.workspaces) === BASELINE.workspaces
    && Number(source.boards) === BASELINE.boards
    && Number(source.visibleBoards) === BASELINE.visibleBoards
    && Number(source.internalSubitemBoards) === BASELINE.internalSubitemBoards
    && Number(source.items) === BASELINE.items
    && Number(source.subitems) === BASELINE.subitems
    && Number(staged.workspaces) === BASELINE.workspaces
    && Number(staged.boards) === BASELINE.boards
    && Number(staged.visibleBoards) === BASELINE.visibleBoards
    && Number(staged.internalBoards) === BASELINE.internalSubitemBoards
    && Number(staged.items) === BASELINE.items
    && Number(staged.subitems) === BASELINE.subitems
  );
}

function runIsEligibleForPromotion(run) {
  return Boolean(run && run.status === 'completed' && run.audit?.ok === true && baselineMatches(run));
}

function previewIsSafe(preview) {
  return Boolean(
    preview
    && preview.ready === true
    && Number(preview.deletesPlanned) === 0
    && Array.isArray(preview.conflicts)
    && preview.conflicts.length === 0
  );
}

function finalCountsMatch(counts = {}) {
  return Number(counts.workspaces) === BASELINE.workspaces
    && Number(counts.boards) === BASELINE.boards
    && Number(counts.items) === BASELINE.items + BASELINE.subitems;
}

router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!enabled()) {
    return res.status(403).json({
      error: 'Production cutover is disabled',
      mondayReadOnly: true,
      mondayMutations: 0
    });
  }
  return next();
});

router.post('/from-monday/start', async (req, res) => {
  try {
    if (req.body?.confirmation !== PREPARE_CONFIRMATION) {
      return res.status(400).json({ error: 'Explicit cutover preparation confirmation is required' });
    }

    const token = readToken(req);
    if (token.length < 20) return res.status(401).json({ error: 'Monday read token is required' });

    const counts = await productionCounts();
    if (!productionCountsAreEmpty(counts)) {
      return res.status(409).json({
        error: 'Cutover start blocked because production collections are not empty',
        productionCounts: counts,
        productionDeletes: 0
      });
    }

    const active = await ImportRun.findOne({ status: { $in: ['queued', 'running'] } }).sort({ createdAt: -1 });
    if (active) {
      return res.status(409).json({ error: 'Another import run is already active', runId: String(active._id) });
    }

    const run = await new ImportRun({
      status: 'queued',
      readOnlyMonday: true,
      policy: 'Production cutover preparation. Monday is query-only; mutations are forbidden.',
      cutoverTokenHash: tokenHash(token)
    }).save();

    setImmediate(async () => {
      const previous = process.env.MONDAY_API_TOKEN;
      process.env.MONDAY_API_TOKEN = token;
      try {
        await executeStagingImport(run._id);
      } catch (error) {
        console.error(`Production cutover staging failed: ${error.message}`);
      } finally {
        if (previous === undefined) delete process.env.MONDAY_API_TOKEN;
        else process.env.MONDAY_API_TOKEN = previous;
      }
    });

    res.status(202).json({
      started: true,
      runId: String(run._id),
      mondayReadOnly: true,
      mondayMutations: 0,
      productionCollectionsChanged: false,
      productionCountsBefore: counts
    });
  } catch (error) {
    res.status(500).json({ error: error.message, mondayMutations: 0, productionDeletes: 0 });
  }
});

router.get('/runs/:runId', async (req, res) => {
  try {
    const run = await ImportRun.findById(req.params.runId).lean();
    if (!run) return res.status(404).json({ error: 'Cutover run not found' });

    const payload = {
      runId: String(run._id),
      status: run.status,
      readOnlyMonday: run.readOnlyMonday,
      sourceCounts: effectiveSourceCounts(run),
      stagedCounts: run.stagedCounts,
      audit: run.audit,
      progress: run.progress,
      error: run.error,
      baselineOk: run.status === 'completed' ? baselineMatches(run) : null,
      mondayMutations: 0,
      productionDeletes: 0
    };

    if (runIsEligibleForPromotion(run)) {
      payload.promotionPreview = await buildPromotionPreview(run._id);
    }

    res.json(payload);
  } catch (error) {
    res.status(500).json({ error: error.message, mondayMutations: 0, productionDeletes: 0 });
  }
});

router.post('/runs/:runId/promote', async (req, res) => {
  try {
    if (req.body?.confirmation !== PROMOTE_CONFIRMATION) {
      return res.status(400).json({ error: 'Explicit production promotion confirmation is required' });
    }

    const token = readToken(req);
    if (token.length < 20) return res.status(401).json({ error: 'Monday read token is required' });

    const run = await ImportRun.findById(req.params.runId).select('+cutoverTokenHash');
    if (!run) return res.status(404).json({ error: 'Cutover run not found' });
    if (!safeEqual(tokenHash(token), run.cutoverTokenHash)) {
      return res.status(401).json({ error: 'Cutover token does not match the token used to prepare this run' });
    }
    if (!runIsEligibleForPromotion(run)) {
      return res.status(409).json({ error: 'Promotion blocked because the cutover staging audit is not fully green' });
    }

    const before = await productionCounts();
    if (!productionCountsAreEmpty(before)) {
      return res.status(409).json({
        error: 'Promotion blocked because production collections changed after cutover preparation',
        productionCounts: before,
        productionDeletes: 0
      });
    }

    const preview = await buildPromotionPreview(run._id);
    if (!previewIsSafe(preview)) {
      return res.status(409).json({ error: 'Promotion preview is not safe', preview });
    }

    const result = await promoteStagingRun(run._id, preview.requiredConfirmation);
    const after = await productionCounts();
    const expectedItems = BASELINE.items + BASELINE.subitems;

    if (!finalCountsMatch(after)) {
      return res.status(500).json({
        error: 'Promotion completed but final production counts do not match the validated baseline',
        result,
        productionCounts: after,
        expected: { workspaces: BASELINE.workspaces, boards: BASELINE.boards, items: expectedItems },
        mondayMutations: 0,
        productionDeletes: 0
      });
    }

    res.json({
      status: 'published-data-ready',
      result,
      productionCounts: after,
      expected: { workspaces: BASELINE.workspaces, boards: BASELINE.boards, items: expectedItems },
      mondayReadOnly: true,
      mondayMutations: 0,
      productionDeletes: 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message, mondayMutations: 0, productionDeletes: 0 });
  }
});

module.exports = {
  router,
  BASELINE,
  PREPARE_CONFIRMATION,
  PROMOTE_CONFIRMATION,
  tokenHash,
  productionCountsAreEmpty,
  effectiveSourceCounts,
  baselineMatches,
  runIsEligibleForPromotion,
  previewIsSafe,
  finalCountsMatch
};