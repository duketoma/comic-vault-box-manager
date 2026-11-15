import { Request, Response, NextFunction } from 'express';
import { getFirestoreDb } from '../firebaseAdmin.ts';

export interface TierLimits {
  dailyReads: number;
  dailyWrites: number;
}

export const TIER_LIMITS: Record<string, TierLimits> = {
  free: { dailyReads: 100, dailyWrites: 50 },
  collector: { dailyReads: 1000, dailyWrites: 500 },
  archivist: { dailyReads: Infinity, dailyWrites: Infinity },
};

/**
 * Returns the next UTC midnight ISO string when daily quotas reset.
 */
export function getNextUtcMidnightIso(now = new Date()): string {
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0));
  return tomorrow.toISOString();
}

/**
 * Middleware: Tracks daily read/write requests on `users/{uid}.dailyUsage`
 * and enforces soft-cap bounds according to the user's VIP tier.
 */
export async function quotaMiddleware(req: Request, res: Response, next: NextFunction) {
  const user = req.user;
  if (!user) {
    return next();
  }

  // Admins and Archivist tier have unlimited access, and auth check is exempt
  if (user.role === 'admin' || user.vipTier === 'archivist' || req.path === '/api/auth/me') {
    return next();
  }

  const limits = TIER_LIMITS[user.vipTier] || TIER_LIMITS.free;
  const isWrite = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method.toUpperCase());
  const now = new Date();
  const todayUtc = now.toISOString().slice(0, 10); // YYYY-MM-DD in UTC

  try {
    const db = getFirestoreDb();
    const userRef = db.collection('users').doc(user.uid);

    let quotaExceeded = false;
    let currentCount = 0;

    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(userRef);
      if (!snap.exists) return;

      const data = snap.data() || {};
      const usage = data.dailyUsage || {};
      const isNewDay = usage.usageDate !== todayUtc;

      let readsCount = isNewDay ? 0 : Number(usage.readsCount || 0);
      let writesCount = isNewDay ? 0 : Number(usage.writesCount || 0);

      if (isWrite) {
        if (writesCount >= limits.dailyWrites) {
          quotaExceeded = true;
          currentCount = writesCount;
          return;
        }
        writesCount++;
        currentCount = writesCount;
      } else {
        readsCount++;
        currentCount = readsCount;
      }

      transaction.update(userRef, {
        dailyUsage: {
          usageDate: todayUtc,
          readsCount,
          writesCount,
        },
      });
    });

    if (quotaExceeded && isWrite) {
      return res.status(429).json({
        error: 'Daily write quota reached.',
        tier: user.vipTier,
        limit: limits.dailyWrites,
        currentUsage: currentCount,
        resetsAt: getNextUtcMidnightIso(now),
        offlineAllowed: true,
      });
    }

    if (!isWrite && currentCount > limits.dailyReads) {
      res.setHeader('X-Quota-Warning', 'Daily read quota exceeded');
    }

    next();
  } catch (err: any) {
    console.warn('[QuotaMiddleware] Failed to update quota, permitting request:', err.message);
    next();
  }
}
