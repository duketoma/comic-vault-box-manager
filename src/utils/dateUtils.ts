import { ComicBook } from '../types';

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export type MonthName = (typeof MONTH_NAMES)[number];

const MONTH_ABBREVS: Record<string, MonthName> = {
  jan: 'January',
  january: 'January',
  feb: 'February',
  february: 'February',
  mar: 'March',
  march: 'March',
  apr: 'April',
  april: 'April',
  may: 'May',
  jun: 'June',
  june: 'June',
  jul: 'July',
  july: 'July',
  aug: 'August',
  august: 'August',
  sep: 'September',
  sept: 'September',
  september: 'September',
  oct: 'October',
  october: 'October',
  nov: 'November',
  november: 'November',
  dec: 'December',
  december: 'December',
};

/**
 * Parses raw year/date input (e.g., "2023-05-15", "5/15/2023", "May 1988", "2023", 1990)
 * into a structured year (number) and month (MonthName | undefined).
 */
export function parseYearAndMonth(
  rawVal: any,
  fallbackTitle?: string
): { year: number; month?: MonthName } {
  let year: number | undefined = undefined;
  let month: MonthName | undefined = undefined;

  if (rawVal === null || rawVal === undefined) {
    return parseFromTitleOrFallback(fallbackTitle);
  }

  // Handle JS Date object
  if (rawVal instanceof Date && !isNaN(rawVal.getTime())) {
    return {
      year: rawVal.getFullYear(),
      month: MONTH_NAMES[rawVal.getMonth()],
    };
  }

  // Handle pure number (e.g. 1988) or Excel date serial
  if (typeof rawVal === 'number' && !isNaN(rawVal)) {
    if (rawVal >= 1900 && rawVal <= 2099) {
      return { year: rawVal };
    }
    // Excel date serial number (e.g., ~35000 to ~55000)
    if (rawVal > 10000 && rawVal < 60000) {
      const excelEpoch = new Date(1899, 11, 30);
      const convertedDate = new Date(excelEpoch.getTime() + rawVal * 86400000);
      if (!isNaN(convertedDate.getTime())) {
        return {
          year: convertedDate.getFullYear(),
          month: MONTH_NAMES[convertedDate.getMonth()],
        };
      }
    }
  }

  const str = String(rawVal).trim();
  if (!str) {
    return parseFromTitleOrFallback(fallbackTitle);
  }

  // 1. Check for Month name or abbrev in string
  const lower = str.toLowerCase();
  for (const [key, name] of Object.entries(MONTH_ABBREVS)) {
    const regex = new RegExp(`\\b${key}\\b`, 'i');
    if (regex.test(lower)) {
      month = name;
      break;
    }
  }

  // 2. Check for 4-digit Year (1930 - 2035)
  const yearMatch = str.match(/\b(19\d\d|20\d\d)\b/);
  if (yearMatch) {
    year = parseInt(yearMatch[1], 10);
  }

  // 3. If month not found via text, check numerical date patterns
  if (!month) {
    // YYYY-MM-DD or YYYY/MM/DD or YYYY-MM
    const isoMatch = str.match(/^(19\d\d|20\d\d)[-/.](0?[1-9]|1[0-2])(?:[-/.](?:0?[1-9]|[12]\d|3[01]))?$/);
    if (isoMatch) {
      if (!year) year = parseInt(isoMatch[1], 10);
      const mNum = parseInt(isoMatch[2], 10);
      if (mNum >= 1 && mNum <= 12) {
        month = MONTH_NAMES[mNum - 1];
      }
    } else {
      // MM/DD/YYYY or M/D/YYYY or MM-DD-YYYY or MM/YYYY
      const usMatch = str.match(/^(0?[1-9]|1[0-2])[-/.](?:(?:0?[1-9]|[12]\d|3[01])[-/.])?(19\d\d|20\d\d)$/);
      if (usMatch) {
        const mNum = parseInt(usMatch[1], 10);
        if (!year) year = parseInt(usMatch[2], 10);
        if (mNum >= 1 && mNum <= 12) {
          month = MONTH_NAMES[mNum - 1];
        }
      }
    }
  }

  if (!year) {
    const fallback = parseFromTitleOrFallback(fallbackTitle);
    year = fallback.year;
    if (!month) month = fallback.month;
  }

  return { year: year || 2020, month };
}

function parseFromTitleOrFallback(title?: string): { year: number; month?: MonthName } {
  if (title) {
    const lower = title.toLowerCase();
    let month: MonthName | undefined = undefined;
    for (const [key, name] of Object.entries(MONTH_ABBREVS)) {
      const regex = new RegExp(`\\b${key}\\b`, 'i');
      if (regex.test(lower)) {
        month = name;
        break;
      }
    }
    const yearMatch = title.match(/\b(19\d\d|20\d\d)\b/);
    if (yearMatch) {
      return { year: parseInt(yearMatch[1], 10), month };
    }
    if (month) return { year: 2020, month };
  }
  return { year: 2020 };
}

/**
 * Formats publication date cleanly: "May 1988" or "1988"
 */
export function formatPublicationDate(year: number, month?: string): string {
  if (month && month.trim()) {
    return `${year} ${month}`;
  }
  return `${year}`;
}

/**
 * Converts month name, abbreviation, or numeric month to 1-based index (1-12) for sorting.
 * Returns 0 if unrecognized or unspecified.
 */
export function getMonthIndex(month?: string | number): number {
  if (month === undefined || month === null) return 0;
  if (typeof month === 'number' && month >= 1 && month <= 12) return Math.floor(month);
  const clean = String(month).trim().toLowerCase();
  if (!clean) return 0;
  const num = parseInt(clean, 10);
  if (!isNaN(num) && num >= 1 && num <= 12 && String(num) === clean.replace(/^0+/, '')) {
    return num;
  }
  const resolved = MONTH_ABBREVS[clean] || clean;
  const idx = MONTH_NAMES.findIndex((m) => m.toLowerCase() === resolved.toLowerCase());
  return idx >= 0 ? idx + 1 : 0;
}

/**
 * Parses day of the month (1-31) from date strings, ISO timestamps, or Date objects.
 * Returns 0 if no valid day is specified.
 */
export function parseDayFromDate(rawVal: any): number {
  if (rawVal === undefined || rawVal === null) return 0;
  if (rawVal instanceof Date && !isNaN(rawVal.getTime())) return rawVal.getDate();
  const str = String(rawVal).trim();
  if (!str) return 0;

  // YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = str.match(/^\d{4}[-/.](?:0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])\b/);
  if (isoMatch) return parseInt(isoMatch[1], 10);

  // MM/DD/YYYY or M/D/YYYY or MM-DD-YYYY or M-D-YYYY
  const usMatch = str.match(/^(?:0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])[-/.](?:\d{4})\b/);
  if (usMatch) return parseInt(usMatch[1], 10);

  // Text date: "Month DD, YYYY" or "Month DD YYYY" (e.g. "August 15, 1996")
  const textDayMatch = str.match(/[a-zA-Z]+\s+(0?[1-9]|[12]\d|3[01]),?\s+\d{4}/);
  if (textDayMatch) return parseInt(textDayMatch[1], 10);

  // Text date: "DD Month YYYY" (e.g. "15 August 1996")
  const dayTextMatch = str.match(/\b(0?[1-9]|[12]\d|3[01])\s+[a-zA-Z]+\s+\d{4}/);
  if (dayTextMatch) return parseInt(dayTextMatch[1], 10);

  return 0;
}

export interface NormalizedComicDate {
  year: number;
  month: number; // 1-12, or 0 if unknown
  day: number; // 1-31, or 0 if unknown
  sortKey: number; // e.g. 19960801, or 0 if unknown
  isoDate: string | null; // e.g. "1996-08-01", or null
}

/**
 * Extracts normalized date components for any comic record.
 * Handles mixed sources (publicationYear, publicationMonth, publicationDate),
 * resolving potential conflicts and discrepancies deterministically.
 */
export function getNormalizedComicDate(comic?: Partial<ComicBook> | null): NormalizedComicDate {
  if (!comic) return { year: 0, month: 0, day: 0, sortKey: 0, isoDate: null };

  const explicitMonth = getMonthIndex(comic.publicationMonth);
  const explicitYear = typeof comic.publicationYear === 'number' && comic.publicationYear > 0 ? comic.publicationYear : 0;

  let parsedFromDate = { year: 0, month: 0, day: 0 };
  if (comic.publicationDate && String(comic.publicationDate).trim()) {
    const parsedYM = parseYearAndMonth(comic.publicationDate);
    const parsedDay = parseDayFromDate(comic.publicationDate);
    parsedFromDate = {
      year: parsedYM.year > 1900 && parsedYM.year < 2100 ? parsedYM.year : 0,
      month: parsedYM.month ? getMonthIndex(parsedYM.month) : 0,
      day: parsedDay,
    };
  }

  // Explicit publicationMonth/publicationYear entered or chosen by the user take precedence over raw imported strings
  const year = explicitYear > 0 ? explicitYear : (parsedFromDate.year > 0 ? parsedFromDate.year : 0);
  const month = explicitMonth > 0 ? explicitMonth : (parsedFromDate.month > 0 ? parsedFromDate.month : 0);

  let day = 0;
  if (parsedFromDate.day > 0) {
    if (parsedFromDate.year === year && (explicitMonth === 0 || parsedFromDate.month === explicitMonth)) {
      day = parsedFromDate.day;
    } else {
      day = 1;
    }
  } else if (month > 0) {
    day = 1;
  }

  const sortKey = year > 0 ? year * 10000 + month * 100 + day : 0;
  const isoDate = year > 0
    ? `${String(year).padStart(4, '0')}-${String(month || 1).padStart(2, '0')}-${String(day || 1).padStart(2, '0')}`
    : null;

  return { year, month, day, sortKey, isoDate };
}

/**
 * Formats a clean ISO-8601 date string (YYYY-MM-DD or YYYY) from year, month, and optional existing day.
 */
export function formatIsoComicDate(year?: number, month?: string, fallbackExisting?: string): string | undefined {
  if (!year || year <= 0) return undefined;
  const mIdx = getMonthIndex(month);
  if (mIdx <= 0) return `${year}`;
  const padMonth = String(mIdx).padStart(2, '0');
  const existingDay = fallbackExisting ? parseDayFromDate(fallbackExisting) : 0;
  const padDay = String(existingDay > 0 ? existingDay : 1).padStart(2, '0');
  return `${year}-${padMonth}-${padDay}`;
}

function getSeriesKey(c: Partial<ComicBook>): string {
  const raw = c.seriesName || c.title || c.fullTitle || '';
  return raw
    .toLowerCase()
    .replace(/\s*\(vol\.?\s*\d+\)/i, '')
    .replace(/\s*\(\d{4}\s*-\s*\d{4}\)/i, '')
    .replace(/#.*$/, '')
    .trim();
}

/**
 * Chronologically compares two comic books by their release dates.
 * - Undated items (year 0) sort to the end in ascending order.
 * - Comics of the same series in the same month return 0 so that secondary
 *   sort criteria (like Issue Number) dictate their natural sequence.
 */
export function compareComicDates(a: Partial<ComicBook>, b: Partial<ComicBook>): number {
  const normA = getNormalizedComicDate(a);
  const normB = getNormalizedComicDate(b);

  if (normA.year === 0 && normB.year === 0) return 0;
  if (normA.year === 0) return 1;
  if (normB.year === 0) return -1;

  if (normA.year !== normB.year) {
    return normA.year - normB.year;
  }

  if (normA.month !== normB.month) {
    return normA.month - normB.month;
  }

  // Same year and month: if they belong to the same comic series/title,
  // return 0 so that secondary sort criteria (such as Issue Number) or
  // the fallback natural issue sorter determines the sequence.
  const sA = getSeriesKey(a);
  const sB = getSeriesKey(b);
  if (sA && sB && sA === sB) {
    return 0;
  }

  // If different series, compare day of month if available
  return normA.day - normB.day;
}

