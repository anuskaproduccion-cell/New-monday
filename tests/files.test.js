const assert = require('assert');
const { safeFilename, safeContentType, MAX_FILE_BYTES } = require('../routes/files');

assert.strictEqual(safeFilename(encodeURIComponent('Plan de rodaje v3.pdf')), 'Plan de rodaje v3.pdf');
assert.strictEqual(safeFilename('evil%0Aname.txt'), 'evilname.txt');
assert.strictEqual(safeFilename(''), 'archivo');
assert.ok(safeFilename('x'.repeat(400)).length <= 240);

assert.strictEqual(safeContentType('application/pdf'), 'application/pdf');
assert.strictEqual(safeContentType('image/jpeg'), 'image/jpeg');
assert.strictEqual(safeContentType('text/html; charset=utf-8'), 'application/octet-stream');
assert.strictEqual(safeContentType('not a mime'), 'application/octet-stream');
assert.strictEqual(MAX_FILE_BYTES, 25 * 1024 * 1024);

console.log('files.test.js passed');
