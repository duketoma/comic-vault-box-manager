/**
 * Box3DVisualizerModal Component
 * 
 * Full-screen modal that displays the 3D box visualizer alongside
 * a comic detail panel on the right side.
 */

import React, { useState } from 'react';
import { ComicBook, StorageBox } from '../types';
import Box3DVisualizer from './Box3DVisualizer';
import { ComicDetailPanel } from './ComicDetailPanel';
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
      <div className="bg-white w-11/12 h-5/6 rounded-lg shadow-2xl flex flex-col">
        {/* Header with close button */}
        <div className="flex items-center justify-between bg-gradient-to-r from-slate-900 to-slate-800 text-white px-6 py-4 rounded-t-lg">
          <h1 className="text-2xl font-bold">3D Box Visualizer</h1>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-700 rounded transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Main content: 3D viewer + detail panel */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: 3D Visualizer (takes 2/3 width) */}
          <div className="flex-1 min-w-0">
            <Box3DVisualizer
              box={box}
              comics={comics}
              onSelectComic={setSelectedComic}
              highlightedComicId={selectedComic?.id}
            />
          </div>

          {/* Right: Comic Detail Panel (takes 1/3 width) */}
          <div className="w-1/3 border-l border-slate-200 bg-white overflow-y-auto">
            {selectedComic ? (
              <ComicDetailPanel
                comic={selectedComic}
                onUpdate={onUpdateComic}
                onDelete={() => {
                  if (onDeleteComic) {
                    onDeleteComic(selectedComic.id);
                    setSelectedComic(null);
                  }
                }}
                compact={true}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-center text-slate-500 p-4">
                <div>
                  <p className="text-sm">Select a comic to view details</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Box3DVisualizerModal;
