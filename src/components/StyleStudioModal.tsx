import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ComicBook } from '../types';
import {
  DEFAULT_UI_STYLE_PREFS,
  getSlabNumericGradeLabel,
  HolofoilMode,
  MotionIntensity,
  UI_THEME_SKINS,
  UiStylePreferences,
  UiThemeSkin,
} from '../utils/uiThemeConfig';
import { getComicCoverUrl, handleImageError } from '../utils/imageUtils';
import { ComicActionBurstItem } from './ComicActionBurstOverlay';
import {
  X,
  Palette,
  Sparkles,
  Check,
  RotateCcw,
  Zap,
  Layers,
  Shield,
  Boxes,
  Star,
  Play,
} from 'lucide-react';

interface StyleStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  prefs: UiStylePreferences;
  onUpdatePrefs: (next: UiStylePreferences) => void;
  onTriggerBurst: (burst: Omit<ComicActionBurstItem, 'id'>) => void;
  sampleComics?: ComicBook[];
}

export const StyleStudioModal: React.FC<StyleStudioModalProps> = ({
  isOpen,
  onClose,
  prefs,
  onUpdatePrefs,
  onTriggerBurst,
  sampleComics = [],
}) => {
  const [isSandboxTilting, setIsSandboxTilting] = useState(false);
  const [sandboxTiltStyle, setSandboxTiltStyle] = useState<React.CSSProperties>({});
  const [springDemoKey, setSpringDemoKey] = useState(0);

  // Pick a great showcase comic from the user's collection (or fallback demo issue)
  const demoComic = useMemo(() => {
    const withCoverAndValue = sampleComics.find(
      (c) =>
        c.coverImage &&
        !c.coverImage.toLowerCase().includes('noimage') &&
        (c.estimatedValue || 0) > 0
    );
    const anyWithCover = sampleComics.find(
      (c) => c.coverImage && !c.coverImage.toLowerCase().includes('noimage')
    );
    const chosen = withCoverAndValue || anyWithCover || sampleComics[0];
    return {
      title: chosen?.title || 'The Amazing Spider-Man',
      issueNumber: chosen?.issueNumber || '300',
      publisher: chosen?.publisher || 'Marvel Comics',
      publicationYear: chosen?.publicationYear || 1988,
      condition: chosen?.condition || 'Near Mint',
      estimatedValue: chosen?.estimatedValue || 450.0,
      coverImage: chosen?.coverImage || 'NoImage.webp',
      currentBoxId: chosen?.currentBoxId || 1,
      sizeThickness: chosen?.sizeThickness || 1.0,
      tags: chosen?.tags || ['CGC 9.8', 'Key Issue'],
    };
  }, [sampleComics]);

  const slabGrade = useMemo(
    () => getSlabNumericGradeLabel(demoComic.condition, demoComic.tags),
    [demoComic]
  );

  if (!isOpen) return null;

  const handleSelectSkin = (skin: UiThemeSkin) => {
    onUpdatePrefs({ ...prefs, skin });
  };

  const handleSandboxPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!prefs.enable3DTilt) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const py = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const rx = ((0.5 - py) * 18).toFixed(2);
    const ry = ((px - 0.5) * 18).toFixed(2);
    const gx = `${Math.round(px * 100)}%`;
    const gy = `${Math.round(py * 100)}%`;

    setIsSandboxTilting(true);
    setSandboxTiltStyle({
      '--rx': `${rx}deg`,
      '--ry': `${ry}deg`,
      '--glare-x': gx,
      '--glare-y': gy,
    } as React.CSSProperties);
  };

  const handleSandboxPointerLeave = () => {
    setIsSandboxTilting(false);
    setSandboxTiltStyle({});
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden my-6 text-slate-900 dark:text-slate-100 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-400">
              <Palette className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base sm:text-lg text-slate-900 dark:text-white flex items-center gap-2">
                <span>Comic Style & Motion FX Studio</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  Live Switcher
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Swap between Modern Vault, Four-Color Pulp, Graded Slab Museum & Neon 2099 skins with 3D Mylar/Holofoil shaders
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onUpdatePrefs({ ...DEFAULT_UI_STYLE_PREFS })}
              title="Reset to Default Modern Vault UI"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Reset Default</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Style Studio Modal"
              className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-6 flex-1">
          {/* 1. Theme Skin Picker Grid */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                1. Choose Interface Theme Skin
              </h3>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Works in both Light & Dark modes
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {UI_THEME_SKINS.map((skinItem) => {
                const isSelected = prefs.skin === skinItem.id;
                return (
                  <button
                    key={skinItem.id}
                    type="button"
                    onClick={() => handleSelectSkin(skinItem.id)}
                    aria-pressed={isSelected}
                    className={`text-left p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between relative overflow-hidden ${
                      isSelected
                        ? 'border-indigo-600 dark:border-indigo-400 ring-2 ring-indigo-500/30 bg-indigo-50/40 dark:bg-indigo-950/30'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-700 bg-white dark:bg-slate-900'
                    }`}
                  >
                    <div>
                      <div
                        className={`h-8 w-full rounded-lg bg-gradient-to-r ${skinItem.accentPreviewClass} mb-2.5 flex items-center justify-between px-2.5 text-white text-[10px] font-extrabold shadow-xs`}
                      >
                        <span>{skinItem.badgeText}</span>
                        {isSelected && (
                          <span className="bg-white text-slate-900 rounded-full p-0.5">
                            <Check className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                      <div className="font-bold text-sm text-slate-900 dark:text-white">
                        {skinItem.name}
                      </div>
                      <div className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 mb-1.5">
                        {skinItem.subtitle}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                        {skinItem.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Interactive Sandbox + Granular FX Controls */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Left: Interactive 3D & Holofoil Demo Sandbox */}
            <div className="lg:col-span-5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col items-center space-y-3">
              <div className="w-full flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>Interactive FX Preview</span>
                </span>
                <span className="text-[10px] font-normal text-slate-400">
                  Hover card to test 3D & Foil
                </span>
              </div>

              {/* Sandbox Card wrapped in live Spring Physics preview */}
              <motion.div
                key={`${prefs.motionIntensity}-${prefs.skin}-${springDemoKey}`}
                data-testid="sandbox-spring-preview"
                initial={
                  prefs.motionIntensity === 'off'
                    ? false
                    : prefs.motionIntensity === 'full'
                    ? { opacity: 0, scale: 0.76, y: 38, rotate: -5 }
                    : { opacity: 0, scale: 0.93, y: 14, rotate: 0 }
                }
                animate={{ opacity: 1, scale: 1, y: 0, rotate: 0 }}
                transition={
                  prefs.motionIntensity === 'off'
                    ? { duration: 0 }
                    : prefs.motionIntensity === 'full'
                    ? { type: 'spring', stiffness: 340, damping: 14, mass: 0.85 }
                    : { type: 'spring', stiffness: 420, damping: 30, mass: 0.9 }
                }
              >
              <div
                data-testid="style-studio-sandbox-card"
                onPointerMove={handleSandboxPointerMove}
                onPointerLeave={handleSandboxPointerLeave}
                data-tilting={isSandboxTilting ? 'true' : 'false'}
                style={sandboxTiltStyle}
                className="comic-tilt-wrapper comic-card-theme group w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-md cursor-pointer select-none"
              >
                {/* Graded Slab Header (Shown when skin === 'slab') */}
                {prefs.skin === 'slab' && (
                  <div
                    data-testid="sandbox-slab-header"
                    className="mb-1.5 px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white border border-amber-400/60 shadow-xs flex items-center justify-between gap-1.5"
                  >
                    <div className="min-w-0">
                      <div className="text-[8px] uppercase tracking-widest text-amber-300 font-extrabold truncate">
                        {demoComic.publisher} • {demoComic.publicationYear}
                      </div>
                      <div className="text-[10px] font-black truncate">
                        {demoComic.title} #{demoComic.issueNumber}
                      </div>
                    </div>
                    <div className="px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 font-black text-[10px] shrink-0 shadow-xs">
                      {slabGrade.grade} {slabGrade.code}
                    </div>
                  </div>
                )}

                {/* Cover Container */}
                <div className="relative aspect-[2/3] bg-slate-100 dark:bg-slate-800 overflow-hidden rounded-lg">
                  <img
                    src={getComicCoverUrl(demoComic.coverImage)}
                    alt={demoComic.title}
                    onError={handleImageError}
                    className="w-full h-full object-cover"
                  />

                  {/* Mylar Bag Glare */}
                  {prefs.enable3DTilt && <div className="comic-mylar-glare" />}

                  {/* Chromium Holofoil Shimmer */}
                  {prefs.holofoilMode !== 'off' && <div className="comic-holofoil-overlay" />}

                  <div className="comic-caption-badge absolute top-2 left-2 bg-white/95 dark:bg-slate-900/95 text-slate-900 dark:text-white text-[10px] font-bold px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 flex items-center gap-1">
                    <Layers className="w-3 h-3 text-indigo-500" />
                    <span>{demoComic.sizeThickness.toFixed(1)}x</span>
                  </div>

                  <div className="comic-caption-badge absolute top-2 right-2 bg-slate-900 text-white text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                    <Boxes className="w-3 h-3 text-amber-400" />
                    <span>Box {demoComic.currentBoxId}</span>
                  </div>

                  <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                    <span className="comic-caption-badge text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
                      Read
                    </span>
                    <span className="flex items-center gap-0.5 bg-white/95 dark:bg-slate-900/95 text-amber-500 text-[10px] font-bold px-1.5 py-0.5 rounded-md border border-slate-200 dark:border-slate-700">
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400" />5
                    </span>
                  </div>
                </div>

                {/* Card Footer */}
                <div className="p-2.5 flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800 dark:text-slate-100 truncate">
                    {demoComic.title} #{demoComic.issueNumber}
                  </span>
                  <span className="font-extrabold text-emerald-700 dark:text-emerald-400 shrink-0 ml-1">
                    ${demoComic.estimatedValue.toFixed(2)}
                  </span>
                </div>
              </div>
              </motion.div>

              {/* Demo Action Stamp Buttons */}
              <div className="w-full pt-1 space-y-1.5">
                <div className="text-[10px] font-bold text-center text-slate-500 dark:text-slate-400">
                  Test Comic Action Stamps:
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      onTriggerBurst({
                        text: 'POW! ⚡',
                        subtext: 'Action FX Active',
                        variant: 'pow',
                      })
                    }
                    className="px-2 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-extrabold uppercase tracking-wide shadow-xs cursor-pointer transition-transform active:scale-95"
                  >
                    POW! ⚡
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onTriggerBurst({
                        text: 'COLLECTED! 💥',
                        subtext: 'Vault Updated',
                        variant: 'collected',
                      })
                    }
                    className="px-2 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[10px] font-extrabold uppercase tracking-wide shadow-xs cursor-pointer transition-transform active:scale-95"
                  >
                    COLLECTED!
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onTriggerBurst({
                        text: 'EXCELSIOR! 🏆',
                        subtext: '100% Series Run',
                        variant: 'excelsior',
                      })
                    }
                    className="px-2 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-[10px] font-extrabold uppercase tracking-wide shadow-xs cursor-pointer transition-transform active:scale-95"
                  >
                    EXCELSIOR!
                  </button>
                </div>
              </div>
            </div>

            {/* Right: Granular Motion & Shader Controls */}
            <div className="lg:col-span-7 space-y-3.5">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                2. Configure Shaders & Dynamic Motion
              </h3>

              {/* 3D Perspective Tilt & Mylar Glare */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <Shield className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white">
                      3D Perspective Card Tilt & Mylar Bag Glare
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Tilts hovered comic covers in 3D space with a realistic bagged-and-boarded Mylar reflection
                    </p>
                  </div>
                </div>
                <label className="inline-flex items-center gap-2 cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={prefs.enable3DTilt}
                    onChange={(e) =>
                      onUpdatePrefs({ ...prefs, enable3DTilt: e.target.checked })
                    }
                    aria-label="3D Perspective Card Tilt"
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {prefs.enable3DTilt ? 'Enabled' : 'Off'}
                  </span>
                </label>
              </div>

              {/* Chromium Holofoil Shimmer Mode */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      90s Chromium Holofoil Shimmer Shader
                    </span>
                  </div>
                  <select
                    value={prefs.holofoilMode}
                    onChange={(e) =>
                      onUpdatePrefs({
                        ...prefs,
                        holofoilMode: e.target.value as HolofoilMode,
                      })
                    }
                    aria-label="Chromium Holofoil Shimmer Mode"
                    className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100"
                  >
                    <option value="keys">Key Issues ($25+), Issue #1, Mint & Graded</option>
                    <option value="all">All Comic Cards</option>
                    <option value="off">Off</option>
                  </select>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Adds an iridescent rainbow foil diffraction sweep across qualifying comic covers on hover.
                </p>
              </div>

              {/* Comic Action Stamps */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <Zap className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white">
                      Comic Action Stamps & Halftone Bursts
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Pops a celebratory comic starburst ("READ! ★", "COLLECTED! 💥") when updating reading status or bagging wishlist items
                    </p>
                  </div>
                </div>
                <label className="inline-flex items-center gap-2 cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={prefs.enableActionStamps}
                    onChange={(e) =>
                      onUpdatePrefs({ ...prefs, enableActionStamps: e.target.checked })
                    }
                    aria-label="Comic Action Stamps"
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {prefs.enableActionStamps ? 'Enabled' : 'Off'}
                  </span>
                </label>
              </div>

              {/* Page & Panel Motion Intensity */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                    Panel Transitions & Motion Intensity
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Controls spring-physics transitions when switching tabs, opening modals, and previewing cards
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={prefs.motionIntensity}
                    onChange={(e) => {
                      onUpdatePrefs({
                        ...prefs,
                        motionIntensity: e.target.value as MotionIntensity,
                      });
                      setSpringDemoKey((prev) => prev + 1);
                    }}
                    aria-label="Motion Intensity"
                    className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100"
                  >
                    <option value="full">Full Comic Motion</option>
                    <option value="subtle">Subtle Transitions</option>
                    <option value="off">Reduced / Instant</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setSpringDemoKey((prev) => prev + 1)}
                    title="Replay the spring-physics transition on the preview card"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold shadow-xs cursor-pointer transition-transform active:scale-95"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>Preview</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
