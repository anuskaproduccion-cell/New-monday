const mongoose = require('mongoose');

const stagingWorkspaceSchema = new mongoose.Schema({
  importRun: { type: mongoose.Schema.Types.ObjectId, ref: 'ImportRun', required: true, index: true },
  mondayId: { type: String, required: true },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  kind: { type: String, default: '' },
  order: { type: Number, default: 0 },
  rawMeta: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

stagingWorkspaceSchema.index({ importRun: 1, mondayId: 1 }, { unique: true });

module.exports = mongoose.model('StagingWorkspace', stagingWorkspaceSchema);
