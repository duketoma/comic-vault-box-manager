import dotenv from 'dotenv';
dotenv.config({ path: ['.env.local', '.env'] });

import { Pool } from 'pg';
import { getFirestoreDb, getFirebaseStorageBucket, isFirestoreConfigured } from '../server/firebaseAdmin';
import { isE2ETestComicRecord } from '../src/data/initialData';
import { recordDeletionTombstones } from '../server/db';

const JLX_ID = 'imported-1790007670326-0';

function isTestWishlistOrFixture(id: string, data: Record<string, any>): boolean {
  if (isE2ETestComicRecord({ ...data, id })) return true;
  if (id.startsWith('c-wishlist-')) return true;
  const series = String(data.seriesName || data.series_name || '');
  const status = String(data.readingStatus || data.reading_status || '');
  if (series === 'Captain America (Vol. 1)' && status === 'Wishlist') return true;
  return false;
}

function isTestCreatorContribution(contrib: any): boolean {
  const name = String(contrib?.creatorName || '');
  return name.includes('Jack Kirby Test') || name.includes('Alex Toth Test');
}

export async function cleanupFirestoreTestWishlist() {
  if (!isFirestoreConfigured()) {
    return;
  }
  const db = getFirestoreDb();
  const uid = process.env.ADMIN_FIREBASE_UID || 'QDLamXAoKGV7HiHzWv7u2whr2tu1';
  const nowIso = new Date().toISOString();
  console.log(`Checking Firestore comics for uid: ${uid}`);

  const userComicsCol = db.collection('users').doc(uid).collection('comics');
  const deletedRecordsCol = db.collection('users').doc(uid).collection('deleted_records');

  const snap = await userComicsCol.get();
  console.log(`Total comics in Firestore user collection: ${snap.size}`);

  const testDocs = snap.docs.filter((doc) => isTestWishlistOrFixture(doc.id, doc.data()));
  console.log(`Found ${testDocs.length} test/fixture user docs to delete`);

  if (testDocs.length > 0) {
    for (let i = 0; i < testDocs.length; i += 200) {
      const chunk = testDocs.slice(i, i + 200);
      const batch = db.batch();
      for (const doc of chunk) {
        batch.delete(doc.ref);
        batch.set(deletedRecordsCol.doc(`comic_${doc.id}`), {
          entityType: 'comic',
          entityId: doc.id,
          deletedAt: nowIso,
        });
      }
      await batch.commit();
      console.log(`Deleted user batch of ${chunk.length} (+ tombstones)`);
    }
  }

  // Restore JLX #1 in user collection if polluted by negative-issue-numbers or creator-roles E2E tests
  const userJlxRef = userComicsCol.doc(JLX_ID);
  const userJlxSnap = await userJlxRef.get();
  if (userJlxSnap.exists) {
    const jlxData = userJlxSnap.data() || {};
    const origContribs = Array.isArray(jlxData.creatorContributions) ? jlxData.creatorContributions : [];
    const cleanedContribs = origContribs.filter((c) => !isTestCreatorContribution(c));
    if (
      String(jlxData.issueNumber) !== '1' ||
      jlxData.fullTitle !== 'JLX #1' ||
      cleanedContribs.length !== origContribs.length
    ) {
      await userJlxRef.set(
        {
          issueNumber: '1',
          fullTitle: 'JLX #1',
          creatorContributions: cleanedContribs,
          updatedAt: nowIso,
        },
        { merge: true }
      );
      console.log(`Restored JLX #1 metadata and cleaned ${origContribs.length - cleanedContribs.length} test creator(s) in user collection.`);
    }
  }


  // Clean master_comics and restore JLX #1 in master_comics
  let masterChanged = false;
  const masterCol = db.collection('master_comics');
  const masterSnap = await masterCol.get();
  const masterTestDocs = masterSnap.docs.filter((doc) => isTestWishlistOrFixture(doc.id, doc.data()));
  console.log(`Found ${masterTestDocs.length} test/fixture master_comics docs to delete`);

  if (masterTestDocs.length > 0) {
    masterChanged = true;
    for (let i = 0; i < masterTestDocs.length; i += 400) {
      const chunk = masterTestDocs.slice(i, i + 400);
      const batch = db.batch();
      for (const doc of chunk) {
        batch.delete(doc.ref);
      }
      await batch.commit();
      console.log(`Deleted master_comics batch of ${chunk.length}`);
    }
  }

  const masterJlxRef = masterCol.doc(JLX_ID);
  const masterJlxSnap = await masterJlxRef.get();
  if (masterJlxSnap.exists) {
    const jlxData = masterJlxSnap.data() || {};
    const origContribs = Array.isArray(jlxData.creatorContributions) ? jlxData.creatorContributions : [];
    const cleanedContribs = origContribs.filter((c) => !isTestCreatorContribution(c));
    if (
      String(jlxData.issueNumber) !== '1' ||
      jlxData.fullTitle !== 'JLX #1' ||
      cleanedContribs.length !== origContribs.length
    ) {
      masterChanged = true;
      await masterJlxRef.set(
        {
          issueNumber: '1',
          fullTitle: 'JLX #1',
          creatorContributions: cleanedContribs,
          updatedAt: nowIso,
        },
        { merge: true }
      );
      console.log(`Restored JLX #1 and cleaned ${origContribs.length - cleanedContribs.length} test creator(s) in master_comics.`);
    }
  }

  // Refresh master_catalog_snapshot.json in Firebase Cloud Storage if master_comics changed
  if (masterChanged) {
    try {
      const bucket = getFirebaseStorageBucket();
      const snapshotFile = bucket.file('catalog/master_catalog_snapshot.json');
      const [exists] = await snapshotFile.exists();
      if (exists) {
        const [freshMasterSnap, seriesTotalsSnap] = await Promise.all([
          masterCol.get(),
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
        await snapshotFile.save(snapshotBuffer, {
          resumable: false,
          gzip: true,
          metadata: {
            contentType: 'application/json; charset=utf-8',
            cacheControl: 'public, max-age=300, stale-while-revalidate=86400',
          },
        });
        console.log(`Regenerated catalog/master_catalog_snapshot.json (${freshMasterSnap.size} master comics).`);
      }
    } catch (err) {
      console.warn('Warning: failed to refresh master_catalog_snapshot.json:', err);
    }
  }

  console.log('Firestore cleanup completed!');
}

export async function cleanupPostgresTestWishlist() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;

  const pgPool = new Pool({
    connectionString: databaseUrl,
    ssl:
      process.env.DATABASE_SSL === 'true'
        ? { rejectUnauthorized: process.env.DATABASE_SSL_ALLOW_SELF_SIGNED !== 'true' }
        : undefined,
  });

  try {
    const res = await pgPool.query(
      'SELECT id, title, series_name, reading_status, issue_number, full_title, creator_contributions FROM comic_books'
    );
    const toDeleteIds: string[] = [];

    for (const row of res.rows) {
      const id = String(row.id);
      if (isTestWishlistOrFixture(id, row)) {
        toDeleteIds.push(id);
      }
    }

    console.log(`Found ${toDeleteIds.length} test/fixture Postgres comic_books rows to delete`);
    if (toDeleteIds.length > 0) {
      await pgPool.query('DELETE FROM comic_books WHERE id = ANY($1::text[])', [toDeleteIds]);
      await recordDeletionTombstones(pgPool, 'comic', toDeleteIds);
      console.log('Deleted Postgres test rows:', toDeleteIds);
    }

    // Restore JLX #1 in Postgres if polluted
    const jlxRow = res.rows.find((r) => String(r.id) === JLX_ID);
    if (jlxRow) {
      const origContribs = Array.isArray(jlxRow.creator_contributions) ? jlxRow.creator_contributions : [];
      const cleanedContribs = origContribs.filter((c: any) => !isTestCreatorContribution(c));
      if (
        String(jlxRow.issue_number) !== '1' ||
        jlxRow.full_title !== 'JLX #1' ||
        cleanedContribs.length !== origContribs.length
      ) {
        await pgPool.query(
          `UPDATE comic_books
           SET issue_number = '1',
               full_title = 'JLX #1',
               creator_contributions = $1::jsonb,
               updated_at = NOW()
           WHERE id = $2`,
          [JSON.stringify(cleanedContribs), JLX_ID]
        );
        console.log(`Restored JLX #1 and cleaned ${origContribs.length - cleanedContribs.length} test creator(s) in Postgres.`);
      }
    }


    console.log('Postgres cleanup completed!');
  } finally {
    await pgPool.end();
  }
}

if (process.argv[1]?.includes('cleanup-test-wishlist')) {
  Promise.all([cleanupFirestoreTestWishlist(), cleanupPostgresTestWishlist()])
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
