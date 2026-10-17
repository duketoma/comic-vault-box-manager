import React, { useState, useMemo, useRef, useEffect, useDeferredValue } from 'react';
import { ComicBook, StorageBox, SeriesIssueTotal } from '../types';
import { getComicCoverUrl, handleImageError } from '../utils/imageUtils';
import { sortBoxes } from '../utils/boxUtils';
import { formatPublicationDate, getMonthIndex, MONTH_NAMES } from '../utils/dateUtils';
import { 
  compareComicsByTitleAndIssue, 
  parseIntegerIssueNumber,
  isAnnualComic,
  MultiSortOptions,
  SortCriterion,
  ComicSortField,
  SORT_PRESETS,
  DEFAULT_MULTI_SORT_OPTIONS,
  compareComicsMultiSort,
  detectActivePresetId,
  getSortFieldLabel,
  getSortDirectionLabel,
} from '../utils/comicSortUtils';
import { computeSeriesCompletionMap, buildSeriesTotalsMap } from '../utils/seriesUtils';
import { CatalogSortModal } from './CatalogSortModal';
import { FullArtShowcaseModal } from './FullArtShowcaseModal';
import { 
  Grid3X3, 
  List, 
  Filter, 
  BookOpen, 
  Star, 
  Tag, 
  Boxes, 
  ArrowUpDown, 
  Layers, 
  X,
  CheckCircle,
  Clock,
  Bookmark,
  Trophy,
  Target,
  Sparkles,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  SlidersHorizontal,
  ArrowUp,
  ArrowDown,
  RotateCcw
} from 'lucide-react';

export const CHUNK_SIZE_GRID = 48;
export const CHUNK_SIZE_TABLE = 50;

export const CatalogSkeletonGrid: React.FC<{ count?: number; viewMode?: 'grid' | 'table' }> = ({
  count = 24,
  viewMode = 'grid',
}) => {
  if (viewMode === 'table') {
    const rowCount = Math.min(Math.max(count, 8), 50);
    return (
      <div
        data-testid="catalog-skeleton-grid"
        data-skeleton-mode="table"
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm animate-pulse"
      >
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex gap-4">
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/4" />
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/6" />
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/6" />
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/6" />
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800 p-2 space-y-3">
          {Array.from({ length: rowCount }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-2 px-2">
              <div className="w-8 h-12 bg-slate-200 dark:bg-slate-700 rounded shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 bg-slate-200 dark:bg-slate-700 rounded w-1/3" />
                <div className="h-2.5 bg-slate-200 dark:bg-slate-700/60 rounded w-1/4" />
              </div>
              <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-20" />
              <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="catalog-skeleton-grid"
      data-skeleton-mode="grid"
      className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
    >
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs flex flex-col justify-between animate-pulse"
        >
          {/* Cover Placeholder */}
          <div className="relative aspect-[2/3] bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
            <div className="w-10 h-10 rounded-lg bg-slate-300 dark:bg-slate-700/60" />
            <div className="absolute top-2 left-2 w-16 h-4 bg-slate-300/80 dark:bg-slate-700/80 rounded" />
            <div className="absolute top-2 right-2 w-12 h-4 bg-slate-300/80 dark:bg-slate-700/80 rounded" />
          </div>
          {/* Card Content Placeholder */}
          <div className="p-3 space-y-2.5">
            <div className="flex justify-between items-center gap-2">
              <div className="h-3.5 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
              <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-6" />
            </div>
            <div className="h-2.5 bg-slate-200 dark:bg-slate-700/60 rounded w-1/2" />
            <div className="flex gap-1.5 pt-1">
              <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-14" />
              <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-14" />
            </div>
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-between">
              <div className="h-3 bg-slate-200 dark:bg-slate-700/60 rounded w-12" />
              <div className="h-3 bg-slate-200 dark:bg-slate-700/60 rounded w-10" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

interface CollectionCatalogProps {
  comics: ComicBook[];
  boxes: StorageBox[];
  searchQuery: string;
  onSelectComic: (comic: ComicBook) => void;
  onQuickStatusChange: (comicId: string, status: ComicBook['readingStatus']) => void;
  seriesTotals?: SeriesIssueTotal[];
  selectedSeries?: string;
  onSelectSeries?: (series: string) => void;
  onOpenGenerateWishlist?: (seriesName?: string) => void;
  isLoading?: boolean;
}

interface CatalogMetadataCache {
  comicsRef: ComicBook[] | null;
  seriesTotalsRef: SeriesIssueTotal[] | null;
  seriesList: string[];
  seriesTotalsMap: Map<string, SeriesIssueTotal>;
  seriesStatsMap: Map<string, any>;
  seriesRunCounts: { complete: number; near: number; inProgress: number };
  genres: string[];
  publishers: string[];
  authors: string[];
  characters: string[];
  events: string[];
}

let catalogMetadataCache: CatalogMetadataCache = {
  comicsRef: null,
  seriesTotalsRef: null,
  seriesList: [],
  seriesTotalsMap: new Map(),
  seriesStatsMap: new Map(),
  seriesRunCounts: { complete: 0, near: 0, inProgress: 0 },
  genres: [],
  publishers: [],
  authors: [],
  characters: [],
  events: [],
};

interface CatalogFilteredCache {
  comicsRef: ComicBook[] | null;
  seriesTotalsRef: SeriesIssueTotal[] | null;
  cacheKey: string;
  filtered: ComicBook[];
}

let catalogFilteredCache: CatalogFilteredCache = {
  comicsRef: null,
  seriesTotalsRef: null,
  cacheKey: '',
  filtered: [],
};

const EMPTY_SERIES_TOTALS: SeriesIssueTotal[] = [];

function areSeriesTotalsEqual(a: SeriesIssueTotal[] | null | undefined, b: SeriesIssueTotal[] | null | undefined): boolean {
  if (a === b) return true;
  if (!a && !b) return true;
  if (a && b && a.length === 0 && b.length === 0) return true;
  return false;
}

export const CollectionCatalog: React.FC<CollectionCatalogProps> = ({
  comics,
  boxes,
  searchQuery,
  onSelectComic,
  onQuickStatusChange,
  seriesTotals = EMPTY_SERIES_TOTALS,
  selectedSeries: controlledSelectedSeries,
  onSelectSeries: onSelectSeriesProp,
  onOpenGenerateWishlist,
  isLoading = false,
}) => {
  const MAX_PUBLISH_YEAR = Math.max(new Date().getFullYear() + 2, 2026);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [visibleCount, setVisibleCount] = useState<number>(() => (viewMode === 'grid' ? CHUNK_SIZE_GRID : CHUNK_SIZE_TABLE));
  const isInitialMount = useRef<boolean>(true);
  const [isSettled, setIsSettled] = useState<boolean>(false);

  // Transition settling: allows lightweight skeleton placeholder grid to paint before heavy card tree
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setIsSettled(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const { totalOwnedCount, totalWishlistCount } = useMemo(() => {
    let owned = 0;
    let wishlist = 0;
    for (const c of comics) {
      if (c.readingStatus === 'Wishlist') wishlist++;
      else owned++;
    }
    return { totalOwnedCount: owned, totalWishlistCount: wishlist };
  }, [comics]);

  const [internalSelectedSeries, setInternalSelectedSeries] = useState<string>('all');
  const selectedSeries = controlledSelectedSeries !== undefined ? controlledSelectedSeries : internalSelectedSeries;
  const setSelectedSeries = (val: string) => {
    setInternalSelectedSeries(val);
    if (onSelectSeriesProp) onSelectSeriesProp(val);
  };
  const [selectedRunProgress, setSelectedRunProgress] = useState<'all' | 'complete' | 'near' | 'in_progress'>('all');
  const [showRunMatrix, setShowRunMatrix] = useState<boolean>(true);
  const [copiedMissing, setCopiedMissing] = useState<boolean>(false);
  const [selectedGenre, setSelectedGenre] = useState<string>('all');
  const [selectedPublisher, setSelectedPublisher] = useState<string>('all');
  const [selectedAuthor, setSelectedAuthor] = useState<string>('all');
  const [selectedCharacter, setSelectedCharacter] = useState<string>('all');
  const [selectedBoxId, setSelectedBoxId] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedFormat, setSelectedFormat] = useState<string>('all');
  const [selectedEvent, setSelectedEvent] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [yearRange, setYearRange] = useState<[number, number]>([1930, MAX_PUBLISH_YEAR]);
  const [onlyFullArt, setOnlyFullArt] = useState<boolean>(false);
  const [fullArtComic, setFullArtComic] = useState<ComicBook | null>(null);
  const [multiSortOptions, setMultiSortOptions] = useState<MultiSortOptions>(() => {
    try {
      const saved = localStorage.getItem('comic_vault_catalog_sort_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && Array.isArray(parsed.criteria) && parsed.criteria.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('Failed to load saved catalog sort config:', e);
    }
    return DEFAULT_MULTI_SORT_OPTIONS;
  });

  const [isSortModalOpen, setIsSortModalOpen] = useState<boolean>(false);

  const updateMultiSortOptions = (newOptions: MultiSortOptions) => {
    setMultiSortOptions(newOptions);
    try {
      localStorage.setItem('comic_vault_catalog_sort_v1', JSON.stringify(newOptions));
    } catch (e) {
      console.error('Failed to save catalog sort config:', e);
    }
  };

  const activePresetId = detectActivePresetId(multiSortOptions);
  const activePreset = SORT_PRESETS.find((p) => p.id === activePresetId);

  const handleColumnHeaderClick = (field: ComicSortField, shiftKey: boolean = false) => {
    if (shiftKey) {
      const existingIdx = multiSortOptions.criteria.findIndex((c) => c.field === field);
      if (existingIdx >= 0) {
        const newCrit = [...multiSortOptions.criteria];
        newCrit[existingIdx] = {
          ...newCrit[existingIdx],
          direction: newCrit[existingIdx].direction === 'asc' ? 'desc' : 'asc',
        };
        updateMultiSortOptions({ ...multiSortOptions, criteria: newCrit });
      } else {
        const newCriterion: SortCriterion = {
          id: `crit-${Date.now()}`,
          field,
          direction: 'asc',
        };
        updateMultiSortOptions({
          ...multiSortOptions,
          criteria: [...multiSortOptions.criteria, newCriterion],
        });
      }
    } else {
      const primary = multiSortOptions.criteria[0];
      if (primary && primary.field === field) {
        const newCrit = [...multiSortOptions.criteria];
        newCrit[0] = { ...primary, direction: primary.direction === 'asc' ? 'desc' : 'asc' };
        updateMultiSortOptions({ ...multiSortOptions, criteria: newCrit });
      } else {
        const remaining = multiSortOptions.criteria.filter((c) => c.field !== field);
        const newCrit: SortCriterion[] = [
          { id: `crit-${Date.now()}`, field, direction: 'asc' },
          ...remaining,
        ];
        updateMultiSortOptions({ ...multiSortOptions, criteria: newCrit });
      }
    }
  };

  const getColumnSortIndicator = (field: ComicSortField) => {
    const idx = multiSortOptions.criteria.findIndex((c) => c.field === field);
    if (idx < 0) return null;
    const criterion = multiSortOptions.criteria[idx];
    return (
      <span className="inline-flex items-center gap-0.5 ml-1 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/80 px-1 py-0.2 rounded border border-indigo-200 dark:border-indigo-800">
        <span>{idx + 1}</span>
        {criterion.direction === 'asc' ? '▲' : '▼'}
      </span>
    );
  };

  // Extract unique filter options with module-level cache
  const {
    seriesList,
    seriesTotalsMap,
    seriesStatsMap,
    seriesRunCounts,
    genres,
    publishers,
    authors,
    characters,
    events,
  } = useMemo(() => {
    if (
      catalogMetadataCache.comicsRef === comics &&
      areSeriesTotalsEqual(catalogMetadataCache.seriesTotalsRef, seriesTotals)
    ) {
      return catalogMetadataCache;
    }

    const sListSet = new Set<string>();
    const genresSet = new Set<string>();
    const publishersSet = new Set<string>();
    const authorsSet = new Set<string>();
    const charactersSet = new Set<string>();
    const eventsSet = new Set<string>();

    comics.forEach(c => {
      const s = (c.seriesName || c.title || '').trim();
      if (s) sListSet.add(s);
      if (c.genre) genresSet.add(c.genre);
      if (c.publisher) publishersSet.add(c.publisher);
      if (c.writer) authorsSet.add(c.writer);
      if (c.artist) authorsSet.add(c.artist);
      if (Array.isArray(c.creatorContributions)) {
        c.creatorContributions.forEach(cc => {
          if (cc.creatorName) authorsSet.add(cc.creatorName);
        });
      }
      if (Array.isArray(c.characterAppearances)) {
        c.characterAppearances.forEach(ca => {
          if (ca.characterName) charactersSet.add(ca.characterName);
        });
      }
      if (c.event) eventsSet.add(c.event);
    });

    const sTotalsMap = buildSeriesTotalsMap(seriesTotals);
    const sStatsMap = computeSeriesCompletionMap(comics, seriesTotals);

    let complete = 0;
    let near = 0;
    let inProgress = 0;
    sStatsMap.forEach(s => {
      if (s.totalIssues > 0) {
        if (s.isComplete) complete++;
        else if (s.pct >= 75) near++;
        else inProgress++;
      }
    });

    const newCache: CatalogMetadataCache = {
      comicsRef: comics,
      seriesTotalsRef: seriesTotals,
      seriesList: Array.from(sListSet).sort((a, b) => a.localeCompare(b)),
      seriesTotalsMap: sTotalsMap,
      seriesStatsMap: sStatsMap,
      seriesRunCounts: { complete, near, inProgress },
      genres: Array.from(genresSet).sort(),
      publishers: Array.from(publishersSet).sort(),
      authors: Array.from(authorsSet).sort(),
      characters: Array.from(charactersSet).sort(),
      events: Array.from(eventsSet).sort(),
    };

    catalogMetadataCache = newCache;
    return newCache;
  }, [comics, seriesTotals]);

  // Derive a stable cache key for all active filter and sort parameters
  const catalogFilterKey = useMemo(() => JSON.stringify({
    q: deferredSearchQuery,
    series: selectedSeries,
    run: selectedRunProgress,
    genre: selectedGenre,
    pub: selectedPublisher,
    author: selectedAuthor,
    char: selectedCharacter,
    box: selectedBoxId,
    status: selectedStatus,
    format: selectedFormat,
    event: selectedEvent,
    art: onlyFullArt,
    start: startDate,
    end: endDate,
    yMin: yearRange[0],
    yMax: yearRange[1],
    sort: multiSortOptions,
  }), [
    deferredSearchQuery,
    selectedSeries,
    selectedRunProgress,
    selectedGenre,
    selectedPublisher,
    selectedAuthor,
    selectedCharacter,
    selectedBoxId,
    selectedStatus,
    selectedFormat,
    selectedEvent,
    onlyFullArt,
    startDate,
    endDate,
    yearRange,
    multiSortOptions,
  ]);

  // Filtered & Sorted Comics with module-level cache
  const filteredComics = useMemo(() => {
    const cacheKey = catalogFilterKey;

    if (
      catalogFilteredCache.comicsRef === comics &&
      areSeriesTotalsEqual(catalogFilteredCache.seriesTotalsRef, seriesTotals) &&
      catalogFilteredCache.cacheKey === cacheKey
    ) {
      return catalogFilteredCache.filtered;
    }

    const computed = comics.filter(c => {
      // Search query filter
      if (deferredSearchQuery) {
        const q = deferredSearchQuery.toLowerCase();
        const matchTitle = (c.title || c.fullTitle || c.seriesName || '').toLowerCase().includes(q);
        const matchFullTitle = c.fullTitle ? c.fullTitle.toLowerCase().includes(q) : false;
        const matchSeries = c.seriesName ? c.seriesName.toLowerCase().includes(q) : false;
        const matchIssue = c.issueNumber ? String(c.issueNumber).toLowerCase().includes(q) : false;
        const matchPub = c.publisher ? c.publisher.toLowerCase().includes(q) : false;
        const matchWriter = c.writer ? c.writer.toLowerCase().includes(q) : false;
        const matchArtist = c.artist ? c.artist.toLowerCase().includes(q) : false;
        const matchTag = Array.isArray(c.tags) ? c.tags.some(t => typeof t === 'string' && t.toLowerCase().includes(q)) : false;
        const matchEvent = c.event ? c.event.toLowerCase().includes(q) : false;
        const matchVol = c.volume ? c.volume.toLowerCase().includes(q) : false;
        const matchCreator = Array.isArray(c.creatorContributions) ? c.creatorContributions.some(cc => (cc.creatorName && cc.creatorName.toLowerCase().includes(q)) || (cc.roleName && cc.roleName.toLowerCase().includes(q))) : false;
        const matchChar = Array.isArray(c.characterAppearances) ? c.characterAppearances.some(ca => (ca.characterName && ca.characterName.toLowerCase().includes(q)) || (ca.appearanceType && ca.appearanceType.toLowerCase().includes(q))) : false;
        if (!matchTitle && !matchFullTitle && !matchSeries && !matchIssue && !matchPub && !matchWriter && !matchArtist && !matchTag && !matchEvent && !matchVol && !matchCreator && !matchChar) {
          return false;
        }
      }

      if (selectedSeries !== 'all') {
        const cSeries = (c.seriesName || c.title || '').trim().toLowerCase();
        if (cSeries !== selectedSeries.toLowerCase()) return false;
      }

      if (selectedRunProgress !== 'all') {
        const sKey = (c.seriesName || c.title || '').trim().toLowerCase();
        const stat = seriesStatsMap.get(sKey);
        if (!stat || stat.totalIssues === 0) return false;
        if (selectedRunProgress === 'complete' && !stat.isComplete) return false;
        if (selectedRunProgress === 'near' && (stat.isComplete || stat.pct < 75)) return false;
        if (selectedRunProgress === 'in_progress' && (stat.isComplete || stat.pct >= 75)) return false;
      }

      if (selectedGenre !== 'all' && c.genre !== selectedGenre) return false;
      if (selectedPublisher !== 'all' && c.publisher !== selectedPublisher) return false;
      if (selectedAuthor !== 'all' && c.writer !== selectedAuthor && c.artist !== selectedAuthor && !c.creatorContributions?.some(cc => cc.creatorName === selectedAuthor)) return false;
      if (selectedCharacter !== 'all' && !c.characterAppearances?.some(ca => ca.characterName === selectedCharacter)) return false;
      if (selectedBoxId !== 'all' && String(c.currentBoxId ?? '') !== selectedBoxId) return false;
      if (selectedStatus !== 'all' && c.readingStatus !== selectedStatus) return false;
      if (selectedFormat !== 'all' && c.format !== selectedFormat) return false;
      if (selectedEvent !== 'all' && c.event !== selectedEvent) return false;
      if (onlyFullArt && !c.coverImageFull) return false;
      // Publication date range filter (if set)
      if (startDate || endDate) {
        const pubIso = (() => {
          if (c.publicationDate) {
            const m = String(c.publicationDate).match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
            if (m) return `${m[1]}-${m[2]}-${m[3] || '01'}`;
            const yOnly = String(c.publicationDate).match(/^(\d{4})$/);
            if (yOnly) return `${yOnly[1]}-01-01`;
          }
          if (c.publicationYear) {
            const monthNum = getMonthIndex(c.publicationMonth);
            const mm = monthNum >= 1 ? String(monthNum).padStart(2,'0') : '01';
            return `${c.publicationYear}-${mm}-01`;
          }
          return null;
        })();
        if (pubIso) {
          if (startDate && pubIso < startDate) return false;
          if (endDate && pubIso > endDate) return false;
        } else {
          // If we can't determine a pub date, exclude when a range is set
          return false;
        }
      }
      if (c.publicationYear < yearRange[0] || c.publicationYear > yearRange[1]) return false;

      return true;
    }).sort((a, b) => compareComicsMultiSort(a, b, multiSortOptions));

    catalogFilteredCache = {
      comicsRef: comics,
      seriesTotalsRef: seriesTotals,
      cacheKey,
      filtered: computed,
    };

    return computed;
  }, [
    comics,
    seriesTotals,
    catalogFilterKey,
    deferredSearchQuery,
    selectedSeries,
    selectedRunProgress,
    selectedGenre,
    selectedPublisher,
    selectedAuthor,
    selectedCharacter,
    selectedBoxId,
    selectedStatus,
    selectedFormat,
    selectedEvent,
    onlyFullArt,
    startDate,
    endDate,
    yearRange,
    multiSortOptions,
    seriesStatsMap,
  ]);

  // Combined layout key including viewMode (grid vs table)
  const layoutResetKey = `${catalogFilterKey}|${viewMode}`;

  // Reset visible batches immediately during render to eliminate layout thrashing and prevent mounting elevated nodes
  const [prevLayoutResetKey, setPrevLayoutResetKey] = useState<string>(layoutResetKey);
  if (prevLayoutResetKey !== layoutResetKey) {
    setPrevLayoutResetKey(layoutResetKey);
    setVisibleCount(viewMode === 'grid' ? CHUNK_SIZE_GRID : CHUNK_SIZE_TABLE);
  }

  // Scroll to top when search query, sort criteria, filters, or viewMode change
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0);
    }
  }, [layoutResetKey]);

  const visibleComics = useMemo(() => {
    return filteredComics.slice(0, visibleCount);
  }, [filteredComics, visibleCount]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const hasMore = visibleCount < filteredComics.length;

  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;

    if (typeof IntersectionObserver === 'undefined') {
      setVisibleCount(filteredComics.length);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((prev) => {
            const batchSize = viewMode === 'grid' ? CHUNK_SIZE_GRID : CHUNK_SIZE_TABLE;
            return Math.min(prev + batchSize, filteredComics.length);
          });
        }
      },
      {
        root: null,
        rootMargin: '300px',
        threshold: 0.1,
      }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, viewMode, filteredComics.length, visibleCount, isSettled, isLoading]);

  const resetFilters = () => {
    setSelectedSeries('all');
    setSelectedRunProgress('all');
    setSelectedGenre('all');
    setSelectedPublisher('all');
    setSelectedAuthor('all');
    setSelectedCharacter('all');
    setSelectedBoxId('all');
    setSelectedStatus('all');
    setSelectedFormat('all');
    setSelectedEvent('all');
    setOnlyFullArt(false);
    setStartDate('');
    setEndDate('');
    setYearRange([1930, MAX_PUBLISH_YEAR]);
    setVisibleCount(viewMode === 'grid' ? CHUNK_SIZE_GRID : CHUNK_SIZE_TABLE);
  };

  const hasActiveFilters = selectedSeries !== 'all' || selectedRunProgress !== 'all' || selectedGenre !== 'all' || selectedPublisher !== 'all' || selectedAuthor !== 'all' || selectedCharacter !== 'all' || selectedBoxId !== 'all' || selectedStatus !== 'all' || selectedFormat !== 'all' || selectedEvent !== 'all' || onlyFullArt || startDate !== '' || endDate !== '';

  return (
    <div className="space-y-6">
      
      {/* Top Filter Toolbar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm transition-colors">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-700 dark:text-slate-300" />
            <h2 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Collection Filters</h2>
            <span className="text-xs text-slate-500 dark:text-slate-400 ml-2">
              Showing <strong className="text-slate-900 dark:text-slate-100">{visibleComics.length}</strong> of <strong className="text-slate-900 dark:text-slate-100">{filteredComics.length}</strong> comics ({totalOwnedCount} Owned, {totalWishlistCount} Wishlist)
            </span>
          </div>

          <div className="flex items-center gap-3">
            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                className="flex items-center gap-1 text-xs text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 font-medium px-2.5 py-1 rounded-md bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 transition-colors cursor-pointer"
              >
                <X className="w-3 h-3" /> Reset Filters
              </button>
            )}

            {/* View Switcher */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                  viewMode === 'grid' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
                title="Grid View"
              >
                <Grid3X3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                  viewMode === 'table' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
                title="Table List View"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Series Run Completion Filter Bar (Tracking towards 100%) */}
        <div className="pt-3 pb-2 flex items-center justify-between flex-wrap gap-2 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1 mr-1">
              <Target className="w-3.5 h-3.5 text-indigo-500" />
              <span>Series Completion:</span>
            </span>
            <button
              type="button"
              onClick={() => setSelectedRunProgress('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                selectedRunProgress === 'all'
                  ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              All Runs
            </button>
            <button
              type="button"
              onClick={() => setSelectedRunProgress('complete')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                selectedRunProgress === 'complete'
                  ? 'bg-amber-500 text-amber-950 shadow-xs ring-2 ring-amber-300'
                  : 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-300/80 dark:border-amber-700/60 hover:bg-amber-100'
              }`}
            >
              <Trophy className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>100% Full Runs ({seriesRunCounts.complete})</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedRunProgress('near')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                selectedRunProgress === 'near'
                  ? 'bg-emerald-600 text-white shadow-xs ring-2 ring-emerald-300'
                  : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-300/80 dark:border-emerald-700/60 hover:bg-emerald-100'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Near 100% (≥75%) ({seriesRunCounts.near})</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedRunProgress('in_progress')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                selectedRunProgress === 'in_progress'
                  ? 'bg-indigo-600 text-white shadow-xs ring-2 ring-indigo-300'
                  : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100'
              }`}
            >
              <span>In-Progress (&lt;75%) ({seriesRunCounts.inProgress})</span>
            </button>
            {comics.some((c) => !!c.coverImageFull) && (
              <button
                type="button"
                onClick={() => setOnlyFullArt(!onlyFullArt)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  onlyFullArt
                    ? 'bg-purple-600 text-white shadow-xs ring-2 ring-purple-300'
                    : 'bg-purple-50 dark:bg-purple-950/40 text-purple-800 dark:text-purple-300 border border-purple-300/80 dark:border-purple-700/60 hover:bg-purple-100'
                }`}
                title="Show comics with full wraparound / front+back cover art"
              >
                <Sparkles className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                <span>Full Art ({comics.filter((c) => !!c.coverImageFull).length})</span>
              </button>
            )}
          </div>

          {selectedRunProgress !== 'all' && (
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Showing comics in <strong className="text-slate-900 dark:text-slate-100">{selectedRunProgress === 'complete' ? '100% completed runs' : selectedRunProgress === 'near' ? 'runs ≥75%' : 'in-progress runs'}</strong>
            </span>
          )}
        </div>

        {/* Filter Controls Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-9 gap-3 pt-3">
          
          {/* Series Run */}
          <div>
            <label className="block text-[11px] font-semibold text-indigo-700 dark:text-indigo-400 mb-1">Series Run</label>
            <select
              value={selectedSeries}
              onChange={(e) => setSelectedSeries(e.target.value)}
              className="w-full bg-indigo-50/50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-md px-2 py-1.5 text-xs text-indigo-950 dark:text-indigo-200 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-400"
            >
              <option value="all">All Series ({seriesList.length})</option>
              {seriesList.map(s => {
                const stat = seriesStatsMap.get(s.toLowerCase());
                return (
                  <option key={s} value={s}>
                    {s} {stat?.totalIssues ? `[${stat.owned}/${stat.totalIssues} • ${stat.pct}%${stat.isComplete ? ' 🏆' : ''}]` : `(${stat?.owned || 0} owned)`}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Genre */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Genre</label>
            <select
              value={selectedGenre}
              onChange={(e) => setSelectedGenre(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-slate-300 dark:focus:ring-slate-600"
            >
              <option value="all">All Genres</option>
              {genres.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          {/* Publisher */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Publisher</label>
            <select
              value={selectedPublisher}
              onChange={(e) => setSelectedPublisher(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-slate-300 dark:focus:ring-slate-600"
            >
              <option value="all">All Publishers</option>
              {publishers.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* Release Date Range */}
          <div>
            <label className="block text-[11px] font-semibold text-blue-700 dark:text-blue-400 mb-1">Release Date Range</label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-1/2 bg-blue-50/50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-md px-2 py-1.5 text-xs text-blue-900 dark:text-blue-200 font-medium focus:outline-none focus:ring-1 focus:ring-blue-400"
                aria-label="Release start date"
              />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-1/2 bg-blue-50/50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-md px-2 py-1.5 text-xs text-blue-900 dark:text-blue-200 font-medium focus:outline-none focus:ring-1 focus:ring-blue-400"
                aria-label="Release end date"
              />
            </div>
          </div>

          {/* Crossover Event */}
          <div>
            <label className="block text-[11px] font-semibold text-purple-700 dark:text-purple-400 mb-1">Crossover Event</label>
            <select
              value={selectedEvent}
              onChange={(e) => setSelectedEvent(e.target.value)}
              className="w-full bg-purple-50/50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 rounded-md px-2.5 py-1.5 text-xs text-purple-900 dark:text-purple-200 font-medium focus:outline-none focus:ring-1 focus:ring-purple-400"
            >
              <option value="all">All Events ({events.length})</option>
              {events.map(ev => (
                <option key={ev} value={ev}>{ev}</option>
              ))}
            </select>
          </div>

          {/* Writer/Artist */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Creator / Contributor</label>
            <select
              value={selectedAuthor}
              onChange={(e) => setSelectedAuthor(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-slate-300 dark:focus:ring-slate-600"
            >
              <option value="all">All Creators ({authors.length})</option>
              {authors.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          {/* Featured Character */}
          <div>
            <label className="block text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 mb-1">Featured Character</label>
            <select
              value={selectedCharacter}
              onChange={(e) => setSelectedCharacter(e.target.value)}
              className="w-full bg-emerald-50/50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-md px-2.5 py-1.5 text-xs text-emerald-950 dark:text-emerald-200 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-400"
            >
              <option value="all">All Characters ({characters.length})</option>
              {characters.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Storage Box */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Storage Box</label>
            <select
              value={selectedBoxId}
              onChange={(e) => setSelectedBoxId(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-slate-300 dark:focus:ring-slate-600"
            >
              <option value="all">All Boxes ({boxes.length + 1})</option>
              <option value="0">Box 0 - Unallocated / Staging Queue</option>
              {sortBoxes(boxes).map(b => (
                <option key={b.id} value={b.id.toString()}>Box #{b.id}: {b.name.split('-')[1] || b.name}</option>
              ))}
            </select>
          </div>

          {/* Reading Status */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Reading Status</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-slate-300 dark:focus:ring-slate-600"
            >
              <option value="all">All Statuses</option>
              <option value="Read">Read</option>
              <option value="Reading">Currently Reading</option>
              <option value="Unread">Unread</option>
              <option value="Wishlist">Wishlist</option>
            </select>
          </div>

          {/* Multi-Sort Selector */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Sort Order
              </label>
              <button
                type="button"
                onClick={() => setIsSortModalOpen(true)}
                className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline font-bold cursor-pointer"
              >
                Customize ({multiSortOptions.criteria.length})
              </button>
            </div>
            <div className="flex items-center gap-1">
              <select
                value={activePresetId || 'custom'}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'custom') {
                    setIsSortModalOpen(true);
                  } else {
                    const preset = SORT_PRESETS.find(p => p.id === val);
                    if (preset) {
                      updateMultiSortOptions({
                        criteria: preset.criteria.map(c => ({ ...c })),
                        separateAnnuals: preset.separateAnnuals,
                        emptyEventPlacement: preset.emptyEventPlacement || 'last',
                      });
                    }
                  }
                }}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {SORT_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
                {!activePresetId && (
                  <option value="custom">
                    Custom ({multiSortOptions.criteria.length} Levels)...
                  </option>
                )}
              </select>
              <button
                type="button"
                onClick={() => {
                  const newCrit = [...multiSortOptions.criteria];
                  if (newCrit.length > 0) {
                    newCrit[0] = {
                      ...newCrit[0],
                      direction: newCrit[0].direction === 'asc' ? 'desc' : 'asc',
                    };
                    updateMultiSortOptions({ ...multiSortOptions, criteria: newCrit });
                  }
                }}
                className="p-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer shrink-0"
                title={`Toggle direction of Level 1: ${getSortFieldLabel(multiSortOptions.criteria[0]?.field || 'publisher')}`}
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsSortModalOpen(true)}
                className="p-1.5 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 rounded-md text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 cursor-pointer shrink-0"
                title="Configure Multi-Sort Rules"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* Interactive Multi-Sort Chain Toolbar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1.5 shrink-0">
            <ArrowUpDown className="w-3.5 h-3.5 text-indigo-500" />
            <span>Sort Hierarchy:</span>
          </span>

          {/* Sort Chain Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {multiSortOptions.criteria.map((criterion, idx) => {
              const fieldLabel = getSortFieldLabel(criterion.field);
              const dirLabel = getSortDirectionLabel(criterion.field, criterion.direction);
              return (
                <div
                  key={criterion.id}
                  className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-2 pr-1.5 py-1 text-slate-800 dark:text-slate-200 group hover:border-indigo-400 dark:hover:border-indigo-600 transition-colors"
                >
                  <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/80 px-1 rounded">
                    L{idx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const newCrit = [...multiSortOptions.criteria];
                      newCrit[idx] = {
                        ...newCrit[idx],
                        direction: newCrit[idx].direction === 'asc' ? 'desc' : 'asc',
                      };
                      updateMultiSortOptions({ ...multiSortOptions, criteria: newCrit });
                    }}
                    className="font-semibold hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer flex items-center gap-1"
                    title={`Click to flip direction (${dirLabel})`}
                  >
                    <span>{fieldLabel}</span>
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                      ({criterion.direction === 'asc' ? '↑' : '↓'} {dirLabel})
                    </span>
                  </button>
                  {multiSortOptions.criteria.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        const newCrit = multiSortOptions.criteria.filter((_, i) => i !== idx);
                        updateMultiSortOptions({ ...multiSortOptions, criteria: newCrit });
                      }}
                      className="text-slate-400 hover:text-rose-500 ml-0.5 p-0.5 rounded transition-colors cursor-pointer"
                      title="Remove this sort level"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Annuals Separation Badge Button */}
          <button
            type="button"
            onClick={() => updateMultiSortOptions({
              ...multiSortOptions,
              separateAnnuals: !multiSortOptions.separateAnnuals,
            })}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer flex items-center gap-1.5 ${
              multiSortOptions.separateAnnuals
                ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700/80'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 line-through'
            }`}
            title="Toggle keeping Annuals grouped together separate from regular numbered titles"
          >
            <span>Annuals: {multiSortOptions.separateAnnuals ? 'Separate ✓' : 'Interleaved'}</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {activePreset ? (
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 hidden sm:inline">
              Preset: <strong className="text-slate-800 dark:text-slate-200">{activePreset.shortLabel}</strong>
            </span>
          ) : (
            <span className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800 hidden sm:inline">
              Custom Multi-Sort
            </span>
          )}

          <button
            type="button"
            onClick={() => setIsSortModalOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-lg text-xs font-bold transition-colors cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Customize Multi-Sort...</span>
          </button>
        </div>
      </div>

      {/* Series Run Tracker Banner when a series is selected */}
      {selectedSeries !== 'all' && (() => {
        const sKey = selectedSeries.toLowerCase().trim();
        const stat = seriesStatsMap.get(sKey);
        const totalInfo = seriesTotalsMap.get(sKey);
        const publishedCount = stat?.totalIssues || totalInfo?.issueCount;
        const ownedCount = stat?.owned ?? comics.filter(c => (c.seriesName || c.title || '').trim().toLowerCase() === sKey && c.readingStatus !== 'Wishlist').length;
        const wishlistCount = stat?.wishlist ?? comics.filter(c => (c.seriesName || c.title || '').trim().toLowerCase() === sKey && c.readingStatus === 'Wishlist').length;
        const pct = publishedCount ? Math.min(100, Math.round((ownedCount / publishedCount) * 100)) : null;
        const remaining = publishedCount ? Math.max(0, publishedCount - ownedCount) : null;
        const isComplete = publishedCount ? ownedCount >= publishedCount : false;

        const ownedNums = stat?.ownedIssueNumbers || [];
        const wishlistNums = stat?.wishlistIssueNumbers || [];
        const missingNums = stat?.missingIssueNumbers || [];

        return (
          <div className="bg-white dark:bg-slate-900 border-2 border-indigo-500/30 dark:border-indigo-500/40 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800">
                    Series Run Tracker
                  </span>
                  {isComplete ? (
                    <span className="bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 text-xs font-bold px-2.5 py-0.5 rounded-full border border-amber-300 dark:border-amber-700 flex items-center gap-1 shadow-xs">
                      <Trophy className="w-3.5 h-3.5 text-amber-500" /> Full Run Complete (100%)!
                    </span>
                  ) : pct !== null && pct >= 75 ? (
                    <span className="bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 text-xs font-bold px-2.5 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-700 flex items-center gap-1 shadow-xs">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-500" /> Near Complete ({pct}%)
                    </span>
                  ) : null}
                  {(totalInfo?.publisher || stat?.publisher) && (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      • {totalInfo?.publisher || stat?.publisher}
                    </span>
                  )}
                </div>

                <h3 className="text-xl font-black text-slate-900 dark:text-white">
                  {selectedSeries}
                  {(totalInfo?.volume || stat?.volume) && (
                    <span className="text-sm font-normal text-slate-500 dark:text-slate-400 ml-2">
                      ({totalInfo?.volume || stat?.volume})
                    </span>
                  )}
                </h3>

                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                  {publishedCount ? (
                    <>
                      You own <strong className="text-indigo-600 dark:text-indigo-400">{ownedCount}</strong> of{' '}
                      <strong>{publishedCount}</strong> published issues (<strong>{pct}%</strong>)
                      {wishlistCount > 0 && <> • <strong>{wishlistCount}</strong> on wishlist</>}
                      {remaining !== null && remaining > 0 ? (
                        <> • <span className="font-semibold text-amber-600 dark:text-amber-400">{remaining} {remaining === 1 ? 'issue' : 'issues'} needed</span> to complete full run</>
                      ) : (
                        <> • <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Congratulations, run is 100% complete!</span></>
                      )}
                    </>
                  ) : (
                    <>Showing all {comics.filter(c => (c.seriesName || c.title || '').trim().toLowerCase() === sKey).length} comics in this series</>
                  )}
                </p>

                {!publishedCount && onOpenGenerateWishlist && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => onOpenGenerateWishlist(selectedSeries)}
                      className="text-xs font-bold px-3 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900/50 flex items-center gap-1.5 transition-colors cursor-pointer w-fit"
                      title="Set total issues and generate wishlist items for this series"
                    >
                      <Bookmark className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                      <span>Add Missing to Wishlist</span>
                    </button>
                  </div>
                )}
              </div>

              {publishedCount ? (
                <div className="w-full md:w-80 shrink-0 bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/60 space-y-1.5">
                  <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                    <span className="flex items-center gap-1.5">
                      <Target className="w-3.5 h-3.5 text-indigo-500" />
                      Run Progress towards 100%
                    </span>
                    <span className={isComplete ? 'text-amber-600 dark:text-amber-400 font-black' : 'text-indigo-600 dark:text-indigo-400 font-black'}>
                      {pct}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3 overflow-hidden">
                    <div
                      className={`h-3 rounded-full transition-all duration-500 ${
                        isComplete 
                          ? 'bg-gradient-to-r from-amber-400 to-amber-500' 
                          : pct !== null && pct >= 75
                          ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                          : 'bg-gradient-to-r from-indigo-500 to-indigo-600'
                      }`}
                      style={{ width: `${Math.min(100, pct ?? 0)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400">
                    <span>{ownedCount} Owned</span>
                    <span>{remaining && remaining > 0 ? `${remaining} Missing` : 'All Collected!'}</span>
                    <span>{publishedCount} Total</span>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Interactive Issue Checklist & Missing Issues Matrix */}
            {publishedCount && publishedCount > 0 && (
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-indigo-500" />
                      Issue Run Matrix & Path to 100%
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      ({ownedNums.length} owned, {missingNums.length} missing{wishlistNums.length > 0 ? `, ${wishlistNums.length} wishlist` : ''})
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {missingNums.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const text = `${selectedSeries} - Missing Issues to complete run (${missingNums.length}): #${missingNums.join(', #')}`;
                          navigator.clipboard.writeText(text);
                          setCopiedMissing(true);
                          setTimeout(() => setCopiedMissing(false), 2000);
                        }}
                        className="text-[11px] font-bold px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center gap-1 transition-colors cursor-pointer"
                        title="Copy list of missing issues to clipboard"
                      >
                        {copiedMissing ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span className="text-emerald-700 dark:text-emerald-400">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy Missing Issues</span>
                          </>
                        )}
                      </button>
                    )}

                    {onOpenGenerateWishlist && (
                      <button
                        type="button"
                        onClick={() => onOpenGenerateWishlist(selectedSeries)}
                        className="text-[11px] font-bold px-2 py-1 rounded bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900/50 flex items-center gap-1 transition-colors cursor-pointer"
                        title="Automatically generate wishlist entries for missing issues in this series"
                      >
                        <Bookmark className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                        <span>Add Missing to Wishlist</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setShowRunMatrix(!showRunMatrix)}
                      className="text-[11px] font-bold px-2 py-1 rounded text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1 cursor-pointer"
                    >
                      {showRunMatrix ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      <span>{showRunMatrix ? 'Hide Run Matrix' : 'Show Run Matrix'}</span>
                    </button>
                  </div>
                </div>

                {showRunMatrix && (
                  <div className="mt-2">
                    {publishedCount <= 60 ? (
                      <div className="flex flex-wrap gap-1.5 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/60 max-h-48 overflow-y-auto">
                        {Array.from({ length: publishedCount }, (_, idx) => idx + 1).map((num) => {
                          const isOwned = ownedNums.includes(num);
                          const isWishlist = wishlistNums.includes(num);
                          return (
                            <div
                              key={num}
                              className={`text-[11px] font-bold px-2 py-1 rounded-md border flex items-center gap-1 transition-all ${
                                isOwned
                                  ? 'bg-indigo-600 dark:bg-indigo-500 text-white border-indigo-700 shadow-xs'
                                  : isWishlist
                                  ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800'
                                  : 'bg-white dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-dashed border-slate-300 dark:border-slate-700'
                              }`}
                              title={isOwned ? `Issue #${num}: Owned` : isWishlist ? `Issue #${num}: On Wishlist` : `Issue #${num}: Missing from collection`}
                            >
                              {isOwned && <CheckCircle2 className="w-2.5 h-2.5" />}
                              <span>#{num}</span>
                              {!isOwned && !isWishlist && <span className="text-[9px] opacity-75 font-normal">Need</span>}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/60 space-y-2 text-xs">
                        <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                          <span>
                            <strong>{ownedNums.length}</strong> of <strong>{publishedCount}</strong> issues owned.
                          </span>
                          {missingNums.length > 0 ? (
                            <span className="text-amber-800 dark:text-amber-400 font-bold">
                              {missingNums.length} {missingNums.length === 1 ? 'issue' : 'issues'} remaining for 100% completion
                            </span>
                          ) : (
                            <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                              Full run collected! 🏆
                            </span>
                          )}
                        </div>

                        {missingNums.length > 0 && (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            <span className="font-semibold text-slate-700 dark:text-slate-300 mr-1">Missing issues preview:</span>
                            <span>
                              {missingNums.slice(0, 30).map(n => `#${n}`).join(', ')}
                              {missingNums.length > 30 && ` ...and ${missingNums.length - 30} more`}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Catalog Display */}
      {isLoading || !isSettled ? (
        <CatalogSkeletonGrid viewMode={viewMode} count={viewMode === 'grid' ? CHUNK_SIZE_GRID : 20} />
      ) : filteredComics.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 shadow-sm">
          <BookOpen className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">No comics found</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
            Try resetting your search query or filter parameters above to view items in your catalog.
          </p>
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="mt-4 px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold cursor-pointer"
            >
              Clear All Filters
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        
        /* GRID VIEW */
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {visibleComics.map((comic) => {
            const box = boxes.find(b => b.id === comic.currentBoxId);
            return (
              <div
                key={comic.id}
                onClick={() => onSelectComic(comic)}
                className="group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden hover:border-slate-400 dark:hover:border-slate-700 hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between"
              >
                {/* Cover Image Container */}
                <div className="relative aspect-[2/3] bg-slate-100 dark:bg-slate-800 overflow-hidden border-b border-slate-100 dark:border-slate-800">
                  <img
                    src={getComicCoverUrl(comic.coverImage)}
                    alt={comic.title}
                    onError={handleImageError}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />

                  {/* Equivalent Size Thickness Badge */}
                  <div className="absolute top-2 left-2 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-[10px] font-bold px-2 py-0.5 rounded-md shadow-xs flex items-center gap-1">
                    <Layers className="w-3 h-3 text-slate-600 dark:text-slate-400" />
                    <span>{comic.sizeThickness.toFixed(1)}x Size</span>
                  </div>

                  {/* Full Art Badge */}
                  {comic.coverImageFull && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFullArtComic(comic);
                      }}
                      className="absolute top-8 left-2 bg-purple-600 hover:bg-purple-700 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded shadow-md flex items-center gap-1 transition-transform hover:scale-105 cursor-pointer z-10"
                      title="View Full Wraparound Cover Art"
                    >
                      <Sparkles className="w-2.5 h-2.5 text-amber-300" />
                      <span>Full Art</span>
                    </button>
                  )}

                  {/* Top-Right Badge: Wishlist or Box Location */}
                  <div className={`absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-md shadow-xs flex items-center gap-1 ${
                    comic.readingStatus === 'Wishlist'
                      ? 'bg-rose-900 text-white'
                      : comic.currentBoxId === 0
                        ? 'bg-amber-500 text-slate-950 font-extrabold'
                        : 'bg-slate-900 dark:bg-slate-800 dark:border dark:border-slate-700 text-white'
                  }`}>
                    {comic.readingStatus === 'Wishlist' ? (
                      <Bookmark className="w-3 h-3" />
                    ) : (
                      <Boxes className="w-3 h-3" />
                    )}
                    <span>
                      {comic.readingStatus === 'Wishlist'
                        ? 'Wishlist'
                        : comic.currentBoxId === 0
                          ? 'Box 0 (Unallocated)'
                          : `Box ${comic.currentBoxId}`}
                    </span>
                  </div>

                  {/* Status Indicator Bar */}
                  <div className="absolute bottom-2 left-2 right-2 flex justify-between items-center">
                    {comic.readingStatus !== 'Wishlist' && (
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md backdrop-blur-md border shadow-xs ${
                          comic.readingStatus === 'Read'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-800'
                            : comic.readingStatus === 'Reading'
                            ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-800'
                            : 'bg-white/90 text-slate-700 border-slate-200 dark:bg-slate-900/90 dark:text-slate-300 dark:border-slate-700'
                        }`}
                      >
                        {comic.readingStatus}
                      </span>
                    )}

                    {comic.userRating ? (
                      <span className="ml-auto flex items-center gap-0.5 bg-white/90 dark:bg-slate-900/90 text-amber-500 text-[10px] font-bold px-1.5 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 shadow-xs">
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                        {comic.userRating}
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* Content */}
                <div className="p-3 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-baseline justify-between gap-1">
                      <h3 className="font-bold text-slate-800 dark:text-slate-100 text-xs truncate group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                        {comic.title || comic.fullTitle || comic.seriesName || 'Untitled Comic'} {comic.volume ? <span className="font-normal text-slate-500 dark:text-slate-400 text-[10px]">({comic.volume})</span> : null}
                      </h3>
                      <span className="text-[11px] font-extrabold text-slate-900 dark:text-slate-100 shrink-0">
                        #{comic.issueNumber}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-medium truncate">
                      {comic.publisher} • {formatPublicationDate(comic.publicationYear, comic.publicationMonth)}
                    </p>

                    {/* Event & Copies Badges */}
                    <div className="flex flex-wrap items-center gap-1 mt-1.5">
                      {comic.event && (
                        <span className="inline-block bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 text-[9px] font-bold px-1.5 py-0.2 rounded truncate max-w-[130px]">
                          ⚡ {comic.event}
                        </span>
                      )}
                      {comic.readingStatus !== 'Wishlist' && (comic.copiesOwned ?? 1) > 1 && (
                        <span className="inline-block bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-[9px] font-bold px-1.5 py-0.2 rounded">
                          {comic.copiesOwned} Copies
                        </span>
                      )}
                    </div>

                    {/* Creator Contributions Badges */}
                    {comic.creatorContributions && comic.creatorContributions.length > 0 ? (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {comic.creatorContributions.slice(0, 2).map((cc, i) => (
                          <span
                            key={i}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedAuthor(cc.creatorName);
                            }}
                            className="inline-block bg-slate-100 dark:bg-slate-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-slate-700 dark:text-slate-300 hover:text-indigo-900 dark:hover:text-indigo-200 text-[9px] font-medium px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 truncate max-w-[130px] transition-colors"
                            title={`${cc.creatorName} (${cc.roleName})`}
                          >
                            ✍️ {cc.creatorName} ({cc.roleName})
                          </span>
                        ))}
                        {comic.creatorContributions.length > 2 && (
                          <span className="text-[9px] text-slate-400 dark:text-slate-500 font-semibold self-center">
                            +{comic.creatorContributions.length - 2}
                          </span>
                        )}
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 truncate">
                        By: {comic.writer || comic.artist || 'Unknown'}
                      </p>
                    )}

                    {/* Character Appearances Badges */}
                    {comic.characterAppearances && comic.characterAppearances.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {comic.characterAppearances.slice(0, 2).map((ca, i) => (
                          <span
                            key={i}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCharacter(ca.characterName);
                            }}
                            className={`inline-block text-[9px] font-medium px-1.5 py-0.5 rounded border truncate max-w-[130px] transition-colors ${
                              ca.appearanceType?.toLowerCase().includes('main')
                                ? 'bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                                : 'bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                            }`}
                            title={`${ca.characterName} (${ca.appearanceType})`}
                          >
                            🦸 {ca.characterName}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Series Run Indicator Pill & Mini Progress Bar */}
                    {(() => {
                      const sKey = (comic.seriesName || comic.title || '').trim().toLowerCase();
                      const stat = seriesStatsMap.get(sKey);
                      if (!stat || !stat.totalIssues) return null;
                      const { owned, totalIssues, pct, isComplete } = stat;

                      return (
                        <div className="mt-2 space-y-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedSeries(comic.seriesName || comic.title || 'all');
                            }}
                            className={`text-[9px] font-bold px-2 py-0.5 rounded border transition-colors cursor-pointer flex items-center gap-1 ${
                              isComplete
                                ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700 hover:bg-amber-100'
                                : pct >= 75
                                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100'
                                : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100'
                            }`}
                            title={`Series Run: ${owned} of ${totalIssues} issues owned (${pct}%). Click to filter catalog to this series.`}
                          >
                            <span>{isComplete ? '🏆 100% Full Run' : `Run: ${owned}/${totalIssues} (${pct}%)`}</span>
                          </button>
                          
                          <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden border border-slate-200/60 dark:border-slate-700/60">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                isComplete
                                  ? 'bg-gradient-to-r from-amber-400 to-amber-500'
                                  : pct >= 75
                                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                                  : 'bg-indigo-500 dark:bg-indigo-400'
                              }`}
                              style={{ width: `${Math.min(100, pct)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Footer details */}
                  <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                    <span className="truncate max-w-[80px] bg-slate-50 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-100 dark:border-slate-700">
                      {comic.format}
                    </span>
                    {comic.estimatedValue && (
                      <span className="font-bold text-slate-900 dark:text-slate-100">
                        ${comic.estimatedValue.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (

        /* TABLE VIEW */
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 text-[11px] uppercase tracking-wider font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th
                    onClick={(e) => handleColumnHeaderClick('seriesName', e.shiftKey)}
                    className="py-3 px-4 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors select-none"
                    title="Click to sort by Title & Issue. Shift+click to add to multi-sort."
                  >
                    <div className="flex items-center gap-1">
                      <span>Comic Title & Issue</span>
                      {getColumnSortIndicator('seriesName') || getColumnSortIndicator('title') || getColumnSortIndicator('issueNumber')}
                    </div>
                  </th>
                  <th
                    onClick={(e) => handleColumnHeaderClick('publisher', e.shiftKey)}
                    className="py-3 px-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors select-none"
                    title="Click to sort by Publisher. Shift+click to add to multi-sort."
                  >
                    <div className="flex items-center gap-1">
                      <span>Publisher & Year</span>
                      {getColumnSortIndicator('publisher') || getColumnSortIndicator('publicationYear')}
                    </div>
                  </th>
                  <th
                    onClick={(e) => handleColumnHeaderClick('writer', e.shiftKey)}
                    className="py-3 px-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors select-none"
                    title="Click to sort by Creator/Artist. Shift+click to add to multi-sort."
                  >
                    <div className="flex items-center gap-1">
                      <span>Creator / Artist</span>
                      {getColumnSortIndicator('writer') || getColumnSortIndicator('artist')}
                    </div>
                  </th>
                  <th
                    onClick={(e) => handleColumnHeaderClick('format', e.shiftKey)}
                    className="py-3 px-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors select-none"
                    title="Click to sort by Format. Shift+click to add to multi-sort."
                  >
                    <div className="flex items-center gap-1">
                      <span>Format</span>
                      {getColumnSortIndicator('format')}
                    </div>
                  </th>
                  <th
                    onClick={(e) => handleColumnHeaderClick('sizeThickness', e.shiftKey)}
                    className="py-3 px-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors select-none"
                    title="Click to sort by Size Thickness. Shift+click to add to multi-sort."
                  >
                    <div className="flex items-center gap-1">
                      <span>Size Units</span>
                      {getColumnSortIndicator('sizeThickness')}
                    </div>
                  </th>
                  <th
                    onClick={(e) => handleColumnHeaderClick('currentBoxId', e.shiftKey)}
                    className="py-3 px-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors select-none"
                    title="Click to sort by Storage Box. Shift+click to add to multi-sort."
                  >
                    <div className="flex items-center gap-1">
                      <span>Storage Box</span>
                      {getColumnSortIndicator('currentBoxId')}
                    </div>
                  </th>
                  <th
                    onClick={(e) => handleColumnHeaderClick('readingStatus', e.shiftKey)}
                    className="py-3 px-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors select-none"
                    title="Click to sort by Reading Status. Shift+click to add to multi-sort."
                  >
                    <div className="flex items-center gap-1">
                      <span>Status</span>
                      {getColumnSortIndicator('readingStatus')}
                    </div>
                  </th>
                  <th
                    onClick={(e) => handleColumnHeaderClick('userRating', e.shiftKey)}
                    className="py-3 px-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors select-none"
                    title="Click to sort by Rating. Shift+click to add to multi-sort."
                  >
                    <div className="flex items-center gap-1">
                      <span>Rating</span>
                      {getColumnSortIndicator('userRating')}
                    </div>
                  </th>
                  <th
                    onClick={(e) => handleColumnHeaderClick('estimatedValue', e.shiftKey)}
                    className="py-3 px-3 text-right cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors select-none"
                    title="Click to sort by Estimated Value. Shift+click to add to multi-sort."
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Est. Value</span>
                      {getColumnSortIndicator('estimatedValue')}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {visibleComics.map((comic) => (
                  <tr
                    key={comic.id}
                    onClick={() => onSelectComic(comic)}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-3">
                      <img
                        src={getComicCoverUrl(comic.coverImage)}
                        alt=""
                        onError={handleImageError}
                        referrerPolicy="no-referrer"
                        className="w-8 h-12 object-cover rounded shadow-xs border border-slate-200 dark:border-slate-700 shrink-0"
                        loading="lazy"
                      />
                      <div>
                        <div className="font-bold text-slate-800 dark:text-slate-100 hover:text-slate-900 dark:hover:text-white">
                          {comic.title || comic.fullTitle || comic.seriesName || 'Untitled Comic'} <span className="text-slate-900 dark:text-slate-200 font-extrabold">#{comic.issueNumber}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500 font-normal mt-0.5">
                          <span>{comic.genre}</span>
                          {(() => {
                            const sKey = (comic.seriesName || comic.title || '').trim().toLowerCase();
                            const stat = seriesStatsMap.get(sKey);
                            if (!stat || !stat.totalIssues) return null;
                            const { owned, totalIssues, pct, isComplete } = stat;
                            return (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedSeries(comic.seriesName || comic.title || 'all');
                                }}
                                className={`text-[9px] font-bold px-1.5 py-0.2 rounded border transition-colors cursor-pointer ${
                                  isComplete
                                    ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300'
                                    : pct >= 75
                                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300'
                                    : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 hover:bg-indigo-100'
                                }`}
                                title={`Click to filter catalog by series: ${owned}/${totalIssues} owned (${pct}%)`}
                              >
                                {isComplete ? '🏆 100% Run' : `Run ${owned}/${totalIssues} (${pct}%)`}
                              </button>
                            );
                          })()}
                          {comic.coverImageFull && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setFullArtComic(comic);
                              }}
                              className="inline-flex items-center gap-1 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/60 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-800 text-[9px] font-bold px-1.5 py-0.2 rounded transition-colors cursor-pointer"
                              title="Show Full Wraparound Cover Art"
                            >
                              <Sparkles className="w-2.5 h-2.5 text-amber-500" />
                              <span>Full Art</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-slate-600 dark:text-slate-400">
                      {comic.publisher} ({formatPublicationDate(comic.publicationYear, comic.publicationMonth)})
                    </td>
                    <td className="py-3 px-3 text-slate-600 dark:text-slate-400">
                      {comic.creatorContributions && comic.creatorContributions.length > 0 ? (
                        <div className="space-y-0.5">
                          <div className="flex flex-wrap gap-1">
                            {comic.creatorContributions.slice(0, 2).map((cc, i) => (
                              <span
                                key={i}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedAuthor(cc.creatorName);
                                }}
                                className="inline-block bg-slate-100 dark:bg-slate-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-slate-800 dark:text-slate-200 text-[10px] font-semibold px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 transition-colors"
                              >
                                {cc.creatorName} <span className="text-slate-400 dark:text-slate-500 font-normal">({cc.roleName})</span>
                              </span>
                            ))}
                            {comic.creatorContributions.length > 2 && (
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold self-center">
                                +{comic.creatorContributions.length - 2}
                              </span>
                            )}
                          </div>
                          {comic.characterAppearances && comic.characterAppearances.length > 0 && (
                            <div className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium truncate max-w-[180px]">
                              🦸 {comic.characterAppearances.map(c => c.characterName).slice(0, 2).join(', ')}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <div>W: {comic.writer || 'N/A'}</div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500">A: {comic.artist || 'N/A'}</div>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-[10px]">
                        {comic.format}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-bold text-slate-800 dark:text-slate-200">
                      {comic.sizeThickness.toFixed(1)}x
                    </td>
                    <td className="py-3 px-3">
                      {comic.currentBoxId === 0 ? (
                        comic.readingStatus === 'Wishlist' ? (
                          <span className="px-2 py-1 rounded bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-[11px] font-semibold">
                            Wishlist (Unassigned)
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-800 text-[11px] font-bold">
                            Box 0 (Unallocated)
                          </span>
                        )
                      ) : (
                        <span className="px-2 py-1 rounded bg-slate-900 dark:bg-slate-800 text-white text-[11px] font-semibold border dark:border-slate-700">
                          Box #{comic.currentBoxId}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const nextStatus: Record<string, ComicBook['readingStatus']> = {
                            'Unread': 'Reading',
                            'Reading': 'Read',
                            'Read': 'Unread',
                            'Wishlist': 'Unread',
                          };
                          onQuickStatusChange(comic.id, nextStatus[comic.readingStatus] || 'Read');
                        }}
                        className={`px-2 py-1 rounded text-[11px] font-bold border transition-colors cursor-pointer ${
                          comic.readingStatus === 'Read'
                            ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                            : comic.readingStatus === 'Reading'
                            ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {comic.readingStatus}
                      </button>
                    </td>
                    <td className="py-3 px-3">
                      {comic.userRating ? (
                        <div className="flex items-center gap-1 text-amber-500 font-bold">
                          <Star className="w-3.5 h-3.5 fill-amber-400" />
                          {comic.userRating}
                        </div>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-600">-</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-semibold text-slate-900 dark:text-slate-100">
                      {comic.estimatedValue ? `$${comic.estimatedValue.toFixed(2)}` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Progressive Loading Sentinel / Progress Indicator */}
      {!isLoading && isSettled && filteredComics.length > 0 && (
        <div className="w-full">
          {hasMore ? (
            <div
              ref={sentinelRef}
              data-testid="catalog-sentinel"
              className="py-8 flex flex-col items-center justify-center gap-2 text-slate-500 dark:text-slate-400"
            >
              <div className="flex items-center gap-2 text-xs font-semibold">
                <div className="w-4 h-4 border-2 border-indigo-600 dark:border-indigo-400 border-t-transparent rounded-full animate-spin" />
                <span>Loading more comics...</span>
              </div>
              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                Showing {visibleComics.length} of {filteredComics.length} comics
              </span>
            </div>
          ) : filteredComics.length > (viewMode === 'grid' ? CHUNK_SIZE_GRID : CHUNK_SIZE_TABLE) ? (
            <div className="py-6 text-center text-xs font-medium text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-800 mt-2">
              All {filteredComics.length} comics loaded
            </div>
          ) : null}
        </div>
      )}

      {/* Multi-Sort Configuration Modal */}
      <CatalogSortModal
        isOpen={isSortModalOpen}
        onClose={() => setIsSortModalOpen(false)}
        options={multiSortOptions}
        onChange={updateMultiSortOptions}
      />

      {/* Full Art Wraparound Showcase Modal */}
      {fullArtComic && (
        <FullArtShowcaseModal
          isOpen={!!fullArtComic}
          onClose={() => setFullArtComic(null)}
          comic={fullArtComic}
          allComics={comics}
          onSelectComic={(c) => setFullArtComic(c)}
        />
      )}
    </div>
  );
};
