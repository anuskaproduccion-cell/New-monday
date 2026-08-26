(() => {
  app.boardLifecycleSourceStillActive = function boardLifecycleSourceStillActive(sourceBoardId) {
    return Boolean(sourceBoardId) && String(this.currentBoardId?.() || '') === String(sourceBoardId);
  };

  app.reconcileDuplicatedBoardSnapshot = async function reconcileDuplicatedBoardSnapshot(result) {
    const duplicateId = String(result?.board?._id || '');
    if (!duplicateId) throw new Error('La respuesta de duplicación no incluye el tablero creado');

    const [boards, duplicateItems] = await Promise.all([
      this.api('/api/boards'),
      this.api(`/api/items/board/${encodeURIComponent(duplicateId)}?includeSubitems=true`)
    ]);

    if (!Array.isArray(boards) || !Array.isArray(duplicateItems)) {
      throw new Error('No se pudo validar el snapshot del tablero duplicado');
    }

    this.boards = boards;
    this.items = this.items
      .filter(item => String(item.board?._id || item.board || '') !== duplicateId)
      .concat(duplicateItems);
    this.renderSidebar?.();

    return this.boards.find(board => String(board._id) === duplicateId) || result.board;
  };

  app.duplicateCurrentBoard = async function duplicateCurrentBoardNavigationSafe(menu) {
    const sourceBoard = this.currentBoard;
    if (!sourceBoard?._id) return;

    const sourceBoardId = String(sourceBoard._id);
    const proposed = `${sourceBoard.name} (copia)`;
    const name = window.prompt('Nombre del tablero duplicado:', proposed);
    if (name === null) return;

    const trimmed = String(name || '').trim();
    if (!trimmed) return this.showToast('El tablero necesita un nombre', true);

    let result;
    try {
      menu?.remove();
      this.showToast('Duplicando tablero…');
      result = await this.api(`/api/boards/${encodeURIComponent(sourceBoardId)}/duplicate`, {
        method: 'POST',
        body: JSON.stringify({ name: trimmed })
      });
    } catch (error) {
      this.showToast(error.message, true);
      return;
    }

    let duplicate = null;
    try {
      duplicate = await this.reconcileDuplicatedBoardSnapshot(result);
    } catch (syncError) {
      const created = result?.board;
      if (created?._id) {
        const index = this.boards.findIndex(board => String(board._id) === String(created._id));
        if (index >= 0) this.boards[index] = created;
        else this.boards.push(created);
        this.renderSidebar?.();
      }
      this.showToast(`Tablero duplicado, pero falta resincronizar la copia · ${syncError.message}`, true);
      return;
    }

    if (duplicate && this.boardLifecycleSourceStillActive(sourceBoardId)) {
      await this.selectBoard(duplicate);
    }

    this.showToast(
      `Tablero duplicado · ${Number(result.itemsDuplicated || 0)} elementos · ${Number(result.subitemsDuplicated || 0)} subitems`
    );
  };

  app.archiveCurrentBoard = async function archiveCurrentBoardNavigationSafe(menu) {
    const sourceBoard = this.currentBoard;
    if (!sourceBoard?._id) return;

    const sourceBoardId = String(sourceBoard._id);
    if (!window.confirm(`¿Archivar el tablero “${sourceBoard.name}”? Los elementos se conservarán.`)) return;

    try {
      await this.api(`/api/boards/${encodeURIComponent(sourceBoardId)}`, { method: 'DELETE' });
      menu?.remove();

      const favoriteIds = this.favoriteBoardIds();
      favoriteIds.delete(sourceBoardId);
      this.saveFavoriteBoardIds(favoriteIds);

      const sourceStillActive = this.boardLifecycleSourceStillActive(sourceBoardId);
      this.boards = this.boards.filter(board => String(board._id) !== sourceBoardId);

      if (!sourceStillActive) {
        this.renderSidebar?.();
        this.showToast('Tablero archivado');
        return;
      }

      const next = this.visibleBoards()[0]
        || this.boards.find(board => !board.internal && !board.archived)
        || null;

      if (next) {
        await this.selectBoard(next);
      } else {
        this.currentBoard = null;
        this.renderSidebar?.();
        this.renderEmptyState('No quedan tableros activos en este workspace.');
      }

      this.showToast('Tablero archivado');
    } catch (error) {
      this.showToast(error.message, true);
    }
  };
})();
