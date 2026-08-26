const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'itemOrdering.js'), 'utf8');

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

console.log('realtime ordering coverage tests passed');
