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
    if (String(method || 'GET').toUpperCase() !== 'PATCH') return false;
    return /^\/api\/items\/[^/?]+\/columns\/[^/?]+\/conditional(?:\?|$)/.test(String(url || ''));
  };

  app.api = async function apiWithLocalMutationTracking(url, options = {}) {
    const method = String(options?.method || 'GET').toUpperCase();
    const isMutation = !READ_METHODS.has(method);
    const headers = { ...(options.headers || {}) };
    if (this.realtimeOwnEchoSafeRequest(url, method)) {
      headers['X-New-Monday-Client-Id'] = this.clientSessionId;
    }

    if (isMutation && typeof this.beginLocalMutation === 'function') this.beginLocalMutation();
    try {
      return await baseApi(url, { ...options, headers });
    } finally {
      if (isMutation && typeof this.endLocalMutation === 'function') this.endLocalMutation();
    }
  };
})();
