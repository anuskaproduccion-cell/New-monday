const DAY_MS = 24 * 60 * 60 * 1000;
const app = {
  boards: [],
  items: [],
  crew: [],
  currentBoard: null,
  currentView: 'board',
  search: '',
  collapsedGroups: new Set(),
  gantt: null,
  worldClockTimer: null,

  async init() {
    this.bindStaticEvents();
    await this.reloadAll();
    this.renderSidebar();
    this.renderCrewDatalist();

    const preferred = this.boards.find(b => b.name === 'GY_POST') || this.boards[0];
    if (preferred) {
      await this.selectBoard(preferred);
    } else {
      this.renderEmptyState();
    }

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
      const [boards, items, crew] = await Promise.all([
        this.api('/api/boards'),
        this.api('/api/items'),
        this.api('/api/crew')
      ]);
      this.boards = boards;
      this.items = items;
      this.crew = crew;
    } catch (err) {
      this.showConnectionError(err);
    }
  },

  async selectBoard(board) {
    this.currentBoard = board;
    this.currentView = 'board';
    this.search = '';
    document.getElementById('global-search').value = '';
    this.syncTabs();
    this.renderSidebar();
    this.renderHeader();
    this.renderCurrentView();
  },

  currentBoardId() {
    return this.currentBoard?._id;
  },

  boardItems() {
    const boardId = this.currentBoardId();
    return this.items
      .filter(item => (item.board?._id || item.board) === boardId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  },

  filteredBoardItems() {
    const term = this.search.trim().toLowerCase();
    const items = this.boardItems();
    if (!term) return items;
    return items.filter(item => [
      item.name,
      item.person,
      item.status,
      item.group,
      item.dependency,
      item.notes
    ].some(value => String(value || '').toLowerCase().includes(term)));
  },

  bindStaticEvents() {
    document.querySelectorAll('.view-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.currentView = tab.dataset.view;
        this.syncTabs();
        this.renderCurrentView();
      });
    });

    document.getElementById('btn-add').addEventListener('click', () => {
      if (this.currentView === 'crew') this.openCrewModal();
      else this.openItemModal();
    });

    document.getElementById('global-search').addEventListener('input', event => {
      this.search = event.target.value;
      if (this.currentView === 'board') this.renderBoard();
      if (this.currentView === 'gantt') this.renderGantt();
    });

    document.getElementById('board-search').addEventListener('input', () => this.renderSidebar());
  },

  syncTabs() {
    document.querySelectorAll('.view-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.view === this.currentView);
    });
  },

  renderHeader() {
    if (!this.currentBoard) return;
    document.getElementById('board-title').textContent = this.currentBoard.name;
    document.getElementById('board-icon').textContent = this.currentBoard.icon || '📋';
    document.getElementById('board-subtitle').textContent =
      this.currentBoard.name === 'GY_POST'
        ? 'Tablero principal de postproducción · cronograma, dependencias y equipo'
        : `Workspace ${this.currentBoard.workspace || 'GY_GUAYOTA'}`;
  },

  renderSidebar() {
    const nav = document.getElementById('sidebar-nav');
    const term = document.getElementById('board-search')?.value?.trim().toLowerCase() || '';
    nav.innerHTML = '';

    this.boards
      .filter(board => !term || board.name.toLowerCase().includes(term))
      .forEach(board => {
        const button = document.createElement('button');
        button.className = `sidebar-nav-item ${this.currentBoard?._id === board._id ? 'active' : ''}`;
        button.innerHTML = `<span class="sidebar-nav-item-icon">${this.escapeHtml(board.icon || '📋')}</span><span>${this.escapeHtml(board.name)}</span>`;
        button.addEventListener('click', () => this.selectBoard(board));
        nav.appendChild(button);
      });
  },

  renderCrewDatalist() {
    document.getElementById('crew-options').innerHTML = this.crew
      .filter(member => member.name && member.name !== '.')
      .map(member => `<option value="${this.escapeAttr(member.name)}"></option>`)
      .join('');
  },

  renderCurrentView() {
    if (!this.currentBoard) return this.renderEmptyState();
    if (this.currentView === 'board') return this.renderBoard();
    if (this.currentView === 'gantt') return this.renderGantt();
    return this.renderCrew();
  },

  renderEmptyState() {
    document.getElementById('content').innerHTML = `
      <div class="empty-state">
        <h2>No hay tableros disponibles</h2>
        <p>Conecta MongoDB Atlas o carga los datos iniciales.</p>
        <button class="button primary" onclick="app.seedData()">Cargar datos iniciales</button>
      </div>`;
  },

  renderBoard() {
    const content = document.getElementById('content');
    const items = this.filteredBoardItems();
    const grouped = new Map();
    items.forEach(item => {
      if (!grouped.has(item.group)) grouped.set(item.group, []);
      grouped.get(item.group).push(item);
    });

    if (!items.length) {
      content.innerHTML = `<div class="empty-state"><h2>Sin resultados</h2><p>No hay elementos que coincidan con la búsqueda.</p></div>`;
      return;
    }

    content.innerHTML = `<div class="board-scroll">${[...grouped.entries()].map(([groupName, groupItems]) => this.groupHtml(groupName, groupItems)).join('')}</div>`;
    this.bindBoardEvents();
    this.refreshWorldClocks();
  },

  groupHtml(groupName, items) {
    const color = items[0]?.groupColor || '#579bfc';
    const collapsed = this.collapsedGroups.has(groupName);
    return `
      <section class="group-section" data-group="${this.escapeAttr(groupName)}" style="--group-color:${color}">
        <button class="group-header" data-action="toggle-group" data-group="${this.escapeAttr(groupName)}">
          <span class="group-chevron">${collapsed ? '▶' : '▼'}</span>
          <span class="group-dot"></span>
          <span class="group-title">${this.escapeHtml(groupName)}</span>
          <span class="group-count">${items.length} elementos</span>
        </button>
        <div class="group-body ${collapsed ? 'is-collapsed' : ''}">
          <div class="table-wrap">
            <table class="board-table">
              <thead>
                <tr>
                  <th class="col-element">Elemento</th>
                  <th>Persona</th>
                  <th>Estado</th>
                  <th class="col-date">Cronograma</th>
                  <th>Fórmula</th>
                  <th class="col-dependency">Dependencia</th>
                  <th>Reloj mundial</th>
                  <th>Solape Weeks</th>
                  <th class="col-notes">Notas</th>
                  <th class="col-actions"></th>
                </tr>
              </thead>
              <tbody>
                ${items.map(item => this.itemRowHtml(item, color)).join('')}
              </tbody>
            </table>
          </div>
          <button class="add-item-row" data-action="add-item" data-group="${this.escapeAttr(groupName)}">＋ Agregar elemento</button>
        </div>
      </section>`;
  },

  itemRowHtml(item, color) {
    const overlapWeeks = item.extraFields?.overlapWeeks ?? '';
    const dependencyOptions = this.dependencyOptions(item);
    const startDate = this.toInputDate(item.startDate);
    const endDate = this.toInputDate(item.endDate);
    const initials = this.initials(item.person || '');
    const hasSubitems = item.subitems?.length > 0;

    return `
      <tr data-item-id="${item._id}" class="item-row">
        <td class="element-cell" style="--row-color:${color}">
          <div class="element-inner">
            ${hasSubitems ? `<button class="subitem-toggle" data-action="toggle-subitems" data-id="${item._id}" title="Subelementos">▸</button>` : '<span class="subitem-spacer"></span>'}
            <input class="cell-input element-input" data-field="name" data-id="${item._id}" value="${this.escapeAttr(item.name || '')}">
          </div>
        </td>
        <td>
          <div class="person-cell">
            <span class="avatar small">${this.escapeHtml(initials || '＋')}</span>
            <input class="cell-input person-input" list="crew-options" data-field="person" data-id="${item._id}" value="${this.escapeAttr(item.person || '')}" placeholder="Asignar">
          </div>
        </td>
        <td><button class="status-pill ${this.statusClass(item.status)}" data-action="status" data-id="${item._id}">${this.escapeHtml(item.status || 'Sin estado')}</button></td>
        <td>
          <div class="date-range-editor">
            <input type="date" class="date-input" data-date-field="startDate" data-id="${item._id}" value="${startDate}">
            <span>→</span>
            <input type="date" class="date-input" data-date-field="endDate" data-id="${item._id}" value="${endDate}">
          </div>
        </td>
        <td><input type="number" min="0" step="0.5" class="cell-input number-input" data-number-field="formula" data-id="${item._id}" value="${item.formula ?? 0}"><span class="unit">w</span></td>
        <td><select class="dependency-select" data-id="${item._id}">${dependencyOptions}</select></td>
        <td><div class="world-clock" data-item-id="${item._id}"><span class="clock-time">—</span><small class="clock-zone"></small></div></td>
        <td><input type="number" min="0" step="0.5" class="cell-input number-input overlap-input" data-id="${item._id}" value="${this.escapeAttr(String(overlapWeeks))}" placeholder="—"><span class="unit">w</span></td>
        <td><textarea class="notes-input" data-id="${item._id}" rows="1" placeholder="Añadir nota">${this.escapeHtml(item.notes || '')}</textarea></td>
        <td class="row-actions"><button class="icon-danger" data-action="delete-item" data-id="${item._id}" title="Eliminar">×</button></td>
      </tr>
      ${hasSubitems ? `<tr class="subitems-row" data-parent-id="${item._id}" hidden><td colspan="10"><div class="subitems-list">${item.subitems.map(sub => `<div class="subitem"><span>↳</span><strong>${this.escapeHtml(sub.name)}</strong><span>${this.escapeHtml(sub.owner || '')}</span><span>${this.escapeHtml(sub.status || '')}</span></div>`).join('')}</div></td></tr>` : ''}`;
  },

  dependencyOptions(item) {
    const candidates = this.boardItems().filter(other => other._id !== item._id);
    const current = item.dependency || '';
    const exactExists = candidates.some(other => other.name === current);
    let html = `<option value="">—</option>`;
    if (current && !exactExists) html += `<option value="${this.escapeAttr(current)}" selected>${this.escapeHtml(current)} (actual)</option>`;
    html += candidates.map(other => `<option value="${this.escapeAttr(other.name)}" ${other.name === current ? 'selected' : ''}>${this.escapeHtml(other.name)}</option>`).join('');
    return html;
  },

  bindBoardEvents() {
    const content = document.getElementById('content');

    content.querySelectorAll('[data-action="toggle-group"]').forEach(button => {
      button.addEventListener('click', () => {
        const group = button.dataset.group;
        if (this.collapsedGroups.has(group)) this.collapsedGroups.delete(group);
        else this.collapsedGroups.add(group);
        this.renderBoard();
      });
    });

    content.querySelectorAll('[data-action="add-item"]').forEach(button => button.addEventListener('click', () => this.openItemModal(button.dataset.group)));
    content.querySelectorAll('[data-action="delete-item"]').forEach(button => button.addEventListener('click', () => this.deleteItem(button.dataset.id)));
    content.querySelectorAll('[data-action="status"]').forEach(button => button.addEventListener('click', event => this.openStatusMenu(event.currentTarget, button.dataset.id)));
    content.querySelectorAll('[data-action="toggle-subitems"]').forEach(button => {
      button.addEventListener('click', () => {
        const row = content.querySelector(`.subitems-row[data-parent-id="${button.dataset.id}"]`);
        if (!row) return;
        row.hidden = !row.hidden;
        button.textContent = row.hidden ? '▸' : '▾';
      });
    });

    content.querySelectorAll('[data-field]').forEach(input => {
      input.addEventListener('change', () => this.updateItem(input.dataset.id, { [input.dataset.field]: input.value.trim() }));
    });

    content.querySelectorAll('[data-date-field]').forEach(input => {
      input.addEventListener('change', async () => {
        const item = this.findItem(input.dataset.id);
        if (!item) return;
        let start = input.dataset.dateField === 'startDate' ? input.value : this.toInputDate(item.startDate);
        let end = input.dataset.dateField === 'endDate' ? input.value : this.toInputDate(item.endDate);
        if (start && end && new Date(start) > new Date(end)) {
          if (input.dataset.dateField === 'startDate') end = start;
          else start = end;
        }
        await this.updateItem(item._id, { startDate: start || null, endDate: end || null });
        this.renderBoard();
      });
    });

    content.querySelectorAll('[data-number-field]').forEach(input => {
      input.addEventListener('change', () => this.updateItem(input.dataset.id, { [input.dataset.numberField]: Number(input.value || 0) }));
    });

    content.querySelectorAll('.dependency-select').forEach(select => {
      select.addEventListener('change', () => this.updateItem(select.dataset.id, { dependency: select.value }));
    });

    content.querySelectorAll('.overlap-input').forEach(input => {
      input.addEventListener('change', () => {
        const item = this.findItem(input.dataset.id);
        const extraFields = { ...(item?.extraFields || {}), overlapWeeks: input.value === '' ? '' : Number(input.value) };
        this.updateItem(input.dataset.id, { extraFields });
      });
    });

    content.querySelectorAll('.notes-input').forEach(input => {
      input.addEventListener('change', () => this.updateItem(input.dataset.id, { notes: input.value }));
    });
  },

  renderCrew() {
    const content = document.getElementById('content');
    const rows = this.crew.map(member => `
      <tr data-crew-id="${member._id}">
        <td><div class="person-cell"><span class="avatar">${this.escapeHtml(this.initials(member.name) || '＋')}</span><input class="cell-input crew-input" data-id="${member._id}" data-field="name" value="${this.escapeAttr(member.name || '')}"></div></td>
        <td><input class="cell-input crew-input" data-id="${member._id}" data-field="role" value="${this.escapeAttr(member.role || '')}"></td>
        <td><input class="cell-input crew-input" data-id="${member._id}" data-field="prefix" value="${this.escapeAttr(member.prefix || '')}"></td>
        <td><input class="cell-input crew-input" data-id="${member._id}" data-field="phone" value="${this.escapeAttr(member.phone || '')}"></td>
        <td><input type="email" class="cell-input crew-input" data-id="${member._id}" data-field="email" value="${this.escapeAttr(member.email || '')}"></td>
        <td><input class="cell-input crew-input" data-id="${member._id}" data-field="timezone" value="${this.escapeAttr(member.timezone || '')}" placeholder="Europe/Madrid"></td>
        <td class="row-actions"><button class="icon-danger" data-delete-crew="${member._id}" title="Eliminar">×</button></td>
      </tr>`).join('');

    content.innerHTML = `
      <div class="crew-panel">
        <div class="crew-panel-header"><div><h2>Equipo de postproducción</h2><p>Zonas horarias usadas por la columna Reloj mundial.</p></div><button class="button primary" id="crew-add-inline">＋ Añadir miembro</button></div>
        <div class="table-wrap"><table class="crew-table"><thead><tr><th>Nombre</th><th>Rol</th><th>Prefijo</th><th>Teléfono</th><th>Email</th><th>Zona horaria</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      </div>`;

    content.querySelectorAll('.crew-input').forEach(input => input.addEventListener('change', () => this.updateCrew(input.dataset.id, { [input.dataset.field]: input.value.trim() })));
    content.querySelectorAll('[data-delete-crew]').forEach(button => button.addEventListener('click', () => this.deleteCrew(button.dataset.deleteCrew)));
    document.getElementById('crew-add-inline').addEventListener('click', () => this.openCrewModal());
  },

  renderGantt() {
    const content = document.getElementById('content');
    const items = this.filteredBoardItems().filter(item => item.startDate && item.endDate);
    if (!items.length) {
      content.innerHTML = `<div class="empty-state"><h2>Sin fechas</h2><p>Añade fechas en la Tabla principal para ver y editar el cronograma.</p></div>`;
      return;
    }

    const starts = items.map(item => this.utcDay(item.startDate));
    const ends = items.map(item => this.utcDay(item.endDate));
    const min = new Date(Math.min(...starts.map(d => d.getTime())) - 7 * DAY_MS);
    const max = new Date(Math.max(...ends.map(d => d.getTime())) + 7 * DAY_MS);
    const totalDays = Math.round((max - min) / DAY_MS) + 1;
    const dayWidth = 22;
    const timelineWidth = totalDays * dayWidth;
    this.gantt = { min, max, totalDays, dayWidth };

    const days = Array.from({ length: totalDays }, (_, index) => {
      const date = new Date(min.getTime() + index * DAY_MS);
      const isMonday = date.getUTCDay() === 1;
      const isWeekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
      return `<div class="gantt-day ${isMonday ? 'week-start' : ''} ${isWeekend ? 'weekend' : ''}" style="width:${dayWidth}px"><span>${date.getUTCDate()}</span></div>`;
    }).join('');

    const rows = items.map(item => {
      const start = this.utcDay(item.startDate);
      const end = this.utcDay(item.endDate);
      const left = Math.round((start - min) / DAY_MS) * dayWidth;
      const durationDays = Math.round((end - start) / DAY_MS) + 1;
      const width = Math.max(dayWidth, durationDays * dayWidth);
      const color = item.groupColor || '#579bfc';
      return `
        <div class="gantt-row" data-item-id="${item._id}">
          <div class="gantt-label"><strong>${this.escapeHtml(item.name)}</strong><small>${this.escapeHtml(item.group)}</small></div>
          <div class="gantt-track" style="width:${timelineWidth}px">
            <div class="gantt-bar" data-id="${item._id}" data-start="${this.toInputDate(item.startDate)}" data-end="${this.toInputDate(item.endDate)}" style="left:${left}px;width:${width}px;background:${color}">
              <span class="gantt-handle left" data-resize="start"></span>
              <span class="gantt-bar-label">${this.escapeHtml(item.name)}</span>
              <span class="gantt-handle right" data-resize="end"></span>
            </div>
          </div>
        </div>`;
    }).join('');

    const today = this.utcDay(new Date());
    const todayIndex = Math.round((today - min) / DAY_MS);
    const todayLeft = todayIndex >= 0 && todayIndex < totalDays ? todayIndex * dayWidth : null;

    content.innerHTML = `
      <div class="gantt-shell">
        <div class="gantt-help"><strong>Cronograma interactivo</strong><span>Arrastra una barra para moverla. Usa los extremos para cambiar la duración.</span></div>
        <div class="gantt-scroller">
          <div class="gantt-canvas" style="width:${timelineWidth + 260}px">
            <div class="gantt-days"><div class="gantt-label-head">Elemento</div><div class="gantt-days-track" style="width:${timelineWidth}px">${days}</div></div>
            <div class="gantt-body" style="--timeline-width:${timelineWidth}px">
              ${todayLeft !== null ? `<div class="today-line" style="left:${260 + todayLeft}px"><span>Hoy</span></div>` : ''}
              ${rows}
            </div>
          </div>
        </div>
      </div>`;

    this.bindGanttEvents();
  },

  bindGanttEvents() {
    document.querySelectorAll('.gantt-bar').forEach(bar => {
      bar.addEventListener('pointerdown', event => this.startGanttPointer(event, bar));
    });
  },

  startGanttPointer(event, bar) {
    event.preventDefault();
    const id = bar.dataset.id;
    const item = this.findItem(id);
    if (!item || !this.gantt) return;

    const mode = event.target.dataset.resize === 'start' ? 'resize-start' : event.target.dataset.resize === 'end' ? 'resize-end' : 'move';
    const originX = event.clientX;
    const originalStart = this.utcDay(item.startDate);
    const originalEnd = this.utcDay(item.endDate);
    const originalLeft = parseFloat(bar.style.left);
    const originalWidth = parseFloat(bar.style.width);
    const dayWidth = this.gantt.dayWidth;

    bar.setPointerCapture?.(event.pointerId);
    bar.classList.add('is-dragging');

    const onMove = moveEvent => {
      const deltaDays = Math.round((moveEvent.clientX - originX) / dayWidth);
      if (mode === 'move') {
        bar.style.left = `${originalLeft + deltaDays * dayWidth}px`;
      } else if (mode === 'resize-start') {
        const maxDelta = Math.round((originalEnd - originalStart) / DAY_MS);
        const safeDelta = Math.min(deltaDays, maxDelta);
        bar.style.left = `${originalLeft + safeDelta * dayWidth}px`;
        bar.style.width = `${Math.max(dayWidth, originalWidth - safeDelta * dayWidth)}px`;
      } else {
        const minDelta = -Math.round((originalEnd - originalStart) / DAY_MS);
        const safeDelta = Math.max(deltaDays, minDelta);
        bar.style.width = `${Math.max(dayWidth, originalWidth + safeDelta * dayWidth)}px`;
      }
      bar.dataset.deltaDays = String(deltaDays);
    };

    const onUp = async upEvent => {
      bar.releasePointerCapture?.(upEvent.pointerId);
      bar.classList.remove('is-dragging');
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      const deltaDays = Number(bar.dataset.deltaDays || 0);
      delete bar.dataset.deltaDays;
      if (!deltaDays) return this.renderGantt();

      let start = new Date(originalStart);
      let end = new Date(originalEnd);
      if (mode === 'move') {
        start = new Date(start.getTime() + deltaDays * DAY_MS);
        end = new Date(end.getTime() + deltaDays * DAY_MS);
      } else if (mode === 'resize-start') {
        const maxDelta = Math.round((originalEnd - originalStart) / DAY_MS);
        start = new Date(start.getTime() + Math.min(deltaDays, maxDelta) * DAY_MS);
      } else {
        const minDelta = -Math.round((originalEnd - originalStart) / DAY_MS);
        end = new Date(end.getTime() + Math.max(deltaDays, minDelta) * DAY_MS);
      }

      await this.updateItem(id, { startDate: this.isoDate(start), endDate: this.isoDate(end) }, false);
      this.showToast('Cronograma actualizado');
      this.renderGantt();
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  },

  openStatusMenu(anchor, id) {
    document.querySelectorAll('.status-menu').forEach(menu => menu.remove());
    const menu = document.createElement('div');
    menu.className = 'status-menu';
    const options = [
      ['Done', '#00c875'],
      ['Working on it', '#fdab3d'],
      ['Stuck', '#e2445c'],
      ['', '#c4c4c4']
    ];
    options.forEach(([status, color]) => {
      const button = document.createElement('button');
      button.style.background = color;
      button.textContent = status || 'Sin estado';
      button.addEventListener('click', async () => {
        await this.updateItem(id, { status, statusColor: status ? color : '' }, false);
        menu.remove();
        this.renderBoard();
      });
      menu.appendChild(button);
    });
    const rect = anchor.getBoundingClientRect();
    menu.style.left = `${Math.min(rect.left, window.innerWidth - 190)}px`;
    menu.style.top = `${rect.bottom + 6}px`;
    document.body.appendChild(menu);
    setTimeout(() => document.addEventListener('click', event => {
      if (!menu.contains(event.target) && event.target !== anchor) menu.remove();
    }, { once: true }), 0);
  },

  openItemModal(groupName = '') {
    if (!this.currentBoard) return;
    const groups = [...new Set(this.boardItems().map(item => item.group))];
    const suggestedGroup = groupName || groups[0] || 'General';
    this.openModal(`
      <form id="item-form" class="modal-card">
        <div class="modal-header"><div><h2>Nuevo elemento</h2><p>${this.escapeHtml(this.currentBoard.name)}</p></div><button type="button" class="modal-close" data-close-modal>×</button></div>
        <label>Nombre<input name="name" required autofocus placeholder="Nombre de la tarea"></label>
        <label>Grupo<input name="group" required value="${this.escapeAttr(suggestedGroup)}" list="group-options"></label>
        <datalist id="group-options">${groups.map(group => `<option value="${this.escapeAttr(group)}"></option>`).join('')}</datalist>
        <label>Persona<input name="person" list="crew-options" placeholder="Opcional"></label>
        <div class="modal-grid"><label>Inicio<input name="startDate" type="date"></label><label>Fin<input name="endDate" type="date"></label></div>
        <div class="modal-actions"><button type="button" class="button" data-close-modal>Cancelar</button><button type="submit" class="button primary">Crear elemento</button></div>
      </form>`);

    document.getElementById('item-form').addEventListener('submit', async event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const sameGroup = this.boardItems().find(item => item.group === form.get('group'));
      const payload = {
        board: this.currentBoardId(),
        group: form.get('group').trim(),
        groupColor: sameGroup?.groupColor || '#579bfc',
        name: form.get('name').trim(),
        person: form.get('person').trim(),
        startDate: form.get('startDate') || null,
        endDate: form.get('endDate') || form.get('startDate') || null,
        order: this.boardItems().length
      };
      try {
        const created = await this.api('/api/items', { method: 'POST', body: JSON.stringify(payload) });
        this.items.push(created);
        this.closeModal();
        this.showToast('Elemento creado');
        this.renderBoard();
      } catch (err) { this.showToast(err.message, true); }
    });
  },

  openCrewModal() {
    this.openModal(`
      <form id="crew-form" class="modal-card">
        <div class="modal-header"><div><h2>Nuevo miembro</h2><p>Equipo de postproducción</p></div><button type="button" class="modal-close" data-close-modal>×</button></div>
        <label>Nombre<input name="name" required autofocus></label>
        <label>Rol<input name="role"></label>
        <div class="modal-grid"><label>Prefijo<input name="prefix" placeholder="+34"></label><label>Teléfono<input name="phone"></label></div>
        <label>Email<input name="email" type="email"></label>
        <label>Zona horaria<input name="timezone" placeholder="Atlantic/Canary"></label>
        <div class="modal-actions"><button type="button" class="button" data-close-modal>Cancelar</button><button type="submit" class="button primary">Añadir miembro</button></div>
      </form>`);
    document.getElementById('crew-form').addEventListener('submit', async event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const payload = Object.fromEntries([...form.entries()].map(([key, value]) => [key, String(value).trim()]));
      payload.order = this.crew.length;
      try {
        const created = await this.api('/api/crew', { method: 'POST', body: JSON.stringify(payload) });
        this.crew.push(created);
        this.renderCrewDatalist();
        this.closeModal();
        this.showToast('Miembro añadido');
        this.renderCrew();
      } catch (err) { this.showToast(err.message, true); }
    });
  },

  openModal(html) {
    const root = document.getElementById('modal-root');
    root.innerHTML = `<div class="modal-backdrop">${html}</div>`;
    root.querySelectorAll('[data-close-modal]').forEach(button => button.addEventListener('click', () => this.closeModal()));
    root.querySelector('.modal-backdrop').addEventListener('mousedown', event => {
      if (event.target.classList.contains('modal-backdrop')) this.closeModal();
    });
  },

  closeModal() {
    document.getElementById('modal-root').innerHTML = '';
  },

  async updateItem(id, patch, toast = true) {
    try {
      const updated = await this.api(`/api/items/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
      const index = this.items.findIndex(item => item._id === id);
      if (index >= 0) this.items[index] = { ...this.items[index], ...updated };
      if (toast) this.showToast('Guardado');
      this.refreshWorldClocks();
      return updated;
    } catch (err) {
      this.showToast(err.message, true);
      throw err;
    }
  },

  async updateCrew(id, patch) {
    try {
      const updated = await this.api(`/api/crew/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
      const index = this.crew.findIndex(member => member._id === id);
      if (index >= 0) this.crew[index] = updated;
      this.renderCrewDatalist();
      this.showToast('Equipo actualizado');
    } catch (err) { this.showToast(err.message, true); }
  },

  async deleteItem(id) {
    const item = this.findItem(id);
    if (!item || !confirm(`¿Eliminar “${item.name}”?`)) return;
    try {
      await this.api(`/api/items/${id}`, { method: 'DELETE' });
      this.items = this.items.filter(entry => entry._id !== id);
      this.showToast('Elemento eliminado');
      this.renderCurrentView();
    } catch (err) { this.showToast(err.message, true); }
  },

  async deleteCrew(id) {
    const member = this.crew.find(entry => entry._id === id);
    if (!member || !confirm(`¿Eliminar a “${member.name}”?`)) return;
    try {
      await this.api(`/api/crew/${id}`, { method: 'DELETE' });
      this.crew = this.crew.filter(entry => entry._id !== id);
      this.renderCrewDatalist();
      this.showToast('Miembro eliminado');
      this.renderCrew();
    } catch (err) { this.showToast(err.message, true); }
  },

  async seedData() {
    if (!confirm('El seed borra todos los datos actuales y restaura los datos iniciales de GY_GUAYOTA. ¿Continuar?')) return;
    try {
      await this.api('/api/seed', { method: 'POST' });
      await this.reloadAll();
      this.renderSidebar();
      this.renderCrewDatalist();
      const preferred = this.boards.find(b => b.name === 'GY_POST') || this.boards[0];
      if (preferred) await this.selectBoard(preferred);
      this.showToast('Datos iniciales restaurados');
    } catch (err) { this.showToast(err.message, true); }
  },

  refreshWorldClocks() {
    document.querySelectorAll('.world-clock').forEach(cell => {
      const item = this.findItem(cell.dataset.itemId);
      const timezone = this.timezoneForItem(item);
      const timeEl = cell.querySelector('.clock-time');
      const zoneEl = cell.querySelector('.clock-zone');
      if (!timezone) {
        timeEl.textContent = '—';
        zoneEl.textContent = '';
        return;
      }
      try {
        timeEl.textContent = new Intl.DateTimeFormat('es-ES', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
        zoneEl.textContent = timezone;
      } catch {
        timeEl.textContent = '—';
        zoneEl.textContent = timezone;
      }
    });
  },

  timezoneForItem(item) {
    if (!item) return '';
    const person = String(item.person || '').trim().toLowerCase();
    if (person) {
      const member = this.crew.find(entry => String(entry.name || '').trim().toLowerCase() === person);
      if (member?.timezone) return member.timezone;
    }
    return item.extraFields?.timezone || '';
  },

  findItem(id) {
    return this.items.find(item => item._id === id);
  },

  showConnectionError(err) {
    const content = document.getElementById('content');
    content.innerHTML = `
      <div class="connection-error">
        <span>!</span>
        <div><h2>No se puede acceder a la base de datos</h2><p>${this.escapeHtml(err.message || 'Error de conexión')}</p><p>Comprueba la variable MONGODB_URI de Render y las credenciales de MongoDB Atlas.</p></div>
      </div>`;
  },

  showToast(message, isError = false) {
    const root = document.getElementById('toast-root');
    const toast = document.createElement('div');
    toast.className = `toast ${isError ? 'error' : ''}`;
    toast.textContent = message;
    root.appendChild(toast);
    setTimeout(() => toast.remove(), 2300);
  },

  statusClass(status) {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'done') return 'done';
    if (normalized.includes('working')) return 'working';
    if (normalized === 'stuck') return 'stuck';
    return 'empty';
  },

  initials(name) {
    const clean = String(name || '').trim();
    if (!clean || clean === '.') return '';
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
    return this.isoDate(this.utcDay(value));
  },

  escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  },

  escapeAttr(value) {
    return this.escapeHtml(value).replace(/`/g, '&#096;');
  }
};

document.addEventListener('DOMContentLoaded', () => app.init());
