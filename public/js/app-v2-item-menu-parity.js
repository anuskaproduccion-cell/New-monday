(() => {
  app.focusItemNameEditor = function focusItemNameEditor(itemId) {
    const input = document.querySelector(`[data-name-id="${CSS.escape(String(itemId))}"]`);
    if (!input) return;
    input.focus();
    input.select?.();
  };

  app.openItemMoveMenu = function openItemMoveMenu(anchor, itemId, parentMenu) {
    parentMenu?.remove();
    document.querySelectorAll('.floating-menu').forEach(node => node.remove());
    const item = this.findItem(itemId);
    if (!item || !anchor?.isConnected) return;
    const groups = this.effectiveGroups();
    const menu = document.createElement('div');
    menu.className = 'floating-menu item-move-menu monday-item-menu';
    menu.innerHTML = `
      <div class="menu-title">Mover a grupo</div>
      <label class="item-menu-search"><span>⌕</span><input type="search" placeholder="Buscar grupo" autocomplete="off" data-item-group-search></label>
      <div class="item-group-list" data-item-group-list>
        ${groups.map(group => `<button type="button" data-move-group="${this.escapeAttr(group.id)}" data-search-text="${this.escapeAttr(String(group.title || '').toLowerCase())}"><span class="item-menu-color" style="--item-menu-color:${this.escapeAttr(group.color || '#579bfc')}"></span><span>${this.escapeHtml(group.title)}</span>${String(item.groupId || '') === String(group.id) ? '<small>Actual</small>' : ''}</button>`).join('')}
      </div>`;

    const input = menu.querySelector('[data-item-group-search]');
    const list = menu.querySelector('[data-item-group-list]');
    input?.addEventListener('input', () => {
      const term = String(input.value || '').trim().toLowerCase();
      list?.querySelectorAll('[data-move-group]').forEach(button => {
        button.hidden = Boolean(term) && !String(button.dataset.searchText || '').includes(term);
      });
    });
    menu.querySelectorAll('[data-move-group]').forEach(button => button.addEventListener('click', () => {
      if (String(item.groupId || '') === String(button.dataset.moveGroup)) return menu.remove();
      this.moveItem(itemId, button.dataset.moveGroup, menu);
    }));
    this.positionMenu(menu, anchor);
    requestAnimationFrame(() => input?.focus());
  };

  app.openItemMenu = function openMondayItemMenu(anchor, itemId) {
    document.querySelectorAll('.floating-menu').forEach(node => node.remove());
    const item = this.findItem(itemId);
    if (!item) return;

    const menu = document.createElement('div');
    menu.className = 'floating-menu monday-item-menu';
    menu.innerHTML = `
      <div class="item-menu-heading"><strong>${this.escapeHtml(item.name || 'Elemento')}</strong>${item.isSubitem ? '<small>Subitem</small>' : ''}</div>
      <button type="button" data-item-action="updates"><span class="item-menu-icon">💬</span><span>Actualizaciones</span></button>
      <button type="button" data-item-action="rename"><span class="item-menu-icon">✎</span><span>Cambiar nombre</span></button>
      <div class="menu-separator"></div>
      <button type="button" data-item-action="duplicate"><span class="item-menu-icon">⧉</span><span>Duplicar elemento</span></button>
      <button type="button" data-item-action="move"><span class="item-menu-icon">↪</span><span>Mover a grupo</span><span class="item-menu-caret">›</span></button>
      <div class="menu-separator"></div>
      <button type="button" data-item-action="archive"><span class="item-menu-icon">▣</span><span>Archivar</span></button>
      <button type="button" class="danger" data-item-action="trash"><span class="item-menu-icon">⌫</span><span>Mover a papelera</span></button>`;

    menu.querySelector('[data-item-action="updates"]')?.addEventListener('click', () => {
      menu.remove();
      this.openUpdatesPanel(itemId);
    });
    menu.querySelector('[data-item-action="rename"]')?.addEventListener('click', () => {
      menu.remove();
      requestAnimationFrame(() => this.focusItemNameEditor(itemId));
    });
    menu.querySelector('[data-item-action="duplicate"]')?.addEventListener('click', () => this.duplicateItem(itemId, menu));
    menu.querySelector('[data-item-action="move"]')?.addEventListener('click', () => this.openItemMoveMenu(anchor, itemId, menu));
    menu.querySelector('[data-item-action="archive"]')?.addEventListener('click', () => this.archiveItem(itemId, menu));
    menu.querySelector('[data-item-action="trash"]')?.addEventListener('click', () => this.trashItem(itemId, menu));
    this.positionMenu(menu, anchor);
  };
})();