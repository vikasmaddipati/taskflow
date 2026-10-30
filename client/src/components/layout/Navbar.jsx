import React, { useState, useEffect, useCallback } from 'react';
import {
  Menu,
  Plus,
  Sun,
  Moon,
  LogOut,
  Building2,
  ChevronDown,
  Check,
  User as UserIcon,
  Layers,
  Bell,
  Clock,
  AlertCircle,
  CheckCheck,
  RefreshCw,
  Sparkles
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import api from '../../services/api';

export const Navbar = ({
  currentView,
  onOpenMobileMenu,
  onOpenCreateModal,
  onOpenCreateOrgModal,
  onToggleAiCopilot
}) => {
  const {
    user,
    currentOrg,
    organizations,
    switchOrganization,
    currentWorkspace,
    workspaces,
    switchWorkspace,
    fetchWorkspaces,
    logout
  } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [isOrgDropdownOpen, setIsOrgDropdownOpen] = useState(false);
  const [isWsDropdownOpen, setIsWsDropdownOpen] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  const [isCreatingWs, setIsCreatingWs] = useState(false);

  // Notifications state
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isCheckingReminders, setIsCheckingReminders] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await api.get('/notifications');
      if (res.data.success) {
        setNotifications(res.data.notifications || []);
        setUnreadCount(res.data.unreadCount || 0);
      }
    } catch {
      // ignore in background
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000); // 1-minute poll
    return () => clearInterval(interval);
  }, [fetchNotifications, currentOrg?._id]);

  const handleMarkRead = async (id, e) => {
    e.stopPropagation();
    try {
      const res = await api.patch(`/notifications/${id}/read`);
      if (res.data.success) {
        fetchNotifications();
      }
    } catch {
      // ignore
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const res = await api.post('/notifications/read-all');
      if (res.data.success) {
        fetchNotifications();
      }
    } catch {
      // ignore
    }
  };

  const handleRunReminders = async () => {
    setIsCheckingReminders(true);
    try {
      await api.post('/notifications/run-reminders');
      await fetchNotifications();
    } catch {
      // ignore
    } finally {
      setIsCheckingReminders(false);
    }
  };

  const viewTitles = {
    dashboard: 'Dashboard Overview',
    ai: 'AI Assistant & Scheduler',
    all: 'All Tasks',
    board: 'Kanban Board',
    today: 'My Day',
    upcoming: 'Upcoming Tasks',
    completed: 'Completed Tasks',
    team: 'Team & Members',
    billing: 'Billing & Plans',
    settings: 'Account Settings',
    trash: 'Trash & Recovery'
  };

  const planBadgeStyles = {
    free: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700',
    pro: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
    business: 'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800'
  };

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-4 sm:px-6 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors">
      {/* Left side: Hamburger + Org Switcher + Workspace Switcher + View Title */}
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          aria-label="Open sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Organization Switcher Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setIsOrgDropdownOpen((prev) => !prev);
              setIsWsDropdownOpen(false);
            }}
            className="flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 transition-colors text-xs font-semibold text-slate-800 dark:text-slate-200"
          >
            <Building2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span className="max-w-[100px] sm:max-w-[150px] truncate">
              {currentOrg?.name || 'Organization'}
            </span>
            {currentOrg?.plan && (
              <span
                className={`hidden md:inline text-[9px] uppercase font-extrabold px-1.5 py-0.5 rounded border ${
                  planBadgeStyles[currentOrg.plan] || planBadgeStyles.free
                }`}
              >
                {currentOrg.plan}
              </span>
            )}
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </button>

          {isOrgDropdownOpen && (
            <div className="absolute left-0 mt-2 w-64 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Organizations & Teams
              </div>
              <div className="max-h-56 overflow-y-auto px-1 space-y-0.5">
                {organizations.map((org) => {
                  const isSelected = currentOrg?._id === org._id;
                  return (
                    <button
                      key={org._id}
                      onClick={() => {
                        switchOrganization(org);
                        setIsOrgDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs text-left transition-colors ${
                        isSelected
                          ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 font-bold'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="truncate">{org.name}</span>
                        {org.isPersonal && (
                          <span className="text-[10px] text-slate-400 font-normal">(Personal)</span>
                        )}
                      </div>
                      {isSelected && <Check className="w-4 h-4 shrink-0 text-indigo-600 dark:text-indigo-400" />}
                    </button>
                  );
                })}
              </div>

              {onOpenCreateOrgModal && (
                <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-800 px-1.5">
                  <button
                    onClick={() => {
                      setIsOrgDropdownOpen(false);
                      onOpenCreateOrgModal();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-xl transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create Organization</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Workspace Switcher Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setIsWsDropdownOpen((prev) => !prev);
              setIsOrgDropdownOpen(false);
            }}
            className="flex items-center gap-1.5 sm:gap-2 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 transition-colors text-xs font-semibold text-slate-700 dark:text-slate-300"
          >
            <Layers className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
            <span className="max-w-[90px] sm:max-w-[130px] truncate">
              {currentWorkspace?.name || 'General'}
            </span>
            <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
          </button>

          {isWsDropdownOpen && (
            <div className="absolute left-0 mt-2 w-60 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="px-3 pb-2 mb-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Workspaces in Organization
                </span>
              </div>

              <div className="max-h-48 overflow-y-auto px-1 space-y-0.5">
                {workspaces.map((ws) => {
                  const isSelected = currentWorkspace?._id === ws._id;
                  return (
                    <button
                      key={ws._id}
                      onClick={() => {
                        switchWorkspace(ws);
                        setIsWsDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-xs text-left transition-colors ${
                        isSelected
                          ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 font-bold'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span className="truncate">{ws.name}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 shrink-0 text-purple-600 dark:text-purple-400" />}
                    </button>
                  );
                })}
              </div>

              <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-800 px-2">
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={newWsName}
                    onChange={(e) => setNewWsName(e.target.value)}
                    placeholder="New workspace..."
                    className="w-full px-2 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-hidden"
                  />
                  <button
                    onClick={async () => {
                      if (!newWsName.trim()) return;
                      setIsCreatingWs(true);
                      try {
                        const res = await api.post('/workspaces', { name: newWsName.trim() });
                        if (res.data.success) {
                          setNewWsName('');
                          await fetchWorkspaces(currentOrg?._id);
                          switchWorkspace(res.data.workspace);
                          setIsWsDropdownOpen(false);
                        }
                      } catch (err) {
                        alert(err.response?.data?.message || 'Failed to create workspace');
                      } finally {
                        setIsCreatingWs(false);
                      }
                    }}
                    disabled={isCreatingWs || !newWsName.trim()}
                    className="px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <span className="hidden md:inline text-slate-300 dark:text-slate-700 font-light">/</span>

        <h1 className="hidden md:block text-base font-bold text-slate-800 dark:text-slate-100 tracking-tight">
          {viewTitles[currentView] || 'Tasks'}
        </h1>
      </div>

      {/* Right side: AI Copilot, New Task button, Theme Toggle, User, Logout */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Quick AI Copilot Trigger */}
        <button
          type="button"
          onClick={onToggleAiCopilot}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-semibold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 rounded-xl shadow-xs transition-all active:scale-95"
          title="Open AI Copilot"
        >
          <Sparkles className="w-4 h-4" />
          <span className="hidden sm:inline">AI Copilot</span>
        </button>

        {/* Create Task button */}
        <button
          type="button"
          onClick={onOpenCreateModal}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-xl shadow-xs transition-all active:scale-95"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span className="hidden sm:inline">New Task</span>
        </button>

        {/* Notifications Bell Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsNotifOpen((prev) => !prev)}
            className="relative p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Notifications"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-rose-500 rounded-full ring-2 ring-white dark:ring-slate-900">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {isNotifOpen && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 py-3 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between px-4 pb-2 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-slate-900 dark:text-slate-100">Notifications</span>
                  {unreadCount > 0 && (
                    <span className="bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRunReminders}
                    disabled={isCheckingReminders}
                    className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors disabled:opacity-50"
                    title="Check task reminders"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isCheckingReminders ? 'animate-spin text-indigo-600' : ''}`} />
                  </button>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={handleMarkAllRead}
                      className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium inline-flex items-center gap-1"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      Mark all read
                    </button>
                  )}
                </div>
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
                {notifications.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    No notifications yet. You're all caught up!
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n._id}
                      className={`p-3 transition-colors flex items-start justify-between gap-3 ${
                        n.isRead
                          ? 'bg-transparent text-slate-600 dark:text-slate-400'
                          : 'bg-indigo-50/40 dark:bg-indigo-950/20 text-slate-900 dark:text-slate-100'
                      }`}
                    >
                      <div className="flex items-start gap-2.5 flex-1 min-w-0">
                        {n.type === 'overdue' ? (
                          <AlertCircle className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
                        ) : n.type === 'due_soon' ? (
                          <Clock className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                        ) : (
                          <Bell className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold leading-snug">{n.title}</p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                            {n.message}
                          </p>
                          <span className="text-[10px] text-slate-400 mt-1 block">
                            {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                      {!n.isRead && (
                        <button
                          type="button"
                          onClick={(e) => handleMarkRead(n._id, e)}
                          className="text-[10px] text-indigo-600 hover:text-indigo-800 font-medium shrink-0 px-2 py-0.5 rounded-md hover:bg-indigo-50 dark:hover:bg-indigo-900/40"
                        >
                          Read
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Theme Toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5" />}
        </button>

        {/* User Info */}
        <div className="hidden sm:flex items-center gap-2.5 pl-2 border-l border-slate-200 dark:border-slate-800">
          <div className="w-8 h-8 rounded-full bg-linear-to-tr from-indigo-500 to-purple-500 text-white flex items-center justify-center font-bold text-xs shadow-xs">
            {user?.name?.[0]?.toUpperCase() || <UserIcon className="w-4 h-4" />}
          </div>
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 max-w-[120px] truncate">
            {user?.name || 'User'}
          </span>
        </div>

        {/* Logout */}
        <button
          type="button"
          onClick={logout}
          className="p-2 rounded-xl text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
          title="Sign out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
