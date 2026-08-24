(() => {
  const FILTER_OPERATORS = [
    ['contains', 'contiene'],
    ['not_contains', 'no contiene'],
    ['equals', 'es exactamente'],
    ['not_equals', 'no es'],
    ['is_empty', 'está vacío'],
    ['not_empty', 'no está vacío'],
    ['greater_than', 'mayor que'],
    ['less_than', 'menor que'],
    ['before', 'antes de'],
    ['after', 'después de']
  ];

  const originalFilteredBoardItems = app.filteredBoardItems;
  const originalRenderViewTabs = app.renderViewTabs;
  const originalSelectBoard = app.selectBoard;

  app.viewQuery = { filters: [], sorts: [] };

  app.selectBoard = async function selectBoardWithQueryReset(board) {
    this.viewQuery.filters = [];
    this.viewQuery.sorts = [];
    return originalSelectBoard.call(this, board);
  };

  app.savedViewForCurrent = function savedViewForCurrent() {
    if (!String(this.currentView || '').startsWith('saved:')) return null;
    const id = String(this.currentView).slice(6);
    return (this.currentBoard?.views || []).find(view => String(view.id) === id) || null;
  };

  app.queryRulesForCurrent = function queryRulesForCurrent() {
    const view = this.savedViewForCurrent();
    if (!view) return this.viewQuery.filters || [];
    if (Array.isArray(view.filter?.rules)) return view.filter.rules;
    if (Array.isArray(view.filter)) return view.filter;
    return [];
  };

  app.querySortsForCurrent = function querySortsForCurrent() {
    const view = this.savedViewForCurrent();
    if (!view) return this.viewQuery.sorts || [];
    return Array.isArray(view.sort) ? view.sort.filter(sort => sort?.field) : [];
  };

  app.queryFieldOptions = function queryFieldOptions() {
    return [
      { id: 'name', title: 'Elemento', type: 'text' },
      { id: 'group', title: 'Grupo', type: 'text' },
      ...this.effectiveColumns().map(column => ({ id: column.id, title: column.title, type: column.type }))
    ];
  };

  app.queryColumnForField = function queryColumnForField(field) {
    return this.effectiveColumns().find(column => String(column.id) === String(field)) || null;
  };

  app.queryRawValue = function queryRawValue(item, field) {
    if (field === 'name') return item.name || '';
    if (field === 'group') return item.group || '';
    const column = this.queryColumnForField(field);
    if (!column) return '';
    return this.valueFor(item, column);
  };

  app.queryDisplayValue = function queryDisplayValue(item, field) {
    const raw = this.queryRawValue(item, field);
    const column = this.queryColumnForField(field);
    if (!column) return String(raw ?? '');
    if (column.type === 'timeline') return [raw?.from, raw?.to].filter(Boolean).join(' → ');
    if (column.type === 'date') return raw?.date || raw?.text || '';
    if (column.type === 'numbers' || column.type === 'formula') return raw?.value ?? raw?.displayValue ?? raw?.text ?? raw ?? '';
    if (typeof this.displayValue === 'function') return this.displayValue(raw);
    return raw?.displayValue ?? raw?.text ?? raw?.label ?? raw ?? '';
  };

  app.queryComparable = function queryComparable(item, field) {
    const column = this.queryColumnForField(field);
    const raw = this.queryRawValue(item, field);

    if (column?.type === 'numbers' || column?.type === 'formula') {
      const candidate = raw?.value ?? raw?.displayValue ?? raw?.text ?? raw;
      const number = Number(candidate);
      return { kind: 'number', value: Number.isFinite(number) ? number : null };
    }
    if (column?.type === 'date') {
      const time = Date.parse(raw?.date || raw?.text || '');
      return { kind: 'date', value: Number.isFinite(time) ? time : null };
    }
    if (column?.type === 'timeline') {
      const time = Date.parse(raw?.from || raw?.to || '');
      return { kind: 'date', value: Number.isFinite(time) ? time : null };
    }

    return { kind: 'text', value: String(this.queryDisplayValue(item, field) ?? '').trim().toLowerCase() };
  };

  app.queryMatchesRule = function queryMatchesRule(item, rule) {
    if (!rule?.field || !rule.operator) return true;
    const comparable = this.queryComparable(item, rule.field);
    const display = String(this.queryDisplayValue(item, rule.field) ?? '').trim();
    const leftText = display.toLowerCase();
    const rightText = String(rule.value ?? '').trim().toLowerCase();
    const empty = !display;

    if (rule.operator === 'is_empty') return empty;
    if (rule.operator === 'not_empty') return !empty;
    if (rule.operator === 'contains') return leftText.includes(rightText);
    if (rule.operator === 'not_contains') return !leftText.includes(rightText);
    if (rule.operator === 'equals') return leftText === rightText;
    if (rule.operator === 'not_equals') return leftText !== rightText;

    if (rule.operator === 'greater_than' || rule.operator === 'less_than') {
      const left = comparable.kind === 'number' ? comparable.value : Number(String(display).replace(',', '.'));
      const right = Number(String(rule.value ?? '').replace(',', '.'));
      if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
      return rule.operator === 'greater_than' ? left > right : left < right;
    }

    if (rule.operator === 'before' || rule.operator === 'after') {
      const left = comparable.kind === 'date' ? comparable.value : Date.parse(display);
      const right = Date.parse(String(rule.value || ''));
      if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
      return rule.operator === 'before' ? left < right : left > right;
    }

    return true;
  };

  app.querySortItems = function querySortItems(items, sorts) {
    if (!sorts?.length) return items;
    const withIndex = items.map((item, index) => ({ item, index }));
    withIndex.sort((leftEntry, rightEntry) => {
      for (const sort of sorts) {
        const left = this.queryComparable(leftEntry.item, sort.field);
        const right = this.queryComparable(rightEntry.item, sort.field);
        const direction = String(sort.direction || 'asc').toLowerCase() === 'desc' ? -1 : 1;
        let comparison = 0;

        if (left.value === null || left.value === '') comparison = (right.value === null || right.value === '') ? 0 : 1;
        else if (right.value === null || right.value === '') comparison = -1;
        else if (left.kind === 'number' || left.kind === 'date') comparison = left.value - right.value;
        else comparison = String(left.value).localeCompare(String(right.value), 'es', { numeric: true, sensitivity: 'base' });

        if (comparison !== 0) return comparison * direction;
      }
      return leftEntry.index - rightEntry.index;
    });
    return withIndex.map(entry => entry.item);
  };

  app.filteredBoardItems = function filteredBoardItemsWithQuery() {
    let items = originalFilteredBoardItems.call(this);
    const rules = this.queryRulesForCurrent();
    const sorts = this.querySortsForCurrent();
    if (rules.length) items = items.filter(item => rules.every(rule => this.queryMatchesRule(item, rule)));
    return this.querySortItems(items, sorts);
  };

  app.ensureQueryToolbar = function ensureQueryToolbar() {
    let host = document.getElementById('query-toolbar');
    if (host) return host;
    host = document.createElement('div');
    host.id = 'query-toolbar';
    host.className = 'query-toolbar';
    const tabs = document.getElementById('view-tabs');
    tabs?.insertAdjacentElement('afterend', host);
    return host;
  };

  app.renderQueryToolbar = function renderQueryToolbar() {
    const host = this.ensureQueryToolbar();
    if (!host || !this.currentBoard || this.currentView === 'crew') {
      if (host) host.hidden = true;
      return;
    }
    host.hidden = false;
    const rules = this.queryRulesForCurrent();
    const sorts = this.querySortsForCurrent();
    const view = this.savedViewForCurrent();
    host.innerHTML = `
      <div class="query-toolbar-left">
        <button type="button" class="query-button ${rules.length ? 'active' : ''}" data-query-action="filter">⌁ Filtrar${rules.length ? ` <span>${rules.length}</span>` : ''}</button>
        <button type="button" class="query-button ${sorts.length ? 'active' : ''}" data-query-action="sort">⇅ Ordenar${sorts.length ? ` <span>${sorts.length}</span>` : ''}</button>
        ${(rules.length || sorts.length) ? '<button type="button" class="query-button subtle" data-query-action="clear">Limpiar</button>' : ''}
      </div>
      <div class="query-toolbar-right">
        ${view ? `<span class="saved-view-badge">Vista guardada</span><button type="button" class="query-button" data-query-action="view-menu">${this.escapeHtml(view.name)} ▾</button>` : '<button type="button" class="query-button" data-query-action="save-view">Guardar como vista</button>'}
      </div>`;

    host.querySelector('[data-query-action="filter"]')?.addEventListener('click', () => this.openFilterModal());
    host.querySelector('[data-query-action="sort"]')?.addEventListener('click', () => this.openSortModal());
    host.querySelector('[data-query-action="clear"]')?.addEventListener('click', () => this.clearViewQuery());
    host.querySelector('[data-query-action="save-view"]')?.addEventListener('click', () => this.createSavedView());
    host.querySelector('[data-query-action="view-menu"]')?.addEventListener('click', event => this.openSavedViewMenu(event.currentTarget));
  };

  app.renderViewTabs = function renderViewTabsWithCreate() {
    originalRenderViewTabs.call(this);
    const host = document.getElementById('view-tabs');
    if (host && this.currentBoard) {
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'view-tab view-tab-add';
      add.textContent = '＋ Vista';
      add.addEventListener('click', () => this.createSavedView());
      host.appendChild(add);
    }
    this.renderQueryToolbar();
  };

  app.queryFieldSelectHtml = function queryFieldSelectHtml(selected = '') {
    return this.queryFieldOptions().map(field => `<option value="${this.escapeAttr(field.id)}" ${String(field.id) === String(selected) ? 'selected' : ''}>${this.escapeHtml(field.title)}</option>`).join('');
  };

  app.operatorSelectHtml = function operatorSelectHtml(selected = 'contains') {
    return FILTER_OPERATORS.map(([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`).join('');
  };

  app.queryConditionRowHtml = function queryConditionRowHtml(rule = {}) {
    const noValue = ['is_empty', 'not_empty'].includes(rule.operator);
    return `<div class="query-condition">
      <select data-query-field>${this.queryFieldSelectHtml(rule.field)}</select>
      <select data-query-operator>${this.operatorSelectHtml(rule.operator || 'contains')}</select>
      <input data-query-value value="${this.escapeAttr(rule.value || '')}" placeholder="Valor" ${noValue ? 'disabled' : ''}>
      <button type="button" class="query-row-remove" title="Eliminar">×</button>
    </div>`;
  };

  app.bindQueryConditionRow = function bindQueryConditionRow(row) {
    const operator = row.querySelector('[data-query-operator]');
    const input = row.querySelector('[data-query-value]');
    const sync = () => {
      const noValue = ['is_empty', 'not_empty'].includes(operator.value);
      input.disabled = noValue;
      if (noValue) input.value = '';
    };
    operator.addEventListener('change', sync);
    row.querySelector('.query-row-remove')?.addEventListener('click', () => row.remove());
    sync();
  };

  app.openFilterModal = function openFilterModal() {
    const rules = this.queryRulesForCurrent();
    const initial = rules.length ? rules : [{ field: 'name', operator: 'contains', value: '' }];
    this.openModal(`<form id="query-filter-form" class="modal-card query-modal">
      <div class="modal-header"><div><h2>Filtrar tablero</h2><p>Todas las condiciones deben cumplirse.</p></div><button type="button" class="modal-close" data-close-modal>×</button></div>
      <div id="query-filter-rows" class="query-rows">${initial.map(rule => this.queryConditionRowHtml(rule)).join('')}</div>
      <button type="button" class="button query-add-row" id="query-add-filter">＋ Añadir condición</button>
      <div class="modal-actions"><button type="button" class="button" data-close-modal>Cancelar</button><button class="button primary">Aplicar filtros</button></div>
    </form>`);
    const rows = document.getElementById('query-filter-rows');
    rows.querySelectorAll('.query-condition').forEach(row => this.bindQueryConditionRow(row));
    document.getElementById('query-add-filter')?.addEventListener('click', () => {
      rows.insertAdjacentHTML('beforeend', this.queryConditionRowHtml({ field: 'name', operator: 'contains', value: '' }));
      this.bindQueryConditionRow(rows.lastElementChild);
    });
    document.getElementById('query-filter-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const next = [...rows.querySelectorAll('.query-condition')].map(row => ({
        field: row.querySelector('[data-query-field]').value,
        operator: row.querySelector('[data-query-operator]').value,
        value: row.querySelector('[data-query-value]').value
      })).filter(rule => rule.field && rule.operator && (['is_empty', 'not_empty'].includes(rule.operator) || String(rule.value).trim() !== ''));
      await this.applyViewFilters(next);
      this.closeModal();
    });
  };

  app.sortRowHtml = function sortRowHtml(sort = {}) {
    return `<div class="query-condition query-sort-row">
      <select data-query-sort-field>${this.queryFieldSelectHtml(sort.field)}</select>
      <select data-query-sort-direction><option value="asc" ${sort.direction !== 'desc' ? 'selected' : ''}>Ascendente</option><option value="desc" ${sort.direction === 'desc' ? 'selected' : ''}>Descendente</option></select>
      <span class="sort-priority">prioridad</span>
      <button type="button" class="query-row-remove" title="Eliminar">×</button>
    </div>`;
  };

  app.openSortModal = function openSortModal() {
    const sorts = this.querySortsForCurrent();
    const initial = sorts.length ? sorts : [{ field: 'name', direction: 'asc' }];
    this.openModal(`<form id="query-sort-form" class="modal-card query-modal">
      <div class="modal-header"><div><h2>Ordenar tablero</h2><p>Los criterios se aplican de arriba abajo.</p></div><button type="button" class="modal-close" data-close-modal>×</button></div>
      <div id="query-sort-rows" class="query-rows">${initial.map(sort => this.sortRowHtml(sort)).join('')}</div>
      <button type="button" class="button query-add-row" id="query-add-sort">＋ Añadir criterio</button>
      <div class="modal-actions"><button type="button" class="button" data-close-modal>Cancelar</button><button class="button primary">Aplicar orden</button></div>
    </form>`);
    const rows = document.getElementById('query-sort-rows');
    rows.querySelectorAll('.query-row-remove').forEach(button => button.addEventListener('click', () => button.closest('.query-condition')?.remove()));
    document.getElementById('query-add-sort')?.addEventListener('click', () => {
      rows.insertAdjacentHTML('beforeend', this.sortRowHtml({ field: 'name', direction: 'asc' }));
      rows.lastElementChild.querySelector('.query-row-remove')?.addEventListener('click', () => rows.lastElementChild?.remove());
    });
    document.getElementById('query-sort-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const next = [...rows.querySelectorAll('.query-sort-row')].map(row => ({
        field: row.querySelector('[data-query-sort-field]').value,
        direction: row.querySelector('[data-query-sort-direction]').value
      })).filter(sort => sort.field);
      await this.applyViewSorts(next);
      this.closeModal();
    });
  };

  app.updateLocalView = function updateLocalView(updated) {
    const replaceIn = views => {
      const index = (views || []).findIndex(view => String(view.id) === String(updated.id));
      if (index >= 0) views[index] = updated;
    };
    replaceIn(this.currentBoard?.views);
    const board = this.boards.find(entry => String(entry._id) === String(this.currentBoardId()));
    if (board && board !== this.currentBoard) replaceIn(board.views);
  };

  app.persistCurrentSavedView = async function persistCurrentSavedView(patch) {
    const view = this.savedViewForCurrent();
    if (!view) return null;
    const updated = await this.api(`/api/boards/${this.currentBoardId()}/views/${encodeURIComponent(view.id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch)
    });
    this.updateLocalView(updated);
    return updated;
  };

  app.applyViewFilters = async function applyViewFilters(rules) {
    try {
      if (this.savedViewForCurrent()) await this.persistCurrentSavedView({ filter: { logic: 'and', rules } });
      else this.viewQuery.filters = rules;
      this.renderViewTabs();
      this.renderCurrentView();
      this.showToast(rules.length ? 'Filtros aplicados' : 'Filtros eliminados');
    } catch (err) { this.showToast(err.message, true); }
  };

  app.applyViewSorts = async function applyViewSorts(sorts) {
    try {
      if (this.savedViewForCurrent()) await this.persistCurrentSavedView({ sort: sorts });
      else this.viewQuery.sorts = sorts;
      this.renderViewTabs();
      this.renderCurrentView();
      this.showToast(sorts.length ? 'Orden aplicado' : 'Orden eliminado');
    } catch (err) { this.showToast(err.message, true); }
  };

  app.clearViewQuery = async function clearViewQuery() {
    try {
      if (this.savedViewForCurrent()) await this.persistCurrentSavedView({ filter: { logic: 'and', rules: [] }, sort: [] });
      else {
        this.viewQuery.filters = [];
        this.viewQuery.sorts = [];
      }
      this.renderViewTabs();
      this.renderCurrentView();
      this.showToast('Filtros y orden eliminados');
    } catch (err) { this.showToast(err.message, true); }
  };

  app.createSavedView = async function createSavedView() {
    if (!this.currentBoard) return;
    const name = prompt('Nombre de la nueva vista:', 'Nueva vista');
    if (!name?.trim()) return;
    try {
      const currentSaved = this.savedViewForCurrent();
      const type = currentSaved?.type || (this.currentView === 'gantt' ? 'gantt' : 'table');
      const created = await this.api(`/api/boards/${this.currentBoardId()}/views`, {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          type,
          filter: { logic: 'and', rules: this.queryRulesForCurrent() },
          sort: this.querySortsForCurrent(),
          settings: currentSaved?.settings || {}
        })
      });
      this.currentBoard.views = [...(this.currentBoard.views || []), created];
      const board = this.boards.find(entry => String(entry._id) === String(this.currentBoardId()));
      if (board && board !== this.currentBoard) board.views = this.currentBoard.views;
      this.currentView = `saved:${created.id}`;
      this.renderViewTabs();
      this.renderCurrentView();
      this.showToast('Vista creada');
    } catch (err) { this.showToast(err.message, true); }
  };

  app.openSavedViewMenu = function openSavedViewMenu(anchor) {
    const view = this.savedViewForCurrent();
    if (!view) return;
    document.querySelectorAll('.floating-menu').forEach(node => node.remove());
    const menu = document.createElement('div');
    menu.className = 'floating-menu';
    menu.innerHTML = `<div class="menu-title">${this.escapeHtml(view.name)}</div><button data-view-action="rename">Renombrar vista</button><button data-view-action="duplicate">⧉ Duplicar vista</button><button data-view-action="delete">Mover vista a papelera</button>`;
    menu.querySelector('[data-view-action="rename"]')?.addEventListener('click', async () => {
      const name = prompt('Nombre de la vista:', view.name);
      if (!name?.trim()) return;
      try {
        await this.persistCurrentSavedView({ name: name.trim() });
        menu.remove(); this.renderViewTabs(); this.showToast('Vista renombrada');
      } catch (err) { this.showToast(err.message, true); }
    });
    menu.querySelector('[data-view-action="duplicate"]')?.addEventListener('click', async () => {
      try {
        const duplicate = await this.api(`/api/boards/${this.currentBoardId()}/views/${encodeURIComponent(view.id)}/duplicate`, { method: 'POST', body: '{}' });
        this.currentBoard.views.push(duplicate);
        const board = this.boards.find(entry => String(entry._id) === String(this.currentBoardId()));
        if (board && board !== this.currentBoard) board.views = this.currentBoard.views;
        menu.remove(); this.currentView = `saved:${duplicate.id}`; this.renderViewTabs(); this.renderCurrentView(); this.showToast('Vista duplicada');
      } catch (err) { this.showToast(err.message, true); }
    });
    menu.querySelector('[data-view-action="delete"]')?.addEventListener('click', async () => {
      if (!confirm(`¿Eliminar la vista “${view.name}”? Los elementos del tablero no se borrarán.`)) return;
      try {
        await this.api(`/api/boards/${this.currentBoardId()}/views/${encodeURIComponent(view.id)}`, { method: 'DELETE' });
        this.currentBoard.views = (this.currentBoard.views || []).filter(entry => String(entry.id) !== String(view.id));
        const board = this.boards.find(entry => String(entry._id) === String(this.currentBoardId()));
        if (board && board !== this.currentBoard) board.views = this.currentBoard.views;
        menu.remove(); this.currentView = 'board'; this.renderViewTabs(); this.renderCurrentView(); this.showToast('Vista eliminada');
      } catch (err) { this.showToast(err.message, true); }
    });
    this.positionMenu(menu, anchor);
  };
})();
