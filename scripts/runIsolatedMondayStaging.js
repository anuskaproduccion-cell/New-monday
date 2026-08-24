const mongoose = require('mongoose');
const ImportRun = require('../models/ImportRun');
const { executeStagingImport } = require('../services/mondayStagingImporter');

const BASELINE = Object.freeze({
  workspaces: 17,
  boards: 103,
  visibleBoards: 55,
  internalSubitemBoards: 48,
  items: 1230,
  subitems: 413
});

const STAGING_THROTTLED_EXIT_CODE = 75;

function databaseNameFromMongoUri(uri) {
  try {
    const parsed = new URL(uri);
    return decodeURIComponent((parsed.pathname || '').replace(/^\//, '').split('/')[0] || '');
  } catch (error) {
    throw new Error('MongoDB URI is not valid');
  }
}

function normalizedMongoTarget(uri) {
  try {
    const parsed = new URL(uri);
    return {
      protocol: parsed.protocol.toLowerCase(),
      host: parsed.host.toLowerCase(),
      databaseName: databaseNameFromMongoUri(uri).toLowerCase()
    };
  } catch (error) {
    throw new Error('MongoDB URI is not valid');
  }
}

function assertIsolatedStagingEnvironment(env = process.env) {
  const stagingUri = env.MONGODB_STAGING_URI;
  if (!stagingUri) throw new Error('MONGODB_STAGING_URI is required');
  if (!env.MONDAY_API_TOKEN) throw new Error('MONDAY_API_TOKEN is required for read-only source queries');

  const stagingTarget = normalizedMongoTarget(stagingUri);
  const productionUri = env.MONGODB_URI;

  if (!stagingTarget.databaseName || !/(staging|test|sandbox)/i.test(stagingTarget.databaseName)) {
    throw new Error(`Safety block: isolated database name must contain staging/test/sandbox; received “${stagingTarget.databaseName || '(empty)'}”`);
  }

  if (productionUri) {
    const productionTarget = normalizedMongoTarget(productionUri);
    if (productionUri.trim() === stagingUri.trim()) {
      throw new Error('Safety block: staging URI is identical to the production MONGODB_URI');
    }
    if (
      productionTarget.protocol === stagingTarget.protocol
      && productionTarget.host === stagingTarget.host
      && productionTarget.databaseName === stagingTarget.databaseName
    ) {
      throw new Error('Safety block: staging resolves to the same MongoDB database as production');
    }
  }

  return { stagingUri, databaseName: stagingTarget.databaseName };
}

function baselineDiff(sourceCounts = {}) {
  const differences = [];
  for (const [key, expected] of Object.entries(BASELINE)) {
    const actual = Number(sourceCounts[key]);
    if (actual !== expected) differences.push({ key, expected, actual });
  }
  return differences;
}

function isRateLimitError(error) {
  const message = String(error?.message || error || '');
  return /(?:HTTP\s*429|RATE[_ -]?LIMIT|rate\s+limit|throttl|COMPLEXITY_BUDGET)/i.test(message);
}

function exitCodeForStagingError(error) {
  return isRateLimitError(error) ? STAGING_THROTTLED_EXIT_CODE : 1;
}

async function runIsolatedStaging(env = process.env) {
  const { stagingUri, databaseName } = assertIsolatedStagingEnvironment(env);
  await mongoose.connect(stagingUri);

  const run = await new ImportRun({
    status: 'queued',
    readOnlyMonday: true,
    policy: 'Monday is query-only. Mutations are forbidden. Isolated STAGING database only.'
  }).save();

  console.log(JSON.stringify({
    phase: 'start',
    runId: String(run._id),
    databaseName,
    mondayReadOnly: true,
    mondayMutations: 0,
    productionWrites: 0
  }));

  const completed = await executeStagingImport(run._id);
  const differences = baselineDiff(completed.sourceCounts || {});
  const result = {
    runId: String(completed._id),
    status: completed.status,
    databaseName,
    mondayReadOnly: completed.readOnlyMonday === true,
    mondayMutations: 0,
    productionWrites: 0,
    baseline: BASELINE,
    sourceCounts: completed.sourceCounts,
    stagedCounts: completed.stagedCounts,
    auditOk: completed.audit?.ok === true,
    baselineOk: differences.length === 0,
    baselineDifferences: differences,
    fingerprintAudit: completed.audit?.fingerprints || null
  };

  console.log(JSON.stringify(result, null, 2));

  if (completed.status !== 'completed') throw new Error(completed.error || 'STAGING import did not complete');
  if (completed.audit?.ok !== true) throw new Error('STAGING audit failed');
  if (differences.length) throw new Error(`Source baseline changed: ${JSON.stringify(differences)}`);
  return result;
}

async function main() {
  try {
    await runIsolatedStaging(process.env);
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}

if (require.main === module) {
  main().catch(error => {
    const throttled = isRateLimitError(error);
    if (throttled) {
      console.warn('Isolated STAGING paused by Monday read throttling:', error.message);
      console.log(JSON.stringify({
        phase: 'throttled',
        mondayReadOnly: true,
        mondayMutations: 0,
        productionWrites: 0,
        retryRequired: true
      }));
    } else {
      console.error('Isolated STAGING failed:', error.message);
    }
    process.exitCode = exitCodeForStagingError(error);
  });
}

module.exports = {
  BASELINE,
  STAGING_THROTTLED_EXIT_CODE,
  databaseNameFromMongoUri,
  normalizedMongoTarget,
  assertIsolatedStagingEnvironment,
  baselineDiff,
  isRateLimitError,
  exitCodeForStagingError,
  runIsolatedStaging,
  main
};
