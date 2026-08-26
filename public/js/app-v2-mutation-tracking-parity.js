(() => {
  const baseApi = app.api.bind(app);
  const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

  app.api = async function apiWithLocalMutationTracking(url, options = {}) {
    const method = String(options?.method || 'GET').toUpperCase();
    const isMutation = !READ_METHODS.has(method);
    if (isMutation && typeof this.beginLocalMutation === 'function') this.beginLocalMutation();
    try {
      return await baseApi(url, options);
    } finally {
      if (isMutation && typeof this.endLocalMutation === 'function') this.endLocalMutation();
    }
  };
})();
