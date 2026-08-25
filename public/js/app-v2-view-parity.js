(() => {
  const previousRenderViewTabs = app.renderViewTabs.bind(app);

  app.isInternalMondayView = function isInternalMondayView(view) {
    const name = String(view?.name || '').trim().toLowerCase();
    const type = String(view?.type || '').trim().toLowerCase();
    const subtype = String(view?.settings?.view_subtype || view?.settings?.viewSubtype || '').trim().toLowerCase();
    return type === 'featureboardview'
      || subtype === 'monday-vibe-app'
      || name === 'crear la vista vibe'
      || name.includes('vista vibe');
  };

  app.operationalSavedViews = function operationalSavedViews() {
    return (this.currentBoard?.views || [])
      .filter(view => !this.isInternalMondayView(view))
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  };

  app.uniqueViewName = function uniqueViewName(baseName) {
    const used = new Set((this.currentBoard?.views || []).map(view => String(view.name || '').trim().toLowerCase()));
    if (!used.has(String(baseName).toLowerCase())) return baseName;
    let suffix = 2;
    while (used.has(`${String(baseName).toLowerCase()} ${suffix}`)) suffix += 1;
    return `${baseName} ${suffix}`;
  };

  app.createViewOfType = async function createViewOfType(type) {
    if (!this.currentBoardId()) return;
    const presets = {
      table: { name: 'Tabla', type: 'table' },
      gantt: { name: 'Gantt', type: 'gantt' },
      progress: { name: 'Progreso', type: 'progress' },
      chart: { name: 'Gráfico', type: 'chart' }
    };
    const preset = presets[type] || presets.table;
    try {
      const created = await this.api(`/api/boards/${this.currentBoardId()}/views`, {
        method: 'POST',
        body: JSON.stringify({
          name: this.uniqueViewName(preset.name),
          type: preset.type,
          filter: { logic: 'and', rules: [] },
          sort: [],
          settings: {},
          order: (this.currentBoard.views || []).length
        })
      });
      this.currentBoard.views = [...(this.currentBoard.views || []), created];
      const cached = this.boards.find(board => String(board._id) === String(this.currentBoard._id));
      if (cached) cached.views = this.currentBoard.views;
      this.currentView = `saved:${created.id}`;
      this.renderViewTabs();
      this.renderCurrentView();
      this.showToast(`Vista ${created.name} creada`);
    } catch (err) {
      this.showToast(err.message, true);
    }
  };

  app.openAddViewMenu = function openAddViewMenu(anchor) {
    document.querySelectorAll('.view-add-menu,.view-utility-menu,.floating-menu').forEach(node => node.remove());
    const menu = document.createElement('div');
    menu.className = 'floating-menu view-add-menu';
    menu.innerHTML = `
      <div class="menu-title">Agregar vista</div>
      <button type="button" data-add-view="table"><span class="view-type-icon">▦</span><span><strong>Tabla</strong><small>Otra tabla con filtros y orden propios</small></span></button>
      <button type="button" data-add-view="gantt"><span class="view-type-icon">▰</span><span><strong>Gantt</strong><small>Planificación por fechas y dependencias</small></span></button>
      <button type="button" data-add-view="progress"><span class="view-type-icon">◔</span><span><strong>Progreso</strong><small>Resumen visual por estados</small></span></button>
      <button type="button" data-add-view="chart"><span class="view-type-icon">▥</span><span><strong>Gráfico</strong><small>Resumen visual del tablero</small></span></button>
    `;
    menu.querySelectorAll('[data-add-view]').forEach(button => button.addEventListener('click', () => {
      const type = button.dataset.addView;
      menu.remove();
      this.createViewOfType(type);
    }));
    this.positionMenu(menu, anchor);
  };

  app.openViewUtilityMenu = function openViewUtilityMenu(anchor) {
    document.querySelectorAll('.view-add-menu,.view-utility-menu,.floating-menu').forEach(node => node.remove());
    const menu = document.createElement('div');
    menu.className = 'floating-menu view-utility-menu';
    const entries = [
      ['crew', 'Equipo', 'Personas y zonas horarias'],
      ['activity', 'Actividad', 'Historial local de cambios'],
      ['archive', 'Archivo', 'Elementos archivados'],
      ['trash', 'Papelera', 'Elementos eliminados']
    ];
    menu.innerHTML = `<div class="menu-title">Herramientas de New Monday</div>${entries.map(([id, label, note]) => `<button type="button" data-utility-view="${id}"><span><strong>${label}</strong><small>${note}</small></span></button>`).join('')}`;
    menu.querySelectorAll('[data-utility-view]').forEach(button => button.addEventListener('click', () => {
      this.currentView = button.dataset.utilityView;
      menu.remove();
      this.renderViewTabs();
      this.renderCurrentView();
    }));
    this.positionMenu(menu, anchor);
  };

  app.renderViewTabs = function renderMondayLikeViewTabs() {
    previousRenderViewTabs();
    const host = document.getElementById('view-tabs');
    if (!host || !this.currentBoard) return;

    const operationalIds = new Set(this.operationalSavedViews().map(view => String(view.id)));

    // Remove imported feature placeholders and New Monday utility tabs from the board-view strip.
    host.querySelectorAll('.view-tab[data-view^="saved:"]').forEach(button => {
      const id = String(button.dataset.view || '').replace(/^saved:/, '');
      if (!operationalIds.has(id)) button.remove();
    });
    host.querySelectorAll('.view-tab[data-view="gantt"],.view-tab[data-view="crew"],.view-tab[data-view="activity"],.view-tab[data-view="archive"],.view-tab[data-view="trash"],.view-tab.view-tab-add').forEach(button => button.remove());

    // Prevent duplicate semantic tabs if imported metadata contains repeated views.
    const seen = new Set();
    host.querySelectorAll('.view-tab[data-view^="saved:"]').forEach(button => {
      const id = String(button.dataset.view || '').replace(/^saved:/, '');
      const view = this.operationalSavedViews().find(entry => String(entry.id) === id);
      if (!view) return;
      const semantic = `${String(view.type || '').toLowerCase()}::${String(view.name || '').trim().toLowerCase()}`;
      if (seen.has(semantic)) button.remove();
      else seen.add(semantic);
    });

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'view-tab view-tab-plus';
    add.textContent = '+';
    add.title = 'Agregar vista';
    add.setAttribute('aria-label', 'Agregar vista');
    add.addEventListener('click', event => this.openAddViewMenu(event.currentTarget));
    host.appendChild(add);

    const utilities = document.createElement('button');
    utilities.type = 'button';
    utilities.className = `view-tab view-tab-utilities ${['crew', 'activity', 'archive', 'trash'].includes(this.currentView) ? 'active' : ''}`;
    utilities.textContent = '⋯';
    utilities.title = 'Herramientas de New Monday';
    utilities.setAttribute('aria-label', 'Herramientas de New Monday');
    utilities.addEventListener('click', event => this.openViewUtilityMenu(event.currentTarget));
    host.appendChild(utilities);

    if (typeof this.renderQueryToolbar === 'function') this.renderQueryToolbar();
  };
})();
