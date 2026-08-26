(() => {
  const CONFIG_PREFIX = 'new-monday:gantt-config:';
  const baseRenderGantt = app.renderGantt.bind(app);

  app.ganttConfigCollapsed = app.ganttConfigCollapsed || new Set();

  app.ganttConfigStorageKey = function ganttConfigStorageKey() {
    return `${CONFIG_PREFIX}${String(this.currentBoardId() || 'default')}`;
  };

  app.ganttConfig = function ganttConfig() {
    const fallback = { groupBy: 'group', labelFields: ['group'] };
    try {
      const parsed = JSON.parse(localStorage.getItem(this.ganttConfigStorageKey()) || 'null');
      if (!parsed || typeof parsed !== 'object') return fallback;
      return {
        groupBy: ['group', 'status', 'person', 'none'].includes(parsed.groupBy) ? parsed.groupBy : 'group',
        labelFields: Array.isArray(parsed.labelFields) ? parsed.labelFields.filter(field => ['group', 'status', 'person', 'dates', 'dependency'].includes(field)) : ['group']
      };
    } catch {
      return fallback;
    }
  };

  app.saveGanttConfig = function saveGanttConfig(config) {
    try { localStorage.setItem(this.ganttConfigStorageKey(), JSON.stringify(config)); } catch { /* local preference only */ }
  };

  app.ganttPeopleColumn = function ganttPeopleColumn() {
    return this.effectiveColumns().find(column => column.type === 'people') || null;
  };

  app.ganttDependencyColumn = function ganttDependencyColumn() {
    return this.effectiveColumns().find(column => column.type === 'dependency') || null;
  };

  app.ganttBucketForItem = function ganttBucketForItem(item, mode) {
    if (mode === 'status') {
      const column = this.ganttStatusColumn?.() || this.effectiveColumns().find(entry => entry.type === 'status');
      const value = column ? this.valueFor(item, column) : null;
      const title = this.displayValue(value) || 'Sin estado';
      const color = value?.color || this.ganttStatusColor?.(item) || '#c4c4c4';
      return { id: `status:${title}`, title, color };
    }
    if (mode === 'person') {
      const column = this.ganttPeopleColumn();
      const value = column ? this.valueFor(item, column) : null;
      const names = Array.isArray(value?.names) ? value.names.filter(Boolean) : [];
      const title = names[0] || value?.text || this.displayValue(value) || 'Sin persona';
      return { id: `person:${title}`, title, color: '#579bfc' };
    }
    if (mode === 'none') return { id: 'all', title: 'Todos los elementos', color: '#676879' };
    const group = this.effectiveGroups().find(entry => String(entry.id) === String(item.groupId) || String(entry.title) === String(item.group));
    return { id: String(group?.id || item.groupId || item.group || 'general'), title: group?.title || item.group || 'General', color: group?.color || item.groupColor || '#579bfc' };
  };

  app.applyGanttGrouping = function applyGanttGrouping() {
    const config = this.ganttConfig();
    if (config.groupBy === 'group') return;
    const body = document.querySelector('#content .gantt-body');
    if (!body) return;
    const rows = [...body.querySelectorAll('.gantt-row[data-item-id]')];
    if (!rows.length) return;

    const sections = [...body.querySelectorAll('.gantt-group')];
    sections.forEach(section => section.remove());
    const buckets = new Map();
    rows.forEach(row => {
      const item = this.findItem(row.dataset.itemId);
      if (!item) return;
      const bucket = this.ganttBucketForItem(item, config.groupBy);
      if (!buckets.has(bucket.id)) buckets.set(bucket.id, { ...bucket, rows: [] });
      buckets.get(bucket.id).rows.push(row);
    });

    buckets.forEach(bucket => {
      const section = document.createElement('section');
      const collapseKey = `${config.groupBy}:${bucket.id}`;
      const collapsed = this.ganttConfigCollapsed.has(collapseKey);
      section.className = `gantt-group gantt-config-group ${collapsed ? 'is-collapsed' : ''}`;
      section.dataset.ganttConfigGroup = collapseKey;
      section.style.setProperty('--gantt-group-color', bucket.color);
      const header = document.createElement('button');
      header.type = 'button';
      header.className = 'gantt-group-header';
      header.innerHTML = `<span>${collapsed ? '▸' : '▾'}</span><i></i><strong>${this.escapeHtml(bucket.title)}</strong><small>${bucket.rows.length}</small>`;
      header.addEventListener('click', () => {
        if (this.ganttConfigCollapsed.has(collapseKey)) this.ganttConfigCollapsed.delete(collapseKey);
        else this.ganttConfigCollapsed.add(collapseKey);
        this.renderGantt();
      });
      section.appendChild(header);
      bucket.rows.forEach(row => {
        row.hidden = collapsed;
        section.appendChild(row);
      });
      body.appendChild(section);
    });
  };

  app.ganttLabelFieldText = function ganttLabelFieldText(item, field) {
    if (field === 'group') return item.group || this.ganttBucketForItem(item, 'group').title;
    if (field === 'status') {
      const column = this.ganttStatusColumn?.() || this.effectiveColumns().find(entry => entry.type === 'status');
      return column ? (this.displayValue(this.valueFor(item, column)) || 'Sin estado') : '';
    }
    if (field === 'person') {
      const column = this.ganttPeopleColumn();
      const value = column ? this.valueFor(item, column) : null;
      return Array.isArray(value?.names) && value.names.length ? value.names.join(', ') : value?.text || this.displayValue(value) || '';
    }
    if (field === 'dates') {
      const column = this.gantt?.timeColumn;
      const value = column ? this.valueFor(item, column) || {} : {};
      if (column?.type === 'date') return value.date || '';
      const from = value.from || '';
      const to = value.to || '';
      return from && to ? `${from} → ${to}` : from || to;
    }
    if (field === 'dependency') {
      const column = this.ganttDependencyColumn();
      return column ? this.displayValue(this.valueFor(item, column)) : '';
    }
    return '';
  };

  app.applyGanttLabelFields = function applyGanttLabelFields() {
    const fields = this.ganttConfig().labelFields;
    document.querySelectorAll('#content .gantt-row[data-item-id] .gantt-label').forEach(label => {
      const row = label.closest('.gantt-row');
      const item = this.findItem(row?.dataset.itemId);
      if (!item) return;
      label.querySelectorAll('small').forEach(node => node.remove());
      const values = fields.map(field => this.ganttLabelFieldText(item, field)).filter(Boolean);
      if (!values.length) return;
      const detail = document.createElement('small');
      detail.className = 'gantt-label-fields';
      detail.textContent = values.join(' · ');
      label.appendChild(detail);
    });
  };

  app.openGanttConfigMenu = function openGanttConfigMenu(anchor) {
    document.querySelectorAll('.floating-menu').forEach(node => node.remove());
    const config = this.ganttConfig();
    const status = this.ganttStatusColumn?.() || this.effectiveColumns().find(entry => entry.type === 'status');
    const people = this.ganttPeopleColumn();
    const dependency = this.ganttDependencyColumn();
    const menu = document.createElement('div');
    menu.className = 'floating-menu gantt-config-menu';
    menu.innerHTML = `<div class="menu-title">Configurar Gantt</div>
      <label class="gantt-config-field"><span>Agrupar por</span><select data-gantt-config-group><option value="group">Grupo</option>${status ? '<option value="status">Estado</option>' : ''}${people ? '<option value="person">Persona</option>' : ''}<option value="none">Sin agrupación</option></select></label>
      <div class="menu-separator"></div>
      <div class="gantt-config-label-title">Campos junto al elemento</div>
      <label class="gantt-config-check"><input type="checkbox" value="group" data-gantt-label-field> Grupo</label>
      ${status ? '<label class="gantt-config-check"><input type="checkbox" value="status" data-gantt-label-field> Estado</label>' : ''}
      ${people ? '<label class="gantt-config-check"><input type="checkbox" value="person" data-gantt-label-field> Persona</label>' : ''}
      <label class="gantt-config-check"><input type="checkbox" value="dates" data-gantt-label-field> Fechas</label>
      ${dependency ? '<label class="gantt-config-check"><input type="checkbox" value="dependency" data-gantt-label-field> Dependencia</label>' : ''}
      <div class="menu-note">La configuración se guarda por tablero en New Monday. No modifica Monday.</div>`;
    const select = menu.querySelector('[data-gantt-config-group]');
    select.value = config.groupBy;
    menu.querySelectorAll('[data-gantt-label-field]').forEach(input => { input.checked = config.labelFields.includes(input.value); });
    select.addEventListener('change', () => {
      const next = this.ganttConfig();
      next.groupBy = select.value;
      this.saveGanttConfig(next);
      menu.remove();
      this.renderGantt();
    });
    menu.querySelectorAll('[data-gantt-label-field]').forEach(input => input.addEventListener('change', () => {
      const next = this.ganttConfig();
      next.labelFields = [...menu.querySelectorAll('[data-gantt-label-field]:checked')].map(entry => entry.value);
      this.saveGanttConfig(next);
      this.applyGanttLabelFields();
    }));
    this.positionMenu(menu, anchor);
  };

  app.decorateGanttConfigControls = function decorateGanttConfigControls() {
    const controls = document.querySelector('#content .gantt-parity-controls');
    if (!controls || controls.querySelector('[data-gantt-config]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.ganttConfig = 'true';
    button.className = 'gantt-config-button';
    button.textContent = '⚙ Configurar';
    button.addEventListener('click', () => this.openGanttConfigMenu(button));
    controls.insertBefore(button, controls.lastElementChild || null);
  };

  app.renderGantt = function renderGanttWithAdvancedConfig() {
    baseRenderGantt();
    this.applyGanttGrouping();
    this.applyGanttLabelFields();
    this.decorateGanttConfigControls();
  };
})();
