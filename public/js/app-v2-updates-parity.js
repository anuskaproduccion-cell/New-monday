(() => {
  const originalItemRowHtml = app.itemRowHtml.bind(app);
  const originalBindBoardEvents = app.bindBoardEvents.bind(app);
  const originalOpenUpdatesPanel = app.openUpdatesPanel?.bind(app);
  const originalSelectBoard = app.selectBoard.bind(app);

  app.updateCounts = new Map();

  app.updateThreadCount = function updateThreadCount(update) {
    return 1 + (Array.isArray(update?.replies) ? update.replies.length : 0);
  };

  app.loadBoardUpdateCounts = async function loadBoardUpdateCounts(boardId) {
    const sourceBoardId = String(boardId || '');
    if (!sourceBoardId) return false;

    try {
      const updates = await this.api(`/api/updates/board/${encodeURIComponent(sourceBoardId)}`);
      const counts = new Map();
      updates.forEach(update => {
        const itemId = String(update.item?._id || update.item || '');
        if (!itemId) return;
        counts.set(itemId, (counts.get(itemId) || 0) + this.updateThreadCount(update));
      });

      if (String(this.currentBoardId?.() || '') !== sourceBoardId) return false;
      this.updateCounts = counts;
      return true;
    } catch (err) {
      if (String(this.currentBoardId?.() || '') === sourceBoardId) this.updateCounts = new Map();
      console.warn('Could not load update counts:', err.message);
      return false;
    }
  };

  app.noteItemUpdateCount = function noteItemUpdateCount(itemId, updates) {
    const id = String(itemId || '');
    if (!id) return;
    const count = (updates || []).reduce((sum, update) => sum + this.updateThreadCount(update), 0);
    this.updateCounts.set(id, count);
    const button = document.querySelector(`[data-action="open-updates"][data-id="${CSS.escape(id)}"]`);
    if (!button) return;
    button.classList.toggle('has-updates', count > 0);
    const badge = button.querySelector('.item-updates-count');
    if (count > 0) {
      if (badge) badge.textContent = String(count);
      else button.insertAdjacentHTML('beforeend', `<span class="item-updates-count">${count}</span>`);
      button.title = `${count} actualización${count === 1 ? '' : 'es'} / respuestas`;
    } else {
      badge?.remove();
      button.title = 'Actualizaciones';
    }
  };

  app.selectBoard = async function selectBoardWithUpdateCounts(board) {
    const boardId = String(board?._id || '');
    this.updateCounts = new Map();
    const result = await originalSelectBoard(board);
    if (!boardId) return result;

    const applied = await this.loadBoardUpdateCounts(boardId);
    if (applied && String(this.currentBoardId?.() || '') === boardId) this.renderCurrentView?.();
    return result;
  };

  app.itemRowHtml = function itemRowHtmlWithUpdatesButton(item, group, columns) {
    let html = originalItemRowHtml(item, group, columns);
    const marker = `<input class="cell-input element-input" data-name-id="${item._id}"`;
    const count = Number(this.updateCounts.get(String(item._id)) || 0);
    const button = `<button class="item-updates-button ${count ? 'has-updates' : ''}" type="button" data-action="open-updates" data-id="${item._id}" aria-label="Abrir actualizaciones de ${this.escapeAttr(item.name || 'elemento')}" title="${count ? `${count} actualización${count === 1 ? '' : 'es'} / respuestas` : 'Actualizaciones'}"><span class="item-updates-icon">💬</span>${count ? `<span class="item-updates-count">${count}</span>` : ''}</button>`;
    if (html.includes(marker)) html = html.replace(marker, `${button}${marker}`);
    return html;
  };

  app.bindBoardEvents = function bindBoardEventsWithUpdatesButtons() {
    originalBindBoardEvents();
    const content = document.getElementById('content');
    content?.querySelectorAll('[data-action="open-updates"]').forEach(button => {
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        this.openUpdatesPanel(button.dataset.id);
      });
    });
  };

  if (originalOpenUpdatesPanel) {
    app.openUpdatesPanel = async function openUpdatesDrawer(itemId) {
      await originalOpenUpdatesPanel(itemId);
      document.querySelector('.modal-backdrop')?.classList.add('updates-drawer-backdrop');
      document.querySelector('.updates-modal')?.classList.add('updates-drawer');
    };
  }
})();
