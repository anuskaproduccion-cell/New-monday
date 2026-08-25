const mongoose = require('mongoose');

const activityEventSchema = new mongoose.Schema({
  board: { type: mongoose.Schema.Types.ObjectId, ref: 'Board', required: true, index: true },
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null, index: true },
  type: { type: String, required: true },
  field: { type: String, default: '' },
  message: { type: String, required: true },
  actor: { type: String, default: 'New Monday' },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: { createdAt: true, updatedAt: false } });

activityEventSchema.index({ board: 1, createdAt: -1 });
activityEventSchema.index({ item: 1, createdAt: -1 });

module.exports = mongoose.model('ActivityEvent', activityEventSchema);
