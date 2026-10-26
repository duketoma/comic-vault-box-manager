import { buildApiUrl } from './apiConfig';
import {
  applyServerSyncResponse,
  clearLastSyncTimestamp,
  loadLocalSnapshot,
  LocalDbSnapshot,
  SyncMutation,
  SyncServerResponse,
} from './localDbService';

export interface SyncStatusState {
  connectionState: 'online' | 'offline' | 'syncing';
  pendingCount: number;
  pendingOutbox: SyncMutation[];
  lastSyncAt: string | null;
  lastSyncError: string | null;
  lastSyncSummary: string | null;
}

export interface SyncExecutionResult {
  success: boolean;
  snapshot?: LocalDbSnapshot;
  pushedCount: number;
  pulledCount: number;
  isFullSync: boolean;
  error?: string;
}

let activeSyncPromise: Promise<SyncExecutionResult> | null = null;
let reSyncQueued = false;

/**
 * Checks if the home PC Express server is currently reachable.
 */
export async function checkServerReachable(timeoutMs = 3500): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(buildApiUrl('/api/health'), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res.ok;
  } catch {
    clearTimeout(timer);
    return false;
  }
}

/**
 * Executes a bidirectional delta (or full) sync with the home PC PostgreSQL backend.
 * Safe against concurrent invocations: if a sync is already in flight, queues a follow-up pass.
 */
export async function performBidirectionalSync(options?: {
  forceFull?: boolean;
  onStatusChange?: (status: Partial<SyncStatusState>) => void;
  onSnapshotUpdated?: (snapshot: LocalDbSnapshot, summary: string) => void;
}): Promise<SyncExecutionResult> {
  if (activeSyncPromise) {
    reSyncQueued = true;
    return activeSyncPromise;
  }

  activeSyncPromise = executeSyncPass(options).finally(() => {
    activeSyncPromise = null;
    if (reSyncQueued) {
      reSyncQueued = false;
      void performBidirectionalSync(options);
    }
  });

  return activeSyncPromise;
}

async function executeSyncPass(options?: {
  forceFull?: boolean;
  onStatusChange?: (status: Partial<SyncStatusState>) => void;
  onSnapshotUpdated?: (snapshot: LocalDbSnapshot, summary: string) => void;
}): Promise<SyncExecutionResult> {
  try {
    if (options?.forceFull) {
      await clearLastSyncTimestamp();
    }

    const localSnapshot = await loadLocalSnapshot();
    const mutationsToPush = localSnapshot.outbox;
    const effectiveLastSyncAt = options?.forceFull ? null : localSnapshot.lastSyncAt;

    // Quick reachability check so offline mode at a comic shop fails fast without hanging
    const reachable = await checkServerReachable(3500);
    if (!reachable) {
      options?.onStatusChange?.({
        connectionState: 'offline',
        pendingCount: mutationsToPush.length,
        pendingOutbox: mutationsToPush,
        lastSyncAt: localSnapshot.lastSyncAt,
      });
      return {
        success: false,
        pushedCount: 0,
        pulledCount: 0,
        isFullSync: false,
        error: 'Home PC server is currently unreachable (Offline Mode active).',
      };
    }

    options?.onStatusChange?.({
      connectionState: 'syncing',
      pendingCount: mutationsToPush.length,
      pendingOutbox: mutationsToPush,
      lastSyncError: null,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(buildApiUrl('/api/sync'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lastSyncAt: effectiveLastSyncAt,
        mutations: mutationsToPush,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(errBody.error || `Sync failed with HTTP ${response.status}`);
    }

    const syncData = (await response.json()) as SyncServerResponse;
    const updatedSnapshot = await applyServerSyncResponse(syncData, mutationsToPush);

    const pulledComicsCount = (syncData.comics?.length || 0) + (syncData.deletedComicIds?.length || 0);
    const pulledBoxesCount = (syncData.boxes?.length || 0) + (syncData.deletedBoxIds?.length || 0);
    const pulledTotal = pulledComicsCount + pulledBoxesCount;
    const pushedCount = syncData.pushedCount || mutationsToPush.length;

    let summary = 'Synced with PC';
    if (syncData.isFullSync) {
      summary =
        pushedCount > 0
          ? `Pushed ${pushedCount} offline change(s) & synced ${updatedSnapshot.comics.length} comics`
          : `Full sync complete (${updatedSnapshot.comics.length} comics)`;
    } else if (pushedCount > 0 && pulledTotal > 0) {
      summary = `Pushed ${pushedCount} mobile change(s) • Pulled ${pulledTotal} PC update(s)`;
    } else if (pushedCount > 0) {
      summary = `Synced ${pushedCount} offline change(s) to PC`;
    } else if (pulledTotal > 0) {
      summary = `Pulled ${pulledTotal} update(s) from PC`;
    }

    options?.onStatusChange?.({
      connectionState: 'online',
      pendingCount: updatedSnapshot.outbox.length,
      pendingOutbox: updatedSnapshot.outbox,
      lastSyncAt: updatedSnapshot.lastSyncAt,
      lastSyncError: null,
      lastSyncSummary: summary,
    });

    options?.onSnapshotUpdated?.(updatedSnapshot, summary);

    return {
      success: true,
      snapshot: updatedSnapshot,
      pushedCount,
      pulledCount: pulledTotal,
      isFullSync: syncData.isFullSync,
    };
  } catch (err: any) {
    const fallbackSnapshot = await loadLocalSnapshot();
    const errorMsg = err?.name === 'AbortError' ? 'Sync timed out' : err?.message || 'Unable to reach PC server';

    options?.onStatusChange?.({
      connectionState: 'offline',
      pendingCount: fallbackSnapshot.outbox.length,
      pendingOutbox: fallbackSnapshot.outbox,
      lastSyncAt: fallbackSnapshot.lastSyncAt,
      lastSyncError: errorMsg,
    });

    return {
      success: false,
      pushedCount: 0,
      pulledCount: 0,
      isFullSync: false,
      error: errorMsg,
    };
  }
}
