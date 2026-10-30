import React, { useState, useEffect } from 'react';
import {
  User,
  Sun,
  Moon,
  Shield,
  Save,
  CheckCircle2,
  AlertCircle,
  Server,
  Building2,
  Plus,
  Smartphone,
  LogOut,
  Mail,
  Download,
  Trash2,
  AlertTriangle,
  FileText,
  Webhook,
  Send,
  ExternalLink
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { getBaseURL } from '../services/api';
import api from '../services/api';

export const SettingsView = ({ showToast }) => {
  const { user, updateProfile, fetchOrganizations, logout, currentOrg } = useAuth();
  const { theme, setTheme } = useTheme();

  // Profile fields
  const [name, setName] = useState(user?.name || '');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState(null);

  // Email change state
  const [isChangingEmail, setIsChangingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [isSubmittingEmail, setIsSubmittingEmail] = useState(false);
  const [emailMessage, setEmailMessage] = useState(null);

  // Data Export state (GDPR Art. 20)
  const [isExporting, setIsExporting] = useState(false);

  // Delete Account state (GDPR Art. 17)
  const [isDeleteAccountModalOpen, setIsDeleteAccountModalOpen] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  // New Organization fields
  const [newOrgName, setNewOrgName] = useState('');
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);

  // Webhooks & Integrations state
  const [webhooks, setWebhooks] = useState([]);
  const [loadingWebhooks, setLoadingWebhooks] = useState(false);
  const [newWebhookUrl, setNewWebhookUrl] = useState('');
  const [isAddingWebhook, setIsAddingWebhook] = useState(false);

  // Active Sessions
  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [isRevokingAll, setIsRevokingAll] = useState(false);

  // Server API URL state (for Mobile testing)
  const [serverUrl, setServerUrl] = useState(() => localStorage.getItem('tm_api_url') || getBaseURL());

  const fetchSessions = async () => {
    try {
      setLoadingSessions(true);
      const res = await api.get('/auth/sessions');
      if (res.data.success) {
        setSessions(res.data.sessions || []);
      }
    } catch {
      // ignore session loading error
    } finally {
      setLoadingSessions(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleSaveServerUrl = (e) => {
    e.preventDefault();
    if (serverUrl.trim()) {
      localStorage.setItem('tm_api_url', serverUrl.trim());
      showToast?.({ type: 'success', message: 'API Server URL updated' });
    } else {
      localStorage.removeItem('tm_api_url');
      setServerUrl(getBaseURL());
      showToast?.({ type: 'info', message: 'Reset to default API URL' });
    }
  };

  // Handle Email Change
  const handleChangeEmail = async (e) => {
    e.preventDefault();
    if (!newEmail.trim()) {
      setEmailMessage({ type: 'error', text: 'Please enter a valid new email address' });
      return;
    }

    setIsSubmittingEmail(true);
    setEmailMessage(null);

    try {
      const res = await api.patch('/auth/email', {
        newEmail: newEmail.trim(),
        password: emailPassword || undefined
      });

      if (res.data.success) {
        setEmailMessage({ type: 'success', text: res.data.message });
        showToast?.({ type: 'success', message: 'Email address updated' });
        setIsChangingEmail(false);
        setNewEmail('');
        setEmailPassword('');
        if (res.data.user && user) {
          user.email = res.data.user.email;
          user.isEmailVerified = false;
        }
      }
    } catch (err) {
      setEmailMessage({ type: 'error', text: err.response?.data?.message || 'Failed to update email' });
    } finally {
      setIsSubmittingEmail(false);
    }
  };

  // Handle Data Export (GDPR Art. 20 Data Portability)
  const handleExportData = async (format = 'json') => {
    try {
      setIsExporting(true);
      const res = await api.get(`/tasks/export?format=${format}`, {
        responseType: format === 'csv' ? 'blob' : 'json'
      });

      const blob =
        format === 'csv'
          ? new Blob([res.data], { type: 'text/csv;charset=utf-8;' })
          : new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `taskflow_tasks_export.${format}`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      showToast?.({ type: 'success', message: `Exported tasks as ${format.toUpperCase()}` });
    } catch (err) {
      showToast?.({ type: 'error', message: 'Failed to export data' });
    } finally {
      setIsExporting(false);
    }
  };

  // Handle Account Deletion (GDPR Art. 17 Right to Erasure)
  const handleDeleteAccount = async (e) => {
    e.preventDefault();
    if (deleteConfirmationText !== 'DELETE') {
      showToast?.({ type: 'error', message: 'Please type DELETE to confirm' });
      return;
    }

    setIsDeletingAccount(true);
    try {
      const res = await api.delete('/auth/account', {
        data: {
          confirmation: 'DELETE',
          password: deletePassword || undefined
        }
      });

      if (res.data.success) {
        showToast?.({ type: 'info', message: 'Account permanently deleted' });
        await logout();
      }
    } catch (err) {
      showToast?.({ type: 'error', message: err.response?.data?.message || 'Failed to delete account' });
    } finally {
      setIsDeletingAccount(false);
    }
  };

  // Password fields
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState(null);

  // Handle Profile Update
  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setProfileMessage({ type: 'error', text: 'Name cannot be empty' });
      return;
    }

    setIsUpdatingProfile(true);
    setProfileMessage(null);

    const res = await updateProfile({ name: name.trim(), theme });
    setIsUpdatingProfile(false);

    if (res.success) {
      setProfileMessage({ type: 'success', text: 'Profile updated successfully!' });
      showToast?.({ type: 'success', message: 'Profile settings saved' });
    } else {
      setProfileMessage({ type: 'error', text: res.message || 'Failed to update profile' });
    }
  };

  // Handle Theme Change
  const handleThemeChange = async (newTheme) => {
    setTheme(newTheme);
    await updateProfile({ theme: newTheme });
    showToast?.({ type: 'info', message: `Theme changed to ${newTheme} mode` });
  };

  // Handle Create Organization
  const handleCreateOrg = async (e) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;

    setIsCreatingOrg(true);
    try {
      const res = await api.post('/organizations', { name: newOrgName.trim() });
      if (res.data.success) {
        setNewOrgName('');
        showToast?.({ type: 'success', message: 'Organization created successfully' });
        await fetchOrganizations();
      }
    } catch (err) {
      showToast?.({ type: 'error', message: err.response?.data?.message || 'Failed to create organization' });
    } finally {
      setIsCreatingOrg(false);
    }
  };

  // Fetch webhooks when organization changes
  useEffect(() => {
    if (currentOrg?._id) {
      setLoadingWebhooks(true);
      api.get(`/organizations/${currentOrg._id}/webhooks`)
        .then((res) => {
          if (res.data.success) {
            setWebhooks(res.data.webhooks || []);
          }
        })
        .catch(() => {})
        .finally(() => setLoadingWebhooks(false));
    }
  }, [currentOrg?._id]);

  const handleCreateWebhook = async (e) => {
    e.preventDefault();
    if (!currentOrg?._id || !newWebhookUrl.trim()) return;
    setIsAddingWebhook(true);
    try {
      const res = await api.post(`/organizations/${currentOrg._id}/webhooks`, {
        url: newWebhookUrl.trim(),
        events: ['task.created', 'task.updated', 'task.deleted']
      });
      if (res.data.success && res.data.webhook) {
        setWebhooks((prev) => [res.data.webhook, ...prev]);
        setNewWebhookUrl('');
        showToast?.({ type: 'success', message: 'Webhook registered successfully!' });
      }
    } catch (err) {
      showToast?.({ type: 'error', message: err.response?.data?.message || 'Failed to add webhook' });
    } finally {
      setIsAddingWebhook(false);
    }
  };

  const handleDeleteWebhook = async (webhookId) => {
    if (!currentOrg?._id || !webhookId) return;
    try {
      const res = await api.delete(`/organizations/${currentOrg._id}/webhooks/${webhookId}`);
      if (res.data.success) {
        setWebhooks((prev) => prev.filter((w) => w._id !== webhookId));
        showToast?.({ type: 'success', message: 'Webhook subscription deleted' });
      }
    } catch (err) {
      showToast?.({ type: 'error', message: err.response?.data?.message || 'Failed to delete webhook' });
    }
  };

  const handleTestWebhook = async (webhookId) => {
    if (!currentOrg?._id || !webhookId) return;
    try {
      const res = await api.post(`/organizations/${currentOrg._id}/webhooks/${webhookId}/test`);
      if (res.data.success) {
        showToast?.({ type: 'success', message: 'Test ping dispatched to webhook' });
      }
    } catch (err) {
      showToast?.({ type: 'error', message: err.response?.data?.message || 'Failed to test webhook' });
    }
  };

  // Handle Logout All Devices
  const handleRevokeAllSessions = async () => {
    if (!window.confirm('This will sign you out of all other browsers, mobile devices, and active sessions. Continue?')) {
      return;
    }

    setIsRevokingAll(true);
    try {
      const res = await api.post('/auth/logout-all');
      if (res.data.success) {
        showToast?.({ type: 'success', message: 'All active sessions revoked' });
        fetchSessions();
      }
    } catch (err) {
      showToast?.({ type: 'error', message: err.response?.data?.message || 'Failed to revoke sessions' });
    } finally {
      setIsRevokingAll(false);
    }
  };

  // Handle Password Update
  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) {
      setPasswordMessage({ type: 'error', text: 'Please fill in both current and new passwords' });
      return;
    }

    if (newPassword.length < 6) {
      setPasswordMessage({ type: 'error', text: 'New password must be at least 6 characters' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'New passwords do not match' });
      return;
    }

    setIsUpdatingPassword(true);
    setPasswordMessage(null);

    const res = await updateProfile({ currentPassword, newPassword });
    setIsUpdatingPassword(false);

    if (res.success) {
      setPasswordMessage({ type: 'success', text: 'Password changed successfully! Other sessions logged out.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showToast?.({ type: 'success', message: 'Password updated successfully' });
      fetchSessions();
    } else {
      setPasswordMessage({ type: 'error', text: res.message || 'Failed to change password' });
    }
  };

  return (
    <div className="max-w-3xl space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
          Account & Workspace Settings
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
          Manage your personal profile, organizations, active sessions, and security credentials.
        </p>
      </div>

      {/* Profile Details Form */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-5">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-xl">
            <User className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Personal Information</h3>
            <p className="text-xs text-slate-400">Update your public display name</p>
          </div>
        </div>

        {profileMessage && (
          <div
            className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
              profileMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                : 'bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300'
            }`}
          >
            {profileMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span>{profileMessage.text}</span>
          </div>
        )}

        {emailMessage && (
          <div
            className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
              emailMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                : 'bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300'
            }`}
          >
            {emailMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span>{emailMessage.text}</span>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Email Address
            </label>
            <button
              type="button"
              onClick={() => setIsChangingEmail(!isChangingEmail)}
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              {isChangingEmail ? 'Cancel' : 'Change Email'}
            </button>
          </div>
          <input
            type="email"
            disabled
            value={user?.email || ''}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/50 text-slate-500 text-sm cursor-not-allowed"
          />

          {isChangingEmail && (
            <form onSubmit={handleChangeEmail} className="mt-3 p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/80 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  New Email Address
                </label>
                <input
                  type="email"
                  required
                  placeholder="name@company.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
              </div>

              {user?.authProviders?.includes('local') && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Current Password (for confirmation)
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Enter current password"
                    value={emailPassword}
                    onChange={(e) => setEmailPassword(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsChangingEmail(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEmail}
                  className="px-3.5 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                  {isSubmittingEmail ? 'Updating...' : 'Update Email'}
                </button>
              </div>
            </form>
          )}
        </div>

        <form onSubmit={handleProfileSubmit} className="space-y-4">

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
              Full Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isUpdatingProfile}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isUpdatingProfile}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold text-xs sm:text-sm shadow-xs transition-all active:scale-95"
            >
              {isUpdatingProfile ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>

      {/* Organization Creation Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="p-2.5 bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 rounded-xl">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Create New Organization</h3>
            <p className="text-xs text-slate-400">Launch a shared workspace for your company or team</p>
          </div>
        </div>

        <form onSubmit={handleCreateOrg} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            required
            value={newOrgName}
            onChange={(e) => setNewOrgName(e.target.value)}
            placeholder="Acme Corp, Product Team, etc."
            className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            disabled={isCreatingOrg}
            className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs sm:text-sm shadow-xs transition-colors shrink-0 disabled:opacity-50"
          >
            {isCreatingOrg ? 'Creating...' : 'Create Organization'}
          </button>
        </form>
      </div>

      {/* Outgoing Webhooks & Integrations Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-xl">
            <Webhook className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Webhooks & External Integrations</h3>
            <p className="text-xs text-slate-400">Dispatch real-time HMAC-signed webhooks to Slack, Discord, or Zapier</p>
          </div>
        </div>

        {/* Add Webhook Form */}
        <form onSubmit={handleCreateWebhook} className="flex flex-col sm:flex-row gap-3">
          <input
            type="url"
            required
            value={newWebhookUrl}
            onChange={(e) => setNewWebhookUrl(e.target.value)}
            placeholder="https://hooks.slack.com/services/... or https://api.yoursite.com/webhook"
            className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            disabled={isAddingWebhook || !newWebhookUrl.trim()}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-xs transition-colors shrink-0 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>{isAddingWebhook ? 'Adding...' : 'Add Webhook'}</span>
          </button>
        </form>

        {/* Webhooks List */}
        {loadingWebhooks ? (
          <div className="py-4 text-center text-xs text-slate-400">Loading webhooks...</div>
        ) : webhooks.length === 0 ? (
          <div className="py-4 text-center text-xs text-slate-400">
            No active webhook subscriptions configured for this organization.
          </div>
        ) : (
          <div className="space-y-2.5 pt-2">
            {webhooks.map((wh) => (
              <div
                key={wh._id}
                className="p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/50 flex items-center justify-between gap-3 text-xs flex-wrap"
              >
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">{wh.url}</span>
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                      Active
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 flex items-center gap-2">
                    <span>Events: {(wh.events || []).join(', ')}</span>
                    <span>•</span>
                    <span className="font-mono text-slate-500">Secret: {wh.secret ? `${wh.secret.slice(0, 10)}...` : 'Configured'}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleTestWebhook(wh._id)}
                    className="px-2.5 py-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-lg border border-indigo-200 dark:border-indigo-800 transition-colors inline-flex items-center gap-1"
                  >
                    <Send className="w-3 h-3" />
                    <span>Test Ping</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteWebhook(wh._id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                    title="Delete webhook"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Active Sessions & Device Security */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-xl">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Active Login Sessions</h3>
              <p className="text-xs text-slate-400">Devices currently authenticated to your account</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRevokeAllSessions}
            disabled={isRevokingAll}
            className="px-3.5 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl border border-rose-200 dark:border-rose-900/60 transition-colors"
          >
            {isRevokingAll ? 'Revoking...' : 'Sign Out All Devices'}
          </button>
        </div>

        {loadingSessions ? (
          <div className="p-4 text-xs text-slate-400 text-center">Loading sessions...</div>
        ) : sessions.length === 0 ? (
          <div className="p-4 text-xs text-slate-400 text-center">Current browser session active.</div>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              <div
                key={s._id}
                className="flex items-center justify-between p-3 rounded-xl border border-slate-100 dark:border-slate-800 text-xs"
              >
                <div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200">
                    {s.userAgent?.slice(0, 45) || 'Device'}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    IP: {s.ipAddress || 'Unknown'} • Active until {new Date(s.expiresAt).toLocaleDateString()}
                  </div>
                </div>
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                  Active
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Security & Password Form */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-5">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="p-2.5 bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 rounded-xl">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Change Password</h3>
            <p className="text-xs text-slate-400">Updating your password revokes other active sessions</p>
          </div>
        </div>

        {passwordMessage && (
          <div
            className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
              passwordMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                : 'bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300'
            }`}
          >
            {passwordMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span>{passwordMessage.text}</span>
          </div>
        )}

        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
              Current Password
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                New Password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isUpdatingPassword}
              className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs sm:text-sm shadow-xs transition-colors"
            >
              {isUpdatingPassword ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>

      {/* Network API Configuration for Mobile Testing */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="p-2.5 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-xl">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">API Endpoint Configuration</h3>
            <p className="text-xs text-slate-400">Configure backend server URL for Android APK or remote hosting</p>
          </div>
        </div>

        <form onSubmit={handleSaveServerUrl} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
              Backend Endpoint
            </label>
            <input
              type="text"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="https://api.yourdomain.com/api or http://10.0.2.2:5000/api"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-slate-400">
              Android emulator: http://10.0.2.2:5000/api | Web: /api
            </span>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs transition-colors"
            >
              Save URL
            </button>
          </div>
        </form>
      </div>

      {/* GDPR Article 20: Data Portability & Export */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-xl">
            <Download className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Data Portability & Export (GDPR Art. 20)</h3>
            <p className="text-xs text-slate-400">Download a complete copy of your tasks and workspace metadata</p>
          </div>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          You can request a machine-readable archive of all your active tasks, priorities, tags, and timestamps anytime.
        </p>

        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            disabled={isExporting}
            onClick={() => handleExportData('json')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold transition"
          >
            <FileText className="w-4 h-4 text-indigo-500" />
            {isExporting ? 'Exporting...' : 'Export as JSON'}
          </button>
          <button
            type="button"
            disabled={isExporting}
            onClick={() => handleExportData('csv')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold transition"
          >
            <Download className="w-4 h-4 text-emerald-500" />
            {isExporting ? 'Exporting...' : 'Export as CSV'}
          </button>
        </div>
      </div>

      {/* GDPR Article 17: Right to Erasure / Danger Zone */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-rose-200 dark:border-rose-900/40 p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-rose-100 dark:border-rose-900/30">
          <div className="p-2.5 bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 rounded-xl">
            <Trash2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-rose-600 dark:text-rose-400">Danger Zone: Delete Account (GDPR Art. 17)</h3>
            <p className="text-xs text-slate-400">Permanently delete your profile, workspaces, memberships, and personal tasks</p>
          </div>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          Once your account is deleted, your data cannot be recovered. Active subscriptions will be cancelled immediately.
        </p>

        <div className="pt-1">
          <button
            type="button"
            onClick={() => setIsDeleteAccountModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-xs font-semibold transition"
          >
            <Trash2 className="w-4 h-4" />
            Delete Account Forever
          </button>
        </div>
      </div>

      {/* Delete Account Modal */}
      {isDeleteAccountModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-rose-200 dark:border-rose-900/60 space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-950/60 flex items-center justify-center text-rose-600">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Permanently Delete Account?</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                This action is irreversible. All your personal tasks, sessions, and memberships will be erased.
              </p>
            </div>

            <form onSubmit={handleDeleteAccount} className="space-y-3 pt-1">
              {user?.authProviders?.includes('local') && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Enter Password to Confirm
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Your password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Type <span className="font-bold text-rose-600">DELETE</span> to confirm
                </label>
                <input
                  type="text"
                  required
                  placeholder="DELETE"
                  value={deleteConfirmationText}
                  onChange={(e) => setDeleteConfirmationText(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsDeleteAccountModalOpen(false);
                    setDeleteConfirmationText('');
                    setDeletePassword('');
                  }}
                  className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={deleteConfirmationText !== 'DELETE' || isDeletingAccount}
                  className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-40 rounded-xl transition shadow-xs"
                >
                  {isDeletingAccount ? 'Deleting...' : 'Confirm Delete Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
