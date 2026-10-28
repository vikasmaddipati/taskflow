import React, { useState, useEffect } from 'react';
import { Users, UserPlus, Shield, Trash2, Mail, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

export const TeamView = ({ showToast }) => {
  const { currentOrg, user } = useAuth();
  const [members, setMembers] = useState([]);
  const [pendingInvitations, setPendingInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Invite modal form states
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [isInviting, setIsInviting] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState(null);

  const fetchTeam = async () => {
    if (!currentOrg?._id) return;
    try {
      setLoading(true);
      setError(null);
      const res = await api.get(`/organizations/${currentOrg._id}/members`);
      if (res.data.success) {
        setMembers(res.data.members || []);
        setPendingInvitations(res.data.pendingInvitations || []);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load organization members');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeam();
  }, [currentOrg?._id]);

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!inviteEmail || !inviteEmail.includes('@')) {
      showToast?.({ type: 'error', message: 'Please enter a valid email address' });
      return;
    }

    setIsInviting(true);
    setInviteSuccess(null);
    try {
      const res = await api.post(`/organizations/${currentOrg._id}/invitations`, {
        email: inviteEmail.trim(),
        role: inviteRole
      });

      if (res.data.success) {
        setInviteEmail('');
        setInviteSuccess(`Invitation generated for ${res.data.invitation.email}`);
        showToast?.({ type: 'success', message: 'Invitation created successfully' });
        fetchTeam();
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to invite member';
      showToast?.({ type: 'error', message: msg });
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemoveMember = async (memberUserId) => {
    if (!window.confirm('Are you sure you want to remove this member from the organization?')) return;
    try {
      const res = await api.delete(`/organizations/${currentOrg._id}/members/${memberUserId}`);
      if (res.data.success) {
        showToast?.({ type: 'success', message: 'Member removed' });
        fetchTeam();
      }
    } catch (err) {
      showToast?.({ type: 'error', message: err.response?.data?.message || 'Failed to remove member' });
    }
  };

  const isOwnerOrAdmin = currentOrg?.role === 'owner' || currentOrg?.role === 'admin';

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="p-6 bg-linear-to-r from-indigo-500/10 via-purple-500/10 to-blue-500/10 dark:from-indigo-950/20 dark:via-purple-950/20 dark:to-blue-950/20 rounded-2xl border border-indigo-200/50 dark:border-indigo-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-semibold text-xs uppercase tracking-wider">
            <Users className="w-4 h-4" />
            <span>Collaboration & Access</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1">
            Team & Members — {currentOrg?.name || 'Workspace'}
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Manage teammates, roles, and pending invitations for this organization.
          </p>
        </div>
      </div>

      {/* Invite Member Section (if owner or admin) */}
      {isOwnerOrAdmin && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-slate-800 dark:text-slate-100 font-bold text-sm">
            <UserPlus className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>Invite New Member</span>
          </div>

          {inviteSuccess && (
            <div className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 text-xs text-emerald-800 dark:text-emerald-300 rounded-xl">
              <CheckCircle2 className="w-4 h-4" />
              <span>{inviteSuccess}</span>
            </div>
          )}

          <form onSubmit={handleInvite} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative flex-1">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@company.com"
                className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="px-3.5 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 font-medium focus:outline-none cursor-pointer"
            >
              <option value="member">Member (Can edit tasks)</option>
              <option value="admin">Admin (Can invite teammates)</option>
              <option value="guest">Guest (Read-only)</option>
            </select>

            <button
              type="submit"
              disabled={isInviting}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors disabled:opacity-50 shrink-0"
            >
              {isInviting ? 'Inviting...' : 'Send Invitation'}
            </button>
          </form>
        </div>
      )}

      {/* Members List */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
            Active Members ({members.length})
          </h3>
          <span className="text-xs text-slate-400">Your role: {currentOrg?.role || 'member'}</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading team members...</div>
        ) : error ? (
          <div className="p-6 text-center text-xs text-rose-500">{error}</div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {members.map((m) => {
              const isCurrentUser = m.user?._id === user?.id;
              return (
                <div key={m.id} className="p-4 sm:px-6 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-indigo-100 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 font-bold flex items-center justify-center text-xs shrink-0">
                      {m.user?.name ? m.user.name.charAt(0).toUpperCase() : 'U'}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <span className="truncate">{m.user?.name || 'Unnamed User'}</span>
                        {isCurrentUser && (
                          <span className="text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-500 font-normal">
                            You
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 truncate">{m.user?.email}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="inline-flex items-center gap-1 text-xs uppercase font-extrabold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      <Shield className="w-3 h-3 text-indigo-500" />
                      {m.role}
                    </span>

                    {isOwnerOrAdmin && m.role !== 'owner' && !isCurrentUser && (
                      <button
                        type="button"
                        onClick={() => handleRemoveMember(m.user?._id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors"
                        title="Remove member"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pending Invitations */}
      {pendingInvitations.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-6 space-y-3">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
            Pending Invitations ({pendingInvitations.length})
          </h3>
          <div className="space-y-2">
            {pendingInvitations.map((inv) => (
              <div
                key={inv._id}
                className="flex items-center justify-between p-3 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-400"
              >
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-slate-400" />
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{inv.email}</span>
                  <span className="text-slate-400 font-normal">({inv.role})</span>
                </div>
                <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">Pending Acceptance</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
