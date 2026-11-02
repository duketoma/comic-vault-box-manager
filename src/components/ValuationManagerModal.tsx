import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  BatchValuationStatus,
  BatchValuationUpdateEntry,
  ComicBook,
  ValuationScope,
} from '../types';
import {
  fetchValuationStatus,
  lookupComicValuation,
  updateValuationScheduler,
} from '../services/postgresService';
import {
  X,
  TrendingUp,
  RefreshCw,
  Lock,
  CheckCircle2,
  Clock,
  DollarSign,
  Play,
  Square,
  ExternalLink,
  Calendar,
  Sparkles,
  ShoppingCart,
  ShieldCheck,
} from 'lucide-react';

interface ValuationManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  comics: ComicBook[];
  onUpdateComicsBatch: (updatedComics: ComicBook[]) => Promise<void> | void;
  onSelectComic?: (comic: ComicBook) => void;
}

const SCHEDULER_STORAGE_KEY = 'comic_vault_valuation_scheduler_v1';

interface LocalSchedulerPrefs {
  schedulerEnabled: boolean;
  staleThresholdDays: number;
  dailyBatchLimit: number;
  lastAutoRunDate?: string;
}

function loadSchedulerPrefs(): LocalSchedulerPrefs {
  try {
    const raw = localStorage.getItem(SCHEDULER_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        schedulerEnabled: parsed.schedulerEnabled !== false,
        staleThresholdDays: Number(parsed.staleThresholdDays) || 30,
        dailyBatchLimit: Number(parsed.dailyBatchLimit) || 150,
        lastAutoRunDate: parsed.lastAutoRunDate,
      };
    }
  } catch {
    // Ignore storage read errors
  }
  return {
    schedulerEnabled: true,
    staleThresholdDays: 30,
    dailyBatchLimit: 150,
  };
}

export const ValuationManagerModal: React.FC<ValuationManagerModalProps> = ({
  isOpen,
  onClose,
  comics,
  onUpdateComicsBatch,
  onSelectComic,
}) => {
  const initialPrefs = useMemo(() => loadSchedulerPrefs(), []);
  const [scope, setScope] = useState<ValuationScope>('all_stale');
  const [batchLimit, setBatchLimit] = useState<number>(initialPrefs.dailyBatchLimit);
  const [staleThresholdDays, setStaleThresholdDays] = useState<number>(
    initialPrefs.staleThresholdDays
  );
  const [schedulerEnabled, setSchedulerEnabled] = useState<boolean>(
    initialPrefs.schedulerEnabled
  );

  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [totalQueued, setTotalQueued] = useState<number>(0);
  const [processedCount, setProcessedCount] = useState<number>(0);
  const [updatedCount, setUpdatedCount] = useState<number>(0);
  const [failedCount, setFailedCount] = useState<number>(0);
  const [currentComicTitle, setCurrentComicTitle] = useState<string | undefined>(undefined);
  const [recentUpdates, setRecentUpdates] = useState<BatchValuationUpdateEntry[]>([]);
  const stopRef = useRef<boolean>(false);

  // Sync scheduler settings with backend when modal opens
  useEffect(() => {
    if (!isOpen) return;
    fetchValuationStatus()
      .then((status: BatchValuationStatus) => {
        if (status.recentUpdates && status.recentUpdates.length > 0 && recentUpdates.length === 0) {
          setRecentUpdates(status.recentUpdates);
        }
      })
      .catch(() => {
        // Ignore offline status errors
      });
  }, [isOpen]);

  // Single-pass collection valuation coverage aggregation (Rule #4)
  const coverage = useMemo(() => {
    let totalOwned = 0;
    let totalWishlist = 0;
    let pricedOwned = 0;
    let missingOwned = 0;
    let staleOwned = 0;
    let lockedCount = 0;
    let pricedWishlist = 0;
    let missingWishlist = 0;
    let staleWishlist = 0;
    let totalPortfolioValue = 0;

    const cutoffMs = Date.now() - staleThresholdDays * 24 * 60 * 60 * 1000;

    for (let i = 0; i < comics.length; i++) {
      const c = comics[i];
      const isWishlist = c.readingStatus === 'Wishlist';
      const val = Number(c.estimatedValue || 0);
      const hasVal = val > 0;
      const isLocked = Boolean(c.lockEstimatedValue);
      const updatedMs = c.valueUpdatedAt ? Date.parse(c.valueUpdatedAt) : 0;
      const isStale = !hasVal || !updatedMs || updatedMs < cutoffMs;

      if (isLocked) lockedCount++;

      if (isWishlist) {
        totalWishlist++;
        if (hasVal) pricedWishlist++;
        else missingWishlist++;
        if (!isLocked && isStale) staleWishlist++;
      } else {
        totalOwned++;
        const copies = Math.max(1, Number(c.copiesOwned) || 1);
        if (hasVal) {
          pricedOwned++;
          totalPortfolioValue += val * copies;
        } else {
          missingOwned++;
        }
        if (!isLocked && isStale) staleOwned++;
      }
    }

    return {
      totalOwned,
      totalWishlist,
      pricedOwned,
      missingOwned,
      staleOwned,
      lockedCount,
      pricedWishlist,
      missingWishlist,
      staleWishlist,
      totalPortfolioValue: Number(totalPortfolioValue.toFixed(2)),
    };
  }, [comics, staleThresholdDays]);

  // Candidate list matching the selected scope & Owned-first priority
  const eligibleCandidates = useMemo(() => {
    const cutoffMs = Date.now() - staleThresholdDays * 24 * 60 * 60 * 1000;

    const filtered = comics.filter((c) => {
      if (c.lockEstimatedValue) return false;
      const isWishlist = c.readingStatus === 'Wishlist';
      const hasVal = Number(c.estimatedValue || 0) > 0;
      const updatedMs = c.valueUpdatedAt ? Date.parse(c.valueUpdatedAt) : 0;
      const isStale = !hasVal || !updatedMs || updatedMs < cutoffMs;

      if (scope === 'missing_only') return !hasVal;
      if (scope === 'owned_only') return !isWishlist && isStale;
      if (scope === 'wishlist_only') return isWishlist && isStale;
      return isStale; // all_stale
    });

    // Sort: Owned first -> Missing value first -> Oldest valueUpdatedAt first
    filtered.sort((a, b) => {
      const aWish = a.readingStatus === 'Wishlist' ? 1 : 0;
      const bWish = b.readingStatus === 'Wishlist' ? 1 : 0;
      if (aWish !== bWish) return aWish - bWish;

      const aMissing = Number(a.estimatedValue || 0) > 0 ? 1 : 0;
      const bMissing = Number(b.estimatedValue || 0) > 0 ? 1 : 0;
      if (aMissing !== bMissing) return aMissing - bMissing;

      const aTime = a.valueUpdatedAt ? Date.parse(a.valueUpdatedAt) : 0;
      const bTime = b.valueUpdatedAt ? Date.parse(b.valueUpdatedAt) : 0;
      return aTime - bTime;
    });

    return filtered;
  }, [comics, scope, staleThresholdDays]);

  const handleSaveSchedulerPrefs = (next: Partial<LocalSchedulerPrefs>) => {
    const updated: LocalSchedulerPrefs = {
      schedulerEnabled:
        next.schedulerEnabled !== undefined ? next.schedulerEnabled : schedulerEnabled,
      staleThresholdDays:
        next.staleThresholdDays !== undefined ? next.staleThresholdDays : staleThresholdDays,
      dailyBatchLimit:
        next.dailyBatchLimit !== undefined ? next.dailyBatchLimit : batchLimit,
    };
    try {
      localStorage.setItem(SCHEDULER_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Ignore storage quota errors
    }
    updateValuationScheduler({
      schedulerEnabled: updated.schedulerEnabled,
      staleThresholdDays: updated.staleThresholdDays,
      dailyBatchLimit: updated.dailyBatchLimit,
    }).catch(() => {});
  };

  const handleStartBatch = async () => {
    if (isRunning) return;
    const queue = eligibleCandidates.slice(0, batchLimit);
    if (queue.length === 0) return;

    stopRef.current = false;
    setIsRunning(true);
    setTotalQueued(queue.length);
    setProcessedCount(0);
    setUpdatedCount(0);
    setFailedCount(0);

    const updatedBatch: ComicBook[] = [];

    try {
      for (let i = 0; i < queue.length; i++) {
        if (stopRef.current) break;
        const target = queue[i];
        const displayTitle =
          target.fullTitle ||
          (target.issueNumber ? `${target.title} #${target.issueNumber}` : target.title);
        setCurrentComicTitle(displayTitle);

        try {
          const quote = await lookupComicValuation({
            id: target.id,
            title: target.title,
            seriesName: target.seriesName,
            issueNumber: target.issueNumber,
            volume: target.volume,
            publicationYear: target.publicationYear,
            publisher: target.publisher,
            format: target.format,
            condition: target.condition,
            purchasePrice: target.purchasePrice,
            estimatedValue: target.estimatedValue,
            tags: target.tags,
            notes: target.notes,
          });

          const modifiedComic: ComicBook = {
            ...target,
            previousEstimatedValue: target.estimatedValue ?? target.previousEstimatedValue,
            estimatedValue: quote.estimatedValue,
            valueUpdatedAt: quote.updatedAt,
            valueSource: quote.source,
            updatedAt: quote.updatedAt,
          };

          updatedBatch.push(modifiedComic);
          setUpdatedCount((prev) => prev + 1);

          const entry: BatchValuationUpdateEntry = {
            comicId: target.id,
            fullTitle: displayTitle,
            oldValue: target.estimatedValue,
            newValue: quote.estimatedValue,
            source: quote.source,
            sourceUrl: quote.sourceUrl,
            condition: quote.conditionApplied,
            isGraded: quote.isGradedApplied,
            updatedAt: quote.updatedAt,
          };
          setRecentUpdates((prev) => [entry, ...prev].slice(0, 40));

          // Flush updates in chunks of 5 so the UI & IndexedDB reflect progress live
          if (updatedBatch.length >= 5) {
            const toFlush = [...updatedBatch];
            updatedBatch.length = 0;
            await onUpdateComicsBatch(toFlush);
          }
        } catch (err) {
          console.warn(`Batch valuation failed for ${displayTitle}:`, err);
          setFailedCount((prev) => prev + 1);
        } finally {
          setProcessedCount(i + 1);
        }
      }

      if (updatedBatch.length > 0) {
        await onUpdateComicsBatch(updatedBatch);
      }
    } finally {
      setIsRunning(false);
      setCurrentComicTitle(undefined);
    }
  };

  const handleStopBatch = () => {
    stopRef.current = true;
  };

  if (!isOpen) return null;

  const progressPct =
    totalQueued > 0 ? Math.min(100, Math.round((processedCount / totalQueued) * 100)) : 0;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !isRunning) onClose();
      }}
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden my-6 text-slate-900 dark:text-slate-100 flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-5 py-4 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base sm:text-lg text-slate-900 dark:text-white flex items-center gap-2">
                <span>Market Valuation & Periodic Price Updater</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  Free Multi-Source Cascade
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Condition-adjusted market valuations via PriceCharting & eBay Comics comps with Value Lock protection
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Market Valuation Modal"
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* Coverage Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-900/60">
              <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400 text-xs font-bold mb-1">
                <span>Portfolio Value</span>
                <DollarSign className="w-4 h-4" />
              </div>
              <div className="text-lg sm:text-xl font-extrabold text-emerald-800 dark:text-emerald-300">
                ${coverage.totalPortfolioValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80 mt-0.5">
                {coverage.pricedOwned} of {coverage.totalOwned} owned priced
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-400 text-xs font-bold mb-1">
                <span>Needs Update (Owned)</span>
                <Clock className="w-4 h-4 text-indigo-500" />
              </div>
              <div className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white">
                {coverage.staleOwned}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {coverage.missingOwned} unpriced • {Math.max(0, coverage.staleOwned - coverage.missingOwned)} &gt;{staleThresholdDays}d old
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-400 text-xs font-bold mb-1">
                <span>Wishlist Pricing</span>
                <ShoppingCart className="w-4 h-4 text-purple-500" />
              </div>
              <div className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white">
                {coverage.pricedWishlist} / {coverage.totalWishlist}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {coverage.missingWishlist} wishlist items unpriced
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-50/60 dark:bg-amber-950/25 border border-amber-200/80 dark:border-amber-900/50">
              <div className="flex items-center justify-between text-amber-800 dark:text-amber-300 text-xs font-bold mb-1">
                <span>Locked Values</span>
                <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="text-lg sm:text-xl font-extrabold text-amber-900 dark:text-amber-200">
                {coverage.lockedCount}
              </div>
              <div className="text-[11px] text-amber-700/80 dark:text-amber-400/80 mt-0.5">
                Protected from batch overwrites
              </div>
            </div>
          </div>

          {/* Batch Valuation Runner Panel */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Run Batch Market Valuation</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Prioritizes unpinned Owned comics with missing or stale values first, then Wishlist items.
                </p>
              </div>
              <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2.5 py-1 rounded-lg border border-indigo-200 dark:border-indigo-900 self-start sm:self-auto">
                {eligibleCandidates.length} comic{eligibleCandidates.length === 1 ? '' : 's'} eligible in scope
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                  Update Scope & Priority
                </label>
                <select
                  value={scope}
                  disabled={isRunning}
                  onChange={(e) => setScope(e.target.value as ValuationScope)}
                  aria-label="Update Scope"
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100"
                >
                  <option value="all_stale">
                    Owned First, Then Wishlist (Missing or &gt;{staleThresholdDays} days old)
                  </option>
                  <option value="missing_only">
                    Only Comics Missing an Estimated Value ($0 / Empty)
                  </option>
                  <option value="owned_only">
                    Owned Collection Only (Missing or &gt;{staleThresholdDays} days old)
                  </option>
                  <option value="wishlist_only">
                    Wishlist Items Only (Missing or &gt;{staleThresholdDays} days old)
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                  Max Comics This Run
                </label>
                <select
                  value={batchLimit}
                  disabled={isRunning}
                  onChange={(e) => {
                    const nextLimit = Number(e.target.value);
                    setBatchLimit(nextLimit);
                    handleSaveSchedulerPrefs({ dailyBatchLimit: nextLimit });
                  }}
                  aria-label="Max Comics This Run"
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100"
                >
                  <option value={10}>Up to 10 comics</option>
                  <option value={25}>Up to 25 comics</option>
                  <option value={50}>Up to 50 comics</option>
                  <option value={150}>Up to 150 comics (Recommended)</option>
                  <option value={300}>Up to 300 comics</option>
                  <option value={500}>Up to 500 comics</option>
                </select>
              </div>
            </div>

            {/* Action Buttons & Progress Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-2">
                {!isRunning ? (
                  <button
                    type="button"
                    onClick={handleStartBatch}
                    disabled={eligibleCandidates.length === 0}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-xs transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>
                      Start Batch Update ({Math.min(batchLimit, eligibleCandidates.length)} Comics)
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStopBatch}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span>Stop Batch</span>
                  </button>
                )}
              </div>

              {(isRunning || processedCount > 0) && (
                <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-3">
                  <span>
                    Processed: <strong>{processedCount}</strong> / {totalQueued}
                  </span>
                  <span className="text-emerald-600 dark:text-emerald-400">
                    Updated: <strong>{updatedCount}</strong>
                  </span>
                  {failedCount > 0 && (
                    <span className="text-amber-600 dark:text-amber-400">
                      Skipped: <strong>{failedCount}</strong>
                    </span>
                  )}
                </div>
              )}
            </div>

            {(isRunning || processedCount > 0) && (
              <div className="space-y-1.5">
                <div className="w-full h-2.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                {currentComicTitle && (
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <RefreshCw className="w-3 h-3 animate-spin text-emerald-500 shrink-0" />
                    <span className="truncate">Pricing: {currentComicTitle}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Periodic Auto-Scheduler Configuration */}
          <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Calendar className="w-4 h-4 text-indigo-500 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                    Periodic Rolling Auto-Refresh Schedule
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Automatically refreshes stale unpinned comics in the background when the server is running
                  </p>
                </div>
              </div>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={schedulerEnabled}
                  onChange={(e) => {
                    const enabled = e.target.checked;
                    setSchedulerEnabled(enabled);
                    handleSaveSchedulerPrefs({ schedulerEnabled: enabled });
                  }}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {schedulerEnabled ? 'Auto-Schedule Enabled' : 'Paused'}
                </span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                  Refresh Values Older Than
                </label>
                <select
                  value={staleThresholdDays}
                  onChange={(e) => {
                    const days = Number(e.target.value);
                    setStaleThresholdDays(days);
                    handleSaveSchedulerPrefs({ staleThresholdDays: days });
                  }}
                  aria-label="Refresh Values Older Than"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100"
                >
                  <option value={7}>7 days</option>
                  <option value={14}>14 days</option>
                  <option value={30}>30 days (Recommended Monthly)</option>
                  <option value={60}>60 days</option>
                  <option value={90}>90 days (Quarterly)</option>
                </select>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-lg border border-slate-200/70 dark:border-slate-800">
                <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>
                  Condition multipliers (Gem Mint 1.35× → Near Mint 1.0× → Fine 0.5× → Poor 0.05×) and CGC/CBCS graded tiers are applied automatically.
                </span>
              </div>
            </div>
          </div>

          {/* Recent Price Changes Feed */}
          {recentUpdates.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                <span>Recent Valuation Updates ({recentUpdates.length})</span>
                <span className="text-[11px] font-normal text-slate-400">
                  Click any comic to inspect or lock its value
                </span>
              </h4>
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 max-h-60 overflow-y-auto bg-white dark:bg-slate-900">
                {recentUpdates.map((item, idx) => {
                  const delta =
                    item.oldValue !== undefined && item.oldValue > 0
                      ? Number((item.newValue - item.oldValue).toFixed(2))
                      : undefined;
                  const matchingComic = comics.find((c) => c.id === item.comicId);

                  return (
                    <div
                      key={`${item.comicId}-${idx}`}
                      onClick={() => {
                        if (matchingComic && onSelectComic) {
                          onSelectComic(matchingComic);
                        }
                      }}
                      className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-slate-800 dark:text-slate-100 truncate flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span className="truncate">{item.fullTitle}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
                          <span>{item.condition}</span>
                          {item.isGraded && (
                            <span className="px-1.5 py-0.2 rounded bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-bold text-[10px]">
                              Graded Tier
                            </span>
                          )}
                          <span>•</span>
                          {item.sourceUrl ? (
                            <a
                              href={item.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-0.5"
                            >
                              <span>{item.source}</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          ) : (
                            <span>{item.source}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {item.oldValue !== undefined && item.oldValue > 0 && (
                          <span className="text-[11px] text-slate-400 line-through">
                            ${item.oldValue.toFixed(2)}
                          </span>
                        )}
                        <span className="font-extrabold text-emerald-700 dark:text-emerald-400">
                          ${item.newValue.toFixed(2)}
                        </span>
                        {delta !== undefined && Math.abs(delta) >= 0.01 && (
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              delta > 0
                                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                                : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                            }`}
                          >
                            {delta > 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
