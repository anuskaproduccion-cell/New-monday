(() => {
  function activeMenu() {
    return document.querySelector('.floating-menu:last-of-type, .status-menu:last-of-type');
  }

  function visibleButtons(menu) {
    return [...menu.querySelectorAll('button:not([disabled])')]
      .filter(button => !button.hidden && button.offsetParent !== null);
  }

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
      requestAnimationFrame(() => anchor?.isConnected && anchor.focus?.());
      return;
    }

    const isSearch = active?.matches?.('input[type="search"]');
    if (isSearch && event.key === 'ArrowDown') {
      event.preventDefault();
      buttons[0]?.focus();
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
    next.focus();
  }, true);
})();