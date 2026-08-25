(() => {
  const baseCellHtml = app.cellHtml.bind(app);
  const baseBindBoardEvents = app.bindBoardEvents.bind(app);

  function normalizedDate(value) {
    const raw = String(value || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
  }

  function formatDate(value) {
    const raw = normalizedDate(value);
    if (!raw) return '';
    const [year, month, day] = raw.split('-');
    return `${day}/${month}/${year}`;
  }

  function durationLabel(from, to) {
    const a = normalizedDate(from);
    const b = normalizedDate(to);
    if (!a || !b) return '';
    const start = new Date(`${a}T00:00:00Z`);
    const end = new Date(`${b}T00:00:00Z`);
    const days = Math.max(1, Math.round((end - start) / DAY_MS) + 1);
    return `${days} d`;
  }

  app.cellHtml = function cellHtmlWithCompactTimeline(item, column, options = {}) {
    if (column?.type === 'timeline') {
      const value = this.valueFor(item, column) || {};
      const from = normalizedDate(value.from || this.toInputDate(item.startDate));
      const to = normalizedDate(value.to || this.toInputDate(item.endDate));
      const milestone = value.visualizationType === 'milestone' || value.visualization_type === 'milestone';
      const label = milestone
        ? (from ? `◆ ${formatDate(from)}` : '◆ Añadir hito')
        : (from && to ? `${formatDate(from)} → ${formatDate(to)}` : from ? `${formatDate(from)} → …` : to ? `… → ${formatDate(to)}` : '＋ Añadir fechas');
      const duration = milestone ? '' : durationLabel(from, to);
      return `<button class="timeline-cell-display ${milestone ? 'is-milestone' : ''} ${from || to ? 'has-value' : 'is-empty'}" type="button" data-action="timeline-edit" data-id="${this.escapeAttr(item._id)}" data-column-id="${this.escapeAttr(column.id)}" data-from="${this.escapeAttr(from)}" data-to="${this.escapeAttr(to)}" aria-label="Editar ${this.escapeAttr(column.title || 'Cronograma')}">
        <span class="timeline-cell-label">${this.escapeHtml(label)}</span>${duration ? `<small class="timeline-cell-duration">${this.escapeHtml(duration)}</small>` : ''}
      </button>`;
    }

    if (column?.type === 'formula') {
      const value = this.valueFor(item, column);
      const raw = this.displayValue(value).trim();
      const display = /^(null|undefined|nan)$/i.test(raw) ? '' : raw;
      return `<span class="formula-value ${display ? '' : 'is-empty'}" title="Calculado automáticamente">${display ? `ƒ ${this.escapeHtml(display)}` : '—'}</span>`;
    }

    return baseCellHtml(item, column, options);
  };

  app.bindBoardEvents = function bindBoardEventsWithTimelinePopover() {
    baseBindBoardEvents();
    const content = document.getElementById('content');
    if (!content) return;

    content.querySelectorAll('[data-action="timeline-edit"]').forEach(button => {
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        this.openTimelineEditor(button, button.dataset.id, button.dataset.columnId);
      });
    });
  };

  app.openTimelineEditor = function openTimelineEditor(anchor, itemId, columnId) {
    document.querySelectorAll('.timeline-editor-menu,.floating-menu,.status-menu').forEach(node => node.remove());

    const item = this.findItem(itemId);
    const column = this.effectiveColumns().find(entry => entry.id === columnId);
    if (!item || !column) return;
    const value = this.valueFor(item, column) || {};
    const from = normalizedDate(value.from || this.toInputDate(item.startDate));
    const to = normalizedDate(value.to || this.toInputDate(item.endDate));
    const milestone = value.visualizationType === 'milestone' || value.visualization_type === 'milestone';

    const menu = document.createElement('div');
    menu.className = 'floating-menu timeline-editor-menu';
    menu.setAttribute('role', 'dialog');
    menu.setAttribute('aria-label', `Editar ${column.title || 'Cronograma'}`);
    menu.innerHTML = `
      <div class="timeline-editor-title">${this.escapeHtml(column.title || 'Cronograma')}</div>
      <div class="timeline-editor-dates">
        <label><span>Inicio</span><input type="date" data-timeline-editor="from" value="${this.escapeAttr(from)}"></label>
        <span class="timeline-editor-arrow">→</span>
        <label><span>Fin</span><input type="date" data-timeline-editor="to" value="${this.escapeAttr(to)}"></label>
      </div>
      <label class="timeline-milestone-toggle"><input type="checkbox" data-timeline-milestone ${milestone ? 'checked' : ''}><span>Marcar como hito</span></label>
      <div class="timeline-editor-actions">
        <button type="button" class="timeline-clear" data-timeline-action="clear">Borrar</button>
        <span class="timeline-editor-spacer"></span>
        <button type="button" data-timeline-action="cancel">Cancelar</button>
        <button type="button" class="timeline-save" data-timeline-action="save">Guardar</button>
      </div>
    `;

    const fromInput = menu.querySelector('[data-timeline-editor="from"]');
    const toInput = menu.querySelector('[data-timeline-editor="to"]');
    const milestoneInput = menu.querySelector('[data-timeline-milestone]');

    const syncMilestone = () => {
      if (!milestoneInput.checked) return;
      if (fromInput.value) toInput.value = fromInput.value;
      else if (toInput.value) fromInput.value = toInput.value;
    };
    milestoneInput.addEventListener('change', syncMilestone);
    fromInput.addEventListener('change', syncMilestone);
    toInput.addEventListener('change', () => {
      if (milestoneInput.checked) fromInput.value = toInput.value;
    });

    menu.querySelector('[data-timeline-action="clear"]')?.addEventListener('click', async () => {
      await this.updateColumnValue(itemId, columnId, { type: 'timeline', from: null, to: null });
      menu.remove();
      this.renderBoard();
    });

    menu.querySelector('[data-timeline-action="cancel"]')?.addEventListener('click', () => menu.remove());

    menu.querySelector('[data-timeline-action="save"]')?.addEventListener('click', async () => {
      let nextFrom = fromInput.value || '';
      let nextTo = toInput.value || '';
      const isMilestone = milestoneInput.checked;

      if (isMilestone) {
        const date = nextFrom || nextTo;
        nextFrom = date;
        nextTo = date;
      } else if (nextFrom && nextTo && nextFrom > nextTo) {
        [nextFrom, nextTo] = [nextTo, nextFrom];
      }

      const nextValue = {
        type: 'timeline',
        from: nextFrom || null,
        to: nextTo || null,
        ...(isMilestone ? { visualizationType: 'milestone' } : {})
      };
      await this.updateColumnValue(itemId, columnId, nextValue);
      menu.remove();
      this.renderBoard();
    });

    this.positionMenu(menu, anchor);
    requestAnimationFrame(() => fromInput?.focus());
  };
})();
