import React, { useState } from 'react';
import { 
  CheckCircle, 
  FastForward, 
  BookOpen, 
  Calendar, 
  Boxes, 
  ExternalLink, 
  Sparkles, 
  Loader2,
  Tag,
  User
} from 'lucide-react';
import { ComicBook, StorageBox } from '../../types';
import { ChallengeQueueItem, TBRMilestonesSummary } from '../../types/readingChallenge.types';
import { getComicCoverUrl, handleImageError } from '../../utils/imageUtils';

interface ReadingQueueProps {
  queue: ChallengeQueueItem[];
  boxes: StorageBox[];
  comics?: ComicBook[];
  onMarkRead: (itemId: number) => Promise<void>;
  onSkip: (itemId: number) => Promise<void>;
  onSelectComic?: (comic: ComicBook) => void;
  milestonesSummary?: TBRMilestonesSummary;
}

export const ReadingQueue: React.FC<ReadingQueueProps> = ({
  queue,
  boxes,
  comics,
  onMarkRead,
  onSkip,
  onSelectComic,
  milestonesSummary,
}) => {
  const [pendingItemId, setPendingItemId] = useState<number | null>(null);

  const handleSelectComic = (item: ChallengeQueueItem) => {
    if (!onSelectComic) return;
    const fullComic = comics?.find((c) => c.id === item.comicId);
    if (fullComic) {
      onSelectComic(fullComic);
      return;
    }
    // Defensive fallback: synthesize a complete ComicBook object if not in list
    const meta = item.metadata;
    const fallbackComic: ComicBook = {
      id: item.comicId,
      title: meta.title || 'Untitled',
      issueNumber: meta.issueNumber || '',
      volume: meta.volume,
      seriesName: meta.seriesName,
      fullTitle: meta.fullTitle,
      publisher: meta.publisher || 'Unknown',
      publicationYear: meta.publicationYear || (meta.publicationDate ? parseInt(meta.publicationDate.slice(0, 4), 10) || 0 : 0),
      publicationMonth: meta.publicationMonth,
      publicationDate: meta.publicationDate,
      genre: meta.genre || '',
      writer: meta.writer || '',
      artist: meta.artist || '',
      coverArtist: meta.coverArtist,
      creatorContributions: (meta.creatorContributions as any) || [],
      characterAppearances: (meta.characterAppearances as any) || [],
      event: meta.event,
      coverImage: meta.coverImage || meta.coverImageFull || '',
      coverImageFull: meta.coverImageFull || meta.coverImage,
      currentBoxId: item.currentBoxId ?? meta.currentBoxId ?? 0,
      readingStatus: item.status === 'Read' ? 'Read' : 'Unread',
      readCount: item.status === 'Read' ? 1 : 0,
      tags: [],
      sizeThickness: meta.sizeThickness ?? 1.0,
      condition: 'Near Mint',
      format: (meta.format as any) || 'Single Issue',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    onSelectComic(fallbackComic);
  };

  const handleAction = async (itemId: number, action: (id: number) => Promise<void>) => {
    setPendingItemId(itemId);
    try {
      await action(itemId);
    } finally {
      setPendingItemId(null);
    }
  };

  if (!queue || queue.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center shadow-xs">
        <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4">
          <CheckCircle className="w-8 h-8" />
        </div>
        <h3 className="text-base font-bold text-slate-900 dark:text-white">
          No Unread Comics Left in Queue!
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
          All remaining items have been resolved. Check your progress panel or view milestone insights.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white">
            Current Reading Queue
          </h3>
          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
            {queue.length} up next
          </span>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
          Comics are presented in chronological sequence.
        </p>
      </div>

      {/* TBR Milestones Spotlight Banner */}
      {milestonesSummary && milestonesSummary.totalMilestonesCount > 0 && (
        <div className="bg-gradient-to-r from-amber-500/15 via-indigo-500/10 to-purple-500/15 border border-amber-300/60 dark:border-amber-600/50 rounded-2xl p-3.5 px-4 flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white flex items-center justify-center shadow-xs shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-2">
                <span>Upcoming Milestones in TBR Queue</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                  {milestonesSummary.totalMilestonesCount} {milestonesSummary.totalMilestonesCount === 1 ? 'Milestone' : 'Milestones'}
                </span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                {milestonesSummary.comicsWithMilestonesCount} of your upcoming comics feature first appearances, earliest creator work, or collection timeline milestones!
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {queue.map((item, index) => {
          const meta = item.metadata;
          const isPending = pendingItemId === item.challengeItemId;

          // Find current storage box
          const currentBoxId = item.currentBoxId ?? meta.currentBoxId;
          const box = boxes.find((b) => b.id === currentBoxId);

          // Find TBR highlights for this comic
          const highlightEntry = milestonesSummary?.itemsWithHighlights.find(
            (entry) => entry.challengeItemId === item.challengeItemId
          );
          const itemHighlights = highlightEntry?.highlights || [];
          const hasHighlights = itemHighlights.length > 0;

          return (
            <div
              key={item.challengeItemId}
              className={`relative bg-white dark:bg-slate-900 border rounded-2xl p-4 shadow-xs flex gap-4 transition-all ${
                index === 0
                  ? 'border-indigo-500/70 dark:border-indigo-500/70 ring-2 ring-indigo-500/15'
                  : hasHighlights
                  ? 'border-amber-400/60 dark:border-amber-500/50 bg-gradient-to-br from-amber-50/25 via-white to-white dark:from-amber-950/10 dark:via-slate-900 dark:to-slate-900'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              {/* Position badge */}
              <div className="absolute top-3 left-3 z-10">
                <span className={`px-2 py-0.5 rounded-md text-[11px] font-black shadow-xs ${
                  index === 0
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-900/80 text-white backdrop-blur-xs'
                }`}>
                  #{item.sequenceNumber}
                </span>
              </div>

              {/* Cover Thumbnail */}
              <div 
                className="w-24 sm:w-28 aspect-2/3 bg-slate-100 dark:bg-slate-800 rounded-xl overflow-hidden shrink-0 shadow-sm relative group cursor-pointer"
                onClick={() => handleSelectComic(item)}
                title="Click to view comic details"
              >
                <img
                  src={getComicCoverUrl(meta.coverImage || meta.coverImageFull)}
                  alt={meta.title}
                  onError={handleImageError}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                />
                <div className="absolute inset-0 bg-slate-900/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                  <ExternalLink className="w-5 h-5 drop-shadow" />
                </div>
              </div>

              {/* Info Column */}
              <div className="flex-1 min-w-0 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded">
                      {meta.publisher || 'Unknown'}
                    </span>
                    {meta.publicationDate ? (
                      <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        <span>{meta.publicationDate}</span>
                      </span>
                    ) : meta.publicationYear ? (
                      <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        <span>{meta.publicationYear}</span>
                      </span>
                    ) : null}
                  </div>

                  <h4 
                    onClick={() => handleSelectComic(item)}
                    className="font-bold text-sm text-slate-900 dark:text-white leading-tight line-clamp-2 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer transition-colors"
                  >
                    {meta.title} #{meta.issueNumber}
                  </h4>

                  {meta.seriesName && meta.seriesName !== meta.title && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {meta.seriesName}
                    </p>
                  )}

                  {/* Creators */}
                  {(meta.writer || meta.artist) && (
                    <div className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400 mt-1 truncate">
                      <User className="w-3 h-3 shrink-0 text-slate-400" />
                      <span className="truncate">
                        {meta.writer && <span>W: {meta.writer}</span>}
                        {meta.writer && meta.artist && <span className="mx-1">•</span>}
                        {meta.artist && <span>A: {meta.artist}</span>}
                      </span>
                    </div>
                  )}

                  {/* Event / Story Arc */}
                  {meta.event && (
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300 mt-1">
                      <Sparkles className="w-3 h-3 text-amber-500" />
                      <span className="truncate">{meta.event}</span>
                    </div>
                  )}

                  {/* TBR Collection Milestone Pills */}
                  {itemHighlights.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {itemHighlights.map((hl) => (
                        <div
                          key={hl.id}
                          title={hl.description}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black border tracking-tight shadow-2xs ${
                            hl.category === 'Collection'
                              ? 'bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700'
                              : hl.category === 'Character'
                              ? 'bg-purple-100 dark:bg-purple-950 text-purple-900 dark:text-purple-200 border-purple-300 dark:border-purple-700'
                              : hl.category === 'Creator'
                              ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-900 dark:text-indigo-200 border-indigo-300 dark:border-indigo-700'
                              : hl.category === 'StoryArc'
                              ? 'bg-orange-100 dark:bg-orange-950 text-orange-900 dark:text-orange-200 border-orange-300 dark:border-orange-700'
                              : hl.category === 'Series'
                              ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-900 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700'
                              : 'bg-sky-100 dark:bg-sky-950 text-sky-900 dark:text-sky-200 border-sky-300 dark:border-sky-700'
                          }`}
                        >
                          <Sparkles className="w-2.5 h-2.5 shrink-0" />
                          <span>{hl.label}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Live Storage Location Pill */}
                  <div className="mt-2.5">
                    {box ? (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-300">
                        <span 
                          className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs" 
                          style={{ backgroundColor: box.colorTag || '#4f46e5' }}
                        />
                        <span className="font-bold">{box.name}</span>
                        {box.location && (
                          <span className="text-slate-400 dark:text-slate-500">({box.location})</span>
                        )}
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                        <Boxes className="w-3 h-3" />
                        <span>Unassigned Box</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions Footer */}
                <div className="flex items-center gap-2 pt-3 mt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleAction(item.challengeItemId, onMarkRead)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-400 text-white font-bold text-xs rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle className="w-3.5 h-3.5" />
                    )}
                    <span>Mark as Read</span>
                  </button>

                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleAction(item.challengeItemId, onSkip)}
                    className="flex items-center justify-center gap-1 py-2 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs rounded-xl border border-slate-200 dark:border-slate-700 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                    title="Skip this comic (won't count as read, advances queue)"
                  >
                    <FastForward className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Skip</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
