import type { SyntheticEvent } from 'react';
import noImageAsset from '../../assets/NoImage.png';

// Utility functions for comic cover images, Google Drive image links, and NoImage.png placeholder

/** Stored sentinel for comics with no linked cover yet. */
export const DEFAULT_COVER_IMAGE = 'NoImage.png';

/** Bundled local fallback shown until a Google Drive placeholder is available. */
export const DEFAULT_NO_IMAGE_PLACEHOLDER = noImageAsset;

let globalDriveNoImageUrl: string | null = null;

export function setDriveNoImageUrl(url: string | null) {
  globalDriveNoImageUrl = url;
}

export function getDriveNoImageUrl(): string {
  return globalDriveNoImageUrl || DEFAULT_NO_IMAGE_PLACEHOLDER;
}

export function handleImageError(e: SyntheticEvent<HTMLImageElement, Event>) {
  const img = e.currentTarget;
  const currentSrc = img.src;
  const fallback = getDriveNoImageUrl();

  // If already at fallback, already attempted proxy, or invalid/data/blob URL, fall back to default
  if (
    !currentSrc ||
    currentSrc === fallback ||
    img.dataset.proxyRetried === 'true' ||
    currentSrc.startsWith('data:') ||
    currentSrc.startsWith('blob:') ||
    currentSrc.includes('/api/proxy-image')
  ) {
    img.onerror = null;
    if (img.src !== fallback) {
      img.src = fallback;
    }
    return;
  }

  // Attempt 1 retry via server proxy
  img.dataset.proxyRetried = 'true';
  img.src = `/api/proxy-image?url=${encodeURIComponent(currentSrc)}`;
}

/**
 * Extracts Google Drive File ID from various share link formats or raw ID strings
 */
export function extractDriveFileId(urlOrId: string): string | null {
  if (!urlOrId || !urlOrId.trim()) return null;
  const clean = urlOrId.trim();
  const driveMatch =
    clean.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
    clean.match(/\/d\/([a-zA-Z0-9_-]+)/) ||
    clean.match(/[?&]id=([a-zA-Z0-9_-]+)/);

  if (driveMatch && driveMatch[1]) {
    return driveMatch[1];
  }

  // Raw file ID
  if (/^[a-zA-Z0-9_-]{25,}$/.test(clean)) {
    return clean;
  }

  return null;
}

/**
 * Parses Google Drive share link or file ID into a direct displayable image URL
 */
export function formatDriveImageUrl(urlOrId: string, customFallback?: string): string {
  const fallback = customFallback || getDriveNoImageUrl();
  if (!urlOrId || !urlOrId.trim()) return fallback;
  const clean = urlOrId.trim();

  if (clean === DEFAULT_COVER_IMAGE || clean.toLowerCase().includes('noimage')) {
    return fallback;
  }

  if (clean.includes('lh3.googleusercontent.com')) {
    if (clean.includes('=s1000')) {
      return clean.replace('=s1000', '=s800');
    }
    if (!clean.includes('=s')) {
      return `${clean}=s800`;
    }
    return clean;
  }

  const fileId = extractDriveFileId(clean);
  if (fileId) {
    return `https://lh3.googleusercontent.com/d/${fileId}=s800`;
  }

  return clean;
}

/**
 * Safe image resolver that falls back to NoImage.png placeholder if missing
 */
export function getComicCoverUrl(coverUrl?: string, customFallback?: string): string {
  const fallback = customFallback || getDriveNoImageUrl();
  if (!coverUrl || !coverUrl.trim() || coverUrl === DEFAULT_COVER_IMAGE || coverUrl.toLowerCase().includes('noimage')) {
    return fallback;
  }
  return formatDriveImageUrl(coverUrl, fallback);
}

/**
 * Checks if a comic book already has a valid, non-placeholder cover image linked.
 * Explicitly makes an exception for NoImage.png and placeholder images, treating them as unlinked.
 */
export function isComicAlreadyLinked(coverUrl?: string, driveNoImageUrlOrId?: string): boolean {
  if (!coverUrl || !coverUrl.trim()) {
    return false;
  }

  const clean = coverUrl.trim();
  const lower = clean.toLowerCase();

  // If it's NoImage.png or contains 'noimage' or is the default SVG placeholder, it's NOT linked
  if (
    clean === DEFAULT_COVER_IMAGE ||
    lower.includes('noimage') ||
    clean === DEFAULT_NO_IMAGE_PLACEHOLDER
  ) {
    return false;
  }

  // Check against global Drive NoImage URL if set
  const globalNoImage = getDriveNoImageUrl();
  if (globalNoImage && globalNoImage !== DEFAULT_NO_IMAGE_PLACEHOLDER) {
    if (clean === globalNoImage || clean.includes(globalNoImage)) {
      return false;
    }
    const cleanId = extractDriveFileId(clean);
    const globalNoImageId = extractDriveFileId(globalNoImage);
    if (cleanId && globalNoImageId && cleanId === globalNoImageId) {
      return false;
    }
  }

  // Check against explicitly passed Drive NoImage URL or ID (e.g. from syncResult)
  if (driveNoImageUrlOrId && driveNoImageUrlOrId.trim()) {
    const noImageClean = driveNoImageUrlOrId.trim();
    if (clean === noImageClean || clean.includes(noImageClean)) {
      return false;
    }
    const cleanId = extractDriveFileId(clean);
    const noImageId = extractDriveFileId(noImageClean);
    if (cleanId && noImageId && cleanId === noImageId) {
      return false;
    }
  }

  // The comic already has a valid cover image linked!
  return true;
}

/**
 * Matches a Google Drive file name against a comic book's title, issue number, and volume.
 * Concatenates Title + Issue Number (e.g. "Amazing Spider-Man 300" or "Amazing Spider-Man #300"),
 * normalizing separators, handling file extensions, and ensuring precise word-boundary matching.
 */
export function doesFileNameMatchComic(
  driveFileName: string,
  comicTitle: string,
  issueNumber: string | number,
  volume?: string |number
): boolean {
  if (!driveFileName || !comicTitle) return false;

  // 1. Strip file extension
  const baseFileName = driveFileName.replace(/\.[^/.]+$/, '').trim();
  if (!baseFileName) return false;

  const titleStr = String(comicTitle).trim();
  const issueStr = String(issueNumber ?? '').trim();

  // 2. Normalization helper (converts punctuation to spaces and collapses whitespace)
  const normalize = (str: string) =>
    str
      .toLowerCase()
      .replace(/[_\-#:.,/\\\(\)]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  // Dense string (only alphanumeric)
  const dense = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');

  const normFile = normalize(baseFileName);
  const denseFile = dense(baseFileName);

  const normTitle = normalize(titleStr);
  const denseTitle = dense(titleStr);

  const normIssue = normalize(issueStr);
  const denseIssue = dense(issueStr);

  // If issueStr is empty, match on title alone
  if (!issueStr) {
    return (
      normFile === normTitle ||
      denseFile === denseTitle ||
      normFile.includes(normTitle)
    );
  }

  // 3. Concatenated candidate strings (Title + Issue, Title + #Issue, Volume variations)
  const concat1 = `${titleStr} ${issueStr}`;
  const concat2 = `${titleStr} #${issueStr}`;
  const concat3 = volume ? `${titleStr} v${volume} ${issueStr}` : '';
  const concat4 = volume ? `${titleStr} vol ${volume} ${issueStr}` : '';
  const concat5 = volume ? `${titleStr} vol ${volume} #${issueStr}` : '';

  const normConcat1 = normalize(concat1);
  const normConcat2 = normalize(concat2);
  const normConcat3 = concat3 ? normalize(concat3) : '';
  const normConcat4 = concat4 ? normalize(concat4) : '';
  const normConcat5 = concat5 ? normalize(concat5) : '';

  const denseConcat = dense(`${titleStr}${issueStr}`);

  // Check A: Exact normalized match on concatenated Title + Issue
  if (
    normFile === normConcat1 ||
    normFile === normConcat2 ||
    (normConcat3 && normFile === normConcat3) ||
    (normConcat4 && normFile === normConcat4) ||
    (normConcat5 && normFile === normConcat5) ||
    denseFile === denseConcat
  ) {
    return true;
  }

  // Check B: File name contains Title AND Issue Number
  const noTheTitle = normTitle.replace(/^the\s+/, '');
  const titleMatches =
    normFile.includes(normTitle) ||
    normTitle.includes(normFile) ||
    denseFile.includes(denseTitle) ||
    (noTheTitle.length > 2 && normFile.includes(noTheTitle));

  if (!titleMatches) {
    return false;
  }

  // Check issue number in file name using boundary matching or hash matching
  const cleanIssueNumber = issueStr.replace(/^#/, '').trim();
  if (!cleanIssueNumber) return true;

  // Escaped regex for word boundary check (e.g. "300" in "Spider-Man 300.jpg" or "Spider-Man #300")
  const escaped = cleanIssueNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const issueRegex = new RegExp(`(?:^|[^0-9a-zA-Z])${escaped}(?:$|[^0-9a-zA-Z])`, 'i');

  if (
    issueRegex.test(normFile) ||
    normFile.includes(`#${cleanIssueNumber}`) ||
    normFile.endsWith(` ${cleanIssueNumber}`) ||
    normFile.endsWith(`_${cleanIssueNumber}`) ||
    normFile.endsWith(`-${cleanIssueNumber}`)
  ) {
    return true;
  }

  return false;
}

/**
 * Compresses base64 data URL images using Canvas to prevent localStorage QuotaExceeded
 * and Firestore 1MB document limit errors. Resizes large images to maxDimension (e.g. 800px) and quality (e.g. 0.75).
 */
export function compressBase64Image(dataUrl: string, maxDimension = 800, quality = 0.75): Promise<string> {
  return new Promise((resolve) => {
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image')) {
      resolve(dataUrl || '');
      return;
    }

    // If it's already reasonably small (under 250KB string length), resolve immediately
    if (dataUrl.length < 2500000) {
      resolve(dataUrl);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      const compressed = canvas.toDataURL('image/jpeg', quality);
      resolve(compressed);
    };

    img.onerror = () => {
      resolve(dataUrl);
    };

    img.src = dataUrl;
  });
}
