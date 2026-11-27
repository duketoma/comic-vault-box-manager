import React, { useMemo, useState } from 'react';
import { ComicBook } from '../types';
import { getComicCoverUrl, handleImageError } from '../utils/imageUtils';
import {
  DEFAULT_UI_STYLE_PREFS,
  getSlabNumericGradeLabel,
  isComicHolofoilEligible,
  UiStylePreferences,
} from '../utils/uiThemeConfig';
import {
  Sparkles,
  Trophy,
  TrendingUp,
  TrendingDown,
  ChevronUp,
  ChevronDown,
  Shuffle,
  BookOpen,
  Crown,
  ArrowUpRight,
} from 'lucide-react';

const SPOTLIGHT_COLLAPSED_STORAGE_KEY = 'comic_vault_spotlight_collapsed_v1';

interface VaultSpotlightBannerProps {
  comics: ComicBook[];
  seriesRunCounts: { complete: number; near: number; inProgress: number };
  onSelectComic: (comic: ComicBook) => void;
  onQuickFilter?: (filterType: 'complete' | 'unread' | 'fullArt') => void;
  uiStylePrefs?: UiStylePreferences;
}

export const VaultSpotlightBanner: React.FC<VaultSpotlightBannerProps> = ({
  comics,
  seriesRunCounts,
  onSelectComic,
  onQuickFilter,
  uiStylePrefs = DEFAULT_UI_STYLE_PREFS,
}) => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    try {
      return localStorage.getItem(SPOTLIGHT_COLLAPSED_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [spotlightIndex, setSpotlightIndex] = useState<number>(0);

  const toggleCollapsed = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SPOTLIGHT_COLLAPSED_STORAGE_KEY, String(next));
      } catch {
        // Ignore storage quota errors
      }
      return next;
    });
  };

  // Single-pass aggregation over collection (respects GEMINI.md Rule 3 & 4)
  const metrics = useMemo(() => {
    let ownedCount = 0;
    let unreadCount = 0;
    let fullArtCount = 0;
    let totalValue = 0;
    let valuedCount = 0;
    let deltaSum = 0;
    let prevSum = 0;
    const grailCandidates: { comic: ComicBook; score: number }[] = [];

    for (let i = 0; i < comics.length; i++) {
      const c = comics[i];
      if (!c || c.readingStatus === 'Wishlist') continue;
      ownedCount++;

      if (c.readingStatus === 'Unread') unreadCount++;
      if (c.coverImageFull) fullArtCount++;

      const estNum = c.estimatedValue != null ? Number(c.estimatedValue) : NaN;
      const hasEst = Number.isFinite(estNum) && estNum > 0;
      if (hasEst) {
        totalValue += estNum;
        valuedCount++;
        const prevNum = c.previousEstimatedValue != null ? Number(c.previousEstimatedValue) : NaN;
        if (Number.isFinite(prevNum) && prevNum > 0) {
          deltaSum += estNum - prevNum;
          prevSum += prevNum;
        }
      }

      // Score candidate for Grail Spotlight (prefer priced keys, high condition, real cover art)
      const hasCover = Boolean(
        c.coverImage &&
          !c.coverImage.toLowerCase().includes('noimage') &&
          !c.coverImage.includes('1h-E8ndmQeDajXJaZKqRW9JU9PjXZH0jX')
      );
      let score = hasEst ? estNum : 0;
      if (hasCover) score += 15;
      if (c.coverImageFull) score += 20;
      if (c.condition === 'Gem Mint' || c.condition === 'Mint') score += 12;
      if (String(c.issueNumber || '').replace(/^#/, '').trim() === '1') score += 8;

      if (grailCandidates.length < 12) {
        grailCandidates.push({ comic: c, score });
      } else {
        // Maintain top 12 candidates without sorting the entire array
        let minIdx = 0;
        for (let j = 1; j < grailCandidates.length; j++) {
          if (grailCandidates[j].score < grailCandidates[minIdx].score) {
            minIdx = j;
          }
        }
        if (score > grailCandidates[minIdx].score) {
          grailCandidates[minIdx] = { comic: c, score };
        }
      }
    }

    grailCandidates.sort((a, b) => b.score - a.score);
    const pctDelta = prevSum > 0 ? (deltaSum / prevSum) * 100 : null;

    return {
      ownedCount,
      unreadCount,
      fullArtCount,
      totalValue,
      valuedCount,
      deltaSum,
      pctDelta,
      topGrails: grailCandidates.map((g) => g.comic),
    };
  }, [comics]);

  if (metrics.ownedCount === 0) return null;

  const activeGrail =
    metrics.topGrails.length > 0
      ? metrics.topGrails[spotlightIndex % metrics.topGrails.length]
      : null;

  const grailValueNum =
    activeGrail?.estimatedValue != null && !Number.isNaN(Number(activeGrail.estimatedValue))
      ? Number(activeGrail.estimatedValue)
      : null;

  const grailSlabGrade = activeGrail
    ? getSlabNumericGradeLabel(activeGrail.condition, activeGrail.tags, activeGrail.notes)
    : null;

  const showGrailHolofoil = activeGrail
    ? isComicHolofoilEligible(activeGrail, uiStylePrefs.holofoilMode)
    : false;

  const formattedTotalValue =
    metrics.totalValue >= 1000
      ? `$${metrics.totalValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
      : `$${metrics.totalValue.toFixed(2)}`;

  // Compact collapsed bar
  if (isCollapsed) {
    return (
      <div
        data-testid="vault-spotlight-collapsed"
        className="bg-gradient-to-r from-slate-900 via-indigo-950/95 to-slate-900 text-white rounded-xl px-4 py-2.5 border border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-3"
      >
        <div className="flex items-center gap-3 flex-wrap text-xs">
          <span className="inline-flex items-center gap-1.5 font-extrabold text-amber-300 tracking-wide uppercase text-[10px]">
            <Sparkles className="w-3.5 h-3.5" />
            Vault Pulse
          </span>
          <span className="font-black text-sm text-white">{formattedTotalValue}</span>
          <span className="text-slate-400">•</span>
          <span className="text-slate-300 font-semibold">
            {metrics.ownedCount.toLocaleString()} Owned
          </span>
          {seriesRunCounts.complete > 0 && (
            <>
              <span className="text-slate-400 hidden sm:inline">•</span>
              <span className="text-amber-300 font-semibold hidden sm:inline-flex items-center gap-1">
                <Trophy className="w-3 h-3" />
                {seriesRunCounts.complete} Complete Runs
              </span>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={toggleCollapsed}
          data-testid="vault-spotlight-toggle"
          className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-slate-100 transition-colors cursor-pointer"
        >
          <span>Show Spotlight</span>
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <section
      data-testid="vault-spotlight-banner"
      className="relative overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-700/70 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 text-white shadow-lg"
    >
      {/* Subtle Ambient Glow Orbs */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-20 -left-16 w-64 h-64 rounded-full bg-indigo-500/20 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 right-12 w-72 h-72 rounded-full bg-amber-500/15 blur-3xl"
      />

      <div className="relative z-10 p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Left: Vault Value & KPI Bento */}
        <div className="lg:col-span-7 flex flex-col justify-between space-y-3 lg:pr-2">
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-200 text-[10px] font-extrabold uppercase tracking-wider">
              <Sparkles className="w-3 h-3 text-amber-300" />
              <span>Vault Pulse</span>
            </div>

            <button
              type="button"
              onClick={toggleCollapsed}
              data-testid="vault-spotlight-toggle"
              className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-slate-200 border border-white/10 transition-colors cursor-pointer"
              title="Collapse Vault Spotlight"
            >
              <span>Hide</span>
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-5 w-full">
            <div className="shrink-0">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Estimated Vault Value
              </div>
              <div className="flex items-baseline gap-2.5 mt-0.5">
                <span className="text-3xl sm:text-4xl font-black tracking-tight text-white">
                  {metrics.valuedCount > 0 ? formattedTotalValue : '—'}
                </span>
                {metrics.pctDelta !== null && Math.abs(metrics.pctDelta) >= 0.1 && (
                  <span
                    className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-extrabold ${
                      metrics.pctDelta >= 0
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-400/30'
                    }`}
                  >
                    {metrics.pctDelta >= 0 ? (
                      <TrendingUp className="w-3 h-3" />
                    ) : (
                      <TrendingDown className="w-3 h-3" />
                    )}
                    {metrics.pctDelta >= 0 ? '+' : ''}
                    {metrics.pctDelta.toFixed(1)}%
                  </span>
                )}
              </div>
            </div>

            {/* Full-Width Value Trend Sparkline stretching to the Grail boundary */}
            <div className="flex-1 min-w-[120px] hidden sm:flex items-end pb-1">
              <svg
                aria-hidden="true"
                viewBox="0 0 240 44"
                preserveAspectRatio="none"
                className="w-full h-11 text-emerald-400/90"
                fill="none"
              >
                <defs>
                  <linearGradient id="vaultSparkGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="currentColor" stopOpacity="0.32" />
                    <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  d="M2 36 L34 31 L66 34 L100 24 L136 27 L172 15 L206 18 L238 6 L238 44 L2 44 Z"
                  fill="url(#vaultSparkGrad)"
                />
                <path
                  d="M2 36 L34 31 L66 34 L100 24 L136 27 L172 15 L206 18 L238 6"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  vectorEffect="non-scaling-stroke"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>

          {/* Interactive Collector KPI Chips */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/8 border border-white/10 text-xs font-bold text-slate-100">
              <BookOpen className="w-3.5 h-3.5 text-sky-400" />
              <span>{metrics.ownedCount.toLocaleString()} Owned</span>
            </div>

            <button
              type="button"
              onClick={() => onQuickFilter?.('complete')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/30 text-xs font-bold text-amber-200 transition-colors cursor-pointer"
              title="Filter catalog to 100% Completed Series Runs"
            >
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <span>{seriesRunCounts.complete} Complete Runs</span>
            </button>

            <button
              type="button"
              onClick={() => onQuickFilter?.('unread')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-400/30 text-xs font-bold text-indigo-200 transition-colors cursor-pointer"
              title="Filter catalog to Unread comics"
            >
              <span>{metrics.unreadCount.toLocaleString()} Unread</span>
            </button>

            {metrics.fullArtCount > 0 && (
              <button
                type="button"
                onClick={() => onQuickFilter?.('fullArt')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 border border-purple-400/30 text-xs font-bold text-purple-200 transition-colors cursor-pointer"
                title="Filter catalog to Full Wraparound Cover Art"
              >
                <Sparkles className="w-3.5 h-3.5 text-purple-300" />
                <span>{metrics.fullArtCount} Full Art</span>
              </button>
            )}
          </div>
        </div>

        {/* Right: Grail Spotlight Card */}
        {activeGrail && (
          <div className="lg:col-span-5 w-full h-full flex items-center gap-4 bg-white/7 hover:bg-white/11 backdrop-blur-md border border-white/12 rounded-2xl p-3.5 sm:p-4 transition-all group">
            {/* Tilted Cover */}
            <button
              type="button"
              onClick={() => onSelectComic(activeGrail)}
              className="relative w-20 sm:w-24 aspect-[2/3] shrink-0 rounded-lg overflow-hidden shadow-xl border border-white/20 -rotate-2 group-hover:rotate-0 group-hover:scale-105 transition-transform duration-300 cursor-pointer"
              title={`Inspect ${activeGrail.title || activeGrail.seriesName || 'Grail Comic'}`}
            >
              <img
                src={getComicCoverUrl(activeGrail.coverImage)}
                alt={activeGrail.title || 'Spotlight Comic'}
                onError={handleImageError}
                referrerPolicy="no-referrer"
                loading="lazy"
                className="w-full h-full object-cover"
              />
              <div className="comic-mylar-glare" />
              {showGrailHolofoil && <div className="comic-holofoil-overlay" />}
            </button>

            {/* Grail Metadata */}
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-amber-300">
                  <Crown className="w-3 h-3" />
                  Grail Spotlight
                </span>
                <div className="flex items-center gap-1">
                  {metrics.topGrails.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSpotlightIndex((prev) => (prev + 1) % metrics.topGrails.length);
                      }}
                      className="p-1 rounded-md bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-colors cursor-pointer"
                      title="Cycle to next top Grail issue"
                      aria-label="Next Grail Spotlight"
                    >
                      <Shuffle className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => onSelectComic(activeGrail)}
                className="text-left block w-full cursor-pointer"
              >
                <div className="font-black text-sm sm:text-base text-white truncate group-hover:text-amber-200 transition-colors">
                  {activeGrail.title || activeGrail.fullTitle || activeGrail.seriesName || 'Untitled'}{' '}
                  <span className="text-indigo-300">#{activeGrail.issueNumber}</span>
                </div>
                <p className="text-[11px] text-slate-300 truncate">
                  {activeGrail.publisher || 'Unknown Publisher'}
                  {activeGrail.publicationYear ? ` • ${activeGrail.publicationYear}` : ''}
                </p>
              </button>

              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {grailValueNum !== null && (
                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-400/35 text-emerald-300 text-xs font-black">
                    ${grailValueNum.toFixed(2)}
                  </span>
                )}
                {grailSlabGrade && (
                  <span className="px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-400/35 text-amber-200 text-[10px] font-extrabold">
                    {grailSlabGrade.grade} {grailSlabGrade.code}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onSelectComic(activeGrail)}
                  className="ml-auto inline-flex items-center gap-0.5 text-[11px] font-bold text-indigo-300 hover:text-white transition-colors cursor-pointer"
                >
                  <span>Inspect</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
