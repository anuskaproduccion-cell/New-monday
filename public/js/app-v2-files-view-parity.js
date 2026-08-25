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

  app.filesGalleryEntries = function filesGalleryEntries() {
    const fileColumns = this.effectiveColumns().filter(column => column.type === 'file');
    const entries = [];
    this.boardItems({ includeSubitems: true }).forEach(item => {
      fileColumns.forEach(column => {
        const files = this.fileEntriesFromValue(this.valueFor(item, column));
        files.forEach(file => entries.push({
          file,
          item,
          column,
          group: this.effectiveGroups().find(group => group.id === item.groupId || group.title === item.group) || null
        }));
      });
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

  app.renderFilesGallery = function renderFilesGallery(view) {
    const content = document.getElementById('content');
    if (!content) return;
    const entries = this.filesGalleryEntries();
    const layout = this.filesGalleryLayout(view);
    const localCount = entries.filter(entry => entry.file.source === 'new-monday').length;
    const importedCount = entries.length - localCount;

    const cards = entries.map(({ file, item, column, group }) => {
      const icon = this.fileIconFor(file);
      const subtitle = [item.name, column.title].filter(Boolean).join(' · ');
      const source = file.source === 'new-monday' ? 'New Monday' : file.source === 'link' ? 'Enlace' : 'Importado';
      const action = file.url
        ? `<a href="${this.escapeAttr(file.url)}" target="_blank" rel="noopener noreferrer" class="files-gallery-open">Abrir ↗</a>`
        : '<span class="files-gallery-unavailable">Sin enlace disponible</span>';
      return `<article class="files-gallery-card" style="--file-group-color:${this.escapeAttr(group?.color || '#579bfc')}">
        <div class="files-gallery-icon">${icon}</div>
        <div class="files-gallery-copy"><strong title="${this.escapeAttr(file.name)}">${this.escapeHtml(file.name)}</strong><span>${this.escapeHtml(subtitle)}</span><small>${this.escapeHtml(source)}${group?.title ? ` · ${this.escapeHtml(group.title)}` : ''}</small></div>
        <div class="files-gallery-action">${action}</div>
      </article>`;
    }).join('');

    content.innerHTML = `<div class="files-gallery-shell ${layout === 'list' ? 'is-list' : 'is-grid'}">
      <div class="files-gallery-header">
        <div><h2>${this.escapeHtml(view?.name || 'Archivos')}</h2><p>Archivos de las columnas Archivo de este tablero.</p></div>
        <div class="files-gallery-stats"><span>${entries.length} archivos</span>${localCount ? `<span>${localCount} locales</span>` : ''}${importedCount ? `<span>${importedCount} importados</span>` : ''}</div>
        <div class="files-gallery-layout"><button type="button" data-files-layout="grid" class="${layout === 'grid' ? 'active' : ''}" title="Cuadrícula">▦</button><button type="button" data-files-layout="list" class="${layout === 'list' ? 'active' : ''}" title="Lista">☷</button></div>
      </div>
      ${entries.length ? `<div class="files-gallery-content">${cards}</div>` : '<div class="files-gallery-empty"><strong>No hay archivos todavía</strong><span>Añade un archivo desde una celda de tipo Archivo.</span></div>'}
    </div>`;

    content.querySelectorAll('[data-files-layout]').forEach(button => button.addEventListener('click', () => this.setFilesGalleryLayout(view, button.dataset.filesLayout)));
  };
})();
