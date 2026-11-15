import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import {
  getFirestoreDb,
  getFirebaseStorageBucket,
  getFirebaseAdminAuth,
  getAdminEmails,
  FIREBASE_PROJECT_ID,
  FIREBASE_STORAGE_BUCKET,
} from '../server/firebaseAdmin.ts';
import {
  matchLocalCoverFilesToComics,
  compressCoverBufferToWebp,
  buildMasterAndAdminCoverUpdatePayloads,
  FRONT_COVER_MAX_WIDTH,
  FRONT_COVER_WEBP_QUALITY,
  FULL_COVER_MAX_WIDTH,
  FULL_COVER_WEBP_QUALITY,
} from '../server/services/webpMasterUploadPipeline.ts';
import { splitComicIntoMasterAndUserInstance } from '../server/services/firestoreMigrationTransform.ts';

dotenv.config({ path: ['.env.local', '.env'] });

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const forceOverwrite = args.includes('--force');

function getArgValue(flag) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  const prefixed = args.find((a) => a.startsWith(`${flag}=`));
  if (prefixed) {
    return prefixed.slice(flag.length + 1);
  }
  return null;
}

const targetDir = getArgValue('--dir') || process.env.LOCAL_COVERS_DIR || '';
const concurrency = Math.max(1, Math.min(20, parseInt(getArgValue('--concurrency') || '8', 10) || 8));

async function scanLocalImageFiles(dirPath) {
  const results = [];
  const validExts = new Set(['.webp', '.png', '.jpg', '.jpeg']);

  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (validExts.has(ext)) {
          const stat = await fs.stat(fullPath);
          results.push({
            filePath: fullPath,
            fileName: entry.name,
            sizeBytes: stat.size,
          });
        }
      }
    }
  }

  await walk(dirPath);
  return results;
}

async function resolveAdminUid() {
  const explicitUid = (process.env.ADMIN_FIREBASE_UID || '').trim();
  if (explicitUid) return explicitUid;

  const adminEmails = getAdminEmails();
  if (!isDryRun && adminEmails.length > 0) {
    try {
      const auth = getFirebaseAdminAuth();
      const userRecord = await auth.getUserByEmail(adminEmails[0]);
      return userRecord.uid;
    } catch {
      // Fall back to admin-primary
    }
  }
  return 'admin-primary';
}

async function loadCatalogComics(adminUid) {
  // Try loading from Cloud Firestore first if not in pure Postgres fallback mode
  if (!isDryRun || process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try {
      const db = getFirestoreDb();
      const snap = await db.collection('master_comics').get();
      if (!snap.empty) {
        console.log(`[Catalog] Loaded ${snap.size} comics from Cloud Firestore (master_comics).`);
        return snap.docs.map((d) => d.data());
      }
    } catch (err) {
      if (!isDryRun) {
        console.warn('[Catalog] Could not query master_comics from Firestore, checking PostgreSQL fallback...', err.message);
      }
    }
  }

  // Fallback to local PostgreSQL for dry-run verification or pre-migration matching
  if (process.env.DATABASE_URL) {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl:
        process.env.DATABASE_SSL === 'true'
          ? { rejectUnauthorized: process.env.DATABASE_SSL_ALLOW_SELF_SIGNED !== 'true' }
          : undefined,
    });
    try {
      const res = await pool.query('SELECT * FROM comic_books ORDER BY created_at ASC');
      console.log(`[Catalog] Loaded ${res.rows.length} comics from local PostgreSQL (comic_books).`);
      return res.rows.map((row) => splitComicIntoMasterAndUserInstance(row, adminUid).masterComic);
    } finally {
      await pool.end();
    }
  }

  throw new Error(
    'Unable to load comics from either Cloud Firestore or PostgreSQL. Ensure FIREBASE_SERVICE_ACCOUNT_KEY or DATABASE_URL is configured in .env.local.'
  );
}

async function runPool(items, limit, worker) {
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const currentIdx = index++;
      if (currentIdx >= items.length) break;
      await worker(items[currentIdx], currentIdx);
    }
  });
  await Promise.all(workers);
}

async function main() {
  if (!targetDir) {
    console.error(
      'Usage: npx tsx scripts/upload-compressed-webp-to-firebase.mjs --dir "C:\\path\\to\\webp-folder" [--dry-run] [--force]'
    );
    process.exit(1);
  }

  const resolvedDir = path.resolve(targetDir);
  console.log('====================================================================');
  console.log(' Comic Vault — Compressed Master WebP Upload to Firebase Storage');
  console.log(` Mode:            ${isDryRun ? 'DRY RUN (No Cloud Uploads)' : 'LIVE UPLOAD'}`);
  console.log(` Source Folder:   ${resolvedDir}`);
  console.log(` Project ID:      ${FIREBASE_PROJECT_ID}`);
  console.log(` Storage Bucket:  ${FIREBASE_STORAGE_BUCKET}`);
  console.log(` Front Target:    max ${FRONT_COVER_MAX_WIDTH}px WebP (q=${FRONT_COVER_WEBP_QUALITY})`);
  console.log(` Full Target:     max ${FULL_COVER_MAX_WIDTH}px WebP (q=${FULL_COVER_WEBP_QUALITY})`);
  console.log('====================================================================\n');

  const adminUid = await resolveAdminUid();
  const localFiles = await scanLocalImageFiles(resolvedDir);
  const totalRawBytes = localFiles.reduce((acc, f) => acc + (f.sizeBytes || 0), 0);

  console.log(
    `[1/5] Scanned ${localFiles.length} local image files (${(totalRawBytes / (1024 * 1024)).toFixed(2)} MB raw).`
  );

  const comics = await loadCatalogComics(adminUid);
  const matchResult = matchLocalCoverFilesToComics(localFiles, comics, FIREBASE_STORAGE_BUCKET);

  const allMatched = [...matchResult.matchedFrontCovers, ...matchResult.matchedFullCovers];
  console.log(`[2/5] Matching Summary against ${comics.length} catalog comics:`);
  console.log(`      - Matched Standard Front Covers:  ${matchResult.matchedFrontCovers.length}`);
  console.log(`      - Matched Full Wraparound Covers: ${matchResult.matchedFullCovers.length}`);
  console.log(`      - Ignored Placeholder Files:      ${matchResult.ignoredPlaceholderFiles.length}`);
  console.log(`      - Unmatched Files:                ${matchResult.unmatchedFiles.length}`);

  if (matchResult.unmatchedFiles.length > 0) {
    console.log('\n--- Unmatched Files List ---');
    matchResult.unmatchedFiles.forEach((f, idx) => {
      console.log(`  ${idx + 1}. ${f.fileName} (${f.filePath})`);
    });
    console.log('----------------------------\n');
  }

  if (allMatched.length === 0) {
    console.log('\nNo matching cover files found to process.');
    return;
  }

  if (isDryRun) {
    // Test-compress up to 10 sample files to estimate compressed output size
    const sampleItems = allMatched.slice(0, Math.min(10, allMatched.length));
    let sampleRawBytes = 0;
    let sampleCompressedBytes = 0;

    for (const item of sampleItems) {
      const rawBuf = await fs.readFile(item.file.filePath);
      const compBuf = await compressCoverBufferToWebp(rawBuf, item.coverType);
      sampleRawBytes += rawBuf.byteLength;
      sampleCompressedBytes += compBuf.byteLength;
    }

    const avgCompressedKb = sampleCompressedBytes / sampleItems.length / 1024;
    const projectedTotalMb = (avgCompressedKb * allMatched.length) / 1024;
    const ratioPct = sampleRawBytes > 0 ? ((1 - sampleCompressedBytes / sampleRawBytes) * 100).toFixed(1) : '0';

    console.log(`\n[Dry-Run Compression Sample (${sampleItems.length} files)]:`);
    console.log(`      - Average Compressed Size:        ${avgCompressedKb.toFixed(1)} KB / cover`);
    console.log(`      - Size Reduction:                 -${ratioPct}%`);
    console.log(`      - Projected Bucket Footprint:     ~${projectedTotalMb.toFixed(1)} MB (out of 5,120 MB free tier)`);
    console.log('\nDry run complete! Run without --dry-run to compress and upload to Firebase Cloud Storage.');
    return;
  }

  const db = getFirestoreDb();
  const bucket = getFirebaseStorageBucket();

  // Load existing Admin comic overrides so we preserve them when updating Firestore
  console.log(`[3/5] Loading existing Admin collection overrides for uid="${adminUid}"...`);
  const adminComicsSnap = await db.collection('users').doc(adminUid).collection('comics').get();
  const existingAdminComicsMap = new Map();
  for (const doc of adminComicsSnap.docs) {
    existingAdminComicsMap.set(doc.id, doc.data());
  }

  // Group assignments by comicId so front + full updates for the same comic merge cleanly
  const updatesByComicId = new Map();
  let uploadedCount = 0;
  let totalUploadedBytes = 0;

  console.log(`[4/5] Compressing and uploading ${allMatched.length} covers (concurrency=${concurrency})...`);

  await runPool(allMatched, concurrency, async (assignment) => {
    const rawBuffer = await fs.readFile(assignment.file.filePath);
    const compressedBuffer = await compressCoverBufferToWebp(rawBuffer, assignment.coverType);

    const fileRef = bucket.file(assignment.storagePath);
    await fileRef.save(compressedBuffer, {
      resumable: false,
      metadata: {
        contentType: 'image/webp',
        cacheControl: 'public, max-age=31536000, immutable',
      },
    });

    totalUploadedBytes += compressedBuffer.byteLength;
    uploadedCount++;

    if (!updatesByComicId.has(assignment.comicId)) {
      updatesByComicId.set(assignment.comicId, {});
    }
    const entry = updatesByComicId.get(assignment.comicId);
    if (assignment.coverType === 'full') {
      entry.fullPublicUrl = assignment.publicUrl;
    } else {
      entry.frontPublicUrl = assignment.publicUrl;
    }

    if (uploadedCount % 50 === 0 || uploadedCount === allMatched.length) {
      console.log(
        `  [Storage Upload] ${uploadedCount} / ${allMatched.length} (${(
          totalUploadedBytes /
          (1024 * 1024)
        ).toFixed(2)} MB total compressed)`
      );
    }
  });

  // Batch update Firestore master_comics and users/{adminUid}/comics
  console.log(`[5/5] Updating Firestore master_comics & Admin collection (${updatesByComicId.size} comics)...`);
  const nowIso = new Date().toISOString();
  const updateEntries = Array.from(updatesByComicId.entries());
  const userRef = db.collection('users').doc(adminUid);

  for (let offset = 0; offset < updateEntries.length; offset += 200) {
    const chunk = updateEntries.slice(offset, offset + 200);
    const batch = db.batch();

    for (const [comicId, urlUpdates] of chunk) {
      const existingAdminComic = existingAdminComicsMap.get(comicId) || null;
      const { masterUpdate, adminComicUpdate } = buildMasterAndAdminCoverUpdatePayloads(
        existingAdminComic,
        urlUpdates,
        nowIso
      );

      const masterRef = db.collection('master_comics').doc(comicId);
      const adminComicRef = userRef.collection('comics').doc(comicId);
      batch.set(masterRef, masterUpdate, { merge: true });
      batch.set(adminComicRef, adminComicUpdate, { merge: true });
    }

    await batch.commit();
  }

  // Generate & upload catalog/master_catalog_snapshot.json for zero-read client catalog hydration
  console.log('Generating and uploading catalog/master_catalog_snapshot.json...');
  const [freshMasterSnap, seriesTotalsSnap] = await Promise.all([
    db.collection('master_comics').get(),
    db.collection('series_issue_totals').get(),
  ]);

  const snapshotPayload = {
    version: 1,
    generatedAt: nowIso,
    comicCount: freshMasterSnap.size,
    seriesTotalCount: seriesTotalsSnap.size,
    comics: freshMasterSnap.docs.map((d) => d.data()),
    seriesTotals: seriesTotalsSnap.docs.map((d) => d.data()),
  };

  const snapshotBuffer = Buffer.from(JSON.stringify(snapshotPayload), 'utf8');
  await bucket.file('catalog/master_catalog_snapshot.json').save(snapshotBuffer, {
    resumable: false,
    gzip: true,
    metadata: {
      contentType: 'application/json; charset=utf-8',
      cacheControl: 'public, max-age=300, stale-while-revalidate=86400',
    },
  });

  console.log('\n====================================================================');
  console.log(' Phase 2 Complete!');
  console.log(` Uploaded Covers:       ${uploadedCount}`);
  console.log(` Total Bucket Size:     ${(totalUploadedBytes / (1024 * 1024)).toFixed(2)} MB`);
  console.log(` Catalog Snapshot Size: ${(snapshotBuffer.byteLength / (1024 * 1024)).toFixed(2)} MB`);
  console.log('====================================================================');
}

main().catch((err) => {
  console.error('Upload compressed WebP script failed:', err);
  process.exit(1);
});
