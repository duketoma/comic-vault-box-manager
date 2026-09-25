import React from 'react';
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
  ShoppingCart
} from 'lucide-react';

interface NavbarProps {
  activeTab: 'catalog' | 'boxes' | 'stats' | 'sheets' | 'database' | 'shopping';
  setActiveTab: (tab: 'catalog' | 'boxes' | 'stats' | 'sheets' | 'database' | 'shopping') => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onOpenAddModal: () => void;
  onOpenScanModal: () => void;
  onOpenDriveModal: () => void;
  onOpenDataManagementModal?: () => void;
  totalComicsCount: number;
  totalThicknessUnits: number;
  fullRunsCount?: number;
  totalRunsCount?: number;
  wishlistCount?: number;
  onNavigateToStats?: () => void;
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
}) => {
  return (
    <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 sticky top-0 z-40 shadow-xs transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          
          {/* Logo & Branding */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-9 h-9 rounded-lg bg-slate-900 dark:bg-indigo-600 flex items-center justify-center text-white font-black text-base tracking-wider shadow-sm transition-colors">
              CV
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-base text-slate-900 dark:text-white leading-none tracking-tight">Comic Archive Pro</h1>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-md">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>Cloud DB Connected</span>
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
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
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-md text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-300 dark:focus:ring-slate-600 focus:bg-white dark:focus:bg-slate-800 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Theme Toggle Button */}
            <button
              onClick={onToggleDarkMode}
              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-amber-400 border border-slate-200 dark:border-slate-700 font-semibold text-xs shadow-xs transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
              title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
              aria-label="Toggle dark mode"
            >
              {darkMode ? (
                <Sun className="w-4 h-4 text-amber-400 fill-amber-400/20" />
              ) : (
                <Moon className="w-4 h-4 text-slate-700" />
              )}
              <span className="hidden sm:inline text-xs">
                {darkMode ? 'Light' : 'Dark'}
              </span>
            </button>

            {onOpenDataManagementModal && (
              <button
                onClick={onOpenDataManagementModal}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-800 dark:text-rose-300 text-xs font-semibold shadow-xs transition-all active:scale-95"
                title="Manage collection data, remove double-imports, or clear data"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                <span className="hidden xl:inline">Manage Data</span>
              </button>
            )}

            <button
              onClick={onOpenDriveModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-800 dark:text-blue-300 text-xs font-semibold shadow-xs transition-all active:scale-95"
              title="Sync Google Drive Comic Covers folder & NoImage.png"
            >
              <Cloud className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span className="hidden sm:inline">Drive Covers</span>
            </button>

            <button
              onClick={onOpenScanModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-indigo-600 hover:bg-slate-800 dark:hover:bg-indigo-500 text-white text-xs font-medium shadow-xs transition-all active:scale-95"
              title="Scan Comic Cover with Gemini AI"
            >
              <Camera className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">AI Cover Scanner</span>
            </button>

            <button
              onClick={onOpenAddModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 font-semibold text-xs shadow-xs transition-all active:scale-95"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Add Comic</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-2 pb-2 overflow-x-auto scrollbar-none">
          <nav className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('catalog')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                activeTab === 'catalog'
                  ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Catalog View</span>
            </button>

            <button
              onClick={() => setActiveTab('shopping')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-medium transition-all ${
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
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                activeTab === 'boxes'
                  ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Boxes className="w-4 h-4" />
              <span>Storage Boxes</span>
            </button>

            <button
              onClick={() => setActiveTab('stats')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                activeTab === 'stats'
                  ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Reading & Box Stats</span>
            </button>

            <button
              onClick={() => setActiveTab('sheets')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                activeTab === 'sheets'
                  ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
              <span>Google Sheets Import</span>
            </button>

            <button
              onClick={() => setActiveTab('database')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                activeTab === 'database'
                  ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Database className="w-4 h-4 text-amber-500" />
              <span>DB Schema & Export</span>
            </button>
          </nav>

          {/* Quick Stats Pill */}
          <div className="hidden lg:flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 font-medium shrink-0 pl-4 border-l border-slate-200 dark:border-slate-800">
            <div>
              Total Titles: <span className="text-slate-900 dark:text-slate-100 font-bold">{totalComicsCount}</span>
            </div>
            <div className="text-slate-300 dark:text-slate-700">•</div>
            <div>
              Issue Equivalents: <span className="text-slate-900 dark:text-slate-100 font-bold">{totalThicknessUnits.toFixed(1)} units</span>
            </div>
            {fullRunsCount !== undefined && totalRunsCount !== undefined && (
              <>
                <div className="text-slate-300 dark:text-slate-700">•</div>
                <button
                  type="button"
                  onClick={onNavigateToStats}
                  className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/50 font-bold text-xs transition-colors cursor-pointer"
                  title="Click to view Series Run Completion tracking in Stats"
                >
                  <Trophy className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>Runs: <strong>{fullRunsCount}</strong> of <strong>{totalRunsCount}</strong> 100% ({totalRunsCount > 0 ? Math.round((fullRunsCount / totalRunsCount) * 100) : 0}%)</span>
                </button>
              </>
            )}
          </div>
        </div>

      </div>
    </header>
  );
};
