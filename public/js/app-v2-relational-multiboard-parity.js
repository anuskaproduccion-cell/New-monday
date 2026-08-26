(() => {
  const baseSpecialColumnFieldHtml = app.specialColumnFieldHtml.bind(app);
  const baseSpecialSettingsFromForm = app.specialSettingsFromForm.bind(app);

  app.relationTargetBoards = function relationTargetBoards(column) {
    const settings = column?.settings || {};
    const localIds = [
      ...(Array.isArray(settings.localBoardIds) ? settings.localBoardIds : []),
      ...(Array.isArray(settings.targetBoardLocalIds) ? settings.targetBoardLocalIds : []),
      settings.localBoardId,
      settings.targetBoardLocalId
    ].filter(Boolean).map(String);
    const mondayIds = [
      ...(Array.isArray(settings.boardIds) ? settings.boardIds : []),
      ...(Array.isArray(settings.targetBoardMondayIds) ? settings.targetBoardMondayIds : []),
      settings.boardId,
      settings.targetBoardMondayId
    ].filter(Boolean).map(String);
    const seen = new Set();
    return this.boards.filter(board => {
      const match = localIds.includes(String(board._id)) || (board.mondayId && mondayIds.includes(String(board.mondayId)));
      if (!match || seen.has(String(board._id))) return false;
      seen.add(String(board._id));
      return !board.internal;
    });
  };

  app.relationTargetBoard = function relationTargetBoardMulti(column) {
    return this.relationTargetBoards(column)[0] || null;
  };

  app.specialColumnFieldHtml = function specialColumnFieldHtmlMultiBoard(type, existing = {}) {
    if (type === 'board_relation') {
      const settings = existing.settings || {};
      const selected = new Set(this.relationTargetBoards(existing).map(board => String(board._id)));
      return `<div class="relational-settings-block relational-multiboard-settings" data-special-settings="board_relation">
        <label>Tableros conectados<select name="targetBoardIds" multiple size="6">${this.boards.filter(board => !board.internal).map(board => `<option value="${this.escapeAttr(board._id)}" ${selected.has(String(board._id)) ? 'selected' : ''}>${this.escapeHtml(this.workspaceName(board))} · ${this.escapeHtml(board.name)}</option>`).join('')}</select></label>
        <small>Ctrl/Cmd + clic permite elegir varios tableros. Los vínculos y espejos se resuelven íntegramente dentro de New Monday.</small>
        <label class="column-check"><input type="checkbox" name="relationMultiple" ${settings.allowMultipleItems ? 'checked' : ''}> Permitir varios elementos vinculados</label>
      </div>`;
    }
    if (type === 'mirror') {
      const relationColumns = (this.currentBoard?.columns || []).filter(column => column.type === 'board_relation');
      const relationId = this.relationColumnIdForMirror(existing) || relationColumns[0]?.id || '';
      return `<div class="relational-settings-block relational-multiboard-settings" data-special-settings="mirror">
        <label>Columna Conectar tableros<select name="mirrorRelationColumn"><option value="">Seleccionar…</option>${relationColumns.map(column => `<option value="${this.escapeAttr(column.id)}" ${String(column.id) === String(relationId) ? 'selected' : ''}>${this.escapeHtml(column.title)}</option>`).join('')}</select></label>
        <div class="mirror-multiboard-targets" data-mirror-multiboard-targets><small>Selecciona primero una relación.</small></div>
        <small>Cada tablero conectado puede reflejar una columna distinta. El resultado se agrega localmente y nunca escribe en Monday.</small>
      </div>`;
    }
    return baseSpecialColumnFieldHtml(type, existing);
  };

  app.syncMirrorTargetOptions = function syncMirrorMultiTargetOptions(form, existing = {}) {
    const relationSelect = form?.querySelector('[name="mirrorRelationColumn"]');
    const host = form?.querySelector('[data-mirror-multiboard-targets]');
    if (!relationSelect || !host) return;
    const refresh = () => {
      const relationColumn = (this.currentBoard?.columns || []).find(column => String(column.id) === String(relationSelect.value));
      const boards = this.relationTargetBoards(relationColumn);
      if (!boards.length) {
        host.innerHTML = '<small>La relación no tiene tableros configurados.</small>';
        return;
      }
      host.innerHTML = boards.map(board => {
        const current = this.mirrorTargetColumnId(existing, board);
        const options = (board.columns || []).filter(column => column.type !== 'subtasks');
        return `<label class="mirror-board-target"><span>${this.escapeHtml(board.name)}</span><select data-mirror-target-board="${this.escapeAttr(board._id)}"><option value="">Seleccionar columna…</option>${options.map(column => `<option value="${this.escapeAttr(column.id)}" ${String(column.id) === String(current) ? 'selected' : ''}>${this.escapeHtml(column.title)} · ${this.escapeHtml(column.type)}</option>`).join('')}</select></label>`;
      }).join('');
    };
    relationSelect.addEventListener('change', refresh);
    refresh();
  };

  app.specialSettingsFromForm = function specialSettingsFromFormMultiBoard(type, form, existing = {}) {
    const data = new FormData(form);
    if (type === 'board_relation') {
      const ids = data.getAll('targetBoardIds').map(String).filter(Boolean);
      const targetBoards = this.boards.filter(board => ids.includes(String(board._id)) && !board.internal);
      if (!targetBoards.length) throw new Error('Selecciona al menos un tablero conectado');
      const mondayIds = targetBoards.map(board => board.mondayId).filter(Boolean).map(value => Number(value));
      return {
        ...(existing.settings || {}),
        localBoardId: targetBoards[0]._id,
        targetBoardLocalId: targetBoards[0]._id,
        localBoardIds: targetBoards.map(board => board._id),
        targetBoardLocalIds: targetBoards.map(board => board._id),
        targetBoardMondayId: targetBoards[0].mondayId || null,
        targetBoardMondayIds: targetBoards.map(board => board.mondayId).filter(Boolean).map(String),
        ...(mondayIds.length ? { boardId: mondayIds[0], boardIds: mondayIds } : { boardIds: [] }),
        allowMultipleItems: data.get('relationMultiple') === 'on'
      };
    }
    if (type === 'mirror') {
      const relationColumnId = String(data.get('mirrorRelationColumn') || '');
      const relationColumn = (this.currentBoard?.columns || []).find(column => String(column.id) === relationColumnId);
      const boards = this.relationTargetBoards(relationColumn);
      if (!relationColumn || !boards.length) throw new Error('Configura la relación antes del espejo');
      const displayedLinkedColumns = {};
      let firstColumnId = '';
      boards.forEach(board => {
        const select = form.querySelector(`[data-mirror-target-board="${CSS.escape(String(board._id))}"]`);
        const columnId = String(select?.value || '');
        if (!columnId) return;
        const key = String(board.mondayId || board._id);
        displayedLinkedColumns[key] = [columnId];
        if (!firstColumnId) firstColumnId = columnId;
      });
      if (!Object.keys(displayedLinkedColumns).length) throw new Error('Selecciona al menos una columna para reflejar');
      return {
        ...(existing.settings || {}),
        relationColumnId,
        displayedColumnId: firstColumnId,
        relation_column: { [relationColumnId]: true },
        displayed_linked_columns: displayedLinkedColumns,
        sumType: existing.settings?.sumType || 'allStatuses'
      };
    }
    return baseSpecialSettingsFromForm(type, form, existing);
  };

  app.mirrorDescriptor = function mirrorDescriptorMultiBoard(item, mirrorColumn) {
    const relationId = this.relationColumnIdForMirror?.(mirrorColumn);
    const relationColumn = (this.currentBoard?.columns || []).find(column => String(column.id) === String(relationId));
    if (!relationColumn) return null;
    const linked = this.relationLinkedItems(item, relationColumn);
    if (!linked.length) return { targetColumn: null, linked, values: [], entries: [] };

    const entries = linked.map(linkedItem => {
      const boardId = String(linkedItem.board?._id || linkedItem.board || '');
      const targetBoard = this.boards.find(board => String(board._id) === boardId)
        || this.relationTargetBoards(relationColumn).find(board => String(board.mondayId || '') === String(linkedItem.originMeta?.boardMondayId || ''));
      if (!targetBoard) return null;
      const targetColumnId = this.mirrorTargetColumnId(mirrorColumn, targetBoard);
      const targetColumn = (targetBoard.columns || []).find(column => String(column.id) === String(targetColumnId));
      if (!targetColumn) return null;
      const value = linkedItem?.columnValues?.[targetColumn.id] ?? rawMirrorValue(linkedItem, targetColumn);
      return { linkedItem, targetBoard, targetColumn, value };
    }).filter(Boolean);
    if (!entries.length) return { targetColumn: null, linked, values: [], entries: [] };

    const types = new Set(entries.map(entry => String(entry.targetColumn.type || 'text')));
    const first = entries[0].targetColumn;
    const targetColumn = types.size === 1 ? first : { ...first, type: 'text', title: 'Valores reflejados' };
    return { targetBoard: entries[0].targetBoard, targetColumn, linked, values: entries.map(entry => entry.value), entries };
  };

  const rawMirrorValue = (item, column) => item?.columnValues?.[column.id] ?? app.valueFor(item, column);

  app.openRelationParityPicker = function openRelationParityPickerMultiBoard(anchor, itemId, columnId) {
    document.querySelectorAll('.floating-menu,.relation-parity-picker').forEach(node => node.remove());
    const column = this.effectiveColumns().find(entry => String(entry.id) === String(columnId));
    const targetBoards = this.relationTargetBoards(column);
    if (!column || !targetBoards.length) return this.showToast('Configura primero al menos un tablero conectado', true);
    const targetIds = new Set(targetBoards.map(board => String(board._id)));
    const item = this.findItem(itemId);
    const current = this.relationLinkedItems(item, column);
    const selected = new Set(current.map(entry => String(entry._id)));
    const multiple = Boolean(column.settings?.allowMultipleItems);
    const candidates = this.items.filter(entry => targetIds.has(String(entry.board?._id || entry.board)) && !entry.isSubitem && !entry.deletedAt && !entry.archived);
    const boardForItem = entry => targetBoards.find(board => String(board._id) === String(entry.board?._id || entry.board));

    const menu = document.createElement('div');
    menu.className = 'floating-menu relation-parity-picker relation-multiboard-picker';
    menu.innerHTML = `<div class="relation-picker-title"><strong>${this.escapeHtml(column.title)}</strong><small>${targetBoards.length === 1 ? this.escapeHtml(targetBoards[0].name) : `${targetBoards.length} tableros`} · ${multiple ? 'varios elementos' : 'un elemento'}</small></div><label class="relation-search"><span>⌕</span><input type="search" placeholder="Buscar elemento o tablero" autocomplete="off"></label><div class="relation-parity-list"></div><div class="relation-picker-actions"><button type="button" data-relation-clear>Quitar vínculo</button><span></span><button type="button" data-relation-cancel>Cancelar</button><button type="button" class="relation-apply" data-relation-apply>Aplicar</button></div>`;
    const input = menu.querySelector('input');
    const list = menu.querySelector('.relation-parity-list');

    const render = () => {
      const term = String(input.value || '').trim().toLowerCase();
      const filtered = candidates.filter(entry => {
        const board = boardForItem(entry);
        return !term || String(entry.name || '').toLowerCase().includes(term) || String(board?.name || '').toLowerCase().includes(term);
      });
      list.innerHTML = filtered.map(entry => {
        const board = boardForItem(entry);
        return `<button type="button" class="relation-option ${selected.has(String(entry._id)) ? 'is-selected' : ''}" data-relation-item="${this.escapeAttr(entry._id)}"><span class="relation-option-check">${selected.has(String(entry._id)) ? '✓' : ''}</span><span class="relation-option-copy"><strong>${this.escapeHtml(entry.name)}</strong><small>${this.escapeHtml(board?.name || 'Tablero')}</small></span></button>`;
      }).join('') || '<div class="relation-empty">No hay elementos que coincidan.</div>';
      list.querySelectorAll('[data-relation-item]').forEach(button => button.addEventListener('click', () => {
        const id = button.dataset.relationItem;
        if (multiple) {
          if (selected.has(id)) selected.delete(id); else selected.add(id);
        } else {
          selected.clear();
          selected.add(id);
        }
        render();
      }));
    };

    menu.querySelector('[data-relation-clear]')?.addEventListener('click', () => { selected.clear(); render(); });
    menu.querySelector('[data-relation-cancel]')?.addEventListener('click', () => menu.remove());
    menu.querySelector('[data-relation-apply]')?.addEventListener('click', async () => {
      const picked = candidates.filter(entry => selected.has(String(entry._id)));
      await this.updateColumnValue(itemId, columnId, {
        type: 'board_relation',
        linkedItemIds: picked.map(entry => entry._id),
        linkedMondayItemIds: picked.map(entry => entry.mondayId).filter(Boolean).map(String),
        linkedItems: picked.map(entry => {
          const board = boardForItem(entry);
          return { id: entry._id, mondayId: entry.mondayId || null, name: entry.name, boardId: board?._id || entry.board, boardName: board?.name || '' };
        })
      });
      menu.remove();
      this.renderBoard();
    });
    input.addEventListener('input', render);
    render();
    this.positionMenu(menu, anchor);
    requestAnimationFrame(() => input.focus());
  };
})();
