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
  if (/^[a-zA-Z0-9_-]{15,}$/.test(clean)) {
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
 * Checks if a comic book already has a full cover image linked to a specific Drive file ID.
 */
export function isComicFullCoverLinked(coverImageFullUrl?: string, driveFileId?: string): boolean {
  if (!coverImageFullUrl || !driveFileId) return false;
  if (coverImageFullUrl.includes(driveFileId)) return true;
  const currentId = extractDriveFileId(coverImageFullUrl);
  return currentId !== null && currentId === driveFileId;
}

/**
 * Normalization helper (converts punctuation to spaces and collapses whitespace)
 */
function normalizeText(str: string): string {
  return String(str || '')
    .toLowerCase()
    .replace(/[_\-#:.,/\\\(\)\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function denseText(str: string): string {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function stripYear(str: string): string {
  return String(str || '')
    .replace(/\s*[\(\[]?\b(19\d\d|20\d\d)(?:\s*[-–]\s*(?:19\d\d|20\d\d|present))?\b[\)\]]?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildIssueRegex(issueStr: string): RegExp | null {
  const clean = String(issueStr || '').replace(/^#/, '').trim();
  if (!clean) return null;

  const numMatch = clean.match(/^(-?\d+)(.*)$/);
  if (numMatch) {
    const isNegative = numMatch[1].startsWith('-');
    const digits = isNegative ? numMatch[1].slice(1) : numMatch[1];
    const suffix = numMatch[2].trim();
    const signPrefix = isNegative ? '-\\s*' : '';
    if (!suffix) {
      if (digits === '0') {
        return new RegExp(`(?<![0-9a-zA-Z])#?${signPrefix}0+(?![0-9a-zA-Z])`, 'i');
      }
      const val = parseInt(digits, 10);
      return new RegExp(`(?<![0-9a-zA-Z])#?${signPrefix}0*${val}(?![0-9a-zA-Z])`, 'i');
    } else {
      const escapedSuffix = suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const val = parseInt(digits, 10);
      return new RegExp(`(?<![0-9a-zA-Z])#?${signPrefix}0*${val}[\\s\\-_.]*${escapedSuffix}(?![0-9a-zA-Z])`, 'i');
    }
  }

  const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![0-9a-zA-Z])#?${escaped}(?![0-9a-zA-Z])`, 'i');
}

export interface ParsedFullCoverFileName {
  isStrictFullCover: boolean;
  hasFullWord: boolean;
  title?: string;
  isAnnual?: boolean;
  issueOrYear?: string;
  normalizedFileNameForMatch?: string;
}

/**
 * Checks if any standalone word 'Full' is present in the filename (case-insensitive).
 * Used to strictly exclude 'Full' files from standard front cover matching.
 */
export function hasFullCoverWord(fileName: string): boolean {
  if (!fileName) return false;
  const baseName = fileName.replace(/\.[^/.]+$/, '').trim();
  return /\bfull\b/i.test(baseName);
}

/**
 * Strictly parses a full cover filename according to rules:
 * 1. Regular: <Title> Full #<Issue> or <Title> Full <Issue>
 *    Full MUST be immediately after the title and before the issue number.
 * 2. Annuals: <Title> Annual Full <Year or Issue>
 *    Full MUST be immediately after the title and the word "Annual", and before the year or issue number.
 */
export function parseStrictFullCoverFileName(fileName: string): ParsedFullCoverFileName {
  if (!fileName) return { isStrictFullCover: false, hasFullWord: false };
  const extMatch = fileName.match(/(\.[^/.]+)$/);
  const ext = extMatch ? extMatch[1] : '';
  const baseName = fileName.replace(/\.[^/.]+$/, '').trim();
  const hasFull = /\bfull\b/i.test(baseName);

  // Rule 1: Annual Full
  // e.g. "X-Man Annual Full '96", "Alpha Flight Annual Full #2", "Spider-Man Annual Full 1998"
  const annualMatch = baseName.match(/^(.+?)\s+Annual\s+Full\s+(?:#\s*)?(['’]?\d+.*)$/i);
  if (annualMatch) {
    const title = annualMatch[1].trim();
    const issueYear = annualMatch[2].trim();
    return {
      isStrictFullCover: true,
      hasFullWord: true,
      title,
      isAnnual: true,
      issueOrYear: issueYear,
      normalizedFileNameForMatch: `${title} Annual ${issueYear}${ext}`,
    };
  }

  // Rule 2: Regular Issue Full
  // e.g. "Comic Title Full #1", "The Amazing Spider-Man Full #300", "Marvel Comics Presents Full 16"
  const regularMatch = baseName.match(/^(.+?)\s+Full\s+(?:#\s*)?(-?\d+[a-zA-Z0-9.-]*)$/i);
  if (regularMatch) {
    const title = regularMatch[1].trim();
    const issue = regularMatch[2].trim();
    return {
      isStrictFullCover: true,
      hasFullWord: true,
      title,
      isAnnual: false,
      issueOrYear: issue,
      normalizedFileNameForMatch: `${title} #${issue}${ext}`,
    };
  }

  return {
    isStrictFullCover: false,
    hasFullWord: hasFull,
  };
}

/**
 * Matches a strictly parsed full cover file against a comic book.
 */
export function doesFullCoverMatchComic(
  parsedFullCover: ParsedFullCoverFileName,
  comic: {
    title: string;
    issueNumber: string | number;
    volume?: string | number;
    seriesName?: string;
    fullTitle?: string;
    publicationYear?: number;
  }
): boolean {
  if (!parsedFullCover.isStrictFullCover || !parsedFullCover.title || !parsedFullCover.issueOrYear) {
    return false;
  }

  const cTitle = (comic.title || '').toLowerCase();
  const cFullTitle = (comic.fullTitle || '').toLowerCase();
  const cSeries = (comic.seriesName || '').toLowerCase();
  const parsedTitle = parsedFullCover.title.toLowerCase().trim();

  // 1. Check title match
  const titleMatches =
    cTitle.includes(parsedTitle) ||
    cFullTitle.includes(parsedTitle) ||
    cSeries.includes(parsedTitle) ||
    parsedTitle.includes(cTitle);

  if (!titleMatches) return false;

  // 2. If Annual
  if (parsedFullCover.isAnnual) {
    const isComicAnnual = cTitle.includes('annual') || cFullTitle.includes('annual') || cSeries.includes('annual');
    if (!isComicAnnual) return false;

    const rawIssueYear = parsedFullCover.issueOrYear.replace(/^[#'’]/, '').trim();
    // Check issue number match
    const cleanIssue = String(comic.issueNumber || '').replace(/^[#]/, '').trim();
    if (cleanIssue && cleanIssue.toLowerCase() === rawIssueYear.toLowerCase()) {
      return true;
    }

    // Check year match (e.g. '96 -> 1996, 2020 -> 2020)
    if (comic.publicationYear) {
      const yearStr = String(comic.publicationYear);
      if (yearStr === rawIssueYear || yearStr.endsWith(rawIssueYear)) {
        return true;
      }
    }

    // Check if title or fullTitle contains the year/issue
    if (cTitle.includes(rawIssueYear) || cFullTitle.includes(rawIssueYear)) {
      return true;
    }

    return false;
  }

  // 3. Regular Issue
  const rawIssue = parsedFullCover.issueOrYear.replace(/^[#]/, '').trim();
  const cleanIssue = String(comic.issueNumber || '').replace(/^[#]/, '').trim();

  // Numeric or exact match on issue number
  if (cleanIssue.toLowerCase() === rawIssue.toLowerCase()) {
    return true;
  }
  const cleanIssueNum = parseInt(cleanIssue, 10);
  const rawIssueNum = parseInt(rawIssue, 10);
  if (!isNaN(cleanIssueNum) && !isNaN(rawIssueNum) && cleanIssueNum === rawIssueNum) {
    return true;
  }

  return false;
}

/**
 * Matches a Google Drive file name against a comic book's title, issue number, and volume.
 * Concatenates Title + Issue Number (e.g. "Amazing Spider-Man 300" or "Amazing Spider-Man #300"),
 * normalizing separators, handling file extensions, zero-padded issue numbers (02, #02),
 * years (e.g. "1995"), and ensuring precise word-boundary matching.
 */
export function doesFileNameMatchComic(
  driveFileName: string,
  comicTitle: string,
  issueNumber: string | number,
  volume?: string | number,
  seriesName?: string,
  fullTitle?: string,
  publicationYear?: number
): boolean {
  if (!driveFileName || !comicTitle) return false;

  // Strict check: if filename contains standalone "Full", it must not match standard cover art
  if (hasFullCoverWord(driveFileName)) {
    return false;
  }

  // 1. Strip file extension
  let baseFileName = driveFileName.replace(/\.[^/.]+$/, '').trim();
  if (!baseFileName) return false;

  // Normalize "X of Y" (e.g. "Generation Next 2 of 4" -> "Generation Next 2")
  baseFileName = baseFileName.replace(/\b(\d+)\s+of\s+\d+\b/gi, '$1');

  const issueStr = String(issueNumber ?? '').trim();
  const cleanIssueNumber = issueStr.replace(/^#/, '').trim();

  // 2. Check year conflict if file contains a 4-digit year and comic has a year
  const fileYearMatch = baseFileName.match(/\b(19\d\d|20\d\d)\b/);
  if (fileYearMatch) {
    const fileYear = parseInt(fileYearMatch[1], 10);
    let comicYear = publicationYear ? Number(publicationYear) : undefined;
    if (!comicYear) {
      const seriesYearMatch = String(seriesName || '').match(/\b(19\d\d|20\d\d)\b/);
      if (seriesYearMatch) comicYear = parseInt(seriesYearMatch[1], 10);
    }
    // If comic has a known year and file has a known year, but they differ by more than 1 year (publishing lag), reject
    if (comicYear && Math.abs(comicYear - fileYear) > 1) {
      return false;
    }
  }

  // 3. Issue Number Matching
  if (cleanIssueNumber) {
    const issueRegex = buildIssueRegex(cleanIssueNumber);
    if (!issueRegex || !issueRegex.test(baseFileName)) {
      return false;
    }
  }

  // 4. Title Matching
  // Prepare title candidates from comicTitle, seriesName, fullTitle, and volume variations
  const cleanVol = volume ? String(volume).replace(/[^0-9]/g, '') : '';
  const rawCandidates: Array<string | undefined> = [
    comicTitle,
    seriesName,
    fullTitle ? fullTitle.replace(/#\s*\S+.*$/, '') : undefined,
    cleanVol ? `${comicTitle} v${cleanVol}` : undefined,
    cleanVol ? `${comicTitle} vol ${cleanVol}` : undefined,
    cleanVol ? `${comicTitle} volume ${cleanVol}` : undefined,
  ];

  const titleVariants = new Set<string>();
  for (const cand of rawCandidates) {
    if (!cand) continue;
    const n = normalizeText(cand);
    const s = normalizeText(stripYear(cand));
    const noTheN = n.replace(/^the\s+/, '');
    const noTheS = s.replace(/^the\s+/, '');

    if (n) titleVariants.add(n);
    if (s) titleVariants.add(s);
    if (noTheN) titleVariants.add(noTheN);
    if (noTheS) titleVariants.add(noTheS);
  }

  // Prepare file representations
  const normFile = normalizeText(baseFileName);
  const normFileNoYear = normalizeText(stripYear(baseFileName));
  const denseFile = denseText(baseFileName);
  const denseFileNoYear = denseText(stripYear(baseFileName));

  // If issue is present, also strip the issue from the file to isolate the title portion
  let normFileNoIssue = normFile;
  if (cleanIssueNumber) {
    const issueRegex = buildIssueRegex(cleanIssueNumber);
    if (issueRegex) {
      normFileNoIssue = normalizeText(normFile.replace(issueRegex, ' '));
    }
  }
  const normFileNoIssueNoYear = normalizeText(stripYear(normFileNoIssue));

  for (const t of titleVariants) {
    if (!t) continue;
    const denseT = denseText(t);

    // Exact matches
    if (
      normFile === t ||
      normFileNoYear === t ||
      normFileNoIssue === t ||
      normFileNoIssueNoYear === t ||
      denseFile === denseT ||
      denseFileNoYear === denseT
    ) {
      return true;
    }

    // Title contained in file name
    if (
      normFile.includes(t) ||
      normFileNoYear.includes(t) ||
      normFileNoIssue.includes(t) ||
      denseFile.includes(denseT) ||
      denseFileNoYear.includes(denseT)
    ) {
      return true;
    }
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
