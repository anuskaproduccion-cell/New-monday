const mongoose = require('mongoose');

const subitemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  owner: String,
  status: { type: String, default: '' },
  date: Date
}, { _id: true });

const itemSchema = new mongoose.Schema({
  board: { type: mongoose.Schema.Types.ObjectId, ref: 'Board', required: true },

  // Stable group identity for v2. Legacy group name is kept during migration.
  groupId: { type: String, default: '' },
  group: { type: String, required: true },
  groupColor: { type: String, default: '#579bfc' },

  name: { type: String, required: true },
  order: { type: Number, default: 0 },

  // Dynamic Monday-compatible values keyed by board column id.
  columnValues: { type: mongoose.Schema.Types.Mixed, default: {} },

  mondayId: { type: String, index: true, sparse: true, unique: true },
  source: { type: String, enum: ['local', 'monday-import'], default: 'local' },
  sourceReadOnly: { type: Boolean, default: false },

  parentItem: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null },
  parentMondayId: { type: String, default: null },
  mondaySubitemBoardId: { type: String, default: null },
  isSubitem: { type: Boolean, default: false },

  archived: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
  originMeta: { type: mongoose.Schema.Types.Mixed, default: {} },

  // Legacy v1 fields. They remain until the dynamic frontend is fully promoted.
  person: String,
  status: { type: String, default: '' },
  statusColor: { type: String, default: '' },
  startDate: Date,
  endDate: Date,
  dependency: String,
  formula: { type: Number, default: 0 },
  notes: String,
  subitems: [subitemSchema],
  extraFields: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

itemSchema.index({ board: 1, groupId: 1, order: 1 });
itemSchema.index({ board: 1, archived: 1, deletedAt: 1 });

module.exports = mongoose.model('Item', itemSchema);
