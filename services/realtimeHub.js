const clients = new Set();
let sequence = 0;

function serializeEvent(event) {
  const payload = {
    id: ++sequence,
    at: new Date().toISOString(),
    ...event
  };
  return `id: ${payload.id}\nevent: change\ndata: ${JSON.stringify(payload)}\n\n`;
}

function realtimeScope(event = {}) {
  const requested = String(event.scope || '').trim().toLowerCase();
  if (['board', 'workspace', 'global'].includes(requested)) return requested;
  if (event.board) return 'board';
  if (event.workspace) return 'workspace';
  return '';
}

function addRealtimeClient(res) {
  clients.add(res);
  return () => clients.delete(res);
}

function publishRealtimeChange(event) {
  if (!event) return 0;
  const scope = realtimeScope(event);
  if (!scope) return 0;
  if (scope === 'board' && !event.board) return 0;
  if (scope === 'workspace' && !event.workspace) return 0;

  const frame = serializeEvent({
    scope,
    board: event.board ? String(event.board) : null,
    workspace: event.workspace ? String(event.workspace) : null,
    item: event.item ? String(event.item) : null,
    type: String(event.type || 'change'),
    field: String(event.field || ''),
    message: String(event.message || ''),
    meta: event.meta && typeof event.meta === 'object' ? event.meta : {}
  });

  let delivered = 0;
  for (const res of [...clients]) {
    try {
      res.write(frame);
      delivered += 1;
    } catch {
      clients.delete(res);
    }
  }
  return delivered;
}

function realtimeClientCount() {
  return clients.size;
}

function resetRealtimeHubForTests() {
  clients.clear();
  sequence = 0;
}

module.exports = {
  addRealtimeClient,
  publishRealtimeChange,
  realtimeClientCount,
  realtimeScope,
  resetRealtimeHubForTests,
  serializeEvent
};
