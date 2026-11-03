import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config({ path: ['.env.local', '.env'] });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not configured.');
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch all owned comics (exclude Wishlist)
    const res = await client.query(`
      SELECT id, title, issue_number, condition, estimated_value, previous_estimated_value,
             lock_estimated_value, tags, notes
      FROM comic_books
      WHERE reading_status != 'Wishlist'
    `);

    const ownedComics = res.rows;
    console.log(`Found ${ownedComics.length} owned comics in collection.`);

    let rescaledCount = 0;
    let conditionUpdatedCount = 0;
    const samples = [];

    for (const comic of ownedComics) {
      const prevCondition = comic.condition || 'Near Mint';
      const isLocked = Boolean(comic.lock_estimated_value);
      const combinedText = [...(comic.tags || []), comic.notes || ''].join(' ');
      const isGraded = /\b(cgc|cbcs|pgx|slab|slabbed|graded)\b/i.test(combinedText);

      let newEstValue = comic.estimated_value ? Number(comic.estimated_value) : null;
      let newPrevValue = comic.previous_estimated_value ? Number(comic.previous_estimated_value) : null;

      // Rescale valuation if not locked, not graded, and currently has a value
      if (!isLocked && !isGraded && newEstValue !== null && newEstValue > 0) {
        if (prevCondition === 'Near Mint') {
          const oldVal = newEstValue;
          // Scale from Near Mint (1.0) to Good (0.18)
          newEstValue = Math.max(0.5, Number((oldVal * 0.18).toFixed(2)));
          newPrevValue = oldVal;
          rescaledCount++;

          if (samples.length < 5) {
            samples.push({
              title: `${comic.title} #${comic.issue_number}`,
              oldValue: oldVal,
              newValue: newEstValue,
            });
          }
        }
      }

      await client.query(
        `UPDATE comic_books
         SET condition = 'Good',
             estimated_value = $1,
             previous_estimated_value = $2,
             updated_at = NOW()
         WHERE id = $3`,
        [newEstValue, newPrevValue, comic.id]
      );
      conditionUpdatedCount++;
    }

    await client.query('COMMIT');

    console.log(`Successfully updated ${conditionUpdatedCount} owned comics to condition 'Good'.`);
    console.log(`Rescaled ${rescaledCount} existing valuations from Near Mint to Good baseline (0.18x).`);
    if (samples.length > 0) {
      console.log('Sample valuation rescales:');
      for (const s of samples) {
        console.log(` - ${s.title}: $${s.oldValue} (NM) -> $${s.newValue} (Good)`);
      }
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed to update comic conditions:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
