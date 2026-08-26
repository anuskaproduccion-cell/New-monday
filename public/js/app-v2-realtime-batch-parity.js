(() => {
  const baseNeedsFullShellRefresh = app.realtimeNeedsFullShellRefresh.bind(app);
  const baseItemRefreshMode = app.realtimeItemRefreshMode.bind(app);

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
})();
