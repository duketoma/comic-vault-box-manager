/**
 * ComicDetailPanel Component
 * 
 * Compact sidebar panel for viewing comic details in the 3D visualizer.
 * Shows cover art, title, and key metadata with minimal edit capability.
 */

import React, { useState } from 'react';
import { ComicBook } from '../types';
import { getComicCoverUrl, handleImageError } from '../utils/imageUtils';
import { Star, Trash2, Edit3, BookOpen, Calendar } from 'lucide-react';

export interface ComicDetailPanelProps {
  comic: ComicBook;
  onUpdate?: (comic: ComicBook) => void;
  onDelete?: () => void;
  compact?: boolean;
}

export const ComicDetailPanel: React.FC<ComicDetailPanelProps> = ({
  comic,
  onUpdate,
  onDelete,
  compact = false,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [rating, setRating] = useState(comic.userRating || 0);

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
        <div className="aspect-[2/3] rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 shadow-md">
          <img
            src={coverUrl}
            alt={comic.title}
            onError={handleImageError}
            className="w-full h-full object-cover"
          />
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
