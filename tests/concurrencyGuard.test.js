const assert = require('assert');
const {
  parseExpectedUpdatedAt,
  buildVersionedItemQuery,
  timestampsEqual
} = require('../services/concurrencyGuard');

const stamp = '2026-08-26T09:00:00.123Z';
const parsed = parseExpectedUpdatedAt(stamp);
assert(parsed instanceof Date, 'valid timestamps must parse to Date');
assert.strictEqual(parsed.toISOString(), stamp);
assert.strictEqual(parseExpectedUpdatedAt('not-a-date'), null);
assert.strictEqual(parseExpectedUpdatedAt(null), null);

const query = buildVersionedItemQuery('item-1', stamp, { deletedAt: null });
assert.strictEqual(query._id, 'item-1');
assert.strictEqual(query.deletedAt, null);
assert.strictEqual(query.updatedAt.toISOString(), stamp);
assert.strictEqual(buildVersionedItemQuery('item-1', 'bad-value'), null);

assert.strictEqual(timestampsEqual(stamp, new Date(stamp)), true);
assert.strictEqual(timestampsEqual(stamp, '2026-08-26T09:00:00.124Z'), false);
assert.strictEqual(timestampsEqual(stamp, 'bad-value'), false);

console.log('concurrencyGuard.test.js: PASS');
