(() => {
  const originalItemRowHtml = app.itemRowHtml.bind(app);
  const originalBindBoardEvents = app.bindBoardEvents.bind(app);
  const originalOpenUpdatesPanel = app.openUpdatesPanel?.bind(app);

  app.itemRowHtml = function itemRowHtmlWithUpdatesButton(item, group, columns) {
    let html = originalItemRowHtml(item, group, columns);
    const marker = `<input class="cell-input element-input" data-name-id="${item._id}"`;
    const button = `<button class="item-updates-button" type="button" data-action="open-updates" data-id="${item._id}" aria-label="Abrir actualizaciones de ${this.escapeAttr(item.name || 'elemento')}" title="Actualizaciones">💬</button>`;
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
