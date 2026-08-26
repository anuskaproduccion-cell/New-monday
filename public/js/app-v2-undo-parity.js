(() => {
  const MAX_HISTORY = 50;
  const baseUpdateColumnValue = app.updateColumnValue.bind(app);
  const baseRenderBoard = app.renderBoard.bind(app);

  app.undoStack = [];
  app.redoStack = [];

  app.historyClone = function historyClone(value) {
    if (value === undefined) return null;
    try { return JSON.parse(JSON.stringify(value)); } catch { return value; }
  };

  app.historyEqual = function historyEqual(left, right) {
    try { return JSON.stringify(left ?? null) === JSON.stringify(right ?? null); }
    catch { return left === right; }
  };

  app.pushCellHistory = function pushCellHistory(action) {
    if (!action || this.historyEqual(action.before, action.after)) return;
    this.undoStack.push(action);
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.splice(0, this.undoStack.length - MAX_HISTORY);
    this.redoStack = [];
    this.refreshUndoControls();
  };

  app.updateColumnValue = async function updateColumnValueWithHistory(id, columnId, value) {
    const itemBefore = this.findItem(id);
    const column = this.effectiveColumns().find(entry => String(entry.id) === String(columnId));
    const before = this.historyClone(itemBefore && column ? this.valueFor(itemBefore, column) : itemBefore?.columnValues?.[columnId]);
    const result = await baseUpdateColumnValue(id, columnId, value);
    if (!result) return result;
    const itemAfter = this.findItem(id);
    const after = this.historyClone(itemAfter && column ? this.valueFor(itemAfter, column) : itemAfter?.columnValues?.[columnId]);
    this.pushCellHistory({
      kind: 'column',
      itemId: String(id),
      columnId: String(columnId),
      columnTitle: column?.title || String(columnId),
      itemName: itemAfter?.name || itemBefore?.name || 'Elemento',
      before,
      after
    });
    return result;
  };

  app.applyHistoryAction = async function applyHistoryAction(action, direction) {
    if (!action || action.kind !== 'column') return false;
    const item = this.findItem(action.itemId);
    const column = this.effectiveColumns().find(entry => String(entry.id) === String(action.columnId));
    if (!item || !column) {
      this.showToast('No se puede aplicar el historial: la celda ya no existe', true);
      return false;
    }

    const expected = direction === 'undo' ? action.after : action.before;
    const target = direction === 'undo' ? action.before : action.after;
    const current = this.historyClone(this.valueFor(item, column));
    if (!this.historyEqual(current, expected)) {
      this.showToast('No se puede deshacer: la celda cambió después de esta edición', true);
      return false;
    }

    const result = await baseUpdateColumnValue(action.itemId, action.columnId, this.historyClone(target));
    if (!result) return false;
    this.renderCurrentView();
    return true;
  };

  app.undoLastChange = async function undoLastChange() {
    const action = this.undoStack.pop();
    if (!action) return;
    const ok = await this.applyHistoryAction(action, 'undo');
    if (ok) {
      this.redoStack.push(action);
      this.showToast(`Deshecho · ${action.itemName} · ${action.columnTitle}`);
    } else {
      this.undoStack.push(action);
    }
    this.refreshUndoControls();
  };

  app.redoLastChange = async function redoLastChange() {
    const action = this.redoStack.pop();
    if (!action) return;
    const ok = await this.applyHistoryAction(action, 'redo');
    if (ok) {
      this.undoStack.push(action);
      this.showToast(`Rehecho · ${action.itemName} · ${action.columnTitle}`);
    } else {
      this.redoStack.push(action);
    }
    this.refreshUndoControls();
  };

  app.refreshUndoControls = function refreshUndoControls() {
    const undo = document.querySelector('[data-history-undo]');
    const redo = document.querySelector('[data-history-redo]');
    if (undo) {
      undo.disabled = this.undoStack.length === 0;
      undo.title = this.undoStack.length ? `Deshacer: ${this.undoStack[this.undoStack.length - 1].columnTitle} · Ctrl/Cmd+Z` : 'Nada que deshacer';
    }
    if (redo) {
      redo.disabled = this.redoStack.length === 0;
      redo.title = this.redoStack.length ? `Rehacer: ${this.redoStack[this.redoStack.length - 1].columnTitle} · Ctrl/Cmd+Shift+Z` : 'Nada que rehacer';
    }
  };

  app.decorateUndoControls = function decorateUndoControls() {
    const toolbar = document.querySelector('#content .board-toolbar');
    if (!toolbar || toolbar.querySelector('.history-controls')) return;
    const controls = document.createElement('div');
    controls.className = 'history-controls';
    controls.innerHTML = '<button type="button" data-history-undo aria-label="Deshacer">↶</button><button type="button" data-history-redo aria-label="Rehacer">↷</button>';
    controls.querySelector('[data-history-undo]')?.addEventListener('click', () => this.undoLastChange());
    controls.querySelector('[data-history-redo]')?.addEventListener('click', () => this.redoLastChange());
    toolbar.appendChild(controls);
    this.refreshUndoControls();
  };

  app.renderBoard = function renderBoardWithHistoryControls() {
    baseRenderBoard();
    this.decorateUndoControls();
  };

  document.addEventListener('keydown', event => {
    const editable = event.target?.matches?.('input,textarea,select,[contenteditable="true"]');
    if (editable || !(event.ctrlKey || event.metaKey)) return;
    const key = String(event.key || '').toLowerCase();
    if (key === 'z' && event.shiftKey) {
      event.preventDefault();
      app.redoLastChange();
    } else if (key === 'z') {
      event.preventDefault();
      app.undoLastChange();
    } else if (key === 'y') {
      event.preventDefault();
      app.redoLastChange();
    }
  });
})();
