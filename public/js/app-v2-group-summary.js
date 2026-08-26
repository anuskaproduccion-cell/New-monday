(() => {
  const originalGroupHtml = app.groupHtml.bind(app);

  app.groupSummaryCellHtml = function groupSummaryCellHtml(items, column) {
    if (!column?.settings?.showSummary) return '<span class="group-summary-empty"></span>';
    const values = items.map(item => this.valueFor(item, column));

    if (column.type === 'status') {
      const labels = this.statusLabels(column);
      const counts = new Map(labels.map(label => [label.label, 0]));
      let empty = 0;
      values.forEach(value => {
        const label = this.displayValue(value);
        if (!label) empty += 1;
        else counts.set(label, (counts.get(label) || 0) + 1);
      });
      const total = Math.max(1, values.length);
      const segments = [
        ...labels.map(label => ({ label: label.label, color: label.color || '#c4c4c4', count: counts.get(label.label) || 0 })),
        { label: 'Sin estado', color: '#c4c4c4', count: empty }
      ].filter(segment => segment.count > 0);
      return `<div class="status-summary" title="${this.escapeAttr(segments.map(segment => `${segment.label}: ${segment.count}`).join(' · '))}">${segments.map(segment => `<span style="--summary-color:${this.escapeAttr(segment.color)};flex:${Math.max(1, segment.count / total * 100)}"></span>`).join('')}</div>`;
    }

    if (column.type === 'numbers' || column.type === 'formula') {
      const numbers = values.map(value => Number(value?.value ?? value?.displayValue ?? value?.text ?? value)).filter(Number.isFinite);
      const sum = numbers.reduce((total, value) => total + value, 0);
      return `<span class="group-summary-number" title="Suma">${numbers.length ? this.escapeHtml(new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(sum)) : '—'}</span>`;
    }

    if (column.type === 'date') {
      const dates = values.map(value => value?.date || this.displayValue(value)).filter(Boolean).sort();
      if (!dates.length) return '—';
      return `<span class="group-summary-range">${this.escapeHtml(this.toDisplayDate?.(dates[0]) || dates[0])}${dates.length > 1 ? ` → ${this.escapeHtml(this.toDisplayDate?.(dates[dates.length - 1]) || dates[dates.length - 1])}` : ''}</span>`;
    }

    if (column.type === 'timeline') {
      const starts = values.map(value => value?.from).filter(Boolean).sort();
      const ends = values.map(value => value?.to).filter(Boolean).sort();
      if (!starts.length && !ends.length) return '—';
      const from = starts[0] || ends[0];
      const to = ends[ends.length - 1] || starts[starts.length - 1];
      return `<span class="group-summary-range">${this.escapeHtml(from)}${to && to !== from ? ` → ${this.escapeHtml(to)}` : ''}</span>`;
    }

    if (column.type === 'people') {
      const people = new Set();
      values.forEach(value => {
        const names = value?.names || [];
        if (Array.isArray(names)) names.forEach(name => name && people.add(String(name)));
        const text = this.displayValue(value);
        if (text) String(text).split(',').map(name => name.trim()).filter(Boolean).forEach(name => people.add(name));
      });
      return `<span class="group-summary-count">${people.size ? `${people.size} persona${people.size === 1 ? '' : 's'}` : '—'}</span>`;
    }

    if (column.type === 'dropdown') {
      const labels = new Set();
      values.forEach(value => (value?.labels || []).forEach(label => labels.add(String(label))));
      return `<span class="group-summary-count">${labels.size ? `${labels.size} opción${labels.size === 1 ? '' : 'es'}` : '—'}</span>`;
    }

    const filled = values.map(value => this.displayValue(value)).filter(value => String(value || '').trim() !== '').length;
    return `<span class="group-summary-count">${filled ? `${filled} con valor` : '—'}</span>`;
  };

  app.groupHtml = function groupHtmlWithSummaries(group, items) {
    const html = originalGroupHtml(group, items);
    const columns = this.effectiveColumns();
    if (!columns.some(column => column.settings?.showSummary)) return html;
    const summary = `<tfoot><tr class="group-summary-row"><td class="select-col"></td><td class="pinned-col group-summary-label">Resumen</td>${columns.map(column => `<td class="dynamic-cell type-${this.escapeAttr(column.type)}">${this.groupSummaryCellHtml(items, column)}</td>`).join('')}<td></td></tr></tfoot>`;
    return html.replace('</tbody></table>', `</tbody>${summary}</table>`);
  };
})();
