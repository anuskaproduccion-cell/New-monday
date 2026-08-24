const mongoose = require('mongoose');

const stagingBoardSchema = new mongoose.Schema({
  importRun: { type: mongoose.Schema.Types.ObjectId, ref: 'ImportRun', required: true, index: true },
  mondayId: { type: String, required: true },
  workspaceMondayId: { type: String, default: null },
  workspaceName: { type: String, default: '' },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  state: { type: String, default: '' },
  boardKind: { type: String, default: '' },
  internal: { type: Boolean, default: false },
  groups: { type: [mongoose.Schema.Types.Mixed], default: [] },
  columns: { type: [mongoose.Schema.Types.Mixed], default: [] },
  views: { type: [mongoose.Schema.Types.Mixed], default: [] },
  sourceUpdatedAt: { type: Date, default: null },
  counts: { type: mongoose.Schema.Types.Mixed, default: {} },
  rawMeta: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

stagingBoardSchema.index({ importRun: 1, mondayId: 1 }, { unique: true });
stagingBoardSchema.index({ importRun: 1, workspaceMondayId: 1 });

module.exports = mongoose.model('StagingBoard', stagingBoardSchema);
