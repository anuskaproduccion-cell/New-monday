const assert = require('assert');
const bulkRouter = require('../routes/bulkItems');

const { MAX_BULK_ITEMS, normalizeIds, statusLabels } = bulkRouter;

assert.strictEqual(MAX_BULK_ITEMS, 500);
assert.deepStrictEqual(normalizeIds([' a ', 'b', 'a', '', null]), ['a', 'b']);
assert.deepStrictEqual(normalizeIds('a'), []);

assert.deepStrictEqual(
  statusLabels({ settings: { labels: [
    { label: 'Done', hex: '#00c875' },
    { name: 'Working', color: '#fdab3d' }
  ] } }),
  [
    { label: 'Done', color: '#00c875' },
    { label: 'Working', color: '#fdab3d' }
  ]
);

assert.deepStrictEqual(
  statusLabels({ settings: { labels: {
    0: 'Ready',
    1: { label: 'Blocked', hex: '#df2f4a' }
  } } }),
  [
    { label: 'Ready', color: '#c4c4c4' },
    { label: 'Blocked', color: '#df2f4a' }
  ]
);

assert.deepStrictEqual(statusLabels({}), []);

console.log('bulkItems tests passed');
