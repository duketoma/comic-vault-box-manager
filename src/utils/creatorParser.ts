import { ComicBook } from '../types';

/**
 * Common generational suffixes in creator names that should not be split as separate names.
 */
const GENERATIONAL_SUFFIXES = new Set([
  'jr',
  'jr.',
  'sr',
  'sr.',
  'ii',
  'iii',
  'iv',
  'v',
]);

/**
 * Generic placeholders that should not be treated as individual creators.
 */
const PLACEHOLDER_NAMES = new Set([
  'various',
  'various artists',
  'various writers',
  'various creators',
  'various contributor',
  'various contributors',
  'unknown',
  'unknown artist',
  'unknown writer',
  'n/a',
  'na',
  'none',
  '-',
  '--',
  '?',
]);

/**
 * Cleans role annotations in parentheses or brackets from creator names,
 * e.g., "Frank Miller (Writer)" -> "Frank Miller"
 */
function cleanRoleAnnotation(name: string): string {
  // Remove trailing parenthetical or bracketed role annotations
  let cleaned = name
    .replace(/\s*[\(\[]\s*(writer|artist|penciller|inker|colorist|letterer|cover|story|script|plot|editor|various|co-writer|co-artist|art|pencils|inks|colors|letters)\b[^\)\]]*[\)\]]/gi, '')
    // Also remove generic trailing parentheticals if they appear to be roles
    .replace(/\s*[\(\[][^\)\]]+[\)\]]$/, '')
    .trim();

  // Strip leading and trailing quotes or stray punctuation (except name periods like 'J.M.')
  cleaned = cleaned.replace(/^["'`]+|["'`]+$/g, '').trim();
  // Strip trailing commas, colons, or dashes
  cleaned = cleaned.replace(/[,;:\-]+$/, '').trim();

  return cleaned;
}

/**
 * Splits a raw creator string into an array of clean, individual creator names.
 * Handles commas, semicolons, ampersands, slashes, pluses, pipes, and "and" / "with",
 * while preserving generational suffixes like "John Romita, Jr." and filtering placeholders.
 *
 * Examples:
 * - "Stan Lee, Jack Kirby" -> ["Stan Lee", "Jack Kirby"]
 * - "John Romita, Jr." -> ["John Romita Jr."]
 * - "David Michelinie & Todd McFarlane" -> ["David Michelinie", "Todd McFarlane"]
 * - "Chris Claremont; John Byrne; Terry Austin" -> ["Chris Claremont", "John Byrne", "Terry Austin"]
 * - "Garth Ennis / Steve Dillon" -> ["Garth Ennis", "Steve Dillon"]
 * - "Peter David and Dale Keown" -> ["Peter David", "Dale Keown"]
 */
export function splitCreatorNames(raw?: string | null): string[] {
  if (!raw || typeof raw !== 'string') return [];

  const trimmed = raw.trim();
  if (!trimmed) return [];

  // Check whole string against placeholders upfront
  if (PLACEHOLDER_NAMES.has(trimmed.toLowerCase())) {
    return [];
  }

  // Step 1: Pre-process known generational suffixes with commas so they don't split
  // e.g. "John Romita, Jr." -> "John Romita Jr."
  const sanitized = trimmed.replace(/,\s*(jr\.?|sr\.?|ii|iii|iv|v)\b/gi, ' $1');

  // Step 2: Split by common delimiters: comma, semicolon, ampersand, slash, plus, pipe, bullet, or word 'and'/'with'
  // Using regex for delimiters: [,;&/\\+|•] or \s+(and|with)\s+
  const rawTokens = sanitized.split(/[,;&/\\+|•]|\s+\b(?:and|with)\b\s+/i);

  const results: string[] = [];

  for (let i = 0; i < rawTokens.length; i++) {
    const token = rawTokens[i].trim();
    if (!token) continue;

    // Check if this token is just a detached suffix (in case regex missed it)
    const lowerToken = token.toLowerCase().replace(/\.$/, '');
    if (GENERATIONAL_SUFFIXES.has(lowerToken) && results.length > 0) {
      results[results.length - 1] = `${results[results.length - 1]} ${token}`.trim();
      continue;
    }

    const cleaned = cleanRoleAnnotation(token);
    if (!cleaned) continue;

    // Check placeholder filter
    if (PLACEHOLDER_NAMES.has(cleaned.toLowerCase())) {
      continue;
    }

    // Must contain at least 2 letters (avoids isolated fragments like 'N' or 'A')
    const letters = cleaned.replace(/[^a-zA-Z]/g, '');
    if (letters.length < 2) {
      continue;
    }

    results.push(cleaned);
  }

  // Deduplicate case-insensitively while preserving original casing
  const seen = new Set<string>();
  const deduplicated: string[] = [];

  for (const name of results) {
    const key = name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      deduplicated.push(name);
    }
  }

  return deduplicated;
}

/**
 * Extracts all unique individual creators across a collection of comics.
 * Checks writer, artist, coverArtist, and creatorContributions.
 */
export function extractIndividualCreators(comics: ComicBook[]): string[] {
  const creatorSet = new Set<string>();

  for (const c of comics) {
    if (c.writer) {
      splitCreatorNames(c.writer).forEach((name) => creatorSet.add(name));
    }
    if (c.artist) {
      splitCreatorNames(c.artist).forEach((name) => creatorSet.add(name));
    }
    if (c.coverArtist) {
      splitCreatorNames(c.coverArtist).forEach((name) => creatorSet.add(name));
    }
    if (c.creatorContributions && Array.isArray(c.creatorContributions)) {
      for (const contrib of c.creatorContributions) {
        if (contrib.creatorName) {
          splitCreatorNames(contrib.creatorName).forEach((name) => creatorSet.add(name));
        }
      }
    }
  }

  return Array.from(creatorSet).sort((a, b) => a.localeCompare(b));
}

/**
 * Determines whether a given role string represents a writing / scripting contribution.
 */
export function isWritingRole(role?: string | null): boolean {
  if (!role) return false;
  const r = role.trim().toLowerCase();
  return (
    r.includes('writ') ||
    r.includes('story') ||
    r.includes('script') ||
    r.includes('plot') ||
    r.includes('author')
  );
}

/**
 * Determines whether a given role string represents an interior / pencil art contribution.
 */
export function isArtRole(role?: string | null): boolean {
  if (!role) return false;
  const r = role.trim().toLowerCase();
  return (
    r.includes('pencil') ||
    r.includes('artist') ||
    r.includes('illustrat') ||
    r.includes('draw') ||
    r.includes('art')
  );
}

