import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  Trash2,
  Mail,
  CheckCircle2,
  AlertCircle,
  Briefcase,
  Plus,
  ArrowRightLeft,
  XCircle
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

export const TeamView = ({ showToast }) => {
  const { currentOrg, user } = useAuth();
  const [activeTab, setActiveTab] = useState('members'); // 'members' | 'teams'

  // Members state
  const [members, setMembers] = useState([]);
  const [pendingInvitations, setPendingInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Invite modal form states
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [isInviting, setIsInviting] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState(null);

  // Teams state
  const [teams, setTeams] = useState([]);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDesc, setNewTeamDesc] = useState('');
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);

  // Ownership transfer state
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);

  const fetchTeamData = async () => {
    if (!currentOrg?._id) return;
    try {
      setLoading(true);
      setError(null);

      const [membersRes, teamsRes] = await Promise.all([
        api.get(`/organizations/${currentOrg._id}/members`),
        api.get('/teams')
      ]);

      if (membersRes.data.success) {
        setMembers(membersRes.data.members || []);
        setPendingInvitations(membersRes.data.pendingInvitations || []);
      }

      if (teamsRes.data.success) {
        setTeams(teamsRes.data.teams || []);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load organization members');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeamData();
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
        fetchTeamData();
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to invite member';
      showToast?.({ type: 'error', message: msg });
    } finally {
      setIsInviting(false);
    }
  };

  const handleRevokeInvitation = async (invitationId) => {
    try {
      const res = await api.delete(`/organizations/${currentOrg._id}/invitations/${invitationId}`);
      if (res.data.success) {
        showToast?.({ type: 'success', message: 'Invitation revoked' });
        fetchTeamData();
      }
    } catch (err) {
      showToast?.({ type: 'error', message: err.response?.data?.message || 'Failed to revoke invitation' });
    }
  };

  const handleRoleChange = async (memberUserId, newRole) => {
    try {
      const res = await api.patch(`/organizations/${currentOrg._id}/members/${memberUserId}`, {
        role: newRole
      });
      if (res.data.success) {
        showToast?.({ type: 'success', message: `Member role updated to ${newRole}` });
        fetchTeamData();
      }
    } catch (err) {
      showToast?.({ type: 'error', message: err.response?.data?.message || 'Failed to update member role' });
    }
  };

  const handleRemoveMember = async (memberUserId) => {
    if (!window.confirm('Are you sure you want to remove this member from the organization?')) return;
    try {
      const res = await api.delete(`/organizations/${currentOrg._id}/members/${memberUserId}`);
      if (res.data.success) {
        showToast?.({ type: 'success', message: 'Member removed' });
        fetchTeamData();
      }
    } catch (err) {
      showToast?.({ type: 'error', message: err.response?.data?.message || 'Failed to remove member' });
    }
  };

  const handleCreateTeam = async (e) => {
    e.preventDefault();
    if (!newTeamName.trim()) return;

    setIsCreatingTeam(true);
    try {
      const res = await api.post('/teams', {
        name: newTeamName.trim(),
        description: newTeamDesc.trim()
      });
      if (res.data.success) {
        setNewTeamName('');
        setNewTeamDesc('');
        showToast?.({ type: 'success', message: 'Team created successfully' });
        fetchTeamData();
      }
    } catch (err) {
      showToast?.({ type: 'error', message: err.response?.data?.message || 'Failed to create team' });
    } finally {
      setIsCreatingTeam(false);
    }
  };

  const handleDeleteTeam = async (teamId) => {
    if (!window.confirm('Are you sure you want to delete this team?')) return;
    try {
      const res = await api.delete(`/teams/${teamId}`);
      if (res.data.success) {
        showToast?.({ type: 'success', message: 'Team deleted' });
        fetchTeamData();
      }
    } catch (err) {
      showToast?.({ type: 'error', message: err.response?.data?.message || 'Failed to delete team' });
    }
  };

  const handleTransferOwnership = async (e) => {
    e.preventDefault();
    if (!transferTargetId) return;

    setIsTransferring(true);
    try {
      const res = await api.post(`/organizations/${currentOrg._id}/transfer-ownership`, {
        targetUserId: transferTargetId
      });
      if (res.data.success) {
        showToast?.({ type: 'success', message: res.data.message });
        setShowTransferModal(false);
        fetchTeamData();
      }
    } catch (err) {
      showToast?.({ type: 'error', message: err.response?.data?.message || 'Failed to transfer ownership' });
    } finally {
      setIsTransferring(false);
    }
  };

  const isOwner = currentOrg?.role === 'owner';
  const isOwnerOrAdmin = isOwner || currentOrg?.role === 'admin';
  const isManagerOrAbove = isOwnerOrAdmin || currentOrg?.role === 'manager';

  const roleBadgeStyles = {
    owner: 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800',
    admin: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
    manager: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    member: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700',
    guest: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    billing_admin: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
  };

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
            Manage teammates, RBAC permissions, squads, and invitations.
          </p>
        </div>

        {isOwner && (
          <button
            onClick={() => setShowTransferModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800 rounded-xl hover:bg-purple-100 dark:hover:bg-purple-900/60 transition-colors"
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            <span>Transfer Ownership</span>
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('members')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl transition-colors ${
            activeTab === 'members'
              ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Members ({members.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('teams')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl transition-colors ${
            activeTab === 'teams'
              ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Briefcase className="w-4 h-4" />
          <span>Teams & Squads ({teams.length})</span>
        </button>
      </div>

      {activeTab === 'members' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Members List */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <span className="text-sm font-bold text-slate-800 dark:text-slate-100">Active Members</span>
                <span className="text-xs text-slate-400">{members.length} member{members.length !== 1 ? 's' : ''}</span>
              </div>

              {loading ? (
                <div className="p-8 text-center text-slate-400 text-sm">Loading members...</div>
              ) : members.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">No members found</div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {members.map((m) => {
                    const isSelf = m.user?._id === user?.id;
                    const isTargetOwner = m.role === 'owner';
                    const canEditThisMember = isOwnerOrAdmin && !isTargetOwner && !isSelf;

                    return (
                      <div key={m.id} className="p-4 flex items-center justify-between gap-3 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-linear-to-tr from-indigo-500 to-purple-500 text-white flex items-center justify-center font-bold text-sm shrink-0">
                            {m.user?.name?.slice(0, 1)?.toUpperCase() || 'U'}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                                {m.user?.name}
                              </span>
                              {isSelf && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-sm bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                  You
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-slate-400 truncate block">{m.user?.email}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {canEditThisMember ? (
                            <select
                              value={m.role}
                              onChange={(e) => handleRoleChange(m.user?._id, e.target.value)}
                              className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                            >
                              <option value="admin">Admin</option>
                              <option value="manager">Manager</option>
                              <option value="member">Member</option>
                              <option value="guest">Guest</option>
                              <option value="billing_admin">Billing Admin</option>
                            </select>
                          ) : (
                            <span className={`text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg border ${roleBadgeStyles[m.role] || roleBadgeStyles.member}`}>
                              {m.role.replace('_', ' ')}
                            </span>
                          )}

                          {canEditThisMember && (
                            <button
                              onClick={() => handleRemoveMember(m.user?._id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
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
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-100">Pending Invitations</span>
                  <span className="text-xs text-amber-500 font-semibold">{pendingInvitations.length} pending</span>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {pendingInvitations.map((inv) => (
                    <div key={inv._id} className="p-4 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                          <Mail className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">{inv.email}</span>
                          <span className="text-[10px] text-slate-400">Invited as {inv.role}</span>
                        </div>
                      </div>

                      {isManagerOrAbove && (
                        <button
                          onClick={() => handleRevokeInvitation(inv._id)}
                          className="inline-flex items-center gap-1 text-xs text-rose-500 hover:text-rose-700 px-2 py-1 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Revoke</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Invite Form */}
          <div>
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
                <UserPlus className="w-4 h-4 text-indigo-600" />
                <span>Invite Teammate</span>
              </div>

              {isManagerOrAbove ? (
                <form onSubmit={handleInvite} className="space-y-4">
                  {inviteSuccess && (
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>{inviteSuccess}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="colleague@company.com"
                      required
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Role
                    </label>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                    >
                      {isOwner && <option value="admin">Admin (Full organization & member management)</option>}
                      <option value="manager">Manager (Teams, tasks, and task assignments)</option>
                      <option value="member">Member (Standard collaborative task creation)</option>
                      <option value="guest">Guest (Restricted to assigned tasks)</option>
                      <option value="billing_admin">Billing Admin (Billing & invoicing only)</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={isInviting}
                    className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-xs rounded-xl transition-all shadow-xs active:scale-95 flex items-center justify-center gap-2"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>{isInviting ? 'Inviting...' : 'Send Invitation'}</span>
                  </button>
                </form>
              ) : (
                <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl text-xs text-slate-500 dark:text-slate-400">
                  You have view-only access to member rosters. Only Managers, Admins, and Owners can invite new users.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Teams Tab */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <span className="text-sm font-bold text-slate-800 dark:text-slate-100">Organization Teams & Squads</span>
                <span className="text-xs text-slate-400">{teams.length} team{teams.length !== 1 ? 's' : ''}</span>
              </div>

              {teams.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">
                  No teams created yet. Create a squad to group members for task assignments.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {teams.map((t) => (
                    <div key={t._id} className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">{t.name}</h4>
                          {t.description && <p className="text-xs text-slate-400">{t.description}</p>}
                        </div>
                        {isManagerOrAbove && (
                          <button
                            onClick={() => handleDeleteTeam(t._id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">
                          Members ({t.members?.length || 0}):
                        </span>
                        <div className="flex -space-x-1.5 overflow-hidden">
                          {t.members?.map((tm) => (
                            <div
                              key={tm._id}
                              title={tm.name}
                              className="inline-block h-6 w-6 rounded-full ring-2 ring-white dark:ring-slate-900 bg-indigo-500 text-white text-[10px] flex items-center justify-center font-bold"
                            >
                              {tm.name?.[0]?.toUpperCase()}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Create Team Form */}
          <div>
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
                <Briefcase className="w-4 h-4 text-indigo-600" />
                <span>Create New Team</span>
              </div>

              {isManagerOrAbove ? (
                <form onSubmit={handleCreateTeam} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Team / Squad Name
                    </label>
                    <input
                      type="text"
                      value={newTeamName}
                      onChange={(e) => setNewTeamName(e.target.value)}
                      placeholder="e.g. Frontend Engineering, Marketing"
                      required
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Description (Optional)
                    </label>
                    <textarea
                      value={newTeamDesc}
                      onChange={(e) => setNewTeamDesc(e.target.value)}
                      placeholder="Team purpose and responsibilities..."
                      rows={2}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isCreatingTeam}
                    className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-xs rounded-xl transition-all shadow-xs flex items-center justify-center gap-2"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isCreatingTeam ? 'Creating...' : 'Create Squad'}</span>
                  </button>
                </form>
              ) : (
                <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl text-xs text-slate-500 dark:text-slate-400">
                  Only Managers, Admins, and Owners can create teams.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Ownership Transfer Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 font-bold text-base">
              <Shield className="w-5 h-5" />
              <span>Transfer Organization Ownership</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Transferring ownership will promote the selected teammate to <strong>Owner</strong>. You will automatically become an <strong>Admin</strong>. This action cannot be reversed without the new owner's consent.
            </p>

            <form onSubmit={handleTransferOwnership} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Select Successor Member
                </label>
                <select
                  value={transferTargetId}
                  onChange={(e) => setTransferTargetId(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                >
                  <option value="">-- Choose Active Teammate --</option>
                  {members
                    .filter((m) => m.user?._id !== user?.id)
                    .map((m) => (
                      <option key={m.id} value={m.user?._id}>
                        {m.user?.name} ({m.user?.email}) — {m.role}
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isTransferring || !transferTargetId}
                  className="px-4 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-xl shadow-xs"
                >
                  {isTransferring ? 'Transferring...' : 'Confirm Transfer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
