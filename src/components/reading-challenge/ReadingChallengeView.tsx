import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Trophy, 
  Sparkles, 
  BookOpen, 
  Compass, 
  History, 
  PlusCircle, 
  CheckCircle2, 
  ArrowLeft,
  Flame,
  RotateCcw
} from 'lucide-react';
import { ComicBook, StorageBox } from '../../types';
import { 
  ChallengeHistorySummary, 
  ReadingChallengeSummary 
} from '../../types/readingChallenge.types';
import { 
  getActiveChallenge, 
  getChallengeHistory, 
  markItemRead, 
  undoItemRead, 
  skipItem, 
  endChallenge 
} from '../../services/readingChallengeService';
import { ChallengeSetupForm } from './ChallengeSetupForm';
import { ReadingQueue } from './ReadingQueue';
import { ChallengeProgressPanel } from './ChallengeProgressPanel';
import { ChallengeInsightsView } from './ChallengeInsightsView';
import { ChallengeHistoryList } from './ChallengeHistoryList';
import { isComicEligibleForChallenge } from '../../utils/challengeCriteriaEngine';
import { computeTBRMilestones } from '../../utils/challengeMilestones';

interface ReadingChallengeViewProps {
  comics: ComicBook[];
  boxes: StorageBox[];
  onSelectComic?: (comic: ComicBook) => void;
  onRefreshCollection?: () => void;
}

export const ReadingChallengeView: React.FC<ReadingChallengeViewProps> = ({
  comics,
  boxes,
  onSelectComic,
  onRefreshCollection,
}) => {
  const [activeChallenge, setActiveChallenge] = useState<ReadingChallengeSummary | null>(null);
  const [history, setHistory] = useState<ChallengeHistorySummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);
  const [activeSubTab, setActiveSubTab] = useState<'queue' | 'insights' | 'history' | 'new'>('queue');
  const [inspectingHistoryChallengeId, setInspectingHistoryChallengeId] = useState<number | null>(null);
  const [lastReadItemId, setLastReadItemId] = useState<number | null>(null);

  const inCollectionComics = useMemo(() => {
    return comics.filter(isComicEligibleForChallenge);
  }, [comics]);

  const tbrMilestones = useMemo(() => {
    if (!activeChallenge?.queue || activeChallenge.queue.length === 0) return null;
    return computeTBRMilestones(activeChallenge.queue, inCollectionComics);
  }, [activeChallenge?.queue, inCollectionComics]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const current = await getActiveChallenge();
      setActiveChallenge(current);
      if (!current) {
        setActiveSubTab('new');
      }
    } catch (err) {
      console.warn('Error fetching active challenge:', err);
    } finally {
      setIsLoading(false);
    }

    setIsLoadingHistory(true);
    try {
      const hist = await getChallengeHistory();
      setHistory(hist);
    } catch (err) {
      console.warn('Error fetching challenge history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleChallengeStarted = (newChallenge: ReadingChallengeSummary) => {
    setActiveChallenge(newChallenge);
    setActiveSubTab('queue');
    loadData();
  };

  const handleMarkRead = async (itemId: number) => {
    if (!activeChallenge) return;
    try {
      const updated = await markItemRead(activeChallenge.challengeId, itemId);
      setActiveChallenge(updated);
      setLastReadItemId(itemId);
      if (onRefreshCollection) {
        onRefreshCollection();
      }
      if (updated.status === 'Completed') {
        const hist = await getChallengeHistory();
        setHistory(hist);
      }
    } catch (err: any) {
      alert(`Unable to mark item as read: ${err.message || err}`);
    }
  };

  const handleSkip = async (itemId: number) => {
    if (!activeChallenge) return;
    try {
      const updated = await skipItem(activeChallenge.challengeId, itemId);
      setActiveChallenge(updated);
      if (updated.status === 'Completed') {
        const hist = await getChallengeHistory();
        setHistory(hist);
      }
    } catch (err: any) {
      alert(`Unable to skip item: ${err.message || err}`);
    }
  };

  const handleUndoLastRead = async () => {
    if (!activeChallenge) return;
    // Find the item to undo: either lastReadItemId or the most recent read item in the queue/challenge
    const targetItemId = lastReadItemId || activeChallenge.queue.find((q) => q.status === 'Read')?.challengeItemId;
    if (!targetItemId) {
      alert('No recently read item to undo.');
      return;
    }

    try {
      const updated = await undoItemRead(activeChallenge.challengeId, targetItemId);
      setActiveChallenge(updated);
      setLastReadItemId(null);
      if (onRefreshCollection) {
        onRefreshCollection();
      }
    } catch (err: any) {
      alert(`Unable to undo read: ${err.message || err}`);
    }
  };

  const handleAbandon = async () => {
    if (!activeChallenge) return;
    try {
      await endChallenge(activeChallenge.challengeId);
      setActiveChallenge(null);
      setActiveSubTab('new');
      await loadData();
    } catch (err: any) {
      alert(`Unable to abandon challenge: ${err.message || err}`);
    }
  };

  const handleViewHistoricalInsights = (challengeId: number) => {
    setInspectingHistoryChallengeId(challengeId);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Header Banner */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-md shrink-0">
            <Trophy className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                Reading Challenge
              </h2>
              {activeChallenge && activeChallenge.status === 'Active' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                  <Flame className="w-3.5 h-3.5 text-indigo-500 fill-indigo-500" />
                  Active Challenge
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Curate focused reading goals, pull from physical storage boxes, and track milestone insights.
            </p>
          </div>
        </div>

        {/* Sub Navigation Controls */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl overflow-x-auto scrollbar-none shrink-0">
          {activeChallenge ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setInspectingHistoryChallengeId(null);
                  setActiveSubTab('queue');
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                  activeSubTab === 'queue' && !inspectingHistoryChallengeId
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Reading Stack</span>
                {activeChallenge.queue.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                    {activeChallenge.queue.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setInspectingHistoryChallengeId(null);
                  setActiveSubTab('insights');
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                  activeSubTab === 'insights' && !inspectingHistoryChallengeId
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Compass className="w-3.5 h-3.5" />
                <span>Milestones</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setInspectingHistoryChallengeId(null);
                  setActiveSubTab('new');
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                  activeSubTab === 'new' && !inspectingHistoryChallengeId
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>New Challenge</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setInspectingHistoryChallengeId(null);
                  setActiveSubTab('history');
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                  activeSubTab === 'history' && !inspectingHistoryChallengeId
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>History</span>
                {history.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                    {history.length}
                  </span>
                )}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setInspectingHistoryChallengeId(null);
                  setActiveSubTab('new');
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                  activeSubTab === 'new' && !inspectingHistoryChallengeId
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Start Challenge</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setInspectingHistoryChallengeId(null);
                  setActiveSubTab('history');
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                  activeSubTab === 'history' && !inspectingHistoryChallengeId
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>Challenge History</span>
                {history.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                    {history.length}
                  </span>
                )}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Completed Celebration Banner */}
      {activeChallenge && activeChallenge.status === 'Completed' && (
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-2xl p-6 shadow-md flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <Trophy className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-black tracking-tight">
                Challenge Completed!
              </h3>
              <p className="text-xs text-emerald-50 mt-0.5">
                Awesome work! You read {activeChallenge.readCount} of {activeChallenge.totalEligible} comics ({activeChallenge.progressPercent}% resolved).
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setActiveSubTab('new');
              setInspectingHistoryChallengeId(null);
            }}
            className="px-4 py-2 rounded-xl bg-white text-emerald-700 hover:bg-emerald-50 text-xs font-black shadow-xs transition-all shrink-0 cursor-pointer"
          >
            Start Another Challenge
          </button>
        </div>
      )}

      {/* Historical Challenge Milestone Inspector */}
      {inspectingHistoryChallengeId !== null ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setInspectingHistoryChallengeId(null)}
              className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to History</span>
            </button>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Viewing Historical Challenge #{inspectingHistoryChallengeId}
            </div>
          </div>

          <ChallengeInsightsView
            challengeId={inspectingHistoryChallengeId}
            comics={comics}
            onSelectComic={onSelectComic}
          />
        </div>
      ) : (
        <>
          {/* Active Challenge Progress Dashboard */}
          {activeChallenge && (
            <ChallengeProgressPanel
              challenge={activeChallenge}
              onUndoLastRead={lastReadItemId ? handleUndoLastRead : undefined}
              onAbandonChallenge={handleAbandon}
            />
          )}

          {/* SubTab Views */}
          {activeChallenge && activeSubTab === 'queue' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Next in Queue (Up to 10 Comics)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Deterministic reading order with storage box physical locations.
                  </p>
                </div>
              </div>

              <ReadingQueue
                queue={activeChallenge.queue}
                boxes={boxes}
                onMarkRead={handleMarkRead}
                onSkip={handleSkip}
                onSelectComic={onSelectComic}
                milestonesSummary={tbrMilestones || undefined}
              />
            </div>
          )}

          {activeChallenge && activeSubTab === 'insights' && (
            <ChallengeInsightsView
              challengeId={activeChallenge.challengeId}
              comics={inCollectionComics}
              queue={activeChallenge.queue}
              tbrMilestones={tbrMilestones || undefined}
              onSelectComic={onSelectComic}
            />
          )}

          {activeSubTab === 'new' && (
            <div className="space-y-6">
              <ChallengeSetupForm
                comics={inCollectionComics}
                onChallengeStarted={handleChallengeStarted}
                hasActiveChallenge={activeChallenge !== null && activeChallenge.status === 'Active'}
              />

              {!activeChallenge && history.length > 0 && (
                <div className="pt-6 border-t border-slate-200 dark:border-slate-800">
                  <ChallengeHistoryList
                    history={history}
                    onViewInsights={handleViewHistoricalInsights}
                    isLoading={isLoadingHistory}
                  />
                </div>
              )}
            </div>
          )}

          {activeSubTab === 'history' && (
            <ChallengeHistoryList
              history={history}
              onViewInsights={handleViewHistoricalInsights}
              isLoading={isLoadingHistory}
            />
          )}
        </>
      )}
    </div>
  );
};
