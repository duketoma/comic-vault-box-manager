import express from 'express';
import sharp from 'sharp';
import { getFirestoreDb, getFirebaseStorageBucket } from '../firebaseAdmin.ts';
import { optionalAuth, requireAuth } from '../middleware/auth.ts';
import { quotaMiddleware } from '../middleware/quota.ts';
import {
  FRONT_COVER_MAX_WIDTH,
  FRONT_COVER_WEBP_QUALITY,
  FULL_COVER_MAX_WIDTH,
  FULL_COVER_WEBP_QUALITY,
} from '../services/webpMasterUploadPipeline.ts';

export const storageUploadRouter = express.Router();

storageUploadRouter.use(optionalAuth);
storageUploadRouter.use(quotaMiddleware);

const TIER_STORAGE_LIMITS: Record<string, number> = {
  free: 0,
  collector: 100 * 1024 * 1024, // 100 MB
  archivist: 500 * 1024 * 1024, // 500 MB
};

/**
 * Helper to parse a base64 data URI into a Buffer.
 */
function parseBase64Image(dataUriOrBase64: string): Buffer {
  const matches = dataUriOrBase64.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
  const rawBase64 = matches ? matches[2] : dataUriOrBase64;
  return Buffer.from(rawBase64, 'base64');
}

/**
 * POST /api/storage/upload-cover
 * Uploads a front cover or full wraparound cover.
 * - Admin can upload directly to master catalog (covers/master/*)
 * - VIP users can upload personal overrides (covers/users/{uid}/*)
 */
storageUploadRouter.post('/api/storage/upload-cover', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const {
      comicId,
      imageBufferBase64,
      targetType = 'front', // 'front' | 'full'
      isMasterCatalog = false,
      preservePersonalOverride = true,
      highResSourceUrl,
    } = req.body || {};

    if (!comicId) {
      return res.status(400).json({ error: 'comicId is required.' });
    }
    if (!imageBufferBase64 || typeof imageBufferBase64 !== 'string') {
      return res.status(400).json({ error: 'imageBufferBase64 string is required.' });
    }

    const isFull = targetType === 'full';
    const inputBuffer = parseBase64Image(imageBufferBase64);

    // Compress to target WebP spec
    const maxWidth = isFull ? FULL_COVER_MAX_WIDTH : FRONT_COVER_MAX_WIDTH;
    const quality = isFull ? FULL_COVER_WEBP_QUALITY : FRONT_COVER_WEBP_QUALITY;

    const compressedWebpBuffer = await sharp(inputBuffer)
      .resize({
        width: maxWidth,
        withoutEnlargement: true,
        fit: 'inside',
      })
      .webp({ quality, effort: 4 })
      .toBuffer();

    const db = getFirestoreDb();
    const bucket = getFirebaseStorageBucket();
    const nowIso = new Date().toISOString();

    // Strategy 1: Master Catalog Cover Upload (Admin Only)
    if (isMasterCatalog) {
      if (user.role !== 'admin') {
        return res.status(403).json({ error: 'Only admins can directly publish master catalog covers.' });
      }

      const folder = isFull ? 'covers/master-full' : 'covers/master';
      const storagePath = `${folder}/${comicId}.webp`;
      const file = bucket.file(storagePath);

      await file.save(compressedWebpBuffer, {
        resumable: false,
        metadata: {
          contentType: 'image/webp',
          cacheControl: 'public, max-age=31536000, immutable',
        },
      });

      const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(
        storagePath
      )}?alt=media`;

      // Update canonical master_comics
      const masterRef = db.collection('master_comics').doc(comicId);
      const masterUpdate: Record<string, any> = {
        updatedAt: nowIso,
        [isFull ? 'coverImageFull' : 'coverImage']: publicUrl,
      };
      await masterRef.set(masterUpdate, { merge: true });

      // Update the user's comic doc with masterCoverImage
      const userComicRef = db.collection('users').doc(user.uid).collection('comics').doc(comicId);
      const userComicSnap = await userComicRef.get();
      const existingUserData = userComicSnap.exists ? userComicSnap.data() : null;

      const userComicUpdate: Record<string, any> = {
        updatedAt: nowIso,
        [isFull ? 'masterCoverImageFull' : 'masterCoverImage']: publicUrl,
      };

      // If Admin has highResSourceUrl or already has an override, preserve it
      if (highResSourceUrl) {
        userComicUpdate[isFull ? 'coverImageFullOverride' : 'coverImageOverride'] = highResSourceUrl;
      } else if (!preservePersonalOverride && existingUserData) {
        // Explicitly clear override if requested
        userComicUpdate[isFull ? 'coverImageFullOverride' : 'coverImageOverride'] = null;
      }

      await userComicRef.set(userComicUpdate, { merge: true });

      return res.json({
        success: true,
        isMaster: true,
        storagePath,
        url: publicUrl,
        sizeBytes: compressedWebpBuffer.length,
      });
    }

    // Strategy 2: VIP Personal High-Quality Cover Override (Tier 1+ VIP & Admin)
    const tierLimit = TIER_STORAGE_LIMITS[user.vipTier] || 0;
    if (user.role !== 'admin' && tierLimit === 0) {
      return res.status(403).json({
        error: 'Personal cloud image hosting requires Collector VIP (Tier 1) or Archivist VIP (Tier 2).',
      });
    }

    // Check user's current storage usage
    const userDocRef = db.collection('users').doc(user.uid);
    const userDocSnap = await userDocRef.get();
    const currentBytes = Number(userDocSnap.data()?.storageBytesUsed || 0);

    if (user.role !== 'admin' && currentBytes + compressedWebpBuffer.length > tierLimit) {
      return res.status(413).json({
        error: `Storage quota exceeded for your ${user.vipTier} tier (${(tierLimit / (1024 * 1024)).toFixed(
          0
        )} MB limit). Please upgrade or delete existing personal uploads.`,
      });
    }

    const storagePath = `covers/users/${user.uid}/${comicId}${isFull ? '-full' : ''}.webp`;
    const file = bucket.file(storagePath);

    await file.save(compressedWebpBuffer, {
      resumable: false,
      metadata: {
        contentType: 'image/webp',
        cacheControl: 'private, max-age=31536000, immutable',
      },
    });

    const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(
      storagePath
    )}?alt=media`;

    // Update user's comic doc with coverImageOverride
    const userComicRef = userDocRef.collection('comics').doc(comicId);
    const overrideKey = isFull ? 'coverImageFullOverride' : 'coverImageOverride';
    await userComicRef.set(
      {
        [overrideKey]: publicUrl,
        updatedAt: nowIso,
      },
      { merge: true }
    );

    // Increment storageBytesUsed
    await userDocRef.set(
      {
        storageBytesUsed: currentBytes + compressedWebpBuffer.length,
        updatedAt: nowIso,
      },
      { merge: true }
    );

    return res.json({
      success: true,
      isPersonalOverride: true,
      storagePath,
      url: publicUrl,
      sizeBytes: compressedWebpBuffer.length,
    });
  } catch (error: any) {
    console.error('Upload cover failed:', error.message);
    return res.status(500).json({ error: `Upload cover failed: ${error.message}` });
  }
});

/**
 * POST /api/storage/revert-cover
 * Reverts a comic to using the canonical master catalog cover by clearing the personal override.
 */
storageUploadRouter.post('/api/storage/revert-cover', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { comicId, targetType = 'front' } = req.body || {};

    if (!comicId) {
      return res.status(400).json({ error: 'comicId is required.' });
    }

    const isFull = targetType === 'full';
    const db = getFirestoreDb();
    const userComicRef = db.collection('users').doc(user.uid).collection('comics').doc(comicId);
    const snap = await userComicRef.get();

    if (!snap.exists) {
      return res.status(404).json({ error: 'Comic not found in your collection.' });
    }

    const nowIso = new Date().toISOString();
    const overrideKey = isFull ? 'coverImageFullOverride' : 'coverImageOverride';

    await userComicRef.set(
      {
        [overrideKey]: null,
        updatedAt: nowIso,
      },
      { merge: true }
    );

    return res.json({ success: true, revertedKey: overrideKey });
  } catch (error: any) {
    console.error('Revert cover failed:', error.message);
    return res.status(500).json({ error: `Revert cover failed: ${error.message}` });
  }
});
