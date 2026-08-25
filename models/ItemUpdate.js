const mongoose = require('mongoose');

const attachmentSchema = new mongoose.Schema({
  id: { type: String, default: '' },
  name: { type: String, required: true },
  size: { type: Number, default: null },
  mimetype: { type: String, default: '' },
  url: { type: String, default: '' },
  source: { type: String, default: 'new-monday' }
}, { _id: false });

const replySchema = new mongoose.Schema({
  body: { type: String, default: '' },
  author: { type: String, default: 'New Monday' },
  attachments: { type: [attachmentSchema], default: [] },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const itemUpdateSchema = new mongoose.Schema({
  board: { type: mongoose.Schema.Types.ObjectId, ref: 'Board', required: true, index: true },
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true, index: true },
  body: { type: String, default: '' },
  author: { type: String, default: 'New Monday' },
  attachments: { type: [attachmentSchema], default: [] },
  replies: { type: [replySchema], default: [] },
  archived: { type: Boolean, default: false }
}, { timestamps: true });

itemUpdateSchema.index({ item: 1, archived: 1, createdAt: -1 });

module.exports = mongoose.model('ItemUpdate', itemUpdateSchema);
