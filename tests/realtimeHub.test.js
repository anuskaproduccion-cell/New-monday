const assert = require('assert');
const {
  addRealtimeClient,
  publishRealtimeChange,
  realtimeClientCount,
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
assert.ok(frames[0].includes('"board":"board-123"'));
assert.ok(frames[0].includes('"item":"item-456"'));
assert.ok(frames[0].includes('"field":"status"'));

const direct = serializeEvent({ board: 'x', type: 'test' });
assert.ok(/^id: \d+\nevent: change\ndata: /.test(direct));
assert.ok(direct.endsWith('\n\n'));

remove();
assert.strictEqual(realtimeClientCount(), 0);
assert.strictEqual(publishRealtimeChange({ board: 'board-123', type: 'after_remove' }), 0);
assert.strictEqual(publishRealtimeChange({ type: 'missing_board' }), 0);
resetRealtimeHubForTests();

console.log('realtimeHub.test.js passed');
