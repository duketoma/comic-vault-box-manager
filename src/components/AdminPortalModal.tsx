import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  ShieldCheck,
  Users,
  Vote,
  FileText,
  Search,
  CheckCircle2,
  XCircle,
  RotateCcw,
  AlertTriangle,
  HardDrive,
  Ban,
  Crown,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import {
  AdminUserSummary,
  CatalogProposal,
  ModerationAuditLog,
  adminProposalAction,
  fetchAdminAuditLogs,
  fetchAdminUsers,
  fetchProposals,
  updateAdminUser,
} from '../services/proposalClientService';
import { useAuth } from '../context/AuthContext';

interface AdminPortalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenVotingModal?: () => void;
}

export const AdminPortalModal: React.FC<AdminPortalModalProps> = ({
  isOpen,
  onClose,
  onOpenVotingModal,
}) => {
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<'proposals' | 'users' | 'audit'>('proposals');

  // Proposals State
  const [proposals, setProposals] = useState<CatalogProposal[]>([]);
  const [proposalStatusFilter, setProposalStatusFilter] = useState<string>('all');
  const [isProposalsLoading, setIsProposalsLoading] = useState(false);

  // Users State
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [isUsersLoading, setIsUsersLoading] = useState(false);

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<ModerationAuditLog[]>([]);
  const [isLogsLoading, setIsLogsLoading] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // General Error / Feedback State
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);

  const loadProposals = useCallback(async () => {
    setIsProposalsLoading(true);
    try {
      const res = await fetchProposals(proposalStatusFilter);
      setProposals(res.proposals || []);
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message || 'Failed to load proposals' });
    } finally {
      setIsProposalsLoading(false);
    }
  }, [proposalStatusFilter]);

  const loadUsers = useCallback(async () => {
    setIsUsersLoading(true);
    try {
      const res = await fetchAdminUsers(userSearch);
      setUsers(res.users || []);
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message || 'Failed to load users' });
    } finally {
      setIsUsersLoading(false);
    }
  }, [userSearch]);

  const loadAuditLogs = useCallback(async () => {
    setIsLogsLoading(true);
    try {
      const res = await fetchAdminAuditLogs(100);
      setAuditLogs(res.logs || []);
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message || 'Failed to load audit logs' });
    } finally {
      setIsLogsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen || !isAdmin) return;
    if (activeTab === 'proposals') void loadProposals();
    if (activeTab === 'users') void loadUsers();
    if (activeTab === 'audit') void loadAuditLogs();
  }, [isOpen, isAdmin, activeTab, loadProposals, loadUsers, loadAuditLogs]);

  if (!isOpen) return null;

  if (!isAdmin) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex justify-center items-center p-4">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl max-w-md w-full text-center space-y-3 border border-slate-200 dark:border-slate-800">
          <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto" />
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Access Denied</h3>
          <p className="text-xs text-slate-500">This portal requires Administrator credentials.</p>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 dark:bg-slate-800 rounded-lg text-xs font-bold cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const handleProposalAction = async (
    proposalId: string,
    action: 'approve' | 'reject' | 'veto' | 'rollback',
    notes?: string
  ) => {
    setBusyActionId(proposalId);
    setFeedbackMessage(null);
    try {
      const res = await adminProposalAction(proposalId, action, notes);
      setProposals((prev) =>
        prev.map((p) => (p.id === proposalId ? { ...p, ...res.proposal } : p))
      );
      setFeedbackMessage({
        type: 'success',
        text: `Proposal ${proposalId.slice(0, 8)} successfully ${action}d!`,
      });
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message || `Failed to ${action} proposal.` });
    } finally {
      setBusyActionId(null);
    }
  };

  const handleUpdateUser = async (
    uid: string,
    updates: { vipTier?: 'free' | 'collector' | 'archivist'; isBannedFromProposals?: boolean }
  ) => {
    setBusyActionId(uid);
    setFeedbackMessage(null);
    try {
      const res = await updateAdminUser(uid, updates);
      setUsers((prev) => prev.map((u) => (u.uid === uid ? { ...u, ...res.user } : u)));
      setFeedbackMessage({
        type: 'success',
        text: `User ${res.user.displayName || res.user.email || uid} updated successfully!`,
      });
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message || 'Failed to update user.' });
    } finally {
      setBusyActionId(null);
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex justify-center items-center p-2 sm:p-4 overflow-y-auto"
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-5xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden my-auto">
        
        {/* Header Bar */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 leading-none">
                <span>Creator Admin Moderation Portal</span>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                  Super Admin
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Manage community proposals, user VIP tiers, proposal bans, and moderation audit logs.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenVotingModal && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenVotingModal();
                }}
                className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Switch to Community Voting Modal"
              >
                <Vote className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Voting Feed</span>
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

        {/* Tab Navigation */}
        <div className="px-4 sm:px-6 bg-slate-100/70 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('proposals')}
            className={`py-2.5 px-3 border-b-2 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'proposals'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Vote className="w-4 h-4" />
            <span>Community Proposals</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`py-2.5 px-3 border-b-2 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'users'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>User Management</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`py-2.5 px-3 border-b-2 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'audit'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Audit Trail & Rollback</span>
          </button>
        </div>

        {/* Feedback Alert Banner */}
        {feedbackMessage && (
          <div
            className={`px-4 sm:px-6 py-2 border-b text-xs flex items-center justify-between ${
              feedbackMessage.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800'
                : 'bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-800'
            }`}
          >
            <span className="font-medium flex items-center gap-1.5">
              {feedbackMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-500" />
              )}
              {feedbackMessage.text}
            </span>
            <button
              type="button"
              onClick={() => setFeedbackMessage(null)}
              className="text-xs font-bold opacity-75 hover:opacity-100"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Main Tab Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          
          {/* TAB 1: Proposals Moderation */}
          {activeTab === 'proposals' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-500 font-medium">Status:</span>
                  <select
                    value={proposalStatusFilter}
                    onChange={(e) => setProposalStatusFilter(e.target.value)}
                    className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                  >
                    <option value="all">All Statuses</option>
                    <option value="pending">Pending Active</option>
                    <option value="approved">Approved</option>
                    <option value="vetoed">Vetoed</option>
                    <option value="rejected">Rejected / Expired</option>
                    <option value="rolled_back">Rolled Back</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => void loadProposals()}
                    className="p-1 rounded text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isProposalsLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
                <span className="text-xs text-slate-400">
                  {proposals.length} proposal{proposals.length === 1 ? '' : 's'}
                </span>
              </div>

              {isProposalsLoading && proposals.length === 0 ? (
                <div className="py-16 text-center text-slate-400 text-xs">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-500" />
                  Loading proposals...
                </div>
              ) : proposals.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs border border-dashed rounded-xl">
                  No proposals found matching this filter.
                </div>
              ) : (
                <div className="space-y-3">
                  {proposals.map((p) => {
                    const isBusy = busyActionId === p.id;
                    return (
                      <div
                        key={p.id}
                        className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-2.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                              {p.proposalType}
                            </span>
                            <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                              {p.masterSnapshot?.title || p.proposedChanges?.fields?.title || 'Proposal'} #{p.masterSnapshot?.issueNumber || p.proposedChanges?.fields?.issueNumber || '1'}
                            </span>
                            <span className="text-xs text-slate-400">by {p.proposerDisplayName}</span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${
                                p.status === 'approved'
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                  : p.status === 'vetoed'
                                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                                  : p.status === 'rolled_back'
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                  : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300'
                              }`}
                            >
                              {p.status}
                            </span>

                            <span className="text-xs font-semibold text-slate-500">
                              Net: <strong>{p.netVotes}</strong> (+{p.upvotesCount} / -{p.downvotesCount})
                            </span>
                          </div>
                        </div>

                        {p.reason && (
                          <p className="text-xs text-slate-600 dark:text-slate-300 italic">
                            &ldquo;{p.reason}&rdquo;
                          </p>
                        )}

                        {/* Admin Action Buttons */}
                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-700/60">
                          {p.status === 'pending' && (
                            <>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleProposalAction(p.id, 'approve')}
                                className="px-3 py-1 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer"
                              >
                                {isBusy ? 'Processing...' : 'Instant Approve'}
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleProposalAction(p.id, 'veto', 'Admin Veto via Portal')}
                                className="px-3 py-1 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition-colors cursor-pointer"
                              >
                                {isBusy ? 'Processing...' : 'Veto & Purge Staging'}
                              </button>
                            </>
                          )}

                          {p.status === 'approved' && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleProposalAction(p.id, 'rollback', 'Rolled back via Admin Portal')}
                              className="px-3 py-1 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white transition-colors cursor-pointer flex items-center gap-1"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Rollback Changes</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: User Management */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search by email, name, or UID..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void loadUsers();
                    }}
                    className="w-full text-xs pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void loadUsers()}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer"
                >
                  Search
                </button>
              </div>

              {isUsersLoading && users.length === 0 ? (
                <div className="py-16 text-center text-slate-400 text-xs">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-500" />
                  Loading user accounts...
                </div>
              ) : users.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs border border-dashed rounded-xl">
                  No users found.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900 text-xs">
                  {users.map((u) => {
                    const isBusy = busyActionId === u.uid;
                    return (
                      <div
                        key={u.uid}
                        className="p-3.5 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 dark:text-slate-100">
                              {u.displayName || 'Unnamed User'}
                            </span>
                            {u.role === 'admin' && (
                              <span className="text-[10px] font-black uppercase px-1.5 py-0.2 bg-rose-100 text-rose-800 rounded">
                                Admin
                              </span>
                            )}
                            {u.isBannedFromProposals && (
                              <span className="text-[10px] font-black uppercase px-1.5 py-0.2 bg-red-600 text-white rounded">
                                Proposal Banned
                              </span>
                            )}
                          </div>
                          <p className="text-slate-500 text-[11px] font-mono">{u.email || u.uid}</p>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400">
                            <HardDrive className="w-3 h-3" />
                            <span>Storage Used: {(u.storageBytesUsed / (1024 * 1024)).toFixed(2)} MB</span>
                          </div>
                        </div>

                        {/* User Actions */}
                        {u.role !== 'admin' && (
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1">
                              <span className="text-[11px] text-slate-400">Tier:</span>
                              <select
                                disabled={isBusy}
                                value={u.vipTier}
                                onChange={(e) =>
                                  handleUpdateUser(u.uid, {
                                    vipTier: e.target.value as 'free' | 'collector' | 'archivist',
                                  })
                                }
                                className="text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                              >
                                <option value="free">Free User</option>
                                <option value="collector">Collector (Tier 1)</option>
                                <option value="archivist">Archivist (Tier 2)</option>
                              </select>
                            </div>

                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() =>
                                handleUpdateUser(u.uid, {
                                  isBannedFromProposals: !u.isBannedFromProposals,
                                })
                              }
                              className={`px-2.5 py-1 rounded text-xs font-bold transition-colors cursor-pointer ${
                                u.isBannedFromProposals
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-300'
                                  : 'bg-rose-50 text-rose-700 border border-rose-300'
                              }`}
                            >
                              {u.isBannedFromProposals ? 'Unban Proposals' : 'Ban Proposals'}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Audit Trail */}
          {activeTab === 'audit' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 font-medium">Recent Moderation Actions (Live Stream)</span>
                <button
                  type="button"
                  onClick={() => void loadAuditLogs()}
                  className="p-1 rounded text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLogsLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {isLogsLoading && auditLogs.length === 0 ? (
                <div className="py-16 text-center text-slate-400 text-xs">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-500" />
                  Loading audit trail...
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs border border-dashed rounded-xl">
                  No moderation logs recorded yet.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900 text-xs">
                  {auditLogs.map((log) => {
                    const isExpanded = expandedLogId === log.id;
                    return (
                      <div key={log.id} className="p-3.5 space-y-2">
                        <div
                          className="flex items-center justify-between cursor-pointer select-none"
                          onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                        >
                          <div className="flex items-center gap-2">
                            {isExpanded ? (
                              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                            )}
                            <span className="font-bold text-slate-900 dark:text-slate-100 font-mono text-[11px]">
                              {log.action}
                            </span>
                            {log.proposalId && (
                              <span className="text-[10px] text-slate-400 font-mono">
                                proposal: {log.proposalId.slice(0, 10)}...
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-400">
                            {new Date(log.createdAt).toLocaleString()}
                          </span>
                        </div>

                        {isExpanded && (
                          <div className="p-2.5 rounded-lg bg-slate-950 text-slate-200 font-mono text-[11px] overflow-x-auto space-y-1">
                            <div>Actor ID: {log.actorId}</div>
                            {log.targetUserId && <div>Target User ID: {log.targetUserId}</div>}
                            <pre className="text-[10px] leading-tight text-emerald-400">
                              {JSON.stringify(log.details, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 flex items-center justify-between text-xs text-slate-500">
          <span>Logged in as Creator Super Admin</span>
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
