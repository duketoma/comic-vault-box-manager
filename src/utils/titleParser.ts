/**
 * Utility to parse comic titles containing issue numbers (and optional publication years)
 * Example: "The Amazing Spider-Man #300 (1988)" ->
 *   cleanTitle: "The Amazing Spider-Man"
 *   issueNumber: "300"
 *   publicationYear: 1988
 */

export interface ParsedComicTitle {
  cleanTitle: string;
  issueNumber: string;
  volume?: string;
  publicationYear?: number;
}

export function parseTitleAndIssue(rawTitle: string, existingIssue?: string): ParsedComicTitle {
  if (!rawTitle || !rawTitle.trim()) {
    return { cleanTitle: rawTitle || '', issueNumber: existingIssue || '1' };
  }

  let title = rawTitle.trim();
  let userIssue = (existingIssue || '').trim();
  let publicationYear: number | undefined = undefined;
  let extractedVolume: string | undefined = undefined;

  // 1. Extract publication year in parentheses or brackets e.g. (1988) or [2020]
  const yearMatch = title.match(/[\(\[]\s*(19\d\d|20\d\d)\s*[\)\]]/);
  if (yearMatch) {
    const parsedYear = parseInt(yearMatch[1], 10);
    if (parsedYear >= 1930 && parsedYear <= 2035) {
      publicationYear = parsedYear;
      title = title.replace(yearMatch[0], '').trim();
    }
  }

  // 2. Extract explicit Volume e.g. "Vol. 1", "Volume 2", "Vol 3", "v1"
  const volMatch = title.match(/\b(vol|volume|v)\.?\s*(\d+)\b/i);
  if (volMatch) {
    extractedVolume = `Vol. ${volMatch[2]}`;
    // Strip volume from title if title has more text
    const strippedTitle = title.replace(volMatch[0], '').replace(/\s+/g, ' ').trim();
    if (strippedTitle.length > 2) {
      title = strippedTitle;
    }
  }

  // 3. Try matching explicit '#' issue indicator: e.g. "Spider-Man #300", "Batman #1A", "X-Men # 266"
  const hashMatch = title.match(/^(.*?)\s*#\s*([0-9]+[a-zA-Z0-9.-]*|[a-zA-Z0-9.-]+)(.*)$/i);
  if (hashMatch) {
    const prefix = hashMatch[1].trim();
    const parsedIssue = hashMatch[2].trim();
    const suffix = hashMatch[3].trim();

    const fullTitle = [prefix, suffix].filter(Boolean).join(' ').trim();
    
    return {
      cleanTitle: fullTitle || prefix || rawTitle,
      issueNumber: parsedIssue,
      volume: extractedVolume,
      publicationYear,
    };
  }

  // 4. Try matching trailing issue number at the end of the title: e.g. "Spider-Man 300" or "Spawn 50"
  const trailingNumMatch = title.match(/^(.*?)\s+(\d+[a-zA-Z]?)$/i);
  if (trailingNumMatch) {
    const prefix = trailingNumMatch[1].trim();
    const parsedIssue = trailingNumMatch[2].trim();

    const isYear = /^(19\d\d|20\d\d)$/.test(parsedIssue) && parseInt(parsedIssue, 10) >= 1930;
    const isVolPrefix = /^(vol|volume|pt|part|issue|v)$/i.test(prefix);

    if (prefix && !isVolPrefix && !isYear) {
      return {
        cleanTitle: prefix,
        issueNumber: parsedIssue,
        volume: extractedVolume,
        publicationYear,
      };
    }
  }

  // Fallback
  return {
    cleanTitle: title,
    issueNumber: userIssue || '1',
    volume: extractedVolume,
    publicationYear,
  };
}
