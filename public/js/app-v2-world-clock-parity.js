(() => {
  const baseCellHtml = app.cellHtml.bind(app);
  const baseBindBoardEvents = app.bindBoardEvents.bind(app);
  const baseRefreshWorldClocks = app.refreshWorldClocks.bind(app);
  const baseOpenColumnSettingsModal = app.openColumnSettingsModal?.bind(app);

  const FALLBACK_ZONES = [
    'Atlantic/Canary','Europe/Madrid','Europe/London','Europe/Paris','Europe/Berlin','Europe/Rome',
    'America/New_York','America/Chicago','America/Denver','America/Los_Angeles','America/Mexico_City',
    'America/Bogota','America/Lima','America/Santiago','America/Argentina/Buenos_Aires','America/Sao_Paulo',
    'Asia/Dubai','Asia/Kolkata','Asia/Singapore','Asia/Hong_Kong','Asia/Tokyo','Asia/Seoul',
    'Australia/Sydney','Pacific/Auckland','UTC'
  ];

  app.worldClockZones = function worldClockZones() {
    try {
      const zones = Intl.supportedValuesOf?.('timeZone');
      return Array.isArray(zones) && zones.length ? zones : FALLBACK_ZONES;
    } catch {
      return FALLBACK_ZONES;
    }
  };

  app.worldClockSettings = function worldClockSettings(column) {
    const settings = column?.settings || {};
    return {
      hour12: Boolean(settings.hour12 ?? settings.format12h ?? false),
      showOffset: Boolean(settings.showUtcOffset ?? settings.show_utc_offset ?? false),
      workdayStart: String(settings.workdayStart || settings.workday_start || '09:00'),
      workdayEnd: String(settings.workdayEnd || settings.workday_end || '18:00')
    };
  };

  app.worldClockCityLabel = function worldClockCityLabel(zone) {
    if (!zone) return '';
    if (zone === 'UTC') return 'UTC';
    const parts = String(zone).split('/');
    return (parts[parts.length - 1] || zone).replace(/_/g, ' ');
  };

  app.worldClockParts = function worldClockParts(zone, column) {
    if (!zone) return { time: '—', offset: '', working: null, city: '' };
    const settings = this.worldClockSettings(column);
    try {
      const now = new Date();
      const time = new Intl.DateTimeFormat('es-ES', {
        timeZone: zone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: settings.hour12
      }).format(now);
      let offset = '';
      if (settings.showOffset) {
        const part = new Intl.DateTimeFormat('en', { timeZone: zone, timeZoneName: 'shortOffset' }).formatToParts(now).find(entry => entry.type === 'timeZoneName');
        offset = part?.value || '';
      }
      const localParts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
      const hour = Number(localParts.find(entry => entry.type === 'hour')?.value || 0);
      const minute = Number(localParts.find(entry => entry.type === 'minute')?.value || 0);
      const current = hour * 60 + minute;
      const parse = raw => {
        const [h, m] = String(raw || '').split(':').map(Number);
        return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
      };
      const start = parse(settings.workdayStart);
      const end = parse(settings.workdayEnd);
      const working = start === null || end === null ? null : (start <= end ? current >= start && current < end : current >= start || current < end);
      return { time, offset, working, city: this.worldClockCityLabel(zone) };
    } catch {
      return { time: '—', offset: '', working: null, city: this.worldClockCityLabel(zone) };
    }
  };

  app.cellHtml = function cellHtmlWithWorldClock(item, column, options = {}) {
    if (column?.type !== 'world_clock') return baseCellHtml(item, column, options);
    const value = this.valueFor(item, column) || {};
    const zone = value?.timezone || this.displayValue(value) || '';
    const parts = this.worldClockParts(zone, column);
    return `<button class="world-clock world-clock-parity ${zone ? 'has-zone' : 'is-empty'}" data-action="world-clock-picker" data-item-id="${this.escapeAttr(item._id)}" data-column-id="${this.escapeAttr(column.id)}" data-timezone="${this.escapeAttr(zone)}" type="button" aria-label="Editar ${this.escapeAttr(column.title || 'Reloj mundial')}">
      <span class="clock-working ${parts.working === true ? 'is-working' : parts.working === false ? 'is-off' : ''}" title="${parts.working === true ? 'Dentro del horario laboral' : parts.working === false ? 'Fuera del horario laboral' : ''}"></span>
      <span class="clock-main"><strong class="clock-time">${this.escapeHtml(parts.time)}</strong><small class="clock-zone">${this.escapeHtml(zone ? `${parts.city}${parts.offset ? ` · ${parts.offset}` : ''}` : 'Elegir zona horaria')}</small></span>
    </button>`;
  };

  app.bindBoardEvents = function bindBoardEventsWithWorldClock() {
    baseBindBoardEvents();
    const content = document.getElementById('content');
    content?.querySelectorAll('[data-action="world-clock-picker"]').forEach(button => {
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        this.openWorldClockPicker(button, button.dataset.itemId, button.dataset.columnId);
      });
    });
  };

  app.openWorldClockPicker = function openWorldClockPicker(anchor, itemId, columnId) {
    document.querySelectorAll('.world-clock-picker,.floating-menu,.status-menu').forEach(node => node.remove());
    const item = this.findItem(itemId);
    const column = this.effectiveColumns().find(entry => String(entry.id) === String(columnId));
    if (!item || !column) return;
    const current = this.valueFor(item, column)?.timezone || '';
    const zones = this.worldClockZones();
    const menu = document.createElement('div');
    menu.className = 'floating-menu world-clock-picker';
    menu.innerHTML = `<div class="world-clock-picker-title">${this.escapeHtml(column.title || 'Reloj mundial')}</div><label class="world-clock-search"><span>⌕</span><input type="search" placeholder="Buscar ciudad o zona" autocomplete="off"></label><div class="world-clock-zone-list"></div><button type="button" class="world-clock-clear">Quitar zona horaria</button>`;
    const input = menu.querySelector('input');
    const list = menu.querySelector('.world-clock-zone-list');
    const render = () => {
      const term = String(input.value || '').trim().toLowerCase();
      const matches = zones.filter(zone => {
        if (!term) return true;
        return zone.toLowerCase().includes(term) || this.worldClockCityLabel(zone).toLowerCase().includes(term);
      }).slice(0, 80);
      list.innerHTML = matches.map(zone => {
        const parts = this.worldClockParts(zone, column);
        return `<button type="button" data-zone="${this.escapeAttr(zone)}" class="world-clock-zone-option ${zone === current ? 'is-selected' : ''}"><span><strong>${this.escapeHtml(parts.city)}</strong><small>${this.escapeHtml(zone)}</small></span><span class="zone-preview">${this.escapeHtml(parts.time)}${zone === current ? ' ✓' : ''}</span></button>`;
      }).join('') || '<div class="world-clock-empty">No se encontró esa ciudad o zona.</div>';
      list.querySelectorAll('[data-zone]').forEach(button => button.addEventListener('click', async () => {
        await this.updateColumnValue(itemId, columnId, { type: 'world_clock', timezone: button.dataset.zone, text: button.dataset.zone });
        menu.remove();
        this.renderBoard();
      }));
    };
    input.addEventListener('input', render);
    menu.querySelector('.world-clock-clear')?.addEventListener('click', async () => {
      await this.updateColumnValue(itemId, columnId, { type: 'world_clock', timezone: '', text: '' });
      menu.remove();
      this.renderBoard();
    });
    render();
    this.positionMenu(menu, anchor);
    requestAnimationFrame(() => input.focus());
  };

  app.refreshWorldClocks = function refreshWorldClocksWithSettings() {
    const clocks = document.querySelectorAll('.world-clock-parity');
    if (!clocks.length) return baseRefreshWorldClocks();
    clocks.forEach(cell => {
      const zone = cell.dataset.timezone || '';
      const column = this.effectiveColumns().find(entry => String(entry.id) === String(cell.dataset.columnId));
      const parts = this.worldClockParts(zone, column);
      const time = cell.querySelector('.clock-time');
      const label = cell.querySelector('.clock-zone');
      const indicator = cell.querySelector('.clock-working');
      if (time) time.textContent = parts.time;
      if (label) label.textContent = zone ? `${parts.city}${parts.offset ? ` · ${parts.offset}` : ''}` : 'Elegir zona horaria';
      if (indicator) {
        indicator.classList.toggle('is-working', parts.working === true);
        indicator.classList.toggle('is-off', parts.working === false);
      }
    });
  };

  app.openColumnSettingsModal = function openColumnSettingsWithWorldClock(columnId) {
    const column = (this.currentBoard?.columns || []).find(entry => String(entry.id) === String(columnId));
    if (!column || column.type !== 'world_clock' || !baseOpenColumnSettingsModal) return baseOpenColumnSettingsModal?.(columnId);
    const settings = this.worldClockSettings(column);
    this.openModal(`<form id="world-clock-settings-form" class="modal-card column-settings-modal world-clock-settings-modal">
      <div class="modal-header"><div><h2>Configurar Reloj mundial</h2><p>${this.escapeHtml(column.title)}</p></div><button type="button" class="modal-close" data-close-modal>×</button></div>
      <label>Nombre<input name="title" required value="${this.escapeAttr(column.title)}"></label>
      <label>Formato<select name="format"><option value="24" ${!settings.hour12 ? 'selected' : ''}>24 horas</option><option value="12" ${settings.hour12 ? 'selected' : ''}>12 horas</option></select></label>
      <label class="world-clock-setting-check"><input type="checkbox" name="showOffset" ${settings.showOffset ? 'checked' : ''}> Mostrar UTC offset</label>
      <div class="world-clock-workday"><label>Inicio jornada<input type="time" name="workdayStart" value="${this.escapeAttr(settings.workdayStart)}"></label><label>Fin jornada<input type="time" name="workdayEnd" value="${this.escapeAttr(settings.workdayEnd)}"></label></div>
      <label>Descripción<textarea name="description" rows="2">${this.escapeHtml(column.description || '')}</textarea></label>
      <div class="column-settings-toggles"><label><input type="checkbox" name="pinned" ${column.pinned ? 'checked' : ''}> Fijar columna</label><label><input type="checkbox" name="hidden" ${column.hidden ? 'checked' : ''}> Ocultar columna</label></div>
      <div class="modal-actions"><button type="button" class="button" data-close-modal>Cancelar</button><button class="button primary">Guardar</button></div>
    </form>`);
    document.getElementById('world-clock-settings-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      await this.patchColumn(column.id, {
        title: String(data.get('title') || '').trim(),
        description: String(data.get('description') || '').trim(),
        pinned: data.get('pinned') === 'on',
        hidden: data.get('hidden') === 'on',
        settings: {
          ...(column.settings || {}),
          hour12: data.get('format') === '12',
          showUtcOffset: data.get('showOffset') === 'on',
          workdayStart: String(data.get('workdayStart') || '09:00'),
          workdayEnd: String(data.get('workdayEnd') || '18:00')
        }
      });
      this.closeModal();
    });
  };
})();
