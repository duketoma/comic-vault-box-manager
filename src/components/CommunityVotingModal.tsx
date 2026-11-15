import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Vote,
  ThumbsUp,
  ThumbsDown,
  Clock,
  Sparkles,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  ShieldCheck,
  Filter,
  Image as ImageIcon,
  FileText,
  PlusCircle,
  ExternalLink,
  ChevronRight,
  Info,
  RefreshCw,
} from 'lucide-react';
import {
  CatalogProposal,
  ProposalStatus,
  fetchProposals,
  castProposalVote,
  adminProposalAction,
} from '../services/proposalClientService';
import { useAuth } from '../context/AuthContext';
import { formatDriveImageUrl, getComicCoverUrl } from '../utils/imageUtils';

interface CommunityVotingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenAdminPortal?: () => void;
}

export const CommunityVotingModal: React.FC<CommunityVotingModalProps> = ({
  isOpen,
  onClose,
  onOpenAdminPortal,
}) => {
  const { userProfile, isAdmin, isVip, vipTier } = useAuth();
  const [proposals, setProposals] = useState<CatalogProposal[]>([]);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'closed' | 'all'>('pending');
  const [isLoading, setIsLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [votingBusyId, setVotingBusyId] = useState<string | null>(null);
  const [vetoReasonPromptId, setVetoReasonPromptId] = useState<string | null>(null);
  const [vetoReasonInput, setVetoReasonInput] = useState('');

  const loadProposals = useCallback(async () => {
    setIsLoading(true);
    setActionError(null);
    try {
      const res = await fetchProposals(statusFilter);
      setProposals(res.proposals || []);
    } catch (err: any) {
      setActionError(err.message || 'Failed to load community proposals.');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (isOpen) {
      void loadProposals();
    }
  }, [isOpen, loadProposals]);

  if (!isOpen) return null;

  const handleVote = async (proposalId: string, currentVote: number | undefined, desiredVote: 1 | -1) => {
    setVotingBusyId(proposalId);
    setActionError(null);
    try {
      const nextVote: 1 | -1 | 0 = currentVote === desiredVote ? 0 : desiredVote;
      const res = await castProposalVote(proposalId, nextVote);
      setProposals((prev) =>
        prev.map((p) => (p.id === proposalId ? { ...p, ...res.proposal, myVote: nextVote } : p))
      );
    } catch (err: any) {
      setActionError(err.message || 'Unable to register vote.');
    } finally {
      setVotingBusyId(null);
    }
  };

  const handleAdminAction = async (
    proposalId: string,
    action: 'approve' | 'reject' | 'veto' | 'rollback',
    notes?: string
  ) => {
    setVotingBusyId(proposalId);
    setActionError(null);
    try {
      const res = await adminProposalAction(proposalId, action, notes);
      setProposals((prev) =>
        prev.map((p) => (p.id === proposalId ? { ...p, ...res.proposal } : p))
      );
      setVetoReasonPromptId(null);
      setVetoReasonInput('');
    } catch (err: any) {
      setActionError(err.message || `Failed to execute ${action}.`);
    } finally {
      setVotingBusyId(null);
    }
  };

  const formatCountdown = (expiresAtIso: string) => {
    const ms = Date.parse(expiresAtIso) - Date.now();
    if (ms <= 0) return 'Voting closed';
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    if (days >= 1) return `${days}d ${hours % 24}h remaining`;
    const mins = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${mins}m remaining`;
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex justify-center items-center p-2 sm:p-4 overflow-y-auto"
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-4xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden my-auto animate-in fade-in duration-200">
        
        {/* Header Bar */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur-xs shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
              <Vote className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 leading-none">
                <span>Community Voting & Proposals</span>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  {isVip ? (isAdmin ? 'Admin Quorum' : `${vipTier.toUpperCase()} VIP`) : 'Observer Mode'}
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Vote on community cover upgrades and metadata edits. Auto-promotes at +5 net votes (70%+ approval).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isAdmin && onOpenAdminPortal && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenAdminPortal();
                }}
                className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                title="Open Admin Moderation Portal"
              >
                <ShieldCheck className="w-4 h-4" />
                <span className="hidden sm:inline">Admin Portal</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Close modal"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter & Quorum Rule Banner */}
        <div className="px-4 sm:px-6 py-2.5 bg-slate-100/60 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-medium">Filter:</span>
            <div className="inline-flex rounded-lg p-0.5 bg-slate-200 dark:bg-slate-800 text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => setStatusFilter('pending')}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  statusFilter === 'pending'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Active Voting
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('closed')}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  statusFilter === 'closed'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Resolved
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  statusFilter === 'all'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                All Proposals
              </button>
            </div>
            <button
              type="button"
              onClick={() => void loadProposals()}
              disabled={isLoading}
              className="p-1 rounded text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
              title="Refresh proposals list"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-[11px]">
            <Info className="w-3.5 h-3.5 text-indigo-500" />
            <span>
              Target: <strong className="text-slate-700 dark:text-slate-200">+5 Net Votes</strong> and{' '}
              <strong className="text-slate-700 dark:text-slate-200">&ge; 70% Approval</strong> in 3 days.
            </span>
          </div>
        </div>

        {/* Global Error Banner */}
        {actionError && (
          <div className="px-4 sm:px-6 py-2 bg-rose-50 dark:bg-rose-950/50 border-b border-rose-200 dark:border-rose-800/80 text-rose-700 dark:text-rose-300 text-xs flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
              {actionError}
            </span>
            <button
              type="button"
              onClick={() => setActionError(null)}
              className="text-rose-400 hover:text-rose-700 font-bold text-xs"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Proposals List Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {isLoading && proposals.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm flex flex-col items-center justify-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
              <span>Loading community proposals...</span>
            </div>
          ) : proposals.length === 0 ? (
            <div className="py-16 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-6">
              <Vote className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                No {statusFilter === 'pending' ? 'active' : ''} proposals found
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
                Tier 1+ VIP members can propose new high-res cover upgrades and metadata corrections directly
                from any comic details modal.
              </p>
            </div>
          ) : (
            proposals.map((proposal) => {
              const isCover = proposal.proposalType === 'cover_image';
              const isMeta = proposal.proposalType === 'metadata_edit';
              const isNewComic = proposal.proposalType === 'new_comic';
              const isPending = proposal.status === 'pending';
              const isMine = proposal.proposerId === userProfile.uid;
              const net = proposal.netVotes || 0;
              const up = proposal.upvotesCount || 0;
              const down = proposal.downvotesCount || 0;
              const totalVotes = up + down;
              const ratio = totalVotes > 0 ? Math.round((up / totalVotes) * 100) : 0;
              const isBusy = votingBusyId === proposal.id;

              return (
                <div
                  key={proposal.id}
                  className={`rounded-2xl border p-4 sm:p-5 transition-all ${
                    isPending
                      ? 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700/80 shadow-xs hover:border-slate-300 dark:hover:border-slate-600'
                      : proposal.status === 'approved'
                      ? 'bg-emerald-50/30 dark:bg-emerald-950/10 border-emerald-200 dark:border-emerald-800/40'
                      : 'bg-slate-50/50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 opacity-90'
                  }`}
                >
                  {/* Proposal Top Row */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-700/60">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                          isCover
                            ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                            : isMeta
                            ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                            : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                        }`}
                      >
                        {isCover && <ImageIcon className="w-3 h-3" />}
                        {isMeta && <FileText className="w-3 h-3" />}
                        {isNewComic && <PlusCircle className="w-3 h-3" />}
                        {isCover
                          ? `Cover Upgrade (${proposal.proposedChanges?.coverTarget === 'full' ? 'Full Art' : 'Front'})`
                          : isMeta
                          ? 'Metadata Correction'
                          : 'New Master Comic'}
                      </span>

                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        by <strong className="text-slate-700 dark:text-slate-300">{proposal.proposerDisplayName}</strong>{' '}
                        {isMine && <span className="text-indigo-600 dark:text-indigo-400 font-bold">(You)</span>}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs">
                      {isPending ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
                          <Clock className="w-3 h-3" />
                          {formatCountdown(proposal.expiresAt)}
                        </span>
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border capitalize ${
                            proposal.status === 'approved'
                              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                              : proposal.status === 'vetoed'
                              ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                              : proposal.status === 'rolled_back'
                              ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          {proposal.status === 'approved' && <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
                          {proposal.status === 'vetoed' && <XCircle className="w-3 h-3 text-rose-500" />}
                          {proposal.status === 'rolled_back' && <RotateCcw className="w-3 h-3 text-amber-500" />}
                          {proposal.status}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Proposal Comic Headline */}
                  <div className="py-2.5">
                    <h4 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <span>{proposal.masterSnapshot?.title || proposal.proposedChanges?.fields?.title || 'Comic Proposal'}</span>
                      <span className="text-slate-500 font-bold">
                        #{proposal.masterSnapshot?.issueNumber || proposal.proposedChanges?.fields?.issueNumber || '1'}
                      </span>
                      {proposal.masterSnapshot?.publisher && (
                        <span className="text-xs font-normal text-slate-400">
                          ({proposal.masterSnapshot.publisher})
                        </span>
                      )}
                    </h4>

                    {proposal.reason && (
                      <p className="text-xs text-slate-600 dark:text-slate-300 italic mt-1 bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                        &ldquo;{proposal.reason}&rdquo;
                      </p>
                    )}

                    {proposal.adminNotes && (
                      <p className="text-xs text-amber-700 dark:text-amber-300 font-medium mt-1 bg-amber-50/60 dark:bg-amber-950/30 p-2 rounded-lg border border-amber-200 dark:border-amber-800">
                        <strong>Admin Note:</strong> {proposal.adminNotes}
                      </p>
                    )}
                  </div>

                  {/* Visual Comparison Area */}
                  {isCover && proposal.proposedChanges?.stagedUrl && (
                    <div className="my-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800">
                      <div className="grid grid-cols-2 gap-3 text-center">
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                            Current Master Cover
                          </span>
                          <div className="aspect-[2/3] max-h-48 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-black/10 flex items-center justify-center mx-auto">
                            <img
                              src={getComicCoverUrl(
                                proposal.proposedChanges?.coverTarget === 'full'
                                  ? proposal.masterSnapshot?.coverImageFull || proposal.currentMaster?.coverImageFull
                                  : proposal.masterSnapshot?.coverImage || proposal.currentMaster?.coverImage
                              )}
                              alt="Current Master Cover"
                              className="w-full h-full object-contain"
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider block flex items-center justify-center gap-1">
                            <Sparkles className="w-3 h-3" />
                            Proposed WebP Upgrade
                          </span>
                          <div className="aspect-[2/3] max-h-48 rounded-lg overflow-hidden border-2 border-purple-500/40 bg-black/10 flex items-center justify-center mx-auto">
                            <img
                              src={proposal.proposedChanges.stagedUrl}
                              alt="Proposed Staged Cover"
                              className="w-full h-full object-contain"
                            />
                          </div>
                        </div>
                      </div>

                      {proposal.proposedChanges.sizeBytes && (
                        <p className="text-[10px] text-slate-400 text-center mt-2">
                          Optimized WebP File: ~{(proposal.proposedChanges.sizeBytes / 1024).toFixed(1)} KB
                        </p>
                      )}
                    </div>
                  )}

                  {/* Metadata Diff Area */}
                  {isMeta && proposal.proposedChanges?.fields && (
                    <div className="my-2.5 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden text-xs">
                      <div className="grid grid-cols-3 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 font-bold text-[11px] text-slate-600 dark:text-slate-300">
                        <span>Field</span>
                        <span>Current Master Value</span>
                        <span className="text-blue-600 dark:text-blue-400">Proposed Value</span>
                      </div>
                      <div className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                        {Object.entries(proposal.proposedChanges.fields).map(([k, v]) => (
                          <div key={k} className="grid grid-cols-3 px-3 py-2 text-slate-700 dark:text-slate-300">
                            <span className="font-semibold text-slate-500 capitalize">{k}</span>
                            <span className="truncate text-slate-400">
                              {JSON.stringify(proposal.masterSnapshot?.[k] ?? '—')}
                            </span>
                            <span className="font-semibold text-blue-600 dark:text-blue-400 truncate">
                              {JSON.stringify(v)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Voting Tally & Actions Bar */}
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/60 flex flex-wrap items-center justify-between gap-3">
                    {/* Quorum Progress Bar */}
                    <div className="flex-1 min-w-[200px] max-w-sm">
                      <div className="flex items-center justify-between text-[11px] font-bold mb-1">
                        <span className="text-slate-700 dark:text-slate-300">
                          Net Votes: <strong className={net >= 5 ? 'text-emerald-500' : 'text-slate-900 dark:text-slate-100'}>{net}</strong> / +5
                        </span>
                        <span className="text-slate-500">
                          {totalVotes} total ({ratio}% approval)
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden flex">
                        <div
                          style={{ width: `${Math.min(100, Math.max(0, ratio))}%` }}
                          className={`h-full transition-all ${
                            net >= 5 && ratio >= 70
                              ? 'bg-emerald-500'
                              : 'bg-indigo-500'
                          }`}
                        />
                      </div>
                    </div>

                    {/* Voting Buttons for VIPs */}
                    {isPending && (
                      <div className="flex items-center gap-2">
                        {isMine ? (
                          <span className="text-xs text-slate-400 italic">
                            Proposer cannot vote on own proposal
                          </span>
                        ) : !isVip ? (
                          <span className="text-xs text-slate-400">
                            VIP Tier 1+ required to cast votes
                          </span>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleVote(proposal.id, proposal.myVote, 1)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                                proposal.myVote === 1
                                  ? 'bg-emerald-600 text-white shadow-xs'
                                  : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 border border-emerald-200 dark:border-emerald-800'
                              }`}
                              title={proposal.myVote === 1 ? 'Click to retract your upvote' : 'Upvote (+1)'}
                            >
                              <ThumbsUp className="w-3.5 h-3.5" />
                              <span>{up}</span>
                            </button>

                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleVote(proposal.id, proposal.myVote, -1)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                                proposal.myVote === -1
                                  ? 'bg-rose-600 text-white shadow-xs'
                                  : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 border border-rose-200 dark:border-rose-800'
                              }`}
                              title={proposal.myVote === -1 ? 'Click to retract your downvote' : 'Downvote (-1)'}
                            >
                              <ThumbsDown className="w-3.5 h-3.5" />
                              <span>{down}</span>
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    {/* Admin Instant Action Controls */}
                    {isAdmin && (
                      <div className="flex items-center gap-1.5 ml-auto">
                        {isPending && (
                          <>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleAdminAction(proposal.id, 'approve')}
                              className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs transition-colors cursor-pointer"
                              title="Instantly approve and promote to Master Catalog"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => {
                                setVetoReasonPromptId(proposal.id);
                                setVetoReasonInput('');
                              }}
                              className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-rose-600 hover:bg-rose-500 text-white shadow-xs transition-colors cursor-pointer"
                              title="Veto proposal and immediately delete staged files from Cloud Storage"
                            >
                              Veto
                            </button>
                          </>
                        )}

                        {proposal.status === 'approved' && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleAdminAction(proposal.id, 'rollback', 'Admin rollback')}
                            className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-amber-600 hover:bg-amber-500 text-white shadow-xs transition-colors cursor-pointer flex items-center gap-1"
                            title="Roll back promoted changes from Master Catalog"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Rollback</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Veto Reason Modal Prompt Inline */}
                  {vetoReasonPromptId === proposal.id && (
                    <div className="mt-3 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 space-y-2">
                      <p className="text-xs font-bold text-rose-800 dark:text-rose-200">
                        Enter reason for Admin Veto (staged file will be permanently deleted):
                      </p>
                      <input
                        type="text"
                        value={vetoReasonInput}
                        onChange={(e) => setVetoReasonInput(e.target.value)}
                        placeholder="e.g. Low quality scan / incorrect comic"
                        className="w-full text-xs px-3 py-1.5 rounded-lg border border-rose-300 dark:border-rose-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setVetoReasonPromptId(null)}
                          className="px-2.5 py-1 text-xs text-slate-500 hover:text-slate-700 cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleAdminAction(proposal.id, 'veto', vetoReasonInput)}
                          className="px-3 py-1 text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white rounded-lg cursor-pointer"
                        >
                          Confirm Veto & Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 flex items-center justify-between text-xs text-slate-500">
          <span>
            {proposals.length} proposal{proposals.length === 1 ? '' : 's'} displayed
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
