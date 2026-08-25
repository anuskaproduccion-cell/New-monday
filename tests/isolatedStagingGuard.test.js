const assert = require('assert');
const {
  BASELINE,
  STAGING_THROTTLED_EXIT_CODE,
  databaseNameFromMongoUri,
  normalizedMongoTarget,
  assertIsolatedStagingEnvironment,
  baselineDiff,
  isRateLimitError,
  exitCodeForStagingError
} = require('../scripts/runIsolatedMondayStaging');

assert.strictEqual(
  databaseNameFromMongoUri('mongodb+srv://user:pass@example.mongodb.net/new-monday-staging?retryWrites=true&w=majority'),
  'new-monday-staging'
);

assert.deepStrictEqual(
  normalizedMongoTarget('mongodb+srv://user:pass@Cluster0.Example.mongodb.net/New-Monday-Staging?retryWrites=true'),
  {
    protocol: 'mongodb+srv:',
    host: 'cluster0.example.mongodb.net',
    databaseName: 'new-monday-staging'
  }
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

assert.throws(
  () => assertIsolatedStagingEnvironment({
    MONGODB_URI: 'mongodb+srv://u:p@example.mongodb.net/new-monday-staging?retryWrites=true',
    MONGODB_STAGING_URI: 'mongodb+srv://u:p@example.mongodb.net/new-monday-staging?retryWrites=false',
    MONDAY_API_TOKEN: 'read-token'
  }),
  /same MongoDB database as production/i
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

assert.strictEqual(isRateLimitError(new Error('Monday read returned a non-JSON response (HTTP 429)')), true);
assert.strictEqual(isRateLimitError(new Error('RATE_LIMIT_EXCEEDED')), true);
assert.strictEqual(isRateLimitError(new Error('STAGING audit failed')), false);
assert.strictEqual(exitCodeForStagingError(new Error('HTTP 429')), STAGING_THROTTLED_EXIT_CODE);
assert.strictEqual(exitCodeForStagingError(new Error('schema mismatch')), 1);

console.log('isolatedStagingGuard tests passed');
