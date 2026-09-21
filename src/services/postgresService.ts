import { ComicBook, StorageBox } from '../types';
import { compressBase64Image } from '../utils/imageUtils';
import { sortBoxes } from '../utils/boxUtils';

interface CollectionResponse {
  comics: ComicBook[];
  boxes: StorageBox[];
}

async function request(path: string, options?: RequestInit) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Database request failed (${response.status})`);
  }
  return response;
}

async function prepareComic(comic: ComicBook): Promise<ComicBook> {
  const clean = structuredClone(comic);
  if (clean.coverImage?.startsWith('data:image') && clean.coverImage.length > 250000) {
    clean.coverImage = await compressBase64Image(clean.coverImage, 800, 0.7);
  }
  if (clean.coverImage?.length > 800000) clean.coverImage = 'NoImage.png';
  return clean;
}

export async function loadCollection(): Promise<CollectionResponse> {
  const response = await request('/api/collection');
  const collection = await response.json() as CollectionResponse;
  return { comics: collection.comics, boxes: sortBoxes(collection.boxes) };
}

export async function saveComic(comic: ComicBook) {
  const cleanComic = await prepareComic(comic);
  await request(`/api/comics/${encodeURIComponent(cleanComic.id)}`, {
    method: 'PUT', body: JSON.stringify(cleanComic),
  });
}

export async function deleteComic(comicId: string) {
  await request(`/api/comics/${encodeURIComponent(comicId)}`, { method: 'DELETE' });
}

/** Replaces the stored comic collection, including removals. */
export async function replaceComics(comics: ComicBook[]) {
  const cleanComics = await Promise.all(comics.map(prepareComic));
  await request('/api/comics', { method: 'PUT', body: JSON.stringify({ comics: cleanComics }) });
}

export async function saveBox(box: StorageBox) {
  await request(`/api/boxes/${box.id}`, { method: 'PUT', body: JSON.stringify(box) });
}

export async function deleteBox(boxId: number) {
  await request(`/api/boxes/${boxId}`, { method: 'DELETE' });
}

export async function saveBoxes(boxes: StorageBox[]) {
  await Promise.all(boxes.map(saveBox));
}

/** Replaces the stored box list, including removed boxes. */
export async function replaceBoxes(boxes: StorageBox[]) {
  await request('/api/boxes', { method: 'PUT', body: JSON.stringify({ boxes }) });
}

/**
 * Fetch comics in a specific box, ordered for 3D visualization.
 * Returns comics sorted by creation order (stable ordering from front to back).
 */
export async function fetchBoxComics(boxId: number): Promise<{
  box: { id: number; name: string };
  comics: ComicBook[];
  count: number;
}> {
  const response = await request(`/api/boxes/${boxId}/comics`);
  return response.json();
}

/**
 * Fetch multiple Google Sheet subsheets in parallel.
 */
export async function fetchGoogleSubsheets(payload: {
  spreadsheetId: string;
  sheetNames: Record<string, string>;
  accessToken?: string;
}): Promise<{
  success: boolean;
  spreadsheetId: string;
  subsheets: Record<string, { sheetName: string; headers: string[]; rows: string[][]; rowCount: number; error?: string }>;
}> {
  try {
    const response = await request('/api/google-sheets/fetch-subsheets', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return response.json();
  } catch (err: any) {
    // If the batch endpoint is not yet available (e.g. 404 from older server before restart),
    // fallback gracefully to fetching each tab individually via /api/google-sheets/fetch
    if (err.message && err.message.includes('404')) {
      console.warn('Batch endpoint returned 404, falling back to individual tab fetching...');
      const results: Record<string, { sheetName: string; headers: string[]; rows: string[][]; rowCount: number; error?: string }> = {};

      await Promise.all(
        Object.entries(payload.sheetNames).map(async ([key, sheetName]) => {
          const name = String(sheetName || '').trim();
          if (!name) return;
          try {
            const singleResp = await request('/api/google-sheets/fetch', {
              method: 'POST',
              body: JSON.stringify({
                spreadsheetId: payload.spreadsheetId,
                sheetName: name,
                accessToken: payload.accessToken,
              }),
            });
            const singleData = await singleResp.json();
            results[key] = {
              sheetName: name,
              headers: singleData.headers || [],
              rows: singleData.rows || [],
              rowCount: (singleData.rows || []).length,
            };
          } catch (tabErr: any) {
            results[key] = {
              sheetName: name,
              headers: [],
              rows: [],
              rowCount: 0,
              error: tabErr.message,
            };
          }
        })
      );

      return {
        success: true,
        spreadsheetId: payload.spreadsheetId,
        subsheets: results,
      };
    }
    throw err;
  }
}

/**
 * Imports and persists subsheets data (creators, creator types, contributors, character appearances) into PostgreSQL.
 */
export async function importSubsheetsData(payload: {
  creators?: Array<{ firstName?: string; lastName?: string; fullName: string }>;
  creatorTypes?: Array<{ typeName: string }>;
  contributors?: Array<{ seriesName?: string; fullTitle: string; creatorFullName: string; creatorType: string }>;
  characterAppearances?: Array<{ seriesName?: string; fullTitle: string; characterName: string; appearanceType: string }>;
  syncWithComics?: boolean;
}): Promise<{
  success: boolean;
  counts: {
    creators: number;
    creatorTypes: number;
    contributors: number;
    characterAppearances: number;
    comicsUpdated: number;
  };
}> {
  const response = await request('/api/import/subsheets', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return response.json();
}

/**
 * Fetches all creators with issue counts, series, and role breakdowns.
 */
export async function fetchCreatorsList() {
  const response = await request('/api/creators');
  return response.json();
}

/**
 * Fetches analytics report on creators, multi-role creators (pencillers who write), and character appearances.
 */
export async function fetchCreatorReportsData() {
  const response = await request('/api/reports/creators');
  return response.json();
}
