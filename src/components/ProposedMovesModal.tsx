import React, { useMemo } from 'react';
import { ComicBook, StorageBox } from '../types';
import { getComicCoverUrl, handleImageError } from '../utils/imageUtils';
import { sortBoxes, isTrueProposedMove } from '../utils/boxUtils';
import { sortComicsByTitleAndIssue } from '../utils/comicSortUtils';
import { 
  X, 
  ArrowRight, 
  RotateCcw, 
  Check, 
  Boxes, 
  PackageCheck,
  CheckCheck,
  ExternalLink,
  MapPin,
  Sparkles
} from 'lucide-react';

interface ProposedMovesModalProps {
  isOpen: boolean;
  onClose: () => void;
  comics: ComicBook[];
  boxes: StorageBox[];
  onUpdateComics: (updatedComics: ComicBook[]) => void;
  onSelectComic?: (comic: ComicBook) => void;
}

const BOX_ZERO: StorageBox = {
  id: 0,
  name: 'Box 0 - Unallocated Staging Queue',
  location: 'Unboxed (In Collection Staging)',
  maxCapacity: 150,
  colorTag: '#F59E0B',
  notes: 'Owned comics in your collection that are not allocated to a physical storage box.',
};

export const ProposedMovesModal: React.FC<ProposedMovesModalProps> = ({
  isOpen,
  onClose,
  comics,
  boxes,
  onUpdateComics,
  onSelectComic,
}) => {
  const sortedBoxes = useMemo(() => sortBoxes(boxes), [boxes]);
  const allBoxesWithZero = useMemo(() => [BOX_ZERO, ...sortedBoxes], [sortedBoxes]);

  const proposedComics = useMemo(() => {
    return sortComicsByTitleAndIssue(comics.filter(isTrueProposedMove));
  }, [comics]);

  const getBox = (boxId: number): StorageBox => {
    if (boxId === 0) return BOX_ZERO;
    return (
      sortedBoxes.find((b) => b.id === boxId) || {
        id: boxId,
        name: `Box #${boxId}`,
        location: 'Storage Rack',
        maxCapacity: 150,
        colorTag: '#64748B',
      }
    );
  };

  // Group summary by origin -> target
  const relocationFlows = useMemo(() => {
    const flows = new Map<string, { fromId: number; toId: number; count: number; thickness: number }>();
    proposedComics.forEach((c) => {
      const fromId = Number(c.currentBoxId ?? 0);
      const toId = Number(c.proposedBoxId ?? 0);
      const key = `${fromId}->${toId}`;
      const existing = flows.get(key) || { fromId, toId, count: 0, thickness: 0 };
      existing.count += 1;
      existing.thickness += (c.sizeThickness || 1.0);
      flows.set(key, existing);
    });
    return Array.from(flows.values());
  }, [proposedComics]);

  const totalThickness = useMemo(() => {
    return proposedComics.reduce((sum, c) => sum + (c.sizeThickness || 1.0), 0);
  }, [proposedComics]);

  if (!isOpen) return null;

  // Single Move Handlers
  const handleCommitSingleMove = (comicId: string) => {
    const updated = comics.map((c) => {
      if (c.id === comicId && isTrueProposedMove(c)) {
        const targetBox = Number(c.proposedBoxId);
        return {
          ...c,
          currentBoxId: targetBox,
          proposedBoxId: targetBox,
        };
      }
      return c;
    });
    onUpdateComics(updated);
  };

  const handleRevertSingleMove = (comicId: string) => {
    const updated = comics.map((c) => {
      if (c.id === comicId) {
        return {
          ...c,
          proposedBoxId: c.currentBoxId ?? 0,
        };
      }
      return c;
    });
    onUpdateComics(updated);
  };

  const handleChangeTargetBox = (comicId: string, newTargetBoxId: number) => {
    const updated = comics.map((c) => {
      if (c.id === comicId) {
        return {
          ...c,
          proposedBoxId: newTargetBoxId,
        };
      }
      return c;
    });
    onUpdateComics(updated);
  };

  // Batch Handlers
  const handleCommitAll = () => {
    const updated = comics.map((c) => {
      if (isTrueProposedMove(c)) {
        const targetBox = Number(c.proposedBoxId);
        return {
          ...c,
          currentBoxId: targetBox,
          proposedBoxId: targetBox,
        };
      }
      return c;
    });
    onUpdateComics(updated);
  };

  const handleDiscardAll = () => {
    const updated = comics.map((c) => {
      if (isTrueProposedMove(c)) {
        return {
          ...c,
          proposedBoxId: c.currentBoxId ?? 0,
        };
      }
      return c;
    });
    onUpdateComics(updated);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl relative overflow-hidden">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/70 dark:bg-slate-800/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 dark:bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-base sm:text-lg">
                  Proposed Storage Box Moves
                </h3>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                  {proposedComics.length} Item{proposedComics.length === 1 ? '' : 's'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Review, change destinations, or commit scheduled box relocations.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Relocation Flow Summary Chips */}
        {proposedComics.length > 0 && (
          <div className="px-5 py-3 bg-slate-100/60 dark:bg-slate-800/20 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2 text-xs shrink-0">
            <span className="text-slate-500 dark:text-slate-400 font-semibold flex items-center gap-1 text-[11px] uppercase tracking-wider">
              <PackageCheck className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              Summary:
            </span>
            {relocationFlows.map((flow) => {
              const fromBox = getBox(flow.fromId);
              const toBox = getBox(flow.toId);
              return (
                <div
                  key={`${flow.fromId}->${flow.toId}`}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs shadow-2xs font-medium"
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: fromBox.colorTag || '#3B82F6' }}
                  />
                  <span>Box #{fromBox.id}</span>
                  <ArrowRight className="w-3 h-3 text-slate-400" />
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: toBox.colorTag || '#3B82F6' }}
                  />
                  <span className="font-bold">Box #{toBox.id}</span>
                  <span className="ml-1 text-[10px] text-slate-500 dark:text-slate-400 font-semibold bg-slate-100 dark:bg-slate-700/60 px-1.5 py-0.2 rounded">
                    {flow.count} {flow.count === 1 ? 'item' : 'items'} ({flow.thickness.toFixed(1)}u)
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3 scrollbar-thin">
          {proposedComics.length === 0 ? (
            <div className="text-center py-16 px-4 space-y-3">
              <div className="w-12 h-12 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <CheckCheck className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-slate-800 dark:text-slate-200 text-base">
                No Pending Box Relocations
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                All comics are currently assigned to their designated storage boxes. Any future rebalance proposals or drag-and-drop allocations will appear here for review.
              </p>
              <button
                onClick={onClose}
                className="mt-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          ) : (
            proposedComics.map((comic) => {
              const currentBox = getBox(Number(comic.currentBoxId ?? 0));
              const proposedBox = getBox(Number(comic.proposedBoxId ?? 0));

              return (
                <div
                  key={comic.id}
                  className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-slate-300 dark:hover:border-slate-600 transition-all shadow-2xs"
                >
                  {/* Comic Metadata */}
                  <div className="flex items-center gap-3.5 min-w-0">
                    <img
                      src={getComicCoverUrl(comic.coverImage)}
                      alt=""
                      onError={handleImageError}
                      referrerPolicy="no-referrer"
                      className="w-12 h-16 object-cover rounded-md shadow-xs border border-slate-200 dark:border-slate-700 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4
                          onClick={() => onSelectComic && onSelectComic(comic)}
                          className="font-bold text-slate-900 dark:text-slate-100 text-sm truncate hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer flex items-center gap-1.5"
                          title="Click to view comic details"
                        >
                          <span>{comic.title || comic.seriesName || 'Untitled'} #{comic.issueNumber}</span>
                          {onSelectComic && (
                            <ExternalLink className="w-3 h-3 text-slate-400 shrink-0" />
                          )}
                        </h4>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {comic.publisher ? `${comic.publisher} • ` : ''}
                        {comic.publicationYear ? `${comic.publicationYear} • ` : ''}
                        {comic.format || 'Single Issue'}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5 text-[11px]">
                        <span className="font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                          {(comic.sizeThickness || 1.0).toFixed(1)}u Size
                        </span>
                        {comic.readingStatus && comic.readingStatus !== 'Unread' && (
                          <span className="font-semibold text-slate-600 dark:text-slate-400 bg-slate-200/70 dark:bg-slate-700/60 px-1.5 py-0.5 rounded text-[10px]">
                            {comic.readingStatus}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Relocation Flow: Current -> Proposed Selector */}
                  <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3 pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-200 dark:border-slate-700 shrink-0">
                    <div className="flex items-center gap-2">
                      {/* Origin Box Pill */}
                      <div
                        className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 shadow-2xs"
                        title={`Currently in: ${currentBox.name}`}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: currentBox.colorTag || '#3B82F6' }}
                        />
                        <span>Box #{currentBox.id}</span>
                      </div>

                      <ArrowRight className="w-4 h-4 text-amber-500 shrink-0" />

                      {/* Destination Selector Dropdown */}
                      <select
                        value={Number(comic.proposedBoxId ?? comic.currentBoxId ?? 0)}
                        onChange={(e) => handleChangeTargetBox(comic.id, Number(e.target.value))}
                        className="bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700/80 text-slate-900 dark:text-slate-100 text-xs font-bold rounded-lg px-2.5 py-1.5 shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-amber-500 cursor-pointer max-w-[190px]"
                        title="Change target destination box"
                      >
                        {allBoxesWithZero.map((b) => (
                          <option key={b.id} value={b.id}>
                            Box #{b.id}: {b.name.replace(/^Box\s*\d+\s*[-–]\s*/i, '').slice(0, 24)}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Single Item Buttons */}
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleRevertSingleMove(comic.id)}
                        className="px-2.5 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                        title={`Cancel move and keep in Box #${currentBox.id}`}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Keep in Box #{currentBox.id}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCommitSingleMove(comic.id)}
                        className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                        title={`Commit move to Box #${proposedBox.id}`}
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Move</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer Batch Actions */}
        {proposedComics.length > 0 && (
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Total relocating volume: <strong className="text-slate-800 dark:text-slate-200">{totalThickness.toFixed(1)} size units</strong>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={handleDiscardAll}
                className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Discard All</span>
              </button>

              <button
                type="button"
                onClick={handleCommitAll}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Commit All {proposedComics.length} Moves</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-semibold border border-slate-300 dark:border-slate-700 transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default ProposedMovesModal;
