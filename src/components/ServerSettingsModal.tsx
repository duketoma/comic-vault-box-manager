import React, { useState, useEffect } from 'react';
import {
  X,
  Server,
  CheckCircle2,
  XCircle,
  Loader2,
  Wifi,
  WifiOff,
  Save,
  RotateCcw,
  Smartphone,
  RefreshCw,
  Database,
  Clock,
  ArrowUpDown,
} from 'lucide-react';
import { getApiBaseUrl, setApiBaseUrl, testApiConnection } from '../services/apiConfig';
import { SyncStatusState } from '../services/syncService';
import { isNativeMobile } from '../utils/nativeHardware';

interface ServerSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
  syncStatus?: SyncStatusState;
  onSyncNow?: (options?: { forceFull?: boolean }) => Promise<void>;
}

export const ServerSettingsModal: React.FC<ServerSettingsModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  syncStatus,
  onSyncNow,
}) => {
  const [serverUrl, setServerUrl] = useState<string>('');
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testResult, setTestResult] = useState<{ latencyMs?: number; error?: string } | null>(null);
  const [isManualSyncing, setIsManualSyncing] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setServerUrl(getApiBaseUrl());
      setTestStatus('idle');
      setTestResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTest = async () => {
    setTestStatus('testing');
    setTestResult(null);

    const result = await testApiConnection(serverUrl);
    if (result.success) {
      setTestStatus('success');
      setTestResult({ latencyMs: result.latencyMs });
    } else {
      setTestStatus('error');
      setTestResult({ latencyMs: result.latencyMs, error: result.error });
    }
  };

  const handleSave = () => {
    setApiBaseUrl(serverUrl);
    if (onSaved) {
      onSaved();
    }
    onClose();
  };

  const handleResetDefault = () => {
    const defaultHost = isNativeMobile() ? 'http://10.0.2.2:3000' : '';
    setServerUrl(defaultHost);
  };

  const handleTriggerSync = async (forceFull = false) => {
    if (!onSyncNow || isManualSyncing) return;
    // Save URL first in case the user edited the host input before clicking Sync Now
    setApiBaseUrl(serverUrl);
    setIsManualSyncing(true);
    try {
      await onSyncNow({ forceFull });
    } finally {
      setIsManualSyncing(false);
    }
  };

  const connectionState = syncStatus?.connectionState || 'online';
  const pendingCount = syncStatus?.pendingCount || 0;
  const pendingOutbox = syncStatus?.pendingOutbox || [];
  const lastSyncFormatted = syncStatus?.lastSyncAt
    ? new Date(syncStatus.lastSyncAt).toLocaleString()
    : 'Not synced yet';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden text-slate-800 dark:text-slate-100">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base">Offline Sync & PC Connection</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Local IndexedDB storage & Wi-Fi PostgreSQL synchronization
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 sm:p-5 space-y-4 text-xs overflow-y-auto">
          
          {/* Live Sync & Offline Storage Card */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {connectionState === 'syncing' || isManualSyncing ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 font-bold text-[11px]">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Syncing with PC...
                  </span>
                ) : connectionState === 'offline' ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 font-bold text-[11px]">
                    <WifiOff className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                    Offline Mode (Local DB Active)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 font-bold text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    Connected to Home PC
                  </span>
                )}
              </div>

              <span
                className={`px-2 py-0.5 rounded-md font-bold text-[11px] border ${
                  pendingCount > 0
                    ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                }`}
              >
                {pendingCount} Pending {pendingCount === 1 ? 'Change' : 'Changes'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-[11px] text-slate-600 dark:text-slate-300">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>
                  Last Synced: <strong className="text-slate-800 dark:text-slate-100">{lastSyncFormatted}</strong>
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                <span>
                  Local Engine: <strong className="text-slate-800 dark:text-slate-100">IndexedDB (Offline Ready)</strong>
                </span>
              </div>
            </div>

            {syncStatus?.lastSyncSummary && (
              <div className="p-2 rounded-lg bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200/70 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300 text-[11px] font-medium flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>{syncStatus.lastSyncSummary}</span>
              </div>
            )}

            {/* Pending Offline Mutations List */}
            {pendingOutbox.length > 0 && (
              <div className="pt-1">
                <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Queued Offline Changes (will auto-sync on home Wi-Fi):
                </div>
                <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
                  {pendingOutbox.slice(0, 25).map((item) => (
                    <div
                      key={item.entityKey}
                      className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px]"
                    >
                      <span className="font-semibold truncate text-slate-800 dark:text-slate-200">
                        {item.label || item.entityKey}
                      </span>
                      <span
                        className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                          item.operation === 'DELETE'
                            ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                            : item.baseStatus === 'Wishlist'
                            ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                            : 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
                        }`}
                      >
                        {item.operation === 'DELETE'
                          ? 'DELETE'
                          : item.baseStatus === 'Wishlist'
                          ? 'PURCHASED'
                          : 'UPDATED'}
                      </span>
                    </div>
                  ))}
                  {pendingOutbox.length > 25 && (
                    <div className="text-[10px] text-slate-500 text-center py-1">
                      + {pendingOutbox.length - 25} more queued change(s)
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Manual Sync Action Buttons */}
            {onSyncNow && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleTriggerSync(false)}
                  disabled={isManualSyncing || connectionState === 'syncing'}
                  className="flex-1 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95 shadow-xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isManualSyncing || connectionState === 'syncing' ? 'animate-spin' : ''}`} />
                  <span>Sync Now {pendingCount > 0 ? `(${pendingCount})` : ''}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleTriggerSync(true)}
                  disabled={isManualSyncing || connectionState === 'syncing'}
                  className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 text-slate-700 dark:text-slate-300 font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                  title="Push pending changes and pull a complete fresh snapshot from PC PostgreSQL"
                >
                  <ArrowUpDown className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Full Re-Sync</span>
                </button>
              </div>
            )}
          </div>

          {isNativeMobile() && (
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex items-start gap-2.5">
              <Smartphone className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
              <div className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
                Running in <strong>Android native mode</strong>. Point to your computer&apos;s home Wi-Fi IP (e.g.,{' '}
                <code className="font-mono bg-slate-200 dark:bg-slate-700 px-1 py-0.5 rounded">
                  http://192.168.1.100:3000
                </code>
                ). While shopping away from home, all edits &amp; purchases save locally in IndexedDB and sync automatically when you return to Wi-Fi.
              </div>
            </div>
          )}

          <div>
            <label className="block font-semibold mb-1.5 text-slate-700 dark:text-slate-300">
              Home PC Server Host URL
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder={isNativeMobile() ? 'http://192.168.1.100:3000' : 'http://localhost:3000 (or leave empty)'}
                value={serverUrl}
                onChange={(e) => {
                  setServerUrl(e.target.value);
                  setTestStatus('idle');
                }}
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-mono text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 transition-all"
              />
            </div>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Leave empty for same-origin relative URLs in desktop browser.
            </p>
          </div>

          {/* Test Status Banner */}
          {testStatus !== 'idle' && (
            <div
              className={`p-3 rounded-xl border flex items-center justify-between text-xs font-medium transition-all ${
                testStatus === 'testing'
                  ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                  : testStatus === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                  : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
              }`}
            >
              <div className="flex items-center gap-2">
                {testStatus === 'testing' && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
                {testStatus === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                {testStatus === 'error' && <XCircle className="w-4 h-4 text-rose-500" />}
                <span>
                  {testStatus === 'testing' && 'Pinging home PC server...'}
                  {testStatus === 'success' && `Connected to PC successfully! (${testResult?.latencyMs}ms)`}
                  {testStatus === 'error' && (testResult?.error || 'PC unreachable (Offline Mode remains active)')}
                </span>
              </div>
            </div>
          )}

          {/* Action Row */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={handleResetDefault}
              className="text-[11px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1 cursor-pointer transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Reset Default
            </button>

            <button
              type="button"
              onClick={handleTest}
              disabled={testStatus === 'testing'}
              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-all"
            >
              <Wifi className="w-3.5 h-3.5 text-indigo-500" />
              Test Connection
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-700 text-xs font-semibold cursor-pointer transition-colors"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
          >
            <Save className="w-3.5 h-3.5" />
            Save &amp; Sync
          </button>
        </div>

      </div>
    </div>
  );
};
