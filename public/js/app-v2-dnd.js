(() => {
  const originalBindBoardEvents = app.bindBoardEvents.bind(app);
  const originalOpenItemMenu = app.openItemMenu.bind(app);

  app.bindBoardEvents = function bindBoardEventsWithDragDrop() {
    originalBindBoardEvents();
    const content = document.getElementById('content');
    if (!content) return;

    let draggedItemId = null;
    let draggedGroupId = null;
    let draggedColumnId = null;

    content.querySelectorAll('.item-row').forEach(row => {
      row.draggable = true;
      row.addEventListener('dragstart', event => {
        if (event.target.closest('input,select,button,textarea,a')) {
          event.preventDefault();
          return;
        }
        draggedItemId = row.dataset.itemId;
        row.classList.add('is-drag-source');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', draggedItemId);
      });
      row.addEventListener('dragend', () => row.classList.remove('is-drag-source'));
      row.addEventListener('dragover', event => {
        if (!draggedItemId || draggedItemId === row.dataset.itemId) return;
        event.preventDefault();
        row.classList.add('is-drop-target');
      });
      row.addEventListener('dragleave', () => row.classList.remove('is-drop-target'));
      row.addEventListener('drop', async event => {
        if (!draggedItemId || draggedItemId === row.dataset.itemId) return;
        event.preventDefault();
        row.classList.remove('is-drop-target');
        const targetId = row.dataset.itemId;
        await app.reorderItemByDrop(draggedItemId, targetId);
        draggedItemId = null;
      });
    });

    content.querySelectorAll('.group-section').forEach(section => {
      const groupId = section.dataset.groupId;
      const body = section.querySelector('.group-body');
      body?.addEventListener('dragover', event => {
        if (!draggedItemId) return;
        event.preventDefault();
        section.classList.add('is-group-drop-target');
      });
      body?.addEventListener('dragleave', event => {
        if (!section.contains(event.relatedTarget)) section.classList.remove('is-group-drop-target');
      });
      body?.addEventListener('drop', async event => {
        if (!draggedItemId || event.target.closest('.item-row')) return;
        event.preventDefault();
        section.classList.remove('is-group-drop-target');
        await app.moveItemToGroupEnd(draggedItemId, groupId);
        draggedItemId = null;
      });

      const header = section.querySelector('.group-header-row');
      if (header) {
        header.draggable = true;
        header.addEventListener('dragstart', event => {
          if (event.target.closest('button')) {
            event.preventDefault();
            return;
          }
          draggedGroupId = groupId;
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('application/x-newmonday-group', groupId);
        });
        header.addEventListener('dragover', event => {
          if (!draggedGroupId || draggedGroupId === groupId) return;
          event.preventDefault();
          header.classList.add('is-drop-target');
        });
        header.addEventListener('dragleave', () => header.classList.remove('is-drop-target'));
        header.addEventListener('drop', async event => {
          if (!draggedGroupId || draggedGroupId === groupId) return;
          event.preventDefault();
          header.classList.remove('is-drop-target');
          await app.reorderGroupByDrop(draggedGroupId, groupId);
          draggedGroupId = null;
        });
      }
    });

    content.querySelectorAll('.dynamic-col-head').forEach(header => {
      const columnId = header.dataset.columnId;
      header.draggable = true;
      header.addEventListener('dragstart', event => {
        if (event.target.closest('button')) {
          event.preventDefault();
          return;
        }
        draggedColumnId = columnId;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('application/x-newmonday-column', columnId);
      });
      header.addEventListener('dragover', event => {
        if (!draggedColumnId || draggedColumnId === columnId) return;
        event.preventDefault();
        header.classList.add('is-drop-target');
      });
      header.addEventListener('dragleave', () => header.classList.remove('is-drop-target'));
      header.addEventListener('drop', async event => {
        if (!draggedColumnId || draggedColumnId === columnId) return;
        event.preventDefault();
        header.classList.remove('is-drop-target');
        await app.reorderColumnByDrop(draggedColumnId, columnId);
        draggedColumnId = null;
      });
    });
  };

  app.reorderItemByDrop = async function reorderItemByDrop(draggedId, targetId) {
    const dragged = this.findItem(draggedId);
    const target = this.findItem(targetId);
    if (!dragged || !target) return;

    const groups = this.effectiveGroups();
    const sourceGroup = groups.find(group => group.id === dragged.groupId || group.title === dragged.group);
    const targetGroup = groups.find(group => group.id === target.groupId || group.title === target.group);
    if (!targetGroup) return;

    const targetItems = this.boardItems().filter(item => (item.groupId || item.group) === (targetGroup.id || targetGroup.title) && item._id !== draggedId);
    const targetIndex = Math.max(0, targetItems.findIndex(item => item._id === targetId));
    targetItems.splice(targetIndex, 0, dragged);

    try {
      await this.api('/api/item-ordering/reorder', {
        method: 'POST',
        body: JSON.stringify({
          boardId: this.currentBoardId(),
          itemIds: targetItems.map(item => item._id),
          groupId: targetGroup.id,
          group: targetGroup.title,
          groupColor: targetGroup.color
        })
      });

      if (sourceGroup && sourceGroup.id !== targetGroup.id) {
        const remainingSource = this.boardItems().filter(item => item._id !== draggedId && (item.groupId || item.group) === (sourceGroup.id || sourceGroup.title));
        await this.api('/api/item-ordering/reorder', {
          method: 'POST',
          body: JSON.stringify({
            boardId: this.currentBoardId(),
            itemIds: remainingSource.map(item => item._id),
            groupId: sourceGroup.id,
            group: sourceGroup.title,
            groupColor: sourceGroup.color
          })
        });
      }

      await this.reloadBoardState();
      this.showToast('Orden actualizado');
    } catch (err) {
      this.showToast(err.message, true);
    }
  };

  app.moveItemToGroupEnd = async function moveItemToGroupEnd(itemId, groupId) {
    const group = this.effectiveGroups().find(entry => entry.id === groupId);
    const item = this.findItem(itemId);
    if (!group || !item) return;
    const targetItems = this.boardItems().filter(entry => entry._id !== itemId && (entry.groupId || entry.group) === (group.id || group.title));
    targetItems.push(item);
    try {
      await this.api('/api/item-ordering/reorder', {
        method: 'POST',
        body: JSON.stringify({ boardId: this.currentBoardId(), itemIds: targetItems.map(entry => entry._id), groupId: group.id, group: group.title, groupColor: group.color })
      });
      await this.reloadBoardState();
      this.showToast('Elemento movido');
    } catch (err) { this.showToast(err.message, true); }
  };

  app.reorderGroupByDrop = async function reorderGroupByDrop(draggedId, targetId) {
    const groups = this.effectiveGroups().slice();
    const from = groups.findIndex(group => group.id === draggedId);
    const to = groups.findIndex(group => group.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = groups.splice(from, 1);
    groups.splice(to, 0, moved);
    try {
      await this.api(`/api/boards/${this.currentBoardId()}/groups/reorder`, { method: 'POST', body: JSON.stringify({ groupIds: groups.map(group => group.id) }) });
      await this.reloadBoardState();
      this.showToast('Grupos reordenados');
    } catch (err) { this.showToast(err.message, true); }
  };

  app.reorderColumnByDrop = async function reorderColumnByDrop(draggedId, targetId) {
    const columns = (this.currentBoard.columns || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const from = columns.findIndex(column => column.id === draggedId);
    const to = columns.findIndex(column => column.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = columns.splice(from, 1);
    columns.splice(to, 0, moved);
    try {
      await this.api(`/api/boards/${this.currentBoardId()}/columns/reorder`, { method: 'POST', body: JSON.stringify({ columnIds: columns.map(column => column.id) }) });
      await this.reloadBoardState();
      this.showToast('Columnas reordenadas');
    } catch (err) { this.showToast(err.message, true); }
  };

  app.openItemMenu = function openItemMenuWithSubitems(anchor, itemId) {
    originalOpenItemMenu(anchor, itemId);
    const menu = [...document.querySelectorAll('.floating-menu')].at(-1);
    if (!menu) return;
    const addSubitem = document.createElement('button');
    addSubitem.textContent = '↳ Añadir subitem';
    addSubitem.addEventListener('click', async () => {
      const name = prompt('Nombre del subitem:');
      if (!name?.trim()) return;
      try {
        const created = await app.api(`/api/item-ordering/${itemId}/subitems`, { method: 'POST', body: JSON.stringify({ name: name.trim(), columnValues: {} }) });
        app.items.push(created);
        app.expandedSubitems.add(itemId);
        menu.remove();
        app.renderBoard();
        app.showToast('Subitem creado');
      } catch (err) { app.showToast(err.message, true); }
    });
    const separator = menu.querySelector('.menu-separator');
    menu.insertBefore(addSubitem, separator || menu.firstChild);
  };
})();
