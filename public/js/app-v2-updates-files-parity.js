(() => {
  const formatUpdateDate = value => {
    if (!value) return '';
    try { return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
    catch { return String(value); }
  };

  app.updateAttachmentHtml = function updateAttachmentHtml(attachments = []) {
    if (!Array.isArray(attachments) || !attachments.length) return '';
    return `<div class="update-attachments">${attachments.map(file => {
      const name = file?.name || 'Archivo';
      const url = file?.url || (file?.id ? `/api/files/${file.id}` : '');
      const icon = typeof this.fileIconFor === 'function' ? this.fileIconFor(file) : '📎';
      return url
        ? `<a class="update-attachment" href="${this.escapeAttr(url)}" target="_blank" rel="noopener noreferrer"><span>${icon}</span><span>${this.escapeHtml(name)}</span><span>↗</span></a>`
        : `<span class="update-attachment is-unavailable"><span>${icon}</span><span>${this.escapeHtml(name)}</span></span>`;
    }).join('')}</div>`;
  };

  app.updateCardHtml = function updateCardHtmlWithAttachments(update) {
    const replies = (update.replies || []).map(reply => `<div class="update-reply">
      <div class="update-meta"><strong>${this.escapeHtml(reply.author || 'New Monday')}</strong><span>${this.escapeHtml(formatUpdateDate(reply.createdAt))}</span></div>
      ${reply.body ? `<p>${this.escapeHtml(reply.body)}</p>` : ''}
      ${this.updateAttachmentHtml(reply.attachments || [])}
    </div>`).join('');
    return `<article class="update-card">
      <div class="update-meta"><strong>${this.escapeHtml(update.author || 'New Monday')}</strong><span>${this.escapeHtml(formatUpdateDate(update.createdAt))}</span><button type="button" data-archive-update="${update._id}" title="Archivar actualización">⋯</button></div>
      ${update.body ? `<p class="update-body">${this.escapeHtml(update.body)}</p>` : ''}
      ${this.updateAttachmentHtml(update.attachments || [])}
      ${replies ? `<div class="update-replies">${replies}</div>` : ''}
      <form class="reply-form reply-form-with-file" data-reply-form="${update._id}">
        <input name="body" placeholder="Responder…" autocomplete="off">
        <label class="reply-file-button" title="Adjuntar archivo">📎<input type="file" name="files" multiple hidden></label>
        <span class="reply-file-count" data-reply-file-count></span>
        <button>Responder</button>
      </form>
    </article>`;
  };

  app.uploadPendingAttachments = async function uploadPendingAttachments(files) {
    const uploaded = [];
    try {
      for (const file of files) uploaded.push(await this.uploadNewMondayFile(file));
      return uploaded;
    } catch (error) {
      if (uploaded.length) await Promise.allSettled(uploaded.map(file => fetch(`/api/files/${file.id}`, { method: 'DELETE' })));
      throw error;
    }
  };

  app.cleanupUploadedAttachments = async function cleanupUploadedAttachments(files) {
    if (!files?.length) return;
    await Promise.allSettled(files.filter(file => file?.id).map(file => fetch(`/api/files/${file.id}`, { method: 'DELETE' })));
  };

  app.renderItemUpdates = async function renderItemUpdatesWithAttachments(itemId) {
    const host = document.getElementById('updates-panel-body');
    if (!host) return;
    try {
      const updates = await this.api(`/api/updates/item/${itemId}`);
      if (typeof this.noteItemUpdateCount === 'function') this.noteItemUpdateCount(itemId, updates);
      host.innerHTML = `<form id="new-update-form" class="new-update-form new-update-form-with-files">
          <textarea name="body" rows="3" placeholder="Escribe una actualización…"></textarea>
          <div class="new-update-attachments" data-new-update-files></div>
          <div class="new-update-actions"><label class="update-file-button">📎 Añadir archivos<input type="file" name="files" multiple hidden></label><button class="button primary">Publicar actualización</button></div>
        </form>
        <div class="updates-feed">${updates.length ? updates.map(update => this.updateCardHtml(update)).join('') : '<div class="updates-empty">Todavía no hay actualizaciones.</div>'}</div>`;

      const form = document.getElementById('new-update-form');
      const fileInput = form?.querySelector('input[name="files"]');
      const pendingHost = form?.querySelector('[data-new-update-files]');
      const renderPending = () => {
        const files = [...(fileInput?.files || [])];
        if (!pendingHost) return;
        pendingHost.innerHTML = files.map(file => `<span class="pending-update-file">📎 ${this.escapeHtml(file.name)} <small>${Math.ceil(file.size / 1024)} KB</small></span>`).join('');
      };
      fileInput?.addEventListener('change', renderPending);

      form?.addEventListener('submit', async event => {
        event.preventDefault();
        const body = new FormData(form).get('body')?.trim() || '';
        const files = [...(fileInput?.files || [])];
        if (!body && !files.length) return this.showToast('Escribe una actualización o añade un archivo', true);
        const submit = form.querySelector('button[type="submit"],button.button.primary');
        if (submit) submit.disabled = true;
        let uploaded = [];
        try {
          uploaded = await this.uploadPendingAttachments(files);
          await this.api(`/api/updates/item/${itemId}`, { method: 'POST', body: JSON.stringify({ body, attachments: uploaded }) });
          await this.renderItemUpdates(itemId);
          this.showToast(uploaded.length ? 'Actualización y archivos publicados' : 'Actualización publicada');
        } catch (err) {
          await this.cleanupUploadedAttachments(uploaded);
          this.showToast(err.message, true);
          if (submit) submit.disabled = false;
        }
      });

      host.querySelectorAll('.reply-form-with-file').forEach(replyForm => {
        const replyFileInput = replyForm.querySelector('input[name="files"]');
        const count = replyForm.querySelector('[data-reply-file-count]');
        replyFileInput?.addEventListener('change', () => {
          const total = replyFileInput.files?.length || 0;
          if (count) count.textContent = total ? `${total} adj.` : '';
        });
        replyForm.addEventListener('submit', async event => {
          event.preventDefault();
          const updateId = replyForm.dataset.replyForm;
          const body = new FormData(replyForm).get('body')?.trim() || '';
          const files = [...(replyFileInput?.files || [])];
          if (!body && !files.length) return;
          let uploaded = [];
          try {
            uploaded = await this.uploadPendingAttachments(files);
            await this.api(`/api/updates/${updateId}/replies`, { method: 'POST', body: JSON.stringify({ body, attachments: uploaded }) });
            await this.renderItemUpdates(itemId);
          } catch (err) {
            await this.cleanupUploadedAttachments(uploaded);
            this.showToast(err.message, true);
          }
        });
      });

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
})();
