(() => {
  const baseRenderViewTabs = app.renderViewTabs.bind(app);

  app.replaceSavedView = function replaceSavedView(updated) {
    if (!updated || !this.currentBoard) return;
    const views = [...(this.currentBoard.views || [])];
    const index = views.findIndex(view => String(view.id) === String(updated.id));
    if (index >= 0) views[index] = updated;
    else views.push(updated);
    this.currentBoard.views = views;
    const cached = this.boards.find(board => String(board._id) === String(this.currentBoard._id));
    if (cached) cached.views = views;
  };

  app.openSavedViewRenameMenu = function openSavedViewRenameMenu(anchor, viewId) {
    document.querySelectorAll('.floating-menu').forEach(node => node.remove());
    const view = (this.currentBoard?.views || []).find(entry => String(entry.id) === String(viewId));
    if (!view) return;
    const menu = document.createElement('form');
    menu.className = 'floating-menu view-rename-menu';
    menu.innerHTML = `<div class="menu-title">Cambiar nombre</div><input name="name" value="${this.escapeAttr(view.name || '')}" maxlength="120" autocomplete="off" aria-label="Nombre de la vista"><div class="view-rename-actions"><button type="button" data-view-rename-cancel>Cancelar</button><button type="submit" class="view-rename-save">Guardar</button></div>`;
    menu.querySelector('[data-view-rename-cancel]')?.addEventListener('click', () => menu.remove());
    menu.addEventListener('submit', async event => {
      event.preventDefault();
      const name = String(new FormData(menu).get('name') || '').trim();
      if (!name || name === view.name) return menu.remove();
      try {
        const updated = await this.api(`/api/boards/${this.currentBoardId()}/views/${encodeURIComponent(view.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ name })
        });
        this.replaceSavedView(updated);
        menu.remove();
        this.renderViewTabs();
        this.showToast('Vista renombrada');
      } catch (err) {
        this.showToast(err.message, true);
      }
    });
    this.positionMenu(menu, anchor);
    requestAnimationFrame(() => {
      const input = menu.querySelector('input[name="name"]');
      input?.focus();
      input?.select();
    });
  };

  app.duplicateSavedViewFromTab = async function duplicateSavedViewFromTab(viewId, menu) {
    const view = (this.currentBoard?.views || []).find(entry => String(entry.id) === String(viewId));
    if (!view) return;
    try {
      const duplicate = await this.api(`/api/boards/${this.currentBoardId()}/views/${encodeURIComponent(view.id)}/duplicate`, {
        method: 'POST',
        body: JSON.stringify({ name: this.uniqueViewName(`${view.name} (copia)`) })
      });
      this.currentBoard.views = [...(this.currentBoard.views || []), duplicate];
      const cached = this.boards.find(board => String(board._id) === String(this.currentBoard._id));
      if (cached) cached.views = this.currentBoard.views;
      menu?.remove();
      this.currentView = `saved:${duplicate.id}`;
      this.renderViewTabs();
      this.renderCurrentView();
      this.showToast('Vista duplicada');
    } catch (err) {
      this.showToast(err.message, true);
    }
  };

  app.deleteSavedViewFromTab = async function deleteSavedViewFromTab(viewId, menu) {
    const view = (this.currentBoard?.views || []).find(entry => String(entry.id) === String(viewId));
    if (!view) return;
    if (!window.confirm(`¿Eliminar la vista “${view.name}”? Los elementos del tablero no se eliminarán.`)) return;
    try {
      await this.api(`/api/boards/${this.currentBoardId()}/views/${encodeURIComponent(view.id)}`, { method: 'DELETE' });
      this.currentBoard.views = (this.currentBoard.views || []).filter(entry => String(entry.id) !== String(view.id));
      const cached = this.boards.find(board => String(board._id) === String(this.currentBoard._id));
      if (cached) cached.views = this.currentBoard.views;
      if (this.currentView === `saved:${view.id}`) this.currentView = 'board';
      menu?.remove();
      this.renderViewTabs();
      this.renderCurrentView();
      this.showToast('Vista eliminada');
    } catch (err) {
      this.showToast(err.message, true);
    }
  };

  app.openSavedViewTabMenu = function openSavedViewTabMenu(anchor, viewId) {
    document.querySelectorAll('.floating-menu').forEach(node => node.remove());
    const view = (this.currentBoard?.views || []).find(entry => String(entry.id) === String(viewId));
    if (!view) return;
    const active = this.currentView === `saved:${view.id}`;
    const menu = document.createElement('div');
    menu.className = 'floating-menu saved-view-tab-menu';
    menu.innerHTML = `
      <div class="menu-title">${this.escapeHtml(view.name)}</div>
      ${active ? '' : '<button type="button" data-view-tab-action="open"><span>↗ Abrir vista</span></button>'}
      <button type="button" data-view-tab-action="rename"><span>✎ Cambiar nombre</span></button>
      <button type="button" data-view-tab-action="duplicate"><span>⧉ Duplicar vista</span></button>
      <div class="menu-separator"></div>
      <button type="button" class="danger" data-view-tab-action="delete"><span>Eliminar vista</span></button>`;
    menu.querySelector('[data-view-tab-action="open"]')?.addEventListener('click', () => {
      menu.remove();
      this.currentView = `saved:${view.id}`;
      this.renderViewTabs();
      this.renderCurrentView();
    });
    menu.querySelector('[data-view-tab-action="rename"]')?.addEventListener('click', () => {
      menu.remove();
      this.openSavedViewRenameMenu(anchor, view.id);
    });
    menu.querySelector('[data-view-tab-action="duplicate"]')?.addEventListener('click', () => this.duplicateSavedViewFromTab(view.id, menu));
    menu.querySelector('[data-view-tab-action="delete"]')?.addEventListener('click', () => this.deleteSavedViewFromTab(view.id, menu));
    this.positionMenu(menu, anchor);
  };

  app.decorateSavedViewTabMenus = function decorateSavedViewTabMenus() {
    const host = document.getElementById('view-tabs');
    if (!host) return;
    host.querySelectorAll('.view-tab[data-view^="saved:"]').forEach(button => {
      if (button.dataset.viewMenuEnhanced === 'true') return;
      const viewId = String(button.dataset.view || '').replace(/^saved:/, '');
      const view = (this.currentBoard?.views || []).find(entry => String(entry.id) === viewId);
      if (!view) return;
      button.dataset.viewMenuEnhanced = 'true';
      button.classList.add('view-tab-with-menu');
      const label = document.createElement('span');
      label.className = 'view-tab-label';
      label.textContent = view.name;
      const caret = document.createElement('span');
      caret.className = 'view-tab-caret';
      caret.textContent = '⌄';
      caret.setAttribute('role', 'button');
      caret.setAttribute('aria-label', `Menú de ${view.name}`);
      caret.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        this.openSavedViewTabMenu(button, viewId);
      });
      button.replaceChildren(label, caret);
      button.addEventListener('contextmenu', event => {
        event.preventDefault();
        this.openSavedViewTabMenu(button, viewId);
      });
      button.addEventListener('keydown', event => {
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
          event.preventDefault();
          this.openSavedViewTabMenu(button, viewId);
        }
      });
    });
  };

  app.renderViewTabs = function renderViewTabsWithInlineMenus() {
    baseRenderViewTabs();
    this.decorateSavedViewTabMenus();
  };
})();