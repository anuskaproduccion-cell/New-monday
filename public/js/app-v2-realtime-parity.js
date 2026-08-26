(() => {
  const baseInit = app.init.bind(app);

  app.realtimeSource = null;
  app.realtimeState = 'offline';
  app.realtimeRefreshTimer = null;
  app.realtimePendingChange = null;
  app.realtimeRefreshing = false;
  app.realtimeLastRefreshAt = 0;

  app.ensureRealtimeBadge = function ensureRealtimeBadge() {
    const actions = document.querySelector('.header-actions');
    if (!actions) return null;
    let badge = actions.querySelector('.realtime-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'realtime-badge';
      badge.setAttribute('role', 'status');
      badge.setAttribute('aria-live', 'polite');
      badge.innerHTML = '<i aria-hidden="true"></i><span>Conectando…</span>';
      actions.prepend(badge);
    }
    return badge;
  };

  app.setRealtimeState = function setRealtimeState(state, label) {
    this.realtimeState = state;
    const badge = this.ensureRealtimeBadge();
    if (!badge) return;
    badge.dataset.state = state;
    const text = badge.querySelector('span');
    if (text) text.textContent = label || (state === 'live' ? 'En vivo' : state === 'connecting' ? 'Conectando…' : 'Sin conexión');
  };

  app.realtimeInteractionInProgress = function realtimeInteractionInProgress() {
    const active = document.activeElement;
    if (active?.matches?.('input,textarea,select,[contenteditable="true"]')) return true;
    if (document.querySelector('.is-dragging,.is-resizing,[data-dragging="true"],.column-resizing')) return true;
    return false;
  };

  app.scheduleRealtimeRefresh = function scheduleRealtimeRefresh(change = {}, delay = 350) {
    const boardId = String(change.board || '');
    if (!boardId || boardId !== String(this.currentBoardId() || '')) return;
    this.realtimePendingChange = change;
    clearTimeout(this.realtimeRefreshTimer);
    this.realtimeRefreshTimer = setTimeout(async () => {
      if (this.realtimeInteractionInProgress()) {
        this.scheduleRealtimeRefresh(this.realtimePendingChange || change, 700);
        return;
      }
      const pending = this.realtimePendingChange || change;
      this.realtimePendingChange = null;
      await this.refreshCurrentBoardFromRealtime(pending);
    }, delay);
  };

  app.realtimeNeedsFullShellRefresh = function realtimeNeedsFullShellRefresh(change = {}) {
    return !change.item;
  };

  app.refreshCurrentBoardFromRealtime = async function refreshCurrentBoardFromRealtime(change = {}) {
    if (this.realtimeRefreshing) {
      this.realtimePendingChange = change;
      return;
    }
    const boardId = String(this.currentBoardId() || '');
    if (!boardId || (change.board && String(change.board) !== boardId)) return;

    this.realtimeRefreshing = true;
    try {
      const fullShellRefresh = this.realtimeNeedsFullShellRefresh(change);
      let board = this.currentBoard;
      let items = null;

      if (fullShellRefresh) {
        [board, items] = await Promise.all([
          this.api(`/api/boards/${encodeURIComponent(boardId)}`),
          this.api(`/api/items/board/${encodeURIComponent(boardId)}?includeSubitems=true`)
        ]);
      } else {
        items = await this.api(`/api/items/board/${encodeURIComponent(boardId)}?includeSubitems=true`);
      }

      if (String(this.currentBoardId() || '') !== boardId) return;
      if (fullShellRefresh && board?.archived) {
        await this.reloadAll();
        this.renderWorkspaceSwitcher();
        this.renderSidebar();
        const next = this.visibleBoards()[0];
        if (next) await this.selectBoard(next);
        else {
          this.currentBoard = null;
          this.renderEmptyState('El tablero se archivó desde otra sesión.');
        }
        return;
      }

      if (fullShellRefresh && board) {
        const boardIndex = this.boards.findIndex(entry => String(entry._id) === boardId);
        if (boardIndex >= 0) this.boards[boardIndex] = board;
        else this.boards.push(board);
        this.currentBoard = board;
        this.currentWorkspace = this.workspaces.find(workspace => this.boardBelongsToWorkspace(board, workspace)) || this.currentWorkspace;
      }

      this.items = this.items
        .filter(item => String(item.board?._id || item.board) !== boardId)
        .concat(items || []);

      if (fullShellRefresh) {
        this.renderWorkspaceSwitcher();
        this.renderSidebar();
        this.renderHeader();
        this.renderViewTabs();
      }
      this.renderCurrentView();
      this.realtimeLastRefreshAt = Date.now();

      if (typeof this.announceA11y === 'function') {
        const message = change.message ? `Cambio remoto: ${change.message}` : 'El tablero se actualizó desde otra sesión';
        this.announceA11y(message);
      }
    } catch (error) {
      console.warn('Realtime refresh failed:', error.message);
      this.setRealtimeState(navigator.onLine === false ? 'offline' : 'connecting', navigator.onLine === false ? 'Sin conexión' : 'Reconectando…');
    } finally {
      this.realtimeRefreshing = false;
      if (this.realtimePendingChange && String(this.realtimePendingChange.board || '') === String(this.currentBoardId() || '')) {
        const pending = this.realtimePendingChange;
        this.realtimePendingChange = null;
        this.scheduleRealtimeRefresh(pending, 250);
      }
    }
  };

  app.connectRealtime = function connectRealtime() {
    if (!window.EventSource) {
      this.setRealtimeState('unsupported', 'Actualización manual');
      return;
    }
    if (this.realtimeSource) this.realtimeSource.close();
    this.setRealtimeState('connecting', navigator.onLine === false ? 'Sin conexión' : 'Conectando…');

    const source = new EventSource('/api/realtime/stream');
    this.realtimeSource = source;
    source.addEventListener('ready', () => this.setRealtimeState('live', 'En vivo'));
    source.addEventListener('change', event => {
      let change = null;
      try { change = JSON.parse(event.data || '{}'); } catch { return; }
      if (!change?.board) return;
      this.setRealtimeState('live', 'En vivo');
      this.scheduleRealtimeRefresh(change);
    });
    source.onerror = () => {
      this.setRealtimeState(navigator.onLine === false ? 'offline' : 'connecting', navigator.onLine === false ? 'Sin conexión' : 'Reconectando…');
    };
  };

  app.init = async function initWithRealtime() {
    await baseInit();
    this.ensureRealtimeBadge();
    this.connectRealtime();

    window.addEventListener('online', () => this.connectRealtime());
    window.addEventListener('offline', () => this.setRealtimeState('offline', 'Sin conexión'));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || !this.currentBoardId()) return;
      if (!this.realtimeSource || this.realtimeSource.readyState === EventSource.CLOSED) this.connectRealtime();
      if (Date.now() - this.realtimeLastRefreshAt > 15000 && !this.realtimeInteractionInProgress()) {
        this.refreshCurrentBoardFromRealtime({ board: this.currentBoardId(), type: 'visibility_refresh' });
      }
    });
  };
})();
