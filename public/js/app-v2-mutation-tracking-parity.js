(() => {
  const baseApi = app.api.bind(app);
  const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

  app.clientSessionId = String(app.clientSessionId || (() => {
    try {
      if (globalThis.crypto?.randomUUID) return `nm-${globalThis.crypto.randomUUID()}`;
    } catch { /* fallback below */ }
    return `nm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  })());

  app.realtimeOwnEchoSafeRequest = function realtimeOwnEchoSafeRequest(url, method = 'GET') {
    const normalizedMethod = String(method || 'GET').toUpperCase();
    const normalizedUrl = String(url || '');

    if (
      normalizedMethod === 'PATCH'
      && /^\/api\/items\/[^/?]+\/columns\/[^/?]+\/conditional(?:\?|$)/.test(normalizedUrl)
    ) return true;

    if (normalizedMethod === 'POST' && /^\/api\/items(?:\?|$)/.test(normalizedUrl)) return true;
    if (
      normalizedMethod === 'POST'
      && /^\/api\/items\/[^/?]+\/(?:move|archive|unarchive|restore)(?:\?|$)/.test(normalizedUrl)
    ) return true;
    if (
      normalizedMethod === 'POST'
      && /^\/api\/item-ordering\/reorder(?:\?|$)/.test(normalizedUrl)
    ) return true;
    if (normalizedMethod === 'DELETE' && /^\/api\/items\/[^/?]+(?:\?|$)/.test(normalizedUrl)) return true;

    return false;
  };

  app.realtimeOwnEchoSourceBoardId = function realtimeOwnEchoSourceBoardId(url, method = 'GET', options = {}) {
    const normalizedMethod = String(method || 'GET').toUpperCase();
    const normalizedUrl = String(url || '');
    let body = options?.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = null; }
    }

    if (normalizedMethod === 'POST' && /^\/api\/item-ordering\/reorder(?:\?|$)/.test(normalizedUrl)) {
      const orderingBoardId = body?.boardId;
      if (orderingBoardId) return String(orderingBoardId);
    }

    if (normalizedMethod === 'POST' && /^\/api\/items(?:\?|$)/.test(normalizedUrl)) {
      const itemBoardId = body?.board?._id || body?.board;
      if (itemBoardId) return String(itemBoardId);
    }

    return String(this.currentBoardId?.() || '');
  };

  app.realtimeOwnEchoChangeForRequest = function realtimeOwnEchoChangeForRequest(url, method = 'GET', response = null) {
    const normalizedMethod = String(method || 'GET').toUpperCase();
    const normalizedUrl = String(url || '');
    let match = null;

    if (
      normalizedMethod === 'PATCH'
      && (match = normalizedUrl.match(/^\/api\/items\/([^/?]+)\/columns\/([^/?]+)\/conditional(?:\?|$)/))
    ) {
      return {
        scope: 'board',
        item: decodeURIComponent(match[1]),
        type: 'column_value_changed',
        field: decodeURIComponent(match[2]),
        meta: { cascadedCount: Array.isArray(response?.cascaded) ? response.cascaded.length : 0 }
      };
    }

    if (normalizedMethod === 'POST' && /^\/api\/items(?:\?|$)/.test(normalizedUrl)) {
      const item = response?.item || response || {};
      return {
        scope: 'board',
        item: item?._id ? String(item._id) : null,
        type: item?.isSubitem ? 'subitem_created' : 'item_created',
        meta: {}
      };
    }

    if (
      normalizedMethod === 'POST'
      && (match = normalizedUrl.match(/^\/api\/items\/([^/?]+)\/(move|archive|unarchive|restore)(?:\?|$)/))
    ) {
      const typeByAction = {
        move: 'item_moved',
        archive: 'item_archived',
        unarchive: 'item_unarchived',
        restore: 'item_restored'
      };
      return {
        scope: 'board',
        item: decodeURIComponent(match[1]),
        type: typeByAction[match[2]] || 'item_updated',
        meta: {}
      };
    }

    if (normalizedMethod === 'DELETE' && (match = normalizedUrl.match(/^\/api\/items\/([^/?]+)(?:\?|$)/))) {
      return {
        scope: 'board',
        item: String(response?.item?._id || decodeURIComponent(match[1])),
        type: 'item_trashed',
        meta: {}
      };
    }

    if (normalizedMethod === 'POST' && /^\/api\/item-ordering\/reorder(?:\?|$)/.test(normalizedUrl)) {
      return {
        scope: 'board',
        item: null,
        type: 'item_ordering_changed',
        meta: {}
      };
    }

    return null;
  };

  app.reconcileOwnEchoAfterCrossBoardNavigation = function reconcileOwnEchoAfterCrossBoardNavigation({
    url,
    method,
    response,
    sourceBoardId
  } = {}) {
    const sourceId = String(sourceBoardId || '');
    const currentId = String(this.currentBoardId?.() || '');
    if (!sourceId || !currentId || sourceId === currentId) return false;
    if (typeof this.realtimeBoardAffectsCurrentBoard !== 'function') return false;
    if (typeof this.scheduleRelatedBoardRealtimeRefresh !== 'function') return false;

    const change = this.realtimeOwnEchoChangeForRequest(url, method, response);
    if (!change) return false;
    change.board = sourceId;
    if (!this.realtimeBoardAffectsCurrentBoard(change)) return false;

    this.scheduleRelatedBoardRealtimeRefresh(change, 0);
    return true;
  };

  app.api = async function apiWithLocalMutationTracking(url, options = {}) {
    const method = String(options?.method || 'GET').toUpperCase();
    const isMutation = !READ_METHODS.has(method);
    const ownEchoSafe = this.realtimeOwnEchoSafeRequest(url, method);
    const sourceBoardId = ownEchoSafe ? this.realtimeOwnEchoSourceBoardId(url, method, options) : '';
    const headers = { ...(options.headers || {}) };
    if (ownEchoSafe) headers['X-New-Monday-Client-Id'] = this.clientSessionId;

    let response = null;
    let succeeded = false;
    if (isMutation && typeof this.beginLocalMutation === 'function') this.beginLocalMutation();
    try {
      response = await baseApi(url, { ...options, headers });
      succeeded = true;
      return response;
    } finally {
      if (isMutation && typeof this.endLocalMutation === 'function') this.endLocalMutation();
      if (succeeded && ownEchoSafe) {
        try {
          this.reconcileOwnEchoAfterCrossBoardNavigation({ url, method, response, sourceBoardId });
        } catch (error) {
          console.warn('Cross-board own-echo reconciliation failed:', error?.message || error);
        }
      }
    }
  };
})();
