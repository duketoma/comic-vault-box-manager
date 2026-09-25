import React, { useState, useEffect, useMemo } from 'react';
import { ComicBook, StorageBox, SeriesIssueTotal } from './types';
import { DEFAULT_BOXES, INITIAL_COMICS } from './data/initialData';
import { Navbar } from './components/Navbar';
import { CollectionCatalog } from './components/CollectionCatalog';
import { BoxManager } from './components/BoxManager';
import { ReadingStats } from './components/ReadingStats';
import { GoogleSheetsImporter } from './components/GoogleSheetsImporter';
import { DatabasePlanner } from './components/DatabasePlanner';
import { AddAndScanModal } from './components/AddAndScanModal';
import { ComicDetailModal } from './components/ComicDetailModal';
import { GoogleDriveCoversModal } from './components/GoogleDriveCoversModal';
import { DataManagementModal } from './components/DataManagementModal';
import {
  deleteBox, deleteComic, loadCollection, replaceBoxes, replaceComics, saveBox, saveBoxes, saveComic,
} from './services/postgresService';
import { sortBoxes } from './utils/boxUtils';

export default function App() {
  const [activeTab, setActiveTab] = useState<'catalog' | 'boxes' | 'stats' | 'sheets' | 'database'>('catalog');
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
    // Auto-clean sample items c-013 & c-014 if present and ensure Wishlist comics have 0 copies owned
    return parsed
      .filter((c) => c.id !== 'c-013' && c.id !== 'c-014')
      .map((c) => (c.readingStatus === 'Wishlist' ? { ...c, copiesOwned: 0 } : c));
  });

  const [seriesTotals, setSeriesTotals] = useState<SeriesIssueTotal[]>(() => {
    const saved = localStorage.getItem('comic_vault_series_totals');
    return saved ? JSON.parse(saved) : [];
  });

  // Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [initialScanMode, setInitialScanMode] = useState<boolean>(false);
  const [selectedComic, setSelectedComic] = useState<ComicBook | null>(null);
  const [selectedSeriesFilter, setSelectedSeriesFilter] = useState<string>('all');
  const [isDriveModalOpen, setIsDriveModalOpen] = useState<boolean>(false);
  const [isDataModalOpen, setIsDataModalOpen] = useState<boolean>(false);
  const [databaseError, setDatabaseError] = useState<string | null>(null);

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

  useEffect(() => {
    let active = true;
    loadCollection()
      .then(({ comics: storedComics, boxes: storedBoxes, seriesTotals: storedSeriesTotals }) => {
        if (!active) return;
        if (storedBoxes.length > 0) setBoxes(storedBoxes);
        if (storedSeriesTotals && storedSeriesTotals.length > 0) setSeriesTotals(storedSeriesTotals);
        if (storedComics.length > 0) {
          setComics(storedComics
            .filter((c) => c.id !== 'c-013' && c.id !== 'c-014')
            .map((c) => (c.readingStatus === 'Wishlist' ? { ...c, copiesOwned: 0 } : c)));
        } else if (storedBoxes.length === 0) {
          // First local PostgreSQL run: move the browser's existing collection into it.
          saveBoxes(boxes)
            .then(() => replaceComics(comics))
            .catch((error) => active && setDatabaseError(error.message));
        }
        setDatabaseError(null);
      })
      .catch((error) => active && setDatabaseError(error instanceof Error ? error.message : 'Unable to reach PostgreSQL.'));
    return () => { active = false; };
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
    setComics((prev) => {
      const updated = prev.map((c) => {
        if (c.id === comicId) {
          const newCopies = newStatus === 'Wishlist' ? 0 : ((c.copiesOwned && c.copiesOwned > 0) ? c.copiesOwned : 1);
          return { ...c, readingStatus: newStatus, copiesOwned: newCopies };
        }
        return c;
      });
      const target = updated.find((c) => c.id === comicId);
      if (target) dbCall(saveComic(target));
      return updated;
    });
  };

  const handleUpdateBoxCapacity = (boxId: number, newCapacity: number) => {
    const clampedCapacity = Math.min(150, Math.max(10, newCapacity));
    setBoxes((prev) => {
      const updated = prev.map((b) => (b.id === boxId ? { ...b, maxCapacity: clampedCapacity } : b));
      const target = updated.find((b) => b.id === boxId);
      if (target) dbCall(saveBox(target));
      return updated;
    });
  };

  const handleAddBox = (newBoxData?: Partial<StorageBox>) => {
    setBoxes((prev) => {
      const nextId = prev.length > 0 ? Math.max(...prev.map((b) => b.id)) + 1 : 1;
      const newBox: StorageBox = {
        id: nextId,
        name: newBoxData?.name || `Box ${nextId.toString().padStart(2, '0')} - New Short Box`,
        location: newBoxData?.location || 'Storage Shelf',
        maxCapacity: Math.min(150, Math.max(10, newBoxData?.maxCapacity || 150)),
        colorTag: newBoxData?.colorTag || '#3B82F6',
        notes: newBoxData?.notes || 'Custom added storage box',
      };
      dbCall(saveBox(newBox));
      return sortBoxes([...prev, newBox]);
    });
  };

  const handleUpdateBox = (updatedBox: StorageBox) => {
    const clampedBox = { ...updatedBox, maxCapacity: Math.min(150, Math.max(10, updatedBox.maxCapacity || 150)) };
    setBoxes((prev) => sortBoxes(prev.map((b) => (b.id === updatedBox.id ? clampedBox : b))));
    dbCall(saveBox(clampedBox));
  };

  const handleDeleteBox = (boxId: number) => {
    // Reassign any comics in this box to Box 1 or remaining first box
    setBoxes((prev) => {
      const remaining = prev.filter((b) => b.id !== boxId);
      const fallbackBoxId = remaining.length > 0 ? remaining[0].id : 1;
      setComics((comicList) => {
        const updatedList = comicList.map((c) => (c.currentBoxId === boxId ? { ...c, currentBoxId: fallbackBoxId } : c));
        dbCall(replaceComics(updatedList).then(() => deleteBox(boxId)));
        return updatedList;
      });
      return remaining;
    });
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
      let combined: ComicBook[] = [];
      setComics((prev) => {
        combined = [...sanitizedImports, ...prev];
        return combined;
      });
      await dbCall(replaceComics(combined));
    }
    if (navigate) {
      setActiveTab('catalog');
    }
  };

  const handleRefreshCollection = async () => {
    try {
      const { comics: storedComics, boxes: storedBoxes, seriesTotals: storedSeriesTotals } = await loadCollection();
      if (storedBoxes.length > 0) setBoxes(storedBoxes);
      if (storedSeriesTotals && storedSeriesTotals.length > 0) setSeriesTotals(storedSeriesTotals);
      if (storedComics.length > 0) {
        setComics(storedComics
          .filter((c) => c.id !== 'c-013' && c.id !== 'c-014')
          .map((c) => (c.readingStatus === 'Wishlist' ? { ...c, copiesOwned: 0 } : c)));
      }
    } catch (err) {
      console.warn('Failed to refresh collection:', err);
    }
  };

  const handleRemoveDuplicates = (): number => {
    let removedCount = 0;
    setComics((prev) => {
      const seen = new Set<string>();
      const unique: ComicBook[] = [];
      for (const comic of prev) {
        const titleKey = (comic.title || comic.fullTitle || comic.seriesName || '').trim().toLowerCase();
        const key = `${titleKey}|${comic.issueNumber.trim().toLowerCase()}|${comic.publisher.trim().toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          unique.push(comic);
        } else {
          removedCount++;
        }
      }
      dbCall(replaceComics(unique));
      return unique;
    });
    return removedCount;
  };

  const handleClearAllComics = () => {
    setComics([]);
    dbCall(replaceComics([]));
    localStorage.removeItem('comic_vault_comics');
  };

  const handleResetSampleData = () => {
    setComics(INITIAL_COMICS);
    setBoxes(DEFAULT_BOXES);
    dbCall(replaceBoxes(DEFAULT_BOXES).then(() => replaceComics(INITIAL_COMICS))).catch(() => {/* handled by dbCall */});
    localStorage.setItem('comic_vault_comics', JSON.stringify(INITIAL_COMICS));
    localStorage.setItem('comic_vault_boxes', JSON.stringify(DEFAULT_BOXES));
  };

  const handleUpdateComicCover = (comicId: string, coverUrl: string) => {
    setComics((prev) => {
      const updated = prev.map((c) => (c.id === comicId ? { ...c, coverImage: coverUrl } : c));
      const comic = updated.find((c) => c.id === comicId);
      if (comic) dbCall(saveComic(comic));
      return updated;
    });
  };

  const handleApplyNoImageFallback = (noImageUrl: string) => {
    setComics((prev) => {
      const updated = prev.map((c) => {
        if (!c.coverImage || c.coverImage === 'NoImage.png' || c.coverImage.toLowerCase().includes('noimage')) {
          return { ...c, coverImage: noImageUrl };
        }
        return c;
      });
      dbCall(replaceComics(updated));
      return updated;
    });
  };

  const seriesOverviewSummary = useMemo(() => {
    const totalsMap = new Map<string, number>();
    (seriesTotals || []).forEach((st) => {
      if (st.seriesName) totalsMap.set(st.seriesName.toLowerCase().trim(), st.issueCount);
    });
    const seriesOwnedMap = new Map<string, number>();
    comics.forEach((c) => {
      if (c.readingStatus !== 'Wishlist') {
        const key = (c.seriesName || c.title || '').trim().toLowerCase();
        if (key) seriesOwnedMap.set(key, (seriesOwnedMap.get(key) || 0) + 1);
      }
    });

    let completeRuns = 0;
    let totalKnownRuns = 0;
    seriesOwnedMap.forEach((owned, sName) => {
      const total = totalsMap.get(sName);
      if (total && total > 0) {
        totalKnownRuns++;
        if (owned >= total) completeRuns++;
      }
    });

    return {
      completeRuns,
      totalKnownRuns: totalKnownRuns || (seriesTotals ? seriesTotals.length : 0),
    };
  }, [comics, seriesTotals]);

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
        onNavigateToStats={() => {
          setStatsSubTab('series');
          setActiveTab('stats');
        }}
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
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        
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

        {activeTab === 'stats' && (
          <ReadingStats
            comics={comics}
            boxes={boxes}
            seriesTotals={seriesTotals}
            onViewSeriesInCatalog={handleViewSeriesInCatalog}
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
      />

      <ComicDetailModal
        comic={selectedComic}
        onClose={() => setSelectedComic(null)}
        boxes={boxes}
        onUpdateComic={handleUpdateComic}
        onDeleteComic={handleDeleteComic}
        seriesTotals={seriesTotals}
        allComics={comics}
        onViewSeriesInCatalog={handleViewSeriesInCatalog}
      />

      <GoogleDriveCoversModal
        isOpen={isDriveModalOpen}
        onClose={() => setIsDriveModalOpen(false)}
        comics={comics}
        onUpdateComicCover={handleUpdateComicCover}
        onApplyNoImageFallback={handleApplyNoImageFallback}
      />

      <DataManagementModal
        isOpen={isDataModalOpen}
        onClose={() => setIsDataModalOpen(false)}
        comics={comics}
        onRemoveDuplicates={handleRemoveDuplicates}
        onClearAllComics={handleClearAllComics}
        onResetSampleData={handleResetSampleData}
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
