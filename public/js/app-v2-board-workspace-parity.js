(() => {
  const baseOpenBoardMenu = app.openBoardMenu.bind(app);

  app.applyBoardMutationResult = function applyBoardMutationResult(sourceBoardId, updated, options = {}) {
    if (!updated?._id) return false;
    const sourceId = String(sourceBoardId || updated._id);
    const index = this.boards.findIndex(entry => String(entry._id) === String(updated._id));
    if (index >= 0) this.boards[index] = updated;
    else this.boards.push(updated);

    const stillActive = String(this.currentBoardId?.() || '') === sourceId;
    if (stillActive) {
      this.currentBoard = updated;
      if (options.workspace) this.currentWorkspace = options.workspace;
      if (options.renderWorkspaceSwitcher) this.renderWorkspaceSwitcher?.();
      if (options.renderSidebar) this.renderSidebar?.();
      if (options.renderHeader) this.renderHeader?.();
    } else if (options.renderSidebar) {
      // Sidebar can safely reflect the updated cached board without changing the active board/workspace.
      this.renderSidebar?.();
    }
    return stillActive;
  };

  app.beginInlineBoardRename = function beginInlineBoardRenameNavigationSafe() {
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
        this.applyBoardMutationResult(board._id, updated, {
          renderSidebar: true,
          renderHeader: true
        });
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

  app.beginInlineBoardDescription = function beginInlineBoardDescriptionNavigationSafe() {
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
        this.applyBoardMutationResult(board._id, updated, { renderHeader: true });
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

  app.openBoardWorkspacePicker = function openBoardWorkspacePickerNavigationSafe() {
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
        this.applyBoardMutationResult(board._id, updated, {
          workspace,
          renderWorkspaceSwitcher: true,
          renderSidebar: true,
          renderHeader: true
        });
        this.closeModal();
        this.showToast(`Tablero movido a ${workspace.name}`);
      } catch (error) {
        if (submit) submit.disabled = false;
        this.showToast(error.message, true);
      }
    });
  };
})();
