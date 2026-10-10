import { Capacitor } from '@capacitor/core';

export const API_HOST_STORAGE_KEY = 'comic_vault_api_host';

/**
 * Returns the configured base URL for the backend API.
 * In a standard web browser, defaults to '' (same origin, relative URLs).
 * In a native mobile app (Capacitor Android), retrieves the stored backend URL
 * (e.g., 'http://192.168.1.100:3000') or falls back to VITE_API_URL / Android emulator loopback.
 */
export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') return '';

  const saved = localStorage.getItem(API_HOST_STORAGE_KEY);
  if (saved && saved.trim()) {
    return saved.trim().replace(/\/+$/, '');
  }

  // When running inside native Android shell without custom setting
  if (Capacitor.isNativePlatform()) {
    const envUrl = (import.meta as any).env?.VITE_API_URL;
    if (envUrl && typeof envUrl === 'string') {
      return envUrl.trim().replace(/\/+$/, '');
    }
    // 10.0.2.2 is Android emulator's alias for the host development computer
    return 'http://10.0.2.2:3000';
  }

  return '';
}

/**
 * Persists the backend API host URL.
 */
export function setApiBaseUrl(url: string): void {
  if (typeof window === 'undefined') return;
  const clean = url.trim().replace(/\/+$/, '');
  if (!clean) {
    localStorage.removeItem(API_HOST_STORAGE_KEY);
  } else {
    localStorage.setItem(API_HOST_STORAGE_KEY, clean);
  }
}

/**
 * Prepends the API base URL to any relative endpoint path.
 */
export function buildApiUrl(path: string): string {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
    return path;
  }
  const base = getApiBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${cleanPath}` : cleanPath;
}

/**
 * Test connectivity to a backend URL.
 */
export async function testApiConnection(targetUrl?: string): Promise<{ success: boolean; latencyMs: number; error?: string }> {
  const base = targetUrl !== undefined ? targetUrl.trim().replace(/\/+$/, '') : getApiBaseUrl();
  const checkUrl = base ? `${base}/api/creator-types` : '/api/creator-types';

  const startTime = performance.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(checkUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const latencyMs = Math.round(performance.now() - startTime);
    if (res.ok) {
      return { success: true, latencyMs };
    }
    return { success: false, latencyMs, error: `Server responded with HTTP ${res.status}` };
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - startTime);
    if (err.name === 'AbortError') {
      return { success: false, latencyMs, error: 'Connection timed out (6s)' };
    }
    return { success: false, latencyMs, error: err.message || 'Network request failed' };
  }
}
