(() => {
  const COLLAPSE_KEY = 'new-monday:sidebar-phase-collapse';
  const baseRenderSidebar = app.renderSidebar.bind(app);

  app.sidebarPhase = function sidebarPhase(board) {
    const name = String(board?.name || '').toUpperCase();
    const buckets = [
      { id: 'preprod', label: 'Pre / Producción', patterns: [/_PRE\b/, /PREPROD/, /PRE&PROD/, /PREPRODU/, /PRODUCCI/] },
      { id: 'shooting', label: 'Rodaje', patterns: [/_SHOOT/, /SHOOTING/, /RODAJE/, /FILMACI/] },
      { id: 'editing', label: 'Edición', patterns: [/_EDIT/, /EDITING/, /MONTAJE/, /ASSIST/] },
      { id: 'post', label: 'Postproducción', patterns: [/_POST\b/, /POSTPROD/, /POSTPRODU/] }
    ];
    return buckets.find(bucket => bucket.patterns.some(pattern => pattern.test(name))) || { id: 'other', label: 'Otros tableros' };
  };

  app.sidebarCollapsedPhases = function sidebarCollapsedPhases() {
    try {
      const parsed = JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '[]');
      return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
    } catch {
      return new Set();
    }
  };

  app.setSidebarPhaseCollapsed = function setSidebarPhaseCollapsed(phaseId, collapsed) {
    const set = this.sidebarCollapsedPhases();
    if (collapsed) set.add(String(phaseId));
    else set.delete(String(phaseId));
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...set])); } catch { /* local preference only */ }
  };

  app.workspaceFolders = function workspaceFolders() {
    return (this.currentWorkspace?.folders || [])
      .filter(folder => !folder.archived)
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  };

  app.sidebarBoardButtonHtml = function sidebarBoardButtonHtml(board) {
    const active = String(this.currentBoard?._id || '') === String(board._id);
    return `<button type="button" class="sidebar-nav-item ${active ? 'active' : ''}" data-hierarchy-board="${this.escapeAttr(board._id)}" draggable="true" aria-keyshortcuts="Shift+F10" title="${this.escapeAttr(board.name)} · Shift+F10: mover a carpeta">
      <span class="sidebar-nav-item-icon">${this.escapeHtml(board.icon || '📋')}</span>
      <span class="sidebar-board-name">${this.escapeHtml(board.name)}</span>
      ${board.source === 'monday-import' ? '<span class="source-badge" title="Importado desde Monday en modo solo lectura">RO</span>' : ''}
    </button>`;
  };

  app.sidebarFocusableControls = function sidebarFocusableControls(nav = document.getElementById('sidebar-nav')) {
    if (!nav) return [];
    return [...nav.querySelectorAll('button:not([disabled])')]
      .filter(button => !button.hidden && button.offsetParent !== null);
  };

  app.focusSidebarBoard = function focusSidebarBoard(boardId) {
    const nav = document.getElementById('sidebar-nav');
    const button = [...(nav?.querySelectorAll('[data-hierarchy-board]') || [])]
      .find(entry => String(entry.dataset.hierarchyBoard || '') === String(boardId || ''));
    button?.focus?.({ preventScroll: true });
    button?.scrollIntoView?.({ block: 'nearest' });
  };

  app.openBoardFolderKeyboardMenu = function openBoardFolderKeyboardMenu(anchor, boardId) {
    const board = this.boards.find(entry => String(entry._id) === String(boardId));
    if (!board || !anchor) return;
    document.querySelectorAll('.floating-menu').forEach(node => node.remove());
    const folders = this.workspaceFolders();
    const menu = document.createElement('div');
    menu.className = 'floating-menu sidebar-folder-move-menu';
    menu.innerHTML = `<div class="menu-title">Mover ${this.escapeHtml(board.name)}</div>
      <button type="button" data-move-board-folder="">Organización automática</button>
      ${folders.map(folder => `<button type="button" data-move-board-folder="${this.escapeAttr(folder.id)}">📁 ${this.escapeHtml(folder.title)}</button>`).join('') || '<div class="menu-note">No hay carpetas creadas.</div>'}`;
    menu.querySelectorAll('[data-move-board-folder]').forEach(button => button.addEventListener('click', async () => {
      const folderId = String(button.dataset.moveBoardFolder || '');
      menu.remove();
      await this.moveBoardToWorkspaceFolder(boardId, folderId, { focus: true });
    }));
    this.positionMenu(menu, anchor);
  };

  app.openCreateWorkspaceFolder = function openCreateWorkspaceFolder() {
    const workspace = this.currentWorkspace;
    if (!workspace?._id) return this.showToast('Este workspace legacy aún no admite carpetas persistentes', true);
    this.openModal(`<form id="workspace-folder-create" class="modal-card workspace-folder-modal">
      <div class="modal-header"><div><h2>Nueva carpeta</h2><p>${this.escapeHtml(workspace.name)}</p></div><button type="button" class="modal-close" data-close-modal>×</button></div>
      <label>Nombre<input name="title" required autofocus placeholder="Ej. Postproducción"></label>
      <div class="modal-actions"><button type="button" class="button" data-close-modal>Cancelar</button><button class="button primary">Crear carpeta</button></div>
    </form>`);
    document.getElementById('workspace-folder-create')?.addEventListener('submit', async event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const title = String(data.get('title') || '').trim();
      if (!title) return;
      try {
        const folder = await this.api(`/api/workspaces/${workspace._id}/folders`, {
          method: 'POST',
          body: JSON.stringify({ title })
        });
        workspace.folders = [...(workspace.folders || []), folder];
        this.closeModal();
        this.renderSidebar();
        this.showToast('Carpeta creada');
      } catch (error) { this.showToast(error.message, true); }
    });
  };

  app.openWorkspaceFolderMenu = function openWorkspaceFolderMenu(anchor, folderId) {
    document.querySelectorAll('.floating-menu').forEach(node => node.remove());
    const workspace = this.currentWorkspace;
    const folder = this.workspaceFolders().find(entry => String(entry.id) === String(folderId));
    if (!workspace?._id || !folder) return;
    const menu = document.createElement('div');
    menu.className = 'floating-menu workspace-folder-menu';
    menu.innerHTML = `<div class="menu-title">${this.escapeHtml(folder.title)}</div><button type="button" data-folder-action="rename">✎ Renombrar carpeta</button><button type="button" class="danger" data-folder-action="delete">Eliminar carpeta</button>`;
    menu.querySelector('[data-folder-action="rename"]')?.addEventListener('click', async () => {
      const title = window.prompt('Nombre de la carpeta:', folder.title);
      if (!title?.trim()) return;
      try {
        const updated = await this.api(`/api/workspaces/${workspace._id}/folders/${encodeURIComponent(folder.id)}`, {
          method: 'PATCH', body: JSON.stringify({ title: title.trim() })
        });
        const target = (workspace.folders || []).find(entry => String(entry.id) === String(folder.id));
        if (target) target.title = updated.title;
        menu.remove();
        this.renderSidebar();
      } catch (error) { this.showToast(error.message, true); }
    });
    menu.querySelector('[data-folder-action="delete"]')?.addEventListener('click', async () => {
      if (!confirm(`Eliminar la carpeta “${folder.title}”? Los tableros volverán a la organización automática.`)) return;
      try {
        await this.api(`/api/workspaces/${workspace._id}/folders/${encodeURIComponent(folder.id)}`, { method: 'DELETE' });
        workspace.folders = (workspace.folders || []).map(entry => String(entry.id) === String(folder.id) ? { ...entry, archived: true } : entry);
        this.boards.forEach(board => { if (String(board.folderId || '') === String(folder.id)) board.folderId = ''; });
        menu.remove();
        this.renderSidebar();
        this.showToast('Carpeta eliminada');
      } catch (error) { this.showToast(error.message, true); }
    });
    this.positionMenu(menu, anchor);
  };

  app.moveBoardToWorkspaceFolder = async function moveBoardToWorkspaceFolder(boardId, folderId = '', { focus = false } = {}) {
    const board = this.boards.find(entry => String(entry._id) === String(boardId));
    if (!board) return;
    try {
      const updated = await this.api(`/api/boards/${encodeURIComponent(board._id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ folderId: String(folderId || '') })
      });
      const index = this.boards.findIndex(entry => String(entry._id) === String(updated._id));
      if (index >= 0) this.boards[index] = updated;
      if (String(this.currentBoard?._id || '') === String(updated._id)) this.currentBoard = updated;
      this.renderSidebar();
      if (focus) requestAnimationFrame(() => this.focusSidebarBoard(updated._id));
      const folder = this.workspaceFolders().find(entry => String(entry.id) === String(folderId));
      this.showToast(folder ? `Tablero movido a ${folder.title}` : 'Tablero devuelto a organización automática');
    } catch (error) { this.showToast(error.message, true); }
  };

  app.bindSidebarHierarchyKeyboard = function bindSidebarHierarchyKeyboard(nav) {
    if (!nav || nav.dataset.sidebarKeyboardBound === 'true') return;
    nav.dataset.sidebarKeyboardBound = 'true';
    nav.addEventListener('keydown', event => {
      const target = event.target?.closest?.('button');
      if (!target || !nav.contains(target)) return;

      if (target.matches('[data-hierarchy-board]') && (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) {
        event.preventDefault();
        event.stopPropagation();
        this.openBoardFolderKeyboardMenu(target, target.dataset.hierarchyBoard);
        return;
      }

      const controls = this.sidebarFocusableControls(nav);
      const index = controls.indexOf(target);
      if (index < 0) return;
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        let nextIndex = index;
        if (event.key === 'ArrowDown') nextIndex = Math.min(controls.length - 1, index + 1);
        if (event.key === 'ArrowUp') nextIndex = Math.max(0, index - 1);
        if (event.key === 'Home') nextIndex = 0;
        if (event.key === 'End') nextIndex = controls.length - 1;
        controls[nextIndex]?.focus?.({ preventScroll: true });
        controls[nextIndex]?.scrollIntoView?.({ block: 'nearest' });
        return;
      }

      if (target.matches('[data-sidebar-phase-toggle]')) {
        const expanded = target.getAttribute('aria-expanded') === 'true';
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          if (!expanded) target.click();
          else target.closest('.sidebar-phase')?.querySelector('[data-hierarchy-board]')?.focus?.({ preventScroll: true });
        }
        if (event.key === 'ArrowLeft' && expanded) {
          event.preventDefault();
          target.click();
        }
        return;
      }

      if (target.matches('[data-hierarchy-board]') && event.key === 'ArrowLeft') {
        const header = target.closest('.sidebar-phase')?.querySelector('[data-sidebar-phase-toggle]');
        if (header) {
          event.preventDefault();
          header.focus?.({ preventScroll: true });
        }
      }
    });
  };

  app.renderSidebar = function renderSidebarWithHierarchy() {
    baseRenderSidebar();
    const nav = document.getElementById('sidebar-nav');
    if (!nav) return;
    this.bindSidebarHierarchyKeyboard(nav);
    const boards = this.visibleBoards().filter(board => !board.archived && !board.internal);
    if (!boards.length) {
      nav.innerHTML = '<div class="sidebar-no-boards">No hay tableros visibles</div>';
      return;
    }

    const folders = this.workspaceFolders();
    const folderIds = new Set(folders.map(folder => String(folder.id)));
    const folderSections = folders.map(folder => ({
      folder,
      boards: boards.filter(board => String(board.folderId || '') === String(folder.id))
    }));
    const automaticBoards = boards.filter(board => !folderIds.has(String(board.folderId || '')));

    const order = ['preprod', 'shooting', 'editing', 'post', 'other'];
    const grouped = new Map();
    automaticBoards.forEach(board => {
      const phase = this.sidebarPhase(board);
      if (!grouped.has(phase.id)) grouped.set(phase.id, { phase, boards: [] });
      grouped.get(phase.id).boards.push(board);
    });
    const collapsed = this.sidebarCollapsedPhases();

    const folderHtml = folderSections.map(({ folder, boards: folderBoards }) => {
      const collapseId = `folder:${folder.id}`;
      const isCollapsed = collapsed.has(collapseId);
      return `<section class="sidebar-phase sidebar-folder ${isCollapsed ? 'is-collapsed' : ''}" data-sidebar-phase="${this.escapeAttr(collapseId)}" data-folder-drop="${this.escapeAttr(folder.id)}">
        <div class="sidebar-folder-header-row">
          <button type="button" class="sidebar-phase-header sidebar-folder-header" data-sidebar-phase-toggle="${this.escapeAttr(collapseId)}" aria-expanded="${isCollapsed ? 'false' : 'true'}">
            <span class="sidebar-phase-chevron">${isCollapsed ? '›' : '⌄'}</span><span>📁 ${this.escapeHtml(folder.title)}</span><small>${folderBoards.length}</small>
          </button>
          <button type="button" class="sidebar-folder-menu-button" data-sidebar-folder-menu="${this.escapeAttr(folder.id)}" aria-label="Menú de carpeta">⋯</button>
        </div>
        <div class="sidebar-phase-list">${folderBoards.map(board => this.sidebarBoardButtonHtml(board)).join('') || '<div class="sidebar-folder-empty">Arrastra tableros aquí</div>'}</div>
      </section>`;
    }).join('');

    const phaseHtml = order.filter(id => grouped.has(id)).map(id => {
      const bucket = grouped.get(id);
      const collapseId = `phase:${id}`;
      const isCollapsed = collapsed.has(collapseId) || collapsed.has(id);
      return `<section class="sidebar-phase ${isCollapsed ? 'is-collapsed' : ''}" data-sidebar-phase="${this.escapeAttr(collapseId)}">
        <button type="button" class="sidebar-phase-header" data-sidebar-phase-toggle="${this.escapeAttr(collapseId)}" aria-expanded="${isCollapsed ? 'false' : 'true'}">
          <span class="sidebar-phase-chevron">${isCollapsed ? '›' : '⌄'}</span><span>${this.escapeHtml(bucket.phase.label)}</span><small>${bucket.boards.length}</small>
        </button>
        <div class="sidebar-phase-list">${bucket.boards.map(board => this.sidebarBoardButtonHtml(board)).join('')}</div>
      </section>`;
    }).join('');

    nav.innerHTML = `<div class="sidebar-folder-toolbar"><button type="button" data-create-workspace-folder>＋ Carpeta</button><span data-sidebar-unassign title="Suelta aquí un tablero para quitarlo de una carpeta">Organización automática</span></div>${folderHtml}${phaseHtml}`;

    nav.querySelector('[data-create-workspace-folder]')?.addEventListener('click', () => this.openCreateWorkspaceFolder());
    nav.querySelectorAll('[data-sidebar-folder-menu]').forEach(button => button.addEventListener('click', event => {
      event.stopPropagation();
      this.openWorkspaceFolderMenu(button, button.dataset.sidebarFolderMenu);
    }));

    nav.querySelectorAll('[data-sidebar-phase-toggle]').forEach(button => button.addEventListener('click', () => {
      const phaseId = button.dataset.sidebarPhaseToggle;
      const section = [...nav.querySelectorAll('[data-sidebar-phase]')]
        .find(entry => String(entry.dataset.sidebarPhase || '') === String(phaseId));
      const next = !section?.classList.contains('is-collapsed');
      this.setSidebarPhaseCollapsed(phaseId, next);
      section?.classList.toggle('is-collapsed', next);
      button.setAttribute('aria-expanded', next ? 'false' : 'true');
      const chevron = button.querySelector('.sidebar-phase-chevron');
      if (chevron) chevron.textContent = next ? '›' : '⌄';
    }));

    nav.querySelectorAll('[data-hierarchy-board]').forEach(button => {
      button.addEventListener('click', () => {
        const board = this.boards.find(entry => String(entry._id) === String(button.dataset.hierarchyBoard));
        if (board) this.selectBoard(board);
      });
      button.addEventListener('dragstart', event => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/new-monday-board-id', button.dataset.hierarchyBoard);
        button.classList.add('is-dragging');
      });
      button.addEventListener('dragend', () => button.classList.remove('is-dragging'));
    });

    nav.querySelectorAll('[data-folder-drop]').forEach(section => {
      section.addEventListener('dragover', event => { event.preventDefault(); section.classList.add('is-drop-target'); });
      section.addEventListener('dragleave', event => { if (!section.contains(event.relatedTarget)) section.classList.remove('is-drop-target'); });
      section.addEventListener('drop', event => {
        event.preventDefault();
        section.classList.remove('is-drop-target');
        const boardId = event.dataTransfer.getData('text/new-monday-board-id');
        if (boardId) this.moveBoardToWorkspaceFolder(boardId, section.dataset.folderDrop);
      });
    });

    const unassign = nav.querySelector('[data-sidebar-unassign]');
    unassign?.addEventListener('dragover', event => { event.preventDefault(); unassign.classList.add('is-drop-target'); });
    unassign?.addEventListener('dragleave', () => unassign.classList.remove('is-drop-target'));
    unassign?.addEventListener('drop', event => {
      event.preventDefault();
      unassign.classList.remove('is-drop-target');
      const boardId = event.dataTransfer.getData('text/new-monday-board-id');
      if (boardId) this.moveBoardToWorkspaceFolder(boardId, '');
    });
  };
})();
