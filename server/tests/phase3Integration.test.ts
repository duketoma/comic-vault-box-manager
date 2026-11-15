import assert from 'node:assert/strict';
import express from 'express';
import { collectionRouter } from '../routes/collection.ts';
import { masterCatalogRouter } from '../routes/masterCatalog.ts';
import { challengesRouter } from '../routes/challenges.ts';
import { storageUploadRouter } from '../routes/storageUpload.ts';

async function runTests() {
  console.log('Running Phase 3 Express API & Firestore Integration Tests...\n');

  const app = express();
  app.use(express.json());
  app.use(collectionRouter);
  app.use(masterCatalogRouter);
  app.use(challengesRouter);
  app.use(storageUploadRouter);

  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 3000;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // Test 1: GET /api/catalog/snapshot (Master catalog snapshot)
    console.log('[Test 1] Testing GET /api/catalog/snapshot...');
    const snapshotRes = await fetch(`${baseUrl}/api/catalog/snapshot`);
    assert.equal(snapshotRes.status, 200);
    const snapshotData: any = await snapshotRes.json();
    assert.ok(snapshotData.version >= 1);
    assert.ok(snapshotData.comicCount > 0, `Expected comicCount > 0, got ${snapshotData.comicCount}`);
    console.log(`✓ Test 1 Passed: Snapshot returned ${snapshotData.comicCount} master comics.`);

    // Test 2: GET /api/catalog/search
    console.log('[Test 2] Testing GET /api/catalog/search?q=Spider-Man...');
    const searchRes = await fetch(`${baseUrl}/api/catalog/search?q=Spider-Man&limit=5`);
    assert.equal(searchRes.status, 200);
    const searchData: any = await searchRes.json();
    assert.ok(Array.isArray(searchData.comics));
    assert.ok(searchData.comics.length > 0);
    assert.ok(
      searchData.comics[0].title.toLowerCase().includes('spider-man') ||
      searchData.comics[0].seriesName?.toLowerCase().includes('spider-man')
    );
    console.log(`✓ Test 2 Passed: Found ${searchData.comics.length} comics matching "Spider-Man".`);

    // Test 3: GET /api/collection (User-scoped collection & storage boxes)
    console.log('[Test 3] Testing GET /api/collection with mock-admin token...');
    const colRes = await fetch(`${baseUrl}/api/collection`, {
      headers: { Authorization: 'Bearer mock-admin' },
    });
    assert.equal(colRes.status, 200);
    const colData: any = await colRes.json();
    assert.ok(Array.isArray(colData.comics));
    assert.ok(Array.isArray(colData.boxes));
    assert.ok(colData.comics.length > 0, 'Expected user comics to be loaded from Firestore');
    assert.ok(colData.boxes.length > 0, 'Expected user boxes to be loaded from Firestore');
    console.log(`✓ Test 3 Passed: Loaded ${colData.comics.length} user comics and ${colData.boxes.length} storage boxes.`);

    // Test 4: POST /api/sync (Delta Sync verification)
    console.log('[Test 4] Testing POST /api/sync delta sync...');
    const syncRes = await fetch(`${baseUrl}/api/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer mock-admin',
      },
      body: JSON.stringify({
        lastSyncAt: new Date(Date.now() - 60000).toISOString(),
        mutations: [],
      }),
    });
    assert.equal(syncRes.status, 200);
    const syncData: any = await syncRes.json();
    assert.ok(typeof syncData.serverTimestamp === 'string');
    assert.ok(typeof syncData.pushedCount === 'number');
    assert.ok(Array.isArray(syncData.comics));
    assert.ok(Array.isArray(syncData.boxes));
    console.log(`✓ Test 4 Passed: Delta sync responded successfully (pushed: ${syncData.pushedCount}, pulled comics: ${syncData.comics.length}).`);

    // Test 5: GET /api/reading-challenges/history
    console.log('[Test 5] Testing GET /api/reading-challenges/history...');
    const challengesRes = await fetch(`${baseUrl}/api/reading-challenges/history`, {
      headers: { Authorization: 'Bearer mock-admin' },
    });
    assert.equal(challengesRes.status, 200);
    const challengesData: any = await challengesRes.json();
    assert.ok(Array.isArray(challengesData.history));
    console.log(`✓ Test 5 Passed: Loaded ${challengesData.history.length} reading challenges.`);

    console.log('\n====================================================================');
    console.log(' All Phase 3 Integration Tests Passed Successfully!');
    console.log('====================================================================');
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('Phase 3 Integration Test Failed:', err);
  process.exit(1);
});
