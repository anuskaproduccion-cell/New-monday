(() => {
  const fmt = value => {
    if (!value) return '';
    try { return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
    catch { return String(value); }
  };

  app.openItemMenu = function openItemMenuWithUpdates(anchor, itemId) {
    document.querySelectorAll('.floating-menu').forEach(node => node.remove());
    const item = this.findItem(itemId);
    if (!item) return;
    const groups = this.effectiveGroups();
    const menu = document.createElement('div');
    menu.className = 'floating-menu';
    menu.innerHTML = `<button data-item-action="updates">💬 Actualizaciones y actividad</button><div class="menu-separator"></div><button data-item-action="duplicate">⧉ Duplicar elemento</button><div class="menu-separator"></div><div class="menu-title">Mover a grupo</div>${groups.map(group => `<button data-move-group="${this.escapeAttr(group.id)}">${this.escapeHtml(group.title)}</button>`).join('')}<div class="menu-separator"></div><button data-item-action="archive">Archivar</button><button class="danger" data-item-action="trash">Mover a papelera</button>`;
    menu.querySelector('[data-item-action="updates"]')?.addEventListener('click', () => { menu.remove(); this.openUpdatesPanel(itemId); });
    menu.querySelector('[data-item-action="duplicate"]')?.addEventListener('click', () => this.duplicateItem(itemId, menu));
    menu.querySelector('[data-item-action="archive"]')?.addEventListener('click', () => this.archiveItem(itemId, menu));
    menu.querySelector('[data-item-action="trash"]')?.addEventListener('click', () => this.trashItem(itemId, menu));
    menu.querySelectorAll('[data-move-group]').forEach(button => button.addEventListener('click', () => this.moveItem(itemId, button.dataset.moveGroup, menu)));
    this.positionMenu(menu, anchor);
  };

  app.openUpdatesPanel = async function openUpdatesPanel(itemId) {
    const item = this.findItem(itemId);
    if (!item) return;
    this.openModal(`<div class="modal-card updates-modal">
      <div class="modal-header"><div><h2>${this.escapeHtml(item.name)}</h2><p>Actualizaciones e historial local de New Monday</p></div><button type="button" class="modal-close" data-close-modal>×</button></div>
      <div class="updates-tabs"><button class="active" data-updates-tab="updates">Actualizaciones</button><button data-updates-tab="activity">Actividad</button></div>
      <div id="updates-panel-body" class="updates-panel-body"><div class="loading">Cargando…</div></div>
    </div>`);
    document.querySelectorAll('[data-close-modal]').forEach(button => button.addEventListener('click', () => this.closeModal()));
    document.querySelectorAll('[data-updates-tab]').forEach(button => button.addEventListener('click', async () => {
      document.querySelectorAll('[data-updates-tab]').forEach(tab => tab.classList.toggle('active', tab === button));
      if (button.dataset.updatesTab === 'activity') await this.renderItemActivity(itemId);
      else await this.renderItemUpdates(itemId);
    }));
    await this.renderItemUpdates(itemId);
  };

  app.renderItemUpdates = async function renderItemUpdates(itemId) {
    const host = document.getElementById('updates-panel-body');
    if (!host) return;
    try {
      const updates = await this.api(`/api/updates/item/${itemId}`);
      if (typeof this.noteItemUpdateCount === 'function') this.noteItemUpdateCount(itemId, updates);
      host.innerHTML = `<form id="new-update-form" class="new-update-form"><textarea name="body" rows="3" placeholder="Escribe una actualización…" required></textarea><div><button class="button primary">Publicar actualización</button></div></form>
        <div class="updates-feed">${updates.length ? updates.map(update => this.updateCardHtml(update)).join('') : '<div class="updates-empty">Todavía no hay actualizaciones.</div>'}</div>`;
      document.getElementById('new-update-form')?.addEventListener('submit', async event => {
        event.preventDefault();
        const body = new FormData(event.currentTarget).get('body')?.trim();
        if (!body) return;
        try {
          await this.api(`/api/updates/item/${itemId}`, { method: 'POST', body: JSON.stringify({ body }) });
          await this.renderItemUpdates(itemId);
          this.showToast('Actualización publicada');
        } catch (err) { this.showToast(err.message, true); }
      });
      host.querySelectorAll('[data-reply-form]').forEach(form => form.addEventListener('submit', async event => {
        event.preventDefault();
        const updateId = form.dataset.replyForm;
        const body = new FormData(form).get('body')?.trim();
        if (!body) return;
        try {
          await this.api(`/api/updates/${updateId}/replies`, { method: 'POST', body: JSON.stringify({ body }) });
          await this.renderItemUpdates(itemId);
        } catch (err) { this.showToast(err.message, true); }
      }));
      host.querySelectorAll('[data-archive-update]').forEach(button => button.addEventListener('click', async () => {
        if (!confirm('¿Archivar esta actualización?')) return;
        try {
          await this.api(`/api/updates/${button.dataset.archiveUpdate}`, { method: 'DELETE' });
          await this.renderItemUpdates(itemId);
        } catch (err) { this.showToast(err.message, true); }
      }));
    } catch (err) {
      host.innerHTML = `<div class="updates-error">${this.escapeHtml(err.message)}</div>`;
    }
  };

  app.updateCardHtml = function updateCardHtml(update) {
    const replies = (update.replies || []).map(reply => `<div class="update-reply"><div class="update-meta"><strong>${this.escapeHtml(reply.author || 'New Monday')}</strong><span>${this.escapeHtml(fmt(reply.createdAt))}</span></div><p>${this.escapeHtml(reply.body || '')}</p></div>`).join('');
    return `<article class="update-card"><div class="update-meta"><strong>${this.escapeHtml(update.author || 'New Monday')}</strong><span>${this.escapeHtml(fmt(update.createdAt))}</span><button type="button" data-archive-update="${update._id}" title="Archivar actualización">⋯</button></div><p class="update-body">${this.escapeHtml(update.body || '')}</p>${replies ? `<div class="update-replies">${replies}</div>` : ''}<form class="reply-form" data-reply-form="${update._id}"><input name="body" placeholder="Responder…" autocomplete="off" required><button>Responder</button></form></article>`;
  };

  app.renderItemActivity = async function renderItemActivity(itemId) {
    const host = document.getElementById('updates-panel-body');
    if (!host) return;
    try {
      const events = await this.api(`/api/activity/item/${itemId}?limit=200`);
      host.innerHTML = `<div class="activity-feed">${events.length ? events.map(event => `<div class="activity-event"><span class="activity-dot"></span><div><strong>${this.escapeHtml(event.message || event.type)}</strong><small>${this.escapeHtml(fmt(event.createdAt))}${event.field ? ` · ${this.escapeHtml(event.field)}` : ''}</small></div></div>`).join('') : '<div class="updates-empty">Aún no hay actividad local registrada.</div>'}</div>`;
    } catch (err) {
      host.innerHTML = `<div class="updates-error">${this.escapeHtml(err.message)}</div>`;
    }
  };
})();
