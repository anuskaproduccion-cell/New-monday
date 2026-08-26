(() => {
  const previousCellHtml = app.cellHtml.bind(app);
  const previousBindBoardEvents = app.bindBoardEvents.bind(app);

  function normalizeDate(value) {
    const raw = String(value || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
  }

  function formatDate(value) {
    const raw = normalizeDate(value);
    if (!raw) return '';
    const [year, month, day] = raw.split('-');
    return `${day}/${month}/${year}`;
  }

  app.cellHtml = function cellHtmlWithCompactDate(item, column, options = {}) {
    if (column?.type !== 'date') return previousCellHtml(item, column, options);
    const value = this.valueFor(item, column) || {};
    const date = normalizeDate(value.date || value.text || this.displayValue(value));
    return `<button class="date-cell-display ${date ? 'has-value' : 'is-empty'}" type="button" data-action="date-edit" data-id="${this.escapeAttr(item._id)}" data-column-id="${this.escapeAttr(column.id)}" aria-label="Editar ${this.escapeAttr(column.title || 'Fecha')}"><span class="date-cell-icon">▣</span><span>${this.escapeHtml(date ? formatDate(date) : 'Añadir fecha')}</span></button>`;
  };

  app.bindBoardEvents = function bindBoardEventsWithDatePicker() {
    previousBindBoardEvents();
    const content = document.getElementById('content');
    if (!content) return;
    content.querySelectorAll('[data-action="date-edit"]').forEach(button => button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      this.openDateEditor(button, button.dataset.id, button.dataset.columnId);
    }));
  };

  app.openDateEditor = function openDateEditor(anchor, itemId, columnId) {
    document.querySelectorAll('.date-editor-menu,.floating-menu,.status-menu').forEach(node => node.remove());
    const item = this.findItem(itemId);
    const column = this.effectiveColumns().find(entry => String(entry.id) === String(columnId));
    if (!item || !column) return;
    const value = this.valueFor(item, column) || {};
    const date = normalizeDate(value.date || value.text || this.displayValue(value));

    const menu = document.createElement('div');
    menu.className = 'floating-menu date-editor-menu';
    menu.innerHTML = `<div class="date-editor-title">${this.escapeHtml(column.title || 'Fecha')}</div><input type="date" data-date-editor value="${this.escapeAttr(date)}"><div class="date-editor-actions"><button type="button" data-date-clear>Borrar</button><span></span><button type="button" data-date-cancel>Cancelar</button><button type="button" class="date-save" data-date-save>Guardar</button></div>`;
    const input = menu.querySelector('[data-date-editor]');
    menu.querySelector('[data-date-clear]')?.addEventListener('click', async () => {
      await this.updateColumnValue(itemId, columnId, { type: 'date', date: null, text: '' });
      menu.remove();
      this.renderBoard();
    });
    menu.querySelector('[data-date-cancel]')?.addEventListener('click', () => menu.remove());
    menu.querySelector('[data-date-save]')?.addEventListener('click', async () => {
      const next = input.value || null;
      await this.updateColumnValue(itemId, columnId, { type: 'date', date: next, text: next || '' });
      menu.remove();
      this.renderBoard();
    });
    this.positionMenu(menu, anchor);
    requestAnimationFrame(() => input.focus());
  };
})();
