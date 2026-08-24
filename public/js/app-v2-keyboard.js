(() => {
  const originalBindStaticEvents = app.bindStaticEvents;
  const originalBindBoardEvents = app.bindBoardEvents;

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
      await this.pasteIntoActiveCell(text);
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
    const row = document.querySelector(`.item-row[data-item-id="${CSS.escape(this.activeCell.itemId)}"]`);
    if (!row) return null;
    return row.querySelector(`.dynamic-cell[data-column-id="${CSS.escape(this.activeCell.columnId)}"]`);
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

  app.pasteIntoActiveCell = async function pasteIntoActiveCell(rawText) {
    const { itemId, columnId } = this.activeCell || {};
    const column = this.effectiveColumns().find(entry => String(entry.id) === String(columnId));
    if (!column) return;
    const text = String(rawText).replace(/\r/g, '').trim();
    const readOnly = new Set(['formula', 'mirror', 'file', 'dependency', 'board_relation', 'subtasks']);
    if (readOnly.has(column.type)) {
      this.showToast(`${column.title} no admite pegado directo`, true);
      return;
    }

    let value;
    if (column.type === 'numbers') {
      const normalized = text.replace(/\s/g, '').replace(',', '.');
      const number = text === '' ? null : Number(normalized);
      if (text !== '' && !Number.isFinite(number)) return this.showToast('El valor pegado no es un número', true);
      value = { type: 'numbers', value: number, text: number === null ? '' : String(number) };
    } else if (column.type === 'date') {
      const date = text.match(/^\d{4}-\d{2}-\d{2}$/)?.[0];
      if (text && !date) return this.showToast('Usa fecha YYYY-MM-DD al pegar', true);
      value = { type: 'date', date: date || null, text: date || '' };
    } else if (column.type === 'timeline') {
      const parts = text.split(/\s*(?:→|->|\t|–|—)\s*/).filter(Boolean);
      const from = parts[0]?.match(/^\d{4}-\d{2}-\d{2}$/)?.[0];
      const to = (parts[1] || parts[0])?.match(/^\d{4}-\d{2}-\d{2}$/)?.[0];
      if (text && (!from || !to)) return this.showToast('Usa YYYY-MM-DD → YYYY-MM-DD al pegar', true);
      value = { type: 'timeline', from: from || null, to: to || null };
    } else if (column.type === 'status') {
      value = { type: 'status', label: text, text, color: this.statusColor(column, text) };
    } else if (column.type === 'dropdown') {
      value = { type: 'dropdown', labels: text ? text.split(',').map(label => label.trim()).filter(Boolean) : [], text };
    } else if (column.type === 'people') {
      value = { type: 'people', text, names: text ? text.split(',').map(name => name.trim()).filter(Boolean) : [] };
    } else if (column.type === 'email') {
      value = { type: 'email', email: text, text };
    } else if (column.type === 'link') {
      value = { type: 'link', url: text, text };
    } else if (column.type === 'world_clock') {
      value = { type: 'world_clock', timezone: text, text };
    } else {
      value = { type: 'text', text, value: text };
    }

    const updated = await this.updateColumnValue(itemId, columnId, value);
    if (updated) {
      this.renderBoard();
      this.setActiveCell(itemId, columnId, { focus: false });
      this.showToast('Valor pegado');
    }
  };
})();
