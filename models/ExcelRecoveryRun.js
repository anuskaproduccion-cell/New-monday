const mongoose = require('mongoose');

const excelRecoveryRunSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ['previewed', 'blocked', 'applying', 'applied', 'failed', 'cancelled'],
    default: 'previewed',
    index: true
  },
  schemaVersion: { type: Number, default: 2 },
  workbookFingerprint: { type: String, required: true, index: true },
  backupGeneratedAt: { type: Date, default: null },
  sourceFilename: { type: String, default: '' },
  readOnlyMonday: { type: Boolean, default: true },
  mondayWriteOperations: { type: Number, default: 0 },
  summary: { type: mongoose.Schema.Types.Mixed, default: {} },
  conflicts: { type: [mongoose.Schema.Types.Mixed], default: [] },
  warnings: { type: [mongoose.Schema.Types.Mixed], default: [] },
  operations: { type: [mongoose.Schema.Types.Mixed], default: [] },
  appliedAt: { type: Date, default: null },
  error: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('ExcelRecoveryRun', excelRecoveryRunSchema);
