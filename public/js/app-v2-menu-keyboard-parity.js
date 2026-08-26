(() => {
  const basePositionMenu = app.positionMenu.bind(app);
  let menuSequence = 0;

  function activeMenu() {
    const menus = [...document.querySelectorAll('.floating-menu,.status-menu')]
      .filter(menu => menu.isConnected && menu.offsetParent !== null);
    return menus.at(-1) || null;
  }

  function visibleButtons(menu) {
    return [...menu.querySelectorAll('button:not([disabled])')]
      .filter(button => !button.hidden && button.offsetParent !== null);
  }

  function visibleSearch(menu) {
    const input = menu.querySelector('input[type="search"]:not([disabled])');
    return input && !input.hidden && input.offsetParent !== null ? input : null;
  }

  app.positionMenu = function positionMenuKeyboardAccessible(menu, anchor) {
    basePositionMenu(menu, anchor);
    if (!menu || !anchor || !menu.isConnected) return;

    if (!menu.id) menu.id = `nm-menu-${++menuSequence}`;
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-orientation', 'vertical');
    anchor.setAttribute('aria-haspopup', 'menu');
    anchor.setAttribute('aria-controls', menu.id);
    anchor.setAttribute('aria-expanded', 'true');

    visibleButtons(menu).forEach(button => {
      button.setAttribute('role', 'menuitem');
      button.tabIndex = -1;
    });

    const removeWithAriaCleanup = menu.remove.bind(menu);
    menu.remove = () => {
      anchor.setAttribute('aria-expanded', 'false');
      anchor.removeAttribute('aria-controls');
      removeWithAriaCleanup();
    };

    requestAnimationFrame(() => {
      if (!menu.isConnected) return;
      const first = visibleSearch(menu) || visibleButtons(menu)[0];
      first?.focus?.({ preventScroll: true });
    });
  };

  document.addEventListener('keydown', event => {
    const menu = activeMenu();
    if (!menu) return;
    const active = document.activeElement;
    const buttons = visibleButtons(menu);
    if (!buttons.length && event.key !== 'Escape') return;

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      const anchor = menu.__newMondayAnchor;
      menu.remove();
      requestAnimationFrame(() => anchor?.isConnected && anchor.focus?.({ preventScroll: true }));
      return;
    }

    const isSearch = active?.matches?.('input[type="search"]');
    if (isSearch && event.key === 'ArrowDown') {
      event.preventDefault();
      buttons[0]?.focus?.({ preventScroll: true });
      return;
    }
    if (!menu.contains(active) || !active?.matches?.('button')) return;

    const index = buttons.indexOf(active);
    if (index < 0) return;
    let next = null;
    if (event.key === 'ArrowDown') next = buttons[(index + 1) % buttons.length];
    else if (event.key === 'ArrowUp') next = buttons[(index - 1 + buttons.length) % buttons.length];
    else if (event.key === 'Home') next = buttons[0];
    else if (event.key === 'End') next = buttons[buttons.length - 1];
    if (!next) return;
    event.preventDefault();
    next.focus?.({ preventScroll: true });
  }, true);
})();
