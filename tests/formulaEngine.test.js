const assert = require('assert');
const {
  workdaysInclusive,
  evaluateFormula
} = require('../services/formulaEngine');

const formula = `MAX(
  ROUNDDOWN(WORKDAYS({timerange_mm3mnqf9#End}, {timerange_mm3mnqf9#Start}) / 5, 0) - {text_mm3mgvjy},
  0
)`;

assert.strictEqual(workdaysInclusive('2026-05-25', '2026-07-31'), 50);
assert.strictEqual(workdaysInclusive('2026-10-26', '2026-10-30'), 5);

assert.deepStrictEqual(
  evaluateFormula(formula, {
    timerange_mm3mnqf9: { type: 'timeline', from: '2026-05-25', to: '2026-07-31' },
    text_mm3mgvjy: { type: 'text', value: '0' }
  }),
  { supported: true, value: 10 }
);

assert.deepStrictEqual(
  evaluateFormula(formula, {
    timerange_mm3mnqf9: { type: 'timeline', from: '2026-10-26', to: '2026-10-30' },
    text_mm3mgvjy: { type: 'text', value: '0' }
  }),
  { supported: true, value: 1 }
);

assert.deepStrictEqual(
  evaluateFormula(formula, {
    timerange_mm3mnqf9: { type: 'timeline', from: '2026-10-26', to: '2026-10-30' },
    text_mm3mgvjy: { type: 'text', value: '2' }
  }),
  { supported: true, value: 0 }
);

console.log('formulaEngine tests passed');
