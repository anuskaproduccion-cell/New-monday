const express = require('express');
const mongoose = require('mongoose');
const Item = require('../models/Item');
const ItemUpdate = require('../models/ItemUpdate');

const router = express.Router();
const BUCKET_NAME = 'newMondayFiles';
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_ORPHAN_SCAN_FILES = 1000;
const ORPHAN_CLEANUP_CONFIRMATION = 'DELETE_ORPHAN_FILES';

function databaseReady() {
  return mongoose.connection.readyState === 1 && mongoose.connection.db;
}

function bucket() {
  if (!databaseReady()) throw new Error('MongoDB is not connected');
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: BUCKET_NAME });
}

function objectId(value) {
  if (!mongoose.Types.ObjectId.isValid(value)) return null;
  return new mongoose.Types.ObjectId(value);
}

function safeFilename(value) {
  const decoded = (() => {
    try { return decodeURIComponent(String(value || 'archivo')); } catch { return String(value || 'archivo'); }
  })();
  return decoded.replace(/[\r\n\0]/g, '').trim().slice(0, 240) || 'archivo';
}

function safeContentType(value) {
  const type = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(type)) return 'application/octet-stream';
  return type;
}

function inlinePreviewAllowed(contentType, filename = '') {
  const type = safeContentType(contentType);
  if (type === 'application/pdf' || type.startsWith('image/')) return true;
  const name = String(filename || '').toLowerCase();
  return /\.(pdf|png|jpe?g|gif|webp)$/.test(name);
}

function containsFileReference(value, fileId) {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.some(entry => containsFileReference(entry, fileId));
  if (typeof value === 'object') return Object.entries(value).some(([key, entry]) => {
    if ((key === 'id' || key === '_id' || key === 'fileId') && String(entry || '') === String(fileId)) return true;
    if ((key === 'url' || key === 'downloadUrl') && String(entry || '').includes(`/api/files/${fileId}`)) return true;
    return containsFileReference(entry, fileId);
  });
  return false;
}

function collectFileReferenceIds(value, out = new Set()) {
  if (value === null || value === undefined) return out;
  if (Array.isArray(value)) {
    value.forEach(entry => collectFileReferenceIds(entry, out));
    return out;
  }
  if (typeof value !== 'object') return out;
  Object.entries(value).forEach(([key, entry]) => {
    if ((key === 'id' || key === '_id' || key === 'fileId') && mongoose.Types.ObjectId.isValid(String(entry || ''))) {
      out.add(String(entry));
    }
    if (key === 'url' || key === 'downloadUrl') {
      const match = String(entry || '').match(/\/api\/files\/([a-f0-9]{24})(?:\b|[/?#])/i) || String(entry || '').match(/\/api\/files\/([a-f0-9]{24})$/i);
      if (match) out.add(match[1]);
    }
    collectFileReferenceIds(entry, out);
  });
  return out;
}

async function referencedFileIds() {
  const [items, updates] = await Promise.all([
    Item.find({ deletedAt: null }).select('columnValues').lean(),
    ItemUpdate.find({ archived: { $ne: true } }).select('attachments replies.attachments').lean()
  ]);
  const ids = new Set();
  items.forEach(item => collectFileReferenceIds(item.columnValues, ids));
  updates.forEach(update => collectFileReferenceIds(update, ids));
  return ids;
}

async function fileReferenceCount(fileId) {
  const ids = await referencedFileIds();
  if (!ids.has(String(fileId))) return 0;
  const [items, updates] = await Promise.all([
    Item.find({ deletedAt: null }).select('columnValues').lean(),
    ItemUpdate.find({ archived: { $ne: true } }).select('attachments replies.attachments').lean()
  ]);
  let count = 0;
  items.forEach(item => { if (containsFileReference(item.columnValues, fileId)) count += 1; });
  updates.forEach(update => { if (containsFileReference(update, fileId)) count += 1; });
  return count;
}

function orphanMetadata(file) {
  return {
    id: String(file._id),
    name: safeFilename(file.filename),
    size: Number(file.length || 0),
    mimetype: safeContentType(file.contentType || file.metadata?.originalType),
    uploadedAt: file.uploadDate || null,
    source: file.metadata?.source || 'new-monday'
  };
}

async function scanOrphanFiles({ limit = MAX_ORPHAN_SCAN_FILES } = {}) {
  if (!databaseReady()) throw new Error('MongoDB is not connected');
  const safeLimit = Math.max(1, Math.min(MAX_ORPHAN_SCAN_FILES, Number(limit) || MAX_ORPHAN_SCAN_FILES));
  const [files, referenced] = await Promise.all([
    bucket().find({}).sort({ uploadDate: 1 }).limit(safeLimit).toArray(),
    referencedFileIds()
  ]);
  const orphans = files.filter(file => !referenced.has(String(file._id))).map(orphanMetadata);
  return {
    scanned: files.length,
    limited: files.length >= safeLimit,
    referenced: files.length - orphans.length,
    orphanCount: orphans.length,
    orphanBytes: orphans.reduce((sum, file) => sum + Number(file.size || 0), 0),
    orphans
  };
}

router.post('/', express.raw({ type: 'application/octet-stream', limit: MAX_FILE_BYTES }), async (req, res) => {
  try {
    if (!databaseReady()) return res.status(503).json({ error: 'MongoDB is not connected' });
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ error: 'File body is required' });
    if (req.body.length > MAX_FILE_BYTES) return res.status(413).json({ error: 'File exceeds 25 MB limit' });

    const filename = safeFilename(req.get('x-file-name'));
    const contentType = safeContentType(req.get('x-file-type'));
    const upload = bucket().openUploadStream(filename, {
      contentType,
      metadata: {
        source: 'new-monday',
        uploadedAt: new Date(),
        originalType: contentType
      }
    });

    upload.on('error', error => {
      if (!res.headersSent) res.status(500).json({ error: error.message });
    });
    upload.on('finish', file => {
      res.status(201).json({
        id: String(file._id),
        name: file.filename,
        size: file.length,
        mimetype: file.contentType || contentType,
        source: 'new-monday',
        url: `/api/files/${file._id}`
      });
    });
    upload.end(req.body);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Storage administration is explicit and safe by default. GET is a read-only
// dry run. Cleanup requires the exact confirmation token and rechecks every
// candidate immediately before deletion so referenced files cannot be removed.
router.get('/orphans', async (req, res) => {
  try {
    const report = await scanOrphanFiles({ limit: req.query.limit });
    return res.json({ ...report, dryRun: true, confirmationRequired: ORPHAN_CLEANUP_CONFIRMATION });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/orphans/cleanup', async (req, res) => {
  try {
    if (String(req.body?.confirm || '') !== ORPHAN_CLEANUP_CONFIRMATION) {
      return res.status(400).json({ error: 'Explicit orphan cleanup confirmation is required' });
    }
    const report = await scanOrphanFiles({ limit: req.body?.limit });
    const requestedIds = Array.isArray(req.body?.fileIds) ? new Set(req.body.fileIds.map(String)) : null;
    const candidates = report.orphans.filter(file => !requestedIds || requestedIds.has(String(file.id)));
    const deleted = [];
    const retained = [];

    for (const file of candidates) {
      const references = await fileReferenceCount(file.id);
      if (references > 0) {
        retained.push({ ...file, references });
        continue;
      }
      const id = objectId(file.id);
      if (!id) continue;
      await bucket().delete(id);
      deleted.push(file);
    }

    return res.json({
      ok: true,
      scanned: report.scanned,
      requested: candidates.length,
      deletedCount: deleted.length,
      deletedBytes: deleted.reduce((sum, file) => sum + Number(file.size || 0), 0),
      retainedCount: retained.length,
      deleted,
      retained
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/:id/metadata', async (req, res) => {
  try {
    const id = objectId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid file id' });
    const file = await bucket().find({ _id: id }).next();
    if (!file) return res.status(404).json({ error: 'File not found' });
    const mimetype = file.contentType || file.metadata?.originalType || 'application/octet-stream';
    res.json({
      id: String(file._id),
      name: file.filename,
      size: file.length,
      mimetype,
      previewable: inlinePreviewAllowed(mimetype, file.filename),
      source: file.metadata?.source || 'new-monday',
      uploadedAt: file.uploadDate,
      url: `/api/files/${file._id}`,
      previewUrl: inlinePreviewAllowed(mimetype, file.filename) ? `/api/files/${file._id}?preview=1` : null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = objectId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid file id' });
    const storage = bucket();
    const file = await storage.find({ _id: id }).next();
    if (!file) return res.status(404).json({ error: 'File not found' });

    const filename = safeFilename(file.filename).replace(/"/g, '_');
    const contentType = safeContentType(file.contentType || file.metadata?.originalType);
    const preview = String(req.query.preview || '') === '1' && inlinePreviewAllowed(contentType, filename);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', String(file.length));
    res.setHeader('Content-Disposition', `${preview ? 'inline' : 'attachment'}; filename="${filename}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=300');
    if (preview) {
      // Narrow exception: allow this authenticated, same-origin file response to
      // render inside New Monday. The application pages themselves remain DENY.
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    }

    const stream = storage.openDownloadStream(id);
    stream.on('error', error => {
      if (!res.headersSent) res.status(500).json({ error: error.message });
      else res.destroy(error);
    });
    stream.pipe(res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = objectId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid file id' });
    const storage = bucket();
    const file = await storage.find({ _id: id }).next();
    if (!file) return res.status(404).json({ error: 'File not found' });

    const references = await fileReferenceCount(String(id));
    if (references > 0) {
      return res.json({ ok: true, id: String(id), retained: true, references });
    }

    await storage.delete(id);
    res.json({ ok: true, id: String(id), retained: false, references: 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
module.exports.safeFilename = safeFilename;
module.exports.safeContentType = safeContentType;
module.exports.inlinePreviewAllowed = inlinePreviewAllowed;
module.exports.containsFileReference = containsFileReference;
module.exports.collectFileReferenceIds = collectFileReferenceIds;
module.exports.referencedFileIds = referencedFileIds;
module.exports.fileReferenceCount = fileReferenceCount;
module.exports.orphanMetadata = orphanMetadata;
module.exports.scanOrphanFiles = scanOrphanFiles;
module.exports.MAX_FILE_BYTES = MAX_FILE_BYTES;
module.exports.MAX_ORPHAN_SCAN_FILES = MAX_ORPHAN_SCAN_FILES;
module.exports.ORPHAN_CLEANUP_CONFIRMATION = ORPHAN_CLEANUP_CONFIRMATION;
