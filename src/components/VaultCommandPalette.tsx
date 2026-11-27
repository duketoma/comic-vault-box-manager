import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ComicBook, StorageBox } from '../types';
import { getComicCoverUrl, handleImageError } from '../utils/imageUtils';
import { UI_THEME_SKINS, UiThemeSkin } from '../utils/uiThemeConfig';
import {
  Search,
  X,
  Boxes,
  Palette,
  Camera,
  PlusCircle,
  TrendingUp,
  Cloud,
  Trophy,
  BarChart3,
  ShoppingCart,
  BookOpen,
  CornerDownLeft,
  Sparkles,
  Sun,
  Moon,
} from 'lucide-react';

export interface VaultCommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  comics: ComicBook[];
  boxes: StorageBox[];
  activeSkin: UiThemeSkin;
  darkMode: boolean;
  onSelectComic: (comic: ComicBook) => void;
  onNavigateTab: (tab: 'catalog' | 'boxes' | 'challenge' | 'stats' | 'sheets' | 'database' | 'shopping') => void;
  onSelectSkin: (skin: UiThemeSkin) => void;
  onToggleDarkMode: () => void;
  onOpenAddModal: () => void;
  onOpenScanModal: () => void;
  onOpenValuationModal: () => void;
  onOpenDriveModal: () => void;
  onOpenStyleStudioModal: () => void;
}

interface PaletteItem {
  id: string;
  group: 'Comics' | 'Storage Boxes' | 'Theme Skins' | 'Quick Actions';
  title: string;
  subtitle?: string;
  badge?: string;
  coverImage?: string;
  icon?: React.ReactNode;
  onSelect: () => void;
}

export const VaultCommandPalette: React.FC<VaultCommandPaletteProps> = ({
  isOpen,
  onClose,
  comics,
  boxes,
  activeSkin,
  darkMode,
  onSelectComic,
  onNavigateTab,
  onSelectSkin,
  onToggleDarkMode,
  onOpenAddModal,
  onOpenScanModal,
  onOpenValuationModal,
  onOpenDriveModal,
  onOpenStyleStudioModal,
}) => {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  const items = useMemo<PaletteItem[]>(() => {
    const q = query.trim().toLowerCase();
    const results: PaletteItem[] = [];

    // 1. Matching Comics (up to 6)
    if (q.length > 0) {
      let matched = 0;
      for (let i = 0; i < comics.length && matched < 6; i++) {
        const c = comics[i];
        if (!c) continue;
        const hay = `${c.title || ''} ${c.seriesName || ''} ${c.issueNumber || ''} ${c.publisher || ''} ${c.writer || ''} ${c.artist || ''}`.toLowerCase();
        if (hay.includes(q)) {
          const estNum = c.estimatedValue != null && !Number.isNaN(Number(c.estimatedValue)) ? Number(c.estimatedValue) : null;
          results.push({
            id: `comic-${c.id}`,
            group: 'Comics',
            title: `${c.title || c.fullTitle || c.seriesName || 'Untitled'} #${c.issueNumber}`,
            subtitle: `${c.publisher || 'Unknown'}${c.publicationYear ? ` • ${c.publicationYear}` : ''} • ${
              c.readingStatus === 'Wishlist' || c.currentBoxId < 0
                ? 'Wishlist'
                : c.currentBoxId === 0
                ? 'Box #0'
                : `Box #${c.currentBoxId}`
            }`,
            badge: estNum !== null ? `$${estNum.toFixed(2)}` : undefined,
            coverImage: c.coverImage,
            onSelect: () => {
              onClose();
              onSelectComic(c);
            },
          });
          matched++;
        }
      }
    }

    // 2. Quick Actions
    const actions: PaletteItem[] = [
      {
        id: 'action-add',
        group: 'Quick Actions',
        title: 'Add New Comic',
        subtitle: 'Manually log a new issue to your vault',
        icon: <PlusCircle className="w-4 h-4 text-emerald-400" />,
        onSelect: () => {
          onClose();
          onOpenAddModal();
        },
      },
      {
        id: 'action-scan',
        group: 'Quick Actions',
        title: 'Open Cover Scanner & OCR',
        subtitle: 'Scan barcode or snap cover art with camera',
        icon: <Camera className="w-4 h-4 text-sky-400" />,
        onSelect: () => {
          onClose();
          onOpenScanModal();
        },
      },
      {
        id: 'action-valuation',
        group: 'Quick Actions',
        title: 'Update Market Values',
        subtitle: 'Refresh estimated values across your collection',
        icon: <TrendingUp className="w-4 h-4 text-emerald-400" />,
        onSelect: () => {
          onClose();
          onOpenValuationModal();
        },
      },
      {
        id: 'action-style',
        group: 'Quick Actions',
        title: 'Open Style Studio',
        subtitle: 'Customize skins, 3D tilt, holofoil & motion',
        icon: <Palette className="w-4 h-4 text-fuchsia-400" />,
        onSelect: () => {
          onClose();
          onOpenStyleStudioModal();
        },
      },
      {
        id: 'action-darkmode',
        group: 'Quick Actions',
        title: darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode',
        subtitle: 'Toggle light and dark archival themes',
        icon: darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-400" />,
        onSelect: () => {
          onClose();
          onToggleDarkMode();
        },
      },
      {
        id: 'action-drive',
        group: 'Quick Actions',
        title: 'Sync Google Drive Covers',
        subtitle: 'Match high-res cover images from Drive',
        icon: <Cloud className="w-4 h-4 text-blue-400" />,
        onSelect: () => {
          onClose();
          onOpenDriveModal();
        },
      },
      {
        id: 'nav-catalog',
        group: 'Quick Actions',
        title: 'Go to Collection Catalog',
        subtitle: 'Browse, filter, and flip through comics',
        icon: <BookOpen className="w-4 h-4 text-indigo-400" />,
        onSelect: () => {
          onClose();
          onNavigateTab('catalog');
        },
      },
      {
        id: 'nav-boxes',
        group: 'Quick Actions',
        title: 'Go to Storage Box Manager',
        subtitle: 'Inspect shortboxes, capacity & 3D Box View',
        icon: <Boxes className="w-4 h-4 text-amber-400" />,
        onSelect: () => {
          onClose();
          onNavigateTab('boxes');
        },
      },
      {
        id: 'nav-challenge',
        group: 'Quick Actions',
        title: 'Go to Reading Challenge',
        subtitle: 'Track milestones and reading queues',
        icon: <Trophy className="w-4 h-4 text-amber-400" />,
        onSelect: () => {
          onClose();
          onNavigateTab('challenge');
        },
      },
      {
        id: 'nav-stats',
        group: 'Quick Actions',
        title: 'Go to Reading Stats & Analytics',
        subtitle: 'Explore events, series runs, creators & cast',
        icon: <BarChart3 className="w-4 h-4 text-cyan-400" />,
        onSelect: () => {
          onClose();
          onNavigateTab('stats');
        },
      },
      {
        id: 'nav-shopping',
        group: 'Quick Actions',
        title: 'Go to Wishlist Shopping List',
        subtitle: 'Review missing issues to hunt at the LCS',
        icon: <ShoppingCart className="w-4 h-4 text-rose-400" />,
        onSelect: () => {
          onClose();
          onNavigateTab('shopping');
        },
      },
    ];

    for (const act of actions) {
      if (!q || `${act.title} ${act.subtitle || ''}`.toLowerCase().includes(q)) {
        results.push(act);
      }
    }

    // 3. Storage Boxes
    const matchingBoxes = boxes
      .filter((b) => b.id >= 0 && (!q || `box ${b.id} ${b.name} ${b.location}`.toLowerCase().includes(q)))
      .slice(0, 4);
    for (const box of matchingBoxes) {
      results.push({
        id: `box-${box.id}`,
        group: 'Storage Boxes',
        title: `Box #${box.id}: ${box.name}`,
        subtitle: `${box.location} • Max ${box.maxCapacity} units`,
        icon: <Boxes className="w-4 h-4 text-indigo-400" />,
        onSelect: () => {
          onClose();
          onNavigateTab('boxes');
        },
      });
    }

    // 4. Theme Skins
    for (const skin of UI_THEME_SKINS) {
      if (!q || `skin theme ${skin.name} ${skin.subtitle} ${skin.badgeText}`.toLowerCase().includes(q)) {
        results.push({
          id: `skin-${skin.id}`,
          group: 'Theme Skins',
          title: `Switch Skin → ${skin.name}`,
          subtitle: skin.subtitle,
          badge: activeSkin === skin.id ? 'Active' : undefined,
          icon: <Sparkles className="w-4 h-4 text-amber-400" />,
          onSelect: () => {
            onSelectSkin(skin.id);
            onClose();
          },
        });
      }
    }

    return results;
  }, [
    query,
    comics,
    boxes,
    activeSkin,
    darkMode,
    onClose,
    onSelectComic,
    onNavigateTab,
    onSelectSkin,
    onToggleDarkMode,
    onOpenAddModal,
    onOpenScanModal,
    onOpenValuationModal,
    onOpenDriveModal,
    onOpenStyleStudioModal,
  ]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!isOpen) return null;

  const safeIdx = items.length > 0 ? Math.min(activeIndex, items.length - 1) : 0;

  // Group items preserving order
  const groups: { name: PaletteItem['group']; entries: { item: PaletteItem; flatIndex: number }[] }[] = [];
  items.forEach((item, flatIndex) => {
    let g = groups.find((x) => x.name === item.group);
    if (!g) {
      g = { name: item.group, entries: [] };
      groups.push(g);
    }
    g.entries.push({ item, flatIndex });
  });

  return (
    <div
      data-testid="vault-command-palette"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-sm flex items-start justify-center pt-[10vh] px-3 sm:px-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Vault Command Palette"
        className="w-full max-w-xl bg-slate-900/95 text-slate-100 border border-indigo-500/40 rounded-2xl shadow-[0_24px_70px_-12px_rgba(79,70,229,0.5)] overflow-hidden flex flex-col max-h-[75vh]"
      >
        {/* Search Input Header */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-800">
          <Search className="w-4 h-4 text-indigo-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIndex((prev) => (items.length > 0 ? (prev + 1) % items.length : 0));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIndex((prev) => (items.length > 0 ? (prev - 1 + items.length) % items.length : 0));
              } else if (e.key === 'Enter' && items[safeIdx]) {
                e.preventDefault();
                items[safeIdx].onSelect();
              }
            }}
            placeholder="Search comics, boxes, skins, or actions..."
            className="flex-1 bg-transparent text-sm text-white placeholder-slate-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close command palette"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Grouped Results List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-3 scrollbar-thin">
          {items.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">
              No comics, boxes, or actions matching &ldquo;{query}&rdquo;
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.name} className="space-y-1">
                <div className="px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  {group.name}
                </div>
                {group.entries.map(({ item, flatIndex }) => {
                  const isActive = flatIndex === safeIdx;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onMouseEnter={() => setActiveIndex(flatIndex)}
                      onClick={item.onSelect}
                      className={`w-full flex items-center justify-between gap-3 px-2.5 py-2 rounded-xl text-left transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-indigo-600/30 border border-indigo-400/50 text-white'
                          : 'border border-transparent text-slate-200 hover:bg-slate-800/80'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {item.coverImage ? (
                          <img
                            src={getComicCoverUrl(item.coverImage)}
                            alt=""
                            onError={handleImageError}
                            referrerPolicy="no-referrer"
                            className="w-7 h-10 object-cover rounded shadow-xs border border-white/15 shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                            {item.icon}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="text-xs font-bold truncate">{item.title}</div>
                          {item.subtitle && (
                            <div className="text-[11px] text-slate-400 truncate">{item.subtitle}</div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {item.badge && (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-400/35 text-emerald-300 text-[10px] font-extrabold">
                            {item.badge}
                          </span>
                        )}
                        {isActive && <CornerDownLeft className="w-3.5 h-3.5 text-indigo-300" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer Hints */}
        <div className="px-4 py-2 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 font-mono">↑↓</kbd> Navigate
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 font-mono">Enter</kbd> Select
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 font-mono">Esc</kbd> Close
            </span>
          </div>
          <span className="font-semibold text-indigo-400">Vault Command Palette</span>
        </div>
      </div>
    </div>
  );
};
