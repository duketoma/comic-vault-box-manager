import {
  ChallengeInsightsResponse,
  ChallengeHistorySummary,
  CreateReadingChallengeRequest,
  PreviewChallengeRequest,
  PreviewChallengeResponse,
  ReadingChallengeSummary,
} from '../types/readingChallenge.types';
import { buildApiUrl } from './apiConfig';

const LOCAL_STORAGE_ACTIVE_CHALLENGE_KEY = 'cv_reading_challenge_active';
const LOCAL_STORAGE_HISTORY_KEY = 'cv_reading_challenge_history';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });

  if (!response.ok) {
    let errorMsg = `Request failed with status ${response.status}`;
    try {
      const body = await response.json();
      if (body.error) errorMsg = body.error;
    } catch {}
    throw new Error(errorMsg);
  }

  return response.json();
}

/**
 * Preview eligible comics matching criteria.
 */
export async function previewChallenge(req: PreviewChallengeRequest): Promise<PreviewChallengeResponse> {
  try {
    return await fetchJson<PreviewChallengeResponse>(buildApiUrl('/api/reading-challenges/preview'), {
      method: 'POST',
      body: JSON.stringify(req),
    });
  } catch (err: any) {
    console.warn('API preview challenge failed, attempting local fallback:', err);
    throw err;
  }
}

/**
 * Creates and starts a new challenge.
 */
export async function createChallenge(req: CreateReadingChallengeRequest): Promise<ReadingChallengeSummary> {
  const result = await fetchJson<ReadingChallengeSummary>(buildApiUrl('/api/reading-challenges'), {
    method: 'POST',
    body: JSON.stringify(req),
  });
  try {
    localStorage.setItem(LOCAL_STORAGE_ACTIVE_CHALLENGE_KEY, JSON.stringify(result));
  } catch {}
  return result;
}

/**
 * Retrieves the currently active challenge, or null if none is active.
 */
export async function getActiveChallenge(): Promise<ReadingChallengeSummary | null> {
  try {
    const data = await fetchJson<{ challenge: ReadingChallengeSummary | null }>(buildApiUrl('/api/reading-challenges/active'));
    if (data && data.challenge) {
      try {
        localStorage.setItem(LOCAL_STORAGE_ACTIVE_CHALLENGE_KEY, JSON.stringify(data.challenge));
      } catch {}
      return data.challenge;
    }
    return null;
  } catch (err) {
    console.warn('Unable to reach backend for active challenge, checking localStorage:', err);
    try {
      const cached = localStorage.getItem(LOCAL_STORAGE_ACTIVE_CHALLENGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.status === 'Active') return parsed;
      }
    } catch {}
    return null;
  }
}

/**
 * Marks an item as Read.
 */
export async function markItemRead(challengeId: number, itemId: number, notes?: string): Promise<ReadingChallengeSummary> {
  const result = await fetchJson<ReadingChallengeSummary>(
    buildApiUrl(`/api/reading-challenges/${challengeId}/items/${itemId}/read`),
    {
      method: 'POST',
      body: JSON.stringify({ notes }),
    }
  );
  try {
    localStorage.setItem(LOCAL_STORAGE_ACTIVE_CHALLENGE_KEY, JSON.stringify(result));
  } catch {}
  return result;
}

/**
 * Undoes a Read action (sets status back to Unread).
 */
export async function undoItemRead(challengeId: number, itemId: number): Promise<ReadingChallengeSummary> {
  const result = await fetchJson<ReadingChallengeSummary>(
    buildApiUrl(`/api/reading-challenges/${challengeId}/items/${itemId}/unread`),
    {
      method: 'POST',
    }
  );
  try {
    localStorage.setItem(LOCAL_STORAGE_ACTIVE_CHALLENGE_KEY, JSON.stringify(result));
  } catch {}
  return result;
}

/**
 * Skips an unread comic item.
 */
export async function skipItem(challengeId: number, itemId: number): Promise<ReadingChallengeSummary> {
  const result = await fetchJson<ReadingChallengeSummary>(
    buildApiUrl(`/api/reading-challenges/${challengeId}/items/${itemId}/skip`),
    {
      method: 'POST',
    }
  );
  try {
    localStorage.setItem(LOCAL_STORAGE_ACTIVE_CHALLENGE_KEY, JSON.stringify(result));
  } catch {}
  return result;
}

/**
 * Ends / Abandons the active challenge.
 */
export async function endChallenge(challengeId: number): Promise<ReadingChallengeSummary> {
  const result = await fetchJson<ReadingChallengeSummary>(
    buildApiUrl(`/api/reading-challenges/${challengeId}/end`),
    {
      method: 'POST',
    }
  );
  try {
    localStorage.removeItem(LOCAL_STORAGE_ACTIVE_CHALLENGE_KEY);
  } catch {}
  return result;
}

/**
 * Retrieves milestones insights for a challenge.
 */
export async function getChallengeInsights(challengeId: number): Promise<ChallengeInsightsResponse> {
  return fetchJson<ChallengeInsightsResponse>(buildApiUrl(`/api/reading-challenges/${challengeId}/insights`));
}

/**
 * Retrieves challenge history.
 */
export async function getChallengeHistory(): Promise<ChallengeHistorySummary[]> {
  try {
    const data = await fetchJson<{ history: ChallengeHistorySummary[] }>(buildApiUrl('/api/reading-challenges/history'));
    return data.history || [];
  } catch (err) {
    console.warn('Unable to load challenge history from backend:', err);
    return [];
  }
}
