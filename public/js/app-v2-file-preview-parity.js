(() => {
  app.localFileIdFromHref = function localFileIdFromHref(href) {
    try {
      const url = new URL(href, window.location.origin);
      if (url.origin !== window.location.origin) return null;
      const match = url.pathname.match(/^\/api\/files\/([a-f0-9]{24})$/i);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  };

  app.openLocalFilePreview = async function openLocalFilePreview(fileId, fallbackHref = '') {
    try {
      const meta = await this.api(`/api/files/${encodeURIComponent(fileId)}/metadata`);
      if (!meta.previewable || !meta.previewUrl) {
        window.open(fallbackHref || meta.url, '_blank', 'noopener,noreferrer');
        return;
      }
      const type = String(meta.mimetype || '').toLowerCase();
      const isImage = type.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(meta.name || '');
      const preview = isImage
        ? `<div class="file-preview-image-wrap"><img src="${this.escapeAttr(meta.previewUrl)}" alt="${this.escapeAttr(meta.name || 'Archivo')}"></div>`
        : `<iframe class="file-preview-pdf" src="${this.escapeAttr(meta.previewUrl)}" title="Vista previa de ${this.escapeAttr(meta.name || 'PDF')}"></iframe>`;
      this.openModal(`<div class="modal-card file-preview-modal">
        <div class="modal-header"><div><h2>${this.escapeHtml(meta.name || 'Archivo')}</h2><p>${this.escapeHtml(meta.mimetype || '')}${Number(meta.size) ? ` · ${this.escapeHtml(`${Math.ceil(Number(meta.size) / 1024)} KB`)}` : ''}</p></div><button type="button" class="modal-close" data-close-modal>×</button></div>
        <div class="file-preview-body">${preview}</div>
        <div class="modal-actions"><a class="button" href="${this.escapeAttr(meta.url)}" target="_blank" rel="noopener noreferrer" data-force-file-download>Descargar</a><button type="button" class="button primary" data-close-modal>Cerrar</button></div>
      </div>`);
    } catch (err) {
      this.showToast(err.message, true);
      if (fallbackHref) window.open(fallbackHref, '_blank', 'noopener,noreferrer');
    }
  };

  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[href^="/api/files/"]');
    if (!link || link.hasAttribute('data-force-file-download')) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const id = app.localFileIdFromHref(link.getAttribute('href'));
    if (!id) return;
    event.preventDefault();
    app.openLocalFilePreview(id, link.href);
  }, true);
})();
