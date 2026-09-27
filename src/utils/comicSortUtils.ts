import { ComicBook } from '../types';
import { parseTitleAndIssue } from './titleParser';

export interface ParsedIssueNumber {
  prefix: string; // E.g. 'annual', 'tpb', 'special', etc.
  major: number; // Primary numeric value: 1, 2, 0.5 (for 1/2), 300, etc.
  minor: number; // Secondary numeric value (for ranges like 1-13 -> 13)
  suffix: string; // Suffix letters or variant labels: 'a', 'b', 'variant', etc.
  isRange: boolean;
  isText: boolean; // Pure text without leading numbers or labels
  raw: string;
}

/**
 * Robustly parses any comic issue number format:
 * - Clean integers: "1", "2", "300"
 * - Leading hashes: "#1", "#300"
 * - Decimals: "1.5", "10.1", "0.5"
 * - Fractions: "1/2" -> 0.5, "3/4" -> 0.75
 * - Letter suffixes: "1A", "1B", "1-A", "1 (Variant)"
 * - Multi-issue ranges: "1-13", "#1-13 Set", "#227-233"
 * - Prefixed/named issues: "Annual 1", "TPB 1", "Special #2", "Vol. 1"
 * - Non-numeric: "Deluxe HC", "One-Shot", "Graphic Novel"
 */
export function parseIssueNumber(val?: string | number): ParsedIssueNumber {
  if (val === undefined || val === null) {
    return { prefix: '', major: 0, minor: 0, suffix: '', isRange: false, isText: true, raw: '' };
  }
  let str = String(val).trim();
  if (!str) {
    return { prefix: '', major: 0, minor: 0, suffix: '', isRange: false, isText: true, raw: '' };
  }

  // Strip leading '#' if present: '#1' -> '1', '# 300' -> '300'
  str = str.replace(/^#\s*/, '');

  // Fractions like 1/2, 3/4
  const fracMatch = str.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fracMatch) {
    const num = parseInt(fracMatch[1], 10) / parseInt(fracMatch[2], 10);
    return { prefix: '', major: num, minor: 0, suffix: '', isRange: false, isText: false, raw: String(val) };
  }

  // Ranges like 1-13, 1-4, 227-233, 1-13 Set
  const rangeMatch = str.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)(.*)$/);
  if (rangeMatch) {
    return {
      prefix: '',
      major: parseFloat(rangeMatch[1]),
      minor: parseFloat(rangeMatch[2]),
      suffix: rangeMatch[3].trim().toLowerCase(),
      isRange: true,
      isText: false,
      raw: String(val),
    };
  }

  // Label prefix like 'Annual 1', 'TPB 2', 'Vol. 1', 'Special #3', 'Giant-Size #1'
  const labelMatch = str.match(/^([a-zA-Z\s.-]+?)\s*#?\s*(\d+(?:\.\d+)?)(.*)$/);
  if (labelMatch && isNaN(Number(str))) {
    return {
      prefix: labelMatch[1].trim().toLowerCase(),
      major: parseFloat(labelMatch[2]),
      minor: 0,
      suffix: labelMatch[3].trim().toLowerCase(),
      isRange: false,
      isText: false,
      raw: String(val),
    };
  }

  // Standard issue starting with number, with optional decimal and suffix
  const standardMatch = str.match(/^(\d+(?:\.\d+)?)(.*)$/);
  if (standardMatch) {
    return {
      prefix: '',
      major: parseFloat(standardMatch[1]),
      minor: 0,
      suffix: standardMatch[2].trim().toLowerCase(),
      isRange: false,
      isText: false,
      raw: String(val),
    };
  }

  // Purely text/non-numeric issue
  return { prefix: str.toLowerCase(), major: 0, minor: 0, suffix: '', isRange: false, isText: true, raw: String(val) };
}

/**
 * Natural numerical compare helper for comic issue numbers.
 * Orders numbers naturally: 0 < 1/2 < 1 < 1A < 1B < 2 < 10 < 100 < Annual 1.
 */
export function compareIssueNumbers(a?: string | number, b?: string | number): number {
  const pA = parseIssueNumber(a);
  const pB = parseIssueNumber(b);

  // Group: regular numbered (0) < prefixed like Annual/TPB (1) < pure text (2)
  const rank = (p: ParsedIssueNumber) => (p.isText ? 2 : p.prefix ? 1 : 0);
  const rankA = rank(pA);
  const rankB = rank(pB);
  if (rankA !== rankB) return rankA - rankB;

  // Compare prefix alphabetically if both are prefixed (e.g. Annual vs Special)
  if (pA.prefix !== pB.prefix) {
    return pA.prefix.localeCompare(pB.prefix, undefined, { numeric: true, sensitivity: 'base' });
  }

  // Compare major numeric value
  if (pA.major !== pB.major) {
    return pA.major - pB.major;
  }

  // An issue with no suffix comes before one with suffix (e.g. '1' comes before '1A' or '1-13')
  if (!pA.suffix && pB.suffix) return -1;
  if (pA.suffix && !pB.suffix) return 1;

  // Compare range endpoint / minor value if present
  if (pA.minor !== pB.minor) {
    return pA.minor - pB.minor;
  }

  // Compare suffixes
  if (pA.suffix !== pB.suffix) {
    return pA.suffix.localeCompare(pB.suffix, undefined, { numeric: true, sensitivity: 'base' });
  }

  return pA.raw.localeCompare(pB.raw, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Extracts numeric volume from strings like "Vol. 1", "Volume 2", "v3", "1".
 */
export function parseVolumeNumber(val?: string | number): number | null {
  if (val === undefined || val === null) return null;
  const str = String(val).trim();
  if (!str) return null;
  const match = str.match(/\d+(?:\.\d+)?/);
  return match ? parseFloat(match[0]) : null;
}

/**
 * Resolves the primary title of a comic book for sorting and display.
 */
export function getComicTitle(comic: Partial<ComicBook>): string {
  if (comic.title && comic.title.trim()) return comic.title.trim();
  if (comic.seriesName && comic.seriesName.trim()) return comic.seriesName.trim();
  if (comic.fullTitle && comic.fullTitle.trim()) {
    const parsed = parseTitleAndIssue(comic.fullTitle);
    return parsed.cleanTitle || comic.fullTitle.trim();
  }
  return '';
}

/**
 * Compares two comic books primarily by title, and secondarily by volume & issue number.
 * This guarantees that comics belonging to the same series/title are always ordered
 * numerically by issue number.
 */
export function compareComicsByTitleAndIssue(a: ComicBook, b: ComicBook): number {
  const titleA = getComicTitle(a);
  const titleB = getComicTitle(b);
  const titleCmp = titleA.localeCompare(titleB, undefined, { numeric: true, sensitivity: 'base' });
  if (titleCmp !== 0) return titleCmp;

  // If titles match, compare Volume if available
  const volA = parseVolumeNumber(a.volume);
  const volB = parseVolumeNumber(b.volume);
  if (volA !== null && volB !== null && volA !== volB) {
    return volA - volB;
  }

  // If seriesName is present and differs (e.g. different publication years for the same series title)
  if (a.seriesName && b.seriesName && a.seriesName !== b.seriesName) {
    const sCmp = a.seriesName.localeCompare(b.seriesName, undefined, { numeric: true, sensitivity: 'base' });
    if (sCmp !== 0) return sCmp;
  }

  // Compare issue numbers naturally (e.g. 1, 2, 10, 100)
  const issueCmp = compareIssueNumbers(a.issueNumber, b.issueNumber);
  if (issueCmp !== 0) return issueCmp;

  // Tie-breakers: publication year
  if (a.publicationYear && b.publicationYear && a.publicationYear !== b.publicationYear) {
    return a.publicationYear - b.publicationYear;
  }

  return (a.id || '').localeCompare(b.id || '');
}

/**
 * Returns a new array of comics sorted by Title, Volume, and Issue Number.
 */
export function sortComicsByTitleAndIssue(comics: ComicBook[]): ComicBook[] {
  if (!Array.isArray(comics)) return [];
  return [...comics].sort(compareComicsByTitleAndIssue);
}

/**
 * Safely parses integer issue number for stats/trackers, stripping '#' or extracting first integer.
 */
export function parseIntegerIssueNumber(val?: string | number): number {
  if (val === undefined || val === null) return NaN;
  const clean = String(val).trim().replace(/^#\s*/, '');
  const num = parseInt(clean, 10);
  return isNaN(num) ? NaN : num;
}
