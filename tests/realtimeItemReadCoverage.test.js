const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'items.js'), 'utf8');
const singleItemRoute = source.match(/router\.get\('\/:id'[\s\S]*?\n\}\);/);

assert.ok(singleItemRoute, 'items router must expose a single-item GET endpoint for targeted realtime refreshes');
assert.ok(singleItemRoute[0].includes("const query = { _id: req.params.id };"));
assert.ok(singleItemRoute[0].includes("query.deletedAt = null"));
assert.ok(singleItemRoute[0].includes("query.archived = { $ne: true }"));
assert.ok(singleItemRoute[0].includes('Item.findOne(query)'));
assert.ok(singleItemRoute[0].includes("res.status(404).json({ error: 'Item not found' })"));

console.log('realtime targeted item read coverage tests passed');
