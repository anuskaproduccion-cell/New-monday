(() => {
  const baseInit = app.init.bind(app);

  app.realtimeSource = null;
  app.realtimeState = 'offline';
  app.realtimeRefreshTimer = null;
  app.realtimePendingChange = null;
  app.realtimeRefreshing = false;
  app.realtimeLastRefreshAt = 0;
  app.realtimeEverReady = false;

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
    if (typeof this.hasLocalMutationInFlight === 'function' && this.hasLocalMutationInFlight()) return true;
    const active = document.activeElement;
    if (active?.matches?.('input,textarea,select,[contenteditable="true"]')) return true;
    if (document.querySelector('.is-dragging,.is-resizing,[data-dragging="true"],.column-resizing')) return true;
    return false;
  };

  app.closeRealtimeMenusForRefresh = function closeRealtimeMenusForRefresh(fullShell = false) {
    if (typeof this.closePositionedMenusForRoot !== 'function') return;
    const root = fullShell ? document.body : document.getElementById('content');
    if (root) this.closePositionedMenusForRoot(root);
  };

  app.realtimeLocalMutationVersion = function realtimeLocalMutationVersion() {
    return Number(this.localMutationVersion?.() || 0);
  };

  app.realtimeLocalMutationChanged = function realtimeLocalMutationChanged(version) {
    return this.realtimeLocalMutationVersion() !== Number(version || 0);
  };

  app.realtimeIsGlobalChange = function realtimeIsGlobalChange(change = {}) {
    const scope = String(change.scope || '').toLowerCase();
    return scope === 'global' || scope === 'workspace';
  };

  app.realtimeNeedsFullShellRefresh = function realtimeNeedsFullShellRefresh(change = {}) {
    return this.realtimeIsGlobalChange(change) || !change.item;
  };

  app.realtimeItemRefreshMode = function realtimeItemRefreshMode(change = {}) {
    if (this.realtimeIsGlobalChange(change) || !change.item) return 'board';
    const type = String(change.type || '');
    if (type === 'column_value_changed') {
      return Number(change.meta?.cascadedCount || 0) > 0 ? 'board' : 'single';
    }
    if (['item_updated', 'item_moved', 'item_created', 'subitem_created', 'item_unarchived', 'item_restored'].includes(type)) {
      return 'single';
    }
    if (['item_archived', 'item_trashed'].includes(type)) return 'remove';
    return 'board';
  };

  app.mergeRealtimeChanges = function mergeRealtimeChanges(current = null, incoming = {}) {
    if (!current) return incoming;

    const currentGlobal = this.realtimeIsGlobalChange(current);
    const incomingGlobal = this.realtimeIsGlobalChange(incoming);
    if (currentGlobal || incomingGlobal) {
      const broadChange = incomingGlobal ? incoming : current;
      return {
        ...incoming,
        scope: broadChange.scope || 'global',
        board: null,
        workspace: broadChange.workspace || incoming.workspace || current.workspace || null,
        item: null,
        type: broadChange.type || incoming.type || current.type || 'change',
        field: broadChange.field || '',
        message: broadChange.message || incoming.message || current.message || '',
        meta: broadChange.meta || incoming.meta || current.meta || {}
      };
    }

    const preserveFullRefresh = this.realtimeNeedsFullShellRefresh(current) || this.realtimeNeedsFullShellRefresh(incoming);
    if (!preserveFullRefresh) return incoming;
    const fullChange = this.realtimeNeedsFullShellRefresh(incoming) ? incoming : current;
    return {
      ...incoming,
      board: incoming.board || current.board,
      item: null,
      type: fullChange.type || incoming.type || current.type || 'change',
      field: fullChange.field || '',
      message: fullChange.message || incoming.message || current.message || '',
      meta: fullChange.meta || incoming.meta || current.meta || {}
    };
  };

  app.realtimeReadySyncChange = function realtimeReadySyncChange() {
    const wasReady = this.realtimeEverReady;
    this.realtimeEverReady = true;
    if (!wasReady) return null;
    return {
      scope: 'global',
      board: null,
      item: null,
      type: 'realtime_reconnected',
      message: 'Conexión en vivo restablecida'
    };
  };

  app.realtimePendingChangeStillRelevant = function realtimePendingChangeStillRelevant(change = {}) {
    if (this.realtimeIsGlobalChange(change)) return true;
    const boardId = String(change.board || '');
    return Boolean(boardId && boardId === String(this.currentBoardId?.() || ''));
  };

  app.scheduleRealtimeMutationOverlapRevalidation = function scheduleRealtimeMutationOverlapRevalidation(change = {}) {
    if (this.realtimeIsGlobalChange(change)) {
      this.scheduleRealtimeRefresh({
        scope: 'global',
        board: null,
        item: null,
        type: 'local_mutation_overlap_revalidate',
        message: 'Revalidación tras una escritura local concurrente',
        meta: { localMutationOverlap: true }
      }, 75);
      return;
    }

    const boardId = String(change.board || this.currentBoardId?.() || '');
    if (!boardId || boardId !== String(this.currentBoardId?.() || '')) return;
    const fullShellRefresh = this.realtimeNeedsFullShellRefresh(change);
    this.scheduleRealtimeRefresh({
      scope: 'board',
      board: boardId,
      item: null,
      type: 'local_mutation_overlap_revalidate',
      message: 'Revalidación tras una escritura local concurrente',
      meta: fullShellRefresh
        ? { localMutationOverlap: true }
        : { localMutationOverlap: true, itemsOnly: true }
    }, 75);
  };

  app.scheduleRealtimeRefresh = function scheduleRealtimeRefresh(change = {}, delay = 350) {
    if (!this.realtimeIsGlobalChange(change)) {
      const boardId = String(change.board || '');
      if (!boardId || boardId !== String(this.currentBoardId?.() || '')) return;
    }

    this.realtimePendingChange = this.mergeRealtimeChanges(this.realtimePendingChange, change);
    clearTimeout(this.realtimeRefreshTimer);
    this.realtimeRefreshTimer = setTimeout(async () => {
      if (this.realtimeInteractionInProgress()) {
        this.scheduleRealtimeRefresh(this.realtimePendingChange || change, 700);
        return;
      }
      const pending = this.realtimePendingChange || change;
      this.realtimePendingChange = null;
      await this.applyRealtimeChange(pending);
    }, delay);
  };

  app.applyRealtimeChange = async function applyRealtimeChange(change = {}) {
    if (this.realtimeIsGlobalChange(change)) return this.refreshGlobalStateFromRealtime(change);
    return this.refreshCurrentBoardFromRealtime(change);
  };

  app.refreshGlobalStateFromRealtime = async function refreshGlobalStateFromRealtime(change = {}) {
    if (this.realtimeRefreshing) {
      this.realtimePendingChange = this.mergeRealtimeChanges(this.realtimePendingChange, change);
      return;
    }

    this.realtimeRefreshing = true;
    try {
      const previousBoardId = String(this.currentBoardId?.() || '');
      const previousWorkspaceKey = String(this.workspaceKey?.(this.currentWorkspace) || '');
      const mutationVersionBeforeRefresh = this.realtimeLocalMutationVersion();

      await this.reloadAll();

      if (this.realtimeLocalMutationChanged(mutationVersionBeforeRefresh)) {
        this.scheduleRealtimeMutationOverlapRevalidation({ scope: 'global' });
        return;
      }

      const nextBoard = previousBoardId
        ? this.boards.find(board => String(board._id) === previousBoardId && !board.archived)
        : null;
      const previousWorkspace = previousWorkspaceKey
        ? this.workspaces.find(workspace => String(this.workspaceKey(workspace)) === previousWorkspaceKey)
        : null;

      if (nextBoard) {
        this.currentBoard = nextBoard;
        this.currentWorkspace = this.workspaces.find(workspace => this.boardBelongsToWorkspace(nextBoard, workspace))
          || previousWorkspace
          || this.workspaces[0]
          || null;
      } else {
        this.currentBoard = null;
        this.currentWorkspace = previousWorkspace || this.workspaces[0] || null;
      }

      this.closeRealtimeMenusForRefresh(true);
      this.renderWorkspaceSwitcher();
      this.renderSidebar();
      this.renderCrewDatalist?.();

      if (this.currentBoard) {
        this.renderHeader();
        this.renderViewTabs();
        this.ensureRealtimeBadge();
        this.renderCurrentView();
      } else {
        const next = this.visibleBoards()[0];
        if (next) await this.selectBoard(next);
        else this.renderEmptyState('No hay tableros visibles después del cambio remoto.');
        this.ensureRealtimeBadge();
      }

      this.realtimeLastRefreshAt = Date.now();
      if (typeof this.announceA11y === 'function') {
        const message = change.message ? `Cambio remoto: ${change.message}` : 'La estructura de New Monday se actualizó desde otra sesión';
        this.announceA11y(message);
      }
    } catch (error) {
      console.warn('Global realtime refresh failed:', error.message);
      this.setRealtimeState(navigator.onLine === false ? 'offline' : 'connecting', navigator.onLine === false ? 'Sin conexión' : 'Reconectando…');
    } finally {
      this.realtimeRefreshing = false;
      if (this.realtimePendingChange && this.realtimePendingChangeStillRelevant(this.realtimePendingChange)) {
        const pending = this.realtimePendingChange;
        this.realtimePendingChange = null;
        this.scheduleRealtimeRefresh(pending, 250);
      }
    }
  };

  app.refreshCurrentBoardFromRealtime = async function refreshCurrentBoardFromRealtime(change = {}) {
    if (this.realtimeRefreshing) {
      this.realtimePendingChange = this.mergeRealtimeChanges(this.realtimePendingChange, change);
      return;
    }
    const boardId = String(this.currentBoardId() || '');
    if (!boardId || (change.board && String(change.board) !== boardId)) return;

    this.realtimeRefreshing = true;
    try {
      const mutationVersionBeforeRefresh = this.realtimeLocalMutationVersion();
      const fullShellRefresh = this.realtimeNeedsFullShellRefresh(change);
      const itemRefreshMode = fullShellRefresh ? 'board' : this.realtimeItemRefreshMode(change);
      let board = this.currentBoard;
      let items = null;
      let updatedItem = null;

      if (fullShellRefresh) {
        [board, items] = await Promise.all([
          this.api(`/api/boards/${encodeURIComponent(boardId)}`),
          this.api(`/api/items/board/${encodeURIComponent(boardId)}?includeSubitems=true`)
        ]);
      } else if (itemRefreshMode === 'single') {
        updatedItem = await this.api(`/api/items/${encodeURIComponent(change.item)}`);
      } else if (itemRefreshMode === 'board') {
        items = await this.api(`/api/items/board/${encodeURIComponent(boardId)}?includeSubitems=true`);
      }

      if (String(this.currentBoardId() || '') !== boardId) return;
      if (this.realtimeLocalMutationChanged(mutationVersionBeforeRefresh)) {
        this.scheduleRealtimeMutationOverlapRevalidation(change);
        return;
      }
      if (fullShellRefresh && board?.archived) {
        const archiveReloadMutationVersion = this.realtimeLocalMutationVersion();
        this.closeRealtimeMenusForRefresh(true);
        await this.reloadAll();
        if (this.realtimeLocalMutationChanged(archiveReloadMutationVersion)) {
          this.scheduleRealtimeMutationOverlapRevalidation({ scope: 'global' });
          return;
        }
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

      if (fullShellRefresh || itemRefreshMode === 'board') {
        this.items = this.items
          .filter(item => String(item.board?._id || item.board) !== boardId)
          .concat(items || []);
      } else if (itemRefreshMode === 'single' && updatedItem) {
        const index = this.items.findIndex(item => String(item._id) === String(updatedItem._id));
        if (index >= 0) this.items[index] = updatedItem;
        else this.items.push(updatedItem);
      } else if (itemRefreshMode === 'remove') {
        this.items = this.items.filter(item => String(item._id) !== String(change.item));
      }

      this.closeRealtimeMenusForRefresh(fullShellRefresh);
      if (fullShellRefresh) {
        this.renderWorkspaceSwitcher();
        this.renderSidebar();
        this.renderHeader();
        this.renderViewTabs();
        this.ensureRealtimeBadge();
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
      if (this.realtimePendingChange && this.realtimePendingChangeStillRelevant(this.realtimePendingChange)) {
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
    source.addEventListener('ready', () => {
      const syncChange = this.realtimeReadySyncChange();
      this.setRealtimeState('live', 'En vivo');
      if (syncChange) this.scheduleRealtimeRefresh(syncChange, 100);
    });
    source.addEventListener('change', event => {
      let change = null;
      try { change = JSON.parse(event.data || '{}'); } catch { return; }
      if (!change || (!this.realtimeIsGlobalChange(change) && !change.board)) return;
      this.setRealtimeState('live', 'En vivo');
      this.scheduleRealtimeRefresh(change);
    });
    source.onerror = () => {
      this.setRealtimeState(navigator.onLine === false ? 'offline' : 'connecting', navigator.onLine === false ? 'Sin conexión' : 'Reconectando…');
    };
  };

  app.init = async function initWithRealtime() {
    await baseInit();
    this.realtimeLastRefreshAt = Date.now();
    this.ensureRealtimeBadge();
    this.connectRealtime();

    window.addEventListener('online', () => this.connectRealtime());
    window.addEventListener('offline', () => this.setRealtimeState('offline', 'Sin conexión'));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || !this.currentBoardId()) return;
      if (!this.realtimeSource || this.realtimeSource.readyState === EventSource.CLOSED) this.connectRealtime();
      if (Date.now() - this.realtimeLastRefreshAt > 15000 && !this.realtimeInteractionInProgress()) {
        this.scheduleRealtimeRefresh({ board: this.currentBoardId(), type: 'visibility_refresh' }, 50);
      }
    });
  };
})();
