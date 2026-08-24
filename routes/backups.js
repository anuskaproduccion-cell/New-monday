const express = require('express');
const router = express.Router();
const { buildEmergencyWorkbookBuffer } = require('../services/excelBackup');

router.get('/excel', async (req, res) => {
  try {
    const { buffer, manifest } = await buildEmergencyWorkbookBuffer();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="NEW_MONDAY_BACKUP_${stamp}.xlsx"`);
    res.setHeader('X-New-Monday-Workspaces', String(manifest.workspaces));
    res.setHeader('X-New-Monday-Boards', String(manifest.boards));
    res.setHeader('X-New-Monday-Items', String(manifest.items));
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

module.exports = router;
