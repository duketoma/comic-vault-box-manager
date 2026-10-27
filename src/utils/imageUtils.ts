import type { SyntheticEvent } from 'react';
const noImageAsset = new URL('../../assets/NoImage.png', import.meta.url).href;
import { buildApiUrl } from '../services/apiConfig';
import { isAnnualComic, extractAnnualNumber, parseIssueNumber, isYearDesignatedAnnual } from './comicSortUtils';
import type { ComicBook } from '../types';

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
  img.src = buildApiUrl(`/api/proxy-image?url=${encodeURIComponent(currentSrc)}`);
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
export function getComicCoverUrl(coverUrlOrComic?: string | { coverImage?: string; coverImageFull?: string } | null, customFallback?: string): string {
  const fallback = customFallback || getDriveNoImageUrl();
  const rawUrl = typeof coverUrlOrComic === 'object' && coverUrlOrComic !== null
    ? (coverUrlOrComic.coverImage || coverUrlOrComic.coverImageFull)
    : coverUrlOrComic;

  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim() || rawUrl === DEFAULT_COVER_IMAGE || rawUrl.toLowerCase().includes('noimage')) {
    return fallback;
  }
  return formatDriveImageUrl(rawUrl, fallback);
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
 * Normalization helper (converts punctuation to spaces and collapses whitespace, strips quotes/apostrophes)
 */
function normalizeText(str: string): string {
  return String(str || '')
    .toLowerCase()
    .replace(/['’`"]/g, '')
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

  const comicBookPartial: Partial<ComicBook> = {
    ...comic,
    issueNumber: String(comic.issueNumber ?? ''),
    volume: comic.volume !== undefined ? String(comic.volume) : undefined,
  };

  // If normalizedFileNameForMatch is available, evaluate with scoreFileNameMatch
  if (parsedFullCover.normalizedFileNameForMatch) {
    const score = scoreFileNameMatch(parsedFullCover.normalizedFileNameForMatch, comicBookPartial);
    return score >= 70;
  }

  const normParsedTitle = normalizeText(parsedFullCover.title);
  const normTitle = normalizeText(comic.title || '');
  const normSeries = normalizeText(comic.seriesName || '').replace(/\(.*?\)/g, '').trim();

  // Strip "Annual" and year from comic title to compare series root
  const comicBaseTitle = normTitle.replace(/\bannual.*$/i, '').trim();
  const comicSeriesBase = normSeries.replace(/\bannual.*$/i, '').trim();

  // Exact series/title match (prevents X-Men from matching Uncanny X-Men)
  const exactSeriesMatch =
    comicBaseTitle === normParsedTitle ||
    comicSeriesBase === normParsedTitle ||
    normTitle === normParsedTitle;

  if (!exactSeriesMatch) {
    return false;
  }

  // If Annual
  if (parsedFullCover.isAnnual) {
    const isComicAnnual = isAnnualComic(comicBookPartial);
    if (!isComicAnnual) return false;

    const rawIssueYear = parsedFullCover.issueOrYear.replace(/^[#'’`]/, '').trim();
    const cleanIssue = String(comic.issueNumber || '').replace(/^[#'’`]/, '').trim();

    if (cleanIssue && cleanIssue.toLowerCase() === rawIssueYear.toLowerCase()) {
      return true;
    }

    if (comic.publicationYear) {
      const yearStr = String(comic.publicationYear);
      if (yearStr === rawIssueYear || yearStr.endsWith(rawIssueYear)) {
        return true;
      }
    }

    if (normTitle.includes(rawIssueYear)) {
      return true;
    }

    return false;
  }

  // Regular Issue
  const rawIssue = parsedFullCover.issueOrYear.replace(/^[#]/, '').trim();
  const cleanIssue = String(comic.issueNumber || '').replace(/^[#]/, '').trim();

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
 * Scores a strictly parsed full cover file against a comic book (0-100).
 */
export function scoreFullCoverMatch(
  parsedFullCover: ParsedFullCoverFileName,
  comic: Partial<ComicBook>
): number {
  if (!parsedFullCover.isStrictFullCover || !parsedFullCover.title || !parsedFullCover.issueOrYear) {
    return 0;
  }
  if (parsedFullCover.normalizedFileNameForMatch) {
    return scoreFileNameMatch(parsedFullCover.normalizedFileNameForMatch, comic);
  }
  return doesFullCoverMatchComic(parsedFullCover, comic as any) ? 80 : 0;
}

/**
 * Checks whether a filename indicates an Annual publication.
 */
export function isAnnualFileName(fileName: string): boolean {
  if (!fileName) return false;
  const baseName = fileName.replace(/\.[^/.]+$/, '').trim();
  return /\bannual\b/i.test(baseName);
}

/**
 * Common cover variant and edition descriptors that can appear in filenames
 * (e.g. "Cover A", "Variant", "Foil", "Direct Edition", "Newsstand", "Cvr").
 */
const COVER_VARIANT_DESCRIPTORS_REGEX =
  /\b(cover\s*[a-z0-9]?|cvr\s*[a-z0-9]?|variant\s*(?:cover)?|foil|direct\s*(?:edition)?|newsstand|(?:\d+(?:st|nd|rd|th)\s*)?print(?:ing)?|facsimile|sketch|incentive|virgin|wraparound|trifold)\b/gi;

/**
 * Computes a precision match score (0 to 100) between a Google Drive filename and a comic book.
 * 
 * Score breakdown:
 * - 0: Ineligible mismatch (Annual discrepancy, issue mismatch, full cover mismatch, year conflict, or distinct subseries)
 * - 100: Exact title & exact issue number match
 * - 95: Exact title match ignoring leading article ("The") or punctuation dense-match
 * - 90: Exact title match with volume/year disambiguation matching comic
 * - 85: Exact title match after stripping cover variant descriptors (e.g. Cover A, Variant, Cvr)
 * - 80: Year-designated annual match
 * 
 * Returns score >= 70 for high-confidence matches, or 0 for mismatches.
 */
export function scoreFileNameMatch(
  driveFileName: string,
  comic: Partial<ComicBook>
): number {
  if (!driveFileName || !comic) return 0;

  // 1. Strict Full Cover Check
  if (hasFullCoverWord(driveFileName)) {
    return 0;
  }

  // 2. Strict Annual Consistency: Annual files MUST NOT match baseline issues, and vice-versa
  const fileIsAnnual = isAnnualFileName(driveFileName);
  const comicIsAnnual = isAnnualComic(comic);
  if (fileIsAnnual !== comicIsAnnual) {
    return 0;
  }

  // 3. Strip file extension and normalize "X of Y"
  let baseFileName = driveFileName.replace(/\.[^/.]+$/, '').trim();
  if (!baseFileName) return 0;
  baseFileName = baseFileName.replace(/\b(\d+)\s+of\s+\d+\b/gi, '$1');

  // 4. Year conflict check: if file contains a 4-digit year and comic has a known year
  const fileYearMatch = baseFileName.match(/\b(19\d\d|20\d\d)\b/);
  if (fileYearMatch) {
    const fileYear = parseInt(fileYearMatch[1], 10);
    let comicYear = comic.publicationYear ? Number(comic.publicationYear) : undefined;
    if (!comicYear && comic.seriesName) {
      const seriesYearMatch = String(comic.seriesName).match(/\b(19\d\d|20\d\d)\b/);
      if (seriesYearMatch) comicYear = parseInt(seriesYearMatch[1], 10);
    }
    if (comicYear && Math.abs(comicYear - fileYear) > 1) {
      return 0;
    }
  }

  // 5. Issue Number Matching
  let issueMatched = false;
  let isYearDesignatedMatch = false;

  if (comicIsAnnual) {
    const isYearAnnual = isYearDesignatedAnnual(comic);

    if (isYearAnnual) {
      // For year-designated annuals (e.g. Generation X Annual '97, X-Men Annual '95):
      // The year functions as the issue designation.
      let annualYear: string | null = null;
      if (comic.publicationYear) {
        annualYear = String(comic.publicationYear);
      }
      const titleYearMatch = `${comic.title || ''} ${comic.fullTitle || ''}`.match(/\bannual\s*['’`]?(\d{2,4})\b/i) ||
        `${comic.title || ''} ${comic.fullTitle || ''}`.match(/\b(?:19|20)(\d{2})\s*annual\b/i);
      if (titleYearMatch) {
        const y = titleYearMatch[1];
        if (!annualYear) {
          annualYear = y.length === 2 ? (parseInt(y, 10) < 50 ? `20${y}` : `19${y}`) : y;
        }
      }
      const rawIssue = String(comic.issueNumber || '').trim();
      if (!annualYear && /^['’`]?\d{2,4}$/.test(rawIssue)) {
        const y = rawIssue.replace(/['’`]/g, '');
        annualYear = y.length === 2 ? (parseInt(y, 10) < 50 ? `20${y}` : `19${y}`) : y;
      }

      if (annualYear) {
        const shortY = annualYear.slice(-2);
        const shortRegex = new RegExp(`(?:['’\`]|\\b)${shortY}\\b`);
        const fullRegex = new RegExp(`\\b${annualYear}\\b`);
        if (shortRegex.test(baseFileName) || fullRegex.test(baseFileName)) {
          issueMatched = true;
          isYearDesignatedMatch = true;
        }
      } else {
        const fileYearMatch = baseFileName.match(/(?:['’`]|\\b)(\d{2,4})\b/);
        if (fileYearMatch && `${comic.title || ''} ${comic.fullTitle || ''}`.includes(fileYearMatch[1])) {
          issueMatched = true;
          isYearDesignatedMatch = true;
        }
      }
    } else {
      // For sequentially numbered Annuals (e.g. Fantastic Four Annual #20):
      const annNum = extractAnnualNumber(comic);
      if (annNum !== null) {
        const annRegex = buildIssueRegex(String(annNum));
        if (annRegex && annRegex.test(baseFileName)) {
          issueMatched = true;
        }
      } else {
        const parsed = parseIssueNumber(comic.issueNumber);
        if (parsed.major > 0) {
          const annRegex = buildIssueRegex(String(parsed.major));
          if (annRegex && annRegex.test(baseFileName)) {
            issueMatched = true;
          }
        }
      }
    }
  } else {
    // For regular issues:
    const cleanIssueNumber = String(comic.issueNumber ?? '').replace(/^#/, '').trim();
    if (cleanIssueNumber) {
      const issueRegex = buildIssueRegex(cleanIssueNumber);
      if (!issueRegex || !issueRegex.test(baseFileName)) {
        return 0;
      }
      issueMatched = true;
    } else {
      issueMatched = true;
    }
  }

  if (!issueMatched) {
    return 0;
  }

  // 6. Title Extraction from File Name
  let fileTitleRaw = baseFileName;

  // Strip issue number from fileTitleRaw to isolate the title portion
  if (comicIsAnnual) {
    if (!isYearDesignatedAnnual(comic)) {
      const parsed = parseIssueNumber(comic.issueNumber);
      const annNum = extractAnnualNumber(comic) ?? (parsed.major > 0 ? parsed.major : null);
      if (annNum !== null) {
        const annRegex = buildIssueRegex(String(annNum));
        if (annRegex) fileTitleRaw = fileTitleRaw.replace(annRegex, ' ');
      }
    }
  } else {
    const cleanIssueNumber = String(comic.issueNumber ?? '').replace(/^#/, '').trim();
    if (cleanIssueNumber) {
      const issueRegex = buildIssueRegex(cleanIssueNumber);
      if (issueRegex) fileTitleRaw = fileTitleRaw.replace(issueRegex, ' ');
    }
  }

  const normFileTitle = normalizeText(fileTitleRaw);
  const normFileTitleNoVariant = normalizeText(fileTitleRaw.replace(COVER_VARIANT_DESCRIPTORS_REGEX, ' '));
  const normFileTitleNoYear = normalizeText(stripYear(normFileTitleNoVariant));
  const denseFile = denseText(normFileTitleNoVariant);

  // 7. Candidate Titles from Comic
  const candidateTitles = new Set<string>();

  const addCandidate = (val?: string) => {
    if (!val) return;
    const n = normalizeText(val);
    const s = normalizeText(stripYear(val));
    if (n) candidateTitles.add(n);
    if (s) candidateTitles.add(s);
  };

  addCandidate(comic.title);
  addCandidate(comic.seriesName);
  if (comic.fullTitle) {
    addCandidate(comic.fullTitle.replace(/#\s*\S+.*$/, ''));
  }

  // For Annuals: ensure both "Title Annual" and "Title" (if Annual is in format/series) are available
  if (comicIsAnnual) {
    if (comic.title && !/\bannual\b/i.test(comic.title)) {
      addCandidate(`${comic.title} Annual`);
    }
    if (comic.seriesName && !/\bannual\b/i.test(comic.seriesName)) {
      addCandidate(`${comic.seriesName} Annual`);
    }
    if (comic.title && /\bannual\b/i.test(comic.title)) {
      addCandidate(comic.title.replace(/\bannual\b/gi, ' '));
    }
    if (isYearDesignatedAnnual(comic) && comic.title) {
      addCandidate(comic.title.replace(/['’`]?\d{2,4}\b/g, ' '));
    }
  }

  // Add volume variations if volume is known
  const cleanVol = comic.volume ? String(comic.volume).replace(/[^0-9]/g, '') : '';
  if (cleanVol && comic.title) {
    addCandidate(`${comic.title} v${cleanVol}`);
    addCandidate(`${comic.title} vol ${cleanVol}`);
    addCandidate(`${comic.title} volume ${cleanVol}`);
  }

  // 8. Title Scoring
  let bestScore = 0;

  for (const cand of candidateTitles) {
    if (!cand) continue;
    const denseCand = denseText(cand);

    const noTheCand = cand.replace(/^the\s+/, '');
    const noTheFile = normFileTitle.replace(/^the\s+/, '');
    const noTheFileNoVariant = normFileTitleNoVariant.replace(/^the\s+/, '');
    const noTheFileNoYear = normFileTitleNoYear.replace(/^the\s+/, '');

    // Tier 1: Exact Match (Score 100)
    if (normFileTitle === cand || normFileTitleNoVariant === cand) {
      bestScore = Math.max(bestScore, 100);
      break;
    }

    // Tier 2: Exact Match ignoring leading "The" (Score 95)
    if (noTheFile === noTheCand || noTheFileNoVariant === noTheCand) {
      bestScore = Math.max(bestScore, 95);
      continue;
    }

    // Tier 3: Dense text match for hyphenated / punctuated titles (Score 95)
    // e.g. "G.I. Joe" vs "GI Joe", "Spider-Man" vs "Spider Man"
    if (denseFile === denseCand && denseFile.length >= 3) {
      bestScore = Math.max(bestScore, 95);
      continue;
    }

    // Tier 4: Exact Match with Volume / Publication Year in filename (Score 90)
    if (normFileTitleNoYear === cand || noTheFileNoYear === noTheCand) {
      bestScore = Math.max(bestScore, 90);
      continue;
    }

    // Tier 5: Year-designated Annual Match (Score 80)
    if (comicIsAnnual && isYearDesignatedMatch) {
      const candNoAnnual = cand.replace(/\bannual\b/gi, '').replace(/\b(?:19|20)?\d{2}\b/g, '').trim();
      const fileNoAnnual = normFileTitleNoYear.replace(/\bannual\b/gi, '').replace(/\b(?:19|20)?\d{2}\b/g, '').trim();
      if (
        candNoAnnual && fileNoAnnual &&
        (candNoAnnual === fileNoAnnual || candNoAnnual.replace(/^the\s+/, '') === fileNoAnnual.replace(/^the\s+/, ''))
      ) {
        bestScore = Math.max(bestScore, 80);
        continue;
      }
    }
  }

  return bestScore;
}

/**
 * Matches a Google Drive file name against a comic book's title, issue number, and volume.
 * Requires a high-confidence match (score >= 70) with strict Annual and title alignment.
 */
export function doesFileNameMatchComic(
  driveFileName: string,
  comicTitle: string,
  issueNumber: string | number,
  volume?: string | number,
  seriesName?: string,
  fullTitle?: string,
  publicationYear?: number,
  comicObj?: Partial<ComicBook>
): boolean {
  const comic: Partial<ComicBook> = comicObj || {
    title: comicTitle,
    issueNumber: String(issueNumber ?? ''),
    volume: volume !== undefined ? String(volume) : undefined,
    seriesName,
    fullTitle,
    publicationYear: publicationYear ? Number(publicationYear) : undefined,
  };

  const score = scoreFileNameMatch(driveFileName, comic);
  return score >= 70;
}

/**
 * Evaluates candidate comics for a Google Drive file name and returns
 * the best matching comic book, scoring exact matches first and strictly rejecting
 * mismatches (such as Annuals vs baseline issues or unrelated sub-series).
 */
export function findBestMatchingComic(
  driveFileName: string,
  candidateComics: ComicBook[],
  assignedSet?: Set<string>,
  minScore: number = 70
): ComicBook | null {
  if (!driveFileName || !candidateComics || candidateComics.length === 0) return null;

  let bestComic: ComicBook | null = null;
  let bestScore = 0;
  let bestIsUnassigned = false;

  for (const comic of candidateComics) {
    const score = scoreFileNameMatch(driveFileName, comic);
    if (score < minScore) continue;

    const isUnassigned = assignedSet ? !assignedSet.has(comic.id) : true;

    // 1. Higher score always wins
    // 2. If scores are equal, unassigned comic wins over assigned comic
    if (
      score > bestScore ||
      (score === bestScore && isUnassigned && !bestIsUnassigned)
    ) {
      bestScore = score;
      bestComic = comic;
      bestIsUnassigned = isUnassigned;
    }
  }

  return bestComic;
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
    if (dataUrl.length < 250000) {
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
