import React, { useState, useMemo } from 'react';
import { ComicBook, StorageBox } from '../types';
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
  Bookmark
} from 'lucide-react';

interface CollectionCatalogProps {
  comics: ComicBook[];
  boxes: StorageBox[];
  searchQuery: string;
  onSelectComic: (comic: ComicBook) => void;
  onQuickStatusChange: (comicId: string, status: ComicBook['readingStatus']) => void;
}

export const CollectionCatalog: React.FC<CollectionCatalogProps> = ({
  comics,
  boxes,
  searchQuery,
  onSelectComic,
  onQuickStatusChange,
}) => {
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
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
    selectedGenre,
    selectedPublisher,
    selectedAuthor,
    selectedBoxId,
    selectedStatus,
    selectedFormat,
    selectedEvent,
    startDate,
    endDate,
    yearRange,
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
  ]);

  const resetFilters = () => {
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

  const hasActiveFilters = selectedGenre !== 'all' || selectedPublisher !== 'all' || selectedAuthor !== 'all' || selectedCharacter !== 'all' || selectedBoxId !== 'all' || selectedStatus !== 'all' || selectedFormat !== 'all' || selectedEvent !== 'all' || startDate !== '' || endDate !== '';

  return (
    <div className="space-y-6">
      
      {/* Top Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-700" />
            <h2 className="font-bold text-slate-800 text-sm">Collection Filters</h2>
            <span className="text-xs text-slate-500 ml-2">
              Showing <strong className="text-slate-900">{filteredComics.length}</strong> items ({comics.filter(c => c.readingStatus !== 'Wishlist').length} Owned, {comics.filter(c => c.readingStatus === 'Wishlist').length} Wishlist)
            </span>
          </div>

          <div className="flex items-center gap-3">
            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                className="flex items-center gap-1 text-xs text-rose-600 hover:text-rose-700 font-medium px-2.5 py-1 rounded-md bg-rose-50 border border-rose-200 transition-colors"
              >
                <X className="w-3 h-3" /> Reset Filters
              </button>
            )}

            {/* View Switcher */}
            <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-md text-xs font-medium transition-all ${
                  viewMode === 'grid' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Grid View"
              >
                <Grid3X3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-md text-xs font-medium transition-all ${
                  viewMode === 'table' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Table List View"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Filter Controls Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 pt-3">
          
          {/* Genre */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Genre</label>
            <select
              value={selectedGenre}
              onChange={(e) => setSelectedGenre(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-300"
            >
              <option value="all">All Genres</option>
              {genres.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          {/* Publisher */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Publisher</label>
            <select
              value={selectedPublisher}
              onChange={(e) => setSelectedPublisher(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-300"
            >
              <option value="all">All Publishers</option>
              {publishers.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* Release Date Range */}
          <div>
            <label className="block text-[11px] font-semibold text-blue-700 mb-1">Release Date Range</label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-1/2 bg-blue-50/50 border border-blue-200 rounded-md px-2 py-1.5 text-xs text-blue-900 font-medium focus:outline-none focus:ring-1 focus:ring-blue-400"
                aria-label="Release start date"
              />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-1/2 bg-blue-50/50 border border-blue-200 rounded-md px-2 py-1.5 text-xs text-blue-900 font-medium focus:outline-none focus:ring-1 focus:ring-blue-400"
                aria-label="Release end date"
              />
            </div>
          </div>

          {/* Crossover Event */}
          <div>
            <label className="block text-[11px] font-semibold text-purple-700 mb-1">Crossover Event</label>
            <select
              value={selectedEvent}
              onChange={(e) => setSelectedEvent(e.target.value)}
              className="w-full bg-purple-50/50 border border-purple-200 rounded-md px-2.5 py-1.5 text-xs text-purple-900 font-medium focus:outline-none focus:ring-1 focus:ring-purple-400"
            >
              <option value="all">All Events ({events.length})</option>
              {events.map(ev => (
                <option key={ev} value={ev}>{ev}</option>
              ))}
            </select>
          </div>

          {/* Writer/Artist */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Creator / Contributor</label>
            <select
              value={selectedAuthor}
              onChange={(e) => setSelectedAuthor(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-300"
            >
              <option value="all">All Creators ({authors.length})</option>
              {authors.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          {/* Featured Character */}
          <div>
            <label className="block text-[11px] font-semibold text-emerald-700 mb-1">Featured Character</label>
            <select
              value={selectedCharacter}
              onChange={(e) => setSelectedCharacter(e.target.value)}
              className="w-full bg-emerald-50/50 border border-emerald-200 rounded-md px-2.5 py-1.5 text-xs text-emerald-950 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-400"
            >
              <option value="all">All Characters ({characters.length})</option>
              {characters.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Storage Box */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Storage Box</label>
            <select
              value={selectedBoxId}
              onChange={(e) => setSelectedBoxId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-300"
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
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Reading Status</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-300"
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
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Sort By</label>
            <div className="flex items-center gap-1">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="w-full bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-300"
              >
                <option value="title">Title</option>
                <option value="year">Year</option>
                <option value="thickness">Size Units</option>
                <option value="value">Est. Value</option>
                <option value="rating">Rating</option>
              </select>
              <button
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="p-1.5 bg-slate-50 border border-slate-200 rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                title={`Order: ${sortOrder.toUpperCase()}`}
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* Catalog Display */}
      {filteredComics.length === 0 ? (
        <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
          <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-800">No comics found</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
            Try resetting your search query or filter parameters above to view items in your catalog.
          </p>
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="mt-4 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold"
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
                className="group bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-slate-400 hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between"
              >
                {/* Cover Image Container */}
                <div className="relative aspect-[2/3] bg-slate-100 overflow-hidden border-b border-slate-100">
                  <img
                    src={getComicCoverUrl(comic.coverImage)}
                    alt={comic.title}
                    onError={handleImageError}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />

                  {/* Equivalent Size Thickness Badge */}
                  <div className="absolute top-2 left-2 bg-white/90 backdrop-blur-md border border-slate-200 text-slate-800 text-[10px] font-bold px-2 py-0.5 rounded-md shadow-xs flex items-center gap-1">
                    <Layers className="w-3 h-3 text-slate-600" />
                    <span>{comic.sizeThickness.toFixed(1)}x Size</span>
                  </div>

                  {/* Box # Badge */}
                  <div className={`absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-md shadow-xs flex items-center gap-1 ${
                    comic.currentBoxId === 0
                      ? comic.readingStatus === 'Wishlist'
                        ? 'bg-rose-900 text-white'
                        : 'bg-amber-500 text-slate-950 font-extrabold'
                      : 'bg-slate-900 text-white'
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
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : comic.readingStatus === 'Reading'
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : comic.readingStatus === 'Wishlist'
                          ? 'bg-purple-50 text-purple-700 border-purple-200'
                          : 'bg-white/90 text-slate-700 border-slate-200'
                      }`}
                    >
                      {comic.readingStatus}
                    </span>

                    {comic.userRating ? (
                      <span className="flex items-center gap-0.5 bg-white/90 text-amber-500 text-[10px] font-bold px-1.5 py-0.5 rounded-md border border-slate-200 shadow-xs">
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
                      <h3 className="font-bold text-slate-800 text-xs truncate group-hover:text-slate-900 transition-colors">
                        {comic.title || comic.fullTitle || comic.seriesName || 'Untitled Comic'} {comic.volume ? <span className="font-normal text-slate-500 text-[10px]">({comic.volume})</span> : null}
                      </h3>
                      <span className="text-[11px] font-extrabold text-slate-900 shrink-0">
                        #{comic.issueNumber}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-500 mt-0.5 font-medium truncate">
                      {comic.publisher} • {formatPublicationDate(comic.publicationYear, comic.publicationMonth)}
                    </p>

                    {/* Event & Copies Badges */}
                    <div className="flex flex-wrap items-center gap-1 mt-1.5">
                      {comic.event && (
                        <span className="inline-block bg-purple-50 text-purple-700 border border-purple-200 text-[9px] font-bold px-1.5 py-0.2 rounded truncate max-w-[130px]">
                          ⚡ {comic.event}
                        </span>
                      )}
                      {comic.readingStatus !== 'Wishlist' && (comic.copiesOwned ?? 1) > 1 && (
                        <span className="inline-block bg-amber-50 text-amber-800 border border-amber-200 text-[9px] font-bold px-1.5 py-0.2 rounded">
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
                            className="inline-block bg-slate-100 hover:bg-indigo-100 text-slate-700 hover:text-indigo-900 text-[9px] font-medium px-1.5 py-0.5 rounded border border-slate-200 truncate max-w-[130px] transition-colors"
                            title={`${cc.creatorName} (${cc.roleName})`}
                          >
                            ✍️ {cc.creatorName} ({cc.roleName})
                          </span>
                        ))}
                        {comic.creatorContributions.length > 2 && (
                          <span className="text-[9px] text-slate-400 font-semibold self-center">
                            +{comic.creatorContributions.length - 2}
                          </span>
                        )}
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-400 mt-1 truncate">
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
                                ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
                                : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                            title={`${ca.characterName} (${ca.appearanceType})`}
                          >
                            🦸 {ca.characterName}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Footer details */}
                  <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
                    <span className="truncate max-w-[80px] bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                      {comic.format}
                    </span>
                    {comic.estimatedValue && (
                      <span className="font-bold text-slate-900">
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
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider font-semibold border-b border-slate-200">
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
              <tbody className="divide-y divide-slate-100">
                {filteredComics.map((comic) => (
                  <tr
                    key={comic.id}
                    onClick={() => onSelectComic(comic)}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-4 font-semibold text-slate-900 flex items-center gap-3">
                      <img
                        src={getComicCoverUrl(comic.coverImage)}
                        alt=""
                        onError={handleImageError}
                        className="w-8 h-12 object-cover rounded shadow-xs border border-slate-200 shrink-0"
                      />
                      <div>
                        <div className="font-bold text-slate-800 hover:text-slate-900">
                          {comic.title || comic.fullTitle || comic.seriesName || 'Untitled Comic'} <span className="text-slate-900 font-extrabold">#{comic.issueNumber}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-normal">
                          {comic.genre}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-slate-600">
                      {comic.publisher} ({formatPublicationDate(comic.publicationYear, comic.publicationMonth)})
                    </td>
                    <td className="py-3 px-3 text-slate-600">
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
                                className="inline-block bg-slate-100 hover:bg-indigo-100 text-slate-800 text-[10px] font-semibold px-1.5 py-0.5 rounded border border-slate-200 transition-colors"
                              >
                                {cc.creatorName} <span className="text-slate-400 font-normal">({cc.roleName})</span>
                              </span>
                            ))}
                            {comic.creatorContributions.length > 2 && (
                              <span className="text-[10px] text-slate-400 font-semibold self-center">
                                +{comic.creatorContributions.length - 2}
                              </span>
                            )}
                          </div>
                          {comic.characterAppearances && comic.characterAppearances.length > 0 && (
                            <div className="text-[10px] text-emerald-700 font-medium truncate max-w-[180px]">
                              🦸 {comic.characterAppearances.map(c => c.characterName).slice(0, 2).join(', ')}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <div>W: {comic.writer || 'N/A'}</div>
                          <div className="text-[10px] text-slate-400">A: {comic.artist || 'N/A'}</div>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 text-[10px]">
                        {comic.format}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-bold text-slate-800">
                      {comic.sizeThickness.toFixed(1)}x
                    </td>
                    <td className="py-3 px-3">
                      {comic.currentBoxId === 0 ? (
                        comic.readingStatus === 'Wishlist' ? (
                          <span className="px-2 py-1 rounded bg-rose-100 text-rose-800 border border-rose-200 text-[11px] font-semibold">
                            Wishlist (Unassigned)
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-bold">
                            Box 0 (Unallocated)
                          </span>
                        )
                      ) : (
                        <span className="px-2 py-1 rounded bg-slate-900 text-white text-[11px] font-semibold">
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
                        className={`px-2 py-1 rounded text-[11px] font-bold border transition-colors ${
                          comic.readingStatus === 'Read'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : comic.readingStatus === 'Reading'
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-slate-100 text-slate-700 border-slate-200'
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
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-semibold text-slate-900">
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
