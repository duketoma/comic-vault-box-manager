import dotenv from 'dotenv';
dotenv.config({ path: ['.env.local', '.env'] });

import { getFirestoreDb } from '../server/firebaseAdmin';

export async function cleanupFirestoreTestWishlist() {
  const db = getFirestoreDb();
  const uid = process.env.ADMIN_FIREBASE_UID || 'QDLamXAoKGV7HiHzWv7u2whr2tu1';
  console.log(`Checking comics for uid: ${uid}`);

  const snap = await db.collection('users').doc(uid).collection('comics').get();
  console.log(`Total comics in Firestore: ${snap.size}`);

  const testDocs = snap.docs.filter((doc) => {
    const id = doc.id;
    const data = doc.data();
    const title = data.title || '';
    const series = data.seriesName || '';
    return id.startsWith('c-wishlist-') || title.startsWith('Wishlist Hero') || (series === 'Captain America (Vol. 1)' && data.readingStatus === 'Wishlist');
  });

  console.log(`Found ${testDocs.length} test wishlist docs`);

  if (testDocs.length > 0) {
    console.log(`Deleting ${testDocs.length} test wishlist docs...`);
    // Delete in batches of 400
    for (let i = 0; i < testDocs.length; i += 400) {
      const chunk = testDocs.slice(i, i + 400);
      const batch = db.batch();
      for (const doc of chunk) {
        batch.delete(doc.ref);
      }
      await batch.commit();
      console.log(`Deleted batch of ${chunk.length}`);
    }
  }

  console.log('Cleanup completed!');
}

if (process.argv[1]?.includes('cleanup-test-wishlist')) {
  cleanupFirestoreTestWishlist()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
