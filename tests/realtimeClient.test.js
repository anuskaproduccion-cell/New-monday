const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app-v2-realtime-parity.js'), 'utf8');
const app = { init() {} };

vm.runInNewContext(source, {
  app,
  window: {},
  document: {},
  navigator: {},
  console,
  setTimeout,
  clearTimeout
});

assert.strictEqual(typeof app.realtimeNeedsFullShellRefresh, 'function');
assert.strictEqual(app.realtimeNeedsFullShellRefresh({ board: 'board-1', item: 'item-1', type: 'column_value_changed' }), false);
assert.strictEqual(app.realtimeNeedsFullShellRefresh({ board: 'board-1', item: 'item-1', type: 'item_updated' }), false);
assert.strictEqual(app.realtimeNeedsFullShellRefresh({ board: 'board-1', type: 'group_items_updated' }), true);
assert.strictEqual(app.realtimeNeedsFullShellRefresh({ board: 'board-1', type: 'visibility_refresh' }), true);

console.log('realtime client refresh policy tests passed');
