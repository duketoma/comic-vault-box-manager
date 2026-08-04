import React, { useState, useMemo } from 'react';
import { ComicBook, StorageBox } from '../types';
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
  Filter,
  Info,
  Layers3,
  Bookmark
} from 'lucide-react';

interface ReadingStatsProps {
  comics: ComicBook[];
  boxes: StorageBox[];
}

const COLORS = ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];

export const ReadingStats: React.FC<ReadingStatsProps> = ({ comics, boxes }) => {
  // Navigation & Sub-Tab State
  const [activeStatsTab, setActiveStatsTab] = useState<'events' | 'series' | 'achievements' | 'general'>('events');
  
  // Box Inspector State
  const [selectedBoxId, setSelectedBoxId] = useState<number | 'all'>('all');
  
  // Event Filter State
  const [selectedEvent, setSelectedEvent] = useState<string>('all');
  
  // Series Filter & Sort State
  const [seriesSortBy, setSeriesSortBy] = useState<'owned' | 'completion' | 'value' | 'alphabetical'>('owned');

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
  const seriesSummary = useMemo(() => {
    const map: Record<string, {
      title: string;
      publisher: string;
      ownedCount: number;
      readCount: number;
      unreadCount: number;
      readingCount: number;
      wishlistCount: number;
      totalValue: number;
      comics: ComicBook[];
    }> = {};

    comics.forEach((c) => {
      const t = c.title.trim();
      if (!map[t]) {
        map[t] = {
          title: t,
          publisher: c.publisher || 'Unknown',
          ownedCount: 0,
          readCount: 0,
          unreadCount: 0,
          readingCount: 0,
          wishlistCount: 0,
          totalValue: 0,
          comics: []
        };
      }

      map[t].comics.push(c);

      if (c.readingStatus === 'Wishlist') {
        map[t].wishlistCount += 1;
      } else {
        map[t].ownedCount += 1;
        map[t].totalValue += (c.estimatedValue || 0);
        if (c.readingStatus === 'Read') {
          map[t].readCount += 1;
        } else if (c.readingStatus === 'Reading') {
          map[t].readingCount += 1;
        } else {
          map[t].unreadCount += 1;
        }
      }
    });

    let list = Object.values(map).map((s) => {
      const completionPct = s.ownedCount > 0 ? Math.round((s.readCount / s.ownedCount) * 100) : 0;
      const is100Percent = s.ownedCount > 0 && s.readCount === s.ownedCount;
      return { ...s, completionPct, is100Percent };
    });

    if (seriesSortBy === 'owned') {
      list.sort((a, b) => b.ownedCount - a.ownedCount);
    } else if (seriesSortBy === 'completion') {
      list.sort((a, b) => b.completionPct - a.completionPct || b.ownedCount - a.ownedCount);
    } else if (seriesSortBy === 'value') {
      list.sort((a, b) => b.totalValue - a.totalValue);
    } else if (seriesSortBy === 'alphabetical') {
      list.sort((a, b) => a.title.localeCompare(b.title));
    }

    return list;
  }, [comics, seriesSortBy]);

  // Top 10 Series for Bar Chart
  const topSeriesChartData = useMemo(() => {
    return seriesSummary.slice(0, 10).map((s) => ({
      name: s.title.length > 18 ? `${s.title.slice(0, 16)}...` : s.title,
      fullName: s.title,
      Owned: s.ownedCount,
      Read: s.readCount,
      Wishlist: s.wishlistCount,
      Completion: `${s.completionPct}%`
    }));
  }, [seriesSummary]);

  // -------------------------------------------------------------
  // 3. 100% COMPLETION ACHIEVEMENTS & BADGES
  // -------------------------------------------------------------
  const completedSeriesBadges = useMemo(() => {
    // Collect all 100% completed series
    const seriesBadges = seriesSummary
      .filter((s) => s.ownedCount > 0 && s.is100Percent)
      .map((s) => ({
        id: `series-${s.title}`,
        name: s.title,
        type: 'Series' as const,
        publisher: s.publisher,
        issueCount: s.ownedCount,
        readCount: s.readCount,
        totalValue: s.totalValue,
        badgeTier: s.ownedCount >= 5 ? 'Gold Mastery' : s.ownedCount >= 2 ? 'Silver Perfection' : 'Key Masterpiece',
        icon: s.ownedCount >= 5 ? Crown : Trophy
      }));

    // Collect 100% completed events
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
        icon: Sparkles
      }));

    return [...eventBadges, ...seriesBadges];
  }, [seriesSummary, comics]);

  // In-Progress Series Milestones (50% - 99%)
  const inProgressMilestones = useMemo(() => {
    return seriesSummary
      .filter((s) => s.ownedCount > 0 && s.completionPct >= 30 && s.completionPct < 100)
      .sort((a, b) => b.completionPct - a.completionPct);
  }, [seriesSummary]);

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
      const inProgressCount = boxComics.filter((c) => c.readingStatus === 'In Progress').length;

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
        
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-800 shrink-0">
            <BookOpen className="w-5.5 h-5.5" />
          </div>
          <div>
            <p className="text-[11px] font-medium text-slate-500">Total Collection</p>
            <h3 className="text-lg font-bold text-slate-900">{totalComics} Items</h3>
            <p className="text-[10px] text-slate-600 font-semibold mt-0.5">
              {totalThickness.toFixed(1)} Units
            </p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0">
            <CheckCircle2 className="w-5.5 h-5.5" />
          </div>
          <div>
            <p className="text-[11px] font-medium text-slate-500">Read Progress</p>
            <h3 className="text-lg font-bold text-emerald-700">{readPercentage}% Read</h3>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {readCount} read / {unreadCount} unread
            </p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0">
            <DollarSign className="w-5.5 h-5.5" />
          </div>
          <div>
            <p className="text-[11px] font-medium text-slate-500">Est. Collection Value</p>
            <h3 className="text-lg font-bold text-slate-900">${totalValue.toFixed(2)}</h3>
            <p className="text-[10px] text-slate-500 mt-0.5">Keys & hardcovers</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-700 shrink-0">
            <Trophy className="w-5.5 h-5.5" />
          </div>
          <div>
            <p className="text-[11px] font-medium text-slate-500">100% Achievements</p>
            <h3 className="text-lg font-bold text-purple-900">{completedSeriesBadges.length} Badges</h3>
            <p className="text-[10px] text-purple-600 font-semibold mt-0.5">Completed Series</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center gap-3.5 col-span-2 lg:col-span-1">
          <div className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-800 shrink-0">
            <Boxes className="w-5.5 h-5.5" />
          </div>
          <div>
            <p className="text-[11px] font-medium text-slate-500">Storage Boxes</p>
            <h3 className="text-lg font-bold text-slate-900">{boxes.length} Short Boxes</h3>
            <p className="text-[10px] text-slate-500 mt-0.5">Capacity tracking</p>
          </div>
        </div>

      </div>

      {/* Analytics Sub-Tab Bar */}
      <div className="bg-slate-100 p-1.5 rounded-2xl flex items-center justify-between gap-2 overflow-x-auto border border-slate-200">
        <div className="flex items-center gap-1.5 min-w-max">
          
          <button
            onClick={() => setActiveStatsTab('events')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeStatsTab === 'events'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-700 hover:bg-white hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Event Status Graph</span>
            {allEventsList.length > 0 && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${activeStatsTab === 'events' ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-700'}`}>
                {allEventsList.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveStatsTab('series')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeStatsTab === 'series'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-700 hover:bg-white hover:text-slate-900'
            }`}
          >
            <BarChart3 className="w-4 h-4 text-indigo-400" />
            <span>Comic Titles / Series Graph</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${activeStatsTab === 'series' ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-700'}`}>
              {seriesSummary.length}
            </span>
          </button>

          <button
            onClick={() => setActiveStatsTab('achievements')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeStatsTab === 'achievements'
                ? 'bg-gradient-to-r from-amber-600 to-purple-700 text-white shadow-sm'
                : 'text-slate-700 hover:bg-white hover:text-slate-900'
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
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeStatsTab === 'general'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-700 hover:bg-white hover:text-slate-900'
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
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-amber-100 text-amber-800">
                    <Sparkles className="w-4 h-4" />
                  </span>
                  <h3 className="text-base font-bold text-slate-900">Event Collection Status & Progress</h3>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Analyze reading completion rates and issue ownership across major crossover events and storylines.
                </p>
              </div>

              {/* Event Dropdown Selector */}
              <div className="flex items-center gap-2 shrink-0">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-slate-500" />
                  Select Event:
                </label>
                <select
                  value={selectedEvent}
                  onChange={(e) => setSelectedEvent(e.target.value)}
                  className="bg-slate-50 border border-slate-300 text-slate-900 font-bold text-xs rounded-xl px-3.5 py-2 focus:outline-none focus:ring-2 focus:ring-slate-800 shadow-xs transition-all min-w-[200px]"
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
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <span className="text-[11px] font-semibold text-slate-500 block">Total Event Issues</span>
                <span className="text-lg font-black text-slate-900">{eventStats.total} Issues</span>
                <span className="text-[10px] text-slate-500 block mt-0.5">{eventStats.owned} in collection</span>
              </div>

              <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-xl p-3">
                <span className="text-[11px] font-semibold text-emerald-800 block">Completion Rate</span>
                <span className="text-lg font-black text-emerald-700">{eventStats.completionRate}% Read</span>
                <div className="w-full bg-emerald-200 h-1.5 rounded-full mt-1.5 overflow-hidden">
                  <div className="bg-emerald-600 h-full rounded-full transition-all duration-500" style={{ width: `${eventStats.completionRate}%` }}></div>
                </div>
              </div>

              <div className="bg-blue-50/60 border border-blue-200/80 rounded-xl p-3">
                <span className="text-[11px] font-semibold text-blue-800 block">Read / Unread</span>
                <span className="text-lg font-black text-blue-900">{eventStats.read} Read</span>
                <span className="text-[10px] text-blue-700 block mt-0.5">{eventStats.unread} unread · {eventStats.reading} reading</span>
              </div>

              <div className="bg-rose-50/60 border border-rose-200/80 rounded-xl p-3">
                <span className="text-[11px] font-semibold text-rose-800 block">Wishlist Wanted</span>
                <span className="text-lg font-black text-rose-900">{eventStats.wishlist} Wishlist</span>
                <span className="text-[10px] text-rose-700 block mt-0.5">${eventStats.totalValue.toFixed(2)} est value</span>
              </div>
            </div>
          </div>

          {/* Event Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Event Status Distribution Donut Chart */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <PieChart className="w-4 h-4 text-emerald-600" />
                  <span>
                    {selectedEvent === 'all' ? 'Status Breakdown across All Events' : `Status Breakdown for "${selectedEvent}"`}
                  </span>
                </h4>
                <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
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
                <div className="h-64 mt-4 flex flex-col items-center justify-center text-center p-6 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  <Info className="w-8 h-8 text-slate-400 mb-2" />
                  <p className="text-xs font-bold text-slate-700">No comics tagged with event "{selectedEvent}"</p>
                  <p className="text-[11px] text-slate-500 mt-1 max-w-xs">
                    Edit any comic in your catalog and set its "Event / Crossover" field (e.g. "{selectedEvent}") to populate this graph!
                  </p>
                </div>
              )}
            </div>

            {/* Crossover Events Comparison Bar Chart */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-indigo-600" />
                  <span>Crossover Event Volume Comparison</span>
                </h4>
                <span className="text-xs text-slate-500">Owned vs Wishlist</span>
              </div>

              {allEventsComparisonData.length > 0 ? (
                <div className="h-64 mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={allEventsComparisonData.slice(0, 8)} margin={{ top: 10, right: 10, left: -20, bottom: 25 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
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
                <div className="h-64 mt-4 flex flex-col items-center justify-center text-center p-6 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  <Sparkles className="w-8 h-8 text-slate-400 mb-2" />
                  <p className="text-xs font-bold text-slate-700">No Crossover Events Configured Yet</p>
                  <p className="text-[11px] text-slate-500 mt-1 max-w-xs">
                    Assign event tags like "Civil War", "Secret Wars", or "Born Again" to comics to unlock event tracking!
                  </p>
                </div>
              )}
            </div>

          </div>

          {/* Filtered Event Comics Catalog List View */}
          {filteredEventComics.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Bookmark className="w-4 h-4 text-amber-600" />
                  <span>Comics in {selectedEvent === 'all' ? 'Crossover Events' : `"${selectedEvent}"`} ({filteredEventComics.length})</span>
                </h4>
                <span className="text-xs text-slate-500 font-semibold">
                  {eventStats.read} of {eventStats.owned} Read ({eventStats.completionRate}%)
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pt-2">
                {filteredEventComics.map((comic) => (
                  <div key={comic.id} className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex items-start gap-3 hover:bg-slate-100 transition-all">
                    <img
                      src={getComicCoverUrl(comic.coverImage)}
                      onError={handleImageError}
                      alt={comic.title}
                      className="w-12 h-16 object-cover rounded-md border border-slate-300 shrink-0 shadow-xs"
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider truncate">
                          {comic.publisher}
                        </span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                          comic.readingStatus === 'Read'
                            ? 'bg-emerald-100 text-emerald-800'
                            : comic.readingStatus === 'Reading'
                            ? 'bg-amber-100 text-amber-800'
                            : comic.readingStatus === 'Wishlist'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-indigo-100 text-indigo-800'
                        }`}>
                          {comic.readingStatus}
                        </span>
                      </div>
                      <h5 className="font-bold text-slate-900 text-xs truncate leading-snug">{comic.title}</h5>
                      <p className="text-[11px] font-bold text-slate-700">Issue #{comic.issueNumber}</p>
                      {comic.event && (
                        <p className="text-[10px] font-medium text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded inline-block truncate max-w-full">
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
      {/* SECTION 2: COMIC TITLES / SERIES COLLECTION GRAPH */}
      {/* ========================================================================= */}
      {activeStatsTab === 'series' && (
        <div className="space-y-6">
          
          {/* Top Series Controls & Summary */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-indigo-100 text-indigo-800">
                    <BarChart3 className="w-4 h-4" />
                  </span>
                  <h3 className="text-base font-bold text-slate-900">Comic Titles & Series Ownership Graph</h3>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Track how many comics in each series you own, read, or wishlisted across your entire library.
                </p>
              </div>

              {/* Sort Selector for Series */}
              <div className="flex items-center gap-2 shrink-0">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-slate-500" />
                  Sort Series By:
                </label>
                <select
                  value={seriesSortBy}
                  onChange={(e) => setSeriesSortBy(e.target.value as any)}
                  className="bg-slate-50 border border-slate-300 text-slate-900 font-bold text-xs rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-800 shadow-xs"
                >
                  <option value="owned">Most Owned Issues</option>
                  <option value="completion">Highest Read Completion %</option>
                  <option value="value">Highest Total Value ($)</option>
                  <option value="alphabetical">Alphabetical (A-Z)</option>
                </select>
              </div>
            </div>

            {/* Top 10 Series Stacked Bar Chart */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-2">
                  <TrendingUp className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Top Series Breakdown (Owned vs Read vs Wishlist)</span>
                </h4>
                <span className="text-xs text-slate-500 font-medium">Showing top 10 series</span>
              </div>

              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topSeriesChartData} margin={{ top: 10, right: 10, left: -20, bottom: 35 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={10} interval={0} angle={-30} textAnchor="end" />
                    <YAxis stroke="#64748b" fontSize={10} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderRadius: '8px', color: '#0f172a' }}
                    />
                    <Bar dataKey="Read" fill="#10B981" name="Read Issues" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Owned" fill="#6366F1" name="Owned (Unread)" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Wishlist" fill="#F43F5E" name="Wishlist Issues" radius={[4, 4, 0, 0]} />
                    <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: '11px' }} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Complete Series Grid View */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Layers3 className="w-4 h-4 text-slate-700" />
                <span>All Series & Title Collections ({seriesSummary.length} Distinct Titles)</span>
              </h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {seriesSummary.map((s) => (
                <div 
                  key={s.title}
                  className={`border rounded-2xl p-4 space-y-3 transition-all ${
                    s.is100Percent 
                      ? 'bg-amber-50/40 border-amber-300/80 shadow-xs' 
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{s.publisher}</span>
                      <h5 className="font-bold text-slate-900 text-sm truncate leading-snug">{s.title}</h5>
                    </div>

                    {s.is100Percent && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-400 text-amber-950 font-black text-[10px] flex items-center gap-1 shrink-0 shadow-xs">
                        <Trophy className="w-3 h-3 text-amber-950" />
                        <span>100% READ</span>
                      </span>
                    )}
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="text-slate-600">Completion Rate</span>
                      <span className={s.is100Percent ? 'text-amber-800 font-bold' : 'text-slate-900'}>
                        {s.completionPct}% ({s.readCount}/{s.ownedCount} read)
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${
                          s.is100Percent ? 'bg-gradient-to-r from-amber-400 to-amber-600' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${s.completionPct}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Issues Count Tags */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px]">
                    <span className="font-bold text-slate-800">
                      {s.ownedCount} Owned {s.wishlistCount > 0 && <span className="text-rose-600 font-normal">({s.wishlistCount} wishlist)</span>}
                    </span>
                    <span className="font-semibold text-slate-500">
                      Est. ${s.totalValue.toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
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
              <h4 className="font-bold text-slate-900 text-base flex items-center gap-2">
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
                      className="bg-white border-2 border-amber-300/80 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all relative overflow-hidden group space-y-4"
                    >
                      {/* Top Ribbon */}
                      <div className="flex items-center justify-between border-b border-amber-100 pb-3">
                        <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-gradient-to-r from-amber-500 to-amber-700 text-white shadow-xs">
                          🏆 {badge.badgeTier}
                        </span>
                        <span className="text-[10px] font-bold text-slate-500">{badge.type}</span>
                      </div>

                      {/* Main Title & Icon */}
                      <div className="flex items-start gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-100 via-amber-200 to-amber-400 border border-amber-300 flex items-center justify-center text-amber-950 shrink-0 shadow-sm group-hover:scale-105 transition-all">
                          <IconComp className="w-7 h-7" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider block">{badge.publisher}</span>
                          <h5 className="font-black text-slate-900 text-base leading-snug line-clamp-2">{badge.name}</h5>
                        </div>
                      </div>

                      {/* Stats & Value Footer */}
                      <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200/80 flex items-center justify-between text-xs">
                        <div>
                          <span className="text-slate-500 text-[10px] block font-medium">Issues Read</span>
                          <span className="font-bold text-slate-900">{badge.readCount} / {badge.issueCount} (100%)</span>
                        </div>
                        <div className="text-right">
                          <span className="text-slate-500 text-[10px] block font-medium">Est. Value</span>
                          <span className="font-bold text-emerald-700">${badge.totalValue.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-slate-50 border border-dashed border-slate-300 rounded-2xl p-8 text-center space-y-3">
                <Trophy className="w-10 h-10 text-slate-400 mx-auto" />
                <h5 className="font-bold text-slate-800 text-sm">No 100% Completed Series Badges Yet</h5>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Mark all owned issues in a series or crossover event as <strong>"Read"</strong> to earn your first 100% Mastery Achievement Badge!
                </p>
              </div>
            )}
          </div>

          {/* In-Progress Series Milestones (50% - 99%) */}
          {inProgressMilestones.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Target className="w-4 h-4 text-emerald-600" />
                  <span>Next 100% Badges In-Progress ({inProgressMilestones.length} Series)</span>
                </h4>
                <span className="text-xs text-slate-500 font-medium">Almost completed!</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {inProgressMilestones.map((s) => (
                  <div key={s.title} className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <h5 className="font-bold text-slate-900 text-xs truncate">{s.title}</h5>
                      <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                        {s.completionPct}%
                      </span>
                    </div>

                    <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${s.completionPct}%` }}></div>
                    </div>

                    <p className="text-[11px] text-slate-500 flex items-center justify-between font-medium">
                      <span>{s.readCount} of {s.ownedCount} read</span>
                      <span className="text-amber-800 font-bold">{s.ownedCount - s.readCount} left for 100% 🏆</span>
                    </p>
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
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Boxes className="w-4 h-4 text-slate-700" />
                <span>Storage Box Capacity Utilization (Units)</span>
              </h3>
              <span className="text-xs text-slate-500">Max ~150 per box</span>
            </div>

            <div className="h-64 mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={boxCapacityData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="boxName" stroke="#64748b" fontSize={10} interval={0} angle={-30} textAnchor="end" />
                  <YAxis stroke="#64748b" fontSize={10} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderRadius: '8px', color: '#0f172a' }}
                  />
                  <Bar dataKey="usedUnits" name="Used Units" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="maxCapacity" name="Max Capacity" fill="#e2e8f0" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: Publisher Breakdown */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-slate-700" />
                <span>Publisher Distribution</span>
              </h3>
              <span className="text-xs text-slate-500">Total Titles</span>
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
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs col-span-1 lg:col-span-2 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-indigo-100 text-indigo-800">
                    <Boxes className="w-4 h-4" />
                  </span>
                  <h3 className="text-base font-bold text-slate-900">Storage Box Breakdown & Contents Inspector</h3>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Inspect the exact comic titles, publisher distribution, and reading status for individual storage boxes.
                </p>
              </div>

              {/* Box Selector Dropdown */}
              <div className="flex items-center gap-2 shrink-0">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-slate-500" />
                  Select Box:
                </label>
                <select
                  value={selectedBoxId}
                  onChange={(e) => setSelectedBoxId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                  className="bg-slate-50 border border-slate-300 text-slate-900 font-bold text-xs rounded-xl px-3.5 py-2 focus:outline-none focus:ring-2 focus:ring-slate-800 shadow-xs transition-all min-w-[220px]"
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
                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4">
                  <h4 className="font-bold text-slate-800 text-xs flex items-center gap-2 mb-3">
                    <BarChart3 className="w-4 h-4 text-indigo-600" />
                    Top Comic Titles Across All Boxes
                  </h4>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={allBoxesSeriesData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                        <XAxis type="number" stroke="#64748b" fontSize={10} />
                        <YAxis dataKey="name" type="category" stroke="#64748b" fontSize={10} width={120} />
                        <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderRadius: '8px', color: '#0f172a' }} />
                        <Bar dataKey="count" name="Issues Stored" fill="#6366F1" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* All Boxes - Reading Progress per Box */}
                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4">
                  <h4 className="font-bold text-slate-800 text-xs flex items-center gap-2 mb-3">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Reading Status Breakdown by Box
                  </h4>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={boxReadingStatusComparison} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
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
                      <div className="bg-indigo-50/50 border border-indigo-200 rounded-xl p-3.5">
                        <p className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider">Comics Stored</p>
                        <h4 className="text-xl font-bold text-indigo-950 mt-0.5">{activeBox.itemCount} Issues</h4>
                        <p className="text-[10px] text-indigo-800/80 font-medium mt-0.5">Physical collection items</p>
                      </div>

                      <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-3.5">
                        <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Box Capacity</p>
                        <h4 className="text-xl font-bold text-emerald-950 mt-0.5">{activeBox.usedUnits} / {activeBox.maxCapacity} Units</h4>
                        <p className="text-[10px] text-emerald-800/80 font-semibold mt-0.5">{activeBox.percentFull}% Full</p>
                      </div>

                      <div className="bg-amber-50/50 border border-amber-200 rounded-xl p-3.5">
                        <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Est. Box Value</p>
                        <h4 className="text-xl font-bold text-amber-950 mt-0.5">${activeBox.totalValue.toFixed(2)}</h4>
                        <p className="text-[10px] text-amber-800/80 font-medium mt-0.5">Key issues & hardcovers</p>
                      </div>

                      <div className="bg-purple-50/50 border border-purple-200 rounded-xl p-3.5">
                        <p className="text-[10px] font-bold text-purple-700 uppercase tracking-wider">Read Progress</p>
                        <h4 className="text-xl font-bold text-purple-950 mt-0.5">{activeBox.readCount} Read / {activeBox.unreadCount} Unread</h4>
                        <p className="text-[10px] text-purple-800/80 font-medium mt-0.5">{activeBox.itemCount > 0 ? Math.round((activeBox.readCount / activeBox.itemCount) * 100) : 0}% Read rate</p>
                      </div>
                    </div>

                    {/* Side-by-side charts for this box */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Chart: Top Series in this Box */}
                      <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4">
                        <h4 className="font-bold text-slate-800 text-xs flex items-center gap-2 mb-3">
                          <BarChart3 className="w-4 h-4 text-indigo-600" />
                          Top Series in Box #{activeBox.boxId}
                        </h4>
                        {activeBox.seriesData.length === 0 ? (
                          <div className="h-56 flex items-center justify-center text-xs text-slate-400">No comics stored in this box yet.</div>
                        ) : (
                          <div className="h-56">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={activeBox.seriesData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
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
                      <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4">
                        <h4 className="font-bold text-slate-800 text-xs flex items-center gap-2 mb-3">
                          <BarChart3 className="w-4 h-4 text-emerald-600" />
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
                                  label={({ name, count }) => `${name} (${count})`}
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
                    <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
                      <div className="bg-slate-100 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                        <h4 className="font-bold text-slate-900 text-xs flex items-center gap-2">
                          <BookOpen className="w-4 h-4 text-slate-700" />
                          Comics Inside Box #{activeBox.boxId} ({activeBox.boxComics.length} Items)
                        </h4>
                        <span className="text-[11px] font-semibold text-slate-500">
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
                            <div key={comic.id} className="bg-white border border-slate-200 rounded-lg p-2 flex flex-col justify-between shadow-xs hover:border-slate-400 transition-all">
                              <div className="flex gap-2 items-start">
                                <img
                                  src={getComicCoverUrl(comic.coverImage)}
                                  alt=""
                                  onError={handleImageError}
                                  className="w-10 h-14 object-cover rounded shrink-0 border border-slate-100"
                                />
                                <div className="min-w-0 flex-1">
                                  <h5 className="font-bold text-slate-900 text-[11px] truncate">{comic.title}</h5>
                                  <p className="text-[10px] font-extrabold text-slate-700">#{comic.issueNumber}</p>
                                  <p className="text-[9px] text-slate-400 truncate">{comic.publisher}</p>
                                </div>
                              </div>

                              <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between">
                                <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                                  comic.readingStatus === 'Read'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : comic.readingStatus === 'In Progress'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-indigo-100 text-indigo-800'
                                }`}>
                                  {comic.readingStatus}
                                </span>
                                <span className="text-[9px] font-medium text-slate-500">
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
