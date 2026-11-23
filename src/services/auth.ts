import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  signInWithCredential,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/drive.readonly');

const TOKEN_KEY = 'comic_vault_gdrive_access_token';
const TOKEN_EXP_KEY = 'comic_vault_gdrive_access_token_exp';
const TOKEN_TTL_MS = 50 * 60 * 1000;
const POPUP_MAX_OPEN_MS = 120_000;
const POST_FOCUS_GRACE_MS = 8_000;

let isSigningIn = false;
let cachedAccessToken: string | null = null;

const readStoredAccessToken = (): string | null => {
  if (cachedAccessToken) return cachedAccessToken;
  if (typeof window === 'undefined') return null;

  try {
    const sessionToken = sessionStorage.getItem(TOKEN_KEY);
    if (sessionToken) {
      const expRaw = sessionStorage.getItem(TOKEN_EXP_KEY) || localStorage.getItem(TOKEN_EXP_KEY);
      if (!expRaw || (Number.isFinite(Number(expRaw)) && Date.now() < Number(expRaw))) {
        cachedAccessToken = sessionToken;
        return sessionToken;
      }
    }
  } catch {
    // Ignore sessionStorage errors
  }

  try {
    const localToken = localStorage.getItem(TOKEN_KEY);
    const localExpRaw = localStorage.getItem(TOKEN_EXP_KEY);
    if (localToken && localExpRaw && Number.isFinite(Number(localExpRaw)) && Date.now() < Number(localExpRaw)) {
      cachedAccessToken = localToken;
      try {
        sessionStorage.setItem(TOKEN_KEY, localToken);
        sessionStorage.setItem(TOKEN_EXP_KEY, localExpRaw);
      } catch {
        // Ignore sessionStorage sync errors
      }
      return localToken;
    }
    if (localToken || localExpRaw) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_EXP_KEY);
    }
  } catch {
    // Ignore localStorage errors
  }

  return null;
};

const writeStoredAccessToken = (token: string): void => {
  cachedAccessToken = token;
  if (typeof window === 'undefined') return;
  const expiresAt = String(Date.now() + TOKEN_TTL_MS);

  try {
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(TOKEN_EXP_KEY, expiresAt);
  } catch {
    // Ignore sessionStorage errors
  }

  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(TOKEN_EXP_KEY, expiresAt);
  } catch {
    // Ignore localStorage errors
  }
};

export const clearCachedAccessToken = () => {
  cachedAccessToken = null;
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(TOKEN_EXP_KEY);
    } catch {
      // Ignore storage errors
    }
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_EXP_KEY);
    } catch {
      // Ignore storage errors
    }
  }
};

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  if (typeof window !== 'undefined' && (window as any).__MOCK_AUTH__) {
    const mock = (window as any).__MOCK_AUTH__;
    cachedAccessToken = mock.token;
    if (onAuthSuccess) onAuthSuccess(mock.user, mock.token);
    return () => {};
  }

  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      const token = readStoredAccessToken();
      if (token) {
        if (onAuthSuccess) onAuthSuccess(user, token);
      } else if (!isSigningIn) {
        // If logged in via persistent session without cached OAuth token, user can click Connect Drive
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      clearCachedAccessToken();
      if (onAuthFailure) onAuthFailure();
    }
  });
};

/**
 * Wraps window.open during Firebase popup sign-in so Chrome COOP headers on
 * accounts.google.com (which sever window.opener and cause popup.closed to read true)
 * do not trigger Firebase Auth's 8-second popup-closed-by-user timeout prematurely.
 */
const withCoopSafePopup = async <T>(fn: () => Promise<T>): Promise<T> => {
  if (typeof window === 'undefined') {
    return fn();
  }

  const originalOpen = window.open.bind(window);
  let sawUnfocused = !document.hasFocus();
  let focusReturnedAt: number | null = null;

  const handleBlur = () => {
    sawUnfocused = true;
    focusReturnedAt = null;
  };

  const handleFocus = () => {
    if (sawUnfocused) {
      focusReturnedAt = Date.now();
    }
  };

  window.addEventListener('blur', handleBlur);
  window.addEventListener('focus', handleFocus);

  window.open = ((url?: string | URL, target?: string, features?: string) => {
    const win = originalOpen(url, target, features);
    const urlStr = typeof url === 'string' ? url : url ? String(url) : '';
    if (!win || !urlStr.includes('/__/auth/handler')) {
      return win;
    }

    const openedAt = Date.now();
    sawUnfocused = !document.hasFocus();
    focusReturnedAt = null;

    return new Proxy(win, {
      get(targetWin, prop) {
        if (prop === 'closed') {
          if (!document.hasFocus()) {
            sawUnfocused = true;
          }
          const withinMaxCap = Date.now() - openedAt < POPUP_MAX_OPEN_MS;
          const withinGraceWindow =
            !document.hasFocus() ||
            focusReturnedAt === null ||
            Date.now() - focusReturnedAt < POST_FOCUS_GRACE_MS;

          if (withinMaxCap && withinGraceWindow) {
            return false;
          }
          try {
            return targetWin.closed;
          } catch {
            return true;
          }
        }
        const value = Reflect.get(targetWin, prop, targetWin);
        return typeof value === 'function' ? value.bind(targetWin) : value;
      },
    });
  }) as typeof window.open;

  try {
    return await fn();
  } finally {
    window.open = originalOpen;
    window.removeEventListener('blur', handleBlur);
    window.removeEventListener('focus', handleFocus);
  }
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;

    // On Android/iOS Capacitor, WebView popups fail and leave a blank white screen after account selection.
    // Use native Google Sign-In via @capacitor-firebase/authentication and bridge the credential to Firebase JS Auth.
    if (Capacitor.isNativePlatform()) {
      const nativeResult = await FirebaseAuthentication.signInWithGoogle({
        scopes: ['https://www.googleapis.com/auth/drive.readonly'],
      });
      const idToken = nativeResult.credential?.idToken;
      const accessToken = nativeResult.credential?.accessToken || '';
      if (!idToken) {
        throw new Error('Google Sign-In did not return an ID token. Please try again.');
      }

      const credential = GoogleAuthProvider.credential(idToken, accessToken || undefined);
      const userCred = await signInWithCredential(auth, credential);
      if (accessToken) {
        writeStoredAccessToken(accessToken);
      }
      return { user: userCred.user, accessToken };
    }

    provider.setCustomParameters({ prompt: 'select_account' });
    const result = await withCoopSafePopup(() => signInWithPopup(auth, provider));
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Google Auth');
    }

    writeStoredAccessToken(credential.accessToken);
    return { user: result.user, accessToken: credential.accessToken };
  } catch (error: any) {
    console.error('Google Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return readStoredAccessToken();
};

/**
 * Returns the current Firebase Auth ID token for authenticating with the Express/Firestore backend.
 */
export const getFirebaseIdToken = async (): Promise<string | null> => {
  if (typeof window !== 'undefined' && (window as any).__MOCK_AUTH__?.idToken) {
    return (window as any).__MOCK_AUTH__.idToken;
  }
  const user = auth.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken();
  } catch {
    return null;
  }
};

/**
 * Returns Authorization headers with the Firebase ID token if a user is logged in.
 */
export const getAuthHeaders = async (): Promise<Record<string, string>> => {
  const idToken = await getFirebaseIdToken();
  return idToken ? { Authorization: `Bearer ${idToken}` } : {};
};

export const logout = async () => {
  if (Capacitor.isNativePlatform()) {
    try {
      await FirebaseAuthentication.signOut();
    } catch {
      // Ignore native signOut error if not natively signed in
    }
  }
  await signOut(auth);
  clearCachedAccessToken();
};
