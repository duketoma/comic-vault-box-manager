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
 * Converts month name to 1-based index (1-12) for sorting
 */
export function getMonthIndex(month?: string): number {
  if (!month) return 0;
  const idx = MONTH_NAMES.findIndex((m) => m.toLowerCase() === month.toLowerCase());
  return idx >= 0 ? idx + 1 : 0;
}
