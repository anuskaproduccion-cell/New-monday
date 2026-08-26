(() => {
  const baseSelectBoard = app.selectBoard.bind(app);
  const baseSubitemCellHtml = app.subitemCellHtml.bind(app);
  const baseItemRowHtml = app.itemRowHtml.bind(app);

  app.subitemSchema = null;
  app.subitemSchemaCache = new Map();

  app.normalizeColumnTitle = function normalizeColumnTitle(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  };

  app.loadSubitemSchema = async function loadSubitemSchema(boardId) {
    const id = String(boardId || '');
    if (!id) return null;
    if (this.subitemSchemaCache.has(id)) return this.subitemSchemaCache.get(id);
    try {
      const schema = await this.api(`/api/boards/${encodeURIComponent(id)}/subitem-schema`);
      this.subitemSchemaCache.set(id, schema);
      return schema;
    } catch (error) {
      console.warn('Could not load subitem schema:', error.message);
      const fallback = { found: false, mode: 'none', customized: false, parentBoardId: id, columns: [] };
      this.subitemSchemaCache.set(id, fallback);
      return fallback;
    }
  };

  app.refreshSubitemSchema = async function refreshSubitemSchema({ rerender = true } = {}) {
    const boardId = String(this.currentBoardId() || '');
    if (!boardId) return null;
    this.subitemSchemaCache.delete(boardId);
    const schema = await this.loadSubitemSchema(boardId);
    if (String(this.currentBoardId() || '') !== boardId) return schema;
    this.subitemSchema = schema;
    if (rerender) this.renderCurrentView();
    return schema;
  };

  app.selectBoard = async function selectBoardWithSubitemSchema(board) {
    this.subitemSchema = null;
    await baseSelectBoard(board);
    const selectedId = String(board?._id || '');
    const schema = await this.loadSubitemSchema(selectedId);
    if (String(this.currentBoardId() || '') !== selectedId) return;
    this.subitemSchema = schema;
    if (schema?.found && this.expandedSubitems.size) this.renderCurrentView();
  };

  app.effectiveSubitemColumns = function effectiveSubitemColumns() {
    return (this.subitemSchema?.columns || [])
      .filter(column => !column.hidden && !['name', 'subtasks'].includes(String(column.type || '').toLowerCase()))
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  };

  app.allManagedSubitemColumns = function allManagedSubitemColumns() {
    return (this.subitemSchema?.columns || [])
      .filter(column => !['name', 'subtasks'].includes(String(column.type || '').toLowerCase()))
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  };

  app.resolveSubitemColumn = function resolveSubitemColumn(parentColumn) {
    if (!parentColumn || !this.subitemSchema?.found) return null;
    const columns = this.effectiveSubitemColumns();
    if (!columns.length) return null;

    let match = columns.find(column => String(column.id) === String(parentColumn.id));
    if (match) return match;

    const title = this.normalizeColumnTitle(parentColumn.title);
    const type = String(parentColumn.type || '').toLowerCase();
    match = columns.find(column => String(column.type || '').toLowerCase() === type && this.normalizeColumnTitle(column.title) === title);
    if (match) return match;

    const sameTitle = columns.filter(column => this.normalizeColumnTitle(column.title) === title);
    if (sameTitle.length === 1) return sameTitle[0];

    const sameType = columns.filter(column => String(column.type || '').toLowerCase() === type);
    if (sameType.length === 1) return sameType[0];

    return null;
  };

  app.subitemCellHtml = function subitemCellHtmlWithOwnSchema(subitem, parentColumn) {
    if (subitem?.isLegacyInline || !this.subitemSchema?.found) return baseSubitemCellHtml(subitem, parentColumn);
    const resolved = this.resolveSubitemColumn(parentColumn);
    if (!resolved) {
      return `<span class="subitem-schema-missing" title="Esta columna no existe en el esquema propio de subitems">—</span>`;
    }
    return this.cellHtml(subitem, resolved, { readOnly: resolved.type === 'formula' || resolved.type === 'mirror' });
  };

  app.subitemSchemaSummary = function subitemSchemaSummary() {
    const schema = this.subitemSchema;
    if (!schema?.found) return null;
    return {
      name: schema.internalBoardName || 'Subitems',
      columns: this.effectiveSubitemColumns().length,
      internalMondayId: schema.internalMondayId || null,
      mode: schema.mode || (schema.customized ? 'local' : 'imported')
    };
  };

  app.subitemNestedTableHtml = function subitemNestedTableHtml(parentItem, parentColumns) {
    const subitems = this.subitemsFor(parentItem._id);
    const columns = this.effectiveSubitemColumns();
    if (!subitems.length || !columns.length) return '';
    const colspan = parentColumns.length + 3;
    const summary = this.subitemSchemaSummary();

    const header = columns.map(column => `<th class="subitem-own-column-head type-${this.escapeAttr(column.type)}" data-subitem-column-id="${this.escapeAttr(column.id)}" title="${this.escapeAttr(column.description || column.title)}"><span>${this.escapeHtml(column.title)}</span></th>`).join('');
    const rows = subitems.map(subitem => {
      const selected = this.selectedItems.has(subitem._id);
      const cells = columns.map(column => {
        const readOnly = column.type === 'formula' || column.type === 'mirror';
        return `<td class="dynamic-cell subitem-own-cell type-${this.escapeAttr(column.type)}" data-column-id="${this.escapeAttr(column.id)}">${this.cellHtml(subitem, column, { readOnly })}</td>`;
      }).join('');
      return `<tr class="subitem-own-row ${selected ? 'selected' : ''}" data-item-id="${this.escapeAttr(subitem._id)}" data-parent-item-id="${this.escapeAttr(parentItem._id)}">
        <td class="subitem-own-select"><input type="checkbox" data-select-item="${this.escapeAttr(subitem._id)}" ${selected ? 'checked' : ''} aria-label="Seleccionar subitem"></td>
        <td class="subitem-own-name"><div class="subitem-own-name-inner"><span>↳</span><input class="cell-input element-input" data-name-id="${this.escapeAttr(subitem._id)}" value="${this.escapeAttr(subitem.name || '')}" aria-label="Nombre del subitem"></div></td>
        ${cells}
        <td class="subitem-own-actions"><button class="menu-button" data-action="item-menu" data-id="${this.escapeAttr(subitem._id)}" aria-label="Menú del subitem">⋯</button></td>
      </tr>`;
    }).join('');

    const modeLabel = summary?.mode === 'local' ? 'Esquema local' : 'Esquema importado';
    return `<tr class="subitem-own-schema-host" data-subitem-schema-parent="${this.escapeAttr(parentItem._id)}"><td colspan="${colspan}">
      <div class="subitem-own-shell">
        <div class="subitem-own-meta"><strong>Subitems</strong><span>${columns.length} columnas propias</span>${summary?.name ? `<small title="Esquema de referencia">${this.escapeHtml(summary.name)}</small>` : ''}<em>${this.escapeHtml(modeLabel)}</em><button type="button" class="subitem-schema-manage-button" data-subitem-schema-manage aria-label="Administrar columnas de subitems">⚙ Columnas</button></div>
        <div class="subitem-own-scroll">
          <table class="subitem-own-table">
            <thead><tr><th class="subitem-own-select"></th><th class="subitem-own-name-head">Subitem</th>${header}<th class="subitem-own-actions"></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    </td></tr>`;
  };

  app.itemRowHtml = function itemRowHtmlWithIndependentSubitemTable(item, group, parentColumns) {
    let html = baseItemRowHtml(item, group, parentColumns);
    if (!this.subitemSchema?.found || !this.expandedSubitems.has(String(item._id)) || !this.subitemsFor(item._id).length) return html;

    // The core renderer aligns subitems to parent columns. Remove those generated
    // rows and replace them with a nested table driven by the internal/local
    // subitem schema. The imported Monday schema and fingerprints stay intact.
    html = html.replace(/<tr class="subitem-row">[\s\S]*?<\/tr>/g, '');
    const nested = this.subitemNestedTableHtml(item, parentColumns);
    if (!nested) return html;
    const composerMarker = '<tr class="subitem-create-row"';
    const composerIndex = html.indexOf(composerMarker);
    return composerIndex >= 0
      ? `${html.slice(0, composerIndex)}${nested}${html.slice(composerIndex)}`
      : `${html}${nested}`;
  };

  app.subitemSchemaManagerHtml = function subitemSchemaManagerHtml() {
    const schema = this.subitemSchema || { mode: 'none', columns: [] };
    const columns = this.allManagedSubitemColumns();
    const local = schema.mode === 'local' || schema.customized;
    const sourceText = local
      ? 'Este esquema es local de New Monday. Puedes crear, reordenar y configurar columnas sin modificar Monday.'
      : schema.mode === 'imported'
        ? 'Estas columnas proceden del tablero interno de subitems de Monday. Personalízalas para crear una copia local editable.'
        : 'Este tablero no tiene un esquema interno detectado. Puedes crear uno local para sus subitems.';

    const rows = columns.map((column, index) => `<div class="subitem-schema-row" data-subitem-schema-row="${this.escapeAttr(column.id)}">
      <div class="subitem-schema-order">
        <button type="button" data-subitem-column-move="up" data-column-id="${this.escapeAttr(column.id)}" ${!local || index === 0 ? 'disabled' : ''} aria-label="Subir columna">↑</button>
        <button type="button" data-subitem-column-move="down" data-column-id="${this.escapeAttr(column.id)}" ${!local || index === columns.length - 1 ? 'disabled' : ''} aria-label="Bajar columna">↓</button>
      </div>
      <label>Nombre<input data-subitem-column-title="${this.escapeAttr(column.id)}" value="${this.escapeAttr(column.title)}" ${local ? '' : 'disabled'}></label>
      <label>Tipo<input value="${this.escapeAttr(column.type)}" disabled></label>
      <label class="subitem-schema-description">Descripción<input data-subitem-column-description="${this.escapeAttr(column.id)}" value="${this.escapeAttr(column.description || '')}" ${local ? '' : 'disabled'} placeholder="Opcional"></label>
      <label class="subitem-schema-visible"><input type="checkbox" data-subitem-column-visible="${this.escapeAttr(column.id)}" ${column.hidden ? '' : 'checked'} ${local ? '' : 'disabled'}> Visible</label>
      <button type="button" class="subitem-schema-remove" data-subitem-column-remove="${this.escapeAttr(column.id)}" ${local ? '' : 'disabled'} aria-label="Retirar columna">×</button>
    </div>`).join('');

    const typeOptions = [
      ['text', 'Texto'], ['numbers', 'Números'], ['status', 'Estado'], ['people', 'Personas'],
      ['date', 'Fecha'], ['timeline', 'Cronograma'], ['dropdown', 'Dropdown'], ['dependency', 'Dependencia'],
      ['world_clock', 'Reloj mundial'], ['email', 'Email'], ['link', 'Enlace'], ['files', 'Archivos']
    ].map(([value, label]) => `<option value="${value}">${label}</option>`).join('');

    return `<form id="subitem-schema-manager" class="modal-card subitem-schema-manager">
      <div class="modal-header"><div><h2>Columnas de subitems</h2><p>${this.escapeHtml(this.currentBoard?.name || '')}</p></div><button type="button" class="modal-close" data-close-modal>×</button></div>
      <div class="subitem-schema-source ${local ? 'is-local' : ''}"><strong>${local ? 'Esquema local editable' : schema.mode === 'imported' ? 'Esquema importado de referencia' : 'Sin esquema local'}</strong><span>${this.escapeHtml(sourceText)}</span></div>
      ${!local ? `<button type="button" class="button primary subitem-schema-customize" data-subitem-schema-customize>${schema.mode === 'imported' ? 'Personalizar esquema' : 'Crear esquema local'}</button>` : ''}
      <div class="subitem-schema-list">${rows || '<div class="subitem-schema-empty">Aún no hay columnas propias de subitems.</div>'}</div>
      ${local ? `<div class="subitem-schema-add"><h3>Añadir columna</h3><div class="subitem-schema-add-fields"><input name="subitemColumnTitle" placeholder="Nombre de la columna" required><select name="subitemColumnType">${typeOptions}</select><button class="button primary" type="submit">＋ Añadir</button></div></div>` : ''}
      <div class="modal-actions"><button type="button" class="button" data-close-modal>Cerrar</button></div>
    </form>`;
  };

  app.openSubitemSchemaManager = function openSubitemSchemaManager() {
    this.openModal(this.subitemSchemaManagerHtml());
    const form = document.getElementById('subitem-schema-manager');
    if (!form) return;

    form.querySelector('[data-subitem-schema-customize]')?.addEventListener('click', async buttonEvent => {
      const button = buttonEvent.currentTarget;
      button.disabled = true;
      try {
        await this.api(`/api/boards/${encodeURIComponent(this.currentBoardId())}/subitem-schema/initialize`, { method: 'POST', body: '{}' });
        await this.refreshSubitemSchema({ rerender: true });
        this.openSubitemSchemaManager();
        this.showToast('Esquema local de subitems activado');
      } catch (error) {
        button.disabled = false;
        this.showToast(error.message, true);
      }
    });

    form.querySelectorAll('[data-subitem-column-title]').forEach(input => input.addEventListener('change', async () => {
      const title = input.value.trim();
      if (!title) return this.openSubitemSchemaManager();
      await this.patchSubitemColumn(input.dataset.subitemColumnTitle, { title });
    }));

    form.querySelectorAll('[data-subitem-column-description]').forEach(input => input.addEventListener('change', async () => {
      await this.patchSubitemColumn(input.dataset.subitemColumnDescription, { description: input.value.trim() });
    }));

    form.querySelectorAll('[data-subitem-column-visible]').forEach(input => input.addEventListener('change', async () => {
      await this.patchSubitemColumn(input.dataset.subitemColumnVisible, { hidden: !input.checked });
    }));

    form.querySelectorAll('[data-subitem-column-move]').forEach(button => button.addEventListener('click', async () => {
      const columns = this.allManagedSubitemColumns();
      const index = columns.findIndex(column => String(column.id) === String(button.dataset.columnId));
      const target = button.dataset.subitemColumnMove === 'up' ? index - 1 : index + 1;
      if (index < 0 || target < 0 || target >= columns.length) return;
      [columns[index], columns[target]] = [columns[target], columns[index]];
      try {
        await this.api(`/api/boards/${encodeURIComponent(this.currentBoardId())}/subitem-columns/reorder`, {
          method: 'POST',
          body: JSON.stringify({ columnIds: columns.map(column => column.id) })
        });
        await this.refreshSubitemSchema({ rerender: true });
        this.openSubitemSchemaManager();
      } catch (error) { this.showToast(error.message, true); }
    }));

    form.querySelectorAll('[data-subitem-column-remove]').forEach(button => button.addEventListener('click', async () => {
      const column = this.allManagedSubitemColumns().find(entry => String(entry.id) === String(button.dataset.subitemColumnRemove));
      if (!column) return;
      if (!confirm(`Retirar “${column.title}” del esquema de subitems? Los valores guardados se conservarán.`)) return;
      try {
        await this.api(`/api/boards/${encodeURIComponent(this.currentBoardId())}/subitem-columns/${encodeURIComponent(column.id)}`, { method: 'DELETE' });
        await this.refreshSubitemSchema({ rerender: true });
        this.openSubitemSchemaManager();
        this.showToast('Columna retirada; sus valores se conservaron');
      } catch (error) { this.showToast(error.message, true); }
    }));

    if (this.subitemSchema?.mode === 'local' || this.subitemSchema?.customized) {
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const data = new FormData(form);
        const title = String(data.get('subitemColumnTitle') || '').trim();
        const type = String(data.get('subitemColumnType') || 'text');
        if (!title) return;
        try {
          await this.api(`/api/boards/${encodeURIComponent(this.currentBoardId())}/subitem-columns`, {
            method: 'POST',
            body: JSON.stringify({ title, type })
          });
          await this.refreshSubitemSchema({ rerender: true });
          this.openSubitemSchemaManager();
          this.showToast('Columna de subitems añadida');
        } catch (error) { this.showToast(error.message, true); }
      });
    }
  };

  app.patchSubitemColumn = async function patchSubitemColumn(columnId, patch) {
    try {
      await this.api(`/api/boards/${encodeURIComponent(this.currentBoardId())}/subitem-columns/${encodeURIComponent(columnId)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch)
      });
      await this.refreshSubitemSchema({ rerender: true });
      this.openSubitemSchemaManager();
      this.showToast('Columna de subitems actualizada');
    } catch (error) { this.showToast(error.message, true); }
  };

  document.addEventListener('click', event => {
    const button = event.target?.closest?.('[data-subitem-schema-manage]');
    if (!button) return;
    event.preventDefault();
    app.openSubitemSchemaManager();
  });
})();
