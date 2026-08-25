const express = require('express');
const router = express.Router();
const ExcelRecoveryRun = require('../models/ExcelRecoveryRun');
const { buildEmergencyWorkbookBuffer } = require('../services/excelBackup');
const { buildRecoveryPreview, applyRecoveryRun, confirmationText } = require('../services/excelRecovery');

const excelBody = express.raw({
  type: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream'
  ],
  limit: '50mb'
});

router.get('/excel', async (req, res) => {
  try {
    const { buffer, manifest } = await buildEmergencyWorkbookBuffer();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="NEW_MONDAY_BACKUP_${stamp}.xlsx"`);
    res.setHeader('X-New-Monday-Workspaces', String(manifest.workspaces));
    res.setHeader('X-New-Monday-Boards', String(manifest.boards));
    res.setHeader('X-New-Monday-Items', String(manifest.items));
    res.setHeader('X-New-Monday-Backup-Schema', String(manifest.schemaVersion));
    res.send(Buffer.from(buffer));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/excel/manifest', async (req, res) => {
  try {
    const { manifest } = await buildEmergencyWorkbookBuffer();
    res.json({
      ...manifest,
      mondayReadOnly: true,
      policy: 'Backup is generated from New Monday data and never writes to Monday.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload the edited .xlsx as the raw request body. This route ONLY previews.
// It never changes New Monday data and it never writes to Monday.
router.post('/excel/recovery/preview', excelBody, async (req, res) => {
  try {
    if (!Buffer.isBuffer(req.body) || !req.body.length) {
      return res.status(400).json({ error: 'Send the .xlsx file as the raw request body.' });
    }
    const sourceFilename = String(req.get('X-File-Name') || '').slice(0, 240);
    const preview = await buildRecoveryPreview(req.body, { sourceFilename });
    res.status(preview.status === 'blocked' ? 409 : 200).json({
      ...preview,
      productionChanged: false,
      policy: 'Preview only. Monday is never modified.'
    });
  } catch (err) {
    res.status(400).json({
      error: err.message,
      productionChanged: false,
      readOnlyMonday: true,
      mondayWriteOperations: 0
    });
  }
});

router.get('/excel/recovery/runs/:runId', async (req, res) => {
  try {
    const run = await ExcelRecoveryRun.findById(req.params.runId).lean();
    if (!run) return res.status(404).json({ error: 'Excel recovery run not found' });
    res.json({
      ...run,
      confirmationRequired: run.status === 'previewed' ? confirmationText(run._id) : null,
      readOnlyMonday: true,
      mondayWriteOperations: 0
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Applying requires the exact run-specific confirmation string returned by preview.
// Writes are transactionally limited to New Monday's MongoDB.
router.post('/excel/recovery/runs/:runId/apply', async (req, res) => {
  try {
    const result = await applyRecoveryRun(req.params.runId, req.body?.confirmation);
    res.json({
      ...result,
      policy: 'Recovery applied only to New Monday. Monday original received zero writes.'
    });
  } catch (err) {
    res.status(409).json({
      error: err.message,
      readOnlyMonday: true,
      mondayWriteOperations: 0
    });
  }
});

module.exports = router;
