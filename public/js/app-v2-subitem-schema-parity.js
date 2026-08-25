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
      const fallback = { found: false, parentBoardId: id, columns: [] };
      this.subitemSchemaCache.set(id, fallback);
      return fallback;
    }
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
      internalMondayId: schema.internalMondayId || null
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

    return `<tr class="subitem-own-schema-host" data-subitem-schema-parent="${this.escapeAttr(parentItem._id)}"><td colspan="${colspan}">
      <div class="subitem-own-shell">
        <div class="subitem-own-meta"><strong>Subitems</strong><span>${columns.length} columnas propias</span>${summary?.name ? `<small title="Esquema local importado">${this.escapeHtml(summary.name)}</small>` : ''}</div>
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
    // rows and replace them with a nested table driven by the internal subitem
    // board schema. The parent board schema and imported fingerprints stay intact.
    html = html.replace(/<tr class="subitem-row">[\s\S]*?<\/tr>/g, '');
    const nested = this.subitemNestedTableHtml(item, parentColumns);
    if (!nested) return html;
    const composerMarker = '<tr class="subitem-create-row"';
    const composerIndex = html.indexOf(composerMarker);
    return composerIndex >= 0
      ? `${html.slice(0, composerIndex)}${nested}${html.slice(composerIndex)}`
      : `${html}${nested}`;
  };
})();
