/**
 * Box3DVisualizerModal Component
 * 
 * Full-screen modal that displays the 3D box visualizer alongside
 * a comic detail panel on the right side.
 */

import React, { useState, useEffect } from 'react';
import { ComicBook, StorageBox } from '../types';
import Box3DVisualizer from './Box3DVisualizer';
import { ComicDetailPanel } from './ComicDetailPanel';
import { FullArtShowcaseModal } from './FullArtShowcaseModal';
import { X } from 'lucide-react';

export interface Box3DVisualizerModalProps {
  isOpen: boolean;
  box: StorageBox;
  comics: ComicBook[];
  onClose: () => void;
  onUpdateComic?: (comic: ComicBook) => void;
  onDeleteComic?: (comicId: string) => void;
}

export const Box3DVisualizerModal: React.FC<Box3DVisualizerModalProps> = ({
  isOpen,
  box,
  comics,
  onClose,
  onUpdateComic,
  onDeleteComic,
}) => {
  const [selectedComic, setSelectedComic] = useState<ComicBook | null>(null);
  const [fullArtComic, setFullArtComic] = useState<ComicBook | null>(null);

  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center safe-top safe-bottom p-0 sm:p-4 select-none"
    >
      <div className="bg-white dark:bg-slate-900 border-0 sm:border border-slate-200 dark:border-slate-800 w-full h-full sm:w-11/12 sm:h-5/6 sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header with accessible close button */}
        <div className="flex items-center justify-between bg-gradient-to-r from-slate-900 to-slate-800 text-white px-4 sm:px-6 py-2.5 sm:py-3.5 border-b border-slate-700/60 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <h1 className="text-base sm:text-xl font-bold truncate">3D Box Visualizer</h1>
            <span className="text-xs text-slate-400 truncate hidden sm:inline">• {box.name}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-white transition-all touch-manipulation cursor-pointer shrink-0"
            title="Close (Esc)"
            aria-label="Close 3D Visualizer"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>

        {/* Main content: 3D viewer + detail panel */}
        <div className="flex-1 flex overflow-hidden relative">
          {/* Left / Full: 3D Visualizer (takes full width on mobile when unselected; 2/3 on desktop) */}
          <div className="flex-1 min-w-0 h-full">
            <Box3DVisualizer
              box={box}
              comics={comics}
              onSelectComic={setSelectedComic}
              onViewFullArt={(comic) => setFullArtComic(comic)}
              onClose={onClose}
              highlightedComicId={selectedComic?.id}
            />
          </div>

          {/* Right: Comic Detail Panel (responsive drawer on mobile; 1/3 column on desktop) */}
          <div className={`border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-y-auto transition-all ${
            selectedComic
              ? 'absolute inset-x-0 bottom-0 z-30 max-h-[70vh] md:static md:w-1/3 md:max-h-full shadow-2xl md:shadow-none'
              : 'hidden md:block md:w-1/3'
          }`}>
            {selectedComic ? (
              <div className="relative">
                {/* Mobile close details button */}
                <div className="md:hidden flex items-center justify-between p-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 sticky top-0 z-10 backdrop-blur-xs">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Comic Details</span>
                  <button
                    type="button"
                    onClick={() => setSelectedComic(null)}
                    className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 active:scale-95 touch-manipulation"
                  >
                    Done
                  </button>
                </div>
                <ComicDetailPanel
                  comic={selectedComic}
                  onUpdate={onUpdateComic}
                  onViewFullArt={(comic) => setFullArtComic(comic)}
                  onDelete={() => {
                    if (onDeleteComic) {
                      onDeleteComic(selectedComic.id);
                      setSelectedComic(null);
                    }
                  }}
                  compact={true}
                />
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-center text-slate-500 dark:text-slate-400 p-4">
                <div>
                  <p className="text-sm">Select a comic to view details</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Full Art Wraparound Showcase Modal */}
      {fullArtComic && (
        <FullArtShowcaseModal
          isOpen={!!fullArtComic}
          onClose={() => setFullArtComic(null)}
          comic={fullArtComic}
          allComics={comics}
          onSelectComic={(c) => setFullArtComic(c)}
        />
      )}
    </div>
  );
};

export default Box3DVisualizerModal;
