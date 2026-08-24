(() => {
  const SPECIAL_TYPES = [
    ['dependency', 'Dependencia'],
    ['board_relation', 'Conectar tableros'],
    ['mirror', 'Espejo'],
    ['formula', 'Fórmula']
  ];

  const originalColumnTypeOptionsHtml = app.columnTypeOptionsHtml;
  const originalOpenColumnSettingsModal = app.openColumnSettingsModal;
  const originalValueFor = app.valueFor;
  const originalOpenRelationMenu = app.openRelationMenu;

  app.columnTypeOptionsHtml = function columnTypeOptionsHtmlWithRelations(selected = 'text') {
    const base = originalColumnTypeOptionsHtml.call(this, selected);
    return `${base}${SPECIAL_TYPES.map(([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`).join('')}`;
  };

  app.relationTargetBoard = function relationTargetBoard(column) {
    const settings = column?.settings || {};
    const localId = settings.localBoardId || settings.targetBoardLocalId;
    const mondayId = settings.boardId || settings.boardIds?.[0] || settings.targetBoardMondayId;
    return this.boards.find(board => localId && String(board._id) === String(localId))
      || this.boards.find(board => mondayId && String(board.mondayId) === String(mondayId))
      || null;
  };

  app.relationColumnIdForMirror = function relationColumnIdForMirror(column) {
    const settings = column?.settings || {};
    if (settings.relationColumnId) return String(settings.relationColumnId);
    const relationMap = settings.relation_column;
    if (relationMap && typeof relationMap === 'object') {
      const first = Object.keys(relationMap).find(key => relationMap[key]);
      if (first) return String(first);
    }
    return '';
  };

  app.mirrorTargetColumnId = function mirrorTargetColumnId(column, targetBoard) {
    const settings = column?.settings || {};
    if (settings.displayedColumnId) return String(settings.displayedColumnId);
    if (settings.targetColumnId) return String(settings.targetColumnId);
    const linked = settings.displayed_linked_columns || {};
    const keys = [targetBoard?.mondayId, targetBoard?._id].filter(Boolean).map(String);
    for (const key of keys) {
      if (Array.isArray(linked[key]) && linked[key][0]) return String(linked[key][0]);
    }
    for (const value of Object.values(linked)) {
      if (Array.isArray(value) && value[0]) return String(value[0]);
    }
    return '';
  };

  app.linkedItemsForRelationValue = function linkedItemsForRelationValue(value) {
    const localIds = (value?.linkedItemIds || []).map(String);
    const mondayIds = (value?.linkedMondayItemIds || []).map(String);
    const embedded = Array.isArray(value?.linkedItems) ? value.linkedItems : [];
    embedded.forEach(entry => {
      if (entry?.id) localIds.push(String(entry.id));
      if (entry?.mondayId || entry?.mondayItemId) mondayIds.push(String(entry.mondayId || entry.mondayItemId));
    });
    const seen = new Set();
    return this.items.filter(item => {
      const localMatch = localIds.includes(String(item._id));
      const mondayMatch = item.mondayId && mondayIds.includes(String(item.mondayId));
      if (!localMatch && !mondayMatch) return false;
      if (seen.has(String(item._id))) return false;
      seen.add(String(item._id));
      return true;
    });
  };

  app.computedMirrorValue = function computedMirrorValue(item, mirrorColumn) {
    const relationColumnId = this.relationColumnIdForMirror(mirrorColumn);
    if (!relationColumnId) return null;
    const relationColumn = (this.currentBoard?.columns || []).find(column => String(column.id) === String(relationColumnId));
    if (!relationColumn) return null;
    const relationValue = originalValueFor.call(this, item, relationColumn);
    const linkedItems = this.linkedItemsForRelationValue(relationValue);
    if (!linkedItems.length) return { type: 'mirror', displayValue: '' };

    const targetBoard = this.relationTargetBoard(relationColumn)
      || this.boards.find(board => String(board._id) === String(linkedItems[0].board?._id || linkedItems[0].board));
    if (!targetBoard) return null;
    const targetColumnId = this.mirrorTargetColumnId(mirrorColumn, targetBoard);
    if (!targetColumnId) return null;
    const targetColumn = (targetBoard.columns || []).find(column => String(column.id) === String(targetColumnId));
    if (!targetColumn) return null;

    const values = linkedItems.map(linkedItem => originalValueFor.call(this, linkedItem, targetColumn))
      .map(value => this.displayValue(value))
      .filter(value => value !== '');
    return {
      type: 'mirror',
      displayValue: values.join(', '),
      calculated: true,
      relationColumnId,
      targetColumnId
    };
  };

  app.valueFor = function valueForWithMirror(item, column) {
    if (column?.type === 'mirror') {
      const computed = this.computedMirrorValue(item, column);
      if (computed) return computed;
    }
    return originalValueFor.call(this, item, column);
  };

  app.specialColumnFieldHtml = function specialColumnFieldHtml(type, existing = {}) {
    const columns = this.currentBoard?.columns || [];
    const scalarColumns = columns.filter(column => !['formula', 'mirror', 'subtasks', 'dependency', 'board_relation'].includes(column.type));
    const timelineColumns = columns.filter(column => ['timeline', 'date'].includes(column.type));
    const relationColumns = columns.filter(column => column.type === 'board_relation');
    const settings = existing.settings || {};

    if (type === 'dependency') {
      const selectedTime = settings.timeColumnId || settings.timelineColumnId || settings.dateColumnId || timelineColumns[0]?.id || '';
      return `<div class="relational-settings-block" data-special-settings="dependency">
        <label>Columna temporal<select name="timeColumnId"><option value="">Seleccionar…</option>${timelineColumns.map(column => `<option value="${this.escapeAttr(column.id)}" ${String(column.id) === String(selectedTime) ? 'selected' : ''}>${this.escapeHtml(column.title)}</option>`).join('')}</select></label>
        <label>Modo<select name="dependencyMode"><option value="strict" ${(settings.dependency_mode || 'strict') === 'strict' ? 'selected' : ''}>Strict · desplazar dependientes</option><option value="no_action" ${settings.dependency_mode === 'no_action' ? 'selected' : ''}>Sin acción · solo relación</option></select></label>
        <label class="column-check"><input type="checkbox" name="dependencyMultiple" ${settings.allowMultipleItems !== false ? 'checked' : ''}> Permitir varias dependencias</label>
        <small>El modo Strict reproduce el comportamiento usado en los tableros de postproducción auditados.</small>
      </div>`;
    }

    if (type === 'board_relation') {
      const target = this.relationTargetBoard(existing);
      return `<div class="relational-settings-block" data-special-settings="board_relation">
        <label>Tablero conectado<select name="targetBoardId"><option value="">Seleccionar…</option>${this.boards.filter(board => !board.internal).map(board => `<option value="${this.escapeAttr(board._id)}" ${target && String(target._id) === String(board._id) ? 'selected' : ''}>${this.escapeHtml(this.workspaceName(board))} · ${this.escapeHtml(board.name)}</option>`).join('')}</select></label>
        <label class="column-check"><input type="checkbox" name="relationMultiple" ${settings.allowMultipleItems ? 'checked' : ''}> Permitir varios elementos vinculados</label>
      </div>`;
    }

    if (type === 'mirror') {
      const relationId = this.relationColumnIdForMirror(existing) || relationColumns[0]?.id || '';
      return `<div class="relational-settings-block" data-special-settings="mirror">
        <label>Columna Conectar tableros<select name="mirrorRelationColumn"><option value="">Seleccionar…</option>${relationColumns.map(column => `<option value="${this.escapeAttr(column.id)}" ${String(column.id) === String(relationId) ? 'selected' : ''}>${this.escapeHtml(column.title)}</option>`).join('')}</select></label>
        <label>Columna a mostrar<select name="mirrorTargetColumn"><option value="">Selecciona primero la relación…</option></select></label>
        <small>El valor se calcula localmente desde el elemento conectado; no escribe nada en Monday.</small>
      </div>`;
    }

    if (type === 'formula') {
      const parsedFormula = String(settings.formula || '');
      const timelineMatch = parsedFormula.match(/WORKDAYS\(\{([^#}]+)#End\},\s*\{([^#}]+)#Start\}\)/i);
      const overlapMatch = parsedFormula.match(/-\s*\{([^}]+)\}/);
      const selectedTimeline = timelineMatch?.[1] || timelineColumns[0]?.id || '';
      const selectedOverlap = overlapMatch?.[1] || scalarColumns.find(column => ['numbers', 'text'].includes(column.type))?.id || '';
      return `<div class="relational-settings-block" data-special-settings="formula">
        <p class="settings-note">Plantilla compatible con las fórmulas reales auditadas: semanas laborables del Cronograma menos Solape.</p>
        <label>Cronograma<select name="formulaTimeline"><option value="">Seleccionar…</option>${timelineColumns.filter(column => column.type === 'timeline').map(column => `<option value="${this.escapeAttr(column.id)}" ${String(column.id) === String(selectedTimeline) ? 'selected' : ''}>${this.escapeHtml(column.title)}</option>`).join('')}</select></label>
        <label>Solape / descuento<select name="formulaOverlap"><option value="">Seleccionar…</option>${scalarColumns.filter(column => ['numbers', 'text'].includes(column.type)).map(column => `<option value="${this.escapeAttr(column.id)}" ${String(column.id) === String(selectedOverlap) ? 'selected' : ''}>${this.escapeHtml(column.title)}</option>`).join('')}</select></label>
        ${settings.formula ? `<details><summary>Expresión</summary><code>${this.escapeHtml(settings.formula)}</code></details>` : ''}
      </div>`;
    }

    return '';
  };

  app.syncMirrorTargetOptions = function syncMirrorTargetOptions(form, existing = {}) {
    const relationSelect = form?.querySelector('[name="mirrorRelationColumn"]');
    const targetSelect = form?.querySelector('[name="mirrorTargetColumn"]');
    if (!relationSelect || !targetSelect) return;
    const refresh = () => {
      const relationColumn = (this.currentBoard?.columns || []).find(column => String(column.id) === String(relationSelect.value));
      const targetBoard = this.relationTargetBoard(relationColumn);
      const current = this.mirrorTargetColumnId(existing, targetBoard) || targetSelect.value;
      const columns = targetBoard?.columns || [];
      targetSelect.innerHTML = `<option value="">Seleccionar…</option>${columns.filter(column => column.type !== 'subtasks').map(column => `<option value="${this.escapeAttr(column.id)}" ${String(column.id) === String(current) ? 'selected' : ''}>${this.escapeHtml(column.title)}</option>`).join('')}`;
      targetSelect.disabled = !targetBoard;
    };
    relationSelect.addEventListener('change', refresh);
    refresh();
  };

  app.specialSettingsFromForm = function specialSettingsFromForm(type, form, existing = {}) {
    const data = new FormData(form);
    const base = { ...(existing.settings || {}) };
    if (type === 'dependency') {
      const timeColumnId = String(data.get('timeColumnId') || '');
      return {
        ...base,
        localBoardId: this.currentBoardId(),
        ...(this.currentBoard?.mondayId ? { boardId: Number(this.currentBoard.mondayId), boardIds: [Number(this.currentBoard.mondayId)] } : {}),
        dependencyNewInfra: true,
        allowMultipleItems: data.get('dependencyMultiple') === 'on',
        dependency_mode: String(data.get('dependencyMode') || 'strict'),
        timeColumnId
      };
    }
    if (type === 'board_relation') {
      const targetBoard = this.boards.find(board => String(board._id) === String(data.get('targetBoardId') || ''));
      if (!targetBoard) throw new Error('Selecciona el tablero conectado');
      return {
        ...base,
        localBoardId: targetBoard._id,
        targetBoardLocalId: targetBoard._id,
        targetBoardMondayId: targetBoard.mondayId || null,
        ...(targetBoard.mondayId ? { boardId: Number(targetBoard.mondayId), boardIds: [Number(targetBoard.mondayId)] } : {}),
        allowMultipleItems: data.get('relationMultiple') === 'on'
      };
    }
    if (type === 'mirror') {
      const relationColumnId = String(data.get('mirrorRelationColumn') || '');
      const relationColumn = (this.currentBoard?.columns || []).find(column => String(column.id) === relationColumnId);
      const targetBoard = this.relationTargetBoard(relationColumn);
      const displayedColumnId = String(data.get('mirrorTargetColumn') || '');
      if (!relationColumn || !targetBoard || !displayedColumnId) throw new Error('Configura la relación y la columna que se va a mostrar');
      const boardKey = String(targetBoard.mondayId || targetBoard._id);
      return {
        ...base,
        relationColumnId,
        displayedColumnId,
        relation_column: { [relationColumnId]: true },
        displayed_linked_columns: { [boardKey]: [displayedColumnId] },
        sumType: base.sumType || 'allStatuses'
      };
    }
    if (type === 'formula') {
      const timelineId = String(data.get('formulaTimeline') || '');
      const overlapId = String(data.get('formulaOverlap') || '');
      if (!timelineId || !overlapId) throw new Error('Selecciona Cronograma y Solape para la fórmula');
      return {
        ...base,
        formula: `MAX(ROUNDDOWN(WORKDAYS({${timelineId}#End}, {${timelineId}#Start}) / 5, 0) - {${overlapId}}, 0)`,
        template: 'workweeks_minus_overlap'
      };
    }
    return base;
  };

  app.openCreateColumnModal = function openCreateColumnModalWithRelations() {
    this.openModal(`<form id="column-create-form" class="modal-card column-settings-modal">
      <div class="modal-header"><div><h2>Nueva columna</h2><p>Se crea solo en New Monday.</p></div><button type="button" class="modal-close" data-close-modal>×</button></div>
      <label>Nombre<input name="title" required autofocus placeholder="Nombre de la columna"></label>
      <label>Tipo<select name="type">${this.columnTypeOptionsHtml()}</select></label>
      <label>Descripción<textarea name="description" rows="2" placeholder="Opcional"></textarea></label>
      <label class="column-labels-field" hidden>Etiquetas<textarea name="labels" rows="6" placeholder="Una etiqueta por línea"></textarea><small>Se usan para Estado y Dropdown.</small></label>
      <div id="special-column-settings"></div>
      <div class="modal-actions"><button type="button" class="button" data-close-modal>Cancelar</button><button class="button primary">Crear columna</button></div>
    </form>`);
    const form = document.getElementById('column-create-form');
    const type = form.querySelector('[name="type"]');
    const labelsField = form.querySelector('.column-labels-field');
    const special = form.querySelector('#special-column-settings');
    const sync = () => {
      labelsField.hidden = !['status', 'dropdown'].includes(type.value);
      special.innerHTML = this.specialColumnFieldHtml(type.value);
      if (type.value === 'mirror') this.syncMirrorTargetOptions(form);
    };
    type.addEventListener('change', sync);
    sync();

    form.addEventListener('submit', async event => {
      event.preventDefault();
      const data = new FormData(form);
      const columnType = String(data.get('type') || 'text');
      try {
        let settings = this.labelsSettingsFromText(data.get('labels'), columnType);
        if (['dependency', 'board_relation', 'mirror', 'formula'].includes(columnType)) {
          settings = this.specialSettingsFromForm(columnType, form);
        }
        await this.api(`/api/boards/${this.currentBoardId()}/columns`, {
          method: 'POST',
          body: JSON.stringify({
            title: String(data.get('title') || '').trim(),
            type: columnType,
            description: String(data.get('description') || '').trim(),
            settings,
            order: (this.currentBoard.columns || []).length
          })
        });
        this.closeModal();
        await this.reloadBoardState();
        this.showToast('Columna creada');
      } catch (err) { this.showToast(err.message, true); }
    });
  };

  app.openColumnSettingsModal = function openColumnSettingsModalWithRelations(columnId) {
    const column = (this.currentBoard?.columns || []).find(entry => String(entry.id) === String(columnId));
    if (!column || !['dependency', 'board_relation', 'mirror', 'formula'].includes(column.type)) {
      return originalOpenColumnSettingsModal.call(this, columnId);
    }

    this.openModal(`<form id="column-settings-form" class="modal-card column-settings-modal">
      <div class="modal-header"><div><h2>Configurar columna</h2><p>${this.escapeHtml(column.type)}</p></div><button type="button" class="modal-close" data-close-modal>×</button></div>
      <label>Nombre<input name="title" required value="${this.escapeAttr(column.title)}"></label>
      <label>Descripción<textarea name="description" rows="2">${this.escapeHtml(column.description || '')}</textarea></label>
      ${this.specialColumnFieldHtml(column.type, column)}
      <div class="column-settings-toggles"><label><input type="checkbox" name="pinned" ${column.pinned ? 'checked' : ''}> Fijar columna</label><label><input type="checkbox" name="hidden" ${column.hidden ? 'checked' : ''}> Ocultar columna</label></div>
      <div class="modal-actions"><button type="button" class="button" data-close-modal>Cancelar</button><button class="button primary">Guardar</button></div>
    </form>`);
    const form = document.getElementById('column-settings-form');
    if (column.type === 'mirror') this.syncMirrorTargetOptions(form, column);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const data = new FormData(form);
      try {
        const settings = this.specialSettingsFromForm(column.type, form, column);
        await this.patchColumn(column.id, {
          title: String(data.get('title') || '').trim(),
          description: String(data.get('description') || '').trim(),
          pinned: data.get('pinned') === 'on',
          hidden: data.get('hidden') === 'on',
          settings
        });
        this.closeModal();
        this.renderCurrentView();
      } catch (err) { this.showToast(err.message, true); }
    });
  };

  app.openRelationMenu = async function openRelationMenuMulti(anchor, itemId, columnId) {
    document.querySelectorAll('.floating-menu').forEach(node => node.remove());
    const column = this.effectiveColumns().find(entry => String(entry.id) === String(columnId));
    const targetBoard = this.relationTargetBoard(column);
    const menu = document.createElement('div');
    menu.className = 'floating-menu relation-menu';
    if (!targetBoard) {
      if (originalOpenRelationMenu) return originalOpenRelationMenu.call(this, anchor, itemId, columnId);
      menu.innerHTML = '<div class="menu-note">Configura primero el tablero conectado.</div>';
      this.positionMenu(menu, anchor);
      return;
    }

    const item = this.findItem(itemId);
    const current = originalValueFor.call(this, item, column) || {};
    const currentItems = this.linkedItemsForRelationValue(current);
    const selected = new Set(currentItems.map(entry => String(entry._id)));
    const candidates = this.items.filter(entry => String(entry.board?._id || entry.board) === String(targetBoard._id) && !entry.isSubitem && !entry.deletedAt && !entry.archived);
    const multiple = Boolean(column.settings?.allowMultipleItems);
    menu.innerHTML = `<div class="menu-title">Vincular con ${this.escapeHtml(targetBoard.name)}</div><div class="relation-picker-list">${candidates.map(entry => `<label class="relation-picker-row"><input type="${multiple ? 'checkbox' : 'radio'}" name="relation-choice" value="${entry._id}" ${selected.has(String(entry._id)) ? 'checked' : ''}><span>${this.escapeHtml(entry.name)}</span></label>`).join('') || '<div class="menu-note">No hay elementos disponibles.</div>'}</div><div class="relation-picker-actions"><button type="button" data-relation-clear>Quitar vínculo</button><button type="button" data-relation-apply>Aplicar</button></div>`;
    this.positionMenu(menu, anchor);

    menu.querySelector('[data-relation-clear]')?.addEventListener('click', async () => {
      await this.updateColumnValue(itemId, columnId, { type: 'board_relation', linkedItemIds: [], linkedMondayItemIds: [], linkedItems: [] });
      menu.remove();
      this.renderBoard();
    });
    menu.querySelector('[data-relation-apply]')?.addEventListener('click', async () => {
      const picked = [...menu.querySelectorAll('input[name="relation-choice"]:checked')].map(input => this.findItem(input.value)).filter(Boolean);
      const value = {
        type: 'board_relation',
        linkedItemIds: picked.map(entry => entry._id),
        linkedMondayItemIds: picked.map(entry => entry.mondayId).filter(Boolean).map(String),
        linkedItems: picked.map(entry => ({ id: entry._id, mondayId: entry.mondayId || null, name: entry.name, boardId: targetBoard._id, boardName: targetBoard.name }))
      };
      await this.updateColumnValue(itemId, columnId, value);
      menu.remove();
      this.renderBoard();
    });
  };
})();
