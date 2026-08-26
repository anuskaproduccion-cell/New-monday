(() => {
  const originalBindStaticEvents = app.bindStaticEvents;
  const originalBindBoardEvents = app.bindBoardEvents;
  const READ_ONLY_PASTE_TYPES = new Set(['formula', 'mirror', 'file', 'dependency', 'board_relation', 'subtasks']);

  app.activeCell = null;
  app.keyboardEventsBound = false;

  app.bindStaticEvents = function bindStaticEventsWithKeyboard() {
    originalBindStaticEvents.call(this);
    if (this.keyboardEventsBound) return;
    this.keyboardEventsBound = true;

    document.addEventListener('keydown', event => {
      const target = event.target;
      const editing = target?.matches?.('input,textarea,select,[contenteditable="true"]');
      if (editing || !this.activeCell) return;
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter'].includes(event.key)) return;
      const cell = this.currentActiveCellElement();
      if (!cell) return;
      event.preventDefault();
      if (event.key === 'Enter') {
        const control = cell.querySelector('input:not([readonly]),select,button');
        if (control) {
          if (control.tagName === 'BUTTON') control.click();
          else { control.focus(); control.select?.(); }
        }
        return;
      }
      this.moveActiveCell(event.key);
    });

    document.addEventListener('copy', event => {
      const target = event.target;
      if (target?.matches?.('input,textarea,[contenteditable="true"]') || !this.activeCell) return;
      const cell = this.currentActiveCellElement();
      if (!cell) return;
      event.preventDefault();
      event.clipboardData?.setData('text/plain', this.clipboardTextForCell(cell));
      this.showToast('Celda copiada');
    });

    document.addEventListener('paste', async event => {
      const target = event.target;
      if (target?.matches?.('input,textarea,[contenteditable="true"]') || !this.activeCell) return;
      const text = event.clipboardData?.getData('text/plain') ?? '';
      if (!text && text !== '0') return;
      event.preventDefault();
      const grid = this.parseClipboardGrid(text);
      if (grid.length > 1 || (grid[0]?.length || 0) > 1) await this.pasteClipboardGrid(grid);
      else await this.pasteIntoActiveCell(grid[0]?.[0] ?? '');
    });
  };

  app.bindBoardEvents = function bindBoardEventsWithKeyboard() {
    originalBindBoardEvents.call(this);
    const content = document.getElementById('content');
    content?.querySelectorAll('.item-row .dynamic-cell').forEach(cell => {
      cell.tabIndex = 0;
      cell.addEventListener('pointerdown', event => {
        if (event.target.closest('input,select,button')) return;
        const row = cell.closest('.item-row');
        this.setActiveCell(row?.dataset.itemId, cell.dataset.columnId);
      });
      cell.addEventListener('focus', () => {
        const row = cell.closest('.item-row');
        this.setActiveCell(row?.dataset.itemId, cell.dataset.columnId, { focus: false });
      });
    });
    this.restoreActiveCellHighlight();
  };

  app.setActiveCell = function setActiveCell(itemId, columnId, { focus = true } = {}) {
    if (!itemId || !columnId) return;
    this.activeCell = { itemId: String(itemId), columnId: String(columnId) };
    document.querySelectorAll('.nm-active-cell').forEach(node => node.classList.remove('nm-active-cell'));
    const cell = this.currentActiveCellElement();
    if (cell) {
      cell.classList.add('nm-active-cell');
      if (focus) cell.focus({ preventScroll: true });
    }
  };

  app.restoreActiveCellHighlight = function restoreActiveCellHighlight() {
    const cell = this.currentActiveCellElement();
    if (cell) cell.classList.add('nm-active-cell');
  };

  app.currentActiveCellElement = function currentActiveCellElement() {
    if (!this.activeCell) return null;
    const row = [...document.querySelectorAll('.item-row[data-item-id]')]
      .find(node => String(node.dataset.itemId || '') === String(this.activeCell.itemId));
    if (!row) return null;
    return [...row.querySelectorAll('.dynamic-cell[data-column-id]')]
      .find(node => String(node.dataset.columnId || '') === String(this.activeCell.columnId)) || null;
  };

  app.moveActiveCell = function moveActiveCell(direction) {
    const current = this.currentActiveCellElement();
    if (!current) return;
    const rows = [...document.querySelectorAll('.item-row')].filter(row => row.offsetParent !== null);
    const row = current.closest('.item-row');
    const rowIndex = rows.indexOf(row);
    const cells = [...row.querySelectorAll('.dynamic-cell')];
    const colIndex = cells.indexOf(current);
    let next = null;
    if (direction === 'ArrowLeft') next = cells[Math.max(0, colIndex - 1)];
    if (direction === 'ArrowRight') next = cells[Math.min(cells.length - 1, colIndex + 1)];
    if (direction === 'ArrowUp' || direction === 'ArrowDown') {
      const delta = direction === 'ArrowUp' ? -1 : 1;
      const nextRow = rows[Math.min(rows.length - 1, Math.max(0, rowIndex + delta))];
      next = nextRow?.querySelectorAll('.dynamic-cell')?.[colIndex] || null;
    }
    if (!next) return;
    const nextRow = next.closest('.item-row');
    this.setActiveCell(nextRow.dataset.itemId, next.dataset.columnId);
    next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  app.clipboardTextForCell = function clipboardTextForCell(cell) {
    const input = cell.querySelector('input,select');
    if (input) return input.value || '';
    const button = cell.querySelector('button');
    if (button) return button.innerText.trim();
    return cell.innerText.trim();
  };

  app.parseClipboardGrid = function parseClipboardGrid(raw) {
    const normalized = String(raw ?? '').replace(/\r\n?/g, '\n');
    const rows = normalized.split('\n');
    if (rows.length > 1 && rows[rows.length - 1] === '') rows.pop();
    return rows.map(row => row.split('\t'));
  };

  app.clipboardValueForColumn = function clipboardValueForColumn(column, rawText) {
    const text = String(rawText ?? '').trim();
    if (READ_ONLY_PASTE_TYPES.has(column.type)) {
      return { error: `${column.title} no admite pegado directo` };
    }

    if (column.type === 'numbers') {
      const normalized = text.replace(/\s/g, '').replace(',', '.');
      const number = text === '' ? null : Number(normalized);
      if (text !== '' && !Number.isFinite(number)) return { error: `“${text}” no es un número` };
      return { value: { type: 'numbers', value: number, text: number === null ? '' : String(number) } };
    }
    if (column.type === 'date') {
      const date = text.match(/^\d{4}-\d{2}-\d{2}$/)?.[0];
      if (text && !date) return { error: `Fecha inválida “${text}”; usa YYYY-MM-DD` };
      return { value: { type: 'date', date: date || null, text: date || '' } };
    }
    if (column.type === 'timeline') {
      const parts = text.split(/\s*(?:→|->|–|—)\s*/).filter(Boolean);
      const from = parts[0]?.match(/^\d{4}-\d{2}-\d{2}$/)?.[0];
      const to = (parts[1] || parts[0])?.match(/^\d{4}-\d{2}-\d{2}$/)?.[0];
      if (text && (!from || !to)) return { error: `Cronograma inválido “${text}”; usa YYYY-MM-DD → YYYY-MM-DD` };
      return { value: { type: 'timeline', from: from || null, to: to || null } };
    }
    if (column.type === 'status') {
      const allowed = this.statusLabels(column).map(entry => entry.label);
      if (text && allowed.length && !allowed.includes(text)) return { error: `Estado no permitido: ${text}` };
      return { value: { type: 'status', label: text, text, color: this.statusColor(column, text) } };
    }
    if (column.type === 'dropdown') {
      const selected = text ? text.split(',').map(label => label.trim()).filter(Boolean) : [];
      const labels = Array.isArray(column.settings?.labels) ? column.settings.labels.map(label => label?.label ?? label?.name ?? String(label ?? '')).filter(Boolean) : [];
      const invalid = labels.length ? selected.filter(label => !labels.includes(label)) : [];
      if (invalid.length) return { error: `Dropdown no permitido: ${invalid.join(', ')}` };
      return { value: { type: 'dropdown', labels: selected, text } };
    }
    if (column.type === 'people') return { value: { type: 'people', text, names: text ? text.split(',').map(name => name.trim()).filter(Boolean) : [] } };
    if (column.type === 'email') return { value: { type: 'email', email: text, text } };
    if (column.type === 'link') return { value: { type: 'link', url: text, text } };
    if (column.type === 'world_clock') return { value: { type: 'world_clock', timezone: text, text } };
    return { value: { type: 'text', text, value: text } };
  };

  app.keyboardPasteItems = function keyboardPasteItems() {
    if (typeof this.keyboardVisibleItems === 'function') return this.keyboardVisibleItems();
    if (typeof this.filteredBoardItems === 'function') return this.filteredBoardItems();
    return [];
  };

  app.pasteClipboardGrid = async function pasteClipboardGrid(grid) {
    if (!this.activeCell || !grid?.length) return;
    const items = this.keyboardPasteItems();
    const startRow = items.findIndex(item => String(item._id) === String(this.activeCell.itemId));
    const columns = this.effectiveColumns();
    const startColumn = columns.findIndex(column => String(column.id) === String(this.activeCell.columnId));
    if (startRow < 0 || startColumn < 0) return;

    let applied = 0;
    let skipped = 0;
    let firstError = '';
    for (let rowOffset = 0; rowOffset < grid.length; rowOffset += 1) {
      const item = items[startRow + rowOffset];
      if (!item) { skipped += grid[rowOffset].length; continue; }
      const itemId = item._id;
      for (let columnOffset = 0; columnOffset < grid[rowOffset].length; columnOffset += 1) {
        const column = columns[startColumn + columnOffset];
        if (!column) { skipped += 1; continue; }
        const parsed = this.clipboardValueForColumn(column, grid[rowOffset][columnOffset]);
        if (parsed.error) {
          skipped += 1;
          if (!firstError) firstError = parsed.error;
          continue;
        }
        const updated = await this.updateColumnValue(itemId, column.id, parsed.value);
        if (updated) applied += 1;
        else skipped += 1;
      }
    }

    this.renderBoard();
    if (typeof this.focusModelCell === 'function') this.focusModelCell(this.activeCell.itemId, this.activeCell.columnId);
    else this.setActiveCell(this.activeCell.itemId, this.activeCell.columnId, { focus: false });
    if (applied) this.showToast(`${applied} celdas pegadas${skipped ? ` · ${skipped} omitidas` : ''}`);
    else this.showToast(firstError || 'No se pudo pegar el rango', true);
    if (firstError && applied) console.warn('New Monday range paste:', firstError);
  };

  app.pasteIntoActiveCell = async function pasteIntoActiveCell(rawText) {
    const { itemId, columnId } = this.activeCell || {};
    const column = this.effectiveColumns().find(entry => String(entry.id) === String(columnId));
    if (!column) return;
    const parsed = this.clipboardValueForColumn(column, rawText);
    if (parsed.error) return this.showToast(parsed.error, true);

    const updated = await this.updateColumnValue(itemId, columnId, parsed.value);
    if (updated) {
      this.renderBoard();
      if (typeof this.focusModelCell === 'function') this.focusModelCell(itemId, columnId);
      else this.setActiveCell(itemId, columnId, { focus: false });
      this.showToast('Valor pegado');
    }
  };
})();
