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

function databaseNameFromMongoUri(uri) {
  try {
    const parsed = new URL(uri);
    return decodeURIComponent((parsed.pathname || '').replace(/^\//, '').split('/')[0] || '');
  } catch (error) {
    throw new Error('MONGODB_STAGING_URI is not a valid MongoDB URI');
  }
}

function assertIsolatedStagingEnvironment(env = process.env) {
  const stagingUri = env.MONGODB_STAGING_URI;
  if (!stagingUri) throw new Error('MONGODB_STAGING_URI is required');
  if (!env.MONDAY_API_TOKEN) throw new Error('MONDAY_API_TOKEN is required for read-only source queries');

  const productionUri = env.MONGODB_URI;
  if (productionUri && productionUri.trim() === stagingUri.trim()) {
    throw new Error('Safety block: staging URI is identical to the production MONGODB_URI');
  }

  const databaseName = databaseNameFromMongoUri(stagingUri);
  if (!databaseName || !/(staging|test|sandbox)/i.test(databaseName)) {
    throw new Error(`Safety block: isolated database name must contain staging/test/sandbox; received “${databaseName || '(empty)'}”`);
  }

  return { stagingUri, databaseName };
}

function baselineDiff(sourceCounts = {}) {
  const differences = [];
  for (const [key, expected] of Object.entries(BASELINE)) {
    const actual = Number(sourceCounts[key]);
    if (actual !== expected) differences.push({ key, expected, actual });
  }
  return differences;
}

async function main() {
  const { stagingUri, databaseName } = assertIsolatedStagingEnvironment();
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
}

if (require.main === module) {
  main()
    .catch(error => {
      console.error('Isolated STAGING failed:', error.message);
      process.exitCode = 1;
    })
    .finally(async () => {
      await mongoose.disconnect().catch(() => {});
    });
}

module.exports = {
  BASELINE,
  databaseNameFromMongoUri,
  assertIsolatedStagingEnvironment,
  baselineDiff,
  main
};
