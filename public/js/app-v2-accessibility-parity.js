(() => {
  const baseBindStaticEvents = app.bindStaticEvents.bind(app);
  const baseBindBoardEvents = app.bindBoardEvents.bind(app);
  const baseRenderViewTabs = app.renderViewTabs.bind(app);
  const baseRenderSidebar = app.renderSidebar.bind(app);

  app.accessibilityEventsBound = false;

  app.ensureA11yLiveRegion = function ensureA11yLiveRegion() {
    let live = document.getElementById('nm-a11y-live');
    if (!live) {
      live = document.createElement('div');
      live.id = 'nm-a11y-live';
      live.className = 'nm-visually-hidden';
      live.setAttribute('role', 'status');
      live.setAttribute('aria-live', 'polite');
      live.setAttribute('aria-atomic', 'true');
      document.body.appendChild(live);
    }
    return live;
  };

  app.announceA11y = function announceA11y(message) {
    const live = this.ensureA11yLiveRegion();
    live.textContent = '';
    requestAnimationFrame(() => { live.textContent = String(message || ''); });
  };

  app.openKeyboardHelp = function openKeyboardHelp() {
    this.openModal(`<div class="modal-card keyboard-help-modal" role="dialog" aria-modal="true" aria-labelledby="keyboard-help-title">
      <div class="modal-header"><div><h2 id="keyboard-help-title">Atajos de teclado</h2><p>Navegación tipo hoja de cálculo en New Monday.</p></div><button type="button" class="modal-close" data-close-modal aria-label="Cerrar">×</button></div>
      <div class="keyboard-help-grid">
        <div><kbd>← ↑ ↓ →</kbd><span>Moverse entre celdas</span></div>
        <div><kbd>Enter / F2</kbd><span>Editar o abrir la celda</span></div>
        <div><kbd>Esc</kbd><span>Salir del editor y volver a la celda</span></div>
        <div><kbd>Inicio / Fin</kbd><span>Primera / última columna</span></div>
        <div><kbd>Ctrl/⌘ + Inicio / Fin</kbd><span>Primera / última celda del tablero</span></div>
        <div><kbd>Page Up / Page Down</kbd><span>Saltar 10 filas</span></div>
        <div><kbd>Espacio</kbd><span>Seleccionar o deseleccionar la fila</span></div>
        <div><kbd>Ctrl/⌘ + C / V</kbd><span>Copiar / pegar celda o rango</span></div>
        <div><kbd>Ctrl/⌘ + K</kbd><span>Buscar en el tablero</span></div>
        <div><kbd>Ctrl/⌘ + /</kbd><span>Abrir esta ayuda</span></div>
      </div>
      <div class="modal-actions"><button type="button" class="button primary" data-close-modal>Cerrar</button></div>
    </div>`);
    const firstClose = document.querySelector('.keyboard-help-modal [data-close-modal]');
    requestAnimationFrame(() => firstClose?.focus());
  };

  app.bindStaticEvents = function bindStaticEventsWithAccessibility() {
    baseBindStaticEvents();
    if (this.accessibilityEventsBound) return;
    this.accessibilityEventsBound = true;
    this.ensureA11yLiveRegion();

    document.addEventListener('keydown', event => {
      const editing = event.target?.matches?.('input,textarea,select,[contenteditable="true"]');
      if ((event.metaKey || event.ctrlKey) && event.key === '/') {
        event.preventDefault();
        this.openKeyboardHelp();
        return;
      }
      if (!editing && event.key === '?' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        this.openKeyboardHelp();
      }
    });

    document.addEventListener('keydown', event => {
      const control = event.target?.closest?.('.dynamic-cell input,.dynamic-cell textarea,.dynamic-cell select,.dynamic-cell [contenteditable="true"]');
      if (!control || event.key !== 'Escape') return;
      const cell = control.closest('.dynamic-cell');
      if (!cell) return;
      event.preventDefault();
      event.stopPropagation();
      control.blur?.();
      cell.focus({ preventScroll: true });
      const row = cell.closest('.item-row');
      this.setActiveCell?.(row?.dataset.itemId, cell.dataset.columnId, { focus: false });
      this.announceA11y('Edición cerrada');
    }, true);
  };

  app.renderViewTabs = function renderViewTabsAccessible() {
    baseRenderViewTabs();
    const host = document.getElementById('view-tabs');
    if (!host) return;
    host.setAttribute('role', 'tablist');
    host.querySelectorAll('.view-tab[data-view]').forEach(tab => {
      const selected = String(tab.dataset.view) === String(this.currentView);
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', selected ? 'true' : 'false');
      tab.tabIndex = selected ? 0 : -1;
      tab.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        const tabs = [...host.querySelectorAll('.view-tab[data-view]')].filter(node => node.offsetParent !== null);
        const index = tabs.indexOf(tab);
        if (index < 0 || !tabs.length) return;
        event.preventDefault();
        let nextIndex = index;
        if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
        if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
        if (event.key === 'Home') nextIndex = 0;
        if (event.key === 'End') nextIndex = tabs.length - 1;
        tabs[nextIndex].focus();
      });
    });
  };

  app.renderSidebar = function renderSidebarAccessible() {
    baseRenderSidebar();
    document.querySelectorAll('#sidebar-nav .sidebar-nav-item').forEach(button => {
      if (button.classList.contains('active')) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
  };

  app.keyboardVisibleItems = function keyboardVisibleItems() {
    const groups = this.effectiveGroups();
    return this.filteredBoardItems().filter(item => {
      const group = groups.find(entry => String(entry.id) === String(item.groupId) || String(entry.title) === String(item.group));
      return !group || !this.collapsedGroups.has(group.id);
    });
  };

  app.accessibilityRowIndexForItem = function accessibilityRowIndexForItem(itemId, fallback = 2) {
    if (this.virtualBoardEnabled && this.virtualItemPositions instanceof Map) {
      const position = this.virtualItemPositions.get(String(itemId));
      if (position && Number.isFinite(Number(position.index))) return Number(position.index) + 2;
    }
    return Number(fallback) || 2;
  };

  app.focusModelCell = function focusModelCell(itemId, columnId, announcement = '') {
    if (!itemId || !columnId) return;
    if (typeof this.ensureVirtualItemRendered === 'function') this.ensureVirtualItemRendered(itemId);
    const focus = () => {
      this.setActiveCell?.(itemId, columnId, { focus: false });
      const cell = this.currentActiveCellElement?.();
      if (!cell) return;
      cell.tabIndex = 0;
      cell.focus({ preventScroll: true });
      cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      if (announcement) this.announceA11y(announcement);
    };
    requestAnimationFrame(focus);
  };

  app.moveAccessibleCell = function moveAccessibleCell(key, itemId, columnId) {
    const items = this.keyboardVisibleItems();
    const columns = this.effectiveColumns();
    let rowIndex = items.findIndex(item => String(item._id) === String(itemId));
    let columnIndex = columns.findIndex(column => String(column.id) === String(columnId));
    if (rowIndex < 0 || columnIndex < 0 || !items.length || !columns.length) return;

    if (key === 'ArrowLeft') columnIndex = Math.max(0, columnIndex - 1);
    if (key === 'ArrowRight') columnIndex = Math.min(columns.length - 1, columnIndex + 1);
    if (key === 'ArrowUp') rowIndex = Math.max(0, rowIndex - 1);
    if (key === 'ArrowDown') rowIndex = Math.min(items.length - 1, rowIndex + 1);
    if (key === 'Home') columnIndex = 0;
    if (key === 'End') columnIndex = columns.length - 1;
    if (key === 'PageUp') rowIndex = Math.max(0, rowIndex - 10);
    if (key === 'PageDown') rowIndex = Math.min(items.length - 1, rowIndex + 10);
    if (key === 'CtrlHome') { rowIndex = 0; columnIndex = 0; }
    if (key === 'CtrlEnd') { rowIndex = items.length - 1; columnIndex = columns.length - 1; }

    const nextItem = items[rowIndex];
    const nextColumn = columns[columnIndex];
    this.focusModelCell(nextItem?._id, nextColumn?.id, `${nextItem?.name || 'Elemento'}, ${nextColumn?.title || 'columna'}`);
  };

  app.toggleKeyboardRowSelection = function toggleKeyboardRowSelection(itemId, columnId) {
    const id = String(itemId || '');
    if (!id) return;
    if (this.selectedItems.has(id)) this.selectedItems.delete(id);
    else this.selectedItems.add(id);
    const selected = this.selectedItems.has(id);
    this.renderBoard();
    this.focusModelCell(id, columnId, selected ? 'Fila seleccionada' : 'Fila deseleccionada');
  };

  app.decorateBoardAccessibility = function decorateBoardAccessibility() {
    const content = document.getElementById('content');
    if (!content) return;
    const columns = this.effectiveColumns();
    const fallbackRowIndexes = new Map();

    content.querySelectorAll('table.board-table').forEach(table => {
      table.setAttribute('role', 'grid');
      table.setAttribute('aria-colcount', String(columns.length + 3));
      table.querySelectorAll('thead tr').forEach(row => row.setAttribute('role', 'row'));
      table.querySelectorAll('th').forEach(header => {
        header.setAttribute('role', 'columnheader');
        header.setAttribute('scope', 'col');
      });
      let localRowIndex = 2;
      const tableRows = [...table.querySelectorAll('.item-row[data-item-id]')];
      tableRows.forEach(row => fallbackRowIndexes.set(row, localRowIndex++));
      if (!table.hasAttribute('aria-rowcount')) table.setAttribute('aria-rowcount', String(tableRows.length + 1));
    });

    const renderedRows = [...content.querySelectorAll('.item-row[data-item-id]')];
    const activeRendered = Boolean(this.activeCell && renderedRows.some(row => {
      if (String(row.dataset.itemId || '') !== String(this.activeCell?.itemId || '')) return false;
      return Boolean(row.querySelector(`.dynamic-cell[data-column-id="${CSS.escape(String(this.activeCell?.columnId || ''))}"]`));
    }));

    if ((!this.activeCell || !activeRendered) && renderedRows.length && columns.length) {
      this.activeCell = { itemId: String(renderedRows[0].dataset.itemId), columnId: String(columns[0].id) };
    }

    renderedRows.forEach(row => {
      const itemId = String(row.dataset.itemId || '');
      const item = this.findItem?.(itemId);
      const selected = this.selectedItems.has(itemId);
      row.setAttribute('role', 'row');
      row.setAttribute('aria-rowindex', String(this.accessibilityRowIndexForItem(itemId, fallbackRowIndexes.get(row) || 2)));
      row.setAttribute('aria-selected', selected ? 'true' : 'false');
      row.classList.toggle('selected', selected);

      row.querySelectorAll('.dynamic-cell[data-column-id]').forEach(cell => {
        const columnId = String(cell.dataset.columnId || '');
        const columnIndex = columns.findIndex(entry => String(entry.id) === columnId);
        const column = columnIndex >= 0 ? columns[columnIndex] : null;
        const active = String(this.activeCell?.itemId || '') === itemId && String(this.activeCell?.columnId || '') === columnId;
        const valueText = cell.innerText?.trim().replace(/\s+/g, ' ') || '';
        cell.setAttribute('role', 'gridcell');
        if (columnIndex >= 0) cell.setAttribute('aria-colindex', String(columnIndex + 4));
        cell.setAttribute('aria-selected', active ? 'true' : 'false');
        cell.setAttribute('aria-label', `${column?.title || 'Columna'} · ${item?.name || 'Elemento'}${valueText ? ` · ${valueText}` : ''}`);
        cell.tabIndex = active ? 0 : -1;

        if (cell.dataset.a11yBound === 'true') return;
        cell.dataset.a11yBound = 'true';
        cell.addEventListener('focus', () => {
          this.setActiveCell?.(itemId, columnId, { focus: false });
          content.querySelectorAll('.dynamic-cell[aria-selected="true"]').forEach(node => {
            if (node !== cell) node.setAttribute('aria-selected', 'false');
          });
          cell.setAttribute('aria-selected', 'true');
        });
        cell.addEventListener('keydown', event => {
          const editing = event.target !== cell;
          if (editing) return;
          const ctrl = event.ctrlKey || event.metaKey;
          let command = null;
          if (ctrl && event.key === 'Home') command = 'CtrlHome';
          else if (ctrl && event.key === 'End') command = 'CtrlEnd';
          else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) command = event.key;
          if (command) {
            event.preventDefault();
            event.stopPropagation();
            this.moveAccessibleCell(command, itemId, columnId);
            return;
          }
          if (event.key === ' ' && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault();
            event.stopPropagation();
            this.toggleKeyboardRowSelection(itemId, columnId);
            return;
          }
          if (event.key === 'F2' || event.key === 'Enter') {
            const control = cell.querySelector('input:not([readonly]):not([disabled]),textarea:not([readonly]):not([disabled]),select:not([disabled]),button:not([disabled])');
            if (!control) return;
            event.preventDefault();
            event.stopPropagation();
            if (control.tagName === 'BUTTON') control.click();
            else { control.focus(); control.select?.(); }
          }
        });
      });
    });
  };

  app.bindBoardEvents = function bindBoardEventsAccessible() {
    baseBindBoardEvents();
    this.decorateBoardAccessibility();
  };
})();
