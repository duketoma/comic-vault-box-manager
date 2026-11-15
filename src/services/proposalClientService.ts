import { buildApiUrl } from './apiConfig';
import { getAuthHeaders } from './auth';

export type ProposalType = 'cover_image' | 'metadata_edit' | 'new_comic';
export type ProposalStatus =
  | 'pending'
  | 'promoting'
  | 'approved'
  | 'rejected'
  | 'vetoed'
  | 'rolled_back';

export interface CatalogProposal {
  id: string;
  proposerId: string;
  proposerDisplayName: string;
  proposerRole: 'user' | 'admin';
  masterComicId: string | null;
  proposalType: ProposalType;
  proposedChanges: {
    coverTarget?: 'front' | 'full';
    stagedUrl?: string;
    stagedStoragePath?: string;
    sizeBytes?: number;
    fields?: Record<string, any>;
  };
  masterSnapshot: Record<string, any> | null;
  currentMaster?: Record<string, any> | null;
  reason: string | null;
  status: ProposalStatus;
  netVotes: number;
  upvotesCount: number;
  downvotesCount: number;
  myVote?: number;
  approvalRatio?: number;
  expiresAt: string;
  reviewedBy: string | null;
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserSummary {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: 'user' | 'admin';
  vipTier: 'free' | 'collector' | 'archivist';
  vipExpiresAt: string | null;
  isBannedFromProposals: boolean;
  storageBytesUsed: number;
  createdAt: string | null;
}

export interface ModerationAuditLog {
  id: string;
  actorId: string;
  action: string;
  proposalId: string | null;
  targetUserId: string | null;
  details: Record<string, any>;
  createdAt: string;
}

async function request(path: string, options?: RequestInit) {
  const url = buildApiUrl(path);
  const authHeaders = await getAuthHeaders();
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request failed with status ${response.status}`);
  }
  return response.json();
}

/**
 * Fetch proposals feed.
 * status: 'pending' (default) | 'closed' | 'all' | 'approved' | 'rejected' | 'vetoed' | 'rolled_back'
 */
export async function fetchProposals(
  status = 'pending',
  limit = 50
): Promise<{ proposals: CatalogProposal[]; count: number }> {
  return request(`/api/proposals?status=${encodeURIComponent(status)}&limit=${limit}`);
}

/**
 * Submit a community proposal.
 */
export async function submitProposal(payload: {
  proposalType: ProposalType;
  masterComicId?: string;
  proposedChanges?: Record<string, any>;
  coverTarget?: 'front' | 'full';
  imageBufferBase64?: string;
  reason?: string;
}): Promise<{ proposal: CatalogProposal }> {
  return request('/api/proposals', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Cast a vote on a proposal (+1 upvote, -1 downvote, 0 retract).
 */
export async function castProposalVote(
  proposalId: string,
  vote: 1 | -1 | 0
): Promise<{ proposal: CatalogProposal; promoted: boolean }> {
  return request(`/api/proposals/${encodeURIComponent(proposalId)}/vote`, {
    method: 'POST',
    body: JSON.stringify({ vote }),
  });
}

/**
 * Admin action on a proposal (approve, reject, veto, rollback).
 */
export async function adminProposalAction(
  proposalId: string,
  action: 'approve' | 'reject' | 'veto' | 'rollback',
  notes?: string
): Promise<{ proposal: CatalogProposal }> {
  return request(`/api/proposals/${encodeURIComponent(proposalId)}/admin-action`, {
    method: 'POST',
    body: JSON.stringify({ action, notes }),
  });
}

/**
 * Admin: List registered users with search.
 */
export async function fetchAdminUsers(search = ''): Promise<{ users: AdminUserSummary[] }> {
  return request(`/api/admin/users?q=${encodeURIComponent(search)}`);
}

/**
 * Admin: Update user VIP tier or proposal ban.
 */
export async function updateAdminUser(
  uid: string,
  updates: { vipTier?: 'free' | 'collector' | 'archivist'; isBannedFromProposals?: boolean }
): Promise<{ user: AdminUserSummary }> {
  return request(`/api/admin/users/${encodeURIComponent(uid)}`, {
    method: 'POST',
    body: JSON.stringify(updates),
  });
}

/**
 * Admin: Fetch moderation audit logs.
 */
export async function fetchAdminAuditLogs(
  limit = 100
): Promise<{ logs: ModerationAuditLog[] }> {
  return request(`/api/admin/audit-logs?limit=${limit}`);
}
