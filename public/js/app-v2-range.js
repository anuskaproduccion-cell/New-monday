(() => {
  const originalBindBoardEvents = app.bindBoardEvents;
  const originalSetActiveCell = app.setActiveCell;
  const originalClipboardTextForCell = app.clipboardTextForCell;

  app.rangeAnchor = null;
  app.rangeFocus = null;
  app.rangeDragging = false;
  app.rangeEventsBound = false;

  app.visibleGridRows = function visibleGridRows() {
    return [...document.querySelectorAll('.item-row')].filter(row => row.offsetParent !== null);
  };

  app.rangeGridItems = function rangeGridItems() {
    if (typeof this.keyboardVisibleItems === 'function') return this.keyboardVisibleItems();
    if (typeof this.filteredBoardItems === 'function') return this.filteredBoardItems();
    return [];
  };

  app.rangePoint = function rangePoint(itemId, columnId) {
    return { itemId: String(itemId || ''), columnId: String(columnId || '') };
  };

  app.rangeCoordinates = function rangeCoordinates(point) {
    if (!point) return null;
    const items = this.rangeGridItems();
    const rowIndex = items.findIndex(item => String(item._id) === String(point.itemId));
    const columns = this.effectiveColumns();
    const columnIndex = columns.findIndex(column => String(column.id) === String(point.columnId));
    if (rowIndex < 0 || columnIndex < 0) return null;
    return { rowIndex, columnIndex, items, columns };
  };

  app.selectedRangeEntries = function selectedRangeEntries() {
    const start = this.rangeCoordinates(this.rangeAnchor);
    const end = this.rangeCoordinates(this.rangeFocus || this.rangeAnchor);
    if (!start || !end) return [];
    const rowMin = Math.min(start.rowIndex, end.rowIndex);
    const rowMax = Math.max(start.rowIndex, end.rowIndex);
    const colMin = Math.min(start.columnIndex, end.columnIndex);
    const colMax = Math.max(start.columnIndex, end.columnIndex);
    const result = [];
    for (let r = rowMin; r <= rowMax; r += 1) {
      const item = start.items[r];
      const entries = [];
      for (let c = colMin; c <= colMax; c += 1) {
        const column = start.columns[c];
        if (item && column) entries.push({ item, column, rowIndex: r, columnIndex: c });
      }
      if (entries.length) result.push(entries);
    }
    return result;
  };

  app.cellForRangePoint = function cellForRangePoint(point) {
    if (!point) return null;
    const row = [...document.querySelectorAll('.item-row[data-item-id]')]
      .find(node => String(node.dataset.itemId || '') === String(point.itemId));
    if (!row) return null;
    return [...row.querySelectorAll('.dynamic-cell[data-column-id]')]
      .find(node => String(node.dataset.columnId || '') === String(point.columnId)) || null;
  };

  app.selectedRangeCells = function selectedRangeCells() {
    return this.selectedRangeEntries().map(entries => entries.map(entry => ({
      ...entry,
      row: [...document.querySelectorAll('.item-row[data-item-id]')]
        .find(node => String(node.dataset.itemId || '') === String(entry.item._id)) || null,
      cell: this.cellForRangePoint({ itemId: entry.item._id, columnId: entry.column.id })
    })).filter(entry => entry.cell));
  };

  app.rangeSelectionCount = function rangeSelectionCount() {
    return this.selectedRangeEntries().reduce((sum, entries) => sum + entries.length, 0);
  };

  app.applyRangeHighlight = function applyRangeHighlight() {
    document.querySelectorAll('.nm-range-cell,.nm-range-anchor,.nm-range-focus').forEach(node => {
      node.classList.remove('nm-range-cell', 'nm-range-anchor', 'nm-range-focus');
    });
    const rows = this.selectedRangeCells();
    rows.flat().forEach(entry => entry.cell.classList.add('nm-range-cell'));
    const anchorCell = this.cellForRangePoint(this.rangeAnchor);
    const focusCell = this.cellForRangePoint(this.rangeFocus);
    anchorCell?.classList.add('nm-range-anchor');
    focusCell?.classList.add('nm-range-focus');
  };

  app.setRange = function setRange(anchor, focus = anchor, { announce = false } = {}) {
    if (!anchor?.itemId || !anchor?.columnId) return;
    this.rangeAnchor = this.rangePoint(anchor.itemId, anchor.columnId);
    this.rangeFocus = this.rangePoint(focus?.itemId || anchor.itemId, focus?.columnId || anchor.columnId);
    this.applyRangeHighlight();
    if (announce) {
      const count = this.rangeSelectionCount();
      if (count > 1) this.showToast(`${count} celdas seleccionadas`);
    }
  };

  app.clearRange = function clearRange() {
    this.rangeAnchor = null;
    this.rangeFocus = null;
    this.applyRangeHighlight();
  };

  app.setActiveCell = function setActiveCellWithRange(itemId, columnId, options = {}) {
    originalSetActiveCell.call(this, itemId, columnId, options);
    if (!options.keepRange) this.setRange({ itemId, columnId });
  };

  app.extendRangeTo = function extendRangeTo(itemId, columnId, { focus = true, announce = false } = {}) {
    if (!this.rangeAnchor) this.rangeAnchor = this.rangePoint(this.activeCell?.itemId || itemId, this.activeCell?.columnId || columnId);
    if (focus && typeof this.ensureVirtualItemRendered === 'function') this.ensureVirtualItemRendered(itemId);
    this.rangeFocus = this.rangePoint(itemId, columnId);
    this.activeCell = this.rangePoint(itemId, columnId);
    document.querySelectorAll('.nm-active-cell').forEach(node => node.classList.remove('nm-active-cell'));
    const cell = this.cellForRangePoint(this.rangeFocus);
    cell?.classList.add('nm-active-cell');
    if (focus) cell?.focus({ preventScroll: true });
    this.applyRangeHighlight();
    if (announce) {
      const count = this.rangeSelectionCount();
      if (count > 1) this.showToast(`${count} celdas seleccionadas`);
    }
  };

  app.extendRangeByKey = function extendRangeByKey(key) {
    const current = this.rangeCoordinates(this.rangeFocus || this.activeCell);
    if (!current) return;
    let nextRow = current.rowIndex;
    let nextColumn = current.columnIndex;
    if (key === 'ArrowLeft') nextColumn -= 1;
    if (key === 'ArrowRight') nextColumn += 1;
    if (key === 'ArrowUp') nextRow -= 1;
    if (key === 'ArrowDown') nextRow += 1;
    nextRow = Math.max(0, Math.min(current.items.length - 1, nextRow));
    nextColumn = Math.max(0, Math.min(current.columns.length - 1, nextColumn));
    const item = current.items[nextRow];
    const column = current.columns[nextColumn];
    if (!item || !column) return;
    this.extendRangeTo(item._id, column.id);
    this.cellForRangePoint(this.rangeFocus)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  app.rangeClipboardTextForEntry = function rangeClipboardTextForEntry(entry) {
    const cell = this.cellForRangePoint({ itemId: entry.item._id, columnId: entry.column.id });
    if (cell) return originalClipboardTextForCell.call(this, cell);
    if (typeof this.valueFor === 'function') {
      const value = this.valueFor(entry.item, entry.column);
      if (typeof this.displayValue === 'function') return String(this.displayValue(value) ?? '');
      if (value === null || value === undefined) return '';
      if (typeof value === 'object') return String(value.text ?? value.displayValue ?? value.label ?? value.value ?? '');
      return String(value);
    }
    const value = entry.item?.columnValues?.[entry.column.id];
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return String(value.text ?? value.displayValue ?? value.label ?? value.value ?? '');
    return String(value);
  };

  app.rangeClipboardText = function rangeClipboardText() {
    const rows = this.selectedRangeEntries();
    if (!rows.length) return '';
    return rows.map(entries => entries.map(entry => this.rangeClipboardTextForEntry(entry)).join('\t')).join('\n');
  };

  app.clipboardTextForCell = function clipboardTextForCellWithRange(cell) {
    if (this.rangeSelectionCount() > 1) return this.rangeClipboardText();
    return originalClipboardTextForCell.call(this, cell);
  };

  app.bindBoardEvents = function bindBoardEventsWithRange() {
    originalBindBoardEvents.call(this);
    const content = document.getElementById('content');
    content?.querySelectorAll('.item-row .dynamic-cell').forEach(cell => {
      const pointForCell = () => ({ itemId: cell.closest('.item-row')?.dataset.itemId, columnId: cell.dataset.columnId });
      cell.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        const interactive = event.target.closest('input,select,button,textarea,a');
        const point = pointForCell();
        if (!point.itemId || !point.columnId) return;
        if (event.shiftKey && this.rangeAnchor) {
          event.preventDefault();
          this.extendRangeTo(point.itemId, point.columnId, { announce: true });
        } else if (!interactive) {
          this.rangeDragging = true;
          this.setActiveCell(point.itemId, point.columnId, { focus: false });
        }
      });
      cell.addEventListener('pointerenter', event => {
        if (!this.rangeDragging || !(event.buttons & 1)) return;
        const point = pointForCell();
        if (!point.itemId || !point.columnId) return;
        this.extendRangeTo(point.itemId, point.columnId, { focus: false });
      });
    });
    this.applyRangeHighlight();

    if (!this.rangeEventsBound) {
      this.rangeEventsBound = true;
      document.addEventListener('pointerup', () => {
        if (!this.rangeDragging) return;
        this.rangeDragging = false;
        const count = this.rangeSelectionCount();
        if (count > 1) this.showToast(`${count} celdas seleccionadas`);
      });
      document.addEventListener('keydown', event => {
        const target = event.target;
        if (!event.shiftKey || !this.activeCell || target?.matches?.('input,textarea,select,[contenteditable="true"]')) return;
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        this.extendRangeByKey(event.key);
      }, true);
      document.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || !this.rangeAnchor) return;
        const active = this.activeCell;
        if (active) this.setRange(active);
      });
    }
  };
})();
