(() => {
  const previousBindBoardEvents = app.bindBoardEvents.bind(app);

  app.columnWidthPx = function columnWidthPx(column) {
    const raw = Number(column?.settings?.widthPx ?? column?.settings?.width ?? 0);
    return Number.isFinite(raw) && raw >= 80 && raw <= 720 ? Math.round(raw) : null;
  };

  app.applyColumnWidths = function applyColumnWidths() {
    const content = document.getElementById('content');
    if (!content) return;
    this.effectiveColumns().forEach(column => {
      const width = this.columnWidthPx(column);
      if (!width) return;
      content.querySelectorAll(`[data-column-id="${CSS.escape(String(column.id))}"]`).forEach(cell => {
        cell.style.width = `${width}px`;
        cell.style.minWidth = `${width}px`;
        cell.style.maxWidth = `${width}px`;
      });
    });
  };

  app.setLiveColumnWidth = function setLiveColumnWidth(columnId, width) {
    const safe = Math.max(80, Math.min(720, Math.round(width)));
    document.querySelectorAll(`#content [data-column-id="${CSS.escape(String(columnId))}"]`).forEach(cell => {
      cell.style.width = `${safe}px`;
      cell.style.minWidth = `${safe}px`;
      cell.style.maxWidth = `${safe}px`;
    });
    return safe;
  };

  app.startColumnResize = function startColumnResize(event, handle) {
    event.preventDefault();
    event.stopPropagation();
    const header = handle.closest('.dynamic-col-head');
    const columnId = header?.dataset.columnId;
    const column = this.effectiveColumns().find(entry => String(entry.id) === String(columnId));
    if (!header || !column) return;

    const startX = event.clientX;
    const startWidth = header.getBoundingClientRect().width;
    let nextWidth = startWidth;
    handle.setPointerCapture?.(event.pointerId);
    document.body.classList.add('is-resizing-column');
    handle.classList.add('is-active');

    const onMove = moveEvent => {
      nextWidth = this.setLiveColumnWidth(columnId, startWidth + (moveEvent.clientX - startX));
    };

    const onUp = async upEvent => {
      handle.releasePointerCapture?.(upEvent.pointerId);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.body.classList.remove('is-resizing-column');
      handle.classList.remove('is-active');
      const current = (this.currentBoard?.columns || []).find(entry => String(entry.id) === String(columnId)) || column;
      const settings = { ...(current.settings || {}), widthPx: Math.round(nextWidth) };
      await this.patchColumn(columnId, { settings });
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp, { once: true });
  };

  app.bindBoardEvents = function bindBoardEventsWithColumnResize() {
    previousBindBoardEvents();
    const content = document.getElementById('content');
    if (!content) return;

    content.querySelectorAll('.dynamic-col-head[data-column-id]').forEach(header => {
      if (header.querySelector('.column-resize-handle')) return;
      const handle = document.createElement('span');
      handle.className = 'column-resize-handle';
      handle.dataset.columnResize = header.dataset.columnId;
      handle.setAttribute('role', 'separator');
      handle.setAttribute('aria-orientation', 'vertical');
      handle.title = 'Arrastra para cambiar el ancho';
      handle.addEventListener('pointerdown', event => this.startColumnResize(event, handle));
      header.appendChild(handle);
    });

    this.applyColumnWidths();
  };
})();
