/**
 * Community Proposals, Voting Quorum & Admin Moderation — Firestore / Storage side effects.
 *
 * Every exported function takes a `ProposalDeps` bag (Firestore db, Storage bucket, image
 * compressor, clock) so the full promotion / cleanup lifecycle can be exercised in unit tests
 * against in-memory fakes without touching the live Firebase project.
 */
import sharp from 'sharp';
import {
  CoverTarget,
  EditableMasterField,
  MAX_PROPOSAL_REASON_LENGTH,
  MAX_PROPOSAL_UPLOAD_BYTES,
  ProposalActor,
  ProposalStatus,
  ProposalType,
  QUORUM_MIN_APPROVAL_RATIO,
  QUORUM_MIN_NET_VOTES,
  VoteTally,
  applyVoteChange,
  approvalRatio,
  buildStoragePublicUrl,
  canCreateProposal,
  canVote,
  computeExpiresAt,
  computeRollbackPatch,
  diffAgainstMaster,
  evaluateQuorum,
  promotedCoverPath,
  proposalStagingPath,
  sanitizeMasterChanges,
  validateNewComicChanges,
} from './proposalEngine.ts';
import {
  FRONT_COVER_MAX_WIDTH,
  FRONT_COVER_WEBP_QUALITY,
  FULL_COVER_MAX_WIDTH,
  FULL_COVER_WEBP_QUALITY,
} from './webpMasterUploadPipeline.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface ProposalDeps {
  db: any; // firebase-admin Firestore (or compatible fake)
  bucket: any; // firebase-admin Storage bucket (or compatible fake)
  compressCover?: (input: Buffer, target: CoverTarget) => Promise<Buffer>;
  now?: () => Date;
}

export class ProposalError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface ActorWithName extends ProposalActor {
  displayName?: string;
}

const PROPOSALS = 'catalog_proposals';
const AUDIT_LOGS = 'moderation_audit_logs';
const MAX_PROPAGATION_DOCS = 500;
const FIRESTORE_BATCH_LIMIT = 400;

function nowOf(deps: ProposalDeps): Date {
  return deps.now ? deps.now() : new Date();
}

async function defaultCompressCover(input: Buffer, target: CoverTarget): Promise<Buffer> {
  const isFull = target === 'full';
  return sharp(input)
    .resize({
      width: isFull ? FULL_COVER_MAX_WIDTH : FRONT_COVER_MAX_WIDTH,
      withoutEnlargement: true,
      fit: 'inside',
    })
    .webp({ quality: isFull ? FULL_COVER_WEBP_QUALITY : FRONT_COVER_WEBP_QUALITY, effort: 4 })
    .toBuffer();
}

function parseBase64Image(dataUriOrBase64: string): Buffer {
  const matches = dataUriOrBase64.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
  return Buffer.from(matches ? matches[2] : dataUriOrBase64, 'base64');
}

function coverFieldFor(target: CoverTarget): 'coverImage' | 'coverImageFull' {
  return target === 'full' ? 'coverImageFull' : 'coverImage';
}

function userMasterCoverFieldFor(target: CoverTarget): 'masterCoverImage' | 'masterCoverImageFull' {
  return target === 'full' ? 'masterCoverImageFull' : 'masterCoverImage';
}

async function deleteStorageObjectQuietly(bucket: any, storagePath?: string | null): Promise<boolean> {
  if (!storagePath) return false;
  try {
    await bucket.file(storagePath).delete({ ignoreNotFound: true });
    return true;
  } catch (err: any) {
    console.warn(`[Proposals] Failed to delete storage object ${storagePath}:`, err?.message);
    return false;
  }
}

async function writeAuditLog(
  deps: ProposalDeps,
  entry: { actorId: string; action: string; proposalId?: string; targetUserId?: string | null; details?: Record<string, any> }
) {
  try {
    const ref = deps.db.collection(AUDIT_LOGS).doc();
    await ref.set({
      id: ref.id,
      actorId: entry.actorId,
      action: entry.action,
      proposalId: entry.proposalId ?? null,
      targetUserId: entry.targetUserId ?? null,
      details: entry.details ?? {},
      createdAt: nowOf(deps).toISOString(),
    });
  } catch (err: any) {
    // Audit logging must never block a moderation action.
    console.warn('[Proposals] Failed to write moderation audit log:', err?.message);
  }
}

/**
 * Best-effort propagation of canonical master changes into users' denormalized
 * `users/{uid}/comics` documents (linked by `masterComicId`), stamping `updatedAt`
 * so delta sync (`POST /api/sync`) delivers the change to every device.
 *
 * Each mapping entry may carry an `onlyIfEquals` guard so user-customized values are
 * never overwritten (e.g. a user who renamed their copy keeps their title).
 */
async function propagateToUserComics(
  deps: ProposalDeps,
  masterComicId: string,
  mapping: Record<string, { to: unknown; onlyIfEquals?: unknown }>
): Promise<{ updatedDocs: number; error?: string }> {
  if (Object.keys(mapping).length === 0) return { updatedDocs: 0 };
  try {
    const snap = await deps.db
      .collectionGroup('comics')
      .where('masterComicId', '==', masterComicId)
      .limit(MAX_PROPAGATION_DOCS)
      .get();

    const nowIso = nowOf(deps).toISOString();
    let batch = deps.db.batch();
    let pending = 0;
    let updatedDocs = 0;

    for (const doc of snap.docs) {
      const data = doc.data() || {};
      const update: Record<string, unknown> = {};
      for (const [field, rule] of Object.entries(mapping)) {
        if ('onlyIfEquals' in rule && JSON.stringify(data[field] ?? null) !== JSON.stringify(rule.onlyIfEquals ?? null)) {
          continue;
        }
        update[field] = rule.to ?? null;
      }
      if (Object.keys(update).length === 0) continue;
      update.updatedAt = nowIso;
      batch.set(doc.ref, update, { merge: true });
      pending++;
      updatedDocs++;
      if (pending >= FIRESTORE_BATCH_LIMIT) {
        await batch.commit();
        batch = deps.db.batch();
        pending = 0;
      }
    }
    if (pending > 0) await batch.commit();
    return { updatedDocs };
  } catch (err: any) {
    // A collection-group query on `comics.masterComicId` requires the field override in
    // firestore.indexes.json. Promotion itself has already succeeded at this point.
    console.warn('[Proposals] User comic propagation skipped:', err?.message);
    return { updatedDocs: 0, error: err?.message || 'propagation failed' };
  }
}

/* ------------------------------------------------------------------ */
/* Create                                                              */
/* ------------------------------------------------------------------ */

export interface CreateProposalInput {
  proposalType: ProposalType;
  masterComicId?: string;
  proposedChanges?: Record<string, unknown>;
  coverTarget?: CoverTarget;
  imageBufferBase64?: string;
  reason?: string;
}

export async function createProposal(deps: ProposalDeps, actor: ActorWithName, input: CreateProposalInput) {
  const proposalType = input?.proposalType;
  const permission = canCreateProposal(actor, proposalType);
  if (!permission.allowed) throw new ProposalError(403, permission.reason!);

  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (reason.length > MAX_PROPOSAL_REASON_LENGTH) {
    throw new ProposalError(400, `Reason must be ${MAX_PROPOSAL_REASON_LENGTH} characters or fewer.`);
  }

  const db = deps.db;
  const now = nowOf(deps);
  const nowIso = now.toISOString();
  const proposalRef = db.collection(PROPOSALS).doc();
  const proposalId: string = proposalRef.id;

  let masterComicId: string | null = null;
  let masterSnapshot: Record<string, unknown> | null = null;
  let proposedChanges: Record<string, unknown> = {};

  if (proposalType === 'cover_image' || proposalType === 'metadata_edit') {
    masterComicId = String(input.masterComicId || '').trim();
    if (!masterComicId) throw new ProposalError(400, 'masterComicId is required.');
    const masterSnap = await db.collection('master_comics').doc(masterComicId).get();
    if (!masterSnap.exists) throw new ProposalError(404, 'Comic not found in the Master Catalog.');
    const master = masterSnap.data() || {};
    masterSnapshot = {
      title: master.title ?? null,
      issueNumber: master.issueNumber ?? null,
      publisher: master.publisher ?? null,
      seriesName: master.seriesName ?? null,
      publicationYear: master.publicationYear ?? null,
      coverImage: master.coverImage ?? null,
      coverImageFull: master.coverImageFull ?? null,
    };

    // One open proposal of a given type per user per comic keeps the review queue clean.
    const mine = await db.collection(PROPOSALS).where('proposerId', '==', actor.uid).limit(200).get();
    const duplicate = mine.docs.find((d: any) => {
      const p = d.data() || {};
      return p.status === 'pending' && p.masterComicId === masterComicId && p.proposalType === proposalType;
    });
    if (duplicate) {
      throw new ProposalError(409, 'You already have a pending proposal of this type for this comic.');
    }

    if (proposalType === 'cover_image') {
      const coverTarget: CoverTarget = input.coverTarget === 'full' ? 'full' : 'front';
      if (!input.imageBufferBase64 || typeof input.imageBufferBase64 !== 'string') {
        throw new ProposalError(400, 'imageBufferBase64 is required for cover proposals.');
      }
      const raw = parseBase64Image(input.imageBufferBase64);
      if (raw.length === 0) throw new ProposalError(400, 'Uploaded image is empty.');
      if (raw.length > MAX_PROPOSAL_UPLOAD_BYTES) {
        throw new ProposalError(413, 'Uploaded image is too large (15 MB max before compression).');
      }
      let compressed: Buffer;
      try {
        compressed = await (deps.compressCover || defaultCompressCover)(raw, coverTarget);
      } catch {
        throw new ProposalError(400, 'Unable to read the uploaded image. Use a WebP, PNG, or JPEG file.');
      }

      const stagedStoragePath = proposalStagingPath(proposalId);
      await deps.bucket.file(stagedStoragePath).save(compressed, {
        resumable: false,
        metadata: { contentType: 'image/webp', cacheControl: 'public, max-age=86400' },
      });
      proposedChanges = {
        coverTarget,
        stagedStoragePath,
        stagedUrl: buildStoragePublicUrl(deps.bucket.name, stagedStoragePath),
        sizeBytes: compressed.length,
      };
    } else {
      const { changes, rejectedFields } = sanitizeMasterChanges(input.proposedChanges);
      if (rejectedFields.length > 0) {
        throw new ProposalError(400, `These fields cannot be proposed or are invalid: ${rejectedFields.join(', ')}.`);
      }
      const diff = diffAgainstMaster(changes, master);
      if (Object.keys(diff).length === 0) {
        throw new ProposalError(400, 'Proposed metadata is identical to the current Master Catalog record.');
      }
      proposedChanges = { fields: diff };
      for (const key of Object.keys(diff)) {
        masterSnapshot[key] = master[key] ?? null;
      }
    }
  } else {
    // new_comic
    const { changes, rejectedFields } = sanitizeMasterChanges(input.proposedChanges);
    if (rejectedFields.length > 0) {
      throw new ProposalError(400, `These fields cannot be proposed or are invalid: ${rejectedFields.join(', ')}.`);
    }
    const valid = validateNewComicChanges(changes);
    if (!valid.allowed) throw new ProposalError(400, valid.reason!);
    proposedChanges = { fields: changes };
  }

  const proposal = {
    id: proposalId,
    proposerId: actor.uid,
    proposerDisplayName: actor.displayName || 'Community Member',
    proposerRole: actor.role,
    masterComicId,
    proposalType,
    proposedChanges,
    masterSnapshot,
    reason: reason || null,
    status: 'pending' as ProposalStatus,
    netVotes: 0,
    upvotesCount: 0,
    downvotesCount: 0,
    expiresAt: computeExpiresAt(now),
    reviewedBy: null,
    adminNotes: null,
    promotion: null,
    lastError: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  await proposalRef.set(proposal);

  // Admin proposals are instantly auto-approved (Section 4 tier table).
  if (actor.role === 'admin') {
    return promoteProposal(deps, proposalId, actor, 'admin_auto_approve');
  }
  return proposal;
}

/* ------------------------------------------------------------------ */
/* Promotion                                                           */
/* ------------------------------------------------------------------ */

/**
 * Atomically claims a pending proposal (pending -> promoting) so concurrent votes or an
 * admin click cannot promote the same proposal twice, then applies the side effects.
 */
async function promoteProposal(deps: ProposalDeps, proposalId: string, actor: ProposalActor, trigger: string) {
  const db = deps.db;
  const ref = db.collection(PROPOSALS).doc(proposalId);

  const claimed = await db.runTransaction(async (tx: any) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ProposalError(404, 'Proposal not found.');
    const data = snap.data();
    if (data.status !== 'pending') {
      throw new ProposalError(409, `Proposal is already ${data.status}.`);
    }
    tx.update(ref, { status: 'promoting', updatedAt: nowOf(deps).toISOString() });
    return data;
  });

  try {
    const promotion = await applyPromotion(deps, claimed);
    const nowIso = nowOf(deps).toISOString();
    const finalFields = {
      status: 'approved' as ProposalStatus,
      promotion,
      reviewedBy: trigger === 'community_quorum' ? 'community' : actor.uid,
      lastError: null,
      updatedAt: nowIso,
    };
    await ref.set(finalFields, { merge: true });
    await writeAuditLog(deps, {
      actorId: trigger === 'community_quorum' ? 'community' : actor.uid,
      action: trigger === 'community_quorum' ? 'proposal_auto_promoted' : 'proposal_approved',
      proposalId,
      targetUserId: claimed.proposerId,
      details: { trigger, proposalType: claimed.proposalType, masterComicId: promotion.masterComicId },
    });
    return { ...claimed, ...finalFields };
  } catch (err: any) {
    // Release the claim so the proposal can be retried.
    await ref.set(
      { status: 'pending', lastError: err?.message || 'Promotion failed', updatedAt: nowOf(deps).toISOString() },
      { merge: true }
    );
    if (err instanceof ProposalError) throw err;
    throw new ProposalError(500, `Promotion failed: ${err?.message || err}`);
  }
}

async function applyPromotion(deps: ProposalDeps, proposal: any) {
  const { db, bucket } = deps;
  const nowIso = nowOf(deps).toISOString();
  const type: ProposalType = proposal.proposalType;

  if (type === 'cover_image') {
    const masterComicId: string = proposal.masterComicId;
    const target: CoverTarget = proposal.proposedChanges?.coverTarget === 'full' ? 'full' : 'front';
    const stagedPath: string = proposal.proposedChanges?.stagedStoragePath;
    const masterRef = db.collection('master_comics').doc(masterComicId);
    const masterSnap = await masterRef.get();
    if (!masterSnap.exists) throw new ProposalError(404, 'Target Master Catalog comic no longer exists.');

    const [stagedExists] = await bucket.file(stagedPath).exists();
    if (!stagedExists) throw new ProposalError(410, 'Staged proposal image is missing from Cloud Storage.');

    const destPath = promotedCoverPath(masterComicId, proposal.id, target);
    const destFile = bucket.file(destPath);
    await bucket.file(stagedPath).copy(destFile);
    await destFile.setMetadata({ contentType: 'image/webp', cacheControl: 'public, max-age=31536000, immutable' });

    const field = coverFieldFor(target);
    const previousUrl = masterSnap.data()?.[field] ?? null;
    const newUrl = buildStoragePublicUrl(bucket.name, destPath);
    try {
      await masterRef.set({ [field]: newUrl, updatedAt: nowIso }, { merge: true });
    } catch (err) {
      await deleteStorageObjectQuietly(bucket, destPath);
      throw err;
    }

    await deleteStorageObjectQuietly(bucket, stagedPath);
    const propagation = await propagateToUserComics(deps, masterComicId, {
      [userMasterCoverFieldFor(target)]: { to: newUrl },
    });

    return {
      masterComicId,
      appliedChanges: { [field]: newUrl },
      previousValues: { [field]: previousUrl },
      promotedStoragePath: destPath,
      propagatedUserDocs: propagation.updatedDocs,
      propagationError: propagation.error ?? null,
      appliedAt: nowIso,
    };
  }

  if (type === 'metadata_edit') {
    const masterComicId: string = proposal.masterComicId;
    const masterRef = db.collection('master_comics').doc(masterComicId);
    const masterSnap = await masterRef.get();
    if (!masterSnap.exists) throw new ProposalError(404, 'Target Master Catalog comic no longer exists.');
    const master = masterSnap.data() || {};

    // Re-diff at promotion time: the master may have changed during the voting window.
    const fields = (proposal.proposedChanges?.fields || {}) as Partial<Record<EditableMasterField, unknown>>;
    const diff = diffAgainstMaster(fields, master);
    const previousValues: Record<string, unknown> = {};
    for (const key of Object.keys(diff)) previousValues[key] = master[key] ?? null;

    if (Object.keys(diff).length > 0) {
      await masterRef.set({ ...diff, updatedAt: nowIso }, { merge: true });
    }

    const mapping: Record<string, { to: unknown; onlyIfEquals?: unknown }> = {};
    for (const [key, value] of Object.entries(diff)) {
      mapping[key] = { to: value, onlyIfEquals: previousValues[key] };
    }
    const propagation = await propagateToUserComics(deps, masterComicId, mapping);

    return {
      masterComicId,
      appliedChanges: diff,
      previousValues,
      promotedStoragePath: null,
      propagatedUserDocs: propagation.updatedDocs,
      propagationError: propagation.error ?? null,
      appliedAt: nowIso,
    };
  }

  // new_comic
  const masterComicId = `community-${proposal.id}`;
  const fields = (proposal.proposedChanges?.fields || {}) as Record<string, unknown>;
  const newMaster = {
    ...fields,
    id: masterComicId,
    fullTitle: fields.fullTitle || `${fields.title} #${fields.issueNumber}`,
    coverImage: 'NoImage.webp',
    coverImageFull: null,
    verified: true,
    createdByUserId: proposal.proposerId,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  await db.collection('master_comics').doc(masterComicId).set(newMaster);
  return {
    masterComicId,
    appliedChanges: newMaster,
    previousValues: {},
    promotedStoragePath: null,
    propagatedUserDocs: 0,
    propagationError: null,
    appliedAt: nowIso,
  };
}

/* ------------------------------------------------------------------ */
/* Voting                                                              */
/* ------------------------------------------------------------------ */

export async function castVote(deps: ProposalDeps, actor: ProposalActor, proposalId: string, rawVote: unknown) {
  const vote = Number(rawVote);
  if (![1, -1, 0].includes(vote)) throw new ProposalError(400, 'vote must be 1, -1, or 0 (retract).');

  const db = deps.db;
  const ref = db.collection(PROPOSALS).doc(proposalId);
  const voteRef = ref.collection('votes').doc(actor.uid);

  const outcome = await db.runTransaction(async (tx: any) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ProposalError(404, 'Proposal not found.');
    const proposal = snap.data();

    const permission = canVote(actor, proposal);
    if (!permission.allowed) throw new ProposalError(403, permission.reason!);

    const voteSnap = await tx.get(voteRef);
    const previousVote = voteSnap.exists ? Number(voteSnap.data()?.vote) || 0 : 0;
    const tally: VoteTally = applyVoteChange(proposal, previousVote, vote);
    const nowIso = nowOf(deps).toISOString();

    if (vote === 0) {
      if (voteSnap.exists) tx.delete(voteRef);
    } else {
      tx.set(voteRef, {
        uid: actor.uid,
        proposalId,
        vote,
        createdAt: voteSnap.exists ? voteSnap.data()?.createdAt ?? nowIso : nowIso,
        updatedAt: nowIso,
      });
    }
    tx.update(ref, { ...tally, updatedAt: nowIso });
    return { proposal: { ...proposal, ...tally }, decision: evaluateQuorum(tally, proposal.expiresAt, nowOf(deps)) };
  });

  if (outcome.decision === 'approve') {
    try {
      const promoted = await promoteProposal(deps, proposalId, actor, 'community_quorum');
      return { proposal: promoted, myVote: vote, promoted: true };
    } catch (err: any) {
      // The vote itself was recorded; surface promotion failure without losing it.
      if (err instanceof ProposalError && err.status === 409) {
        return { proposal: outcome.proposal, myVote: vote, promoted: false };
      }
      throw err;
    }
  }
  if (outcome.decision === 'expire') {
    const expired = await closeProposal(deps, proposalId, null, 'rejected', 'Voting window expired without quorum.', 'proposal_expired');
    return { proposal: expired, myVote: vote, promoted: false };
  }
  return { proposal: outcome.proposal, myVote: vote, promoted: false };
}

/* ------------------------------------------------------------------ */
/* Reject / Veto / Expire                                              */
/* ------------------------------------------------------------------ */

/**
 * Closes a pending proposal as rejected / vetoed and immediately deletes its staged
 * cover image from Cloud Storage so rejected proposals never consume bucket space.
 */
async function closeProposal(
  deps: ProposalDeps,
  proposalId: string,
  actor: ProposalActor | null,
  status: 'rejected' | 'vetoed',
  adminNotes: string | null,
  auditAction: string
) {
  const db = deps.db;
  const ref = db.collection(PROPOSALS).doc(proposalId);
  const closed = await db.runTransaction(async (tx: any) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ProposalError(404, 'Proposal not found.');
    const data = snap.data();
    if (data.status !== 'pending') throw new ProposalError(409, `Proposal is already ${data.status}.`);
    const fields = {
      status,
      reviewedBy: actor ? actor.uid : 'system',
      adminNotes: adminNotes || null,
      updatedAt: nowOf(deps).toISOString(),
    };
    tx.update(ref, fields);
    return { ...data, ...fields };
  });

  const stagedPath = closed.proposedChanges?.stagedStoragePath;
  const deleted = await deleteStorageObjectQuietly(deps.bucket, stagedPath);
  if (stagedPath) {
    await ref.set({ proposedChanges: { ...closed.proposedChanges, stagedDeleted: deleted } }, { merge: true });
  }
  await writeAuditLog(deps, {
    actorId: actor ? actor.uid : 'system',
    action: auditAction,
    proposalId,
    targetUserId: closed.proposerId,
    details: { status, adminNotes, stagedStoragePath: stagedPath ?? null, stagedDeleted: deleted },
  });
  return closed;
}

/** Lazily rejects pending proposals whose voting window has elapsed without quorum. */
export async function expireStaleProposals(deps: ProposalDeps, proposals: any[]): Promise<Set<string>> {
  const expiredIds = new Set<string>();
  const now = nowOf(deps);
  for (const p of proposals) {
    if (p.status !== 'pending') continue;
    if (evaluateQuorum(p, p.expiresAt, now) !== 'expire') continue;
    try {
      await closeProposal(deps, p.id, null, 'rejected', 'Voting window expired without quorum.', 'proposal_expired');
      expiredIds.add(p.id);
    } catch (err: any) {
      if (!(err instanceof ProposalError && err.status === 409)) {
        console.warn(`[Proposals] Failed to expire proposal ${p.id}:`, err?.message);
      }
    }
  }
  return expiredIds;
}

/* ------------------------------------------------------------------ */
/* Admin actions                                                       */
/* ------------------------------------------------------------------ */

export type AdminProposalAction = 'approve' | 'reject' | 'veto' | 'rollback';

export async function adminProposalAction(
  deps: ProposalDeps,
  actor: ProposalActor,
  proposalId: string,
  action: AdminProposalAction,
  notes?: string
) {
  if (actor.role !== 'admin') throw new ProposalError(403, 'Access denied: Admin privileges required.');
  const cleanNotes = typeof notes === 'string' ? notes.trim().slice(0, MAX_PROPOSAL_REASON_LENGTH) : '';

  switch (action) {
    case 'approve': {
      const approved = await promoteProposal(deps, proposalId, actor, 'admin_approve');
      if (cleanNotes) {
        await deps.db.collection(PROPOSALS).doc(proposalId).set({ adminNotes: cleanNotes }, { merge: true });
      }
      return { ...approved, adminNotes: cleanNotes || approved.adminNotes || null };
    }
    case 'reject':
      return closeProposal(deps, proposalId, actor, 'rejected', cleanNotes, 'proposal_rejected');
    case 'veto':
      return closeProposal(deps, proposalId, actor, 'vetoed', cleanNotes, 'proposal_vetoed');
    case 'rollback':
      return rollbackProposal(deps, actor, proposalId, cleanNotes);
    default:
      throw new ProposalError(400, 'action must be one of: approve, reject, veto, rollback.');
  }
}

async function rollbackProposal(deps: ProposalDeps, actor: ProposalActor, proposalId: string, notes: string) {
  const { db, bucket } = deps;
  const ref = db.collection(PROPOSALS).doc(proposalId);
  const snap = await ref.get();
  if (!snap.exists) throw new ProposalError(404, 'Proposal not found.');
  const proposal = snap.data();
  if (proposal.status !== 'approved' || !proposal.promotion) {
    throw new ProposalError(409, 'Only approved proposals can be rolled back.');
  }

  const promotion = proposal.promotion;
  const masterComicId: string = promotion.masterComicId;
  const masterRef = db.collection('master_comics').doc(masterComicId);
  const masterSnap = await masterRef.get();
  const nowIso = nowOf(deps).toISOString();
  let skippedFields: string[] = [];
  let restored: Record<string, unknown> = {};
  let promotedObjectDeleted = false;

  if (proposal.proposalType === 'new_comic') {
    if (masterSnap.exists) await masterRef.delete();
    restored = { deletedMasterComicId: masterComicId };
  } else {
    if (!masterSnap.exists) throw new ProposalError(404, 'Target Master Catalog comic no longer exists.');
    const result = computeRollbackPatch(promotion.appliedChanges || {}, promotion.previousValues || {}, masterSnap.data() || {});
    skippedFields = result.skippedFields;
    restored = result.patch;

    if (Object.keys(result.patch).length > 0) {
      await masterRef.set({ ...result.patch, updatedAt: nowIso }, { merge: true });

      const mapping: Record<string, { to: unknown; onlyIfEquals?: unknown }> = {};
      for (const [key, previous] of Object.entries(result.patch)) {
        const userField =
          proposal.proposalType === 'cover_image'
            ? key === 'coverImageFull'
              ? 'masterCoverImageFull'
              : 'masterCoverImage'
            : key;
        mapping[userField] = { to: previous, onlyIfEquals: promotion.appliedChanges[key] };
      }
      await propagateToUserComics(deps, masterComicId, mapping);
    }

    // Only remove the promoted cover object once nothing references it anymore.
    if (proposal.proposalType === 'cover_image' && skippedFields.length === 0) {
      promotedObjectDeleted = await deleteStorageObjectQuietly(bucket, promotion.promotedStoragePath);
    }
  }

  const fields = {
    status: 'rolled_back' as ProposalStatus,
    reviewedBy: actor.uid,
    adminNotes: notes || proposal.adminNotes || null,
    rollback: { rolledBackAt: nowIso, rolledBackBy: actor.uid, restored, skippedFields, promotedObjectDeleted },
    updatedAt: nowIso,
  };
  await ref.set(fields, { merge: true });
  await writeAuditLog(deps, {
    actorId: actor.uid,
    action: 'proposal_rolled_back',
    proposalId,
    targetUserId: proposal.proposerId,
    details: { masterComicId, restored, skippedFields, promotedObjectDeleted },
  });
  return { ...proposal, ...fields };
}

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

export function toProposalDto(p: any, myVote = 0) {
  return {
    ...p,
    myVote,
    approvalRatio: approvalRatio(p),
    quorum: { minNetVotes: QUORUM_MIN_NET_VOTES, minApprovalRatio: QUORUM_MIN_APPROVAL_RATIO },
  };
}

export async function listProposals(
  deps: ProposalDeps,
  actor: ProposalActor | null,
  opts: { status?: string; limit?: number } = {}
) {
  const limit = Math.min(100, Math.max(1, Number(opts.limit) || 50));
  // Single-field ordering only (auto-indexed); status filtering happens in memory so no
  // composite index is required.
  const snap = await deps.db.collection(PROPOSALS).orderBy('createdAt', 'desc').limit(200).get();
  let proposals = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));

  const expired = await expireStaleProposals(deps, proposals);
  if (expired.size > 0) {
    proposals = proposals.map((p: any) => (expired.has(p.id) ? { ...p, status: 'rejected', adminNotes: 'Voting window expired without quorum.' } : p));
  }

  const status = opts.status || 'pending';
  if (status !== 'all') {
    const wanted = status === 'closed' ? ['approved', 'rejected', 'vetoed', 'rolled_back'] : status.split(',');
    proposals = proposals.filter((p: any) => wanted.includes(p.status));
  }
  proposals = proposals.slice(0, limit);

  const myVotes = new Map<string, number>();
  if (actor && proposals.length > 0) {
    const refs = proposals.map((p: any) => deps.db.collection(PROPOSALS).doc(p.id).collection('votes').doc(actor.uid));
    const voteSnaps = await deps.db.getAll(...refs);
    voteSnaps.forEach((vs: any, i: number) => {
      if (vs.exists) myVotes.set(proposals[i].id, Number(vs.data()?.vote) || 0);
    });
  }

  // Attach live master state so voters compare against what is current, not just the
  // snapshot taken at submission time.
  const masterIds = Array.from(new Set(proposals.map((p: any) => p.masterComicId).filter(Boolean))) as string[];
  const liveMasters = new Map<string, any>();
  if (masterIds.length > 0) {
    const masterSnaps = await deps.db.getAll(...masterIds.map((id) => deps.db.collection('master_comics').doc(id)));
    masterSnaps.forEach((ms: any, i: number) => {
      if (ms.exists) liveMasters.set(masterIds[i], ms.data());
    });
  }

  return proposals.map((p: any) => {
    const live = p.masterComicId ? liveMasters.get(p.masterComicId) : null;
    return {
      ...toProposalDto(p, myVotes.get(p.id) || 0),
      currentMaster: live
        ? {
            title: live.title ?? null,
            issueNumber: live.issueNumber ?? null,
            publisher: live.publisher ?? null,
            seriesName: live.seriesName ?? null,
            publicationYear: live.publicationYear ?? null,
            coverImage: live.coverImage ?? null,
            coverImageFull: live.coverImageFull ?? null,
            ...(p.proposalType === 'metadata_edit'
              ? Object.fromEntries(Object.keys(p.proposedChanges?.fields || {}).map((k) => [k, live[k] ?? null]))
              : {}),
          }
        : null,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Admin user management                                               */
/* ------------------------------------------------------------------ */

export async function listUsersForAdmin(deps: ProposalDeps, query?: string) {
  const q = (query || '').trim().toLowerCase();
  const snap = await deps.db.collection('users').limit(500).get();
  return snap.docs
    .map((d: any) => d.data() || {})
    .filter((u: any) => {
      if (!q) return true;
      return (
        String(u.email || '').toLowerCase().includes(q) ||
        String(u.displayName || '').toLowerCase().includes(q) ||
        String(u.uid || '').toLowerCase().includes(q)
      );
    })
    .slice(0, 100)
    .map((u: any) => ({
      uid: u.uid,
      email: u.email || null,
      displayName: u.displayName || null,
      role: u.role || 'user',
      vipTier: u.vipTier || 'free',
      vipExpiresAt: u.vipExpiresAt || null,
      isBannedFromProposals: Boolean(u.isBannedFromProposals),
      storageBytesUsed: Number(u.storageBytesUsed || 0),
      createdAt: u.createdAt || null,
    }));
}

export async function updateUserModeration(
  deps: ProposalDeps,
  actor: ProposalActor,
  targetUid: string,
  updates: { vipTier?: unknown; isBannedFromProposals?: unknown }
) {
  if (actor.role !== 'admin') throw new ProposalError(403, 'Access denied: Admin privileges required.');
  if (!targetUid) throw new ProposalError(400, 'User id is required.');

  const patch: Record<string, unknown> = {};
  if (updates.vipTier !== undefined) {
    if (!['free', 'collector', 'archivist'].includes(String(updates.vipTier))) {
      throw new ProposalError(400, 'vipTier must be free, collector, or archivist.');
    }
    patch.vipTier = String(updates.vipTier);
  }
  if (updates.isBannedFromProposals !== undefined) {
    if (typeof updates.isBannedFromProposals !== 'boolean') {
      throw new ProposalError(400, 'isBannedFromProposals must be a boolean.');
    }
    patch.isBannedFromProposals = updates.isBannedFromProposals;
  }
  if (Object.keys(patch).length === 0) throw new ProposalError(400, 'No supported changes provided.');

  const userRef = deps.db.collection('users').doc(targetUid);
  const snap = await userRef.get();
  if (!snap.exists) throw new ProposalError(404, 'User not found.');
  const before = snap.data() || {};
  if (before.role === 'admin' && patch.isBannedFromProposals === true) {
    throw new ProposalError(400, 'Admins cannot be banned from proposals.');
  }

  const nowIso = nowOf(deps).toISOString();
  await userRef.set({ ...patch, updatedAt: nowIso }, { merge: true });
  if (patch.vipTier !== undefined) {
    // users_public mirrors the non-PII tier badge shown in the voting feed.
    await deps.db.collection('users_public').doc(targetUid).set({ uid: targetUid, vipTier: patch.vipTier, updatedAt: nowIso }, { merge: true });
  }

  await writeAuditLog(deps, {
    actorId: actor.uid,
    action: 'user_moderation_updated',
    targetUserId: targetUid,
    details: {
      before: { vipTier: before.vipTier ?? null, isBannedFromProposals: Boolean(before.isBannedFromProposals) },
      after: patch,
    },
  });
  return { uid: targetUid, ...before, ...patch, updatedAt: nowIso };
}

export async function listAuditLogs(deps: ProposalDeps, limit = 100) {
  const snap = await deps.db
    .collection(AUDIT_LOGS)
    .orderBy('createdAt', 'desc')
    .limit(Math.min(200, Math.max(1, limit)))
    .get();
  return snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
}
