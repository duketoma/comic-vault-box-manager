import { ComicBook, SeriesIssueTotal } from '../types';
import {
  isAnnualComic,
  isYearDesignatedAnnual,
  extractAnnualNumber,
  parseIntegerIssueNumber,
} from './comicSortUtils';

export interface WishlistScoredComic {
  comic: ComicBook;
  seriesScore: number;
  eventScore: number;
  gapScore: number;
  gapType: 'full' | 'half_prev' | 'half_next' | 'none';
  gapDetail: string;
  compositeScore: number;
  normalizedScore: number;
  primaryDriver: 'Series Completion' | 'Event Completion' | 'Gap Filler' | 'Series & Gap' | 'Multi-Priority';
  primaryReason: string;
  completesSeries: boolean;
  completesEvent: boolean;
  effectiveTotalSeriesIssues: number;
  newOwnedSeriesCount: number;
}

/**
 * Priority Scoring Engine for Top 60 Wishlist Hunter.
 * Calculates composite scores based on Series Completion, Event Completion,
 * and Gap Filling (bridges between owned issues, series boundaries).
 */
export function scoreWishlistComics(
  comics: ComicBook[],
  seriesTotals: SeriesIssueTotal[] = []
): WishlistScoredComic[] {
  // A. Map known series issue counts from SeriesIssueTotal
  const seriesTotalsMap = new Map<string, number>();
  seriesTotals.forEach((st) => {
    if (st.seriesName) {
      seriesTotalsMap.set(st.seriesName.trim().toLowerCase(), st.issueCount);
    }
  });

  // B. Build counts and sets for owned series and events
  const seriesOwnedMap = new Map<string, number>();
  const seriesWishlistMap = new Map<string, number>();
  const seriesOwnedRegularNumbers = new Map<string, Set<number>>();
  const seriesOwnedAnnualNumbers = new Map<string, Set<number>>();
  const seriesMaxRegularNumbers = new Map<string, number>();
  const seriesMinRegularNumbers = new Map<string, number>();
  const seriesMaxAnnualNumbers = new Map<string, number>();

  const eventTotalMap = new Map<string, number>();
  const eventOwnedMap = new Map<string, number>();

  comics.forEach((c) => {
    const sKey = (c.seriesName || c.title || '').trim().toLowerCase();
    const isOwned = c.readingStatus !== 'Wishlist';

    if (isOwned) {
      seriesOwnedMap.set(sKey, (seriesOwnedMap.get(sKey) || 0) + 1);

      if (isAnnualComic(c)) {
        // Annual issue: only track if it's a sequentially numbered annual (not year-based)
        if (!isYearDesignatedAnnual(c)) {
          const annualNum = extractAnnualNumber(c);
          if (annualNum !== null) {
            if (!seriesOwnedAnnualNumbers.has(sKey)) {
              seriesOwnedAnnualNumbers.set(sKey, new Set<number>());
            }
            seriesOwnedAnnualNumbers.get(sKey)!.add(annualNum);
          }
        }
      } else {
        // Regular issue: track integer issue numbers
        const num = parseIntegerIssueNumber(c.issueNumber);
        if (!isNaN(num)) {
          if (!seriesOwnedRegularNumbers.has(sKey)) {
            seriesOwnedRegularNumbers.set(sKey, new Set<number>());
          }
          seriesOwnedRegularNumbers.get(sKey)!.add(num);
        }
      }
    } else {
      seriesWishlistMap.set(sKey, (seriesWishlistMap.get(sKey) || 0) + 1);
    }

    // Track min/max issue numbers across all comics in the series (owned and wishlist)
    if (isAnnualComic(c)) {
      if (!isYearDesignatedAnnual(c)) {
        const annualNum = extractAnnualNumber(c);
        if (annualNum !== null) {
          const curMaxAnnual = seriesMaxAnnualNumbers.get(sKey);
          if (curMaxAnnual === undefined || annualNum > curMaxAnnual) {
            seriesMaxAnnualNumbers.set(sKey, annualNum);
          }
        }
      }
    } else {
      const num = parseIntegerIssueNumber(c.issueNumber);
      if (!isNaN(num)) {
        const curMax = seriesMaxRegularNumbers.get(sKey);
        if (curMax === undefined || num > curMax) {
          seriesMaxRegularNumbers.set(sKey, num);
        }
        const curMin = seriesMinRegularNumbers.get(sKey);
        if (curMin === undefined || num < curMin) {
          seriesMinRegularNumbers.set(sKey, num);
        }
      }
    }

    if (c.event && c.event.trim()) {
      const eKey = c.event.trim().toLowerCase();
      eventTotalMap.set(eKey, (eventTotalMap.get(eKey) || 0) + 1);
      if (isOwned) {
        eventOwnedMap.set(eKey, (eventOwnedMap.get(eKey) || 0) + 1);
      }
    }
  });

  // C. Filter wishlisted comics only
  const wishlistComics = comics.filter((c) => c.readingStatus === 'Wishlist');

  // D. Score every wishlisted comic against the 3 priority metrics
  const results: WishlistScoredComic[] = wishlistComics.map((c) => {
    const sKey = (c.seriesName || c.title || '').trim().toLowerCase();
    const sNameKey = c.seriesName?.trim().toLowerCase();
    const titleKey = c.title?.trim().toLowerCase();
    const ownedInSeries = seriesOwnedMap.get(sKey) || 0;
    const wishlistInSeries = seriesWishlistMap.get(sKey) || 0;
    const knownTotal =
      (sNameKey ? seriesTotalsMap.get(sNameKey) : undefined) ||
      (titleKey ? seriesTotalsMap.get(titleKey) : undefined) ||
      seriesTotalsMap.get(sKey) ||
      (c.seriesTotalIssues && c.seriesTotalIssues > 0 ? c.seriesTotalIssues : undefined);
    const effectiveTotal =
      knownTotal && knownTotal > 0
        ? knownTotal
        : Math.max(ownedInSeries + wishlistInSeries, 1);

    // --- Metric 1: Series Completion Score (0 - 100) ---
    const newOwnedSeriesCount = ownedInSeries + 1;
    const completesSeries = effectiveTotal > 0 && newOwnedSeriesCount >= effectiveTotal;
    const seriesScore = completesSeries ? 100 : Math.min(99, Math.round((newOwnedSeriesCount / effectiveTotal) * 100));

    // Initialize Gap Filling Score:
    // If comic brings series to 100% completion, set gap score to 100 immediately
    let gapScore = completesSeries ? 100 : 0;
    let gapType: 'full' | 'half_prev' | 'half_next' | 'none' = completesSeries ? 'full' : 'none';
    let gapDetail = completesSeries
      ? 'Completes 100% of series run (closes all gaps)'
      : 'No adjacent owned issues';

    // --- Metric 2: Event Completion Score (0 - 100) ---
    let eventScore = 0;
    let completesEvent = false;
    let eventDetail = 'No event attached';
    if (c.event && c.event.trim()) {
      const eventName = c.event.trim();
      const eKey = eventName.toLowerCase();
      const totalInEvent = eventTotalMap.get(eKey) || 1;
      const ownedInEvent = eventOwnedMap.get(eKey) || 0;
      const newOwnedInEvent = ownedInEvent + 1;
      eventScore = Math.min(100, Math.round((newOwnedInEvent / totalInEvent) * 100));
      completesEvent = newOwnedInEvent >= totalInEvent;
      eventDetail = completesEvent
        ? `Completes ${eventName} (100%)`
        : `${newOwnedInEvent}/${totalInEvent} in ${eventName} (${eventScore}%)`;
    }

    // --- Metric 3: Gap Filling Score (0 - 100) ---
    // Skip if gap score was already determined to be 100% via 100% series completion
    if (gapScore < 100) {
      if (isAnnualComic(c)) {
        if (isYearDesignatedAnnual(c)) {
          // Annuals with year-based designations (e.g. Annual '95, Annual '96) are excluded from gap checking
          gapScore = 0;
          gapType = 'none';
          gapDetail = 'Annual release (gap analysis excluded)';
        } else {
          // Sequentially numbered annual: check against owned numbered annuals for this series
          const annualNum = extractAnnualNumber(c);
          if (annualNum !== null && seriesOwnedAnnualNumbers.has(sKey)) {
            const ownedSet = seriesOwnedAnnualNumbers.get(sKey)!;
            const hasPrev = ownedSet.has(annualNum - 1);
            const hasNext = ownedSet.has(annualNum + 1);
            const isFirstAnnual = annualNum === 1;
            const maxAnnual = seriesMaxAnnualNumbers.get(sKey);
            const isFinalAnnual = maxAnnual !== undefined && annualNum === maxAnnual && annualNum > 1;

            if (hasPrev && hasNext) {
              gapScore = 100; // Full bridge between two owned Annuals
              gapType = 'full';
              gapDetail = `Bridges gap between Annuals #${annualNum - 1} & #${annualNum + 1}`;
            } else if (isFirstAnnual && hasNext) {
              gapScore = 100; // Full bridge: First Annual of series connecting to next owned Annual
              gapType = 'full';
              gapDetail = `First Annual of series (bridges to Annual #${annualNum + 1})`;
            } else if (isFinalAnnual && hasPrev) {
              gapScore = 100; // Full bridge: Final Annual of series connecting to previous owned Annual
              gapType = 'full';
              gapDetail = `Final Annual of series (bridges from Annual #${annualNum - 1})`;
            } else if (hasPrev) {
              gapScore = 50; // Half gap: extends run after previous Annual
              gapType = 'half_prev';
              gapDetail = `Extends Annual run after #${annualNum - 1}`;
            } else if (hasNext) {
              gapScore = 50; // Half gap: precedes owned next Annual
              gapType = 'half_next';
              gapDetail = `Precedes owned Annual #${annualNum + 1}`;
            } else {
              gapDetail = 'No adjacent owned Annuals';
            }
          } else {
            gapDetail = 'No adjacent owned Annuals';
          }
        }
      } else {
        // Regular issue: check against owned regular issues for this series
        const num = parseIntegerIssueNumber(c.issueNumber);

        if (!isNaN(num) && seriesOwnedRegularNumbers.has(sKey)) {
          const ownedSet = seriesOwnedRegularNumbers.get(sKey)!;
          const hasPrev = ownedSet.has(num - 1);
          const hasNext = ownedSet.has(num + 1);

          const minSeriesIssue = seriesMinRegularNumbers.get(sKey);
          const maxSeriesIssue = seriesMaxRegularNumbers.get(sKey);

          // First issue of series: #1, or #0 if series begins at 0
          const isFirstIssue = num === 1 || (num === 0 && minSeriesIssue === 0);

          // Final issue of series:
          // Matches known series issue total, or matches max issue and effective total/completes series
          const isFinalIssue = Boolean(
            (knownTotal && knownTotal > 0 && (num === knownTotal || (num >= knownTotal && num === maxSeriesIssue))) ||
            (!knownTotal && maxSeriesIssue !== undefined && num === maxSeriesIssue && (num === effectiveTotal || completesSeries) && num > 1)
          );

          if (hasPrev && hasNext) {
            gapScore = 100; // Full bridge between two owned issues
            gapType = 'full';
            gapDetail = `Bridges gap between #${num - 1} & #${num + 1}`;
          } else if (isFirstIssue && hasNext) {
            gapScore = 100; // Full bridge: first issue of series connecting to next owned issue
            gapType = 'full';
            gapDetail = `First issue of series (bridges to #${num + 1})`;
          } else if (isFinalIssue && hasPrev) {
            gapScore = 100; // Full bridge: final issue of series connecting to previous owned issue
            gapType = 'full';
            gapDetail = `Final issue of series (bridges from #${num - 1})`;
          } else if (hasPrev) {
            gapScore = 50; // Half gap: extends run after previous issue
            gapType = 'half_prev';
            gapDetail = `Extends run after #${num - 1}`;
          } else if (hasNext) {
            gapScore = 50; // Half gap: precedes owned next issue
            gapType = 'half_next';
            gapDetail = `Precedes owned #${num + 1}`;
          }
        }
      }
    }

    // --- Composite Priority Score ---
    // Total sum of all 3 weighted metrics (max 300)
    const compositeScore = seriesScore + eventScore + gapScore;
    const normalizedScore = Math.round(compositeScore / 3);

    // --- Primary Driver Determination ---
    let primaryDriver: 'Series Completion' | 'Event Completion' | 'Gap Filler' | 'Series & Gap' | 'Multi-Priority' =
      'Series Completion';
    let primaryReason = '';

    if (gapScore === 100 && seriesScore === 100) {
      primaryDriver = 'Series & Gap';
      primaryReason = `100% Series Run closer & ${gapDetail}`;
    } else if (gapScore > seriesScore && gapScore > eventScore) {
      primaryDriver = 'Gap Filler';
      primaryReason = gapDetail;
    } else if (eventScore > seriesScore && eventScore >= gapScore) {
      primaryDriver = 'Event Completion';
      primaryReason = eventDetail;
    } else if (seriesScore >= eventScore && seriesScore >= gapScore) {
      primaryDriver = 'Series Completion';
      primaryReason = completesSeries
        ? `Completes 100% of ${c.seriesName || c.title} run!`
        : `Brings ${c.seriesName || c.title} to ${seriesScore}% complete (${newOwnedSeriesCount}/${effectiveTotal})`;
    } else {
      primaryDriver = 'Multi-Priority';
      primaryReason = `${gapDetail} • ${seriesScore}% Series`;
    }

    return {
      comic: c,
      seriesScore,
      eventScore,
      gapScore,
      gapType,
      gapDetail,
      compositeScore,
      normalizedScore,
      primaryDriver,
      primaryReason,
      completesSeries,
      completesEvent,
      effectiveTotalSeriesIssues: effectiveTotal,
      newOwnedSeriesCount,
    };
  });

  // Default ranking by composite score descending
  results.sort((a, b) => {
    if (b.compositeScore !== a.compositeScore) return b.compositeScore - a.compositeScore;
    if (b.gapScore !== a.gapScore) return b.gapScore - a.gapScore;
    if (b.seriesScore !== a.seriesScore) return b.seriesScore - a.seriesScore;
    return b.eventScore - a.eventScore;
  });

  return results;
}
