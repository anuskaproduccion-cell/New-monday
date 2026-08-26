(() => {
  const baseOpenBoardMenu = app.openBoardMenu.bind(app);

  app.openBoardMenu = function openBoardMenuWithWorkspaceMove(anchor) {
    baseOpenBoardMenu(anchor);
    const menu = document.querySelector('.board-menu');
    if (!menu || menu.querySelector('[data-board-action="move-workspace"]')) return;
    const duplicate = menu.querySelector('[data-board-action="duplicate"]');
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.boardAction = 'move-workspace';
    button.innerHTML = '<span>⇄ Mover a workspace</span>';
    button.addEventListener('click', () => {
      menu.remove();
      this.openBoardWorkspacePicker();
    });
    duplicate?.before(button);
  };

  app.openBoardWorkspacePicker = function openBoardWorkspacePicker() {
    const board = this.currentBoard;
    if (!board) return;
    const candidates = (this.workspaces || []).filter(workspace => workspace?._id && !workspace.archived);
    if (!candidates.length) return this.showToast('No hay otros workspaces persistentes disponibles', true);
    const currentId = String(board.workspaceRef?._id || board.workspaceRef || this.currentWorkspace?._id || '');

    this.openModal(`<form id="board-workspace-move" class="modal-card board-workspace-move-modal">
      <div class="modal-header"><div><h2>Mover tablero</h2><p>${this.escapeHtml(board.name)}</p></div><button type="button" class="modal-close" data-close-modal>×</button></div>
      <label>Workspace<select name="workspaceId" required>${candidates.map(workspace => `<option value="${this.escapeAttr(workspace._id)}" ${String(workspace._id) === currentId ? 'selected' : ''}>${this.escapeHtml(workspace.name)}</option>`).join('')}</select></label>
      <p class="board-workspace-move-note">Mover el tablero cambia solo su organización dentro de New Monday. Sus grupos, elementos, subitems, vistas y datos se conservan. Si estaba dentro de una carpeta, volverá a la organización automática del nuevo workspace.</p>
      <div class="modal-actions"><button type="button" class="button" data-close-modal>Cancelar</button><button class="button primary">Mover tablero</button></div>
    </form>`);
    const form = document.getElementById('board-workspace-move');
    form?.addEventListener('submit', async event => {
      event.preventDefault();
      const data = new FormData(form);
      const workspace = candidates.find(entry => String(entry._id) === String(data.get('workspaceId')));
      if (!workspace) return;
      if (String(workspace._id) === currentId) {
        this.closeModal();
        return;
      }
      const submit = form.querySelector('button[type="submit"],button.primary');
      if (submit) submit.disabled = true;
      try {
        const updated = await this.api(`/api/boards/${encodeURIComponent(board._id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ workspaceRef: workspace._id, workspace: workspace.name, folderId: '' })
        });
        const index = this.boards.findIndex(entry => String(entry._id) === String(updated._id));
        if (index >= 0) this.boards[index] = updated;
        this.currentBoard = updated;
        this.currentWorkspace = workspace;
        this.closeModal();
        this.renderWorkspaceSwitcher();
        this.renderSidebar();
        this.renderHeader();
        this.showToast(`Tablero movido a ${workspace.name}`);
      } catch (error) {
        if (submit) submit.disabled = false;
        this.showToast(error.message, true);
      }
    });
  };
})();
