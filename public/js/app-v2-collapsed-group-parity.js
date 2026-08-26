(() => {
  const baseGroupHtml = app.groupHtml.bind(app);

  app.collapsedGroupSummaryHtml = function collapsedGroupSummaryHtml(group, items) {
    const columns = this.effectiveColumns().filter(column => column.settings?.showSummary);
    if (!columns.length) {
      return `<div class="collapsed-group-summary"><span class="collapsed-group-count">${items.length} elemento${items.length === 1 ? '' : 's'}</span></div>`;
    }
    return `<div class="collapsed-group-summary">
      <span class="collapsed-group-count">${items.length} elemento${items.length === 1 ? '' : 's'}</span>
      <div class="collapsed-group-summary-cells">${columns.map(column => `
        <div class="collapsed-summary-cell type-${this.escapeAttr(column.type)}" title="${this.escapeAttr(column.title)}">
          <span class="collapsed-summary-label">${this.escapeHtml(column.title)}</span>
          <span class="collapsed-summary-value">${this.groupSummaryCellHtml(items, column)}</span>
        </div>`).join('')}</div>
    </div>`;
  };

  app.groupHtml = function groupHtmlWithCollapsedSummary(group, items) {
    const html = baseGroupHtml(group, items);
    if (!this.collapsedGroups.has(group.id)) return html;
    const summary = this.collapsedGroupSummaryHtml(group, items);
    return html.replace('<div class="group-body is-collapsed">', `${summary}<div class="group-body is-collapsed">`);
  };
})();
