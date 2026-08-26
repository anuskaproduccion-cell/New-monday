(() => {
  const baseOpenUpdatesPanel = app.openUpdatesPanel?.bind(app);
  const baseSelectBoard = app.selectBoard.bind(app);
  const baseCloseModal = app.closeModal?.bind(app);

  app.updatesPanelSequence = Number(app.updatesPanelSequence || 0);
  app.updatesRequestSequence = Number(app.updatesRequestSequence || 0);
  app.updatesPanelContext = null;

  app.invalidateUpdatesPanelContext = function invalidateUpdatesPanelContext() {
    this.updatesPanelSequence += 1;
    this.updatesPanelContext = null;
  };

  app.updatesPanelContextMatches = function updatesPanelContextMatches(itemId, tab = null) {
    const context = this.updatesPanelContext;
    if (!context) return false;
    if (String(context.itemId) !== String(itemId || '')) return false;
    if (String(this.currentBoardId?.() || '') !== String(context.boardId || '')) return false;
    if (tab !== null && String(context.tab || '') !== String(tab || '')) return false;
    return true;
  };

  app.beginUpdatesPanelRequest = function beginUpdatesPanelRequest(itemId, tab) {
    const context = this.updatesPanelContext;
    if (!context || String(context.itemId) !== String(itemId || '') || String(this.currentBoardId?.() || '') !== String(context.boardId || '')) {
      return { valid: false, itemId: String(itemId || ''), tab: String(tab || '') };
    }

    const requestToken = ++this.updatesRequestSequence;
    context.tab = String(tab || 'updates');
    context.requestToken = requestToken;
    return {
      valid: true,
      panelToken: context.panelToken,
      requestToken,
      boardId: context.boardId,
      itemId: context.itemId,
      tab: context.tab
    };
  };

  app.updatesPanelRequestMatches = function updatesPanelRequestMatches(request) {
    if (!request?.valid) return false;
    const context = this.updatesPanelContext;
    return Boolean(context)
      && Number(context.panelToken) === Number(request.panelToken)
      && Number(context.requestToken) === Number(request.requestToken)
      && String(context.boardId) === String(request.boardId)
      && String(context.itemId) === String(request.itemId)
      && String(context.tab) === String(request.tab)
      && String(this.currentBoardId?.() || '') === String(request.boardId);
  };

  if (baseOpenUpdatesPanel) {
    app.openUpdatesPanel = async function openUpdatesPanelNavigationSafe(itemId) {
      const item = this.findItem?.(itemId);
      if (!item) return;

      const boardId = String(this.currentBoardId?.() || item.board?._id || item.board || '');
      const panelToken = ++this.updatesPanelSequence;
      this.updatesPanelContext = {
        panelToken,
        requestToken: 0,
        boardId,
        itemId: String(itemId || ''),
        tab: 'updates'
      };

      await baseOpenUpdatesPanel(itemId);
    };
  }

  app.renderItemActivity = async function renderItemActivityNavigationSafe(itemId) {
    const request = this.beginUpdatesPanelRequest(itemId, 'activity');
    if (!request.valid) return false;

    const host = document.getElementById('updates-panel-body');
    if (!host) return false;
    try {
      const events = await this.api(`/api/activity/item/${encodeURIComponent(itemId)}?limit=200`);
      if (!this.updatesPanelRequestMatches(request)) return false;

      const format = value => {
        if (!value) return '';
        try { return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
        catch { return String(value); }
      };
      host.innerHTML = `<div class="activity-feed">${events.length ? events.map(event => `<div class="activity-event"><span class="activity-dot"></span><div><strong>${this.escapeHtml(event.message || event.type)}</strong><small>${this.escapeHtml(format(event.createdAt))}${event.field ? ` · ${this.escapeHtml(event.field)}` : ''}</small></div></div>`).join('') : '<div class="updates-empty">Aún no hay actividad local registrada.</div>'}</div>`;
      return true;
    } catch (error) {
      if (!this.updatesPanelRequestMatches(request)) return false;
      host.innerHTML = `<div class="updates-error">${this.escapeHtml(error.message)}</div>`;
      return true;
    }
  };

  app.selectBoard = async function selectBoardClosingStaleUpdates(board) {
    const context = this.updatesPanelContext;
    const nextBoardId = String(board?._id || '');
    if (context && nextBoardId && String(context.boardId) !== nextBoardId) {
      this.invalidateUpdatesPanelContext();
      if (document.querySelector('.updates-modal')) baseCloseModal?.();
    }
    return baseSelectBoard(board);
  };

  if (baseCloseModal) {
    app.closeModal = function closeModalInvalidatingUpdates() {
      if (document.querySelector('.updates-modal')) this.invalidateUpdatesPanelContext();
      return baseCloseModal();
    };
  }
})();
