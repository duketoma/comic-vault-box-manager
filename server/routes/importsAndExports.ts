import express from 'express';
import { google } from 'googleapis';
import { pool, requireDatabase, databaseErrorMessage, parseCSV } from '../db';
import { generateSqlExportScript } from '../schema';

export const importsAndExportsRouter = express.Router();

// Helper to fetch Google Sheet data by tab name using OAuth or public CSV export
async function fetchSheetData(
  spreadsheetId: string,
  sheetName: string,
  accessToken?: string
): Promise<{ headers: string[]; rows: string[][] }> {
  let cleanId = spreadsheetId.trim();
  const urlMatch = cleanId.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch) cleanId = urlMatch[1];

  // Strategy 1: If client provided OAuth access token, use Google Sheets API
  if (accessToken) {
    try {
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: accessToken });
      const sheets = google.sheets({ version: 'v4', auth });
      const range = sheetName ? `'${sheetName}'` : 'A1:ZZ';

      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: cleanId,
        range,
      });

      const rows = response.data.values;
      if (rows && rows.length > 0) {
        const headers = rows[0].map((h: any) => String(h ?? '').trim());
        const dataRows = rows.slice(1).map((r: any[]) => r.map((c: any) => String(c ?? '').trim()));
        return { headers, rows: dataRows };
      }
    } catch (authErr: any) {
      console.warn(`OAuth fetch failed for tab "${sheetName}":`, authErr.message);
    }
  }

  // Strategy 2: Fallback to public CSV export endpoint (works for any sheet shared with "Anyone with the link")
  const csvUrl = `https://docs.google.com/spreadsheets/d/${cleanId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(
    sheetName || 'Sheet1'
  )}`;
  const csvResponse = await fetch(csvUrl);

  if (csvResponse.ok) {
    const csvText = await csvResponse.text();
    if (csvText && !csvText.includes('<!DOCTYPE html>')) {
      const parsedRows = parseCSV(csvText);
      if (parsedRows.length > 0) {
        const headers = parsedRows[0].map((h) => h.trim());
        const dataRows = parsedRows.slice(1);
        return { headers, rows: dataRows };
      }
    }
  }

  // Strategy 3: Secondary export URL attempt
  const exportUrl = `https://docs.google.com/spreadsheets/d/${cleanId}/export?format=csv&sheet=${encodeURIComponent(
    sheetName || 'Sheet1'
  )}`;
  const exportResponse = await fetch(exportUrl);
  if (exportResponse.ok) {
    const csvText = await exportResponse.text();
    if (csvText && !csvText.includes('<!DOCTYPE html>')) {
      const parsedRows = parseCSV(csvText);
      if (parsedRows.length > 0) {
        const headers = parsedRows[0].map((h) => h.trim());
        const dataRows = parsedRows.slice(1);
        return { headers, rows: dataRows };
      }
    }
  }

  throw new Error(
    `Could not read sheet tab "${sheetName}". Ensure the tab exists and the Google Sheet is shared with "Anyone with the link can view".`
  );
}

// --- API ROUTE: Google Sheets Fetch Single Tab ---
importsAndExportsRouter.post('/api/google-sheets/fetch', async (req, res) => {
  try {
    const { spreadsheetId, sheetName = 'Sheet1', accessToken } = req.body;
    if (!spreadsheetId) {
      return res.status(400).json({ error: 'spreadsheetId is required' });
    }

    const { headers, rows } = await fetchSheetData(spreadsheetId, sheetName, accessToken);
    return res.json({
      success: true,
      spreadsheetId,
      sheetName,
      headers,
      rowCount: rows.length,
      rows,
    });
  } catch (err: any) {
    console.error('Google Sheets Fetch Error:', err);
    return res.status(400).json({ error: err.message || 'Failed to fetch Google Sheet data' });
  }
});

// --- API ROUTE: Google Sheets Batch Fetch Multiple Subsheets ---
importsAndExportsRouter.post('/api/google-sheets/fetch-subsheets', async (req, res) => {
  try {
    const { spreadsheetId, sheetNames = {}, accessToken } = req.body;
    if (!spreadsheetId) {
      return res.status(400).json({ error: 'spreadsheetId is required' });
    }

    const results: Record<
      string,
      { sheetName: string; headers: string[]; rows: string[][]; rowCount: number; error?: string }
    > = {};

    const fetchPromises = Object.entries(sheetNames).map(async ([key, sheetName]) => {
      const name = String(sheetName || '').trim();
      if (!name) return;
      try {
        const { headers, rows } = await fetchSheetData(spreadsheetId, name, accessToken);
        results[key] = {
          sheetName: name,
          headers,
          rows,
          rowCount: rows.length,
        };
      } catch (tabErr: any) {
        results[key] = {
          sheetName: name,
          headers: [],
          rows: [],
          rowCount: 0,
          error: tabErr.message,
        };
      }
    });

    await Promise.all(fetchPromises);

    return res.json({
      success: true,
      spreadsheetId,
      subsheets: results,
    });
  } catch (err: any) {
    console.error('Google Sheets Fetch Subsheets Error:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch subsheets' });
  }
});

// --- API ROUTE: Import and Store Subsheets into Database ---
importsAndExportsRouter.post('/api/import/subsheets', requireDatabase, async (req, res) => {
  const client = await pool!.connect();
  try {
    const {
      creators = [],
      creatorTypes = [],
      contributors = [],
      characterAppearances = [],
      seriesTotals = [],
      syncWithComics = true,
    } = req.body;

    await client.query('BEGIN');

    let creatorsInserted = 0;
    let creatorTypesInserted = 0;
    let contributorsInserted = 0;
    let appearancesInserted = 0;
    let seriesTotalsInserted = 0;
    let comicsUpdated = 0;

    // 1. Creators import: (First Name, Last Name, Full Name)
    if (Array.isArray(creators) && creators.length > 0) {
      await client.query('DELETE FROM creators');
      for (const creator of creators) {
        const fullName = String(creator.fullName || '').trim();
        if (!fullName) continue;
        const firstName = creator.firstName ? String(creator.firstName).trim() : null;
        const lastName = creator.lastName ? String(creator.lastName).trim() : null;

        await client.query(
          `INSERT INTO creators (first_name, last_name, full_name, updated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (full_name) DO UPDATE SET
             first_name = COALESCE(NULLIF(EXCLUDED.first_name, ''), creators.first_name),
             last_name = COALESCE(NULLIF(EXCLUDED.last_name, ''), creators.last_name),
             updated_at = NOW()`,
          [firstName, lastName, fullName]
        );
        creatorsInserted++;
      }
    }

    // 2. Creator Types import (Penciller, Inker, Editor, Writer, etc.)
    if (Array.isArray(creatorTypes) && creatorTypes.length > 0) {
      await client.query('DELETE FROM creator_types');
      for (const ct of creatorTypes) {
        const typeName = String(ct.typeName || ct.roleName || ct.name || '').trim();
        if (!typeName) continue;
        await client.query(
          `INSERT INTO creator_types (type_name, updated_at)
           VALUES ($1, NOW())
           ON CONFLICT (type_name) DO NOTHING`,
          [typeName]
        );
        creatorTypesInserted++;
      }
    }

    // 3. Title Contributors import (Series Name, Full Title, Creator Full Name, Creator Type)
    if (Array.isArray(contributors) && contributors.length > 0) {
      await client.query('DELETE FROM title_contributors');

      const uniqueCreatorsMap = new Map<string, { first: string | null; last: string; full: string }>();
      const uniqueTypesSet = new Set<string>();
      const validContribRows: Array<[string | null, string, string, string]> = [];

      for (const c of contributors) {
        const fullTitle = String(c.fullTitle || '').trim();
        const creatorFullName = String(c.creatorFullName || c.creatorName || '').trim();
        const creatorType = String(c.creatorType || c.roleName || 'Contributor').trim();
        const seriesName = c.seriesName ? String(c.seriesName).trim() : null;

        if (!fullTitle || !creatorFullName) continue;

        if (!uniqueCreatorsMap.has(creatorFullName)) {
          const nameParts = creatorFullName.split(' ');
          const autoFirst = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : null;
          const autoLast = nameParts.length > 1 ? nameParts[nameParts.length - 1] : creatorFullName;
          uniqueCreatorsMap.set(creatorFullName, { first: autoFirst, last: autoLast, full: creatorFullName });
        }
        uniqueTypesSet.add(creatorType);
        validContribRows.push([seriesName, fullTitle, creatorFullName, creatorType]);
      }

      // Batch ensure creators exist
      const creatorsList = Array.from(uniqueCreatorsMap.values());
      for (let offset = 0; offset < creatorsList.length; offset += 250) {
        const chunk = creatorsList.slice(offset, offset + 250);
        const vals: unknown[] = [];
        const ph: string[] = [];
        chunk.forEach((cr, idx) => {
          const b = idx * 3;
          ph.push(`($${b + 1}, $${b + 2}, $${b + 3}, NOW())`);
          vals.push(cr.first, cr.last, cr.full);
        });
        await client.query(
          `INSERT INTO creators (first_name, last_name, full_name, updated_at)
           VALUES ${ph.join(', ')}
           ON CONFLICT (full_name) DO NOTHING`,
          vals
        );
      }

      // Batch ensure creator types exist
      const typesList = Array.from(uniqueTypesSet);
      if (typesList.length > 0) {
        const ph = typesList.map((_, idx) => `($${idx + 1}, NOW())`).join(', ');
        await client.query(
          `INSERT INTO creator_types (type_name, updated_at)
           VALUES ${ph}
           ON CONFLICT (type_name) DO NOTHING`,
          typesList
        );
      }

      // Batch insert title_contributors
      for (let offset = 0; offset < validContribRows.length; offset += 250) {
        const chunk = validContribRows.slice(offset, offset + 250);
        const vals: unknown[] = [];
        const ph: string[] = [];
        chunk.forEach((row, idx) => {
          const b = idx * 4;
          ph.push(`($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, NOW())`);
          vals.push(row[0], row[1], row[2], row[3]);
        });
        await client.query(
          `INSERT INTO title_contributors (series_name, full_title, creator_full_name, creator_type, updated_at)
           VALUES ${ph.join(', ')}`,
          vals
        );
      }
      contributorsInserted = validContribRows.length;
    }

    // 4. Character Appearances import (Series Name, Full Title, Character Name, Appearance Type)
    if (Array.isArray(characterAppearances) && characterAppearances.length > 0) {
      await client.query('DELETE FROM title_character_appearances');

      const validAppearances: Array<[string | null, string, string, string]> = [];
      for (const a of characterAppearances) {
        const fullTitle = String(a.fullTitle || '').trim();
        const characterName = String(a.characterName || '').trim();
        const appearanceType = String(a.appearanceType || 'Supporting').trim();
        const seriesName = a.seriesName ? String(a.seriesName).trim() : null;

        if (!fullTitle || !characterName) continue;
        validAppearances.push([seriesName, fullTitle, characterName, appearanceType]);
      }

      for (let offset = 0; offset < validAppearances.length; offset += 250) {
        const chunk = validAppearances.slice(offset, offset + 250);
        const vals: unknown[] = [];
        const ph: string[] = [];
        chunk.forEach((row, idx) => {
          const b = idx * 4;
          ph.push(`($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, NOW())`);
          vals.push(row[0], row[1], row[2], row[3]);
        });
        await client.query(
          `INSERT INTO title_character_appearances (series_name, full_title, character_name, appearance_type, updated_at)
           VALUES ${ph.join(', ')}`,
          vals
        );
      }
      appearancesInserted = validAppearances.length;
    }

    // 4.5 Series Issue Totals import (Publisher Name, Series Name, Volume, Issue Count)
    if (Array.isArray(seriesTotals) && seriesTotals.length > 0) {
      for (const st of seriesTotals) {
        const publisher = String(st.publisher || 'Unknown Publisher').trim();
        const seriesName = String(st.seriesName || '').trim();
        const volume = String(st.volume ?? '').trim();
        const issueCount = Math.max(0, parseInt(st.issueCount, 10) || 0);

        if (!seriesName) continue;

        await client.query(
          `INSERT INTO series_issue_totals (publisher, series_name, volume, issue_count, updated_at)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (series_name, volume) DO UPDATE SET
             publisher = EXCLUDED.publisher,
             issue_count = EXCLUDED.issue_count,
             updated_at = NOW()`,
          [publisher, seriesName, volume, issueCount]
        );
        seriesTotalsInserted++;
      }
    }

    // 5. Link with comic_books and update creator contributions and character appearances using set-based SQL
    if (syncWithComics) {
      await client.query(`
        UPDATE comic_books
        SET 
          creator_contributions = '[]'::jsonb,
          character_appearances = '[]'::jsonb,
          writer = CASE WHEN writer = title OR writer = series_name OR writer = full_title THEN NULL ELSE writer END,
          artist = CASE WHEN artist = title OR artist = series_name OR artist = full_title THEN NULL ELSE artist END
        WHERE TRUE
      `);

      // Link comic_id in contributors
      await client.query(`
        UPDATE title_contributors tc
        SET comic_id = cb.id
        FROM comic_books cb
        WHERE LOWER(TRIM(tc.full_title)) = LOWER(TRIM(cb.full_title))
      `);
      await client.query(`
        UPDATE title_contributors tc
        SET comic_id = cb.id
        FROM comic_books cb
        WHERE tc.comic_id IS NULL
          AND (
            LOWER(TRIM(tc.full_title)) = LOWER(TRIM(cb.title))
            OR LOWER(TRIM(tc.full_title)) = LOWER(TRIM(cb.title || ' #' || cb.issue_number))
            OR LOWER(TRIM(tc.full_title)) = LOWER(TRIM(cb.title || ' ' || cb.issue_number))
          )
      `);

      // Link comic_id in character appearances
      await client.query(`
        UPDATE title_character_appearances tca
        SET comic_id = cb.id
        FROM comic_books cb
        WHERE LOWER(TRIM(tca.full_title)) = LOWER(TRIM(cb.full_title))
      `);
      await client.query(`
        UPDATE title_character_appearances tca
        SET comic_id = cb.id
        FROM comic_books cb
        WHERE tca.comic_id IS NULL
          AND (
            LOWER(TRIM(tca.full_title)) = LOWER(TRIM(cb.title))
            OR LOWER(TRIM(tca.full_title)) = LOWER(TRIM(cb.title || ' #' || cb.issue_number))
            OR LOWER(TRIM(tca.full_title)) = LOWER(TRIM(cb.title || ' ' || cb.issue_number))
          )
      `);

      // Backfill series_name on comic_books if available from contributors or appearances
      await client.query(`
        UPDATE comic_books cb
        SET series_name = tc.series_name
        FROM title_contributors tc
        WHERE tc.comic_id = cb.id
          AND (cb.series_name IS NULL OR cb.series_name = '')
          AND tc.series_name IS NOT NULL
      `);
      await client.query(`
        UPDATE comic_books cb
        SET series_name = tca.series_name
        FROM title_character_appearances tca
        WHERE tca.comic_id = cb.id
          AND (cb.series_name IS NULL OR cb.series_name = '')
          AND tca.series_name IS NOT NULL
      `);

      // Single set-based UPDATE for creator_contributions, writer, and artist across all matched comic_books
      const contribUpdateRes = await client.query(`
        WITH agg AS (
          SELECT
            tc.comic_id,
            jsonb_agg(jsonb_build_object('creatorName', tc.creator_full_name, 'roleName', tc.creator_type)) AS contributions,
            STRING_AGG(DISTINCT tc.creator_full_name, ', ')
              FILTER (WHERE tc.creator_type ~* 'writ|story|script|plot|author') AS writer_str,
            STRING_AGG(DISTINCT tc.creator_full_name, ', ')
              FILTER (WHERE tc.creator_type ~* 'pencil|artist|illustrat|draw|art') AS artist_str
          FROM title_contributors tc
          WHERE tc.comic_id IS NOT NULL
          GROUP BY tc.comic_id
        )
        UPDATE comic_books cb
        SET
          creator_contributions = agg.contributions,
          writer = COALESCE(NULLIF(agg.writer_str, ''), cb.writer),
          artist = COALESCE(NULLIF(agg.artist_str, ''), cb.artist),
          updated_at = NOW()
        FROM agg
        WHERE cb.id = agg.comic_id
      `);
      comicsUpdated = contribUpdateRes.rowCount || 0;

      // Single set-based UPDATE for character_appearances across all matched comic_books
      await client.query(`
        WITH char_agg AS (
          SELECT
            tca.comic_id,
            jsonb_agg(jsonb_build_object('characterName', tca.character_name, 'appearanceType', tca.appearance_type)) AS characters
          FROM title_character_appearances tca
          WHERE tca.comic_id IS NOT NULL
          GROUP BY tca.comic_id
        )
        UPDATE comic_books cb
        SET
          character_appearances = char_agg.characters,
          updated_at = NOW()
        FROM char_agg
        WHERE cb.id = char_agg.comic_id
      `);
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      counts: {
        creators: creatorsInserted,
        creatorTypes: creatorTypesInserted,
        contributors: contributorsInserted,
        characterAppearances: appearancesInserted,
        seriesTotals: seriesTotalsInserted,
        comicsUpdated,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    const detail = databaseErrorMessage(error);
    console.error('Subsheets import failed:', detail);
    res.status(500).json({ error: `Unable to import subsheets: ${detail}` });
  } finally {
    client.release();
  }
});

// --- API ROUTE: Generate SQL Import Script ---
importsAndExportsRouter.post('/api/export-sql', (req, res) => {
  try {
    const sql = generateSqlExportScript(req.body || {});
    return res.json({ success: true, sql });
  } catch (err: any) {
    console.error('SQL Export Error:', err);
    return res.status(500).json({ error: err.message || 'Failed to export SQL script' });
  }
});
