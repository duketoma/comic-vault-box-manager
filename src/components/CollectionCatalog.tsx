import React, { useState, useMemo } from 'react';
import { ComicBook, StorageBox, SeriesIssueTotal } from '../types';
import { getComicCoverUrl, handleImageError } from '../utils/imageUtils';
import { sortBoxes } from '../utils/boxUtils';
import { formatPublicationDate, getMonthIndex, MONTH_NAMES } from '../utils/dateUtils';
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
  Check
} from 'lucide-react';

interface CollectionCatalogProps {
  comics: ComicBook[];
  boxes: StorageBox[];
  searchQuery: string;
  onSelectComic: (comic: ComicBook) => void;
  onQuickStatusChange: (comicId: string, status: ComicBook['readingStatus']) => void;
  seriesTotals?: SeriesIssueTotal[];
  selectedSeries?: string;
  onSelectSeries?: (series: string) => void;
}

export const CollectionCatalog: React.FC<CollectionCatalogProps> = ({
  comics,
  boxes,
  searchQuery,
  onSelectComic,
  onQuickStatusChange,
  seriesTotals = [],
  selectedSeries: controlledSelectedSeries,
  onSelectSeries: onSelectSeriesProp,
}) => {
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
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
  const [yearRange, setYearRange] = useState<[number, number]>([1930, 2026]);
  const [sortBy, setSortBy] = useState<'title' | 'year' | 'thickness' | 'value' | 'rating'>('title');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Extract unique filter options
  const seriesList = useMemo(() => {
    const set = new Set<string>();
    comics.forEach(c => {
      const s = (c.seriesName || c.title || '').trim();
      if (s) set.add(s);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [comics]);

  const seriesTotalsMap = useMemo(() => {
    const map = new Map<string, SeriesIssueTotal>();
    if (seriesTotals) {
      seriesTotals.forEach(st => {
        if (st.seriesName) {
          map.set(st.seriesName.toLowerCase().trim(), st);
        }
      });
    }
    return map;
  }, [seriesTotals]);

  const seriesStatsMap = useMemo(() => {
    interface SeriesStat {
      seriesName: string;
      owned: number;
      wishlist: number;
      totalIssues: number;
      pct: number;
      isComplete: boolean;
      remaining: number;
      ownedIssueNumbers: number[];
      wishlistIssueNumbers: number[];
      missingIssueNumbers: number[];
      publisher?: string;
      volume?: string;
    }

    const map = new Map<string, SeriesStat>();

    comics.forEach(c => {
      const sKey = (c.seriesName || c.title || '').trim().toLowerCase();
      if (!sKey) return;
      let stat = map.get(sKey);
      if (!stat) {
        stat = {
          seriesName: c.seriesName || c.title || '',
          owned: 0,
          wishlist: 0,
          totalIssues: 0,
          pct: 0,
          isComplete: false,
          remaining: 0,
          ownedIssueNumbers: [],
          wishlistIssueNumbers: [],
          missingIssueNumbers: [],
          publisher: c.publisher,
          volume: c.volume,
        };
        map.set(sKey, stat);
      }

      const num = parseInt(c.issueNumber, 10);
      if (c.readingStatus === 'Wishlist') {
        stat.wishlist += 1;
        if (!isNaN(num) && !stat.wishlistIssueNumbers.includes(num)) {
          stat.wishlistIssueNumbers.push(num);
        }
      } else {
        stat.owned += 1;
        if (!isNaN(num) && !stat.ownedIssueNumbers.includes(num)) {
          stat.ownedIssueNumbers.push(num);
        }
      }
    });

    map.forEach((stat, key) => {
      const totalInfo = seriesTotalsMap.get(key);
      const totalCount = totalInfo?.issueCount || 0;
      stat.totalIssues = totalCount;
      if (totalInfo?.publisher) stat.publisher = totalInfo.publisher;
      if (totalInfo?.volume) stat.volume = totalInfo.volume;

      if (totalCount > 0) {
        stat.pct = Math.round((stat.owned / totalCount) * 100);
        stat.isComplete = stat.owned >= totalCount;
        stat.remaining = Math.max(0, totalCount - stat.owned);

        stat.ownedIssueNumbers.sort((a, b) => a - b);
        stat.wishlistIssueNumbers.sort((a, b) => a - b);
        const ownedSet = new Set(stat.ownedIssueNumbers);
        const missing: number[] = [];
        for (let i = 1; i <= Math.min(totalCount, 300); i++) {
          if (!ownedSet.has(i)) {
            missing.push(i);
          }
        }
        stat.missingIssueNumbers = missing;
      } else {
        stat.pct = 0;
        stat.isComplete = false;
        stat.remaining = 0;
      }
    });

    return map;
  }, [comics, seriesTotalsMap]);

  const seriesRunCounts = useMemo(() => {
    let complete = 0;
    let near = 0;
    let inProgress = 0;
    seriesStatsMap.forEach(s => {
      if (s.totalIssues > 0) {
        if (s.isComplete) complete++;
        else if (s.pct >= 75) near++;
        else inProgress++;
      }
    });
    return { complete, near, inProgress };
  }, [seriesStatsMap]);
  const genres = useMemo(() => {
    const set = new Set<string>();
    comics.forEach(c => c.genre && set.add(c.genre));
    return Array.from(set).sort();
  }, [comics]);

  const publishers = useMemo(() => {
    const set = new Set<string>();
    comics.forEach(c => c.publisher && set.add(c.publisher));
    return Array.from(set).sort();
  }, [comics]);

  const authors = useMemo(() => {
    const set = new Set<string>();
    comics.forEach(c => {
      if (c.writer) set.add(c.writer);
      if (c.artist) set.add(c.artist);
      if (Array.isArray(c.creatorContributions)) {
        c.creatorContributions.forEach(cc => {
          if (cc.creatorName) set.add(cc.creatorName);
        });
      }
    });
    return Array.from(set).sort();
  }, [comics]);

  const characters = useMemo(() => {
    const set = new Set<string>();
    comics.forEach(c => {
      if (Array.isArray(c.characterAppearances)) {
        c.characterAppearances.forEach(ca => {
          if (ca.characterName) set.add(ca.characterName);
        });
      }
    });
    return Array.from(set).sort();
  }, [comics]);

  const events = useMemo(() => {
    const set = new Set<string>();
    comics.forEach(c => {
      if (c.event) set.add(c.event);
    });
    return Array.from(set).sort();
  }, [comics]);

  // Filtered & Sorted Comics
  const filteredComics = useMemo(() => {
    return comics.filter(c => {
      // Search query filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchTitle = (c.title || c.fullTitle || c.seriesName || '').toLowerCase().includes(q);
        const matchFullTitle = c.fullTitle ? c.fullTitle.toLowerCase().includes(q) : false;
        const matchSeries = c.seriesName ? c.seriesName.toLowerCase().includes(q) : false;
        const matchIssue = c.issueNumber.toLowerCase().includes(q);
        const matchPub = c.publisher.toLowerCase().includes(q);
        const matchWriter = c.writer.toLowerCase().includes(q);
        const matchArtist = c.artist.toLowerCase().includes(q);
        const matchTag = c.tags.some(t => t.toLowerCase().includes(q));
        const matchEvent = c.event ? c.event.toLowerCase().includes(q) : false;
        const matchVol = c.volume ? c.volume.toLowerCase().includes(q) : false;
        const matchCreator = c.creatorContributions?.some(cc => cc.creatorName.toLowerCase().includes(q) || cc.roleName.toLowerCase().includes(q));
        const matchChar = c.characterAppearances?.some(ca => ca.characterName.toLowerCase().includes(q) || ca.appearanceType.toLowerCase().includes(q));
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
      if (selectedBoxId !== 'all' && c.currentBoxId.toString() !== selectedBoxId) return false;
      if (selectedStatus !== 'all' && c.readingStatus !== selectedStatus) return false;
      if (selectedFormat !== 'all' && c.format !== selectedFormat) return false;
      if (selectedEvent !== 'all' && c.event !== selectedEvent) return false;
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
    }).sort((a, b) => {
      let result = 0;
      if (sortBy === 'title') {
        const titleA = a.title || a.fullTitle || a.seriesName || '';
        const titleB = b.title || b.fullTitle || b.seriesName || '';
        result = titleA.localeCompare(titleB);
      } else if (sortBy === 'year') {
        result = a.publicationYear - b.publicationYear || getMonthIndex(a.publicationMonth) - getMonthIndex(b.publicationMonth);
      } else if (sortBy === 'thickness') {
        result = a.sizeThickness - b.sizeThickness;
      } else if (sortBy === 'value') {
        result = (a.estimatedValue || 0) - (b.estimatedValue || 0);
      } else if (sortBy === 'rating') {
        result = (a.userRating || 0) - (b.userRating || 0);
      }
      return sortOrder === 'asc' ? result : -result;
    });
  }, [
    comics,
    searchQuery,
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
    startDate,
    endDate,
    yearRange,
    sortBy,
    sortOrder,
    seriesStatsMap,
  ]);

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
    setStartDate('');
    setEndDate('');
    setYearRange([1930, 2026]);
  };

  const hasActiveFilters = selectedSeries !== 'all' || selectedRunProgress !== 'all' || selectedGenre !== 'all' || selectedPublisher !== 'all' || selectedAuthor !== 'all' || selectedCharacter !== 'all' || selectedBoxId !== 'all' || selectedStatus !== 'all' || selectedFormat !== 'all' || selectedEvent !== 'all' || startDate !== '' || endDate !== '';

  return (
    <div className="space-y-6">
      
      {/* Top Filter Toolbar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm transition-colors">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-700 dark:text-slate-300" />
            <h2 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Collection Filters</h2>
            <span className="text-xs text-slate-500 dark:text-slate-400 ml-2">
              Showing <strong className="text-slate-900 dark:text-slate-100">{filteredComics.length}</strong> items ({comics.filter(c => c.readingStatus !== 'Wishlist').length} Owned, {comics.filter(c => c.readingStatus === 'Wishlist').length} Wishlist)
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

          {/* Sort By */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Sort By</label>
            <div className="flex items-center gap-1">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-slate-300 dark:focus:ring-slate-600"
              >
                <option value="title">Title</option>
                <option value="year">Year</option>
                <option value="thickness">Size Units</option>
                <option value="value">Est. Value</option>
                <option value="rating">Rating</option>
              </select>
              <button
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="p-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                title={`Order: ${sortOrder.toUpperCase()}`}
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

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
                          : pct >= 75
                          ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                          : 'bg-gradient-to-r from-indigo-500 to-indigo-600'
                      }`}
                      style={{ width: `${Math.min(100, pct || 0)}%` }}
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
      {filteredComics.length === 0 ? (
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
          {filteredComics.map((comic) => {
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

                  {/* Box # Badge */}
                  <div className={`absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-md shadow-xs flex items-center gap-1 ${
                    comic.currentBoxId === 0
                      ? comic.readingStatus === 'Wishlist'
                        ? 'bg-rose-900 text-white'
                        : 'bg-amber-500 text-slate-950 font-extrabold'
                      : 'bg-slate-900 dark:bg-slate-800 dark:border dark:border-slate-700 text-white'
                  }`}>
                    <Boxes className="w-3 h-3" />
                    <span>
                      {comic.currentBoxId === 0
                        ? comic.readingStatus === 'Wishlist'
                          ? 'Wishlist'
                          : 'Box 0 (Unallocated)'
                        : `Box ${comic.currentBoxId}`}
                    </span>
                  </div>

                  {/* Status Indicator Bar */}
                  <div className="absolute bottom-2 left-2 right-2 flex justify-between items-center">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md backdrop-blur-md border shadow-xs ${
                        comic.readingStatus === 'Read'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-800'
                          : comic.readingStatus === 'Reading'
                          ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-800'
                          : comic.readingStatus === 'Wishlist'
                          ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/80 dark:text-purple-300 dark:border-purple-800'
                          : 'bg-white/90 text-slate-700 border-slate-200 dark:bg-slate-900/90 dark:text-slate-300 dark:border-slate-700'
                      }`}
                    >
                      {comic.readingStatus}
                    </span>

                    {comic.userRating ? (
                      <span className="flex items-center gap-0.5 bg-white/90 dark:bg-slate-900/90 text-amber-500 text-[10px] font-bold px-1.5 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 shadow-xs">
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
                  <th className="py-3 px-4">Comic Title & Issue</th>
                  <th className="py-3 px-3">Publisher & Year</th>
                  <th className="py-3 px-3">Creator / Artist</th>
                  <th className="py-3 px-3">Format</th>
                  <th className="py-3 px-3">Size Units</th>
                  <th className="py-3 px-3">Storage Box</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Rating</th>
                  <th className="py-3 px-3 text-right">Est. Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredComics.map((comic) => (
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
    </div>
  );
};
