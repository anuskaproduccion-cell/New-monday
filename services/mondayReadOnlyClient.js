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
  assertReadOnlyDocument
};
