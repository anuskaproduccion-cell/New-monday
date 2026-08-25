const crypto = require('crypto');

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, canonicalize(value[key])])
  );
}

function stableStringify(value) {
  return JSON.stringify(canonicalize(value));
}

function fingerprint(value) {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

function boardSchemaPayload(board) {
  return {
    mondayId: String(board.mondayId || board.id || ''),
    workspaceMondayId: board.workspaceMondayId || board.workspace?.id || null,
    workspaceName: board.workspaceName || board.workspace?.name || '',
    name: board.name || '',
    description: board.description || '',
    state: board.state || '',
    boardKind: board.boardKind || board.board_kind || '',
    internal: Boolean(board.internal),
    groups: (board.groups || []).map(group => ({
      id: group.id,
      title: group.title,
      color: group.color,
      order: group.order ?? null
    })),
    columns: (board.columns || []).map(column => ({
      id: column.id,
      title: column.title,
      type: column.type,
      description: column.description || '',
      settings: column.settings || {},
      order: column.order ?? null
    })),
    views: (board.views || []).map(view => ({
      id: String(view.id),
      name: view.name,
      type: view.type || null,
      order: view.order ?? null
    }))
  };
}

function itemPayload(item) {
  return {
    mondayId: String(item.mondayId || item.id || ''),
    boardMondayId: String(item.boardMondayId || ''),
    parentMondayId: item.parentMondayId ? String(item.parentMondayId) : null,
    isSubitem: Boolean(item.isSubitem),
    name: item.name || '',
    order: item.order ?? 0,
    groupId: item.groupId || '',
    group: item.group || '',
    groupColor: item.groupColor || '',
    columnValues: item.columnValues || {},
    sourceMeta: item.sourceMeta || {}
  };
}

function boardDataFingerprint(items = []) {
  const payload = items
    .map(itemPayload)
    .sort((a, b) => a.mondayId.localeCompare(b.mondayId));
  return fingerprint(payload);
}

module.exports = {
  canonicalize,
  stableStringify,
  fingerprint,
  boardSchemaPayload,
  itemPayload,
  boardDataFingerprint
};
