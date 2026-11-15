import express from 'express';
import { pool, databaseErrorMessage, rowToComic } from '../db';
import {
  lookupComicMarketValue,
  valuationBatchManager,
  ComicValuationInput,
} from '../services/valuationEngine';
import { ValuationScope } from '../../src/types';
import { getFirestoreDb } from '../firebaseAdmin.ts';
import { optionalAuth } from '../middleware/auth.ts';
import { quotaMiddleware } from '../middleware/quota.ts';

export const valuationRouter = express.Router();

valuationRouter.use(optionalAuth);
valuationRouter.use(quotaMiddleware);

// --- Single-comic live quote (works before or after saving a comic) ---
valuationRouter.post('/api/valuation/lookup', async (req, res) => {
  try {
    const body = req.body || {};
    const title = String(body.title || body.seriesName || '').trim();
    if (!title) {
      return res.status(400).json({ error: 'Comic title or seriesName is required for valuation lookup.' });
    }

    const input: ComicValuationInput = {
      id: body.id ? String(body.id) : undefined,
      title,
      seriesName: body.seriesName ? String(body.seriesName) : undefined,
      issueNumber: String(body.issueNumber || '1').trim() || '1',
      volume: body.volume ? String(body.volume) : undefined,
      publicationYear: body.publicationYear ? Number(body.publicationYear) : undefined,
      publisher: body.publisher ? String(body.publisher) : undefined,
      format: body.format ? String(body.format) : 'Single Issue',
      condition: body.condition ? String(body.condition) : 'Near Mint',
      purchasePrice: body.purchasePrice !== undefined ? Number(body.purchasePrice) : undefined,
      estimatedValue: body.estimatedValue !== undefined ? Number(body.estimatedValue) : undefined,
      tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
      notes: body.notes ? String(body.notes) : undefined,
    };

    const bypassCache = Boolean(body.bypassCache || body.forceRefresh);
    const valuation = await lookupComicMarketValue(input, { bypassCache });
    return res.json({ valuation });
  } catch (error) {
    const detail = databaseErrorMessage(error);
    console.error('Valuation lookup error:', detail);
    return res.status(500).json({ error: `Failed to lookup comic value: ${detail}` });
  }
});

// --- Single-comic lookup + immediate persistence (Firestore + PostgreSQL) ---
valuationRouter.post('/api/valuation/comics/:id/refresh', async (req, res) => {
  try {
    const comicId = req.params.id;
    const force = Boolean(req.body?.force);
    const uid = req.user?.uid;

    let existingComic: any = null;
    let isLocked = false;
    let usingFirestore = false;

    // Check Cloud Firestore first if available
    try {
      const db = getFirestoreDb();
      if (uid) {
        const docRef = db.collection('users').doc(uid).collection('comics').doc(comicId);
        const snap = await docRef.get();
        if (snap.exists) {
          existingComic = snap.data();
          isLocked = Boolean(existingComic.lockEstimatedValue || existingComic.lock_estimated_value);
          usingFirestore = true;
        }
      }
    } catch {
      // Fall through to PostgreSQL check
    }

    // Fall back to PostgreSQL if not found in Firestore
    if (!existingComic && pool) {
      const existingRes = await pool.query('SELECT * FROM comic_books WHERE id = $1', [comicId]);
      if (existingRes.rows.length > 0) {
        existingComic = rowToComic(existingRes.rows[0]);
        isLocked = Boolean(existingComic.lockEstimatedValue);
      }
    }

    if (!existingComic) {
      return res.status(404).json({ error: 'Comic not found.' });
    }

    if (isLocked && !force) {
      return res.status(409).json({
        error: 'Estimated value is locked for this comic. Unlock it first to refresh.',
      });
    }

    const valuation = await lookupComicMarketValue(
      {
        id: String(existingComic.id),
        title: String(existingComic.title || ''),
        seriesName: existingComic.seriesName ? String(existingComic.seriesName) : undefined,
        issueNumber: String(existingComic.issueNumber || '1'),
        volume: existingComic.volume ? String(existingComic.volume) : undefined,
        publicationYear: existingComic.publicationYear ? Number(existingComic.publicationYear) : undefined,
        publisher: existingComic.publisher ? String(existingComic.publisher) : undefined,
        format: existingComic.format ? String(existingComic.format) : 'Single Issue',
        condition: existingComic.condition ? String(existingComic.condition) : 'Near Mint',
        purchasePrice:
          existingComic.purchasePrice !== undefined ? Number(existingComic.purchasePrice) : undefined,
        estimatedValue:
          existingComic.estimatedValue !== undefined ? Number(existingComic.estimatedValue) : undefined,
        tags: Array.isArray(existingComic.tags) ? (existingComic.tags as string[]) : [],
        notes: existingComic.notes ? String(existingComic.notes) : undefined,
      },
      { bypassCache: true }
    );

    const nowIso = new Date().toISOString();

    // Update in Firestore
    if (usingFirestore && uid) {
      const db = getFirestoreDb();
      const userRef = db.collection('users').doc(uid);
      const comicRef = userRef.collection('comics').doc(comicId);
      const updates = {
        previousEstimatedValue: existingComic.estimatedValue ?? existingComic.previousEstimatedValue ?? null,
        estimatedValue: valuation.estimatedValue,
        valueUpdatedAt: valuation.updatedAt || nowIso,
        valueSource: valuation.source,
        updatedAt: nowIso,
      };
      await comicRef.set(updates, { merge: true });

      // If user is admin, also update canonical master_comics
      if (req.user?.role === 'admin') {
        const masterRef = db.collection('master_comics').doc(comicId);
        await masterRef.set(
          {
            estimatedValue: valuation.estimatedValue,
            valueUpdatedAt: valuation.updatedAt || nowIso,
            valueSource: valuation.source,
            updatedAt: nowIso,
          },
          { merge: true }
        );
      }
      existingComic = { ...existingComic, ...updates };
    }

    // Also update PostgreSQL if pool is active
    if (pool) {
      try {
        const updateRes = await pool.query(
          `UPDATE comic_books
           SET previous_estimated_value = COALESCE(estimated_value, previous_estimated_value),
               estimated_value = $1,
               value_updated_at = $2,
               value_source = $3,
               updated_at = NOW()
           WHERE id = $4
           RETURNING *`,
          [valuation.estimatedValue, valuation.updatedAt, valuation.source, comicId]
        );
        if (updateRes.rows.length > 0 && !usingFirestore) {
          existingComic = rowToComic(updateRes.rows[0]);
        }
      } catch (err: any) {
        console.warn('[Valuation] Postgres update skipped:', err.message);
      }
    }

    return res.json({ valuation, comic: existingComic });
  } catch (error) {
    const detail = databaseErrorMessage(error);
    console.error('Single comic valuation refresh failed:', detail);
    return res.status(500).json({ error: `Unable to refresh comic value: ${detail}` });
  }
});

// --- Batch & Scheduler Status ---
valuationRouter.get('/api/valuation/status', async (_req, res) => {
  try {
    const status = await valuationBatchManager.getStatus(pool);
    return res.json(status);
  } catch (error) {
    const detail = databaseErrorMessage(error);
    return res.status(500).json({ error: `Unable to read valuation status: ${detail}` });
  }
});

// --- Start Rolling Batch Valuation ---
valuationRouter.post('/api/valuation/batch/start', async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: 'PostgreSQL database connection required for rolling batch valuation.' });
  }
  try {
    const scope = (req.body?.scope as ValuationScope) || 'all_stale';
    const limit = req.body?.limit ? Number(req.body.limit) : undefined;
    const stepDelayMs = req.body?.stepDelayMs ? Number(req.body.stepDelayMs) : undefined;

    const status = await valuationBatchManager.startBatch(pool, {
      scope,
      limit,
      stepDelayMs,
    });
    return res.json(status);
  } catch (error) {
    const detail = databaseErrorMessage(error);
    console.error('Batch valuation start failed:', detail);
    return res.status(500).json({ error: `Unable to start batch valuation: ${detail}` });
  }
});

// --- Stop Rolling Batch Valuation ---
valuationRouter.post('/api/valuation/batch/stop', async (_req, res) => {
  try {
    valuationBatchManager.stopBatch();
    const status = await valuationBatchManager.getStatus(pool);
    return res.json(status);
  } catch (error) {
    const detail = databaseErrorMessage(error);
    return res.status(500).json({ error: `Unable to stop batch valuation: ${detail}` });
  }
});

// --- Configure Periodic Scheduler ---
valuationRouter.post('/api/valuation/scheduler', async (req, res) => {
  try {
    valuationBatchManager.configureScheduler({
      schedulerEnabled: req.body?.schedulerEnabled,
      staleThresholdDays: req.body?.staleThresholdDays !== undefined ? Number(req.body.staleThresholdDays) : undefined,
      dailyBatchLimit: req.body?.dailyBatchLimit !== undefined ? Number(req.body.dailyBatchLimit) : undefined,
    });
    const status = await valuationBatchManager.getStatus(pool);
    return res.json(status);
  } catch (error) {
    const detail = databaseErrorMessage(error);
    return res.status(500).json({ error: `Unable to update scheduler settings: ${detail}` });
  }
});
