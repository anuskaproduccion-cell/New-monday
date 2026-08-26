const assert = require('assert');
const {
  safeFilename,
  safeContentType,
  inlinePreviewAllowed,
  containsFileReference,
  collectFileReferenceIds,
  orphanMetadata,
  MAX_FILE_BYTES,
  MAX_ORPHAN_SCAN_FILES,
  ORPHAN_CLEANUP_CONFIRMATION
} = require('../routes/files');
const { normalizeAttachments } = require('../routes/updates');

assert.strictEqual(safeFilename(encodeURIComponent('Plan de rodaje v3.pdf')), 'Plan de rodaje v3.pdf');
assert.strictEqual(safeFilename('evil%0Aname.txt'), 'evilname.txt');
assert.strictEqual(safeFilename(''), 'archivo');
assert.ok(safeFilename('x'.repeat(400)).length <= 240);

assert.strictEqual(safeContentType('application/pdf'), 'application/pdf');
assert.strictEqual(safeContentType('image/jpeg'), 'image/jpeg');
assert.strictEqual(safeContentType('text/html; charset=utf-8'), 'application/octet-stream');
assert.strictEqual(safeContentType('not a mime'), 'application/octet-stream');
assert.strictEqual(inlinePreviewAllowed('application/pdf', 'doc.pdf'), true);
assert.strictEqual(inlinePreviewAllowed('image/png', 'frame.png'), true);
assert.strictEqual(inlinePreviewAllowed('application/octet-stream', 'frame.webp'), true);
assert.strictEqual(inlinePreviewAllowed('text/html', 'page.html'), false);
assert.strictEqual(inlinePreviewAllowed('application/zip', 'package.zip'), false);
assert.strictEqual(MAX_FILE_BYTES, 25 * 1024 * 1024);
assert.strictEqual(MAX_ORPHAN_SCAN_FILES, 1000);
assert.strictEqual(ORPHAN_CLEANUP_CONFIRMATION, 'DELETE_ORPHAN_FILES');

assert.strictEqual(containsFileReference({ assets: [{ id: 'abc123' }] }, 'abc123'), true);
assert.strictEqual(containsFileReference({ files: [{ url: '/api/files/abc123' }] }, 'abc123'), true);
assert.strictEqual(containsFileReference({ nested: [{ fileId: 'abc123' }] }, 'abc123'), true);
assert.strictEqual(containsFileReference({ assets: [{ id: 'other' }] }, 'abc123'), false);

const validA = '507f1f77bcf86cd799439011';
const validB = '507f191e810c19729de860ea';
const refs = collectFileReferenceIds({
  files: [
    { id: validA, url: `/api/files/${validA}` },
    { downloadUrl: `/api/files/${validB}?preview=1` },
    { id: 'not-object-id' }
  ],
  nested: { fileId: validB }
});
assert.deepStrictEqual([...refs].sort(), [validA, validB].sort());

const meta = orphanMetadata({
  _id: validA,
  filename: 'Frame.png',
  length: 2048,
  contentType: 'image/png',
  uploadDate: new Date('2026-08-26T00:00:00Z'),
  metadata: { source: 'new-monday' }
});
assert.strictEqual(meta.id, validA);
assert.strictEqual(meta.name, 'Frame.png');
assert.strictEqual(meta.size, 2048);
assert.strictEqual(meta.mimetype, 'image/png');
assert.strictEqual(meta.source, 'new-monday');

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
