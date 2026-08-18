// Global app state
const app = {
  currentBoard: null,
  boards: [],
  items: [],
  crew: [],
  currentView: 'board',
  filters: {},

  init: async function() {
    await this.loadBoards();
    await this.loadItems();
    await this.loadCrew();
    this.renderSidebar();
    this.attachEventListeners();
  },

  loadBoards: async function() {
    try {
      const response = await fetch('/api/boards');
      this.boards = await response.json();
    } catch (err) {
      console.error('Error loading boards:', err);
    }
  },

  loadItems: async function() {
    try {
      const response = await fetch('/api/items');
      this.items = await response.json();
    } catch (err) {
      console.error('Error loading items:', err);
    }
  },

  loadCrew: async function() {
    try {
      const response = await fetch('/api/crew');
      this.crew = await response.json();
    } catch (err) {
      console.error('Error loading crew:', err);
    }
  },

  renderSidebar: function() {
    const nav = document.getElementById('sidebar-nav');
    nav.innerHTML = '';

    this.boards.forEach(board => {
      const link = document.createElement('a');
      link.href = '#';
      link.className = 'sidebar-nav-item' + (this.currentBoard?._id === board._id ? ' active' : '');
      link.onclick = (e) => {
        e.preventDefault();
        this.selectBoard(board);
      };
      link.innerHTML = `<span class="sidebar-nav-item-icon">${board.icon}</span><span>${board.name}</span>`;
      nav.appendChild(link);
    });
  },

  selectBoard: function(board) {
    this.currentBoard = board;
    this.renderSidebar();
    this.renderContent();
  },

  renderContent: function() {
    const content = document.getElementById('content');
    const title = document.getElementById('board-title');

    if (!this.currentBoard) {
      content.innerHTML = '<div class="loading">Selecciona un tablero</div>';
      return;
    }

    title.textContent = this.currentBoard.name;

    switch (this.currentView) {
      case 'board':
        this.renderBoardView();
        break;
      case 'gantt':
        this.renderGanttView();
        break;
      case 'crew':
        this.renderCrewView();
        break;
    }
  },

  renderBoardView: function() {
    const content = document.getElementById('content');
    const boardItems = this.items.filter(i => i.board._id === this.currentBoard._id || i.board === this.currentBoard._id);

    if (!boardItems.length) {
      content.innerHTML = '<div class="loading">No hay elementos en este tablero</div>';
      return;
    }

    const groupedItems = {};
    boardItems.forEach(item => {
      if (!groupedItems[item.group]) groupedItems[item.group] = [];
      groupedItems[item.group].push(item);
    });

    let html = '<div class="board-view">';

    Object.entries(groupedItems).forEach(([group, items]) => {
      const color = items[0]?.groupColor || '#579bfc';
      html += `
        <div class="group">
          <div class="group-header" style="border-left-color: ${color}">
            <span class="group-header-title">${group}</span>
            <span style="color: #999; font-size: 12px;">${items.length}</span>
          </div>
          <div class="group-items">
            ${items.map(item => `
              <div class="item">
                <div class="item-name">${item.name}</div>
                <div class="item-person">${item.person || '—'}</div>
                <div class="item-status" style="background-color: ${item.statusColor}; color: #fff;">${item.status || 'No asignado'}</div>
                <div class="item-dates">
                  ${item.startDate ? new Date(item.startDate).toLocaleDateString('es-ES') : '—'}
                  ${item.endDate ? ' → ' + new Date(item.endDate).toLocaleDateString('es-ES') : ''}
                </div>
                <div class="item-actions">
                  <button class="item-button" onclick="app.editItem('${item._id}')">✏️</button>
                  <button class="item-button" onclick="app.deleteItem('${item._id}')">🗑️</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    });

    html += '</div>';
    content.innerHTML = html;
  },

  renderGanttView: function() {
    const content = document.getElementById('content');
    const boardItems = this.items.filter(i => i.board._id === this.currentBoard._id || i.board === this.currentBoard._id);
    const itemsWithDates = boardItems.filter(i => i.startDate && i.endDate);

    if (!itemsWithDates.length) {
      content.innerHTML = '<div class="loading">No hay elementos con fechas en este tablero</div>';
      return;
    }

    // Calculate date range
    const dates = itemsWithDates.flatMap(i => [new Date(i.startDate), new Date(i.endDate)]);
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));
    const dayRange = Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24)) + 1;

    let html = '<div class="gantt-view">';

    itemsWithDates.forEach(item => {
      const start = new Date(item.startDate);
      const end = new Date(item.endDate);
      const offsetDays = Math.ceil((start - minDate) / (1000 * 60 * 60 * 24));
      const durationDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
      const offsetPercent = (offsetDays / dayRange) * 100;
      const widthPercent = (durationDays / dayRange) * 100;

      html += `
        <div class="gantt-row">
          <div class="gantt-label">${item.name}</div>
          <div class="gantt-chart">
            <div class="gantt-bar" style="left: ${offsetPercent}%; width: ${widthPercent}%; background-color: ${item.groupColor || '#579bfc'};">
              ${item.formula ? item.formula + 'w' : ''}
            </div>
          </div>
        </div>
      `;
    });

    html += '</div>';
    content.innerHTML = html;
  },

  renderCrewView: function() {
    const content = document.getElementById('content');

    if (!this.crew.length) {
      content.innerHTML = '<div class="loading">No hay miembros del equipo</div>';
      return;
    }

    let html = `
      <table class="crew-table">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Rol</th>
            <th>Email</th>
            <th>Teléfono</th>
            <th>Zona horaria</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${this.crew.map(member => `
            <tr>
              <td>${member.name}</td>
              <td>${member.role || '—'}</td>
              <td>${member.email || '—'}</td>
              <td>${member.prefix} ${member.phone || '—'}</td>
              <td>${member.timezone || '—'}</td>
              <td>
                <button class="item-button" onclick="app.editCrew('${member._id}')">✏️</button>
                <button class="item-button" onclick="app.deleteCrew('${member._id}')">🗑️</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    content.innerHTML = html;
  },

  attachEventListeners: function() {
    // View tabs
    document.querySelectorAll('.view-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.currentView = tab.dataset.view;
        this.renderContent();
      });
    });
  },

  editItem: function(itemId) {
    alert('Editar item: ' + itemId);
  },

  deleteItem: function(itemId) {
    if (confirm('¿Estás seguro de que quieres eliminar este elemento?')) {
      fetch(`/api/items/${itemId}`, { method: 'DELETE' })
        .then(() => {
          this.loadItems();
          this.renderContent();
        });
    }
  },

  editCrew: function(crewId) {
    alert('Editar crew: ' + crewId);
  },

  deleteCrew: function(crewId) {
    if (confirm('¿Estás seguro de que quieres eliminar este miembro?')) {
      fetch(`/api/crew/${crewId}`, { method: 'DELETE' })
        .then(() => {
          this.loadCrew();
          this.renderCrewView();
        });
    }
  }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => app.init());
