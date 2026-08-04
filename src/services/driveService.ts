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
}

/**
 * Searches user's Google Drive for the "Comic Covers" folder
 */
export async function findComicCoversFolder(accessToken: string): Promise<DriveFolder | null> {
  const query = encodeURIComponent("mimeType='application/vnd.google-apps.folder' and name='Comic Covers' and trashed=false");
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&pageSize=10`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Google Drive API error (${response.status})`);
  }

  const data = await response.json();
  if (data.files && data.files.length > 0) {
    return {
      id: data.files[0].id,
      name: data.files[0].name,
    };
  }
  return null;
}

/**
 * Fetches all image files in a specific Google Drive folder ID (or root if not provided)
 */
export async function getDriveImagesInFolder(
  accessToken: string,
  folderId?: string
): Promise<DriveFileItem[]> {
  let queryStr = "trashed=false and (mimeType contains 'image/' or name contains 'png' or name contains 'jpg' or name contains 'jpeg' or name contains 'webp')";
  if (folderId) {
    queryStr = `'${folderId}' in parents and ${queryStr}`;
  }

  const query = encodeURIComponent(queryStr);
  const fields = encodeURIComponent('files(id,name,mimeType,thumbnailLink,webViewLink)');
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&pageSize=100`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Google Drive API error (${response.status})`);
  }

  const data = await response.json();
  const rawFiles = data.files || [];

  return rawFiles.map((f: any) => {
    let directUrl = `https://drive.google.com/thumbnail?id=${f.id}&sz=w1000`;
    if (f.thumbnailLink) {
      // replace low-res =s220 with high-res =s1000
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
export async function scanDriveComicCovers(accessToken: string): Promise<DriveCoversSyncResult> {
  try {
    const folder = await findComicCoversFolder(accessToken);
    if (!folder) {
      // If "Comic Covers" folder isn't found, try searching root for images or NoImage.png
      const allRootImages = await getDriveImagesInFolder(accessToken);
      const noImg = allRootImages.find(
        (f) => f.name.toLowerCase() === 'noimage.png' || f.name.toLowerCase().includes('noimage')
      ) || null;

      return {
        folder: null,
        noImageFile: noImg,
        coverFiles: allRootImages,
        error: 'Folder "Comic Covers" not found in root Drive. Listing all accessible Drive image files instead.',
      };
    }

    const filesInFolder = await getDriveImagesInFolder(accessToken, folder.id);
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
    return {
      folder: null,
      noImageFile: null,
      coverFiles: [],
      error: err.message || 'Failed to scan Google Drive for Comic Covers folder.',
    };
  }
}
