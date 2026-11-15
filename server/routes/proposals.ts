import express, { Request, Response } from 'express';
import { getFirestoreDb, getFirebaseStorageBucket, isFirestoreConfigured } from '../firebaseAdmin.ts';
import { optionalAuth, requireAdmin, requireAuth } from '../middleware/auth.ts';
import { quotaMiddleware } from '../middleware/quota.ts';
import {
  ProposalDeps,
  ProposalError,
  adminProposalAction,
  castVote,
  createProposal,
  listAuditLogs,
  listProposals,
  listUsersForAdmin,
  toProposalDto,
  updateUserModeration,
} from '../services/proposalService.ts';

export const proposalsRouter = express.Router();

function getDeps(): ProposalDeps {
  return { db: getFirestoreDb(), bucket: getFirebaseStorageBucket() };
}

function sendError(res: Response, err: any, fallbackMessage: string) {
  if (err instanceof ProposalError) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(`[Proposals] ${fallbackMessage}:`, err?.message || err);
  return res.status(500).json({ error: `${fallbackMessage}: ${err?.message || 'Unknown error'}` });
}

/**
 * GET /api/proposals?status=pending|closed|all|approved,rejected&limit=50
 * Lists community proposals with vote tallies, the caller's own vote, and live master state.
 * Read-only, so the local/desktop default identity is acceptable here.
 */
proposalsRouter.get('/api/proposals', optionalAuth, quotaMiddleware, async (req: Request, res: Response) => {
  try {
    if (!isFirestoreConfigured()) {
      return res.json({ proposals: [], count: 0 });
    }
    const proposals = await listProposals(getDeps(), req.user || null, {
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      limit: Number(req.query.limit) || undefined,
    });
    res.json({ proposals, count: proposals.length });
  } catch (err) {
    sendError(res, err, 'Failed to load proposals');
  }
});

/**
 * POST /api/proposals
 * Body: { proposalType, masterComicId?, proposedChanges?, coverTarget?, imageBufferBase64?, reason? }
 * Mutations always require a verified identity (never the local default-admin fallback).
 */
proposalsRouter.post('/api/proposals', requireAuth, quotaMiddleware, async (req: Request, res: Response) => {
  try {
    const proposal = await createProposal(getDeps(), req.user!, req.body || {});
    res.status(201).json({ proposal: toProposalDto(proposal) });
  } catch (err) {
    sendError(res, err, 'Failed to create proposal');
  }
});

/**
 * POST /api/proposals/:id/vote  Body: { vote: 1 | -1 | 0 }
 * Records the vote transactionally and auto-promotes on quorum (+5 net, >= 70% approval).
 */
proposalsRouter.post('/api/proposals/:id/vote', requireAuth, quotaMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await castVote(getDeps(), req.user!, req.params.id, req.body?.vote);
    res.json({ proposal: toProposalDto(result.proposal, result.myVote), promoted: result.promoted });
  } catch (err) {
    sendError(res, err, 'Failed to record vote');
  }
});

/**
 * POST /api/proposals/:id/admin-action (Admin only)
 * Body: { action: 'approve' | 'reject' | 'veto' | 'rollback', notes? }
 * Reject / veto immediately delete the staged cover from covers/proposals/.
 */
proposalsRouter.post('/api/proposals/:id/admin-action', requireAdmin, async (req: Request, res: Response) => {
  try {
    const proposal = await adminProposalAction(getDeps(), req.user!, req.params.id, req.body?.action, req.body?.notes);
    res.json({ proposal: toProposalDto(proposal) });
  } catch (err) {
    sendError(res, err, 'Admin action failed');
  }
});

/** GET /api/admin/users?q=... (Admin only) */
proposalsRouter.get('/api/admin/users', requireAdmin, async (req: Request, res: Response) => {
  try {
    const users = await listUsersForAdmin(getDeps(), typeof req.query.q === 'string' ? req.query.q : '');
    res.json({ users });
  } catch (err) {
    sendError(res, err, 'Failed to load users');
  }
});

/** POST /api/admin/users/:uid (Admin only) Body: { vipTier?, isBannedFromProposals? } */
proposalsRouter.post('/api/admin/users/:uid', requireAdmin, async (req: Request, res: Response) => {
  try {
    const user = await updateUserModeration(getDeps(), req.user!, req.params.uid, req.body || {});
    res.json({ user });
  } catch (err) {
    sendError(res, err, 'Failed to update user');
  }
});

/** GET /api/admin/audit-logs?limit=100 (Admin only) */
proposalsRouter.get('/api/admin/audit-logs', requireAdmin, async (req: Request, res: Response) => {
  try {
    const logs = await listAuditLogs(getDeps(), Number(req.query.limit) || 100);
    res.json({ logs });
  } catch (err) {
    sendError(res, err, 'Failed to load audit logs');
  }
});
