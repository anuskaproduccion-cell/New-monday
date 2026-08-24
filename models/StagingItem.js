const mongoose = require('mongoose');

const stagingItemSchema = new mongoose.Schema({
  importRun: { type: mongoose.Schema.Types.ObjectId, ref: 'ImportRun', required: true, index: true },
  boardMondayId: { type: String, required: true, index: true },
  mondayId: { type: String, required: true },
  parentMondayId: { type: String, default: null },
  isSubitem: { type: Boolean, default: false },
  name: { type: String, required: true },
  order: { type: Number, default: 0 },
  groupId: { type: String, default: '' },
  group: { type: String, default: '' },
  groupColor: { type: String, default: '#579bfc' },
  columnValues: { type: mongoose.Schema.Types.Mixed, default: {} },
  sourceMeta: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

stagingItemSchema.index({ importRun: 1, mondayId: 1 }, { unique: true });
stagingItemSchema.index({ importRun: 1, boardMondayId: 1, isSubitem: 1, order: 1 });

module.exports = mongoose.model('StagingItem', stagingItemSchema);
