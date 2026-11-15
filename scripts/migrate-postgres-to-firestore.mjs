import dotenv from 'dotenv';
import { Pool } from 'pg';
import {
  getFirestoreDb,
  getFirebaseAdminAuth,
  getAdminEmails,
  FIREBASE_PROJECT_ID,
  FIRESTORE_DATABASE_ID,
} from '../server/firebaseAdmin.ts';
import {
  splitComicIntoMasterAndUserInstance,
  buildCanonicalSeriesTotalKey,
  normalizeBoxForFirestore,
} from '../server/services/firestoreMigrationTransform.ts';

dotenv.config({ path: ['.env.local', '.env'] });

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');

async function resolveAdminIdentity() {
  const adminEmails = getAdminEmails();
  const primaryEmail = adminEmails[0] || process.env.ADMIN_EMAIL || 'admin@comicvault.local';
  const explicitUid = (process.env.ADMIN_FIREBASE_UID || '').trim();

  if (explicitUid) {
    return {
      uid: explicitUid,
      email: primaryEmail,
      displayName: process.env.ADMIN_DISPLAY_NAME || 'Creator Admin',
    };
  }

  if (!isDryRun && adminEmails.length > 0) {
    try {
      const auth = getFirebaseAdminAuth();
      const userRecord = await auth.getUserByEmail(primaryEmail);
      return {
        uid: userRecord.uid,
        email: userRecord.email || primaryEmail,
        displayName: userRecord.displayName || 'Creator Admin',
      };
    } catch {
      console.warn(
        `[Migrate] Could not look up Firebase Auth user for "${primaryEmail}" (user may not have signed in yet or service account is not set). Using fallback UID "admin-primary".`
      );
    }
  }

  return {
    uid: 'admin-primary',
    email: primaryEmail,
    displayName: process.env.ADMIN_DISPLAY_NAME || 'Creator Admin',
  };
}

/**
 * Helper to commit Firestore operations in batches of 400 (Firestore max is 500 ops per WriteBatch).
 */
async function commitInBatches(items, label, applyToBatch, chunkSize = 200) {
  if (!items || items.length === 0) return;
  const db = getFirestoreDb();
  let processed = 0;

  for (let offset = 0; offset < items.length; offset += chunkSize) {
    const chunk = items.slice(offset, offset + chunkSize);
    const batch = db.batch();
    for (const item of chunk) {
      applyToBatch(batch, item);
    }
    await batch.commit();
    processed += chunk.length;
    console.log(`  [${label}] Committed ${processed} / ${items.length}`);
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not configured in .env.local or .env.');
  }

  console.log('====================================================================');
  console.log(' Comic Vault Box Manager — PostgreSQL to Cloud Firestore Migration');
  console.log(` Mode:          ${isDryRun ? 'DRY RUN (No Firestore writes)' : 'LIVE MIGRATION'}`);
  console.log(` Project ID:    ${FIREBASE_PROJECT_ID}`);
  console.log(` Firestore DB:  ${FIRESTORE_DATABASE_ID}`);
  console.log('====================================================================\n');

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl:
      process.env.DATABASE_SSL === 'true'
        ? { rejectUnauthorized: process.env.DATABASE_SSL_ALLOW_SELF_SIGNED !== 'true' }
        : undefined,
  });

  try {
    const adminUser = await resolveAdminIdentity();
    const nowIso = new Date().toISOString();

    console.log(`[1/6] Admin target account: uid="${adminUser.uid}" (${adminUser.email})`);

    // 1. Read storage_boxes from PostgreSQL
    const boxesRes = await pool.query('SELECT * FROM storage_boxes ORDER BY id ASC');
    const rawBoxes = boxesRes.rows;
    const normalizedBoxes = rawBoxes.map((b) => normalizeBoxForFirestore(b, adminUser.uid, nowIso));

    // Ensure Box -1 (Wishlist) and Box 0 (Unallocated / Staging Queue) exist per Rule 13
    if (!normalizedBoxes.some((b) => b.id === -1)) {
      normalizedBoxes.unshift({
        id: -1,
        userId: adminUser.uid,
        boxNumber: -1,
        name: 'Box -1: Wishlist',
        location: 'Unassigned',
        maxCapacity: 9999,
        colorTag: '#f43f5e',
        notes: 'System container for wishlisted comics',
        updatedAt: nowIso,
      });
    }
    if (!normalizedBoxes.some((b) => b.id === 0)) {
      normalizedBoxes.push({
        id: 0,
        userId: adminUser.uid,
        boxNumber: 0,
        name: 'Box #0: Unallocated / Staging Queue',
        location: 'Staging',
        maxCapacity: 9999,
        colorTag: '#64748b',
        notes: 'System staging container for owned unallocated comics',
        updatedAt: nowIso,
      });
    }

    console.log(`[2/6] Prepared ${normalizedBoxes.length} storage boxes (including Box -1 & Box 0).`);

    // 2. Read comic_books from PostgreSQL
    const comicsRes = await pool.query('SELECT * FROM comic_books ORDER BY created_at ASC');
    const rawComics = comicsRes.rows;

    const masterComics = [];
    const userComics = [];
    let highResFrontOverridesPreserved = 0;
    let highResFullOverridesPreserved = 0;
    let leakedDriveLinksInMaster = 0;

    for (const row of rawComics) {
      const { masterComic, userComic } = splitComicIntoMasterAndUserInstance(
        row,
        adminUser.uid,
        nowIso
      );
      if (userComic.coverImageOverride) highResFrontOverridesPreserved++;
      if (userComic.coverImageFullOverride) highResFullOverridesPreserved++;
      if (
        masterComic.coverImage.includes('drive.google.com') ||
        masterComic.coverImage.includes('googleusercontent.com')
      ) {
        leakedDriveLinksInMaster++;
      }
      masterComics.push(masterComic);
      userComics.push(userComic);
    }

    console.log(`[3/6] Prepared ${rawComics.length} comics:`);
    console.log(`      - Master Catalog records:                     ${masterComics.length}`);
    console.log(`      - Admin User Collection instances:            ${userComics.length}`);
    console.log(`      - Admin High-Res Front Covers Preserved:      ${highResFrontOverridesPreserved}`);
    console.log(`      - Admin High-Res Full Covers Preserved:       ${highResFullOverridesPreserved}`);
    console.log(`      - Google Drive links in Master Catalog:       ${leakedDriveLinksInMaster} (Must be 0)`);

    // 3. Read series_issue_totals
    let seriesTotals = [];
    try {
      const seriesRes = await pool.query('SELECT * FROM series_issue_totals ORDER BY series_name ASC');
      seriesTotals = seriesRes.rows.map((r) => ({
        id: buildCanonicalSeriesTotalKey(r.series_name, r.volume),
        publisher: String(r.publisher || 'Unknown Publisher').trim(),
        seriesName: String(r.series_name || '').trim(),
        volume: String(r.volume ?? '').trim(),
        issueCount: Math.max(0, Number(r.issue_count) || 0),
        updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : nowIso,
      }));
    } catch {
      console.warn('      - Table series_issue_totals not found or empty; skipping.');
    }
    console.log(`[4/6] Prepared ${seriesTotals.length} canonical series_issue_totals records.`);

    // 4. Read reading_challenges and reading_challenge_items
    let challengeDocs = [];
    try {
      const chRes = await pool.query('SELECT * FROM reading_challenges ORDER BY id ASC');
      const itemsRes = await pool.query(
        'SELECT * FROM reading_challenge_items ORDER BY challenge_id ASC, sequence_number ASC'
      );
      const itemsByChallenge = new Map();
      for (const item of itemsRes.rows) {
        const cid = Number(item.challenge_id);
        if (!itemsByChallenge.has(cid)) itemsByChallenge.set(cid, []);
        itemsByChallenge.get(cid).push({
          id: Number(item.id),
          challengeId: cid,
          comicId: item.comic_id,
          sequenceNumber: Number(item.sequence_number),
          status: item.status,
          addedAt: item.added_at ? new Date(item.added_at).toISOString() : nowIso,
          readAt: item.read_at ? new Date(item.read_at).toISOString() : null,
          skippedAt: item.skipped_at ? new Date(item.skipped_at).toISOString() : null,
          metadataSnapshot: item.metadata_snapshot,
        });
      }

      challengeDocs = chRes.rows.map((ch) => ({
        id: String(ch.id),
        challengeId: Number(ch.id),
        userId: adminUser.uid,
        name: ch.name,
        status: ch.status,
        criteriaSnapshot: ch.criteria_snapshot,
        criteriaVersion: Number(ch.criteria_version || 1),
        criteriaSummary: ch.criteria_summary || '',
        readingOrder: ch.reading_order || 'PublicationDate',
        sortDirection: ch.sort_direction || 'Ascending',
        batchSize: Number(ch.batch_size || 10),
        totalEligibleCount: Number(ch.total_eligible_count || 0),
        createdAt: ch.created_at ? new Date(ch.created_at).toISOString() : nowIso,
        startedAt: ch.started_at ? new Date(ch.started_at).toISOString() : nowIso,
        completedAt: ch.completed_at ? new Date(ch.completed_at).toISOString() : null,
        endedAt: ch.ended_at ? new Date(ch.ended_at).toISOString() : null,
        items: itemsByChallenge.get(Number(ch.id)) || [],
      }));
    } catch {
      console.warn('      - Table reading_challenges not found or empty; skipping.');
    }
    console.log(`[5/6] Prepared ${challengeDocs.length} reading challenges.`);

    // 5. Read deleted_records (sync tombstones)
    let tombstoneDocs = [];
    try {
      const delRes = await pool.query('SELECT * FROM deleted_records');
      tombstoneDocs = delRes.rows.map((r) => ({
        id: `${r.entity_type}_${r.entity_id}`,
        entityType: String(r.entity_type),
        entityId: String(r.entity_id),
        deletedAt: r.deleted_at ? new Date(r.deleted_at).toISOString() : nowIso,
      }));
    } catch {
      // Ignore if table does not exist yet
    }
    console.log(`[6/6] Prepared ${tombstoneDocs.length} deletion tombstones.\n`);

    if (isDryRun) {
      console.log('Dry run complete! Run without --dry-run to commit all records to Cloud Firestore.');
      return;
    }

    const db = getFirestoreDb();

    // Step A: Upsert Admin user profile (users/{uid} and users_public/{uid})
    console.log('Committing Admin user profile to Firestore...');
    const userRef = db.collection('users').doc(adminUser.uid);
    const publicUserRef = db.collection('users_public').doc(adminUser.uid);

    await userRef.set(
      {
        uid: adminUser.uid,
        email: adminUser.email,
        displayName: adminUser.displayName,
        role: 'admin',
        vipTier: 'archivist',
        vipExpiresAt: null,
        patreonMemberId: null,
        isBannedFromProposals: false,
        storageBytesUsed: 0,
        dailyUsage: {
          usageDate: nowIso.slice(0, 10),
          readsCount: 0,
          writesCount: 0,
        },
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      { merge: true }
    );

    await publicUserRef.set(
      {
        uid: adminUser.uid,
        displayName: adminUser.displayName,
        role: 'admin',
        vipTier: 'archivist',
        updatedAt: nowIso,
      },
      { merge: true }
    );

    // Step B: Commit storage boxes
    console.log('Committing user_storage_boxes...');
    await commitInBatches(normalizedBoxes, 'storage_boxes', (batch, box) => {
      const ref = userRef.collection('storage_boxes').doc(String(box.id));
      batch.set(ref, box, { merge: true });
    });

    // Step C: Commit master_comics and users/{adminUid}/comics (2 ops per comic -> chunkSize 200 = 400 ops/batch)
    console.log('Committing master_comics & Admin user_comics...');
    const pairedComics = masterComics.map((mc, idx) => ({
      masterComic: mc,
      userComic: userComics[idx],
    }));
    await commitInBatches(
      pairedComics,
      'comics (master + admin instance)',
      (batch, pair) => {
        const masterRef = db.collection('master_comics').doc(pair.masterComic.id);
        const userComicRef = userRef.collection('comics').doc(pair.userComic.id);
        batch.set(masterRef, pair.masterComic, { merge: true });
        batch.set(userComicRef, pair.userComic, { merge: true });
      },
      200
    );

    // Step D: Commit series_issue_totals
    if (seriesTotals.length > 0) {
      console.log('Committing series_issue_totals...');
      await commitInBatches(seriesTotals, 'series_issue_totals', (batch, st) => {
        const ref = db.collection('series_issue_totals').doc(String(st.id));
        batch.set(ref, st, { merge: true });
      });
    }

    // Step E: Commit reading_challenges
    if (challengeDocs.length > 0) {
      console.log('Committing reading_challenges...');
      await commitInBatches(
        challengeDocs,
        'reading_challenges',
        (batch, ch) => {
          const ref = userRef.collection('reading_challenges').doc(String(ch.id));
          batch.set(ref, ch, { merge: true });
        },
        50
      );
    }

    // Step F: Commit deleted_records tombstones
    if (tombstoneDocs.length > 0) {
      console.log('Committing deleted_records tombstones...');
      await commitInBatches(tombstoneDocs, 'deleted_records', (batch, ts) => {
        const ref = userRef.collection('deleted_records').doc(ts.id);
        batch.set(ref, ts, { merge: true });
      });
    }

    console.log('\n====================================================================');
    console.log(' Migration to Cloud Firestore Completed Successfully!');
    console.log('====================================================================');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
