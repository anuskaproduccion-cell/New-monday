(() => {
  const baseOpenModal = app.openModal.bind(app);
  const baseCloseModal = app.closeModal.bind(app);

  app.modalReturnFocus = null;
  app.modalKeydownHandler = null;
  app.modalBackgroundState = [];
  app.modalSequence = 0;

  app.modalFocusableElements = function modalFocusableElements(root) {
    if (!root) return [];
    return [...root.querySelectorAll('a[href],button,input,select,textarea,[tabindex]')]
      .filter(node => !node.disabled && node.getAttribute?.('aria-hidden') !== 'true' && Number(node.tabIndex) !== -1)
      .filter(node => node.offsetParent !== null || node === document.activeElement);
  };

  app.setModalBackgroundInert = function setModalBackgroundInert(enabled) {
    if (enabled) {
      this.modalBackgroundState = [...document.querySelectorAll('.sidebar,.main')].map(node => ({
        node,
        hadInert: node.hasAttribute('inert')
      }));
      this.modalBackgroundState.forEach(({ node }) => node.setAttribute('inert', ''));
      return;
    }
    this.modalBackgroundState.forEach(({ node, hadInert }) => {
      if (!hadInert) node.removeAttribute('inert');
    });
    this.modalBackgroundState = [];
  };

  app.decorateOpenModalAccessibility = function decorateOpenModalAccessibility() {
    const root = document.getElementById('modal-root');
    const dialog = root?.querySelector('.modal-card');
    if (!root || !dialog) return;

    if (!dialog.hasAttribute('role')) dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');

    const title = dialog.querySelector('h1,h2,h3');
    if (title && !title.id) title.id = `nm-modal-title-${++this.modalSequence}`;
    if (title && !dialog.hasAttribute('aria-label') && !dialog.hasAttribute('aria-labelledby')) {
      dialog.setAttribute('aria-labelledby', title.id);
    }

    this.setModalBackgroundInert(true);

    if (this.modalKeydownHandler) root.removeEventListener('keydown', this.modalKeydownHandler, true);
    this.modalKeydownHandler = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.closeModal();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusables = this.modalFocusableElements(dialog);
      if (!focusables.length) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }

      const currentIndex = focusables.indexOf(document.activeElement);
      if (event.shiftKey) {
        if (currentIndex <= 0) {
          event.preventDefault();
          focusables[focusables.length - 1].focus();
        }
      } else if (currentIndex < 0 || currentIndex === focusables.length - 1) {
        event.preventDefault();
        focusables[0].focus();
      }
    };
    root.addEventListener('keydown', this.modalKeydownHandler, true);

    requestAnimationFrame(() => {
      const autofocus = dialog.querySelector('[autofocus]');
      const first = autofocus || this.modalFocusableElements(dialog)[0];
      if (first) first.focus({ preventScroll: true });
      else {
        dialog.tabIndex = -1;
        dialog.focus({ preventScroll: true });
      }
    });
  };

  app.openModal = function openModalAccessible(html) {
    const active = document.activeElement;
    this.modalReturnFocus = active && active !== document.body ? active : this.currentActiveCellElement?.() || null;
    baseOpenModal(html);
    this.decorateOpenModalAccessibility();
  };

  app.closeModal = function closeModalAccessible() {
    const root = document.getElementById('modal-root');
    if (root && this.modalKeydownHandler) root.removeEventListener('keydown', this.modalKeydownHandler, true);
    this.modalKeydownHandler = null;
    const returnFocus = this.modalReturnFocus;
    this.modalReturnFocus = null;
    this.setModalBackgroundInert(false);
    baseCloseModal();
    requestAnimationFrame(() => {
      if (returnFocus?.isConnected && typeof returnFocus.focus === 'function') returnFocus.focus({ preventScroll: true });
      else this.currentActiveCellElement?.()?.focus?.({ preventScroll: true });
    });
  };
})();
