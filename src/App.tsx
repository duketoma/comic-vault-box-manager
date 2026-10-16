import React, { useState, useEffect, useMemo } from 'react';
import { ComicBook, StorageBox, SeriesIssueTotal } from './types';
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
  deleteBox, deleteComic, loadCollection, replaceBoxes, replaceComics, saveBox, saveBoxes, saveComic, saveComicsBatch,
} from './services/postgresService';
import { sortBoxes } from './utils/boxUtils';
import { getSeriesOverviewSummary } from './utils/seriesUtils';

export default function App() {
  const [activeTab, setActiveTab] = useState<'catalog' | 'boxes' | 'challenge' | 'stats' | 'sheets' | 'database' | 'shopping'>('catalog');
  const [statsSubTab, setStatsSubTab] = useState<'events' | 'series' | 'creators' | 'achievements' | 'general'>('events');
  const [searchQuery, setSearchQuery] = useState<string>('');

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

  // Local Storage Persistent State
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
  const [databaseError, setDatabaseError] = useState<string | null>(null);

  const handleOpenGenerateWishlistModal = (seriesName?: string) => {
    setGenerateWishlistSeriesName(seriesName || '');
    setIsGenerateWishlistModalOpen(true);
  };

  const handleViewSeriesInCatalog = (seriesName: string) => {
    setSelectedSeriesFilter(seriesName);
    setActiveTab('catalog');
  };

  // Helper to run DB promises and clear the error on success
  function dbCall<T>(p: Promise<T>) {
    return p
      .then((res) => { setDatabaseError(null); return res; })
      .catch((error) => { const msg = error instanceof Error ? error.message : String(error); setDatabaseError(msg); throw error; });
  }

  // Browser storage remains a local cache; PostgreSQL is the system of record.
  useEffect(() => {
    try {
      localStorage.setItem('comic_vault_boxes', JSON.stringify(boxes));
    } catch (err) {
      console.warn('LocalStorage save failed for boxes:', err);
    }
  }, [boxes]);

  useEffect(() => {
    try {
      localStorage.setItem('comic_vault_comics', JSON.stringify(comics));
    } catch (err) {
      console.warn('LocalStorage quota exceeded for comics, data is safely saved in Cloud DB:', err);
    }
  }, [comics]);

  useEffect(() => {
    try {
      localStorage.setItem('comic_vault_series_totals', JSON.stringify(seriesTotals));
    } catch (err) {
      console.warn('LocalStorage save failed for series totals:', err);
    }
  }, [seriesTotals]);

  const refreshCollectionData = () => {
    return loadCollection()
      .then(({ comics: storedComics, boxes: storedBoxes, seriesTotals: storedSeriesTotals, creatorTypes: storedCreatorTypes }) => {
        if (storedBoxes.length > 0) setBoxes(storedBoxes);
        if (storedSeriesTotals && storedSeriesTotals.length > 0) setSeriesTotals(storedSeriesTotals);
        if (storedCreatorTypes && storedCreatorTypes.length > 0) setCreatorTypes(storedCreatorTypes);
        if (storedComics.length > 0) {
          setComics(
            storedComics
              .filter((c) => !isSampleComicId(c.id))
              .map((c) => (c.readingStatus === 'Wishlist' ? { ...c, copiesOwned: 0 } : c))
          );
        } else if (storedBoxes.length === 0) {
          saveBoxes(boxes).catch((error) => setDatabaseError(error.message));
        }
        setDatabaseError(null);
      })
      .catch((error) => setDatabaseError(error instanceof Error ? error.message : 'Unable to reach PostgreSQL.'));
  };

  useEffect(() => {
    refreshCollectionData();
  }, []);

  // If a database error is present, poll the backend until the connection is restored and clear the banner
  useEffect(() => {
    if (!databaseError) return;
    let active = true;
    const interval = setInterval(() => {
      loadCollection()
        .then(() => { if (active) setDatabaseError(null); })
        .catch(() => { /* still down */ });
    }, 5000);
    return () => { active = false; clearInterval(interval); };
  }, [databaseError]);

  // Total Collection Metrics (In Collection vs Wishlist)
  const inCollectionComics = comics.filter((c) => c.readingStatus !== 'Wishlist');
  const wishlistComics = comics.filter((c) => c.readingStatus === 'Wishlist');

  const totalComicsCount = inCollectionComics.length;
  const totalThicknessUnits = inCollectionComics.reduce((acc, c) => acc + (c.sizeThickness || 1.0), 0);
  const wishlistCount = wishlistComics.length;

  // Handlers update the UI immediately, then persist the change to PostgreSQL.
  const handleAddComic = (newComic: ComicBook) => {
    const cleanComic = newComic.readingStatus === 'Wishlist' ? { ...newComic, copiesOwned: 0 } : newComic;
    setComics((prev) => [cleanComic, ...prev]);
    dbCall(saveComic(cleanComic));
  };

  const handleBatchAddComics = async (newComics: ComicBook[]) => {
    const cleanComics = newComics.map((c) =>
      c.readingStatus === 'Wishlist' ? { ...c, copiesOwned: 0 } : c
    );
    setComics((prev) => [...cleanComics, ...prev]);
    try {
      await saveComicsBatch(cleanComics);
    } catch (err: any) {
      console.error('Failed to batch save comics:', err);
      setDatabaseError(err.message || 'Failed to batch save comics in database');
    }
  };

  const handleUpdateComic = (updatedComic: ComicBook) => {
    const cleanComic = updatedComic.readingStatus === 'Wishlist' ? { ...updatedComic, copiesOwned: 0 } : updatedComic;
    setComics((prev) => prev.map((c) => (c.id === cleanComic.id ? cleanComic : c)));
    dbCall(saveComic(cleanComic));
  };

  const handleUpdateAllComics = (updatedComics: ComicBook[]) => {
    const cleanList = updatedComics.map((c) => (c.readingStatus === 'Wishlist' ? { ...c, copiesOwned: 0 } : c));
    setComics(cleanList);
    replaceComics(cleanList).catch((error) => setDatabaseError(error.message));
  };

  const handleDeleteComic = (comicId: string) => {
    setComics((prev) => prev.filter((c) => c.id !== comicId));
    dbCall(deleteComic(comicId));
  };

  const handleQuickStatusChange = (comicId: string, newStatus: ComicBook['readingStatus']) => {
    const existing = comics.find((c) => c.id === comicId);
    if (!existing) return;
    const newCopies = newStatus === 'Wishlist' ? 0 : ((existing.copiesOwned && existing.copiesOwned > 0) ? existing.copiesOwned : 1);
    const updatedComic: ComicBook = { ...existing, readingStatus: newStatus, copiesOwned: newCopies };
    setComics((prev) => prev.map((c) => (c.id === comicId ? updatedComic : c)));
    dbCall(saveComic(updatedComic));
  };

  const handlePurchaseWishlistComics = async (comicIds: string[], targetBoxId?: number) => {
    const idSet = new Set(comicIds);
    const updatedComicsToPersist: ComicBook[] = [];
    const updatedList = comics.map((c) => {
      if (idSet.has(c.id)) {
        const updatedComic: ComicBook = {
          ...c,
          readingStatus: 'Unread' as const,
          copiesOwned: c.copiesOwned && c.copiesOwned > 0 ? c.copiesOwned : 1,
          currentBoxId: targetBoxId !== undefined ? targetBoxId : (c.currentBoxId || 1),
        };
        updatedComicsToPersist.push(updatedComic);
        return updatedComic;
      }
      return c;
    });

    setComics(updatedList);

    if (updatedComicsToPersist.length > 0) {
      try {
        await saveComicsBatch(updatedComicsToPersist);
      } catch (err: any) {
        console.error('Failed to persist purchased comics:', err);
        setDatabaseError(err.message || 'Failed to update purchased comics in database');
      }
    }
  };

  const handleUpdateBoxCapacity = (boxId: number, newCapacity: number) => {
    const clampedCapacity = Math.min(150, Math.max(10, newCapacity));
    const existing = boxes.find((b) => b.id === boxId);
    setBoxes((prev) => prev.map((b) => (b.id === boxId ? { ...b, maxCapacity: clampedCapacity } : b)));
    if (existing) {
      dbCall(saveBox({ ...existing, maxCapacity: clampedCapacity }));
    }
  };

  const handleAddBox = (newBoxData?: Partial<StorageBox>) => {
    const nextId = boxes.length > 0 ? Math.max(...boxes.map((b) => b.id)) + 1 : 1;
    const newBox: StorageBox = {
      id: nextId,
      name: newBoxData?.name || `Box ${nextId.toString().padStart(2, '0')} - New Short Box`,
      location: newBoxData?.location || 'Storage Shelf',
      maxCapacity: Math.min(150, Math.max(10, newBoxData?.maxCapacity || 150)),
      colorTag: newBoxData?.colorTag || '#3B82F6',
      notes: newBoxData?.notes || 'Custom added storage box',
    };
    setBoxes((prev) => sortBoxes([...prev, newBox]));
    dbCall(saveBox(newBox));
  };

  const handleUpdateBox = (updatedBox: StorageBox) => {
    const clampedBox = { ...updatedBox, maxCapacity: Math.min(150, Math.max(10, updatedBox.maxCapacity || 150)) };
    setBoxes((prev) => sortBoxes(prev.map((b) => (b.id === updatedBox.id ? clampedBox : b))));
    dbCall(saveBox(clampedBox));
  };

  const handleDeleteBox = (boxId: number) => {
    const remaining = boxes.filter((b) => b.id !== boxId);
    const fallbackBoxId = remaining.length > 0 ? remaining[0].id : 1;
    const reassignedComics: ComicBook[] = [];
    const updatedComics = comics.map((c) => {
      if (c.currentBoxId === boxId) {
        const updated = { ...c, currentBoxId: fallbackBoxId };
        reassignedComics.push(updated);
        return updated;
      }
      return c;
    });

    setBoxes(remaining);
    setComics(updatedComics);

    const persistPromise = reassignedComics.length > 0
      ? saveComicsBatch(reassignedComics).then(() => deleteBox(boxId))
      : deleteBox(boxId);
    dbCall(persistPromise);
  };

  const handleImportComics = async (
    importedComics: ComicBook[],
    mode: 'append' | 'replace' = 'append',
    navigate = true
  ): Promise<void> => {
    const sanitizedImports = importedComics.map((c) =>
      c.readingStatus === 'Wishlist' ? { ...c, copiesOwned: 0 } : c
    );
    if (mode === 'replace') {
      setComics(sanitizedImports);
      await dbCall(replaceComics(sanitizedImports));
    } else {
      setComics((prev) => [...sanitizedImports, ...prev]);
      await dbCall(saveComicsBatch(sanitizedImports));
    }
    if (navigate) {
      setActiveTab('catalog');
    }
  };

  const handleRefreshCollection = async () => {
    try {
      const { comics: storedComics, boxes: storedBoxes, seriesTotals: storedSeriesTotals, creatorTypes: storedCreatorTypes } = await loadCollection();
      if (storedBoxes.length > 0) setBoxes(storedBoxes);
      if (storedSeriesTotals && storedSeriesTotals.length > 0) setSeriesTotals(storedSeriesTotals);
      if (storedCreatorTypes && storedCreatorTypes.length > 0) setCreatorTypes(storedCreatorTypes);
      if (storedComics.length > 0) {
        setComics(
          storedComics
            .filter((c) => !isSampleComicId(c.id))
            .map((c) => (c.readingStatus === 'Wishlist' ? { ...c, copiesOwned: 0 } : c))
        );
      }
    } catch (err) {
      console.warn('Failed to refresh collection:', err);
    }
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
      dbCall(replaceComics(unique));
    }
    return removedCount;
  };

  const handleClearAllComics = () => {
    setComics([]);
    dbCall(replaceComics([]));
    localStorage.removeItem('comic_vault_comics');
  };

  const handleUpdateComicCover = (comicId: string, coverUrl: string) => {
    const existing = comics.find((c) => c.id === comicId);
    setComics((prev) => prev.map((c) => (c.id === comicId ? { ...c, coverImage: coverUrl } : c)));
    if (existing) {
      dbCall(saveComic({ ...existing, coverImage: coverUrl })).catch((err) =>
        console.error('Failed to save comic cover:', err)
      );
    }
  };

  const handleUpdateComicFullCover = (comicId: string, coverFullUrl: string) => {
    const existing = comics.find((c) => c.id === comicId);
    setComics((prev) => prev.map((c) => (c.id === comicId ? { ...c, coverImageFull: coverFullUrl } : c)));
    if (existing) {
      dbCall(saveComic({ ...existing, coverImageFull: coverFullUrl })).catch((err) =>
        console.error('Failed to save comic full cover:', err)
      );
    }
  };

  const handleUpdateComicCoversBatch = (updates: Array<{ comicId: string; coverUrl?: string; coverImageFullUrl?: string }>) => {
    if (updates.length === 0) return;
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
        const updatedComic = { ...c, coverImage: newCover, coverImageFull: newFull };
        changedComics.push(updatedComic);
        return updatedComic;
      }
      return c;
    });

    setComics(updatedList);
    if (changedComics.length > 0) {
      dbCall(saveComicsBatch(changedComics)).catch((err) =>
        console.error('Failed to persist batch comic covers:', err)
      );
    }
  };

  const handleApplyNoImageFallback = (noImageUrl: string) => {
    const changedComics: ComicBook[] = [];
    const updatedList = comics.map((c) => {
      if (!c.coverImage || c.coverImage === 'NoImage.png' || c.coverImage.toLowerCase().includes('noimage')) {
        const updatedComic = { ...c, coverImage: noImageUrl };
        changedComics.push(updatedComic);
        return updatedComic;
      }
      return c;
    });
    setComics(updatedList);
    if (changedComics.length > 0) {
      dbCall(saveComicsBatch(changedComics));
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
        setActiveTab={setActiveTab}
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
          setActiveTab('stats');
        }}
        onOpenServerSettings={() => setIsServerModalOpen(true)}
      />

      {databaseError && (
        <div className="bg-amber-50 dark:bg-amber-950/60 border-b border-amber-200 dark:border-amber-900/60 px-4 py-2 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2 max-w-5xl">
            <span className="font-bold shrink-0 bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-200 px-2 py-0.5 rounded text-[11px]">
              PostgreSQL connection issue
            </span>
            <span>
              {databaseError} Your edits remain in this browser until the connection is restored.
            </span>
          </div>
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
            onNavigateToTab={(tab) => setActiveTab(tab)}
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
      />

      {/* Mobile Bottom Navigation Bar (thumb navigation on Android/iOS) */}
      <MobileBottomNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
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
      />

      {/* Footer */}
      <footer className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 py-6 text-center text-xs text-slate-500 dark:text-slate-400 transition-colors">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div>
            <strong className="text-slate-800 dark:text-slate-200">Comic Archive Pro</strong> • 15 Storage Box & Reading Manager
          </div>
          <div className="text-slate-400 dark:text-slate-500">
            Powered by Google AI Studio Gemini API & Google Drive Integration
          </div>
        </div>
      </footer>

    </div>
  );
}
