(() => {
  const MAX_FILE_BYTES = 25 * 1024 * 1024;
  const baseCellHtml = app.cellHtml.bind(app);
  const baseBindBoardEvents = app.bindBoardEvents.bind(app);

  app.fileEntriesFromValue = function fileEntriesFromValue(value) {
    const candidates = [];
    if (Array.isArray(value?.assets)) candidates.push(...value.assets);
    if (Array.isArray(value?.files)) candidates.push(...value.files);
    if (Array.isArray(value?.items)) candidates.push(...value.items);
    const seen = new Set();
    return candidates.map((entry, index) => {
      if (typeof entry === 'string') return { name: entry, url: '', source: 'imported', key: `text:${entry}:${index}` };
      const id = entry?.id || entry?._id || entry?.assetId || entry?.asset_id || '';
      const name = entry?.name || entry?.filename || entry?.fileName || entry?.title || 'Archivo';
      const url = entry?.url || entry?.publicUrl || entry?.public_url || entry?.downloadUrl || entry?.download_url || (id && entry?.source === 'new-monday' ? `/api/files/${id}` : '');
      const source = entry?.source || (String(url).startsWith('/api/files/') ? 'new-monday' : 'imported');
      return { ...entry, id: id ? String(id) : '', name: String(name), url: String(url || ''), source, key: id ? `id:${id}` : `entry:${name}:${url}:${index}` };
    }).filter(entry => {
      if (seen.has(entry.key)) return false;
      seen.add(entry.key);
      return true;
    });
  };

  app.fileValueWithEntries = function fileValueWithEntries(entries) {
    return {
      type: 'file',
      assets: entries.map(entry => ({
        ...(entry.id ? { id: entry.id } : {}),
        name: entry.name || 'Archivo',
        ...(entry.size !== undefined ? { size: entry.size } : {}),
        ...(entry.mimetype ? { mimetype: entry.mimetype } : {}),
        ...(entry.url ? { url: entry.url } : {}),
        source: entry.source || 'new-monday'
      }))
    };
  };

  app.fileIconFor = function fileIconFor(entry) {
    const type = String(entry?.mimetype || '').toLowerCase();
    const name = String(entry?.name || '').toLowerCase();
    if (type.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/.test(name)) return '🖼';
    if (type === 'application/pdf' || name.endsWith('.pdf')) return '📕';
    if (/\.(xlsx?|csv)$/.test(name)) return '📊';
    if (/\.(docx?|odt)$/.test(name)) return '📄';
    if (/\.(mov|mp4|mxf|avi|mkv)$/.test(name)) return '🎬';
    if (/\.(wav|mp3|aiff?|m4a)$/.test(name)) return '🎧';
    if (/\.(zip|rar|7z)$/.test(name)) return '🗜';
    return '📎';
  };

  app.cellHtml = function cellHtmlWithFileParity(item, column, options = {}) {
    if (column?.type !== 'file') return baseCellHtml(item, column, options);
    const entries = this.fileEntriesFromValue(this.valueFor(item, column));
    const visible = entries.slice(0, 2);
    const rest = Math.max(0, entries.length - visible.length);
    return `<button type="button" class="file-cell-display ${entries.length ? 'has-files' : 'is-empty'}" data-action="file-edit" data-id="${this.escapeAttr(item._id)}" data-column-id="${this.escapeAttr(column.id)}" aria-label="Editar archivos">
      <span class="file-cell-chips">${visible.map(entry => `<span class="file-cell-chip" title="${this.escapeAttr(entry.name)}"><span>${this.fileIconFor(entry)}</span><span>${this.escapeHtml(entry.name)}</span></span>`).join('')}${rest ? `<span class="file-cell-more">+${rest}</span>` : ''}${!entries.length ? '<span class="file-cell-empty">＋ Añadir archivo</span>' : ''}</span>
    </button>`;
  };

  app.bindBoardEvents = function bindBoardEventsWithFiles() {
    baseBindBoardEvents();
    const content = document.getElementById('content');
    if (!content) return;
    content.querySelectorAll('[data-action="file-edit"]').forEach(button => {
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        this.openFileCellPanel(button, button.dataset.id, button.dataset.columnId);
      });
      button.addEventListener('dragover', event => {
        event.preventDefault();
        button.classList.add('is-dragover');
      });
      button.addEventListener('dragleave', () => button.classList.remove('is-dragover'));
      button.addEventListener('drop', async event => {
        event.preventDefault();
        button.classList.remove('is-dragover');
        const files = [...(event.dataTransfer?.files || [])];
        if (files.length) await this.addFilesToCell(button.dataset.id, button.dataset.columnId, files, button);
      });
    });
  };

  app.uploadNewMondayFile = async function uploadNewMondayFile(file) {
    if (!file) throw new Error('Selecciona un archivo');
    if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} supera el límite de 25 MB`);
    const response = await fetch('/api/files', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-File-Name': encodeURIComponent(file.name || 'archivo'),
        'X-File-Type': file.type || 'application/octet-stream'
      },
      body: file
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `No se pudo subir ${file.name}`);
    return payload;
  };

  app.addFilesToCell = async function addFilesToCell(itemId, columnId, files, anchor) {
    const item = this.findItem(itemId);
    const column = this.effectiveColumns().find(entry => String(entry.id) === String(columnId));
    if (!item || !column) return;
    const existing = this.fileEntriesFromValue(this.valueFor(item, column));
    const uploaded = [];
    try {
      anchor?.classList.add('is-uploading');
      for (const file of files) uploaded.push(await this.uploadNewMondayFile(file));
      const next = [...existing, ...uploaded.map(file => ({ ...file, key: `id:${file.id}` }))];
      const saved = await this.updateColumnValue(itemId, columnId, this.fileValueWithEntries(next));
      if (!saved) throw new Error('No se pudo guardar la referencia del archivo');
      this.renderBoard();
      this.showToast(uploaded.length === 1 ? 'Archivo añadido' : `${uploaded.length} archivos añadidos`);
    } catch (error) {
      // Avoid orphaned GridFS files when the item value could not be saved.
      if (uploaded.length) await Promise.allSettled(uploaded.map(file => fetch(`/api/files/${file.id}`, { method: 'DELETE' })));
      this.showToast(error.message, true);
    } finally {
      anchor?.classList.remove('is-uploading');
    }
  };

  app.openFileCellPanel = function openFileCellPanel(anchor, itemId, columnId) {
    document.querySelectorAll('.floating-menu,.file-cell-menu').forEach(node => node.remove());
    const item = this.findItem(itemId);
    const column = this.effectiveColumns().find(entry => String(entry.id) === String(columnId));
    if (!item || !column) return;
    const menu = document.createElement('div');
    menu.className = 'floating-menu file-cell-menu';

    const render = () => {
      const currentItem = this.findItem(itemId);
      const entries = this.fileEntriesFromValue(this.valueFor(currentItem, column));
      menu.innerHTML = `
        <div class="file-menu-header"><strong>${this.escapeHtml(column.title || 'Archivos')}</strong><span>${entries.length} ${entries.length === 1 ? 'archivo' : 'archivos'}</span></div>
        <div class="file-menu-list">${entries.length ? entries.map((entry, index) => `
          <div class="file-menu-row" data-file-index="${index}">
            <span class="file-menu-icon">${this.fileIconFor(entry)}</span>
            <div class="file-menu-copy"><strong>${this.escapeHtml(entry.name)}</strong><small>${entry.source === 'new-monday' ? 'New Monday' : entry.source === 'link' ? 'Enlace' : 'Importado'}</small></div>
            ${entry.url ? `<a href="${this.escapeAttr(entry.url)}" target="_blank" rel="noopener noreferrer" class="file-menu-open" title="Abrir / descargar">↗</a>` : ''}
            <button type="button" class="file-menu-remove" data-file-remove="${index}" title="Quitar de la celda">×</button>
          </div>`).join('') : '<div class="file-menu-empty">Todavía no hay archivos en esta celda.</div>'}</div>
        <div class="file-menu-add">
          <label class="file-upload-button">＋ Subir archivo<input type="file" data-file-input multiple hidden></label>
          <button type="button" data-file-link>🔗 Desde enlace</button>
        </div>
        <div class="file-link-editor" data-file-link-editor hidden>
          <input type="url" data-file-link-url placeholder="https://…">
          <input type="text" data-file-link-name placeholder="Nombre del archivo (opcional)">
          <button type="button" data-file-link-save>Añadir</button>
        </div>
        <div class="file-menu-note">Máximo 25 MB por archivo. Los archivos locales se almacenan en New Monday.</div>`;

      menu.querySelector('[data-file-input]')?.addEventListener('change', async event => {
        const files = [...event.target.files];
        if (!files.length) return;
        await this.addFilesToCell(itemId, columnId, files, anchor);
        const refreshedItem = this.findItem(itemId);
        if (refreshedItem) render();
      });

      menu.querySelector('[data-file-link]')?.addEventListener('click', () => {
        const editor = menu.querySelector('[data-file-link-editor]');
        editor.hidden = !editor.hidden;
        if (!editor.hidden) menu.querySelector('[data-file-link-url]')?.focus();
      });

      menu.querySelector('[data-file-link-save]')?.addEventListener('click', async () => {
        const url = menu.querySelector('[data-file-link-url]')?.value.trim() || '';
        const label = menu.querySelector('[data-file-link-name]')?.value.trim() || '';
        if (!/^https?:\/\//i.test(url)) return this.showToast('Introduce un enlace http/https válido', true);
        let inferred = label;
        if (!inferred) {
          try { inferred = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || new URL(url).hostname); }
          catch { inferred = 'Enlace'; }
        }
        const latest = this.fileEntriesFromValue(this.valueFor(this.findItem(itemId), column));
        const next = [...latest, { name: inferred, url, source: 'link', key: `link:${url}` }];
        const saved = await this.updateColumnValue(itemId, columnId, this.fileValueWithEntries(next));
        if (saved) {
          this.renderBoard();
          this.showToast('Enlace añadido');
          menu.remove();
        }
      });

      menu.querySelectorAll('[data-file-remove]').forEach(button => button.addEventListener('click', async () => {
        const index = Number(button.dataset.fileRemove);
        const latest = this.fileEntriesFromValue(this.valueFor(this.findItem(itemId), column));
        const removed = latest[index];
        if (!removed) return;
        const next = latest.filter((_, entryIndex) => entryIndex !== index);
        const saved = await this.updateColumnValue(itemId, columnId, this.fileValueWithEntries(next));
        if (!saved) return;
        if (removed.source === 'new-monday' && removed.id) {
          await fetch(`/api/files/${encodeURIComponent(removed.id)}`, { method: 'DELETE' }).catch(() => null);
        }
        this.renderBoard();
        menu.remove();
        this.showToast('Archivo quitado');
      }));
    };

    render();
    this.positionMenu(menu, anchor);
  };
})();
