import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ComicBook, ReadingStatus, StorageBox, SeriesIssueTotal } from './types';
import { DEFAULT_BOXES, INITIAL_COMICS, isSampleComicId } from './data/initialData';
import { Navbar } from './components/Navbar';
import { CollectionCatalog } from './components/CollectionCatalog';
import { BoxManager } from './components/BoxManager';
import { ReadingStats } from './components/ReadingStats';
import { GoogleSheetsImporter } from './components/GoogleSheetsImporter';
import { DatabasePlanner } from './components/DatabasePlanner';
import { WishlistShoppingList } from './components/WishlistShoppingList';
import { AddAndScanModal } from './components/AddAndScanModal';
import { ComicDetailModal } from './components/ComicDetailModal';
import { GoogleDriveCoversModal } from './components/GoogleDriveCoversModal';
import { DataManagementModal } from './components/DataManagementModal';
import { GenerateSeriesWishlistModal } from './components/GenerateSeriesWishlistModal';
import { MobileBottomNav } from './components/MobileBottomNav';
import { ServerSettingsModal } from './components/ServerSettingsModal';
import { ReadingChallengeView } from './components/reading-challenge/ReadingChallengeView';
import {
  deleteLocalBoxAndEnqueue,
  deleteLocalComicAndEnqueue,
  loadLocalSnapshot,
  LocalDbSnapshot,
  replaceAllLocalComicsAndEnqueue,
  saveLocalBoxAndEnqueue,
  saveLocalComicAndEnqueue,
  saveLocalComicsBatchAndEnqueue,
  SyncMutation,
} from './services/localDbService';
import { performBidirectionalSync, SyncStatusState } from './services/syncService';
import { sortBoxes } from './utils/boxUtils';
import { getSeriesOverviewSummary } from './utils/seriesUtils';

export default function App() {
  const [activeTab, setActiveTab] = useState<'catalog' | 'boxes' | 'challenge' | 'stats' | 'sheets' | 'database' | 'shopping'>('catalog');
  const [isLoadingCollection, setIsLoadingCollection] = useState<boolean>(true);
  const [statsSubTab, setStatsSubTab] = useState<'events' | 'series' | 'creators' | 'achievements' | 'general'>('events');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const handleSetActiveTab = (tab: 'catalog' | 'boxes' | 'challenge' | 'stats' | 'sheets' | 'database' | 'shopping') => {
    setActiveTab(tab);
  };

  // Dark Mode State with LocalStorage Persistence and system preference fallback
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('comic_vault_theme');
    if (saved) return saved === 'dark';
    return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('comic_vault_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('comic_vault_theme', 'light');
    }
  }, [darkMode]);

  const handleToggleDarkMode = () => setDarkMode((prev) => !prev);

  // Initial state falls back to localStorage / defaults until IndexedDB snapshot hydrates (<100ms)
  const [boxes, setBoxes] = useState<StorageBox[]>(() => {
    const saved = localStorage.getItem('comic_vault_boxes');
    return sortBoxes(saved ? JSON.parse(saved) : DEFAULT_BOXES);
  });

  const [comics, setComics] = useState<ComicBook[]>(() => {
    const saved = localStorage.getItem('comic_vault_comics');
    const parsed: ComicBook[] = saved ? JSON.parse(saved) : INITIAL_COMICS;
    return parsed
      .filter((c) => !isSampleComicId(c.id))
      .map((c) => (c.readingStatus === 'Wishlist' ? { ...c, copiesOwned: 0 } : c));
  });

  const [seriesTotals, setSeriesTotals] = useState<SeriesIssueTotal[]>(() => {
    const saved = localStorage.getItem('comic_vault_series_totals');
    return saved ? JSON.parse(saved) : [];
  });

  const [creatorTypes, setCreatorTypes] = useState<string[]>([]);

  // Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [initialScanMode, setInitialScanMode] = useState<boolean>(false);
  const [isGenerateWishlistModalOpen, setIsGenerateWishlistModalOpen] = useState<boolean>(false);
  const [generateWishlistSeriesName, setGenerateWishlistSeriesName] = useState<string>('');
  const [selectedComic, setSelectedComic] = useState<ComicBook | null>(null);
  const [selectedSeriesFilter, setSelectedSeriesFilter] = useState<string>('all');
  const [isDriveModalOpen, setIsDriveModalOpen] = useState<boolean>(false);
  const [isDataModalOpen, setIsDataModalOpen] = useState<boolean>(false);
  const [isServerModalOpen, setIsServerModalOpen] = useState<boolean>(false);

  const [syncStatus, setSyncStatus] = useState<SyncStatusState>({
    connectionState: 'online',
    pendingCount: 0,
    pendingOutbox: [],
    lastSyncAt: null,
    lastSyncError: null,
    lastSyncSummary: null,
  });
  const [syncToast, setSyncToast] = useState<string | null>(null);

  const handleOpenGenerateWishlistModal = (seriesName?: string) => {
    setGenerateWishlistSeriesName(seriesName || '');
    setIsGenerateWishlistModalOpen(true);
  };

  const handleViewSeriesInCatalog = (seriesName: string) => {
    setSelectedSeriesFilter(seriesName);
    handleSetActiveTab('catalog');
  };

  const applyLocalSnapshotToState = useCallback((snapshot: LocalDbSnapshot) => {
    if (snapshot.boxes.length > 0) setBoxes(snapshot.boxes);
    if (snapshot.seriesTotals.length > 0) setSeriesTotals(snapshot.seriesTotals);
    if (snapshot.creatorTypes.length > 0) setCreatorTypes(snapshot.creatorTypes);
    setComics(snapshot.comics);
    setSyncStatus((prev) => ({
      ...prev,
      pendingCount: snapshot.outbox.length,
      pendingOutbox: snapshot.outbox,
      lastSyncAt: snapshot.lastSyncAt,
    }));
  }, []);

  const updateOutboxStatus = useCallback((outbox: SyncMutation[]) => {
    setSyncStatus((prev) => ({
      ...prev,
      pendingCount: outbox.length,
      pendingOutbox: outbox,
    }));
  }, []);

  const triggerSync = useCallback(
    async (options?: { forceFull?: boolean }) => {
      const result = await performBidirectionalSync({
        forceFull: options?.forceFull,
        onStatusChange: (partial) => {
          setSyncStatus((prev) => ({ ...prev, ...partial }));
        },
        onSnapshotUpdated: (snapshot, summary) => {
          applyLocalSnapshotToState(snapshot);
          if (summary && (summary.includes('Pushed') || summary.includes('Synced') || summary.includes('Pulled'))) {
            setSyncToast(summary);
          }
        },
      });
      return result;
    },
    [applyLocalSnapshotToState]
  );

  // Auto-dismiss sync toast after 4 seconds
  useEffect(() => {
    if (!syncToast) return;
    const t = setTimeout(() => setSyncToast(null), 4000);
    return () => clearTimeout(t);
  }, [syncToast]);

  // 1. Hydrate immediately from IndexedDB on startup, then run bidirectional Wi-Fi sync
  useEffect(() => {
    let active = true;
    setIsLoadingCollection(true);

    loadLocalSnapshot()
      .then((localSnapshot) => {
        if (!active) return;
        applyLocalSnapshotToState(localSnapshot);
        if (localSnapshot.comics.length > 0) {
          setIsLoadingCollection(false);
        }
        return triggerSync();
      })
      .finally(() => {
        if (active) setIsLoadingCollection(false);
      });

    return () => {
      active = false;
    };
  }, [applyLocalSnapshotToState, triggerSync]);

  // 2. Auto-sync when returning to Wi-Fi / online or unlocking mobile screen
  useEffect(() => {
    const handleOnline = () => {
      void triggerSync();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void triggerSync();
      }
    };

    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [triggerSync]);

  // 3. Background heartbeat poll when offline or when pending offline mutations exist
  useEffect(() => {
    if (syncStatus.connectionState !== 'offline' && syncStatus.pendingCount === 0) return;
    const interval = setInterval(() => {
      void triggerSync();
    }, 15000);
    return () => clearInterval(interval);
  }, [syncStatus.connectionState, syncStatus.pendingCount, triggerSync]);

  const refreshCollectionData = useCallback(() => {
    return triggerSync({ forceFull: false }).then(() => {});
  }, [triggerSync]);

  // Total Collection Metrics (In Collection vs Wishlist) - single-pass memoized calculation
  const { inCollectionComics, wishlistComics, totalThicknessUnits } = useMemo(() => {
    const inCol: ComicBook[] = [];
    const wish: ComicBook[] = [];
    let thickness = 0;
    for (const c of comics) {
      if (c.readingStatus === 'Wishlist') {
        wish.push(c);
      } else {
        inCol.push(c);
        thickness += c.sizeThickness || 1.0;
      }
    }
    return {
      inCollectionComics: inCol,
      wishlistComics: wish,
      totalThicknessUnits: thickness,
    };
  }, [comics]);

  const totalComicsCount = inCollectionComics.length;
  const wishlistCount = wishlistComics.length;

  // Handlers update the UI immediately, persist to IndexedDB + sync_outbox, and sync with PC when reachable.
  const handleAddComic = (newComic: ComicBook) => {
    const nowIso = new Date().toISOString();
    const cleanComic: ComicBook = {
      ...newComic,
      copiesOwned: newComic.readingStatus === 'Wishlist' ? 0 : newComic.copiesOwned,
      createdAt: newComic.createdAt || nowIso,
      updatedAt: nowIso,
    };
    setComics((prev) => [cleanComic, ...prev]);
    saveLocalComicAndEnqueue(cleanComic)
      .then(updateOutboxStatus)
      .then(() => triggerSync());
  };

  const handleBatchAddComics = async (newComics: ComicBook[]) => {
    const nowIso = new Date().toISOString();
    const cleanComics = newComics.map((c) => ({
      ...c,
      copiesOwned: c.readingStatus === 'Wishlist' ? 0 : c.copiesOwned,
      createdAt: c.createdAt || nowIso,
      updatedAt: nowIso,
    }));
    setComics((prev) => [...cleanComics, ...prev]);
    const outbox = await saveLocalComicsBatchAndEnqueue(cleanComics);
    updateOutboxStatus(outbox);
    void triggerSync();
  };

  const handleUpdateComic = (updatedComic: ComicBook) => {
    const existing = comics.find((c) => c.id === updatedComic.id);
    const nowIso = new Date().toISOString();
    const cleanComic: ComicBook = {
      ...updatedComic,
      copiesOwned: updatedComic.readingStatus === 'Wishlist' ? 0 : updatedComic.copiesOwned,
      updatedAt: nowIso,
    };
    setComics((prev) => prev.map((c) => (c.id === cleanComic.id ? cleanComic : c)));
    saveLocalComicAndEnqueue(cleanComic, existing?.readingStatus)
      .then(updateOutboxStatus)
      .then(() => triggerSync());
  };

  const handleUpdateAllComics = (updatedComics: ComicBook[]) => {
    const nowIso = new Date().toISOString();
    const existingMap = new Map<string, ComicBook>(comics.map((c) => [c.id, c]));
    const changedComics: ComicBook[] = [];

    const cleanList = updatedComics.map((c) => {
      const clean: ComicBook =
        c.readingStatus === 'Wishlist' ? { ...c, copiesOwned: 0 } : c;
      const prev = existingMap.get(clean.id);
      if (
        !prev ||
        prev.currentBoxId !== clean.currentBoxId ||
        prev.proposedBoxId !== clean.proposedBoxId ||
        prev.readingStatus !== clean.readingStatus ||
        prev.updatedAt !== clean.updatedAt
      ) {
        const stamped = { ...clean, updatedAt: nowIso };
        changedComics.push(stamped);
        return stamped;
      }
      return clean;
    });

    setComics(cleanList);
    if (changedComics.length > 0 && cleanList.length === comics.length) {
      saveLocalComicsBatchAndEnqueue(changedComics)
        .then(updateOutboxStatus)
        .then(() => triggerSync());
    } else {
      replaceAllLocalComicsAndEnqueue(cleanList)
        .then(updateOutboxStatus)
        .then(() => triggerSync());
    }
  };

  const handleDeleteComic = (comicId: string) => {
    const existing = comics.find((c) => c.id === comicId);
    const label = existing ? `${existing.title} #${existing.issueNumber}` : undefined;
    setComics((prev) => prev.filter((c) => c.id !== comicId));
    deleteLocalComicAndEnqueue(comicId, label)
      .then(updateOutboxStatus)
      .then(() => triggerSync());
  };

  const handleQuickStatusChange = (comicId: string, newStatus: ComicBook['readingStatus']) => {
    const existing = comics.find((c) => c.id === comicId);
    if (!existing) return;
    const nowIso = new Date().toISOString();
    const newCopies =
      newStatus === 'Wishlist' ? 0 : existing.copiesOwned && existing.copiesOwned > 0 ? existing.copiesOwned : 1;
    const updatedComic: ComicBook = {
      ...existing,
      readingStatus: newStatus,
      copiesOwned: newCopies,
      updatedAt: nowIso,
    };
    setComics((prev) => prev.map((c) => (c.id === comicId ? updatedComic : c)));
    saveLocalComicAndEnqueue(updatedComic, existing.readingStatus)
      .then(updateOutboxStatus)
      .then(() => triggerSync());
  };

  const handlePurchaseWishlistComics = async (comicIds: string[], targetBoxId?: number) => {
    const idSet = new Set(comicIds);
    const nowIso = new Date().toISOString();
    const updatedComicsToPersist: ComicBook[] = [];
    const baseStatuses = new Map<string, ReadingStatus>();

    const updatedList = comics.map((c) => {
      if (idSet.has(c.id)) {
        baseStatuses.set(c.id, c.readingStatus);
        const updatedComic: ComicBook = {
          ...c,
          readingStatus: 'Unread' as const,
          copiesOwned: c.copiesOwned && c.copiesOwned > 0 ? c.copiesOwned : 1,
          currentBoxId: targetBoxId !== undefined ? targetBoxId : c.currentBoxId || 1,
          updatedAt: nowIso,
        };
        updatedComicsToPersist.push(updatedComic);
        return updatedComic;
      }
      return c;
    });

    setComics(updatedList);

    if (updatedComicsToPersist.length > 0) {
      const outbox = await saveLocalComicsBatchAndEnqueue(updatedComicsToPersist, baseStatuses);
      updateOutboxStatus(outbox);
      void triggerSync();
    }
  };

  const handleUpdateBoxCapacity = (boxId: number, newCapacity: number) => {
    const clampedCapacity = Math.min(150, Math.max(10, newCapacity));
    const existing = boxes.find((b) => b.id === boxId);
    const nowIso = new Date().toISOString();
    setBoxes((prev) =>
      prev.map((b) => (b.id === boxId ? { ...b, maxCapacity: clampedCapacity, updatedAt: nowIso } : b))
    );
    if (existing) {
      saveLocalBoxAndEnqueue({ ...existing, maxCapacity: clampedCapacity, updatedAt: nowIso })
        .then(updateOutboxStatus)
        .then(() => triggerSync());
    }
  };

  const handleAddBox = (newBoxData?: Partial<StorageBox>) => {
    const nextId = boxes.length > 0 ? Math.max(...boxes.map((b) => b.id)) + 1 : 1;
    const nowIso = new Date().toISOString();
    const newBox: StorageBox = {
      id: nextId,
      name: newBoxData?.name || `Box ${nextId.toString().padStart(2, '0')} - New Short Box`,
      location: newBoxData?.location || 'Storage Shelf',
      maxCapacity: Math.min(150, Math.max(10, newBoxData?.maxCapacity || 150)),
      colorTag: newBoxData?.colorTag || '#3B82F6',
      notes: newBoxData?.notes || 'Custom added storage box',
      updatedAt: nowIso,
    };
    setBoxes((prev) => sortBoxes([...prev, newBox]));
    saveLocalBoxAndEnqueue(newBox)
      .then(updateOutboxStatus)
      .then(() => triggerSync());
  };

  const handleUpdateBox = (updatedBox: StorageBox) => {
    const nowIso = new Date().toISOString();
    const clampedBox: StorageBox = {
      ...updatedBox,
      maxCapacity: Math.min(150, Math.max(10, updatedBox.maxCapacity || 150)),
      updatedAt: nowIso,
    };
    setBoxes((prev) => sortBoxes(prev.map((b) => (b.id === updatedBox.id ? clampedBox : b))));
    saveLocalBoxAndEnqueue(clampedBox)
      .then(updateOutboxStatus)
      .then(() => triggerSync());
  };

  const handleDeleteBox = (boxId: number) => {
    const remaining = boxes.filter((b) => b.id !== boxId);
    const fallbackBoxId = remaining.length > 0 ? remaining[0].id : 1;
    const nowIso = new Date().toISOString();
    const reassignedComics: ComicBook[] = [];
    const updatedComics = comics.map((c) => {
      if (c.currentBoxId === boxId) {
        const updated = { ...c, currentBoxId: fallbackBoxId, updatedAt: nowIso };
        reassignedComics.push(updated);
        return updated;
      }
      return c;
    });

    setBoxes(remaining);
    setComics(updatedComics);

    const persistPromise =
      reassignedComics.length > 0
        ? saveLocalComicsBatchAndEnqueue(reassignedComics).then(() => deleteLocalBoxAndEnqueue(boxId))
        : deleteLocalBoxAndEnqueue(boxId);
    persistPromise.then(updateOutboxStatus).then(() => triggerSync());
  };

  const handleImportComics = async (
    importedComics: ComicBook[],
    mode: 'append' | 'replace' = 'append',
    navigate = true
  ): Promise<void> => {
    const nowIso = new Date().toISOString();
    const sanitizedImports = importedComics.map((c) => ({
      ...c,
      copiesOwned: c.readingStatus === 'Wishlist' ? 0 : c.copiesOwned,
      createdAt: c.createdAt || nowIso,
      updatedAt: nowIso,
    }));
    if (mode === 'replace') {
      setComics(sanitizedImports);
      const outbox = await replaceAllLocalComicsAndEnqueue(sanitizedImports);
      updateOutboxStatus(outbox);
    } else {
      setComics((prev) => [...sanitizedImports, ...prev]);
      const outbox = await saveLocalComicsBatchAndEnqueue(sanitizedImports);
      updateOutboxStatus(outbox);
    }
    void triggerSync();
    if (navigate) {
      handleSetActiveTab('catalog');
    }
  };

  const handleRefreshCollection = async () => {
    await triggerSync({ forceFull: false });
  };

  const handleRemoveDuplicates = (): number => {
    const seen = new Set<string>();
    const unique: ComicBook[] = [];
    let removedCount = 0;

    for (const comic of comics) {
      const titleKey = (comic.title || comic.fullTitle || comic.seriesName || '').trim().toLowerCase();
      const key = `${titleKey}|${comic.issueNumber.trim().toLowerCase()}|${comic.publisher.trim().toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(comic);
      } else {
        removedCount++;
      }
    }

    if (removedCount > 0) {
      setComics(unique);
      replaceAllLocalComicsAndEnqueue(unique)
        .then(updateOutboxStatus)
        .then(() => triggerSync());
    }
    return removedCount;
  };

  const handleClearAllComics = () => {
    setComics([]);
    localStorage.removeItem('comic_vault_comics');
    replaceAllLocalComicsAndEnqueue([])
      .then(updateOutboxStatus)
      .then(() => triggerSync());
  };

  const handleUpdateComicCover = (comicId: string, coverUrl: string) => {
    const existing = comics.find((c) => c.id === comicId);
    const nowIso = new Date().toISOString();
    setComics((prev) =>
      prev.map((c) => (c.id === comicId ? { ...c, coverImage: coverUrl, updatedAt: nowIso } : c))
    );
    if (existing) {
      saveLocalComicAndEnqueue({ ...existing, coverImage: coverUrl, updatedAt: nowIso })
        .then(updateOutboxStatus)
        .then(() => triggerSync());
    }
  };

  const handleUpdateComicFullCover = (comicId: string, coverFullUrl: string) => {
    const existing = comics.find((c) => c.id === comicId);
    const nowIso = new Date().toISOString();
    setComics((prev) =>
      prev.map((c) => (c.id === comicId ? { ...c, coverImageFull: coverFullUrl, updatedAt: nowIso } : c))
    );
    if (existing) {
      saveLocalComicAndEnqueue({ ...existing, coverImageFull: coverFullUrl, updatedAt: nowIso })
        .then(updateOutboxStatus)
        .then(() => triggerSync());
    }
  };

  const handleUpdateComicCoversBatch = (
    updates: Array<{ comicId: string; coverUrl?: string; coverImageFullUrl?: string }>
  ) => {
    if (updates.length === 0) return;
    const nowIso = new Date().toISOString();
    const coverMap = new Map<string, string>();
    const fullCoverMap = new Map<string, string>();
    updates.forEach((u) => {
      if (u.coverUrl) coverMap.set(u.comicId, u.coverUrl);
      if (u.coverImageFullUrl) fullCoverMap.set(u.comicId, u.coverImageFullUrl);
    });

    const changedComics: ComicBook[] = [];
    const updatedList = comics.map((c) => {
      let changed = false;
      let newCover = c.coverImage;
      let newFull = c.coverImageFull;

      if (coverMap.has(c.id)) {
        newCover = coverMap.get(c.id)!;
        changed = true;
      }
      if (fullCoverMap.has(c.id)) {
        newFull = fullCoverMap.get(c.id)!;
        changed = true;
      }

      if (changed) {
        const updatedComic = { ...c, coverImage: newCover, coverImageFull: newFull, updatedAt: nowIso };
        changedComics.push(updatedComic);
        return updatedComic;
      }
      return c;
    });

    setComics(updatedList);
    if (changedComics.length > 0) {
      saveLocalComicsBatchAndEnqueue(changedComics)
        .then(updateOutboxStatus)
        .then(() => triggerSync());
    }
  };

  const handleApplyNoImageFallback = (noImageUrl: string) => {
    const nowIso = new Date().toISOString();
    const changedComics: ComicBook[] = [];
    const updatedList = comics.map((c) => {
      if (!c.coverImage || c.coverImage === 'NoImage.png' || c.coverImage.toLowerCase().includes('noimage')) {
        const updatedComic = { ...c, coverImage: noImageUrl, updatedAt: nowIso };
        changedComics.push(updatedComic);
        return updatedComic;
      }
      return c;
    });
    setComics(updatedList);
    if (changedComics.length > 0) {
      saveLocalComicsBatchAndEnqueue(changedComics)
        .then(updateOutboxStatus)
        .then(() => triggerSync());
    }
  };

  const seriesOverviewSummary = useMemo(
    () => getSeriesOverviewSummary(comics, seriesTotals),
    [comics, seriesTotals]
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans antialiased selection:bg-slate-900 dark:selection:bg-indigo-600 selection:text-white transition-colors duration-150">
      
      {/* Navigation Header */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={handleSetActiveTab}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        darkMode={darkMode}
        onToggleDarkMode={handleToggleDarkMode}
        onOpenAddModal={() => {
          setInitialScanMode(false);
          setIsAddModalOpen(true);
        }}
        onOpenScanModal={() => {
          setInitialScanMode(true);
          setIsAddModalOpen(true);
        }}
        onOpenDriveModal={() => setIsDriveModalOpen(true)}
        onOpenDataManagementModal={() => setIsDataModalOpen(true)}
        totalComicsCount={totalComicsCount}
        totalThicknessUnits={totalThicknessUnits}
        fullRunsCount={seriesOverviewSummary.completeRuns}
        totalRunsCount={seriesOverviewSummary.totalKnownRuns}
        wishlistCount={wishlistCount}
        onNavigateToStats={() => {
          setStatsSubTab('series');
          handleSetActiveTab('stats');
        }}
        onOpenServerSettings={() => setIsServerModalOpen(true)}
        connectionState={syncStatus.connectionState}
        pendingSyncCount={syncStatus.pendingCount}
        onSyncNow={() => {
          void triggerSync();
        }}
      />

      {syncToast && (
        <div className="bg-emerald-50 dark:bg-emerald-950/60 border-b border-emerald-200 dark:border-emerald-900/60 px-4 py-2 text-xs text-emerald-900 dark:text-emerald-200 flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2 max-w-5xl">
            <span className="font-bold shrink-0 bg-emerald-200 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-200 px-2 py-0.5 rounded text-[11px]">
              Wi-Fi Sync Complete
            </span>
            <span>{syncToast}</span>
          </div>
        </div>
      )}

      {syncStatus.connectionState === 'offline' && syncStatus.pendingCount > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/60 border-b border-amber-200 dark:border-amber-900/60 px-4 py-2 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2 max-w-5xl">
            <span className="font-bold shrink-0 bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-200 px-2 py-0.5 rounded text-[11px]">
              Offline Mode Active
            </span>
            <span>
              {syncStatus.pendingCount} offline {syncStatus.pendingCount === 1 ? 'change' : 'changes'} saved locally in IndexedDB. Will auto-sync when back on home Wi-Fi.
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              void triggerSync();
            }}
            className="px-2.5 py-1 rounded-md bg-amber-600 hover:bg-amber-500 text-white font-bold text-[11px] shrink-0 cursor-pointer transition-colors"
          >
            Sync Now
          </button>
        </div>
      )}

      {/* Main Content View Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-6">
        
        {activeTab === 'catalog' && (
          <CollectionCatalog
            comics={comics}
            boxes={boxes}
            searchQuery={searchQuery}
            onSelectComic={setSelectedComic}
            onQuickStatusChange={handleQuickStatusChange}
            seriesTotals={seriesTotals}
            selectedSeries={selectedSeriesFilter}
            onSelectSeries={setSelectedSeriesFilter}
            onOpenGenerateWishlist={handleOpenGenerateWishlistModal}
            isLoading={isLoadingCollection}
          />
        )}

        {activeTab === 'shopping' && (
          <WishlistShoppingList
            comics={comics}
            boxes={boxes}
            seriesTotals={seriesTotals}
            onSelectComic={setSelectedComic}
            onPurchaseComics={handlePurchaseWishlistComics}
          />
        )}

        {activeTab === 'boxes' && (
          <BoxManager
            boxes={boxes}
            comics={comics}
            onUpdateComics={handleUpdateAllComics}
            onUpdateBoxCapacity={handleUpdateBoxCapacity}
            onAddBox={handleAddBox}
            onUpdateBox={handleUpdateBox}
            onDeleteBox={handleDeleteBox}
            onSelectComic={setSelectedComic}
          />
        )}

        {activeTab === 'challenge' && (
          <ReadingChallengeView
            comics={inCollectionComics}
            boxes={boxes}
            onSelectComic={setSelectedComic}
            onRefreshCollection={handleRefreshCollection}
          />
        )}

        {activeTab === 'stats' && (
          <ReadingStats
            comics={comics}
            boxes={boxes}
            seriesTotals={seriesTotals}
            onViewSeriesInCatalog={handleViewSeriesInCatalog}
            onOpenGenerateWishlist={handleOpenGenerateWishlistModal}
            initialSubTab={statsSubTab}
          />
        )}

        {activeTab === 'sheets' && (
          <GoogleSheetsImporter 
            boxes={boxes} 
            onImportComics={handleImportComics}
            onRefreshCollection={handleRefreshCollection}
            onNavigateToTab={(tab) => handleSetActiveTab(tab)}
            onOpenDataManagementModal={() => setIsDataModalOpen(true)}
            comicsCount={comics.length}
          />
        )}

        {activeTab === 'database' && (
          <DatabasePlanner comics={comics} boxes={boxes} seriesTotals={seriesTotals} />
        )}

      </main>

      {/* Modals */}
      <AddAndScanModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        boxes={boxes}
        existingComics={comics}
        seriesTotals={seriesTotals}
        onAddComic={handleAddComic}
        onUpdateComic={handleUpdateComic}
        initialScanMode={initialScanMode}
        onOpenGenerateWishlist={() => handleOpenGenerateWishlistModal()}
      />

      <ComicDetailModal
        comic={selectedComic}
        onClose={() => setSelectedComic(null)}
        boxes={boxes}
        onUpdateComic={handleUpdateComic}
        onDeleteComic={handleDeleteComic}
        seriesTotals={seriesTotals}
        allComics={comics}
        creatorTypes={creatorTypes}
        onViewSeriesInCatalog={handleViewSeriesInCatalog}
        onOpenGenerateWishlist={handleOpenGenerateWishlistModal}
      />

      <GenerateSeriesWishlistModal
        isOpen={isGenerateWishlistModalOpen}
        onClose={() => setIsGenerateWishlistModalOpen(false)}
        comics={comics}
        seriesTotals={seriesTotals}
        initialSeriesName={generateWishlistSeriesName}
        onBatchAddComics={handleBatchAddComics}
      />

      <GoogleDriveCoversModal
        isOpen={isDriveModalOpen}
        onClose={() => setIsDriveModalOpen(false)}
        comics={comics}
        onUpdateComicCover={handleUpdateComicCover}
        onUpdateComicFullCover={handleUpdateComicFullCover}
        onUpdateComicCoversBatch={handleUpdateComicCoversBatch}
        onApplyNoImageFallback={handleApplyNoImageFallback}
      />

      <DataManagementModal
        isOpen={isDataModalOpen}
        onClose={() => setIsDataModalOpen(false)}
        comics={comics}
        onRemoveDuplicates={handleRemoveDuplicates}
        onClearAllComics={handleClearAllComics}
      />

      <ServerSettingsModal
        isOpen={isServerModalOpen}
        onClose={() => setIsServerModalOpen(false)}
        onSaved={refreshCollectionData}
        syncStatus={syncStatus}
        onSyncNow={async (opts) => {
          await triggerSync(opts);
        }}
      />

      {/* Mobile Bottom Navigation Bar (thumb navigation on Android/iOS) */}
      <MobileBottomNav
        activeTab={activeTab}
        setActiveTab={handleSetActiveTab}
        onOpenScanModal={() => {
          setInitialScanMode(true);
          setIsAddModalOpen(true);
        }}
        onOpenAddModal={() => {
          setInitialScanMode(false);
          setIsAddModalOpen(true);
        }}
        onOpenServerSettings={() => setIsServerModalOpen(true)}
        wishlistCount={wishlistCount}
        connectionState={syncStatus.connectionState}
        pendingSyncCount={syncStatus.pendingCount}
      />

      {/* Footer */}
      <footer className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 py-6 text-center text-xs text-slate-500 dark:text-slate-400 transition-colors">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div>
            <strong className="text-slate-800 dark:text-slate-200">Comic Archive Pro</strong> • 15 Storage Box & Reading Manager
          </div>
          <div className="text-slate-400 dark:text-slate-500">
            Perspective Cover Scanner, Local OCR & Google Drive Integration
          </div>
        </div>
      </footer>

    </div>
  );
}
