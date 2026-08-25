(() => {
  app.openRenameColumnDialog = function openRenameColumnDialog(column) {
    this.openModal(`<form id="column-rename-form" class="modal-card compact-column-modal">
      <div class="modal-header"><div><h2>Renombrar columna</h2><p>${this.escapeHtml(column.type)}</p></div><button type="button" class="modal-close" data-close-modal>×</button></div>
      <label>Nombre<input name="title" maxlength="120" required autofocus value="${this.escapeAttr(column.title || '')}"></label>
      <div class="modal-actions"><button type="button" class="button" data-close-modal>Cancelar</button><button class="button primary">Guardar</button></div>
    </form>`);
    document.getElementById('column-rename-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const title = new FormData(event.currentTarget).get('title')?.trim();
      if (!title) return;
      await this.patchColumn(column.id, { title });
      this.closeModal();
    });
  };

  app.openFilterForColumn = function openFilterForColumn(columnId) {
    this.openFilterModal();
    const rows = document.getElementById('query-filter-rows');
    const first = rows?.querySelector('.query-condition');
    if (!first) return;
    const field = first.querySelector('[data-query-field]');
    if (field) field.value = columnId;
    first.querySelector('[data-query-value]')?.focus();
  };

  app.openColumnMenu = function openMondayColumnMenu(anchor, columnId) {
    document.querySelectorAll('.floating-menu,.status-menu').forEach(node => node.remove());
    const column = (this.currentBoard?.columns || []).find(entry => String(entry.id) === String(columnId));
    if (!column) return;
    const summaryEnabled = Boolean(column.settings?.showSummary);
    const menu = document.createElement('div');
    menu.className = 'floating-menu monday-column-menu';
    menu.innerHTML = `
      <div class="menu-title">${this.escapeHtml(column.title)}</div>
      <button data-column-action="sort-asc" type="button"><span>↑ Ordenar ascendente</span></button>
      <button data-column-action="sort-desc" type="button"><span>↓ Ordenar descendente</span></button>
      <button data-column-action="filter" type="button"><span>⌁ Filtrar por esta columna</span></button>
      <div class="menu-separator"></div>
      <button data-column-action="rename" type="button"><span>✎ Renombrar</span></button>
      <button data-column-action="settings" type="button"><span>⚙ Configurar columna</span></button>
      <button data-column-action="summary" type="button"><span>${summaryEnabled ? '✓ ' : ''}Mostrar resumen de columna</span></button>
      <button data-column-action="pin" type="button"><span>${column.pinned ? 'Desfijar' : 'Fijar'} columna</span></button>
      <button data-column-action="hide" type="button"><span>Ocultar columna</span></button>
      <div class="menu-separator"></div>
      <button data-column-action="duplicate" type="button"><span>⧉ Duplicar columna</span></button>
    `;

    menu.querySelector('[data-column-action="sort-asc"]')?.addEventListener('click', async () => {
      menu.remove();
      await this.applyViewSorts([{ field: column.id, direction: 'asc' }]);
    });
    menu.querySelector('[data-column-action="sort-desc"]')?.addEventListener('click', async () => {
      menu.remove();
      await this.applyViewSorts([{ field: column.id, direction: 'desc' }]);
    });
    menu.querySelector('[data-column-action="filter"]')?.addEventListener('click', () => {
      menu.remove();
      this.openFilterForColumn(column.id);
    });
    menu.querySelector('[data-column-action="rename"]')?.addEventListener('click', () => {
      menu.remove();
      this.openRenameColumnDialog(column);
    });
    menu.querySelector('[data-column-action="settings"]')?.addEventListener('click', () => {
      menu.remove();
      this.openColumnSettingsModal?.(column.id);
    });
    menu.querySelector('[data-column-action="summary"]')?.addEventListener('click', async () => {
      menu.remove();
      await this.patchColumn(column.id, { settings: { ...(column.settings || {}), showSummary: !summaryEnabled } });
    });
    menu.querySelector('[data-column-action="pin"]')?.addEventListener('click', async () => {
      menu.remove();
      await this.patchColumn(column.id, { pinned: !column.pinned });
    });
    menu.querySelector('[data-column-action="hide"]')?.addEventListener('click', async () => {
      menu.remove();
      await this.patchColumn(column.id, { hidden: true });
    });
    menu.querySelector('[data-column-action="duplicate"]')?.addEventListener('click', async () => {
      try {
        const duplicate = await this.api(`/api/boards/${this.currentBoardId()}/columns/${encodeURIComponent(column.id)}/duplicate`, {
          method: 'POST',
          body: JSON.stringify({ includeValues: true })
        });
        menu.remove();
        await this.reloadBoardState();
        this.showToast(`Columna duplicada: ${duplicate.title}`);
      } catch (err) {
        this.showToast(err.message, true);
      }
    });
    this.positionMenu(menu, anchor);
  };
})();
