const { Readable } = require('stream');
const { google } = require('googleapis');
const { buildEmergencyWorkbookBuffer } = require('./excelBackup');

const BACKUP_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const CURRENT_BACKUP_NAME = 'NEW_MONDAY_BACKUP.xlsx';

function snapshotName(date = new Date()) {
  const stamp = new Date(date).toISOString().slice(0, 10);
  return `NEW_MONDAY_BACKUP_${stamp}.xlsx`;
}

function parseServiceAccountCredentials(raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
  if (!raw) return null;
  const value = String(raw).trim();
  if (!value) return null;

  const candidates = [value];
  try { candidates.push(Buffer.from(value, 'base64').toString('utf8')); } catch (e) {}

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && parsed.client_email && parsed.private_key) return parsed;
    } catch (e) {}
  }

  throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON no contiene credenciales JSON válidas de una cuenta de servicio.');
}

function driveBackupConfig(env = process.env) {
  return {
    folderId: env.GOOGLE_DRIVE_FOLDER_ID || '',
    credentials: parseServiceAccountCredentials(env.GOOGLE_SERVICE_ACCOUNT_JSON),
    configured: Boolean(env.GOOGLE_DRIVE_FOLDER_ID && env.GOOGLE_SERVICE_ACCOUNT_JSON)
  };
}

function escapeDriveQuery(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function createDriveClient(credentials) {
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive']
  });
  return google.drive({ version: 'v3', auth });
}

async function findFileByName(drive, folderId, name) {
  const response = await drive.files.list({
    q: `'${escapeDriveQuery(folderId)}' in parents and name='${escapeDriveQuery(name)}' and trashed=false`,
    fields: 'files(id,name,webViewLink,modifiedTime,size)',
    pageSize: 10,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  });
  return response.data.files?.[0] || null;
}

async function uploadNewFile(drive, folderId, name, buffer) {
  const response = await drive.files.create({
    requestBody: { name, parents: [folderId] },
    media: { mimeType: BACKUP_MIME, body: Readable.from(buffer) },
    fields: 'id,name,webViewLink,modifiedTime,size',
    supportsAllDrives: true
  });
  return response.data;
}

async function replaceFile(drive, fileId, name, buffer) {
  const response = await drive.files.update({
    fileId,
    requestBody: { name },
    media: { mimeType: BACKUP_MIME, body: Readable.from(buffer) },
    fields: 'id,name,webViewLink,modifiedTime,size',
    supportsAllDrives: true
  });
  return response.data;
}

async function upsertCurrentBackup(drive, folderId, buffer) {
  const existing = await findFileByName(drive, folderId, CURRENT_BACKUP_NAME);
  if (existing) {
    return { action: 'updated', file: await replaceFile(drive, existing.id, CURRENT_BACKUP_NAME, buffer) };
  }
  return { action: 'created', file: await uploadNewFile(drive, folderId, CURRENT_BACKUP_NAME, buffer) };
}

async function ensureDailySnapshot(drive, folderId, buffer, date = new Date()) {
  const name = snapshotName(date);
  const existing = await findFileByName(drive, folderId, name);
  if (existing) return { action: 'kept', file: existing };
  return { action: 'created', file: await uploadNewFile(drive, folderId, name, buffer) };
}

async function syncEmergencyBackupToDrive({ date = new Date(), driveClient = null, env = process.env } = {}) {
  const config = driveBackupConfig(env);
  if (!config.configured || !config.credentials) {
    throw new Error('Google Drive backup no está configurado. Faltan GOOGLE_DRIVE_FOLDER_ID y/o GOOGLE_SERVICE_ACCOUNT_JSON.');
  }

  const drive = driveClient || await createDriveClient(config.credentials);
  const { buffer, manifest } = await buildEmergencyWorkbookBuffer();
  const current = await upsertCurrentBackup(drive, config.folderId, buffer);
  const snapshot = await ensureDailySnapshot(drive, config.folderId, buffer, date);

  return {
    syncedAt: new Date().toISOString(),
    folderId: config.folderId,
    current,
    snapshot,
    manifest,
    mondayWriteOperations: 0,
    policy: 'Backup reads New Monday only and never writes to Monday.'
  };
}

module.exports = {
  BACKUP_MIME,
  CURRENT_BACKUP_NAME,
  snapshotName,
  parseServiceAccountCredentials,
  driveBackupConfig,
  escapeDriveQuery,
  findFileByName,
  upsertCurrentBackup,
  ensureDailySnapshot,
  syncEmergencyBackupToDrive
};
