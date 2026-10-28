import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const backupDir = path.resolve(__dirname, '../backups/pre_upgrade_backup');

async function runBackup() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/taskmanager';
  console.log(`[Backup] Connecting to MongoDB: ${uri}`);
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const collections = await db.listCollections().toArray();
  console.log(`[Backup] Found ${collections.length} collections:`, collections.map(c => c.name));

  const metadata = {
    timestamp: new Date().toISOString(),
    collections: {}
  };

  for (const col of collections) {
    const docs = await db.collection(col.name).find({}).toArray();
    const filePath = path.join(backupDir, `${col.name}.json`);
    fs.writeFileSync(filePath, JSON.stringify(docs, null, 2), 'utf-8');
    metadata.collections[col.name] = docs.length;
    console.log(`[Backup] Backed up ${docs.length} documents from '${col.name}' to ${filePath}`);
  }

  fs.writeFileSync(path.join(backupDir, 'backup_metadata.json'), JSON.stringify(metadata, null, 2), 'utf-8');
  console.log('[Backup] Completed successfully!');
  await mongoose.disconnect();
}

runBackup().catch((err) => {
  console.error('[Backup Error]', err);
  process.exit(1);
});
