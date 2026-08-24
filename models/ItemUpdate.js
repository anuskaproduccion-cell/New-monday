const mongoose = require('mongoose');

const replySchema = new mongoose.Schema({
  body: { type: String, required: true },
  author: { type: String, default: 'New Monday' },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const itemUpdateSchema = new mongoose.Schema({
  board: { type: mongoose.Schema.Types.ObjectId, ref: 'Board', required: true, index: true },
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true, index: true },
  body: { type: String, required: true },
  author: { type: String, default: 'New Monday' },
  replies: { type: [replySchema], default: [] },
  archived: { type: Boolean, default: false }
}, { timestamps: true });

itemUpdateSchema.index({ item: 1, archived: 1, createdAt: -1 });

module.exports = mongoose.model('ItemUpdate', itemUpdateSchema);
