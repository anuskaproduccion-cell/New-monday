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
  app.virtualRenderFrame = null;
  app.virtualPreservedScrollTop = null;

  app.selectBoard = async function selectBoardWithVirtualReset(board) {
    const previous = String(this.currentBoardId() || '');
    const next = String(board?._id || '');
    if (previous !== next) {
      this.virtualBoardRanges.clear();
      this.virtualItemPositions.clear();
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
    if (!this.virtualBoardEnabled) {
      this.virtualBoardRanges.clear();
      return;
    }

    const buckets = this.virtualGroupBuckets(items);
    const validGroups = new Set();
    buckets.forEach(({ group, items: groupItems }) => {
      const groupId = String(group.id);
      validGroups.add(groupId);
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

  app.virtualSpacerRowHtml = function virtualSpacerRowHtml(count, groupId, edge, columns) {
    if (count <= 0) return '';
    const height = Math.max(1, count * ROW_HEIGHT);
    return `<tr class="virtual-spacer-row" data-virtual-spacer="${edge}" data-virtual-group="${this.escapeAttr(groupId)}" aria-hidden="true"><td colspan="${columns.length + 3}"><div style="height:${height}px"></div></td></tr>`;
  };

  app.itemRowHtml = function itemRowHtmlVirtualized(item, group, columns) {
    if (!this.virtualBoardEnabled) return baseItemRowHtml(item, group, columns);
    const position = this.virtualItemPositions.get(String(item._id));
    if (!position) return baseItemRowHtml(item, group, columns);
    const range = this.virtualBoardRanges.get(position.groupId);
    if (!range) return baseItemRowHtml(item, group, columns);

    if (position.index < range.start) {
      if (position.index === 0) return this.virtualSpacerRowHtml(range.start, position.groupId, 'top', columns);
      return '';
    }
    if (position.index >= range.end) {
      if (position.index === range.end) return this.virtualSpacerRowHtml(position.total - range.end, position.groupId, 'bottom', columns);
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
    let start = Math.max(0, Math.floor(localTop / ROW_HEIGHT) - OVERSCAN_ROWS);
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

  app.bindVirtualBoardScroll = function bindVirtualBoardScroll() {
    const scroller = document.getElementById('content');
    const board = scroller?.querySelector('.board-scroll');
    if (!scroller || !board || !this.virtualBoardEnabled) return;
    board.dataset.virtualized = 'true';
    const total = this.filteredBoardItems().length;
    const rendered = board.querySelectorAll('.item-row[data-item-id]').length;
    board.querySelectorAll('table.board-table').forEach(table => table.setAttribute('aria-rowcount', String(total + 1)));

    const toolbar = scroller.querySelector('.board-toolbar');
    if (toolbar && !toolbar.querySelector('.virtualization-badge')) {
      const badge = document.createElement('span');
      badge.className = 'virtualization-badge';
      badge.title = 'New Monday mantiene solo una ventana de filas en el DOM para acelerar tableros grandes.';
      badge.textContent = `Render parcial · ${rendered}/${total}`;
      toolbar.appendChild(badge);
    }

    scroller.addEventListener('scroll', () => {
      if (this.virtualRenderFrame) return;
      this.virtualRenderFrame = requestAnimationFrame(() => {
        this.virtualRenderFrame = null;
        this.updateVirtualRangesForScroll(scroller);
      });
    }, { passive: true });
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
