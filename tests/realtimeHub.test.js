const assert = require('assert');
const {
  addRealtimeClient,
  publishRealtimeChange,
  realtimeClientCount,
  realtimeScope,
  resetRealtimeHubForTests,
  serializeEvent
} = require('../services/realtimeHub');
const { runWithRequestContext } = require('../services/requestContext');

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
const ownFrames = [];
const peerFrames = [];
const removeOwn = addRealtimeClient({ write(frame) { ownFrames.push(frame); } }, { clientId: 'client-a' });
const removePeer = addRealtimeClient({ write(frame) { peerFrames.push(frame); } }, { clientId: 'client-b' });
assert.strictEqual(realtimeClientCount(), 2);

const peerOnlyDelivered = runWithRequestContext({ clientId: 'client-a' }, () => publishRealtimeChange({
  board: 'board-123',
  item: 'item-789',
  type: 'item_updated',
  message: 'Cambio originado en client-a'
}));
assert.strictEqual(peerOnlyDelivered, 1, 'originating SSE client must be excluded from its own mutation echo');
assert.strictEqual(ownFrames.length, 0, 'originating client must not receive its own realtime frame');
assert.strictEqual(peerFrames.length, 1, 'other sessions must still receive the realtime frame');
assert.ok(peerFrames[0].includes('"item":"item-789"'));
assert.strictEqual(peerFrames[0].includes('client-a'), false, 'ephemeral client id must not be exposed in the SSE payload');

const explicitOriginDelivered = publishRealtimeChange({
  board: 'board-123',
  item: 'item-999',
  type: 'item_updated',
  message: 'Explicit origin',
  originClientId: 'client-b'
});
assert.strictEqual(explicitOriginDelivered, 1);
assert.strictEqual(ownFrames.length, 1, 'client-a should receive events originated by client-b');
assert.strictEqual(peerFrames.length, 1, 'client-b should not receive its own explicit-origin event');

removeOwn();
removePeer();
resetRealtimeHubForTests();

console.log('realtimeHub.test.js passed');
