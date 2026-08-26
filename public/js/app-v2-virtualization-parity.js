(() => {
  const baseRenderBoard = app.renderBoard.bind(app);
  const baseItemRowHtml = app.itemRowHtml.bind(app);
  const baseSelectBoard = app.selectBoard.bind(app);

  const ROW_HEIGHT = 40;
  const WINDOW_SIZE = 120;
  const OVERSCAN_ROWS = 24;
  const RANGE_STEP = 20;
  const ENABLE_THRESHOLD = 260;

  app.virtualBoardEnabled = false;
  app.virtualBoardRanges = new Map();
  app.virtualItemPositions = new Map();
  app.virtualGroupItemIds = new Map();
  app.virtualItemExtraHeights = new Map();
  app.virtualRenderFrame = null;
  app.virtualPreservedScrollTop = null;
  app.virtualScrollHost = null;
  app.virtualScrollHandler = null;

  app.selectBoard = async function selectBoardWithVirtualReset(board) {
    const previous = String(this.currentBoardId() || '');
    const next = String(board?._id || '');
    if (previous !== next) {
      this.virtualBoardRanges.clear();
      this.virtualItemPositions.clear();
      this.virtualGroupItemIds.clear();
      this.virtualItemExtraHeights.clear();
      this.virtualBoardEnabled = false;
      this.virtualPreservedScrollTop = null;
    }
    return baseSelectBoard(board);
  };

  app.virtualGroupBuckets = function virtualGroupBuckets(items = this.filteredBoardItems()) {
    const groups = this.effectiveGroups();
    const grouped = new Map(groups.map(group => [String(group.id), { group, items: [] }]));
    items.forEach(item => {
      let group = groups.find(entry => String(entry.id) === String(item.groupId));
      if (!group) group = groups.find(entry => String(entry.title) === String(item.group));
      if (!group) group = { id: item.groupId || `legacy:${item.group || 'General'}`, title: item.group || 'General', color: item.groupColor || '#579bfc' };
      const key = String(group.id);
      if (!grouped.has(key)) grouped.set(key, { group, items: [] });
      grouped.get(key).items.push(item);
    });
    return grouped;
  };

  app.prepareVirtualBoard = function prepareVirtualBoard() {
    const items = this.filteredBoardItems();
    this.virtualBoardEnabled = items.length > ENABLE_THRESHOLD;
    this.virtualItemPositions.clear();
    this.virtualGroupItemIds.clear();
    if (!this.virtualBoardEnabled) {
      this.virtualBoardRanges.clear();
      return;
    }

    const validItemIds = new Set(items.map(item => String(item._id)));
    [...this.virtualItemExtraHeights.keys()].forEach(itemId => {
      if (!validItemIds.has(String(itemId))) this.virtualItemExtraHeights.delete(itemId);
    });

    const buckets = this.virtualGroupBuckets(items);
    const validGroups = new Set();
    buckets.forEach(({ group, items: groupItems }) => {
      const groupId = String(group.id);
      validGroups.add(groupId);
      const itemIds = groupItems.map(item => String(item._id));
      this.virtualGroupItemIds.set(groupId, itemIds);
      groupItems.forEach((item, index) => this.virtualItemPositions.set(String(item._id), { groupId, index, total: groupItems.length }));
      const previous = this.virtualBoardRanges.get(groupId) || { start: 0, end: WINDOW_SIZE, total: groupItems.length };
      const maxStart = Math.max(0, groupItems.length - WINDOW_SIZE);
      const start = Math.min(maxStart, Math.max(0, Number(previous.start || 0)));
      this.virtualBoardRanges.set(groupId, { start, end: Math.min(groupItems.length, start + WINDOW_SIZE), total: groupItems.length });
    });
    [...this.virtualBoardRanges.keys()].forEach(groupId => {
      if (!validGroups.has(groupId)) this.virtualBoardRanges.delete(groupId);
    });
  };

  app.virtualEstimatedItemHeight = function virtualEstimatedItemHeight(itemId) {
    return ROW_HEIGHT + Math.max(0, Number(this.virtualItemExtraHeights.get(String(itemId)) || 0));
  };

  app.virtualEstimatedSpanHeight = function virtualEstimatedSpanHeight(groupId, start = 0, end = 0) {
    const ids = this.virtualGroupItemIds.get(String(groupId)) || [];
    const from = Math.max(0, Number(start) || 0);
    const to = Math.max(from, Math.min(ids.length, Number(end) || 0));
    let height = 0;
    for (let index = from; index < to; index += 1) height += this.virtualEstimatedItemHeight(ids[index]);
    return height;
  };

  app.virtualIndexForOffset = function virtualIndexForOffset(groupId, offset = 0) {
    const ids = this.virtualGroupItemIds.get(String(groupId)) || [];
    const target = Math.max(0, Number(offset) || 0);
    let consumed = 0;
    for (let index = 0; index < ids.length; index += 1) {
      const next = consumed + this.virtualEstimatedItemHeight(ids[index]);
      if (target < next) return index;
      consumed = next;
    }
    return Math.max(0, ids.length - 1);
  };

  app.virtualSpacerRowHtml = function virtualSpacerRowHtml(count, groupId, edge, columns, startIndex = null, endIndex = null) {
    if (count <= 0) return '';
    const measured = Number.isInteger(startIndex) && Number.isInteger(endIndex)
      ? this.virtualEstimatedSpanHeight(groupId, startIndex, endIndex)
      : count * ROW_HEIGHT;
    const height = Math.max(1, measured);
    return `<tr class="virtual-spacer-row" data-virtual-spacer="${edge}" data-virtual-group="${this.escapeAttr(groupId)}" aria-hidden="true"><td colspan="${columns.length + 3}"><div style="height:${height}px"></div></td></tr>`;
  };

  app.itemRowHtml = function itemRowHtmlVirtualized(item, group, columns) {
    if (!this.virtualBoardEnabled) return baseItemRowHtml(item, group, columns);
    const position = this.virtualItemPositions.get(String(item._id));
    if (!position) return baseItemRowHtml(item, group, columns);
    const range = this.virtualBoardRanges.get(position.groupId);
    if (!range) return baseItemRowHtml(item, group, columns);

    if (position.index < range.start) {
      if (position.index === 0) return this.virtualSpacerRowHtml(range.start, position.groupId, 'top', columns, 0, range.start);
      return '';
    }
    if (position.index >= range.end) {
      if (position.index === range.end) return this.virtualSpacerRowHtml(position.total - range.end, position.groupId, 'bottom', columns, range.end, position.total);
      return '';
    }
    return baseItemRowHtml(item, group, columns);
  };

  app.virtualRangeForScroll = function virtualRangeForScroll(groupId, section, scroller) {
    const current = this.virtualBoardRanges.get(String(groupId));
    if (!current || current.total <= WINDOW_SIZE) return current;
    const headerAllowance = 78;
    const viewportTop = scroller.scrollTop;
    const viewportBottom = viewportTop + scroller.clientHeight;
    const scrollerRect = scroller.getBoundingClientRect();
    const sectionRect = section.getBoundingClientRect();
    const sectionTop = viewportTop + (sectionRect.top - scrollerRect.top);
    const sectionBottom = sectionTop + sectionRect.height;
    if (sectionBottom < viewportTop - scroller.clientHeight || sectionTop > viewportBottom + scroller.clientHeight) return current;

    const localTop = Math.max(0, viewportTop - sectionTop - headerAllowance);
    const modelIndex = this.virtualIndexForOffset(groupId, localTop);
    let start = Math.max(0, modelIndex - OVERSCAN_ROWS);
    start = Math.floor(start / RANGE_STEP) * RANGE_STEP;
    start = Math.min(Math.max(0, current.total - WINDOW_SIZE), start);
    return { start, end: Math.min(current.total, start + WINDOW_SIZE), total: current.total };
  };

  app.updateVirtualRangesForScroll = function updateVirtualRangesForScroll(scroller) {
    if (!this.virtualBoardEnabled || !scroller) return;
    let changed = false;
    scroller.querySelectorAll('.group-section[data-group-id]').forEach(section => {
      const groupId = String(section.dataset.groupId || '');
      const current = this.virtualBoardRanges.get(groupId);
      const next = this.virtualRangeForScroll(groupId, section, scroller);
      if (!current || !next || current.start === next.start) return;
      this.virtualBoardRanges.set(groupId, next);
      changed = true;
    });
    if (!changed) return;
    this.virtualPreservedScrollTop = scroller.scrollTop;
    this.renderBoard();
  };

  app.unbindVirtualBoardScroll = function unbindVirtualBoardScroll() {
    if (this.virtualScrollHost && this.virtualScrollHandler) {
      this.virtualScrollHost.removeEventListener('scroll', this.virtualScrollHandler);
    }
    this.virtualScrollHost = null;
    this.virtualScrollHandler = null;
    if (this.virtualRenderFrame && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.virtualRenderFrame);
      this.virtualRenderFrame = null;
    }
  };

  app.ensureVirtualBoardScrollListener = function ensureVirtualBoardScrollListener(scroller) {
    if (!scroller) return;
    if (this.virtualScrollHost === scroller && this.virtualScrollHandler) return;
    this.unbindVirtualBoardScroll();
    this.virtualScrollHost = scroller;
    this.virtualScrollHandler = () => {
      if (this.virtualRenderFrame) return;
      this.virtualRenderFrame = requestAnimationFrame(() => {
        this.virtualRenderFrame = null;
        this.updateVirtualRangesForScroll(scroller);
      });
    };
    scroller.addEventListener('scroll', this.virtualScrollHandler, { passive: true });
  };

  app.virtualRowCountForGroup = function virtualRowCountForGroup(groupId) {
    const range = this.virtualBoardRanges.get(String(groupId));
    return range ? Number(range.total || 0) + 1 : null;
  };

  app.measureVirtualExpandedRows = function measureVirtualExpandedRows(board) {
    if (!board || !this.virtualBoardEnabled) return;
    board.querySelectorAll('.item-row[data-item-id]').forEach(row => {
      const itemId = String(row.dataset.itemId || '');
      if (!itemId) return;
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
      this.virtualItemExtraHeights.set(itemId, extraHeight);
    });
  };

  app.bindVirtualBoardScroll = function bindVirtualBoardScroll() {
    const scroller = document.getElementById('content');
    const board = scroller?.querySelector('.board-scroll');
    if (!scroller || !board || !this.virtualBoardEnabled) {
      this.unbindVirtualBoardScroll();
      return;
    }
    board.dataset.virtualized = 'true';
    this.measureVirtualExpandedRows(board);
    const total = this.filteredBoardItems().length;
    const rendered = board.querySelectorAll('.item-row[data-item-id]').length;
    board.querySelectorAll('.group-section[data-group-id]').forEach(section => {
      const groupId = String(section.dataset.groupId || '');
      const table = section.querySelector('table.board-table');
      const rowCount = this.virtualRowCountForGroup(groupId);
      if (table && rowCount) table.setAttribute('aria-rowcount', String(rowCount));
    });

    const toolbar = scroller.querySelector('.board-toolbar');
    if (toolbar && !toolbar.querySelector('.virtualization-badge')) {
      const badge = document.createElement('span');
      badge.className = 'virtualization-badge';
      badge.title = 'New Monday mantiene solo una ventana de filas en el DOM para acelerar tableros grandes.';
      badge.textContent = `Render parcial · ${rendered}/${total}`;
      toolbar.appendChild(badge);
    }

    this.ensureVirtualBoardScrollListener(scroller);
  };

  app.ensureVirtualItemRendered = function ensureVirtualItemRendered(itemId) {
    if (!this.virtualBoardEnabled) return false;
    const position = this.virtualItemPositions.get(String(itemId));
    if (!position) return false;
    const range = this.virtualBoardRanges.get(position.groupId);
    if (!range || (position.index >= range.start && position.index < range.end)) return false;
    let start = Math.max(0, position.index - Math.floor(WINDOW_SIZE / 3));
    start = Math.floor(start / RANGE_STEP) * RANGE_STEP;
    start = Math.min(Math.max(0, position.total - WINDOW_SIZE), start);
    this.virtualBoardRanges.set(position.groupId, { start, end: Math.min(position.total, start + WINDOW_SIZE), total: position.total });
    const scroller = document.getElementById('content');
    this.virtualPreservedScrollTop = scroller?.scrollTop ?? null;
    this.renderBoard();
    return true;
  };

  app.renderBoard = function renderBoardVirtualized() {
    const content = document.getElementById('content');
    const scrollTop = this.virtualPreservedScrollTop ?? content?.scrollTop ?? 0;
    this.virtualPreservedScrollTop = null;
    this.prepareVirtualBoard();
    baseRenderBoard();
    if (content && scrollTop > 0) content.scrollTop = scrollTop;
    this.bindVirtualBoardScroll();
  };
})();
