import { ComicBook, SeriesIssueTotal } from '../types';
import { ComicActionBurstItem } from '../components/ComicActionBurstOverlay';
import { computeSeriesCompletionMap } from './seriesUtils';

export function formatComicStampLabel(
  comic: Partial<Pick<ComicBook, 'title' | 'seriesName' | 'fullTitle' | 'issueNumber'>>
): string {
  const title =
    comic.title?.trim() ||
    comic.seriesName?.trim() ||
    comic.fullTitle?.trim() ||
    'Comic Issue';
  const issue = (comic.issueNumber ?? '').toString().trim().replace(/^#/, '');
  return issue ? `${title} #${issue}` : title;
}

/**
 * Evaluates collection state transitions (add, update, quick-status, bulk wishlist purchase)
 * and returns the highest-priority Comic Action Stamp burst to display:
 * 1. 'excelsior' ("EXCELSIOR! 🏆") when a series run reaches 100% owned or 100% read
 * 2. 'collected' ("COLLECTED! 💥") when a comic is newly added as owned or transitions from Wishlist -> Owned
 * 3. 'read'      ("READ! ★")      when an owned comic transitions to 'Read'
 */
export function evaluateCollectionActionBurst(
  prevComics: ComicBook[],
  nextComics: ComicBook[],
  seriesTotals: SeriesIssueTotal[] = [],
  affectedComicIds: string[]
): Omit<ComicActionBurstItem, 'id'> | null {
  if (!affectedComicIds || affectedComicIds.length === 0) return null;

  const prevById = new Map<string, ComicBook>();
  for (const c of prevComics) {
    prevById.set(c.id, c);
  }

  const nextById = new Map<string, ComicBook>();
  for (const c of nextComics) {
    nextById.set(c.id, c);
  }

  const prevSeriesMap = computeSeriesCompletionMap(prevComics, seriesTotals);
  const nextSeriesMap = computeSeriesCompletionMap(nextComics, seriesTotals);
  const checkedSeriesKeys = new Set<string>();

  // 1. Highest Priority: Did this mutation complete a Series Run (100% Owned or 100% Read)?
  for (const id of affectedComicIds) {
    const nextComic = nextById.get(id);
    if (!nextComic) continue;
    const prevComic = prevById.get(id);

    const sKey = (nextComic.seriesName?.trim() || nextComic.title?.trim() || '').toLowerCase();
    if (!sKey || checkedSeriesKeys.has(sKey)) continue;
    checkedSeriesKeys.add(sKey);

    const prevEntry = prevSeriesMap.get(sKey);
    const nextEntry = nextSeriesMap.get(sKey);
    if (!nextEntry) continue;

    // 1A. Verified Series Total Run reached 100% Owned
    if (nextEntry.isComplete && (!prevEntry || !prevEntry.isComplete)) {
      return {
        text: 'EXCELSIOR! 🏆',
        subtext: `100% Series Run • ${nextEntry.seriesName}`,
        variant: 'excelsior',
      };
    }

    // 1B. Tracked Wishlist Series Run had its final remaining wishlist issue bagged
    if (
      !nextEntry.hasKnownTotal &&
      prevEntry &&
      prevEntry.wishlistCount > 0 &&
      prevEntry.effectiveTotalIssues > 1 &&
      nextEntry.wishlistCount === 0 &&
      nextEntry.ownedCount >= prevEntry.effectiveTotalIssues &&
      nextEntry.ownedCount > prevEntry.ownedCount
    ) {
      return {
        text: 'EXCELSIOR! 🏆',
        subtext: `100% Series Run • ${nextEntry.seriesName}`,
        variant: 'excelsior',
      };
    }

    // 1C. Complete multi-issue series reached 100% Read
    const becameRead = nextComic.readingStatus === 'Read' && prevComic?.readingStatus !== 'Read';
    const isFullOwnedSeries =
      nextEntry.ownedCount >= 2 &&
      (nextEntry.isComplete || (!nextEntry.hasKnownTotal && nextEntry.wishlistCount === 0));
    if (becameRead && isFullOwnedSeries && nextEntry.is100PercentRead && !prevEntry?.is100PercentRead) {
      return {
        text: 'EXCELSIOR! 🏆',
        subtext: `100% Series Read • ${nextEntry.seriesName}`,
        variant: 'excelsior',
      };
    }
  }

  // 2. Second Priority: Did comics transition to Owned (New Owned Comic or Wishlist -> Owned)?
  const newlyCollectedComics: ComicBook[] = [];
  for (const id of affectedComicIds) {
    const nextComic = nextById.get(id);
    if (!nextComic || nextComic.readingStatus === 'Wishlist') continue;
    const prevComic = prevById.get(id);

    if (!prevComic) {
      // Newly added owned comic
      newlyCollectedComics.push(nextComic);
    } else {
      const wasWishlistOrUnowned =
        prevComic.readingStatus === 'Wishlist' || (prevComic.copiesOwned ?? 1) <= 0;
      const isNowOwned =
        nextComic.readingStatus !== 'Wishlist' && (nextComic.copiesOwned ?? 1) >= 1;
      const addedAdditionalCopy =
        prevComic.readingStatus !== 'Wishlist' &&
        (nextComic.copiesOwned ?? 1) > (prevComic.copiesOwned ?? 1);

      if ((wasWishlistOrUnowned && isNowOwned) || addedAdditionalCopy) {
        newlyCollectedComics.push(nextComic);
      }
    }
  }

  if (newlyCollectedComics.length > 0) {
    if (newlyCollectedComics.length === 1) {
      const c = newlyCollectedComics[0];
      // If a brand-new comic was added directly with readingStatus === 'Read', still celebrate COLLECTED!
      return {
        text: 'COLLECTED! 💥',
        subtext: formatComicStampLabel(c),
        variant: 'collected',
      };
    }
    return {
      text: 'COLLECTED! 💥',
      subtext: `${newlyCollectedComics.length} Issues Bagged`,
      variant: 'collected',
    };
  }

  // 3. Third Priority: Did an owned comic transition to 'Read'?
  for (const id of affectedComicIds) {
    const nextComic = nextById.get(id);
    if (!nextComic) continue;
    const prevComic = prevById.get(id);
    if (nextComic.readingStatus === 'Read' && prevComic?.readingStatus !== 'Read') {
      return {
        text: 'READ! ★',
        subtext: formatComicStampLabel(nextComic),
        variant: 'read',
      };
    }
  }

  return null;
}
