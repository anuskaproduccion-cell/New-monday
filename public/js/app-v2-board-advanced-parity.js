(() => {
  const baseRenderHeader = app.renderHeader.bind(app);

  app.renderHeader = function renderHeaderWithDescription() {
    baseRenderHeader();
    const board = this.currentBoard;
    if (!board) return;

    const subtitle = document.getElementById('board-subtitle');
    if (subtitle) {
      subtitle.classList.add('board-description-line');
      subtitle.tabIndex = 0;
      subtitle.setAttribute('role', 'button');
      subtitle.textContent = String(board.description || '').trim() || '＋ Agregar descripción';
      subtitle.classList.toggle('is-empty', !String(board.description || '').trim());
      subtitle.title = 'Haz clic para editar la descripción del tablero';
      subtitle.onclick = () => this.beginInlineBoardDescription();
      subtitle.onkeydown = event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          this.beginInlineBoardDescription();
        }
      };

      let meta = document.querySelector('.board-header-meta-line');
      if (!meta) {
        meta = document.createElement('p');
        meta.className = 'board-header-meta-line';
        subtitle.after(meta);
      }
      meta.textContent = `${this.workspaceName(board)} · ${this.effectiveColumns().length} columnas · ${this.effectiveGroups().length} grupos`;
    }
  };

  app.beginInlineBoardDescription = function beginInlineBoardDescription() {
    const board = this.currentBoard;
    const subtitle = document.getElementById('board-subtitle');
    if (!board || !subtitle || document.querySelector('.board-description-inline-input')) return;

    const input = document.createElement('textarea');
    input.className = 'board-description-inline-input';
    input.rows = 2;
    input.maxLength = 1200;
    input.value = board.description || '';
    input.placeholder = 'Añade una descripción del tablero…';
    input.setAttribute('aria-label', 'Descripción del tablero');
    subtitle.replaceWith(input);

    let settled = false;
    const finish = async save => {
      if (settled) return;
      settled = true;
      const description = input.value.trim();
      if (!save || description === String(board.description || '').trim()) {
        this.renderHeader();
        return;
      }
      try {
        const updated = await this.api(`/api/boards/${board._id}`, {
          method: 'PATCH',
          body: JSON.stringify({ description })
        });
        const index = this.boards.findIndex(entry => String(entry._id) === String(updated._id));
        if (index >= 0) this.boards[index] = updated;
        this.currentBoard = updated;
        this.renderHeader();
        this.showToast('Descripción actualizada');
      } catch (err) {
        settled = false;
        this.renderHeader();
        this.showToast(err.message, true);
      }
    };

    input.addEventListener('keydown', event => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
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

  app.duplicateCurrentBoard = async function duplicateCurrentBoard(menu) {
    const board = this.currentBoard;
    if (!board) return;
    const proposed = `${board.name} (copia)`;
    const name = window.prompt('Nombre del tablero duplicado:', proposed);
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed) return this.showToast('El tablero necesita un nombre', true);

    try {
      menu?.remove();
      this.showToast('Duplicando tablero…');
      const result = await this.api(`/api/boards/${board._id}/duplicate`, {
        method: 'POST',
        body: JSON.stringify({ name: trimmed })
      });
      await this.reloadAll();
      const duplicate = this.boards.find(entry => String(entry._id) === String(result.board?._id)) || result.board;
      if (duplicate) await this.selectBoard(duplicate);
      this.showToast(`Tablero duplicado · ${Number(result.itemsDuplicated || 0)} elementos · ${Number(result.subitemsDuplicated || 0)} subitems`);
    } catch (err) {
      this.showToast(err.message, true);
    }
  };

  app.openBoardMenu = function openAdvancedBoardMenu(anchor) {
    document.querySelectorAll('.floating-menu,.board-menu').forEach(node => node.remove());
    const board = this.currentBoard;
    if (!board) return;
    const favorite = this.isBoardFavorite(board);
    const menu = document.createElement('div');
    menu.className = 'floating-menu board-menu';
    menu.innerHTML = `
      <div class="menu-title">${this.escapeHtml(board.name)}</div>
      <button type="button" data-board-action="rename"><span>✎ Cambiar nombre</span></button>
      <button type="button" data-board-action="description"><span>☰ Editar descripción</span></button>
      <button type="button" data-board-action="favorite"><span>${favorite ? '★ Quitar de favoritos' : '☆ Añadir a favoritos'}</span></button>
      <button type="button" data-board-action="copy-link"><span>🔗 Copiar enlace del tablero</span></button>
      <button type="button" data-board-action="info"><span>ⓘ Información del tablero</span></button>
      <div class="menu-separator"></div>
      <button type="button" data-board-action="duplicate"><span>⧉ Duplicar tablero</span></button>
      <button type="button" data-board-action="activity"><span>◷ Registro de actividad</span></button>
      <div class="menu-separator"></div>
      <button type="button" data-board-action="archive" class="danger"><span>Archivar tablero</span></button>
    `;

    menu.querySelector('[data-board-action="rename"]')?.addEventListener('click', () => {
      menu.remove();
      this.beginInlineBoardRename();
    });
    menu.querySelector('[data-board-action="description"]')?.addEventListener('click', () => {
      menu.remove();
      this.beginInlineBoardDescription();
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
    menu.querySelector('[data-board-action="duplicate"]')?.addEventListener('click', () => this.duplicateCurrentBoard(menu));
    menu.querySelector('[data-board-action="activity"]')?.addEventListener('click', () => {
      menu.remove();
      this.currentView = 'activity';
      this.renderViewTabs();
      this.renderCurrentView();
    });
    menu.querySelector('[data-board-action="archive"]')?.addEventListener('click', () => this.archiveCurrentBoard(menu));
    this.positionMenu(menu, anchor);
  };

  app.openBoardInfoPanel = function openAdvancedBoardInfoPanel(board = this.currentBoard) {
    if (!board) return;
    const source = board.source === 'monday-import' ? 'Importado desde Monday (origen de solo lectura)' : 'Creado en New Monday';
    this.openModal(`<div class="modal-card board-info-modal">
      <div class="modal-header"><div><h2>${this.escapeHtml(board.name)}</h2><p>Información del tablero</p></div><button type="button" class="modal-close" data-close-modal>×</button></div>
      ${board.description ? `<p class="board-info-description">${this.escapeHtml(board.description)}</p>` : '<p class="board-info-description is-empty">Sin descripción.</p>'}
      <dl class="board-info-grid">
        <div><dt>Workspace</dt><dd>${this.escapeHtml(this.workspaceName(board))}</dd></div>
        <div><dt>Origen</dt><dd>${this.escapeHtml(source)}</dd></div>
        <div><dt>Grupos</dt><dd>${this.effectiveGroups().length}</dd></div>
        <div><dt>Columnas</dt><dd>${this.effectiveColumns().length}</dd></div>
        <div><dt>Elementos</dt><dd>${this.boardItems().length}</dd></div>
        ${board.mondayId ? `<div><dt>ID de origen</dt><dd>${this.escapeHtml(board.mondayId)}</dd></div>` : ''}
      </dl>
      <div class="modal-actions"><button type="button" class="button" data-board-edit-description>Editar descripción</button><button type="button" class="button primary" data-close-modal>Cerrar</button></div>
    </div>`);
    document.querySelector('[data-board-edit-description]')?.addEventListener('click', () => {
      this.closeModal();
      this.beginInlineBoardDescription();
    });
  };
})();
