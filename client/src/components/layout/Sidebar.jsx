import React from 'react';
import {
  LayoutDashboard,
  CheckSquare,
  Columns,
  Sun,
  Calendar,
  CheckCircle2,
  Users,
  CreditCard,
  Settings,
  Trash2,
  Sparkles,
  X
} from 'lucide-react';

export const Sidebar = ({
  currentView,
  onSelectView,
  isMobileOpen,
  onCloseMobile,
  stats = {}
}) => {
  const navItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      badge: null
    },
    {
      id: 'ai',
      label: 'AI Assistant',
      icon: Sparkles,
      badge: 'AI'
    },
    {
      id: 'all',
      label: 'All Tasks',
      icon: CheckSquare,
      badge: stats.total
    },
    {
      id: 'board',
      label: 'Kanban Board',
      icon: Columns,
      badge: null
    },
    {
      id: 'today',
      label: 'My Day',
      icon: Sun,
      badge: stats.dueToday
    },
    {
      id: 'upcoming',
      label: 'Upcoming',
      icon: Calendar,
      badge: null
    },
    {
      id: 'completed',
      label: 'Completed',
      icon: CheckCircle2,
      badge: stats.completed
    },
    {
      id: 'team',
      label: 'Team & Members',
      icon: Users,
      badge: null
    },
    {
      id: 'billing',
      label: 'Billing & Plans',
      icon: CreditCard,
      badge: null
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: Settings,
      badge: null
    },
    {
      id: 'trash',
      label: 'Trash & Recovery',
      icon: Trash2,
      badge: null
    }
  ];

  const handleNavClick = (viewId) => {
    onSelectView(viewId);
    if (isMobileOpen) {
      onCloseMobile();
    }
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-slate-900 text-slate-300 dark:bg-slate-950 dark:border-r dark:border-slate-800">
      {/* Brand Header */}
      <div className="flex items-center justify-between px-6 h-16 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/30">
            <Sparkles className="w-4 h-4 fill-white" />
          </div>
          <div>
            <span className="font-bold text-base text-white tracking-tight">TaskFlow</span>
            <span className="text-[10px] text-indigo-400 font-semibold block leading-none">SaaS Platform</span>
          </div>
        </div>

        {/* Mobile close button */}
        {isMobileOpen && (
          <button
            onClick={onCloseMobile}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation Links */}
      <div className="flex-1 py-6 px-3 space-y-1 overflow-y-auto">
        <div className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Navigation
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;

          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-xs font-semibold'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </div>

              {item.badge !== null && item.badge !== undefined && (typeof item.badge === 'string' || item.badge > 0) && (
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                    typeof item.badge === 'string'
                      ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-xs'
                      : isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Quick Status Footer */}
      <div className="p-4 border-t border-slate-800 m-3 rounded-2xl bg-slate-850/60">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
          <span>Overall Progress</span>
          <span className="font-semibold text-slate-200">
            {stats.completionRate || 0}%
          </span>
        </div>
        <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, Math.max(0, stats.completionRate || 0))}%` }}
          />
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar (persistent) */}
      <aside className="hidden lg:block w-64 shrink-0 h-screen sticky top-0 shadow-lg">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer (overlay) */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          {/* Backdrop overlay */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
          />
          {/* Drawer content */}
          <div className="relative w-72 max-w-[80vw] h-full shadow-2xl z-10 animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};
