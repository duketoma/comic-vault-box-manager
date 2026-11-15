import express from 'express';
import { getFirestoreDb, getFirebaseStorageBucket } from '../firebaseAdmin.ts';
import { optionalAuth, requireAdmin } from '../middleware/auth.ts';

export const masterCatalogRouter = express.Router();

/**
 * GET /api/catalog/snapshot
 * Serves the pre-compiled Master Catalog snapshot from Firebase Cloud Storage
 * (or generates on-the-fly from Firestore if not yet uploaded) for zero-read client hydration.
 */
masterCatalogRouter.get('/api/catalog/snapshot', optionalAuth, async (_req, res) => {
  try {
    const bucket = getFirebaseStorageBucket();
    const file = bucket.file('catalog/master_catalog_snapshot.json');
    const [exists] = await file.exists();

    if (exists) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
      return file.createReadStream().pipe(res);
    }

    // Fallback: build from Firestore if snapshot file hasn't been generated yet
    const db = getFirestoreDb();
    const [masterSnap, seriesSnap] = await Promise.all([
      db.collection('master_comics').get(),
      db.collection('series_issue_totals').get(),
    ]);

    const snapshot = {
      version: 1,
      generatedAt: new Date().toISOString(),
      comicCount: masterSnap.size,
      seriesTotalCount: seriesSnap.size,
      comics: masterSnap.docs.map((d) => d.data()),
      seriesTotals: seriesSnap.docs.map((d) => d.data()),
    };

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.json(snapshot);
  } catch (err: any) {
    console.error('[MasterCatalog] Snapshot load failed:', err.message);
    res.status(500).json({ error: `Unable to load master catalog snapshot: ${err.message}` });
  }
});

/**
 * GET /api/catalog/search?q=...
 * Performs search across canonical master_comics in Cloud Firestore.
 */
masterCatalogRouter.get('/api/catalog/search', optionalAuth, async (req, res) => {
  try {
    const query = String(req.query.q || '').trim().toLowerCase();
    if (!query) {
      return res.json({ comics: [], count: 0 });
    }

    const db = getFirestoreDb();
    const snap = await db.collection('master_comics').limit(300).get();

    const matches = snap.docs
      .map((d) => d.data())
      .filter((c: any) => {
        const title = (c.title || '').toLowerCase();
        const fullTitle = (c.fullTitle || '').toLowerCase();
        const seriesName = (c.seriesName || '').toLowerCase();
        const publisher = (c.publisher || '').toLowerCase();
        const issue = String(c.issueNumber || '').toLowerCase();

        return (
          title.includes(query) ||
          fullTitle.includes(query) ||
          seriesName.includes(query) ||
          publisher.includes(query) ||
          issue === query
        );
      });

    res.json({
      comics: matches.slice(0, 50),
      count: matches.length,
    });
  } catch (err: any) {
    console.error('[MasterCatalog] Search failed:', err.message);
    res.status(500).json({ error: `Master catalog search failed: ${err.message}` });
  }
});

/**
 * GET /api/catalog/:id
 * Fetches single canonical comic from master_comics.
 */
masterCatalogRouter.get('/api/catalog/:id', optionalAuth, async (req, res) => {
  try {
    const db = getFirestoreDb();
    const doc = await db.collection('master_comics').doc(req.params.id).get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Comic not found in Master Catalog.' });
    }
    res.json(doc.data());
  } catch (err: any) {
    res.status(500).json({ error: `Failed to load comic: ${err.message}` });
  }
});

/**
 * POST /api/catalog/direct-edit (Admin only)
 * Instant direct edit of canonical master comic bibliographic metadata.
 */
masterCatalogRouter.post('/api/catalog/direct-edit', requireAdmin, async (req, res) => {
  try {
    const { id, updates } = req.body;
    if (!id || !updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'id and updates object are required.' });
    }

    const db = getFirestoreDb();
    const docRef = db.collection('master_comics').doc(id);
    const existing = await docRef.get();
    if (!existing.exists) {
      return res.status(404).json({ error: 'Comic not found in Master Catalog.' });
    }

    const updatedData = {
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await docRef.set(updatedData, { merge: true });
    res.json({ success: true, comic: { ...existing.data(), ...updatedData } });
  } catch (err: any) {
    res.status(500).json({ error: `Direct edit failed: ${err.message}` });
  }
});
