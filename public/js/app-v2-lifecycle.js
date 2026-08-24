(() => {
  const originalRenderViewTabs = app.renderViewTabs;
  const originalRenderCurrentView = app.renderCurrentView;

  app.renderViewTabs = function renderViewTabsWithLifecycle() {
    originalRenderViewTabs.call(this);
    const host = document.getElementById('view-tabs');
    if (!host || !this.currentBoard) return;
    const extras = [
      { id: 'archive', name: 'Archivo' },
      { id: 'trash', name: 'Papelera' }
    ];
    extras.forEach(extra => {
      const button = document.createElement('button');
      button.className = `view-tab lifecycle-tab ${this.currentView === extra.id ? 'active' : ''}`;
      button.dataset.view = extra.id;
      button.textContent = extra.name;
      button.addEventListener('click', () => {
        this.currentView = extra.id;
        this.renderViewTabs();
        this.renderCurrentView();
      });
      host.appendChild(button);
    });
  };

  app.renderCurrentView = function renderCurrentViewWithLifecycle() {
    if (this.currentView === 'archive') return this.renderLifecycleView('archive');
    if (this.currentView === 'trash') return this.renderLifecycleView('trash');
    return originalRenderCurrentView.call(this);
  };

  app.renderLifecycleView = async function renderLifecycleView(kind) {
    const content = document.getElementById('content');
    if (!content || !this.currentBoard) return;
    content.innerHTML = '<div class="loading"><span class="spinner"></span>Cargando…</div>';
    try {
      const all = await this.api(`/api/items/board/${this.currentBoardId()}?includeDeleted=true&includeArchived=true&includeSubitems=true`);
      const items = all
        .filter(item => kind === 'trash' ? Boolean(item.deletedAt) : Boolean(item.archived) && !item.deletedAt)
        .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
      const title = kind === 'trash' ? 'Papelera' : 'Archivo';
      const description = kind === 'trash'
        ? 'Los elementos eliminados se conservan aquí y pueden restaurarse.'
        : 'Los elementos archivados dejan de aparecer en la tabla principal, pero siguen disponibles.';
      content.innerHTML = `<div class="lifecycle-shell"><div class="lifecycle-header"><div><h2>${title}</h2><p>${description}</p></div><span>${items.length} elementos</span></div>${items.length ? `<div class="lifecycle-list">${items.map(item => this.lifecycleItemHtml(item, kind)).join('')}</div>` : `<div class="lifecycle-empty">No hay elementos en ${title.toLowerCase()}.</div>`}</div>`;
      content.querySelectorAll('[data-lifecycle-restore]').forEach(button => button.addEventListener('click', async () => {
        const itemId = button.dataset.lifecycleRestore;
        try {
          const url = kind === 'trash' ? `/api/items/${itemId}/restore` : `/api/items/${itemId}/unarchive`;
          await this.api(url, { method: 'POST', body: '{}' });
          await this.reloadItems();
          await this.renderLifecycleView(kind);
          this.showToast('Elemento restaurado');
        } catch (err) { this.showToast(err.message, true); }
      }));
    } catch (err) {
      content.innerHTML = `<div class="connection-error"><span>!</span><div><h2>No se pudo cargar ${kind === 'trash' ? 'la papelera' : 'el archivo'}</h2><p>${this.escapeHtml(err.message)}</p></div></div>`;
    }
  };

  app.lifecycleItemHtml = function lifecycleItemHtml(item, kind) {
    const date = item.deletedAt || item.updatedAt || item.createdAt;
    let formatted = '';
    try { formatted = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date)); }
    catch { formatted = String(date || ''); }
    return `<article class="lifecycle-item"><div class="lifecycle-main"><strong>${this.escapeHtml(item.name || '')}</strong><span>${this.escapeHtml(item.group || 'Sin grupo')}${item.isSubitem ? ' · Subelemento' : ''}</span><small>${this.escapeHtml(formatted)}</small></div><button class="button" data-lifecycle-restore="${item._id}">${kind === 'trash' ? 'Restaurar' : 'Desarchivar'}</button></article>`;
  };
})();
