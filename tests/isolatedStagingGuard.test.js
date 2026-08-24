const assert = require('assert');
const {
  BASELINE,
  databaseNameFromMongoUri,
  assertIsolatedStagingEnvironment,
  baselineDiff
} = require('../scripts/runIsolatedMondayStaging');

assert.strictEqual(
  databaseNameFromMongoUri('mongodb+srv://user:pass@example.mongodb.net/new-monday-staging?retryWrites=true'),
  'new-monday-staging'
);

assert.throws(
  () => assertIsolatedStagingEnvironment({
    MONGODB_STAGING_URI: 'mongodb+srv://u:p@example.mongodb.net/new-monday',
    MONDAY_API_TOKEN: 'read-token'
  }),
  /must contain staging\/test\/sandbox/i
);

assert.throws(
  () => assertIsolatedStagingEnvironment({
    MONGODB_URI: 'mongodb+srv://u:p@example.mongodb.net/new-monday-staging',
    MONGODB_STAGING_URI: 'mongodb+srv://u:p@example.mongodb.net/new-monday-staging',
    MONDAY_API_TOKEN: 'read-token'
  }),
  /identical to the production/i
);

assert.doesNotThrow(() => assertIsolatedStagingEnvironment({
  MONGODB_URI: 'mongodb+srv://u:p@example.mongodb.net/new-monday',
  MONGODB_STAGING_URI: 'mongodb+srv://u:p@example.mongodb.net/new-monday-staging',
  MONDAY_API_TOKEN: 'read-token'
}));

assert.deepStrictEqual(baselineDiff(BASELINE), []);
assert.deepStrictEqual(
  baselineDiff({ ...BASELINE, items: BASELINE.items + 1 }),
  [{ key: 'items', expected: BASELINE.items, actual: BASELINE.items + 1 }]
);

console.log('isolatedStagingGuard tests passed');
