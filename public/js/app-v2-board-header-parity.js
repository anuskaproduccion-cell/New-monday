(() => {
  const FAVORITES_KEY = 'new-monday:favorite-boards';
  const originalInit = app.init.bind(app);
  const originalSelectBoard = app.selectBoard.bind(app);
  const originalRenderHeader = app.renderHeader.bind(app);
  const originalRenderSidebar = app.renderSidebar.bind(app);

  app.favoriteBoardIds = function favoriteBoardIds() {
    try {
      const parsed = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
      return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
    } catch {
      return new Set();
    }
  };

  app.saveFavoriteBoardIds = function saveFavoriteBoardIds(ids) {
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...ids])); } catch { /* local preferences only */ }
  };

  app.isBoardFavorite = function isBoardFavorite(board = this.currentBoard) {
    return Boolean(board && this.favoriteBoardIds().has(String(board._id)));
  };

  app.toggleBoardFavorite = function toggleBoardFavorite(board = this.currentBoard) {
    if (!board) return;
    const ids = this.favoriteBoardIds();
    const id = String(board._id);
    if (ids.has(id)) ids.delete(id);
    else ids.add(id);
    this.saveFavoriteBoardIds(ids);
    this.renderHeader();
    this.renderSidebar();
    this.showToast(ids.has(id) ? 'Añadido a favoritos' : 'Quitado de favoritos');
  };

  app.boardDeepLink = function boardDeepLink(board = this.currentBoard) {
    const url = new URL(window.location.href);
    if (board?._id) url.searchParams.set('board', String(board._id));
    else url.searchParams.delete('board');
    return url.toString();
  };

  app.syncBoardDeepLink = function syncBoardDeepLink(board = this.currentBoard) {
    if (!board?._id) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('board') === String(board._id)) return;
    url.searchParams.set('board', String(board._id));
    history.replaceState({ boardId: String(board._id) }, '', url);
  };

  app.init = async function initWithBoardDeepLink() {
    await originalInit();
    const requested = new URL(window.location.href).searchParams.get('board');
    const board = requested ? this.boards.find(entry => String(entry._id) === String(requested)) : null;
    if (board && String(board._id) !== String(this.currentBoard?._id)) await this.selectBoard(board);
  };

  app.selectBoard = async function selectBoardWithDeepLink(board) {
    await originalSelectBoard(board);
    this.syncBoardDeepLink(board);
  };

  app.renderHeader = function renderMondayBoardHeader() {
    originalRenderHeader();
    if (!this.currentBoard) return;

    const title = document.getElementById('board-title');
    const star = document.querySelector('.star-button');
    const actions = document.querySelector('.header-actions');
    if (title) {
      title.tabIndex = 0;
      title.setAttribute('role', 'button');
      title.title = 'Haz clic para cambiar el nombre del tablero';
      title.onclick = () => this.beginInlineBoardRename();
      title.onkeydown = event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          this.beginInlineBoardRename();
        }
      };
      document.title = `${this.currentBoard.name} · New Monday`;
    }
    if (star) {
      const favorite = this.isBoardFavorite();
      star.textContent = favorite ? '★' : '☆';
      star.classList.toggle('is-favorite', favorite);
      star.title = favorite ? 'Quitar de favoritos' : 'Añadir a favoritos';
      star.onclick = () => this.toggleBoardFavorite();
    }

    if (actions && !actions.querySelector('[data-board-menu-trigger]')) {
      const menu = document.createElement('button');
      menu.type = 'button';
      menu.className = 'board-menu-trigger';
      menu.dataset.boardMenuTrigger = 'true';
      menu.textContent = '⋯';
      menu.setAttribute('aria-label', 'Menú del tablero');
      menu.title = 'Menú del tablero';
      menu.addEventListener('click', event => this.openBoardMenu(event.currentTarget));
      actions.appendChild(menu);
    }
  };

  app.beginInlineBoardRename = function beginInlineBoardRename() {
    const board = this.currentBoard;
    const title = document.getElementById('board-title');
    if (!board || !title || document.querySelector('.board-title-inline-input')) return;

    const input = document.createElement('input');
    input.className = 'board-title-inline-input';
    input.value = board.name || '';
    input.setAttribute('aria-label', 'Nombre del tablero');
    title.replaceWith(input);

    let settled = false;
    const finish = async save => {
      if (settled) return;
      settled = true;
      const name = input.value.trim();
      if (!save || !name || name === board.name) {
        this.renderHeader();
        return;
      }
      try {
        const updated = await this.api(`/api/boards/${board._id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name })
        });
        const index = this.boards.findIndex(entry => String(entry._id) === String(updated._id));
        if (index >= 0) this.boards[index] = updated;
        this.currentBoard = updated;
        this.renderHeader();
        this.renderSidebar();
        this.showToast('Tablero renombrado');
      } catch (err) {
        settled = false;
        this.renderHeader();
        this.showToast(err.message, true);
      }
    };

    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        input.blur();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        settled = true;
        this.renderHeader();
      }
    });
    input.addEventListener('blur', () => finish(true), { once: true });
    input.focus();
    input.select();
  };

  app.renderSidebar = function renderSidebarWithFavorites() {
    originalRenderSidebar();
    const sidebar = document.querySelector('.sidebar');
    const regularLabel = sidebar?.querySelector('.sidebar-label');
    if (!sidebar || !regularLabel) return;

    let section = sidebar.querySelector('.sidebar-favorites');
    if (!section) {
      section = document.createElement('section');
      section.className = 'sidebar-favorites';
      regularLabel.before(section);
    }

    const favoriteIds = this.favoriteBoardIds();
    const favorites = this.boards
      .filter(board => !board.archived && !board.internal && favoriteIds.has(String(board._id)))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es', { sensitivity: 'base' }));

    if (!favorites.length) {
      section.innerHTML = '';
      section.hidden = true;
      return;
    }

    section.hidden = false;
    section.innerHTML = `<div class="sidebar-label sidebar-favorites-label">Favoritos</div><div class="sidebar-favorites-list">${favorites.map(board => `
      <button type="button" class="sidebar-favorite-item ${String(this.currentBoard?._id) === String(board._id) ? 'active' : ''}" data-favorite-board="${this.escapeAttr(board._id)}" title="${this.escapeAttr(this.workspaceName(board))} · ${this.escapeAttr(board.name)}">
        <span>${this.escapeHtml(board.icon || '📋')}</span><span>${this.escapeHtml(board.name)}</span><span class="favorite-star">★</span>
      </button>`).join('')}</div>`;
    section.querySelectorAll('[data-favorite-board]').forEach(button => button.addEventListener('click', () => {
      const board = this.boards.find(entry => String(entry._id) === String(button.dataset.favoriteBoard));
      if (board) this.selectBoard(board);
    }));
  };

  app.openBoardMenu = function openBoardMenu(anchor) {
    document.querySelectorAll('.floating-menu,.board-menu').forEach(node => node.remove());
    const board = this.currentBoard;
    if (!board) return;
    const favorite = this.isBoardFavorite(board);
    const menu = document.createElement('div');
    menu.className = 'floating-menu board-menu';
    menu.innerHTML = `
      <div class="menu-title">${this.escapeHtml(board.name)}</div>
      <button type="button" data-board-action="rename"><span>✎ Cambiar nombre</span></button>
      <button type="button" data-board-action="favorite"><span>${favorite ? '★ Quitar de favoritos' : '☆ Añadir a favoritos'}</span></button>
      <button type="button" data-board-action="copy-link"><span>🔗 Copiar enlace del tablero</span></button>
      <button type="button" data-board-action="info"><span>ⓘ Información del tablero</span></button>
      <div class="menu-separator"></div>
      <button type="button" data-board-action="activity"><span>◷ Registro de actividad</span></button>
      <button type="button" data-board-action="archive" class="danger"><span>Archivar tablero</span></button>
    `;

    menu.querySelector('[data-board-action="rename"]')?.addEventListener('click', () => {
      menu.remove();
      this.beginInlineBoardRename();
    });
    menu.querySelector('[data-board-action="favorite"]')?.addEventListener('click', () => {
      menu.remove();
      this.toggleBoardFavorite(board);
    });
    menu.querySelector('[data-board-action="copy-link"]')?.addEventListener('click', async () => {
      const link = this.boardDeepLink(board);
      try {
        await navigator.clipboard.writeText(link);
        this.showToast('Enlace del tablero copiado');
      } catch {
        window.prompt('Copia el enlace del tablero:', link);
      }
      menu.remove();
    });
    menu.querySelector('[data-board-action="info"]')?.addEventListener('click', () => {
      menu.remove();
      this.openBoardInfoPanel(board);
    });
    menu.querySelector('[data-board-action="activity"]')?.addEventListener('click', () => {
      menu.remove();
      this.currentView = 'activity';
      this.renderViewTabs();
      this.renderCurrentView();
    });
    menu.querySelector('[data-board-action="archive"]')?.addEventListener('click', () => this.archiveCurrentBoard(menu));
    this.positionMenu(menu, anchor);
  };

  app.openBoardInfoPanel = function openBoardInfoPanel(board = this.currentBoard) {
    if (!board) return;
    const source = board.source === 'monday-import' ? 'Importado desde Monday (origen de solo lectura)' : 'Creado en New Monday';
    this.openModal(`<div class="modal-card board-info-modal">
      <div class="modal-header"><div><h2>${this.escapeHtml(board.name)}</h2><p>Información del tablero</p></div><button type="button" class="modal-close" data-close-modal>×</button></div>
      <dl class="board-info-grid">
        <div><dt>Workspace</dt><dd>${this.escapeHtml(this.workspaceName(board))}</dd></div>
        <div><dt>Origen</dt><dd>${this.escapeHtml(source)}</dd></div>
        <div><dt>Grupos</dt><dd>${this.effectiveGroups().length}</dd></div>
        <div><dt>Columnas</dt><dd>${this.effectiveColumns().length}</dd></div>
        <div><dt>Elementos</dt><dd>${this.boardItems().length}</dd></div>
        ${board.mondayId ? `<div><dt>ID de origen</dt><dd>${this.escapeHtml(board.mondayId)}</dd></div>` : ''}
      </dl>
      <div class="modal-actions"><button type="button" class="button primary" data-close-modal>Cerrar</button></div>
    </div>`);
  };

  app.archiveCurrentBoard = async function archiveCurrentBoard(menu) {
    const board = this.currentBoard;
    if (!board) return;
    if (!window.confirm(`¿Archivar el tablero “${board.name}”? Los elementos se conservarán.`)) return;
    try {
      await this.api(`/api/boards/${board._id}`, { method: 'DELETE' });
      menu?.remove();
      const ids = this.favoriteBoardIds();
      ids.delete(String(board._id));
      this.saveFavoriteBoardIds(ids);
      this.boards = this.boards.filter(entry => String(entry._id) !== String(board._id));
      const next = this.visibleBoards()[0] || this.boards.find(entry => !entry.internal && !entry.archived) || null;
      if (next) await this.selectBoard(next);
      else {
        this.currentBoard = null;
        this.renderSidebar();
        this.renderEmptyState('No quedan tableros activos en este workspace.');
      }
      this.showToast('Tablero archivado');
    } catch (err) {
      this.showToast(err.message, true);
    }
  };
})();
