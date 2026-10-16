import { ComicBook } from '../types';
import {
  CriterionNode,
  ReadingChallengeCriteria,
} from '../types/readingChallenge.types';
import { parseIssueNumber } from './comicSortUtils';
import { MONTH_NAMES } from './dateUtils';
import { splitCreatorNames, isWritingRole, isArtRole } from './creatorParser';

const MONTH_INDEX_MAP: Record<string, number> = {};
MONTH_NAMES.forEach((m, idx) => {
  MONTH_INDEX_MAP[m.toLowerCase()] = idx + 1;
  MONTH_INDEX_MAP[m.substring(0, 3).toLowerCase()] = idx + 1;
});

/**
 * Normalizes a comic's publication date to YYYY-MM-DD for comparison and ordering.
 * Returns null if date is completely unknown.
 */
export function getNormalizedReleaseDate(comic: Partial<ComicBook>): {
  dateStr: string | null;
  sortValue: number;
} {
  // 1. If explicit publicationDate is present and valid
  if (comic.publicationDate && comic.publicationDate.trim()) {
    const raw = comic.publicationDate.trim();
    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const parts = raw.split('-').map(Number);
      return { dateStr: raw, sortValue: parts[0] * 10000 + parts[1] * 100 + parts[2] };
    }
    // YYYY-MM
    if (/^\d{4}-\d{2}$/.test(raw)) {
      const parts = raw.split('-').map(Number);
      return { dateStr: `${raw}-01`, sortValue: parts[0] * 10000 + parts[1] * 100 + 1 };
    }
    // Check if it parses as Date
    const parsed = new Date(raw);
    if (!isNaN(parsed.getTime())) {
      const y = parsed.getFullYear();
      const m = parsed.getMonth() + 1;
      const d = parsed.getDate();
      const padM = String(m).padStart(2, '0');
      const padD = String(d).padStart(2, '0');
      return { dateStr: `${y}-${padM}-${padD}`, sortValue: y * 10000 + m * 100 + d };
    }
  }

  // 2. Derive from publicationYear and publicationMonth
  if (comic.publicationYear && comic.publicationYear > 1900 && comic.publicationYear < 2100) {
    const y = comic.publicationYear;
    let m = 1;
    if (comic.publicationMonth) {
      const cleanMonth = comic.publicationMonth.trim().toLowerCase();
      if (MONTH_INDEX_MAP[cleanMonth]) {
        m = MONTH_INDEX_MAP[cleanMonth];
      }
    }
    const padM = String(m).padStart(2, '0');
    return { dateStr: `${y}-${padM}-01`, sortValue: y * 10000 + m * 100 + 1 };
  }

  return { dateStr: null, sortValue: Number.MAX_SAFE_INTEGER };
}

/**
 * Checks whether a comic is physically in the user's collection and eligible for a Reading Challenge.
 * Wishlist comics (readingStatus === 'Wishlist' or copiesOwned <= 0) are excluded.
 */
export function isComicEligibleForChallenge(comic: Partial<ComicBook>): boolean {
  if (!comic) return false;
  if (comic.readingStatus === 'Wishlist') return false;
  if (comic.copiesOwned !== undefined && comic.copiesOwned <= 0) return false;
  return true;
}

/**
 * Evaluates a single criteria node against a ComicBook.
 */
export function evaluateCriterionNode(comic: ComicBook, node: CriterionNode): boolean {
  if (!isComicEligibleForChallenge(comic)) {
    return false;
  }

  switch (node.type) {
    case 'collection':
      return true;

    case 'publisher': {
      if (!comic.publisher || !node.ids || node.ids.length === 0) return false;
      const comicPub = comic.publisher.trim().toLowerCase();
      return node.ids.some((id) => id.trim().toLowerCase() === comicPub);
    }

    case 'series': {
      if (!node.ids || node.ids.length === 0) return false;
      const sName = (comic.seriesName || '').trim().toLowerCase();
      const cTitle = (comic.title || '').trim().toLowerCase();
      return node.ids.some((id) => {
        const target = id.trim().toLowerCase();
        return sName === target || cTitle === target || sName.includes(target);
      });
    }

    case 'storyArc': {
      if (!comic.event || !node.ids || node.ids.length === 0) return false;
      const comicEvent = comic.event.trim().toLowerCase();
      return node.ids.some((id) => id.trim().toLowerCase() === comicEvent);
    }

    case 'character': {
      if (!node.ids || node.ids.length === 0) return false;
      const characters: string[] = [];
      if (comic.characterAppearances && Array.isArray(comic.characterAppearances)) {
        comic.characterAppearances.forEach((c) => {
          if (c.characterName) characters.push(c.characterName.trim().toLowerCase());
        });
      }
      return node.ids.some((id) => {
        const target = id.trim().toLowerCase();
        return characters.some((c) => c === target || c.includes(target));
      });
    }

    case 'creator': {
      if (!node.ids || node.ids.length === 0) return false;
      const targets = node.ids.map((id) => id.trim().toLowerCase());
      const roleFilters = (node.roles || []).map((r) => r.trim().toLowerCase());

      const matchesCreatorName = (name?: string) => {
        if (!name) return false;
        const individuals = splitCreatorNames(name);
        if (individuals.length === 0) {
          const lower = name.trim().toLowerCase();
          return targets.some((t) => lower === t || lower.includes(t));
        }
        return targets.some((t) =>
          individuals.some((ind) => {
            const indLower = ind.toLowerCase();
            return indLower === t || indLower.includes(t) || t.includes(indLower);
          })
        );
      };

      const matchesRole = (role?: string) => {
        if (!roleFilters.length) return true;
        if (!role) return false;
        const rLower = role.trim().toLowerCase();
        return roleFilters.some((rf) => {
          if (rf === 'writer' && isWritingRole(rLower)) return true;
          if ((rf === 'artist' || rf === 'penciller' || rf === 'penciler') && isArtRole(rLower)) return true;
          if (rf.includes('cover') && rLower.includes('cover')) return true;
          if (rf === 'inker' && rLower.includes('ink')) return true;
          if (rf === 'colorist' && rLower.includes('color')) return true;
          return rLower.includes(rf) || rf.includes(rLower);
        });
      };

      // 1. Check detailed creatorContributions
      if (comic.creatorContributions && Array.isArray(comic.creatorContributions)) {
        const contribMatch = comic.creatorContributions.some((c) => {
          return matchesCreatorName(c.creatorName) && matchesRole(c.roleName);
        });
        if (contribMatch) return true;
      }

      // 2. Check direct fields
      if (matchesCreatorName(comic.writer) && matchesRole('writer')) return true;
      if (matchesCreatorName(comic.artist) && (matchesRole('artist') || matchesRole('penciller'))) return true;
      if (matchesCreatorName(comic.coverArtist) && matchesRole('cover artist')) return true;

      return false;
    }

    case 'releaseDateRange': {
      const { dateStr } = getNormalizedReleaseDate(comic);
      if (!dateStr) return false; // Unknown release dates do not match a date-range criterion

      if (node.from && node.from.trim()) {
        const fromVal = node.from.trim();
        // If from is just year e.g. "1980", compare against "1980-01-01"
        const fromCmp = fromVal.length === 4 ? `${fromVal}-01-01` : fromVal;
        if (dateStr < fromCmp) return false;
      }

      if (node.through && node.through.trim()) {
        const throughVal = node.through.trim();
        const throughCmp = throughVal.length === 4 ? `${throughVal}-12-31` : throughVal;
        if (dateStr > throughCmp) return false;
      }

      return true;
    }

    case 'group': {
      if (!node.children || node.children.length === 0) return false;
      if (node.operator === 'AND') {
        return node.children.every((child) => evaluateCriterionNode(comic, child));
      } else {
        return node.children.some((child) => evaluateCriterionNode(comic, child));
      }
    }

    default:
      return false;
  }
}

/**
 * Evaluates full Criteria against a list of comics.
 */
export function filterComicsByCriteria(comics: ComicBook[], criteria: ReadingChallengeCriteria): ComicBook[] {
  if (!criteria || !criteria.root) return [];
  return comics
    .filter((comic) => isComicEligibleForChallenge(comic))
    .filter((comic) => evaluateCriterionNode(comic, criteria.root));
}

/**
 * Deterministically sorts challenge comics:
 * 1. Known release date, earliest first.
 * 2. Series name / title ascending.
 * 3. Normalized issue number (numeric major, minor, suffix).
 * 4. Comic ID ascending as final tie-breaker.
 * 5. Unknown release dates last.
 */
export function sortChallengeComics(comics: ComicBook[], direction: 'Ascending' | 'Descending' = 'Ascending'): ComicBook[] {
  const sorted = [...comics].sort((a, b) => {
    const aDate = getNormalizedReleaseDate(a);
    const bDate = getNormalizedReleaseDate(b);

    // Date comparison
    if (aDate.sortValue !== bDate.sortValue) {
      return aDate.sortValue - bDate.sortValue;
    }

    // Series name / title
    const aSeries = (a.seriesName || a.title || '').trim().toLowerCase();
    const bSeries = (b.seriesName || b.title || '').trim().toLowerCase();
    if (aSeries !== bSeries) {
      return aSeries.localeCompare(bSeries);
    }

    // Issue number numerical comparison
    const aIssue = parseIssueNumber(a.issueNumber);
    const bIssue = parseIssueNumber(b.issueNumber);
    if (aIssue.major !== bIssue.major) {
      return aIssue.major - bIssue.major;
    }
    if (aIssue.minor !== bIssue.minor) {
      return aIssue.minor - bIssue.minor;
    }
    if (aIssue.suffix !== bIssue.suffix) {
      return aIssue.suffix.localeCompare(bIssue.suffix);
    }

    // Stable tie-breaker: comic primary key
    return a.id.localeCompare(b.id);
  });

  return direction === 'Descending' ? sorted.reverse() : sorted;
}

/**
 * Generates a user-readable summary string for the criteria AST.
 */
export function formatCriteriaSummary(node: CriterionNode): string {
  switch (node.type) {
    case 'collection':
      return 'Entire Collection';

    case 'publisher':
      return `Publisher is ${node.ids.join(' or ')}`;

    case 'series':
      return `Series is ${node.ids.join(' or ')}`;

    case 'storyArc':
      return `Story Arc is ${node.ids.join(' or ')}`;

    case 'character':
      return `Character is ${node.ids.join(' or ')}`;

    case 'creator': {
      const roles = node.roles && node.roles.length > 0 ? ` (${node.roles.join(', ')})` : '';
      return `Creator is ${node.ids.join(' or ')}${roles}`;
    }

    case 'releaseDateRange': {
      if (node.from && node.through) {
        return `Released between ${node.from} and ${node.through}`;
      }
      if (node.from) return `Released from ${node.from} onward`;
      if (node.through) return `Released through ${node.through}`;
      return 'Any Release Date';
    }

    case 'group': {
      if (!node.children || node.children.length === 0) return 'No criteria specified';
      const parts = node.children.map((child) => {
        const text = formatCriteriaSummary(child);
        return child.type === 'group' && child.children.length > 1 ? `(${text})` : text;
      });
      return parts.join(` ${node.operator} `);
    }

    default:
      return 'Custom Criteria';
  }
}

/**
 * Validates the criteria tree before creating a challenge.
 */
export function validateCriteria(criteria: ReadingChallengeCriteria): { valid: boolean; error?: string } {
  if (!criteria || criteria.version !== 1 || !criteria.root) {
    return { valid: false, error: 'Invalid criteria version or missing root node' };
  }

  function validateNode(node: CriterionNode, depth: number): { valid: boolean; error?: string } {
    if (depth > 8) {
      return { valid: false, error: 'Criteria nesting depth exceeds maximum limit of 8' };
    }

    if (node.type === 'group') {
      if (!node.children || node.children.length === 0) {
        return { valid: false, error: 'Criteria group must contain at least one condition' };
      }
      if (node.operator !== 'AND' && node.operator !== 'OR') {
        return { valid: false, error: 'Invalid group operator; must be AND or OR' };
      }
      for (const child of node.children) {
        const res = validateNode(child, depth + 1);
        if (!res.valid) return res;
      }
      return { valid: true };
    }

    if (node.type === 'publisher' || node.type === 'series' || node.type === 'storyArc' || node.type === 'character' || node.type === 'creator') {
      if (!node.ids || node.ids.length === 0 || node.ids.some((id) => !id || !id.trim())) {
        return { valid: false, error: `Selection for ${node.type} cannot be empty` };
      }
    }

    if (node.type === 'releaseDateRange') {
      if (node.from && node.through && node.from > node.through) {
        return { valid: false, error: 'Start date cannot be later than end date' };
      }
    }

    return { valid: true };
  }

  return validateNode(criteria.root, 1);
}
