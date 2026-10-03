import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  X, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Maximize2, 
  Minimize2, 
  ExternalLink, 
  ChevronLeft, 
  ChevronRight, 
  Layers, 
  Info, 
  BookOpen, 
  Calendar, 
  Sparkles,
  Columns2,
  Image as ImageIcon
} from 'lucide-react';
import { ComicBook } from '../types';
import { getComicCoverUrl, formatDriveImageUrl, handleImageError } from '../utils/imageUtils';

export interface FullArtShowcaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  comic: ComicBook | null;
  allComics?: ComicBook[];
  onSelectComic?: (comic: ComicBook) => void;
}

export const FullArtShowcaseModal: React.FC<FullArtShowcaseModalProps> = ({
  isOpen,
  onClose,
  comic,
  allComics = [],
  onSelectComic,
}) => {
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [showInfo, setShowInfo] = useState(true);
  const [viewMode, setViewMode] = useState<'full' | 'split' | 'front'>('full');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const modalContainerRef = useRef<HTMLDivElement>(null);

  // Filter all comics in collection that have full art for previous/next navigation
  const fullArtComics = useMemo(() => {
    return allComics.filter((c) => Boolean(c.coverImageFull && c.coverImageFull.trim()));
  }, [allComics]);

  const currentIndex = useMemo(() => {
    if (!comic) return -1;
    return fullArtComics.findIndex((c) => c.id === comic.id);
  }, [comic, fullArtComics]);

  // Reset zoom & pan when comic changes
  useEffect(() => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  }, [comic?.id]);

  // Handle Fullscreen change events
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Keyboard navigation & zoom
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (zoomLevel > 1) {
          setZoomLevel(1);
          setPanOffset({ x: 0, y: 0 });
        } else {
          onClose();
        }
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setZoomLevel((prev) => Math.min(prev + 0.25, 4));
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        setZoomLevel((prev) => {
          const next = Math.max(prev - 0.25, 1);
          if (next === 1) setPanOffset({ x: 0, y: 0 });
          return next;
        });
      } else if (e.key === '0') {
        e.preventDefault();
        setZoomLevel(1);
        setPanOffset({ x: 0, y: 0 });
      } else if (e.key === 'i' || e.key === 'I') {
        setShowInfo((prev) => !prev);
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      } else if (e.key === 'ArrowLeft' && fullArtComics.length > 1 && onSelectComic && currentIndex > 0) {
        onSelectComic(fullArtComics[currentIndex - 1]);
      } else if (e.key === 'ArrowRight' && fullArtComics.length > 1 && onSelectComic && currentIndex < fullArtComics.length - 1) {
        onSelectComic(fullArtComics[currentIndex + 1]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, zoomLevel, currentIndex, fullArtComics, onClose, onSelectComic]);

  const toggleFullscreen = () => {
    if (!modalContainerRef.current) return;
    if (!document.fullscreenElement) {
      modalContainerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomLevel <= 1) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || zoomLevel <= 1) return;
    setPanOffset({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey || zoomLevel > 1) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.2 : -0.2;
      setZoomLevel((prev) => {
        const next = Math.min(Math.max(prev + delta, 1), 4);
        if (next === 1) setPanOffset({ x: 0, y: 0 });
        return next;
      });
    }
  };

  if (!isOpen || !comic) return null;

  // Ultra high resolution URL for full artwork: replace s800/s1000 with s2400
  const fullArtRawUrl = comic.coverImageFull || comic.coverImage;
  const fullArtUrl = fullArtRawUrl
    ? formatDriveImageUrl(fullArtRawUrl).replace(/=s\d+$/, '=s2400')
    : getComicCoverUrl(comic.coverImage);

  const frontCoverUrl = getComicCoverUrl(comic.coverImage);

  return (
    <div
      ref={modalContainerRef}
      className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col select-none overflow-hidden"
    >
      {/* Top Floating Control Bar */}
      <div className="absolute top-0 inset-x-0 z-30 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
        {/* Left: Comic Title & Info Badge */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-xl bg-purple-600/30 border border-purple-500/40 text-purple-300 shadow-lg">
            <Layers className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-white font-extrabold text-base sm:text-lg truncate">
                {comic.title || comic.fullTitle || comic.seriesName || 'Untitled Comic'}
              </h2>
              <span className="text-purple-400 font-black text-sm sm:text-base">
                #{comic.issueNumber}
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-950/80 border border-purple-800 text-[10px] font-bold text-purple-300">
                <Sparkles className="w-2.5 h-2.5" /> Wraparound Art
              </span>
            </div>
            <p className="text-xs text-slate-400 truncate">
              {comic.publisher} {comic.publicationYear ? `• ${comic.publicationYear}` : ''}
              {comic.coverArtist ? ` • Cover Art: ${comic.coverArtist}` : ''}
            </p>
          </div>
        </div>

        {/* Center: View Mode Segmented Controls */}
        <div className="hidden md:flex items-center gap-1 bg-white/10 backdrop-blur-md p-1 rounded-xl border border-white/10 text-xs">
          <button
            type="button"
            onClick={() => setViewMode('full')}
            className={`px-3 py-1 rounded-lg transition-all cursor-pointer font-bold flex items-center gap-1.5 ${
              viewMode === 'full'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Full Spread</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('split')}
            className={`px-3 py-1 rounded-lg transition-all cursor-pointer font-bold flex items-center gap-1.5 ${
              viewMode === 'split'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Columns2 className="w-3.5 h-3.5" />
            <span>Compare (Front vs Full)</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('front')}
            className={`px-3 py-1 rounded-lg transition-all cursor-pointer font-bold flex items-center gap-1.5 ${
              viewMode === 'front'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Front Only</span>
          </button>
        </div>

        {/* Right Action Icons */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Zoom controls */}
          <div className="hidden sm:flex items-center bg-white/10 backdrop-blur-md rounded-xl p-0.5 border border-white/10">
            <button
              type="button"
              onClick={() =>
                setZoomLevel((prev) => {
                  const next = Math.max(prev - 0.25, 1);
                  if (next === 1) setPanOffset({ x: 0, y: 0 });
                  return next;
                })
              }
              className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg cursor-pointer"
              title="Zoom Out (-)"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-[11px] font-bold text-white px-2 min-w-12 text-center">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoomLevel((prev) => Math.min(prev + 0.25, 4))}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg cursor-pointer"
              title="Zoom In (+)"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setZoomLevel(1);
                setPanOffset({ x: 0, y: 0 });
              }}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg cursor-pointer ml-0.5"
              title="Reset Zoom (0)"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Toggle Metadata Info */}
          <button
            type="button"
            onClick={() => setShowInfo((prev) => !prev)}
            className={`p-2 rounded-xl border backdrop-blur-md transition-all cursor-pointer ${
              showInfo
                ? 'bg-purple-600/40 border-purple-500/50 text-white'
                : 'bg-white/10 border-white/10 text-slate-400 hover:text-white hover:bg-white/20'
            }`}
            title="Toggle Details Drawer (i)"
          >
            <Info className="w-4 h-4" />
          </button>

          {/* Open Raw Full Image in New Tab */}
          <a
            href={fullArtUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl text-slate-300 hover:text-white transition-all cursor-pointer"
            title="Open Original Image in New Tab"
          >
            <ExternalLink className="w-4 h-4" />
          </a>

          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-2 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl text-slate-300 hover:text-white transition-all cursor-pointer"
            title={isFullscreen ? 'Exit Fullscreen (f)' : 'Enter Fullscreen (f)'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="p-2 bg-white/10 hover:bg-rose-600/80 border border-white/10 rounded-xl text-white transition-all ml-1 cursor-pointer"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Showcase Stage Area */}
      <div
        className="flex-1 relative w-full h-full flex items-center justify-center p-4 sm:p-8 overflow-hidden"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        style={{ cursor: zoomLevel > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
      >
        {/* Navigation Previous Comic with Full Art */}
        {fullArtComics.length > 1 && onSelectComic && currentIndex > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectComic(fullArtComics[currentIndex - 1]);
            }}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-20 p-3 bg-black/60 hover:bg-purple-600 text-white rounded-full border border-white/20 backdrop-blur-md transition-all shadow-xl cursor-pointer"
            title="Previous Issue with Full Art (Left Arrow)"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {/* Navigation Next Comic with Full Art */}
        {fullArtComics.length > 1 && onSelectComic && currentIndex < fullArtComics.length - 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectComic(fullArtComics[currentIndex + 1]);
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-20 p-3 bg-black/60 hover:bg-purple-600 text-white rounded-full border border-white/20 backdrop-blur-md transition-all shadow-xl cursor-pointer"
            title="Next Issue with Full Art (Right Arrow)"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}

        {/* Dynamic Image Container according to View Mode */}
        {viewMode === 'full' && (
          <div
            className="transition-transform duration-75 flex items-center justify-center max-w-full max-h-full"
            style={{
              transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
              transformOrigin: 'center center',
            }}
          >
            <img
              src={fullArtUrl}
              alt={`${comic.title} Full Cover Art`}
              onError={handleImageError}
              referrerPolicy="no-referrer"
              className="max-h-[82vh] max-w-[92vw] w-auto h-auto object-contain rounded-xl shadow-2xl border border-white/10"
              draggable={false}
            />
          </div>
        )}

        {viewMode === 'split' && (
          <div className="flex flex-col md:flex-row items-center justify-center gap-6 max-h-[82vh] max-w-[92vw] z-10 overflow-auto">
            {/* Front Cover Card */}
            <div className="flex flex-col items-center space-y-2">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider bg-black/50 px-3 py-1 rounded-full border border-white/10">
                Front Cover Only
              </span>
              <img
                src={frontCoverUrl}
                alt={`${comic.title} Front Cover`}
                onError={handleImageError}
                referrerPolicy="no-referrer"
                className="max-h-[70vh] w-auto object-contain rounded-xl shadow-2xl border border-white/10"
                draggable={false}
              />
            </div>

            {/* Full Wraparound Spread Card */}
            <div className="flex flex-col items-center space-y-2">
              <span className="text-xs font-bold text-purple-300 uppercase tracking-wider bg-purple-950/70 px-3 py-1 rounded-full border border-purple-800">
                Full Wraparound Spread
              </span>
              <img
                src={fullArtUrl}
                alt={`${comic.title} Full Spread`}
                onError={handleImageError}
                referrerPolicy="no-referrer"
                className="max-h-[70vh] w-auto object-contain rounded-xl shadow-2xl border border-purple-500/40"
                draggable={false}
              />
            </div>
          </div>
        )}

        {viewMode === 'front' && (
          <div
            className="transition-transform duration-75 flex items-center justify-center max-w-full max-h-full"
            style={{
              transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
              transformOrigin: 'center center',
            }}
          >
            <img
              src={frontCoverUrl}
              alt={`${comic.title} Front Cover`}
              onError={handleImageError}
              referrerPolicy="no-referrer"
              className="max-h-[82vh] max-w-[90vw] w-auto h-auto object-contain rounded-xl shadow-2xl border border-white/10"
              draggable={false}
            />
          </div>
        )}

        {/* Collapsible Info Drawer in Bottom-Left Corner */}
        {showInfo && (
          <div className="absolute bottom-5 left-5 z-20 max-w-sm sm:max-w-md bg-slate-900/90 border border-slate-700/80 backdrop-blur-md rounded-2xl p-4 text-white shadow-2xl space-y-2.5 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded-full bg-purple-600/30 border border-purple-500/40 text-purple-300 text-[10px] font-extrabold uppercase tracking-wide">
                  Artwork Showcase
                </span>
                {fullArtComics.length > 1 && (
                  <span className="text-[10px] text-slate-400 font-medium">
                    Issue {currentIndex + 1} of {fullArtComics.length} in Vault
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowInfo(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                title="Hide details"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div>
              <h3 className="text-sm font-black text-white leading-snug">
                {comic.title || comic.fullTitle || comic.seriesName} #{comic.issueNumber}
              </h3>
              {comic.seriesName && (
                <p className="text-xs text-purple-300 font-semibold">{comic.seriesName}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300 pt-1 border-t border-slate-800">
              {comic.coverArtist && (
                <div>
                  <span className="text-slate-400 font-medium block">Cover Artist</span>
                  <span className="font-bold text-white">{comic.coverArtist}</span>
                </div>
              )}
              {comic.writer && (
                <div>
                  <span className="text-slate-400 font-medium block">Writer</span>
                  <span className="font-bold text-white">{comic.writer}</span>
                </div>
              )}
              {comic.artist && (
                <div>
                  <span className="text-slate-400 font-medium block">Interior Artist</span>
                  <span className="font-bold text-white">{comic.artist}</span>
                </div>
              )}
              {comic.format && (
                <div>
                  <span className="text-slate-400 font-medium block">Format</span>
                  <span className="font-bold text-white">{comic.format}</span>
                </div>
              )}
            </div>

            {comic.notes && (
              <p className="text-[11px] text-slate-400 line-clamp-2 pt-1 border-t border-slate-800">
                {comic.notes}
              </p>
            )}

            <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1">
              <span>Scroll to zoom • Drag to pan</span>
              <span>Press &apos;f&apos; for fullscreen</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FullArtShowcaseModal;
