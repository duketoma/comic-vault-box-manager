import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config({ path: ['.env.local', '.env'] });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is not configured. Set it in .env.local.');

const pool = new Pool({ connectionString: databaseUrl });

async function cleanup() {
  try {
    // 1. Check for test comics
    const checkRes = await pool.query("SELECT id, title, issue_number FROM comic_books WHERE id LIKE 'test-%' OR id = 'test-avengers-400'");
    console.log(`Found ${checkRes.rows.length} test comic(s):`);
    for (const row of checkRes.rows) {
      console.log(` - ID: "${row.id}", Title: "${row.title}", Issue: #${row.issue_number}`);
    }

    if (checkRes.rows.length > 0) {
      const deleteRes = await pool.query("DELETE FROM comic_books WHERE id LIKE 'test-%' OR id = 'test-avengers-400' RETURNING id");
      console.log(`Successfully deleted ${deleteRes.rows.length} test comic row(s):`, deleteRes.rows.map(r => r.id));
    } else {
      console.log('No test comics found matching pattern "test-%".');
    }
  } catch (err) {
    console.error('Error during cleanup:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

cleanup();
