import React, { useState, useMemo } from 'react';
import { ComicBook, StorageBox } from '../types';
import { getComicCoverUrl, handleImageError } from '../utils/imageUtils';
import { sortBoxes } from '../utils/boxUtils';
import { fetchBoxComics } from '../services/postgresService';
import { 
  Boxes, 
  Layers, 
  ArrowRight, 
  RotateCcw, 
  Check, 
  AlertTriangle, 
  GripVertical, 
  MapPin, 
  Sliders, 
  Sparkles,
  Plus,
  Trash2,
  Edit2,
  Heart,
  X,
  PackageCheck,
  Bookmark,
  Box
} from 'lucide-react';
import Box3DVisualizerModal from './Box3DVisualizerModal';

interface BoxManagerProps {
  boxes: StorageBox[];
  comics: ComicBook[];
  onUpdateComics: (updatedComics: ComicBook[]) => void;
  onUpdateBoxCapacity: (boxId: number, newCapacity: number) => void;
  onAddBox?: (boxData?: Partial<StorageBox>) => void;
  onUpdateBox?: (box: StorageBox) => void;
  onDeleteBox?: (boxId: number) => void;
  onSelectComic: (comic: ComicBook) => void;
}

const PRESET_COLORS = [
  '#EF4444', '#F59E0B', '#10B981', '#3B82F6', 
  '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6', 
  '#F97316', '#06B6D4', '#84CC16', '#64748B'
];

const BOX_ZERO: StorageBox = {
  id: 0,
  name: 'Box 0 - Unallocated Staging Queue',
  location: 'Unboxed (In Collection Staging)',
  maxCapacity: 150,
  colorTag: '#F59E0B',
  notes: 'Owned comics in your collection that are not allocated to a physical storage box.',
};

export const BoxManager: React.FC<BoxManagerProps> = ({
  boxes,
  comics,
  onUpdateComics,
  onUpdateBoxCapacity,
  onAddBox,
  onUpdateBox,
  onDeleteBox,
  onSelectComic,
}) => {
  const [activeBoxId, setActiveBoxId] = useState<number>(0);
  const [draggedComicId, setDraggedComicId] = useState<string | null>(null);
  const [targetBulkBoxId, setTargetBulkBoxId] = useState<number>(boxes[0]?.id || 1);
  
  // Wishlist Projection Mode Toggle
  const [includeWishlistInStats, setIncludeWishlistInStats] = useState<boolean>(false);

  // 3D Visualizer Modal State
  const [is3DViewerOpen, setIs3DViewerOpen] = useState<boolean>(false);
  const [selected3DBox, setSelected3DBox] = useState<StorageBox | null>(null);
  const [box3DComics, setBox3DComics] = useState<ComicBook[]>([]);
  const [is3DLoading, setIs3DLoading] = useState<boolean>(false);

  // Edit / Add Box Modal state
  const [isBoxModalOpen, setIsBoxModalOpen] = useState<boolean>(false);
  const [editingBox, setEditingBox] = useState<StorageBox | null>(null);
  const [modalBoxName, setModalBoxName] = useState<string>('');
  const [modalBoxLocation, setModalBoxLocation] = useState<string>('');
  const [modalBoxCapacity, setModalBoxCapacity] = useState<number>(150);
  const [modalBoxColor, setModalBoxColor] = useState<string>('#3B82F6');
  const [modalBoxNotes, setModalBoxNotes] = useState<string>('');

  // Capacity Quick Edit inside Inspector panel
  const [editingCapacityBoxId, setEditingCapacityBoxId] = useState<number | null>(null);
  const [tempCapacity, setTempCapacity] = useState<number>(150);

  // Collection vs Wishlist Partitioning
  const inCollectionComics = useMemo(() => {
    return comics.filter((c) => c.readingStatus !== 'Wishlist');
  }, [comics]);

  const wishlistComics = useMemo(() => {
    return comics.filter((c) => c.readingStatus === 'Wishlist');
  }, [comics]);

  // Wishlist Projection Metrics
  const projectionMetrics = useMemo(() => {
    const inColCount = inCollectionComics.length;
    const wishCount = wishlistComics.length;

    const inColThickness = inCollectionComics.reduce((sum, c) => sum + (c.sizeThickness || 1.0), 0);
    const wishThickness = wishlistComics.reduce((sum, c) => sum + (c.sizeThickness || 1.0), 0);

    const totalProjectedCount = inColCount + wishCount;
    const totalProjectedThickness = inColThickness + wishThickness;

    // Standard box size cap = 150 equivalent issue units
    const currentTotalCapacity = boxes.reduce((sum, b) => sum + (b.maxCapacity || 150), 0);
    const totalBoxesRequired = Math.ceil(totalProjectedThickness / 150) || 1;
    const additionalBoxesNeeded = Math.max(0, totalBoxesRequired - boxes.length);

    return {
      inColCount,
      wishCount,
      inColThickness,
      wishThickness,
      totalProjectedCount,
      totalProjectedThickness,
      currentTotalCapacity,
      totalBoxesRequired,
      additionalBoxesNeeded,
    };
  }, [inCollectionComics, wishlistComics, boxes]);

  // Active Comic List based on Wishlist Toggle
  const activeStatsComics = useMemo(() => {
    return includeWishlistInStats ? comics : inCollectionComics;
  }, [includeWishlistInStats, comics, inCollectionComics]);

  const sortedBoxes = useMemo(() => sortBoxes(boxes), [boxes]);

  // Calculate box usage statistics for both Current & Proposed (including Box 0 Staging)
  const boxStats = useMemo(() => {
    const allBoxes = [BOX_ZERO, ...sortedBoxes];
    return allBoxes.map((box) => {
      // Current Comics in Box (respecting Wishlist toggle setting)
      const currentComics = activeStatsComics.filter((c) => (c.currentBoxId ?? 0) === box.id);
      const currentUsedThickness = currentComics.reduce((sum, c) => sum + (c.sizeThickness || 1.0), 0);
      const currentCount = currentComics.length;
      const currentPercent = box.id === 0 ? Math.min(100, (currentUsedThickness / 150) * 100) : (currentUsedThickness / box.maxCapacity) * 100;

      // Proposed Comics (uses proposedBoxId if set, otherwise currentBoxId)
      const proposedComics = activeStatsComics.filter((c) => ((c.proposedBoxId !== undefined ? c.proposedBoxId : c.currentBoxId) ?? 0) === box.id);
      const proposedUsedThickness = proposedComics.reduce((sum, c) => sum + (c.sizeThickness || 1.0), 0);
      const proposedCount = proposedComics.length;
      const proposedPercent = box.id === 0 ? Math.min(100, (proposedUsedThickness / 150) * 100) : (proposedUsedThickness / box.maxCapacity) * 100;

      return {
        box,
        currentComics,
        currentUsedThickness,
        currentCount,
        currentPercent,
        proposedComics,
        proposedUsedThickness,
        proposedCount,
        proposedPercent,
        isCurrentOverCapacity: box.id !== 0 && currentUsedThickness > box.maxCapacity,
        isProposedOverCapacity: box.id !== 0 && proposedUsedThickness > box.maxCapacity,
      };
    });
  }, [boxes, activeStatsComics]);

  // Count total proposed relocations
  const proposedRelocationsCount = useMemo(() => {
    return comics.filter((c) => c.proposedBoxId !== undefined && c.proposedBoxId !== c.currentBoxId).length;
  }, [comics]);

  // Modal Handlers
  const handleOpenAddBoxModal = () => {
    const nextId = boxes.length > 0 ? Math.max(...boxes.map((b) => b.id)) + 1 : 1;
    setEditingBox(null);
    setModalBoxName(`Box ${nextId.toString().padStart(2, '0')} - New Short Box`);
    setModalBoxLocation('Storage Rack');
    setModalBoxCapacity(150);
    setModalBoxColor(PRESET_COLORS[(nextId - 1) % PRESET_COLORS.length]);
    setModalBoxNotes('');
    setIsBoxModalOpen(true);
  };

  const handleOpenEditBoxModal = (box: StorageBox) => {
    if (box.id === 0) {
      alert('Box 0 is the system staging area for unallocated comics.');
      return;
    }
    setEditingBox(box);
    setModalBoxName(box.name);
    setModalBoxLocation(box.location);
    setModalBoxCapacity(Math.min(150, box.maxCapacity));
    setModalBoxColor(box.colorTag || '#3B82F6');
    setModalBoxNotes(box.notes || '');
    setIsBoxModalOpen(true);
  };

  const handleBulkMoveBoxZeroToTarget = () => {
    const unallocated = comics.filter((c) => (c.currentBoxId ?? 0) === 0);
    if (unallocated.length === 0) {
      alert('There are currently no unallocated comics in Box 0.');
      return;
    }
    const updated = comics.map((c) => {
      if ((c.currentBoxId ?? 0) === 0) {
        return {
          ...c,
          proposedBoxId: targetBulkBoxId,
        };
      }
      return c;
    });
    onUpdateComics(updated);
  };

  const handleSaveBoxModal = (e: React.FormEvent) => {
    e.preventDefault();
    const clampedCap = Math.min(150, Math.max(10, modalBoxCapacity));

    if (editingBox) {
      if (onUpdateBox) {
        onUpdateBox({
          ...editingBox,
          name: modalBoxName.trim(),
          location: modalBoxLocation.trim(),
          maxCapacity: clampedCap,
          colorTag: modalBoxColor,
          notes: modalBoxNotes.trim(),
        });
      } else {
        onUpdateBoxCapacity(editingBox.id, clampedCap);
      }
    } else {
      if (onAddBox) {
        onAddBox({
          name: modalBoxName.trim(),
          location: modalBoxLocation.trim(),
          maxCapacity: clampedCap,
          colorTag: modalBoxColor,
          notes: modalBoxNotes.trim(),
        });
      }
    }
    setIsBoxModalOpen(false);
  };

  const handleDeleteCurrentBox = (boxId: number) => {
    if (boxes.length <= 1) {
      alert('You must keep at least one storage box in your collection.');
      return;
    }
    const comicsInBox = comics.filter((c) => c.currentBoxId === boxId);
    if (comicsInBox.length > 0) {
      if (!confirm(`Box #${boxId} contains ${comicsInBox.length} comic items. Delete box and move items to remaining boxes?`)) {
        return;
      }
    }
    if (onDeleteBox) {
      onDeleteBox(boxId);
      const remaining = boxes.filter((b) => b.id !== boxId);
      if (remaining.length > 0) {
        setActiveBoxId(remaining[0].id);
      }
    }
  };

  // Quick auto-add required wishlist boxes
  const handleAutoAddRequiredWishlistBoxes = () => {
    if (!onAddBox) return;
    const needed = projectionMetrics.additionalBoxesNeeded;
    for (let i = 0; i < needed; i++) {
      const nextId = boxes.length + 1 + i;
      onAddBox({
        name: `Box ${nextId.toString().padStart(2, '0')} - Wishlist Expansion Box`,
        location: 'Storage Rack',
        maxCapacity: 150,
        colorTag: PRESET_COLORS[(nextId - 1) % PRESET_COLORS.length],
        notes: 'Auto-added for wishlist capacity projection',
      });
    }
  };

  // Drag & Drop
  const handleDragStart = (e: React.DragEvent, comicId: string) => {
    setDraggedComicId(comicId);
    e.dataTransfer.setData('text/plain', comicId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDropOnBox = (e: React.DragEvent, targetBoxId: number) => {
    e.preventDefault();
    const comicId = e.dataTransfer.getData('text/plain') || draggedComicId;
    if (!comicId) return;

    const updated = comics.map((c) => {
      if (c.id === comicId) {
        return {
          ...c,
          proposedBoxId: targetBoxId,
        };
      }
      return c;
    });

    onUpdateComics(updated);
    setDraggedComicId(null);
  };

  // 3D Visualizer
  const handleOpen3DViewer = async (box: StorageBox) => {
    setSelected3DBox(box);
    setIs3DViewerOpen(true);
    setIs3DLoading(true);

    try {
      // Fetch ordered comics from backend
      const result = await fetchBoxComics(box.id);
      setBox3DComics(result.comics);
    } catch (error) {
      console.error('Failed to fetch comics for 3D viewer:', error);
      // Fall back to local comics filtered by box
      const localComics = comics.filter((c) => c.currentBoxId === box.id);
      setBox3DComics(localComics);
    } finally {
      setIs3DLoading(false);
    }
  };

  // Apply proposed moves
  const handleApplyAllProposedMoves = () => {
    const updated = comics.map((c) => {
      if (c.proposedBoxId !== undefined && c.proposedBoxId !== c.currentBoxId) {
        return {
          ...c,
          currentBoxId: c.proposedBoxId,
          proposedBoxId: undefined,
        };
      }
      return c;
    });
    onUpdateComics(updated);
  };

  // Discard proposed moves
  const handleResetProposedMoves = () => {
    const updated = comics.map((c) => ({
      ...c,
      proposedBoxId: undefined,
    }));
    onUpdateComics(updated);
  };

  // Helper for sorting comics alphabetically/numerically before rebalancing
  const sortComicsForStorage = (list: ComicBook[]) => {
    return [...list].sort((a, b) => {
      const titleA = (a.title || '').toLowerCase();
      const titleB = (b.title || '').toLowerCase();
      if (titleA !== titleB) return titleA.localeCompare(titleB);

      const volA = parseFloat(a.volume || '1') || 1;
      const volB = parseFloat(b.volume || '1') || 1;
      if (volA !== volB) return volA - volB;

      const issueA = parseFloat(a.issueNumber?.replace(/[^0-9.]/g, '') || '0') || 0;
      const issueB = parseFloat(b.issueNumber?.replace(/[^0-9.]/g, '') || '0') || 0;
      if (issueA !== issueB) return issueA - issueB;

      return (a.issueNumber || '').localeCompare(b.issueNumber || '');
    });
  };

  // Auto-balance storage allocation across all available boxes (including empty/new boxes)
  const handleAutoBalanceProposal = () => {
    const targetBoxes = sortBoxes(boxes);
    if (targetBoxes.length === 0) {
      alert('Please add at least one storage box before rebalancing.');
      return;
    }

    const updatedComics = sortComicsForStorage(activeStatsComics);
    const totalThickness = updatedComics.reduce((sum, c) => sum + (c.sizeThickness || 1.0), 0);
    const totalCapacity = targetBoxes.reduce((sum, b) => sum + (b.maxCapacity || 150), 0);

    // Target fill ratio equalizes percentage utilization across ALL available boxes
    const targetRatio = totalCapacity > 0 ? Math.min(1.0, totalThickness / totalCapacity) : 1.0;

    // Track assigned capacities
    const boxTracker = targetBoxes.map((b) => ({
      id: b.id,
      maxCapacity: b.maxCapacity || 150,
      targetCapacity: Math.max(1, (b.maxCapacity || 150) * targetRatio),
      currentUsed: 0,
    }));

    let currentBoxIdx = 0;

    for (const comic of updatedComics) {
      const comicThickness = comic.sizeThickness || 1.0;

      // Advance to next box if current box hit its proportional target capacity and isn't the last box
      while (
        currentBoxIdx < boxTracker.length - 1 &&
        boxTracker[currentBoxIdx].currentUsed >= boxTracker[currentBoxIdx].targetCapacity
      ) {
        currentBoxIdx++;
      }

      // If current box is at physical max capacity and isn't the last box, advance
      while (
        currentBoxIdx < boxTracker.length - 1 &&
        boxTracker[currentBoxIdx].currentUsed + comicThickness > boxTracker[currentBoxIdx].maxCapacity
      ) {
        currentBoxIdx++;
      }

      const assignedBox = boxTracker[currentBoxIdx];
      // Check if even the final box exceeds physical max capacity
      if (assignedBox.currentUsed + comicThickness > assignedBox.maxCapacity && currentBoxIdx === boxTracker.length - 1) {
        // Overflow comics stay in Box 0 staging
        comic.proposedBoxId = 0;
      } else {
        comic.proposedBoxId = assignedBox.id;
        assignedBox.currentUsed += comicThickness;
      }
    }

    // Merge proposedBoxIds back into full comics array
    const proposedMap = new Map(updatedComics.map((c) => [c.id, c.proposedBoxId]));
    const fullUpdated = comics.map((c) => {
      if (proposedMap.has(c.id)) {
        return { ...c, proposedBoxId: proposedMap.get(c.id) };
      }
      return c;
    });

    onUpdateComics(fullUpdated);
  };

  const selectedBoxStat = boxStats.find((s) => s.box.id === activeBoxId) || boxStats[0] || {
    box: boxes[0] || { id: 1, name: 'Box 01', location: 'Rack', maxCapacity: 150, colorTag: '#3B82F6' },
    currentComics: [],
    currentUsedThickness: 0,
    currentCount: 0,
    currentPercent: 0,
    proposedComics: [],
    proposedUsedThickness: 0,
    proposedCount: 0,
    proposedPercent: 0,
    isCurrentOverCapacity: false,
    isProposedOverCapacity: false,
  };

  return (
    <div className="space-y-6">
      
      {/* Storage Rebalancing Header & Control Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <Boxes className="w-5 h-5 text-slate-800" />
              <h2 className="font-bold text-slate-900 text-base">
                Storage Box Manager ({boxes.length} Boxes)
              </h2>
              <span className="text-xs font-extrabold px-2.5 py-1 bg-slate-900 text-white rounded-lg shadow-xs">
                {activeStatsComics.length} Comics ({activeStatsComics.reduce((sum, c) => sum + (c.sizeThickness || 1.0), 0).toFixed(1)} units)
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl">
              Configure storage boxes (max 150 issue capacity per box). Drag and drop comics to relocate, or analyze physical collection space vs. wishlist acquisition capacity.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Wishlist Inclusion Segment Toggle */}
            <div className="bg-slate-100 p-1 rounded-xl border border-slate-200 flex items-center text-xs font-semibold">
              <button
                onClick={() => setIncludeWishlistInStats(false)}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  !includeWishlistInStats
                    ? 'bg-white text-slate-900 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                In Collection Only
              </button>
              <button
                onClick={() => setIncludeWishlistInStats(true)}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  includeWishlistInStats
                    ? 'bg-slate-900 text-white shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Heart className="w-3.5 h-3.5 text-rose-400 fill-rose-400" />
                <span>+ Wishlist Included</span>
              </button>
            </div>

            {/* Add Storage Box Button */}
            {onAddBox && (
              <button
                onClick={handleOpenAddBoxModal}
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>Add Storage Box</span>
              </button>
            )}

            <button
              onClick={handleAutoBalanceProposal}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-all active:scale-95"
              title="Calculate optimal distribution across boxes"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Auto-Suggest Rebalance</span>
            </button>

            {proposedRelocationsCount > 0 && (
              <>
                <button
                  onClick={handleApplyAllProposedMoves}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all active:scale-95"
                >
                  <Check className="w-4 h-4" />
                  <span>Apply {proposedRelocationsCount} Moves</span>
                </button>

                <button
                  onClick={handleResetProposedMoves}
                  className="flex items-center gap-1 py-2 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-medium border border-slate-200 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Discard</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Wishlist Storage Projection Summary Card */}
        <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <PackageCheck className="w-4 h-4 text-slate-700 shrink-0" />
              <div>
                <h3 className="font-bold text-xs uppercase tracking-wider text-slate-800">
                  Storage & Wishlist Projection Summary
                </h3>
                <p className="text-[11px] text-slate-500">
                  Calculated based on max 150 equivalent issue size per short box
                </p>
              </div>
            </div>

            {projectionMetrics.additionalBoxesNeeded > 0 && onAddBox && (
              <button
                onClick={handleAutoAddRequiredWishlistBoxes}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg shadow-xs flex items-center gap-1.5 self-start sm:self-auto"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add {projectionMetrics.additionalBoxesNeeded} Required Box{projectionMetrics.additionalBoxesNeeded > 1 ? 'es' : ''}</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className={`p-2.5 rounded-lg border transition-all ${!includeWishlistInStats ? 'bg-white border-slate-900 ring-2 ring-slate-900/10 shadow-xs' : 'bg-white border-slate-200 opacity-80'}`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-500 font-medium block">In Collection</span>
                {!includeWishlistInStats && (
                  <span className="text-[9px] font-extrabold bg-slate-900 text-white px-1.5 py-0.2 rounded">Active</span>
                )}
              </div>
              <span className="font-extrabold text-slate-900 text-sm">
                {projectionMetrics.inColCount} <span className="text-[10px] font-normal text-slate-500">comics</span>
              </span>
              <div className="text-[10px] text-slate-500 mt-0.5">
                {projectionMetrics.inColThickness.toFixed(1)} size units
              </div>
            </div>

            <div className="bg-white p-2.5 rounded-lg border border-slate-200">
              <span className="text-[10px] text-slate-500 font-medium block flex items-center gap-1">
                <Heart className="w-3 h-3 text-rose-500 fill-rose-500" />
                In Wish List
              </span>
              <span className="font-extrabold text-rose-600 text-sm">
                {projectionMetrics.wishCount} <span className="text-[10px] font-normal text-slate-500">comics</span>
              </span>
              <div className="text-[10px] text-slate-500 mt-0.5">
                {projectionMetrics.wishThickness.toFixed(1)} size units
              </div>
            </div>

            <div className={`p-2.5 rounded-lg border transition-all ${includeWishlistInStats ? 'bg-white border-slate-900 ring-2 ring-slate-900/10 shadow-xs' : 'bg-white border-slate-200 opacity-80'}`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-500 font-medium block">Projected Total</span>
                {includeWishlistInStats && (
                  <span className="text-[9px] font-extrabold bg-slate-900 text-white px-1.5 py-0.2 rounded">Active</span>
                )}
              </div>
              <span className="font-extrabold text-slate-900 text-sm">
                {projectionMetrics.totalProjectedCount} <span className="text-[10px] font-normal text-slate-500">comics</span>
              </span>
              <div className="text-[10px] text-slate-500 mt-0.5">
                {projectionMetrics.totalProjectedThickness.toFixed(1)} size units
              </div>
            </div>

            <div className="bg-white p-2.5 rounded-lg border border-slate-200">
              <span className="text-[10px] text-slate-500 font-medium block">Required Boxes</span>
              <span className="font-extrabold text-slate-900 text-sm">
                {projectionMetrics.totalBoxesRequired} <span className="text-[10px] font-normal text-slate-500">boxes</span>
              </span>
              <div className="text-[10px] text-slate-500 mt-0.5">
                ({boxes.length} currently configured)
              </div>
            </div>
          </div>

          {/* Alert Callout for Box Requirement */}
          {projectionMetrics.additionalBoxesNeeded > 0 ? (
            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  <strong>Storage Capacity Alert:</strong> Acquiring all {projectionMetrics.wishCount} wishlisted comics will require <strong>+{projectionMetrics.additionalBoxesNeeded} additional short box{projectionMetrics.additionalBoxesNeeded > 1 ? 'es' : ''}</strong> (at 150 max capacity each).
                </span>
              </div>
            </div>
          ) : (
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900 text-xs flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                <strong>Sufficient Capacity:</strong> Your {boxes.length} configured storage box{boxes.length > 1 ? 'es' : ''} ({projectionMetrics.currentTotalCapacity} max capacity units) can fit all current and wishlisted comic acquisitions!
              </span>
            </div>
          )}
        </div>

        {/* Rebalancing Active Banner */}
        {proposedRelocationsCount > 0 && (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between gap-3 text-amber-900 text-xs">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
              <div>
                <strong>Rebalancing Proposal Active:</strong> You have proposed moving{' '}
                <span className="font-bold text-amber-950">{proposedRelocationsCount} comic items</span> to optimal boxes. Review box meters below before finalizing.
              </div>
            </div>
            <button
              onClick={handleApplyAllProposedMoves}
              className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg text-xs shrink-0"
            >
              Commit Moves
            </button>
          </div>
        )}
      </div>

      {/* Main 2-Column Desktop Storage View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Configured Boxes Shelf Grid */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <MapPin className="w-4 h-4 text-slate-700" />
              <span>Configured Storage Shelf Grid ({boxes.length} Boxes)</span>
            </h3>
            <span className="text-[11px] text-slate-500">
              {includeWishlistInStats ? 'Showing Collection + Wishlist' : 'Showing In Collection Only'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {boxStats.map((stat) => {
              const { box, currentUsedThickness, currentPercent, proposedUsedThickness, proposedPercent, isCurrentOverCapacity, isProposedOverCapacity } = stat;
              const isSelected = box.id === activeBoxId;
              const hasProposal = Math.abs(currentUsedThickness - proposedUsedThickness) > 0.1;

              return (
                <div
                  key={box.id}
                  onClick={() => setActiveBoxId(box.id)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDropOnBox(e, box.id)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer relative flex flex-col justify-between ${
                    isSelected
                      ? 'bg-white border-slate-900 ring-2 ring-slate-900/10 shadow-md'
                      : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-xs'
                  }`}
                >
                  {/* Top Box Tag */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="w-3 h-3 rounded-full shrink-0 border border-slate-300"
                        style={{ backgroundColor: box.colorTag || '#3B82F6' }}
                      />
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 text-xs flex items-center gap-1">
                          <span>Box #{box.id}</span>
                          {isCurrentOverCapacity && (
                            <span title="Over Capacity!">
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate">
                          {box.name}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpen3DViewer(box);
                        }}
                        className="p-1 hover:bg-blue-100 rounded text-slate-400 hover:text-blue-600 transition-colors"
                        title="View in 3D"
                      >
                        <Box className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenEditBoxModal(box);
                        }}
                        className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700"
                        title="Edit Box Settings"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                        {box.maxCapacity}u
                      </span>
                    </div>
                  </div>

                  {/* Fill Level Meter */}
                  <div className="mt-3 space-y-1.5">
                    <div className="flex justify-between text-[10px] font-medium">
                      <span className="text-slate-500">Current Used:</span>
                      <span className={isCurrentOverCapacity ? 'text-rose-600 font-bold' : 'text-slate-800'}>
                        {currentUsedThickness.toFixed(1)} / {box.maxCapacity} ({currentPercent.toFixed(0)}%)
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                      <div
                        className={`h-full transition-all duration-300 ${
                          isCurrentOverCapacity
                            ? 'bg-rose-500'
                            : currentPercent > 85
                            ? 'bg-orange-500'
                            : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(currentPercent, 100)}%` }}
                      />
                    </div>

                    {/* Proposed Fill Level if altered */}
                    {hasProposal && (
                      <div className="pt-1 border-t border-slate-100 flex items-center justify-between text-[10px]">
                        <span className="text-slate-700 font-semibold flex items-center gap-1">
                          <ArrowRight className="w-3 h-3" /> Proposed:
                        </span>
                        <span className={isProposedOverCapacity ? 'text-rose-600 font-bold' : 'text-slate-900 font-bold'}>
                          {proposedUsedThickness.toFixed(1)} u ({proposedPercent.toFixed(0)}%)
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Footer Stats */}
                  <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                    <span>{stat.currentCount} items inside</span>
                    <span className="text-slate-500 italic truncate max-w-[110px]">
                      {box.location}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Active Box Inspector & Items List */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm sticky top-20">
            
            {/* Inspector Box Header */}
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-4 h-12 rounded-md shrink-0 border border-slate-200 shadow-xs"
                  style={{ backgroundColor: selectedBoxStat.box.colorTag || '#F59E0B' }}
                />
                <div className="min-w-0">
                  <h3 className="font-extrabold text-slate-900 text-base truncate">
                    {selectedBoxStat.box.id === 0 ? 'Box 0: Unallocated Staging Queue' : `Box #${selectedBoxStat.box.id}: ${selectedBoxStat.box.name}`}
                  </h3>
                  <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{selectedBoxStat.box.location}</span>
                  </p>
                </div>
              </div>

              {selectedBoxStat.box.id !== 0 && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleOpenEditBoxModal(selectedBoxStat.box)}
                    className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs border border-slate-200 flex items-center gap-1"
                    title="Edit Box Settings"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Edit</span>
                  </button>
                  {onDeleteBox && boxes.length > 1 && (
                    <button
                      onClick={() => handleDeleteCurrentBox(selectedBoxStat.box.id)}
                      className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs border border-rose-200"
                      title="Delete Storage Box"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Capacity Meter Card */}
            <div className="my-4 p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-slate-700">
                  {selectedBoxStat.box.id === 0 ? 'Staging Volume' : 'Box Fill Capacity'}
                </span>
                <span className={selectedBoxStat.isCurrentOverCapacity ? 'text-rose-600' : 'text-slate-900'}>
                  {selectedBoxStat.currentUsedThickness.toFixed(1)} {selectedBoxStat.box.id === 0 ? 'units unallocated' : `/ ${selectedBoxStat.box.maxCapacity} units (${selectedBoxStat.currentPercent.toFixed(1)}%)`}
                </span>
              </div>
              <div className="w-full h-3 bg-white rounded-full overflow-hidden border border-slate-200">
                <div
                  className={`h-full ${
                    selectedBoxStat.box.id === 0
                      ? 'bg-amber-500'
                      : selectedBoxStat.isCurrentOverCapacity
                      ? 'bg-rose-500'
                      : selectedBoxStat.currentPercent > 85
                      ? 'bg-orange-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(selectedBoxStat.currentPercent, 100)}%` }}
                />
              </div>

              {selectedBoxStat.isCurrentOverCapacity && (
                <div className="text-[11px] text-rose-600 font-semibold flex items-center gap-1 pt-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  Warning: Box exceeds recommended capacity! Rebalance to avoid spine crush.
                </div>
              )}
            </div>

            {/* Bulk Allocate Controls for Box 0 */}
            {selectedBoxStat.box.id === 0 && selectedBoxStat.currentComics.length > 0 && (
              <div className="my-3 p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                <div className="text-xs font-bold text-amber-950 flex items-center justify-between">
                  <span>Bulk Allocate Box 0 Items</span>
                  <span className="text-[10px] text-amber-800 font-normal">{selectedBoxStat.currentComics.length} items waiting</span>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={targetBulkBoxId}
                    onChange={(e) => setTargetBulkBoxId(Number(e.target.value))}
                    className="flex-1 bg-white border border-amber-300 text-xs text-slate-800 rounded-lg px-2.5 py-1.5 focus:outline-none"
                  >
                    {sortedBoxes.map((b) => (
                      <option key={b.id} value={b.id}>
                        Box #{b.id}: {b.name.split('-')[1] || b.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleBulkMoveBoxZeroToTarget}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-lg shadow-xs shrink-0"
                  >
                    Allocate All
                  </button>
                </div>
              </div>
            )}

            {/* List of Comics Inside Active Box */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-800 text-xs">
                  Comics inside Box #{selectedBoxStat.box.id} ({selectedBoxStat.currentComics.length})
                </h4>
                <span className="text-[10px] text-slate-400">Drag item to switch box</span>
              </div>

              <div className="max-h-[380px] overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                {selectedBoxStat.currentComics.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl">
                    Box #{selectedBoxStat.box.id} is currently empty. Drag comics here to store them.
                  </div>
                ) : (
                  selectedBoxStat.currentComics.map((comic) => (
                    <div
                      key={comic.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, comic.id)}
                      className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3 hover:border-slate-400 cursor-grab active:cursor-grabbing transition-all group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <GripVertical className="w-4 h-4 text-slate-400 group-hover:text-slate-800 shrink-0" />
                        <img
                          src={getComicCoverUrl(comic.coverImage)}
                          alt=""
                          onError={handleImageError}
                          className="w-9 h-12 object-cover rounded shadow-xs border border-slate-200 shrink-0"
                        />
                        <div className="min-w-0">
                          <h5
                            onClick={() => onSelectComic(comic)}
                            className="font-bold text-slate-800 text-xs truncate hover:text-slate-900 cursor-pointer flex items-center gap-1.5"
                          >
                            <span>{comic.title} #{comic.issueNumber}</span>
                            {comic.readingStatus === 'Wishlist' && (
                              <span className="px-1.5 py-0.2 text-[9px] font-bold bg-rose-100 text-rose-700 rounded border border-rose-200">
                                Wishlist
                              </span>
                            )}
                          </h5>
                          <p className="text-[10px] text-slate-500 truncate">
                            {comic.format} • {comic.publisher}
                          </p>
                          <div className="flex items-center gap-2 mt-1 text-[10px]">
                            <span className="text-slate-800 font-bold bg-white px-1.5 py-0.5 rounded border border-slate-200">
                              {comic.sizeThickness.toFixed(1)}x Size
                            </span>
                            {comic.proposedBoxId && comic.proposedBoxId !== comic.currentBoxId && (
                              <span className="text-slate-900 font-bold bg-slate-200 px-1.5 py-0.5 rounded border border-slate-300">
                                Proposed → Box {comic.proposedBoxId}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Relocate Dropdown */}
                      <select
                        value={(comic.proposedBoxId !== undefined ? comic.proposedBoxId : comic.currentBoxId) ?? 0}
                        onChange={(e) => {
                          const targetId = Number(e.target.value);
                          const updated = comics.map((c) =>
                            c.id === comic.id ? { ...c, proposedBoxId: targetId } : c
                          );
                          onUpdateComics(updated);
                        }}
                        className="bg-white border border-slate-200 text-slate-800 text-[10px] font-semibold rounded px-1.5 py-1 focus:outline-none shrink-0"
                      >
                        <option value={0}>Box 0 (Unallocated)</option>
                        {sortedBoxes.map((b) => (
                          <option key={b.id} value={b.id}>
                            Box #{b.id}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        </div>

      </div>

      {/* Storage Box Configuration / Edit Modal */}
      {isBoxModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setIsBoxModalOpen(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 p-1"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2 mb-1">
              <Boxes className="w-5 h-5 text-slate-800" />
              <span>{editingBox ? `Edit Box #${editingBox.id}` : 'Add New Storage Box'}</span>
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Configure box capacity (max 150 equivalent issue size units per short box).
            </p>

            <form onSubmit={handleSaveBoxModal} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Box Name / Title:
                </label>
                <input
                  type="text"
                  required
                  value={modalBoxName}
                  onChange={(e) => setModalBoxName(e.target.value)}
                  placeholder="e.g. Box 16 - Modern Marvel & Star Wars"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Storage Location:
                </label>
                <input
                  type="text"
                  required
                  value={modalBoxLocation}
                  onChange={(e) => setModalBoxLocation(e.target.value)}
                  placeholder="e.g. Closet - Shelf 4"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-slate-800"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-bold text-slate-700">
                    Max Capacity (Max 150 Units):
                  </label>
                  <span className="text-[11px] text-slate-500 font-semibold">
                    1.0 = 1 Single Issue
                  </span>
                </div>
                <input
                  type="number"
                  min="10"
                  max="150"
                  required
                  value={modalBoxCapacity}
                  onChange={(e) => setModalBoxCapacity(Math.min(150, Number(e.target.value)))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-slate-800 font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Box Color Tag:
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setModalBoxColor(color)}
                      className={`w-6 h-6 rounded-full border transition-all ${
                        modalBoxColor === color ? 'ring-2 ring-slate-900 ring-offset-2 scale-110' : 'hover:scale-105'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Notes (Optional):
                </label>
                <textarea
                  rows={2}
                  value={modalBoxNotes}
                  onChange={(e) => setModalBoxNotes(e.target.value)}
                  placeholder="e.g. Stored key issues and oversize hardcovers"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-slate-800"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsBoxModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg text-xs shadow-xs"
                >
                  {editingBox ? 'Save Changes' : 'Create Box'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3D Box Visualizer Modal */}
      {selected3DBox && (
        <Box3DVisualizerModal
          isOpen={is3DViewerOpen}
          box={selected3DBox}
          comics={box3DComics}
          onClose={() => {
            setIs3DViewerOpen(false);
            setSelected3DBox(null);
            setBox3DComics([]);
          }}
          onUpdateComic={onSelectComic}
          onDeleteComic={() => {
            // Can implement delete from 3D view if needed
          }}
        />
      )}

    </div>
  );
};
