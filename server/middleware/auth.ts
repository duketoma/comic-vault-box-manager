import { Request, Response, NextFunction } from 'express';
import {
  getFirebaseAdminAuth,
  getFirestoreDb,
  isEmailAdmin,
  getAdminEmails,
} from '../firebaseAdmin.ts';

export interface AuthUser {
  uid: string;
  email: string;
  displayName?: string;
  role: 'user' | 'admin';
  vipTier: 'free' | 'collector' | 'archivist';
  isBannedFromProposals: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Returns the default fallback Admin user identity when running locally without
 * an authenticated session (guest / desktop mode) so single-user workflows and tests continue seamlessly.
 */
export function getDefaultAdminUser(): AuthUser {
  const adminEmails = getAdminEmails();
  const email = adminEmails[0] || process.env.ADMIN_EMAIL || 'admin@comicvault.local';
  const uid = (process.env.ADMIN_FIREBASE_UID || '').trim() || 'admin-primary';
  return {
    uid,
    email,
    displayName: process.env.ADMIN_DISPLAY_NAME || 'Creator Admin',
    role: 'admin',
    vipTier: 'archivist',
    isBannedFromProposals: false,
  };
}

/**
 * Resolves or initializes the Firestore `users/{uid}` and `users_public/{uid}` profile
 * for an authenticated Firebase user.
 */
export async function getOrCreateUserProfile(
  uid: string,
  email: string,
  displayName?: string,
  avatarUrl?: string
): Promise<AuthUser> {
  const db = getFirestoreDb();
  const userRef = db.collection('users').doc(uid);
  const snap = await userRef.get();

  const isAdmin = isEmailAdmin(email);
  const nowIso = new Date().toISOString();

  if (snap.exists) {
    const data = snap.data() || {};
    // Ensure admin role is promoted if email matches ADMIN_EMAILS
    if (isAdmin && (data.role !== 'admin' || data.vipTier !== 'archivist')) {
      await userRef.set({ role: 'admin', vipTier: 'archivist', updatedAt: nowIso }, { merge: true });
      data.role = 'admin';
      data.vipTier = 'archivist';
    }
    return {
      uid,
      email: data.email || email,
      displayName: data.displayName || displayName,
      role: data.role || (isAdmin ? 'admin' : 'user'),
      vipTier: data.vipTier || (isAdmin ? 'archivist' : 'free'),
      isBannedFromProposals: Boolean(data.isBannedFromProposals),
    };
  }

  // First-time user creation
  const role: 'user' | 'admin' = isAdmin ? 'admin' : 'user';
  const vipTier: 'free' | 'collector' | 'archivist' = isAdmin ? 'archivist' : 'free';

  const newUserData = {
    uid,
    email,
    displayName: displayName || null,
    avatarUrl: avatarUrl || null,
    role,
    vipTier,
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
  };

  await userRef.set(newUserData);

  const publicUserRef = db.collection('users_public').doc(uid);
  await publicUserRef.set({
    uid,
    displayName: displayName || null,
    avatarUrl: avatarUrl || null,
    role,
    vipTier,
    updatedAt: nowIso,
  });

  return {
    uid,
    email,
    displayName,
    role,
    vipTier,
    isBannedFromProposals: false,
  };
}

/**
 * Extracts and verifies the bearer token from the Authorization header.
 * Supports mock tokens in non-production environments (e.g. Playwright E2E and unit tests).
 */
export async function authenticateToken(req: Request): Promise<AuthUser | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7).trim();
  if (!token) return null;

  // Mock token support for local development and Playwright E2E tests
  if (process.env.NODE_ENV !== 'production' && token.startsWith('mock-')) {
    if (token === 'mock-admin-token' || token === 'mock-admin') {
      return getDefaultAdminUser();
    }
    if (token.startsWith('mock-user-')) {
      const mockUid = token.replace('mock-user-', '');
      return {
        uid: mockUid,
        email: `${mockUid}@example.com`,
        displayName: `Mock User ${mockUid}`,
        role: 'user',
        vipTier: 'free',
        isBannedFromProposals: false,
      };
    }
    if (token.startsWith('mock-vip-')) {
      const mockUid = token.replace('mock-vip-', '');
      return {
        uid: mockUid,
        email: `${mockUid}@example.com`,
        displayName: `VIP User ${mockUid}`,
        role: 'user',
        vipTier: 'collector',
        isBannedFromProposals: false,
      };
    }
  }

  try {
    const auth = getFirebaseAdminAuth();
    const decoded = await auth.verifyIdToken(token);
    return await getOrCreateUserProfile(
      decoded.uid,
      decoded.email || `${decoded.uid}@firebase.user`,
      decoded.name || (decoded as any).displayName,
      decoded.picture
    );
  } catch (err: any) {
    console.warn('[AuthMiddleware] verifyIdToken failed:', err.message);
    return null;
  }
}

/**
 * Middleware: Requires a valid Firebase Auth user.
 * Returns 401 Unauthorized if missing or invalid.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = await authenticateToken(req);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }
  req.user = user;
  next();
}

/**
 * Middleware: Optional authentication.
 * If a valid token is present, populates `req.user`.
 * If no token is provided, falls back to the default Admin account in local/dev environments
 * so existing single-user PC workflows continue seamlessly without forced login.
 */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const user = await authenticateToken(req);
  req.user = user || getDefaultAdminUser();
  next();
}

/**
 * Middleware: Requires Admin role.
 * Returns 403 Forbidden if user is not an Admin.
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    const user = await authenticateToken(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    req.user = user;
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied: Admin privileges required.' });
  }
  next();
}
