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
  LogOut
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { getBaseURL } from '../services/api';
import api from '../services/api';

export const SettingsView = ({ showToast }) => {
  const { user, updateProfile, fetchOrganizations, logout } = useAuth();
  const { theme, setTheme } = useTheme();

  // Profile fields
  const [name, setName] = useState(user?.name || '');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState(null);

  // New Organization fields
  const [newOrgName, setNewOrgName] = useState('');
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);

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

        <form onSubmit={handleProfileSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
              Email Address <span className="text-slate-400 text-xs font-normal">(Read only)</span>
            </label>
            <input
              type="email"
              disabled
              value={user?.email || ''}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/50 text-slate-500 text-sm cursor-not-allowed"
            />
          </div>

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
    </div>
  );
};
