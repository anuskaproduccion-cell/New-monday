const assert = require('assert');
const { fingerprint, boardDataFingerprint, boardSchemaPayload } = require('../services/stagingFingerprint');

assert.strictEqual(
  fingerprint({ b: 2, a: 1 }),
  fingerprint({ a: 1, b: 2 })
);

const schema = boardSchemaPayload({
  mondayId: '1',
  workspaceMondayId: '2',
  workspaceName: 'Film',
  name: 'POST',
  description: 'Postproduction',
  groups: [{ id: 'g1', title: 'Edit', color: '#fff', order: 0 }],
  columns: [{ id: 'status', title: 'Status', type: 'status', settings: { labels: { 1: 'Done' } }, order: 0 }],
  views: []
});
assert.strictEqual(schema.description, 'Postproduction');

const itemsA = [{
  mondayId: '10',
  boardMondayId: '1',
  name: 'Task',
  columnValues: { status: { type: 'status', label: 'Done' } },
  sourceMeta: { updatedAt: '2026-08-24' }
}];
const itemsB = JSON.parse(JSON.stringify(itemsA));
assert.strictEqual(boardDataFingerprint(itemsA), boardDataFingerprint(itemsB));
itemsB[0].columnValues.status.label = 'Working on it';
assert.notStrictEqual(boardDataFingerprint(itemsA), boardDataFingerprint(itemsB));

console.log('stagingFingerprint tests passed');
