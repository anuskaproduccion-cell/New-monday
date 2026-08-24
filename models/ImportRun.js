const mongoose = require('mongoose');

const importRunSchema = new mongoose.Schema({
  source: { type: String, enum: ['monday'], default: 'monday' },
  mode: { type: String, enum: ['staging'], default: 'staging' },
  status: { type: String, enum: ['queued', 'running', 'completed', 'failed', 'cancelled'], default: 'queued' },
  readOnlyMonday: { type: Boolean, default: true },
  policy: { type: String, default: 'Monday is query-only. Mutations are forbidden.' },
  startedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  sourceCounts: { type: mongoose.Schema.Types.Mixed, default: {} },
  stagedCounts: { type: mongoose.Schema.Types.Mixed, default: {} },
  audit: { type: mongoose.Schema.Types.Mixed, default: {} },
  progress: { type: mongoose.Schema.Types.Mixed, default: {} },
  error: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('ImportRun', importRunSchema);
