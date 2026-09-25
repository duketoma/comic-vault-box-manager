import React, { useState, useMemo, useEffect } from 'react';
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
  ExternalLink
} from 'lucide-react';

interface ReadingStatsProps {
  comics: ComicBook[];
  boxes: StorageBox[];
  seriesTotals?: SeriesIssueTotal[];
  onViewSeriesInCatalog?: (seriesName: string) => void;
  initialSubTab?: 'events' | 'series' | 'creators' | 'achievements' | 'general';
}

const COLORS = ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];

export const ReadingStats: React.FC<ReadingStatsProps> = ({ 
  comics, 
  boxes, 
  seriesTotals = [], 
  onViewSeriesInCatalog,
  initialSubTab = 'events' 
}) => {
  // Navigation & Sub-Tab State
  const [activeStatsTab, setActiveStatsTab] = useState<'events' | 'series' | 'creators' | 'achievements' | 'general'>(initialSubTab);

  useEffect(() => {
    if (initialSubTab) {
      setActiveStatsTab(initialSubTab);
    }
  }, [initialSubTab]);
  
  // Box Inspector State
  const [selectedBoxId, setSelectedBoxId] = useState<number | 'all'>('all');
  
  // Event Filter State
  const [selectedEvent, setSelectedEvent] = useState<string>('all');
  
  // Series Filter & Sort State
  const [seriesSortBy, setSeriesSortBy] = useState<'owned' | 'collection' | 'remaining' | 'read_completion' | 'value' | 'alphabetical'>('owned');
  const [seriesRunFilter, setSeriesRunFilter] = useState<'all' | 'complete' | 'near' | 'in_progress'>('all');
  const [seriesSearchQuery, setSeriesSearchQuery] = useState<string>('');
  const [expandedSeriesName, setExpandedSeriesName] = useState<string | null>(null);
  const [copiedSeriesMissing, setCopiedSeriesMissing] = useState<string | null>(null);

  // Creator & Contributor State
  const [creatorSearchQuery, setCreatorSearchQuery] = useState<string>('');
  const [creatorRoleFilter, setCreatorRoleFilter] = useState<string>('all');
  const [onlyPencillersWhoWrite, setOnlyPencillersWhoWrite] = useState<boolean>(false);
  const [selectedCreatorForIssues, setSelectedCreatorForIssues] = useState<string | null>(null);

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

  // Fallback default event options if collection doesn't have many custom events
  const defaultEventOptions = useMemo(() => {
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
    const combined = new Set([...allEventsList, ...defaultList]);
    return Array.from(combined).sort((a, b) => a.localeCompare(b));
  }, [allEventsList]);

  // Selected Event Filtered Comics
  const filteredEventComics = useMemo(() => {
    if (selectedEvent === 'all') {
      return comics.filter((c) => Boolean(c.event && c.event.trim()));
    }
    return comics.filter((c) => c.event && c.event.trim().toLowerCase() === selectedEvent.toLowerCase());
  }, [comics, selectedEvent]);

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
  const totalsMap = useMemo(() => {
    const map = new Map<string, number>();
    (seriesTotals || []).forEach((st) => {
      if (st.seriesName) {
        map.set(st.seriesName.trim().toLowerCase(), st.issueCount);
      }
    });
    return map;
  }, [seriesTotals]);

  const seriesSummary = useMemo(() => {
    interface SeriesEntry {
      title: string;
      seriesName: string;
      publisher: string;
      volume?: string;
      totalIssues: number;
      hasKnownTotal: boolean;
      ownedCount: number;
      readCount: number;
      unreadCount: number;
      readingCount: number;
      wishlistCount: number;
      totalValue: number;
      collectionPct: number;
      remainingIssues: number;
      isRunComplete: boolean;
      readPct: number;
      is100PercentRead: boolean;
      comics: ComicBook[];
      ownedIssueNumbers: number[];
      wishlistIssueNumbers: number[];
      missingIssueNumbers: number[];
    }

    const map: Record<string, SeriesEntry> = {};

    comics.forEach((c) => {
      const sName = c.seriesName?.trim();
      const t = c.title?.trim() || 'Untitled Comic';
      const seriesKey = sName || t;

      if (!map[seriesKey]) {
        let totalCount = 0;
        let hasKnown = false;

        if (sName && totalsMap.has(sName.toLowerCase())) {
          totalCount = totalsMap.get(sName.toLowerCase())!;
          hasKnown = true;
        } else if (totalsMap.has(t.toLowerCase())) {
          totalCount = totalsMap.get(t.toLowerCase())!;
          hasKnown = true;
        }

        map[seriesKey] = {
          title: t,
          seriesName: seriesKey,
          publisher: c.publisher || 'Unknown',
          volume: c.volume,
          totalIssues: totalCount,
          hasKnownTotal: hasKnown,
          ownedCount: 0,
          readCount: 0,
          unreadCount: 0,
          readingCount: 0,
          wishlistCount: 0,
          totalValue: 0,
          collectionPct: 0,
          remainingIssues: 0,
          isRunComplete: false,
          readPct: 0,
          is100PercentRead: false,
          comics: [],
          ownedIssueNumbers: [],
          wishlistIssueNumbers: [],
          missingIssueNumbers: [],
        };
      }

      map[seriesKey].comics.push(c);

      if (c.readingStatus === 'Wishlist') {
        map[seriesKey].wishlistCount += 1;
      } else {
        map[seriesKey].ownedCount += 1;
        map[seriesKey].totalValue += (c.estimatedValue || 0);
        if (c.readingStatus === 'Read') {
          map[seriesKey].readCount += 1;
        } else if (c.readingStatus === 'Reading') {
          map[seriesKey].readingCount += 1;
        } else {
          map[seriesKey].unreadCount += 1;
        }
      }
    });

    let list = Object.values(map).map((s) => {
      const effectiveTotal = s.hasKnownTotal ? s.totalIssues : Math.max(s.ownedCount, s.ownedCount + s.wishlistCount);
      const collectionPct = effectiveTotal > 0 ? Math.min(100, Math.round((s.ownedCount / effectiveTotal) * 100)) : 0;
      const remainingIssues = Math.max(0, effectiveTotal - s.ownedCount);
      const isRunComplete = s.hasKnownTotal && s.ownedCount >= s.totalIssues && s.totalIssues > 0;
      const readPct = s.ownedCount > 0 ? Math.round((s.readCount / s.ownedCount) * 100) : 0;
      const is100PercentRead = s.ownedCount > 0 && s.readCount === s.ownedCount;

      const ownedNums: number[] = [];
      const wishlistNums: number[] = [];
      s.comics.forEach(c => {
        const num = parseInt(c.issueNumber, 10);
        if (!isNaN(num)) {
          if (c.readingStatus === 'Wishlist') {
            if (!wishlistNums.includes(num)) wishlistNums.push(num);
          } else {
            if (!ownedNums.includes(num)) ownedNums.push(num);
          }
        }
      });
      ownedNums.sort((a, b) => a - b);
      wishlistNums.sort((a, b) => a - b);
      const ownedSet = new Set(ownedNums);
      const missingIssues: number[] = [];
      for (let i = 1; i <= Math.min(effectiveTotal, 300); i++) {
        if (!ownedSet.has(i)) {
          missingIssues.push(i);
        }
      }

      return {
        ...s,
        totalIssues: effectiveTotal,
        collectionPct,
        remainingIssues,
        isRunComplete,
        readPct,
        is100PercentRead,
        ownedIssueNumbers: ownedNums,
        wishlistIssueNumbers: wishlistNums,
        missingIssueNumbers: missingIssues,
      };
    });

    if (seriesSortBy === 'owned') {
      list.sort((a, b) => b.ownedCount - a.ownedCount);
    } else if (seriesSortBy === 'collection') {
      list.sort((a, b) => b.collectionPct - a.collectionPct || b.ownedCount - a.ownedCount);
    } else if (seriesSortBy === 'remaining') {
      list.sort((a, b) => {
        const aHasRemaining = !a.isRunComplete && a.collectionPct < 100 && a.remainingIssues > 0;
        const bHasRemaining = !b.isRunComplete && b.collectionPct < 100 && b.remainingIssues > 0;
        if (aHasRemaining && !bHasRemaining) return -1;
        if (!aHasRemaining && bHasRemaining) return 1;
        return a.remainingIssues - b.remainingIssues || b.collectionPct - a.collectionPct;
      });
    } else if (seriesSortBy === 'read_completion') {
      list.sort((a, b) => b.readPct - a.readPct || b.ownedCount - a.ownedCount);
    } else if (seriesSortBy === 'value') {
      list.sort((a, b) => b.totalValue - a.totalValue);
    } else if (seriesSortBy === 'alphabetical') {
      list.sort((a, b) => a.seriesName.localeCompare(b.seriesName));
    }

    return list;
  }, [comics, totalsMap, seriesSortBy]);

  // Filtered series list based on run filter and search
  const filteredSeries = useMemo(() => {
    let result = seriesSummary;
    if (seriesRunFilter === 'complete') {
      result = result.filter((s) => s.isRunComplete || s.collectionPct === 100);
    } else if (seriesRunFilter === 'near') {
      result = result.filter((s) => !s.isRunComplete && s.collectionPct >= 75);
    } else if (seriesRunFilter === 'in_progress') {
      result = result.filter((s) => !s.isRunComplete && s.collectionPct < 75);
    }
    if (seriesSearchQuery.trim()) {
      const q = seriesSearchQuery.toLowerCase();
      result = result.filter((s) =>
        s.seriesName.toLowerCase().includes(q) ||
        s.title.toLowerCase().includes(q) ||
        s.publisher.toLowerCase().includes(q)
      );
    }
    return result;
  }, [seriesSummary, seriesRunFilter, seriesSearchQuery]);

  // Aggregate Series Overview Metrics
  const seriesOverviewStats = useMemo(() => {
    const totalRuns = seriesSummary.length;
    const completedRuns = seriesSummary.filter((s) => s.isRunComplete || s.collectionPct === 100).length;
    const nearCompleteRuns = seriesSummary.filter((s) => !s.isRunComplete && s.collectionPct >= 75).length;
    const totalPublishedIssues = seriesSummary.reduce((acc, s) => acc + s.totalIssues, 0);
    const totalOwnedInSeries = seriesSummary.reduce((acc, s) => acc + s.ownedCount, 0);
    const overallRunCollectionPct = totalPublishedIssues > 0 ? Math.round((totalOwnedInSeries / totalPublishedIssues) * 100) : 0;
    return {
      totalRuns,
      completedRuns,
      nearCompleteRuns,
      totalPublishedIssues,
      totalOwnedInSeries,
      overallRunCollectionPct,
    };
  }, [seriesSummary]);

  // Top 10 Series for Bar Chart (Showing Owned vs Total Published Issues)
  const topSeriesChartData = useMemo(() => {
    let source = seriesSummary;
    if (seriesSortBy === 'remaining') {
      source = source.filter((s) => !s.isRunComplete && s.collectionPct < 100 && s.remainingIssues > 0);
    }
    return source.slice(0, 10).map((s) => ({
      name: s.seriesName.length > 20 ? `${s.seriesName.slice(0, 18)}...` : s.seriesName,
      fullName: s.seriesName,
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
    // 1. Collect all Full Series Run Completed badges (100% Collected)
    const runCompleteBadges = seriesSummary
      .filter((s) => s.isRunComplete || (s.totalIssues > 0 && s.ownedCount >= s.totalIssues))
      .map((s) => ({
        id: `run-${s.seriesName}`,
        name: s.seriesName,
        type: 'Full Run Complete' as const,
        publisher: s.publisher,
        issueCount: s.ownedCount,
        readCount: s.readCount,
        totalValue: s.totalValue,
        badgeTier: s.totalIssues >= 25 ? 'Platinum Run Master' : s.totalIssues >= 5 ? 'Gold Complete Run' : 'Complete Series Run',
        icon: Crown,
      }));

    // 2. Collect 100% Read series (where readCount === ownedCount)
    const seriesReadBadges = seriesSummary
      .filter((s) => s.ownedCount > 0 && s.is100PercentRead && !s.isRunComplete)
      .map((s) => ({
        id: `series-read-${s.seriesName}`,
        name: s.seriesName,
        type: 'Series (100% Read)' as const,
        publisher: s.publisher,
        issueCount: s.ownedCount,
        readCount: s.readCount,
        totalValue: s.totalValue,
        badgeTier: s.ownedCount >= 5 ? 'Gold Mastery' : s.ownedCount >= 2 ? 'Silver Perfection' : 'Key Masterpiece',
        icon: Trophy,
      }));

    // 3. Collect 100% completed events
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
        type: 'Crossover Event' as const,
        publisher: 'Crossover',
        issueCount: e.owned,
        readCount: e.read,
        totalValue: e.value,
        badgeTier: 'Diamond Event Champion',
        icon: Sparkles,
      }));

    return [...runCompleteBadges, ...seriesReadBadges, ...eventBadges];
  }, [seriesSummary, comics]);

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
    pencillersWhoWroteList,
    totalCreditsCount,
    allUniqueRoles,
    characterRankingList,
  } = useMemo(() => {
    interface CreatorAcc {
      name: string;
      totalIssues: number;
      roles: Record<string, number>;
      series: Record<string, number>;
      issues: Array<{
        id: string | number;
        title: string;
        issueNumber: string;
        seriesName?: string;
        coverImage?: string;
        roles: string[];
        readingStatus: string;
      }>;
    }

    const creatorMap: Record<string, CreatorAcc> = {};
    const roleCountMap: Record<string, number> = {};
    const charMap: Record<string, { name: string; total: number; main: number; supporting: number; cameo: number }> = {};
    let totalCredits = 0;

    const isWritingRole = (role: string): boolean => {
      const r = role.toLowerCase();
      return r.includes('writ') || r.includes('story') || r.includes('script') || r.includes('plot') || r.includes('author');
    };

    const isArtRole = (role: string): boolean => {
      const r = role.toLowerCase();
      return r.includes('pencil') || r.includes('artist') || r.includes('illustrat') || r.includes('draw') || r.includes('art');
    };

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
        });
      });

      // Character appearances
      if (comic.characterAppearances && comic.characterAppearances.length > 0) {
        comic.characterAppearances.forEach((ca) => {
          if (ca.characterName && ca.characterName.trim()) {
            const cName = ca.characterName.trim();
            if (!charMap[cName]) {
              charMap[cName] = { name: cName, total: 0, main: 0, supporting: 0, cameo: 0 };
            }
            charMap[cName].total++;
            const type = (ca.appearanceType || 'Main').toLowerCase();
            if (type.includes('main')) charMap[cName].main++;
            else if (type.includes('support')) charMap[cName].supporting++;
            else if (type.includes('cameo')) charMap[cName].cameo++;
            else charMap[cName].main++;
          }
        });
      }
    });

    // Build finalized creator objects with multi-role and penciller-who-wrote detection
    const creatorList = Object.values(creatorMap).map((cr) => {
      const roleKeys = Object.keys(cr.roles);
      const hasArtRole = roleKeys.some(isArtRole);
      const hasWritingRole = roleKeys.some(isWritingRole);
      const isPencillerWhoWrote = hasArtRole && hasWritingRole;

      const dualRoleIssuesCount = cr.issues.filter((iss) => {
        const hasArt = iss.roles.some(isArtRole);
        const hasWrit = iss.roles.some(isWritingRole);
        return hasArt && hasWrit;
      }).length;

      const artIssuesCount = cr.issues.filter((iss) => iss.roles.some(isArtRole)).length;
      const writingIssuesCount = cr.issues.filter((iss) => iss.roles.some(isWritingRole)).length;

      const topSeries = Object.entries(cr.series)
        .map(([series, count]) => ({ series, count }))
        .sort((a, b) => b.count - a.count);

      return {
        ...cr,
        roleKeys,
        hasArtRole,
        hasWritingRole,
        isPencillerWhoWrote,
        dualRoleIssuesCount,
        artIssuesCount,
        writingIssuesCount,
        topSeries,
      };
    }).sort((a, b) => b.totalIssues - a.totalIssues);

    const pencillersWhoWroteList = creatorList.filter((c) => c.isPencillerWhoWrote);

    const roleDistributionData = Object.entries(roleCountMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const allUniqueRoles = Object.keys(roleCountMap).sort((a, b) => a.localeCompare(b));

    const characterRankingList = Object.values(charMap).sort((a, b) => b.total - a.total);

    return {
      creatorList,
      roleDistributionData,
      pencillersWhoWroteList,
      totalCreditsCount: totalCredits,
      allUniqueRoles,
      characterRankingList,
    };
  }, [comics]);

  // Filtered Creators based on search query, role filter, and dual-role toggle
  const filteredCreators = useMemo(() => {
    return creatorList.filter((cr) => {
      if (creatorSearchQuery.trim()) {
        const query = creatorSearchQuery.toLowerCase().trim();
        const matchesName = cr.name.toLowerCase().includes(query);
        const matchesSeries = cr.topSeries.some((s) => s.series.toLowerCase().includes(query));
        if (!matchesName && !matchesSeries) return false;
      }

      if (creatorRoleFilter !== 'all') {
        if (!cr.roleKeys.includes(creatorRoleFilter)) return false;
      }

      if (onlyPencillersWhoWrite && !cr.isPencillerWhoWrote) {
        return false;
      }

      return true;
    });
  }, [creatorList, creatorSearchQuery, creatorRoleFilter, onlyPencillersWhoWrite]);

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
      <div className="bg-slate-100 dark:bg-slate-900 p-1.5 rounded-2xl flex items-center justify-between gap-2 overflow-x-auto border border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-1.5 min-w-max">
          
          <button
            onClick={() => setActiveStatsTab('events')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeStatsTab === 'events'
                ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-sm'
                : 'text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Event Status Graph</span>
            {allEventsList.length > 0 && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${activeStatsTab === 'events' ? 'bg-slate-700 dark:bg-indigo-800 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}>
                {allEventsList.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveStatsTab('series')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeStatsTab === 'series'
                ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-sm'
                : 'text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <BarChart3 className="w-4 h-4 text-indigo-400" />
            <span>Comic Titles / Series Graph</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${activeStatsTab === 'series' ? 'bg-slate-700 dark:bg-indigo-800 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}>
              {seriesSummary.length}
            </span>
          </button>

          <button
            onClick={() => setActiveStatsTab('creators')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeStatsTab === 'creators'
                ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-sm'
                : 'text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <Palette className="w-4 h-4 text-violet-400" />
            <span>Creators & Roles Breakdown</span>
            {creatorList.length > 0 && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${activeStatsTab === 'creators' ? 'bg-slate-700 dark:bg-indigo-800 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}>
                {creatorList.length}
              </span>
            )}
            {pencillersWhoWroteList.length > 0 && (
              <span className="text-[9px] px-1.5 py-0.2 bg-violet-100 dark:bg-violet-950/60 text-violet-800 dark:text-violet-300 font-bold rounded-full">
                {pencillersWhoWroteList.length} 🎨✍️
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveStatsTab('achievements')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeStatsTab === 'achievements'
                ? 'bg-gradient-to-r from-amber-600 to-purple-700 text-white shadow-sm'
                : 'text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <Trophy className="w-4 h-4 text-amber-300" />
            <span>100% Completion Achievements</span>
            {completedSeriesBadges.length > 0 && (
              <span className="text-[10px] px-2 py-0.2 bg-amber-400 text-amber-950 font-black rounded-full shadow-xs">
                {completedSeriesBadges.length} 🏆
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveStatsTab('general')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeStatsTab === 'general'
                ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-sm'
                : 'text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <Boxes className="w-4 h-4 text-emerald-400" />
            <span>Box Capacity & General</span>
          </button>

        </div>
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
                  <optgroup label="Events in Your Collection">
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
          {filteredEventComics.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
                  <Bookmark className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span>Comics in {selectedEvent === 'all' ? 'Crossover Events' : `"${selectedEvent}"`} ({filteredEventComics.length})</span>
                </h4>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold">
                  {eventStats.read} of {eventStats.owned} Read ({eventStats.completionRate}%)
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pt-2">
                {filteredEventComics.map((comic) => (
                  <div key={comic.id} className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/70 rounded-xl p-2.5 flex items-start gap-3 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">
                    <img
                      src={getComicCoverUrl(comic.coverImage)}
                      onError={handleImageError}
                      alt={comic.title}
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
                      {comic.event && (
                        <p className="text-[10px] font-medium text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/80 px-1.5 py-0.5 rounded inline-block truncate max-w-full">
                          ⚡ {comic.event}
                        </p>
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

              {/* Sort Selector for Series */}
              <div className="flex items-center gap-2 shrink-0">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                  Sort Series By:
                </label>
                <select
                  value={seriesSortBy}
                  onChange={(e) => setSeriesSortBy(e.target.value as any)}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-bold text-xs rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-800 dark:focus:ring-indigo-500 shadow-xs"
                >
                  <option value="collection">Collection Progress % (Run Completion)</option>
                  <option value="remaining">Closest to Completion (Fewest Remaining)</option>
                  <option value="owned">Most Owned Issues</option>
                  <option value="read_completion">Highest Read Completion %</option>
                  <option value="value">Highest Total Value ($)</option>
                  <option value="alphabetical">Alphabetical (A-Z)</option>
                </select>
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
                  {seriesSortBy === 'remaining' ? 'Showing top 10 series with issues remaining' : 'Showing top 10 series'}
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

          {/* Filter & Search Bar for Series */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              <button
                onClick={() => setSeriesRunFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  seriesRunFilter === 'all'
                    ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                All Series ({seriesSummary.length})
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
                onClick={() => setSeriesRunFilter('in_progress')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  seriesRunFilter === 'in_progress'
                    ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                In Progress &lt;75% ({seriesSummary.length - seriesOverviewStats.completedRuns - seriesOverviewStats.nearCompleteRuns})
              </button>
            </div>

            <div className="relative min-w-[220px]">
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

          {/* Complete Series Grid View */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
                <Layers3 className="w-4 h-4 text-slate-700 dark:text-slate-300" />
                <span>All Series & Title Runs ({filteredSeries.length} Shown)</span>
              </h4>
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
                    Comic Creators, Contributor Roles & Character Appearances
                  </h3>
                </div>
                <p className="text-xs text-indigo-100 max-w-2xl">
                  Analyze credits for writers, pencillers, inkers, colorists, and editors across your collection. Highlight creators who bridge roles—especially pencillers who also contribute to writing and stories.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-3 text-center min-w-[110px]">
                  <span className="text-[10px] font-bold text-indigo-200 uppercase tracking-wider block">Creators</span>
                  <span className="text-2xl font-black text-white">{creatorList.length}</span>
                  <span className="text-[10px] text-white/80 block font-medium">Contributors</span>
                </div>
                <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-3 text-center min-w-[110px]">
                  <span className="text-[10px] font-bold text-amber-200 uppercase tracking-wider block">Dual-Talents</span>
                  <span className="text-2xl font-black text-amber-300">{pencillersWhoWroteList.length}</span>
                  <span className="text-[10px] text-white/80 block font-medium">Penciller+Writer</span>
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
                <span className="text-[11px] font-medium text-amber-200 block">Pencillers Who Write</span>
                <span className="text-lg font-black text-amber-300">{pencillersWhoWroteList.length} Creators</span>
                <span className="text-[10px] text-amber-200/80 block mt-0.5">Art & Script masters</span>
              </div>
              <div className="bg-white/10 backdrop-blur-sm border border-white/15 rounded-xl p-3">
                <span className="text-[11px] font-medium text-indigo-200 block">Featured Characters</span>
                <span className="text-lg font-black text-white">{characterRankingList.length} Heroes/Villains</span>
                <span className="text-[10px] text-indigo-200/80 block mt-0.5">Tracked appearances</span>
              </div>
            </div>
          </div>

          {/* SPOTLIGHT: Pencillers Who Also Wrote & Contributed to Story */}
          {pencillersWhoWroteList.length > 0 && (
            <div className="bg-gradient-to-br from-amber-500/10 via-purple-500/10 to-indigo-500/10 dark:from-amber-950/30 dark:via-purple-950/30 dark:to-indigo-950/30 border-2 border-amber-300/80 dark:border-amber-700/60 rounded-2xl p-5 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-amber-200/80 dark:border-amber-800/80">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white shadow-xs">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-black text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
                      <span>Spotlight: Pencillers Who Also Contributed Writing & Story</span>
                      <span className="px-2 py-0.5 rounded-full bg-amber-400 text-amber-950 font-black text-[10px]">
                        {pencillersWhoWroteList.length} Creators
                      </span>
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                      Creators in your collection who both drew/pencilled issues and authored scripts, plots, or story arcs.
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setOnlyPencillersWhoWrite(!onlyPencillersWhoWrite);
                  }}
                  className={`text-xs font-bold px-3.5 py-1.5 rounded-xl transition-all flex items-center gap-1.5 self-start sm:self-auto cursor-pointer ${
                    onlyPencillersWhoWrite
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700/70 text-amber-900 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-slate-700'
                  }`}
                >
                  <Filter className="w-3.5 h-3.5" />
                  {onlyPencillersWhoWrite ? 'Showing Only Pencillers Who Wrote ✓' : 'Filter Table to Dual-Talents'}
                </button>
              </div>

              {/* Dual-Talent Cards Carousel / Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {pencillersWhoWroteList.slice(0, 6).map((c) => (
                  <div
                    key={c.name}
                    className="bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800/80 rounded-xl p-3.5 shadow-xs hover:border-amber-400 dark:hover:border-amber-600 transition-all flex flex-col justify-between space-y-3"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h5 className="font-bold text-slate-900 dark:text-slate-100 text-sm">{c.name}</h5>
                          <span className="text-[10px] font-extrabold text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/70 px-2 py-0.5 rounded-full inline-block mt-0.5">
                            🎨 Penciller & Writer ✍️
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

          {/* Charts Row: Contributor Roles Breakdown & Character Appearances */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Chart 1: Creator Roles Distribution */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                    <span>Contributor Roles Distribution</span>
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Total issues credits by creator role type</p>
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

            {/* Chart 2: Top Character Appearances */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
                    <Users className="w-4 h-4 text-pink-600 dark:text-pink-400" />
                    <span>Top Featured Character Appearances</span>
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Main, supporting, and cameo appearances</p>
                </div>
                <span className="text-xs font-bold text-pink-700 dark:text-pink-300 bg-pink-50 dark:bg-pink-950/60 border border-pink-200 dark:border-pink-800 px-2 py-0.5 rounded-lg">
                  {characterRankingList.length} Characters
                </span>
              </div>

              {characterRankingList.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-center p-4 text-xs text-slate-400 space-y-2">
                  <Users className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                  <p>No character appearance records found yet.</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Sync the "Title Character Appearances" tab from Google Sheets Importer to track character stats!</p>
                </div>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={characterRankingList.slice(0, 7)} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.3} />
                      <XAxis dataKey="name" stroke="#64748b" fontSize={10} interval={0} angle={-25} textAnchor="end" />
                      <YAxis stroke="#64748b" fontSize={10} />
                      <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderRadius: '8px', color: '#0f172a' }} />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                      <Bar dataKey="main" name="Main Role" fill="#EC4899" stackId="a" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="supporting" name="Supporting" fill="#8B5CF6" stackId="a" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="cameo" name="Cameo" fill="#F59E0B" stackId="a" radius={[4, 4, 0, 0]} />
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
                        {cr.isPencillerWhoWrote && (
                          <span className="text-[10px] font-extrabold text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/70 px-2 py-0.5 rounded-full">
                            🎨 Penciller & Writer ✍️
                          </span>
                        )}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Contributed to {cr.totalIssues} issues • Roles: {Object.entries(cr.roles).map(([r, count]) => `${r} (${count})`).join(', ')}
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
                  Search creators, filter by role (Writer, Penciller, Inker, Editor), and inspect individual credits.
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

                {/* Role filter dropdown */}
                <select
                  value={creatorRoleFilter}
                  onChange={(e) => setCreatorRoleFilter(e.target.value)}
                  className="text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                >
                  <option value="all">All Roles ({allUniqueRoles.length})</option>
                  {allUniqueRoles.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>

                {/* Pencillers Who Wrote quick toggle */}
                <button
                  onClick={() => setOnlyPencillersWhoWrite(!onlyPencillersWhoWrite)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer ${
                    onlyPencillersWhoWrite
                      ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  <span>🎨✍️ Dual-Talents Only</span>
                  {pencillersWhoWroteList.length > 0 && (
                    <span className={`text-[10px] px-1.5 rounded-full ${onlyPencillersWhoWrite ? 'bg-amber-700 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'}`}>
                      {pencillersWhoWroteList.length}
                    </span>
                  )}
                </button>

                {/* Reset button */}
                {(creatorSearchQuery || creatorRoleFilter !== 'all' || onlyPencillersWhoWrite) && (
                  <button
                    onClick={() => {
                      setCreatorSearchQuery('');
                      setCreatorRoleFilter('all');
                      setOnlyPencillersWhoWrite(false);
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
              {onlyPencillersWhoWrite && (
                <span className="text-amber-800 dark:text-amber-300 font-bold">Filtered to Pencillers Who Contributed to Writing/Story</span>
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
                      cr.isPencillerWhoWrote ? 'border-amber-200 dark:border-amber-800/80 hover:border-amber-300 dark:hover:border-amber-700' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h5 className="font-bold text-slate-900 dark:text-slate-100 text-sm truncate">{cr.name}</h5>
                          {cr.isPencillerWhoWrote && (
                            <span className="text-[10px] font-extrabold text-amber-900 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/70 px-2 py-0.5 rounded-full inline-block mt-0.5">
                              🎨 Writer & Penciller ✍️
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
                          const isWrit = role.toLowerCase().includes('writ') || role.toLowerCase().includes('story');
                          const isPencil = role.toLowerCase().includes('pencil') || role.toLowerCase().includes('art');
                          return (
                            <span
                              key={role}
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                                isWrit
                                  ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                                  : isPencil
                                  ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
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
      {/* SECTION 3: 100% COMPLETION ACHIEVEMENTS & BADGES */}
      {/* ========================================================================= */}
      {activeStatsTab === 'achievements' && (
        <div className="space-y-6">
          
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-amber-600 via-amber-700 to-purple-800 rounded-2xl p-6 text-white shadow-md space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-amber-400 text-amber-950 font-black">
                    <Trophy className="w-5 h-5" />
                  </span>
                  <h3 className="text-xl font-black tracking-tight text-white">
                    100% Series & Crossover Completion Achievements
                  </h3>
                </div>
                <p className="text-xs text-amber-100 max-w-xl">
                  Celebrate fully completed comic series and crossover events where every acquired issue in your collection is read and mastered!
                </p>
              </div>

              <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-3 text-center shrink-0 min-w-[130px]">
                <span className="text-[10px] font-bold text-amber-200 uppercase tracking-wider block">Unlocked Badges</span>
                <span className="text-3xl font-black text-amber-300">{completedSeriesBadges.length}</span>
                <span className="text-[10px] text-white/80 block font-semibold">Trophies Earned</span>
              </div>
            </div>
          </div>

          {/* 100% Completed Badges Grid */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
                <Crown className="w-5 h-5 text-amber-500" />
                <span>Unlocked 100% Mastery Badges ({completedSeriesBadges.length})</span>
              </h4>
            </div>

            {completedSeriesBadges.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {completedSeriesBadges.map((badge) => {
                  const IconComp = badge.icon;
                  return (
                    <div 
                      key={badge.id}
                      className="bg-white dark:bg-slate-900 border-2 border-amber-300/80 dark:border-amber-700/60 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all relative overflow-hidden group space-y-4"
                    >
                      {/* Top Ribbon */}
                      <div className="flex items-center justify-between border-b border-amber-100 dark:border-amber-900/40 pb-3">
                        <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-gradient-to-r from-amber-500 to-amber-700 text-white shadow-xs">
                          🏆 {badge.badgeTier}
                        </span>
                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">{badge.type}</span>
                      </div>

                      {/* Main Title & Icon */}
                      <div className="flex items-start gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-100 via-amber-200 to-amber-400 dark:from-amber-950/80 dark:via-amber-900/60 dark:to-amber-700/80 border border-amber-300 dark:border-amber-700 flex items-center justify-center text-amber-950 dark:text-amber-200 shrink-0 shadow-sm group-hover:scale-105 transition-all">
                          <IconComp className="w-7 h-7" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="text-[11px] font-bold text-amber-800 dark:text-amber-400 uppercase tracking-wider block">{badge.publisher}</span>
                          <h5 className="font-black text-slate-900 dark:text-slate-100 text-base leading-snug line-clamp-2">{badge.name}</h5>
                        </div>
                      </div>

                      {/* Stats & Value Footer */}
                      <div className="p-3 bg-amber-50/60 dark:bg-amber-950/40 rounded-xl border border-amber-200/80 dark:border-amber-800/60 flex items-center justify-between text-xs">
                        <div>
                          <span className="text-slate-500 dark:text-slate-400 text-[10px] block font-medium">
                            {badge.type === 'Full Run Complete' ? 'Run Completion' : 'Issues Read'}
                          </span>
                          <span className="font-bold text-slate-900 dark:text-slate-100">
                            {badge.type === 'Full Run Complete'
                              ? `${badge.issueCount} / ${badge.issueCount} (100% Owned)`
                              : `${badge.readCount} / ${badge.issueCount} (100%)`}
                          </span>
                          {badge.type === 'Full Run Complete' && (
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-normal mt-0.5">
                              {badge.readCount} of {badge.issueCount} read
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
                })}
              </div>
            ) : (
              <div className="bg-slate-50 dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-800 rounded-2xl p-8 text-center space-y-3">
                <Trophy className="w-10 h-10 text-slate-400 dark:text-slate-500 mx-auto" />
                <h5 className="font-bold text-slate-800 dark:text-slate-200 text-sm">No 100% Completed Series Badges Yet</h5>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  Collect all published issues in a series to earn your first 100% Full Run Mastery Achievement Badge!
                </p>
              </div>
            )}
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
