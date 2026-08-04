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
  Trash2
} from 'lucide-react';

interface NavbarProps {
  activeTab: 'catalog' | 'boxes' | 'stats' | 'sheets' | 'database';
  setActiveTab: (tab: 'catalog' | 'boxes' | 'stats' | 'sheets' | 'database') => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onOpenAddModal: () => void;
  onOpenScanModal: () => void;
  onOpenDriveModal: () => void;
  onOpenDataManagementModal?: () => void;
  totalComicsCount: number;
  totalThicknessUnits: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  searchQuery,
  setSearchQuery,
  onOpenAddModal,
  onOpenScanModal,
  onOpenDriveModal,
  onOpenDataManagementModal,
  totalComicsCount,
  totalThicknessUnits,
}) => {
  return (
    <header className="bg-white border-b border-slate-200 text-slate-800 sticky top-0 z-40 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          
          {/* Logo & Branding */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-9 h-9 rounded-lg bg-slate-900 flex items-center justify-center text-white font-black text-base tracking-wider shadow-sm">
              CV
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-base text-slate-900 leading-none tracking-tight">Comic Archive Pro</h1>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>Cloud DB Connected</span>
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5 font-medium">
                Configurable Storage Box & Collection Manager
              </p>
            </div>
          </div>

          {/* Search Bar */}
          <div className="hidden md:flex flex-1 max-w-md mx-4">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search title, writer, artist, publisher, issue #..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300 focus:bg-white transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {onOpenDataManagementModal && (
              <button
                onClick={onOpenDataManagementModal}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-800 text-xs font-semibold shadow-xs transition-all active:scale-95"
                title="Manage collection data, remove double-imports, or clear data"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                <span className="hidden xl:inline">Manage Data</span>
              </button>
            )}

            <button
              onClick={onOpenDriveModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-800 text-xs font-semibold shadow-xs transition-all active:scale-95"
              title="Sync Google Drive Comic Covers folder & NoImage.png"
            >
              <Cloud className="w-3.5 h-3.5 text-blue-600" />
              <span className="hidden sm:inline">Drive Covers</span>
            </button>

            <button
              onClick={onOpenScanModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium shadow-xs transition-all active:scale-95"
              title="Scan Comic Cover with Gemini AI"
            >
              <Camera className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">AI Cover Scanner</span>
            </button>

            <button
              onClick={onOpenAddModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-200 font-semibold text-xs shadow-xs transition-all active:scale-95"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Add Comic</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-2 pb-2 overflow-x-auto scrollbar-none">
          <nav className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('catalog')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                activeTab === 'catalog'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Catalog View</span>
            </button>

            <button
              onClick={() => setActiveTab('boxes')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                activeTab === 'boxes'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Boxes className="w-4 h-4" />
              <span>Storage Boxes</span>
            </button>

            <button
              onClick={() => setActiveTab('stats')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                activeTab === 'stats'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Reading & Box Stats</span>
            </button>

            <button
              onClick={() => setActiveTab('sheets')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                activeTab === 'sheets'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
              <span>Google Sheets Import</span>
            </button>

            <button
              onClick={() => setActiveTab('database')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                activeTab === 'database'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Database className="w-4 h-4 text-amber-500" />
              <span>DB Schema & Export</span>
            </button>
          </nav>

          {/* Quick Stats Pill */}
          <div className="hidden lg:flex items-center gap-3 text-xs text-slate-500 font-medium shrink-0 pl-4 border-l border-slate-200">
            <div>
              Total Titles: <span className="text-slate-900 font-bold">{totalComicsCount}</span>
            </div>
            <div className="text-slate-300">•</div>
            <div>
              Issue Equivalents: <span className="text-slate-900 font-bold">{totalThicknessUnits.toFixed(1)} units</span>
            </div>
          </div>
        </div>

      </div>
    </header>
  );
};
