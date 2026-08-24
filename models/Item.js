const mongoose = require('mongoose');

const subitemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  owner: String,
  status: { type: String, default: '' },
  date: Date
}, { _id: true });

const itemSchema = new mongoose.Schema({
  board: { type: mongoose.Schema.Types.ObjectId, ref: 'Board', required: true },
  group: { type: String, required: true },
  groupColor: { type: String, default: '#579bfc' },
  name: { type: String, required: true },
  person: String,
  status: { type: String, default: '' },
  statusColor: { type: String, default: '' },
  startDate: Date,
  endDate: Date,
  dependency: String,
  formula: { type: Number, default: 0 },
  notes: String,
  order: { type: Number, default: 0 },
  subitems: [subitemSchema],
  extraFields: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

module.exports = mongoose.model('Item', itemSchema);
