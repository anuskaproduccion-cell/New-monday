try { require('dotenv').config(); } catch (e) {}
const mongoose = require('mongoose');
const { syncEmergencyBackupToDrive } = require('../services/driveBackup');

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not configured');

  await mongoose.connect(uri);
  try {
    const result = await syncEmergencyBackupToDrive();
    console.log(JSON.stringify({
      ok: true,
      syncedAt: result.syncedAt,
      current: result.current?.file?.name,
      currentAction: result.current?.action,
      snapshot: result.snapshot?.file?.name,
      snapshotAction: result.snapshot?.action,
      manifest: result.manifest,
      mondayWriteOperations: 0
    }));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async error => {
  console.error('Drive backup sync failed:', error.message);
  try { await mongoose.disconnect(); } catch (e) {}
  process.exitCode = 1;
});
