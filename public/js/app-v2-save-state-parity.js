(() => {
  const originalUpdateColumnValue = app.updateColumnValue.bind(app);
  const originalUpdateItem = app.updateItem.bind(app);
  const originalShowToast = app.showToast.bind(app);

  app.showToast = function showToastWithoutAutosaveNoise(message, isError = false) {
    if (!isError && message === 'Guardado') return;
    return originalShowToast(message, isError);
  };

  app.cellForSaveState = function cellForSaveState(itemId, columnId) {
    const row = document.querySelector(`#content tr[data-item-id="${CSS.escape(String(itemId))}"]`);
    if (!row) return null;
    if (columnId === '__name__') return row.querySelector('.element-cell');
    return row.querySelector(`.dynamic-cell[data-column-id="${CSS.escape(String(columnId))}"]`);
  };

  app.setCellSaveState = function setCellSaveState(itemId, columnId, state) {
    const cell = this.cellForSaveState(itemId, columnId);
    if (!cell) return;
    if (!state) {
      delete cell.dataset.saveState;
      return;
    }
    cell.dataset.saveState = state;
  };

  app.updateColumnValue = async function updateColumnValueWithCellState(id, columnId, value) {
    this.setCellSaveState(id, columnId, 'saving');
    const result = await originalUpdateColumnValue(id, columnId, value);
    if (!result) {
      this.setCellSaveState(id, columnId, 'error');
      setTimeout(() => this.setCellSaveState(id, columnId, ''), 1800);
      return result;
    }
    this.setCellSaveState(id, columnId, 'saved');
    setTimeout(() => this.setCellSaveState(id, columnId, ''), 850);
    return result;
  };

  app.updateItem = async function updateItemWithRowState(id, patch, rerender = false) {
    const nameOnly = patch && Object.keys(patch).length === 1 && Object.prototype.hasOwnProperty.call(patch, 'name');
    if (nameOnly) this.setCellSaveState(id, '__name__', 'saving');
    const result = await originalUpdateItem(id, patch, rerender);
    if (!nameOnly) return result;
    this.setCellSaveState(id, '__name__', result ? 'saved' : 'error');
    setTimeout(() => this.setCellSaveState(id, '__name__', ''), result ? 850 : 1800);
    return result;
  };
})();
