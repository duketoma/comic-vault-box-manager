import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar, 
  Sparkles, 
  CheckCircle, 
  ExternalLink, 
  Compass, 
  Layers,
  Award,
  Zap,
  User,
  BookOpen,
  Building
} from 'lucide-react';
import { ComicBook } from '../../types';
import { 
  ChallengeMilestone, 
  ChallengeQueueItem,
  MilestoneCategory, 
  MilestoneScope,
  TBRHighlight,
  TBRHighlightCategory,
  TBRMilestonesSummary,
} from '../../types/readingChallenge.types';
import { getChallengeInsights } from '../../services/readingChallengeService';
import { computeTBRMilestones } from '../../utils/challengeMilestones';
import { getComicCoverUrl, handleImageError } from '../../utils/imageUtils';

export type InsightsScope = 'TBRQueue' | 'WholeChallenge' | 'ReadItems';

interface ChallengeInsightsViewProps {
  challengeId: number;
  onSelectComic?: (comic: ComicBook) => void;
  comics: ComicBook[];
  queue?: ChallengeQueueItem[];
  tbrMilestones?: TBRMilestonesSummary;
}

export const ChallengeInsightsView: React.FC<ChallengeInsightsViewProps> = ({
  challengeId,
  onSelectComic,
  comics,
  queue,
  tbrMilestones: propTbrMilestones,
}) => {
  const [activeScope, setActiveScope] = useState<InsightsScope>('TBRQueue');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [milestones, setMilestones] = useState<ChallengeMilestone[]>([]);
  const [serverTbrMilestones, setServerTbrMilestones] = useState<TBRMilestonesSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError(null);

    getChallengeInsights(challengeId)
      .then((data) => {
        if (isMounted) {
          setMilestones(data.milestones || []);
          if (data.tbrMilestones) {
            setServerTbrMilestones(data.tbrMilestones);
          }
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error(err);
          setError('Unable to load milestones from server.');
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => { isMounted = false; };
  }, [challengeId]);

  // Compute active TBR highlights (props > computed from live queue > server fallback)
  const effectiveTbrMilestones = useMemo<TBRMilestonesSummary | null>(() => {
    if (propTbrMilestones) return propTbrMilestones;
    if (queue && queue.length > 0 && comics && comics.length > 0) {
      return computeTBRMilestones(queue, comics);
    }
    return serverTbrMilestones;
  }, [propTbrMilestones, queue, comics, serverTbrMilestones]);

  // Filter for TBR Queue view
  const filteredTbrItems = useMemo(() => {
    if (!effectiveTbrMilestones) return [];
    if (selectedCategory === 'All') return effectiveTbrMilestones.itemsWithHighlights;
    return effectiveTbrMilestones.itemsWithHighlights.filter((item) =>
      item.highlights.some((h) => h.category === selectedCategory)
    );
  }, [effectiveTbrMilestones, selectedCategory]);

  // Filter for Challenge / Read Items scopes
  const filteredMilestones = useMemo(() => {
    return milestones.filter((m) => {
      if (m.scope !== activeScope) return false;
      if (selectedCategory !== 'All' && m.category !== selectedCategory) return false;
      return true;
    });
  }, [milestones, activeScope, selectedCategory]);

  const tbrCategories: Array<{ id: string; label: string }> = [
    { id: 'All', label: 'All Categories' },
    { id: 'Creator', label: 'Creators' },
    { id: 'Character', label: 'Characters' },
    { id: 'Series', label: 'Series' },
    { id: 'StoryArc', label: 'Story Arc / Event' },
    { id: 'Publisher', label: 'Publishers' },
    { id: 'Collection', label: 'Collection Oldest' },
  ];

  const challengeCategories: Array<{ id: string; label: string }> = [
    { id: 'All', label: 'All Categories' },
    { id: 'Collection', label: 'Collection' },
    { id: 'Publisher', label: 'Publisher' },
    { id: 'Series', label: 'Series' },
    { id: 'StoryArc', label: 'Story Arc / Event' },
    { id: 'Creator', label: 'Creator' },
    { id: 'Character', label: 'Character' },
  ];

  const categoryIcon = (cat: TBRHighlightCategory) => {
    switch (cat) {
      case 'Collection': return <Award className="w-3 h-3 text-amber-500" />;
      case 'Character': return <Sparkles className="w-3 h-3 text-purple-500" />;
      case 'Creator': return <User className="w-3 h-3 text-indigo-500" />;
      case 'StoryArc': return <Zap className="w-3 h-3 text-orange-500" />;
      case 'Series': return <BookOpen className="w-3 h-3 text-emerald-500" />;
      case 'Publisher': return <Building className="w-3 h-3 text-sky-500" />;
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-5">
      {/* Scope Switcher Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
            <Compass className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>Milestones & Timeline Insights</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {activeScope === 'TBRQueue'
              ? 'Collection-wide chronological milestones and firsts in your upcoming TBR queue (up to 10 comics).'
              : 'Compare the earliest & latest publications across the entire challenge snapshot.'}
          </p>
        </div>

        {/* Scope Pill Toggle */}
        <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 p-1 bg-slate-50 dark:bg-slate-800 self-start sm:self-center flex-wrap gap-1">
          <button
            type="button"
            onClick={() => {
              setActiveScope('TBRQueue');
              setSelectedCategory('All');
            }}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              activeScope === 'TBRQueue'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>TBR Queue Highlights</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveScope('WholeChallenge');
              setSelectedCategory('All');
            }}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              activeScope === 'WholeChallenge'
                ? 'bg-slate-900 dark:bg-slate-700 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Whole Challenge
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveScope('ReadItems');
              setSelectedCategory('All');
            }}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              activeScope === 'ReadItems'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Read Items
          </button>
        </div>
      </div>

      {/* Category Pills Filter */}
      <div className="flex flex-wrap items-center gap-1.5">
        {(activeScope === 'TBRQueue' ? tbrCategories : challengeCategories).map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setSelectedCategory(cat.id)}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              selectedCategory === cat.id
                ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-2xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Scope: TBR Queue */}
      {activeScope === 'TBRQueue' ? (
        <div>
          {isLoading && !effectiveTbrMilestones ? (
            <div className="py-12 text-center text-xs text-slate-500 font-medium">
              Evaluating upcoming TBR milestones against your collection...
            </div>
          ) : !effectiveTbrMilestones || effectiveTbrMilestones.itemsWithHighlights.length === 0 ? (
            <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center space-y-2">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <Compass className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                No Collection Milestones in Current TBR Queue
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                None of the up to 10 comics currently up next represent collection-wide earliest appearances or debuts. Keep reading to discover more milestones as your queue advances!
              </p>
            </div>
          ) : filteredTbrItems.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400 dark:text-slate-500">
              No upcoming milestones found in the "{tbrCategories.find((c) => c.id === selectedCategory)?.label || selectedCategory}" category for your current TBR queue.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTbrItems.map((item) => {
                const relevantHighlights = item.highlights.filter(
                  (h) => selectedCategory === 'All' || h.category === selectedCategory
                );

                return (
                  <div
                    key={`tbr_${item.challengeItemId}`}
                    className="bg-slate-50 dark:bg-slate-800/60 border border-amber-300/40 dark:border-amber-600/30 rounded-2xl p-4 flex gap-3 shadow-2xs hover:shadow-xs transition-shadow relative overflow-hidden"
                  >
                    <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                        #{item.sequenceNumber} in TBR
                      </span>
                    </div>

                    {/* Cover art thumbnail */}
                    <div
                      className="w-16 h-24 bg-slate-200 dark:bg-slate-700 rounded-lg overflow-hidden shrink-0 shadow-2xs cursor-pointer group relative"
                      onClick={() => {
                        if (onSelectComic) {
                          const fullComic = comics.find((c) => c.id === item.comicId);
                          if (fullComic) onSelectComic(fullComic);
                        }
                      }}
                      title="Click to view comic"
                    >
                      <img
                        src={getComicCoverUrl(item.coverImage)}
                        alt={item.title}
                        onError={handleImageError}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                      <div className="absolute inset-0 bg-slate-900/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </div>
                    </div>

                    {/* Details & Highlights */}
                    <div className="flex-1 min-w-0 pr-12">
                      <h5 
                        onClick={() => {
                          if (onSelectComic) {
                            const fullComic = comics.find((c) => c.id === item.comicId);
                            if (fullComic) onSelectComic(fullComic);
                          }
                        }}
                        className="text-xs font-black text-slate-900 dark:text-white truncate hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer transition-colors"
                      >
                        {item.title} #{item.issueNumber}
                      </h5>

                      {item.seriesName && item.seriesName !== item.title && (
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {item.seriesName}
                        </p>
                      )}

                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-1 mb-2">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        <span>{item.releaseDate || 'Unknown Date'}</span>
                      </div>

                      {/* Highlight badges list */}
                      <div className="space-y-1.5">
                        {relevantHighlights.map((hl) => (
                          <div
                            key={hl.id}
                            className={`p-2 rounded-xl border text-[11px] leading-tight shadow-2xs ${
                              hl.category === 'Collection'
                                ? 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700/60'
                                : hl.category === 'Character'
                                ? 'bg-purple-50/80 dark:bg-purple-950/40 border-purple-300 dark:border-purple-700/60'
                                : hl.category === 'Creator'
                                ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700/60'
                                : hl.category === 'StoryArc'
                                ? 'bg-orange-50/80 dark:bg-orange-950/40 border-orange-300 dark:border-orange-700/60'
                                : hl.category === 'Series'
                                ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700/60'
                                : 'bg-sky-50/80 dark:bg-sky-950/40 border-sky-300 dark:border-sky-700/60'
                            }`}
                          >
                            <div className="flex items-center gap-1 font-bold text-slate-900 dark:text-white">
                              {categoryIcon(hl.category)}
                              <span className="truncate">{hl.label}</span>
                            </div>
                            <div className="text-[10px] text-slate-600 dark:text-slate-400 mt-0.5">
                              {hl.description}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Scope: Whole Challenge or Read Items */
        <div>
          {isLoading ? (
            <div className="py-12 text-center text-xs text-slate-500 font-medium">
              Calculating timeline milestones...
            </div>
          ) : error ? (
            <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl text-xs text-rose-700 dark:text-rose-300">
              {error}
            </div>
          ) : filteredMilestones.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400 dark:text-slate-500">
              {activeScope === 'ReadItems'
                ? 'No milestones in the Read Items scope yet. Mark comics as read to unlock your reading milestones!'
                : 'No milestones found for this category.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredMilestones.map((m, idx) => {
                const isEarliest = m.kind === 'Earliest';

                return (
                  <div
                    key={`${m.scope}_${m.category}_${m.entityName}_${m.kind}_${idx}`}
                    className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 flex gap-3 shadow-2xs hover:shadow-xs transition-shadow relative overflow-hidden"
                  >
                    {/* Kind Banner */}
                    <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                          isEarliest
                            ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
                            : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                        }`}
                      >
                        {m.kind} in {activeScope === 'WholeChallenge' ? 'Challenge' : 'Read'}
                      </span>
                    </div>

                    {/* Cover art thumbnail */}
                    <div
                      className="w-16 h-24 bg-slate-200 dark:bg-slate-700 rounded-lg overflow-hidden shrink-0 shadow-2xs cursor-pointer group relative"
                      onClick={() => {
                        if (onSelectComic) {
                          const fullComic = comics.find((c) => c.id === m.comicId);
                          if (fullComic) onSelectComic(fullComic);
                        }
                      }}
                      title="Click to view comic"
                    >
                      <img
                        src={getComicCoverUrl(m.coverImage)}
                        alt={m.title}
                        onError={handleImageError}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                      <div className="absolute inset-0 bg-slate-900/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </div>
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0 pr-14">
                      <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                        {m.category} {m.role ? `• ${m.role}` : ''}
                      </div>
                      <div className="text-xs font-black text-slate-900 dark:text-white truncate">
                        {m.entityName}
                      </div>

                      <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate mt-1">
                        {m.title} #{m.issueNumber}
                      </h5>

                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        <span>{m.dateKnown && m.releaseDate ? m.releaseDate : 'Unknown Date'}</span>
                      </div>

                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                          Seq #{m.sequenceNumber}
                        </span>
                        {m.isRead && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                            <CheckCircle className="w-2.5 h-2.5" />
                            <span>Read</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
