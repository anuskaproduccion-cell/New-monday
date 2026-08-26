(() => {
  const baseScheduleRealtimeRefresh = app.scheduleRealtimeRefresh.bind(app);
  const MAX_RELATED_BATCH_LATENCY_MS = 1200;
  const INTERACTION_RETRY_MS = 700;

  app.realtimeRelatedPendingChanges = new Map();
  app.realtimeRelatedTimers = new Map();
  app.realtimeRelatedBatchStartedAt = new Map();

  app.clearRelatedBoardRealtimeQueue = function clearRelatedBoardRealtimeQueue(sourceBoardId) {
    const key = String(sourceBoardId || '');
    if (!key) return;
    const timer = this.realtimeRelatedTimers.get(key);
    if (timer) clearTimeout(timer);
    this.realtimeRelatedTimers.delete(key);
    this.realtimeRelatedPendingChanges.delete(key);
    this.realtimeRelatedBatchStartedAt.delete(key);
  };

  app.realtimeBoardAffectsCurrentBoard = function realtimeBoardAffectsCurrentBoard(change = {}) {
    if (this.realtimeIsGlobalChange(change)) return true;
    const sourceBoardId = String(change.board || '');
    const currentBoardId = String(this.currentBoardId?.() || '');
    if (!sourceBoardId || !currentBoardId) return false;
    if (sourceBoardId === currentBoardId) return true;

    const relationColumns = (this.currentBoard?.columns || []).filter(column => column?.type === 'board_relation');
    return relationColumns.some(column => {
      const targets = typeof this.relationTargetBoards === 'function'
        ? this.relationTargetBoards(column)
        : [this.relationTargetBoard?.(column)].filter(Boolean);
      return targets.some(board => String(board?._id || '') === sourceBoardId);
    });
  };

  app.refreshRelatedBoardFromRealtime = async function refreshRelatedBoardFromRealtime(change = {}) {
    const sourceBoardId = String(change.board || '');
    const currentBoardId = String(this.currentBoardId?.() || '');
    if (!sourceBoardId || !currentBoardId || sourceBoardId === currentBoardId) return;
    if (!this.realtimeBoardAffectsCurrentBoard(change)) return;

    const fullSourceRefresh = this.realtimeNeedsFullShellRefresh(change);
    const itemRefreshMode = fullSourceRefresh ? 'board' : this.realtimeItemRefreshMode(change);
    let sourceBoard = null;
    let items = null;
    let updatedItem = null;

    try {
      if (fullSourceRefresh) {
        [sourceBoard, items] = await Promise.all([
          this.api(`/api/boards/${encodeURIComponent(sourceBoardId)}`),
          this.api(`/api/items/board/${encodeURIComponent(sourceBoardId)}?includeSubitems=true`)
        ]);
      } else if (itemRefreshMode === 'single') {
        updatedItem = await this.api(`/api/items/${encodeURIComponent(change.item)}`);
      } else if (itemRefreshMode === 'board') {
        items = await this.api(`/api/items/board/${encodeURIComponent(sourceBoardId)}?includeSubitems=true`);
      }

      if (String(this.currentBoardId?.() || '') !== currentBoardId) return;
      if (!this.realtimeBoardAffectsCurrentBoard(change)) return;

      if (sourceBoard) {
        const boardIndex = this.boards.findIndex(board => String(board._id) === sourceBoardId);
        if (boardIndex >= 0) this.boards[boardIndex] = sourceBoard;
        else this.boards.push(sourceBoard);
      }

      if (fullSourceRefresh || itemRefreshMode === 'board') {
        this.items = this.items
          .filter(item => String(item.board?._id || item.board) !== sourceBoardId)
          .concat(items || []);
      } else if (itemRefreshMode === 'single' && updatedItem) {
        const itemIndex = this.items.findIndex(item => String(item._id) === String(updatedItem._id));
        if (itemIndex >= 0) this.items[itemIndex] = updatedItem;
        else this.items.push(updatedItem);
      } else if (itemRefreshMode === 'remove') {
        this.items = this.items.filter(item => String(item._id) !== String(change.item));
      }

      if (typeof this.closePositionedMenusForRoot === 'function') {
        this.closePositionedMenusForRoot(document.getElementById('content'));
      }
      this.renderCurrentView();
      this.realtimeLastRefreshAt = Date.now();
      if (typeof this.announceA11y === 'function') {
        const message = change.message
          ? `Cambio remoto relacionado: ${change.message}`
          : 'Se actualizaron datos conectados desde otro tablero';
        this.announceA11y(message);
      }
    } catch (error) {
      console.warn('Related-board realtime refresh failed:', error.message);
      this.setRealtimeState(
        navigator.onLine === false ? 'offline' : 'connecting',
        navigator.onLine === false ? 'Sin conexión' : 'Reconectando…'
      );
    }
  };

  app.scheduleRelatedBoardRealtimeRefresh = function scheduleRelatedBoardRealtimeRefresh(change = {}, delay = 350) {
    const sourceBoardId = String(change.board || '');
    if (!sourceBoardId) return;
    if (!this.realtimeBoardAffectsCurrentBoard(change)) {
      this.clearRelatedBoardRealtimeQueue(sourceBoardId);
      return;
    }

    const now = Date.now();
    const pending = this.realtimeRelatedPendingChanges.get(sourceBoardId) || null;
    const startedAt = this.realtimeRelatedBatchStartedAt.get(sourceBoardId) || now;
    if (!pending) this.realtimeRelatedBatchStartedAt.set(sourceBoardId, startedAt);
    this.realtimeRelatedPendingChanges.set(sourceBoardId, this.mergeRealtimeChanges(pending, change));

    const previousTimer = this.realtimeRelatedTimers.get(sourceBoardId);
    if (previousTimer) clearTimeout(previousTimer);

    const elapsed = Math.max(0, now - startedAt);
    const remaining = Math.max(0, MAX_RELATED_BATCH_LATENCY_MS - elapsed);
    const boundedDelay = Math.max(0, Math.min(Number(delay) || 0, remaining));

    const timer = setTimeout(async () => {
      if (!this.realtimeBoardAffectsCurrentBoard(this.realtimeRelatedPendingChanges.get(sourceBoardId) || change)) {
        this.clearRelatedBoardRealtimeQueue(sourceBoardId);
        return;
      }
      if (this.realtimeInteractionInProgress() || this.realtimeRefreshing) {
        const retryTimer = setTimeout(() => {
          const retryChange = this.realtimeRelatedPendingChanges.get(sourceBoardId) || change;
          this.scheduleRelatedBoardRealtimeRefresh(retryChange, 0);
        }, INTERACTION_RETRY_MS);
        this.realtimeRelatedTimers.set(sourceBoardId, retryTimer);
        return;
      }

      const nextChange = this.realtimeRelatedPendingChanges.get(sourceBoardId) || change;
      this.clearRelatedBoardRealtimeQueue(sourceBoardId);
      await this.refreshRelatedBoardFromRealtime(nextChange);
    }, boundedDelay);

    this.realtimeRelatedTimers.set(sourceBoardId, timer);
  };

  app.scheduleRealtimeRefresh = function scheduleRealtimeRefreshWithRelations(change = {}, delay = 350) {
    if (this.realtimeIsGlobalChange(change)) return baseScheduleRealtimeRefresh(change, delay);

    const sourceBoardId = String(change.board || '');
    const currentBoardId = String(this.currentBoardId?.() || '');
    if (!sourceBoardId || sourceBoardId === currentBoardId) {
      return baseScheduleRealtimeRefresh(change, delay);
    }

    if (this.realtimeBoardAffectsCurrentBoard(change)) {
      return this.scheduleRelatedBoardRealtimeRefresh(change, delay);
    }
    this.clearRelatedBoardRealtimeQueue(sourceBoardId);
  };
})();