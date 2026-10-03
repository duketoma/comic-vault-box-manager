/**
 * ComicDetailPanel Component
 * 
 * Compact sidebar panel for viewing comic details in the 3D visualizer.
 * Shows cover art, title, and key metadata with minimal edit capability.
 */

import React, { useState } from 'react';
import { ComicBook } from '../types';
import { getComicCoverUrl, formatDriveImageUrl, handleImageError } from '../utils/imageUtils';
import { Star, Trash2, Edit3, BookOpen, Calendar, Sparkles } from 'lucide-react';

export interface ComicDetailPanelProps {
  comic: ComicBook;
  onUpdate?: (comic: ComicBook) => void;
  onDelete?: () => void;
  onViewFullArt?: (comic: ComicBook) => void;
  compact?: boolean;
}

export const ComicDetailPanel: React.FC<ComicDetailPanelProps> = ({
  comic,
  onUpdate,
  onDelete,
  onViewFullArt,
  compact = false,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [rating, setRating] = useState(comic.userRating || 0);
  const [heroViewMode, setHeroViewMode] = useState<'front' | 'full'>('front');

  const handleRatingChange = (newRating: number) => {
    setRating(newRating);
    if (onUpdate) {
      onUpdate({ ...comic, userRating: newRating });
    }
  };

  const coverUrl = getComicCoverUrl(comic.coverImage);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
      {/* Cover Image */}
      <div className="p-4 bg-gradient-to-b from-slate-50 to-white dark:from-slate-800 dark:to-slate-900 border-b border-slate-200 dark:border-slate-800">
        {comic.coverImageFull && (
          <div className="flex items-center justify-between pb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-500" />
              Full Wraparound Art
            </span>
            <div className="flex items-center gap-1 bg-slate-200/80 dark:bg-slate-700/80 p-0.5 rounded-lg text-[10px] font-bold">
              <button
                type="button"
                onClick={() => setHeroViewMode('front')}
                className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                  heroViewMode === 'front'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs font-black'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Front
              </button>
              <button
                type="button"
                onClick={() => setHeroViewMode('full')}
                className={`px-2 py-0.5 rounded-md transition-all cursor-pointer flex items-center gap-0.5 ${
                  heroViewMode === 'full'
                    ? 'bg-purple-600 text-white shadow-xs font-black'
                    : 'text-purple-700 dark:text-purple-300 hover:text-purple-900'
                }`}
              >
                Full Art
              </button>
            </div>
          </div>
        )}

        <div className={`relative ${heroViewMode === 'full' && comic.coverImageFull ? 'aspect-[16/10] bg-black/40' : 'aspect-[2/3] bg-slate-100 dark:bg-slate-800'} rounded-lg overflow-hidden shadow-md group`}>
          <img
            key={comic.id || (heroViewMode === 'full' ? comic.coverImageFull : coverUrl)}
            src={heroViewMode === 'full' && comic.coverImageFull ? formatDriveImageUrl(comic.coverImageFull) : coverUrl}
            alt={comic.title}
            onError={handleImageError}
            referrerPolicy="no-referrer"
            className={`w-full h-full ${heroViewMode === 'full' && comic.coverImageFull ? 'object-contain' : 'object-cover'} cursor-pointer`}
            onClick={() => {
              if (comic.coverImageFull && onViewFullArt) onViewFullArt(comic);
            }}
            title={comic.coverImageFull ? 'Click to open interactive full-art showcase' : undefined}
          />

          {comic.coverImageFull && onViewFullArt && (
            <button
              type="button"
              onClick={() => onViewFullArt(comic)}
              className="absolute bottom-2 right-2 bg-purple-600 hover:bg-purple-700 text-white text-[10px] font-extrabold px-2 py-1 rounded-lg shadow-lg flex items-center gap-1 transition-all cursor-pointer"
              title="Open Full Art Showcase"
            >
              <Sparkles className="w-3 h-3 text-amber-300" />
              <span>Showcase</span>
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Title & Issue */}
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 line-clamp-2 text-sm">
            {comic.title || comic.fullTitle || comic.seriesName || 'Untitled Comic'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Issue #{comic.issueNumber}
            {comic.volume && ` • Vol. ${comic.volume}`}
          </p>
        </div>

        {/* Publication */}
        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
            <Calendar className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
            <span>{comic.publicationYear}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
            <BookOpen className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
            <span className="capitalize">{comic.format}</span>
          </div>
        </div>

        {/* Creator Info */}
        {(comic.writer || comic.artist) && (
          <div className="space-y-1 text-xs bg-slate-50 dark:bg-slate-800/60 p-2 rounded border border-slate-100 dark:border-slate-800">
            {comic.writer && (
              <div>
                <span className="text-slate-500 dark:text-slate-400 font-medium">Writer:</span>
                <p className="text-slate-700 dark:text-slate-300">{comic.writer}</p>
              </div>
            )}
            {comic.artist && (
              <div>
                <span className="text-slate-500 dark:text-slate-400 font-medium">Artist:</span>
                <p className="text-slate-700 dark:text-slate-300">{comic.artist}</p>
              </div>
            )}
          </div>
        )}

        {/* Rating */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Your Rating</label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => handleRatingChange(star)}
                className={`transition-colors cursor-pointer ${
                  star <= rating ? 'text-amber-400' : 'text-slate-300 dark:text-slate-600 hover:text-slate-400'
                }`}
              >
                <Star className="w-4 h-4 fill-current" />
              </button>
            ))}
          </div>
        </div>

        {/* Status & Reading Info */}
        <div className="space-y-2 text-xs bg-slate-50 dark:bg-slate-800/60 p-2 rounded border border-slate-100 dark:border-slate-800">
          <div>
            <span className="text-slate-500 dark:text-slate-400 font-medium">Status:</span>
            <p className="text-slate-700 dark:text-slate-300 capitalize">{comic.readingStatus}</p>
          </div>
          {comic.readCount > 0 && (
            <div>
              <span className="text-slate-500 dark:text-slate-400 font-medium">Times Read:</span>
              <p className="text-slate-700 dark:text-slate-300">{comic.readCount}</p>
            </div>
          )}
        </div>

        {/* Thickness Info */}
        <div className="space-y-2 text-xs bg-slate-50 dark:bg-slate-800/60 p-2 rounded border border-slate-100 dark:border-slate-800">
          <span className="text-slate-500 dark:text-slate-400 font-medium">Thickness:</span>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-slate-200 dark:bg-slate-700 h-2 rounded overflow-hidden">
              <div
                className="bg-blue-500 h-full"
                style={{ width: `${Math.min((comic.sizeThickness / 3) * 100, 100)}%` }}
              />
            </div>
            <span className="text-slate-700 dark:text-slate-300 font-medium">{comic.sizeThickness.toFixed(1)}x</span>
          </div>
        </div>

        {/* Notes */}
        {comic.notes && (
          <div className="text-xs bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded p-2">
            <span className="text-amber-900 dark:text-amber-200 font-medium">Notes:</span>
            <p className="text-amber-800 dark:text-amber-300 mt-1 line-clamp-3">{comic.notes}</p>
          </div>
        )}

        {/* Tags */}
        {comic.tags && comic.tags.length > 0 && (
          <div className="space-y-2">
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Tags</span>
            <div className="flex flex-wrap gap-1">
              {comic.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-1 rounded-full border dark:border-slate-700"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Full Art Action Banner */}
      {comic.coverImageFull && onViewFullArt && (
        <div className="px-4 py-2.5 bg-purple-50 dark:bg-purple-950/40 border-t border-purple-200 dark:border-purple-900/60">
          <button
            type="button"
            onClick={() => onViewFullArt(comic)}
            className="w-full text-xs py-2 px-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg shadow-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Showcase Wraparound Art</span>
          </button>
        </div>
      )}

      {/* Footer Actions */}
      {(onDelete || onUpdate) && (
        <div className="border-t border-slate-200 dark:border-slate-800 p-3 bg-slate-50 dark:bg-slate-800/60 flex gap-2">
          {onDelete && (
            <button
              onClick={onDelete}
              className="flex-1 text-xs px-3 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 rounded transition-colors font-medium flex items-center justify-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ComicDetailPanel;
