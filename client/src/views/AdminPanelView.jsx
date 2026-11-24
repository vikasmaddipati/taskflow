import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  Users,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Send,
  MessageSquare,
  Search,
  RefreshCw,
  Plus,
  Phone,
  Layers,
  Mail
} from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

export const AdminPanelView = ({ showToast, onOpenCreateModal, onEditTask }) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'tasks' | 'whatsapp'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Overview data
  const [metrics, setMetrics] = useState({
    totalTasks: 0,
    completedTasks: 0,
    pendingTasks: 0,
    inProgressTasks: 0,
    reviewTasks: 0,
    overdueTasks: 0,
    totalMembers: 0,
    completionRate: 0
  });
  const [memberWorkload, setMemberWorkload] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);

  // Task monitoring data
  const [tasks, setTasks] = useState([]);
  const [taskFilter, setTaskFilter] = useState({
    status: 'all',
    assignedTo: 'all',
    priority: 'all',
    overdue: 'all',
    search: ''
  });
  const [tasksLoading, setTasksLoading] = useState(false);

  // WhatsApp configuration state
  const [whatsappSettings, setWhatsappSettings] = useState({
    adminPhone: '',
    enabled: true,
    notifyOnTaskAssigned: true,
    notifyOnTaskCompleted: true,
    notifyBefore30Min: true,
    notifyOnOverdue: true
  });
  const [isSavingWhatsapp, setIsSavingWhatsapp] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [liveDispatches, setLiveDispatches] = useState([]);

  // Email configuration state
  const [emailSettings, setEmailSettings] = useState({
    adminEmail: '',
    enabled: true,
    notifyOnTaskAssigned: true,
    notifyOnTaskCompleted: true,
    notifyBefore30Min: true,
    notifyOnOverdue: true
  });
  const [isSavingEmail, setIsSavingEmail] = useState(false);
  const [isSendingEmailTest, setIsSendingEmailTest] = useState(false);
  const [emailTestResult, setEmailTestResult] = useState(null);

  // Fetch admin dashboard overview
  const fetchOverview = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get('/admin/overview');
      if (res.data.success && res.data.data) {
        setMetrics(res.data.data.metrics || {});
        setMemberWorkload(res.data.data.memberWorkload || []);
        setRecentActivity(res.data.data.recentActivity || []);
        if (res.data.data.whatsappSettings) {
          setWhatsappSettings((prev) => ({
            ...prev,
            ...res.data.data.whatsappSettings,
            adminPhone: res.data.data.whatsappSettings.adminPhone || user?.phone || ''
          }));
        }
        if (res.data.data.emailSettings) {
          setEmailSettings((prev) => ({
            ...prev,
            ...res.data.data.emailSettings,
            adminEmail: res.data.data.emailSettings.adminEmail ?? ''
          }));
        }
      }
    } catch (err) {
      console.error('Failed to load admin overview:', err);
      setError(err.response?.data?.message || 'Failed to load Admin Panel data');
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Fetch all tasks for admin monitoring
  const fetchAdminTasks = useCallback(async () => {
    try {
      setTasksLoading(true);
      const params = {};
      if (taskFilter.status !== 'all') params.status = taskFilter.status;
      if (taskFilter.assignedTo !== 'all') params.assignedTo = taskFilter.assignedTo;
      if (taskFilter.priority !== 'all') params.priority = taskFilter.priority;
      if (taskFilter.overdue === 'true') params.overdue = 'true';
      if (taskFilter.search.trim()) params.search = taskFilter.search.trim();

      const res = await api.get('/admin/tasks', { params });
      if (res.data.success && res.data.tasks) {
        setTasks(res.data.tasks);
      }
    } catch (err) {
      console.error('Failed to fetch admin tasks:', err);
    } finally {
      setTasksLoading(false);
    }
  }, [taskFilter]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  useEffect(() => {
    if (activeTab === 'tasks') {
      fetchAdminTasks();
    }
  }, [activeTab, fetchAdminTasks]);

  // Listen to SSE live WhatsApp dispatches
  useEffect(() => {
    const handleSseMessage = (e) => {
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (data.type === 'whatsapp.message_dispatched') {
          setLiveDispatches((prev) => [data.payload, ...prev.slice(0, 19)]);
          if (showToast) {
            showToast(`WhatsApp sent to Admin: ${data.payload?.eventType}`, 'info');
          }
        }
      } catch {
        // ignore parse error
      }
    };

    window.addEventListener('taskflow:sse_event', handleSseMessage);
    return () => {
      window.removeEventListener('taskflow:sse_event', handleSseMessage);
    };
  }, [showToast]);

  // Save WhatsApp settings
  const handleSaveWhatsappSettings = async (e) => {
    e.preventDefault();
    try {
      setIsSavingWhatsapp(true);
      const res = await api.put('/admin/whatsapp-settings', whatsappSettings);
      if (res.data.success) {
        if (showToast) showToast('WhatsApp settings updated successfully!', 'success');
      }
    } catch (err) {
      if (showToast) showToast(err.response?.data?.message || 'Failed to save settings', 'error');
    } finally {
      setIsSavingWhatsapp(false);
    }
  };

  // Trigger test WhatsApp alert
  const handleTestWhatsapp = async () => {
    try {
      setIsSendingTest(true);
      setTestResult(null);
      const res = await api.post('/admin/whatsapp-test', {
        phone: whatsappSettings.adminPhone
      });
      if (res.data.success) {
        setTestResult({ success: true, message: res.data.message });
        if (showToast) showToast('Test WhatsApp message delivered!', 'success');
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to send WhatsApp test message';
      setTestResult({ success: false, message: msg });
      if (showToast) showToast(msg, 'error');
    } finally {
      setIsSendingTest(false);
    }
  };

  // Save email alert settings
  const handleSaveEmailSettings = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    try {
      setIsSavingEmail(true);
      const res = await api.put('/admin/email-settings', {
        ...emailSettings,
        adminEmail: emailSettings.adminEmail ? emailSettings.adminEmail.trim() : null
      });
      if (res.data.success) {
        if (showToast) showToast('Email notification settings saved successfully!', 'success');
      }
    } catch (err) {
      if (showToast) showToast(err.response?.data?.message || 'Failed to save email settings', 'error');
    } finally {
      setIsSavingEmail(false);
    }
  };

  // Dispatch test email alert
  const handleTestEmail = async () => {
    try {
      setIsSendingEmailTest(true);
      setEmailTestResult(null);
      const res = await api.post('/admin/email-test', {
        email: emailSettings.adminEmail || undefined
      });
      if (res.data.success) {
        setEmailTestResult({ success: true, message: res.data.message });
        if (showToast) showToast('Test notification email dispatched!', 'success');
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to dispatch test email';
      setEmailTestResult({ success: false, message: msg });
      if (showToast) showToast(msg, 'error');
    } finally {
      setIsSendingEmailTest(false);
    }
  };

  // Run instant scheduler deadline check
  const handleRunScan = async () => {
    try {
      const res = await api.post('/admin/run-scheduler-scan');
      if (res.data.success) {
        if (showToast) showToast('Deadline scan complete. WhatsApp alerts checked.', 'success');
        fetchOverview();
        if (activeTab === 'tasks') fetchAdminTasks();
      }
    } catch {
      if (showToast) showToast('Scan failed to complete', 'error');
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Banner Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 sm:p-8 rounded-2xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3">
            <span className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
              <ShieldAlert className="w-7 h-7" />
            </span>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Admin & TaskMate Monitor</h1>
              <p className="text-slate-400 text-sm mt-0.5">
                Centralized command center to organize tasks, track member deadlines, and manage WhatsApp alerts
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleRunScan}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-medium text-sm transition-all border border-slate-700 shadow-sm"
            title="Scan for overdue deadlines and trigger WhatsApp alerts"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Audit Deadlines</span>
          </button>
          <button
            onClick={onOpenCreateModal}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold text-sm transition-all shadow-md shadow-emerald-950/40"
          >
            <Plus className="w-4 h-4" />
            <span>Assign New Task</span>
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 space-x-2 sm:space-x-8">
        <button
          onClick={() => setActiveTab('overview')}
          className={`py-3 px-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition-all ${
            activeTab === 'overview'
              ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400 dark:border-emerald-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Workflow Overview</span>
        </button>

        <button
          onClick={() => setActiveTab('tasks')}
          className={`py-3 px-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition-all ${
            activeTab === 'tasks'
              ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400 dark:border-emerald-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>Task Monitor & Deadlines</span>
          {metrics.overdueTasks > 0 && (
            <span className="px-2 py-0.5 text-xs bg-rose-100 text-rose-700 font-bold rounded-full">
              {metrics.overdueTasks} Overdue
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('whatsapp')}
          className={`py-3 px-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition-all ${
            activeTab === 'whatsapp'
              ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400 dark:border-emerald-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span>Admin WhatsApp Alerts</span>
          {whatsappSettings.enabled && (
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('email')}
          className={`py-3 px-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition-all ${
            activeTab === 'email'
              ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400 dark:border-emerald-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <Mail className="w-4 h-4" />
          <span>Admin Email Alerts</span>
          {emailSettings.enabled && (
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          )}
        </button>
      </div>

      {/* Error Alert with Retry */}
      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 rounded-2xl border border-rose-200 dark:border-rose-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm text-rose-700 dark:text-rose-300">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={fetchOverview}
            className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold self-start sm:self-auto transition-colors"
          >
            Retry Loading
          </button>
        </div>
      )}

      {/* Loading Skeleton Indicator */}
      {loading && !error && (
        <div className="p-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col items-center justify-center">
          <div className="w-8 h-8 border-3 border-emerald-600/30 border-t-emerald-600 rounded-full animate-spin" />
          <span className="mt-3 text-xs text-slate-500">Loading admin monitoring metrics...</span>
        </div>
      )}

      {/* TAB 1: WORKFLOW OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-8">
          {/* Top 4 KPI Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Tasks</span>
                <span className="p-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 rounded-lg">
                  <Layers className="w-5 h-5" />
                </span>
              </div>
              <div className="mt-4 flex items-baseline justify-between">
                <span className="text-3xl font-extrabold text-slate-900 dark:text-white">{metrics.totalTasks}</span>
                <span className="text-xs font-medium text-slate-500">All members</span>
              </div>
            </div>

            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">In Progress</span>
                <span className="p-2 bg-amber-50 dark:bg-amber-900/30 text-amber-600 rounded-lg">
                  <Clock className="w-5 h-5" />
                </span>
              </div>
              <div className="mt-4 flex items-baseline justify-between">
                <span className="text-3xl font-extrabold text-slate-900 dark:text-white">{metrics.inProgressTasks + metrics.pendingTasks}</span>
                <span className="text-xs text-amber-600 font-semibold">{metrics.inProgressTasks} Active</span>
              </div>
            </div>

            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Overdue Alert</span>
                <span className="p-2 bg-rose-50 dark:bg-rose-900/30 text-rose-600 rounded-lg">
                  <AlertTriangle className="w-5 h-5" />
                </span>
              </div>
              <div className="mt-4 flex items-baseline justify-between">
                <span className="text-3xl font-extrabold text-rose-600">{metrics.overdueTasks}</span>
                <span className="text-xs text-rose-600 font-bold">Past Due Time</span>
              </div>
            </div>

            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Completion Rate</span>
                <span className="p-2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 rounded-lg">
                  <CheckCircle2 className="w-5 h-5" />
                </span>
              </div>
              <div className="mt-4 flex items-baseline justify-between">
                <span className="text-3xl font-extrabold text-emerald-600">{metrics.completionRate}%</span>
                <span className="text-xs text-slate-500">{metrics.completedTasks} finished</span>
              </div>
            </div>
          </div>

          {/* Member Workload & Deadline Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Users className="w-5 h-5 text-indigo-500" />
                  <span>Team Workload & Accountability Tracker</span>
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Firm oversight of all team members and their progress before due time
                </p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg">
                {memberWorkload.length} Members
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 text-xs uppercase font-semibold border-b border-slate-200 dark:border-slate-800">
                    <th className="py-3 px-6">Team Member</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4 text-center">Assigned</th>
                    <th className="py-3 px-4 text-center">Active / Pending</th>
                    <th className="py-3 px-4 text-center">Completed</th>
                    <th className="py-3 px-6">Progress Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {memberWorkload.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="text-center py-8 text-slate-400">
                        No team members found in this organization.
                      </td>
                    </tr>
                  ) : (
                    memberWorkload.map((m) => (
                      <tr key={m.userId || m.email} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="py-4 px-6">
                          <div className="font-semibold text-slate-900 dark:text-white">{m.name}</div>
                          <div className="text-xs text-slate-400">{m.email}</div>
                          {m.phone && <div className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-0.5"><Phone className="w-3 h-3" /> {m.phone}</div>}
                        </td>
                        <td className="py-4 px-4">
                          <span className="capitalize px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {m.role}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-center font-bold text-slate-800 dark:text-slate-200">
                          {m.assignedTasks}
                        </td>
                        <td className="py-4 px-4 text-center text-amber-600 font-semibold">
                          {m.inProgressTasks + m.pendingTasks}
                        </td>
                        <td className="py-4 px-4 text-center text-emerald-600 font-semibold">
                          {m.completedTasks}
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-3">
                            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                              <div
                                className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
                                style={{ width: `${m.completionRate}%` }}
                              />
                            </div>
                            <span className="text-xs font-bold text-slate-600 dark:text-slate-300 w-10 text-right">
                              {m.completionRate}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Audit Trail & Recent Activity Feed */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Clock className="w-5 h-5 text-indigo-500" />
                  <span>Audit Trail & Recent Activity</span>
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Chronological record of recent task changes, assignments, and member actions
                </p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg">
                {recentActivity.length} Events
              </span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {recentActivity.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-400">
                  No recent activity logged yet.
                </div>
              ) : (
                recentActivity.map((log, idx) => (
                  <div key={log._id || log.id || `activity-${idx}`} className="p-4 sm:px-6 flex items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    <div className="space-y-0.5 min-w-0">
                      <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                        <span className="capitalize">{log.action?.replace(/[._]/g, ' ') || 'Action'}</span>
                        {log.actor?.name && (
                          <span className="text-xs text-slate-400 font-normal">
                            by {log.actor.name}
                          </span>
                        )}
                      </div>
                      {log.details?.title && (
                        <div className="text-xs text-slate-500 truncate max-w-md">
                          Task: {log.details.title}
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-slate-400 shrink-0">
                      {log.createdAt ? new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: COMPLETE TASK MONITOR WITH DUE TIME */}
      {activeTab === 'tasks' && (
        <div className="space-y-6">
          {/* Filter Bar */}
          <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[220px] relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search all tasks..."
                value={taskFilter.search}
                onChange={(e) => setTaskFilter({ ...taskFilter, search: e.target.value })}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <select
              value={taskFilter.status}
              onChange={(e) => setTaskFilter({ ...taskFilter, status: e.target.value })}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="review">Review</option>
              <option value="completed">Completed</option>
            </select>

            <select
              value={taskFilter.priority}
              onChange={(e) => setTaskFilter({ ...taskFilter, priority: e.target.value })}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium focus:outline-none"
            >
              <option value="all">All Priorities</option>
              <option value="high">High Priority</option>
              <option value="medium">Medium Priority</option>
              <option value="low">Low Priority</option>
            </select>

            <select
              value={taskFilter.overdue}
              onChange={(e) => setTaskFilter({ ...taskFilter, overdue: e.target.value })}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium focus:outline-none"
            >
              <option value="all">All Timelines</option>
              <option value="true">Overdue Tasks Only</option>
            </select>

            <button
              onClick={fetchAdminTasks}
              className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl text-slate-600 dark:text-slate-300"
              title="Refresh task list"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {/* Task Monitor Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Organization Task Monitor</h2>
                <p className="text-xs text-slate-500 mt-1">Live tracking of task assignees, due times, and execution status</p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                {tasks.length} Tasks Monitored
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 text-xs uppercase font-semibold border-b border-slate-200 dark:border-slate-800">
                    <th className="py-3 px-6">Task Title & Details</th>
                    <th className="py-3 px-4">Assigned Member</th>
                    <th className="py-3 px-4">Due Date & Time</th>
                    <th className="py-3 px-4 text-center">Priority</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {tasksLoading ? (
                    <tr>
                      <td colSpan="6" className="text-center py-8 text-slate-400">Loading task records...</td>
                    </tr>
                  ) : tasks.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="text-center py-8 text-slate-400">No tasks match your filter criteria.</td>
                    </tr>
                  ) : (
                    tasks.map((t) => {
                      const isPastDue = t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'completed';
                      return (
                        <tr key={t._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                          <td className="py-4 px-6">
                            <div className="font-semibold text-slate-900 dark:text-white">{t.title}</div>
                            {t.description && <div className="text-xs text-slate-400 truncate max-w-xs">{t.description}</div>}
                            <div className="text-xs text-slate-400 mt-1">Workspace: {t.workspace?.name || 'Default'}</div>
                          </td>
                          <td className="py-4 px-4">
                            {t.assignedTo ? (
                              <div>
                                <div className="font-medium text-slate-800 dark:text-slate-200">{t.assignedTo.name}</div>
                                <div className="text-xs text-slate-400">{t.assignedTo.email}</div>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400 italic">Unassigned</span>
                            )}
                          </td>
                          <td className="py-4 px-4">
                            <div className={`font-semibold ${isPastDue ? 'text-rose-600' : 'text-slate-800 dark:text-slate-200'}`}>
                              {t.dueDateString || (t.dueDate ? new Date(t.dueDate).toLocaleDateString() : 'No date')}
                            </div>
                            <div className={`text-xs ${isPastDue ? 'text-rose-500 font-bold' : 'text-slate-400'}`}>
                              {t.dueTime ? `Due at ${t.dueTime}` : 'No specific time'}
                              {isPastDue && ' (OVERDUE)'}
                            </div>
                          </td>
                          <td className="py-4 px-4 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                              t.priority === 'high' ? 'bg-rose-100 text-rose-700' :
                              t.priority === 'medium' ? 'bg-amber-100 text-amber-700' :
                              'bg-emerald-100 text-emerald-700'
                            }`}>
                              {t.priority}
                            </span>
                          </td>
                          <td className="py-4 px-4 text-center">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                              t.status === 'completed' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' :
                              t.status === 'in_progress' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300' :
                              t.status === 'review' ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300' :
                              'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                            }`}>
                              {t.status.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="py-4 px-6 text-right">
                            <button
                              onClick={() => onEditTask(t)}
                              className="px-3 py-1.5 text-xs font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 rounded-lg transition-colors"
                            >
                              Manage
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: ADMIN WHATSAPP NOTIFICATIONS CONFIGURATION */}
      {activeTab === 'whatsapp' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <form onSubmit={handleSaveWhatsappSettings} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6 sm:p-8 space-y-6">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-emerald-600" />
                    <span>WhatsApp Dispatch Center</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Connect your WhatsApp number to receive real-time task notifications from your team members
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 font-medium">Alerts Status</span>
                  <input
                    type="checkbox"
                    checked={whatsappSettings.enabled}
                    onChange={(e) => setWhatsappSettings({ ...whatsappSettings, enabled: e.target.checked })}
                    className="w-5 h-5 text-emerald-600 rounded focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Admin Phone Input */}
              <div>
                <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">
                  Admin WhatsApp Phone Number
                </label>
                <div className="relative">
                  <Phone className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    placeholder="+91 9876543210 or 10-digit mobile number"
                    value={whatsappSettings.adminPhone || ''}
                    onChange={(e) => setWhatsappSettings({ ...whatsappSettings, adminPhone: e.target.value })}
                    className="w-full pl-11 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    required
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  The Admin/Organizer who assigns tasks will receive all status and due-time alert messages here.
                </p>
              </div>

              {/* Notification Toggles */}
              <div className="space-y-4 pt-2 border-t border-slate-100 dark:border-slate-800">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  Automated Event Triggers
                </h3>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={whatsappSettings.notifyBefore30Min}
                    onChange={(e) => setWhatsappSettings({ ...whatsappSettings, notifyBefore30Min: e.target.checked })}
                    className="w-4 h-4 mt-1 text-emerald-600 rounded focus:ring-emerald-500"
                  />
                  <div>
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      30 Minutes Before Due Time Alert
                    </div>
                    <div className="text-xs text-slate-500">
                      Sends an urgent reminder to you before 30 minutes of due time so you can follow up with the member.
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={whatsappSettings.notifyOnOverdue}
                    onChange={(e) => setWhatsappSettings({ ...whatsappSettings, notifyOnOverdue: e.target.checked })}
                    className="w-4 h-4 mt-1 text-emerald-600 rounded focus:ring-emerald-500"
                  />
                  <div>
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      Due Time Completed / Overdue Notification
                    </div>
                    <div className="text-xs text-slate-500">
                      Sends an alert to your WhatsApp the moment a task's due date and time is completed without being finished.
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={whatsappSettings.notifyOnTaskCompleted}
                    onChange={(e) => setWhatsappSettings({ ...whatsappSettings, notifyOnTaskCompleted: e.target.checked })}
                    className="w-4 h-4 mt-1 text-emerald-600 rounded focus:ring-emerald-500"
                  />
                  <div>
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      Task Completion Verification
                    </div>
                    <div className="text-xs text-slate-500">
                      Notifies your WhatsApp immediately when the assigned team member finishes the task before due time.
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={whatsappSettings.notifyOnTaskAssigned}
                    onChange={(e) => setWhatsappSettings({ ...whatsappSettings, notifyOnTaskAssigned: e.target.checked })}
                    className="w-4 h-4 mt-1 text-emerald-600 rounded focus:ring-emerald-500"
                  />
                  <div>
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      New Task Assignment Confirmation
                    </div>
                    <div className="text-xs text-slate-500">
                      Confirms when you give a task firmly to a member with expected deadline and requirements.
                    </div>
                  </div>
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="submit"
                  disabled={isSavingWhatsapp}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl font-semibold text-sm transition-all shadow-md shadow-emerald-950/20"
                >
                  {isSavingWhatsapp ? 'Saving Settings...' : 'Save WhatsApp Configuration'}
                </button>

                <button
                  type="button"
                  onClick={handleTestWhatsapp}
                  disabled={isSendingTest || !whatsappSettings.adminPhone}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-800 dark:text-slate-200 rounded-xl font-semibold text-sm transition-all flex items-center gap-2"
                >
                  <Send className="w-4 h-4 text-emerald-600" />
                  <span>{isSendingTest ? 'Sending Test...' : 'Send WhatsApp Test Message'}</span>
                </button>
              </div>

              {testResult && (
                <div className={`p-4 rounded-xl text-xs font-semibold ${testResult.success ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300'}`}>
                  {testResult.message}
                </div>
              )}
            </form>
          </div>

          {/* WhatsApp Live Feed & Dispatch Preview */}
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                  <span>Live WhatsApp Dispatches</span>
                </h3>
                <span className="text-xs text-slate-400">Real-time Stream</span>
              </div>

              <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
                {liveDispatches.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-xl">
                    No WhatsApp alerts dispatched in this session yet. Test alerts and scheduled reminders will appear here in real time.
                  </div>
                ) : (
                  liveDispatches.map((d, idx) => (
                    <div key={idx} className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-700/50 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-emerald-600 uppercase">{d.eventType?.replace(/_/g, ' ')}</span>
                        <span className="text-slate-400">{new Date(d.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <div className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-line font-mono bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700">
                        {d.message}
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center justify-between">
                        <span>To: {d.targetPhone}</span>
                        <span className="text-emerald-500 font-semibold">Delivered</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: ADMIN EMAIL NOTIFICATIONS CONFIGURATION */}
      {activeTab === 'email' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <form onSubmit={handleSaveEmailSettings} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6 sm:p-8 space-y-6">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Mail className="w-5 h-5 text-emerald-600" />
                    <span>Email Dispatch & Notifications Center</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Control automated task alerts, deadline warnings, and overdue notification emails
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 font-medium">Master Switch</span>
                  <input
                    type="checkbox"
                    checked={emailSettings.enabled}
                    onChange={(e) => setEmailSettings({ ...emailSettings, enabled: e.target.checked })}
                    className="w-5 h-5 text-emerald-600 rounded focus:ring-emerald-500 cursor-pointer"
                  />
                </div>
              </div>

              {/* Admin Email Input & Clear button */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
                    Admin Notification Email Address
                  </label>
                  {emailSettings.adminEmail && (
                    <button
                      type="button"
                      onClick={() => setEmailSettings({ ...emailSettings, adminEmail: '' })}
                      className="text-xs font-semibold text-rose-600 hover:text-rose-700 underline cursor-pointer"
                    >
                      Remove My Email From Alerts
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Mail className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    placeholder="Enter email or leave blank to stop receiving admin copies"
                    value={emailSettings.adminEmail || ''}
                    onChange={(e) => setEmailSettings({ ...emailSettings, adminEmail: e.target.value })}
                    className="w-full pl-11 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  If configured, copies of all workspace task assignments, reminders, and completions are sent here. Leave this completely blank or click <strong>Remove My Email</strong> above to stop admin alert emails.
                </p>
              </div>

              {/* Notification Toggles */}
              <div className="space-y-4 pt-2 border-t border-slate-100 dark:border-slate-800">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  Automated Email Event Triggers
                </h3>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={emailSettings.notifyBefore30Min}
                    onChange={(e) => setEmailSettings({ ...emailSettings, notifyBefore30Min: e.target.checked })}
                    className="w-4 h-4 mt-1 text-emerald-600 rounded focus:ring-emerald-500"
                  />
                  <div>
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      30 Minutes Before Due Time Alert
                    </div>
                    <div className="text-xs text-slate-500">
                      Sends an upcoming reminder email 30 minutes before task due time so teammates wrap up on schedule.
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={emailSettings.notifyOnOverdue}
                    onChange={(e) => setEmailSettings({ ...emailSettings, notifyOnOverdue: e.target.checked })}
                    className="w-4 h-4 mt-1 text-emerald-600 rounded focus:ring-emerald-500"
                  />
                  <div>
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      Due Time Completed / Overdue Alert
                    </div>
                    <div className="text-xs text-slate-500">
                      Sends an overdue email notification the moment a task's due date and time passes without being marked finished.
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={emailSettings.notifyOnTaskCompleted}
                    onChange={(e) => setEmailSettings({ ...emailSettings, notifyOnTaskCompleted: e.target.checked })}
                    className="w-4 h-4 mt-1 text-emerald-600 rounded focus:ring-emerald-500"
                  />
                  <div>
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      Task Completion Notice
                    </div>
                    <div className="text-xs text-slate-500">
                      Sends a confirmation email when an assigned team member completes a task.
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={emailSettings.notifyOnTaskAssigned}
                    onChange={(e) => setEmailSettings({ ...emailSettings, notifyOnTaskAssigned: e.target.checked })}
                    className="w-4 h-4 mt-1 text-emerald-600 rounded focus:ring-emerald-500"
                  />
                  <div>
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      New Task Assignment Notification
                    </div>
                    <div className="text-xs text-slate-500">
                      Sends an email with full task requirements and deadline details whenever a new task is assigned.
                    </div>
                  </div>
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="submit"
                  disabled={isSavingEmail}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl font-semibold text-sm transition-all shadow-md shadow-emerald-950/20"
                >
                  {isSavingEmail ? 'Saving Settings...' : 'Save Email Configuration'}
                </button>

                <button
                  type="button"
                  onClick={handleTestEmail}
                  disabled={isSendingEmailTest}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-800 dark:text-slate-200 rounded-xl font-semibold text-sm transition-all flex items-center gap-2"
                >
                  <Send className="w-4 h-4 text-emerald-600" />
                  <span>{isSendingEmailTest ? 'Sending Test...' : 'Send Test Notification Email'}</span>
                </button>
              </div>

              {emailTestResult && (
                <div className={`p-4 rounded-xl text-xs font-semibold ${emailTestResult.success ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300'}`}>
                  {emailTestResult.message}
                </div>
              )}
            </form>
          </div>

          {/* Email Info Guide Card */}
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6 space-y-4">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Mail className="w-5 h-5 text-indigo-600" />
                <span>How to Silence or Stop Emails</span>
              </h3>

              <div className="space-y-3 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-700/50">
                  <strong className="text-slate-900 dark:text-white block mb-1">1. Stop Workspace Admin Emails:</strong>
                  Click <span className="text-rose-600 font-semibold">Remove My Email From Alerts</span> above, or switch the <strong>Master Switch</strong> off, then click <strong>Save Email Configuration</strong>.
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-700/50">
                  <strong className="text-slate-900 dark:text-white block mb-1">2. Stop Personal Task Emails:</strong>
                  Go to <strong>Settings &rarr; Profile</strong> and toggle off <strong>Task & Deadline Email Notifications</strong>.
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-700/50">
                  <strong className="text-slate-900 dark:text-white block mb-1">3. Change Login Email:</strong>
                  Go to <strong>Settings &rarr; Profile &rarr; Change Email Address</strong> to switch your account to an alternate or secondary email.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
