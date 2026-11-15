/**
 * Pure (I/O-free) rules for Community Proposals, Voting Quorum & Moderation.
 *
 * Kept separate from Firestore / Storage side effects so permission checks,
 * quorum math, and metadata sanitization can be unit-tested deterministically.
 */

export type ProposalType = 'cover_image' | 'metadata_edit' | 'new_comic';
export type ProposalStatus =
  | 'pending'
  | 'promoting' // transient claim while the promotion side effects run
  | 'approved'
  | 'rejected'
  | 'vetoed'
  | 'rolled_back';
export type CoverTarget = 'front' | 'full';
export type VipTier = 'free' | 'collector' | 'archivist';

export interface ProposalActor {
  uid: string;
  role: 'user' | 'admin';
  vipTier: VipTier;
  isBannedFromProposals: boolean;
}

/** Auto-promotion requires at least this many net (+up − down) votes... */
export const QUORUM_MIN_NET_VOTES = 5;
/** ...and at least this share of upvotes among all votes cast. */
export const QUORUM_MIN_APPROVAL_RATIO = 0.7;
/** Voting window. Pending proposals that miss quorum by then are rejected as expired. */
export const VOTING_WINDOW_DAYS = 3;
export const VOTING_WINDOW_MS = VOTING_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/** Hard cap on the raw (pre-compression) cover upload accepted for a proposal. */
export const MAX_PROPOSAL_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MAX_PROPOSAL_REASON_LENGTH = 1000;

export const PROPOSAL_TYPES: ProposalType[] = ['cover_image', 'metadata_edit', 'new_comic'];

/**
 * Whitelist of canonical `master_comics` fields that metadata / new-comic proposals may set.
 * Cover URLs, valuation, audit fields and IDs are deliberately excluded.
 */
export const EDITABLE_MASTER_FIELDS = [
  'title',
  'issueNumber',
  'volume',
  'seriesName',
  'fullTitle',
  'publisher',
  'publicationYear',
  'publicationMonth',
  'publicationDate',
  'genre',
  'writer',
  'artist',
  'coverArtist',
  'format',
  'sizeThickness',
  'event',
  'creatorContributions',
  'characterAppearances',
] as const;

export type EditableMasterField = (typeof EDITABLE_MASTER_FIELDS)[number];

const STRING_FIELD_MAX: Partial<Record<EditableMasterField, number>> = {
  title: 500,
  issueNumber: 60,
  volume: 60,
  seriesName: 500,
  fullTitle: 600,
  publisher: 200,
  publicationMonth: 20,
  publicationDate: 40,
  genre: 200,
  writer: 300,
  artist: 300,
  coverArtist: 300,
  format: 100,
  event: 300,
};

const MAX_ARRAY_ENTRIES = 200;

export function isVipTier1OrHigher(actor: Pick<ProposalActor, 'role' | 'vipTier'>): boolean {
  return actor.role === 'admin' || actor.vipTier === 'collector' || actor.vipTier === 'archivist';
}

export function isVipTier2OrHigher(actor: Pick<ProposalActor, 'role' | 'vipTier'>): boolean {
  return actor.role === 'admin' || actor.vipTier === 'archivist';
}

export interface PermissionResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Tier ladder (Section 4): Tier 1 (Collector) may propose covers; Tier 2 (Archivist)
 * may additionally propose metadata edits and new comics. Banned users may not propose.
 */
export function canCreateProposal(actor: ProposalActor, type: ProposalType): PermissionResult {
  if (!PROPOSAL_TYPES.includes(type)) {
    return { allowed: false, reason: `Unknown proposal type "${type}".` };
  }
  if (actor.isBannedFromProposals && actor.role !== 'admin') {
    return { allowed: false, reason: 'Your account has been banned from submitting proposals.' };
  }
  if (type === 'cover_image') {
    return isVipTier1OrHigher(actor)
      ? { allowed: true }
      : { allowed: false, reason: 'Cover proposals require Collector VIP (Tier 1) or higher.' };
  }
  return isVipTier2OrHigher(actor)
    ? { allowed: true }
    : { allowed: false, reason: 'Metadata and new-comic proposals require Archivist VIP (Tier 2).' };
}

/** Tier 1+ may vote. Banned users may not vote, and proposers cannot vote on their own proposal. */
export function canVote(actor: ProposalActor, proposal: { proposerId: string; status: ProposalStatus }): PermissionResult {
  if (!isVipTier1OrHigher(actor)) {
    return { allowed: false, reason: 'Voting requires Collector VIP (Tier 1) or higher.' };
  }
  if (actor.isBannedFromProposals && actor.role !== 'admin') {
    return { allowed: false, reason: 'Your account has been banned from community voting.' };
  }
  if (proposal.proposerId === actor.uid) {
    return { allowed: false, reason: 'You cannot vote on your own proposal.' };
  }
  if (proposal.status !== 'pending') {
    return { allowed: false, reason: `Voting is closed (proposal is ${proposal.status}).` };
  }
  return { allowed: true };
}

export interface VoteTally {
  upvotesCount: number;
  downvotesCount: number;
  netVotes: number;
}

/**
 * Applies a vote change to an existing tally.
 * `previousVote` / `nextVote` are 1, -1, or 0 (no vote / retracted).
 */
export function applyVoteChange(tally: VoteTally, previousVote: number, nextVote: number): VoteTally {
  let up = Math.max(0, Number(tally.upvotesCount) || 0);
  let down = Math.max(0, Number(tally.downvotesCount) || 0);
  if (previousVote === 1) up = Math.max(0, up - 1);
  if (previousVote === -1) down = Math.max(0, down - 1);
  if (nextVote === 1) up += 1;
  if (nextVote === -1) down += 1;
  return { upvotesCount: up, downvotesCount: down, netVotes: up - down };
}

export function approvalRatio(tally: Pick<VoteTally, 'upvotesCount' | 'downvotesCount'>): number {
  const up = Number(tally.upvotesCount) || 0;
  const down = Number(tally.downvotesCount) || 0;
  const total = up + down;
  return total === 0 ? 0 : up / total;
}

export function hasReachedQuorum(tally: VoteTally): boolean {
  return tally.netVotes >= QUORUM_MIN_NET_VOTES && approvalRatio(tally) >= QUORUM_MIN_APPROVAL_RATIO;
}

export type QuorumDecision = 'approve' | 'expire' | 'pending';

/**
 * Decides what should happen to a pending proposal given its tally and the clock.
 * Quorum is checked before expiry, so a vote landing exactly at the deadline still counts.
 */
export function evaluateQuorum(tally: VoteTally, expiresAtIso: string, now: Date = new Date()): QuorumDecision {
  if (hasReachedQuorum(tally)) return 'approve';
  const expiresAt = Date.parse(expiresAtIso);
  if (Number.isFinite(expiresAt) && now.getTime() >= expiresAt) return 'expire';
  return 'pending';
}

export function computeExpiresAt(createdAt: Date = new Date()): string {
  return new Date(createdAt.getTime() + VOTING_WINDOW_MS).toISOString();
}

function sanitizeContributionArray(value: unknown, keys: [string, string]): Array<Record<string, string>> | null {
  if (!Array.isArray(value)) return null;
  const [nameKey, roleKey] = keys;
  return value
    .slice(0, MAX_ARRAY_ENTRIES)
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry: any) => ({
      [nameKey]: String(entry[nameKey] ?? '').trim().slice(0, 300),
      [roleKey]: String(entry[roleKey] ?? '').trim().slice(0, 100),
    }))
    .filter((entry) => entry[nameKey].length > 0);
}

export interface SanitizedChanges {
  changes: Partial<Record<EditableMasterField, unknown>>;
  rejectedFields: string[];
}

/**
 * Filters arbitrary client input down to whitelisted, type-checked master catalog fields.
 * Unknown or invalid fields are reported in `rejectedFields` rather than silently written.
 */
export function sanitizeMasterChanges(input: unknown): SanitizedChanges {
  const changes: Partial<Record<EditableMasterField, unknown>> = {};
  const rejectedFields: string[] = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { changes, rejectedFields };
  }

  for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!(EDITABLE_MASTER_FIELDS as readonly string[]).includes(key)) {
      rejectedFields.push(key);
      continue;
    }
    const field = key as EditableMasterField;

    if (field === 'publicationYear') {
      const year = Number(raw);
      if (Number.isInteger(year) && year >= 1800 && year <= 2200) changes.publicationYear = year;
      else rejectedFields.push(field);
      continue;
    }
    if (field === 'sizeThickness') {
      const thickness = Number(raw);
      if (Number.isFinite(thickness) && thickness > 0 && thickness <= 100) changes.sizeThickness = thickness;
      else rejectedFields.push(field);
      continue;
    }
    if (field === 'creatorContributions') {
      const arr = sanitizeContributionArray(raw, ['creatorName', 'roleName']);
      if (arr) changes.creatorContributions = arr;
      else rejectedFields.push(field);
      continue;
    }
    if (field === 'characterAppearances') {
      const arr = sanitizeContributionArray(raw, ['characterName', 'appearanceType']);
      if (arr) changes.characterAppearances = arr;
      else rejectedFields.push(field);
      continue;
    }

    // Remaining fields are strings (numbers coerced, e.g. issueNumber 300 -> "300")
    if (raw === null || raw === undefined) {
      rejectedFields.push(field);
      continue;
    }
    if (typeof raw !== 'string' && typeof raw !== 'number') {
      rejectedFields.push(field);
      continue;
    }
    const str = String(raw).trim();
    const max = STRING_FIELD_MAX[field] ?? 500;
    if (str.length > max) {
      rejectedFields.push(field);
      continue;
    }
    changes[field] = str;
  }

  return { changes, rejectedFields };
}

/** Required fields for a brand-new master comic. */
export function validateNewComicChanges(changes: Partial<Record<EditableMasterField, unknown>>): PermissionResult {
  const missing = (['title', 'issueNumber', 'publisher'] as const).filter((f) => {
    const v = changes[f];
    return typeof v !== 'string' || v.trim().length === 0;
  });
  return missing.length === 0
    ? { allowed: true }
    : { allowed: false, reason: `New comic proposals require: ${missing.join(', ')}.` };
}

/**
 * Returns only the fields that actually differ from the current master record,
 * so no-op metadata proposals can be rejected up front.
 */
export function diffAgainstMaster(
  changes: Partial<Record<EditableMasterField, unknown>>,
  master: Record<string, unknown>
): Partial<Record<EditableMasterField, unknown>> {
  const diff: Partial<Record<EditableMasterField, unknown>> = {};
  for (const [key, value] of Object.entries(changes)) {
    if (JSON.stringify(master[key] ?? null) !== JSON.stringify(value ?? null)) {
      diff[key as EditableMasterField] = value;
    }
  }
  return diff;
}

/**
 * For rollback: restore `previous` values only where the master field still holds the value
 * this proposal applied. Fields changed afterwards (e.g. by a later proposal or direct edit)
 * are skipped so a rollback never clobbers newer work.
 */
export function computeRollbackPatch(
  applied: Record<string, unknown>,
  previous: Record<string, unknown>,
  currentMaster: Record<string, unknown>
): { patch: Record<string, unknown>; skippedFields: string[] } {
  const patch: Record<string, unknown> = {};
  const skippedFields: string[] = [];
  for (const [key, appliedValue] of Object.entries(applied)) {
    if (JSON.stringify(currentMaster[key] ?? null) === JSON.stringify(appliedValue ?? null)) {
      patch[key] = previous[key] ?? null;
    } else {
      skippedFields.push(key);
    }
  }
  return { patch, skippedFields };
}

export function buildStoragePublicUrl(bucketName: string, storagePath: string, version?: string): string {
  const base = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(storagePath)}?alt=media`;
  return version ? `${base}&v=${encodeURIComponent(version)}` : base;
}

export function proposalStagingPath(proposalId: string): string {
  return `covers/proposals/${proposalId}.webp`;
}

/**
 * Promoted community covers get a proposal-scoped filename instead of overwriting
 * `covers/master/{comicId}.webp`. Master covers are served with 1-year `immutable`
 * cache headers, so overwriting in place would leave browsers/CDNs on the stale image,
 * and keeping the previous object intact is what makes one-click rollback possible.
 */
export function promotedCoverPath(comicId: string, proposalId: string, target: CoverTarget): string {
  const folder = target === 'full' ? 'covers/master-full' : 'covers/master';
  return `${folder}/${comicId}__${proposalId}.webp`;
}
