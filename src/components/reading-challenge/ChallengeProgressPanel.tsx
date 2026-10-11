import React, { useState } from 'react';
import { 
  Trophy, 
  RotateCcw, 
  StopCircle, 
  CheckCircle, 
  FastForward, 
  Hourglass, 
  Calendar, 
  AlertTriangle 
} from 'lucide-react';
import { ReadingChallengeSummary } from '../../types/readingChallenge.types';

interface ChallengeProgressPanelProps {
  challenge: ReadingChallengeSummary;
  onUndoLastRead?: () => Promise<void>;
  onAbandonChallenge: () => Promise<void>;
}

export const ChallengeProgressPanel: React.FC<ChallengeProgressPanelProps> = ({
  challenge,
  onUndoLastRead,
  onAbandonChallenge,
}) => {
  const [isConfirmingAbandon, setIsConfirmingAbandon] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);

  const handleAbandon = async () => {
    setIsEnding(true);
    try {
      await onAbandonChallenge();
    } finally {
      setIsEnding(false);
      setIsConfirmingAbandon(false);
    }
  };

  const handleUndo = async () => {
    if (!onUndoLastRead) return;
    setIsUndoing(true);
    try {
      await onUndoLastRead();
    } finally {
      setIsUndoing(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
      {/* Title & Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              {challenge.status} Challenge
            </span>
            <span className="text-xs text-slate-400 dark:text-slate-500">•</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Started {new Date(challenge.startedAt).toLocaleDateString()}
            </span>
          </div>
          <h2 className="text-lg font-black text-slate-900 dark:text-white mt-1">
            {challenge.name}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
            {challenge.criteriaSummary}
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 self-start sm:self-center">
          {challenge.readCount > 0 && onUndoLastRead && (
            <button
              type="button"
              disabled={isUndoing}
              onClick={handleUndo}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs border border-slate-200 dark:border-slate-700 transition-colors active:scale-95 cursor-pointer disabled:opacity-50"
              title="Undo last comic marked as read"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isUndoing ? 'animate-spin' : ''}`} />
              <span>Undo Read</span>
            </button>
          )}

          {challenge.status === 'Active' && (
            <button
              type="button"
              onClick={() => setIsConfirmingAbandon(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 font-semibold text-xs border border-rose-200 dark:border-rose-800 transition-colors active:scale-95 cursor-pointer"
              title="End / abandon this challenge"
            >
              <StopCircle className="w-3.5 h-3.5" />
              <span>End Challenge</span>
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div>
        <div className="flex items-center justify-between text-xs font-bold mb-1.5">
          <span className="text-slate-700 dark:text-slate-300">
            Challenge Progress ({challenge.progressPercent}%)
          </span>
          <span className="text-slate-500 dark:text-slate-400 font-mono">
            {challenge.resolvedCount} of {challenge.totalEligible} resolved
          </span>
        </div>
        <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
          {/* Read segment */}
          <div
            className="h-full bg-emerald-500 transition-all duration-300"
            style={{
              width: `${challenge.totalEligible > 0 ? (challenge.readCount / challenge.totalEligible) * 100 : 0}%`,
            }}
            title={`${challenge.readCount} read`}
          />
          {/* Skipped segment */}
          <div
            className="h-full bg-slate-400 dark:bg-slate-600 transition-all duration-300"
            style={{
              width: `${challenge.totalEligible > 0 ? (challenge.skippedCount / challenge.totalEligible) * 100 : 0}%`,
            }}
            title={`${challenge.skippedCount} skipped`}
          />
        </div>
      </div>

      {/* Stats Counter Pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
        <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40 rounded-xl">
          <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 text-xs font-bold">
            <CheckCircle className="w-3.5 h-3.5" />
            <span>Comics Read</span>
          </div>
          <div className="text-xl font-black text-slate-900 dark:text-white mt-1">
            {challenge.readCount}
            <span className="text-xs text-slate-400 font-normal ml-1">/ {challenge.totalEligible}</span>
          </div>
        </div>

        <div className="p-3 bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 rounded-xl">
          <div className="flex items-center gap-1.5 text-indigo-700 dark:text-indigo-400 text-xs font-bold">
            <Hourglass className="w-3.5 h-3.5" />
            <span>Remaining</span>
          </div>
          <div className="text-xl font-black text-slate-900 dark:text-white mt-1">
            {challenge.remainingCount}
          </div>
        </div>

        <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl">
          <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 text-xs font-bold">
            <FastForward className="w-3.5 h-3.5" />
            <span>Skipped</span>
          </div>
          <div className="text-xl font-black text-slate-900 dark:text-white mt-1">
            {challenge.skippedCount}
          </div>
        </div>

        <div className="p-3 bg-amber-50/60 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40 rounded-xl">
          <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 text-xs font-bold">
            <Trophy className="w-3.5 h-3.5" />
            <span>Completion</span>
          </div>
          <div className="text-xl font-black text-slate-900 dark:text-white mt-1">
            {challenge.progressPercent}%
          </div>
        </div>
      </div>

      {/* Confirmation Modal for Abandoning */}
      {isConfirmingAbandon && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
              <div className="w-10 h-10 rounded-full bg-rose-50 dark:bg-rose-950/60 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Abandon Active Challenge?
              </h3>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Ending this challenge will mark it as <strong>Abandoned</strong>. All read history, completed milestones, and snapshot data will be safely preserved in your Challenge History.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsConfirmingAbandon(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isEnding}
                onClick={handleAbandon}
                className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                {isEnding ? 'Ending...' : 'Yes, End Challenge'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
