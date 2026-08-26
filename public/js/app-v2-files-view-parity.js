(() => {
  const originalCreateViewOfType = app.createViewOfType.bind(app);
  const originalOpenAddViewMenu = app.openAddViewMenu.bind(app);
  const originalRenderSavedView = app.renderSavedView.bind(app);

  app.createViewOfType = async function createViewOfTypeWithFiles(type) {
    if (type !== 'files') return originalCreateViewOfType(type);
    if (!this.currentBoardId()) return;
    try {
      const created = await this.api(`/api/boards/${this.currentBoardId()}/views`, {
        method: 'POST',
        body: JSON.stringify({
          name: this.uniqueViewName('Archivos'),
          type: 'files',
          filter: { logic: 'and', rules: [] },
          sort: [],
          settings: { layout: 'grid' },
          order: (this.currentBoard.views || []).length
        })
      });
      this.currentBoard.views = [...(this.currentBoard.views || []), created];
      const cached = this.boards.find(board => String(board._id) === String(this.currentBoard._id));
      if (cached) cached.views = this.currentBoard.views;
      this.currentView = `saved:${created.id}`;
      this.renderViewTabs();
      this.renderCurrentView();
      this.showToast(`Vista ${created.name} creada`);
    } catch (err) {
      this.showToast(err.message, true);
    }
  };

  app.openAddViewMenu = function openAddViewMenuWithFiles(anchor) {
    originalOpenAddViewMenu(anchor);
    const menu = document.querySelector('.view-add-menu');
    if (!menu || menu.querySelector('[data-add-view="files"]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.addView = 'files';
    button.innerHTML = '<span class="view-type-icon">▤</span><span><strong>Archivos</strong><small>Galería de archivos del tablero</small></span>';
    button.addEventListener('click', () => {
      menu.remove();
      this.createViewOfType('files');
    });
    menu.appendChild(button);
  };

  app.filesGalleryEntries = function filesGalleryEntries(updateRecords = []) {
    const fileColumns = this.effectiveColumns().filter(column => ['file', 'files'].includes(String(column.type || '').toLowerCase()));
    const entries = [];
    const groupFor = item => this.effectiveGroups().find(group => group.id === item?.groupId || group.title === item?.group) || null;

    this.boardItems({ includeSubitems: true }).forEach(item => {
      fileColumns.forEach(column => {
        const files = this.fileEntriesFromValue(this.valueFor(item, column));
        files.forEach(file => entries.push({ file, item, column, context: column.title, group: groupFor(item), origin: 'column' }));
      });
    });

    updateRecords.forEach(update => {
      const item = this.findItem(update.item?._id || update.item);
      const add = (file, context) => entries.push({ file: { ...file, key: file.id ? `id:${file.id}` : `update:${update._id}:${file.name}` }, item, column: null, context, group: groupFor(item), origin: 'update' });
      (update.attachments || []).forEach(file => add(file, 'Actualización'));
      (update.replies || []).forEach(reply => (reply.attachments || []).forEach(file => add(file, 'Respuesta')));
    });

    return entries;
  };

  app.filesGalleryLayoutKey = function filesGalleryLayoutKey(view) {
    return `new-monday:files-view:${this.currentBoardId()}:${view?.id || 'files'}:layout`;
  };

  app.filesGalleryLayout = function filesGalleryLayout(view) {
    try { return localStorage.getItem(this.filesGalleryLayoutKey(view)) || view?.settings?.layout || 'grid'; }
    catch { return view?.settings?.layout || 'grid'; }
  };

  app.setFilesGalleryLayout = function setFilesGalleryLayout(view, layout) {
    try { localStorage.setItem(this.filesGalleryLayoutKey(view), layout); } catch { /* local preference only */ }
    this.renderFilesGallery(view);
  };

  app.renderSavedView = function renderSavedViewWithFiles(viewId) {
    const view = (this.currentBoard.views || []).find(entry => String(entry.id) === String(viewId));
    const type = String(view?.type || '').toLowerCase();
    const name = String(view?.name || '').toLowerCase();
    if (view && (type === 'files' || name.includes('archivos') || name.includes('files gallery'))) return this.renderFilesGallery(view);
    return originalRenderSavedView(viewId);
  };

  app.formatStorageBytes = function formatStorageBytes(value) {
    const bytes = Number(value || 0);
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  };

  app.openFileStorageManager = async function openFileStorageManager() {
    this.openModal(`<div class="modal-card file-storage-modal">
      <div class="modal-header"><div><h2>Almacenamiento de archivos</h2><p>Revisión segura de GridFS de New Monday</p></div><button type="button" class="modal-close" data-close-modal>×</button></div>
      <div class="file-storage-loading"><span class="spinner"></span> Buscando archivos huérfanos…</div>
      <div class="modal-actions"><button type="button" class="button primary" data-close-modal>Cerrar</button></div>
    </div>`);
    try {
      const report = await this.api('/api/files/orphans');
      const host = document.querySelector('.file-storage-modal');
      if (!host) return;
      const rows = (report.orphans || []).map(file => `<li data-orphan-file="${this.escapeAttr(file.id)}"><div><strong>${this.escapeHtml(file.name || 'Archivo')}</strong><span>${this.escapeHtml(file.mimetype || '')}</span></div><small>${this.escapeHtml(this.formatStorageBytes(file.size))}${file.uploadedAt ? ` · ${this.escapeHtml(new Date(file.uploadedAt).toLocaleString('es-ES'))}` : ''}</small></li>`).join('');
      host.querySelector('.file-storage-loading')?.remove();
      const panel = document.createElement('div');
      panel.className = 'file-storage-report';
      panel.innerHTML = `<div class="file-storage-summary"><div><strong>${Number(report.orphanCount || 0)}</strong><span>huérfanos</span></div><div><strong>${this.escapeHtml(this.formatStorageBytes(report.orphanBytes))}</strong><span>recuperables</span></div><div><strong>${Number(report.scanned || 0)}</strong><span>revisados</span></div></div>
        <p>Un archivo huérfano está en el almacenamiento local pero ya no está referenciado por ningún elemento, subitem, Update o respuesta. Esta revisión no modifica Monday.</p>
        ${report.limited ? '<div class="file-storage-warning">La revisión alcanzó el límite de seguridad. Puede haber más archivos fuera de esta muestra.</div>' : ''}
        ${rows ? `<ul class="file-storage-orphans">${rows}</ul>` : '<div class="file-storage-clean">✓ No hay archivos huérfanos detectados.</div>'}`;
      host.querySelector('.modal-actions')?.before(panel);
      if (report.orphanCount) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'button danger file-storage-cleanup';
        button.textContent = `Eliminar ${Number(report.orphanCount)} huérfanos`;
        button.addEventListener('click', async () => {
          const ok = confirm(`Eliminar ${Number(report.orphanCount)} archivos huérfanos (${this.formatStorageBytes(report.orphanBytes)}) de New Monday? Se comprobarán de nuevo las referencias antes de borrar.`);
          if (!ok) return;
          button.disabled = true;
          button.textContent = 'Comprobando y eliminando…';
          try {
            const result = await this.api('/api/files/orphans/cleanup', {
              method: 'POST',
              body: JSON.stringify({
                confirm: report.confirmationRequired,
                fileIds: (report.orphans || []).map(file => file.id)
              })
            });
            this.showToast(`${Number(result.deletedCount || 0)} archivos huérfanos eliminados`);
            this.closeModal();
            this.openFileStorageManager();
          } catch (error) {
            button.disabled = false;
            button.textContent = `Eliminar ${Number(report.orphanCount)} huérfanos`;
            this.showToast(error.message, true);
          }
        });
        const actions = host.querySelector('.modal-actions');
        actions?.prepend(button);
      }
    } catch (error) {
      const loading = document.querySelector('.file-storage-modal .file-storage-loading');
      if (loading) loading.innerHTML = `<span class="file-storage-error">No se pudo revisar el almacenamiento: ${this.escapeHtml(error.message)}</span>`;
    }
  };

  app.renderFilesGallery = async function renderFilesGallery(view) {
    const content = document.getElementById('content');
    if (!content) return;
    const boardId = String(this.currentBoardId() || '');
    content.innerHTML = '<div class="loading"><span class="spinner"></span>Cargando archivos…</div>';
    let updates = [];
    try { updates = await this.api(`/api/updates/board/${boardId}`); }
    catch { updates = []; }
    if (String(this.currentBoardId() || '') !== boardId) return;

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
