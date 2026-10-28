import React, { useState } from 'react';
import {
  Menu,
  Plus,
  Sun,
  Moon,
  LogOut,
  Building2,
  ChevronDown,
  Check,
  User as UserIcon
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

export const Navbar = ({
  currentView,
  onOpenMobileMenu,
  onOpenCreateModal,
  onOpenCreateOrgModal
}) => {
  const { user, currentOrg, organizations, switchOrganization, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [isOrgDropdownOpen, setIsOrgDropdownOpen] = useState(false);

  const viewTitles = {
    dashboard: 'Dashboard Overview',
    all: 'All Tasks',
    today: 'My Day',
    upcoming: 'Upcoming Tasks',
    completed: 'Completed Tasks',
    team: 'Team & Members',
    billing: 'Billing & Plans',
    settings: 'Account Settings'
  };

  const planBadgeStyles = {
    free: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700',
    pro: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
    business: 'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800'
  };

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-4 sm:px-6 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors">
      {/* Left side: Hamburger button + Organization Switcher + View Title */}
      <div className="flex items-center gap-3">
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
            onClick={() => setIsOrgDropdownOpen((prev) => !prev)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 transition-colors text-xs font-semibold text-slate-800 dark:text-slate-200"
          >
            <Building2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span className="max-w-[120px] sm:max-w-[180px] truncate">
              {currentOrg?.name || 'Workspace'}
            </span>
            {currentOrg?.plan && (
              <span
                className={`hidden sm:inline text-[10px] uppercase font-extrabold px-1.5 py-0.5 rounded border ${
                  planBadgeStyles[currentOrg.plan] || planBadgeStyles.free
                }`}
              >
                {currentOrg.plan}
              </span>
            )}
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {isOrgDropdownOpen && (
            <div className="absolute left-0 mt-2 w-64 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Organizations & Teams
              </div>
              <div className="max-h-56 overflow-y-auto space-y-0.5 px-1.5">
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

        <span className="hidden md:inline text-slate-300 dark:text-slate-700 font-light">/</span>

        <h1 className="hidden md:block text-base font-bold text-slate-800 dark:text-slate-100 tracking-tight">
          {viewTitles[currentView] || 'Tasks'}
        </h1>
      </div>

      {/* Right side: New Task button, Theme Toggle, User, Logout */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Create Task button */}
        <button
          type="button"
          onClick={onOpenCreateModal}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-xl shadow-xs transition-all active:scale-95"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span className="hidden sm:inline">New Task</span>
        </button>

        {/* Theme Toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          className="p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600" />
          )}
        </button>

        {/* User Info & Logout */}
        <div className="flex items-center pl-2 sm:pl-3 border-l border-slate-200 dark:border-slate-800 gap-2">
          <div className="hidden sm:flex flex-col text-right">
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-none">
              {user?.name || 'User'}
            </span>
            <span className="text-[11px] text-slate-400 leading-none mt-1">
              {user?.email || ''}
            </span>
          </div>

          <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs ring-2 ring-indigo-500/20">
            {user?.name ? user.name.charAt(0).toUpperCase() : <UserIcon className="w-4 h-4" />}
          </div>

          <button
            type="button"
            onClick={logout}
            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-800 rounded-xl transition-colors"
            title="Log out"
            aria-label="Log out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
