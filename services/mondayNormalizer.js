function parseJsonValue(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch (e) { return value; }
}

function normalizeLinkedItems(linkedItems = []) {
  return linkedItems.map(item => ({
    mondayItemId: String(item.id),
    name: item.name || '',
    mondayBoardId: item.board?.id ? String(item.board.id) : null,
    boardName: item.board?.name || null
  }));
}

function normalizeFileEntry(file) {
  if (!file || typeof file !== 'object') return file;
  if (file.asset_id || file.asset) {
    return {
      kind: 'asset',
      assetId: file.asset_id ? String(file.asset_id) : (file.asset?.id ? String(file.asset.id) : null),
      name: file.name || file.asset?.name || '',
      isImage: Boolean(file.is_image),
      createdAt: file.created_at || null,
      extension: file.asset?.file_extension || '',
      size: file.asset?.file_size ?? null,
      url: file.asset?.url || null
    };
  }
  if (file.object_id) {
    return {
      kind: 'doc',
      fileId: file.file_id ? String(file.file_id) : null,
      objectId: String(file.object_id),
      url: file.url || null,
      createdAt: file.created_at || null
    };
  }
  return {
    kind: file.kind ? String(file.kind).toLowerCase() : 'link',
    fileId: file.file_id ? String(file.file_id) : null,
    name: file.name || '',
    url: file.url || null,
    createdAt: file.created_at || null
  };
}

function normalizeColumnValue(columnValue) {
  const raw = parseJsonValue(columnValue.value);
  const base = {
    type: columnValue.type,
    text: columnValue.text ?? '',
    raw
  };

  switch (columnValue.type) {
    case 'text':
      return { ...base, value: typeof raw === 'string' ? raw : (columnValue.text ?? '') };

    case 'numbers': {
      const candidate = typeof raw === 'string' ? raw : columnValue.text;
      const number = candidate === '' || candidate === null || candidate === undefined ? null : Number(candidate);
      return { ...base, value: Number.isNaN(number) ? candidate : number };
    }

    case 'status':
      return {
        ...base,
        label: columnValue.text || null,
        index: raw?.index ?? null,
        changedAt: raw?.changed_at || null
      };

    case 'timeline':
      return {
        ...base,
        from: raw?.from || null,
        to: raw?.to || null,
        milestone: raw?.visualization_type === 'milestone',
        visualizationType: raw?.visualization_type || null,
        changedAt: raw?.changed_at || null
      };

    case 'date':
      return {
        ...base,
        date: raw?.date || null,
        time: raw?.time || null,
        changedAt: raw?.changed_at || null
      };

    case 'world_clock':
      return {
        ...base,
        timezone: raw?.timezone || columnValue.text || null,
        changedAt: raw?.changed_at || null
      };

    case 'email':
      return {
        ...base,
        email: raw?.email || columnValue.text || '',
        label: raw?.text || columnValue.text || ''
      };

    case 'people':
      return {
        ...base,
        personsAndTeams: raw?.personsAndTeams || raw?.persons_and_teams || []
      };

    case 'dropdown':
      return {
        ...base,
        labelIds: raw?.ids || [],
        labels: columnValue.text ? columnValue.text.split(',').map(value => value.trim()).filter(Boolean) : []
      };

    case 'dependency': {
      const linkedItems = normalizeLinkedItems(columnValue.linked_items || []);
      return {
        ...base,
        linkedItems,
        linkedMondayItemIds: linkedItems.map(item => item.mondayItemId),
        linkedItemIds: []
      };
    }

    case 'board_relation': {
      const linkedItems = normalizeLinkedItems(columnValue.linked_items || []);
      return {
        ...base,
        linkedItems,
        linkedMondayItemIds: linkedItems.map(item => item.mondayItemId),
        linkedItemIds: []
      };
    }

    case 'formula':
      return {
        ...base,
        displayValue: columnValue.display_value ?? columnValue.text ?? '',
        importedDisplayValue: columnValue.display_value ?? columnValue.text ?? '',
        calculated: false
      };

    case 'mirror':
      return {
        ...base,
        displayValue: columnValue.display_value ?? columnValue.text ?? ''
      };

    case 'link':
      return {
        ...base,
        url: raw?.url || '',
        label: raw?.text || columnValue.text || ''
      };

    case 'file': {
      const typedFiles = Array.isArray(columnValue.files) ? columnValue.files : [];
      const rawFiles = Array.isArray(raw?.files) ? raw.files : [];
      return {
        ...base,
        files: (typedFiles.length ? typedFiles : rawFiles).map(normalizeFileEntry)
      };
    }

    default:
      return base;
  }
}

function normalizeColumnValues(columnValues = []) {
  return Object.fromEntries(columnValues.map(value => [value.id, normalizeColumnValue(value)]));
}

function normalizeMondayItem(item, { boardId, parentItemId = null, parentMondayId = null, isSubitem = false } = {}) {
  return {
    board: boardId,
    mondayId: String(item.id),
    name: item.name,
    groupId: item.group?.id || '',
    group: item.group?.title || (isSubitem ? 'Subitems' : 'Imported'),
    groupColor: item.group?.color || '#579bfc',
    columnValues: normalizeColumnValues(item.column_values || []),
    parentItem: parentItemId,
    parentMondayId,
    isSubitem,
    source: 'monday-import',
    sourceReadOnly: true,
    originMeta: {
      createdAt: item.created_at || null,
      updatedAt: item.updated_at || null
    }
  };
}

module.exports = {
  parseJsonValue,
  normalizeFileEntry,
  normalizeColumnValue,
  normalizeColumnValues,
  normalizeMondayItem
};
