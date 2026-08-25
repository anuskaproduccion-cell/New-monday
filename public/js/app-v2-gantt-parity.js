(() => {
  const originalRenderGantt = app.renderGantt.bind(app);

  app.renderGantt = function renderGanttWithMondayDetails() {
    originalRenderGantt();
    requestAnimationFrame(() => this.decorateMondayGantt());
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

  app.decorateMondayGantt = function decorateMondayGantt() {
    const shell = document.querySelector('#content .gantt-shell');
    const body = shell?.querySelector('.gantt-body');
    const scroller = shell?.querySelector('.gantt-scroller');
    if (!shell || !body || !scroller || !this.gantt) return;

    shell.querySelectorAll('.gantt-day').forEach((day, index) => {
      const date = new Date(this.gantt.min.getTime() + index * DAY_MS);
      const weekday = ['D', 'L', 'M', 'X', 'J', 'V', 'S'][date.getUTCDay()];
      const month = new Intl.DateTimeFormat('es-ES', { month: 'short', timeZone: 'UTC' }).format(date).replace('.', '');
      day.innerHTML = `<small>${weekday}</small><span>${date.getUTCDate()}</span>${date.getUTCDate() === 1 || index === 0 ? `<b>${month}</b>` : ''}`;
      day.title = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
    });

    const help = shell.querySelector('.gantt-help');
    if (help && !help.querySelector('[data-gantt-today]')) {
      const controls = document.createElement('div');
      controls.className = 'gantt-parity-controls';
      controls.innerHTML = '<button type="button" data-gantt-today>Hoy</button><span>◆ Hito</span><span>↗ Dependencia</span>';
      help.appendChild(controls);
      controls.querySelector('[data-gantt-today]')?.addEventListener('click', () => {
        const line = body.querySelector('.today-line');
        if (!line) return;
        const target = Math.max(0, line.offsetLeft - scroller.clientWidth / 2);
        scroller.scrollTo({ left: target, behavior: 'smooth' });
      });
    }

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
      const predecessors = this.ganttDependencyTargets(dependent, dependencyColumn);
      predecessors.forEach(predecessor => {
        const predecessorRow = rows.get(String(predecessor._id));
        const predecessorBar = predecessorRow?.querySelector('.gantt-bar');
        if (!predecessorBar) return;
        const from = predecessorBar.getBoundingClientRect();
        const to = dependentBar.getBoundingClientRect();
        const x1 = from.right - bodyRect.left;
        const y1 = from.top + from.height / 2 - bodyRect.top;
        const x2 = to.left - bodyRect.left;
        const y2 = to.top + to.height / 2 - bodyRect.top;
        const bend = Math.max(14, Math.abs(x2 - x1) * 0.42);
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2 - 4} ${y2}`);
        path.setAttribute('marker-end', 'url(#nm-gantt-arrow)');
        path.classList.add('gantt-dependency-line');
        svg.appendChild(path);
        lineCount += 1;
      });
    });

    shell.dataset.dependencyLines = String(lineCount);
  };
})();
