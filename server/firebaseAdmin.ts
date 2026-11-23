import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { initializeApp, getApps, getApp, cert, applicationDefault, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAuth, Auth } from 'firebase-admin/auth';
let firebaseAppletConfig: Record<string, any> = {};
try {
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    firebaseAppletConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }
} catch {
  // fallback if config file missing
}

dotenv.config({ path: ['.env.local', '.env'] });

export const FIREBASE_PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID || firebaseAppletConfig.projectId || 'gen-lang-client-0874195230';

export const FIRESTORE_DATABASE_ID =
  process.env.FIRESTORE_DATABASE_ID ||
  firebaseAppletConfig.firestoreDatabaseId ||
  'ai-studio-comicvaultboxman-f278f9f7-14a3-4b40-8c16-e78aa138625d';

export const FIREBASE_STORAGE_BUCKET =
  process.env.FIREBASE_STORAGE_BUCKET ||
  firebaseAppletConfig.storageBucket ||
  'gen-lang-client-0874195230.firebasestorage.app';

/**
 * Parses FIREBASE_SERVICE_ACCOUNT_KEY from .env.local if provided.
 * Supports:
 *  1. File path to a serviceAccountKey.json file
 *  2. Raw JSON string ("{ \"type\": \"service_account\", ... }")
 *  3. Base64-encoded JSON string
 */
function isGcpManagedRuntime(): boolean {
  return Boolean(
    (process.env.K_SERVICE || '').trim() ||
    (process.env.FUNCTION_TARGET || '').trim() ||
    (process.env.GOOGLE_CLOUD_PROJECT || '').trim()
  );
}

function resolveServiceAccountCredential() {
  const rawKey = (process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '').trim();
  if (!rawKey) {
    const gac = (process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim();
    if (gac && fs.existsSync(path.resolve(gac))) {
      return applicationDefault();
    }
    if (isGcpManagedRuntime()) {
      return applicationDefault();
    }
    return null;
  }

  // Case 1: Inline JSON string
  if (rawKey.startsWith('{')) {
    const parsed = JSON.parse(rawKey);
    return cert(parsed);
  }

  // Case 2: Path to JSON file on disk
  const resolvedPath = path.resolve(rawKey);
  if (fs.existsSync(resolvedPath)) {
    const fileContent = fs.readFileSync(resolvedPath, 'utf8');
    return cert(JSON.parse(fileContent));
  }

  // Case 3: Base64-encoded JSON string
  try {
    const decoded = Buffer.from(rawKey, 'base64').toString('utf8');
    if (decoded.trim().startsWith('{')) {
      return cert(JSON.parse(decoded));
    }
  } catch {
    // Fall through
  }

  throw new Error(
    'FIREBASE_SERVICE_ACCOUNT_KEY could not be parsed as a file path, JSON object, or base64 JSON string.'
  );
}

/**
 * Returns true when Firebase Admin credentials or a Firestore emulator are configured,
 * allowing server routes and scripts to fall back cleanly to PostgreSQL when absent.
 */
export function isFirestoreConfigured(): boolean {
  if ((process.env.FIRESTORE_EMULATOR_HOST || '').trim()) {
    return true;
  }
  try {
    return resolveServiceAccountCredential() !== null;
  } catch {
    return false;
  }
}

let cachedApp: App | null = null;
let cachedFirestore: Firestore | null = null;

export function getFirebaseAdminApp(): App {
  if (cachedApp) return cachedApp;
  if (getApps().length > 0) {
    cachedApp = getApp();
    return cachedApp;
  }

  const hasEmulator = Boolean((process.env.FIRESTORE_EMULATOR_HOST || '').trim());
  const credential = resolveServiceAccountCredential();
  if (!credential && !hasEmulator) {
    throw new Error('Firebase Admin credentials are not configured.');
  }

  cachedApp = initializeApp(
    credential
      ? {
          credential,
          projectId: FIREBASE_PROJECT_ID,
          storageBucket: FIREBASE_STORAGE_BUCKET,
        }
      : {
          projectId: FIREBASE_PROJECT_ID,
          storageBucket: FIREBASE_STORAGE_BUCKET,
        }
  );
  return cachedApp;
}

export function getFirestoreDb(): Firestore {
  if (cachedFirestore) return cachedFirestore;
  const app = getFirebaseAdminApp();
  const db = getFirestore(app, FIRESTORE_DATABASE_ID);
  try {
    db.settings({ ignoreUndefinedProperties: true });
  } catch {
    // settings() may have already been called in watch mode
  }
  cachedFirestore = db;
  return db;
}

export function getFirebaseStorageBucket() {
  const app = getFirebaseAdminApp();
  return getStorage(app).bucket(FIREBASE_STORAGE_BUCKET);
}

export function getFirebaseAdminAuth(): Auth {
  const app = getFirebaseAdminApp();
  return getAuth(app);
}

export function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS || '';
  return raw
    .split(/[,;]/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isEmailAdmin(email?: string | null): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return getAdminEmails().includes(normalized);
}
