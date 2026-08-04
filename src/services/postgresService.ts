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
