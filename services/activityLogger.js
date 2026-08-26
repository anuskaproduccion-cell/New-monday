const ActivityEvent = require('../models/ActivityEvent');
const { publishRealtimeChange } = require('./realtimeHub');

async function logActivity({ board, item = null, type, field = '', message, actor = 'New Monday', meta = {} }) {
  if (!board || !type || !message) return null;
  try {
    const created = await ActivityEvent.create({ board, item, type, field, message, actor, meta });
    publishRealtimeChange({ board, item, type, field, message, meta });
    return created;
  } catch (error) {
    // Activity history must never block the user operation that produced it.
    console.warn('Activity log warning:', error.message);
    return null;
  }
}

module.exports = { logActivity };
