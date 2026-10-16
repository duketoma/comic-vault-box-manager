import { ComicBook, SeriesIssueTotal } from '../types';
import { isAnnualComic, parseIntegerIssueNumber } from './comicSortUtils';

export interface SeriesCompletionEntry {
  title: string;
  seriesName: string;
  publisher: string;
  volume?: string;
  knownTotalIssues: number;
  totalIssues: number;
  effectiveTotalIssues: number;
  hasKnownTotal: boolean;
  owned: number;
  ownedCount: number;
  wishlist: number;
  wishlistCount: number;
  readCount: number;
  unreadCount: number;
  readingCount: number;
  totalValue: number;
  pct: number;
  collectionPct: number;
  remaining: number;
  remainingIssues: number;
  isComplete: boolean;
  isRunComplete: boolean;
  readPct: number;
  is100PercentRead: boolean;
  comics: ComicBook[];
  ownedIssueNumbers: number[];
  wishlistIssueNumbers: number[];
  missingIssueNumbers: number[];
}

export function buildSeriesTotalsMap(seriesTotals: SeriesIssueTotal[] = []): Map<string, SeriesIssueTotal> {
  const map = new Map<string, SeriesIssueTotal>();
  for (const st of seriesTotals) {
    if (st.seriesName) {
      map.set(st.seriesName.trim().toLowerCase(), st);
    }
  }
  return map;
}

export function computeSeriesCompletionMap(
  comics: ComicBook[] = [],
  seriesTotals: SeriesIssueTotal[] = []
): Map<string, SeriesCompletionEntry> {
  const totalsMap = buildSeriesTotalsMap(seriesTotals);
  const map = new Map<string, SeriesCompletionEntry>();

  for (const c of comics) {
    const sName = c.seriesName?.trim();
    const t = c.title?.trim() || 'Untitled Comic';
    const displaySeriesName = sName || t;
    const sKey = displaySeriesName.toLowerCase();
    if (!sKey) continue;

    let entry = map.get(sKey);
    if (!entry) {
      const totalInfo =
        (sName ? totalsMap.get(sName.toLowerCase()) : undefined) ||
        totalsMap.get(t.toLowerCase()) ||
        totalsMap.get(sKey);
      const knownTotal = totalInfo?.issueCount || 0;

      entry = {
        title: t,
        seriesName: displaySeriesName,
        publisher: totalInfo?.publisher || c.publisher || 'Unknown',
        volume: totalInfo?.volume || c.volume,
        knownTotalIssues: knownTotal,
        totalIssues: knownTotal,
        effectiveTotalIssues: knownTotal,
        hasKnownTotal: knownTotal > 0,
        owned: 0,
        ownedCount: 0,
        wishlist: 0,
        wishlistCount: 0,
        readCount: 0,
        unreadCount: 0,
        readingCount: 0,
        totalValue: 0,
        pct: 0,
        collectionPct: 0,
        remaining: 0,
        remainingIssues: 0,
        isComplete: false,
        isRunComplete: false,
        readPct: 0,
        is100PercentRead: false,
        comics: [],
        ownedIssueNumbers: [],
        wishlistIssueNumbers: [],
        missingIssueNumbers: [],
      };
      map.set(sKey, entry);
    }

    entry.comics.push(c);

    const num = parseIntegerIssueNumber(c.issueNumber);
    const isAnnual = isAnnualComic(c);

    if (c.readingStatus === 'Wishlist') {
      entry.wishlist += 1;
      entry.wishlistCount += 1;
      if (!isAnnual && !isNaN(num) && !entry.wishlistIssueNumbers.includes(num)) {
        entry.wishlistIssueNumbers.push(num);
      }
    } else {
      entry.owned += 1;
      entry.ownedCount += 1;
      entry.totalValue += c.estimatedValue || 0;
      if (c.readingStatus === 'Read') {
        entry.readCount += 1;
      } else if (c.readingStatus === 'Reading') {
        entry.readingCount += 1;
      } else {
        entry.unreadCount += 1;
      }
      if (!isAnnual && !isNaN(num) && !entry.ownedIssueNumbers.includes(num)) {
        entry.ownedIssueNumbers.push(num);
      }
    }
  }

  map.forEach((entry) => {
    const knownTotal = entry.knownTotalIssues;
    const effectiveTotal = entry.hasKnownTotal
      ? knownTotal
      : Math.max(entry.ownedCount, entry.ownedCount + entry.wishlistCount);

    entry.effectiveTotalIssues = effectiveTotal;
    entry.isComplete = entry.hasKnownTotal && entry.ownedCount >= knownTotal && knownTotal > 0;
    entry.isRunComplete = entry.isComplete;

    // Strict known-total metrics (used by Catalog filters)
    if (knownTotal > 0) {
      entry.pct = Math.round((entry.ownedCount / knownTotal) * 100);
      entry.remaining = Math.max(0, knownTotal - entry.ownedCount);
    } else {
      entry.pct = 0;
      entry.remaining = 0;
    }

    // Effective total metrics (used by ReadingStats & Detail modal)
    entry.collectionPct =
      effectiveTotal > 0 ? Math.min(100, Math.round((entry.ownedCount / effectiveTotal) * 100)) : 0;
    entry.remainingIssues = Math.max(0, effectiveTotal - entry.ownedCount);
    entry.readPct = entry.ownedCount > 0 ? Math.round((entry.readCount / entry.ownedCount) * 100) : 0;
    entry.is100PercentRead = entry.ownedCount > 0 && entry.readCount === entry.ownedCount;

    entry.ownedIssueNumbers.sort((a, b) => a - b);
    entry.wishlistIssueNumbers.sort((a, b) => a - b);

    const missingCap = knownTotal > 0 ? knownTotal : effectiveTotal;
    if (missingCap > 0) {
      const ownedSet = new Set(entry.ownedIssueNumbers);
      const missing: number[] = [];
      for (let i = 1; i <= Math.min(missingCap, 300); i++) {
        if (!ownedSet.has(i)) {
          missing.push(i);
        }
      }
      entry.missingIssueNumbers = missing;
    }
  });

  return map;
}

export function getSeriesOverviewSummary(
  comics: ComicBook[] = [],
  seriesTotals: SeriesIssueTotal[] = []
): { completeRuns: number; totalKnownRuns: number } {
  const completionMap = computeSeriesCompletionMap(comics, seriesTotals);
  let completeRuns = 0;
  let totalKnownRuns = 0;

  completionMap.forEach((entry) => {
    if (entry.ownedCount > 0 && entry.hasKnownTotal) {
      totalKnownRuns++;
      if (entry.isComplete) completeRuns++;
    }
  });

  return {
    completeRuns,
    totalKnownRuns: totalKnownRuns || (seriesTotals ? seriesTotals.length : 0),
  };
}

export function getComicSeriesInfo(
  comic: ComicBook | null,
  allComics: ComicBook[] = [],
  seriesTotals: SeriesIssueTotal[] = []
) {
  if (!comic) return null;
  const seriesKey = comic.seriesName?.trim() || comic.title?.trim();
  if (!seriesKey) return null;

  const completionMap = computeSeriesCompletionMap(allComics, seriesTotals);
  const entry = completionMap.get(seriesKey.toLowerCase());
  if (!entry) {
    const totalsMap = buildSeriesTotalsMap(seriesTotals);
    const match =
      totalsMap.get(seriesKey.toLowerCase()) ||
      (comic.title ? totalsMap.get(comic.title.trim().toLowerCase()) : undefined);
    const totalPublished = match?.issueCount || 0;
    return {
      seriesName: seriesKey,
      totalPublished,
      hasVerifiedTotal: totalPublished > 0,
      ownedInSeries: 0,
      wishlistInSeries: 0,
      pct: 0,
      remaining: totalPublished,
      isComplete: false,
    };
  }

  return {
    seriesName: seriesKey,
    totalPublished: entry.effectiveTotalIssues,
    hasVerifiedTotal: entry.hasKnownTotal,
    ownedInSeries: entry.ownedCount,
    wishlistInSeries: entry.wishlistCount,
    pct: entry.collectionPct,
    remaining: entry.remainingIssues,
    isComplete: entry.isComplete,
  };
}
