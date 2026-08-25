(() => {
  const previousCellHtml = app.cellHtml.bind(app);
  const previousItemRowHtml = app.itemRowHtml.bind(app);
  const previousBindBoardEvents = app.bindBoardEvents.bind(app);

  app.subitemComposerParent = null;

  app.cellHtml = function cellHtmlWithOperationalSubitems(item, column, options = {}) {
    if (column?.type !== 'subtasks') return previousCellHtml(item, column, options);
    const count = this.subitemsFor(item._id).length || item.subitems?.length || 0;
    return `<div class="subitems-cell-actions">
      <button type="button" class="subitems-main-button ${count ? 'has-subitems' : 'is-empty'}" data-action="subitems-open" data-id="${this.escapeAttr(item._id)}">${count ? `${count} subitem${count === 1 ? '' : 's'}` : '＋ Añadir subitem'}</button>
      ${count ? `<button type="button" class="subitems-add-button" data-action="subitem-add" data-id="${this.escapeAttr(item._id)}" title="Añadir subitem" aria-label="Añadir subitem">＋</button>` : ''}
    </div>`;
  };

  app.itemRowHtml = function itemRowHtmlWithSubitemComposer(item, group, columns) {
    const html = previousItemRowHtml(item, group, columns);
    if (String(this.subitemComposerParent || '') !== String(item._id)) return html;
    const colspan = columns.length + 2;
    return `${html}<tr class="subitem-create-row" data-subitem-composer="${this.escapeAttr(item._id)}"><td></td><td colspan="${colspan}"><div class="subitem-inline-composer"><span class="subitem-inline-arrow">↳</span><input type="text" data-subitem-name="${this.escapeAttr(item._id)}" placeholder="Nombre del subitem" autocomplete="off"><button type="button" data-subitem-save="${this.escapeAttr(item._id)}">Añadir</button><button type="button" data-subitem-cancel="${this.escapeAttr(item._id)}" aria-label="Cancelar">×</button></div></td></tr>`;
  };

  app.openSubitemComposer = function openSubitemComposer(itemId) {
    this.subitemComposerParent = String(itemId);
    this.expandedSubitems.add(String(itemId));
    this.renderBoard();
    requestAnimationFrame(() => document.querySelector(`[data-subitem-name="${CSS.escape(String(itemId))}"]`)?.focus());
  };

  app.createInlineSubitem = async function createInlineSubitem(parentId, input) {
    const name = String(input?.value || '').trim();
    if (!name) {
      input?.focus();
      return;
    }
    try {
      const created = await this.api(`/api/item-ordering/${parentId}/subitems`, {
        method: 'POST',
        body: JSON.stringify({ name, columnValues: {} })
      });
      this.items.push(created);
      this.subitemComposerParent = null;
      this.expandedSubitems.add(String(parentId));
      this.renderBoard();
      this.showToast('Subitem creado');
    } catch (err) {
      this.showToast(err.message, true);
    }
  };

  app.bindBoardEvents = function bindBoardEventsWithInlineSubitems() {
    previousBindBoardEvents();
    const content = document.getElementById('content');
    if (!content) return;

    content.querySelectorAll('[data-action="subitems-open"]').forEach(button => button.addEventListener('click', () => {
      const id = String(button.dataset.id);
      const count = this.subitemsFor(id).length || this.findItem(id)?.subitems?.length || 0;
      if (!count) return this.openSubitemComposer(id);
      if (this.expandedSubitems.has(id)) this.expandedSubitems.delete(id);
      else this.expandedSubitems.add(id);
      this.renderBoard();
    }));

    content.querySelectorAll('[data-action="subitem-add"]').forEach(button => button.addEventListener('click', event => {
      event.stopPropagation();
      this.openSubitemComposer(button.dataset.id);
    }));

    content.querySelectorAll('[data-subitem-name]').forEach(input => input.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.createInlineSubitem(input.dataset.subitemName, input);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.subitemComposerParent = null;
        this.renderBoard();
      }
    }));

    content.querySelectorAll('[data-subitem-save]').forEach(button => button.addEventListener('click', () => {
      const input = content.querySelector(`[data-subitem-name="${CSS.escape(String(button.dataset.subitemSave))}"]`);
      this.createInlineSubitem(button.dataset.subitemSave, input);
    }));

    content.querySelectorAll('[data-subitem-cancel]').forEach(button => button.addEventListener('click', () => {
      this.subitemComposerParent = null;
      this.renderBoard();
    }));
  };
})();
