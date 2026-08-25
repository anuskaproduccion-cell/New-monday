(() => {
  const originalBulkToolbarHtml = app.bulkToolbarHtml;
  const originalBulkAction = app.bulkAction;

  app.bulkToolbarHtml = function bulkToolbarHtmlWithAdvancedActions() {
    if (!this.selectedItems.size) return originalBulkToolbarHtml.call(this);
    const statusColumns = this.effectiveColumns().filter(column => column.type === 'status');
    return `<div class="bulk-bar bulk-bar-advanced">
      <strong>${this.selectedItems.size} seleccionados</strong>
      <button data-bulk="move">Mover a grupo</button>
      ${statusColumns.length ? '<button data-bulk="status">Cambiar estado</button>' : ''}
      <button data-bulk="archive">Archivar</button>
      <button data-bulk="trash">Mover a papelera</button>
      <button data-bulk="clear">Cancelar</button>
    </div>`;
  };

  app.bulkRequest = async function bulkRequest(action, extra = {}) {
    const itemIds = [...this.selectedItems];
    if (!itemIds.length) return null;
    return this.api('/api/items/bulk', {
      method: 'POST',
      body: JSON.stringify({
        boardId: this.currentBoardId(),
        itemIds,
        action,
        ...extra
      })
    });
  };

  app.applyBulkResponse = function applyBulkResponse(response, { remove = false } = {}) {
    if (!response?.items) return;
    if (remove) {
      const changed = new Set(response.items.map(item => String(item._id)));
      this.items = this.items.filter(item => !changed.has(String(item._id)));
    } else {
      response.items.forEach(item => this.replaceItem(item));
    }
    this.selectedItems.clear();
    this.renderBoard();
  };

  app.openBulkMoveModal = function openBulkMoveModal() {
    const groups = this.effectiveGroups();
    if (!groups.length) return this.showToast('No hay grupos disponibles', true);
    this.openModal(`<form id="bulk-move-form" class="modal-card bulk-action-modal">
      <div class="modal-header"><div><h2>Mover elementos</h2><p>${this.selectedItems.size} seleccionados</p></div><button type="button" class="modal-close" data-close-modal>×</button></div>
      <label>Grupo de destino<select name="groupId">${groups.map(group => `<option value="${this.escapeAttr(group.id)}">${this.escapeHtml(group.title)}</option>`).join('')}</select></label>
      <div class="modal-actions"><button type="button" class="button" data-close-modal>Cancelar</button><button class="button primary">Mover</button></div>
    </form>`);
    document.getElementById('bulk-move-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const groupId = new FormData(event.currentTarget).get('groupId');
      try {
        const response = await this.bulkRequest('move', { groupId });
        this.closeModal();
        this.applyBulkResponse(response);
        this.showToast(`${response.count} elementos movidos`);
      } catch (err) { this.showToast(err.message, true); }
    });
  };

  app.bulkStatusLabels = function bulkStatusLabels(column) {
    return this.statusLabels(column).map(entry => ({ label: entry.label, color: entry.color }));
  };

  app.openBulkStatusModal = function openBulkStatusModal() {
    const columns = this.effectiveColumns().filter(column => column.type === 'status');
    if (!columns.length) return this.showToast('No hay columnas Estado', true);
    this.openModal(`<form id="bulk-status-form" class="modal-card bulk-action-modal">
      <div class="modal-header"><div><h2>Cambiar estado</h2><p>${this.selectedItems.size} seleccionados</p></div><button type="button" class="modal-close" data-close-modal>×</button></div>
      <label>Columna<select name="columnId">${columns.map(column => `<option value="${this.escapeAttr(column.id)}">${this.escapeHtml(column.title)}</option>`).join('')}</select></label>
      <label>Estado<select name="label"></select></label>
      <div class="modal-actions"><button type="button" class="button" data-close-modal>Cancelar</button><button class="button primary">Aplicar</button></div>
    </form>`);
    const form = document.getElementById('bulk-status-form');
    const columnSelect = form.querySelector('[name="columnId"]');
    const labelSelect = form.querySelector('[name="label"]');
    const refreshLabels = () => {
      const column = columns.find(entry => String(entry.id) === String(columnSelect.value)) || columns[0];
      const labels = this.bulkStatusLabels(column);
      labelSelect.innerHTML = `<option value="">Sin estado</option>${labels.map(entry => `<option value="${this.escapeAttr(entry.label)}">${this.escapeHtml(entry.label)}</option>`).join('')}`;
    };
    columnSelect.addEventListener('change', refreshLabels);
    refreshLabels();

    form.addEventListener('submit', async event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      try {
        const response = await this.bulkRequest('status', {
          columnId: String(data.get('columnId') || ''),
          label: String(data.get('label') || '')
        });
        this.closeModal();
        this.applyBulkResponse(response);
        this.showToast(`${response.count} estados actualizados`);
      } catch (err) { this.showToast(err.message, true); }
    });
  };

  app.bulkAction = async function bulkActionAdvanced(action) {
    if (action === 'clear') return originalBulkAction.call(this, action);
    if (action === 'move') return this.openBulkMoveModal();
    if (action === 'status') return this.openBulkStatusModal();

    const count = this.selectedItems.size;
    if (!count) return;
    if (action === 'archive' && !confirm(`¿Archivar ${count} elementos?`)) return;
    if (action === 'trash' && !confirm(`¿Mover ${count} elementos a la papelera?`)) return;

    if (action === 'archive' || action === 'trash') {
      try {
        const response = await this.bulkRequest(action);
        this.applyBulkResponse(response, { remove: true });
        this.showToast(action === 'archive' ? `${response.count} elementos archivados` : `${response.count} elementos movidos a papelera`);
      } catch (err) { this.showToast(err.message, true); }
      return;
    }

    return originalBulkAction.call(this, action);
  };
})();
