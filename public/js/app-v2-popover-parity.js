(() => {
  app.positionMenu = function positionMenuWithAnchorTracking(menu, anchor) {
    if (!menu || !anchor) return;
    menu.__newMondayAnchor = anchor;
    document.body.appendChild(menu);

    const controller = new AbortController();
    const nativeRemove = menu.remove.bind(menu);
    let frame = null;

    const cleanup = () => {
      controller.abort();
      if (frame) cancelAnimationFrame(frame);
      frame = null;
    };
    menu.remove = () => {
      cleanup();
      nativeRemove();
    };

    const place = () => {
      frame = null;
      if (!menu.isConnected || !anchor.isConnected) return menu.remove();
      const rect = anchor.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) return menu.remove();
      const width = Math.max(menu.offsetWidth, 220);
      const height = menu.offsetHeight;
      let left = rect.left;
      let top = rect.bottom + 6;
      if (left + width > window.innerWidth - 12) left = window.innerWidth - width - 12;
      if (top + height > window.innerHeight - 12) top = rect.top - height - 6;
      menu.style.left = `${Math.max(8, left)}px`;
      menu.style.top = `${Math.max(8, Math.min(top, window.innerHeight - height - 8))}px`;
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(place);
    };

    place();
    window.addEventListener('resize', schedule, { passive: true, signal: controller.signal });
    window.addEventListener('scroll', schedule, { passive: true, capture: true, signal: controller.signal });
    setTimeout(() => {
      if (!menu.isConnected) return;
      document.addEventListener('pointerdown', event => {
        if (!menu.contains(event.target) && event.target !== anchor && !anchor.contains?.(event.target)) menu.remove();
      }, { signal: controller.signal });
    }, 0);
  };
})();