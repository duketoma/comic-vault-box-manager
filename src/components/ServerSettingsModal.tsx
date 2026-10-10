import React, { useState, useEffect } from 'react';
import { 
  X, 
  Server, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  Wifi, 
  Save, 
  RotateCcw,
  Smartphone
} from 'lucide-react';
import { getApiBaseUrl, setApiBaseUrl, testApiConnection } from '../services/apiConfig';
import { isNativeMobile } from '../utils/nativeHardware';

interface ServerSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export const ServerSettingsModal: React.FC<ServerSettingsModalProps> = ({
  isOpen,
  onClose,
  onSaved,
}) => {
  const [serverUrl, setServerUrl] = useState<string>('');
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testResult, setTestResult] = useState<{ latencyMs?: number; error?: string } | null>(null);

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden text-slate-800 dark:text-slate-100">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base">Backend Connection</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Configure Express API server host</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-5 space-y-4 text-xs">
          {isNativeMobile() && (
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex items-start gap-2.5">
              <Smartphone className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
              <div className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
                Running in <strong>Android native mode</strong>. Point to your computer's local WiFi IP (e.g., <code className="font-mono bg-slate-200 dark:bg-slate-700 px-1 py-0.5 rounded">http://192.168.1.100:3000</code>) or an Android emulator host (<code className="font-mono bg-slate-200 dark:bg-slate-700 px-1 py-0.5 rounded">http://10.0.2.2:3000</code>).
              </div>
            </div>
          )}

          <div>
            <label className="block font-semibold mb-1.5 text-slate-700 dark:text-slate-300">
              Server Host URL
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
              Leave empty for same-origin relative URLs in browser.
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
                  {testStatus === 'testing' && 'Pinging backend server...'}
                  {testStatus === 'success' && `Connected successfully! (${testResult?.latencyMs}ms)`}
                  {testStatus === 'error' && (testResult?.error || 'Connection failed')}
                </span>
              </div>
            </div>
          )}

          {/* Action Row */}
          <div className="flex items-center justify-between pt-2">
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
        <div className="flex items-center justify-end gap-2 p-4 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-700 text-xs font-semibold cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
          >
            <Save className="w-3.5 h-3.5" />
            Save & Connect
          </button>
        </div>

      </div>
    </div>
  );
};
