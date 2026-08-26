(() => {
  const conflictMessage = 'La celda cambió en otra sesión. Recargué los datos para evitar sobrescribir cambios.';

  app.localMutationsInFlight = Number(app.localMutationsInFlight || 0);
  app.localMutationEpoch = Number(app.localMutationEpoch || 0);

  app.beginLocalMutation = function beginLocalMutation() {
    this.localMutationsInFlight = Number(this.localMutationsInFlight || 0) + 1;
    this.localMutationEpoch = Number(this.localMutationEpoch || 0) + 1;
  };

  app.endLocalMutation = function endLocalMutation() {
    this.localMutationsInFlight = Math.max(0, Number(this.localMutationsInFlight || 0) - 1);
  };

  app.hasLocalMutationInFlight = function hasLocalMutationInFlight() {
    return Number(this.localMutationsInFlight || 0) > 0;
  };

  app.localMutationVersion = function localMutationVersion() {
    return Number(this.localMutationEpoch || 0);
  };

  app.updateColumnValue = async function updateColumnValueConcurrentSafe(id, columnId, value) {
    this.beginLocalMutation();
    try {
      const current = this.findItem(id);
      if (!current?.updatedAt) {
        await this.reloadItems();
      }

      const expected = this.findItem(id)?.updatedAt;
      if (!expected) {
        this.showToast('No se pudo verificar la versión actual de la celda', true);
        return null;
      }

      const response = await this.api(`/api/items/${id}/columns/${encodeURIComponent(columnId)}/conditional`, {
        method: 'PATCH',
        body: JSON.stringify({ value, expectedUpdatedAt: expected })
      });

      this.replaceItem(response.item);
      if (response.cascaded?.length) {
        await this.reloadItems();
        this.showToast(`${response.cascaded.length} dependencias desplazadas`);
      } else {
        this.showToast('Guardado');
      }
      return response.item;
    } catch (err) {
      if (String(err?.message || '').includes('otra sesión') || String(err?.message || '').includes('EDIT_CONFLICT')) {
        await this.reloadItems().catch(() => {});
        this.renderCurrentView();
        this.showToast(conflictMessage, true);
        return null;
      }
      this.showToast(err.message, true);
      return null;
    } finally {
      this.endLocalMutation();
    }
  };
})();
