const assert = require('assert');
const {
  timelineDeltaDays,
  shiftDate,
  shiftTimeValue
} = require('../services/dependencyEngine');

assert.strictEqual(
  timelineDeltaDays(
    { type: 'timeline', from: '2026-08-17', to: '2026-10-09' },
    { type: 'timeline', from: '2026-08-31', to: '2026-10-23' }
  ),
  14
);

assert.strictEqual(shiftDate('2026-10-23', 3), '2026-10-26');

assert.deepStrictEqual(
  shiftTimeValue({ type: 'timeline', from: '2026-10-26', to: '2026-10-30' }, 14),
  { type: 'timeline', from: '2026-11-09', to: '2026-11-13' }
);

assert.deepStrictEqual(
  shiftTimeValue({ type: 'date', date: '2026-10-23' }, 3),
  { type: 'date', date: '2026-10-26' }
);

console.log('dependencyEngine tests passed');
