const assert = require('assert');
const { normalizeColumnValue } = require('../services/mondayNormalizer');

assert.deepStrictEqual(
  normalizeColumnValue({
    type: 'timeline',
    text: '2026-10-26 - 2026-10-30',
    value: JSON.stringify({ from: '2026-10-26', to: '2026-10-30', visualization_type: null })
  }),
  {
    type: 'timeline',
    text: '2026-10-26 - 2026-10-30',
    raw: { from: '2026-10-26', to: '2026-10-30', visualization_type: null },
    from: '2026-10-26',
    to: '2026-10-30',
    milestone: false,
    visualizationType: null,
    changedAt: null
  }
);

const dependency = normalizeColumnValue({
  type: 'dependency',
  text: null,
  value: null,
  linked_items: [{ id: '2941818341', name: 'Picture Lock', board: { id: '5097244458', name: 'GY_POST' } }]
});
assert.deepStrictEqual(dependency.linkedMondayItemIds, ['2941818341']);
assert.strictEqual(dependency.linkedItems[0].mondayBoardId, '5097244458');

const formula = normalizeColumnValue({
  type: 'formula',
  text: '',
  value: null,
  display_value: '10'
});
assert.strictEqual(formula.displayValue, '10');
assert.strictEqual(formula.calculated, false);

console.log('mondayNormalizer tests passed');
