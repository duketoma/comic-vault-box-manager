import React, { useState } from 'react';
import { ComicBook } from '../types';
import { Trash2, CopyX, RefreshCw, AlertTriangle, CheckCircle2, ShieldAlert, Sparkles, X } from 'lucide-react';

interface DataManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  comics: ComicBook[];
  onRemoveDuplicates: () => number;
  onClearAllComics: () => void;
  onResetSampleData: () => void;
}

export const DataManagementModal: React.FC<DataManagementModalProps> = ({
  isOpen,
  onClose,
  comics,
  onRemoveDuplicates,
  onClearAllComics,
  onResetSampleData,
}) => {
  const [notification, setNotification] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState<boolean>(false);

  if (!isOpen) return null;

  // Calculate duplicates count preview
  const getDuplicatesCount = () => {
    const seen = new Set<string>();
    let dupes = 0;
    for (const c of comics) {
      const key = `${c.title.trim().toLowerCase()}|${c.issueNumber.trim().toLowerCase()}|${c.publisher.trim().toLowerCase()}`;
      if (seen.has(key)) {
        dupes++;
      } else {
        seen.add(key);
      }
    }
    return dupes;
  };

  const duplicateCount = getDuplicatesCount();

  const handleDeduplicate = () => {
    const removed = onRemoveDuplicates();
    setNotification(`Successfully removed ${removed} duplicate comic entry(ies)!`);
    setTimeout(() => setNotification(null), 4000);
  };

  const handleClear = () => {
    onClearAllComics();
    setConfirmClear(false);
    setNotification('All collection data has been cleared.');
    setTimeout(() => {
      setNotification(null);
      onClose();
    }, 1500);
  };

  const handleReset = () => {
    if (window.confirm('Reset collection to the initial sample data? This will replace your current comics.')) {
      onResetSampleData();
      setNotification('Collection reset to default sample data.');
      setTimeout(() => {
        setNotification(null);
        onClose();
      }, 1500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative overflow-hidden text-slate-900 dark:text-slate-100">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="p-2.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 rounded-xl">
            <Trash2 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Manage & Reset Data</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Clean up double imports, wipe collection, or restore sample data
            </p>
          </div>
        </div>

        {/* Notification Toast */}
        {notification && (
          <div className="mt-4 p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-semibold rounded-xl flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{notification}</span>
          </div>
        )}

        <div className="mt-5 space-y-4">
          
          {/* Status Summary */}
          <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 flex items-center justify-between text-xs">
            <div>
              <span className="text-slate-500 dark:text-slate-400">Current Collection Size:</span>{' '}
              <strong className="text-slate-900 dark:text-slate-100 font-bold">{comics.length} Comics</strong>
            </div>
            {duplicateCount > 0 ? (
              <span className="bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-bold px-2.5 py-1 rounded-md text-[11px] flex items-center gap-1 border border-amber-200 dark:border-amber-800">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                {duplicateCount} Duplicates Detected
              </span>
            ) : (
              <span className="bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-bold px-2 py-0.5 rounded-md text-[11px] border dark:border-emerald-800">
                No Duplicates Detected
              </span>
            )}
          </div>

          {/* Option 1: Remove Duplicates (Ideal for double imports!) */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 hover:border-slate-300 dark:hover:border-slate-700 transition-all bg-white dark:bg-slate-900/60">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
                  <CopyX className="w-4 h-4 text-amber-500" />
                  Option 1: Remove Duplicate Entries
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Perfect if you accidentally imported your spreadsheet twice. Automatically detects identical title, issue, and publisher rows and keeps only one copy.
                </p>
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <button
                onClick={handleDeduplicate}
                disabled={duplicateCount === 0}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-extrabold text-xs rounded-lg shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Clean Duplicates ({duplicateCount})</span>
              </button>
            </div>
          </div>

          {/* Option 2: Clear All Comics (Start Completely Fresh) */}
          <div className="border border-rose-200 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/30 rounded-xl p-4">
            <h3 className="font-bold text-rose-950 dark:text-rose-200 text-sm flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-rose-600 dark:text-rose-400" />
              Option 2: Clear Entire Collection (Wipe Data)
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Removes all comics from memory and local storage so you can re-import from scratch with a completely empty catalog.
            </p>

            {confirmClear ? (
              <div className="mt-3 p-3 bg-rose-100 dark:bg-rose-950/70 border border-rose-300 dark:border-rose-800 rounded-lg space-y-2">
                <div className="text-xs font-bold text-rose-900 dark:text-rose-200 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                  Are you sure? This will delete all {comics.length} comics.
                </div>
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    onClick={() => setConfirmClear(false)}
                    className="px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-md border border-slate-200 dark:border-slate-700 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleClear}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-md shadow-xs cursor-pointer"
                  >
                    Yes, Delete All Data
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex justify-end">
                <button
                  onClick={() => setConfirmClear(true)}
                  disabled={comics.length === 0}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold text-xs rounded-lg shadow-xs cursor-pointer"
                >
                  Clear All Comics ({comics.length})
                </button>
              </div>
            )}
          </div>

          {/* Option 3: Reset to Default Starter Collection */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50/50 dark:bg-slate-800/40">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                  Option 3: Reset to Default Sample Collection
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Restores the original 14 starter sample comic issues and resets the 15 storage box configurations.
                </p>
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <button
                onClick={handleReset}
                className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs rounded-lg shadow-xs border border-slate-300 dark:border-slate-700 cursor-pointer"
              >
                Reset to Sample Collection
              </button>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
