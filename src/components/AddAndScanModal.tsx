import React, { useState, useMemo, useEffect } from 'react';
import { ComicBook, StorageBox, ComicFormat, ComicCondition, ReadingStatus, SeriesIssueTotal } from '../types';
import { extractDriveFileId } from '../utils/imageUtils';
import { sortBoxes } from '../utils/boxUtils';
import { MONTH_NAMES } from '../utils/dateUtils';
import { CoverScannerCropper } from './CoverScannerCropper';
import { CoverOcrResult } from '../utils/coverOcrService';
import { 
  X, 
  Crop,
  BookOpen, 
  PlusCircle, 
  Layers, 
  Copy,
  RefreshCw,
  ArrowRight,
  ShieldAlert,
  Cloud,
  Info,
  Bookmark,
  Check
} from 'lucide-react';

interface AddAndScanModalProps {
  isOpen: boolean;
  onClose: () => void;
  boxes: StorageBox[];
  existingComics?: ComicBook[];
  seriesTotals?: SeriesIssueTotal[];
  onAddComic: (newComic: ComicBook) => void;
  onUpdateComic?: (updatedComic: ComicBook) => void;
  initialScanMode?: boolean;
  onOpenGenerateWishlist?: () => void;
}

export const AddAndScanModal: React.FC<AddAndScanModalProps> = ({
  isOpen,
  onClose,
  boxes,
  existingComics = [],
  seriesTotals = [],
  onAddComic,
  onUpdateComic,
  initialScanMode = false,
  onOpenGenerateWishlist,
}) => {
  const [activeMode, setActiveMode] = useState<'scan' | 'manual'>(initialScanMode ? 'scan' : 'manual');
  const [hasAppliedCrop, setHasAppliedCrop] = useState<boolean>(false);

  // Sync mode when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveMode(initialScanMode ? 'scan' : 'manual');
      setHasAppliedCrop(false);
    }
  }, [isOpen, initialScanMode]);

  // Form State
  const [title, setTitle] = useState('');
  const [issueNumber, setIssueNumber] = useState('1');
  const [volume, setVolume] = useState('');
  const [event, setEvent] = useState('');
  const [copiesOwned, setCopiesOwned] = useState<number>(1);
  const [publisher, setPublisher] = useState('Marvel Comics');
  const [publicationYear, setPublicationYear] = useState<number>(new Date().getFullYear());
  const [publicationMonth, setPublicationMonth] = useState<string>('');
  const [genre, setGenre] = useState('Superhero');
  const [writer, setWriter] = useState('');
  const [artist, setArtist] = useState('');
  const [coverArtist, setCoverArtist] = useState('');
  const [coverImage, setCoverImage] = useState('NoImage.png');
  const [format, setFormat] = useState<ComicFormat>('Single Issue');
  const [sizeThickness, setSizeThickness] = useState<number>(1.0);
  const [currentBoxId, setCurrentBoxId] = useState<number>(1);
  const [readingStatus, setReadingStatus] = useState<ReadingStatus>('Unread');
  const [condition, setCondition] = useState<ComicCondition>('Near Mint');
  const [purchasePrice, setPurchasePrice] = useState<string>('');
  const [estimatedValue, setEstimatedValue] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [tagsInput, setTagsInput] = useState('');

  // Find duplicate match in existing comics collection
  const duplicateMatch = useMemo(() => {
    if (!existingComics || !existingComics.length) return null;
    if (!title.trim() || !issueNumber.trim()) return null;

    const normTitle = title.trim().toLowerCase();
    const normIssue = issueNumber.trim().toLowerCase().replace(/^#/, '');
    const normPub = publisher.trim().toLowerCase();

    // Check title + issue + publisher first
    const exact = existingComics.find((c) => {
      const cTitle = (c.title || '').trim().toLowerCase();
      const cIssue = (c.issueNumber || '').trim().toLowerCase().replace(/^#/, '');
      const cPub = (c.publisher || '').trim().toLowerCase();
      return cTitle === normTitle && cIssue === normIssue && (normPub ? cPub === normPub : true);
    });
    if (exact) return exact;

    // Secondary match on title + issue
    return existingComics.find((c) => {
      const cTitle = (c.title || '').trim().toLowerCase();
      const cIssue = (c.issueNumber || '').trim().toLowerCase().replace(/^#/, '');
      return cTitle === normTitle && cIssue === normIssue;
    }) || null;
  }, [title, issueNumber, publisher, existingComics]);

  if (!isOpen) return null;

  // Apply cropped cover and optional local OCR results
  const handleApplyCroppedCover = (croppedDataUrl: string, ocr?: CoverOcrResult) => {
    setCoverImage(croppedDataUrl);
    setHasAppliedCrop(true);
    if (ocr) {
      if (ocr.title) setTitle(ocr.title);
      if (ocr.issueNumber) setIssueNumber(String(ocr.issueNumber));
      if (ocr.publisher) setPublisher(ocr.publisher);
      if (ocr.volume) setVolume(ocr.volume);
    }
  };

  const handleSelectOcrCandidate = (field: 'title' | 'issueNumber' | 'publisher', value: string) => {
    if (field === 'title') setTitle(value);
    else if (field === 'issueNumber') setIssueNumber(value);
    else if (field === 'publisher') setPublisher(value);
  };

  // Native Mobile Barcode / UPC Scan callback
  const handleBarcodeScanned = (barcode: string) => {
    setNotes((prev) => (prev ? `${prev}\nUPC: ${barcode}` : `UPC: ${barcode}`));
    setTagsInput((prev) => {
      const parts = prev ? prev.split(',').map((s) => s.trim()) : [];
      if (!parts.includes(`UPC:${barcode}`)) {
        parts.push(`UPC:${barcode}`);
      }
      return parts.join(', ');
    });
  };

  // Format Auto-adjust thickness suggestion
  const handleFormatChange = (newFmt: ComicFormat) => {
    setFormat(newFmt);
    if (newFmt === 'Single Issue') setSizeThickness(1.0);
    else if (newFmt === 'Trade Paperback') setSizeThickness(3.5);
    else if (newFmt === 'Hardcover') setSizeThickness(6.0);
    else if (newFmt === 'Omnibus') setSizeThickness(12.0);
    else if (newFmt === 'Graphic Novel') setSizeThickness(4.0);
  };

  // Action: Update existing comic record with new scanned/provided details
  const handleUpdateExisting = () => {
    if (!duplicateMatch || !onUpdateComic) return;

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const existingTags = duplicateMatch.tags || [];
    const mergedTags = Array.from(new Set([...existingTags, ...tags]));

    const newContribs = [];
    if (writer.trim()) newContribs.push({ creatorName: writer.trim(), roleName: 'Writer' });
    if (artist.trim()) newContribs.push({ creatorName: artist.trim(), roleName: 'Penciller' });
    if (coverArtist.trim()) newContribs.push({ creatorName: coverArtist.trim(), roleName: 'Cover Penciller' });

    const existingContribs = duplicateMatch.creatorContributions || [];
    const mergedContribs = [...existingContribs];
    newContribs.forEach((nc) => {
      if (!mergedContribs.some((ec) => ec.creatorName.toLowerCase() === nc.creatorName.toLowerCase() && ec.roleName.toLowerCase() === nc.roleName.toLowerCase())) {
        mergedContribs.push(nc);
      }
    });

    const isNewCover = coverImage && coverImage !== 'NoImage.png';

    const updated: ComicBook = {
      ...duplicateMatch,
      coverImage: isNewCover ? coverImage : duplicateMatch.coverImage,
      writer: writer.trim() || duplicateMatch.writer,
      artist: artist.trim() || duplicateMatch.artist,
      coverArtist: coverArtist.trim() || duplicateMatch.coverArtist,
      publisher: publisher.trim() || duplicateMatch.publisher,
      publicationYear: publicationYear || duplicateMatch.publicationYear,
      publicationMonth: publicationMonth.trim() || duplicateMatch.publicationMonth,
      volume: volume.trim() || duplicateMatch.volume,
      event: event.trim() || duplicateMatch.event,
      genre: genre.trim() || duplicateMatch.genre,
      copiesOwned: (readingStatus || duplicateMatch.readingStatus) === 'Wishlist'
        ? 0
        : (duplicateMatch.readingStatus === 'Wishlist' ? 0 : (duplicateMatch.copiesOwned ?? 1)) + (Number(copiesOwned) > 0 ? Number(copiesOwned) : 1),
      format: format || duplicateMatch.format,
      sizeThickness: sizeThickness || duplicateMatch.sizeThickness,
      currentBoxId: currentBoxId || duplicateMatch.currentBoxId,
      condition: condition || duplicateMatch.condition,
      readingStatus: readingStatus || duplicateMatch.readingStatus,
      estimatedValue: estimatedValue ? parseFloat(estimatedValue) : duplicateMatch.estimatedValue,
      purchasePrice: purchasePrice ? parseFloat(purchasePrice) : duplicateMatch.purchasePrice,
      notes: notes.trim()
        ? (duplicateMatch.notes ? `${duplicateMatch.notes}\n[Updated]: ${notes.trim()}` : notes.trim())
        : duplicateMatch.notes,
      tags: mergedTags,
      creatorContributions: mergedContribs,
    };

    onUpdateComic(updated);
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const creatorContribs = [];
    if (writer.trim()) creatorContribs.push({ creatorName: writer.trim(), roleName: 'Writer' });
    if (artist.trim()) creatorContribs.push({ creatorName: artist.trim(), roleName: 'Penciller' });
    if (coverArtist.trim()) creatorContribs.push({ creatorName: coverArtist.trim(), roleName: 'Cover Penciller' });

    const isWishlist = readingStatus === 'Wishlist';
    const finalCopies = isWishlist ? 0 : (Number(copiesOwned) > 0 ? Number(copiesOwned) : 1);
    const finalBoxId = isWishlist ? 0 : Number(currentBoxId);

    const newComic: ComicBook = {
      id: `c-${Date.now()}`,
      title: title.trim(),
      issueNumber: issueNumber.trim() || '1',
      volume: volume.trim() || undefined,
      event: event.trim() || undefined,
      copiesOwned: finalCopies,
      publisher: publisher.trim() || 'Marvel Comics',
      publicationYear: publicationYear || new Date().getFullYear(),
      publicationMonth: publicationMonth.trim() || undefined,
      genre: genre.trim() || 'Superhero',
      writer: writer.trim(),
      artist: artist.trim(),
      coverArtist: coverArtist.trim(),
      creatorContributions: creatorContribs,
      coverImage: coverImage || 'NoImage.png',
      format,
      sizeThickness: Number(sizeThickness) || 1.0,
      currentBoxId: finalBoxId,
      readingStatus,
      readCount: readingStatus === 'Read' ? 1 : 0,
      condition,
      purchasePrice: purchasePrice ? parseFloat(purchasePrice) : undefined,
      estimatedValue: estimatedValue ? parseFloat(estimatedValue) : undefined,
      notes: notes.trim(),
      tags,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onAddComic(newComic);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden my-8 text-slate-900 dark:text-slate-100">
        
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
              <PlusCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">Add New Comic to Vault</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Perspective crop cover & local OCR or fill manual catalog fields</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex gap-2">
          <button
            type="button"
            onClick={() => setActiveMode('scan')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeMode === 'scan'
                ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <Crop className="w-4 h-4 text-sky-400" />
            <span>Cover Scanner & Perspective Crop</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveMode('manual')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeMode === 'manual'
                ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Manual Entry Form</span>
          </button>

          {onOpenGenerateWishlist && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenGenerateWishlist();
              }}
              className="py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900/50"
              title="Automatically generate wishlist items for all missing issues in a series"
            >
              <Bookmark className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Auto-Generate</span> Wishlist
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-6">
          {activeMode === 'scan' ? (
            
            /* PERSPECTIVE CROP & LOCAL OCR SCANNER TAB */
            <div className="space-y-4">
              <CoverScannerCropper
                enableOcr={true}
                defaultPreset="standard"
                initialImageUrl={coverImage !== 'NoImage.png' ? coverImage : undefined}
                comicTitle={title}
                comicIssueNumber={issueNumber}
                existingComics={existingComics}
                seriesTotals={seriesTotals}
                onApplyImage={handleApplyCroppedCover}
                onSelectOcrCandidate={handleSelectOcrCandidate}
                onBarcodeScanned={handleBarcodeScanned}
              />

              {/* Quick Editable Title & Issue Bar once Crop/OCR is applied */}
              {hasAppliedCrop && (
                <div className="p-4 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                      <Check className="w-4 h-4" />
                      <span>Cropped Cover Applied — Verify Detected Title & Issue #</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveMode('manual')}
                      className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <span>Continue to Full Form</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                        Detected Comic Title
                      </label>
                      <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="e.g. The Amazing Spider-Man"
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                        Detected Issue #
                      </label>
                      <input
                        type="text"
                        value={issueNumber}
                        onChange={(e) => setIssueNumber(e.target.value)}
                        placeholder="1"
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 font-bold"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Duplicate Banner in Scanner */}
              {duplicateMatch && (
                <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-2xl text-left space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-xl text-amber-800 dark:text-amber-300 shrink-0 mt-0.5">
                      <Copy className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-amber-900 dark:text-amber-200 text-sm">Duplicate Found in Collection</h4>
                        <span className="px-2 py-0.5 bg-amber-200 dark:bg-amber-900/80 text-amber-900 dark:text-amber-200 text-[10px] font-bold rounded-full border dark:border-amber-700">
                          Storage Box #{duplicateMatch.currentBoxId}
                        </span>
                      </div>
                      <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">
                        <strong>{duplicateMatch.title} #{duplicateMatch.issueNumber}</strong> ({duplicateMatch.publisher}) already exists in your vault.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1 border-t border-amber-200/60 dark:border-amber-800/60">
                    {onUpdateComic && (
                      <button
                        type="button"
                        onClick={handleUpdateExisting}
                        className="flex-1 min-w-[180px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Update Existing Comic (#{duplicateMatch.issueNumber})</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setActiveMode('manual')}
                      className="px-4 py-2 bg-amber-100 dark:bg-amber-900/60 hover:bg-amber-200 dark:hover:bg-amber-900 text-amber-900 dark:text-amber-200 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <span>Review Details First</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (

            /* MANUAL FORM TAB */
            <form onSubmit={handleSubmit} className="space-y-4 max-h-[60vh] overflow-y-auto pr-1 scrollbar-thin">
              
              {/* Duplicate Banner in Manual Form */}
              {duplicateMatch && (
                <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-2xl text-left space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-bold text-amber-900 dark:text-amber-200 text-xs">Matching Comic Found in Storage Box #{duplicateMatch.currentBoxId}</h4>
                        <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
                          <strong>{duplicateMatch.title} #{duplicateMatch.issueNumber}</strong> is currently in your collection (Copies Owned: {duplicateMatch.readingStatus === 'Wishlist' ? 0 : (duplicateMatch.copiesOwned ?? 1)}).
                        </p>
                      </div>
                    </div>
                    {onUpdateComic && (
                      <button
                        type="button"
                        onClick={handleUpdateExisting}
                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shrink-0 shadow-xs transition-colors cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Update Existing</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Comic Title *</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. The Amazing Spider-Man"
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-slate-800 dark:focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Issue # *</label>
                  <input
                    type="text"
                    required
                    value={issueNumber}
                    onChange={(e) => setIssueNumber(e.target.value)}
                    placeholder="300 or #1"
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-slate-800 dark:focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Volume</label>
                  <input
                    type="text"
                    value={volume}
                    onChange={(e) => setVolume(e.target.value)}
                    placeholder="e.g. Vol. 1 or 2011"
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-slate-800 dark:focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-purple-700 dark:text-purple-400 mb-1">Crossover Event</label>
                  <input
                    type="text"
                    value={event}
                    onChange={(e) => setEvent(e.target.value)}
                    placeholder="e.g. Secret Wars, Civil War"
                    className="w-full bg-white dark:bg-slate-800 border border-purple-300 dark:border-purple-800 rounded-lg px-3 py-2 text-xs text-purple-900 dark:text-purple-200 font-medium focus:outline-none focus:border-purple-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-amber-800 dark:text-amber-400 mb-1">
                    Copies Owned (Qty)
                    {readingStatus === 'Wishlist' && (
                      <span className="ml-1 text-[10px] font-normal text-rose-600 dark:text-rose-400">(0 for Wishlist)</span>
                    )}
                  </label>
                  <input
                    type="number"
                    min={readingStatus === 'Wishlist' ? 0 : 1}
                    value={copiesOwned}
                    onChange={(e) => setCopiesOwned(Math.max(readingStatus === 'Wishlist' ? 0 : 1, Number(e.target.value)))}
                    className="w-full bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-800 rounded-lg px-3 py-2 text-xs text-amber-900 dark:text-amber-200 font-bold focus:outline-none focus:border-amber-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Publisher</label>
                  <input
                    type="text"
                    value={publisher}
                    onChange={(e) => setPublisher(e.target.value)}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-slate-800 dark:focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Pub Year</label>
                  <input
                    type="number"
                    value={publicationYear}
                    onChange={(e) => setPublicationYear(Number(e.target.value))}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-slate-800 dark:focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Release Month</label>
                  <select
                    value={publicationMonth}
                    onChange={(e) => setPublicationMonth(e.target.value)}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-slate-800 dark:focus:border-indigo-500"
                  >
                    <option value="">(None)</option>
                    {MONTH_NAMES.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Genre</label>
                  <input
                    type="text"
                    value={genre}
                    onChange={(e) => setGenre(e.target.value)}
                    placeholder="Superhero"
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-slate-800 dark:focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Target Storage Box</label>
                  <select
                    value={currentBoxId}
                    onChange={(e) => setCurrentBoxId(Number(e.target.value))}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-slate-800 dark:focus:border-indigo-500"
                  >
                    <option value={0}>Box 0 - Unallocated / Staging Queue</option>
                    {sortBoxes(boxes).map((b) => (
                      <option key={b.id} value={b.id}>
                        Box #{b.id}: {b.name.split('-')[1] || b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Writer(s)</label>
                  <input
                    type="text"
                    value={writer}
                    onChange={(e) => setWriter(e.target.value)}
                    placeholder="e.g. David Michelinie"
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-slate-800 dark:focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Artist(s)</label>
                  <input
                    type="text"
                    value={artist}
                    onChange={(e) => setArtist(e.target.value)}
                    placeholder="e.g. Todd McFarlane"
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-slate-800 dark:focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Physical Size & Thickness Equivalent */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-slate-700 dark:text-slate-300" />
                    Format & Equivalent Comic Book Size (Thickness Units)
                  </span>
                  <span className="text-xs font-mono font-bold text-slate-900 dark:text-slate-100">
                    {sizeThickness.toFixed(1)}x Single Issue
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {(['Single Issue', 'Trade Paperback', 'Hardcover', 'Omnibus', 'Graphic Novel'] as ComicFormat[]).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => handleFormatChange(fmt)}
                      className={`p-2 rounded-lg text-xs font-semibold border transition-all text-left cursor-pointer ${
                        format === fmt
                          ? 'bg-slate-900 dark:bg-indigo-600 text-white border-slate-900 dark:border-indigo-600'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      <div>{fmt}</div>
                      <div className={`text-[10px] font-normal ${format === fmt ? 'text-slate-300' : 'text-slate-500 dark:text-slate-400'}`}>
                        {fmt === 'Single Issue' && '1.0 unit'}
                        {fmt === 'Trade Paperback' && '~3.5 units'}
                        {fmt === 'Hardcover' && '~6.0 units'}
                        {fmt === 'Omnibus' && '~12.0 units'}
                        {fmt === 'Graphic Novel' && '~4.0 units'}
                      </div>
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <label className="text-xs text-slate-600 dark:text-slate-400 shrink-0 font-medium">
                    Custom Size Thickness Multiplier:
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    max="25"
                    value={sizeThickness}
                    onChange={(e) => setSizeThickness(parseFloat(e.target.value) || 1.0)}
                    className="w-24 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-900 dark:text-slate-100 font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Reading Status</label>
                  <select
                    value={readingStatus}
                    onChange={(e) => {
                      const newStatus = e.target.value as ReadingStatus;
                      setReadingStatus(newStatus);
                      if (newStatus === 'Wishlist') {
                        setCopiesOwned(0);
                        setCurrentBoxId(0);
                      } else if (readingStatus === 'Wishlist') {
                        if (copiesOwned === 0) setCopiesOwned(1);
                        if (currentBoxId === 0) setCurrentBoxId(1);
                      }
                    }}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-slate-800 dark:focus:border-indigo-500"
                  >
                    <option value="Unread">Unread</option>
                    <option value="Reading">Currently Reading</option>
                    <option value="Read">Read</option>
                    <option value="Wishlist">Wishlist</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Condition</label>
                  <select
                    value={condition}
                    onChange={(e) => setCondition(e.target.value as ComicCondition)}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-slate-800 dark:focus:border-indigo-500"
                  >
                    <option value="Gem Mint">Gem Mint</option>
                    <option value="Near Mint">Near Mint</option>
                    <option value="Very Fine">Very Fine</option>
                    <option value="Fine">Fine</option>
                    <option value="Very Good">Very Good</option>
                    <option value="Good">Good</option>
                    <option value="Fair">Fair</option>
                    <option value="Poor">Poor</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Est. Value ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={estimatedValue}
                    onChange={(e) => setEstimatedValue(e.target.value)}
                    placeholder="450.00"
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-slate-800 dark:focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Cover Image URL or Google Drive Share Link</label>
                  <button
                    type="button"
                    onClick={() => setActiveMode('scan')}
                    className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Crop className="w-3.5 h-3.5" />
                    <span>Scan / Crop Cover Photo</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={coverImage}
                  onChange={(e) => setCoverImage(e.target.value)}
                  placeholder="e.g. https://drive.google.com/file/d/1r5avbI2b1d3Ehhl2KNO9vshVynZZNT9Z/view?usp=drive_link"
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-slate-800 dark:focus:border-indigo-500"
                />

                {/* Google Drive Link Guidance */}
                {extractDriveFileId(coverImage) ? (
                  <div className="p-2.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 rounded-xl text-[11px] text-blue-900 dark:text-blue-200 space-y-1">
                    <div className="flex items-center justify-between gap-2 font-bold">
                      <span className="flex items-center gap-1.5">
                        <Cloud className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                        Google Drive Share Link Detected
                      </span>
                      <span className="text-[10px] font-mono bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-300 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800">
                        ID: {extractDriveFileId(coverImage)}
                      </span>
                    </div>
                    <p className="text-[11px] text-blue-800 dark:text-blue-300 leading-snug">
                      <strong>Requirement:</strong> In Google Drive, ensure General Access is set to <strong>"Anyone with the link can view"</strong>.
                    </p>
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <Info className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0" />
                    <span>Supports Google Drive share links, direct web image URLs, or base64 uploads.</span>
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Tags (comma separated)</label>
                <input
                  type="text"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="Key Issue, Venom, Todd McFarlane"
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-slate-800 dark:focus:border-indigo-500"
                />
              </div>

              <div className="pt-4 flex items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800">
                {duplicateMatch && onUpdateComic ? (
                  <div className="flex items-center gap-2 w-full justify-end">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold cursor-pointer"
                    >
                      Save as New Copy
                    </button>
                    <button
                      type="button"
                      onClick={handleUpdateExisting}
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Update Existing Comic (#{duplicateMatch.issueNumber})</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-end gap-3 w-full">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
                    >
                      {readingStatus === 'Wishlist' ? 'Save Comic to Wishlist' : `Save Comic to Box #${currentBoxId}`}
                    </button>
                  </div>
                )}
              </div>

            </form>
          )}
        </div>

      </div>
    </div>
  );
};
