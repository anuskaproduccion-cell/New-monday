const assert = require('assert');
const {
  addRealtimeClient,
  publishRealtimeChange,
  realtimeClientCount,
  realtimeScope,
  resetRealtimeHubForTests,
  serializeEvent
} = require('../services/realtimeHub');

resetRealtimeHubForTests();
const frames = [];
const fakeResponse = { write(frame) { frames.push(frame); } };
const remove = addRealtimeClient(fakeResponse);
assert.strictEqual(realtimeClientCount(), 1);

const delivered = publishRealtimeChange({
  board: 'board-123',
  item: 'item-456',
  type: 'column_value_changed',
  field: 'status',
  message: 'Estado actualizado',
  meta: { columnId: 'status' }
});
assert.strictEqual(delivered, 1);
assert.strictEqual(frames.length, 1);
assert.ok(frames[0].includes('event: change'));
assert.ok(frames[0].includes('"scope":"board"'));
assert.ok(frames[0].includes('"board":"board-123"'));
assert.ok(frames[0].includes('"item":"item-456"'));
assert.ok(frames[0].includes('"field":"status"'));

const workspaceDelivered = publishRealtimeChange({
  scope: 'workspace',
  workspace: 'workspace-1',
  type: 'workspace_folder_updated',
  message: 'Carpeta actualizada'
});
assert.strictEqual(workspaceDelivered, 1);
assert.ok(frames[1].includes('"scope":"workspace"'));
assert.ok(frames[1].includes('"workspace":"workspace-1"'));
assert.ok(frames[1].includes('"board":null'));

const globalDelivered = publishRealtimeChange({
  scope: 'global',
  type: 'workspace_created',
  message: 'Workspace creado'
});
assert.strictEqual(globalDelivered, 1);
assert.ok(frames[2].includes('"scope":"global"'));
assert.ok(frames[2].includes('"board":null'));

assert.strictEqual(realtimeScope({ board: 'b' }), 'board');
assert.strictEqual(realtimeScope({ workspace: 'w' }), 'workspace');
assert.strictEqual(realtimeScope({ scope: 'global' }), 'global');
assert.strictEqual(realtimeScope({}), '');

const direct = serializeEvent({ board: 'x', type: 'test' });
assert.ok(/^id: \d+\nevent: change\ndata: /.test(direct));
assert.ok(direct.endsWith('\n\n'));

remove();
assert.strictEqual(realtimeClientCount(), 0);
assert.strictEqual(publishRealtimeChange({ board: 'board-123', type: 'after_remove' }), 0);
assert.strictEqual(publishRealtimeChange({ type: 'missing_scope' }), 0);
assert.strictEqual(publishRealtimeChange({ scope: 'workspace', type: 'missing_workspace' }), 0);
resetRealtimeHubForTests();

console.log('realtimeHub.test.js passed');
