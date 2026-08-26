(() => {
  const baseCellHtml = app.cellHtml.bind(app);
  const baseBindBoardEvents = app.bindBoardEvents.bind(app);

  app.peopleNamesFromValue = function peopleNamesFromValue(value) {
    const explicit = Array.isArray(value?.names) ? value.names : [];
    const raw = explicit.length ? explicit : String(value?.text || '').split(/,|;/);
    return [...new Set(raw.map(name => String(name || '').trim()).filter(Boolean))];
  };

  app.peopleLimitForColumn = function peopleLimitForColumn(column) {
    const settings = column?.settings || {};
    const candidate = settings.maxAssignees ?? settings.max_assignees ?? settings.peopleLimit ?? settings.limit;
    if (candidate === null || candidate === undefined || candidate === '' || candidate === 'unlimited') return Infinity;
    const limit = Number(candidate);
    return [1, 2, 3].includes(limit) ? limit : Infinity;
  };

  app.peopleCandidates = function peopleCandidates(columnId) {
    const names = new Set();
    (this.crew || []).forEach(member => {
      const name = String(member?.name || '').trim();
      if (name && name !== '.') names.add(name);
    });
    (this.items || []).forEach(item => {
      const value = item?.columnValues?.[columnId];
      this.peopleNamesFromValue(value).forEach(name => names.add(name));
    });
    return [...names].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
  };

  app.cellHtml = function cellHtmlWithPeoplePicker(item, column, options = {}) {
    if (column?.type !== 'people') return baseCellHtml(item, column, options);
    const value = this.valueFor(item, column) || {};
    const names = this.peopleNamesFromValue(value);
    const visible = names.slice(0, 2);
    const rest = Math.max(0, names.length - visible.length);
    const avatars = visible.map(name => `<span class="people-avatar" title="${this.escapeAttr(name)}">${this.escapeHtml(this.initials(name) || '?')}</span>`).join('');
    return `<button class="people-cell-display ${names.length ? 'has-people' : 'is-empty'}" type="button" data-action="people-edit" data-id="${this.escapeAttr(item._id)}" data-column-id="${this.escapeAttr(column.id)}" aria-label="Editar ${this.escapeAttr(column.title || 'Personas')}">
      <span class="people-avatar-stack">${avatars || '<span class="people-avatar people-avatar-add">＋</span>'}${rest ? `<span class="people-more">+${rest}</span>` : ''}</span>
      <span class="people-cell-label">${this.escapeHtml(names.length ? names.join(', ') : 'Asignar')}</span>
    </button>`;
  };

  app.bindBoardEvents = function bindBoardEventsWithPeoplePicker() {
    baseBindBoardEvents();
    const content = document.getElementById('content');
    if (!content) return;
    content.querySelectorAll('[data-action="people-edit"]').forEach(button => {
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        this.openPeoplePicker(button, button.dataset.id, button.dataset.columnId);
      });
    });
  };

  app.openPeoplePicker = function openPeoplePicker(anchor, itemId, columnId) {
    document.querySelectorAll('.people-picker-menu,.floating-menu,.status-menu').forEach(node => node.remove());
    const item = this.findItem(itemId);
    const column = this.effectiveColumns().find(entry => String(entry.id) === String(columnId));
    if (!item || !column) return;

    const selected = new Set(this.peopleNamesFromValue(this.valueFor(item, column)));
    const candidates = this.peopleCandidates(columnId);
    const limit = this.peopleLimitForColumn(column);
    const menu = document.createElement('div');
    menu.className = 'floating-menu people-picker-menu';
    menu.innerHTML = `
      <div class="people-picker-title">${this.escapeHtml(column.title || 'Personas')}</div>
      <label class="people-picker-search"><span>⌕</span><input type="search" data-people-search placeholder="Buscar persona" autocomplete="off"></label>
      <div class="people-picker-limit">${Number.isFinite(limit) ? `Máximo ${limit} ${limit === 1 ? 'persona' : 'personas'}` : 'Asignación ilimitada'}</div>
      <div class="people-picker-list" data-people-list></div>
      <div class="people-picker-actions">
        <button type="button" data-people-clear>Quitar todos</button>
        <span></span>
        <button type="button" data-people-cancel>Cancelar</button>
        <button type="button" class="people-apply" data-people-apply>Aplicar</button>
      </div>
    `;

    const input = menu.querySelector('[data-people-search]');
    const list = menu.querySelector('[data-people-list]');

    const renderList = () => {
      const term = String(input.value || '').trim().toLowerCase();
      const filtered = candidates.filter(name => !term || name.toLowerCase().includes(term));
      list.innerHTML = `${filtered.map(name => `
        <button type="button" class="people-option ${selected.has(name) ? 'is-selected' : ''}" data-people-name="${this.escapeAttr(name)}">
          <span class="people-avatar">${this.escapeHtml(this.initials(name) || '?')}</span>
          <span>${this.escapeHtml(name)}</span>
          <span class="people-check">${selected.has(name) ? '✓' : ''}</span>
        </button>
      `).join('')}${!filtered.length ? `<div class="people-picker-empty">${term ? 'No hay personas conocidas con ese nombre.' : 'No hay personas disponibles todavía.'}</div>` : ''}`;

      list.querySelectorAll('[data-people-name]').forEach(button => button.addEventListener('click', () => {
        const name = button.dataset.peopleName;
        if (selected.has(name)) selected.delete(name);
        else {
          if (Number.isFinite(limit) && selected.size >= limit) {
            this.showToast(`Esta columna admite un máximo de ${limit}`, true);
            return;
          }
          selected.add(name);
        }
        renderList();
      }));
    };

    input.addEventListener('input', renderList);
    menu.querySelector('[data-people-clear]')?.addEventListener('click', () => {
      selected.clear();
      renderList();
    });
    menu.querySelector('[data-people-cancel]')?.addEventListener('click', () => menu.remove());
    menu.querySelector('[data-people-apply]')?.addEventListener('click', async () => {
      const names = [...selected];
      await this.updateColumnValue(itemId, columnId, {
        type: 'people',
        text: names.join(', '),
        names,
        personsAndTeams: []
      });
      menu.remove();
      this.renderBoard();
    });

    renderList();
    this.positionMenu(menu, anchor);
    requestAnimationFrame(() => input.focus());
  };
})();
