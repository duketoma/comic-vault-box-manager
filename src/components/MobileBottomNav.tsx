import React from 'react';
import { 
  BookOpen, 
  Boxes, 
  BarChart3, 
  ShoppingCart, 
  Camera, 
  Server,
  Plus,
  Trophy
} from 'lucide-react';

interface MobileBottomNavProps {
  activeTab: 'catalog' | 'boxes' | 'challenge' | 'stats' | 'sheets' | 'database' | 'shopping';
  setActiveTab: (tab: 'catalog' | 'boxes' | 'challenge' | 'stats' | 'sheets' | 'database' | 'shopping') => void;
  onOpenScanModal: () => void;
  onOpenAddModal: () => void;
  onOpenServerSettings: () => void;
  wishlistCount?: number;
  connectionState?: 'online' | 'offline' | 'syncing';
  pendingSyncCount?: number;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  setActiveTab,
  onOpenScanModal,
  onOpenAddModal,
  onOpenServerSettings,
  wishlistCount,
  connectionState = 'online',
  pendingSyncCount = 0,
}) => {
  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 shadow-lg px-2 py-1 safe-bottom">
      <div className="flex items-center justify-around h-14">
        
        {/* Catalog */}
        <button
          onClick={() => setActiveTab('catalog')}
          className={`flex flex-col items-center justify-center flex-1 py-1 rounded-lg transition-colors cursor-pointer ${
            activeTab === 'catalog'
              ? 'text-indigo-600 dark:text-indigo-400 font-bold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <BookOpen className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] leading-tight">Catalog</span>
        </button>

        {/* Boxes */}
        <button
          onClick={() => setActiveTab('boxes')}
          className={`flex flex-col items-center justify-center flex-1 py-1 rounded-lg transition-colors cursor-pointer ${
            activeTab === 'boxes'
              ? 'text-indigo-600 dark:text-indigo-400 font-bold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Boxes className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] leading-tight">Boxes</span>
        </button>

        {/* Center Quick Scan Action */}
        <div className="flex items-center justify-center px-1">
          <button
            onClick={onOpenScanModal}
            className="w-11 h-11 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center shadow-md active:scale-95 transition-all -mt-3 border-2 border-white dark:border-slate-900 cursor-pointer"
            title="Scan Comic Cover"
          >
            <Camera className="w-5 h-5" />
          </button>
        </div>

        {/* Wishlist Hunter */}
        <button
          onClick={() => setActiveTab('shopping')}
          className={`relative flex flex-col items-center justify-center flex-1 py-1 rounded-lg transition-colors cursor-pointer ${
            activeTab === 'shopping'
              ? 'text-rose-600 dark:text-rose-400 font-bold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <ShoppingCart className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] leading-tight">Hunter</span>
          {wishlistCount !== undefined && wishlistCount > 0 && (
            <span className="absolute top-0 right-3 min-w-4 h-4 px-1 rounded-full bg-rose-600 text-white font-bold text-[9px] flex items-center justify-center">
              {wishlistCount}
            </span>
          )}
        </button>

        {/* Challenge */}
        <button
          onClick={() => setActiveTab('challenge')}
          className={`flex flex-col items-center justify-center flex-1 py-1 rounded-lg transition-colors cursor-pointer ${
            activeTab === 'challenge'
              ? 'text-amber-500 dark:text-amber-400 font-bold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
          title="Reading Challenge"
        >
          <Trophy className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] leading-tight">Challenge</span>
        </button>

        {/* Stats */}
        <button
          onClick={() => setActiveTab('stats')}
          className={`flex flex-col items-center justify-center flex-1 py-1 rounded-lg transition-colors cursor-pointer ${
            activeTab === 'stats'
              ? 'text-indigo-600 dark:text-indigo-400 font-bold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <BarChart3 className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] leading-tight">Stats</span>
        </button>

        {/* Connection / Settings */}
        <button
          onClick={onOpenServerSettings}
          className="relative flex flex-col items-center justify-center flex-1 py-1 rounded-lg transition-colors cursor-pointer text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
          title="Sync & Server Settings"
        >
          <Server
            className={`w-5 h-5 mb-0.5 ${
              connectionState === 'syncing'
                ? 'text-blue-500 animate-pulse'
                : connectionState === 'offline'
                ? 'text-amber-500'
                : 'text-emerald-500'
            }`}
          />
          <span className="text-[10px] leading-tight">
            {pendingSyncCount > 0 ? `Sync (${pendingSyncCount})` : 'Sync'}
          </span>
          {pendingSyncCount > 0 ? (
            <span className="absolute top-0 right-2.5 min-w-4 h-4 px-1 rounded-full bg-amber-500 text-slate-950 font-black text-[9px] flex items-center justify-center">
              {pendingSyncCount}
            </span>
          ) : (
            <span
              className={`absolute top-1 right-3.5 w-2 h-2 rounded-full ${
                connectionState === 'syncing'
                  ? 'bg-blue-500 animate-ping'
                  : connectionState === 'offline'
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
              }`}
            />
          )}
        </button>

      </div>
    </div>
  );
};
