import sharp from 'sharp';
import { ComicBook } from '../../src/types';
import {
  hasFullCoverWord,
  parseStrictFullCoverFileName,
  scoreFullCoverMatch,
  findBestMatchingComic,
} from '../../src/utils/imageUtils';
import {
  isAnnualComic,
  extractAnnualNumber,
  parseIssueNumber,
} from '../../src/utils/comicSortUtils';
import { parseTitleAndIssue } from '../../src/utils/titleParser';
import { FIREBASE_STORAGE_BUCKET } from '../firebaseAdmin';

export interface LocalCoverFileEntry {
  filePath: string;
  fileName: string;
  sizeBytes?: number;
}

export interface MatchedCoverAssignment {
  file: LocalCoverFileEntry;
  comicId: string;
  comicTitle: string;
  comicIssueNumber: string;
  coverType: 'front' | 'full';
  storagePath: string;
  publicUrl: string;
}

export interface BatchCoverMatchResult {
  matchedFrontCovers: MatchedCoverAssignment[];
  matchedFullCovers: MatchedCoverAssignment[];
  unmatchedFiles: LocalCoverFileEntry[];
  ignoredPlaceholderFiles: LocalCoverFileEntry[];
}

export const FRONT_COVER_MAX_WIDTH = 400;
export const FRONT_COVER_WEBP_QUALITY = 75;
export const FULL_COVER_MAX_WIDTH = 900;
export const FULL_COVER_WEBP_QUALITY = 78;

export function buildFirebaseStoragePublicUrl(
  storagePath: string,
  bucketName: string = FIREBASE_STORAGE_BUCKET
): string {
  const cleanPath = storagePath.replace(/^\/+/, '');
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(cleanPath)}?alt=media`;
}

/**
 * Compresses an input image buffer into a lightweight, web-optimized .webp buffer.
 * - Standard front covers ('front'): max width 400px, quality 75 (~35-55 KB)
 * - Full wraparound covers ('full'): max width 900px, quality 78 (~80-120 KB)
 * Raw multi-megabyte source files are never uploaded to Firebase Cloud Storage.
 */
export async function compressCoverBufferToWebp(
  inputBuffer: Buffer,
  coverType: 'front' | 'full'
): Promise<Buffer> {
  const maxWidth = coverType === 'full' ? FULL_COVER_MAX_WIDTH : FRONT_COVER_MAX_WIDTH;
  const quality = coverType === 'full' ? FULL_COVER_WEBP_QUALITY : FRONT_COVER_WEBP_QUALITY;

  return sharp(inputBuffer)
    .rotate() // Auto-orient based on EXIF if present
    .resize({
      width: maxWidth,
      withoutEnlargement: true,
      fit: 'inside',
    })
    .webp({
      quality,
      effort: 4,
    })
    .toBuffer();
}

/**
 * Matches a directory of local cover image files against the comic catalog using the
 * multi-pass indexed matching engine from GoogleDriveCoversModal & imageUtils:
 *  - Isolates NoImage.webp placeholders
 *  - Separates Full Wraparound covers (`hasFullCoverWord`) from Standard Front covers
 *  - Pass 0: Exact Comic ID filename match (`{comicId}.webp` or `{comicId}_full.webp`)
 *  - Pass 1: Strict Full Cover scoring (`parseStrictFullCoverFileName` + `scoreFullCoverMatch >= 70`)
 *  - Pass 2: Standard Front Cover Exact Matches (`score >= 90`)
 *  - Pass 3: Standard Front Cover High-Confidence Matches (`score >= 70`)
 */
export interface MatchableComic {
  id: string;
  title: string;
  issueNumber: string | number;
  volume?: string | number | null;
  seriesName?: string | null;
  fullTitle?: string | null;
  publicationYear?: number | null;
  [key: string]: unknown;
}

export function matchLocalCoverFilesToComics(
  files: LocalCoverFileEntry[],
  comics: MatchableComic[],
  bucketName: string = FIREBASE_STORAGE_BUCKET
): BatchCoverMatchResult {
  const ignoredPlaceholderFiles: LocalCoverFileEntry[] = [];
  const candidateFiles: LocalCoverFileEntry[] = [];

  for (const f of files) {
    const lower = f.fileName.toLowerCase().trim();
    if (lower === 'noimage.webp' || lower.includes('noimage')) {
      ignoredPlaceholderFiles.push(f);
    } else {
      candidateFiles.push(f);
    }
  }

  const comicsById = new Map<string, ComicBook>();
  const comicsByIssue = new Map<string, ComicBook[]>();

  const addIndex = (key: string, comic: ComicBook) => {
    if (!key) return;
    const k = key.toLowerCase().trim();
    if (!comicsByIssue.has(k)) comicsByIssue.set(k, []);
    const bucket = comicsByIssue.get(k)!;
    if (!bucket.includes(comic)) {
      bucket.push(comic);
    }
  };

  const normalizedComics = comics as unknown as ComicBook[];

  for (const c of normalizedComics) {
    comicsById.set(c.id.toLowerCase(), c);

    const rawIssue = String(c.issueNumber ?? '').replace(/^#/, '').trim();
    addIndex(rawIssue, c);
    if (rawIssue.includes('/')) {
      addIndex(rawIssue.replace('/', ' '), c);
      addIndex(rawIssue.replace('/', '-'), c);
      addIndex(rawIssue.replace('/', '_'), c);
    }
    if (rawIssue.startsWith('-')) {
      addIndex(rawIssue.slice(1), c);
    }

    const parsed = parseIssueNumber(c.issueNumber);
    if (parsed.major > 0) {
      addIndex(String(parsed.major), c);
    }
    if (parsed.isRange) {
      addIndex(String(parsed.minor), c);
    }

    if (isAnnualComic(c)) {
      const annNum = extractAnnualNumber(c);
      if (annNum !== null) {
        addIndex(String(annNum), c);
        addIndex(`annual ${annNum}`, c);
      }
      if (c.publicationYear) {
        addIndex(String(c.publicationYear), c);
        addIndex(String(c.publicationYear).slice(-2), c);
      }
      const titleYearMatch = `${c.title || ''} ${c.fullTitle || ''}`.match(
        /\bannual\s*['’`]?(\d{2,4})\b/i
      );
      if (titleYearMatch) {
        const yStr = titleYearMatch[1];
        addIndex(yStr, c);
        if (yStr.length === 2) {
          const fullY = parseInt(yStr, 10) < 50 ? `20${yStr}` : `19${yStr}`;
          addIndex(fullY, c);
        }
      }
    }
  }

  const getCandidatesForFileName = (fileName: string): ComicBook[] => {
    const base = fileName.replace(/\.[^/.]+$/, '').trim();
    const candidateSet = new Set<ComicBook>();

    // 1. Parse issue via parseTitleAndIssue
    const parsed = parseTitleAndIssue(base);
    if (parsed.issueNumber) {
      const cleanP = String(parseInt(parsed.issueNumber.replace(/^#/, ''), 10));
      const list1 = comicsByIssue.get(cleanP);
      if (list1) for (const c of list1) candidateSet.add(c);
      const list2 = comicsByIssue.get(parsed.issueNumber.toLowerCase().trim());
      if (list2) for (const c of list2) candidateSet.add(c);
    }

    // 2. Explicit '#<num>' matches
    const hashMatches = base.matchAll(/#\s*(-?\d+[a-zA-Z0-9.-]*(?:[\s\-_/]+\d+)?)/gi);
    for (const hm of hashMatches) {
      const rawH = hm[1].toLowerCase().trim();
      const listRaw = comicsByIssue.get(rawH);
      if (listRaw) for (const c of listRaw) candidateSet.add(c);
      if (rawH.includes(' ') || rawH.includes('-') || rawH.includes('_')) {
        const withSlash = rawH.replace(/[\s\-_]+/g, '/');
        const listSlash = comicsByIssue.get(withSlash);
        if (listSlash) for (const c of listSlash) candidateSet.add(c);
      }
      const cleanH = String(parseInt(hm[1].replace(/^#/, ''), 10));
      const listInt = comicsByIssue.get(cleanH);
      if (listInt) for (const c of listInt) candidateSet.add(c);
    }

    // 3. Remaining numeric tokens (excluding volumes and 4-digit years)
    const baseNoVolOrYear = base
      .replace(/(?:[\(\[]\s*)?\b(?:vol|volume|v)\.?\s*\d+\b(?:\s*[\)\]])?/gi, ' ')
      .replace(/\b(19\d\d|20\d\d)\b/g, ' ');
    const numMatches = baseNoVolOrYear.match(/(?:#|\b)(\d+)\b/g) || [];
    for (const m of numMatches) {
      const cleanM = String(parseInt(m.replace(/^#/, ''), 10));
      const list = comicsByIssue.get(cleanM);
      if (list) {
        for (const c of list) candidateSet.add(c);
      }
    }

    const year2Match = base.match(/['’`](\d{2})\b/);
    if (year2Match) {
      const list = comicsByIssue.get(year2Match[1]);
      if (list) {
        for (const c of list) candidateSet.add(c);
      }
    }

    if (candidateSet.size === 0) {
      return normalizedComics;
    }
    return Array.from(candidateSet);
  };

  const assignedFrontSet = new Set<string>();
  const assignedFullSet = new Set<string>();
  const fileAssignmentMap = new Map<string, MatchedCoverAssignment>();

  const recordAssignment = (
    file: LocalCoverFileEntry,
    comic: ComicBook,
    coverType: 'front' | 'full'
  ) => {
    const storagePath =
      coverType === 'full'
        ? `covers/master-full/${comic.id}.webp`
        : `covers/master/${comic.id}.webp`;
    fileAssignmentMap.set(file.filePath, {
      file,
      comicId: comic.id,
      comicTitle: comic.title,
      comicIssueNumber: String(comic.issueNumber ?? ''),
      coverType,
      storagePath,
      publicUrl: buildFirebaseStoragePublicUrl(storagePath, bucketName),
    });
    if (coverType === 'full') {
      assignedFullSet.add(comic.id);
    } else {
      assignedFrontSet.add(comic.id);
    }
  };

  // Pass 0: Exact Comic ID match (e.g. "csv-8f92a1bc.webp" or "csv-8f92a1bc_full.webp")
  for (const file of candidateFiles) {
    const base = file.fileName.replace(/\.[^/.]+$/, '').trim().toLowerCase();
    const isFullSuffix = base.endsWith('_full') || base.endsWith('-full');
    const cleanId = isFullSuffix ? base.replace(/[_-]full$/, '') : base;
    const directComic = comicsById.get(cleanId);
    if (directComic) {
      recordAssignment(file, directComic, isFullSuffix || hasFullCoverWord(file.fileName) ? 'full' : 'front');
    }
  }

  // Pass 1: Full Wraparound Covers (`hasFullCoverWord`)
  for (const file of candidateFiles) {
    if (fileAssignmentMap.has(file.filePath)) continue;
    if (!hasFullCoverWord(file.fileName)) continue;

    const parsed = parseStrictFullCoverFileName(file.fileName);
    if (!parsed.isStrictFullCover) continue;

    const candidates = parsed.normalizedFileNameForMatch
      ? getCandidatesForFileName(parsed.normalizedFileNameForMatch)
      : normalizedComics;

    let bestCandidate: ComicBook | null = null;
    let bestScore = 0;

    const searchPool = candidates.length > 0 ? candidates : normalizedComics;
    for (const c of searchPool) {
      const score = scoreFullCoverMatch(parsed, c);
      if (score < 70) continue;
      const isUnassigned = !assignedFullSet.has(c.id);
      if (
        score > bestScore ||
        (score === bestScore && isUnassigned && bestCandidate && assignedFullSet.has(bestCandidate.id))
      ) {
        bestScore = score;
        bestCandidate = c;
      }
    }

    // Fallback to full comics list if indexed pool missed an annual/special match
    if (!bestCandidate && searchPool !== normalizedComics) {
      for (const c of normalizedComics) {
        const score = scoreFullCoverMatch(parsed, c);
        if (score < 70) continue;
        const isUnassigned = !assignedFullSet.has(c.id);
        if (
          score > bestScore ||
          (score === bestScore && isUnassigned && bestCandidate && assignedFullSet.has(bestCandidate.id))
        ) {
          bestScore = score;
          bestCandidate = c;
        }
      }
    }

    if (bestCandidate) {
      recordAssignment(file, bestCandidate, 'full');
    }
  }

  // Pass 2: Standard Front Covers — Exact Matches (Score >= 90)
  for (const file of candidateFiles) {
    if (fileAssignmentMap.has(file.filePath)) continue;
    if (hasFullCoverWord(file.fileName)) continue;

    const candidates = getCandidatesForFileName(file.fileName);
    const match = findBestMatchingComic(file.fileName, candidates, assignedFrontSet, 90);
    if (match) {
      recordAssignment(file, match, 'front');
    }
  }

  // Pass 3: Standard Front Covers — High-Confidence Matches (Score >= 70)
  for (const file of candidateFiles) {
    if (fileAssignmentMap.has(file.filePath)) continue;
    if (hasFullCoverWord(file.fileName)) continue;

    const candidates = getCandidatesForFileName(file.fileName);
    const match = findBestMatchingComic(file.fileName, candidates, assignedFrontSet, 70);
    if (match) {
      recordAssignment(file, match, 'front');
    }
  }

  const matchedFrontCovers: MatchedCoverAssignment[] = [];
  const matchedFullCovers: MatchedCoverAssignment[] = [];
  const unmatchedFiles: LocalCoverFileEntry[] = [];

  for (const file of candidateFiles) {
    const assignment = fileAssignmentMap.get(file.filePath);
    if (!assignment) {
      unmatchedFiles.push(file);
    } else if (assignment.coverType === 'full') {
      matchedFullCovers.push(assignment);
    } else {
      matchedFrontCovers.push(assignment);
    }
  }

  return {
    matchedFrontCovers,
    matchedFullCovers,
    unmatchedFiles,
    ignoredPlaceholderFiles,
  };
}

/**
 * Pure helper to build the Firestore update payloads for `master_comics/{comicId}`
 * and `users/{adminUid}/comics/{comicId}` when a compressed .webp master cover is uploaded.
 *
 * CRITICAL INVARIANT:
 * - `master_comics` receives the compressed Firebase Storage .webp URL (`coverImage` / `coverImageFull`).
 * - `users/{adminUid}/comics` updates `masterCoverImage` / `masterCoverImageFull`, while
 *   strictly preserving `coverImageOverride` / `coverImageFullOverride` so the Admin's
 *   high-quality cloud/Google Drive images remain active in their personal collection.
 */
export function buildMasterAndAdminCoverUpdatePayloads(
  existingAdminComic: {
    coverImageOverride?: string | null;
    coverImageFullOverride?: string | null;
    masterCoverImage?: string | null;
    masterCoverImageFull?: string | null;
  } | null,
  updates: {
    frontPublicUrl?: string;
    fullPublicUrl?: string;
  },
  nowIso = new Date().toISOString()
): {
  masterUpdate: Record<string, unknown>;
  adminComicUpdate: Record<string, unknown>;
} {
  const masterUpdate: Record<string, unknown> = {
    updatedAt: nowIso,
  };
  const adminComicUpdate: Record<string, unknown> = {
    updatedAt: nowIso,
  };

  if (updates.frontPublicUrl) {
    masterUpdate.coverImage = updates.frontPublicUrl;
    adminComicUpdate.masterCoverImage = updates.frontPublicUrl;
    // Only update effective `coverImage` on Admin's userComic if Admin does NOT have a high-res override
    const existingFrontOverride = existingAdminComic?.coverImageOverride || null;
    adminComicUpdate.coverImage = existingFrontOverride || updates.frontPublicUrl;
  }

  if (updates.fullPublicUrl) {
    masterUpdate.coverImageFull = updates.fullPublicUrl;
    adminComicUpdate.masterCoverImageFull = updates.fullPublicUrl;
    const existingFullOverride = existingAdminComic?.coverImageFullOverride || null;
    adminComicUpdate.coverImageFull = existingFullOverride || updates.fullPublicUrl;
  }

  return { masterUpdate, adminComicUpdate };
}
