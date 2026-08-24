const MONDAY_API_URL = 'https://api.monday.com/v2';

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

async function mondayQuery(document, variables = {}) {
  assertReadOnlyDocument(document);

  const token = process.env.MONDAY_API_TOKEN;
  if (!token) throw new Error('MONDAY_API_TOKEN is not configured');

  const response = await fetch(MONDAY_API_URL, {
    method: 'POST',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: document, variables })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`Monday read failed with HTTP ${response.status}`);
  }
  if (payload.errors?.length) {
    throw new Error(payload.errors.map(error => error.message).join('; '));
  }

  return payload.data;
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

  const visibleBoards = boards.filter(board => !board.name.startsWith('Subelementos de '));
  const internalSubitemBoards = boards.filter(board => board.name.startsWith('Subelementos de '));

  return {
    workspaces: workspacesData.workspaces || [],
    boards,
    visibleBoards,
    internalSubitemBoards,
    counts: {
      workspaces: (workspacesData.workspaces || []).length,
      boards: boards.length,
      visibleBoards: visibleBoards.length,
      internalSubitemBoards: internalSubitemBoards.length
    }
  };
}

module.exports = {
  mondayQuery,
  getAccountInventory,
  assertReadOnlyDocument
};
