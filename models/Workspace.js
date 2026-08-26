const mongoose = require('mongoose');

const folderSchema = new mongoose.Schema({
  id: { type: String, required: true },
  title: { type: String, required: true },
  order: { type: Number, default: 0 },
  archived: { type: Boolean, default: false }
}, { _id: false });

const workspaceSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  mondayId: { type: String, index: true, sparse: true, unique: true },
  description: { type: String, default: '' },
  kind: { type: String, default: 'open' },
  classification: {
    type: String,
    enum: ['film', 'operations', 'template', 'technical', 'unknown'],
    default: 'unknown'
  },
  order: { type: Number, default: 0 },
  folders: { type: [folderSchema], default: [] },
  archived: { type: Boolean, default: false },
  source: { type: String, enum: ['local', 'monday-import'], default: 'local' },
  sourceReadOnly: { type: Boolean, default: false },
  originMeta: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

module.exports = mongoose.model('Workspace', workspaceSchema);
