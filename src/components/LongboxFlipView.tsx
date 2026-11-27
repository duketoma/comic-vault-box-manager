import React, { useEffect, useState, useCallback, useRef } from 'react';
import { ComicBook, StorageBox } from '../types';
import { getComicCoverUrl, handleImageError } from '../utils/imageUtils';
import { formatPublicationDate } from '../utils/dateUtils';
import {
  DEFAULT_UI_STYLE_PREFS,
  getSlabNumericGradeLabel,
  isComicHolofoilEligible,
  UiStylePreferences,
} from '../utils/uiThemeConfig';
import {
  ChevronLeft,
  ChevronRight,
  Sparkles,
  BookOpen,
  Boxes,
  CheckCircle,
  Clock,
  Eye,
  Star,
  Maximize2,
  Minimize2,
} from 'lucide-react';

interface LongboxFlipViewProps {
  comics: ComicBook[];
  boxes: StorageBox[];
  onSelectComic: (comic: ComicBook) => void;
  onQuickStatusChange: (comicId: string, status: ComicBook['readingStatus']) => void;
  onOpenFullArt?: (comic: ComicBook) => void;
  uiStylePrefs?: UiStylePreferences;
}

const VISIBLE_NEIGHBORS = 7;
const VISIBLE_NEIGHBORS_FULLSCREEN = 9;

export const LongboxFlipView: React.FC<LongboxFlipViewProps> = ({
  comics,
  boxes,
  onSelectComic,
  onQuickStatusChange,
  onOpenFullArt,
  uiStylePrefs = DEFAULT_UI_STYLE_PREFS,
}) => {
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => {
      const next = !prev;
      if (typeof document !== 'undefined') {
        if (next && containerRef.current?.requestFullscreen) {
          containerRef.current.requestFullscreen().catch(() => {
            // Fixed-viewport CSS fallback still applies cleanly
          });
        } else if (!next && document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
      }
      return next;
    });
  }, []);

  // Sync state if user exits native browser fullscreen via browser Escape/UI
  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) {
        setIsFullscreen(false);
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Clamp index when filtered list shrinks or changes
  const safeIndex = comics.length > 0 ? Math.min(activeIndex, comics.length - 1) : 0;

  useEffect(() => {
    if (activeIndex !== safeIndex) {
      setActiveIndex(safeIndex);
    }
  }, [activeIndex, safeIndex]);

  const goPrev = useCallback(() => {
    setActiveIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const goNext = useCallback(() => {
    setActiveIndex((prev) => Math.min(comics.length - 1, prev + 1));
  }, [comics.length]);

  // Keyboard navigation when focused or when no input/modal is open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      // Don't hijack keys when a modal overlay is open
      if (document.querySelector('.fixed.inset-0.z-50')) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'Enter' && comics[safeIndex]) {
        e.preventDefault();
        onSelectComic(comics[safeIndex]);
      } else if (e.key === 'Escape' && isFullscreen) {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        toggleFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goPrev, goNext, comics, safeIndex, onSelectComic, isFullscreen, toggleFullscreen]);

  if (comics.length === 0) return null;

  const activeComic = comics[safeIndex];
  const activeBox = boxes.find((b) => b.id === activeComic.currentBoxId);
  const activeCoverUrl = getComicCoverUrl(activeComic.coverImage);
  const activeEstNum =
    activeComic.estimatedValue != null && !Number.isNaN(Number(activeComic.estimatedValue))
      ? Number(activeComic.estimatedValue)
      : null;

  const neighborCount = isFullscreen ? VISIBLE_NEIGHBORS_FULLSCREEN : VISIBLE_NEIGHBORS;
  const startIdx = Math.max(0, safeIndex - neighborCount);
  const endIdx = Math.min(comics.length - 1, safeIndex + neighborCount);
  const windowItems: { comic: ComicBook; index: number; offset: number }[] = [];
  for (let i = startIdx; i <= endIdx; i++) {
    windowItems.push({ comic: comics[i], index: i, offset: i - safeIndex });
  }

  return (
    <div
      ref={containerRef}
      data-testid="longbox-flip-view"
      className={
        isFullscreen
          ? 'fixed inset-0 z-40 overflow-hidden bg-slate-950 text-white flex flex-col justify-between'
          : 'relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-950 text-white shadow-xl'
      }
    >
      {/* Ambient Cover-Matched Blurred Backdrop */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <img
          src={activeCoverUrl}
          alt=""
          onError={handleImageError}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover blur-3xl scale-125 opacity-25 saturate-150 transition-all duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/60 via-slate-950/45 to-slate-950/95" />
      </div>

      {/* Header Strip */}
      <div className="relative z-10 flex items-center justify-between px-4 sm:px-6 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-200 text-[10px] font-extrabold uppercase tracking-wider">
            <Sparkles className="w-3 h-3 text-amber-300" />
            Longbox Flip Mode
          </span>
          <span className="text-xs text-slate-400 hidden sm:inline">
            Use <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-slate-200 font-mono text-[10px]">←</kbd>{' '}
            <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-slate-200 font-mono text-[10px]">→</kbd> to browse,{' '}
            <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-slate-200 font-mono text-[10px]">Enter</kbd> to inspect
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-bold text-slate-300 bg-white/10 px-2.5 py-1 rounded-lg border border-white/10">
            {safeIndex + 1} / {comics.length.toLocaleString()}
          </span>
          <button
            type="button"
            onClick={toggleFullscreen}
            data-testid="longbox-fullscreen-toggle"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-indigo-600/80 text-slate-200 hover:text-white border border-white/15 text-xs font-bold transition-colors cursor-pointer"
            title={isFullscreen ? 'Exit Full Screen (Esc or F)' : 'Enter Full Screen (F)'}
            aria-label={isFullscreen ? 'Exit Full Screen' : 'Full Screen'}
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Exit Full Screen</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Full Screen</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 3D Perspective Cover-Flow Stage */}
      <div
        ref={stageRef}
        onWheel={(e) => {
          if (Math.abs(e.deltaX) > 15 || (e.shiftKey && Math.abs(e.deltaY) > 15)) {
            e.preventDefault();
            const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
            if (delta > 0) goNext();
            else goPrev();
          }
        }}
        className={`relative z-10 flex items-center justify-center select-none overflow-hidden ${
          isFullscreen ? 'flex-1 min-h-0' : 'h-[460px] sm:h-[550px]'
        }`}
        style={{ perspective: isFullscreen ? '1450px' : '1200px' }}
      >
        {/* Subtle Glossy Floor Horizon Sheen */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-32 sm:h-36 bg-gradient-to-t from-slate-950 via-slate-950/70 to-transparent border-t border-white/[0.04]"
        />

        {/* Left Navigation Arrow */}
        <button
          type="button"
          onClick={goPrev}
          disabled={safeIndex === 0}
          aria-label="Previous comic"
          className="absolute left-3 sm:left-6 z-30 p-2.5 sm:p-3 rounded-full bg-slate-900/80 hover:bg-indigo-600/90 disabled:opacity-25 disabled:cursor-not-allowed border border-white/15 text-white shadow-xl backdrop-blur-md transition-all cursor-pointer active:scale-95"
        >
          <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
        </button>

        {/* Right Navigation Arrow */}
        <button
          type="button"
          onClick={goNext}
          disabled={safeIndex >= comics.length - 1}
          aria-label="Next comic"
          className="absolute right-3 sm:right-6 z-30 p-2.5 sm:p-3 rounded-full bg-slate-900/80 hover:bg-indigo-600/90 disabled:opacity-25 disabled:cursor-not-allowed border border-white/15 text-white shadow-xl backdrop-blur-md transition-all cursor-pointer active:scale-95"
        >
          <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
        </button>

        {/* Virtualized 3D Covers — Edge-to-Edge with Deep Cover-Flow Turn, High Legibility & Mirror Reflections */}
        <div className="relative w-full h-full flex items-center justify-center pt-4 sm:pt-6" style={{ transformStyle: 'preserve-3d' }}>
          {windowItems.map(({ comic, index, offset }) => {
            const absOffset = Math.abs(offset);
            const isCenter = offset === 0;
            // Spread covers smoothly edge-to-edge across wide viewports
            const baseGap = isFullscreen ? 215 : 165;
            const stepGap = isFullscreen ? 112 : 92;
            const translateX = offset === 0 ? 0 : Math.sign(offset) * (baseGap + (absOffset - 1) * stepGap);
            const translateZ = isCenter ? 80 : -30 - (absOffset - 1) * 28;
            // Pronounced Cover-Flow side rotation (50° → 65°) so side issues clearly angle inward
            const rotateY = isCenter ? 0 : Math.sign(offset) * -Math.min(66, 50 + (absOffset - 1) * 3.5);
            const scale = isCenter ? 1.06 : Math.max(0.76, 0.94 - (absOffset - 1) * 0.035);
            // Keep off-center covers vibrant with minimal fade
            const opacity = isCenter ? 1 : Math.max(0.58, 0.96 - (absOffset - 1) * 0.065);
            const zIndex = 30 - absOffset;
            const showFoil = isCenter && isComicHolofoilEligible(comic, uiStylePrefs.holofoilMode);
            const slabGrade =
              isCenter && uiStylePrefs.skin === 'slab'
                ? getSlabNumericGradeLabel(comic.condition, comic.tags, comic.notes)
                : null;
            const coverUrl = getComicCoverUrl(comic.coverImage);

            return (
              <div
                key={comic.id}
                onClick={() => {
                  if (isCenter) {
                    onSelectComic(comic);
                  } else {
                    setActiveIndex(index);
                  }
                }}
                style={{
                  transform: `translateX(${translateX}px) translateZ(${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`,
                  opacity,
                  zIndex,
                }}
                className={`absolute transition-all duration-300 ease-out cursor-pointer group ${
                  isFullscreen ? 'w-[210px] sm:w-[260px] lg:w-[290px]' : 'w-[185px] sm:w-[225px]'
                }`}
              >
                {/* Main Comic Cover Card */}
                <div
                  className={`relative w-full aspect-[2/3] rounded-xl overflow-hidden ${
                    isCenter
                      ? 'ring-2 ring-indigo-400/80 shadow-[0_24px_60px_-10px_rgba(99,102,241,0.55)]'
                      : 'border border-white/20 shadow-2xl group-hover:brightness-110'
                  }`}
                >
                  {slabGrade && (
                    <div className="absolute top-0 inset-x-0 z-10 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 text-slate-950 px-2 py-0.5 text-[10px] font-black flex items-center justify-between shadow-sm">
                      <span>{slabGrade.grade} {slabGrade.code}</span>
                      <span className="truncate max-w-[110px] uppercase">{comic.publisher}</span>
                    </div>
                  )}

                  <img
                    src={coverUrl}
                    alt={comic.title || 'Comic Cover'}
                    onError={handleImageError}
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    className="w-full h-full object-cover bg-slate-900"
                  />

                  {isCenter && <div className="comic-mylar-glare" />}
                  {showFoil && <div className="comic-holofoil-overlay" />}

                  {!isCenter && (
                    <div className="absolute inset-0 bg-slate-950/10 group-hover:bg-transparent transition-colors" />
                  )}
                </div>

                {/* Glossy Floor Mirror Reflection (tracks 3D perspective & rotation) */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none select-none relative w-full h-20 sm:h-24 mt-1.5 rounded-t-xl overflow-hidden"
                  style={{
                    WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.58) 0%, rgba(0,0,0,0.22) 45%, transparent 100%)',
                    maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.58) 0%, rgba(0,0,0,0.22) 45%, transparent 100%)',
                  }}
                >
                  <img
                    src={coverUrl}
                    alt=""
                    onError={handleImageError}
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    className="absolute top-0 left-0 w-full aspect-[2/3] object-cover opacity-70 blur-[0.6px] saturate-125"
                    style={{ transform: 'scaleY(-1)' }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Focused Issue Metadata & Quick Action Bar */}
      <div className="relative z-10 px-4 sm:px-6 pb-5 pt-2 space-y-4">
        <div className="bg-white/8 backdrop-blur-md border border-white/12 rounded-2xl p-3.5 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base sm:text-lg font-black text-white truncate">
                {activeComic.title || activeComic.fullTitle || activeComic.seriesName || 'Untitled Comic'}{' '}
                <span className="text-indigo-300">#{activeComic.issueNumber}</span>
              </h3>
              {activeEstNum !== null && (
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-400/35 text-emerald-300 text-xs font-black">
                  ${activeEstNum.toFixed(2)}
                </span>
              )}
              {activeComic.userRating ? (
                <span className="inline-flex items-center gap-0.5 text-xs font-bold text-amber-300">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  {activeComic.userRating}
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-300 mt-1">
              <span>{activeComic.publisher || 'Unknown Publisher'}</span>
              <span>•</span>
              <span>{formatPublicationDate(activeComic.publicationYear, activeComic.publicationMonth)}</span>
              {activeComic.condition && (
                <>
                  <span>•</span>
                  <span className="text-amber-200 font-semibold">{activeComic.condition}</span>
                </>
              )}
              <span>•</span>
              <span className="inline-flex items-center gap-1 text-sky-300 font-semibold">
                <Boxes className="w-3 h-3" />
                {activeComic.readingStatus === 'Wishlist' || activeComic.currentBoxId < 0
                  ? 'Wishlist'
                  : activeComic.currentBoxId === 0
                  ? 'Box #0 (Staging)'
                  : `Box #${activeComic.currentBoxId}${activeBox ? ` (${activeBox.name})` : ''}`}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {activeComic.readingStatus !== 'Wishlist' && (
              <button
                type="button"
                onClick={() => {
                  const nextMap: Record<string, ComicBook['readingStatus']> = {
                    Unread: 'Reading',
                    Reading: 'Read',
                    Read: 'Unread',
                  };
                  onQuickStatusChange(activeComic.id, nextMap[activeComic.readingStatus] || 'Read');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activeComic.readingStatus === 'Read'
                    ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200 hover:bg-emerald-500/30'
                    : activeComic.readingStatus === 'Reading'
                    ? 'bg-amber-500/20 border-amber-400/40 text-amber-200 hover:bg-amber-500/30'
                    : 'bg-white/10 border-white/15 text-slate-200 hover:bg-white/20'
                }`}
              >
                {activeComic.readingStatus === 'Read' ? (
                  <CheckCircle className="w-3.5 h-3.5" />
                ) : activeComic.readingStatus === 'Reading' ? (
                  <Clock className="w-3.5 h-3.5" />
                ) : (
                  <BookOpen className="w-3.5 h-3.5" />
                )}
                <span>{activeComic.readingStatus}</span>
              </button>
            )}

            {activeComic.coverImageFull && onOpenFullArt && (
              <button
                type="button"
                onClick={() => onOpenFullArt(activeComic)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-purple-600/80 hover:bg-purple-500 text-white inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Full Art</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onSelectComic(activeComic)}
              className="px-3.5 py-1.5 rounded-lg text-xs font-extrabold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Inspect Dossier</span>
            </button>
          </div>
        </div>

        {/* Bottom Scrubber Bar */}
        {comics.length > 1 && (
          <div className="flex items-center gap-3 px-1">
            <span className="text-[11px] font-mono text-slate-400 shrink-0">#1</span>
            <input
              type="range"
              min={0}
              max={comics.length - 1}
              value={safeIndex}
              onChange={(e) => setActiveIndex(Number(e.target.value))}
              aria-label="Scrub through longbox covers"
              className="w-full accent-indigo-500 h-1.5 bg-white/15 rounded-lg cursor-pointer"
            />
            <span className="text-[11px] font-mono text-slate-400 shrink-0">
              #{comics.length}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
