(() => {
  const baseSelectBoard = app.selectBoard.bind(app);
  const baseSubitemCellHtml = app.subitemCellHtml.bind(app);

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
})();
