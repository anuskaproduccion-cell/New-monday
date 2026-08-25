(() => {
  const baseOpenColumnSettingsModal = app.openColumnSettingsModal?.bind(app);
  if (!baseOpenColumnSettingsModal) return;

  app.openColumnSettingsModal = function openColumnSettingsWithPeopleLimit(columnId) {
    const column = (this.currentBoard?.columns || []).find(entry => String(entry.id) === String(columnId));
    if (!column || column.type !== 'people') return baseOpenColumnSettingsModal(columnId);
    const limit = this.peopleLimitForColumn?.(column) ?? Infinity;
    const selected = Number.isFinite(limit) ? String(limit) : 'unlimited';
    this.openModal(`<form id="people-column-settings-form" class="modal-card column-settings-modal people-column-settings-modal">
      <div class="modal-header"><div><h2>Configurar Personas</h2><p>${this.escapeHtml(column.title)}</p></div><button type="button" class="modal-close" data-close-modal>×</button></div>
      <label>Nombre<input name="title" required value="${this.escapeAttr(column.title || '')}"></label>
      <label>Máximo de asignados<select name="maxAssignees"><option value="1" ${selected === '1' ? 'selected' : ''}>1 persona</option><option value="2" ${selected === '2' ? 'selected' : ''}>2 personas</option><option value="3" ${selected === '3' ? 'selected' : ''}>3 personas</option><option value="unlimited" ${selected === 'unlimited' ? 'selected' : ''}>Ilimitado</option></select></label>
      <p class="people-settings-note">El selector solo ofrece personas ya conocidas por New Monday: equipo local o nombres presentes en datos importados.</p>
      <label>Descripción<textarea name="description" rows="2">${this.escapeHtml(column.description || '')}</textarea></label>
      <div class="column-settings-toggles"><label><input type="checkbox" name="pinned" ${column.pinned ? 'checked' : ''}> Fijar columna</label><label><input type="checkbox" name="hidden" ${column.hidden ? 'checked' : ''}> Ocultar columna</label></div>
      <div class="modal-actions"><button type="button" class="button" data-close-modal>Cancelar</button><button class="button primary">Guardar</button></div>
    </form>`);
    document.getElementById('people-column-settings-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const max = String(data.get('maxAssignees') || 'unlimited');
      await this.patchColumn(column.id, {
        title: String(data.get('title') || '').trim(),
        description: String(data.get('description') || '').trim(),
        pinned: data.get('pinned') === 'on',
        hidden: data.get('hidden') === 'on',
        settings: { ...(column.settings || {}), maxAssignees: max === 'unlimited' ? 'unlimited' : Number(max) }
      });
      this.closeModal();
    });
  };
})();
