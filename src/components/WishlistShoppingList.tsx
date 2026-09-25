import React, { useState, useMemo } from 'react';
import { ComicBook, SeriesIssueTotal, StorageBox } from '../types';
import { getComicCoverUrl, handleImageError } from '../utils/imageUtils';
import {
  ShoppingCart,
  CheckCircle2,
  Sparkles,
  Layers,
  Search,
  Filter,
  ArrowUpDown,
  RefreshCw,
  Trophy,
  Zap,
  Calendar,
  DollarSign,
  Crown,
  ExternalLink,
  Flame,
  CheckSquare,
  Square,
  Package,
  X,
  Boxes
} from 'lucide-react';

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

interface WishlistShoppingListProps {
  comics: ComicBook[];
  boxes: StorageBox[];
  seriesTotals?: SeriesIssueTotal[];
  onSelectComic?: (comic: ComicBook) => void;
  onPurchaseComics: (comicIds: string[], targetBoxId?: number) => Promise<void> | void;
}

export const WishlistShoppingList: React.FC<WishlistShoppingListProps> = ({
  comics,
  boxes,
  seriesTotals = [],
  onSelectComic,
  onPurchaseComics,
}) => {
  // Local UI State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDriverFilter, setSelectedDriverFilter] = useState<'all' | 'gap' | 'series' | 'event'>('all');
  const [selectedPublisher, setSelectedPublisher] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'priority' | 'gap' | 'series' | 'event' | 'value' | 'title'>('priority');
  const [limitTop60, setLimitTop60] = useState<boolean>(true);
  const [selectedComicIds, setSelectedComicIds] = useState<Set<string>>(new Set());
  const [targetBoxId, setTargetBoxId] = useState<number>(boxes.length > 0 ? boxes[0].id : 1);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [purchaseToast, setPurchaseToast] = useState<{ message: string; count: number } | null>(null);

  // --------------------------------------------------------------------------
  // 1. SCORING ENGINE: Precompute lookups for Series, Events & Adjacent Issues
  // --------------------------------------------------------------------------
  const scoredWishlist = useMemo(() => {
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
    const seriesOwnedNumbers = new Map<string, Set<number>>();

    const eventTotalMap = new Map<string, number>();
    const eventOwnedMap = new Map<string, number>();

    comics.forEach((c) => {
      const sKey = (c.seriesName || c.title || '').trim().toLowerCase();
      const isOwned = c.readingStatus !== 'Wishlist';

      if (isOwned) {
        seriesOwnedMap.set(sKey, (seriesOwnedMap.get(sKey) || 0) + 1);
        const num = parseInt(c.issueNumber, 10);
        if (!isNaN(num)) {
          if (!seriesOwnedNumbers.has(sKey)) {
            seriesOwnedNumbers.set(sKey, new Set<number>());
          }
          seriesOwnedNumbers.get(sKey)!.add(num);
        }
      } else {
        seriesWishlistMap.set(sKey, (seriesWishlistMap.get(sKey) || 0) + 1);
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
      const ownedInSeries = seriesOwnedMap.get(sKey) || 0;
      const wishlistInSeries = seriesWishlistMap.get(sKey) || 0;
      const knownTotal = seriesTotalsMap.get(sKey);
      const effectiveTotal =
        knownTotal && knownTotal > 0
          ? knownTotal
          : Math.max(ownedInSeries + wishlistInSeries, 1);

      // --- Metric 1: Series Completion Score (0 - 100) ---
      const newOwnedSeriesCount = ownedInSeries + 1;
      const seriesScore = Math.min(100, Math.round((newOwnedSeriesCount / effectiveTotal) * 100));
      const completesSeries = effectiveTotal > 0 && newOwnedSeriesCount >= effectiveTotal;

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
      let gapScore = 0;
      let gapType: 'full' | 'half_prev' | 'half_next' | 'none' = 'none';
      let gapDetail = 'No adjacent owned issues';
      const num = parseInt(c.issueNumber, 10);

      if (!isNaN(num) && seriesOwnedNumbers.has(sKey)) {
        const ownedSet = seriesOwnedNumbers.get(sKey)!;
        const hasPrev = ownedSet.has(num - 1);
        const hasNext = ownedSet.has(num + 1);

        if (hasPrev && hasNext) {
          gapScore = 100; // Full bridge between two owned issues
          gapType = 'full';
          gapDetail = `Bridges gap between #${num - 1} & #${num + 1}`;
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
  }, [comics, seriesTotals]);

  // Available publishers from the scored wishlist
  const publishers = useMemo(() => {
    const pubSet = new Set<string>();
    scoredWishlist.forEach((s) => {
      if (s.comic.publisher && s.comic.publisher.trim()) {
        pubSet.add(s.comic.publisher.trim());
      }
    });
    return Array.from(pubSet).sort((a, b) => a.localeCompare(b));
  }, [scoredWishlist]);

  // --------------------------------------------------------------------------
  // 2. FILTERING & SORTING FOR IN-STORE SHOPPING
  // --------------------------------------------------------------------------
  const filteredAndSortedList = useMemo(() => {
    let list = scoredWishlist;

    // Driver filter
    if (selectedDriverFilter === 'gap') {
      list = list.filter((s) => s.gapScore > 0);
    } else if (selectedDriverFilter === 'series') {
      list = list.filter((s) => s.seriesScore >= 50 || s.completesSeries);
    } else if (selectedDriverFilter === 'event') {
      list = list.filter((s) => s.eventScore > 0);
    }

    // Publisher filter
    if (selectedPublisher !== 'all') {
      list = list.filter(
        (s) => s.comic.publisher && s.comic.publisher.toLowerCase() === selectedPublisher.toLowerCase()
      );
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (s) =>
          s.comic.title.toLowerCase().includes(q) ||
          (s.comic.seriesName && s.comic.seriesName.toLowerCase().includes(q)) ||
          s.comic.issueNumber.toLowerCase().includes(q) ||
          (s.comic.event && s.comic.event.toLowerCase().includes(q)) ||
          (s.comic.writer && s.comic.writer.toLowerCase().includes(q)) ||
          (s.comic.artist && s.comic.artist.toLowerCase().includes(q)) ||
          (s.comic.publisher && s.comic.publisher.toLowerCase().includes(q))
      );
    }

    // Sort order
    const sorted = [...list];
    if (sortBy === 'priority') {
      sorted.sort((a, b) => b.compositeScore - a.compositeScore || b.gapScore - a.gapScore);
    } else if (sortBy === 'gap') {
      sorted.sort((a, b) => b.gapScore - a.gapScore || b.compositeScore - a.compositeScore);
    } else if (sortBy === 'series') {
      sorted.sort((a, b) => b.seriesScore - a.seriesScore || b.compositeScore - a.compositeScore);
    } else if (sortBy === 'event') {
      sorted.sort((a, b) => b.eventScore - a.eventScore || b.compositeScore - a.compositeScore);
    } else if (sortBy === 'value') {
      sorted.sort((a, b) => (b.comic.estimatedValue || 0) - (a.comic.estimatedValue || 0));
    } else if (sortBy === 'title') {
      sorted.sort((a, b) => (a.comic.seriesName || a.comic.title).localeCompare(b.comic.seriesName || b.comic.title));
    }

    // Top 60 limitation (default)
    return limitTop60 ? sorted.slice(0, 60) : sorted;
  }, [scoredWishlist, selectedDriverFilter, selectedPublisher, searchQuery, sortBy, limitTop60]);

  // Selection toggle handlers
  const handleToggleSelect = (comicId: string) => {
    setSelectedComicIds((prev) => {
      const next = new Set(prev);
      if (next.has(comicId)) {
        next.delete(comicId);
      } else {
        next.add(comicId);
      }
      return next;
    });
  };

  const handleSelectAllVisible = () => {
    setSelectedComicIds(new Set(filteredAndSortedList.map((s) => s.comic.id)));
  };

  const handleClearSelection = () => {
    setSelectedComicIds(new Set());
  };

  // Selected comics cost and details
  const selectedComics = useMemo(() => {
    return scoredWishlist.filter((s) => selectedComicIds.has(s.comic.id));
  }, [scoredWishlist, selectedComicIds]);

  const totalSelectedEstCost = useMemo(() => {
    return selectedComics.reduce((acc, s) => acc + (s.comic.estimatedValue || s.comic.purchasePrice || 0), 0);
  }, [selectedComics]);

  // Bulk Purchase Handler
  const handleConfirmPurchase = async () => {
    if (selectedComicIds.size === 0) return;
    setIsPurchasing(true);
    try {
      const ids = Array.from(selectedComicIds);
      await onPurchaseComics(ids, targetBoxId);
      const targetBoxName = boxes.find((b) => b.id === targetBoxId)?.name || `Box #${targetBoxId}`;
      setPurchaseToast({
        message: `Purchased ${ids.length} comic${ids.length === 1 ? '' : 's'}! Added to ${targetBoxName} as In Collection.`,
        count: ids.length,
      });
      setSelectedComicIds(new Set());
    } finally {
      setIsPurchasing(false);
    }
  };

  return (
    <div className="space-y-6 pb-28">
      {/* Toast Notification */}
      {purchaseToast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-700 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center justify-between gap-4 border border-emerald-500 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-200 shrink-0" />
            <span className="text-xs font-bold leading-tight">{purchaseToast.message}</span>
          </div>
          <button
            onClick={() => setPurchaseToast(null)}
            className="text-emerald-200 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Banner / Store Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-purple-950 text-white rounded-3xl p-6 sm:p-7 shadow-lg relative overflow-hidden border border-indigo-900/60">
        <div className="absolute right-0 top-0 w-80 h-80 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-xs">
                <ShoppingCart className="w-3.5 h-3.5 text-rose-400" />
                <span>In-Store Shopping Priority</span>
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-bold">
                {scoredWishlist.length} Wishlisted Comics
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Top 60 Wishlist Hunt List
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              Every wishlisted comic is mathematically prioritized across 3 key collection drivers:
              <strong className="text-emerald-400 ml-1">Series Completion</strong>,
              <strong className="text-amber-400 ml-1">Event Completion</strong>, and
              <strong className="text-purple-400 ml-1">Gap Filling</strong>. Check off issues as you find them at the shop!
            </p>
          </div>

          {/* Quick Metrics Cards */}
          <div className="grid grid-cols-3 gap-2.5 shrink-0">
            <div className="bg-white/10 backdrop-blur rounded-2xl p-3 border border-white/10 text-center">
              <div className="flex items-center justify-center text-purple-300 mb-1">
                <Zap className="w-4 h-4" />
              </div>
              <p className="text-lg font-black">{scoredWishlist.filter((s) => s.gapScore === 100).length}</p>
              <p className="text-[10px] text-slate-300 font-medium">Bridge Gaps</p>
            </div>

            <div className="bg-white/10 backdrop-blur rounded-2xl p-3 border border-white/10 text-center">
              <div className="flex items-center justify-center text-emerald-300 mb-1">
                <Crown className="w-4 h-4" />
              </div>
              <p className="text-lg font-black">{scoredWishlist.filter((s) => s.completesSeries).length}</p>
              <p className="text-[10px] text-slate-300 font-medium">Series Closers</p>
            </div>

            <div className="bg-white/10 backdrop-blur rounded-2xl p-3 border border-white/10 text-center">
              <div className="flex items-center justify-center text-amber-300 mb-1">
                <Flame className="w-4 h-4" />
              </div>
              <p className="text-lg font-black">{scoredWishlist.filter((s) => s.eventScore > 0).length}</p>
              <p className="text-[10px] text-slate-300 font-medium">Event Issues</p>
            </div>
          </div>
        </div>
      </div>

      {/* Controls & Filter Toolbar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs space-y-3">
        {/* Search & Sort Row */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search wishlisted title, series, issue #, writer, or event..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-9 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
            {/* Publisher Dropdown */}
            {publishers.length > 0 && (
              <select
                value={selectedPublisher}
                onChange={(e) => setSelectedPublisher(e.target.value)}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-bold text-xs rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-500 shadow-xs cursor-pointer"
              >
                <option value="all">All Publishers ({publishers.length})</option>
                {publishers.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            )}

            {/* Sort Selector */}
            <div className="flex items-center gap-1.5 shrink-0">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-bold text-xs rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-500 shadow-xs cursor-pointer"
              >
                <option value="priority">Top Priority (Composite)</option>
                <option value="gap">Gap Filling (Full Bridges)</option>
                <option value="series">Series Completion %</option>
                <option value="event">Event Completion %</option>
                <option value="value">Est. Value ($ High to Low)</option>
                <option value="title">Series Name (A-Z)</option>
              </select>
            </div>

            {/* Toggle Top 60 vs All */}
            <button
              onClick={() => setLimitTop60(!limitTop60)}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap border ${
                limitTop60
                  ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
              }`}
            >
              {limitTop60 ? 'Showing Top 60' : `Showing All (${scoredWishlist.length})`}
            </button>
          </div>
        </div>

        {/* Primary Driver Filter Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 mr-1 flex items-center gap-1">
              <Filter className="w-3 h-3" />
              Filter By:
            </span>

            <button
              onClick={() => setSelectedDriverFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                selectedDriverFilter === 'all'
                  ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              All Priorities
            </button>

            <button
              onClick={() => setSelectedDriverFilter('gap')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                selectedDriverFilter === 'gap'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 hover:bg-purple-100'
              }`}
            >
              <Zap className="w-3 h-3 text-purple-400" />
              <span>Gap Fillers ({scoredWishlist.filter((s) => s.gapScore > 0).length})</span>
            </button>

            <button
              onClick={() => setSelectedDriverFilter('series')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                selectedDriverFilter === 'series'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100'
              }`}
            >
              <Crown className="w-3 h-3 text-emerald-400" />
              <span>Series Closers ({scoredWishlist.filter((s) => s.seriesScore >= 50 || s.completesSeries).length})</span>
            </button>

            <button
              onClick={() => setSelectedDriverFilter('event')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                selectedDriverFilter === 'event'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100'
              }`}
            >
              <Flame className="w-3 h-3 text-amber-400" />
              <span>Event Issues ({scoredWishlist.filter((s) => s.eventScore > 0).length})</span>
            </button>
          </div>

          {/* Quick Select / Deselect actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSelectAllVisible}
              className="text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 flex items-center gap-1 cursor-pointer"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>Select Visible ({filteredAndSortedList.length})</span>
            </button>
            {selectedComicIds.size > 0 && (
              <>
                <span className="text-slate-300 dark:text-slate-700">•</span>
                <button
                  onClick={handleClearSelection}
                  className="text-xs font-bold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                >
                  Clear Selection
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Comic List / Mobile Cards */}
      {filteredAndSortedList.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-12 text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
            <ShoppingCart className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">No wishlisted comics match your filters</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            Try adjusting your search query, publisher, or priority driver filter.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {filteredAndSortedList.map((item, index) => {
            const isChecked = selectedComicIds.has(item.comic.id);

            // Styling based on primary driver
            const driverBadge = (() => {
              if (item.primaryDriver === 'Gap Filler') {
                return {
                  bg: 'bg-purple-100 dark:bg-purple-950/60 text-purple-900 dark:text-purple-300 border-purple-300 dark:border-purple-800',
                  icon: <Zap className="w-3 h-3 text-purple-600 dark:text-purple-400" />,
                  label: 'Gap Filler',
                };
              }
              if (item.primaryDriver === 'Event Completion') {
                return {
                  bg: 'bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border-amber-300 dark:border-amber-800',
                  icon: <Flame className="w-3 h-3 text-amber-600 dark:text-amber-400" />,
                  label: 'Event Completion',
                };
              }
              if (item.primaryDriver === 'Series & Gap') {
                return {
                  bg: 'bg-gradient-to-r from-amber-400 to-purple-400 text-slate-950 font-black border-amber-500',
                  icon: <Crown className="w-3 h-3 text-slate-950" />,
                  label: 'Series Closer & Gap',
                };
              }
              return {
                bg: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
                icon: <Crown className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />,
                label: item.completesSeries ? '100% Run Closer' : 'Series Completion',
              };
            })();

            return (
              <div
                key={item.comic.id}
                className={`relative border-2 rounded-2xl p-4 transition-all duration-150 flex flex-col justify-between gap-3 group ${
                  isChecked
                    ? 'bg-rose-50/60 dark:bg-rose-950/20 border-rose-500 shadow-sm'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                {/* Ranking Position Badge */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-slate-900 dark:bg-indigo-600 text-white font-black text-xs flex items-center justify-center shadow-xs">
                      #{index + 1}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-black border flex items-center gap-1 shadow-xs ${driverBadge.bg}`}
                    >
                      {driverBadge.icon}
                      <span>{driverBadge.label}</span>
                    </span>
                  </div>

                  {/* Priority Total Score Pill */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Priority</span>
                    <span className="px-2 py-0.5 rounded-lg bg-slate-900 dark:bg-indigo-600 text-white font-black text-xs shadow-xs">
                      {item.compositeScore}
                    </span>
                  </div>
                </div>

                {/* Main Comic Info with Thumbnail and Selection Tap Target */}
                <div className="flex items-start gap-3">
                  {/* Big Checkbox for Mobile Tapping */}
                  <button
                    type="button"
                    onClick={() => handleToggleSelect(item.comic.id)}
                    className="p-1 -ml-1 mt-0.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer shrink-0 transition-transform active:scale-90"
                    title={isChecked ? 'Deselect this comic' : 'Check off as found in store'}
                  >
                    {isChecked ? (
                      <CheckSquare className="w-6 h-6 text-rose-600 dark:text-rose-500 fill-rose-100 dark:fill-rose-950" />
                    ) : (
                      <Square className="w-6 h-6 text-slate-300 dark:text-slate-600 hover:text-slate-400" />
                    )}
                  </button>

                  {/* Thumbnail */}
                  <div
                    onClick={() => onSelectComic?.(item.comic)}
                    className="w-14 h-20 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden shrink-0 border border-slate-200 dark:border-slate-700 shadow-xs cursor-pointer group-hover:opacity-90 relative"
                  >
                    <img
                      src={getComicCoverUrl(item.comic.coverImage)}
                      alt={item.comic.title}
                      onError={handleImageError}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>

                  {/* Title & Issue Details */}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      <span>{item.comic.publisher || 'Unknown'}</span>
                      {item.comic.publicationYear && (
                        <>
                          <span>•</span>
                          <span>{item.comic.publicationYear}</span>
                        </>
                      )}
                    </div>

                    <h4
                      onClick={() => onSelectComic?.(item.comic)}
                      className="font-bold text-slate-900 dark:text-slate-100 text-sm leading-snug truncate cursor-pointer hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                      title={item.comic.title}
                    >
                      {item.comic.title} #{item.comic.issueNumber}
                    </h4>

                    {item.comic.seriesName && item.comic.seriesName !== item.comic.title && (
                      <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
                        Series: {item.comic.seriesName}
                      </p>
                    )}

                    {/* Primary Reason Explanation Text */}
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 line-clamp-2 pt-0.5">
                      💡 {item.primaryReason}
                    </p>
                  </div>
                </div>

                {/* Metric Score Breakdown Meters */}
                <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-2.5 border border-slate-100 dark:border-slate-800 space-y-2 text-xs">
                  {/* Series Completion Metric */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1">
                        <Crown className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                        <span>Series Completion:</span>
                      </span>
                      <span className="font-extrabold text-emerald-700 dark:text-emerald-400">
                        {item.seriesScore}% ({item.newOwnedSeriesCount}/{item.effectiveTotalSeriesIssues})
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all"
                        style={{ width: `${item.seriesScore}%` }}
                      />
                    </div>
                  </div>

                  {/* Event Completion Metric */}
                  {item.comic.event && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1">
                          <Flame className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                          <span className="truncate max-w-[140px]">{item.comic.event}:</span>
                        </span>
                        <span className="font-extrabold text-amber-700 dark:text-amber-400">
                          {item.eventScore}%
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-500 rounded-full transition-all"
                          style={{ width: `${item.eventScore}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Gap Filler Metric */}
                  <div className="flex items-center justify-between text-[11px] pt-0.5">
                    <span className="font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1">
                      <Zap className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                      <span>Gap Status:</span>
                    </span>
                    <span
                      className={`font-black px-1.5 py-0.2 rounded text-[10px] ${
                        item.gapScore === 100
                          ? 'bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-800'
                          : item.gapScore === 50
                          ? 'bg-blue-50 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                          : 'text-slate-400'
                      }`}
                    >
                      {item.gapScore === 100
                        ? 'Full Bridge (+100)'
                        : item.gapScore === 50
                        ? 'Half Gap (+50)'
                        : 'No Gap (0)'}
                    </span>
                  </div>
                </div>

                {/* Footer with Card Actions & Value */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800 text-xs">
                  <div className="flex items-center gap-2">
                    {item.comic.estimatedValue ? (
                      <span className="font-extrabold text-emerald-700 dark:text-emerald-400 flex items-center gap-0.5">
                        <DollarSign className="w-3.5 h-3.5 -mr-0.5" />
                        <span>{item.comic.estimatedValue.toFixed(2)}</span>
                      </span>
                    ) : item.comic.purchasePrice ? (
                      <span className="font-bold text-slate-500 dark:text-slate-400">
                        ${item.comic.purchasePrice.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400">Price N/A</span>
                    )}

                    {item.comic.condition && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-semibold">
                        {item.comic.condition}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleToggleSelect(item.comic.id)}
                    className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center gap-1.5 ${
                      isChecked
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-rose-50 hover:text-rose-600'
                    }`}
                  >
                    {isChecked ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                        <span>Found!</span>
                      </>
                    ) : (
                      <span>Mark Found</span>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Floating Bottom Purchase Bar (Optimized for In-Store Phone Shopping) */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 shadow-2xl py-3 px-4 sm:px-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Status Counter */}
          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-black text-sm flex items-center justify-center">
                {selectedComicIds.size}
              </span>
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  {selectedComicIds.size === 0
                    ? 'No comics checked yet'
                    : `${selectedComicIds.size} comic${selectedComicIds.size === 1 ? '' : 's'} checked off`}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  {totalSelectedEstCost > 0
                    ? `Est. Subtotal: $${totalSelectedEstCost.toFixed(2)}`
                    : 'Tap "Mark Found" on issues you discover in the shop'}
                </p>
              </div>
            </div>

            {selectedComicIds.size > 0 && (
              <button
                type="button"
                onClick={handleClearSelection}
                className="text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 sm:hidden cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          {/* Target Storage Box Selector & Purchase Action */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {boxes.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="hidden md:inline text-xs font-bold text-slate-500 dark:text-slate-400">
                  Store into:
                </span>
                <select
                  value={targetBoxId}
                  onChange={(e) => setTargetBoxId(parseInt(e.target.value, 10))}
                  className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-bold text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-rose-500 shadow-xs cursor-pointer max-w-[150px] sm:max-w-[180px] truncate"
                >
                  {boxes.map((b) => (
                    <option key={b.id} value={b.id}>
                      Box #{b.id}: {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              type="button"
              disabled={selectedComicIds.size === 0 || isPurchasing}
              onClick={handleConfirmPurchase}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-md active:scale-95 cursor-pointer ${
                selectedComicIds.size > 0 && !isPurchasing
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed shadow-none'
              }`}
            >
              {isPurchasing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  <span>Committing...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-white" />
                  <span>Mark Purchased ({selectedComicIds.size})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
