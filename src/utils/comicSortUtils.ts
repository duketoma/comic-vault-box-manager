import { ComicBook } from '../types';
import { parseTitleAndIssue } from './titleParser';
import { compareComicDates } from './dateUtils';

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
 * - Prefixed/named issues: "Annual 1", "Annual '95", "TPB 1", "Special #2", "Vol. 1"
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

  // Label prefix like 'Annual 1', 'Annual '95', 'TPB 2', 'Vol. 1', 'Special #3', 'Giant-Size #1', 'Flashback #-1'
  const labelMatch = str.match(/^([a-zA-Z\s.'-]+?)\s*#?\s*'?(-?\d+(?:\.\d+)?)(.*)$/);
  if (labelMatch && isNaN(Number(str))) {
    const rawPrefix = labelMatch[1].replace(/['.]/g, '').trim().toLowerCase();
    const rawMajor = parseFloat(labelMatch[2]);
    return {
      prefix: rawPrefix,
      major: rawMajor,
      minor: 0,
      suffix: labelMatch[3].trim().toLowerCase(),
      isRange: false,
      isText: false,
      raw: String(val),
    };
  }

  // Standard issue starting with number (including negative numbers like -1), with optional decimal and suffix
  const standardMatch = str.match(/^(-?\d+(?:\.\d+)?)(.*)$/);
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
 * Checks whether a comic represents an Annual publication.
 * Detects annuals via issue number ('Annual 1', 'Annual #20'), title ('Fantastic Four Annual'),
 * fullTitle ('Fantastic Four Annual #20'), seriesName, or tags.
 */
export function isAnnualComic(comic?: Partial<ComicBook> | null): boolean {
  if (!comic) return false;

  // 1. Issue number prefix or text
  if (comic.issueNumber !== undefined && comic.issueNumber !== null) {
    const rawIssue = String(comic.issueNumber).trim();
    if (/\bannual\b/i.test(rawIssue)) return true;
    const parsed = parseIssueNumber(rawIssue);
    if (parsed.prefix.toLowerCase().includes('annual')) return true;
  }

  // 2. Comic Title (e.g. "Fantastic Four Annual")
  if (comic.title && /\bannual\b/i.test(comic.title)) {
    return true;
  }

  // 3. Full Title (e.g. "Fantastic Four Annual #20")
  if (comic.fullTitle && /\bannual\b/i.test(comic.fullTitle)) {
    return true;
  }

  // 4. Series Name (if series itself contains Annual)
  if (comic.seriesName && /\bannual\b/i.test(comic.seriesName)) {
    return true;
  }

  // 5. Tags
  if (Array.isArray(comic.tags) && comic.tags.some(t => /\bannual\b/i.test(t))) {
    return true;
  }

  // 6. Format
  if ((comic as any).format && /\bannual\b/i.test(String((comic as any).format))) {
    return true;
  }

  return false;
}

/**
 * Checks whether an Annual comic has a year-based designation (e.g. "Annual '95", "Annual 1998", "1997 Annual")
 * rather than a standard sequential integer issue number (e.g. "Annual #4").
 */
export function isYearDesignatedAnnual(comic?: Partial<ComicBook> | null): boolean {
  if (!comic) return false;
  const full = [comic.title, comic.fullTitle, comic.issueNumber, comic.seriesName].filter(Boolean).join(' ');
  if (/\bannual\s*['’`]\d{2}\b/i.test(full)) return true;
  if (/\bannual\s*(?:19|20)\d{2}\b/i.test(full)) return true;
  if (/\b(?:19|20)\d{2}\s*annual\b/i.test(full)) return true;
  if (comic.issueNumber !== undefined && comic.issueNumber !== null) {
    const rawIssue = String(comic.issueNumber).trim();
    if (/^['’`]\d{2}$/.test(rawIssue)) return true;
    if (/^(?:19|20)\d{2}$/.test(rawIssue)) return true;
  }
  return false;
}

/**
 * Extracts a numeric issue number for a sequentially numbered Annual (e.g. "Silver Surfer Annual #4" -> 4).
 * Returns null if the comic is not an annual, is a year-designated annual, or does not have a valid positive integer number.
 */
export function extractAnnualNumber(comic?: Partial<ComicBook> | null): number | null {
  if (!comic || !isAnnualComic(comic) || isYearDesignatedAnnual(comic)) return null;

  // 1. Try to find "Annual #<num>" or "Annual <num>" in fullTitle or title
  const full = `${comic.fullTitle || ''} ${comic.title || ''}`;
  const annualNumMatch = full.match(/\bannual\s*#?\s*(\d+)\b/i);
  if (annualNumMatch) {
    const n = parseInt(annualNumMatch[1], 10);
    if (!isNaN(n) && n > 0) return n;
  }

  // 2. Try issueNumber if it is a clean integer or prefixed annual
  if (comic.issueNumber !== undefined && comic.issueNumber !== null) {
    const rawIssue = String(comic.issueNumber).replace(/^#\s*/, '').trim();
    const parsed = parseIssueNumber(rawIssue);
    if (!parsed.isText && parsed.major > 0 && Number.isInteger(parsed.major)) {
      return parsed.major;
    }
  }

  return null;
}

/**
 * Extracts a numeric value for ordering annuals among themselves.
 * Handles issue numbers (#20, Annual 1) and year designations (Annual '95 -> 1995, Annual 1998 -> 1998).
 */
export function getAnnualNumericValue(comic: Partial<ComicBook>): number {
  if (comic.issueNumber !== undefined && comic.issueNumber !== null) {
    const parsed = parseIssueNumber(comic.issueNumber);
    if (parsed.major > 1) {
      return parsed.major;
    }
    if (parsed.prefix.toLowerCase().includes('annual') && parsed.major >= 1) {
      return parsed.major;
    }
  }

  // Extract from title or fullTitle (e.g. "Generation X Annual '95" -> 1995, "Fantastic Four Annual #20" -> 20)
  const titleStr = `${comic.title || ''} ${comic.fullTitle || ''}`;
  const yearApostropheMatch = titleStr.match(/annual\s+'(\d{2})\b/i);
  if (yearApostropheMatch) {
    const y = parseInt(yearApostropheMatch[1], 10);
    return y < 50 ? 2000 + y : 1900 + y;
  }

  const year4DigitMatch = titleStr.match(/annual\s+(?:19|20)(\d{2})\b/i);
  if (year4DigitMatch) {
    return parseInt(year4DigitMatch[0].replace(/\D/g, ''), 10);
  }

  const numMatch = titleStr.match(/annual\s+#?(\d+)/i);
  if (numMatch) {
    return parseFloat(numMatch[1]);
  }

  if (comic.issueNumber !== undefined && comic.issueNumber !== null) {
    const parsed = parseIssueNumber(comic.issueNumber);
    if (parsed.major >= 1) return parsed.major;
  }

  return 0;
}

/**
 * Compares two annual comics to order them correctly (e.g. Annual 1 < Annual 2 < Annual '95 < Annual '96).
 */
export function compareAnnualComics(a: ComicBook, b: ComicBook): number {
  const numA = getAnnualNumericValue(a);
  const numB = getAnnualNumericValue(b);
  if (numA !== numB) {
    return numA - numB;
  }
  return compareIssueNumbers(a.issueNumber, b.issueNumber);
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
 * Natural issue number comparison with explicit Annuals separation support.
 * When separateAnnuals is true, regular issues (#1, #2, #300) come before Annuals (Annual #1, #2...).
 */
export function compareIssueNumbersWithAnnuals(
  a: ComicBook,
  b: ComicBook,
  separateAnnuals: boolean = true
): number {
  if (separateAnnuals) {
    const aAnnual = isAnnualComic(a);
    const bAnnual = isAnnualComic(b);
    if (aAnnual !== bAnnual) {
      // Regular issues (0) come before Annuals (1)
      return aAnnual ? 1 : -1;
    }
    if (aAnnual && bAnnual) {
      const annualCmp = compareAnnualComics(a, b);
      if (annualCmp !== 0) return annualCmp;
    }
  }

  return compareIssueNumbers(a.issueNumber, b.issueNumber);
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

  // Compare issue numbers naturally with annuals separation
  const issueCmp = compareIssueNumbersWithAnnuals(a, b, true);
  if (issueCmp !== 0) return issueCmp;

  // Tie-breakers: publication date / year
  const dateCmp = compareComicDates(a, b);
  if (dateCmp !== 0) return dateCmp;

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

/* ==========================================================================
   MULTI-SORT SYSTEM DEFINITIONS, PRESETS & COMPARATORS
   ========================================================================== */

export type ComicSortField =
  | 'publisher'
  | 'event'
  | 'seriesName'
  | 'issueNumber'
  | 'title'
  | 'publicationYear'
  | 'currentBoxId'
  | 'sizeThickness'
  | 'estimatedValue'
  | 'userRating'
  | 'readingStatus'
  | 'format'
  | 'genre'
  | 'writer'
  | 'artist';

export type SortDirection = 'asc' | 'desc';

export interface SortCriterion {
  id: string;
  field: ComicSortField;
  direction: SortDirection;
}

export interface MultiSortOptions {
  criteria: SortCriterion[];
  separateAnnuals: boolean; // default true
  emptyEventPlacement?: 'first' | 'last'; // default 'last'
}

export interface SortPreset {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  criteria: SortCriterion[];
  separateAnnuals: boolean;
  emptyEventPlacement?: 'first' | 'last';
}

export const SORT_PRESETS: SortPreset[] = [
  {
    id: 'box_organizer',
    label: 'Box Organizer (Publisher → Event → Series → Issue)',
    shortLabel: 'Box Organizer',
    description: 'Publisher, Crossover Event, Series Name, Issue Number (Annuals separate)',
    criteria: [
      { id: 'crit-pub', field: 'publisher', direction: 'asc' },
      { id: 'crit-evt', field: 'event', direction: 'asc' },
      { id: 'crit-series', field: 'seriesName', direction: 'asc' },
      { id: 'crit-issue', field: 'issueNumber', direction: 'asc' },
    ],
    separateAnnuals: true,
    emptyEventPlacement: 'last',
  },
  {
    id: 'series_issue',
    label: 'Series & Issue (Standard Run)',
    shortLabel: 'Series & Issue',
    description: 'Series Name, Issue Number (Annuals separate), Publication Year',
    criteria: [
      { id: 'crit-series', field: 'seriesName', direction: 'asc' },
      { id: 'crit-issue', field: 'issueNumber', direction: 'asc' },
      { id: 'crit-year', field: 'publicationYear', direction: 'asc' },
    ],
    separateAnnuals: true,
    emptyEventPlacement: 'last',
  },
  {
    id: 'publisher_series',
    label: 'Publisher & Series',
    shortLabel: 'Publisher & Series',
    description: 'Publisher, Series Name, Issue Number',
    criteria: [
      { id: 'crit-pub', field: 'publisher', direction: 'asc' },
      { id: 'crit-series', field: 'seriesName', direction: 'asc' },
      { id: 'crit-issue', field: 'issueNumber', direction: 'asc' },
    ],
    separateAnnuals: true,
    emptyEventPlacement: 'last',
  },
  {
    id: 'events_first',
    label: 'Crossover Events First',
    shortLabel: 'Crossover Events',
    description: 'Crossover Event, Series Name, Issue Number',
    criteria: [
      { id: 'crit-evt', field: 'event', direction: 'asc' },
      { id: 'crit-series', field: 'seriesName', direction: 'asc' },
      { id: 'crit-issue', field: 'issueNumber', direction: 'asc' },
    ],
    separateAnnuals: true,
    emptyEventPlacement: 'last',
  },
  {
    id: 'chronological',
    label: 'Chronological Release Date',
    shortLabel: 'Release Date',
    description: 'Publication Date (Oldest First), Series Name, Issue Number',
    criteria: [
      { id: 'crit-year', field: 'publicationYear', direction: 'asc' },
      { id: 'crit-series', field: 'seriesName', direction: 'asc' },
      { id: 'crit-issue', field: 'issueNumber', direction: 'asc' },
    ],
    separateAnnuals: true,
    emptyEventPlacement: 'last',
  },
  {
    id: 'value_desc',
    label: 'Estimated Value (Highest First)',
    shortLabel: 'Est. Value',
    description: 'Estimated market value from high to low',
    criteria: [
      { id: 'crit-val', field: 'estimatedValue', direction: 'desc' },
      { id: 'crit-series', field: 'seriesName', direction: 'asc' },
      { id: 'crit-issue', field: 'issueNumber', direction: 'asc' },
    ],
    separateAnnuals: true,
    emptyEventPlacement: 'last',
  },
  {
    id: 'storage_box',
    label: 'Storage Box Location',
    shortLabel: 'Storage Box',
    description: 'Storage Box # (0 to 15), Series Name, Issue Number',
    criteria: [
      { id: 'crit-box', field: 'currentBoxId', direction: 'asc' },
      { id: 'crit-series', field: 'seriesName', direction: 'asc' },
      { id: 'crit-issue', field: 'issueNumber', direction: 'asc' },
    ],
    separateAnnuals: true,
    emptyEventPlacement: 'last',
  },
  {
    id: 'rating_desc',
    label: 'User Rating (5 Stars First)',
    shortLabel: 'User Rating',
    description: 'Highest user rated issues first',
    criteria: [
      { id: 'crit-rating', field: 'userRating', direction: 'desc' },
      { id: 'crit-series', field: 'seriesName', direction: 'asc' },
      { id: 'crit-issue', field: 'issueNumber', direction: 'asc' },
    ],
    separateAnnuals: true,
    emptyEventPlacement: 'last',
  },
  {
    id: 'thickness_desc',
    label: 'Thickness / Size Units',
    shortLabel: 'Thickness',
    description: 'Thickest graphic novels / TPBs first',
    criteria: [
      { id: 'crit-thick', field: 'sizeThickness', direction: 'desc' },
      { id: 'crit-series', field: 'seriesName', direction: 'asc' },
      { id: 'crit-issue', field: 'issueNumber', direction: 'asc' },
    ],
    separateAnnuals: true,
    emptyEventPlacement: 'last',
  },
];

export const DEFAULT_MULTI_SORT_OPTIONS: MultiSortOptions = {
  criteria: [
    { id: 'crit-pub', field: 'publisher', direction: 'asc' },
    { id: 'crit-evt', field: 'event', direction: 'asc' },
    { id: 'crit-series', field: 'seriesName', direction: 'asc' },
    { id: 'crit-issue', field: 'issueNumber', direction: 'asc' },
  ],
  separateAnnuals: true,
  emptyEventPlacement: 'last',
};

export const SORT_FIELD_OPTIONS: { field: ComicSortField; label: string; group: string }[] = [
  { field: 'publisher', label: 'Publisher', group: 'Organization' },
  { field: 'event', label: 'Crossover Event', group: 'Organization' },
  { field: 'seriesName', label: 'Series Name', group: 'Title & Series' },
  { field: 'issueNumber', label: 'Issue Number', group: 'Title & Series' },
  { field: 'title', label: 'Comic Title', group: 'Title & Series' },
  { field: 'publicationYear', label: 'Publication Year / Date', group: 'Date & Logistics' },
  { field: 'currentBoxId', label: 'Storage Box #', group: 'Date & Logistics' },
  { field: 'sizeThickness', label: 'Size Units (Thickness)', group: 'Date & Logistics' },
  { field: 'estimatedValue', label: 'Estimated Value ($)', group: 'Collection Value' },
  { field: 'userRating', label: 'User Rating (★)', group: 'Collection Value' },
  { field: 'readingStatus', label: 'Reading Status', group: 'Status & Metadata' },
  { field: 'format', label: 'Format (Single, TPB, etc.)', group: 'Status & Metadata' },
  { field: 'genre', label: 'Genre', group: 'Status & Metadata' },
  { field: 'writer', label: 'Writer', group: 'Creators' },
  { field: 'artist', label: 'Artist', group: 'Creators' },
];

export function getSortFieldLabel(field: ComicSortField): string {
  const item = SORT_FIELD_OPTIONS.find(o => o.field === field);
  return item ? item.label : field;
}

export function getSortDirectionLabel(field: ComicSortField, direction: SortDirection): string {
  if (direction === 'asc') {
    switch (field) {
      case 'issueNumber':
        return '#1 → #999';
      case 'publicationYear':
        return 'Oldest First';
      case 'currentBoxId':
        return 'Box 0 → 15';
      case 'sizeThickness':
        return 'Thinnest';
      case 'estimatedValue':
        return '$ Low → High';
      case 'userRating':
        return '★ 1 → 5';
      case 'readingStatus':
        return 'Reading → Wishlist';
      default:
        return 'A → Z';
    }
  } else {
    switch (field) {
      case 'issueNumber':
        return '#999 → #1';
      case 'publicationYear':
        return 'Newest First';
      case 'currentBoxId':
        return 'Box 15 → 0';
      case 'sizeThickness':
        return 'Thickest';
      case 'estimatedValue':
        return '$ High → Low';
      case 'userRating':
        return '★ 5 → 1';
      case 'readingStatus':
        return 'Wishlist → Reading';
      default:
        return 'Z → A';
    }
  }
}

export function detectActivePresetId(options: MultiSortOptions): string | null {
  for (const preset of SORT_PRESETS) {
    if (preset.separateAnnuals !== options.separateAnnuals) continue;
    if (preset.criteria.length !== options.criteria.length) continue;
    const allMatch = preset.criteria.every((c, i) => {
      const oc = options.criteria[i];
      return oc && oc.field === c.field && oc.direction === c.direction;
    });
    if (allMatch) return preset.id;
  }
  return null;
}

/**
 * Compares two comic books by a specific single field.
 */
export function compareComicsByField(
  a: ComicBook,
  b: ComicBook,
  field: ComicSortField,
  options: MultiSortOptions
): number {
  switch (field) {
    case 'publisher': {
      const pubA = (a.publisher || '').trim();
      const pubB = (b.publisher || '').trim();
      return pubA.localeCompare(pubB, undefined, { numeric: true, sensitivity: 'base' });
    }
    case 'event': {
      const evA = (a.event || '').trim();
      const evB = (b.event || '').trim();
      if (!evA && !evB) return 0;
      const placement = options.emptyEventPlacement || 'last';
      if (!evA) return placement === 'last' ? 1 : -1;
      if (!evB) return placement === 'last' ? -1 : 1;
      return evA.localeCompare(evB, undefined, { numeric: true, sensitivity: 'base' });
    }
    case 'seriesName': {
      const sA = (a.seriesName || a.title || '').trim();
      const sB = (b.seriesName || b.title || '').trim();
      const cmp = sA.localeCompare(sB, undefined, { numeric: true, sensitivity: 'base' });
      if (cmp !== 0) return cmp;
      if (options.separateAnnuals) {
        const aAnn = isAnnualComic(a);
        const bAnn = isAnnualComic(b);
        if (aAnn !== bAnn) return aAnn ? 1 : -1;
      }
      return 0;
    }
    case 'issueNumber': {
      return compareIssueNumbersWithAnnuals(a, b, options.separateAnnuals);
    }
    case 'title': {
      const tA = getComicTitle(a);
      const tB = getComicTitle(b);
      const cmp = tA.localeCompare(tB, undefined, { numeric: true, sensitivity: 'base' });
      if (cmp !== 0) return cmp;
      if (options.separateAnnuals) {
        const aAnn = isAnnualComic(a);
        const bAnn = isAnnualComic(b);
        if (aAnn !== bAnn) return aAnn ? 1 : -1;
      }
      return 0;
    }
    case 'publicationYear': {
      return compareComicDates(a, b);
    }
    case 'currentBoxId': {
      const boxA = a.currentBoxId ?? 0;
      const boxB = b.currentBoxId ?? 0;
      return boxA - boxB;
    }
    case 'sizeThickness': {
      return (a.sizeThickness || 1.0) - (b.sizeThickness || 1.0);
    }
    case 'estimatedValue': {
      return (a.estimatedValue || 0) - (b.estimatedValue || 0);
    }
    case 'userRating': {
      return (a.userRating || 0) - (b.userRating || 0);
    }
    case 'readingStatus': {
      const statusWeight: Record<string, number> = {
        Reading: 1,
        Unread: 2,
        Read: 3,
        Wishlist: 4,
      };
      const wA = statusWeight[a.readingStatus] ?? 99;
      const wB = statusWeight[b.readingStatus] ?? 99;
      return wA - wB;
    }
    case 'format': {
      return (a.format || '').localeCompare(b.format || '');
    }
    case 'genre': {
      return (a.genre || '').localeCompare(b.genre || '');
    }
    case 'writer': {
      return (a.writer || '').localeCompare(b.writer || '');
    }
    case 'artist': {
      return (a.artist || '').localeCompare(b.artist || '');
    }
    default:
      return 0;
  }
}

/**
 * Compares two comic books using a chain of multi-sort criteria.
 */
export function compareComicsMultiSort(
  a: ComicBook,
  b: ComicBook,
  options: MultiSortOptions
): number {
  if (Array.isArray(options.criteria)) {
    for (const criterion of options.criteria) {
      const diff = compareComicsByField(a, b, criterion.field, options);
      if (diff !== 0) {
        // Special case: if sorting by event and one item has no event,
        // ensure empty event stays at the configured placement (e.g. 'last') regardless of direction
        if (criterion.field === 'event') {
          const evA = (a.event || '').trim();
          const evB = (b.event || '').trim();
          if ((!evA && evB) || (evA && !evB)) {
            const placement = options.emptyEventPlacement || 'last';
            return placement === 'last' ? (!evA ? 1 : -1) : (!evA ? -1 : 1);
          }
        }
        return criterion.direction === 'asc' ? diff : -diff;
      }
    }
  }

  // Fallback tie-breaker: Title & Issue, then ID
  const fallback = compareComicsByTitleAndIssue(a, b);
  if (fallback !== 0) return fallback;
  return (a.id || '').localeCompare(b.id || '');
}

/**
 * Sorts an array of comics using the specified MultiSortOptions.
 */
export function sortComicsMultiSort(
  comics: ComicBook[],
  options: MultiSortOptions
): ComicBook[] {
  if (!Array.isArray(comics)) return [];
  return [...comics].sort((a, b) => compareComicsMultiSort(a, b, options));
}
