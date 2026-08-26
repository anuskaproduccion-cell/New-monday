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

  app.sidebarBoardButtonHtml = function sidebarBoardButtonHtml(board) {
    const active = String(this.currentBoard?._id || '') === String(board._id);
    return `<button type="button" class="sidebar-nav-item ${active ? 'active' : ''}" data-hierarchy-board="${this.escapeAttr(board._id)}" title="${this.escapeAttr(board.name)}">
      <span class="sidebar-nav-item-icon">${this.escapeHtml(board.icon || '📋')}</span>
      <span class="sidebar-board-name">${this.escapeHtml(board.name)}</span>
      ${board.source === 'monday-import' ? '<span class="source-badge" title="Importado desde Monday en modo solo lectura">RO</span>' : ''}
    </button>`;
  };

  app.renderSidebar = function renderSidebarWithHierarchy() {
    baseRenderSidebar();
    const nav = document.getElementById('sidebar-nav');
    if (!nav) return;
    const boards = this.visibleBoards().filter(board => !board.archived && !board.internal);
    if (!boards.length) {
      nav.innerHTML = '<div class="sidebar-no-boards">No hay tableros visibles</div>';
      return;
    }

    const order = ['preprod', 'shooting', 'editing', 'post', 'other'];
    const grouped = new Map();
    boards.forEach(board => {
      const phase = this.sidebarPhase(board);
      if (!grouped.has(phase.id)) grouped.set(phase.id, { phase, boards: [] });
      grouped.get(phase.id).boards.push(board);
    });
    const collapsed = this.sidebarCollapsedPhases();

    nav.innerHTML = order.filter(id => grouped.has(id)).map(id => {
      const bucket = grouped.get(id);
      const isCollapsed = collapsed.has(id);
      return `<section class="sidebar-phase ${isCollapsed ? 'is-collapsed' : ''}" data-sidebar-phase="${this.escapeAttr(id)}">
        <button type="button" class="sidebar-phase-header" data-sidebar-phase-toggle="${this.escapeAttr(id)}" aria-expanded="${isCollapsed ? 'false' : 'true'}">
          <span class="sidebar-phase-chevron">${isCollapsed ? '›' : '⌄'}</span><span>${this.escapeHtml(bucket.phase.label)}</span><small>${bucket.boards.length}</small>
        </button>
        <div class="sidebar-phase-list">${bucket.boards.map(board => this.sidebarBoardButtonHtml(board)).join('')}</div>
      </section>`;
    }).join('');

    nav.querySelectorAll('[data-sidebar-phase-toggle]').forEach(button => button.addEventListener('click', () => {
      const phaseId = button.dataset.sidebarPhaseToggle;
      const section = nav.querySelector(`[data-sidebar-phase="${CSS.escape(phaseId)}"]`);
      const next = !section?.classList.contains('is-collapsed');
      this.setSidebarPhaseCollapsed(phaseId, next);
      section?.classList.toggle('is-collapsed', next);
      button.setAttribute('aria-expanded', next ? 'false' : 'true');
      const chevron = button.querySelector('.sidebar-phase-chevron');
      if (chevron) chevron.textContent = next ? '›' : '⌄';
    }));

    nav.querySelectorAll('[data-hierarchy-board]').forEach(button => button.addEventListener('click', () => {
      const board = this.boards.find(entry => String(entry._id) === String(button.dataset.hierarchyBoard));
      if (board) this.selectBoard(board);
    }));
  };
})();
