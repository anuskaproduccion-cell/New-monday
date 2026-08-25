(() => {
  const previousDependencyCellHtml = app.dependencyCellHtml.bind(app);
  const previousBindBoardEvents = app.bindBoardEvents.bind(app);

  app.dependencySelectedItems = function dependencySelectedItems(item, value) {
    const candidates = this.boardItems().filter(other => String(other._id) !== String(item._id));
    const localIds = new Set((value?.linkedItemIds || []).map(String));
    const mondayIds = new Set((value?.linkedMondayItemIds || []).map(String));
    (value?.linkedItems || []).forEach(entry => {
      if (entry?.id) localIds.add(String(entry.id));
      if (entry?.mondayId || entry?.mondayItemId) mondayIds.add(String(entry.mondayId || entry.mondayItemId));
    });
    const names = new Set((value?.linkedItemNames || []).map(name => String(name || '').trim()).filter(Boolean));
    if (value?.text) String(value.text).split(/,|;/).map(name => name.trim()).filter(Boolean).forEach(name => names.add(name));

    return candidates.filter(candidate => localIds.has(String(candidate._id))
      || (candidate.mondayId && mondayIds.has(String(candidate.mondayId)))
      || names.has(String(candidate.name || '').trim()));
  };

  app.dependencyCellHtml = function dependencyCellHtmlWithMultiple(item, column, value) {
    const selected = this.dependencySelectedItems(item, value || {});
    const multiple = column?.settings?.allowMultipleItems !== false;
    const labels = selected.slice(0, 2).map(entry => `<span class="dependency-chip">${this.escapeHtml(entry.name)}</span>`).join('');
    const extra = selected.length > 2 ? `<span class="dependency-more">+${selected.length - 2}</span>` : '';
    return `<button class="dependency-cell-display ${selected.length ? 'has-dependencies' : 'is-empty'}" type="button" data-action="dependency-edit" data-id="${this.escapeAttr(item._id)}" data-column-id="${this.escapeAttr(column.id)}" aria-label="Editar ${this.escapeAttr(column.title || 'Dependencia')}">
      <span class="dependency-link-icon">↗</span><span class="dependency-chip-list">${labels || `<span class="dependency-placeholder">${multiple ? 'Vincular dependencias' : 'Vincular dependencia'}</span>`}${extra}</span>
    </button>`;
  };

  app.bindBoardEvents = function bindBoardEventsWithDependencyPicker() {
    previousBindBoardEvents();
    const content = document.getElementById('content');
    if (!content) return;
    content.querySelectorAll('[data-action="dependency-edit"]').forEach(button => button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      this.openDependencyPicker(button, button.dataset.id, button.dataset.columnId);
    }));
  };

  app.openDependencyPicker = function openDependencyPicker(anchor, itemId, columnId) {
    document.querySelectorAll('.dependency-picker-menu,.floating-menu,.status-menu').forEach(node => node.remove());
    const item = this.findItem(itemId);
    const column = this.effectiveColumns().find(entry => String(entry.id) === String(columnId));
    if (!item || !column) return;

    const value = this.valueFor(item, column) || {};
    const candidates = this.boardItems().filter(other => String(other._id) !== String(itemId));
    const selected = new Set(this.dependencySelectedItems(item, value).map(entry => String(entry._id)));
    const multiple = column.settings?.allowMultipleItems !== false;
    const strict = String(column.settings?.dependency_mode || '').toLowerCase() === 'strict';

    const menu = document.createElement('div');
    menu.className = 'floating-menu dependency-picker-menu';
    menu.innerHTML = `
      <div class="dependency-picker-title"><div><strong>${this.escapeHtml(column.title || 'Dependencia')}</strong><small>${multiple ? 'Puedes seleccionar varios elementos' : 'Selecciona un elemento'}${strict ? ' · modo Strict' : ''}</small></div></div>
      <label class="dependency-picker-search"><span>⌕</span><input type="search" data-dependency-search placeholder="Buscar elemento" autocomplete="off"></label>
      <div class="dependency-picker-list" data-dependency-list></div>
      <div class="dependency-picker-actions"><button type="button" data-dependency-clear>Quitar vínculos</button><span></span><button type="button" data-dependency-cancel>Cancelar</button><button type="button" class="dependency-apply" data-dependency-apply>Aplicar</button></div>
    `;

    const search = menu.querySelector('[data-dependency-search]');
    const list = menu.querySelector('[data-dependency-list]');

    const render = () => {
      const term = String(search.value || '').trim().toLowerCase();
      const visible = candidates.filter(candidate => !term || String(candidate.name || '').toLowerCase().includes(term));
      list.innerHTML = visible.map(candidate => {
        const active = selected.has(String(candidate._id));
        const group = this.effectiveGroups().find(entry => entry.id === candidate.groupId || entry.title === candidate.group);
        return `<button type="button" class="dependency-option ${active ? 'is-selected' : ''}" data-dependency-option="${this.escapeAttr(candidate._id)}"><span class="dependency-option-dot" style="background:${this.escapeAttr(group?.color || candidate.groupColor || '#579bfc')}"></span><span><strong>${this.escapeHtml(candidate.name)}</strong><small>${this.escapeHtml(group?.title || candidate.group || '')}</small></span><span class="dependency-option-check">${active ? '✓' : ''}</span></button>`;
      }).join('') || '<div class="dependency-picker-empty">No hay elementos que coincidan.</div>';

      list.querySelectorAll('[data-dependency-option]').forEach(button => button.addEventListener('click', () => {
        const id = String(button.dataset.dependencyOption);
        if (selected.has(id)) selected.delete(id);
        else {
          if (!multiple) selected.clear();
          selected.add(id);
        }
        render();
      }));
    };

    search.addEventListener('input', render);
    menu.querySelector('[data-dependency-clear]')?.addEventListener('click', () => { selected.clear(); render(); });
    menu.querySelector('[data-dependency-cancel]')?.addEventListener('click', () => menu.remove());
    menu.querySelector('[data-dependency-apply]')?.addEventListener('click', async () => {
      const linked = candidates.filter(candidate => selected.has(String(candidate._id)));
      const nextValue = {
        type: 'dependency',
        linkedItemIds: linked.map(candidate => String(candidate._id)),
        linkedMondayItemIds: linked.filter(candidate => candidate.mondayId).map(candidate => String(candidate.mondayId)),
        linkedItemNames: linked.map(candidate => candidate.name),
        linkedItems: linked.map(candidate => ({ id: String(candidate._id), mondayId: candidate.mondayId || null, name: candidate.name }))
      };
      await this.updateColumnValue(itemId, columnId, nextValue);
      menu.remove();
      this.renderBoard();
    });

    render();
    this.positionMenu(menu, anchor);
    requestAnimationFrame(() => search.focus());
  };
})();
