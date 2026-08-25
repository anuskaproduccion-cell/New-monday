(() => {
  const COLUMN_TYPES = [
    ['text', 'Texto'],
    ['numbers', 'Números'],
    ['status', 'Estado'],
    ['people', 'Personas'],
    ['timeline', 'Cronograma'],
    ['date', 'Fecha'],
    ['world_clock', 'Reloj mundial'],
    ['dropdown', 'Dropdown'],
    ['email', 'Email'],
    ['link', 'Enlace']
  ];

  const originalRenderQueryToolbar = app.renderQueryToolbar;
  const originalOpenColumnMenu = app.openColumnMenu;

  app.renderQueryToolbar = function renderQueryToolbarWithColumns() {
    originalRenderQueryToolbar.call(this);
    const host = document.getElementById('query-toolbar');
    if (!host || host.hidden || !this.currentBoard) return;
    if (['crew', 'archive', 'trash', 'activity'].includes(this.currentView)) return;

    let tools = host.querySelector('.column-admin-tools');
    if (!tools) {
      tools = document.createElement('div');
      tools.className = 'column-admin-tools';
      const right = host.querySelector('.query-toolbar-right') || host;
      right.prepend(tools);
    }
    tools.innerHTML = '<button type="button" class="query-button" data-column-admin="add">＋ Columna</button><button type="button" class="query-button" data-column-admin="manage">Gestionar columnas</button>';
    tools.querySelector('[data-column-admin="add"]')?.addEventListener('click', () => this.openCreateColumnModal());
    tools.querySelector('[data-column-admin="manage"]')?.addEventListener('click', () => this.openManageColumnsModal());
  };

  app.columnTypeOptionsHtml = function columnTypeOptionsHtml(selected = 'text') {
    return COLUMN_TYPES.map(([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`).join('');
  };

  app.columnLabelsText = function columnLabelsText(column) {
    const labels = column?.settings?.labels;
    if (Array.isArray(labels)) return labels.map(label => label?.label ?? label?.name ?? String(label ?? '')).filter(Boolean).join('\n');
    if (labels && typeof labels === 'object') return Object.values(labels).map(label => typeof label === 'string' ? label : label?.label || '').filter(Boolean).join('\n');
    return '';
  };

  app.labelsSettingsFromText = function labelsSettingsFromText(text, type) {
    const labels = String(text || '').split(/\n|,/).map(label => label.trim()).filter(Boolean);
    if (!['status', 'dropdown'].includes(type)) return {};
    return {
      labels: labels.map((label, index) => ({
        id: index,
        label,
        ...(type === 'status' ? { hex: ['#00c875', '#fdab3d', '#df2f4a', '#579bfc', '#a25ddc', '#ff642e'][index % 6] } : {})
      }))
    };
  };

  app.openCreateColumnModal = function openCreateColumnModal() {
    this.openModal(`<form id="column-create-form" class="modal-card column-settings-modal">
      <div class="modal-header"><div><h2>Nueva columna</h2><p>Se crea solo en New Monday.</p></div><button type="button" class="modal-close" data-close-modal>×</button></div>
      <label>Nombre<input name="title" required autofocus placeholder="Nombre de la columna"></label>
      <label>Tipo<select name="type">${this.columnTypeOptionsHtml()}</select></label>
      <label>Descripción<textarea name="description" rows="2" placeholder="Opcional"></textarea></label>
      <label class="column-labels-field" hidden>Etiquetas<textarea name="labels" rows="6" placeholder="Una etiqueta por línea"></textarea><small>Se usan para Estado y Dropdown.</small></label>
      <div class="modal-actions"><button type="button" class="button" data-close-modal>Cancelar</button><button class="button primary">Crear columna</button></div>
    </form>`);
    const form = document.getElementById('column-create-form');
    const type = form.querySelector('[name="type"]');
    const labelsField = form.querySelector('.column-labels-field');
    const sync = () => { labelsField.hidden = !['status', 'dropdown'].includes(type.value); };
    type.addEventListener('change', sync); sync();
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const data = new FormData(form);
      const columnType = data.get('type');
      try {
        await this.api(`/api/boards/${this.currentBoardId()}/columns`, {
          method: 'POST',
          body: JSON.stringify({
            title: String(data.get('title') || '').trim(),
            type: columnType,
            description: String(data.get('description') || '').trim(),
            settings: this.labelsSettingsFromText(data.get('labels'), columnType),
            order: (this.currentBoard.columns || []).length
          })
        });
        this.closeModal();
        await this.reloadBoardState();
        this.showToast('Columna creada');
      } catch (err) { this.showToast(err.message, true); }
    });
  };

  app.openManageColumnsModal = function openManageColumnsModal() {
    const columns = [...(this.currentBoard?.columns || [])].sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
    this.openModal(`<div class="modal-card column-manager-modal">
      <div class="modal-header"><div><h2>Gestionar columnas</h2><p>Mostrar, ocultar, fijar y configurar columnas.</p></div><button type="button" class="modal-close" data-close-modal>×</button></div>
      <div class="column-manager-list">${columns.map(column => `<div class="column-manager-row" data-manage-column="${this.escapeAttr(column.id)}">
        <div><strong>${this.escapeHtml(column.title)}</strong><small>${this.escapeHtml(column.type)}${column.hidden ? ' · oculta' : ''}${column.pinned ? ' · fijada' : ''}</small></div>
        <div class="column-manager-actions"><button type="button" class="button" data-column-configure="${this.escapeAttr(column.id)}">Configurar</button><button type="button" class="button" data-column-toggle-pin="${this.escapeAttr(column.id)}">${column.pinned ? 'Desfijar' : 'Fijar'}</button><button type="button" class="button" data-column-toggle-hidden="${this.escapeAttr(column.id)}">${column.hidden ? 'Mostrar' : 'Ocultar'}</button></div>
      </div>`).join('') || '<div class="lifecycle-empty">No hay columnas configuradas.</div>'}</div>
      <div class="modal-actions"><button type="button" class="button" data-close-modal>Cerrar</button><button type="button" class="button primary" id="column-manager-add">＋ Nueva columna</button></div>
    </div>`);
    const root = document.getElementById('modal-root');
    root.querySelectorAll('[data-column-configure]').forEach(button => button.addEventListener('click', () => this.openColumnSettingsModal(button.dataset.columnConfigure)));
    root.querySelectorAll('[data-column-toggle-pin]').forEach(button => button.addEventListener('click', async () => {
      const column = columns.find(entry => String(entry.id) === String(button.dataset.columnTogglePin));
      if (!column) return;
      await this.patchColumn(column.id, { pinned: !column.pinned });
      this.openManageColumnsModal();
    }));
    root.querySelectorAll('[data-column-toggle-hidden]').forEach(button => button.addEventListener('click', async () => {
      const column = columns.find(entry => String(entry.id) === String(button.dataset.columnToggleHidden));
      if (!column) return;
      await this.patchColumn(column.id, { hidden: !column.hidden });
      this.openManageColumnsModal();
    }));
    document.getElementById('column-manager-add')?.addEventListener('click', () => this.openCreateColumnModal());
  };

  app.openColumnSettingsModal = function openColumnSettingsModal(columnId) {
    const column = (this.currentBoard?.columns || []).find(entry => String(entry.id) === String(columnId));
    if (!column) return;
    const supportsLabels = ['status', 'dropdown'].includes(column.type);
    this.openModal(`<form id="column-settings-form" class="modal-card column-settings-modal">
      <div class="modal-header"><div><h2>Configurar columna</h2><p>${this.escapeHtml(column.type)}</p></div><button type="button" class="modal-close" data-close-modal>×</button></div>
      <label>Nombre<input name="title" required value="${this.escapeAttr(column.title)}"></label>
      <label>Descripción<textarea name="description" rows="2">${this.escapeHtml(column.description || '')}</textarea></label>
      ${supportsLabels ? `<label>Etiquetas<textarea name="labels" rows="7" placeholder="Una etiqueta por línea">${this.escapeHtml(this.columnLabelsText(column))}</textarea><small>El orden se conserva en los menús de la columna.</small></label>` : ''}
      <div class="column-settings-toggles"><label><input type="checkbox" name="pinned" ${column.pinned ? 'checked' : ''}> Fijar columna</label><label><input type="checkbox" name="hidden" ${column.hidden ? 'checked' : ''}> Ocultar columna</label></div>
      <div class="modal-actions"><button type="button" class="button" data-close-modal>Cancelar</button><button class="button primary">Guardar</button></div>
    </form>`);
    document.getElementById('column-settings-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const settings = supportsLabels ? { ...(column.settings || {}), ...this.labelsSettingsFromText(data.get('labels'), column.type) } : (column.settings || {});
      try {
        await this.patchColumn(column.id, {
          title: String(data.get('title') || '').trim(),
          description: String(data.get('description') || '').trim(),
          pinned: data.get('pinned') === 'on',
          hidden: data.get('hidden') === 'on',
          settings
        });
        this.closeModal();
      } catch (err) { this.showToast(err.message, true); }
    });
  };

  app.openColumnMenu = function openColumnMenuWithSettings(anchor, columnId) {
    originalOpenColumnMenu.call(this, anchor, columnId);
    const menus = [...document.querySelectorAll('.floating-menu')];
    const menu = menus[menus.length - 1];
    if (!menu) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '⚙ Configurar columna';
    button.dataset.columnAction = 'settings';
    button.addEventListener('click', () => {
      menu.remove();
      this.openColumnSettingsModal(columnId);
    });
    const separator = document.createElement('div');
    separator.className = 'menu-separator';
    menu.insertBefore(separator, menu.children[1] || null);
    menu.insertBefore(button, separator.nextSibling);
  };
})();
