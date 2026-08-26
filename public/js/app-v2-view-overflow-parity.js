(() => {
  const baseRenderViewTabs = app.renderViewTabs.bind(app);

  app.viewOverflowObserver = null;
  app.viewOverflowRaf = null;

  app.openViewOverflowMenu = function openViewOverflowMenu(anchor, hiddenTabs) {
    document.querySelectorAll('.view-overflow-menu,.floating-menu').forEach(node => node.remove());
    const menu = document.createElement('div');
    menu.className = 'floating-menu view-overflow-menu';
    menu.innerHTML = `<div class="menu-title">Más vistas</div>${hiddenTabs.map((tab, index) => `<button type="button" data-overflow-view-index="${index}" class="${tab.classList.contains('active') ? 'active' : ''}"><span>${this.escapeHtml(tab.textContent.trim() || 'Vista')}</span>${tab.classList.contains('active') ? '<small>Actual</small>' : ''}</button>`).join('')}`;
    menu.querySelectorAll('[data-overflow-view-index]').forEach(button => button.addEventListener('click', () => {
      const tab = hiddenTabs[Number(button.dataset.overflowViewIndex)];
      menu.remove();
      tab?.click();
    }));
    this.positionMenu(menu, anchor);
  };

  app.applyViewOverflow = function applyViewOverflow() {
    const host = document.getElementById('view-tabs');
    if (!host || !this.currentBoard) return;
    host.querySelector('.view-tab-overflow')?.remove();
    const tabs = [...host.querySelectorAll('.view-tab[data-view]')].filter(tab => !tab.classList.contains('view-tab-utilities'));
    tabs.forEach(tab => {
      tab.classList.remove('view-overflow-hidden');
      tab.removeAttribute('aria-hidden');
      tab.removeAttribute('tabindex');
    });
    if (tabs.length <= 4 || host.clientWidth <= 0) return;

    const plus = host.querySelector('.view-tab-plus');
    const utilities = host.querySelector('.view-tab-utilities');
    const fixedWidth = (plus?.getBoundingClientRect().width || 42) + (utilities?.getBoundingClientRect().width || 42) + 96;
    const available = Math.max(160, host.clientWidth - fixedWidth);
    const widths = new Map(tabs.map(tab => [tab, Math.max(62, tab.getBoundingClientRect().width || 0)]));
    let total = tabs.reduce((sum, tab) => sum + widths.get(tab), 0);
    if (total <= available) return;

    const active = tabs.find(tab => tab.classList.contains('active')) || null;
    const hidden = [];
    const candidates = tabs.filter(tab => tab !== active).reverse();
    while (total > available && candidates.length) {
      const tab = candidates.shift();
      tab.classList.add('view-overflow-hidden');
      tab.setAttribute('aria-hidden', 'true');
      tab.setAttribute('tabindex', '-1');
      hidden.unshift(tab);
      total -= widths.get(tab);
    }
    if (!hidden.length) return;

    const overflow = document.createElement('button');
    overflow.type = 'button';
    overflow.className = 'view-tab view-tab-overflow';
    overflow.innerHTML = `<span>Más</span><small>${hidden.length}</small><span aria-hidden="true">⌄</span>`;
    overflow.title = `${hidden.length} vistas ocultas por espacio`;
    overflow.setAttribute('aria-label', `Mostrar ${hidden.length} vistas adicionales`);
    overflow.addEventListener('click', () => this.openViewOverflowMenu(overflow, hidden));
    host.insertBefore(overflow, plus || utilities || null);
  };

  app.scheduleViewOverflow = function scheduleViewOverflow() {
    cancelAnimationFrame(this.viewOverflowRaf);
    this.viewOverflowRaf = requestAnimationFrame(() => this.applyViewOverflow());
  };

  app.observeViewOverflow = function observeViewOverflow() {
    const host = document.getElementById('view-tabs');
    if (!host || typeof ResizeObserver === 'undefined') return;
    this.viewOverflowObserver?.disconnect();
    this.viewOverflowObserver = new ResizeObserver(() => this.scheduleViewOverflow());
    this.viewOverflowObserver.observe(host);
  };

  app.renderViewTabs = function renderViewTabsWithOverflow() {
    baseRenderViewTabs();
    this.observeViewOverflow();
    this.scheduleViewOverflow();
  };
})();
