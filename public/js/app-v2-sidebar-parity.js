(() => {
  const RECENTS_KEY = 'new-monday:recent-boards';
  const baseSelectBoard = app.selectBoard.bind(app);
  const baseRenderSidebar = app.renderSidebar.bind(app);

  app.recentBoardIds = function recentBoardIds() {
    try {
      const parsed = JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.map(String).slice(0, 8) : [];
    } catch {
      return [];
    }
  };

  app.rememberRecentBoard = function rememberRecentBoard(board) {
    if (!board?._id) return;
    const id = String(board._id);
    const next = [id, ...this.recentBoardIds().filter(entry => entry !== id)].slice(0, 8);
    try { localStorage.setItem(RECENTS_KEY, JSON.stringify(next)); } catch { /* local preference only */ }
  };

  app.selectBoard = async function selectBoardWithRecents(board) {
    await baseSelectBoard(board);
    this.rememberRecentBoard(board);
    this.renderSidebar();
  };

  app.renderSidebar = function renderSidebarWithRecents() {
    baseRenderSidebar();
    const sidebar = document.querySelector('.sidebar');
    const regularLabel = sidebar?.querySelector(':scope > .sidebar-label');
    if (!sidebar || !regularLabel) return;

    let section = sidebar.querySelector('.sidebar-recents');
    if (!section) {
      section = document.createElement('section');
      section.className = 'sidebar-recents';
      regularLabel.before(section);
    }

    const ids = this.recentBoardIds();
    const recent = ids
      .map(id => this.boards.find(board => String(board._id) === id))
      .filter(board => board && !board.archived && !board.internal)
      .slice(0, 5);

    if (!recent.length) {
      section.innerHTML = '';
      section.hidden = true;
      return;
    }

    section.hidden = false;
    section.innerHTML = `<div class="sidebar-label sidebar-recents-label">Recientes</div><div class="sidebar-recents-list">${recent.map(board => `
      <button type="button" class="sidebar-recent-item ${String(this.currentBoard?._id) === String(board._id) ? 'active' : ''}" data-recent-board="${this.escapeAttr(board._id)}" title="${this.escapeAttr(this.workspaceName(board))} · ${this.escapeAttr(board.name)}">
        <span>${this.escapeHtml(board.icon || '📋')}</span><span class="sidebar-recent-copy"><strong>${this.escapeHtml(board.name)}</strong><small>${this.escapeHtml(this.workspaceName(board))}</small></span>
      </button>`).join('')}</div>`;

    section.querySelectorAll('[data-recent-board]').forEach(button => button.addEventListener('click', () => {
      const board = this.boards.find(entry => String(entry._id) === String(button.dataset.recentBoard));
      if (board) this.selectBoard(board);
    }));
  };
})();
