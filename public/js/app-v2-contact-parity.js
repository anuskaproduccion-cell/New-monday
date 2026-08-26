(() => {
  const baseCellHtml = app.cellHtml.bind(app);
  const baseBindBoardEvents = app.bindBoardEvents.bind(app);

  app.cellHtml = function cellHtmlWithCompactContact(item, column, options = {}) {
    if (!['email', 'link'].includes(column?.type)) return baseCellHtml(item, column, options);
    const value = this.valueFor(item, column) || {};
    if (column.type === 'email') {
      const email = String(value.email || this.displayValue(value) || '').trim();
      const text = String(value.text || email || '').trim();
      return `<button type="button" class="contact-cell-display ${email ? 'has-value' : 'is-empty'}" data-action="contact-edit" data-contact-type="email" data-id="${this.escapeAttr(item._id)}" data-column-id="${this.escapeAttr(column.id)}">
        <span class="contact-cell-icon">✉</span><span>${this.escapeHtml(text || 'Añadir email')}</span>${email ? '<span class="contact-cell-caret">›</span>' : ''}
      </button>`;
    }
    const url = String(value.url || this.displayValue(value) || '').trim();
    const text = String(value.text || value.label || url || '').trim();
    return `<button type="button" class="contact-cell-display ${url ? 'has-value' : 'is-empty'}" data-action="contact-edit" data-contact-type="link" data-id="${this.escapeAttr(item._id)}" data-column-id="${this.escapeAttr(column.id)}">
      <span class="contact-cell-icon">🔗</span><span>${this.escapeHtml(text || 'Añadir enlace')}</span>${url ? '<span class="contact-cell-caret">›</span>' : ''}
    </button>`;
  };

  app.bindBoardEvents = function bindBoardEventsWithCompactContact() {
    baseBindBoardEvents();
    const content = document.getElementById('content');
    content?.querySelectorAll('[data-action="contact-edit"]').forEach(button => button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      this.openContactCellEditor(button, button.dataset.id, button.dataset.columnId, button.dataset.contactType);
    }));
  };

  app.openContactCellEditor = function openContactCellEditor(anchor, itemId, columnId, type) {
    document.querySelectorAll('.floating-menu,.contact-editor-menu').forEach(node => node.remove());
    const item = this.findItem(itemId);
    const column = this.effectiveColumns().find(entry => String(entry.id) === String(columnId));
    if (!item || !column) return;
    const value = this.valueFor(item, column) || {};
    const menu = document.createElement('div');
    menu.className = 'floating-menu contact-editor-menu';
    if (type === 'email') {
      const email = String(value.email || this.displayValue(value) || '').trim();
      const text = String(value.text || email || '').trim();
      menu.innerHTML = `<form data-contact-form>
        <div class="menu-title">${this.escapeHtml(column.title || 'Email')}</div>
        <label>Dirección<input type="email" name="email" value="${this.escapeAttr(email)}" placeholder="nombre@dominio.com" autofocus></label>
        <label>Texto visible<input name="text" value="${this.escapeAttr(text)}" placeholder="Opcional"></label>
        <div class="contact-editor-actions"><button type="button" data-contact-clear>Limpiar</button><span></span>${email ? `<a href="mailto:${this.escapeAttr(email)}">Abrir correo ↗</a>` : ''}<button type="submit" class="contact-save">Guardar</button></div>
      </form>`;
    } else {
      const url = String(value.url || this.displayValue(value) || '').trim();
      const text = String(value.text || value.label || url || '').trim();
      menu.innerHTML = `<form data-contact-form>
        <div class="menu-title">${this.escapeHtml(column.title || 'Enlace')}</div>
        <label>URL<input type="url" name="url" value="${this.escapeAttr(url)}" placeholder="https://…" autofocus></label>
        <label>Texto visible<input name="text" value="${this.escapeAttr(text)}" placeholder="Opcional"></label>
        <div class="contact-editor-actions"><button type="button" data-contact-clear>Limpiar</button><span></span>${url ? `<a href="${this.escapeAttr(url)}" target="_blank" rel="noopener noreferrer">Abrir ↗</a>` : ''}<button type="submit" class="contact-save">Guardar</button></div>
      </form>`;
    }

    const form = menu.querySelector('[data-contact-form]');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const data = new FormData(form);
      if (type === 'email') {
        const email = String(data.get('email') || '').trim();
        const text = String(data.get('text') || '').trim() || email;
        const saved = await this.updateColumnValue(itemId, columnId, { type: 'email', email, text });
        if (saved) { menu.remove(); this.renderBoard(); }
      } else {
        const url = String(data.get('url') || '').trim();
        if (url && !/^https?:\/\//i.test(url)) return this.showToast('El enlace debe empezar por http:// o https://', true);
        const text = String(data.get('text') || '').trim() || url;
        const saved = await this.updateColumnValue(itemId, columnId, { type: 'link', url, text });
        if (saved) { menu.remove(); this.renderBoard(); }
      }
    });
    menu.querySelector('[data-contact-clear]')?.addEventListener('click', async () => {
      const blank = type === 'email' ? { type: 'email', email: '', text: '' } : { type: 'link', url: '', text: '' };
      const saved = await this.updateColumnValue(itemId, columnId, blank);
      if (saved) { menu.remove(); this.renderBoard(); }
    });
    this.positionMenu(menu, anchor);
    requestAnimationFrame(() => form.querySelector('[autofocus]')?.focus());
  };
})();
