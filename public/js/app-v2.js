const DAY_MS = 24 * 60 * 60 * 1000;

const app = {
  workspaces: [],
  boards: [],
  items: [],
  crew: [],
  currentWorkspace: null,
  currentBoard: null,
  currentView: 'board',
  search: '',
  collapsedGroups: new Set(),
  expandedSubitems: new Set(),
  selectedItems: new Set(),
  worldClockTimer: null,
  gantt: null,

  async init() {
    this.bindStaticEvents();
    await this.reloadAll();
    this.renderWorkspaceSwitcher();
    this.renderSidebar();
    this.renderCrewDatalist();

    const preferred = this.boards.find(board => board.name === 'GY_POST') || this.boards[0];
    if (preferred) await this.selectBoard(preferred);
    else this.renderEmptyState();

    this.worldClockTimer = setInterval(() => this.refreshWorldClocks(), 30000);
  },

  async api(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Error ${response.status}`);
    return payload;
  },

  async reloadAll() {
    try {
      const [workspaces, boards, items, crew] = await Promise.all([
        this.api('/api/workspaces'),
        this.api('/api/boards'),
        this.api('/api/items?includeSubitems=true'),
        this.api('/api/crew')
      ]);
      this.workspaces = workspaces;
      this.boards = boards;
      this.items = items;
      this.crew = crew;
      if (!this.currentWorkspace) {
        const gy = workspaces.find(workspace => workspace.name === 'GY_GUAYOTA');
        this.currentWorkspace = gy || workspaces[0] || null;
      }
    } catch (err) {
      this.showConnectionError(err);
    }
  },

  bindStaticEvents() {
    document.getElementById('btn-add')?.addEventListener('click', () => {
      if (this.currentView === 'crew') this.openCrewModal();
      else this.openItemModal();
    });

    document.getElementById('global-search')?.addEventListener('input', event => {
      this.search = event.target.value;
      this.renderCurrentView();
    });

    document.getElementById('board-search')?.addEventListener('input', () => this.renderSidebar());

    document.addEventListener('keydown', event => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        document.getElementById('global-search')?.focus();
      }
      if (event.key === 'Escape') {
        document.querySelectorAll('.floating-menu,.status-menu,.workspace-menu').forEach(node => node.remove());
      }
    });
  },

  workspaceName(board = this.currentBoard) {
    return board?.workspaceRef?.name || board?.workspace || 'Sin workspace';
  },

  workspaceKey(workspace) {
    return workspace?._id || workspace?.name || '';
  },

  boardBelongsToWorkspace(board, workspace = this.currentWorkspace) {
    if (!workspace) return true;
    if (workspace._id && board.workspaceRef?._id) return String(board.workspaceRef._id) === String(workspace._id);
    return this.workspaceName(board) === workspace.name;
  },

  visibleBoards() {
    const term = document.getElementById('board-search')?.value?.trim().toLowerCase() || '';
    return this.boards.filter(board => this.boardBelongsToWorkspace(board) && (!term || board.name.toLowerCase().includes(term)));
  },

  renderWorkspaceSwitcher() {
    const host = document.getElementById('workspace-switcher');
    if (!host) return;
    const workspace = this.currentWorkspace;
    const name = workspace?.name || 'Workspaces';
    host.innerHTML = `<span class="workspace-icon">${this.escapeHtml(this.initials(name).slice(0, 2) || 'NM')}</span><span class="workspace-copy"><strong>${this.escapeHtml(name)}</strong><small>${this.escapeHtml(workspace?.classification || 'workspace')}</small></span><span class="workspace-caret">⌄</span>`;
    host.onclick = event => this.openWorkspaceMenu(event.currentTarget);
  },

  openWorkspaceMenu(anchor) {
    document.querySelectorAll('.workspace-menu,.floating-menu').forEach(node => node.remove());
    const menu = document.createElement('div');
    menu.className = 'floating-menu workspace-menu';
    const workspaces = this.workspaces.length ? this.workspaces : [{ name: 'GY_GUAYOTA', legacy: true }];
    menu.innerHTML = `<div class="menu-title">Cambiar workspace</div>${workspaces.map(workspace => `<button data-workspace="${this.escapeAttr(this.workspaceKey(workspace))}"><span>${this.escapeHtml(workspace.name)}</span><small>${this.escapeHtml(workspace.classification || (workspace.legacy ? 'legacy' : ''))}</small></button>`).join('')}`;
    menu.querySelectorAll('[data-workspace]').forEach(button => button.addEventListener('click', async () => {
      const key = button.dataset.workspace;
      this.currentWorkspace = workspaces.find(workspace => this.workspaceKey(workspace) === key) || workspaces[0];
      menu.remove();
      this.renderWorkspaceSwitcher();
      this.renderSidebar();
      const first = this.visibleBoards()[0];
      if (first) await this.selectBoard(first);
      else {
        this.currentBoard = null;
        this.renderEmptyState('Este workspace no tiene tableros visibles.');
      }
    }));
    this.positionMenu(menu, anchor);
  },

  renderSidebar() {
    const nav = document.getElementById('sidebar-nav');
    if (!nav) return;
    nav.innerHTML = '';
    this.visibleBoards().forEach(board => {
      const button = document.createElement('button');
      button.className = `sidebar-nav-item ${this.currentBoard?._id === board._id ? 'active' : ''}`;
      button.innerHTML = `<span class="sidebar-nav-item-icon">${this.escapeHtml(board.icon || '📋')}</span><span class="sidebar-board-name">${this.escapeHtml(board.name)}</span>${board.source === 'monday-import' ? '<span class="source-badge" title="Importado desde Monday en modo solo lectura">RO</span>' : ''}`;
      button.addEventListener('click', () => this.selectBoard(board));
      nav.appendChild(button);
    });
  },

  renderCrewDatalist() {
    const datalist = document.getElementById('crew-options');
    if (!datalist) return;
    datalist.innerHTML = this.crew
      .filter(member => member.name && member.name !== '.')
      .map(member => `<option value="${this.escapeAttr(member.name)}"></option>`)
      .join('');
  },

  async selectBoard(board) {
    this.currentBoard = board;
    this.currentWorkspace = this.workspaces.find(workspace => this.boardBelongsToWorkspace(board, workspace)) || this.currentWorkspace;
    this.currentView = 'board';
    this.search = '';
    this.selectedItems.clear();
    const search = document.getElementById('global-search');
    if (search) search.value = '';
    this.renderWorkspaceSwitcher();
    this.renderSidebar();
    this.renderHeader();
    this.renderViewTabs();
    this.renderCurrentView();
  },

  renderHeader() {
    if (!this.currentBoard) return;
    document.getElementById('board-title').textContent = this.currentBoard.name;
    document.getElementById('board-icon').textContent = this.currentBoard.icon || '📋';
    const subtitle = document.getElementById('board-subtitle');
    if (subtitle) subtitle.textContent = `${this.workspaceName()} · ${this.effectiveColumns().length} columnas · ${this.effectiveGroups().length} grupos`;
  },

  renderViewTabs() {
    const host = document.getElementById('view-tabs');
    if (!host || !this.currentBoard) return;
    const savedViews = (this.currentBoard.views || [])
      .filter(view => !String(view.name || '').toLowerCase().includes('vibe'))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const tabs = [
      { id: 'board', name: 'Tabla principal' },
      ...savedViews.map(view => ({ id: `saved:${view.id}`, name: view.name, source: view })),
      { id: 'gantt', name: savedViews.some(view => String(view.name).toLowerCase() === 'gantt') ? 'Cronograma local' : 'Cronograma' },
      { id: 'crew', name: 'Equipo' }
    ];

    const seen = new Set();
    host.innerHTML = tabs.filter(tab => {
      const key = `${tab.id}:${tab.name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map(tab => `<button class="view-tab ${this.currentView === tab.id ? 'active' : ''}" data-view="${this.escapeAttr(tab.id)}">${this.escapeHtml(tab.name)}</button>`).join('');

    host.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
      this.currentView = button.dataset.view;
      this.renderViewTabs();
      this.renderCurrentView();
    }));
  },

  currentBoardId() {
    return this.currentBoard?._id;
  },

  boardItems({ includeSubitems = false } = {}) {
    const boardId = this.currentBoardId();
    return this.items
      .filter(item => String(item.board?._id || item.board) === String(boardId))
      .filter(item => includeSubitems || !item.isSubitem)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  },

  subitemsFor(parentId) {
    return this.items
      .filter(item => item.isSubitem && String(item.parentItem?._id || item.parentItem) === String(parentId))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  },

  effectiveGroups() {
    const configured = (this.currentBoard?.groups || []).filter(group => !group.archived).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    if (configured.length) return configured;
    const map = new Map();
    this.boardItems().forEach((item, index) => {
      const title = item.group || 'General';
      if (!map.has(title)) map.set(title, { id: item.groupId || `legacy_${index}`, title, color: item.groupColor || '#579bfc', order: map.size });
    });
    return [...map.values()];
  },

  effectiveColumns() {
    const configured = (this.currentBoard?.columns || []).filter(column => !column.hidden).sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
      return (a.order ?? 0) - (b.order ?? 0);
    });
    if (configured.length) return configured;
    return [
      { id: 'person', title: 'Persona', type: 'people', order: 0 },
      { id: 'status', title: 'Estado', type: 'status', order: 1, settings: { labels: this.defaultStatusLabels() } },
      { id: 'timeline', title: 'Cronograma', type: 'timeline', order: 2 },
      { id: 'formula', title: 'Fórmula', type: 'formula', order: 3 },
      { id: 'dependency', title: 'Dependencia', type: 'dependency', order: 4 },
      { id: 'world_clock', title: 'Reloj mundial', type: 'world_clock', order: 5 },
      { id: 'overlap', title: 'Solape Weeks', type: 'numbers', order: 6 },
      { id: 'notes', title: 'Notas', type: 'text', order: 7 }
    ];
  },

  defaultStatusLabels() {
    return [
      { id: 0, label: 'Working on it', hex: '#fdab3d' },
      { id: 1, label: 'Done', hex: '#00c875' },
      { id: 2, label: 'Stuck', hex: '#df2f4a' }
    ];
  },

  filteredBoardItems() {
    const term = this.search.trim().toLowerCase();
    const items = this.boardItems();
    if (!term) return items;
    return items.filter(item => {
      const bag = [item.name, item.group, item.person, item.status, item.notes];
      Object.values(item.columnValues || {}).forEach(value => {
        if (typeof value === 'string' || typeof value === 'number') bag.push(value);
        else if (value && typeof value === 'object') bag.push(value.text, value.displayValue, value.label, value.email, value.url, value.timezone);
      });
      return bag.some(value => String(value || '').toLowerCase().includes(term));
    });
  },

  renderCurrentView() {
    if (!this.currentBoard) return this.renderEmptyState();
    if (this.currentView === 'board') return this.renderBoard();
    if (this.currentView === 'gantt') return this.renderGantt();
    if (this.currentView === 'crew') return this.renderCrew();
    if (this.currentView.startsWith('saved:')) return this.renderSavedView(this.currentView.slice(6));
    return this.renderBoard();
  },

  renderSavedView(viewId) {
    const view = (this.currentBoard.views || []).find(entry => String(entry.id) === String(viewId));
    if (!view) return this.renderBoard();
    const name = String(view.name || '').toLowerCase();
    if (name.includes('gantt')) return this.renderGantt();
    if (name.includes('progreso') || name.includes('gráfico')) return this.renderProgressView(view);
    return this.renderBoard();
  },

  renderProgressView(view) {
    const items = this.filteredBoardItems();
    const statusColumns = this.effectiveColumns().filter(column => column.type === 'status');
    const cards = statusColumns.map(column => {
      const counts = new Map();
      items.forEach(item => {
        const value = this.valueFor(item, column);
        const label = this.displayValue(value) || 'Sin estado';
        counts.set(label, (counts.get(label) || 0) + 1);
      });
      return `<div class="progress-card"><h3>${this.escapeHtml(column.title)}</h3>${[...counts.entries()].map(([label, count]) => `<div class="progress-stat"><span>${this.escapeHtml(label)}</span><strong>${count}</strong></div>`).join('')}</div>`;
    }).join('');
    document.getElementById('content').innerHTML = `<div class="saved-view-shell"><div class="view-summary"><h2>${this.escapeHtml(view.name)}</h2><p>Resumen local construido a partir del esquema dinámico del tablero.</p></div><div class="progress-grid">${cards || '<p>No hay columnas Estado.</p>'}</div></div>`;
  },

  renderEmptyState(message = 'No hay tableros disponibles.') {
    document.getElementById('content').innerHTML = `<div class="empty-state"><h2>Sin datos</h2><p>${this.escapeHtml(message)}</p></div>`;
  },

  renderBoard() {
    const content = document.getElementById('content');
    const items = this.filteredBoardItems();
    const groups = this.effectiveGroups();
    const grouped = new Map(groups.map(group => [group.id, { group, items: [] }]));

    items.forEach(item => {
      let groupId = item.groupId;
      let bucket = grouped.get(groupId);
      if (!bucket) {
        const configured = groups.find(group => group.title === item.group);
        if (configured) bucket = grouped.get(configured.id);
      }
      if (!bucket) {
        const synthetic = { id: groupId || `legacy:${item.group}`, title: item.group || 'General', color: item.groupColor || '#579bfc', order: grouped.size };
        bucket = { group: synthetic, items: [] };
        grouped.set(synthetic.id, bucket);
      }
      bucket.items.push(item);
    });

    if (!items.length && !groups.length) {
      content.innerHTML = `<div class="empty-state"><h2>Sin elementos</h2><p>Este tablero está vacío.</p><button class="button primary" id="empty-add">＋ Nuevo elemento</button></div>`;
      document.getElementById('empty-add')?.addEventListener('click', () => this.openItemModal());
      return;
    }

    const body = [...grouped.values()].filter(bucket => bucket.items.length || !this.search).map(bucket => this.groupHtml(bucket.group, bucket.items)).join('');
    content.innerHTML = `<div class="board-toolbar">${this.bulkToolbarHtml()}</div><div class="board-scroll dynamic-board">${body}</div>`;
    this.bindBoardEvents();
    this.refreshWorldClocks();
  },

  bulkToolbarHtml() {
    if (!this.selectedItems.size) return `<div class="board-toolbar-copy"><span>${this.filteredBoardItems().length} elementos</span><span>${this.effectiveColumns().length} columnas visibles</span></div>`;
    return `<div class="bulk-bar"><strong>${this.selectedItems.size} seleccionados</strong><button data-bulk="archive">Archivar</button><button data-bulk="trash">Mover a papelera</button><button data-bulk="clear">Cancelar</button></div>`;
  },

  groupHtml(group, items) {
    const color = group.color || items[0]?.groupColor || '#579bfc';
    const collapsed = this.collapsedGroups.has(group.id);
    const columns = this.effectiveColumns();
    return `<section class="group-section" data-group-id="${this.escapeAttr(group.id)}" style="--group-color:${this.escapeAttr(color)}">
      <div class="group-header-row">
        <button class="group-header" data-action="toggle-group" data-group-id="${this.escapeAttr(group.id)}">
          <span class="group-chevron">${collapsed ? '▶' : '▼'}</span><span class="group-dot"></span><span class="group-title">${this.escapeHtml(group.title)}</span><span class="group-count">${items.length}</span>
        </button>
        <button class="menu-button" data-action="group-menu" data-group-id="${this.escapeAttr(group.id)}" aria-label="Menú de grupo">⋯</button>
      </div>
      <div class="group-body ${collapsed ? 'is-collapsed' : ''}">
        <div class="table-wrap"><table class="board-table dynamic-table"><thead><tr>
          <th class="select-col"><input type="checkbox" data-select-group="${this.escapeAttr(group.id)}" aria-label="Seleccionar grupo"></th>
          <th class="col-element pinned-col"><span>Elemento</span></th>
          ${columns.map(column => this.columnHeaderHtml(column)).join('')}
          <th class="col-actions"></th>
        </tr></thead><tbody>${items.map(item => this.itemRowHtml(item, group, columns)).join('')}</tbody></table></div>
        <button class="add-item-row" data-action="add-item" data-group-id="${this.escapeAttr(group.id)}">＋ Agregar elemento</button>
      </div>
    </section>`;
  },

  columnHeaderHtml(column) {
    const classes = [column.pinned ? 'pinned-dynamic' : '', `type-${column.type}`].filter(Boolean).join(' ');
    return `<th class="dynamic-col-head ${classes}" data-column-id="${this.escapeAttr(column.id)}"><span>${this.escapeHtml(column.title)}</span><button class="column-menu-button" data-action="column-menu" data-column-id="${this.escapeAttr(column.id)}" title="Opciones de columna">⌄</button></th>`;
  },

  itemRowHtml(item, group, columns) {
    const subitems = this.subitemsFor(item._id);
    const legacySubitems = item.subitems || [];
    const hasSubitems = subitems.length > 0 || legacySubitems.length > 0;
    const expanded = this.expandedSubitems.has(item._id);
    const selected = this.selectedItems.has(item._id);
    const rows = [`<tr data-item-id="${item._id}" class="item-row ${selected ? 'selected' : ''}">
      <td class="select-col"><input type="checkbox" data-select-item="${item._id}" ${selected ? 'checked' : ''}></td>
      <td class="element-cell pinned-col" style="--row-color:${this.escapeAttr(group.color || item.groupColor || '#579bfc')}"><div class="element-inner">
        ${hasSubitems ? `<button class="subitem-toggle" data-action="toggle-subitems" data-id="${item._id}">${expanded ? '▾' : '▸'}</button>` : '<span class="subitem-spacer"></span>'}
        <input class="cell-input element-input" data-name-id="${item._id}" value="${this.escapeAttr(item.name || '')}">
      </div></td>
      ${columns.map(column => `<td class="dynamic-cell type-${this.escapeAttr(column.type)}" data-column-id="${this.escapeAttr(column.id)}">${this.cellHtml(item, column)}</td>`).join('')}
      <td class="row-actions"><button class="menu-button" data-action="item-menu" data-id="${item._id}" aria-label="Menú del elemento">⋯</button></td>
    </tr>`];

    if (hasSubitems && expanded) {
      const normalized = subitems.length ? subitems : legacySubitems.map((sub, index) => ({ _id: `legacy-sub-${item._id}-${index}`, name: sub.name, person: sub.owner, status: sub.status, startDate: sub.date, isLegacyInline: true }));
      normalized.forEach(subitem => {
        rows.push(`<tr class="subitem-row"><td></td><td class="element-cell pinned-col"><div class="element-inner subitem-indent"><span>↳</span><strong>${this.escapeHtml(subitem.name || '')}</strong></div></td>${columns.map(column => `<td class="dynamic-cell subitem-cell">${this.subitemCellHtml(subitem, column)}</td>`).join('')}<td></td></tr>`);
      });
    }
    return rows.join('');
  },

  subitemCellHtml(subitem, column) {
    if (!subitem.isLegacyInline) return this.cellHtml(subitem, column, { readOnly: false });
    if (column.type === 'people') return this.escapeHtml(subitem.person || '');
    if (column.type === 'status') return this.escapeHtml(subitem.status || '');
    if (column.type === 'date' || column.type === 'timeline') return this.escapeHtml(this.toInputDate(subitem.startDate));
    return '';
  },

  valueFor(item, column) {
    if (item.columnValues && Object.prototype.hasOwnProperty.call(item.columnValues, column.id)) return item.columnValues[column.id];
    switch (column.id) {
      case 'person': return { type: 'people', text: item.person || '' };
      case 'status': return { type: 'status', label: item.status || '', color: item.statusColor || '' };
      case 'timeline': return { type: 'timeline', from: this.toInputDate(item.startDate), to: this.toInputDate(item.endDate) };
      case 'formula': return { type: 'formula', value: item.formula ?? 0, displayValue: String(item.formula ?? 0) };
      case 'dependency': return { type: 'dependency', text: item.dependency || '' };
      case 'world_clock': return { type: 'world_clock', timezone: item.extraFields?.timezone || '' };
      case 'overlap': return { type: 'numbers', value: item.extraFields?.overlapWeeks ?? '' };
      case 'notes': return { type: 'text', text: item.notes || '' };
      default: return null;
    }
  },

  displayValue(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    return String(value.displayValue ?? value.text ?? value.label ?? value.value ?? value.email ?? value.url ?? value.timezone ?? '');
  },

  cellHtml(item, column, { readOnly = false } = {}) {
    const value = this.valueFor(item, column);
    const id = item._id;
    const type = column.type;
    const ro = readOnly || type === 'formula' || type === 'mirror' || type === 'subtasks';

    if (type === 'people') {
      const text = this.displayValue(value);
      return `<div class="person-cell"><span class="avatar small">${this.escapeHtml(this.initials(text) || '＋')}</span><input class="cell-input" list="crew-options" data-cell-id="${id}" data-column-id="${this.escapeAttr(column.id)}" data-column-type="people" value="${this.escapeAttr(text)}" ${ro ? 'readonly' : ''} placeholder="Asignar"></div>`;
    }

    if (type === 'status') {
      const label = this.displayValue(value);
      const color = value?.color || value?.hex || this.statusColor(column, label);
      return `<button class="status-pill" style="--status-color:${this.escapeAttr(color || '#c4c4c4')}" data-action="dynamic-status" data-id="${id}" data-column-id="${this.escapeAttr(column.id)}">${this.escapeHtml(label || 'Sin estado')}</button>`;
    }

    if (type === 'timeline') {
      const from = value?.from || this.toInputDate(item.startDate);
      const to = value?.to || this.toInputDate(item.endDate);
      const milestone = value?.visualizationType === 'milestone' || value?.visualization_type === 'milestone';
      return `<div class="date-range-editor ${milestone ? 'is-milestone' : ''}"><input type="date" data-timeline="from" data-id="${id}" data-column-id="${this.escapeAttr(column.id)}" value="${this.escapeAttr(from || '')}"><span>${milestone ? '◆' : '→'}</span><input type="date" data-timeline="to" data-id="${id}" data-column-id="${this.escapeAttr(column.id)}" value="${this.escapeAttr(to || '')}"></div>`;
    }

    if (type === 'date') {
      const date = value?.date || this.displayValue(value);
      return `<input type="date" class="cell-input date-only-input" data-cell-id="${id}" data-column-id="${this.escapeAttr(column.id)}" data-column-type="date" value="${this.escapeAttr(date || '')}" ${ro ? 'readonly' : ''}>`;
    }

    if (type === 'formula') return `<span class="formula-value" title="Calculado automáticamente">ƒ ${this.escapeHtml(this.displayValue(value))}</span>`;

    if (type === 'dependency') return this.dependencyCellHtml(item, column, value);

    if (type === 'world_clock') {
      const timezone = value?.timezone || this.displayValue(value);
      return `<button class="world-clock" data-action="world-clock" data-item-id="${id}" data-column-id="${this.escapeAttr(column.id)}" data-timezone="${this.escapeAttr(timezone || '')}"><span class="clock-time">—</span><small class="clock-zone">${this.escapeHtml(timezone || '')}</small></button>`;
    }

    if (type === 'dropdown') {
      const labels = column.settings?.labels || [];
      const selected = value?.labels || (value?.label ? [value.label] : []);
      return `<select class="cell-select" data-dropdown-id="${id}" data-column-id="${this.escapeAttr(column.id)}"><option value="">—</option>${labels.map(label => `<option value="${this.escapeAttr(label.label)}" ${selected.includes(label.label) ? 'selected' : ''}>${this.escapeHtml(label.label)}</option>`).join('')}</select>`;
    }

    if (type === 'email') {
      const email = value?.email || this.displayValue(value);
      return `<input type="email" class="cell-input" data-cell-id="${id}" data-column-id="${this.escapeAttr(column.id)}" data-column-type="email" value="${this.escapeAttr(email)}" placeholder="email@dominio.com">`;
    }

    if (type === 'link') {
      const url = value?.url || this.displayValue(value);
      return `<div class="link-cell"><input type="url" class="cell-input" data-cell-id="${id}" data-column-id="${this.escapeAttr(column.id)}" data-column-type="link" value="${this.escapeAttr(url)}" placeholder="https://">${url ? `<a href="${this.escapeAttr(url)}" target="_blank" rel="noreferrer">↗</a>` : ''}</div>`;
    }

    if (type === 'file') {
      const assets = value?.assets || value?.files || [];
      if (Array.isArray(assets) && assets.length) return `<div class="file-chips">${assets.map(asset => `<span class="file-chip">📎 ${this.escapeHtml(asset.name || asset.filename || 'Archivo')}</span>`).join('')}</div>`;
      return `<span class="muted-cell">Sin archivos</span>`;
    }

    if (type === 'board_relation') {
      const names = value?.linkedItems?.map(entry => entry.name) || value?.linkedItemNames || [];
      return `<button class="relation-cell" data-action="relation" data-id="${id}" data-column-id="${this.escapeAttr(column.id)}">${names.length ? names.map(name => `<span>${this.escapeHtml(name)}</span>`).join('') : '＋ Vincular'}</button>`;
    }

    if (type === 'mirror') return `<span class="mirror-value">${this.escapeHtml(this.displayValue(value))}</span>`;
    if (type === 'subtasks') return `<span class="subtask-count">${this.subitemsFor(id).length || item.subitems?.length || 0} subitems</span>`;

    if (type === 'numbers') {
      const number = value?.value ?? this.displayValue(value);
      return `<input type="number" class="cell-input number-input" data-cell-id="${id}" data-column-id="${this.escapeAttr(column.id)}" data-column-type="numbers" value="${this.escapeAttr(number)}" ${ro ? 'readonly' : ''}>`;
    }

    const text = this.displayValue(value);
    return `<input class="cell-input" data-cell-id="${id}" data-column-id="${this.escapeAttr(column.id)}" data-column-type="text" value="${this.escapeAttr(text)}" ${ro ? 'readonly' : ''}>`;
  },

  dependencyCellHtml(item, column, value) {
    const linkedIds = value?.linkedItemIds || [];
    const linkedMondayIds = value?.linkedMondayItemIds || [];
    const legacyText = value?.text || item.dependency || '';
    const candidates = this.boardItems().filter(other => other._id !== item._id);
    const currentId = linkedIds[0] || '';
    let currentByMonday = '';
    if (!currentId && linkedMondayIds[0]) currentByMonday = candidates.find(other => String(other.mondayId) === String(linkedMondayIds[0]))?._id || '';
    const legacyMatch = !currentId && !currentByMonday && legacyText ? candidates.find(other => other.name === legacyText)?._id || '' : '';
    const selected = currentId || currentByMonday || legacyMatch;
    return `<select class="cell-select dependency-select" data-dependency-id="${item._id}" data-column-id="${this.escapeAttr(column.id)}"><option value="">—</option>${candidates.map(other => `<option value="${other._id}" ${String(selected) === String(other._id) ? 'selected' : ''}>${this.escapeHtml(other.name)}</option>`).join('')}</select>`;
  },

  bindBoardEvents() {
    const content = document.getElementById('content');

    content.querySelectorAll('[data-action="toggle-group"]').forEach(button => button.addEventListener('click', () => {
      const id = button.dataset.groupId;
      if (this.collapsedGroups.has(id)) this.collapsedGroups.delete(id);
      else this.collapsedGroups.add(id);
      this.renderBoard();
    }));

    content.querySelectorAll('[data-action="toggle-subitems"]').forEach(button => button.addEventListener('click', () => {
      const id = button.dataset.id;
      if (this.expandedSubitems.has(id)) this.expandedSubitems.delete(id);
      else this.expandedSubitems.add(id);
      this.renderBoard();
    }));

    content.querySelectorAll('[data-action="add-item"]').forEach(button => button.addEventListener('click', () => this.openItemModal(button.dataset.groupId)));
    content.querySelectorAll('[data-action="item-menu"]').forEach(button => button.addEventListener('click', event => this.openItemMenu(event.currentTarget, button.dataset.id)));
    content.querySelectorAll('[data-action="group-menu"]').forEach(button => button.addEventListener('click', event => this.openGroupMenu(event.currentTarget, button.dataset.groupId)));
    content.querySelectorAll('[data-action="column-menu"]').forEach(button => button.addEventListener('click', event => this.openColumnMenu(event.currentTarget, button.dataset.columnId)));
    content.querySelectorAll('[data-action="dynamic-status"]').forEach(button => button.addEventListener('click', event => this.openDynamicStatusMenu(event.currentTarget, button.dataset.id, button.dataset.columnId)));
    content.querySelectorAll('[data-action="world-clock"]').forEach(button => button.addEventListener('click', () => this.editWorldClock(button.dataset.itemId, button.dataset.columnId)));
    content.querySelectorAll('[data-action="relation"]').forEach(button => button.addEventListener('click', event => this.openRelationMenu(event.currentTarget, button.dataset.id, button.dataset.columnId)));

    content.querySelectorAll('[data-name-id]').forEach(input => input.addEventListener('change', () => this.updateItem(input.dataset.nameId, { name: input.value.trim() })));

    content.querySelectorAll('[data-cell-id]').forEach(input => input.addEventListener('change', () => this.commitSimpleCell(input)));

    content.querySelectorAll('[data-timeline]').forEach(input => input.addEventListener('change', async () => {
      const id = input.dataset.id;
      const columnId = input.dataset.columnId;
      const row = input.closest('tr');
      const from = row.querySelector(`[data-timeline="from"][data-column-id="${CSS.escape(columnId)}"]`)?.value || '';
      const to = row.querySelector(`[data-timeline="to"][data-column-id="${CSS.escape(columnId)}"]`)?.value || '';
      let safeFrom = from;
      let safeTo = to;
      if (safeFrom && safeTo && safeFrom > safeTo) {
        if (input.dataset.timeline === 'from') safeTo = safeFrom;
        else safeFrom = safeTo;
      }
      await this.updateColumnValue(id, columnId, { type: 'timeline', from: safeFrom || null, to: safeTo || null });
      this.renderBoard();
    }));

    content.querySelectorAll('[data-dependency-id]').forEach(select => select.addEventListener('change', async () => {
      const target = this.findItem(select.value);
      const value = select.value ? {
        type: 'dependency',
        linkedItemIds: [select.value],
        linkedMondayItemIds: target?.mondayId ? [String(target.mondayId)] : [],
        linkedItemNames: target ? [target.name] : []
      } : { type: 'dependency', linkedItemIds: [], linkedMondayItemIds: [], linkedItemNames: [] };
      await this.updateColumnValue(select.dataset.dependencyId, select.dataset.columnId, value);
    }));

    content.querySelectorAll('[data-dropdown-id]').forEach(select => select.addEventListener('change', () => this.updateColumnValue(select.dataset.dropdownId, select.dataset.columnId, { type: 'dropdown', labels: select.value ? [select.value] : [] })));

    content.querySelectorAll('[data-select-item]').forEach(checkbox => checkbox.addEventListener('change', () => {
      if (checkbox.checked) this.selectedItems.add(checkbox.dataset.selectItem);
      else this.selectedItems.delete(checkbox.dataset.selectItem);
      this.renderBoard();
    }));

    content.querySelectorAll('[data-select-group]').forEach(checkbox => checkbox.addEventListener('change', () => {
      const section = checkbox.closest('.group-section');
      section.querySelectorAll('[data-select-item]').forEach(itemCheckbox => {
        if (checkbox.checked) this.selectedItems.add(itemCheckbox.dataset.selectItem);
        else this.selectedItems.delete(itemCheckbox.dataset.selectItem);
      });
      this.renderBoard();
    }));

    content.querySelectorAll('[data-bulk]').forEach(button => button.addEventListener('click', () => this.bulkAction(button.dataset.bulk)));
  },

  async commitSimpleCell(input) {
    const { cellId: id, columnId, columnType: type } = input.dataset;
    let value;
    if (type === 'numbers') value = { type, value: input.value === '' ? null : Number(input.value) };
    else if (type === 'date') value = { type, date: input.value || null };
    else if (type === 'email') value = { type, email: input.value.trim(), text: input.value.trim() };
    else if (type === 'link') value = { type, url: input.value.trim(), text: input.value.trim() };
    else if (type === 'people') value = { type, text: input.value.trim(), names: input.value.trim() ? [input.value.trim()] : [] };
    else value = { type: 'text', text: input.value };
    await this.updateColumnValue(id, columnId, value);
  },

  statusLabels(column) {
    const raw = column?.settings?.labels || [];
    if (Array.isArray(raw)) return raw.map(label => ({ label: label.label ?? label.name ?? '', color: label.hex || label.color || '#c4c4c4' })).filter(label => label.label);
    if (raw && typeof raw === 'object') return Object.entries(raw).map(([id, label]) => ({ id, label: typeof label === 'string' ? label : label?.label || String(label), color: '#c4c4c4' }));
    return this.defaultStatusLabels().map(label => ({ label: label.label, color: label.hex }));
  },

  statusColor(column, label) {
    const match = this.statusLabels(column).find(entry => entry.label === label);
    return match?.color || '#c4c4c4';
  },

  openDynamicStatusMenu(anchor, itemId, columnId) {
    document.querySelectorAll('.status-menu,.floating-menu').forEach(node => node.remove());
    const column = this.effectiveColumns().find(entry => entry.id === columnId);
    const menu = document.createElement('div');
    menu.className = 'status-menu';
    const labels = this.statusLabels(column);
    [...labels, { label: '', color: '#c4c4c4' }].forEach(option => {
      const button = document.createElement('button');
      button.style.background = option.color;
      button.textContent = option.label || 'Sin estado';
      button.addEventListener('click', async () => {
        await this.updateColumnValue(itemId, columnId, { type: 'status', label: option.label, text: option.label, color: option.color });
        menu.remove();
        this.renderBoard();
      });
      menu.appendChild(button);
    });
    this.positionMenu(menu, anchor);
  },

  async editWorldClock(itemId, columnId) {
    const item = this.findItem(itemId);
    const column = this.effectiveColumns().find(entry => entry.id === columnId);
    const current = this.valueFor(item, column)?.timezone || '';
    const timezone = prompt('Zona horaria IANA (ej. Atlantic/Canary, Europe/Madrid):', current);
    if (timezone === null) return;
    await this.updateColumnValue(itemId, columnId, { type: 'world_clock', timezone: timezone.trim() });
    this.renderBoard();
  },

  async openRelationMenu(anchor, itemId, columnId) {
    document.querySelectorAll('.floating-menu').forEach(node => node.remove());
    const column = this.effectiveColumns().find(entry => entry.id === columnId);
    const targetMondayId = column?.settings?.boardId || column?.settings?.boardIds?.[0];
    const targetBoard = this.boards.find(board => targetMondayId && String(board.mondayId) === String(targetMondayId));
    const menu = document.createElement('div');
    menu.className = 'floating-menu relation-menu';
    if (!targetBoard) {
      menu.innerHTML = '<div class="menu-note">El tablero relacionado aún no está importado localmente.</div>';
      this.positionMenu(menu, anchor);
      return;
    }
    const candidates = this.items.filter(item => String(item.board?._id || item.board) === String(targetBoard._id) && !item.isSubitem);
    menu.innerHTML = `<div class="menu-title">Vincular con ${this.escapeHtml(targetBoard.name)}</div><button data-relation-value="">— Quitar vínculo</button>${candidates.map(item => `<button data-relation-value="${item._id}">${this.escapeHtml(item.name)}</button>`).join('')}`;
    menu.querySelectorAll('[data-relation-value]').forEach(button => button.addEventListener('click', async () => {
      const target = this.findItem(button.dataset.relationValue);
      const value = target ? {
        type: 'board_relation',
        linkedItemIds: [target._id],
        linkedMondayItemIds: target.mondayId ? [String(target.mondayId)] : [],
        linkedItems: [{ id: target._id, mondayId: target.mondayId || null, name: target.name, boardId: targetBoard._id, boardName: targetBoard.name }]
      } : { type: 'board_relation', linkedItemIds: [], linkedMondayItemIds: [], linkedItems: [] };
      await this.updateColumnValue(itemId, columnId, value);
      menu.remove();
      this.renderBoard();
    }));
    this.positionMenu(menu, anchor);
  },

  openItemMenu(anchor, itemId) {
    document.querySelectorAll('.floating-menu').forEach(node => node.remove());
    const item = this.findItem(itemId);
    if (!item) return;
    const groups = this.effectiveGroups();
    const menu = document.createElement('div');
    menu.className = 'floating-menu';
    menu.innerHTML = `<button data-item-action="duplicate">⧉ Duplicar elemento</button><div class="menu-separator"></div><div class="menu-title">Mover a grupo</div>${groups.map(group => `<button data-move-group="${this.escapeAttr(group.id)}">${this.escapeHtml(group.title)}</button>`).join('')}<div class="menu-separator"></div><button data-item-action="archive">Archivar</button><button class="danger" data-item-action="trash">Mover a papelera</button>`;
    menu.querySelector('[data-item-action="duplicate"]').addEventListener('click', () => this.duplicateItem(itemId, menu));
    menu.querySelector('[data-item-action="archive"]').addEventListener('click', () => this.archiveItem(itemId, menu));
    menu.querySelector('[data-item-action="trash"]').addEventListener('click', () => this.trashItem(itemId, menu));
    menu.querySelectorAll('[data-move-group]').forEach(button => button.addEventListener('click', () => this.moveItem(itemId, button.dataset.moveGroup, menu)));
    this.positionMenu(menu, anchor);
  },

  openGroupMenu(anchor, groupId) {
    document.querySelectorAll('.floating-menu').forEach(node => node.remove());
    const group = this.effectiveGroups().find(entry => entry.id === groupId);
    if (!group) return;
    const menu = document.createElement('div');
    menu.className = 'floating-menu';
    menu.innerHTML = `<button data-group-action="rename">Renombrar grupo</button><button data-group-action="color">Cambiar color</button><button data-group-action="duplicate">⧉ Duplicar grupo</button>`;
    menu.querySelector('[data-group-action="rename"]').addEventListener('click', async () => {
      const title = prompt('Nombre del grupo:', group.title);
      if (!title?.trim()) return;
      await this.patchGroup(groupId, { title: title.trim() }); menu.remove();
    });
    menu.querySelector('[data-group-action="color"]').addEventListener('click', async () => {
      const color = prompt('Color HEX del grupo:', group.color || '#579bfc');
      if (!/^#[0-9a-f]{6}$/i.test(color || '')) return this.showToast('Color HEX no válido', true);
      await this.patchGroup(groupId, { color }); menu.remove();
    });
    menu.querySelector('[data-group-action="duplicate"]').addEventListener('click', async () => {
      try {
        await this.api(`/api/boards/${this.currentBoardId()}/groups/${encodeURIComponent(groupId)}/duplicate`, { method: 'POST', body: JSON.stringify({}) });
        menu.remove();
        await this.reloadBoardState();
        this.showToast('Grupo duplicado');
      } catch (err) { this.showToast(err.message, true); }
    });
    this.positionMenu(menu, anchor);
  },

  openColumnMenu(anchor, columnId) {
    document.querySelectorAll('.floating-menu').forEach(node => node.remove());
    const column = (this.currentBoard.columns || []).find(entry => entry.id === columnId);
    if (!column) return;
    const menu = document.createElement('div');
    menu.className = 'floating-menu';
    menu.innerHTML = `<div class="menu-title">${this.escapeHtml(column.title)}</div><button data-column-action="rename">Renombrar</button><button data-column-action="pin">${column.pinned ? 'Desfijar' : 'Fijar'} columna</button><button data-column-action="hide">Ocultar columna</button><button data-column-action="duplicate">⧉ Duplicar columna</button>`;
    menu.querySelector('[data-column-action="rename"]').addEventListener('click', async () => {
      const title = prompt('Nombre de la columna:', column.title);
      if (!title?.trim()) return;
      await this.patchColumn(columnId, { title: title.trim() }); menu.remove();
    });
    menu.querySelector('[data-column-action="pin"]').addEventListener('click', async () => { await this.patchColumn(columnId, { pinned: !column.pinned }); menu.remove(); });
    menu.querySelector('[data-column-action="hide"]').addEventListener('click', async () => { await this.patchColumn(columnId, { hidden: true }); menu.remove(); });
    menu.querySelector('[data-column-action="duplicate"]').addEventListener('click', async () => {
      try {
        await this.api(`/api/boards/${this.currentBoardId()}/columns/${encodeURIComponent(columnId)}/duplicate`, { method: 'POST', body: JSON.stringify({ includeValues: true }) });
        menu.remove();
        await this.reloadBoardState();
        this.showToast('Columna duplicada');
      } catch (err) { this.showToast(err.message, true); }
    });
    this.positionMenu(menu, anchor);
  },

  positionMenu(menu, anchor) {
    document.body.appendChild(menu);
    const rect = anchor.getBoundingClientRect();
    const left = Math.min(rect.left, window.innerWidth - Math.max(menu.offsetWidth, 220) - 12);
    const top = Math.min(rect.bottom + 6, window.innerHeight - menu.offsetHeight - 12);
    menu.style.left = `${Math.max(8, left)}px`;
    menu.style.top = `${Math.max(8, top)}px`;
    setTimeout(() => document.addEventListener('pointerdown', event => {
      if (!menu.contains(event.target) && event.target !== anchor) menu.remove();
    }, { once: true }), 0);
  },

  async patchGroup(groupId, patch) {
    try {
      await this.api(`/api/boards/${this.currentBoardId()}/groups/${encodeURIComponent(groupId)}`, { method: 'PATCH', body: JSON.stringify(patch) });
      await this.reloadBoardState();
      this.showToast('Grupo actualizado');
    } catch (err) { this.showToast(err.message, true); }
  },

  async patchColumn(columnId, patch) {
    try {
      await this.api(`/api/boards/${this.currentBoardId()}/columns/${encodeURIComponent(columnId)}`, { method: 'PATCH', body: JSON.stringify(patch) });
      await this.reloadBoardState();
      this.showToast('Columna actualizada');
    } catch (err) { this.showToast(err.message, true); }
  },

  openItemModal(groupId = '') {
    if (!this.currentBoard) return;
    const groups = this.effectiveGroups();
    const suggested = groups.find(group => group.id === groupId) || groups[0] || { id: '', title: 'General', color: '#579bfc' };
    const modal = `<form id="item-form" class="modal-card"><div class="modal-header"><div><h2>Nuevo elemento</h2><p>${this.escapeHtml(this.currentBoard.name)}</p></div><button type="button" class="modal-close" data-close-modal>×</button></div><label>Nombre<input name="name" required autofocus placeholder="Nombre del elemento"></label><label>Grupo<select name="groupId">${groups.map(group => `<option value="${this.escapeAttr(group.id)}" ${group.id === suggested.id ? 'selected' : ''}>${this.escapeHtml(group.title)}</option>`).join('')}</select></label><div class="modal-actions"><button type="button" class="button" data-close-modal>Cancelar</button><button class="button primary">Crear elemento</button></div></form>`;
    this.openModal(modal);
    document.getElementById('item-form').addEventListener('submit', async event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const chosen = groups.find(group => group.id === data.get('groupId')) || suggested;
      const order = this.boardItems().filter(item => (item.groupId || item.group) === (chosen.id || chosen.title)).length;
      try {
        const created = await this.api('/api/items', { method: 'POST', body: JSON.stringify({ board: this.currentBoardId(), groupId: chosen.id || '', group: chosen.title, groupColor: chosen.color, name: data.get('name').trim(), order, columnValues: {} }) });
        this.items.push(created);
        this.closeModal();
        this.showToast('Elemento creado');
        this.renderBoard();
      } catch (err) { this.showToast(err.message, true); }
    });
  },

  openCrewModal() {
    this.openModal(`<form id="crew-form" class="modal-card"><div class="modal-header"><h2>Nuevo miembro</h2><button type="button" class="modal-close" data-close-modal>×</button></div><label>Nombre<input name="name" required></label><label>Rol<input name="role"></label><label>Zona horaria<input name="timezone" placeholder="Atlantic/Canary"></label><div class="modal-actions"><button type="button" class="button" data-close-modal>Cancelar</button><button class="button primary">Añadir</button></div></form>`);
    document.getElementById('crew-form').addEventListener('submit', async event => {
      event.preventDefault(); const data = new FormData(event.currentTarget);
      try {
        const created = await this.api('/api/crew', { method: 'POST', body: JSON.stringify({ name: data.get('name').trim(), role: data.get('role').trim(), timezone: data.get('timezone').trim(), order: this.crew.length }) });
        this.crew.push(created); this.renderCrewDatalist(); this.closeModal(); this.renderCrew(); this.showToast('Miembro añadido');
      } catch (err) { this.showToast(err.message, true); }
    });
  },

  openModal(html) {
    const root = document.getElementById('modal-root');
    root.innerHTML = `<div class="modal-backdrop">${html}</div>`;
    root.querySelectorAll('[data-close-modal]').forEach(button => button.addEventListener('click', () => this.closeModal()));
    root.querySelector('.modal-backdrop')?.addEventListener('pointerdown', event => { if (event.target.classList.contains('modal-backdrop')) this.closeModal(); });
  },

  closeModal() {
    document.getElementById('modal-root').innerHTML = '';
  },

  async updateItem(id, patch, rerender = false) {
    try {
      const updated = await this.api(`/api/items/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
      this.replaceItem(updated);
      if (rerender) this.renderCurrentView();
      this.showToast('Guardado');
      return updated;
    } catch (err) { this.showToast(err.message, true); return null; }
  },

  async updateColumnValue(id, columnId, value) {
    try {
      const response = await this.api(`/api/items/${id}/columns/${encodeURIComponent(columnId)}`, { method: 'PATCH', body: JSON.stringify({ value }) });
      this.replaceItem(response.item);
      if (response.cascaded?.length) {
        await this.reloadItems();
        this.showToast(`${response.cascaded.length} dependencias desplazadas`);
      } else this.showToast('Guardado');
      return response.item;
    } catch (err) { this.showToast(err.message, true); return null; }
  },

  replaceItem(updated) {
    const index = this.items.findIndex(item => item._id === updated._id);
    if (index >= 0) this.items[index] = updated;
    else this.items.push(updated);
  },

  async reloadItems() {
    this.items = await this.api('/api/items?includeSubitems=true');
  },

  async reloadBoardState() {
    const boardId = this.currentBoardId();
    const [board, items] = await Promise.all([this.api(`/api/boards/${boardId}`), this.api(`/api/items/board/${boardId}?includeSubitems=true`)]);
    const boardIndex = this.boards.findIndex(entry => entry._id === boardId);
    if (boardIndex >= 0) this.boards[boardIndex] = board;
    this.currentBoard = board;
    this.items = this.items.filter(item => String(item.board?._id || item.board) !== String(boardId)).concat(items);
    this.renderHeader(); this.renderViewTabs(); this.renderCurrentView();
  },

  async duplicateItem(id, menu) {
    try {
      const duplicate = await this.api(`/api/items/${id}/duplicate`, { method: 'POST', body: JSON.stringify({}) });
      this.items.push(duplicate); menu?.remove(); this.renderBoard(); this.showToast('Elemento duplicado');
    } catch (err) { this.showToast(err.message, true); }
  },

  async moveItem(id, groupId, menu) {
    const group = this.effectiveGroups().find(entry => entry.id === groupId);
    if (!group) return;
    try {
      const updated = await this.api(`/api/items/${id}/move`, { method: 'POST', body: JSON.stringify({ groupId: group.id, group: group.title, groupColor: group.color, order: this.boardItems().filter(item => item.groupId === group.id).length }) });
      this.replaceItem(updated); menu?.remove(); this.renderBoard(); this.showToast('Elemento movido');
    } catch (err) { this.showToast(err.message, true); }
  },

  async archiveItem(id, menu) {
    try { await this.api(`/api/items/${id}/archive`, { method: 'POST', body: '{}' }); this.items = this.items.filter(item => item._id !== id); menu?.remove(); this.renderBoard(); this.showToast('Elemento archivado'); } catch (err) { this.showToast(err.message, true); }
  },

  async trashItem(id, menu) {
    try { await this.api(`/api/items/${id}`, { method: 'DELETE' }); this.items = this.items.filter(item => item._id !== id); menu?.remove(); this.renderBoard(); this.showToast('Elemento movido a papelera'); } catch (err) { this.showToast(err.message, true); }
  },

  async bulkAction(action) {
    if (action === 'clear') { this.selectedItems.clear(); this.renderBoard(); return; }
    const ids = [...this.selectedItems];
    if (!ids.length) return;
    if (action === 'trash' && !confirm(`¿Mover ${ids.length} elementos a la papelera?`)) return;
    try {
      for (const id of ids) {
        if (action === 'archive') await this.api(`/api/items/${id}/archive`, { method: 'POST', body: '{}' });
        if (action === 'trash') await this.api(`/api/items/${id}`, { method: 'DELETE' });
      }
      this.items = this.items.filter(item => !this.selectedItems.has(item._id));
      this.selectedItems.clear(); this.renderBoard(); this.showToast('Acción completada');
    } catch (err) { this.showToast(err.message, true); }
  },

  renderGantt() {
    const content = document.getElementById('content');
    const timeColumn = this.effectiveColumns().find(column => column.type === 'timeline' || column.type === 'date');
    if (!timeColumn) {
      content.innerHTML = `<div class="empty-state"><h2>Sin columna temporal</h2><p>Este tablero no tiene Timeline ni Date.</p></div>`;
      return;
    }

    const items = this.filteredBoardItems().map(item => {
      const value = this.valueFor(item, timeColumn);
      const start = timeColumn.type === 'date' ? value?.date : value?.from;
      const end = timeColumn.type === 'date' ? value?.date : value?.to;
      return { item, value, start, end };
    }).filter(entry => entry.start && entry.end);

    if (!items.length) {
      content.innerHTML = `<div class="empty-state"><h2>Sin fechas</h2><p>Añade fechas en ${this.escapeHtml(timeColumn.title)} para usar el cronograma.</p></div>`;
      return;
    }

    const starts = items.map(entry => this.utcDay(entry.start));
    const ends = items.map(entry => this.utcDay(entry.end));
    const min = new Date(Math.min(...starts.map(date => date.getTime())) - 7 * DAY_MS);
    const max = new Date(Math.max(...ends.map(date => date.getTime())) + 7 * DAY_MS);
    const totalDays = Math.round((max - min) / DAY_MS) + 1;
    const dayWidth = 22;
    const timelineWidth = totalDays * dayWidth;
    this.gantt = { min, max, totalDays, dayWidth, timeColumn };

    const days = Array.from({ length: totalDays }, (_, index) => {
      const date = new Date(min.getTime() + index * DAY_MS);
      const isMonday = date.getUTCDay() === 1;
      const isWeekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
      return `<div class="gantt-day ${isMonday ? 'week-start' : ''} ${isWeekend ? 'weekend' : ''}" style="width:${dayWidth}px"><span>${date.getUTCDate()}</span></div>`;
    }).join('');

    const rows = items.map(entry => {
      const start = this.utcDay(entry.start); const end = this.utcDay(entry.end);
      const left = Math.round((start - min) / DAY_MS) * dayWidth;
      const durationDays = Math.round((end - start) / DAY_MS) + 1;
      const width = Math.max(dayWidth, durationDays * dayWidth);
      const group = this.effectiveGroups().find(candidate => candidate.id === entry.item.groupId || candidate.title === entry.item.group);
      const color = group?.color || entry.item.groupColor || '#579bfc';
      const milestone = entry.value?.visualizationType === 'milestone' || entry.value?.visualization_type === 'milestone';
      return `<div class="gantt-row" data-item-id="${entry.item._id}"><div class="gantt-label"><strong>${this.escapeHtml(entry.item.name)}</strong><small>${this.escapeHtml(group?.title || entry.item.group || '')}</small></div><div class="gantt-track" style="width:${timelineWidth}px"><div class="gantt-bar ${milestone ? 'milestone' : ''}" data-id="${entry.item._id}" data-start="${this.escapeAttr(entry.start)}" data-end="${this.escapeAttr(entry.end)}" style="left:${left}px;width:${milestone ? dayWidth : width}px;background:${this.escapeAttr(color)}"><span class="gantt-handle left" data-resize="start"></span><span class="gantt-bar-label">${milestone ? '◆ ' : ''}${this.escapeHtml(entry.item.name)}</span><span class="gantt-handle right" data-resize="end"></span></div></div></div>`;
    }).join('');

    const today = this.utcDay(new Date());
    const todayIndex = Math.round((today - min) / DAY_MS);
    const todayLeft = todayIndex >= 0 && todayIndex < totalDays ? todayIndex * dayWidth : null;
    content.innerHTML = `<div class="gantt-shell"><div class="gantt-help"><strong>Cronograma interactivo</strong><span>Arrastra para mover. Redimensiona desde los extremos. Las dependencias Strict se desplazan en cascada.</span></div><div class="gantt-scroller"><div class="gantt-canvas" style="width:${timelineWidth + 260}px"><div class="gantt-days"><div class="gantt-label-head">Elemento</div><div class="gantt-days-track" style="width:${timelineWidth}px">${days}</div></div><div class="gantt-body">${todayLeft !== null ? `<div class="today-line" style="left:${260 + todayLeft}px"><span>Hoy</span></div>` : ''}${rows}</div></div></div></div>`;
    content.querySelectorAll('.gantt-bar').forEach(bar => bar.addEventListener('pointerdown', event => this.startGanttPointer(event, bar)));
  },

  startGanttPointer(event, bar) {
    event.preventDefault();
    const item = this.findItem(bar.dataset.id);
    if (!item || !this.gantt) return;
    const mode = event.target.dataset.resize === 'start' ? 'resize-start' : event.target.dataset.resize === 'end' ? 'resize-end' : 'move';
    const originX = event.clientX;
    const originalStart = this.utcDay(bar.dataset.start);
    const originalEnd = this.utcDay(bar.dataset.end);
    const originalLeft = parseFloat(bar.style.left);
    const originalWidth = parseFloat(bar.style.width);
    const dayWidth = this.gantt.dayWidth;
    bar.setPointerCapture?.(event.pointerId); bar.classList.add('is-dragging');

    const onMove = moveEvent => {
      const deltaDays = Math.round((moveEvent.clientX - originX) / dayWidth);
      if (mode === 'move') bar.style.left = `${originalLeft + deltaDays * dayWidth}px`;
      else if (mode === 'resize-start') {
        const maxDelta = Math.round((originalEnd - originalStart) / DAY_MS);
        const safeDelta = Math.min(deltaDays, maxDelta);
        bar.style.left = `${originalLeft + safeDelta * dayWidth}px`; bar.style.width = `${Math.max(dayWidth, originalWidth - safeDelta * dayWidth)}px`;
      } else {
        const minDelta = -Math.round((originalEnd - originalStart) / DAY_MS);
        const safeDelta = Math.max(deltaDays, minDelta); bar.style.width = `${Math.max(dayWidth, originalWidth + safeDelta * dayWidth)}px`;
      }
      bar.dataset.deltaDays = String(deltaDays);
    };

    const onUp = async upEvent => {
      bar.releasePointerCapture?.(upEvent.pointerId); bar.classList.remove('is-dragging');
      document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp);
      const deltaDays = Number(bar.dataset.deltaDays || 0); delete bar.dataset.deltaDays;
      if (!deltaDays) return this.renderGantt();
      let start = new Date(originalStart); let end = new Date(originalEnd);
      if (mode === 'move') { start = new Date(start.getTime() + deltaDays * DAY_MS); end = new Date(end.getTime() + deltaDays * DAY_MS); }
      else if (mode === 'resize-start') { const maxDelta = Math.round((originalEnd - originalStart) / DAY_MS); start = new Date(start.getTime() + Math.min(deltaDays, maxDelta) * DAY_MS); }
      else { const minDelta = -Math.round((originalEnd - originalStart) / DAY_MS); end = new Date(end.getTime() + Math.max(deltaDays, minDelta) * DAY_MS); }
      const column = this.gantt.timeColumn;
      const value = column.type === 'date' ? { type: 'date', date: this.isoDate(start) } : { type: 'timeline', from: this.isoDate(start), to: this.isoDate(end) };
      await this.updateColumnValue(item._id, column.id, value);
      this.renderGantt();
    };
    document.addEventListener('pointermove', onMove); document.addEventListener('pointerup', onUp);
  },

  renderCrew() {
    const content = document.getElementById('content');
    const rows = this.crew.map(member => `<tr><td><div class="person-cell"><span class="avatar">${this.escapeHtml(this.initials(member.name) || '＋')}</span><input class="cell-input crew-input" data-id="${member._id}" data-field="name" value="${this.escapeAttr(member.name || '')}"></div></td><td><input class="cell-input crew-input" data-id="${member._id}" data-field="role" value="${this.escapeAttr(member.role || '')}"></td><td><input class="cell-input crew-input" data-id="${member._id}" data-field="phone" value="${this.escapeAttr(member.phone || '')}"></td><td><input type="email" class="cell-input crew-input" data-id="${member._id}" data-field="email" value="${this.escapeAttr(member.email || '')}"></td><td><input class="cell-input crew-input" data-id="${member._id}" data-field="timezone" value="${this.escapeAttr(member.timezone || '')}"></td></tr>`).join('');
    content.innerHTML = `<div class="crew-panel"><div class="crew-panel-header"><div><h2>Equipo</h2><p>Personas y zonas horarias usadas por New Monday.</p></div><button class="button primary" id="crew-add-inline">＋ Añadir miembro</button></div><div class="table-wrap"><table class="crew-table"><thead><tr><th>Nombre</th><th>Rol</th><th>Teléfono</th><th>Email</th><th>Zona horaria</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
    content.querySelectorAll('.crew-input').forEach(input => input.addEventListener('change', () => this.updateCrew(input.dataset.id, { [input.dataset.field]: input.value.trim() })));
    document.getElementById('crew-add-inline')?.addEventListener('click', () => this.openCrewModal());
  },

  async updateCrew(id, patch) {
    try {
      const updated = await this.api(`/api/crew/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
      const index = this.crew.findIndex(member => member._id === id); if (index >= 0) this.crew[index] = updated;
      this.renderCrewDatalist(); this.showToast('Equipo actualizado');
    } catch (err) { this.showToast(err.message, true); }
  },

  refreshWorldClocks() {
    document.querySelectorAll('.world-clock').forEach(cell => {
      const timezone = cell.dataset.timezone || this.timezoneForItem(this.findItem(cell.dataset.itemId));
      const timeEl = cell.querySelector('.clock-time'); const zoneEl = cell.querySelector('.clock-zone');
      if (!timezone) { timeEl.textContent = '—'; zoneEl.textContent = ''; return; }
      try {
        timeEl.textContent = new Intl.DateTimeFormat('es-ES', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
        zoneEl.textContent = timezone;
      } catch { timeEl.textContent = '—'; zoneEl.textContent = timezone; }
    });
  },

  timezoneForItem(item) {
    if (!item) return '';
    const person = String(item.person || '').trim().toLowerCase();
    const member = person ? this.crew.find(entry => String(entry.name || '').trim().toLowerCase() === person) : null;
    return member?.timezone || item.extraFields?.timezone || '';
  },

  findItem(id) {
    return this.items.find(item => String(item._id) === String(id));
  },

  showConnectionError(err) {
    document.getElementById('content').innerHTML = `<div class="connection-error"><span>!</span><div><h2>No se puede acceder a New Monday</h2><p>${this.escapeHtml(err.message || 'Error de conexión')}</p></div></div>`;
  },

  showToast(message, isError = false) {
    const root = document.getElementById('toast-root'); const toast = document.createElement('div');
    toast.className = `toast ${isError ? 'error' : ''}`; toast.textContent = message; root.appendChild(toast); setTimeout(() => toast.remove(), 2300);
  },

  initials(name) {
    const clean = String(name || '').trim(); if (!clean || clean === '.') return '';
    return clean.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  },

  utcDay(value) {
    const date = value instanceof Date ? value : new Date(value);
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  },

  isoDate(date) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  },

  toInputDate(value) {
    if (!value) return '';
    const date = new Date(value); if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
    return this.isoDate(this.utcDay(date));
  },

  escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  },

  escapeAttr(value) {
    return this.escapeHtml(value).replace(/`/g, '&#096;');
  }
};

document.addEventListener('DOMContentLoaded', () => app.init());
