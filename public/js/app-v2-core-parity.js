(() => {
  const baseEffectiveColumns = app.effectiveColumns.bind(app);

  app.effectiveColumns = function effectiveColumnsWithoutPrimaryNameDuplicate() {
    return baseEffectiveColumns().filter(column => String(column?.type || '').toLowerCase() !== 'name');
  };
})();
