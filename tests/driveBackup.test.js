const assert = require('assert');
const {
  CURRENT_BACKUP_NAME,
  snapshotName,
  parseServiceAccountCredentials,
  driveBackupConfig,
  escapeDriveQuery
} = require('../services/driveBackup');

assert.strictEqual(CURRENT_BACKUP_NAME, 'NEW_MONDAY_BACKUP.xlsx');
assert.strictEqual(snapshotName('2026-08-24T12:00:00Z'), 'NEW_MONDAY_BACKUP_2026-08-24.xlsx');

const credentials = {
  type: 'service_account',
  client_email: 'backup@example.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----\n'
};

assert.deepStrictEqual(parseServiceAccountCredentials(JSON.stringify(credentials)), credentials);
assert.deepStrictEqual(
  parseServiceAccountCredentials(Buffer.from(JSON.stringify(credentials)).toString('base64')),
  credentials
);
assert.strictEqual(parseServiceAccountCredentials(''), null);
assert.throws(() => parseServiceAccountCredentials('not-json'), /credenciales JSON válidas/);

const configured = driveBackupConfig({
  GOOGLE_DRIVE_FOLDER_ID: 'folder123',
  GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify(credentials)
});
assert.strictEqual(configured.configured, true);
assert.strictEqual(configured.folderId, 'folder123');
assert.strictEqual(configured.credentials.client_email, credentials.client_email);

assert.strictEqual(escapeDriveQuery("a'b\\c"), "a\\'b\\\\c");

console.log('driveBackup tests passed');
