(() => {
  const previousCellHtml = app.cellHtml.bind(app);
  const previousBindBoardEvents = app.bindBoardEvents.bind(app);

  app.dropdownOptions = function dropdownOptions(column) {
    const raw = column?.settings?.labels || [];
    if (Array.isArray(raw)) {
      return raw.map((entry, index) => {
        if (typeof entry === 'string') return { id: String(index), label: entry, color: '#579bfc' };
        return {
          id: String(entry?.id ?? index),
          label: String(entry?.label ?? entry?.name ?? ''),
          color: entry?.color || entry?.hex || '#579bfc'
        };
      }).filter(entry => entry.label);
    }
    if (raw && typeof raw === 'object') {
      return Object.entries(raw).map(([id, entry]) => {
        if (typeof entry === 'string') return { id, label: entry, color: '#579bfc' };
        return { id, label: String(entry?.label ?? entry?.name ?? ''), color: entry?.color || entry?.hex || '#579bfc' };
      }).filter(entry => entry.label);
    }
    return [];
  };

  app.dropdownSelectedLabels = function dropdownSelectedLabels(value) {
    if (Array.isArray(value?.labels)) return value.labels.map(String).filter(Boolean);
    if (value?.label) return [String(value.label)];
    return String(value?.text || '').split(',').map(label => label.trim()).filter(Boolean);
  };

  app.cellHtml = function cellHtmlWithDropdownPicker(item, column, options = {}) {
    if (column?.type !== 'dropdown') return previousCellHtml(item, column, options);
    const value = this.valueFor(item, column) || {};
    const selected = this.dropdownSelectedLabels(value);
    const optionsMap = new Map(this.dropdownOptions(column).map(option => [option.label, option]));
    const visible = selected.slice(0, 2).map(label => {
      const option = optionsMap.get(label) || { color: '#579bfc' };
      return `<span class="dropdown-chip" style="--dropdown-color:${this.escapeAttr(option.color || '#579bfc')}">${this.escapeHtml(label)}</span>`;
    }).join('');
    const extra = selected.length > 2 ? `<span class="dropdown-more">+${selected.length - 2}</span>` : '';
    return `<button type="button" class="dropdown-cell-display ${selected.length ? 'has-values' : 'is-empty'}" data-action="dropdown-edit" data-id="${this.escapeAttr(item._id)}" data-column-id="${this.escapeAttr(column.id)}"><span class="dropdown-chip-list">${visible || '<span class="dropdown-placeholder">Seleccionar</span>'}${extra}</span><span class="dropdown-caret">⌄</span></button>`;
  };

  app.bindBoardEvents = function bindBoardEventsWithDropdownPicker() {
    previousBindBoardEvents();
    const content = document.getElementById('content');
    if (!content) return;
    content.querySelectorAll('[data-action="dropdown-edit"]').forEach(button => button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      this.openDropdownPicker(button, button.dataset.id, button.dataset.columnId);
    }));
  };

  app.openDropdownPicker = function openDropdownPicker(anchor, itemId, columnId) {
    document.querySelectorAll('.dropdown-picker-menu,.floating-menu,.status-menu').forEach(node => node.remove());
    const item = this.findItem(itemId);
    const column = this.effectiveColumns().find(entry => String(entry.id) === String(columnId));
    if (!item || !column) return;
    const options = this.dropdownOptions(column);
    const selected = new Set(this.dropdownSelectedLabels(this.valueFor(item, column) || {}));

    const menu = document.createElement('div');
    menu.className = 'floating-menu dropdown-picker-menu';
    menu.innerHTML = `<div class="dropdown-picker-title">${this.escapeHtml(column.title || 'Dropdown')}</div><label class="dropdown-picker-search"><span>⌕</span><input type="search" data-dropdown-search placeholder="Buscar etiqueta" autocomplete="off"></label><div class="dropdown-picker-list" data-dropdown-list></div><div class="dropdown-picker-actions"><button type="button" data-dropdown-clear>Limpiar</button><span></span><button type="button" data-dropdown-cancel>Cancelar</button><button type="button" class="dropdown-apply" data-dropdown-apply>Aplicar</button></div>`;

    const search = menu.querySelector('[data-dropdown-search]');
    const list = menu.querySelector('[data-dropdown-list]');
    const render = () => {
      const term = String(search.value || '').trim().toLowerCase();
      const visible = options.filter(option => !term || option.label.toLowerCase().includes(term));
      list.innerHTML = visible.map(option => {
        const active = selected.has(option.label);
        return `<button type="button" class="dropdown-option ${active ? 'is-selected' : ''}" data-dropdown-option="${this.escapeAttr(option.label)}"><span class="dropdown-option-dot" style="background:${this.escapeAttr(option.color || '#579bfc')}"></span><span>${this.escapeHtml(option.label)}</span><span class="dropdown-option-check">${active ? '✓' : ''}</span></button>`;
      }).join('') || '<div class="dropdown-picker-empty">No hay etiquetas que coincidan.</div>';
      list.querySelectorAll('[data-dropdown-option]').forEach(button => button.addEventListener('click', () => {
        const label = button.dataset.dropdownOption;
        if (selected.has(label)) selected.delete(label);
        else selected.add(label);
        render();
      }));
    };

    search.addEventListener('input', render);
    menu.querySelector('[data-dropdown-clear]')?.addEventListener('click', () => { selected.clear(); render(); });
    menu.querySelector('[data-dropdown-cancel]')?.addEventListener('click', () => menu.remove());
    menu.querySelector('[data-dropdown-apply]')?.addEventListener('click', async () => {
      const labels = [...selected];
      await this.updateColumnValue(itemId, columnId, { type: 'dropdown', labels, text: labels.join(', ') });
      menu.remove();
      this.renderBoard();
    });

    render();
    this.positionMenu(menu, anchor);
    requestAnimationFrame(() => search.focus());
  };
})();
