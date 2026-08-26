(() => {
  app.ganttZoom = app.ganttZoom || 'day';

  app.ganttZoomDayWidth = function ganttZoomDayWidth() {
    if (this.ganttZoom === 'month') return 9;
    if (this.ganttZoom === 'week') return 16;
    return 28;
  };

  app.ganttShowWeekends = function ganttShowWeekends(timeColumn) {
    const settings = timeColumn?.settings || {};
    if (settings.show_weekends === false || settings.showWeekends === false) return false;
    return true;
  };

  app.ganttIsWeekend = function ganttIsWeekend(date) {
    return date.getUTCDay() === 0 || date.getUTCDay() === 6;
  };

  app.ganttVisibleDates = function ganttVisibleDates(min, max, showWeekends) {
    const dates = [];
    for (let cursor = new Date(min); cursor <= max; cursor = new Date(cursor.getTime() + DAY_MS)) {
      if (showWeekends || !this.ganttIsWeekend(cursor)) dates.push(new Date(cursor));
    }
    return dates;
  };

  app.ganttDateKey = function ganttDateKey(date) {
    return this.isoDate(this.utcDay(date));
  };

  app.ganttVisibleIndex = function ganttVisibleIndex(date, edge = 'start') {
    if (!this.gantt?.dates?.length) return -1;
    const key = this.ganttDateKey(date);
    const exact = this.gantt.dateIndex.get(key);
    if (exact !== undefined) return exact;
    const time = this.utcDay(date).getTime();
    if (edge === 'end') {
      for (let index = this.gantt.dates.length - 1; index >= 0; index -= 1) {
        if (this.gantt.dates[index].getTime() <= time) return index;
      }
      return 0;
    }
    for (let index = 0; index < this.gantt.dates.length; index += 1) {
      if (this.gantt.dates[index].getTime() >= time) return index;
    }
    return this.gantt.dates.length - 1;
  };

  app.shiftGanttDate = function shiftGanttDate(date, steps) {
    if (!steps) return new Date(date);
    if (this.gantt?.showWeekends !== false) return new Date(date.getTime() + steps * DAY_MS);
    let cursor = new Date(date);
    const direction = steps > 0 ? 1 : -1;
    let remaining = Math.abs(steps);
    while (remaining > 0) {
      cursor = new Date(cursor.getTime() + direction * DAY_MS);
      if (!this.ganttIsWeekend(cursor)) remaining -= 1;
    }
    return cursor;
  };

  app.ganttDependencyTargets = function ganttDependencyTargets(item, dependencyColumn) {
    if (!item || !dependencyColumn) return [];
    const value = this.valueFor(item, dependencyColumn) || {};
    const localIds = new Set((value.linkedItemIds || []).map(String));
    const mondayIds = new Set((value.linkedMondayItemIds || []).map(String));
    (value.linkedItems || []).forEach(linked => {
      if (linked?.id) localIds.add(String(linked.id));
      if (linked?.mondayId || linked?.mondayItemId) mondayIds.add(String(linked.mondayId || linked.mondayItemId));
    });
    return this.boardItems().filter(candidate => localIds.has(String(candidate._id)) || (candidate.mondayId && mondayIds.has(String(candidate.mondayId))));
  };

  app.ganttHeaderCellHtml = function ganttHeaderCellHtml(date, index, width) {
    const weekday = ['D', 'L', 'M', 'X', 'J', 'V', 'S'][date.getUTCDay()];
    const month = new Intl.DateTimeFormat('es-ES', { month: 'short', timeZone: 'UTC' }).format(date).replace('.', '');
    const isWeekStart = date.getUTCDay() === 1;
    const isMonthStart = date.getUTCDate() === 1 || index === 0;
    let label = `<small>${weekday}</small><span>${date.getUTCDate()}</span>`;
    if (this.ganttZoom === 'week') label = isWeekStart ? `<small>Sem.</small><span>${date.getUTCDate()}</span>` : '<small></small><span></span>';
    if (this.ganttZoom === 'month') label = isMonthStart ? `<small>${month}</small><span>${date.getUTCFullYear()}</span>` : '<small></small><span></span>';
    return `<div class="gantt-day ${isWeekStart ? 'week-start' : ''} ${isMonthStart ? 'month-start' : ''}" data-date="${this.escapeAttr(this.ganttDateKey(date))}" style="width:${width}px" title="${this.escapeAttr(new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date))}">${label}${this.ganttZoom === 'day' && isMonthStart ? `<b>${this.escapeHtml(month)}</b>` : ''}</div>`;
  };

  app.renderGantt = function renderMondayGantt() {
    const content = document.getElementById('content');
    const timeColumn = this.effectiveColumns().find(column => column.type === 'timeline' || column.type === 'date');
    if (!timeColumn) {
      content.innerHTML = `<div class="empty-state"><h2>Sin columna temporal</h2><p>Este tablero no tiene Cronograma ni Fecha.</p></div>`;
      return;
    }

    const entries = this.filteredBoardItems().map(item => {
      const value = this.valueFor(item, timeColumn) || {};
      const start = timeColumn.type === 'date' ? value?.date : value?.from;
      const end = timeColumn.type === 'date' ? value?.date : value?.to;
      return { item, value, start, end };
    }).filter(entry => entry.start && entry.end);

    if (!entries.length) {
      content.innerHTML = `<div class="empty-state"><h2>Sin fechas</h2><p>Añade fechas en ${this.escapeHtml(timeColumn.title)} para usar Gantt.</p></div>`;
      return;
    }

    const starts = entries.map(entry => this.utcDay(entry.start));
    const ends = entries.map(entry => this.utcDay(entry.end));
    const min = new Date(Math.min(...starts.map(date => date.getTime())) - 10 * DAY_MS);
    const max = new Date(Math.max(...ends.map(date => date.getTime())) + 10 * DAY_MS);
    const showWeekends = this.ganttShowWeekends(timeColumn);
    const dates = this.ganttVisibleDates(min, max, showWeekends);
    const dayWidth = this.ganttZoomDayWidth();
    const timelineWidth = Math.max(1, dates.length) * dayWidth;
    const dateIndex = new Map(dates.map((date, index) => [this.ganttDateKey(date), index]));
    this.gantt = { min, max, dates, dateIndex, dayWidth, timelineWidth, timeColumn, showWeekends };

    const groups = this.effectiveGroups();
    const grouped = new Map(groups.map(group => [group.id, { group, entries: [] }]));
    entries.forEach(entry => {
      let bucket = grouped.get(entry.item.groupId);
      if (!bucket) {
        const matched = groups.find(group => group.title === entry.item.group);
        if (matched) bucket = grouped.get(matched.id);
      }
      if (!bucket) {
        const synthetic = { id: entry.item.groupId || `gantt:${entry.item.group}`, title: entry.item.group || 'General', color: entry.item.groupColor || '#579bfc' };
        bucket = { group: synthetic, entries: [] };
        grouped.set(synthetic.id, bucket);
      }
      bucket.entries.push(entry);
    });

    const days = dates.map((date, index) => this.ganttHeaderCellHtml(date, index, dayWidth)).join('');
    const groupBlocks = [...grouped.values()].filter(bucket => bucket.entries.length).map(bucket => {
      const collapsed = this.collapsedGroups.has(bucket.group.id);
      const rows = collapsed ? '' : bucket.entries.map(entry => {
        const start = this.utcDay(entry.start);
        const end = this.utcDay(entry.end);
        const startIndex = this.ganttVisibleIndex(start, 'start');
        const endIndex = this.ganttVisibleIndex(end, 'end');
        const left = Math.max(0, startIndex) * dayWidth;
        const duration = Math.max(1, endIndex - startIndex + 1);
        const width = duration * dayWidth;
        const color = bucket.group.color || entry.item.groupColor || '#579bfc';
        const milestone = entry.value?.visualizationType === 'milestone' || entry.value?.visualization_type === 'milestone' || entry.value?.milestone === true;
        return `<div class="gantt-row" data-item-id="${this.escapeAttr(entry.item._id)}"><div class="gantt-label"><strong>${this.escapeHtml(entry.item.name)}</strong><small>${this.escapeHtml(bucket.group.title || '')}</small></div><div class="gantt-track" style="width:${timelineWidth}px;--gantt-day-width:${dayWidth}px"><div class="gantt-bar ${milestone ? 'milestone' : ''}" data-id="${this.escapeAttr(entry.item._id)}" data-start="${this.escapeAttr(entry.start)}" data-end="${this.escapeAttr(entry.end)}" style="left:${left}px;width:${milestone ? Math.max(18, dayWidth) : width}px;background:${this.escapeAttr(color)}"><span class="gantt-handle left" data-resize="start"></span><span class="gantt-bar-label">${milestone ? '◆ ' : ''}${this.escapeHtml(entry.item.name)}</span><span class="gantt-handle right" data-resize="end"></span></div></div></div>`;
      }).join('');
      return `<section class="gantt-group" data-gantt-group="${this.escapeAttr(bucket.group.id)}" style="--gantt-group-color:${this.escapeAttr(bucket.group.color || '#579bfc')}"><button class="gantt-group-header" type="button" data-gantt-group-toggle="${this.escapeAttr(bucket.group.id)}"><span>${collapsed ? '▸' : '▾'}</span><i></i><strong>${this.escapeHtml(bucket.group.title)}</strong><small>${bucket.entries.length}</small></button>${rows}</section>`;
    }).join('');

    const todayIndex = this.ganttVisibleIndex(this.utcDay(new Date()), 'start');
    const todayLeft = todayIndex >= 0 && todayIndex < dates.length ? todayIndex * dayWidth : null;
    const weekendNote = showWeekends ? 'Fines de semana visibles' : 'Fines de semana ocultos según Cronograma';
    content.innerHTML = `<div class="gantt-shell"><div class="gantt-help"><div><strong>Gantt</strong><span>Arrastra barras, redimensiona extremos y sigue dependencias Strict.</span></div><div class="gantt-parity-controls"><button type="button" data-gantt-today>Hoy</button><div class="gantt-zoom" role="group" aria-label="Escala"><button type="button" data-gantt-zoom="day" class="${this.ganttZoom === 'day' ? 'active' : ''}">Día</button><button type="button" data-gantt-zoom="week" class="${this.ganttZoom === 'week' ? 'active' : ''}">Semana</button><button type="button" data-gantt-zoom="month" class="${this.ganttZoom === 'month' ? 'active' : ''}">Mes</button></div><span>${weekendNote}</span></div></div><div class="gantt-scroller"><div class="gantt-canvas" style="width:${timelineWidth + 260}px"><div class="gantt-days"><div class="gantt-label-head">Elemento</div><div class="gantt-days-track" style="width:${timelineWidth}px">${days}</div></div><div class="gantt-body">${todayLeft !== null ? `<div class="today-line" style="left:${260 + todayLeft}px"><span>Hoy</span></div>` : ''}${groupBlocks}</div></div></div></div>`;

    content.querySelectorAll('.gantt-bar').forEach(bar => bar.addEventListener('pointerdown', event => this.startMondayGanttPointer(event, bar)));
    content.querySelectorAll('[data-gantt-group-toggle]').forEach(button => button.addEventListener('click', () => {
      const groupId = button.dataset.ganttGroupToggle;
      if (this.collapsedGroups.has(groupId)) this.collapsedGroups.delete(groupId);
      else this.collapsedGroups.add(groupId);
      this.renderGantt();
    }));
    content.querySelectorAll('[data-gantt-zoom]').forEach(button => button.addEventListener('click', () => {
      this.ganttZoom = button.dataset.ganttZoom;
      this.renderGantt();
    }));
    content.querySelector('[data-gantt-today]')?.addEventListener('click', () => {
      const scroller = content.querySelector('.gantt-scroller');
      const line = content.querySelector('.today-line');
      if (!scroller || !line) return;
      scroller.scrollTo({ left: Math.max(0, line.offsetLeft - scroller.clientWidth / 2), behavior: 'smooth' });
    });

    requestAnimationFrame(() => this.drawGanttDependencies());
  };

  app.startMondayGanttPointer = function startMondayGanttPointer(event, bar) {
    event.preventDefault();
    const item = this.findItem(bar.dataset.id);
    if (!item || !this.gantt) return;
    const mode = event.target.dataset.resize === 'start' ? 'resize-start' : event.target.dataset.resize === 'end' ? 'resize-end' : 'move';
    const originX = event.clientX;
    const originalStart = this.utcDay(bar.dataset.start);
    const originalEnd = this.utcDay(bar.dataset.end);
    const originalLeft = parseFloat(bar.style.left) || 0;
    const originalWidth = parseFloat(bar.style.width) || this.gantt.dayWidth;
    const dayWidth = this.gantt.dayWidth;
    bar.setPointerCapture?.(event.pointerId);
    bar.classList.add('is-dragging');

    const onMove = moveEvent => {
      const steps = Math.round((moveEvent.clientX - originX) / dayWidth);
      if (mode === 'move') bar.style.left = `${originalLeft + steps * dayWidth}px`;
      else if (mode === 'resize-start') {
        const startIndex = this.ganttVisibleIndex(originalStart, 'start');
        const endIndex = this.ganttVisibleIndex(originalEnd, 'end');
        const safe = Math.min(steps, Math.max(0, endIndex - startIndex));
        bar.style.left = `${originalLeft + safe * dayWidth}px`;
        bar.style.width = `${Math.max(dayWidth, originalWidth - safe * dayWidth)}px`;
      } else {
        const startIndex = this.ganttVisibleIndex(originalStart, 'start');
        const endIndex = this.ganttVisibleIndex(originalEnd, 'end');
        const safe = Math.max(steps, -(Math.max(0, endIndex - startIndex)));
        bar.style.width = `${Math.max(dayWidth, originalWidth + safe * dayWidth)}px`;
      }
      bar.dataset.visibleSteps = String(steps);
    };

    const onUp = async upEvent => {
      bar.releasePointerCapture?.(upEvent.pointerId);
      bar.classList.remove('is-dragging');
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      const steps = Number(bar.dataset.visibleSteps || 0);
      delete bar.dataset.visibleSteps;
      if (!steps) return this.renderGantt();
      let start = new Date(originalStart);
      let end = new Date(originalEnd);
      if (mode === 'move') {
        start = this.shiftGanttDate(start, steps);
        end = this.shiftGanttDate(end, steps);
      } else if (mode === 'resize-start') {
        const candidate = this.shiftGanttDate(start, steps);
        start = candidate > end ? new Date(end) : candidate;
      } else {
        const candidate = this.shiftGanttDate(end, steps);
        end = candidate < start ? new Date(start) : candidate;
      }
      const column = this.gantt.timeColumn;
      const value = column.type === 'date'
        ? { type: 'date', date: this.isoDate(start) }
        : { type: 'timeline', from: this.isoDate(start), to: this.isoDate(end), ...(this.valueFor(item, column)?.visualizationType === 'milestone' ? { visualizationType: 'milestone' } : {}) };
      await this.updateColumnValue(item._id, column.id, value);
      this.renderGantt();
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  };

  app.drawGanttDependencies = function drawGanttDependencies() {
    const shell = document.querySelector('#content .gantt-shell');
    const body = shell?.querySelector('.gantt-body');
    if (!shell || !body || !this.gantt) return;
    const dependencyColumn = this.effectiveColumns().find(column => column.type === 'dependency');
    body.querySelector('.gantt-dependency-svg')?.remove();
    if (!dependencyColumn) return;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('gantt-dependency-svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = '<defs><marker id="nm-gantt-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z"></path></marker></defs>';
    body.appendChild(svg);

    const bodyRect = body.getBoundingClientRect();
    const rows = new Map([...body.querySelectorAll('.gantt-row[data-item-id]')].map(row => [String(row.dataset.itemId), row]));
    let lineCount = 0;
    rows.forEach((dependentRow, dependentId) => {
      const dependent = this.findItem(dependentId);
      const dependentBar = dependentRow.querySelector('.gantt-bar');
      if (!dependent || !dependentBar) return;
      this.ganttDependencyTargets(dependent, dependencyColumn).forEach(predecessor => {
        const predecessorBar = rows.get(String(predecessor._id))?.querySelector('.gantt-bar');
        if (!predecessorBar) return;
        const from = predecessorBar.getBoundingClientRect();
        const to = dependentBar.getBoundingClientRect();
        const x1 = from.right - bodyRect.left;
        const y1 = from.top + from.height / 2 - bodyRect.top;
        const x2 = to.left - bodyRect.left;
        const y2 = to.top + to.height / 2 - bodyRect.top;
        const direction = x2 >= x1 ? 1 : -1;
        const bend = Math.max(14, Math.abs(x2 - x1) * 0.4);
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${x1} ${y1} C ${x1 + bend * direction} ${y1}, ${x2 - bend * direction} ${y2}, ${x2 - 4 * direction} ${y2}`);
        path.setAttribute('marker-end', 'url(#nm-gantt-arrow)');
        path.classList.add('gantt-dependency-line');
        svg.appendChild(path);
        lineCount += 1;
      });
    });
    shell.dataset.dependencyLines = String(lineCount);
  };
})();
