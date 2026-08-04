import React, { useState, useMemo } from 'react';
import { ComicBook, StorageBox, ComicFormat, ComicCondition, ReadingStatus } from '../types';
import { compressBase64Image, extractDriveFileId } from '../utils/imageUtils';
import { sortBoxes } from '../utils/boxUtils';
import { MONTH_NAMES } from '../utils/dateUtils';
import { 
  X, 
  Camera, 
  Sparkles, 
  Upload, 
  BookOpen, 
  PlusCircle, 
  CheckCircle, 
  Loader2, 
  Layers, 
  Boxes,
  Copy,
  RefreshCw,
  ArrowRight,
  ShieldAlert,
  Cloud,
  Info
} from 'lucide-react';

interface AddAndScanModalProps {
  isOpen: boolean;
  onClose: () => void;
  boxes: StorageBox[];
  existingComics?: ComicBook[];
  onAddComic: (newComic: ComicBook) => void;
  onUpdateComic?: (updatedComic: ComicBook) => void;
  initialScanMode?: boolean;
}

export const AddAndScanModal: React.FC<AddAndScanModalProps> = ({
  isOpen,
  onClose,
  boxes,
  existingComics = [],
  onAddComic,
  onUpdateComic,
  initialScanMode = false,
}) => {
  const [activeMode, setActiveMode] = useState<'scan' | 'manual'>(initialScanMode ? 'scan' : 'manual');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanPreviewUrl, setScanPreviewUrl] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

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
      const cTitle = c.title.trim().toLowerCase();
      const cIssue = c.issueNumber.trim().toLowerCase().replace(/^#/, '');
      const cPub = (c.publisher || '').trim().toLowerCase();
      return cTitle === normTitle && cIssue === normIssue && (normPub ? cPub === normPub : true);
    });
    if (exact) return exact;

    // Secondary match on title + issue
    return existingComics.find((c) => {
      const cTitle = c.title.trim().toLowerCase();
      const cIssue = c.issueNumber.trim().toLowerCase().replace(/^#/, '');
      return cTitle === normTitle && cIssue === normIssue;
    }) || null;
  }, [title, issueNumber, publisher, existingComics]);

  if (!isOpen) return null;

  // Handle Cover Image Upload and Scan with Gemini
  const handleImageUploadAndScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setScanError(null);
    setIsScanning(true);

    const reader = new FileReader();
    reader.onload = async () => {
      const rawBase64 = reader.result as string;
      const compressedBase64 = await compressBase64Image(rawBase64, 800, 0.75);
      setScanPreviewUrl(compressedBase64);
      setCoverImage(compressedBase64);

      try {
        const response = await fetch('/api/scan-cover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: compressedBase64,
            mimeType: 'image/jpeg',
          }),
        });

        const result = await response.json();

        if (result.success && result.data) {
          const d = result.data;
          if (d.title) setTitle(d.title);
          if (d.issueNumber) setIssueNumber(String(d.issueNumber));
          if (d.volume) setVolume(d.volume);
          if (d.publisher) setPublisher(d.publisher);
          if (d.publicationYear) setPublicationYear(Number(d.publicationYear));
          if (d.genre) setGenre(d.genre);
          if (d.writer) setWriter(d.writer);
          if (d.artist) setArtist(d.artist);
          if (d.coverArtist) setCoverArtist(d.coverArtist);
          if (d.format) setFormat(d.format);
          if (d.sizeThickness) setSizeThickness(Number(d.sizeThickness));
          if (d.estimatedValue) setEstimatedValue(String(d.estimatedValue));
          if (d.summary) setNotes(d.summary);
          if (Array.isArray(d.tags)) setTagsInput(d.tags.join(', '));
        } else {
          setScanError(result.error || 'Could not analyze cover image');
        }
      } catch (err: any) {
        console.error(err);
        setScanError(err.message || 'Error connecting to cover scanner API');
      } finally {
        setIsScanning(false);
      }
    };

    reader.readAsDataURL(file);
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
    if (artist.trim()) newContribs.push({ creatorName: artist.trim(), roleName: 'Penciler' });
    if (coverArtist.trim()) newContribs.push({ creatorName: coverArtist.trim(), roleName: 'Cover Penciler' });

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
    if (artist.trim()) creatorContribs.push({ creatorName: artist.trim(), roleName: 'Penciler' });
    if (coverArtist.trim()) creatorContribs.push({ creatorName: coverArtist.trim(), roleName: 'Cover Penciler' });

    const isWishlist = readingStatus === 'Wishlist';
    const finalCopies = isWishlist ? 0 : (Number(copiesOwned) > 0 ? Number(copiesOwned) : 1);

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
      currentBoxId: Number(currentBoxId),
      readingStatus,
      readCount: readingStatus === 'Read' ? 1 : 0,
      condition,
      purchasePrice: purchasePrice ? parseFloat(purchasePrice) : undefined,
      estimatedValue: estimatedValue ? parseFloat(estimatedValue) : undefined,
      notes: notes.trim(),
      tags,
      createdAt: new Date().toISOString(),
    };

    onAddComic(newComic);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden my-8">
        
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-slate-200 text-slate-800">
              <PlusCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Add New Comic to Vault</h3>
              <p className="text-xs text-slate-500">Scan cover photo or fill manual catalog fields</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex gap-2">
          <button
            type="button"
            onClick={() => setActiveMode('scan')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
              activeMode === 'scan'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Gemini AI Cover Scanner</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveMode('manual')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
              activeMode === 'manual'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Manual Entry Form</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6">
          {activeMode === 'scan' ? (
            
            /* AI SCANNER TAB */
            <div className="space-y-6 text-center py-2">
              <div className="max-w-md mx-auto border-2 border-dashed border-slate-300 hover:border-slate-500 rounded-2xl p-8 bg-slate-50/50 transition-colors relative">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUploadAndScan}
                  disabled={isScanning}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />

                {scanPreviewUrl ? (
                  <div className="space-y-3">
                    <img
                      src={scanPreviewUrl}
                      alt="Cover Preview"
                      className="w-32 h-48 object-cover rounded-xl mx-auto shadow-md border border-slate-200"
                    />
                    {isScanning ? (
                      <div className="flex items-center justify-center gap-2 text-slate-800 font-bold text-xs">
                        <Loader2 className="w-4 h-4 animate-spin text-slate-900" />
                        <span>Gemini AI Analyzing Cover details...</span>
                      </div>
                    ) : (
                      <p className="text-xs text-emerald-700 font-semibold">
                        Scan Complete! Review detected fields below.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="w-14 h-14 rounded-full bg-slate-100 border border-slate-200 text-slate-800 flex items-center justify-center mx-auto">
                      <Camera className="w-7 h-7" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">Upload or Snap Comic Cover</h4>
                      <p className="text-xs text-slate-500 mt-1">
                        Gemini AI will scan title, issue #, writer, artist, publisher, publication year, format, and estimated size thickness!
                      </p>
                    </div>
                    <button className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs shadow-xs">
                      Choose Cover Image File
                    </button>
                  </div>
                )}
              </div>

              {scanError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl">
                  {scanError}
                </div>
              )}

              {/* Duplicate Banner in AI Scanner */}
              {duplicateMatch && !isScanning && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-left space-y-3 max-w-lg mx-auto">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-amber-100 rounded-xl text-amber-800 shrink-0 mt-0.5">
                      <Copy className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-amber-900 text-sm">Duplicate Found in Collection</h4>
                        <span className="px-2 py-0.5 bg-amber-200 text-amber-900 text-[10px] font-bold rounded-full">
                          Storage Box #{duplicateMatch.currentBoxId}
                        </span>
                      </div>
                      <p className="text-xs text-amber-800 mt-1">
                        <strong>{duplicateMatch.title} #{duplicateMatch.issueNumber}</strong> ({duplicateMatch.publisher}) already exists in your vault.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1 border-t border-amber-200/60">
                    {onUpdateComic && (
                      <button
                        type="button"
                        onClick={handleUpdateExisting}
                        className="flex-1 min-w-[180px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Update Existing Comic (#{duplicateMatch.issueNumber})</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setActiveMode('manual')}
                      className="px-4 py-2 bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors"
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
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-left space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-bold text-amber-900 text-xs">Matching Comic Found in Storage Box #{duplicateMatch.currentBoxId}</h4>
                        <p className="text-xs text-amber-800 mt-0.5">
                          <strong>{duplicateMatch.title} #{duplicateMatch.issueNumber}</strong> is currently in your collection (Copies Owned: {duplicateMatch.readingStatus === 'Wishlist' ? 0 : (duplicateMatch.copiesOwned ?? 1)}).
                        </p>
                      </div>
                    </div>
                    {onUpdateComic && (
                      <button
                        type="button"
                        onClick={handleUpdateExisting}
                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shrink-0 shadow-xs transition-colors"
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
                  <label className="block text-xs font-bold text-slate-700 mb-1">Comic Title *</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. The Amazing Spider-Man"
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Issue # *</label>
                  <input
                    type="text"
                    required
                    value={issueNumber}
                    onChange={(e) => setIssueNumber(e.target.value)}
                    placeholder="300 or #1"
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Volume</label>
                  <input
                    type="text"
                    value={volume}
                    onChange={(e) => setVolume(e.target.value)}
                    placeholder="e.g. Vol. 1 or 2011"
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-purple-700 mb-1">Crossover Event</label>
                  <input
                    type="text"
                    value={event}
                    onChange={(e) => setEvent(e.target.value)}
                    placeholder="e.g. Secret Wars, Civil War"
                    className="w-full bg-white border border-purple-300 rounded-lg px-3 py-2 text-xs text-purple-900 font-medium focus:outline-none focus:border-purple-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-amber-800 mb-1">Copies Owned (Qty)</label>
                  <input
                    type="number"
                    min={1}
                    value={copiesOwned}
                    onChange={(e) => setCopiesOwned(Number(e.target.value))}
                    className="w-full bg-white border border-amber-300 rounded-lg px-3 py-2 text-xs text-amber-900 font-bold focus:outline-none focus:border-amber-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Publisher</label>
                  <input
                    type="text"
                    value={publisher}
                    onChange={(e) => setPublisher(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Pub Year</label>
                  <input
                    type="number"
                    value={publicationYear}
                    onChange={(e) => setPublicationYear(Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Release Month</label>
                  <select
                    value={publicationMonth}
                    onChange={(e) => setPublicationMonth(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-slate-800"
                  >
                    <option value="">(None)</option>
                    {MONTH_NAMES.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Genre</label>
                  <input
                    type="text"
                    value={genre}
                    onChange={(e) => setGenre(e.target.value)}
                    placeholder="Superhero"
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Target Storage Box</label>
                  <select
                    value={currentBoxId}
                    onChange={(e) => setCurrentBoxId(Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-slate-800"
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
                  <label className="block text-xs font-bold text-slate-700 mb-1">Writer(s)</label>
                  <input
                    type="text"
                    value={writer}
                    onChange={(e) => setWriter(e.target.value)}
                    placeholder="e.g. David Michelinie"
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Artist(s)</label>
                  <input
                    type="text"
                    value={artist}
                    onChange={(e) => setArtist(e.target.value)}
                    placeholder="e.g. Todd McFarlane"
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-slate-800"
                  />
                </div>
              </div>

              {/* Physical Size & Thickness Equivalent */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-slate-700" />
                    Format & Equivalent Comic Book Size (Thickness Units)
                  </span>
                  <span className="text-xs font-mono font-bold text-slate-900">
                    {sizeThickness.toFixed(1)}x Single Issue
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {(['Single Issue', 'Trade Paperback', 'Hardcover', 'Omnibus', 'Graphic Novel'] as ComicFormat[]).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => handleFormatChange(fmt)}
                      className={`p-2 rounded-lg text-xs font-semibold border transition-all text-left ${
                        format === fmt
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div>{fmt}</div>
                      <div className={`text-[10px] font-normal ${format === fmt ? 'text-slate-300' : 'text-slate-500'}`}>
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
                  <label className="text-xs text-slate-600 shrink-0 font-medium">
                    Custom Size Thickness Multiplier:
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    max="25"
                    value={sizeThickness}
                    onChange={(e) => setSizeThickness(parseFloat(e.target.value) || 1.0)}
                    className="w-24 bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs text-slate-900 font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Reading Status</label>
                  <select
                    value={readingStatus}
                    onChange={(e) => setReadingStatus(e.target.value as ReadingStatus)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-slate-800"
                  >
                    <option value="Unread">Unread</option>
                    <option value="Reading">Currently Reading</option>
                    <option value="Read">Read</option>
                    <option value="Wishlist">Wishlist</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Condition</label>
                  <select
                    value={condition}
                    onChange={(e) => setCondition(e.target.value as ComicCondition)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-slate-800"
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
                  <label className="block text-xs font-bold text-slate-700 mb-1">Est. Value ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={estimatedValue}
                    onChange={(e) => setEstimatedValue(e.target.value)}
                    placeholder="450.00"
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-slate-800"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">Cover Image URL or Google Drive Share Link</label>
                <input
                  type="text"
                  value={coverImage}
                  onChange={(e) => setCoverImage(e.target.value)}
                  placeholder="e.g. https://drive.google.com/file/d/1r5avbI2b1d3Ehhl2KNO9vshVynZZNT9Z/view?usp=drive_link"
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-slate-800"
                />

                {/* Google Drive Link Guidance */}
                {extractDriveFileId(coverImage) ? (
                  <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-[11px] text-blue-900 space-y-1">
                    <div className="flex items-center justify-between gap-2 font-bold">
                      <span className="flex items-center gap-1.5">
                        <Cloud className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        Google Drive Share Link Detected
                      </span>
                      <span className="text-[10px] font-mono bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded border border-blue-200">
                        ID: {extractDriveFileId(coverImage)}
                      </span>
                    </div>
                    <p className="text-[11px] text-blue-800 leading-snug">
                      <strong>Requirement:</strong> In Google Drive, ensure General Access is set to <strong>"Anyone with the link can view"</strong>.
                    </p>
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-500 flex items-center gap-1">
                    <Info className="w-3 h-3 text-slate-400 shrink-0" />
                    <span>Supports Google Drive share links, direct web image URLs, or base64 uploads.</span>
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tags (comma separated)</label>
                <input
                  type="text"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="Key Issue, Venom, Todd McFarlane"
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-slate-800"
                />
              </div>

              <div className="pt-4 flex items-center justify-between gap-3 border-t border-slate-100">
                {duplicateMatch && onUpdateComic ? (
                  <div className="flex items-center gap-2 w-full justify-end">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold border border-slate-200"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold"
                    >
                      Save as New Copy
                    </button>
                    <button
                      type="button"
                      onClick={handleUpdateExisting}
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5"
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
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold border border-slate-200"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-xs"
                    >
                      Save Comic to Box #{currentBoxId}
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
