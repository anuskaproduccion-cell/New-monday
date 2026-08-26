const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ActivityEvent = require('../models/ActivityEvent');
const {
  addRealtimeClient,
  realtimeClientCount,
  resetRealtimeHubForTests
} = require('../services/realtimeHub');
const { runWithRequestContext } = require('../services/requestContext');

const originalCreate = ActivityEvent.create;

(async () => {
  let removeOwn = null;
  let removePeer = null;
  try {
    const realtimeRouteSource = fs.readFileSync(path.join(__dirname, '..', 'routes', 'realtime.js'), 'utf8');
    assert.ok(
      realtimeRouteSource.includes("normalizeClientId(req.query.clientId || '')"),
      'SSE route must register the ephemeral client id sent in the stream query'
    );

    let createdPayload = null;
    ActivityEvent.create = async payload => {
      await Promise.resolve();
      createdPayload = payload;
      return { _id: 'activity-1', ...payload };
    };

    delete require.cache[require.resolve('../services/activityLogger')];
    const { logActivity } = require('../services/activityLogger');

    resetRealtimeHubForTests();
    const ownFrames = [];
    const peerFrames = [];
    removeOwn = addRealtimeClient({ write(frame) { ownFrames.push(frame); } }, { clientId: 'client-a' });
    removePeer = addRealtimeClient({ write(frame) { peerFrames.push(frame); } }, { clientId: 'client-b' });
    assert.strictEqual(realtimeClientCount(), 2);

    const created = await runWithRequestContext({ clientId: 'client-a' }, async () => {
      await Promise.resolve();
      return logActivity({
        board: 'board-1',
        item: 'item-1',
        type: 'column_value_changed',
        field: 'status',
        message: 'Estado actualizado',
        meta: { columnId: 'status' }
      });
    });

    assert.strictEqual(created._id, 'activity-1');
    assert.strictEqual(createdPayload.board, 'board-1');
    assert.strictEqual(createdPayload.item, 'item-1');
    assert.strictEqual(ownFrames.length, 0, 'originating SSE session must not receive the activity echo after awaited persistence');
    assert.strictEqual(peerFrames.length, 1, 'peer session must receive the activity change after awaited persistence');
    assert.ok(peerFrames[0].includes('"board":"board-1"'));
    assert.ok(peerFrames[0].includes('"item":"item-1"'));
    assert.ok(!peerFrames[0].includes('client-a'), 'ephemeral client id must not leak into the SSE frame');

    const noOrigin = await logActivity({
      board: 'board-1',
      item: 'item-2',
      type: 'item_updated',
      message: 'Actualización sin origin id'
    });
    assert.strictEqual(noOrigin._id, 'activity-1');
    assert.strictEqual(ownFrames.length, 1, 'when a mutation intentionally omits the client id, its own session echo must remain available');
    assert.strictEqual(peerFrames.length, 2, 'peer session must still receive echo-required mutations');

    console.log('activity logger realtime origin propagation tests passed');
  } finally {
    removeOwn?.();
    removePeer?.();
    resetRealtimeHubForTests();
    ActivityEvent.create = originalCreate;
    delete require.cache[require.resolve('../services/activityLogger')];
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
