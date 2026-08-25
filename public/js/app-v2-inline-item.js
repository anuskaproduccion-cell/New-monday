(() => {
  const previousBindBoardEvents = app.bindBoardEvents.bind(app);

  app.startInlineItemComposer = function startInlineItemComposer(button, groupId) {
    const group = this.effectiveGroups().find(entry => String(entry.id) === String(groupId));
    if (!button || !group) return;

    const form = document.createElement('form');
    form.className = 'inline-item-composer';
    form.innerHTML = '<span class="inline-item-plus">＋</span><input type="text" name="name" placeholder="Nombre del elemento" autocomplete="off"><button type="submit">Añadir</button><button type="button" data-inline-item-cancel aria-label="Cancelar">×</button>';
    button.replaceWith(form);

    const input = form.querySelector('input[name="name"]');
    form.querySelector('[data-inline-item-cancel]').addEventListener('click', () => this.renderBoard());
    input.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.renderBoard();
      }
    });

    form.addEventListener('submit', async event => {
      event.preventDefault();
      const name = String(input.value || '').trim();
      if (!name) return input.focus();
      try {
        const order = this.boardItems().filter(item => String(item.groupId || '') === String(group.id)).length;
        const created = await this.api('/api/items', {
          method: 'POST',
          body: JSON.stringify({ board: this.currentBoardId(), groupId: group.id, group: group.title, groupColor: group.color, name, order, columnValues: {} })
        });
        this.items.push(created);
        this.renderBoard();
        this.showToast('Elemento creado');
      } catch (err) {
        this.showToast(err.message, true);
        input.focus();
      }
    });

    requestAnimationFrame(() => input.focus());
  };

  app.bindBoardEvents = function bindBoardEventsWithInlineItemCreation() {
    previousBindBoardEvents();
    const content = document.getElementById('content');
    if (!content) return;

    content.querySelectorAll('.add-item-row[data-action="add-item"]').forEach(button => {
      const cleanButton = button.cloneNode(true);
      button.replaceWith(cleanButton);
      cleanButton.addEventListener('click', () => this.startInlineItemComposer(cleanButton, cleanButton.dataset.groupId));
    });
  };
})();
