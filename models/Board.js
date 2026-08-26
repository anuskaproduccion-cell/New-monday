const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
  id: { type: String, required: true },
  title: { type: String, required: true },
  color: { type: String, default: '#579bfc' },
  order: { type: Number, default: 0 },
  archived: { type: Boolean, default: false }
}, { _id: false });

const columnSchema = new mongoose.Schema({
  id: { type: String, required: true },
  title: { type: String, required: true },
  type: { type: String, required: true },
  description: { type: String, default: '' },
  settings: { type: mongoose.Schema.Types.Mixed, default: {} },
  order: { type: Number, default: 0 },
  hidden: { type: Boolean, default: false },
  pinned: { type: Boolean, default: false }
}, { _id: false });

const viewSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  type: { type: String, default: 'table' },
  filter: { type: mongoose.Schema.Types.Mixed, default: null },
  sort: { type: mongoose.Schema.Types.Mixed, default: [] },
  settings: { type: mongoose.Schema.Types.Mixed, default: {} },
  order: { type: Number, default: 0 }
}, { _id: false });

const boardSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  icon: { type: String, default: '📋' },
  order: { type: Number, default: 0 },

  // Legacy field kept while v1 data is migrated.
  workspace: { type: String, default: 'GY_GUAYOTA' },
  workspaceRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', default: null },

  mondayId: { type: String, index: true, sparse: true, unique: true },
  source: { type: String, enum: ['local', 'monday-import'], default: 'local' },
  sourceReadOnly: { type: Boolean, default: false },

  groups: { type: [groupSchema], default: [] },
  columns: { type: [columnSchema], default: [] },
  views: { type: [viewSchema], default: [] },

  internal: { type: Boolean, default: false },
  technical: { type: Boolean, default: false },
  parentBoardMondayId: { type: String, default: null },
  archived: { type: Boolean, default: false },
  originMeta: { type: mongoose.Schema.Types.Mixed, default: {} }
}, {
  timestamps: true,
  // Preserve structurally meaningful empty settings imported from Monday, such
  // as Mirror displayed_column: {}, instead of letting Mongoose minimize them.
  minimize: false
});

module.exports = mongoose.model('Board', boardSchema);
