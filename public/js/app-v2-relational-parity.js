(() => {
  const baseCellHtml = app.cellHtml.bind(app);
  const baseBindBoardEvents = app.bindBoardEvents.bind(app);
  const rawValueFor = app.valueFor.bind(app);

  app.relationLinkedItems = function relationLinkedItems(item, column) {
    const value = item?.columnValues?.[column.id] ?? rawValueFor(item, column) ?? {};
    return this.linkedItemsForRelationValue?.(value) || [];
  };

  app.mirrorDescriptor = function mirrorDescriptor(item, mirrorColumn) {
    const relationId = this.relationColumnIdForMirror?.(mirrorColumn);
    const relationColumn = (this.currentBoard?.columns || []).find(column => String(column.id) === String(relationId));
    if (!relationColumn) return null;
    const linked = this.relationLinkedItems(item, relationColumn);
    if (!linked.length) return { targetColumn: null, linked, values: [] };
    const targetBoard = this.relationTargetBoard?.(relationColumn)
      || this.boards.find(board => String(board._id) === String(linked[0].board?._id || linked[0].board));
    if (!targetBoard) return null;
    const targetColumnId = this.mirrorTargetColumnId?.(mirrorColumn, targetBoard);
    const targetColumn = (targetBoard.columns || []).find(column => String(column.id) === String(targetColumnId));
    if (!targetColumn) return { targetColumn: null, linked, values: [] };
    const values = linked.map(linkedItem => linkedItem?.columnValues?.[targetColumn.id] ?? rawValueFor(linkedItem, targetColumn));
    return { targetBoard, targetColumn, linked, values };
  };

  app.mirrorCellHtml = function mirrorCellHtml(item, column) {
    const descriptor = this.mirrorDescriptor(item, column);
    if (!descriptor?.targetColumn || !descriptor.values.length) return '<span class="mirror-parity-empty">—</span>';
    const { targetColumn, values } = descriptor;

    if (targetColumn.type === 'status') {
      const segments = values.map(value => {
        const label = this.displayValue(value);
        const color = value?.color || value?.hex || this.statusColor(targetColumn, label);
        return { label, color: color || '#c4c4c4' };
      }).filter(entry => entry.label || entry.color);
      if (segments.length > 1) {
        const counts = new Map();
        segments.forEach(segment => {
          const key = `${segment.label}|||${segment.color}`;
          counts.set(key, (counts.get(key) || 0) + 1);
        });
        const total = segments.length;
        return `<div class="mirror-status-rollup" title="${this.escapeAttr([...counts.entries()].map(([key, count]) => `${key.split('|||')[0] || 'Sin estado'}: ${Math.round(count / total * 100)}%`).join(' · '))}">${[...counts.entries()].map(([key, count]) => `<span style="--mirror-color:${this.escapeAttr(key.split('|||')[1])};flex:${count}"></span>`).join('')}</div>`;
      }
      const single = segments[0];
      return `<span class="mirror-status-single" style="--mirror-color:${this.escapeAttr(single?.color || '#c4c4c4')}">${this.escapeHtml(single?.label || 'Sin estado')}</span>`;
    }

    if (targetColumn.type === 'people') {
      const names = [...new Set(values.flatMap(value => this.peopleNamesFromValue?.(value) || String(this.displayValue(value) || '').split(',').map(name => name.trim()).filter(Boolean)))];
      return `<div class="mirror-people">${names.slice(0, 3).map(name => `<span class="people-avatar" title="${this.escapeAttr(name)}">${this.escapeHtml(this.initials(name) || '?')}</span>`).join('')}${names.length > 3 ? `<span class="people-more">+${names.length - 3}</span>` : ''}</div>`;
    }

    if (targetColumn.type === 'date') {
      const dates = values.map(value => value?.date || this.displayValue(value)).filter(Boolean);
      return `<span class="mirror-date">${this.escapeHtml(dates.join(', ') || '—')}</span>`;
    }

    if (targetColumn.type === 'timeline') {
      const ranges = values.map(value => [value?.from, value?.to].filter(Boolean).join(' → ')).filter(Boolean);
      return `<span class="mirror-date">${this.escapeHtml(ranges.join(', ') || '—')}</span>`;
    }

    if (targetColumn.type === 'numbers' || targetColumn.type === 'formula') {
      const raw = values.map(value => value?.value ?? value?.displayValue ?? this.displayValue(value)).filter(value => value !== '' && value !== null && value !== undefined);
      return `<span class="mirror-number">${this.escapeHtml(raw.join(', ') || '—')}</span>`;
    }

    const display = values.map(value => this.displayValue(value)).filter(Boolean);
    return `<span class="mirror-text">${this.escapeHtml(display.join(', ') || '—')}</span>`;
  };

  app.cellHtml = function cellHtmlWithRelationalParity(item, column, options = {}) {
    if (column?.type === 'board_relation') {
      const linked = this.relationLinkedItems(item, column);
      const visible = linked.slice(0, 2);
      return `<button class="relation-cell relation-parity-cell ${linked.length ? 'has-links' : 'is-empty'}" data-action="relation-parity" data-id="${this.escapeAttr(item._id)}" data-column-id="${this.escapeAttr(column.id)}" type="button">${visible.length ? visible.map(entry => `<span class="relation-chip" title="${this.escapeAttr(entry.name || '')}">${this.escapeHtml(entry.name || 'Elemento')}</span>`).join('') : '<span class="relation-add">＋ Vincular</span>'}${linked.length > 2 ? `<span class="relation-more">+${linked.length - 2}</span>` : ''}</button>`;
    }
    if (column?.type === 'mirror') return this.mirrorCellHtml(item, column);
    return baseCellHtml(item, column, options);
  };

  app.bindBoardEvents = function bindBoardEventsWithRelationalParity() {
    baseBindBoardEvents();
    document.querySelectorAll('#content [data-action="relation-parity"]').forEach(button => {
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        this.openRelationParityPicker(button, button.dataset.id, button.dataset.columnId);
      });
    });
  };

  app.openRelationParityPicker = function openRelationParityPicker(anchor, itemId, columnId) {
    document.querySelectorAll('.floating-menu,.relation-parity-picker').forEach(node => node.remove());
    const column = this.effectiveColumns().find(entry => String(entry.id) === String(columnId));
    const targetBoard = this.relationTargetBoard?.(column);
    if (!column || !targetBoard) return this.showToast('Configura primero el tablero conectado', true);
    const item = this.findItem(itemId);
    const current = this.relationLinkedItems(item, column);
    const selected = new Set(current.map(entry => String(entry._id)));
    const multiple = Boolean(column.settings?.allowMultipleItems);
    const candidates = this.items.filter(entry => String(entry.board?._id || entry.board) === String(targetBoard._id) && !entry.isSubitem && !entry.deletedAt && !entry.archived);

    const menu = document.createElement('div');
    menu.className = 'floating-menu relation-parity-picker';
    menu.innerHTML = `<div class="relation-picker-title"><strong>${this.escapeHtml(column.title)}</strong><small>${this.escapeHtml(targetBoard.name)} · ${multiple ? 'varios elementos' : 'un elemento'}</small></div><label class="relation-search"><span>⌕</span><input type="search" placeholder="Buscar elemento" autocomplete="off"></label><div class="relation-parity-list"></div><div class="relation-picker-actions"><button type="button" data-relation-clear>Quitar vínculo</button><span></span><button type="button" data-relation-cancel>Cancelar</button><button type="button" class="relation-apply" data-relation-apply>Aplicar</button></div>`;
    const input = menu.querySelector('input');
    const list = menu.querySelector('.relation-parity-list');

    const render = () => {
      const term = String(input.value || '').trim().toLowerCase();
      const filtered = candidates.filter(entry => !term || String(entry.name || '').toLowerCase().includes(term));
      list.innerHTML = filtered.map(entry => `<button type="button" class="relation-option ${selected.has(String(entry._id)) ? 'is-selected' : ''}" data-relation-item="${this.escapeAttr(entry._id)}"><span class="relation-option-check">${selected.has(String(entry._id)) ? '✓' : ''}</span><span>${this.escapeHtml(entry.name)}</span></button>`).join('') || '<div class="relation-empty">No hay elementos que coincidan.</div>';
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
        linkedItems: picked.map(entry => ({ id: entry._id, mondayId: entry.mondayId || null, name: entry.name, boardId: targetBoard._id, boardName: targetBoard.name }))
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
