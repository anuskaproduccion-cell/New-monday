(() => {
  const STATUS_COLORS = [
    '#00c875', '#fdab3d', '#df2f4a', '#579bfc', '#9cd326', '#ff642e', '#9d50dd',
    '#007eb5', '#66ccff', '#bb3354', '#ff007f', '#ff5ac4', '#784bd1', '#cab641',
    '#037f4c', '#7f5347', '#c4c4c4', '#757575'
  ];

  const originalStatusLabels = app.statusLabels.bind(app);

  app.statusLabels = function mondayStatusLabels(column) {
    const settings = column?.settings || {};
    const raw = settings.labels;
    const rawColors = settings.labels_colors || settings.labelsColors || {};
    const rawPositions = settings.labels_positions_v2 || settings.labelsPositions || {};
    const rawDescriptions = settings.labelDescriptions || settings.labels_descriptions || {};

    if (Array.isArray(raw)) {
      return raw.map((entry, index) => {
        const id = String(entry?.id ?? index);
        return {
          id,
          label: entry?.label ?? entry?.name ?? String(entry ?? ''),
          color: entry?.hex || entry?.color || rawColors?.[entry?.id]?.color || '#c4c4c4',
          position: Number(entry?.position ?? index),
          description: entry?.description || rawDescriptions?.[id] || ''
        };
      }).filter(entry => entry.label).sort((a, b) => a.position - b.position);
    }

    if (raw && typeof raw === 'object') {
      return Object.entries(raw).map(([id, label], index) => ({
        id: String(id),
        label: typeof label === 'string' ? label : (label?.label || label?.name || String(label ?? '')),
        color: rawColors?.[id]?.color || rawColors?.[id]?.hex || '#c4c4c4',
        position: Number(rawPositions?.[id] ?? index),
        description: (typeof label === 'object' ? label?.description : '') || rawDescriptions?.[id] || ''
      })).filter(entry => entry.label).sort((a, b) => a.position - b.position);
    }

    return originalStatusLabels(column).map((entry, index) => ({
      ...entry,
      id: String(entry.id ?? index),
      position: index,
      description: entry.description || rawDescriptions?.[String(entry.id ?? index)] || ''
    }));
  };

  app.openDynamicStatusMenu = function openMondayStatusMenu(anchor, itemId, columnId) {
    document.querySelectorAll('.status-menu,.floating-menu').forEach(node => node.remove());
    const column = (this.currentBoard?.columns || []).find(entry => String(entry.id) === String(columnId));
    if (!column) return;
    const current = this.displayValue(this.valueFor(this.findItem(itemId), column));
    const menu = document.createElement('div');
    menu.className = 'status-menu monday-status-menu';
    menu.innerHTML = `<div class="status-menu-title">${this.escapeHtml(column.title)}</div><div class="status-options"></div><button class="status-edit-labels" type="button">✎ Editar etiquetas</button>`;
    const options = menu.querySelector('.status-options');
    const labels = this.statusLabels(column);

    [...labels, { id: '__empty__', label: '', color: '#c4c4c4', description: '' }].forEach(option => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `status-option ${String(current) === String(option.label) ? 'is-selected' : ''}`;
      button.style.setProperty('--status-option-color', option.color || '#c4c4c4');
      if (option.description) button.title = option.description;
      button.innerHTML = `<span class="status-option-check">${String(current) === String(option.label) ? '✓' : ''}</span><span>${this.escapeHtml(option.label || 'Sin estado')}</span>`;
      button.addEventListener('click', async () => {
        await this.updateColumnValue(itemId, columnId, {
          type: 'status',
          label: option.label,
          text: option.label,
          color: option.color || '#c4c4c4'
        });
        menu.remove();
        this.renderBoard();
      });
      options.appendChild(button);
    });

    menu.querySelector('.status-edit-labels')?.addEventListener('click', () => {
      menu.remove();
      this.openStatusLabelsEditor(columnId);
    });
    this.positionMenu(menu, anchor);
  };

  app.statusLabelEditorRowHtml = function statusLabelEditorRowHtml(label, index) {
    const id = String(label?.id ?? `local_${index}`);
    const color = label?.color || STATUS_COLORS[index % STATUS_COLORS.length];
    return `<div class="status-label-editor-row" data-status-label-id="${this.escapeAttr(id)}">
      <span class="status-drag-handle" title="Arrastra para reordenar" aria-label="Reordenar etiqueta">⋮⋮</span>
      <input type="color" data-status-label-color value="${this.escapeAttr(color)}" aria-label="Color">
      <div class="status-label-editor-fields">
        <input type="text" data-status-label-text maxlength="80" value="${this.escapeAttr(label?.label || '')}" placeholder="Etiqueta">
        <input type="text" data-status-label-description maxlength="180" value="${this.escapeAttr(label?.description || '')}" placeholder="Descripción opcional">
      </div>
      <button type="button" data-status-label-remove title="Eliminar etiqueta">×</button>
    </div>`;
  };

  app.openStatusLabelsEditor = function openStatusLabelsEditor(columnId) {
    const column = (this.currentBoard?.columns || []).find(entry => String(entry.id) === String(columnId));
    if (!column) return;
    const labels = this.statusLabels(column);
    this.openModal(`<form id="status-labels-form" class="modal-card status-labels-modal">
      <div class="modal-header"><div><h2>Editar etiquetas</h2><p>${this.escapeHtml(column.title)} · hasta 40 estados</p></div><button type="button" class="modal-close" data-close-modal>×</button></div>
      <div id="status-label-editor-list" class="status-label-editor-list">${labels.map((label, index) => this.statusLabelEditorRowHtml(label, index)).join('')}</div>
      <button type="button" class="button status-add-label" id="status-add-label">＋ Añadir etiqueta</button>
      <p class="status-label-note">Arrastra ⋮⋮ para cambiar el orden. El estado gris vacío se mantiene como estado predeterminado.</p>
      <div class="modal-actions"><button type="button" class="button" data-close-modal>Cancelar</button><button class="button primary">Aplicar</button></div>
    </form>`);

    const list = document.getElementById('status-label-editor-list');
    let draggedRow = null;
    const bindRow = row => {
      row.querySelector('[data-status-label-remove]')?.addEventListener('click', () => row.remove());
      const handle = row.querySelector('.status-drag-handle');
      handle?.addEventListener('pointerdown', () => { row.draggable = true; });
      handle?.addEventListener('pointerup', () => { row.draggable = false; });
      row.addEventListener('dragstart', event => {
        draggedRow = row;
        row.classList.add('is-dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', row.dataset.statusLabelId || 'status-label');
      });
      row.addEventListener('dragover', event => {
        if (!draggedRow || draggedRow === row) return;
        event.preventDefault();
        const rect = row.getBoundingClientRect();
        const before = event.clientY < rect.top + rect.height / 2;
        list.insertBefore(draggedRow, before ? row : row.nextSibling);
      });
      row.addEventListener('dragend', () => {
        row.classList.remove('is-dragging');
        row.draggable = false;
        draggedRow = null;
      });
    };
    list.querySelectorAll('.status-label-editor-row').forEach(bindRow);

    document.getElementById('status-add-label')?.addEventListener('click', () => {
      if (list.querySelectorAll('.status-label-editor-row').length >= 40) return this.showToast('Máximo 40 etiquetas', true);
      const index = list.querySelectorAll('.status-label-editor-row').length;
      list.insertAdjacentHTML('beforeend', this.statusLabelEditorRowHtml({ id: `local_${Date.now()}_${index}`, label: '', color: STATUS_COLORS[index % STATUS_COLORS.length], description: '' }, index));
      bindRow(list.lastElementChild);
      list.lastElementChild.querySelector('[data-status-label-text]')?.focus();
    });

    document.getElementById('status-labels-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const rows = [...list.querySelectorAll('.status-label-editor-row')];
      const nextLabels = {};
      const nextColors = {};
      const nextPositions = {};
      const nextDescriptions = {};
      rows.forEach((row, index) => {
        const text = row.querySelector('[data-status-label-text]')?.value.trim() || '';
        if (!text) return;
        let id = String(row.dataset.statusLabelId || index);
        if (id.startsWith('local_')) id = String(100 + index);
        while (Object.prototype.hasOwnProperty.call(nextLabels, id)) id = String(Number(id) + 1000 || `${id}_${index}`);
        const color = row.querySelector('[data-status-label-color]')?.value || '#c4c4c4';
        const description = row.querySelector('[data-status-label-description]')?.value.trim() || '';
        nextLabels[id] = text;
        nextColors[id] = { color, border: color };
        nextPositions[id] = index;
        if (description) nextDescriptions[id] = description;
      });
      if (!Object.keys(nextLabels).length) return this.showToast('Debe quedar al menos una etiqueta', true);

      const settings = {
        ...(column.settings || {}),
        labels: nextLabels,
        labels_colors: nextColors,
        labels_positions_v2: nextPositions,
        labelDescriptions: nextDescriptions
      };
      await this.patchColumn(columnId, { settings });
      this.closeModal();
      this.showToast('Etiquetas de Estado actualizadas');
    });
  };
})();