(() => {
  const GROUP_COLORS = [
    '#579bfc', '#00c875', '#a25ddc', '#ff642e', '#fdab3d', '#e2445c',
    '#037f4c', '#0086c0', '#9cd326', '#cab641', '#ffcb00', '#784bd1',
    '#bb3354', '#ff7575', '#401694', '#225091', '#7f5347', '#c4c4c4'
  ];

  const baseBindBoardEvents = app.bindBoardEvents.bind(app);

  app.groupColorChoices = GROUP_COLORS;

  app.enhanceGroupHeaders = function enhanceGroupHeaders() {
    const content = document.getElementById('content');
    if (!content) return;

    content.querySelectorAll('.group-section').forEach(section => {
      const row = section.querySelector('.group-header-row');
      const legacyHeader = row?.querySelector('.group-header');
      if (!row || !legacyHeader || row.dataset.mondayEnhanced === 'true') return;

      const groupId = section.dataset.groupId || legacyHeader.dataset.groupId || '';
      const title = legacyHeader.querySelector('.group-title')?.textContent || 'Grupo';
      const count = legacyHeader.querySelector('.group-count')?.textContent || '0';
      const collapsed = this.collapsedGroups.has(groupId);

      row.dataset.mondayEnhanced = 'true';
      row.classList.add('monday-group-header');
      row.innerHTML = `
        <button class="group-menu-trigger" data-action="group-menu" data-group-id="${this.escapeAttr(groupId)}" type="button" aria-label="Menú de grupo" title="Menú de grupo">⋯</button>
        <button class="group-collapse-button" data-action="toggle-group" data-group-id="${this.escapeAttr(groupId)}" type="button" aria-label="${collapsed ? 'Expandir grupo' : 'Contraer grupo'}" title="${collapsed ? 'Expandir grupo' : 'Contraer grupo'}">
          <span class="group-chevron">${collapsed ? '▶' : '▼'}</span>
        </button>
        <button class="group-color-button" data-action="group-color" data-group-id="${this.escapeAttr(groupId)}" type="button" aria-label="Cambiar color de grupo" title="Cambiar color de grupo">
          <span class="group-dot"></span>
        </button>
        <button class="group-title-button" data-action="rename-group-inline" data-group-id="${this.escapeAttr(groupId)}" type="button" title="Haz clic para cambiar el nombre">${this.escapeHtml(title)}</button>
        <span class="group-count">${this.escapeHtml(count)}</span>
      `;
    });
  };

  app.bindBoardEvents = function bindBoardEventsWithMondayGroups() {
    this.enhanceGroupHeaders();
    baseBindBoardEvents();

    const content = document.getElementById('content');
    if (!content) return;

    content.querySelectorAll('[data-action="rename-group-inline"]').forEach(button => {
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        this.beginInlineGroupRename(button.dataset.groupId, button);
      });
    });

    content.querySelectorAll('[data-action="group-color"]').forEach(button => {
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        this.openGroupColorPalette(button, button.dataset.groupId);
      });
    });
  };

  app.beginInlineGroupRename = function beginInlineGroupRename(groupId, anchor) {
    const group = this.effectiveGroups().find(entry => entry.id === groupId);
    if (!group || !anchor || anchor.dataset.editing === 'true') return;

    anchor.dataset.editing = 'true';
    const input = document.createElement('input');
    input.className = 'group-title-input';
    input.value = group.title || '';
    input.setAttribute('aria-label', 'Nombre del grupo');
    input.style.width = `${Math.max(110, Math.min(460, (String(group.title || '').length + 2) * 9))}px`;
    anchor.replaceWith(input);

    let settled = false;
    const finish = async (save) => {
      if (settled) return;
      settled = true;
      const nextTitle = input.value.trim();
      if (!save || !nextTitle || nextTitle === group.title) {
        this.renderBoard();
        return;
      }
      await this.patchGroup(groupId, { title: nextTitle });
    };

    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        input.blur();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        settled = true;
        this.renderBoard();
      }
    });
    input.addEventListener('blur', () => finish(true), { once: true });

    input.focus();
    input.select();
  };

  app.openGroupColorPalette = function openGroupColorPalette(anchor, groupId) {
    document.querySelectorAll('.floating-menu,.group-color-menu').forEach(node => node.remove());
    const group = this.effectiveGroups().find(entry => entry.id === groupId);
    if (!group) return;

    const menu = document.createElement('div');
    menu.className = 'floating-menu group-color-menu';
    menu.setAttribute('role', 'dialog');
    menu.setAttribute('aria-label', 'Cambiar color de grupo');
    menu.innerHTML = `
      <div class="menu-title">Cambiar color de grupo</div>
      <div class="group-color-grid">
        ${GROUP_COLORS.map(color => `
          <button class="group-color-swatch${String(group.color).toLowerCase() === color.toLowerCase() ? ' is-selected' : ''}" data-group-color="${color}" type="button" aria-label="Color ${color}" title="${color}">
            <span style="background:${color}"></span>
          </button>
        `).join('')}
      </div>
    `;

    menu.querySelectorAll('[data-group-color]').forEach(button => {
      button.addEventListener('click', async () => {
        const color = button.dataset.groupColor;
        menu.remove();
        await this.patchGroup(groupId, { color });
      });
    });

    this.positionMenu(menu, anchor);
    setTimeout(() => document.addEventListener('pointerdown', event => {
      if (!menu.contains(event.target) && event.target !== anchor) menu.remove();
    }, { once: true }), 0);
  };

  app.openGroupMenu = function openMondayGroupMenu(anchor, groupId) {
    document.querySelectorAll('.floating-menu,.group-color-menu').forEach(node => node.remove());
    const group = this.effectiveGroups().find(entry => entry.id === groupId);
    if (!group) return;

    const menu = document.createElement('div');
    menu.className = 'floating-menu group-actions-menu';
    menu.innerHTML = `
      <div class="menu-title">${this.escapeHtml(group.title)}</div>
      <button data-group-action="rename" type="button"><span>✎ Cambiar nombre</span></button>
      <button data-group-action="color" type="button"><span class="menu-color-label"><span class="menu-color-dot" style="background:${this.escapeAttr(group.color || '#579bfc')}"></span>Cambiar color de grupo</span><span>›</span></button>
      <div class="menu-separator"></div>
      <button data-group-action="duplicate" type="button"><span>⧉ Duplicar grupo</span></button>
      <button data-group-action="collapse" type="button"><span>${this.collapsedGroups.has(groupId) ? '▾ Expandir grupo' : '▸ Contraer grupo'}</span></button>
    `;

    menu.querySelector('[data-group-action="rename"]')?.addEventListener('click', () => {
      menu.remove();
      const titleButton = document.querySelector(`.group-section[data-group-id="${CSS.escape(groupId)}"] [data-action="rename-group-inline"]`);
      this.beginInlineGroupRename(groupId, titleButton);
    });

    menu.querySelector('[data-group-action="color"]')?.addEventListener('click', event => {
      const colorAnchor = event.currentTarget;
      this.openGroupColorPalette(colorAnchor, groupId);
      menu.remove();
    });

    menu.querySelector('[data-group-action="duplicate"]')?.addEventListener('click', async () => {
      try {
        const result = await this.api(`/api/boards/${this.currentBoardId()}/groups/${encodeURIComponent(groupId)}/duplicate`, {
          method: 'POST',
          body: JSON.stringify({})
        });
        menu.remove();
        await this.reloadBoardState();
        const count = Number(result?.duplicatedItems || 0);
        this.showToast(count ? `Grupo duplicado · ${count} elementos` : 'Grupo duplicado');
      } catch (err) {
        this.showToast(err.message, true);
      }
    });

    menu.querySelector('[data-group-action="collapse"]')?.addEventListener('click', () => {
      menu.remove();
      if (this.collapsedGroups.has(groupId)) this.collapsedGroups.delete(groupId);
      else this.collapsedGroups.add(groupId);
      this.renderBoard();
    });

    this.positionMenu(menu, anchor);
    setTimeout(() => document.addEventListener('pointerdown', event => {
      if (!menu.contains(event.target) && event.target !== anchor) menu.remove();
    }, { once: true }), 0);
  };
})();
