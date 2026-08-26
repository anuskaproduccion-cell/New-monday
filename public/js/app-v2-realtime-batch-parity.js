(() => {
  const baseNeedsFullShellRefresh = app.realtimeNeedsFullShellRefresh.bind(app);
  const baseItemRefreshMode = app.realtimeItemRefreshMode.bind(app);
  const baseReloadAll = typeof app.reloadAll === 'function' ? app.reloadAll : null;
  const MAX_BATCH_LATENCY_MS = 1200;
  const INTERACTION_RETRY_MS = 700;

  app.realtimeBatchStartedAt = 0;

  if (baseReloadAll) {
    app.reloadAll = async function reloadAllWithRealtimeSnapshotIsolation(...args) {
      const canIsolateRealtimeSnapshot = Boolean(
        this.realtimeRefreshing
        && typeof this.realtimeLocalMutationVersion === 'function'
        && typeof this.realtimeLocalMutationChanged === 'function'
      );
      if (!canIsolateRealtimeSnapshot) return baseReloadAll.apply(this, args);

      const mutationVersionBeforeReload = this.realtimeLocalMutationVersion();
      const shadow = Object.create(this);
      shadow.workspaces = this.workspaces;
      shadow.boards = this.boards;
      shadow.items = this.items;
      shadow.crew = this.crew;
      shadow.currentWorkspace = this.currentWorkspace;

      let reloadError = null;
      shadow.showConnectionError = error => { reloadError = error; };
      await baseReloadAll.apply(shadow, args);
      if (reloadError) throw reloadError;

      if (this.realtimeLocalMutationChanged(mutationVersionBeforeReload)) return false;

      this.workspaces = shadow.workspaces;
      this.boards = shadow.boards;
      this.items = shadow.items;
      this.crew = shadow.crew;
      this.currentWorkspace = shadow.currentWorkspace;
      return true;
    };
  }

  app.realtimeNeedsFullShellRefresh = function realtimeNeedsFullShellRefreshWithItemBatch(change = {}) {
    if (change?.meta?.itemsOnly === true && !this.realtimeIsGlobalChange(change)) return false;
    return baseNeedsFullShellRefresh(change);
  };

  app.realtimeItemRefreshMode = function realtimeItemRefreshModeWithItemBatch(change = {}) {
    if (change?.meta?.itemsOnly === true && !this.realtimeIsGlobalChange(change)) return 'board';
    return baseItemRefreshMode(change);
  };

  app.mergeRealtimeChanges = function mergeRealtimeChangesWithoutDroppingItems(current = null, incoming = {}) {
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

    const currentShell = !current.item && current?.meta?.itemsOnly !== true;
    const incomingShell = !incoming.item && incoming?.meta?.itemsOnly !== true;
    if (currentShell || incomingShell) {
      const fullChange = incomingShell ? incoming : current;
      return {
        ...incoming,
        board: incoming.board || current.board,
        item: null,
        type: fullChange.type || incoming.type || current.type || 'change',
        field: fullChange.field || '',
        message: fullChange.message || incoming.message || current.message || '',
        meta: fullChange.meta || incoming.meta || current.meta || {}
      };
    }

    const currentNeedsBoardItems = current?.meta?.itemsOnly === true || baseItemRefreshMode(current) === 'board';
    const incomingNeedsBoardItems = incoming?.meta?.itemsOnly === true || baseItemRefreshMode(incoming) === 'board';
    const differentItems = Boolean(
      current.item && incoming.item && String(current.item) !== String(incoming.item)
    );

    if (currentNeedsBoardItems || incomingNeedsBoardItems || differentItems) {
      return {
        ...incoming,
        scope: 'board',
        board: incoming.board || current.board,
        item: null,
        type: 'realtime_items_batch',
        field: '',
        message: incoming.message || current.message || 'Varios elementos cambiaron desde otra sesión',
        meta: {
          ...(current.meta || {}),
          ...(incoming.meta || {}),
          itemsOnly: true
        }
      };
    }

    return incoming;
  };

  app.scheduleRealtimeRefresh = function scheduleRealtimeRefreshBounded(change = {}, delay = 350) {
    if (!this.realtimeIsGlobalChange(change)) {
      const boardId = String(change.board || '');
      if (!boardId || boardId !== String(this.currentBoardId?.() || '')) return;
    }

    const now = Date.now();
    if (!this.realtimePendingChange || !this.realtimeBatchStartedAt) this.realtimeBatchStartedAt = now;
    this.realtimePendingChange = this.mergeRealtimeChanges(this.realtimePendingChange, change);

    clearTimeout(this.realtimeRefreshTimer);
    const elapsed = Math.max(0, now - this.realtimeBatchStartedAt);
    const remaining = Math.max(0, MAX_BATCH_LATENCY_MS - elapsed);
    const boundedDelay = Math.max(0, Math.min(Number(delay) || 0, remaining));

    this.realtimeRefreshTimer = setTimeout(async () => {
      if (this.realtimeInteractionInProgress()) {
        clearTimeout(this.realtimeRefreshTimer);
        this.realtimeRefreshTimer = setTimeout(() => {
          const pending = this.realtimePendingChange || change;
          this.scheduleRealtimeRefresh(pending, 0);
        }, INTERACTION_RETRY_MS);
        return;
      }

      const pending = this.realtimePendingChange || change;
      this.realtimePendingChange = null;
      this.realtimeBatchStartedAt = 0;
      await this.applyRealtimeChange(pending);
    }, boundedDelay);
  };
})();