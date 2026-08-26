(() => {
  app.boardLifecycleViewStillCurrent = function boardLifecycleViewStillCurrent(boardId, viewId) {
    return String(this.currentBoardId?.() || '') === String(boardId || '')
      && String(this.currentView || '') === String(viewId || '');
  };

  app.renderBoardActivity = async function renderBoardActivityNavigationSafe() {
    const content = document.getElementById('content');
    const boardId = String(this.currentBoardId?.() || '');
    const viewId = 'activity';
    if (!content || !boardId) return;

    content.innerHTML = '<div class="loading"><span class="spinner"></span>Cargando actividad…</div>';
    try {
      const events = await this.api(`/api/activity/board/${encodeURIComponent(boardId)}?limit=300`);
      if (!this.boardLifecycleViewStillCurrent(boardId, viewId)) return;

      const itemNames = new Map(this.items.map(item => [String(item._id), item.name]));
      content.innerHTML = `<div class="lifecycle-shell"><div class="lifecycle-header"><div><h2>Actividad</h2><p>Historial local de cambios realizados dentro de New Monday.</p></div><span>${events.length} eventos</span></div>${events.length ? `<div class="board-activity-list">${events.map(event => {
        let date = '';
        try { date = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.createdAt)); }
        catch { date = String(event.createdAt || ''); }
        const itemName = event.item ? itemNames.get(String(event.item)) : '';
        return `<article class="board-activity-event"><span class="activity-dot"></span><div><strong>${this.escapeHtml(event.message || event.type)}</strong><span>${this.escapeHtml(itemName || '')}${itemName && event.field ? ' · ' : ''}${this.escapeHtml(event.field || '')}</span><small>${this.escapeHtml(date)}</small></div></article>`;
      }).join('')}</div>` : '<div class="lifecycle-empty">Todavía no hay actividad local registrada.</div>'}</div>`;
    } catch (error) {
      if (!this.boardLifecycleViewStillCurrent(boardId, viewId)) return;
      content.innerHTML = `<div class="connection-error"><span>!</span><div><h2>No se pudo cargar la actividad</h2><p>${this.escapeHtml(error.message)}</p></div></div>`;
    }
  };

  app.renderLifecycleView = async function renderLifecycleViewNavigationSafe(kind) {
    const content = document.getElementById('content');
    const boardId = String(this.currentBoardId?.() || '');
    const viewId = String(kind || '');
    if (!content || !boardId || !['archive', 'trash'].includes(viewId)) return;

    content.innerHTML = '<div class="loading"><span class="spinner"></span>Cargando…</div>';
    try {
      const all = await this.api(`/api/items/board/${encodeURIComponent(boardId)}?includeDeleted=true&includeArchived=true&includeSubitems=true`);
      if (!this.boardLifecycleViewStillCurrent(boardId, viewId)) return;

      const items = all
        .filter(item => viewId === 'trash' ? Boolean(item.deletedAt) : Boolean(item.archived) && !item.deletedAt)
        .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
      const title = viewId === 'trash' ? 'Papelera' : 'Archivo';
      const description = viewId === 'trash'
        ? 'Los elementos eliminados se conservan aquí y pueden restaurarse.'
        : 'Los elementos archivados dejan de aparecer en la tabla principal, pero siguen disponibles.';

      content.innerHTML = `<div class="lifecycle-shell"><div class="lifecycle-header"><div><h2>${title}</h2><p>${description}</p></div><span>${items.length} elementos</span></div>${items.length ? `<div class="lifecycle-list">${items.map(item => this.lifecycleItemHtml(item, viewId)).join('')}</div>` : `<div class="lifecycle-empty">No hay elementos en ${title.toLowerCase()}.</div>`}</div>`;

      content.querySelectorAll('[data-lifecycle-restore]').forEach(button => button.addEventListener('click', async () => {
        const itemId = String(button.dataset.lifecycleRestore || '');
        const actionBoardId = boardId;
        const actionViewId = viewId;
        if (!itemId) return;

        button.disabled = true;
        try {
          const url = actionViewId === 'trash' ? `/api/items/${encodeURIComponent(itemId)}/restore` : `/api/items/${encodeURIComponent(itemId)}/unarchive`;
          const restoredItem = await this.api(url, { method: 'POST', body: '{}' });
          this.replaceItem?.(restoredItem);

          if (this.boardLifecycleViewStillCurrent(actionBoardId, actionViewId)) {
            await this.renderLifecycleView(actionViewId);
          }
          this.showToast('Elemento restaurado');
        } catch (error) {
          if (this.boardLifecycleViewStillCurrent(actionBoardId, actionViewId)) button.disabled = false;
          this.showToast(error.message, true);
        }
      }));
    } catch (error) {
      if (!this.boardLifecycleViewStillCurrent(boardId, viewId)) return;
      content.innerHTML = `<div class="connection-error"><span>!</span><div><h2>No se pudo cargar ${viewId === 'trash' ? 'la papelera' : 'el archivo'}</h2><p>${this.escapeHtml(error.message)}</p></div></div>`;
    }
  };
})();
