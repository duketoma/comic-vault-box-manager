#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: ['.env.local', '.env'] });

const { Pool } = pg;

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');

function getArgValue(flag, defaultValue) {
  const index = args.indexOf(flag);
  if (index !== -1 && index + 1 < args.length) {
    return args[index + 1];
  }
  return defaultValue;
}

const contribCsvPath = path.resolve(
  getArgValue('--contributors-csv', 'scripts/Comic Book Collection - Title Contributors.csv')
);
const charCsvPath = path.resolve(
  getArgValue('--characters-csv', 'scripts/Comic Book Collection - Title Character Appearances.csv')
);

function parseCsv(text) {
  const lines = [];
  let currentRow = [];
  let currentVal = '';
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentVal += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      currentRow.push(currentVal.trim());
      currentVal = '';
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      currentRow.push(currentVal.trim());
      if (currentRow.some((cell) => cell.length > 0)) {
        lines.push(currentRow);
      }
      currentRow = [];
      currentVal = '';
    } else {
      currentVal += char;
    }
  }
  if (currentVal || currentRow.length > 0) {
    currentRow.push(currentVal.trim());
    if (currentRow.some((cell) => cell.length > 0)) {
      lines.push(currentRow);
    }
  }

  return lines;
}

const norm = (str) => (str || '').trim().toLowerCase();

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set in environment or .env.local');
  }

  console.log(`\n============================================================`);
  console.log(`Comic Vault Metadata Importer (Creators & Characters)`);
  console.log(`Mode: ${isDryRun ? 'DRY RUN (no database changes will be committed)' : 'LIVE EXECUTION'}`);
  console.log(`Contributors CSV: ${contribCsvPath}`);
  console.log(`Characters CSV:   ${charCsvPath}`);
  console.log(`============================================================\n`);

  // 1. Read and parse Contributors CSV
  console.log('Reading Contributors CSV...');
  const contribText = await readFile(contribCsvPath, 'utf-8');
  const contribRows = parseCsv(contribText);
  const [, ...cData] = contribRows;
  console.log(`Parsed ${cData.length} contributor rows from CSV.`);

  // Build index by "series_name||full_title"
  const contribMap = new Map();
  for (const [seriesName, fullTitle, creatorName, roleName] of cData) {
    const sName = norm(seriesName);
    const fTitle = norm(fullTitle);
    const key = `${sName}||${fTitle}`;
    if (!contribMap.has(key)) contribMap.set(key, []);
    contribMap.get(key).push({
      creatorName: (creatorName || '').trim(),
      roleName: (roleName || 'Contributor').trim(),
    });
  }

  // 2. Read and parse Characters CSV
  console.log('Reading Characters CSV...');
  const charText = await readFile(charCsvPath, 'utf-8');
  const charRows = parseCsv(charText);
  const [, ...chData] = charRows;
  console.log(`Parsed ${chData.length} character appearance rows from CSV.`);

  // Build index by "series_name||full_title"
  const charMap = new Map();
  for (const [seriesName, fullTitle, characterName, appearanceType] of chData) {
    const sName = norm(seriesName);
    const fTitle = norm(fullTitle);
    const key = `${sName}||${fTitle}`;
    if (!charMap.has(key)) charMap.set(key, []);
    charMap.get(key).push({
      characterName: (characterName || '').trim(),
      appearanceType: (appearanceType || 'Supporting').trim(),
    });
  }

  // 3. Connect to database and fetch candidates
  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const emptyComicsRes = await client.query(`
      SELECT id, title, issue_number, volume, series_name, full_title, writer, artist,
             creator_contributions, character_appearances,
             (creator_contributions IS NULL OR creator_contributions = '[]'::jsonb) AS empty_creators,
             (character_appearances IS NULL OR character_appearances = '[]'::jsonb) AS empty_characters
      FROM comic_books
      WHERE (creator_contributions IS NULL OR creator_contributions = '[]'::jsonb)
         OR (character_appearances IS NULL OR character_appearances = '[]'::jsonb)
      ORDER BY title, issue_number
    `);

    const emptyComics = emptyComicsRes.rows;
    console.log(`Found ${emptyComics.length} comics with at least one empty field in database.\n`);

    let comicsUpdatedCount = 0;
    let creatorsAddedCount = 0;
    let charactersAddedCount = 0;
    let writersBackfilledCount = 0;
    let artistsBackfilledCount = 0;
    let tcLinksUpdated = 0;
    let tcaLinksUpdated = 0;

    const noMatches = [];

    for (const comic of emptyComics) {
      const key = `${norm(comic.series_name)}||${norm(comic.full_title)}`;
      const fallbackKey = `${norm(comic.title)}||${norm(comic.full_title)}`;

      const matchedContribs = contribMap.get(key) || contribMap.get(fallbackKey) || [];
      const matchedChars = charMap.get(key) || charMap.get(fallbackKey) || [];

      const shouldUpdateCreators = comic.empty_creators && matchedContribs.length > 0;
      const shouldUpdateChars = comic.empty_characters && matchedChars.length > 0;

      if (!shouldUpdateCreators && !shouldUpdateChars) {
        noMatches.push({
          id: comic.id,
          seriesName: comic.series_name,
          fullTitle: comic.full_title,
          missingCreators: comic.empty_creators,
          missingChars: comic.empty_characters,
        });
        continue;
      }

      const updates = [];
      const queryParams = [];
      let paramIdx = 1;

      let finalCreators = comic.creator_contributions;
      if (shouldUpdateCreators) {
        finalCreators = matchedContribs;
        updates.push(`creator_contributions = $${paramIdx++}`);
        queryParams.push(JSON.stringify(finalCreators));
        creatorsAddedCount++;
      }

      let finalChars = comic.character_appearances;
      if (shouldUpdateChars) {
        finalChars = matchedChars;
        updates.push(`character_appearances = $${paramIdx++}`);
        queryParams.push(JSON.stringify(finalChars));
        charactersAddedCount++;
      }

      // Backfill writer and artist if currently empty
      if (shouldUpdateCreators) {
        const isWriter = (role) => /writ|story|script|plot|author/i.test(role);
        const isArtist = (role) => /pencil|artist|illustrat|draw|art/i.test(role);

        const writerNames = [
          ...new Set(matchedContribs.filter((c) => isWriter(c.roleName)).map((c) => c.creatorName)),
        ].filter(Boolean);
        const artistNames = [
          ...new Set(matchedContribs.filter((c) => isArtist(c.roleName)).map((c) => c.creatorName)),
        ].filter(Boolean);

        if ((!comic.writer || !comic.writer.trim()) && writerNames.length > 0) {
          const writerStr = writerNames.join(', ');
          updates.push(`writer = $${paramIdx++}`);
          queryParams.push(writerStr);
          writersBackfilledCount++;
        }

        if ((!comic.artist || !comic.artist.trim()) && artistNames.length > 0) {
          const artistStr = artistNames.join(', ');
          updates.push(`artist = $${paramIdx++}`);
          queryParams.push(artistStr);
          artistsBackfilledCount++;
        }
      }

      // Stamp updated_at
      updates.push(`updated_at = NOW()`);
      queryParams.push(comic.id);

      const comicSql = `UPDATE comic_books SET ${updates.join(', ')} WHERE id = $${paramIdx}`;
      await client.query(comicSql, queryParams);
      comicsUpdatedCount++;

      // Relink title_contributors table for relational integrity
      if (shouldUpdateCreators && comic.series_name && comic.full_title) {
        const tcRes = await client.query(
          `UPDATE title_contributors
           SET comic_id = $1, updated_at = NOW()
           WHERE LOWER(TRIM(series_name)) = $2 AND LOWER(TRIM(full_title)) = $3`,
          [comic.id, norm(comic.series_name), norm(comic.full_title)]
        );
        tcLinksUpdated += tcRes.rowCount || 0;
      }

      // Relink title_character_appearances table for relational integrity
      if (shouldUpdateChars && comic.series_name && comic.full_title) {
        const tcaRes = await client.query(
          `UPDATE title_character_appearances
           SET comic_id = $1, updated_at = NOW()
           WHERE LOWER(TRIM(series_name)) = $2 AND LOWER(TRIM(full_title)) = $3`,
          [comic.id, norm(comic.series_name), norm(comic.full_title)]
        );
        tcaLinksUpdated += tcaRes.rowCount || 0;
      }

      console.log(`✓ Updated [${comic.id}] ${comic.series_name} -> ${comic.full_title}`);
      if (shouldUpdateCreators) console.log(`    + Creators: ${matchedContribs.length} added`);
      if (shouldUpdateChars) console.log(`    + Characters: ${matchedChars.length} added`);
    }

    if (isDryRun) {
      await client.query('ROLLBACK');
      console.log('\n[DRY RUN] Rolled back all changes.');
    } else {
      await client.query('COMMIT');
      console.log('\n[LIVE EXECUTION] Successfully committed all changes to database.');
    }

    console.log(`\n============================================================`);
    console.log(`Summary of Results:`);
    console.log(`------------------------------------------------------------`);
    console.log(`Comics examined:                  ${emptyComics.length}`);
    console.log(`Comics updated:                   ${comicsUpdatedCount}`);
    console.log(`Creator contributions backfilled: ${creatorsAddedCount} comics`);
    console.log(`Character appearances backfilled: ${charactersAddedCount} comics`);
    console.log(`Writer fields backfilled:         ${writersBackfilledCount} comics`);
    console.log(`Artist fields backfilled:         ${artistsBackfilledCount} comics`);
    console.log(`title_contributors links updated: ${tcLinksUpdated} rows`);
    console.log(`title_char_app links updated:     ${tcaLinksUpdated} rows`);
    console.log(`Comics with no CSV data (skipped):${noMatches.length}`);
    console.log(`============================================================\n`);

    if (noMatches.length > 0) {
      console.log(`Sample skipped comics (first 10):`);
      for (const skipped of noMatches.slice(0, 10)) {
        console.log(` - [${skipped.id}] ${skipped.seriesName || '<no series>'} -> ${skipped.fullTitle}`);
      }
      if (noMatches.length > 10) {
        console.log(`   ... and ${noMatches.length - 10} more.`);
      }
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('\n❌ Import script failed:', err);
  process.exit(1);
});
