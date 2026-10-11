import React, { useState, useEffect, useMemo } from 'react';
import { 
  Trophy, 
  Calendar, 
  BookOpen, 
  User, 
  Sparkles, 
  CheckCircle, 
  Filter, 
  ExternalLink, 
  Compass, 
  Layers 
} from 'lucide-react';
import { ComicBook } from '../../types';
import { 
  ChallengeMilestone, 
  MilestoneCategory, 
  MilestoneScope 
} from '../../types/readingChallenge.types';
import { getChallengeInsights } from '../../services/readingChallengeService';
import { getComicCoverUrl, handleImageError } from '../../utils/imageUtils';

interface ChallengeInsightsViewProps {
  challengeId: number;
  onSelectComic?: (comic: ComicBook) => void;
  comics: ComicBook[];
}

export const ChallengeInsightsView: React.FC<ChallengeInsightsViewProps> = ({
  challengeId,
  onSelectComic,
  comics,
}) => {
  const [activeScope, setActiveScope] = useState<MilestoneScope>('WholeChallenge');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [milestones, setMilestones] = useState<ChallengeMilestone[]>([]);
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

  // Filter by Scope & Category
  const filteredMilestones = useMemo(() => {
    return milestones.filter((m) => {
      if (m.scope !== activeScope) return false;
      if (selectedCategory !== 'All' && m.category !== selectedCategory) return false;
      return true;
    });
  }, [milestones, activeScope, selectedCategory]);

  const categories: MilestoneCategory[] = ['Collection', 'Publisher', 'Series', 'StoryArc', 'Creator', 'Character'];

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
            Compare the earliest & latest publications across your challenge and comics you've read.
          </p>
        </div>

        {/* Scope Pill Toggle */}
        <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 p-1 bg-slate-50 dark:bg-slate-800 self-start sm:self-center">
          <button
            type="button"
            onClick={() => setActiveScope('WholeChallenge')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              activeScope === 'WholeChallenge'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Whole Challenge Scope
          </button>
          <button
            type="button"
            onClick={() => setActiveScope('ReadItems')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              activeScope === 'ReadItems'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Read Items Scope
          </button>
        </div>
      </div>

      {/* Category Pills Filter */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setSelectedCategory('All')}
          className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
            selectedCategory === 'All'
              ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-2xs'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
          }`}
        >
          All Categories
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              selectedCategory === cat
                ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-2xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            {cat === 'StoryArc' ? 'Story Arc / Event' : cat}
          </button>
        ))}
      </div>

      {/* Content State */}
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
  );
};
