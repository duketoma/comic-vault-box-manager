import React, { useState } from 'react';
import {
  X,
  ShieldCheck,
  Crown,
  Sparkles,
  User as UserIcon,
  LogOut,
  HardDrive,
  Activity,
  Cloud,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthChanged?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onAuthChanged }) => {
  const { firebaseUser, userProfile, isAdmin, vipTier, signInWithGoogle, signOutUser, refreshProfile } =
    useAuth();
  const [isBusy, setIsBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSignIn = async () => {
    setIsBusy(true);
    setErrorMsg(null);
    try {
      await signInWithGoogle();
      onAuthChanged?.();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Sign-in was cancelled or failed.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleSignOut = async () => {
    setIsBusy(true);
    setErrorMsg(null);
    try {
      await signOutUser();
      onAuthChanged?.();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to sign out.');
    } finally {
      setIsBusy(false);
    }
  };

  const tierLabel = isAdmin
    ? 'Creator Admin'
    : vipTier === 'archivist'
      ? 'Archivist VIP (Tier 2)'
      : vipTier === 'collector'
        ? 'Collector VIP (Tier 1)'
        : 'Free Tier';

  const readLimitText =
    isAdmin || vipTier === 'archivist'
      ? 'Unlimited'
      : vipTier === 'collector'
        ? `${userProfile.dailyUsage?.readsCount || 0} / 1,000`
        : `${userProfile.dailyUsage?.readsCount || 0} / 100`;

  const writeLimitText =
    isAdmin || vipTier === 'archivist'
      ? 'Unlimited'
      : vipTier === 'collector'
        ? `${userProfile.dailyUsage?.writesCount || 0} / 500`
        : `${userProfile.dailyUsage?.writesCount || 0} / 50`;

  const storageMbUsed = ((userProfile.storageBytesUsed || 0) / (1024 * 1024)).toFixed(2);
  const storageLimitText = isAdmin
    ? `${storageMbUsed} MB (Unlimited Admin + Google Drive)`
    : vipTier === 'archivist'
      ? `${storageMbUsed} / 500 MB`
      : vipTier === 'collector'
        ? `${storageMbUsed} / 100 MB`
        : 'External URL / Personal Google Drive Only';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden text-slate-900 dark:text-slate-100">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-600 text-white shadow-xs">
              {isAdmin ? <ShieldCheck className="w-5 h-5" /> : <Crown className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
                Account & Cloud Tier Status
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Multi-User Cloud Firestore & Two-Tier Cover Architecture
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Account Modal"
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Identity Card */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              {firebaseUser?.photoURL || userProfile.avatarUrl ? (
                <img
                  src={firebaseUser?.photoURL || userProfile.avatarUrl || ''}
                  alt={userProfile.displayName}
                  className="w-11 h-11 rounded-full object-cover border border-slate-300 dark:border-slate-700 shrink-0"
                />
              ) : (
                <div className="w-11 h-11 rounded-full bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-bold text-sm shrink-0">
                  <UserIcon className="w-5 h-5" />
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">
                    {firebaseUser?.displayName || userProfile.displayName}
                  </h4>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      isAdmin
                        ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                        : vipTier !== 'free'
                          ? 'bg-indigo-100 dark:bg-indigo-950/80 text-indigo-800 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <Sparkles className="w-2.5 h-2.5" />
                    {tierLabel}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  {firebaseUser?.email || userProfile.email}
                </p>
              </div>
            </div>

            {firebaseUser ? (
              <button
                type="button"
                onClick={handleSignOut}
                disabled={isBusy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors cursor-pointer shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSignIn}
                disabled={isBusy}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer shrink-0"
              >
                <Cloud className="w-3.5 h-3.5" />
                <span>{isBusy ? 'Signing In...' : 'Sign In with Google'}</span>
              </button>
            )}
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Quota & Storage Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                <Activity className="w-3.5 h-3.5 text-indigo-500" />
                <span>Daily Sync Reads</span>
              </div>
              <div className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-1">
                {readLimitText}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                <Activity className="w-3.5 h-3.5 text-emerald-500" />
                <span>Daily Sync Writes</span>
              </div>
              <div className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-1">
                {writeLimitText}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                <HardDrive className="w-3.5 h-3.5 text-amber-500" />
                <span>Override Storage</span>
              </div>
              <div className="text-xs font-bold text-slate-900 dark:text-slate-100 mt-1 truncate" title={storageLimitText}>
                {storageLimitText}
              </div>
            </div>
          </div>

          {/* Two-Tier Cover Architecture Explanation */}
          <div className="p-4 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-900/60 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-indigo-950 dark:text-indigo-200">
              <CheckCircle2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span>Two-Tier Cover Storage Active</span>
            </div>
            <p className="text-xs text-indigo-900/80 dark:text-indigo-300/80 leading-relaxed">
              The shared Master Catalog uses lightweight compressed <strong>.webp</strong> covers in Firebase Cloud Storage (~45 KB per cover), while your personal collection preserves high-resolution Google Drive and custom overrides (<strong>coverImageOverride</strong>) without exposing private Drive links to other users.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <button
            type="button"
            onClick={() => void refreshProfile()}
            className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
          >
            Refresh Quota Status
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold hover:opacity-90 transition-opacity cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
