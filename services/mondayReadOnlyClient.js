const MONDAY_API_URL = 'https://api.monday.com/v2';

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_BASE_DELAY_MS = 1000;
const DEFAULT_MAX_DELAY_MS = 20000;

function assertReadOnlyDocument(document) {
  if (typeof document !== 'string' || !document.trim()) {
    throw new Error('A GraphQL query document is required');
  }

  // Absolute project rule: New Monday must NEVER write to Monday.
  // This client intentionally exposes queries only and rejects any mutation keyword.
  if (/\bmutation\b/i.test(document)) {
    throw new Error('Blocked by policy: Monday is read-only and GraphQL mutations are forbidden');
  }
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function getHeader(response, name) {
  if (!response?.headers) return null;
  if (typeof response.headers.get === 'function') return response.headers.get(name);
  const wanted = String(name).toLowerCase();
  for (const [key, value] of Object.entries(response.headers)) {
    if (String(key).toLowerCase() === wanted) return value;
  }
  return null;
}

function retryAfterMs(response, payload) {
  const retryAfter = getHeader(response, 'retry-after');
  if (retryAfter) {
    const numericSeconds = Number(retryAfter);
    if (Number.isFinite(numericSeconds) && numericSeconds >= 0) return numericSeconds * 1000;
    const retryDate = Date.parse(retryAfter);
    if (Number.isFinite(retryDate)) return Math.max(0, retryDate - Date.now());
  }

  const candidates = [
    payload?.retry_in_seconds,
    payload?.extensions?.retry_in_seconds,
    ...(payload?.errors || []).map(error => error?.extensions?.retry_in_seconds)
  ];
  for (const value of candidates) {
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  }
  return null;
}

function graphqlErrorCodes(payload) {
  return (payload?.errors || [])
    .map(error => error?.extensions?.code)
    .filter(Boolean)
    .map(code => String(code).toUpperCase());
}

function isDailyLimitError(payload) {
  return graphqlErrorCodes(payload).some(code => code === 'DAILY_LIMIT_EXCEEDED');
}

function isTransientGraphQLError(payload) {
  const transientCodes = new Set([
    'RATE_LIMIT_EXCEEDED',
    'COMPLEXITY_BUDGET_EXHAUSTED',
    'INTERNAL_SERVER_ERROR',
    'SERVICE_UNAVAILABLE',
    'TEMPORARILY_UNAVAILABLE',
    'TIMEOUT',
    'GATEWAY_TIMEOUT'
  ]);
  return graphqlErrorCodes(payload).some(code => transientCodes.has(code));
}

function isRetryableHttpStatus(status) {
  return status === 408 || status === 425 || status === 429 || (status >= 500 && status <= 599);
}

function backoffDelayMs(attempt, baseDelayMs, maxDelayMs) {
  return Math.min(maxDelayMs, baseDelayMs * (2 ** Math.max(0, attempt - 1)));
}

function retryPlan({ attempt, response, payload, baseDelayMs, maxDelayMs }) {
  const requestedDelay = retryAfterMs(response, payload);
  if (requestedDelay != null) {
    if (requestedDelay > maxDelayMs) {
      return {
        retry: false,
        delayMs: requestedDelay,
        reason: `server requested ${Math.ceil(requestedDelay / 1000)}s wait, above safe CI retry cap`
      };
    }
    return { retry: true, delayMs: requestedDelay, reason: 'server retry hint' };
  }
  return {
    retry: true,
    delayMs: backoffDelayMs(attempt, baseDelayMs, maxDelayMs),
    reason: 'exponential backoff'
  };
}

async function mondayQuery(document, variables = {}, options = {}) {
  assertReadOnlyDocument(document);

  const token = options.token || process.env.MONDAY_API_TOKEN;
  if (!token) throw new Error('MONDAY_API_TOKEN is not configured');

  const fetchImpl = options.fetchImpl || global.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required');

  const sleepImpl = options.sleepImpl || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const maxAttempts = Math.max(1, Math.floor(positiveNumber(options.maxAttempts || process.env.MONDAY_READ_MAX_ATTEMPTS, DEFAULT_MAX_ATTEMPTS)));
  const timeoutMs = positiveNumber(options.timeoutMs || process.env.MONDAY_READ_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const baseDelayMs = positiveNumber(options.baseDelayMs || process.env.MONDAY_READ_BASE_DELAY_MS, DEFAULT_BASE_DELAY_MS);
  const maxDelayMs = positiveNumber(options.maxDelayMs || process.env.MONDAY_READ_MAX_DELAY_MS, DEFAULT_MAX_DELAY_MS);

  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    let response;
    try {
      response = await fetchImpl(MONDAY_API_URL, {
        method: 'POST',
        headers: {
          Authorization: token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: document, variables }),
        signal: controller?.signal
      });
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts) break;
      const delayMs = backoffDelayMs(attempt, baseDelayMs, maxDelayMs);
      console.warn(`[Monday read-only] transient network failure; retry ${attempt + 1}/${maxAttempts} in ${delayMs}ms`);
      await sleepImpl(delayMs);
      continue;
    } finally {
      if (timeout) clearTimeout(timeout);
    }

    let raw = '';
    let payload = null;
    try {
      raw = await response.text();
      payload = raw ? JSON.parse(raw) : {};
    } catch (error) {
      lastError = error;
      const canRetry = response.ok || isRetryableHttpStatus(response.status);
      if (canRetry && attempt < maxAttempts) {
        const plan = retryPlan({ attempt, response, payload: null, baseDelayMs, maxDelayMs });
        if (plan.retry) {
          console.warn(`[Monday read-only] non-JSON response (HTTP ${response.status}); retry ${attempt + 1}/${maxAttempts} in ${plan.delayMs}ms`);
          await sleepImpl(plan.delayMs);
          continue;
        }
      }
      throw new Error(`Monday read returned a non-JSON response (HTTP ${response.status})`);
    }

    if (isDailyLimitError(payload)) {
      const waitMs = retryAfterMs(response, payload);
      const suffix = waitMs == null ? '' : `; retry available in about ${Math.ceil(waitMs / 1000)}s`;
      throw new Error(`Monday read blocked by DAILY_LIMIT_EXCEEDED${suffix}`);
    }

    if (!response.ok) {
      if (isRetryableHttpStatus(response.status) && attempt < maxAttempts) {
        const plan = retryPlan({ attempt, response, payload, baseDelayMs, maxDelayMs });
        if (plan.retry) {
          console.warn(`[Monday read-only] HTTP ${response.status}; retry ${attempt + 1}/${maxAttempts} in ${plan.delayMs}ms`);
          await sleepImpl(plan.delayMs);
          continue;
        }
        throw new Error(`Monday read throttled: ${plan.reason}`);
      }
      throw new Error(`Monday read failed with HTTP ${response.status}`);
    }

    if (payload.errors?.length) {
      if (isTransientGraphQLError(payload) && attempt < maxAttempts) {
        const plan = retryPlan({ attempt, response, payload, baseDelayMs, maxDelayMs });
        if (plan.retry) {
          console.warn(`[Monday read-only] transient GraphQL error; retry ${attempt + 1}/${maxAttempts} in ${plan.delayMs}ms`);
          await sleepImpl(plan.delayMs);
          continue;
        }
        throw new Error(`Monday read throttled: ${plan.reason}`);
      }
      throw new Error(payload.errors.map(error => error.message).join('; '));
    }

    return payload.data;
  }

  const detail = lastError?.name === 'AbortError' ? 'request timeout' : (lastError?.message || 'network failure');
  throw new Error(`Monday read failed after ${maxAttempts} attempts: ${detail}`);
}

function mergeWorkspacesWithBoardReferences(workspaces = [], boards = []) {
  const byId = new Map();
  const merged = [];

  for (const workspace of workspaces || []) {
    if (!workspace?.id) continue;
    const normalized = {
      ...workspace,
      id: String(workspace.id),
      discoveredFromBoardReference: false
    };
    if (!byId.has(normalized.id)) {
      byId.set(normalized.id, normalized);
      merged.push(normalized);
    }
  }

  // Monday's workspaces query can omit technical/template workspaces that are
  // nevertheless referenced by accessible boards. Those references are part of
  // the source hierarchy and must be preserved so imported boards are never
  // orphaned in New Monday.
  for (const board of boards || []) {
    const workspace = board?.workspace;
    if (!workspace?.id) continue;
    const id = String(workspace.id);
    if (byId.has(id)) continue;

    const discovered = {
      id,
      name: workspace.name || `Workspace ${id}`,
      description: '',
      kind: 'open',
      discoveredFromBoardReference: true
    };
    byId.set(id, discovered);
    merged.push(discovered);
  }

  return merged;
}

async function getAccountInventory() {
  const workspacesData = await mondayQuery(`
    query ReadWorkspaces {
      workspaces(limit: 100) {
        id
        name
        description
        kind
      }
    }
  `);

  const boards = [];
  let page = 1;
  while (true) {
    const data = await mondayQuery(`
      query ReadBoards($page: Int!) {
        boards(limit: 100, page: $page) {
          id
          name
          state
          board_kind
          workspace { id name }
          groups { id title color }
          columns { id title description type settings_str }
          views { id name type }
        }
      }
    `, { page });

    const batch = data.boards || [];
    boards.push(...batch);
    if (batch.length < 100) break;
    page += 1;
    if (page > 100) throw new Error('Monday board pagination safety limit reached');
  }

  const workspaces = mergeWorkspacesWithBoardReferences(workspacesData.workspaces || [], boards);
  const visibleBoards = boards.filter(board => !board.name.startsWith('Subelementos de '));
  const internalSubitemBoards = boards.filter(board => board.name.startsWith('Subelementos de '));

  return {
    workspaces,
    boards,
    visibleBoards,
    internalSubitemBoards,
    counts: {
      workspaces: workspaces.length,
      boards: boards.length,
      visibleBoards: visibleBoards.length,
      internalSubitemBoards: internalSubitemBoards.length
    }
  };
}

async function getBoardSnapshot(mondayBoardId) {
  const boardIds = [String(mondayBoardId)];
  const metadataData = await mondayQuery(`
    query ReadBoardMetadata($boardIds: [ID!]) {
      boards(ids: $boardIds) {
        id
        name
        description
        state
        board_kind
        updated_at
        workspace { id name }
        groups { id title color }
        columns { id title description type settings_str }
        views { id name type }
      }
    }
  `, { boardIds });

  const board = metadataData.boards?.[0];
  if (!board) throw new Error(`Monday board ${mondayBoardId} not found`);

  const items = [];
  let cursor = null;
  let page = 0;
  do {
    const data = await mondayQuery(`
      query ReadBoardItems($boardIds: [ID!], $cursor: String) {
        boards(ids: $boardIds) {
          items_page(limit: 100, cursor: $cursor) {
            cursor
            items {
              id
              name
              created_at
              updated_at
              group { id title color }
              column_values {
                id
                type
                text
                value
                ... on DependencyValue {
                  linked_items { id name board { id name } }
                }
                ... on BoardRelationValue {
                  linked_items { id name board { id name } }
                }
                ... on FormulaValue { display_value }
                ... on MirrorValue { display_value }
                ... on FileValue {
                  files {
                    ... on FileAssetValue {
                      asset_id
                      name
                      is_image
                      created_at
                      asset {
                        id
                        name
                        file_extension
                        file_size
                        url
                      }
                    }
                    ... on FileLinkValue {
                      file_id
                      name
                      url
                      kind
                      created_at
                    }
                    ... on FileDocValue {
                      file_id
                      object_id
                      url
                      created_at
                    }
                  }
                }
              }
              subitems {
                id
                name
                created_at
                updated_at
                column_values {
                  id
                  type
                  text
                  value
                  ... on DependencyValue {
                    linked_items { id name board { id name } }
                  }
                  ... on BoardRelationValue {
                    linked_items { id name board { id name } }
                  }
                  ... on FormulaValue { display_value }
                  ... on MirrorValue { display_value }
                  ... on FileValue {
                    files {
                      ... on FileAssetValue {
                        asset_id
                        name
                        is_image
                        created_at
                        asset {
                          id
                          name
                          file_extension
                          file_size
                          url
                        }
                      }
                      ... on FileLinkValue {
                        file_id
                        name
                        url
                        kind
                        created_at
                      }
                      ... on FileDocValue {
                        file_id
                        object_id
                        url
                        created_at
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `, { boardIds, cursor });

    const itemsPage = data.boards?.[0]?.items_page;
    if (!itemsPage) break;
    items.push(...(itemsPage.items || []));
    cursor = itemsPage.cursor || null;
    page += 1;
    if (page > 1000) throw new Error('Monday item pagination safety limit reached');
  } while (cursor);

  return {
    readOnly: true,
    board,
    items,
    counts: {
      items: items.length,
      subitems: items.reduce((sum, item) => sum + (item.subitems?.length || 0), 0)
    }
  };
}

module.exports = {
  mondayQuery,
  getAccountInventory,
  getBoardSnapshot,
  mergeWorkspacesWithBoardReferences,
  assertReadOnlyDocument,
  retryAfterMs,
  graphqlErrorCodes,
  isDailyLimitError,
  isTransientGraphQLError,
  isRetryableHttpStatus,
  backoffDelayMs
};
