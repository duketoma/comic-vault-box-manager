import React, { useState } from 'react';
import { 
  BookOpen, 
  Boxes, 
  BarChart3, 
  FileSpreadsheet, 
  Database, 
  PlusCircle, 
  Camera, 
  Search, 
  Cloud, 
  Trash2, 
  Sun, 
  Moon, 
  Trophy, 
  ShoppingCart, 
  Server,
  MoreVertical,
  RefreshCw,
  WifiOff,
  X
} from 'lucide-react';

interface NavbarProps {
  activeTab: 'catalog' | 'boxes' | 'challenge' | 'stats' | 'sheets' | 'database' | 'shopping';
  setActiveTab: (tab: 'catalog' | 'boxes' | 'challenge' | 'stats' | 'sheets' | 'database' | 'shopping') => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onOpenAddModal: () => void;
  onOpenScanModal: () => void;
  onOpenDriveModal: () => void;
  onOpenDataManagementModal?: () => void;
  totalComicsCount: number;
  totalThicknessUnits?: number;
  fullRunsCount?: number;
  totalRunsCount?: number;
  wishlistCount?: number;
  onNavigateToStats?: () => void;
  onOpenServerSettings?: () => void;
  connectionState?: 'online' | 'offline' | 'syncing';
  pendingSyncCount?: number;
  onSyncNow?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  searchQuery,
  setSearchQuery,
  darkMode,
  onToggleDarkMode,
  onOpenAddModal,
  onOpenScanModal,
  onOpenDriveModal,
  onOpenDataManagementModal,
  totalComicsCount,
  totalThicknessUnits,
  fullRunsCount,
  totalRunsCount,
  wishlistCount,
  onNavigateToStats,
  onOpenServerSettings,
  connectionState = 'online',
  pendingSyncCount = 0,
  onSyncNow,
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [localSearch, setLocalSearch] = useState(searchQuery);

  // Keep local search input synchronized if search query changes externally
  React.useEffect(() => {
    setLocalSearch(searchQuery);
  }, [searchQuery]);

  // Debounce downstream collection search query propagation by 275ms (250–300ms window)
  React.useEffect(() => {
    if (localSearch === searchQuery) return;
    const timer = setTimeout(() => {
      React.startTransition(() => {
        setSearchQuery(localSearch);
      });
    }, 275);
    return () => clearTimeout(timer);
  }, [localSearch, searchQuery, setSearchQuery]);

  const handleClear = () => {
    setLocalSearch('');
    React.startTransition(() => {
      setSearchQuery('');
    });
  };

  return (
    <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 sticky top-0 z-40 shadow-xs transition-colors safe-top">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-2 sm:gap-4">
          
          {/* Logo & Branding */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-slate-900 dark:bg-indigo-600 flex items-center justify-center text-white font-black text-sm sm:text-base tracking-wider shadow-sm transition-colors shrink-0">
              CV
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <h1 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white leading-none tracking-tight truncate">
                  Comic Archive Pro
                </h1>
                <button
                  type="button"
                  onClick={onOpenServerSettings}
                  title="Open Sync & Server Connection Hub"
                  className={`inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 text-[10px] font-bold border rounded-md cursor-pointer transition-colors shrink-0 ${
                    connectionState === 'syncing'
                      ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/60'
                      : connectionState === 'offline'
                      ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/60'
                      : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/60'
                  }`}
                >
                  {connectionState === 'syncing' ? (
                    <>
                      <RefreshCw className="w-2.5 h-2.5 animate-spin text-blue-500" />
                      <span>Syncing{pendingSyncCount > 0 ? ` (${pendingSyncCount})` : '...'}</span>
                    </>
                  ) : connectionState === 'offline' ? (
                    <>
                      <WifiOff className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400" />
                      <span>
                        Offline{pendingSyncCount > 0 ? ` • ${pendingSyncCount} Pending` : ' Ready'}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      <span className="hidden sm:inline">
                        {pendingSyncCount > 0 ? `PC Connected (${pendingSyncCount} Pending)` : 'PC Synced'}
                      </span>
                    </>
                  )}
                </button>
                {pendingSyncCount > 0 && onSyncNow && connectionState !== 'syncing' && (
                  <button
                    type="button"
                    onClick={onSyncNow}
                    title={`Sync ${pendingSyncCount} pending offline change(s) with PC now`}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-md cursor-pointer transition-all active:scale-95 shrink-0"
                  >
                    <RefreshCw className="w-2.5 h-2.5" />
                    <span className="hidden sm:inline">Sync Now</span>
                  </button>
                )}
              </div>
              <p className="hidden sm:block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-medium truncate">
                Configurable Storage Box & Collection Manager
              </p>
            </div>
          </div>

          {/* Search Bar */}
          <div className="hidden md:flex flex-1 max-w-md mx-4">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                placeholder="Search title, writer, artist, publisher, issue #..."
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    handleClear();
                  } else if (e.key === 'Enter') {
                    React.startTransition(() => {
                      setSearchQuery(localSearch);
                    });
                  }
                }}
                className="w-full pl-9 pr-16 py-1.5 bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-md text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-300 dark:focus:ring-slate-600 focus:bg-white dark:focus:bg-slate-800 transition-all"
              />
              {localSearch && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer flex items-center gap-1 px-1 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
                  title="Clear search"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                  <span className="text-[11px] font-medium">Clear</span>
                </button>
              )}
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Drive Covers */}
            <button
              onClick={onOpenDriveModal}
              className="flex items-center gap-1.5 p-2 sm:px-2.5 sm:py-1.5 xl:px-3 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-800 dark:text-blue-300 text-xs font-semibold shadow-xs transition-all active:scale-95 cursor-pointer shrink-0"
              title="Sync Google Drive Comic Covers folder & NoImage.png"
              aria-label="Drive Covers"
            >
              <Cloud className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span className="hidden xl:inline">Drive Covers</span>
            </button>

            {/* Cover Scanner & Cropper */}
            <button
              onClick={onOpenScanModal}
              className="flex items-center gap-1.5 p-2 sm:px-2.5 sm:py-1.5 xl:px-3 rounded-lg bg-slate-900 dark:bg-indigo-600 hover:bg-slate-800 dark:hover:bg-indigo-500 text-white text-xs font-medium shadow-xs transition-all active:scale-95 cursor-pointer shrink-0"
              title="Scan & Perspective-Crop Comic Cover with Local OCR"
              aria-label="Cover Scanner"
            >
              <Camera className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Cover Scanner</span>
            </button>

            {/* Add Comic */}
            <button
              onClick={onOpenAddModal}
              className="flex items-center gap-1.5 p-2 sm:px-2.5 sm:py-1.5 lg:px-3 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 font-semibold text-xs shadow-xs transition-all active:scale-95 cursor-pointer shrink-0"
              title="Add New Comic Manually"
              aria-label="Add Comic"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Add Comic</span>
            </button>

            {/* Theme Toggle Button */}
            <button
              onClick={onToggleDarkMode}
              className="p-2 sm:p-1.5 xl:px-2.5 xl:py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-amber-400 border border-slate-200 dark:border-slate-700 font-semibold text-xs shadow-xs transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer shrink-0"
              title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
              aria-label="Toggle dark mode"
            >
              {darkMode ? (
                <Sun className="w-4 h-4 text-amber-400 fill-amber-400/20" />
              ) : (
                <Moon className="w-4 h-4 text-slate-700" />
              )}
              <span className="hidden xl:inline text-xs">
                {darkMode ? 'Light' : 'Dark'}
              </span>
            </button>

            {/* Manage Data (desktop / tablet) */}
            {onOpenDataManagementModal && (
              <button
                onClick={onOpenDataManagementModal}
                className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-800 dark:text-rose-300 text-xs font-semibold shadow-xs transition-all active:scale-95 cursor-pointer shrink-0"
                title="Manage collection data, remove double-imports, or clear data"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                <span className="hidden xl:inline">Manage Data</span>
              </button>
            )}

            {/* Server Settings (desktop) */}
            {onOpenServerSettings && (
              <button
                onClick={onOpenServerSettings}
                className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-800 dark:text-indigo-300 text-xs font-semibold shadow-xs transition-all active:scale-95 cursor-pointer shrink-0"
                title="Configure Backend Server Host (WiFi / Cloud)"
              >
                <Server className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span className="hidden xl:inline">Server</span>
              </button>
            )}

            {/* Mobile More Options Menu */}
            {(onOpenDataManagementModal || onOpenServerSettings) && (
              <div className="relative md:hidden shrink-0">
                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-xs shadow-xs transition-all active:scale-95 cursor-pointer flex items-center justify-center"
                  title="More options"
                  aria-label="More options"
                >
                  <MoreVertical className="w-3.5 h-3.5" />
                </button>
                {isMobileMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setIsMobileMenuOpen(false)}
                    />
                    <div className="absolute right-0 mt-1.5 w-44 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                      {onOpenDataManagementModal && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsMobileMenuOpen(false);
                            onOpenDataManagementModal();
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 text-left transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5 shrink-0" />
                          <span>Manage Data</span>
                        </button>
                      )}
                      {onOpenServerSettings && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsMobileMenuOpen(false);
                            onOpenServerSettings();
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 text-left transition-colors cursor-pointer"
                        >
                          <Server className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                          <span>Server Settings</span>
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-2 pb-2 gap-2 sm:gap-4 min-w-0">
          <nav className="flex items-center gap-1 overflow-x-auto scrollbar-none min-w-0 py-0.5">
            <button
              onClick={() => setActiveTab('catalog')}
              className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 xl:px-3.5 py-1.5 rounded-md text-xs font-medium transition-all shrink-0 ${
                activeTab === 'catalog'
                  ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Catalog<span className="hidden sm:inline lg:hidden xl:inline"> View</span></span>
            </button>

            <button
              onClick={() => setActiveTab('shopping')}
              className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 xl:px-3.5 py-1.5 rounded-md text-xs font-medium transition-all shrink-0 ${
                activeTab === 'shopping'
                  ? 'bg-rose-700 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-rose-600 dark:hover:text-rose-400'
              }`}
            >
              <ShoppingCart className="w-4 h-4 text-rose-500" />
              <span>Wishlist Hunter</span>
              {wishlistCount !== undefined && wishlistCount > 0 && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                    activeTab === 'shopping'
                      ? 'bg-white text-rose-700'
                      : 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                  }`}
                >
                  {wishlistCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('boxes')}
              className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 xl:px-3.5 py-1.5 rounded-md text-xs font-medium transition-all shrink-0 ${
                activeTab === 'boxes'
                  ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Boxes className="w-4 h-4" />
              <span>Storage Boxes</span>
            </button>

            <button
              onClick={() => setActiveTab('challenge')}
              className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 xl:px-3.5 py-1.5 rounded-md text-xs font-medium transition-all shrink-0 ${
                activeTab === 'challenge'
                  ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Trophy className="w-4 h-4 text-amber-500" />
              <span>Reading Challenge</span>
            </button>

            <button
              onClick={() => setActiveTab('stats')}
              className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 xl:px-3.5 py-1.5 rounded-md text-xs font-medium transition-all shrink-0 ${
                activeTab === 'stats'
                  ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span><span className="hidden sm:inline lg:hidden xl:inline">Reading & </span>Box Stats</span>
            </button>

            <button
              onClick={() => setActiveTab('sheets')}
              className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 xl:px-3.5 py-1.5 rounded-md text-xs font-medium transition-all shrink-0 ${
                activeTab === 'sheets'
                  ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
              <span><span className="hidden sm:inline lg:hidden xl:inline">Google </span>Sheets Importer</span>
            </button>

            <button
              onClick={() => setActiveTab('database')}
              className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 xl:px-3.5 py-1.5 rounded-md text-xs font-medium transition-all shrink-0 ${
                activeTab === 'database'
                  ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Database className="w-4 h-4 text-amber-500" />
              <span><span className="hidden sm:inline lg:hidden xl:inline">DB </span>Schema & Export</span>
            </button>
          </nav>

          {/* Quick Stats Pill */}
          <div className="hidden lg:flex items-center gap-2.5 text-xs text-slate-500 dark:text-slate-400 font-medium shrink-0 pl-3 border-l border-slate-200 dark:border-slate-800">
            <div className="whitespace-nowrap">
              <span className="hidden xl:inline">Total </span>Titles: <span className="text-slate-900 dark:text-slate-100 font-bold">{totalComicsCount}</span>
            </div>
            {fullRunsCount !== undefined && totalRunsCount !== undefined && (
              <>
                <div className="text-slate-300 dark:text-slate-700">•</div>
                <button
                  type="button"
                  onClick={onNavigateToStats}
                  className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/50 font-bold text-xs transition-colors cursor-pointer shrink-0 whitespace-nowrap active:scale-95"
                  title={`${fullRunsCount} of ${totalRunsCount} series runs 100% complete (${totalRunsCount > 0 ? Math.round((fullRunsCount / totalRunsCount) * 100) : 0}%) — Click to view Series Run Completion tracking in Stats`}
                >
                  <Trophy className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>Runs<span className="hidden xl:inline">:</span></span>
                  <span className="text-amber-700 dark:text-amber-300 font-bold">
                    <strong>{fullRunsCount}</strong><span className="hidden xl:inline">/{totalRunsCount}</span>
                  </span>
                </button>
              </>
            )}
          </div>
        </div>

      </div>
    </header>
  );
};
