const mongoose = require('mongoose');

const crewSchema = new mongoose.Schema({
  name: { type: String, required: true },
  role: String,
  prefix: String,
  phone: String,
  email: String,
  timezone: String,
  order: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('CrewMember', crewSchema);
