import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config({ path: ['.env.local', '.env'] });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.log('No DATABASE_URL configured. Skipping migrations.');
  process.exit(0);
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

try {
  const migrationsDir = path.resolve('db/migrations');
  const allFiles = await readdir(migrationsDir);
  const sqlFiles = allFiles.filter((f) => f.endsWith('.sql')).sort();

  console.log(`Found ${sqlFiles.length} migration file(s) in ${migrationsDir}.`);

  for (const file of sqlFiles) {
    const filePath = path.join(migrationsDir, file);
    console.log(`Applying migration: ${file}...`);
    const sql = await readFile(filePath, 'utf8');
    await pool.query(sql);
    console.log(`✓ Migration ${file} applied successfully.`);
  }

  console.log('All migrations applied successfully.');
} catch (error) {
  console.error('Migration failed:', error);
  process.exit(1);
} finally {
  await pool.end();
}
