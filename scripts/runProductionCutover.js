const {
  BASELINE,
  PREPARE_CONFIRMATION,
  PROMOTE_CONFIRMATION
} = require('../routes/cutover');

const EXPECTED_PRODUCTION_ITEMS = BASELINE.items + BASELINE.subitems;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function parseResponse(response) {
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text.slice(0, 300) }; }
  return payload;
}

async function requestJson(url, { method = 'GET', token, body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { 'X-Monday-Read-Token': token } : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60000)
  });
  const payload = await parseResponse(response);
  return { response, payload };
}

async function waitForPublishedV2(baseUrl, { attempts = 180, delayMs = 5000 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const { response, payload } = await requestJson(`${baseUrl}/api/health`);
      if (response.ok && payload.ok === true && payload.authenticationRequired === true) return payload;
    } catch (error) {
      if (attempt === attempts) throw error;
    }
    if (attempt < attempts) await sleep(delayMs);
  }
  throw new Error('Timed out waiting for protected New Monday v2 deployment');
}

function auditSummary(payload = {}) {
  return {
    runId: payload.runId || null,
    status: payload.status || null,
    baselineOk: payload.baselineOk,
    auditOk: payload.audit?.ok,
    sourceCounts: payload.sourceCounts || {},
    stagedCounts: payload.stagedCounts || {},
    fingerprintAudit: payload.audit?.fingerprints || null,
    promotionReady: payload.promotionPreview?.ready,
    conflicts: payload.promotionPreview?.conflicts?.length,
    deletesPlanned: payload.promotionPreview?.deletesPlanned,
    mondayReadOnly: payload.readOnlyMonday === true,
    mondayMutations: 0,
    productionDeletes: 0
  };
}

function assertCompletedAudit(payload) {
  if (payload.status !== 'completed') throw new Error(`Cutover staging ended with status ${payload.status}`);
  if (payload.baselineOk !== true) throw new Error(`Cutover staging baseline does not match the accepted Monday inventory: ${JSON.stringify(auditSummary(payload))}`);
  if (payload.audit?.ok !== true) throw new Error(`Cutover staging audit is not green: ${JSON.stringify(auditSummary(payload))}`);
  if (payload.promotionPreview?.ready !== true) throw new Error(`Cutover promotion preview is not ready: ${JSON.stringify(auditSummary(payload))}`);
  if (payload.promotionPreview?.deletesPlanned !== 0) throw new Error('Cutover unexpectedly planned deletes');
  if ((payload.promotionPreview?.conflicts || []).length !== 0) throw new Error('Cutover preview has conflicts');
}

async function pollCutover(baseUrl, runId, { attempts = 240, delayMs = 10000 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const { response, payload } = await requestJson(`${baseUrl}/api/cutover/runs/${runId}`);
    if (!response.ok) throw new Error(payload.error || `Cutover status failed with HTTP ${response.status}`);
    if (payload.status === 'completed') {
      console.log(`CUTOVER_AUDIT_SUMMARY=${JSON.stringify(auditSummary(payload))}`);
      assertCompletedAudit(payload);
      return payload;
    }
    if (payload.status === 'failed' || payload.status === 'cancelled') {
      throw new Error(payload.error || `Cutover staging ${payload.status}`);
    }
    if (attempt < attempts) await sleep(delayMs);
  }
  throw new Error('Timed out waiting for production cutover staging audit');
}

async function runProductionCutover(env = process.env) {
  const baseUrl = String(env.NEW_MONDAY_PUBLISHED_URL || 'https://new-monday.onrender.com').replace(/\/$/, '');
  const token = String(env.MONDAY_API_TOKEN || '');
  if (token.length < 20) throw new Error('MONDAY_API_TOKEN is required for the production cutover');

  await waitForPublishedV2(baseUrl);

  const start = await requestJson(`${baseUrl}/api/cutover/from-monday/start`, {
    method: 'POST',
    token,
    body: { confirmation: PREPARE_CONFIRMATION }
  });

  let runId = start.payload.runId;
  if (!start.response.ok) {
    if (start.response.status !== 409 || !runId) {
      throw new Error(start.payload.error || `Cutover start failed with HTTP ${start.response.status}`);
    }
  }
  if (!runId) throw new Error('Cutover start did not return a runId');
  console.log(`CUTOVER_RUN_ID=${runId}`);

  const audited = await pollCutover(baseUrl, runId);

  const promoted = await requestJson(`${baseUrl}/api/cutover/runs/${runId}/promote`, {
    method: 'POST',
    token,
    body: { confirmation: PROMOTE_CONFIRMATION }
  });
  if (!promoted.response.ok) {
    throw new Error(promoted.payload.error || `Production promotion failed with HTTP ${promoted.response.status}`);
  }

  const counts = promoted.payload.productionCounts || {};
  if (
    promoted.payload.status !== 'published-data-ready'
    || Number(counts.workspaces) !== BASELINE.workspaces
    || Number(counts.boards) !== BASELINE.boards
    || Number(counts.items) !== EXPECTED_PRODUCTION_ITEMS
  ) {
    throw new Error(`Final production counts are not valid: ${JSON.stringify(counts)}`);
  }

  const result = {
    status: 'passed',
    runId,
    mondayReadOnly: true,
    mondayMutations: 0,
    productionDeletes: 0,
    sourceCounts: audited.sourceCounts,
    stagedCounts: audited.stagedCounts,
    productionCounts: counts
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (require.main === module) {
  runProductionCutover().catch(error => {
    console.error(`Production cutover failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  EXPECTED_PRODUCTION_ITEMS,
  auditSummary,
  assertCompletedAudit,
  runProductionCutover
};
