(() => {
  const baseCreateViewOfType = app.createViewOfType.bind(app);

  app.filesViewContextStillCurrent = function filesViewContextStillCurrent(boardId, viewId) {
    return String(this.currentBoardId?.() || '') === String(boardId || '')
      && String(this.currentView || '') === String(viewId || '');
  };

  app.createViewOfType = async function createViewOfTypeFilesNavigationSafe(type) {
    if (type !== 'files') return baseCreateViewOfType(type);

    const sourceBoard = this.currentBoard;
    const sourceBoardId = String(sourceBoard?._id || '');
    if (!sourceBoardId) return;

    const name = this.uniqueViewName('Archivos');
    const order = (sourceBoard.views || []).length;

    let created;
    try {
      created = await this.api(`/api/boards/${encodeURIComponent(sourceBoardId)}/views`, {
        method: 'POST',
        body: JSON.stringify({
          name,
          type: 'files',
          filter: { logic: 'and', rules: [] },
          sort: [],
          settings: { layout: 'grid' },
          order
        })
      });
    } catch (error) {
      this.showToast(error.message, true);
      return;
    }

    const cached = this.boards.find(board => String(board._id) === sourceBoardId) || sourceBoard;
    const existing = Array.isArray(cached.views) ? cached.views : [];
    if (!existing.some(view => String(view.id) === String(created.id))) {
      cached.views = [...existing, created];
    }

    if (String(this.currentBoardId?.() || '') === sourceBoardId) {
      this.currentBoard = cached;
      this.currentView = `saved:${created.id}`;
      this.renderViewTabs();
      this.renderCurrentView();
    }

    this.showToast(`Vista ${created.name} creada`);
  };

  app.renderFilesGallery = async function renderFilesGalleryNavigationSafe(view) {
    const content = document.getElementById('content');
    const boardId = String(this.currentBoardId?.() || '');
    const viewId = String(this.currentView || '');
    if (!content || !boardId || !viewId) return;

    content.innerHTML = '<div class="loading"><span class="spinner"></span>Cargando archivos…</div>';
    let updates = [];
    try {
      updates = await this.api(`/api/updates/board/${encodeURIComponent(boardId)}`);
    } catch {
      updates = [];
    }

    if (!this.filesViewContextStillCurrent(boardId, viewId)) return;

    const entries = this.filesGalleryEntries(updates);
    const layout = this.filesGalleryLayout(view);
    const localCount = entries.filter(entry => entry.file.source === 'new-monday').length;
    const importedCount = entries.filter(entry => entry.file.source !== 'new-monday' && entry.file.source !== 'link').length;
    const updateCount = entries.filter(entry => entry.origin === 'update').length;

    const cards = entries.map(({ file, item, column, context, group, origin }) => {
      const icon = this.fileIconFor(file);
      const subtitle = [item?.name || 'Elemento', column?.title || context].filter(Boolean).join(' · ');
      const source = origin === 'update' ? 'Updates' : file.source === 'new-monday' ? 'New Monday' : file.source === 'link' ? 'Enlace' : 'Importado';
      const action = file.url
        ? `<a href="${this.escapeAttr(file.url)}" target="_blank" rel="noopener noreferrer" class="files-gallery-open">Abrir ↗</a>`
        : file.id ? `<a href="/api/files/${this.escapeAttr(file.id)}" target="_blank" rel="noopener noreferrer" class="files-gallery-open">Abrir ↗</a>` : '<span class="files-gallery-unavailable">Sin enlace disponible</span>';
      return `<article class="files-gallery-card" style="--file-group-color:${this.escapeAttr(group?.color || '#579bfc')}">
        <div class="files-gallery-icon">${icon}</div>
        <div class="files-gallery-copy"><strong title="${this.escapeAttr(file.name)}">${this.escapeHtml(file.name)}</strong><span>${this.escapeHtml(subtitle)}</span><small>${this.escapeHtml(source)}${group?.title ? ` · ${this.escapeHtml(group.title)}` : ''}</small></div>
        <div class="files-gallery-action">${action}</div>
      </article>`;
    }).join('');

    content.innerHTML = `<div class="files-gallery-shell ${layout === 'list' ? 'is-list' : 'is-grid'}">
      <div class="files-gallery-header">
        <div><h2>${this.escapeHtml(view?.name || 'Archivos')}</h2><p>Archivos de columnas y conversaciones de este tablero.</p></div>
        <div class="files-gallery-stats"><span>${entries.length} archivos</span>${localCount ? `<span>${localCount} locales</span>` : ''}${importedCount ? `<span>${importedCount} importados</span>` : ''}${updateCount ? `<span>${updateCount} en Updates</span>` : ''}</div>
        <div class="files-gallery-layout"><button type="button" data-file-storage-manager title="Administrar almacenamiento local">⚙</button><button type="button" data-files-layout="grid" class="${layout === 'grid' ? 'active' : ''}" title="Cuadrícula">▦</button><button type="button" data-files-layout="list" class="${layout === 'list' ? 'active' : ''}" title="Lista">☷</button></div>
      </div>
      ${entries.length ? `<div class="files-gallery-content">${cards}</div>` : '<div class="files-gallery-empty"><strong>No hay archivos todavía</strong><span>Añade un archivo desde una celda Archivo o desde Updates.</span></div>'}
    </div>`;

    content.querySelectorAll('[data-files-layout]').forEach(button => button.addEventListener('click', () => this.setFilesGalleryLayout(view, button.dataset.filesLayout)));
    content.querySelector('[data-file-storage-manager]')?.addEventListener('click', () => this.openFileStorageManager());
  };
})();
