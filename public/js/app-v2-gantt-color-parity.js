(() => {
  const COLOR_KEY = 'new-monday:gantt-color-mode';
  const baseRenderGantt = app.renderGantt.bind(app);

  app.ganttColorMode = (() => {
    try { return localStorage.getItem(COLOR_KEY) || 'group'; } catch { return 'group'; }
  })();

  app.ganttStatusColumn = function ganttStatusColumn() {
    return this.effectiveColumns().find(column => column.type === 'status') || null;
  };

  app.ganttStatusColor = function ganttStatusColor(item) {
    const column = this.ganttStatusColumn();
    if (!column || !item) return null;
    const value = this.valueFor(item, column) || {};
    if (value.color) return value.color;
    const label = this.displayValue(value);
    const option = this.statusLabels(column).find(entry => String(entry.label) === String(label));
    return option?.color || option?.hex || null;
  };

  app.applyGanttColorMode = function applyGanttColorMode() {
    const content = document.getElementById('content');
    if (!content) return;
    content.querySelectorAll('.gantt-bar[data-id]').forEach(bar => {
      const item = this.findItem(bar.dataset.id);
      if (!item) return;
      const group = this.effectiveGroups().find(entry => String(entry.id) === String(item.groupId) || String(entry.title) === String(item.group));
      const groupColor = group?.color || item.groupColor || '#579bfc';
      const statusColor = this.ganttStatusColor(item);
      const color = this.ganttColorMode === 'status' ? (statusColor || groupColor) : groupColor;
      bar.style.background = color;
      bar.dataset.ganttColorMode = this.ganttColorMode;
    });
  };

  app.decorateGanttColorControls = function decorateGanttColorControls() {
    const controls = document.querySelector('.gantt-parity-controls');
    if (!controls || controls.querySelector('[data-gantt-color-mode]')) return;
    const statusColumn = this.ganttStatusColumn();
    const wrapper = document.createElement('label');
    wrapper.className = 'gantt-color-control';
    wrapper.innerHTML = `<span>Color</span><select data-gantt-color-mode aria-label="Color de barras Gantt"><option value="group">Grupo</option>${statusColumn ? '<option value="status">Estado</option>' : ''}</select>`;
    const select = wrapper.querySelector('select');
    select.value = statusColumn && this.ganttColorMode === 'status' ? 'status' : 'group';
    if (!statusColumn && this.ganttColorMode === 'status') this.ganttColorMode = 'group';
    select.addEventListener('change', () => {
      this.ganttColorMode = select.value === 'status' ? 'status' : 'group';
      try { localStorage.setItem(COLOR_KEY, this.ganttColorMode); } catch { /* local preference only */ }
      this.applyGanttColorMode();
    });
    controls.insertBefore(wrapper, controls.lastElementChild || null);
  };

  app.renderGantt = function renderGanttWithColorControls() {
    baseRenderGantt();
    this.decorateGanttColorControls();
    this.applyGanttColorMode();
  };
})();
