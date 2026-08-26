const assert = require('assert');
const { safeFilename, safeContentType, containsFileReference, MAX_FILE_BYTES } = require('../routes/files');
const { normalizeAttachments } = require('../routes/updates');

assert.strictEqual(safeFilename(encodeURIComponent('Plan de rodaje v3.pdf')), 'Plan de rodaje v3.pdf');
assert.strictEqual(safeFilename('evil%0Aname.txt'), 'evilname.txt');
assert.strictEqual(safeFilename(''), 'archivo');
assert.ok(safeFilename('x'.repeat(400)).length <= 240);

assert.strictEqual(safeContentType('application/pdf'), 'application/pdf');
assert.strictEqual(safeContentType('image/jpeg'), 'image/jpeg');
assert.strictEqual(safeContentType('text/html; charset=utf-8'), 'application/octet-stream');
assert.strictEqual(safeContentType('not a mime'), 'application/octet-stream');
assert.strictEqual(MAX_FILE_BYTES, 25 * 1024 * 1024);

assert.strictEqual(containsFileReference({ assets: [{ id: 'abc123' }] }, 'abc123'), true);
assert.strictEqual(containsFileReference({ files: [{ url: '/api/files/abc123' }] }, 'abc123'), true);
assert.strictEqual(containsFileReference({ nested: [{ fileId: 'abc123' }] }, 'abc123'), true);
assert.strictEqual(containsFileReference({ assets: [{ id: 'other' }] }, 'abc123'), false);

const attachments = normalizeAttachments([
  { id: 'abc123', name: 'Guion.pdf', size: 2048, mimetype: 'application/pdf', url: '/api/files/abc123', source: 'new-monday' },
  { name: 'Referencia', url: 'https://example.com/reference', source: 'link' }
]);
assert.strictEqual(attachments.length, 2);
assert.deepStrictEqual(attachments[0], {
  id: 'abc123',
  name: 'Guion.pdf',
  url: '/api/files/abc123',
  source: 'new-monday',
  mimetype: 'application/pdf',
  size: 2048
});
assert.strictEqual(attachments[1].source, 'link');
assert.strictEqual(attachments[1].size, null);
assert.strictEqual(normalizeAttachments('not-an-array').length, 0);
assert.strictEqual(normalizeAttachments(Array.from({ length: 30 }, (_, index) => ({ name: `f${index}` }))).length, 20);

console.log('files.test.js passed');
