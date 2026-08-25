const ActivityEvent = require('../models/ActivityEvent');

async function logActivity({ board, item = null, type, field = '', message, actor = 'New Monday', meta = {} }) {
  if (!board || !type || !message) return null;
  try {
    return await ActivityEvent.create({ board, item, type, field, message, actor, meta });
  } catch (error) {
    // Activity history must never block the user operation that produced it.
    console.warn('Activity log warning:', error.message);
    return null;
  }
}

module.exports = { logActivity };
