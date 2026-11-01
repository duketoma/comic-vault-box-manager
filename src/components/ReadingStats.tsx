import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ComicBook, SeriesIssueTotal, StorageBox } from '../types';
import { sortBoxes } from '../utils/boxUtils';
import { getComicCoverUrl, handleImageError } from '../utils/imageUtils';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  CartesianGrid, 
  Legend 
} from 'recharts';
import { 
  BarChart3, 
  BookOpen, 
  CheckCircle2, 
  DollarSign, 
  Layers, 
  Boxes, 
  Award, 
  TrendingUp,
  Clock,
  Trophy,
  Crown,
  Sparkles,
  Star,
  Target,
  Medal,
  FolderKanban,
  CheckCheck,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Filter,
  Info,
  Layers3,
  Bookmark,
  Palette,
  Users,
  PenTool,
  Feather,
  Flame,
  Search,
  X,
  Copy,
  Check,
  ExternalLink,
  ArrowUpDown
} from 'lucide-react';
import { 
  isAnnualComic,
  parseIssueNumber
} from '../utils/comicSortUtils';
import { formatPublicationDate, getNormalizedComicDate } from '../utils/dateUtils';
import { computeSeriesCompletionMap } from '../utils/seriesUtils';
import { isWritingRole, isArtRole, getRoleCategory, ContributorCategory } from '../utils/creatorParser';

interface ReadingStatsProps {
  comics: ComicBook[];
  boxes: StorageBox[];
  seriesTotals?: SeriesIssueTotal[];
  onViewSeriesInCatalog?: (seriesName: string) => void;
  onOpenGenerateWishlist?: (seriesName?: string) => void;
  onStartEventChallenge?: (eventName: string) => void;
  initialSubTab?: 'events' | 'series' | 'creators' | 'characters' | 'achievements' | 'general';
}

const COLORS = ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];

const CHUNK_SIZE_EVENTS = 4;
const CHUNK_SIZE_EVENT_COMICS = 24;

interface IndexedComic {
  comic: ComicBook;
  dateKey: number;
  titleKey: string;
  issueMajor: number;
  issueSuffix: string;
}

const preIndexComic = (c: ComicBook): IndexedComic => {
  const norm = getNormalizedComicDate(c);
  const issue = parseIssueNumber(c.issueNumber);
  return {
    comic: c,
    dateKey: norm.sortKey > 0 ? norm.sortKey : 99999999,
    titleKey: (c.seriesName || c.title || '').toLowerCase(),
    issueMajor: issue.major,
    issueSuffix: issue.suffix || '',
  };
};

const compareIndexedComics = (a: IndexedComic, b: IndexedComic): number => {
  if (a.dateKey !== b.dateKey) {
    return a.dateKey - b.dateKey;
  }
  const titleCmp = a.titleKey.localeCompare(b.titleKey);
  if (titleCmp !== 0) {
    return titleCmp;
  }
  if (a.issueMajor !== b.issueMajor) {
    return a.issueMajor - b.issueMajor;
  }
  return a.issueSuffix.localeCompare(b.issueSuffix);
};

export const ReadingStats: React.FC<ReadingStatsProps> = ({ 
  comics, 
  boxes, 
  seriesTotals = [], 
  onViewSeriesInCatalog,
  onOpenGenerateWishlist,
  onStartEventChallenge,
  initialSubTab = 'events' 
}) => {
  // Navigation & Sub-Tab State
  const [activeStatsTab, setActiveStatsTab] = useState<'events' | 'series' | 'creators' | 'characters' | 'achievements' | 'general'>(initialSubTab);

  useEffect(() => {
    if (initialSubTab) {
      setActiveStatsTab(initialSubTab);
    }
  }, [initialSubTab]);
  
  // Box Inspector State
  const [selectedBoxId, setSelectedBoxId] = useState<number | 'all'>('all');
  
  // Event Filter State
  const [selectedEvent, setSelectedEvent] = useState<string>('all');
  const [visibleEventsCount, setVisibleEventsCount] = useState<number>(CHUNK_SIZE_EVENTS);
  const [visibleEventComicsCount, setVisibleEventComicsCount] = useState<number>(CHUNK_SIZE_EVENT_COMICS);

  // Progressive rendering intersection sentinel refs
  const eventsSentinelRef = useRef<HTMLDivElement | null>(null);
  const eventComicsSentinelRef = useRef<HTMLDivElement | null>(null);
  
  // Series Filter & Sort State
  const [seriesSortBy, setSeriesSortBy] = useState<'completion' | 'alphabetical'>('completion');
  const [seriesSortDirection, setSeriesSortDirection] = useState<'asc' | 'desc'>('desc');
  const [seriesRunFilter, setSeriesRunFilter] = useState<'in_progress_all' | 'complete' | 'near' | 'under_75'>('in_progress_all');
  const [seriesSearchQuery, setSeriesSearchQuery] = useState<string>('');
  const [expandedSeriesName, setExpandedSeriesName] = useState<string | null>(null);
  const [copiedSeriesMissing, setCopiedSeriesMissing] = useState<string | null>(null);

  // Creator & Contributor State
  const [creatorSearchQuery, setCreatorSearchQuery] = useState<string>('');
  const [creatorRoleFilter, setCreatorRoleFilter] = useState<string>('all');
  const [onlyArtistsWhoWrite, setOnlyArtistsWhoWrite] = useState<boolean>(false);
  const [topCreatorsCategoryFilter, setTopCreatorsCategoryFilter] = useState<'all' | 'Artist' | 'Writer' | 'Editor' | 'Other'>('all');
  const [selectedCreatorForIssues, setSelectedCreatorForIssues] = useState<string | null>(null);

  // Character Appearances State
  const [characterSearchQuery, setCharacterSearchQuery] = useState<string>('');
  const [characterRoleFilter, setCharacterRoleFilter] = useState<'all' | 'main' | 'supporting' | 'cameo'>('all');
  const [selectedCharacterForIssues, setSelectedCharacterForIssues] = useState<string | null>(null);

  // Achievements State
  const [achievementCategoryFilter, setAchievementCategoryFilter] = useState<'all' | 'collection' | 'reading' | 'events'>('all');

  // Aggregate stats
  const inCollectionComics = useMemo(() => comics.filter((c) => c.readingStatus !== 'Wishlist'), [comics]);
  const wishlistComics = useMemo(() => comics.filter((c) => c.readingStatus === 'Wishlist'), [comics]);

  const totalComics = inCollectionComics.length;
  const totalThickness = inCollectionComics.reduce((acc, c) => acc + (c.sizeThickness || 1.0), 0);
  const totalValue = inCollectionComics.reduce((acc, c) => acc + (c.estimatedValue || 0), 0);
  const readCount = inCollectionComics.filter((c) => c.readingStatus === 'Read').length;
  const readingCount = inCollectionComics.filter((c) => c.readingStatus === 'Reading').length;
  const unreadCount = inCollectionComics.filter((c) => c.readingStatus === 'Unread').length;
  const wishlistCount = wishlistComics.length;
  const readPercentage = totalComics > 0 ? Math.round((readCount / totalComics) * 100) : 0;

  // -------------------------------------------------------------
  // 1. EVENT COLLECTION DATA & ANALYTICS
  // -------------------------------------------------------------
  const allEventsList = useMemo(() => {
    const eventSet = new Set<string>();
    comics.forEach((c) => {
      if (c.event && c.event.trim()) {
        eventSet.add(c.event.trim());
      }
    });
    return Array.from(eventSet).sort((a, b) => a.localeCompare(b));
  }, [comics]);

  // Fallback default event options only if collection doesn't have any custom events
  const defaultEventOptions = useMemo(() => {
    if (allEventsList.length > 0) {
      return allEventsList;
    }
    const defaultList = [
      'Secret Wars Era',
      'X-Tinction Agenda',
      'Born Again',
      'Vader Down',
      'Civil War',
      'Infinity Gauntlet',
      'Crisis on Infinite Earths',
      'Flashpoint',
      'The Long Halloween'
    ];
    return [...defaultList].sort((a, b) => a.localeCompare(b));
  }, [allEventsList]);

  // Helper to compare comics chronologically: release date first, then series/title, then issue number
  const compareComicReleaseDates = (a: ComicBook, b: ComicBook): number => {
    const normA = getNormalizedComicDate(a);
    const normB = getNormalizedComicDate(b);

    const dateA = normA.sortKey > 0 ? normA.sortKey : 99999999;
    const dateB = normB.sortKey > 0 ? normB.sortKey : 99999999;

    if (dateA !== dateB) {
      return dateA - dateB;
    }

    // Same date: sort by Series/Title
    const titleA = (a.seriesName || a.title || '').toLowerCase();
    const titleB = (b.seriesName || b.title || '').toLowerCase();
    const titleCmp = titleA.localeCompare(titleB);
    if (titleCmp !== 0) {
      return titleCmp;
    }

    // Same title: sort by issue number numerically
    const issueA = parseIssueNumber(a.issueNumber);
    const issueB = parseIssueNumber(b.issueNumber);
    if (issueA.major !== issueB.major) {
      return issueA.major - issueB.major;
    }
    return (issueA.suffix || '').localeCompare(issueB.suffix || '');
  };

  // Selected Event Filtered Comics (pre-indexed & sorted chronologically by release date, title, and issue)
  const filteredEventComics = useMemo(() => {
    let list: ComicBook[] = [];
    if (selectedEvent === 'all') {
      const matching = comics.filter((c) => Boolean(c.event && c.event.trim()));
      const indexed = matching.map(preIndexComic);
      indexed.sort((a, b) => {
        const evA = (a.comic.event || '').trim().toLowerCase();
        const evB = (b.comic.event || '').trim().toLowerCase();
        if (evA !== evB) {
          return evA.localeCompare(evB);
        }
        return compareIndexedComics(a, b);
      });
      list = indexed.map((item) => item.comic);
    } else {
      const targetEvent = selectedEvent.trim().toLowerCase();
      const matching = comics.filter((c) => c.event && c.event.trim().toLowerCase() === targetEvent);
      const indexed = matching.map(preIndexComic);
      indexed.sort(compareIndexedComics);
      list = indexed.map((item) => item.comic);
    }
    return list;
  }, [comics, selectedEvent]);

  // Grouped Event Comics for "All Crossover Events" View
  const groupedEvents = useMemo(() => {
    if (selectedEvent !== 'all') return [];

    const map = new Map<string, ComicBook[]>();
    comics.forEach((c) => {
      const evt = c.event && c.event.trim();
      if (!evt) return;
      if (!map.has(evt)) {
        map.set(evt, []);
      }
      map.get(evt)!.push(c);
    });

    const sortedGroups: Array<{
      eventName: string;
      comics: ComicBook[];
      readCount: number;
      ownedCount: number;
      unreadCount: number;
      wishlistCount: number;
      completionPct: number;
    }> = [];

    const eventNames = Array.from(map.keys()).sort((a, b) => a.localeCompare(b));

    eventNames.forEach((evt) => {
      const groupComics = map.get(evt)!;
      const indexed = groupComics.map(preIndexComic);
      indexed.sort(compareIndexedComics);
      const sortedComics = indexed.map((item) => item.comic);

      let read = 0;
      let unread = 0;
      let wishlist = 0;
      sortedComics.forEach((c) => {
        if (c.readingStatus === 'Read') read++;
        else if (c.readingStatus === 'Unread') unread++;
        else if (c.readingStatus === 'Wishlist') wishlist++;
      });
      const owned = sortedComics.length - wishlist;
      const completionPct = owned > 0 ? Math.round((read / owned) * 100) : 0;

      sortedGroups.push({
        eventName: evt,
        comics: sortedComics,
        readCount: read,
        ownedCount: owned,
        unreadCount: unread,
        wishlistCount: wishlist,
        completionPct,
      });
    });

    return sortedGroups;
  }, [comics, selectedEvent]);

  // Sliced events for progressive loading in "All Crossover Events" view
  const visibleGroupedEvents = useMemo(() => {
    return groupedEvents.slice(0, visibleEventsCount);
  }, [groupedEvents, visibleEventsCount]);

  // Sliced comics for progressive loading in single event view
  const visibleEventComics = useMemo(() => {
    return filteredEventComics.slice(0, visibleEventComicsCount);
  }, [filteredEventComics, visibleEventComicsCount]);

  // Reset event pagination counters when active tab or selected event changes
  useEffect(() => {
    setVisibleEventsCount(CHUNK_SIZE_EVENTS);
    setVisibleEventComicsCount(CHUNK_SIZE_EVENT_COMICS);
  }, [selectedEvent, activeStatsTab]);

  // Progressive infinite scroll observer for All Crossover Events view
  useEffect(() => {
    if (activeStatsTab !== 'events' || selectedEvent !== 'all') return;
    if (visibleEventsCount >= groupedEvents.length) return;

    const sentinel = eventsSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleEventsCount((prev) => Math.min(prev + CHUNK_SIZE_EVENTS, groupedEvents.length));
        }
      },
      { rootMargin: '300px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [activeStatsTab, selectedEvent, visibleEventsCount, groupedEvents.length]);

  // Progressive infinite scroll observer for Single Event comic cards view
  useEffect(() => {
    if (activeStatsTab !== 'events' || selectedEvent === 'all') return;
    if (visibleEventComicsCount >= filteredEventComics.length) return;

    const sentinel = eventComicsSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleEventComicsCount((prev) => Math.min(prev + CHUNK_SIZE_EVENT_COMICS, filteredEventComics.length));
        }
      },
      { rootMargin: '300px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [activeStatsTab, selectedEvent, visibleEventComicsCount, filteredEventComics.length]);

  // Event Stats Breakdown
  const eventStats = useMemo(() => {
    const total = filteredEventComics.length;
    const read = filteredEventComics.filter((c) => c.readingStatus === 'Read').length;
    const reading = filteredEventComics.filter((c) => c.readingStatus === 'Reading').length;
    const unread = filteredEventComics.filter((c) => c.readingStatus === 'Unread').length;
    const wishlist = filteredEventComics.filter((c) => c.readingStatus === 'Wishlist').length;
    const owned = total - wishlist;
    const completionRate = owned > 0 ? Math.round((read / owned) * 100) : 0;
    const totalValue = filteredEventComics.reduce((sum, c) => sum + (c.estimatedValue || 0), 0);

    return { total, owned, read, reading, unread, wishlist, completionRate, totalValue };
  }, [filteredEventComics]);

  // Event Status Recharts Data
  const eventPieData = useMemo(() => {
    return [
      { name: 'Read', value: eventStats.read, color: '#10B981' },
      { name: 'Reading', value: eventStats.reading, color: '#F59E0B' },
      { name: 'Unread', value: eventStats.unread, color: '#6366F1' },
      { name: 'Wishlist', value: eventStats.wishlist, color: '#F43F5E' },
    ].filter((item) => item.value > 0);
  }, [eventStats]);

  // Event Comparison Bar Chart across all events
  const allEventsComparisonData = useMemo(() => {
    const map: Record<string, { name: string; owned: number; read: number; wishlist: number }> = {};
    
    // Group by event name (skip comics without a crossover event)
    comics.forEach((c) => {
      const evt = c.event && c.event.trim();
      if (!evt) return;
      if (!map[evt]) {
        map[evt] = { name: evt, owned: 0, read: 0, wishlist: 0 };
      }
      if (c.readingStatus === 'Wishlist') {
        map[evt].wishlist += 1;
      } else {
        map[evt].owned += 1;
        if (c.readingStatus === 'Read') {
          map[evt].read += 1;
        }
      }
    });

    return Object.values(map)
      .filter((e) => e.owned > 0 || e.wishlist > 0)
      .sort((a, b) => b.owned - a.owned);
  }, [comics]);

  // -------------------------------------------------------------
  // 2. COMIC SERIES / TITLE COLLECTION GRAPH & DATA
  // -------------------------------------------------------------
  const seriesSummary = useMemo(() => {
    const completionMap = computeSeriesCompletionMap(comics, seriesTotals);
    const list = Array.from(completionMap.values()).map((entry) => ({
      ...entry,
      totalIssues: entry.effectiveTotalIssues,
    }));

    if (seriesSortBy === 'completion') {
      list.sort((a, b) => {
        const diff = seriesSortDirection === 'desc'
          ? b.collectionPct - a.collectionPct
          : a.collectionPct - b.collectionPct;
        if (diff !== 0) return diff;
        return (a.seriesName || '').localeCompare(b.seriesName || '');
      });
    } else if (seriesSortBy === 'alphabetical') {
      list.sort((a, b) => {
        return seriesSortDirection === 'asc'
          ? (a.seriesName || '').localeCompare(b.seriesName || '')
          : (b.seriesName || '').localeCompare(a.seriesName || '');
      });
    }

    return list;
  }, [comics, seriesTotals, seriesSortBy, seriesSortDirection]);

  // Filtered series list based on run filter and search
  const filteredSeries = useMemo(() => {
    let result = seriesSummary;
    if (seriesRunFilter === 'in_progress_all') {
      result = result.filter((s) => !s.isRunComplete && s.collectionPct < 100 && s.remainingIssues > 0);
    } else if (seriesRunFilter === 'complete') {
      result = result.filter((s) => s.isRunComplete || s.collectionPct === 100);
    } else if (seriesRunFilter === 'near') {
      result = result.filter((s) => !s.isRunComplete && s.collectionPct >= 75 && s.collectionPct < 100);
    } else if (seriesRunFilter === 'under_75') {
      result = result.filter((s) => !s.isRunComplete && s.collectionPct < 75);
    }
    if (seriesSearchQuery.trim()) {
      const q = seriesSearchQuery.toLowerCase();
      result = result.filter((s) =>
        (s.seriesName || '').toLowerCase().includes(q) ||
        (s.title || '').toLowerCase().includes(q) ||
        (s.publisher || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [seriesSummary, seriesRunFilter, seriesSearchQuery]);

  // Aggregate Series Overview Metrics
  const seriesOverviewStats = useMemo(() => {
    const totalRuns = seriesSummary.length;
    const inProgressRuns = seriesSummary.filter((s) => !s.isRunComplete && s.collectionPct < 100 && s.remainingIssues > 0).length;
    const completedRuns = seriesSummary.filter((s) => s.isRunComplete || s.collectionPct === 100).length;
    const nearCompleteRuns = seriesSummary.filter((s) => !s.isRunComplete && s.collectionPct >= 75 && s.collectionPct < 100).length;
    const under75Runs = seriesSummary.filter((s) => !s.isRunComplete && s.collectionPct < 75).length;
    const totalPublishedIssues = seriesSummary.reduce((acc, s) => acc + s.totalIssues, 0);
    const totalOwnedInSeries = seriesSummary.reduce((acc, s) => acc + s.ownedCount, 0);
    const overallRunCollectionPct = totalPublishedIssues > 0 ? Math.round((totalOwnedInSeries / totalPublishedIssues) * 100) : 0;
    return {
      totalRuns,
      inProgressRuns,
      completedRuns,
      nearCompleteRuns,
      under75Runs,
      totalPublishedIssues,
      totalOwnedInSeries,
      overallRunCollectionPct,
    };
  }, [seriesSummary]);

  // Top 10 Series for Bar Chart (Showing Owned vs Total Published Issues)
  const topSeriesChartData = useMemo(() => {
    let source = seriesSummary;
    if (seriesSortBy === 'completion') {
      source = source.filter((s) => !s.isRunComplete && s.collectionPct < 100 && s.remainingIssues > 0);
    }
    return source.slice(0, 10).map((s) => ({
      name: (s.seriesName || '').length > 20 ? `${(s.seriesName || '').slice(0, 18)}...` : (s.seriesName || ''),
      fullName: s.seriesName || '',
      Owned: s.ownedCount,
      TotalIssues: s.totalIssues,
      Remaining: s.remainingIssues,
      Read: s.readCount,
      Wishlist: s.wishlistCount,
      Collection: `${s.collectionPct}%`,
    }));
  }, [seriesSummary, seriesSortBy]);

  // -------------------------------------------------------------
  // 3. 100% COMPLETION ACHIEVEMENTS & BADGES
  // -------------------------------------------------------------
  const completedSeriesBadges = useMemo(() => {
    const BADGE_THEMES = {
      Platinum: {
        border: 'border-cyan-300 dark:border-cyan-700/80',
        ribbon: 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-xs',
        badgeBg: 'bg-cyan-50/40 dark:bg-cyan-950/20',
        iconBg: 'bg-gradient-to-br from-cyan-100 via-cyan-200 to-blue-300 dark:from-cyan-950/80 dark:via-cyan-900/60 dark:to-blue-800/80 border-cyan-300 dark:border-cyan-700 text-cyan-950 dark:text-cyan-200',
        statBg: 'bg-cyan-50/70 dark:bg-cyan-950/40 border-cyan-200/80 dark:border-cyan-800/60',
        tierBadge: 'bg-cyan-100 dark:bg-cyan-950/70 text-cyan-900 dark:text-cyan-200 border border-cyan-200 dark:border-cyan-800',
        metalEmoji: '🛡️',
      },
      Gold: {
        border: 'border-amber-300 dark:border-amber-700/80',
        ribbon: 'bg-gradient-to-r from-amber-500 to-amber-700 text-white shadow-xs',
        badgeBg: 'bg-amber-50/40 dark:bg-amber-950/20',
        iconBg: 'bg-gradient-to-br from-amber-100 via-amber-200 to-amber-400 dark:from-amber-950/80 dark:via-amber-900/60 dark:to-amber-700/80 border-amber-300 dark:border-amber-700 text-amber-950 dark:text-amber-200',
        statBg: 'bg-amber-50/70 dark:bg-amber-950/40 border-amber-200/80 dark:border-amber-800/60',
        tierBadge: 'bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-800',
        metalEmoji: '🥇',
      },
      Silver: {
        border: 'border-slate-300 dark:border-slate-700',
        ribbon: 'bg-gradient-to-r from-slate-500 to-slate-700 text-white shadow-xs',
        badgeBg: 'bg-slate-50/60 dark:bg-slate-900/40',
        iconBg: 'bg-gradient-to-br from-slate-100 via-slate-200 to-slate-300 dark:from-slate-800 dark:via-slate-700 dark:to-slate-600 border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-200',
        statBg: 'bg-slate-100/70 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700',
        tierBadge: 'bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700',
        metalEmoji: '🥈',
      },
      Diamond: {
        border: 'border-purple-300 dark:border-purple-700/80',
        ribbon: 'bg-gradient-to-r from-purple-600 via-purple-700 to-indigo-800 text-white shadow-xs',
        badgeBg: 'bg-purple-50/40 dark:bg-purple-950/20',
        iconBg: 'bg-gradient-to-br from-purple-100 via-purple-200 to-indigo-300 dark:from-purple-950/80 dark:via-purple-900/60 dark:to-indigo-800/80 border-purple-300 dark:border-purple-700 text-purple-950 dark:text-purple-200',
        statBg: 'bg-purple-50/70 dark:bg-purple-950/40 border-purple-200/80 dark:border-purple-800/60',
        tierBadge: 'bg-purple-100 dark:bg-purple-950/70 text-purple-900 dark:text-purple-200 border border-purple-200 dark:border-purple-800',
        metalEmoji: '💎',
      },
    };

    // 1. Series Collection Run Completed (100% Collected)
    const runCompleteBadges = seriesSummary
      .filter((s) => s.isRunComplete || (s.totalIssues > 0 && s.ownedCount >= s.totalIssues))
      .map((s) => {
        const tier: 'Platinum' | 'Gold' | 'Silver' =
          s.totalIssues >= 25 ? 'Platinum' : s.totalIssues >= 5 ? 'Gold' : 'Silver';
        const isGrandMastery = Boolean(s.is100PercentRead && s.readCount > 0);

        return {
          id: `run-${s.seriesName}`,
          name: s.seriesName,
          category: 'collection' as const,
          categoryLabel: 'Series Collection',
          type: 'Full Run Complete' as const,
          publisher: s.publisher,
          issueCount: s.ownedCount,
          totalPublished: s.totalIssues,
          readCount: s.readCount,
          totalValue: s.totalValue,
          metalTier: tier,
          badgeTitle: `${tier} Series Run`,
          badgeTier: `${tier} Series Run`, // backwards compatibility
          description:
            s.totalIssues >= 25
              ? '100% full run collected (25+ issues)'
              : s.totalIssues >= 5
              ? '100% full run collected (5–24 issues)'
              : '100% full run collected (1–4 issues)',
          isGrandMastery,
          icon: Crown,
          theme: BADGE_THEMES[tier],
        };
      });

    // 2. Reading Mastery (100% of owned issues read)
    const seriesReadBadges = seriesSummary
      .filter((s) => s.ownedCount > 0 && s.is100PercentRead)
      .map((s) => {
        const tier: 'Platinum' | 'Gold' | 'Silver' =
          s.readCount >= 25 ? 'Platinum' : s.readCount >= 5 ? 'Gold' : 'Silver';
        const isGrandMastery = Boolean(s.isRunComplete || (s.totalIssues > 0 && s.ownedCount >= s.totalIssues));

        return {
          id: `series-read-${s.seriesName}`,
          name: s.seriesName,
          category: 'reading' as const,
          categoryLabel: 'Reading Mastery',
          type: 'Series (100% Read)' as const,
          publisher: s.publisher,
          issueCount: s.ownedCount,
          totalPublished: s.totalIssues,
          readCount: s.readCount,
          totalValue: s.totalValue,
          metalTier: tier,
          badgeTitle: `${tier} Reading Mastery`,
          badgeTier: `${tier} Reading Mastery`, // backwards compatibility
          description:
            s.readCount >= 25
              ? '100% of owned issues read (25+ issues)'
              : s.readCount >= 5
              ? '100% of owned issues read (5–24 issues)'
              : '100% of owned issues read (1–4 issues)',
          isGrandMastery,
          icon: BookOpen,
          theme: BADGE_THEMES[tier],
        };
      });

    // 3. Crossover Event Champions (100% Owned & 100% Read)
    const eventMap: Record<string, { name: string; owned: number; read: number; wishlist: number; value: number }> = {};
    comics.forEach((c) => {
      if (c.event && c.event.trim()) {
        const evt = c.event.trim();
        if (!eventMap[evt]) eventMap[evt] = { name: evt, owned: 0, read: 0, wishlist: 0, value: 0 };
        if (c.readingStatus === 'Wishlist') {
          eventMap[evt].wishlist += 1;
        } else {
          eventMap[evt].owned += 1;
          eventMap[evt].value += (c.estimatedValue || 0);
          if (c.readingStatus === 'Read') eventMap[evt].read += 1;
        }
      }
    });

    const eventBadges = Object.values(eventMap)
      .filter((e) => e.owned > 0 && e.wishlist === 0 && e.read === e.owned)
      .map((e) => ({
        id: `event-${e.name}`,
        name: e.name,
        category: 'events' as const,
        categoryLabel: 'Crossover Event',
        type: 'Crossover Event' as const,
        publisher: 'Crossover',
        issueCount: e.owned,
        totalPublished: e.owned,
        readCount: e.read,
        totalValue: e.value,
        metalTier: 'Diamond' as const,
        badgeTitle: 'Diamond Event Champion',
        badgeTier: 'Diamond Event Champion', // backwards compatibility
        description: 'Crossover event fully owned & 100% read',
        isGrandMastery: true,
        icon: Sparkles,
        theme: BADGE_THEMES.Diamond,
      }));

    // Sort helper: Highest tier first (Platinum -> Gold -> Silver), then by issue count, then name
    const TIER_RANK: Record<string, number> = {
      Diamond: 4,
      Platinum: 3,
      Gold: 2,
      Silver: 1,
    };

    const sortBadgesByTier = (a: { metalTier: string; issueCount: number; name: string }, b: { metalTier: string; issueCount: number; name: string }) => {
      const rankDiff = (TIER_RANK[b.metalTier] || 0) - (TIER_RANK[a.metalTier] || 0);
      if (rankDiff !== 0) return rankDiff;
      if (b.issueCount !== a.issueCount) return b.issueCount - a.issueCount;
      return (a.name || '').localeCompare(b.name || '');
    };

    runCompleteBadges.sort(sortBadgesByTier);
    seriesReadBadges.sort(sortBadgesByTier);
    eventBadges.sort(sortBadgesByTier);

    return [...runCompleteBadges, ...seriesReadBadges, ...eventBadges];
  }, [seriesSummary, comics]);

  // Categorized badge helpers
  const collectionBadges = useMemo(
    () => completedSeriesBadges.filter((b) => b.category === 'collection'),
    [completedSeriesBadges]
  );
  const readingBadges = useMemo(
    () => completedSeriesBadges.filter((b) => b.category === 'reading'),
    [completedSeriesBadges]
  );
  const eventBadges = useMemo(
    () => completedSeriesBadges.filter((b) => b.category === 'events'),
    [completedSeriesBadges]
  );
  const grandMasterySeriesCount = useMemo(
    () => seriesSummary.filter((s) => (s.isRunComplete || (s.totalIssues > 0 && s.ownedCount >= s.totalIssues)) && s.is100PercentRead && s.ownedCount > 0).length,
    [seriesSummary]
  );

  // In-Progress Series Milestones (50% - 99% collected)
  const inProgressMilestones = useMemo(() => {
    return seriesSummary
      .filter((s) => s.ownedCount > 0 && s.collectionPct >= 40 && s.collectionPct < 100)
      .sort((a, b) => b.collectionPct - a.collectionPct);
  }, [seriesSummary]);

  // -------------------------------------------------------------
  // CREATORS & CONTRIBUTOR ROLES ANALYTICS
  // -------------------------------------------------------------
  const {
    creatorList,
    roleDistributionData,
    artistsWhoWriteList,
    pencillersWhoWroteList,
    totalCreditsCount,
    allUniqueRoles,
    characterRankingList,
  } = useMemo(() => {
    interface CreatorIssueItem {
      id: string | number;
      title: string;
      issueNumber: string;
      seriesName?: string;
      coverImage?: string;
      roles: string[];
      readingStatus: string;
      comic: ComicBook;
    }

    interface CreatorAcc {
      name: string;
      totalIssues: number;
      roles: Record<string, number>;
      series: Record<string, number>;
      issues: CreatorIssueItem[];
    }

    interface CharacterIssueItem {
      id: string | number;
      title: string;
      issueNumber: string;
      seriesName?: string;
      coverImage?: string;
      appearanceTypes: string[];
      readingStatus: string;
      comic: ComicBook;
    }

    interface CharacterAcc {
      name: string;
      total: number;
      main: number;
      supporting: number;
      cameo: number;
      other: number;
      series: Record<string, number>;
      issues: CharacterIssueItem[];
    }

    const creatorMap: Record<string, CreatorAcc> = {};
    const roleCountMap: Record<string, number> = {};
    const charMap: Record<string, CharacterAcc> = {};
    let totalCredits = 0;

    comics.forEach((comic) => {
      // Gather contributors for this comic
      const contributors: Array<{ name: string; role: string }> = [];

      if (comic.creatorContributions && comic.creatorContributions.length > 0) {
        comic.creatorContributions.forEach((cc) => {
          if (cc.creatorName && cc.creatorName.trim()) {
            contributors.push({
              name: cc.creatorName.trim(),
              role: (cc.creatorType || cc.roleName || 'Contributor').trim()
            });
          }
        });
      } else {
        // Fallback to comic.writer and comic.artist
        if (comic.writer && comic.writer.trim()) {
          comic.writer.split(/[,;&]/).forEach((w) => {
            const trimmed = w.trim();
            if (trimmed) contributors.push({ name: trimmed, role: 'Writer' });
          });
        }
        if (comic.artist && comic.artist.trim()) {
          comic.artist.split(/[,;&]/).forEach((a) => {
            const trimmed = a.trim();
            if (trimmed) contributors.push({ name: trimmed, role: 'Artist' });
          });
        }
      }

      // Group unique roles per creator on this comic
      const comicCreatorRoles: Record<string, string[]> = {};
      contributors.forEach(({ name, role }) => {
        totalCredits++;
        roleCountMap[role] = (roleCountMap[role] || 0) + 1;
        if (!comicCreatorRoles[name]) {
          comicCreatorRoles[name] = [];
        }
        if (!comicCreatorRoles[name].includes(role)) {
          comicCreatorRoles[name].push(role);
        }
      });

      // Update creatorMap
      Object.entries(comicCreatorRoles).forEach(([creatorName, roles]) => {
        if (!creatorMap[creatorName]) {
          creatorMap[creatorName] = {
            name: creatorName,
            totalIssues: 0,
            roles: {},
            series: {},
            issues: [],
          };
        }

        const cr = creatorMap[creatorName];
        cr.totalIssues++;
        roles.forEach((r) => {
          cr.roles[r] = (cr.roles[r] || 0) + 1;
        });

        const seriesKey = comic.seriesName || comic.title || 'Untitled';
        cr.series[seriesKey] = (cr.series[seriesKey] || 0) + 1;

        cr.issues.push({
          id: comic.id,
          title: comic.title,
          issueNumber: comic.issueNumber,
          seriesName: comic.seriesName,
          coverImage: comic.coverImage,
          roles,
          readingStatus: comic.readingStatus,
          comic,
        });
      });

      // Character appearances
      if (comic.characterAppearances && comic.characterAppearances.length > 0) {
        const comicCharTypes: Record<string, string[]> = {};
        comic.characterAppearances.forEach((ca) => {
          if (ca.characterName && ca.characterName.trim()) {
            const cName = ca.characterName.trim();
            const type = (ca.appearanceType || 'Main').trim();
            if (!comicCharTypes[cName]) {
              comicCharTypes[cName] = [];
            }
            if (!comicCharTypes[cName].includes(type)) {
              comicCharTypes[cName].push(type);
            }
          }
        });

        Object.entries(comicCharTypes).forEach(([cName, types]) => {
          if (!charMap[cName]) {
            charMap[cName] = {
              name: cName,
              total: 0,
              main: 0,
              supporting: 0,
              cameo: 0,
              other: 0,
              series: {},
              issues: [],
            };
          }
          const chr = charMap[cName];
          chr.total++;

          types.forEach((type) => {
            const t = type.toLowerCase();
            if (t.includes('main')) chr.main++;
            else if (t.includes('support')) chr.supporting++;
            else if (t.includes('cameo')) chr.cameo++;
            else chr.other++;
          });

          const seriesKey = comic.seriesName || comic.title || 'Untitled';
          chr.series[seriesKey] = (chr.series[seriesKey] || 0) + 1;

          chr.issues.push({
            id: comic.id,
            title: comic.title,
            issueNumber: comic.issueNumber,
            seriesName: comic.seriesName,
            coverImage: comic.coverImage,
            appearanceTypes: types,
            readingStatus: comic.readingStatus,
            comic,
          });
        });
      }
    });

    // Build finalized creator objects with 4 role categories & Artists Who Write detection
    const creatorList = Object.values(creatorMap).map((cr) => {
      const roleKeys = Object.keys(cr.roles);
      const categoryCredits: Record<ContributorCategory, number> = {
        Artist: 0,
        Writer: 0,
        Editor: 0,
        Other: 0,
      };

      Object.entries(cr.roles).forEach(([role, count]) => {
        const cat = getRoleCategory(role);
        categoryCredits[cat] += count;
      });

      const hasArtistCategory = categoryCredits.Artist > 0;
      const hasWriterCategory = categoryCredits.Writer > 0;
      const isArtistWhoWrites = hasArtistCategory && hasWriterCategory;

      const dualRoleIssuesCount = cr.issues.filter((iss) => {
        const hasArt = iss.roles.some(isArtRole);
        const hasWrit = iss.roles.some(isWritingRole);
        return hasArt && hasWrit;
      }).length;

      const topSeries = Object.entries(cr.series)
        .map(([series, count]) => ({ series, count }))
        .sort((a, b) => b.count - a.count);

      // Sort contributed issues chronologically by publication release date
      const sortedIssues = [...cr.issues].sort((a, b) => compareComicReleaseDates(a.comic, b.comic));

      return {
        ...cr,
        roleKeys,
        categoryCredits,
        hasArtistCategory,
        hasWriterCategory,
        isArtistWhoWrites,
        isPencillerWhoWrote: isArtistWhoWrites, // backwards compatibility
        dualRoleIssuesCount,
        artIssuesCount: categoryCredits.Artist,
        writingIssuesCount: categoryCredits.Writer,
        editorIssuesCount: categoryCredits.Editor,
        otherIssuesCount: categoryCredits.Other,
        topSeries,
        issues: sortedIssues,
      };
    }).sort((a, b) => b.totalIssues - a.totalIssues);

    const artistsWhoWriteList = creatorList.filter((c) => c.isArtistWhoWrites);
    const pencillersWhoWroteList = artistsWhoWriteList;

    const roleDistributionData = Object.entries(roleCountMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const allUniqueRoles = Object.keys(roleCountMap).sort((a, b) => a.localeCompare(b));

    const characterRankingList = Object.values(charMap).map((chr) => {
      const sortedIssues = [...chr.issues].sort((a, b) => compareComicReleaseDates(a.comic, b.comic));
      const topSeries = Object.entries(chr.series)
        .map(([series, count]) => ({ series, count }))
        .sort((a, b) => b.count - a.count);
      return {
        ...chr,
        issues: sortedIssues,
        topSeries,
      };
    }).sort((a, b) => b.total - a.total);

    return {
      creatorList,
      roleDistributionData,
      artistsWhoWriteList,
      pencillersWhoWroteList,
      totalCreditsCount: totalCredits,
      allUniqueRoles,
      characterRankingList,
    };
  }, [comics]);

  // Filtered Creators based on search query, 4-role-category filter, and Artists Who Write toggle
  const filteredCreators = useMemo(() => {
    return creatorList.filter((cr) => {
      if (creatorSearchQuery.trim()) {
        const query = creatorSearchQuery.toLowerCase().trim();
        const matchesName = (cr.name || '').toLowerCase().includes(query);
        const matchesSeries = cr.topSeries.some((s) => (s.series || '').toLowerCase().includes(query));
        if (!matchesName && !matchesSeries) return false;
      }

      if (creatorRoleFilter !== 'all') {
        const cat = creatorRoleFilter as ContributorCategory;
        if ((cr.categoryCredits[cat] || 0) <= 0) return false;
      }

      if (onlyArtistsWhoWrite && !cr.isArtistWhoWrites) {
        return false;
      }

      return true;
    });
  }, [creatorList, creatorSearchQuery, creatorRoleFilter, onlyArtistsWhoWrite]);

  // Top Creators Chart Data (replaces Top Characters on the Creators screen)
  const topCreatorsChartData = useMemo(() => {
    let list = [...creatorList];
    if (topCreatorsCategoryFilter !== 'all') {
      const cat = topCreatorsCategoryFilter as ContributorCategory;
      list = list
        .filter((cr) => (cr.categoryCredits[cat] || 0) > 0)
        .sort((a, b) => (b.categoryCredits[cat] || 0) - (a.categoryCredits[cat] || 0));
      return list.slice(0, 10).map((cr) => ({
        name: cr.name.length > 18 ? `${cr.name.slice(0, 16)}...` : cr.name,
        fullName: cr.name,
        Credits: cr.categoryCredits[cat] || 0,
        TotalIssues: cr.totalIssues,
        category: cat,
      }));
    }

    list.sort((a, b) => b.totalIssues - a.totalIssues);
    return list.slice(0, 10).map((cr) => ({
      name: cr.name.length > 18 ? `${cr.name.slice(0, 16)}...` : cr.name,
      fullName: cr.name,
      Credits: cr.totalIssues,
      TotalIssues: cr.totalIssues,
      category: 'All',
    }));
  }, [creatorList, topCreatorsCategoryFilter]);

  // Filtered Characters based on search query and appearance type filter
  const filteredCharacters = useMemo(() => {
    return characterRankingList.filter((chr) => {
      if (characterSearchQuery.trim()) {
        const q = characterSearchQuery.toLowerCase().trim();
        const matchesName = (chr.name || '').toLowerCase().includes(q);
        const matchesSeries = chr.topSeries.some((s) => (s.series || '').toLowerCase().includes(q));
        if (!matchesName && !matchesSeries) return false;
      }

      if (characterRoleFilter === 'main' && chr.main <= 0) return false;
      if (characterRoleFilter === 'supporting' && chr.supporting <= 0) return false;
      if (characterRoleFilter === 'cameo' && chr.cameo <= 0) return false;

      return true;
    });
  }, [characterRankingList, characterSearchQuery, characterRoleFilter]);

  // -------------------------------------------------------------
  // GENERAL STATS CHARTS (Box Capacity, Publisher, Genre, Format)
  // -------------------------------------------------------------
  const boxCapacityData = useMemo(() => {
    return sortBoxes(boxes).map((box) => {
      const boxComics = inCollectionComics.filter((c) => c.currentBoxId === box.id);
      const usedThickness = boxComics.reduce((sum, c) => sum + (c.sizeThickness || 1.0), 0);
      return {
        boxName: `Box ${box.id}`,
        usedUnits: Number(usedThickness.toFixed(1)),
        maxCapacity: Math.min(150, box.maxCapacity),
        itemCount: boxComics.length,
      };
    });
  }, [boxes, inCollectionComics]);

  const publisherData = useMemo(() => {
    const map: Record<string, number> = {};
    comics.forEach((c) => {
      const pub = c.publisher || 'Independent';
      map[pub] = (map[pub] || 0) + 1;
    });
    return Object.keys(map).map((pub) => ({ name: pub, count: map[pub] }));
  }, [comics]);

  // Per-Box Contents & Breakdown Data
  const boxBreakdowns = useMemo(() => {
    const sorted = sortBoxes(boxes);
    const unallocatedComics = inCollectionComics.filter((c) => c.currentBoxId === 0);
    const boxList = [...sorted];
    if (unallocatedComics.length > 0) {
      boxList.push({ id: 0, name: 'Box 0 (Unallocated)', maxCapacity: 150, location: 'Unassigned', colorTag: '#94a3b8' });
    }

    return boxList.map((box) => {
      const boxComics = inCollectionComics.filter((c) => c.currentBoxId === box.id);
      const usedThickness = boxComics.reduce((sum, c) => sum + (c.sizeThickness || 1.0), 0);
      const totalVal = boxComics.reduce((sum, c) => sum + (c.estimatedValue || 0), 0);

      // Publisher breakdown in this box
      const pubMap: Record<string, number> = {};
      boxComics.forEach((c) => {
        const pub = c.publisher || 'Independent';
        pubMap[pub] = (pubMap[pub] || 0) + 1;
      });
      const publisherData = Object.keys(pubMap)
        .map((pub) => ({ name: pub, count: pubMap[pub] }))
        .sort((a, b) => b.count - a.count);

      // Top Series / Titles in this box
      const seriesMap: Record<string, number> = {};
      boxComics.forEach((c) => {
        const title = c.title || 'Untitled';
        seriesMap[title] = (seriesMap[title] || 0) + 1;
      });
      const seriesData = Object.keys(seriesMap)
        .map((title) => ({ name: title, count: seriesMap[title] }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);

      // Reading status in this box
      const readCount = boxComics.filter((c) => c.readingStatus === 'Read').length;
      const unreadCount = boxComics.filter((c) => c.readingStatus === 'Unread').length;
      const inProgressCount = boxComics.filter((c) => c.readingStatus === 'Reading').length;

      return {
        boxId: box.id,
        boxName: box.name || (box.id === 0 ? 'Box 0 (Unallocated)' : `Box #${box.id}`),
        maxCapacity: box.maxCapacity || 150,
        boxComics,
        itemCount: boxComics.length,
        usedUnits: Number(usedThickness.toFixed(1)),
        percentFull: Math.min(100, Math.round((usedThickness / (box.maxCapacity || 150)) * 100)),
        totalValue: totalVal,
        publisherData,
        seriesData,
        readCount,
        unreadCount,
        inProgressCount,
      };
    });
  }, [boxes, inCollectionComics]);

  const allBoxesSeriesData = useMemo(() => {
    const seriesMap: Record<string, number> = {};
    inCollectionComics.forEach((c) => {
      const title = c.title || 'Untitled';
      seriesMap[title] = (seriesMap[title] || 0) + 1;
    });
    return Object.keys(seriesMap)
      .map((title) => ({ name: title, count: seriesMap[title] }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [inCollectionComics]);

  const boxReadingStatusComparison = useMemo(() => {
    return boxBreakdowns
      .filter((b) => b.boxId !== 0)
      .map((b) => ({
        boxName: `Box #${b.boxId}`,
        Read: b.readCount,
        Unread: b.unreadCount,
        'In Progress': b.inProgressCount,
      }));
  }, [boxBreakdowns]);

  return (
    <div className="space-y-6">
      
      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-800 dark:text-slate-200 shrink-0">
            <BookOpen className="w-5.5 h-5.5" />
          </div>
          <div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Total Collection</p>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">{totalComics} Items</h3>
            <p className="text-[10px] text-slate-600 dark:text-slate-300 font-semibold mt-0.5">
              {totalThickness.toFixed(1)} Units
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-700 dark:text-emerald-400 shrink-0">
            <CheckCircle2 className="w-5.5 h-5.5" />
          </div>
          <div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Read Progress</p>
            <h3 className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{readPercentage}% Read</h3>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
              {readCount} read / {unreadCount} unread
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-center justify-center text-amber-700 dark:text-amber-400 shrink-0">
            <DollarSign className="w-5.5 h-5.5" />
          </div>
          <div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Est. Collection Value</p>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">${totalValue.toFixed(2)}</h3>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Keys & hardcovers</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 flex items-center justify-center text-purple-700 dark:text-purple-400 shrink-0">
            <Trophy className="w-5.5 h-5.5" />
          </div>
          <div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">100% Achievements</p>
            <h3 className="text-lg font-bold text-purple-900 dark:text-purple-300">{completedSeriesBadges.length} Badges</h3>
            <p className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold mt-0.5">Completed Series</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex items-center gap-3.5 col-span-2 lg:col-span-1">
          <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-800 dark:text-slate-200 shrink-0">
            <Boxes className="w-5.5 h-5.5" />
          </div>
          <div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Storage Boxes</p>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">{boxes.length} Short Boxes</h3>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Capacity tracking</p>
          </div>
        </div>

      </div>

      {/* Analytics Sub-Tab Bar */}
      <div className="bg-slate-100 dark:bg-slate-900 p-1.5 rounded-2xl flex items-center gap-1.5 overflow-x-auto scrollbar-none sm:flex-wrap border border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setActiveStatsTab('events')}
          className={`flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 whitespace-nowrap ${
            activeStatsTab === 'events'
              ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-sm'
              : 'text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
          <span>Event Status</span>
          {allEventsList.length > 0 && (
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${activeStatsTab === 'events' ? 'bg-slate-700 dark:bg-indigo-800 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}>
              {allEventsList.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveStatsTab('series')}
          className={`flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 whitespace-nowrap ${
            activeStatsTab === 'series'
              ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-sm'
              : 'text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <BarChart3 className="w-4 h-4 text-indigo-400 shrink-0" />
          <span>Titles & Series</span>
          <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${activeStatsTab === 'series' ? 'bg-slate-700 dark:bg-indigo-800 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}>
            {seriesSummary.length}
          </span>
        </button>

        <button
          onClick={() => setActiveStatsTab('creators')}
          className={`flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 whitespace-nowrap ${
            activeStatsTab === 'creators'
              ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-sm'
              : 'text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <Palette className="w-4 h-4 text-violet-400 shrink-0" />
          <span>Creators & Roles</span>
          {creatorList.length > 0 && (
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${activeStatsTab === 'creators' ? 'bg-slate-700 dark:bg-indigo-800 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}>
              {creatorList.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveStatsTab('characters')}
          className={`flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 whitespace-nowrap ${
            activeStatsTab === 'characters'
              ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-sm'
              : 'text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <Users className="w-4 h-4 text-pink-400 shrink-0" />
          <span>Character Appearances</span>
          {characterRankingList.length > 0 && (
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${activeStatsTab === 'characters' ? 'bg-slate-700 dark:bg-indigo-800 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}>
              {characterRankingList.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveStatsTab('achievements')}
          className={`flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 whitespace-nowrap ${
            activeStatsTab === 'achievements'
              ? 'bg-gradient-to-r from-amber-600 to-purple-700 text-white shadow-sm'
              : 'text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <Trophy className="w-4 h-4 text-amber-300 shrink-0" />
          <span>Achievements</span>
          {completedSeriesBadges.length > 0 && (
            <span className="text-[10px] px-2 py-0.2 bg-amber-400 text-amber-950 font-black rounded-full shadow-xs">
              {completedSeriesBadges.length} 🏆
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveStatsTab('general')}
          className={`flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 whitespace-nowrap ${
            activeStatsTab === 'general'
              ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-sm'
              : 'text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <Boxes className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Box Capacity</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1: EVENT COLLECTION STATUS GRAPH & DROPDOWN */}
      {/* ========================================================================= */}
      {activeStatsTab === 'events' && (
        <div className="space-y-6">
          
          {/* Top Event Selection Control Box */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300">
                    <Sparkles className="w-4 h-4" />
                  </span>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Event Collection Status & Progress</h3>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Analyze reading completion rates and issue ownership across major crossover events and storylines.
                </p>
              </div>

              {/* Event Dropdown Selector */}
              <div className="flex items-center gap-2 shrink-0">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                  Select Event:
                </label>
                <select
                  value={selectedEvent}
                  onChange={(e) => setSelectedEvent(e.target.value)}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-bold text-xs rounded-xl px-3.5 py-2 focus:outline-none focus:ring-2 focus:ring-slate-800 dark:focus:ring-indigo-500 shadow-xs transition-all min-w-[200px]"
                >
                  <option value="all">🌐 All Crossover Events ({allEventsComparisonData.length})</option>
                  <optgroup label={allEventsList.length > 0 ? "Events in Your Collection" : "Suggested Events"}>
                    {defaultEventOptions.map((evt) => (
                      <option key={evt} value={evt}>
                        ⚡ {evt}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
            </div>

            {/* Event Metrics Headline Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-xl p-3">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">Total Event Issues</span>
                <span className="text-lg font-black text-slate-900 dark:text-slate-100">{eventStats.total} Issues</span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">{eventStats.owned} in collection</span>
              </div>

              <div className="bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/60 rounded-xl p-3">
                <span className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 block">Completion Rate</span>
                <span className="text-lg font-black text-emerald-700 dark:text-emerald-400">{eventStats.completionRate}% Read</span>
                <div className="w-full bg-emerald-200 dark:bg-emerald-900/60 h-1.5 rounded-full mt-1.5 overflow-hidden">
                  <div className="bg-emerald-600 dark:bg-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${eventStats.completionRate}%` }}></div>
                </div>
              </div>

              <div className="bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-800/60 rounded-xl p-3">
                <span className="text-[11px] font-semibold text-blue-800 dark:text-blue-300 block">Read / Unread</span>
                <span className="text-lg font-black text-blue-900 dark:text-blue-200">{eventStats.read} Read</span>
                <span className="text-[10px] text-blue-700 dark:text-blue-400 block mt-0.5">{eventStats.unread} unread · {eventStats.reading} reading</span>
              </div>

              <div className="bg-rose-50/60 dark:bg-rose-950/30 border border-rose-200/80 dark:border-rose-800/60 rounded-xl p-3">
                <span className="text-[11px] font-semibold text-rose-800 dark:text-rose-300 block">Wishlist Wanted</span>
                <span className="text-lg font-black text-rose-900 dark:text-rose-200">{eventStats.wishlist} Wishlist</span>
                <span className="text-[10px] text-rose-700 dark:text-rose-400 block mt-0.5">${eventStats.totalValue.toFixed(2)} est value</span>
              </div>
            </div>
          </div>

          {/* Event Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Event Status Distribution Donut Chart */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
                  <PieChart className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>
                    {selectedEvent === 'all' ? 'Status Breakdown across All Events' : `Status Breakdown for "${selectedEvent}"`}
                  </span>
                </h4>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                  {eventStats.total} Total Issues
                </span>
              </div>

              {eventPieData.length > 0 ? (
                <div className="h-64 mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={eventPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={65}
                        outerRadius={90}
                        paddingAngle={5}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        {eventPieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderRadius: '8px', color: '#0f172a' }} />
                      <Legend verticalAlign="bottom" height={36} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 mt-4 flex flex-col items-center justify-center text-center p-6 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                  <Info className="w-8 h-8 text-slate-400 dark:text-slate-500 mb-2" />
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300">No comics tagged with event "{selectedEvent}"</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 max-w-xs">
                    Edit any comic in your catalog and set its "Event / Crossover" field (e.g. "{selectedEvent}") to populate this graph!
                  </p>
                </div>
              )}
            </div>

            {/* Crossover Events Comparison Bar Chart */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>Crossover Event Volume Comparison</span>
                </h4>
                <span className="text-xs text-slate-500 dark:text-slate-400">Owned vs Wishlist</span>
              </div>

              {allEventsComparisonData.length > 0 ? (
                <div className="h-64 mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={allEventsComparisonData.slice(0, 8)} margin={{ top: 10, right: 10, left: -20, bottom: 25 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.3} />
                      <XAxis dataKey="name" stroke="#64748b" fontSize={10} interval={0} angle={-25} textAnchor="end" />
                      <YAxis stroke="#64748b" fontSize={10} />
                      <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderRadius: '8px', color: '#0f172a' }} />
                      <Bar dataKey="read" name="Read" fill="#10B981" stackId="a" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="owned" name="Owned (Unread)" fill="#6366F1" stackId="a" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="wishlist" name="Wishlist" fill="#F43F5E" stackId="a" radius={[4, 4, 0, 0]} />
                      <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: '11px' }} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 mt-4 flex flex-col items-center justify-center text-center p-6 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                  <Sparkles className="w-8 h-8 text-slate-400 dark:text-slate-500 mb-2" />
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300">No Crossover Events Configured Yet</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 max-w-xs">
                    Assign event tags like "Civil War", "Secret Wars", or "Born Again" to comics to unlock event tracking!
                  </p>
                </div>
              )}
            </div>

          </div>

          {/* Filtered Event Comics Catalog List View */}
          {selectedEvent === 'all' ? (
            groupedEvents.length > 0 && (
              <div className="space-y-6">
                <div className="flex items-center justify-between px-1">
                  <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm flex items-center gap-2">
                    <Bookmark className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <span>All Crossover Events ({groupedEvents.length} Events · {filteredEventComics.length} Issues)</span>
                  </h4>
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold">
                    {eventStats.read} of {eventStats.owned} Read ({eventStats.completionRate}%)
                  </span>
                </div>

                {visibleGroupedEvents.map((group) => (
                  <div key={group.eventName} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="p-1.5 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 font-bold flex items-center justify-center">
                          ⚡
                        </span>
                        <div>
                          <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
                            <span>{group.eventName}</span>
                            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                              ({group.comics.length} {group.comics.length === 1 ? 'issue' : 'issues'})
                            </span>
                          </h4>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            {group.readCount} of {group.ownedCount} Read ({group.completionPct}%)
                            {group.wishlistCount > 0 && ` · ${group.wishlistCount} in wishlist`}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-start sm:self-auto">
                        {onStartEventChallenge && (
                          <button
                            type="button"
                            onClick={() => onStartEventChallenge(group.eventName)}
                            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-slate-950 font-bold rounded-lg text-xs shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
                            title={`Create Reading Challenge for ${group.eventName}`}
                          >
                            <Trophy className="w-3.5 h-3.5" />
                            <span>Create Reading Challenge</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pt-1">
                      {group.comics.map((comic) => (
                        <div key={comic.id} className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/70 rounded-xl p-2.5 flex items-start gap-3 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">
                          <img
                            src={getComicCoverUrl(comic.coverImage)}
                            onError={handleImageError}
                            alt={comic.title}
                            loading="lazy"
                            decoding="async"
                            referrerPolicy="no-referrer"
                            className="w-12 h-16 object-cover rounded-md border border-slate-300 dark:border-slate-700 shrink-0 shadow-xs"
                          />
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate">
                                {comic.publisher}
                              </span>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                comic.readingStatus === 'Read'
                                  ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border dark:border-emerald-800'
                                  : comic.readingStatus === 'Reading'
                                  ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border dark:border-amber-800'
                                  : comic.readingStatus === 'Wishlist'
                                  ? 'bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 border dark:border-rose-800'
                                  : 'bg-indigo-100 dark:bg-indigo-950/70 text-indigo-800 dark:text-indigo-300 border dark:border-indigo-800'
                              }`}>
                                {comic.readingStatus}
                              </span>
                            </div>
                            <h5 className="font-bold text-slate-900 dark:text-slate-100 text-xs truncate leading-snug">{comic.title}</h5>
                            <p className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Issue #{comic.issueNumber}</p>
                            <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                              📅 {formatPublicationDate(comic.publicationYear, comic.publicationMonth) || 'Undated'}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {visibleEventsCount < groupedEvents.length && (
                  <div ref={eventsSentinelRef} className="py-6 flex flex-col items-center justify-center gap-2">
                    <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold">
                      Loading more events ({visibleGroupedEvents.length} of {groupedEvents.length})...
                    </span>
                  </div>
                )}
              </div>
            )
          ) : (
            filteredEventComics.length > 0 && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="p-1.5 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 font-bold flex items-center justify-center">
                      ⚡
                    </span>
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
                        <span>Comics in "{selectedEvent}"</span>
                        <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                          ({filteredEventComics.length} {filteredEventComics.length === 1 ? 'issue' : 'issues'})
                        </span>
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {eventStats.read} of {eventStats.owned} Read ({eventStats.completionRate}%)
                        {eventStats.wishlist > 0 && ` · ${eventStats.wishlist} in wishlist`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    {onStartEventChallenge && (
                      <button
                        type="button"
                        onClick={() => onStartEventChallenge(selectedEvent)}
                        className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-slate-950 font-bold rounded-lg text-xs shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
                        title={`Create Reading Challenge for ${selectedEvent}`}
                      >
                        <Trophy className="w-3.5 h-3.5" />
                        <span>Create Reading Challenge</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pt-1">
                  {visibleEventComics.map((comic) => (
                    <div key={comic.id} className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/70 rounded-xl p-2.5 flex items-start gap-3 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">
                      <img
                        src={getComicCoverUrl(comic.coverImage)}
                        onError={handleImageError}
                        alt={comic.title}
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        className="w-12 h-16 object-cover rounded-md border border-slate-300 dark:border-slate-700 shrink-0 shadow-xs"
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate">
                            {comic.publisher}
                          </span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                            comic.readingStatus === 'Read'
                              ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border dark:border-emerald-800'
                              : comic.readingStatus === 'Reading'
                              ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border dark:border-amber-800'
                              : comic.readingStatus === 'Wishlist'
                              ? 'bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 border dark:border-rose-800'
                              : 'bg-indigo-100 dark:bg-indigo-950/70 text-indigo-800 dark:text-indigo-300 border dark:border-indigo-800'
                          }`}>
                            {comic.readingStatus}
                          </span>
                        </div>
                        <h5 className="font-bold text-slate-900 dark:text-slate-100 text-xs truncate leading-snug">{comic.title}</h5>
                        <p className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Issue #{comic.issueNumber}</p>
                        <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                          📅 {formatPublicationDate(comic.publicationYear, comic.publicationMonth) || 'Undated'}
                        </p>
                      </div>
                    </div>
                  ))}
                  {visibleEventComicsCount < filteredEventComics.length && (
                    <div ref={eventComicsSentinelRef} className="py-6 flex flex-col items-center justify-center gap-2 col-span-full">
                      <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold">
                        Loading more issues ({visibleEventComics.length} of {filteredEventComics.length})...
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )
          )}

        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 2: COMIC TITLES / SERIES COLLECTION GRAPH & RUN TRACKER */}
      {/* ========================================================================= */}
      {activeStatsTab === 'series' && (
        <div className="space-y-6">
          
          {/* Series Overview KPI Banner */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
              <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400 mb-1">
                <Layers3 className="w-4 h-4" />
                <span className="text-[11px] font-bold uppercase tracking-wider">Series Runs</span>
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-slate-100">{seriesOverviewStats.totalRuns}</div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Distinct comic series</p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 mb-1">
                <Crown className="w-4 h-4 text-amber-500" />
                <span className="text-[11px] font-bold uppercase tracking-wider">Full Runs Owned</span>
              </div>
              <div className="text-2xl font-black text-amber-800 dark:text-amber-300">
                {seriesOverviewStats.completedRuns}
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 ml-1.5">
                  ({seriesOverviewStats.totalRuns > 0 ? Math.round((seriesOverviewStats.completedRuns / seriesOverviewStats.totalRuns) * 100) : 0}%)
                </span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">100% complete runs</p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 mb-1">
                <Target className="w-4 h-4 text-emerald-500" />
                <span className="text-[11px] font-bold uppercase tracking-wider">Run Collection Rate</span>
              </div>
              <div className="text-2xl font-black text-emerald-800 dark:text-emerald-300">
                {seriesOverviewStats.overallRunCollectionPct}%
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                {seriesOverviewStats.totalOwnedInSeries} of {seriesOverviewStats.totalPublishedIssues} published issues
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
              <div className="flex items-center gap-2 text-violet-700 dark:text-violet-400 mb-1">
                <Sparkles className="w-4 h-4 text-violet-500" />
                <span className="text-[11px] font-bold uppercase tracking-wider">Near Complete (≥75%)</span>
              </div>
              <div className="text-2xl font-black text-violet-800 dark:text-violet-300">
                {seriesOverviewStats.nearCompleteRuns}
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Close to full run</p>
            </div>
          </div>

          {/* Top Series Controls & Summary */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300">
                    <BarChart3 className="w-4 h-4" />
                  </span>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Series Collection & Run Progress</h3>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Track how close you are to completing every series run in your collection, with verified issue counts from SeriesIssueTotal.
                </p>
              </div>
            </div>

            {/* Top 10 Series Stacked Bar Chart */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-bold text-slate-900 dark:text-slate-100 text-xs uppercase tracking-wider flex items-center gap-2">
                  <TrendingUp className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>Top Series Run Breakdown (Owned vs Total Published Issues)</span>
                </h4>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  {seriesSortBy === 'completion' ? 'Showing top 10 series closest to completion' : 'Showing top 10 series'}
                </span>
              </div>

              {topSeriesChartData.length === 0 ? (
                <div className="h-48 flex flex-col items-center justify-center text-center p-6 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                  <Crown className="w-8 h-8 text-amber-500 mb-2" />
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">All series runs are 100% complete!</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">No series currently have remaining issues to collect.</p>
                </div>
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topSeriesChartData} margin={{ top: 10, right: 10, left: -20, bottom: 45 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.3} />
                      <XAxis dataKey="name" stroke="#64748b" fontSize={10} interval={0} angle={-30} textAnchor="end" />
                      <YAxis stroke="#64748b" fontSize={10} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderRadius: '8px', color: '#0f172a' }}
                      />
                      <Bar dataKey="Owned" fill="#10B981" name="Owned Issues" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="Remaining" fill="#CBD5E1" name="Remaining to Complete Run" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="Wishlist" fill="#F43F5E" name="Wishlist Issues" radius={[4, 4, 0, 0]} />
                      <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: '11px' }} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Filter, Sort & Search Toolbar for Series */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3">
            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1 xl:pb-0">
              <button
                onClick={() => setSeriesRunFilter('in_progress_all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  seriesRunFilter === 'in_progress_all'
                    ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                All In Progress ({seriesOverviewStats.inProgressRuns})
              </button>
              <button
                onClick={() => setSeriesRunFilter('complete')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  seriesRunFilter === 'complete'
                    ? 'bg-amber-500 text-amber-950 shadow-xs'
                    : 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 hover:bg-amber-100'
                }`}
              >
                <Crown className="w-3.5 h-3.5" />
                <span>Complete Runs ({seriesOverviewStats.completedRuns})</span>
              </button>
              <button
                onClick={() => setSeriesRunFilter('near')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  seriesRunFilter === 'near'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-300 hover:bg-indigo-100'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                <span>Near Complete ≥75% ({seriesOverviewStats.nearCompleteRuns})</span>
              </button>
              <button
                onClick={() => setSeriesRunFilter('under_75')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  seriesRunFilter === 'under_75'
                    ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                In Progress &lt;75% ({seriesOverviewStats.under75Runs})
              </button>
            </div>

            {/* Sort & Search Controls */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              {/* Sort By Dropdown & Direction Toggle */}
              <div className="flex items-center gap-1.5 shrink-0">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  <span className="hidden sm:inline">Sort:</span>
                </label>
                <select
                  value={seriesSortBy}
                  onChange={(e) => setSeriesSortBy(e.target.value as 'completion' | 'alphabetical')}
                  aria-label="Sort Series By"
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-bold text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-xs"
                >
                  <option value="completion">Closest to Completion</option>
                  <option value="alphabetical">Alphabetical (A-Z)</option>
                </select>
                <button
                  type="button"
                  onClick={() => setSeriesSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                  title={
                    seriesSortBy === 'completion'
                      ? (seriesSortDirection === 'desc' ? 'Sorted: Highest completion % to lowest (Click to reverse)' : 'Sorted: Lowest completion % to highest (Click to reverse)')
                      : (seriesSortDirection === 'asc' ? 'Sorted: A to Z (Click to reverse)' : 'Sorted: Z to A (Click to reverse)')
                  }
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors cursor-pointer shadow-xs"
                >
                  <ArrowUpDown className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                  <span className="text-xs">
                    {seriesSortBy === 'completion'
                      ? (seriesSortDirection === 'desc' ? 'High → Low' : 'Low → High')
                      : (seriesSortDirection === 'asc' ? 'A → Z' : 'Z → A')}
                  </span>
                </button>
              </div>

              {/* Series Search */}
              <div className="relative min-w-[200px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search series or publisher..."
                  value={seriesSearchQuery}
                  onChange={(e) => setSeriesSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-8 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {seriesSearchQuery && (
                  <button
                    onClick={() => setSeriesSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Complete Series Grid View */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
              <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
                <Layers3 className="w-4 h-4 text-slate-700 dark:text-slate-300" />
                <span>
                  {seriesRunFilter === 'in_progress_all' && 'In Progress Series Runs'}
                  {seriesRunFilter === 'complete' && 'Completed Series Runs'}
                  {seriesRunFilter === 'near' && 'Near Complete Series Runs (≥75%)'}
                  {seriesRunFilter === 'under_75' && 'In Progress Series Runs (<75%)'}
                  {' '}({filteredSeries.length} Shown)
                </span>
              </h4>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Sorted by: <strong className="text-slate-700 dark:text-slate-300">{seriesSortBy === 'completion' ? 'Completion %' : 'Alphabetical'}</strong> ({seriesSortBy === 'completion'
                  ? (seriesSortDirection === 'desc' ? 'Highest first' : 'Lowest first')
                  : (seriesSortDirection === 'asc' ? 'A → Z' : 'Z → A')})
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredSeries.map((s) => (
                <div 
                  key={s.seriesName}
                  className={`border rounded-2xl p-4 space-y-3 transition-all ${
                    s.isRunComplete 
                      ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-700/60 shadow-xs' 
                      : s.collectionPct >= 75
                      ? 'bg-emerald-50/30 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800/60 shadow-xs'
                      : 'bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{s.publisher}</span>
                      <h5 className="font-bold text-slate-900 dark:text-slate-100 text-sm truncate leading-snug" title={s.seriesName}>
                        {s.seriesName}
                      </h5>
                    </div>

                    {s.isRunComplete ? (
                      <span className="px-2 py-0.5 rounded-full bg-amber-400 text-amber-950 font-black text-[10px] flex items-center gap-1 shrink-0 shadow-xs">
                        <Crown className="w-3 h-3 text-amber-950" />
                        <span>FULL RUN</span>
                      </span>
                    ) : s.collectionPct >= 75 ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 font-extrabold text-[10px] shrink-0 border border-emerald-300 dark:border-emerald-700">
                        {s.collectionPct}% COLLECTED
                      </span>
                    ) : null}
                  </div>

                  {/* Primary Collection Progress Bar (How close to collecting all titles) */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="text-slate-700 dark:text-slate-300 font-bold flex items-center gap-1">
                        <Target className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Run Progress</span>
                      </span>
                      <span className={s.isRunComplete ? 'text-amber-800 dark:text-amber-300 font-bold' : 'text-slate-900 dark:text-slate-100 font-bold'}>
                        {s.ownedCount} / {s.totalIssues} ({s.collectionPct}%)
                      </span>
                    </div>

                    <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${
                          s.isRunComplete
                            ? 'bg-gradient-to-r from-amber-400 to-amber-600'
                            : s.collectionPct >= 75
                            ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                            : 'bg-indigo-600 dark:bg-indigo-500'
                        }`}
                        style={{ width: `${s.collectionPct}%` }}
                      ></div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                      {s.isRunComplete ? (
                        <span className="text-amber-700 dark:text-amber-400 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Full run complete! ({s.totalIssues} issues)</span>
                        </span>
                      ) : (
                        <span>
                          <strong>{s.remainingIssues}</strong> {s.remainingIssues === 1 ? 'issue' : 'issues'} needed to complete run
                        </span>
                      )}

                      {/* Read Progress Sub-indicator */}
                      <span className="text-[10px] font-medium text-slate-600 dark:text-slate-400">
                        {s.readCount}/{s.ownedCount} read ({s.readPct}%)
                      </span>
                    </div>
                  </div>

                  {/* Issues Count & Valuation Tags */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px]">
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {s.ownedCount} Owned {s.wishlistCount > 0 && <span className="text-rose-600 dark:text-rose-400 font-normal">({s.wishlistCount} wishlist)</span>}
                    </span>
                    <span className="font-semibold text-slate-500 dark:text-slate-400">
                      Est. ${s.totalValue.toFixed(2)}
                    </span>
                  </div>

                  {/* Action Bar & Expandable Run Breakdown */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
                    {onViewSeriesInCatalog && (
                      <button
                        type="button"
                        onClick={() => onViewSeriesInCatalog(s.seriesName)}
                        className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
                        title="Filter Collection Catalog to this series"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>View in Catalog</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setExpandedSeriesName(expandedSeriesName === s.seriesName ? null : s.seriesName)}
                      className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1 cursor-pointer ml-auto"
                    >
                      <span>{expandedSeriesName === s.seriesName ? 'Hide Issues' : 'Issue Matrix'}</span>
                      {expandedSeriesName === s.seriesName ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                  </div>

                  {/* Expanded Issue Matrix & Missing Checklist */}
                  {expandedSeriesName === s.seriesName && (
                    <div className="pt-2 border-t border-dashed border-slate-200 dark:border-slate-700 space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 dark:text-slate-300">
                        <span>Path to 100% Run:</span>
                        {s.missingIssueNumbers.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              const text = `${s.seriesName} - Missing Issues (${s.missingIssueNumbers.length}): #${s.missingIssueNumbers.join(', #')}`;
                              navigator.clipboard.writeText(text);
                              setCopiedSeriesMissing(s.seriesName);
                              setTimeout(() => setCopiedSeriesMissing(null), 2000);
                            }}
                            className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            {copiedSeriesMissing === s.seriesName ? <Check className="w-2.5 h-2.5 text-emerald-500" /> : <Copy className="w-2.5 h-2.5" />}
                            <span>{copiedSeriesMissing === s.seriesName ? 'Copied!' : 'Copy Missing'}</span>
                          </button>
                        )}
                        {onOpenGenerateWishlist && (
                          <button
                            type="button"
                            onClick={() => onOpenGenerateWishlist(s.seriesName)}
                            className="text-[10px] text-rose-600 dark:text-rose-400 hover:underline flex items-center gap-1 cursor-pointer font-semibold"
                            title="Generate missing issues as wishlist comics"
                          >
                            <Bookmark className="w-2.5 h-2.5" />
                            <span>Add to Wishlist</span>
                          </button>
                        )}
                      </div>

                      {s.totalIssues <= 60 ? (
                        <div className="flex flex-wrap gap-1 p-2 bg-slate-50 dark:bg-slate-800/80 rounded-lg border border-slate-200 dark:border-slate-700 max-h-36 overflow-y-auto">
                          {Array.from({ length: s.totalIssues }, (_, idx) => idx + 1).map((num) => {
                            const isOwned = s.ownedIssueNumbers.includes(num);
                            const isWishlist = s.wishlistIssueNumbers.includes(num);
                            return (
                              <div
                                key={num}
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded border flex items-center gap-0.5 ${
                                  isOwned
                                    ? 'bg-indigo-600 dark:bg-indigo-500 text-white border-indigo-700 shadow-xs'
                                    : isWishlist
                                    ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-300'
                                    : 'bg-white dark:bg-slate-900 text-slate-400 dark:text-slate-500 border-dashed border-slate-300 dark:border-slate-700'
                                }`}
                                title={isOwned ? `Issue #${num}: Owned` : isWishlist ? `Issue #${num}: Wishlist` : `Issue #${num}: Missing`}
                              >
                                {isOwned && <CheckCircle2 className="w-2 h-2" />}
                                <span>#{num}</span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="p-2 bg-slate-50 dark:bg-slate-800/80 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] space-y-1">
                          <p className="text-slate-600 dark:text-slate-300">
                            <strong>{s.ownedCount}</strong> of <strong>{s.totalIssues}</strong> owned ({s.collectionPct}%).
                            {s.remainingIssues > 0 ? (
                              <span className="text-amber-800 dark:text-amber-400 font-bold ml-1">
                                {s.remainingIssues} needed for 100%.
                              </span>
                            ) : (
                              <span className="text-emerald-700 dark:text-emerald-400 font-bold ml-1">
                                Complete run! 🏆
                              </span>
                            )}
                          </p>
                          {s.missingIssueNumbers.length > 0 && (
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                              Missing: {s.missingIssueNumbers.slice(0, 20).map(n => `#${n}`).join(', ')}
                              {s.missingIssueNumbers.length > 20 && ` ...and ${s.missingIssueNumbers.length - 20} more`}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 2.5: CREATORS & CONTRIBUTOR ROLES BREAKDOWN */}
      {/* ========================================================================= */}
      {activeStatsTab === 'creators' && (
        <div className="space-y-6">
          
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-indigo-700 via-purple-700 to-pink-700 rounded-2xl p-6 text-white shadow-md space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-white/20 text-white font-black">
                    <Palette className="w-5 h-5" />
                  </span>
                  <h3 className="text-xl font-black tracking-tight text-white">
                    Comic Creators & Contributor Roles
                  </h3>
                </div>
                <p className="text-xs text-indigo-100 max-w-2xl">
                  Analyze credits for writers, artists, inkers, colorists, and editors across your collection. Highlight creators who bridge roles—especially artists who also contribute to writing and stories.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-3 text-center min-w-[110px]">
                  <span className="text-[10px] font-bold text-indigo-200 uppercase tracking-wider block">Creators</span>
                  <span className="text-2xl font-black text-white">{creatorList.length}</span>
                  <span className="text-[10px] text-white/80 block font-medium">Contributors</span>
                </div>
                <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-3 text-center min-w-[110px]">
                  <span className="text-[10px] font-bold text-amber-200 uppercase tracking-wider block">Artists Who Write</span>
                  <span className="text-2xl font-black text-amber-300">{artistsWhoWriteList.length}</span>
                  <span className="text-[10px] text-white/80 block font-medium">Artist + Writer</span>
                </div>
              </div>
            </div>

            {/* Quick Summary Metric Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="bg-white/10 backdrop-blur-sm border border-white/15 rounded-xl p-3">
                <span className="text-[11px] font-medium text-indigo-200 block">Total Creator Credits</span>
                <span className="text-lg font-black text-white">{totalCreditsCount}</span>
                <span className="text-[10px] text-indigo-200/80 block mt-0.5">Across all issues</span>
              </div>
              <div className="bg-white/10 backdrop-blur-sm border border-white/15 rounded-xl p-3">
                <span className="text-[11px] font-medium text-indigo-200 block">Distinct Roles</span>
                <span className="text-lg font-black text-white">{allUniqueRoles.length} Types</span>
                <span className="text-[10px] text-indigo-200/80 block mt-0.5">Penciller, Writer, etc.</span>
              </div>
              <div className="bg-white/10 backdrop-blur-sm border border-white/15 rounded-xl p-3">
                <span className="text-[11px] font-medium text-amber-200 block">Artists Who Write</span>
                <span className="text-lg font-black text-amber-300">{artistsWhoWriteList.length} Creators</span>
                <span className="text-[10px] text-amber-200/80 block mt-0.5">Art & Script masters</span>
              </div>
              <div className="bg-white/10 backdrop-blur-sm border border-white/15 rounded-xl p-3">
                <span className="text-[11px] font-medium text-indigo-200 block">Top Contributor</span>
                <span className="text-lg font-black text-white truncate block">{creatorList[0]?.name || 'N/A'}</span>
                <span className="text-[10px] text-indigo-200/80 block mt-0.5">{creatorList[0]?.totalIssues || 0} contributed issues</span>
              </div>
            </div>
          </div>

          {/* SPOTLIGHT: Artists Who Also Contributed Writing & Story */}
          {artistsWhoWriteList.length > 0 && (
            <div className="bg-gradient-to-br from-amber-500/10 via-purple-500/10 to-indigo-500/10 dark:from-amber-950/30 dark:via-purple-950/30 dark:to-indigo-950/30 border-2 border-amber-300/80 dark:border-amber-700/60 rounded-2xl p-5 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-amber-200/80 dark:border-amber-800/80">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white shadow-xs">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-black text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
                      <span>Spotlight: Artists Who Also Contributed Writing & Story</span>
                      <span className="px-2 py-0.5 rounded-full bg-amber-400 text-amber-950 font-black text-[10px]">
                        {artistsWhoWriteList.length} Creators
                      </span>
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                      Creators in your collection who contributed art (pencils/inks) and authored scripts, plots, or story arcs.
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setOnlyArtistsWhoWrite(!onlyArtistsWhoWrite);
                  }}
                  className={`text-xs font-bold px-3.5 py-1.5 rounded-xl transition-all flex items-center gap-1.5 self-start sm:self-auto cursor-pointer ${
                    onlyArtistsWhoWrite
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700/70 text-amber-900 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-slate-700'
                  }`}
                >
                  <Filter className="w-3.5 h-3.5" />
                  {onlyArtistsWhoWrite ? 'Showing Only Artists Who Write ✓' : 'Filter Table to Artists Who Write'}
                </button>
              </div>

              {/* Artists Who Write Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {artistsWhoWriteList.slice(0, 6).map((c) => (
                  <div
                    key={c.name}
                    className="bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800/80 rounded-xl p-3.5 shadow-xs hover:border-amber-400 dark:hover:border-amber-600 transition-all flex flex-col justify-between space-y-3"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h5 className="font-bold text-slate-900 dark:text-slate-100 text-sm">{c.name}</h5>
                          <span className="text-[10px] font-extrabold text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/70 px-2 py-0.5 rounded-full inline-block mt-0.5">
                            🎨 Artist & Writer ✍️
                          </span>
                        </div>
                        <span className="text-xs font-black text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-lg shrink-0">
                          {c.totalIssues} Issues
                        </span>
                      </div>

                      {/* Roles breakdown stats */}
                      <div className="mt-2.5 grid grid-cols-2 gap-2 text-[11px]">
                        <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg p-1.5">
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">Art Credits</span>
                          <span className="font-black text-indigo-700 dark:text-indigo-400">{c.artIssuesCount} issues</span>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg p-1.5">
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">Writing Credits</span>
                          <span className="font-black text-purple-700 dark:text-purple-400">{c.writingIssuesCount} issues</span>
                        </div>
                      </div>

                      {c.dualRoleIssuesCount > 0 && (
                        <p className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold mt-2 flex items-center gap-1">
                          <CheckCheck className="w-3 h-3" />
                          <span>Both Art & Story on {c.dualRoleIssuesCount} same issue{c.dualRoleIssuesCount > 1 ? 's' : ''}!</span>
                        </p>
                      )}

                      {/* Top Series */}
                      {c.topSeries.length > 0 && (
                        <div className="mt-2">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Top Series:</span>
                          <p className="text-[11px] text-slate-700 dark:text-slate-300 font-medium truncate mt-0.5">
                            {c.topSeries.slice(0, 2).map((s) => `${s.series} (${s.count})`).join(', ')}
                          </p>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => setSelectedCreatorForIssues(selectedCreatorForIssues === c.name ? null : c.name)}
                      className="w-full text-[11px] font-bold py-1.5 px-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span>{selectedCreatorForIssues === c.name ? 'Hide Issues' : 'View Contributed Issues'}</span>
                      {selectedCreatorForIssues === c.name ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Charts Row: Contributor Roles Breakdown & Top Featured Creators */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Chart 1: Creator Roles Distribution */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                    <span>Contributor Roles Distribution</span>
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Total issues credits by specific role type</p>
                </div>
                <span className="text-xs font-bold text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/60 border border-violet-200 dark:border-violet-800 px-2 py-0.5 rounded-lg">
                  {totalCreditsCount} Total Credits
                </span>
              </div>

              {roleDistributionData.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-xs text-slate-400">
                  No creator role data found. Import Google Sheets subsheets to populate.
                </div>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={roleDistributionData.slice(0, 8)} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.3} />
                      <XAxis type="number" stroke="#64748b" fontSize={10} />
                      <YAxis dataKey="name" type="category" stroke="#64748b" fontSize={10} width={90} />
                      <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderRadius: '8px', color: '#0f172a' }} />
                      <Bar dataKey="count" name="Credits" fill="#8B5CF6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Chart 2: Top Featured Creators */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 gap-2">
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
                    <Palette className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <span>Top Featured Creators</span>
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Most credited creators across your collection</p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <select
                    value={topCreatorsCategoryFilter}
                    onChange={(e) => setTopCreatorsCategoryFilter(e.target.value as any)}
                    aria-label="Filter Top Creators by Category"
                    className="text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-600 shadow-xs cursor-pointer"
                  >
                    <option value="all">All Roles</option>
                    <option value="Artist">Artists</option>
                    <option value="Writer">Writers</option>
                    <option value="Editor">Editors</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              {topCreatorsChartData.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-center p-4 text-xs text-slate-400 space-y-2">
                  <Palette className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                  <p>No creator records match this category.</p>
                </div>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topCreatorsChartData} margin={{ top: 10, right: 10, left: -20, bottom: 35 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.3} />
                      <XAxis dataKey="name" stroke="#64748b" fontSize={10} interval={0} angle={-25} textAnchor="end" />
                      <YAxis stroke="#64748b" fontSize={10} />
                      <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderRadius: '8px', color: '#0f172a' }} />
                      <Bar dataKey="Credits" name={topCreatorsCategoryFilter === 'all' ? 'Total Issues' : `${topCreatorsCategoryFilter} Credits`} fill="#6366F1" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

          </div>

          {/* Selected Creator Issues Drawer (If open) */}
          {selectedCreatorForIssues && (() => {
            const cr = creatorList.find((c) => c.name === selectedCreatorForIssues);
            if (!cr) return null;

            return (
              <div className="bg-white dark:bg-slate-900 border-2 border-indigo-200 dark:border-indigo-800 rounded-2xl p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-700 dark:text-indigo-400 font-bold">
                      <Palette className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-black text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
                        <span>{cr.name}</span>
                        {cr.isArtistWhoWrites && (
                          <span className="text-[10px] font-extrabold text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/70 px-2 py-0.5 rounded-full">
                            🎨 Artist & Writer ✍️
                          </span>
                        )}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Contributed to {cr.totalIssues} issues (sorted chronologically by release date) • Roles: {Object.entries(cr.roles).map(([r, count]) => `${r} (${count})`).join(', ')}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => setSelectedCreatorForIssues(null)}
                    className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 max-h-96 overflow-y-auto pr-1">
                  {cr.issues.map((iss) => (
                    <div key={iss.id} className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 flex flex-col justify-between shadow-2xs hover:border-indigo-300 dark:hover:border-indigo-500 transition-all">
                      <div className="flex gap-2 items-start">
                        <img
                          src={getComicCoverUrl(iss.coverImage)}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          onError={handleImageError}
                          referrerPolicy="no-referrer"
                          className="w-10 h-14 object-cover rounded shrink-0 border border-slate-200 dark:border-slate-700"
                        />
                        <div className="min-w-0 flex-1">
                          <h5 className="font-bold text-slate-900 dark:text-slate-100 text-[11px] truncate">{iss.title}</h5>
                          <p className="text-[10px] font-black text-slate-700 dark:text-slate-300">#{iss.issueNumber}</p>
                          {iss.seriesName && (
                            <p className="text-[9px] text-slate-400 dark:text-slate-500 truncate">{iss.seriesName}</p>
                          )}
                          {iss.comic.publicationYear ? (
                            <span className="text-[9px] font-semibold text-slate-500 dark:text-slate-400 block mt-0.5">
                              📅 {formatPublicationDate(iss.comic.publicationYear, iss.comic.publicationMonth)}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700 space-y-1">
                        <div className="flex flex-wrap gap-1">
                          {iss.roles.map((r) => (
                            <span key={r} className="text-[8px] font-bold px-1.5 py-0.2 rounded bg-indigo-100 dark:bg-indigo-950/70 text-indigo-800 dark:text-indigo-300">
                              {r}
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center justify-between text-[9px] pt-1">
                          <span className={`font-bold px-1.5 py-0.2 rounded ${
                            iss.readingStatus === 'Read'
                              ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300'
                              : iss.readingStatus === 'Reading'
                              ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300'
                              : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                          }`}>
                            {iss.readingStatus}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Interactive Creators Directory Table & Search */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h4 className="font-bold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
                  <Users className="w-4 h-4 text-slate-700 dark:text-slate-300" />
                  <span>Creators Directory & Issue Breakdown</span>
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Search creators, filter by 4 contributor categories (Artist, Writer, Editor, Other), and inspect individual credits.
                </p>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Search input */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={creatorSearchQuery}
                    onChange={(e) => setCreatorSearchQuery(e.target.value)}
                    placeholder="Search creator or series..."
                    className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 w-48 sm:w-56 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                  />
                  {creatorSearchQuery && (
                    <button
                      onClick={() => setCreatorSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Role filter dropdown - 4 categories */}
                <select
                  value={creatorRoleFilter}
                  onChange={(e) => setCreatorRoleFilter(e.target.value)}
                  className="text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-600 cursor-pointer"
                >
                  <option value="all">All Roles</option>
                  <option value="Artist">Artist (Penciller, Artist, Inker)</option>
                  <option value="Writer">Writer (Writer, Story)</option>
                  <option value="Editor">Editor</option>
                  <option value="Other">Other (Letterer, Colorist, etc.)</option>
                </select>

                {/* Artists Who Write quick toggle */}
                <button
                  onClick={() => setOnlyArtistsWhoWrite(!onlyArtistsWhoWrite)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer ${
                    onlyArtistsWhoWrite
                      ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  <span>🎨✍️ Artists Who Write Only</span>
                  {artistsWhoWriteList.length > 0 && (
                    <span className={`text-[10px] px-1.5 rounded-full ${onlyArtistsWhoWrite ? 'bg-amber-700 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'}`}>
                      {artistsWhoWriteList.length}
                    </span>
                  )}
                </button>

                {/* Reset button */}
                {(creatorSearchQuery || creatorRoleFilter !== 'all' || onlyArtistsWhoWrite) && (
                  <button
                    onClick={() => {
                      setCreatorSearchQuery('');
                      setCreatorRoleFilter('all');
                      setOnlyArtistsWhoWrite(false);
                    }}
                    className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline px-1 cursor-pointer"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Showing <strong>{filteredCreators.length}</strong> of {creatorList.length} creators</span>
              {onlyArtistsWhoWrite && (
                <span className="text-amber-800 dark:text-amber-300 font-bold">Filtered to Artists Who Contributed to Writing/Story</span>
              )}
            </div>

            {filteredCreators.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs space-y-2">
                <Users className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
                <p className="font-semibold text-slate-600 dark:text-slate-300">No creators match your current search/filter.</p>
                <p>Try clearing your search query or selecting "All Roles".</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {filteredCreators.slice(0, 48).map((cr) => (
                  <div
                    key={cr.name}
                    className={`bg-white dark:bg-slate-900 border rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between space-y-3 ${
                      cr.isArtistWhoWrites ? 'border-amber-200 dark:border-amber-800/80 hover:border-amber-300 dark:hover:border-amber-700' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h5 className="font-bold text-slate-900 dark:text-slate-100 text-sm truncate">{cr.name}</h5>
                          {cr.isArtistWhoWrites && (
                            <span className="text-[10px] font-extrabold text-amber-900 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/70 px-2 py-0.5 rounded-full inline-block mt-0.5">
                              🎨 Artist & Writer ✍️
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-black text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-xl shrink-0">
                          {cr.totalIssues} {cr.totalIssues === 1 ? 'Issue' : 'Issues'}
                        </span>
                      </div>

                      {/* Roles breakdown tags */}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {Object.entries(cr.roles).map(([role, count]) => {
                          const cat = getRoleCategory(role);
                          return (
                            <span
                              key={role}
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                                cat === 'Writer'
                                  ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                                  : cat === 'Artist'
                                  ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
                                  : cat === 'Editor'
                                  ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                                  : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                              }`}
                            >
                              {role}: {count}
                            </span>
                          );
                        })}
                      </div>

                      {/* Top Series preview */}
                      {cr.topSeries.length > 0 && (
                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Series:</span>
                          <p className="text-[11px] text-slate-600 dark:text-slate-400 truncate mt-0.5">
                            {cr.topSeries.slice(0, 2).map((s) => `${s.series} (${s.count})`).join(', ')}
                          </p>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => setSelectedCreatorForIssues(selectedCreatorForIssues === cr.name ? null : cr.name)}
                      className="w-full text-xs font-bold py-1.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 transition-all flex items-center justify-center gap-1.5 mt-auto cursor-pointer"
                    >
                      <span>{selectedCreatorForIssues === cr.name ? 'Close Issues' : `Inspect ${cr.totalIssues} Issues`}</span>
                      {selectedCreatorForIssues === cr.name ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 2.6: CHARACTER APPEARANCES & ISSUE BREAKDOWN */}
      {/* ========================================================================= */}
      {activeStatsTab === 'characters' && (
        <div className="space-y-6">

          {/* Header Banner */}
          <div className="bg-gradient-to-r from-pink-700 via-rose-700 to-purple-700 rounded-2xl p-6 text-white shadow-md space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-white/20 text-white font-black">
                    <Users className="w-5 h-5" />
                  </span>
                  <h3 className="text-xl font-black tracking-tight text-white">
                    Comic Character Appearances & Issue Breakdown
                  </h3>
                </div>
                <p className="text-xs text-pink-100 max-w-2xl">
                  Track superhero and villain appearances across your collection, distinguishing between Main leads, Supporting cast, and Cameo appearances.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-3 text-center min-w-[110px]">
                  <span className="text-[10px] font-bold text-pink-200 uppercase tracking-wider block">Characters</span>
                  <span className="text-2xl font-black text-white">{characterRankingList.length}</span>
                  <span className="text-[10px] text-white/80 block font-medium">Tracked</span>
                </div>
                <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-3 text-center min-w-[110px]">
                  <span className="text-[10px] font-bold text-pink-200 uppercase tracking-wider block">Appearances</span>
                  <span className="text-2xl font-black text-white">
                    {characterRankingList.reduce((acc, c) => acc + c.total, 0)}
                  </span>
                  <span className="text-[10px] text-white/80 block font-medium">Total Credits</span>
                </div>
              </div>
            </div>

            {/* Quick Summary Metric Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="bg-white/10 backdrop-blur-sm border border-white/15 rounded-xl p-3">
                <span className="text-[11px] font-medium text-pink-200 block">Total Characters</span>
                <span className="text-lg font-black text-white">{characterRankingList.length}</span>
                <span className="text-[10px] text-pink-200/80 block mt-0.5">Heroes & villains</span>
              </div>
              <div className="bg-white/10 backdrop-blur-sm border border-white/15 rounded-xl p-3">
                <span className="text-[11px] font-medium text-pink-200 block">Main Appearances</span>
                <span className="text-lg font-black text-white">
                  {characterRankingList.reduce((acc, c) => acc + c.main, 0)}
                </span>
                <span className="text-[10px] text-pink-200/80 block mt-0.5">Primary title characters</span>
              </div>
              <div className="bg-white/10 backdrop-blur-sm border border-white/15 rounded-xl p-3">
                <span className="text-[11px] font-medium text-purple-200 block">Supporting Cast</span>
                <span className="text-lg font-black text-white">
                  {characterRankingList.reduce((acc, c) => acc + c.supporting, 0)}
                </span>
                <span className="text-[10px] text-purple-200/80 block mt-0.5">Co-stars & team members</span>
              </div>
              <div className="bg-white/10 backdrop-blur-sm border border-white/15 rounded-xl p-3">
                <span className="text-[11px] font-medium text-amber-200 block">Cameos & Guest Stars</span>
                <span className="text-lg font-black text-amber-300">
                  {characterRankingList.reduce((acc, c) => acc + c.cameo, 0)}
                </span>
                <span className="text-[10px] text-amber-200/80 block mt-0.5">Brief appearances</span>
              </div>
            </div>
          </div>

          {/* SPOTLIGHT: Top Featured Characters */}
          {characterRankingList.length > 0 && (
            <div className="bg-gradient-to-br from-pink-500/10 via-purple-500/10 to-indigo-500/10 dark:from-pink-950/30 dark:via-purple-950/30 dark:to-indigo-950/30 border-2 border-pink-300/80 dark:border-pink-800/60 rounded-2xl p-5 shadow-xs space-y-4">
              <div className="flex items-center gap-2.5 pb-3 border-b border-pink-200/80 dark:border-pink-800/80">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center text-white shadow-xs">
                  <Crown className="w-5 h-5 text-amber-300" />
                </div>
                <div>
                  <h4 className="font-black text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
                    <span>Spotlight: Top Featured Characters</span>
                    <span className="px-2 py-0.5 rounded-full bg-pink-500 text-white font-black text-[10px]">
                      Top Leaders
                    </span>
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    The most prominent superheroes, villains, and supporting cast across your collection.
                  </p>
                </div>
              </div>

              {/* Top Character Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {characterRankingList.slice(0, 6).map((chr) => (
                  <div
                    key={chr.name}
                    className="bg-white dark:bg-slate-900 border border-pink-200 dark:border-pink-800/80 rounded-xl p-3.5 shadow-xs hover:border-pink-400 dark:hover:border-pink-600 transition-all flex flex-col justify-between space-y-3"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h5 className="font-bold text-slate-900 dark:text-slate-100 text-sm truncate">{chr.name}</h5>
                          <div className="flex items-center gap-1.5 mt-1">
                            {chr.main > 0 && (
                              <span className="text-[10px] font-extrabold text-pink-700 dark:text-pink-300 bg-pink-100 dark:bg-pink-950/70 px-2 py-0.5 rounded-full">
                                Main: {chr.main}
                              </span>
                            )}
                            {chr.supporting > 0 && (
                              <span className="text-[10px] font-extrabold text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-950/70 px-2 py-0.5 rounded-full">
                                Support: {chr.supporting}
                              </span>
                            )}
                            {chr.cameo > 0 && (
                              <span className="text-[10px] font-extrabold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/70 px-2 py-0.5 rounded-full">
                                Cameo: {chr.cameo}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-xs font-black text-pink-700 dark:text-pink-300 bg-pink-50 dark:bg-pink-950/60 border border-pink-200 dark:border-pink-800 px-2 py-0.5 rounded-lg shrink-0">
                          {chr.total} {chr.total === 1 ? 'Issue' : 'Issues'}
                        </span>
                      </div>

                      {/* Top Series for character */}
                      {chr.topSeries.length > 0 && (
                        <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Top Series:</span>
                          <p className="text-[11px] text-slate-700 dark:text-slate-300 font-medium truncate mt-0.5">
                            {chr.topSeries.slice(0, 2).map((s) => `${s.series} (${s.count})`).join(', ')}
                          </p>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => setSelectedCharacterForIssues(selectedCharacterForIssues === chr.name ? null : chr.name)}
                      className="w-full text-[11px] font-bold py-1.5 px-2.5 rounded-lg bg-pink-50 dark:bg-pink-950/40 hover:bg-pink-100 dark:hover:bg-pink-900/60 text-pink-800 dark:text-pink-300 border border-pink-200 dark:border-pink-800 transition-all flex items-center justify-center gap-1.5 cursor-pointer mt-auto"
                    >
                      <span>{selectedCharacterForIssues === chr.name ? 'Hide Issues' : `Inspect ${chr.total} Issues`}</span>
                      {selectedCharacterForIssues === chr.name ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Expanded Top Featured Character Appearances Stacked Bar Chart */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
                  <Users className="w-4 h-4 text-pink-600 dark:text-pink-400" />
                  <span>Top Featured Character Appearances (Main vs Supporting vs Cameo)</span>
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Showing top characters ranked by collection-wide appearances across all issues
                </p>
              </div>
              <span className="text-xs font-bold text-pink-700 dark:text-pink-300 bg-pink-50 dark:bg-pink-950/60 border border-pink-200 dark:border-pink-800 px-2 py-0.5 rounded-lg">
                {characterRankingList.length} Total Characters
              </span>
            </div>

            {characterRankingList.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-center p-4 text-xs text-slate-400 space-y-2">
                <Users className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                <p>No character appearance records found yet.</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Sync the "Title Character Appearances" tab from Google Sheets Importer to track character stats!
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto pb-2">
                <div className="min-w-[750px] h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={characterRankingList.slice(0, 18)} margin={{ top: 10, right: 10, left: -20, bottom: 45 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.3} />
                      <XAxis dataKey="name" stroke="#64748b" fontSize={10} interval={0} angle={-30} textAnchor="end" />
                      <YAxis stroke="#64748b" fontSize={10} />
                      <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderRadius: '8px', color: '#0f172a' }} />
                      <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: '11px', paddingBottom: '10px' }} />
                      <Bar dataKey="main" name="Main Role" fill="#EC4899" stackId="a" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="supporting" name="Supporting" fill="#8B5CF6" stackId="a" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="cameo" name="Cameo" fill="#F59E0B" stackId="a" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>

          {/* Selected Character Issues Drawer (If open) */}
          {selectedCharacterForIssues && (() => {
            const chr = characterRankingList.find((c) => c.name === selectedCharacterForIssues);
            if (!chr) return null;

            return (
              <div className="bg-white dark:bg-slate-900 border-2 border-pink-300 dark:border-pink-800 rounded-2xl p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-pink-100 dark:bg-pink-950/60 border border-pink-200 dark:border-pink-800 flex items-center justify-center text-pink-700 dark:text-pink-400 font-bold">
                      <Users className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-black text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
                        <span>{chr.name}</span>
                        <span className="text-xs font-black text-pink-800 dark:text-pink-300 bg-pink-100 dark:bg-pink-950/70 px-2 py-0.5 rounded-full">
                          {chr.total} Issues
                        </span>
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Appeared in {chr.total} issues (sorted chronologically by release date) • Breakdown: Main ({chr.main}), Supporting ({chr.supporting}), Cameo ({chr.cameo})
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => setSelectedCharacterForIssues(null)}
                    className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 max-h-96 overflow-y-auto pr-1">
                  {chr.issues.map((iss) => (
                    <div key={iss.id} className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 flex flex-col justify-between shadow-2xs hover:border-pink-300 dark:hover:border-pink-500 transition-all">
                      <div className="flex gap-2 items-start">
                        <img
                          src={getComicCoverUrl(iss.coverImage)}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          onError={handleImageError}
                          referrerPolicy="no-referrer"
                          className="w-10 h-14 object-cover rounded shrink-0 border border-slate-200 dark:border-slate-700"
                        />
                        <div className="min-w-0 flex-1">
                          <h5 className="font-bold text-slate-900 dark:text-slate-100 text-[11px] truncate">{iss.title}</h5>
                          <p className="text-[10px] font-black text-slate-700 dark:text-slate-300">#{iss.issueNumber}</p>
                          {iss.seriesName && (
                            <p className="text-[9px] text-slate-400 dark:text-slate-500 truncate">{iss.seriesName}</p>
                          )}
                          {iss.comic.publicationYear ? (
                            <span className="text-[9px] font-semibold text-slate-500 dark:text-slate-400 block mt-0.5">
                              📅 {formatPublicationDate(iss.comic.publicationYear, iss.comic.publicationMonth)}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700 space-y-1">
                        <div className="flex flex-wrap gap-1">
                          {iss.appearanceTypes.map((t) => (
                            <span
                              key={t}
                              className={`text-[8px] font-bold px-1.5 py-0.2 rounded ${
                                t.toLowerCase().includes('main')
                                  ? 'bg-pink-100 dark:bg-pink-950/70 text-pink-800 dark:text-pink-300'
                                  : t.toLowerCase().includes('support')
                                  ? 'bg-purple-100 dark:bg-purple-950/70 text-purple-800 dark:text-purple-300'
                                  : 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300'
                              }`}
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center justify-between text-[9px] pt-1">
                          <span className={`font-bold px-1.5 py-0.2 rounded ${
                            iss.readingStatus === 'Read'
                              ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300'
                              : iss.readingStatus === 'Reading'
                              ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300'
                              : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                          }`}>
                            {iss.readingStatus}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Interactive Character Appearance Directory Table & Search */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h4 className="font-bold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
                  <Users className="w-4 h-4 text-slate-700 dark:text-slate-300" />
                  <span>Character Appearance Directory & Issue Breakdown</span>
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Search characters, filter by appearance type (Main, Supporting, Cameo), and inspect all issues they appeared in.
                </p>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Search input */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={characterSearchQuery}
                    onChange={(e) => setCharacterSearchQuery(e.target.value)}
                    placeholder="Search character name or series..."
                    className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-600 w-48 sm:w-56 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                  />
                  {characterSearchQuery && (
                    <button
                      onClick={() => setCharacterSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Appearance role filter */}
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                  <button
                    onClick={() => setCharacterRoleFilter('all')}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      characterRoleFilter === 'all'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setCharacterRoleFilter('main')}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      characterRoleFilter === 'main'
                        ? 'bg-pink-600 text-white shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    Main
                  </button>
                  <button
                    onClick={() => setCharacterRoleFilter('supporting')}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      characterRoleFilter === 'supporting'
                        ? 'bg-purple-600 text-white shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    Supporting
                  </button>
                  <button
                    onClick={() => setCharacterRoleFilter('cameo')}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      characterRoleFilter === 'cameo'
                        ? 'bg-amber-500 text-white shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    Cameo
                  </button>
                </div>

                {/* Reset button */}
                {(characterSearchQuery || characterRoleFilter !== 'all') && (
                  <button
                    onClick={() => {
                      setCharacterSearchQuery('');
                      setCharacterRoleFilter('all');
                    }}
                    className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline px-1 cursor-pointer"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Showing <strong>{filteredCharacters.length}</strong> of {characterRankingList.length} characters</span>
              {characterRoleFilter !== 'all' && (
                <span className="text-pink-700 dark:text-pink-300 font-bold capitalize">Filtered to {characterRoleFilter} appearances</span>
              )}
            </div>

            {filteredCharacters.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs space-y-2">
                <Users className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
                <p className="font-semibold text-slate-600 dark:text-slate-300">No characters match your current search/filter.</p>
                <p>Try clearing your search query or switching to "All".</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {filteredCharacters.slice(0, 48).map((chr) => (
                  <div
                    key={chr.name}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-pink-300 dark:hover:border-pink-700 rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between space-y-3"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <h5 className="font-bold text-slate-900 dark:text-slate-100 text-sm truncate flex-1">{chr.name}</h5>
                        <span className="text-xs font-black text-pink-700 dark:text-pink-300 bg-pink-50 dark:bg-pink-950/60 border border-pink-200 dark:border-pink-800 px-2.5 py-1 rounded-xl shrink-0">
                          {chr.total} {chr.total === 1 ? 'Issue' : 'Issues'}
                        </span>
                      </div>

                      {/* Appearance role tags */}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {chr.main > 0 && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-pink-50 dark:bg-pink-950/60 text-pink-800 dark:text-pink-300 border border-pink-200 dark:border-pink-800">
                            Main: {chr.main}
                          </span>
                        )}
                        {chr.supporting > 0 && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-50 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                            Supporting: {chr.supporting}
                          </span>
                        )}
                        {chr.cameo > 0 && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                            Cameo: {chr.cameo}
                          </span>
                        )}
                      </div>

                      {/* Top Series preview */}
                      {chr.topSeries.length > 0 && (
                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Series:</span>
                          <p className="text-[11px] text-slate-600 dark:text-slate-400 truncate mt-0.5">
                            {chr.topSeries.slice(0, 2).map((s) => `${s.series} (${s.count})`).join(', ')}
                          </p>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => setSelectedCharacterForIssues(selectedCharacterForIssues === chr.name ? null : chr.name)}
                      className="w-full text-xs font-bold py-1.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 transition-all flex items-center justify-center gap-1.5 mt-auto cursor-pointer"
                    >
                      <span>{selectedCharacterForIssues === chr.name ? 'Close Issues' : `Inspect ${chr.total} Issues`}</span>
                      {selectedCharacterForIssues === chr.name ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 3: 100% COMPLETION ACHIEVEMENTS & BADGES */}
      {/* ========================================================================= */}
      {activeStatsTab === 'achievements' && (
        <div className="space-y-6">
          
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 rounded-2xl p-6 text-white shadow-md border border-purple-800/40 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-amber-400 text-amber-950 font-black shadow-xs">
                    <Trophy className="w-5 h-5" />
                  </span>
                  <h3 className="text-xl font-black tracking-tight text-white">
                    100% Collection & Reading Achievements
                  </h3>
                </div>
                <p className="text-xs text-purple-200 max-w-xl">
                  Celebrate milestones across your collection: complete series runs collected, reading backlogs mastered, and full crossover events conquered.
                </p>
              </div>

              <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-3 text-center shrink-0 min-w-[130px]">
                <span className="text-[10px] font-bold text-purple-200 uppercase tracking-wider block">Unlocked Badges</span>
                <span className="text-3xl font-black text-amber-300">{completedSeriesBadges.length}</span>
                <span className="text-[10px] text-white/80 block font-semibold">Trophies Earned</span>
              </div>
            </div>

            {/* Quick Summary Metric Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="bg-white/10 backdrop-blur-sm border border-white/15 rounded-xl p-3">
                <span className="text-[11px] font-medium text-amber-200 block">Series Runs Collected</span>
                <span className="text-lg font-black text-white">{collectionBadges.length}</span>
                <span className="text-[10px] text-amber-200/80 block mt-0.5">100% published issues owned</span>
              </div>
              <div className="bg-white/10 backdrop-blur-sm border border-white/15 rounded-xl p-3">
                <span className="text-[11px] font-medium text-cyan-200 block">Reading Masteries</span>
                <span className="text-lg font-black text-white">{readingBadges.length}</span>
                <span className="text-[10px] text-cyan-200/80 block mt-0.5">100% owned copies read</span>
              </div>
              <div className="bg-white/10 backdrop-blur-sm border border-white/15 rounded-xl p-3">
                <span className="text-[11px] font-medium text-purple-200 block">Event Champions</span>
                <span className="text-lg font-black text-white">{eventBadges.length}</span>
                <span className="text-[10px] text-purple-200/80 block mt-0.5">Crossovers owned & read</span>
              </div>
              <div className="bg-white/10 backdrop-blur-sm border border-white/15 rounded-xl p-3">
                <span className="text-[11px] font-medium text-emerald-200 block">Grand Masteries</span>
                <span className="text-lg font-black text-emerald-300">{grandMasterySeriesCount}</span>
                <span className="text-[10px] text-emerald-200/80 block mt-0.5">Both 100% owned & read</span>
              </div>
            </div>
          </div>

          {/* Category Filter Toolbar */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300">
                <Filter className="w-4 h-4" />
              </span>
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Filter Badges by Category:
              </span>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={achievementCategoryFilter}
                onChange={(e) => setAchievementCategoryFilter(e.target.value as any)}
                aria-label="Filter Achievements by Category"
                className="text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-600 shadow-xs cursor-pointer w-full sm:w-auto"
              >
                <option value="all">All Categories ({completedSeriesBadges.length})</option>
                <option value="collection">Series Collection ({collectionBadges.length})</option>
                <option value="reading">Reading Mastery ({readingBadges.length})</option>
                <option value="events">Crossover Events ({eventBadges.length})</option>
              </select>
            </div>
          </div>

          {/* Grouped Category Sections */}
          <div className="space-y-8">

            {/* Helper to render a badge card */}
            {(() => {
              const renderBadgeCard = (badge: typeof completedSeriesBadges[0]) => {
                const IconComp = badge.icon;
                return (
                  <div 
                    key={badge.id}
                    className={`bg-white dark:bg-slate-900 border-2 ${badge.theme.border} rounded-2xl p-5 shadow-sm hover:shadow-md transition-all relative overflow-hidden group space-y-4`}
                  >
                    {/* Top Ribbon */}
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full ${badge.theme.ribbon}`}>
                          {badge.theme.metalEmoji} {badge.badgeTitle}
                        </span>
                        {badge.isGrandMastery && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-gradient-to-r from-emerald-500 to-amber-500 text-white shadow-2xs">
                            👑 100% Collected & Read
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 shrink-0">
                        {badge.categoryLabel}
                      </span>
                    </div>

                    {/* Main Title & Icon */}
                    <div className="flex items-start gap-4">
                      <div className={`w-14 h-14 rounded-2xl ${badge.theme.iconBg} border flex items-center justify-center shrink-0 shadow-xs group-hover:scale-105 transition-all`}>
                        <IconComp className="w-7 h-7" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                          {badge.publisher}
                        </span>
                        <h5 className="font-black text-slate-900 dark:text-slate-100 text-base leading-snug line-clamp-2">
                          {badge.name}
                        </h5>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {badge.description}
                        </p>
                      </div>
                    </div>

                    {/* Stats & Value Footer */}
                    <div className={`p-3 rounded-xl border flex items-center justify-between text-xs ${badge.theme.statBg}`}>
                      <div>
                        <span className="text-slate-500 dark:text-slate-400 text-[10px] block font-medium">
                          {badge.category === 'collection' ? 'Collection Run' : badge.category === 'reading' ? 'Reading Progress' : 'Event Status'}
                        </span>
                        <span className="font-bold text-slate-900 dark:text-slate-100">
                          {badge.category === 'collection'
                            ? `${badge.issueCount} / ${badge.totalPublished} (100% Owned)`
                            : badge.category === 'reading'
                            ? `${badge.readCount} / ${badge.issueCount} (100% Read)`
                            : `${badge.issueCount} Issues (100% Owned & Read)`}
                        </span>
                        {badge.category === 'collection' && (
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-normal mt-0.5">
                            {badge.readCount} of {badge.issueCount} read
                          </span>
                        )}
                        {badge.category === 'reading' && (
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-normal mt-0.5">
                            {badge.issueCount} of {badge.totalPublished} owned
                          </span>
                        )}
                      </div>
                      <div className="text-right flex flex-col items-end">
                        <span className="text-slate-500 dark:text-slate-400 text-[10px] block font-medium">Est. Value</span>
                        <span className="font-bold text-emerald-700 dark:text-emerald-400">${badge.totalValue.toFixed(2)}</span>
                        {onViewSeriesInCatalog && (
                          <button
                            type="button"
                            onClick={() => onViewSeriesInCatalog(badge.name)}
                            className="mt-1 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5 cursor-pointer"
                          >
                            <span>View Run</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              };

              return (
                <>
                  {/* SECTION 1: SERIES COLLECTION ACHIEVEMENTS (100% OWNED) */}
                  {(achievementCategoryFilter === 'all' || achievementCategoryFilter === 'collection') && (
                    <div className="space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 gap-2">
                        <div>
                          <h4 className="font-bold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
                            <Crown className="w-5 h-5 text-amber-500" />
                            <span>Series Collection Achievements (100% Owned)</span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-200 font-black">
                              {collectionBadges.length}
                            </span>
                          </h4>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            Awarded for collecting 100% of published issues in a series run. Tiers scale from Silver (1–4 issues) and Gold (5–24 issues) to Platinum (25+ issues).
                          </p>
                        </div>
                      </div>

                      {collectionBadges.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                          {collectionBadges.map(renderBadgeCard)}
                        </div>
                      ) : (
                        <div className="bg-slate-50 dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-800 rounded-2xl p-6 text-center space-y-2">
                          <Crown className="w-8 h-8 text-slate-400 mx-auto" />
                          <h5 className="font-bold text-slate-700 dark:text-slate-300 text-xs">No Series Collection Badges Yet</h5>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                            Collect all published issues of any series to unlock your first Series Run badge!
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* SECTION 2: READING MASTERY ACHIEVEMENTS (100% READ) */}
                  {(achievementCategoryFilter === 'all' || achievementCategoryFilter === 'reading') && (
                    <div className="space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 gap-2">
                        <div>
                          <h4 className="font-bold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
                            <BookOpen className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                            <span>Reading Mastery Achievements (100% Read)</span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-950/70 text-cyan-900 dark:text-cyan-200 font-black">
                              {readingBadges.length}
                            </span>
                          </h4>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            Awarded when 100% of the issues you own in a series have been read. Tiers scale from Silver (1–4 issues) and Gold (5–24 issues) to Platinum (25+ issues).
                          </p>
                        </div>
                      </div>

                      {readingBadges.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                          {readingBadges.map(renderBadgeCard)}
                        </div>
                      ) : (
                        <div className="bg-slate-50 dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-800 rounded-2xl p-6 text-center space-y-2">
                          <BookOpen className="w-8 h-8 text-slate-400 mx-auto" />
                          <h5 className="font-bold text-slate-700 dark:text-slate-300 text-xs">No Reading Mastery Badges Yet</h5>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                            Read all owned issues in any series to earn your first Reading Mastery badge!
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* SECTION 3: CROSSOVER EVENT CHAMPIONS */}
                  {(achievementCategoryFilter === 'all' || achievementCategoryFilter === 'events') && (
                    <div className="space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 gap-2">
                        <div>
                          <h4 className="font-bold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                            <span>Crossover Event Champions</span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950/70 text-purple-900 dark:text-purple-200 font-black">
                              {eventBadges.length}
                            </span>
                          </h4>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            Awarded for completing and reading entire crossover story arcs with 0 missing issues on your wishlist.
                          </p>
                        </div>
                      </div>

                      {eventBadges.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                          {eventBadges.map(renderBadgeCard)}
                        </div>
                      ) : (
                        <div className="bg-slate-50 dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-800 rounded-2xl p-6 text-center space-y-2">
                          <Sparkles className="w-8 h-8 text-slate-400 mx-auto" />
                          <h5 className="font-bold text-slate-700 dark:text-slate-300 text-xs">No Crossover Event Badges Yet</h5>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                            Collect and read every issue assigned to a crossover event to unlock your first Diamond Event Champion badge!
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </>
              );
            })()}

          </div>

          {/* In-Progress Series Milestones (50% - 99%) */}
          {inProgressMilestones.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
                  <Target className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Next 100% Run Badges In-Progress ({inProgressMilestones.length} Series)</span>
                </h4>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Almost completed!</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {inProgressMilestones.map((s) => (
                  <div key={s.seriesName || s.title} className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <h5 className="font-bold text-slate-900 dark:text-slate-100 text-xs truncate">{s.seriesName || s.title}</h5>
                      <span className="text-[10px] font-black text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-950/70 px-2 py-0.5 rounded-full">
                        {s.collectionPct}%
                      </span>
                    </div>

                    <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-indigo-500 h-full rounded-full transition-all duration-500" style={{ width: `${s.collectionPct}%` }}></div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                      <span>{s.ownedCount} of {s.totalIssues} owned (<strong className="text-amber-800 dark:text-amber-400">{s.remainingIssues} left</strong>)</span>
                      {onViewSeriesInCatalog && (
                        <button
                          type="button"
                          onClick={() => onViewSeriesInCatalog(s.seriesName || s.title)}
                          className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5 cursor-pointer shrink-0"
                        >
                          <span>Track</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 4: GENERAL BOX CAPACITY & BREAKDOWN */}
      {/* ========================================================================= */}
      {activeStatsTab === 'general' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Chart 1: Box Capacity Utilization Across Short Boxes */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
                <Boxes className="w-4 h-4 text-slate-700 dark:text-slate-300" />
                <span>Storage Box Capacity Utilization (Units)</span>
              </h3>
              <span className="text-xs text-slate-500 dark:text-slate-400">Max ~150 per box</span>
            </div>

            <div className="h-64 mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={boxCapacityData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.3} />
                  <XAxis dataKey="boxName" stroke="#64748b" fontSize={10} interval={0} angle={-30} textAnchor="end" />
                  <YAxis stroke="#64748b" fontSize={10} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderRadius: '8px', color: '#0f172a' }}
                  />
                  <Bar dataKey="usedUnits" name="Used Units" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="maxCapacity" name="Max Capacity" fill="#94a3b8" opacity={0.4} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: Publisher Breakdown */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-slate-700 dark:text-slate-300" />
                <span>Publisher Distribution</span>
              </h3>
              <span className="text-xs text-slate-500 dark:text-slate-400">Total Titles</span>
            </div>

            <div className="h-64 mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={publisherData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={85}
                    paddingAngle={5}
                    dataKey="count"
                    label={({ name, percent }) => `${name} (${((percent || 0) * 100).toFixed(0)}%)`}
                    labelLine={false}
                  >
                    {publisherData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderRadius: '8px', color: '#0f172a' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Storage Box Breakdown & Contents Inspector Section */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs col-span-1 lg:col-span-2 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300">
                    <Boxes className="w-4 h-4" />
                  </span>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Storage Box Breakdown & Contents Inspector</h3>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Inspect the exact comic titles, publisher distribution, and reading status for individual storage boxes.
                </p>
              </div>

              {/* Box Selector Dropdown */}
              <div className="flex items-center gap-2 shrink-0">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                  Select Box:
                </label>
                <select
                  value={selectedBoxId}
                  onChange={(e) => setSelectedBoxId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-bold text-xs rounded-xl px-3.5 py-2 focus:outline-none focus:ring-2 focus:ring-slate-800 dark:focus:ring-indigo-500 shadow-xs transition-all min-w-[220px]"
                >
                  <option value="all">🌐 All Boxes Comparison ({boxBreakdowns.length} Boxes)</option>
                  <optgroup label="Individual Boxes">
                    {boxBreakdowns.map((b) => (
                      <option key={b.boxId} value={b.boxId}>
                        📦 Box #{b.boxId} ({b.itemCount} comics, {b.percentFull}% full)
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
            </div>

            {selectedBoxId === 'all' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* All Boxes - Top 10 Series */}
                <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 rounded-xl p-4">
                  <h4 className="font-bold text-slate-800 dark:text-slate-200 text-xs flex items-center gap-2 mb-3">
                    <BarChart3 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    Top Comic Titles Across All Boxes
                  </h4>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={allBoxesSeriesData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.3} />
                        <XAxis type="number" stroke="#64748b" fontSize={10} />
                        <YAxis dataKey="name" type="category" stroke="#64748b" fontSize={10} width={120} />
                        <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderRadius: '8px', color: '#0f172a' }} />
                        <Bar dataKey="count" name="Issues Stored" fill="#6366F1" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* All Boxes - Reading Progress per Box */}
                <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 rounded-xl p-4">
                  <h4 className="font-bold text-slate-800 dark:text-slate-200 text-xs flex items-center gap-2 mb-3">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    Reading Status Breakdown by Box
                  </h4>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={boxReadingStatusComparison} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.3} />
                        <XAxis dataKey="boxName" stroke="#64748b" fontSize={10} />
                        <YAxis stroke="#64748b" fontSize={10} />
                        <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderRadius: '8px', color: '#0f172a' }} />
                        <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                        <Bar dataKey="Read" fill="#10B981" stackId="a" radius={[0, 0, 0, 0]} />
                        <Bar dataKey="Unread" fill="#6366F1" stackId="a" radius={[0, 0, 0, 0]} />
                        <Bar dataKey="In Progress" fill="#F59E0B" stackId="a" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            ) : (
              (() => {
                const activeBox = boxBreakdowns.find((b) => b.boxId === selectedBoxId) || boxBreakdowns[0];
                if (!activeBox) return null;

                return (
                  <div className="space-y-6">
                    {/* Selected Box Summary Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/60 rounded-xl p-3.5">
                        <p className="text-[10px] font-bold text-indigo-700 dark:text-indigo-400 uppercase tracking-wider">Comics Stored</p>
                        <h4 className="text-xl font-bold text-indigo-950 dark:text-indigo-200 mt-0.5">{activeBox.itemCount} Issues</h4>
                        <p className="text-[10px] text-indigo-800/80 dark:text-indigo-300 font-medium mt-0.5">Physical collection items</p>
                      </div>

                      <div className="bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-xl p-3.5">
                        <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Box Capacity</p>
                        <h4 className="text-xl font-bold text-emerald-950 dark:text-emerald-200 mt-0.5">{activeBox.usedUnits} / {activeBox.maxCapacity} Units</h4>
                        <p className="text-[10px] text-emerald-800/80 dark:text-emerald-300 font-semibold mt-0.5">{activeBox.percentFull}% Full</p>
                      </div>

                      <div className="bg-amber-50/50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-xl p-3.5">
                        <p className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">Est. Box Value</p>
                        <h4 className="text-xl font-bold text-amber-950 dark:text-amber-200 mt-0.5">${activeBox.totalValue.toFixed(2)}</h4>
                        <p className="text-[10px] text-amber-800/80 dark:text-amber-300 font-medium mt-0.5">Key issues & hardcovers</p>
                      </div>

                      <div className="bg-purple-50/50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/60 rounded-xl p-3.5">
                        <p className="text-[10px] font-bold text-purple-700 dark:text-purple-400 uppercase tracking-wider">Read Progress</p>
                        <h4 className="text-xl font-bold text-purple-950 dark:text-purple-200 mt-0.5">{activeBox.readCount} Read / {activeBox.unreadCount} Unread</h4>
                        <p className="text-[10px] text-purple-800/80 dark:text-purple-300 font-medium mt-0.5">{activeBox.itemCount > 0 ? Math.round((activeBox.readCount / activeBox.itemCount) * 100) : 0}% Read rate</p>
                      </div>
                    </div>

                    {/* Side-by-side charts for this box */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Chart: Top Series in this Box */}
                      <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 rounded-xl p-4">
                        <h4 className="font-bold text-slate-800 dark:text-slate-200 text-xs flex items-center gap-2 mb-3">
                          <BarChart3 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                          Top Series in Box #{activeBox.boxId}
                        </h4>
                        {activeBox.seriesData.length === 0 ? (
                          <div className="h-56 flex items-center justify-center text-xs text-slate-400">No comics stored in this box yet.</div>
                        ) : (
                          <div className="h-56">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={activeBox.seriesData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.3} />
                                <XAxis type="number" stroke="#64748b" fontSize={10} />
                                <YAxis dataKey="name" type="category" stroke="#64748b" fontSize={10} width={120} />
                                <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderRadius: '8px', color: '#0f172a' }} />
                                <Bar dataKey="count" name="Issues" fill="#6366F1" radius={[0, 4, 4, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        )}
                      </div>

                      {/* Chart: Publisher Distribution in this Box */}
                      <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 rounded-xl p-4">
                        <h4 className="font-bold text-slate-800 dark:text-slate-200 text-xs flex items-center gap-2 mb-3">
                          <BarChart3 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          Publishers in Box #{activeBox.boxId}
                        </h4>
                        {activeBox.publisherData.length === 0 ? (
                          <div className="h-56 flex items-center justify-center text-xs text-slate-400">No publishers to display.</div>
                        ) : (
                          <div className="h-56">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={activeBox.publisherData}
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={45}
                                  outerRadius={75}
                                  paddingAngle={4}
                                  dataKey="count"
                                  label={({ name, value }: any) => `${name} (${value})`}
                                  labelLine={false}
                                >
                                  {activeBox.publisherData.map((_, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                  ))}
                                </Pie>
                                <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderRadius: '8px', color: '#0f172a' }} />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Detailed Comics List inside this Box */}
                    <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-slate-50/50 dark:bg-slate-900/50">
                      <div className="bg-slate-100 dark:bg-slate-800 px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                        <h4 className="font-bold text-slate-900 dark:text-slate-100 text-xs flex items-center gap-2">
                          <BookOpen className="w-4 h-4 text-slate-700 dark:text-slate-300" />
                          Comics Inside Box #{activeBox.boxId} ({activeBox.boxComics.length} Items)
                        </h4>
                        <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                          {activeBox.usedUnits} Thickness Units
                        </span>
                      </div>

                      {activeBox.boxComics.length === 0 ? (
                        <div className="p-8 text-center text-slate-400 text-xs">
                          This storage box is currently empty.
                        </div>
                      ) : (
                        <div className="p-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 max-h-96 overflow-y-auto">
                          {activeBox.boxComics.map((comic) => (
                            <div key={comic.id} className="bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-lg p-2 flex flex-col justify-between shadow-xs hover:border-slate-400 dark:hover:border-slate-500 transition-all">
                              <div className="flex gap-2 items-start">
                                <img
                                  src={getComicCoverUrl(comic.coverImage)}
                                  alt=""
                                  loading="lazy"
                                  decoding="async"
                                  onError={handleImageError}
                                  referrerPolicy="no-referrer"
                                  className="w-10 h-14 object-cover rounded shrink-0 border border-slate-100 dark:border-slate-700"
                                />
                                <div className="min-w-0 flex-1">
                                  <h5 className="font-bold text-slate-900 dark:text-slate-100 text-[11px] truncate">{comic.title}</h5>
                                  <p className="text-[10px] font-extrabold text-slate-700 dark:text-slate-300">#{comic.issueNumber}</p>
                                  <p className="text-[9px] text-slate-400 dark:text-slate-500 truncate">{comic.publisher}</p>
                                </div>
                              </div>

                              <div className="mt-2 pt-1.5 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
                                <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                                  comic.readingStatus === 'Read'
                                    ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300'
                                    : comic.readingStatus === 'Reading'
                                    ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300'
                                    : 'bg-indigo-100 dark:bg-indigo-950/70 text-indigo-800 dark:text-indigo-300'
                                }`}>
                                  {comic.readingStatus}
                                </span>
                                <span className="text-[9px] font-medium text-slate-500 dark:text-slate-400">
                                  {comic.sizeThickness}x unit
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()
            )}
          </div>

        </div>
      )}

    </div>
  );
};
