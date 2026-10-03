import { ComicBook } from '../types';
import { MONTH_NAMES, MonthName, getMonthIndex } from './dateUtils';
import { parseIntegerIssueNumber, isAnnualComic } from './comicSortUtils';

export interface ProjectedIssueDate {
  publicationYear: number;
  publicationMonth?: MonthName;
  referenceComic?: ComicBook;
  isProjected: boolean;
}

/**
 * Projects the publication year and month for a target issue number in a series,
 * assuming a regular monthly release cadence (1 issue per month).
 * 
 * It anchors to the nearest existing series issue that has valid publication dates.
 */
export function projectSeriesIssueDate(
  targetIssueNumber: number,
  existingSeriesComics: ComicBook[]
): ProjectedIssueDate {
  // Filter for regular numbered comics (non-annuals) with valid year
  const candidates = existingSeriesComics.filter((c) => {
    if (isAnnualComic(c)) return false;
    const num = parseIntegerIssueNumber(c.issueNumber);
    if (isNaN(num)) return false;
    return typeof c.publicationYear === 'number' && c.publicationYear >= 1900 && c.publicationYear <= 2100;
  });

  if (candidates.length === 0) {
    // Fallback: any comic in the series with publicationYear
    const fallbackYearComic = existingSeriesComics.find(
      (c) => typeof c.publicationYear === 'number' && c.publicationYear >= 1900
    );
    return {
      publicationYear: fallbackYearComic?.publicationYear || new Date().getFullYear(),
      publicationMonth: undefined,
      isProjected: false,
    };
  }

  // Prefer candidates that have both year AND a valid month
  const withMonth = candidates.filter((c) => getMonthIndex(c.publicationMonth) > 0);
  const pool = withMonth.length > 0 ? withMonth : candidates;

  // Find candidate closest in issue number to targetIssueNumber
  let bestComic = pool[0];
  let bestDist = Math.abs(targetIssueNumber - parseIntegerIssueNumber(pool[0].issueNumber));

  for (let i = 1; i < pool.length; i++) {
    const dist = Math.abs(targetIssueNumber - parseIntegerIssueNumber(pool[i].issueNumber));
    if (dist < bestDist) {
      bestDist = dist;
      bestComic = pool[i];
    }
  }

  const refIssueNum = parseIntegerIssueNumber(bestComic.issueNumber);
  const refYear = bestComic.publicationYear;
  const refMonthIdx = getMonthIndex(bestComic.publicationMonth); // 1-12 or 0

  const issueDiff = targetIssueNumber - refIssueNum; // difference in months

  if (refMonthIdx > 0) {
    // 0-based month index (0 = January)
    const baseMonth0 = refMonthIdx - 1;
    const totalMonths = refYear * 12 + baseMonth0 + issueDiff;
    const projectedYear = Math.floor(totalMonths / 12);
    const projectedMonth0 = ((totalMonths % 12) + 12) % 12;
    const projectedMonth = MONTH_NAMES[projectedMonth0];

    return {
      publicationYear: projectedYear,
      publicationMonth: projectedMonth,
      referenceComic: bestComic,
      isProjected: true,
    };
  } else {
    // No month available on reference comic: assume mid-year (June / July) or calculate year offset
    const totalMonths = refYear * 12 + 6 + issueDiff;
    const projectedYear = Math.floor(totalMonths / 12);
    const projectedMonth0 = ((totalMonths % 12) + 12) % 12;
    const projectedMonth = MONTH_NAMES[projectedMonth0];

    return {
      publicationYear: projectedYear,
      publicationMonth: projectedMonth,
      referenceComic: bestComic,
      isProjected: true,
    };
  }
}

/**
 * Builds a default Wishlist ComicBook object for a missing issue in a series.
 */
export function buildMissingWishlistComic(options: {
  seriesName: string;
  issueNumber: number | string;
  publisher?: string;
  volume?: string;
  title?: string;
  genre?: string;
  writer?: string;
  artist?: string;
  publicationYear?: number;
  publicationMonth?: string;
}): ComicBook {
  const numStr = String(options.issueNumber).trim();
  const cleanTitle = (
    options.title ||
    options.seriesName
      .replace(/\s*\(Vol\.\s*\d+\)/i, '')
      .replace(/\s*\(\d{4}(?:\s*-\s*\d{4})?\)/i, '')
  ).trim();

  return {
    id: `c-wishlist-${Date.now()}-${numStr}-${Math.random().toString(36).substr(2, 6)}`,
    title: cleanTitle || 'Untitled Comic',
    seriesName: options.seriesName,
    issueNumber: numStr,
    volume: options.volume || undefined,
    publisher: options.publisher || 'Marvel Comics',
    publicationYear: options.publicationYear || new Date().getFullYear(),
    publicationMonth: options.publicationMonth || undefined,
    genre: options.genre || 'Superhero',
    writer: options.writer || '',
    artist: options.artist || '',
    format: 'Single Issue',
    sizeThickness: 1.0,
    currentBoxId: 0,
    readingStatus: 'Wishlist',
    copiesOwned: 0,
    readCount: 0,
    condition: 'Near Mint',
    coverImage: 'NoImage.png',
    notes: 'Auto-generated wishlist entry for missing series issue',
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
