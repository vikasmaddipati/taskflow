import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Calendar,
  Layers,
  ArrowRight,
  TrendingUp,
  Plus
} from 'lucide-react';
import api from '../services/api';
import { TaskItem } from '../components/tasks/TaskItem';
import { EmptyState } from '../components/common/EmptyState';

export const DashboardView = ({
  onNavigate,
  onOpenCreateModal,
  onEditTask,
  onDeleteTask,
  onToggleStatus
}) => {
  const [data, setData] = useState({
    stats: {
      total: 0,
      pending: 0,
      completed: 0,
      overdue: 0,
      dueToday: 0,
      completionRate: 0,
      priorityBreakdown: { low: 0, medium: 0, high: 0 }
    },
    recentTasks: [],
    upcomingDeadlines: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get('/tasks/stats');
      if (res.data.success) {
        setData(res.data);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load dashboard metrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const { stats, recentTasks, upcomingDeadlines } = data;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-3 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin" />
        <span className="mt-3 text-sm text-slate-500">Loading your dashboard...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-rose-50 dark:bg-rose-950/40 rounded-2xl border border-rose-200 dark:border-rose-900 text-center">
        <p className="text-sm font-medium text-rose-600 dark:text-rose-400">{error}</p>
        <button
          onClick={fetchStats}
          className="mt-3 px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-semibold"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden p-6 sm:p-8 rounded-3xl bg-linear-to-r from-indigo-600 via-indigo-700 to-purple-700 text-white shadow-xl shadow-indigo-500/10">
        <div className="relative z-10 max-w-2xl">
          <span className="inline-block px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-xs font-medium tracking-wide uppercase mb-2">
            Workspace Overview
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Stay focused and organized today.
          </h2>
          <p className="mt-2 text-indigo-100 text-sm leading-relaxed">
            You have <span className="font-bold underline">{stats.pending}</span> pending task{stats.pending === 1 ? '' : 's'}.
            {stats.dueToday > 0 && ` ${stats.dueToday} due today.`}
            {stats.overdue > 0 && ` ${stats.overdue} overdue.`}
          </p>

          <div className="mt-5 flex items-center gap-3">
            <button
              onClick={onOpenCreateModal}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white text-indigo-700 hover:bg-indigo-50 text-xs sm:text-sm font-bold shadow-md transition-all active:scale-95"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              Create Task
            </button>
            <button
              onClick={() => onNavigate('today')}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs sm:text-sm font-medium transition-all"
            >
              View My Day
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5 sm:gap-4">
        {/* Total Tasks */}
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Total</span>
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-800 dark:text-slate-100">
            {stats.total}
          </div>
          <div className="mt-1 text-xs text-slate-400">All registered tasks</div>
        </div>

        {/* Pending Tasks */}
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Pending</span>
            <div className="p-2 bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 rounded-xl">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-amber-600 dark:text-amber-400">
            {stats.pending}
          </div>
          <div className="mt-1 text-xs text-slate-400">In progress</div>
        </div>

        {/* Completed Tasks */}
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Done</span>
            <div className="p-2 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-xl">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">
            {stats.completed}
          </div>
          <div className="mt-1 text-xs text-slate-400">Completed items</div>
        </div>

        {/* Due Today */}
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Due Today</span>
            <div className="p-2 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-xl">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-blue-600 dark:text-blue-400">
            {stats.dueToday}
          </div>
          <div className="mt-1 text-xs text-slate-400">Scheduled for today</div>
        </div>

        {/* Overdue Tasks */}
        <div className="col-span-2 sm:col-span-1 bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Overdue</span>
            <div className="p-2 bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 rounded-xl">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-rose-600 dark:text-rose-400">
            {stats.overdue}
          </div>
          <div className="mt-1 text-xs text-rose-500 font-medium">Needs attention</div>
        </div>
      </div>

      {/* Progress & Priority Breakdown Bar */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
              Completion Rate & Priority Breakdown
            </h3>
            <p className="text-xs text-slate-400">
              {stats.completed} of {stats.total} tasks completed
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> High ({stats.priorityBreakdown?.high || 0})
            </span>
            <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Medium ({stats.priorityBreakdown?.medium || 0})
            </span>
            <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Low ({stats.priorityBreakdown?.low || 0})
            </span>
          </div>
        </div>

        <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
          <div
            className="h-full bg-indigo-600 rounded-full transition-all duration-500"
            style={{ width: `${stats.completionRate || 0}%` }}
          />
        </div>
        <div className="mt-2 text-right text-xs font-semibold text-indigo-600 dark:text-indigo-400">
          {stats.completionRate || 0}% Completed
        </div>
      </div>

      {/* Two columns: Upcoming Deadlines & Recent Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Deadlines */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-600" />
              Upcoming Deadlines
            </h3>
            <button
              onClick={() => onNavigate('upcoming')}
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1"
            >
              See all
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {upcomingDeadlines.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 text-center border border-slate-200 dark:border-slate-800">
              <p className="text-xs text-slate-400">No upcoming deadlines.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {upcomingDeadlines.map((task) => (
                <TaskItem
                  key={task._id}
                  task={task}
                  onToggleStatus={onToggleStatus}
                  onEdit={onEditTask}
                  onDelete={onDeleteTask}
                />
              ))}
            </div>
          )}
        </div>

        {/* Recent Tasks */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-600" />
              Recent Tasks
            </h3>
            <button
              onClick={() => onNavigate('all')}
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1"
            >
              View all tasks
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {recentTasks.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 text-center border border-slate-200 dark:border-slate-800">
              <p className="text-xs text-slate-400">No tasks created yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentTasks.map((task) => (
                <TaskItem
                  key={task._id}
                  task={task}
                  onToggleStatus={onToggleStatus}
                  onEdit={onEditTask}
                  onDelete={onDeleteTask}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
