const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'itemOrdering.js'), 'utf8');
const dndSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app-v2-dnd.js'), 'utf8');
const mutationSource = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'js', 'app-v2-mutation-tracking-parity.js'),
  'utf8'
);

assert.ok(source.includes("const { logActivity } = require('../services/activityLogger');"));
assert.ok(source.includes("type: 'item_ordering_changed'"), 'top-level item reorder must notify other realtime sessions');
assert.ok(source.includes("type: 'subitem_created'"), 'subitem creation through the ordering router must notify other realtime sessions');
assert.ok(source.includes("type: 'subitem_ordering_changed'"), 'subitem reorder must notify other realtime sessions');

const itemReorderBlock = source.match(/router\.post\('\/reorder'[\s\S]*?res\.json\(items\);/);
assert.ok(itemReorderBlock, 'item reorder route must remain detectable');
assert.strictEqual(/\n\s*item:\s/.test(itemReorderBlock[0]), false, 'multi-item reorder should emit a board-scoped realtime event');

const subitemReorderBlock = source.match(/router\.post\('\/:id\/subitems\/reorder'[\s\S]*?res\.json\(subitems\);/);
assert.ok(subitemReorderBlock, 'subitem reorder route must remain detectable');
assert.strictEqual(/\n\s*item:\s/.test(subitemReorderBlock[0]), false, 'subitem reorder should emit a board-scoped realtime event');

const reorderItemClientBlock = dndSource.match(/app\.reorderItemByDrop\s*=\s*async function[\s\S]*?\n\s*app\.moveItemToGroupEnd/);
assert.ok(reorderItemClientBlock, 'drag reorder client flow must remain detectable');
assert.ok(
  reorderItemClientBlock[0].includes("this.api('/api/item-ordering/reorder'"),
  'drag reorder must use the audited top-level ordering endpoint'
);
assert.ok(
  reorderItemClientBlock[0].includes('await this.reloadBoardState()'),
  'drag reorder must reconcile from authoritative board state before its own SSE echo may be suppressed'
);

const moveToGroupClientBlock = dndSource.match(/app\.moveItemToGroupEnd\s*=\s*async function[\s\S]*?\n\s*app\.reorderGroupByDrop/);
assert.ok(moveToGroupClientBlock, 'move-to-group ordering client flow must remain detectable');
assert.ok(
  moveToGroupClientBlock[0].includes("this.api('/api/item-ordering/reorder'"),
  'move-to-group must use the audited top-level ordering endpoint'
);
assert.ok(
  moveToGroupClientBlock[0].includes('await this.reloadBoardState()'),
  'move-to-group must reconcile from authoritative board state before its own SSE echo may be suppressed'
);

assert.ok(
  mutationSource.includes("/^\\/api\\/item-ordering\\/reorder(?:\\?|$)/"),
  'only the exact top-level item ordering endpoint should be classified as own-echo safe'
);
assert.ok(
  !mutationSource.includes('subitems/reorder(?:\\?|$)'),
  'subitem reorder must remain outside the own-echo safe allowlist until its client reconciliation path is proven'
);

console.log('realtime ordering coverage tests passed');
