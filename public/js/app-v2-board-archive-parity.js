(() => {
  const baseOpenWorkspaceMenu = app.openWorkspaceMenu.bind(app);

  app.openWorkspaceMenu = function openWorkspaceMenuWithBoardArchive(anchor) {
    baseOpenWorkspaceMenu(anchor);
    const menu = document.querySelector('.workspace-menu');
    if (!menu || menu.querySelector('[data-open-board-archive]')) return;
    const separator = document.createElement('div');
    separator.className = 'menu-separator';
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.openBoardArchive = 'true';
    button.innerHTML = '<span>🗃 Tableros archivados</span><small>Ver y restaurar</small>';
    button.addEventListener('click', () => {
      menu.remove();
      this.openArchivedBoardsPanel();
    });
    menu.append(separator, button);
  };

  app.openArchivedBoardsPanel = async function openArchivedBoardsPanel() {
    this.openModal(`<div class="modal-card archived-boards-modal">
      <div class="modal-header"><div><h2>Tableros archivados</h2><p>Los tableros archivados conservan sus elementos y pueden restaurarse.</p></div><button type="button" class="modal-close" data-close-modal>×</button></div>
      <div class="archived-boards-body"><div class="loading">Cargando…</div></div>
    </div>`);
    const host = document.querySelector('.archived-boards-body');
    if (!host) return;
    try {
      const all = await this.api('/api/boards?includeArchived=true');
      const archived = all
        .filter(board => board.archived && !board.internal)
        .sort((a, b) => String(this.workspaceName(a)).localeCompare(String(this.workspaceName(b)), 'es', { sensitivity: 'base' }) || String(a.name).localeCompare(String(b.name), 'es', { sensitivity: 'base' }));
      host.innerHTML = archived.length ? `<div class="archived-boards-list">${archived.map(board => `
        <article class="archived-board-row">
          <span class="archived-board-icon">${this.escapeHtml(board.icon || '📋')}</span>
          <div><strong>${this.escapeHtml(board.name)}</strong><small>${this.escapeHtml(this.workspaceName(board))}</small></div>
          <button type="button" class="button" data-restore-board="${this.escapeAttr(board._id)}">Restaurar</button>
        </article>`).join('')}</div>` : '<div class="archived-boards-empty">No hay tableros archivados.</div>';
      host.querySelectorAll('[data-restore-board]').forEach(button => button.addEventListener('click', async () => {
        const board = archived.find(entry => String(entry._id) === String(button.dataset.restoreBoard));
        if (!board) return;
        button.disabled = true;
        try {
          const restored = await this.api(`/api/boards/${board._id}`, { method: 'PATCH', body: JSON.stringify({ archived: false }) });
          this.boards = await this.api('/api/boards');
          this.renderSidebar();
          this.closeModal();
          const local = this.boards.find(entry => String(entry._id) === String(restored._id)) || restored;
          await this.selectBoard(local);
          this.showToast('Tablero restaurado');
        } catch (err) {
          button.disabled = false;
          this.showToast(err.message, true);
        }
      }));
    } catch (err) {
      host.innerHTML = `<div class="archived-boards-empty error">${this.escapeHtml(err.message)}</div>`;
    }
  };
})();
