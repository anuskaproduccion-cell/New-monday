const DEFAULT_BASE_URL = 'https://new-monday.onrender.com';

async function getJson(url) {
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json', 'User-Agent': 'new-monday-readonly-audit' },
    signal: AbortSignal.timeout(30000)
  });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`Published New Monday returned non-JSON for ${url} (HTTP ${response.status})`);
  }
  if (!response.ok) throw new Error(`Published New Monday returned HTTP ${response.status} for ${url}`);
  return payload;
}

function idOf(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return String(value._id || value.id || '');
}

function summarizeBoards(boards, items) {
  const counts = new Map();
  for (const item of items) {
    const key = idOf(item.board);
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return boards.map(board => ({
    id: idOf(board),
    name: String(board.name || ''),
    workspace: board.workspaceRef?.name || board.workspace || '',
    mondayId: board.mondayId ? String(board.mondayId) : null,
    source: board.source || null,
    internal: Boolean(board.internal),
    archived: Boolean(board.archived),
    itemCount: counts.get(idOf(board)) || 0
  }));
}

async function auditPublishedNewMondayReadOnly(env = process.env) {
  const baseUrl = String(env.NEW_MONDAY_PUBLISHED_URL || DEFAULT_BASE_URL).replace(/\/$/, '');

  const health = await getJson(`${baseUrl}/api/health`);
  const [boards, items] = await Promise.all([
    getJson(`${baseUrl}/api/boards?includeInternal=true&includeArchived=true`),
    getJson(`${baseUrl}/api/items?includeSubitems=true&includeArchived=true&includeDeleted=true`)
  ]);

  if (!Array.isArray(boards) || !Array.isArray(items)) {
    throw new Error('Published API did not return board/item arrays');
  }

  const boardSummary = summarizeBoards(boards, items);
  const legacyBoards = boardSummary.filter(board => !board.mondayId);
  const mondayLinkedBoards = boardSummary.filter(board => board.mondayId);
  const legacyItems = items.filter(item => !item.mondayId);
  const mondayLinkedItems = items.filter(item => item.mondayId);

  const result = {
    status: 'completed',
    mode: 'read-only',
    baseUrl,
    healthOk: health?.ok === true,
    writesAttempted: 0,
    mondayMutations: 0,
    counts: {
      boards: boards.length,
      items: items.length,
      legacyBoards: legacyBoards.length,
      mondayLinkedBoards: mondayLinkedBoards.length,
      legacyItems: legacyItems.length,
      mondayLinkedItems: mondayLinkedItems.length
    },
    legacyBoards: legacyBoards.map(({ id, ...board }) => board),
    mondayLinkedBoards: mondayLinkedBoards.map(({ id, ...board }) => board)
  };

  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (require.main === module) {
  auditPublishedNewMondayReadOnly().catch(error => {
    console.error(`Read-only published audit failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { auditPublishedNewMondayReadOnly, summarizeBoards };
