(() => {
  app.connectRealtime = function connectRealtimeWithoutOwnEcho() {
    if (!window.EventSource) {
      this.setRealtimeState('unsupported', 'Actualización manual');
      return;
    }
    if (this.realtimeSource) this.realtimeSource.close();
    this.setRealtimeState('connecting', navigator.onLine === false ? 'Sin conexión' : 'Conectando…');

    const clientId = encodeURIComponent(String(this.clientSessionId || ''));
    const streamUrl = clientId ? `/api/realtime/stream?clientId=${clientId}` : '/api/realtime/stream';
    const source = new EventSource(streamUrl);
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
})();
