(() => {
  const baseBindBoardEvents = app.bindBoardEvents.bind(app);

  app.bindBoardEvents = function bindBoardEventsWithInlineColumnAdd() {
    baseBindBoardEvents();
    const content = document.getElementById('content');
    if (!content || typeof this.openCreateColumnModal !== 'function') return;

    content.querySelectorAll('.dynamic-table thead th.col-actions').forEach(header => {
      if (header.querySelector('[data-action="add-column-inline"]')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'add-column-inline';
      button.dataset.action = 'add-column-inline';
      button.title = 'Agregar columna';
      button.setAttribute('aria-label', 'Agregar columna');
      button.textContent = '＋';
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        this.openCreateColumnModal();
      });
      header.appendChild(button);
    });
  };
})();
