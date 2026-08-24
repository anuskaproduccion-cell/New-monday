const mongoose = require('mongoose');

const boardSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  icon: { type: String, default: '📋' },
  order: { type: Number, default: 0 },
  workspace: { type: String, default: 'GY_GUAYOTA' }
}, { timestamps: true });

module.exports = mongoose.model('Board', boardSchema);
