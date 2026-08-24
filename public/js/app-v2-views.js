(() => {
  let draggedViewId = null;
  let draggedButton = null;
  let saving = false;

  function savedViewButtons(host) {
    return [...host.querySelectorAll('.view-tab[data-view^="saved:"]')];
  }

  function viewId(button) {
    return String(button?.dataset?.view || '').replace(/^saved:/, '');
  }

  function syncLocalViews(nextViews) {
    if (!Array.isArray(nextViews) || !app.currentBoard) return;
    app.currentBoard.views = nextViews;
    const cached = app.boards.find(board => String(board._id) === String(app.currentBoard._id));
    if (cached) cached.views = nextViews;
  }

  async function persistOrder(host) {
    if (saving || !app.currentBoard?._id) return;
    const ids = savedViewButtons(host).map(viewId).filter(Boolean);
    if (ids.length < 2) return;

    saving = true;
    host.classList.add('view-tabs-saving');
    try {
      const nextViews = await app.api(`/api/boards/${app.currentBoard._id}/views/reorder`, {
        method: 'POST',
        body: JSON.stringify({ viewIds: ids })
      });
      syncLocalViews(nextViews);
      app.renderViewTabs();
    } catch (error) {
      console.error('Could not reorder views:', error);
      app.renderViewTabs();
    } finally {
      saving = false;
      host.classList.remove('view-tabs-saving');
    }
  }

  function moveButton(button, direction) {
    const host = button.parentElement;
    if (!host) return false;
    const buttons = savedViewButtons(host);
    const index = buttons.indexOf(button);
    if (index < 0) return false;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= buttons.length) return false;
    const target = buttons[targetIndex];
    if (direction < 0) host.insertBefore(button, target);
    else host.insertBefore(button, target.nextSibling);
    return true;
  }

  function decorateViewTabs() {
    const host = document.getElementById('view-tabs');
    if (!host || !app.currentBoard) return;

    const buttons = savedViewButtons(host);
    buttons.forEach(button => {
      button.draggable = buttons.length > 1;
      button.classList.add('view-tab-draggable');
      button.setAttribute('aria-roledescription', 'pestaña reordenable');
      button.title = `${button.textContent.trim()} · arrastra para reordenar · Alt+←/→`;

      button.addEventListener('dragstart', event => {
        draggedViewId = viewId(button);
        draggedButton = button;
        button.classList.add('view-tab-dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', draggedViewId);
      });

      button.addEventListener('dragend', () => {
        button.classList.remove('view-tab-dragging');
        host.querySelectorAll('.view-tab-drop-before,.view-tab-drop-after').forEach(node => {
          node.classList.remove('view-tab-drop-before', 'view-tab-drop-after');
        });
        draggedViewId = null;
        draggedButton = null;
      });

      button.addEventListener('dragover', event => {
        if (!draggedButton || draggedButton === button) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        const rect = button.getBoundingClientRect();
        const before = event.clientX < rect.left + rect.width / 2;
        button.classList.toggle('view-tab-drop-before', before);
        button.classList.toggle('view-tab-drop-after', !before);
      });

      button.addEventListener('dragleave', () => {
        button.classList.remove('view-tab-drop-before', 'view-tab-drop-after');
      });

      button.addEventListener('drop', async event => {
        if (!draggedButton || draggedButton === button) return;
        event.preventDefault();
        const rect = button.getBoundingClientRect();
        const before = event.clientX < rect.left + rect.width / 2;
        host.insertBefore(draggedButton, before ? button : button.nextSibling);
        button.classList.remove('view-tab-drop-before', 'view-tab-drop-after');
        await persistOrder(host);
      });

      button.addEventListener('keydown', async event => {
        if (!event.altKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        const moved = moveButton(button, event.key === 'ArrowLeft' ? -1 : 1);
        if (!moved) return;
        await persistOrder(host);
        const refreshed = document.querySelector(`.view-tab[data-view="saved:${CSS.escape(viewId(button))}"]`);
        refreshed?.focus();
      });
    });
  }

  const originalRenderViewTabs = app.renderViewTabs.bind(app);
  app.renderViewTabs = function renderViewTabsWithOrdering() {
    originalRenderViewTabs();
    decorateViewTabs();
  };

  if (app.currentBoard) decorateViewTabs();
})();
