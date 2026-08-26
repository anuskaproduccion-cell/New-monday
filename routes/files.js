const express = require('express');
const mongoose = require('mongoose');
const Item = require('../models/Item');
const ItemUpdate = require('../models/ItemUpdate');

const router = express.Router();
const BUCKET_NAME = 'newMondayFiles';
const MAX_FILE_BYTES = 25 * 1024 * 1024;

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

async function fileReferenceCount(fileId) {
  const [items, updates] = await Promise.all([
    Item.find({ deletedAt: null }).select('columnValues').lean(),
    ItemUpdate.find({ archived: { $ne: true } }).select('attachments replies.attachments').lean()
  ]);
  let count = 0;
  items.forEach(item => { if (containsFileReference(item.columnValues, fileId)) count += 1; });
  updates.forEach(update => { if (containsFileReference(update, fileId)) count += 1; });
  return count;
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

router.get('/:id/metadata', async (req, res) => {
  try {
    const id = objectId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid file id' });
    const file = await bucket().find({ _id: id }).next();
    if (!file) return res.status(404).json({ error: 'File not found' });
    res.json({
      id: String(file._id),
      name: file.filename,
      size: file.length,
      mimetype: file.contentType || file.metadata?.originalType || 'application/octet-stream',
      source: file.metadata?.source || 'new-monday',
      uploadedAt: file.uploadDate,
      url: `/api/files/${file._id}`
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
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', String(file.length));
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=300');

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
module.exports.containsFileReference = containsFileReference;
module.exports.fileReferenceCount = fileReferenceCount;
module.exports.MAX_FILE_BYTES = MAX_FILE_BYTES;
