export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink?: string;
  webViewLink?: string;
  directImageUrl: string;
}

export interface DriveFolder {
  id: string;
  name: string;
}

export interface DriveCoversSyncResult {
  folder: DriveFolder | null;
  noImageFile: DriveFileItem | null;
  coverFiles: DriveFileItem[];
  error?: string;
  authExpired?: boolean;
}

export class DriveAuthError extends Error {
  status: number;
  isAuthError = true;
  constructor(message = 'Google Drive authentication expired or unauthorized (401/403).', status = 401) {
    super(message);
    this.name = 'DriveAuthError';
    this.status = status;
  }
}

/**
 * Helper to fetch with an AbortSignal timeout
 */
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Searches user's Google Drive for the "Comic Covers" folder.
 * Matches case-insensitively and supports both standard and shared drives.
 */
export async function findComicCoversFolder(accessToken: string): Promise<DriveFolder | null> {
  try {
    // Search query includes name='Comic Covers' for strict matching and contains for case-insensitivity
    const query = encodeURIComponent(
      "mimeType='application/vnd.google-apps.folder' and trashed=false and (name='Comic Covers' or name contains 'Comic' or name contains 'comic' or name contains 'Covers' or name contains 'covers')"
    );
    const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&pageSize=30&supportsAllDrives=true&includeItemsFromAllDrives=true`;

    const response = await fetchWithTimeout(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }, 12000);

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.warn('Folder search response not ok:', err);
      if (response.status === 401 || response.status === 403) {
        throw new DriveAuthError(err?.error?.message || 'Google Drive authorization expired or unauthorized.', response.status);
      }
      return null;
    }

    const data = await response.json();
    const folders: Array<{ id: string; name: string }> = data.files || [];

    // Priority 1: Exact match or case-insensitive "comic covers"
    const exactMatch = folders.find((f) => f.name.toLowerCase().trim() === 'comic covers');
    if (exactMatch) return exactMatch;

    // Priority 2: Contains both "comic" and "cover"
    const bothMatch = folders.find(
      (f) => f.name.toLowerCase().includes('comic') && f.name.toLowerCase().includes('cover')
    );
    if (bothMatch) return bothMatch;

    // Priority 3: Named "covers"
    const coversMatch = folders.find((f) => f.name.toLowerCase().trim() === 'covers');
    if (coversMatch) return coversMatch;

    if (folders.length > 0) return folders[0];

    return null;
  } catch (err) {
    console.error('findComicCoversFolder error:', err);
    return null;
  }
}

/**
 * Fetches all image files in a specific Google Drive folder ID.
 * Employs a 15-second timeout, pageSize=250, and safety max-pages limit.
 */
export async function getDriveImagesInFolder(
  accessToken: string,
  folderId?: string,
  onProgress?: (count: number) => void
): Promise<DriveFileItem[]> {
  let queryStr = "trashed=false and (mimeType contains 'image/' or name contains 'png' or name contains 'jpg' or name contains 'jpeg' or name contains 'webp')";
  if (folderId) {
    queryStr = `'${folderId}' in parents and ${queryStr}`;
  } else {
    // If no folderId, limit to root to avoid scanning entire drive
    queryStr = `'root' in parents and ${queryStr}`;
  }

  const query = encodeURIComponent(queryStr);
  const fields = encodeURIComponent('nextPageToken,files(id,name,mimeType,thumbnailLink,webViewLink)');
  const allRawFiles: any[] = [];
  let pageToken: string | undefined = undefined;
  let pageCount = 0;
  const MAX_PAGES = 20; // Cap at 5,000 files

  do {
    pageCount++;
    const pageParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
    const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&pageSize=250&supportsAllDrives=true&includeItemsFromAllDrives=true${pageParam}`;

    try {
      const response = await fetchWithTimeout(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }, 15000);

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        console.warn(`Drive API page ${pageCount} error:`, err);
        if (response.status === 401 || response.status === 403) {
          throw new DriveAuthError(err?.error?.message || 'Google Drive authorization expired or unauthorized.', response.status);
        }
        break;
      }

      const data = await response.json();
      if (data.files && Array.isArray(data.files)) {
        allRawFiles.push(...data.files);
        if (onProgress) {
          onProgress(allRawFiles.length);
        }
      }

      if (data.nextPageToken && data.nextPageToken !== pageToken) {
        pageToken = data.nextPageToken;
      } else {
        pageToken = undefined;
      }
    } catch (fetchErr: any) {
      console.warn(`Drive fetch interrupted on page ${pageCount}:`, fetchErr?.message);
      break;
    }
  } while (pageToken && pageCount < MAX_PAGES);

  return allRawFiles.map((f: any) => {
    let directUrl = `https://drive.google.com/thumbnail?id=${f.id}&sz=w1000`;
    if (f.thumbnailLink) {
      directUrl = f.thumbnailLink.replace(/=s\d+$/, '=s1000');
    }
    return {
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      thumbnailLink: f.thumbnailLink,
      webViewLink: f.webViewLink,
      directImageUrl: directUrl,
    };
  });
}

/**
 * Complete helper to scan Google Drive for the "Comic Covers" folder,
 * extract all images inside, and isolate `NoImage.png`.
 */
export async function scanDriveComicCovers(
  accessToken: string,
  onProgress?: (count: number) => void
): Promise<DriveCoversSyncResult> {
  try {
    const folder = await findComicCoversFolder(accessToken);
    if (!folder) {
      // Find NoImage placeholder in drive if it exists
      const noImageQuery = encodeURIComponent(
        "trashed=false and (name='NoImage.png' or name='noimage.png' or name contains 'noimage')"
      );
      let noImg: DriveFileItem | null = null;
      try {
        const noImgRes = await fetchWithTimeout(
          `https://www.googleapis.com/drive/v3/files?q=${noImageQuery}&fields=files(id,name,thumbnailLink)&pageSize=1`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
          5000
        );
        if (noImgRes && !noImgRes.ok && (noImgRes.status === 401 || noImgRes.status === 403)) {
          throw new DriveAuthError('Google Drive authorization expired.', noImgRes.status);
        }
        if (noImgRes && noImgRes.ok) {
          const noImgData = await noImgRes.json().catch(() => ({}));
          if (noImgData.files?.[0]) {
            const f = noImgData.files[0];
            noImg = {
              id: f.id,
              name: f.name,
              mimeType: 'image/png',
              thumbnailLink: f.thumbnailLink,
              directImageUrl: `https://drive.google.com/thumbnail?id=${f.id}&sz=w1000`,
            };
          }
        }
      } catch {
        // Ignore fallback error
      }

      return {
        folder: null,
        noImageFile: noImg,
        coverFiles: [],
        error: 'Folder "Comic Covers" not found in your Google Drive. Please create a folder named "Comic Covers" in Google Drive and place your comic covers inside.',
      };
    }

    const filesInFolder = await getDriveImagesInFolder(accessToken, folder.id, onProgress);
    const noImg = filesInFolder.find(
      (f) => f.name.toLowerCase() === 'noimage.png' || f.name.toLowerCase().includes('noimage')
    ) || null;

    const actualCovers = filesInFolder.filter(
      (f) => f.name.toLowerCase() !== 'noimage.png' && !f.name.toLowerCase().includes('noimage')
    );

    return {
      folder,
      noImageFile: noImg,
      coverFiles: actualCovers,
    };
  } catch (err: any) {
    console.error('scanDriveComicCovers failed:', err);
    if (err instanceof DriveAuthError || err?.isAuthError || err?.status === 401 || err?.status === 403) {
      return {
        folder: null,
        noImageFile: null,
        coverFiles: [],
        error: 'Google Drive authorization expired or unauthorized (401/403). Please sign in again with your Google Account to scan your drive.',
        authExpired: true,
      };
    }
    return {
      folder: null,
      noImageFile: null,
      coverFiles: [],
      error: err.message || 'Failed to scan Google Drive for Comic Covers folder.',
    };
  }
}
