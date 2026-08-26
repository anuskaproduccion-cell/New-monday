(() => {
  app.boardLifecycleSourceStillActive = function boardLifecycleSourceStillActive(sourceBoardId) {
    return Boolean(sourceBoardId) && String(this.currentBoardId?.() || '') === String(sourceBoardId);
  };

  app.boardLifecycleNavigationMatches = function boardLifecycleNavigationMatches(startBoardId) {
    return String(this.currentBoardId?.() || '') === String(startBoardId || '');
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

  app.finishArchivedBoardRestore = async function finishArchivedBoardRestore(startBoardId, restored, boards) {
    if (Array.isArray(boards)) this.boards = boards;
    this.renderSidebar?.();

    const local = this.boards.find(board => String(board._id) === String(restored?._id)) || restored || null;
    if (local && this.boardLifecycleNavigationMatches(startBoardId)) {
      await this.selectBoard(local);
      return true;
    }
    return false;
  };

  app.openArchivedBoardsPanel = async function openArchivedBoardsPanelNavigationSafe() {
    this.openModal(`<div class="modal-card archived-boards-modal">
      <div class="modal-header"><div><h2>Tableros archivados</h2><p>Los tableros archivados conservan sus elementos y pueden restaurarse.</p></div><button type="button" class="modal-close" data-close-modal>×</button></div>
      <div class="archived-boards-body"><div class="loading">Cargando…</div></div>
    </div>`);
    const host = document.querySelector('.archived-boards-body');
    if (!host) return;

    try {
      const all = await this.api('/api/boards?includeArchived=true');
      const archived = all
        .filter(board => board.archived && !board.internal)
        .sort((a, b) => String(this.workspaceName(a)).localeCompare(String(this.workspaceName(b)), 'es', { sensitivity: 'base' }) || String(a.name).localeCompare(String(b.name), 'es', { sensitivity: 'base' }));

      host.innerHTML = archived.length ? `<div class="archived-boards-list">${archived.map(board => `
        <article class="archived-board-row">
          <span class="archived-board-icon">${this.escapeHtml(board.icon || '📋')}</span>
          <div><strong>${this.escapeHtml(board.name)}</strong><small>${this.escapeHtml(this.workspaceName(board))}</small></div>
          <button type="button" class="button" data-restore-board="${this.escapeAttr(board._id)}">Restaurar</button>
        </article>`).join('')}</div>` : '<div class="archived-boards-empty">No hay tableros archivados.</div>';

      host.querySelectorAll('[data-restore-board]').forEach(button => button.addEventListener('click', async () => {
        const board = archived.find(entry => String(entry._id) === String(button.dataset.restoreBoard));
        if (!board) return;

        const navigationBoardIdAtStart = String(this.currentBoardId?.() || '');
        button.disabled = true;

        let restored;
        try {
          restored = await this.api(`/api/boards/${encodeURIComponent(board._id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ archived: false })
          });
        } catch (error) {
          button.disabled = false;
          this.showToast(error.message, true);
          return;
        }

        let boards;
        try {
          boards = await this.api('/api/boards');
        } catch (syncError) {
          const index = this.boards.findIndex(entry => String(entry._id) === String(restored?._id));
          if (restored?._id) {
            if (index >= 0) this.boards[index] = restored;
            else this.boards.push(restored);
          }
          this.renderSidebar?.();
          this.closeModal();
          this.showToast(`Tablero restaurado, pero falta resincronizar la lista · ${syncError.message}`, true);
          return;
        }

        this.closeModal();
        await this.finishArchivedBoardRestore(navigationBoardIdAtStart, restored, boards);
        this.showToast('Tablero restaurado');
      }));
    } catch (error) {
      host.innerHTML = `<div class="archived-boards-empty error">${this.escapeHtml(error.message)}</div>`;
    }
  };
})();
