import React from 'react';
import { 
  Trophy, 
  StopCircle, 
  CheckCircle, 
  FastForward, 
  Calendar, 
  Sparkles, 
  BookOpen, 
  Layers,
  ArrowRight,
  Clock
} from 'lucide-react';
import { ChallengeHistorySummary } from '../../types/readingChallenge.types';

interface ChallengeHistoryListProps {
  history: ChallengeHistorySummary[];
  onViewInsights?: (challengeId: number) => void;
  isLoading?: boolean;
}

export const ChallengeHistoryList: React.FC<ChallengeHistoryListProps> = ({
  history,
  onViewInsights,
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center text-slate-500 dark:text-slate-400">
        <Clock className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
        <p className="text-sm">Loading challenge history...</p>
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center shadow-xs">
        <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 flex items-center justify-center mb-3">
          <BookOpen className="w-6 h-6" />
        </div>
        <h4 className="text-sm font-bold text-slate-900 dark:text-white">No Past Challenges</h4>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
          When you complete or end reading challenges, their records and milestone insights will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            Challenge History
          </h3>
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
            {history.length}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {history.map((item) => {
          const isCompleted = item.status === 'Completed';
          const endedDate = item.completedAt || item.endedAt;

          return (
            <div
              key={item.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between hover:border-slate-300 dark:hover:border-slate-700 transition-all"
            >
              <div className="space-y-3">
                {/* Header: Name + Badge */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="text-base font-bold text-slate-900 dark:text-white truncate">
                      {item.name}
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                      {item.criteriaSummary || 'Custom criteria challenge'}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                      isCompleted
                        ? 'bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                        : 'bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                    }`}
                  >
                    {isCompleted ? (
                      <>
                        <Trophy className="w-3.5 h-3.5 text-emerald-500" />
                        Completed
                      </>
                    ) : (
                      <>
                        <StopCircle className="w-3.5 h-3.5 text-amber-500" />
                        Abandoned
                      </>
                    )}
                  </span>
                </div>

                {/* Date range */}
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    Started {new Date(item.startedAt).toLocaleDateString()}
                  </span>
                  {endedDate && (
                    <>
                      <span>•</span>
                      <span>Ended {new Date(endedDate).toLocaleDateString()}</span>
                    </>
                  )}
                </div>

                {/* Progress Bar */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      Progress
                    </span>
                    <span className="font-black text-slate-900 dark:text-white">
                      {item.completionPercent}%
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                    <div
                      className="bg-emerald-500 h-full transition-all"
                      style={{
                        width: item.totalEligible > 0
                          ? `${Math.min(100, (item.readCount / item.totalEligible) * 100)}%`
                          : '0%',
                      }}
                    />
                    <div
                      className="bg-amber-400 h-full transition-all"
                      style={{
                        width: item.totalEligible > 0
                          ? `${Math.min(100, (item.skippedCount / item.totalEligible) * 100)}%`
                          : '0%',
                      }}
                    />
                  </div>
                </div>

                {/* Mini Stat counters */}
                <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                  <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-2 border border-slate-100 dark:border-slate-800">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      Eligible
                    </p>
                    <p className="text-sm font-black text-slate-900 dark:text-white">
                      {item.totalEligible}
                    </p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-2 border border-slate-100 dark:border-slate-800">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                      Read
                    </p>
                    <p className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                      {item.readCount}
                    </p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-2 border border-slate-100 dark:border-slate-800">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                      Skipped
                    </p>
                    <p className="text-sm font-black text-amber-600 dark:text-amber-400">
                      {item.skippedCount}
                    </p>
                  </div>
                </div>
              </div>

              {/* Action */}
              {onViewInsights && (
                <div className="pt-4 mt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                  <button
                    type="button"
                    onClick={() => onViewInsights(item.id)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 py-1 px-2.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-colors"
                  >
                    <span>View Insights</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
