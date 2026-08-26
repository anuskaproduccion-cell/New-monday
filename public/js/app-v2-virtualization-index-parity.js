(() => {
  const basePrepareVirtualBoard = app.prepareVirtualBoard.bind(app);

  app.virtualGroupHeightPrefixes = new Map();

  app.rebuildVirtualHeightPrefix = function rebuildVirtualHeightPrefix(groupId) {
    const key = String(groupId || '');
    const ids = this.virtualGroupItemIds.get(key) || [];
    const prefix = new Array(ids.length + 1);
    prefix[0] = 0;
    for (let index = 0; index < ids.length; index += 1) {
      prefix[index + 1] = prefix[index] + this.virtualEstimatedItemHeight(ids[index]);
    }
    this.virtualGroupHeightPrefixes.set(key, prefix);
    return prefix;
  };

  app.prepareVirtualBoard = function prepareVirtualBoardWithHeightIndex() {
    basePrepareVirtualBoard();
    if (!this.virtualBoardEnabled) {
      this.virtualGroupHeightPrefixes.clear();
      return;
    }

    const validGroups = new Set(this.virtualGroupItemIds.keys());
    validGroups.forEach(groupId => this.rebuildVirtualHeightPrefix(groupId));
    [...this.virtualGroupHeightPrefixes.keys()].forEach(groupId => {
      if (!validGroups.has(groupId)) this.virtualGroupHeightPrefixes.delete(groupId);
    });
  };

  app.virtualEstimatedSpanHeight = function virtualEstimatedSpanHeightIndexed(groupId, start = 0, end = 0) {
    const key = String(groupId || '');
    const ids = this.virtualGroupItemIds.get(key) || [];
    const from = Math.max(0, Math.min(ids.length, Number(start) || 0));
    const to = Math.max(from, Math.min(ids.length, Number(end) || 0));
    const prefix = this.virtualGroupHeightPrefixes.get(key) || this.rebuildVirtualHeightPrefix(key);
    return Math.max(0, Number(prefix[to] || 0) - Number(prefix[from] || 0));
  };

  app.virtualIndexForOffset = function virtualIndexForOffsetBinary(groupId, offset = 0) {
    const key = String(groupId || '');
    const ids = this.virtualGroupItemIds.get(key) || [];
    if (!ids.length) return 0;
    const prefix = this.virtualGroupHeightPrefixes.get(key) || this.rebuildVirtualHeightPrefix(key);
    const target = Math.max(0, Number(offset) || 0);
    const totalHeight = Number(prefix[prefix.length - 1] || 0);
    if (target >= totalHeight) return ids.length - 1;

    let low = 0;
    let high = ids.length - 1;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (target < Number(prefix[mid + 1] || 0)) high = mid;
      else low = mid + 1;
    }
    return low;
  };

  app.measureVirtualExpandedRows = function measureVirtualExpandedRowsIndexed(board) {
    if (!board || !this.virtualBoardEnabled) return;
    const dirtyGroups = new Set();

    board.querySelectorAll('.item-row[data-item-id]').forEach(row => {
      const itemId = String(row.dataset.itemId || '');
      if (!itemId) return;
      const position = this.virtualItemPositions.get(itemId);
      const groupId = String(position?.groupId || '');

      const rowRectHeight = Number(row.getBoundingClientRect?.().height || 0);
      const rowHeight = rowRectHeight > 0 ? rowRectHeight : Number(row.offsetHeight || 0);
      if (rowHeight > 0 && Number(this.virtualItemBaseHeights.get(itemId) || 0) !== rowHeight) {
        this.virtualItemBaseHeights.set(itemId, rowHeight);
        if (groupId) dirtyGroups.add(groupId);
      }

      let extraHeight = 0;
      let sibling = row.nextElementSibling;
      while (sibling) {
        const ownSchema = sibling.matches?.('.subitem-own-schema-host') && String(sibling.dataset.subitemSchemaParent || '') === itemId;
        const composer = sibling.matches?.('.subitem-create-row') && String(sibling.dataset.subitemComposer || '') === itemId;
        const legacy = sibling.matches?.('.subitem-row');
        if (!ownSchema && !composer && !legacy) break;
        const rectHeight = Number(sibling.getBoundingClientRect?.().height || 0);
        const height = rectHeight > 0 ? rectHeight : Number(sibling.offsetHeight || 0);
        extraHeight += Math.max(0, height);
        sibling = sibling.nextElementSibling;
      }

      if (Number(this.virtualItemExtraHeights.get(itemId) || 0) !== extraHeight) {
        this.virtualItemExtraHeights.set(itemId, extraHeight);
        if (groupId) dirtyGroups.add(groupId);
      }
    });

    dirtyGroups.forEach(groupId => this.rebuildVirtualHeightPrefix(groupId));
  };
})();
