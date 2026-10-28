import React, { useState, useEffect } from 'react';
import { Sun, AlertTriangle, Calendar, Plus } from 'lucide-react';
import { TaskItem } from '../components/tasks/TaskItem';
import { EmptyState } from '../components/common/EmptyState';
import api from '../services/api';

export const MyDayView = ({
  onOpenCreateModal,
  onEditTask,
  onDeleteTask,
  onToggleStatus,
  refreshTrigger
}) => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchMyDayTasks = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get('/tasks?view=today');
      if (res.data.success) {
        setTasks(res.data.tasks);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load My Day tasks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyDayTasks();
  }, [refreshTrigger]);

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const overdueTasks = tasks.filter(
    (t) => t.status === 'pending' && t.dueDate && new Date(t.dueDate) < startOfToday
  );
  const todayTasks = tasks.filter(
    (t) => !overdueTasks.some((ot) => ot._id === t._id)
  );

  const formattedDate = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  }).format(now);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header card */}
      <div className="p-6 bg-linear-to-r from-amber-500/10 via-orange-500/10 to-indigo-500/10 dark:from-amber-950/20 dark:via-orange-950/20 dark:to-indigo-950/20 rounded-2xl border border-amber-200/50 dark:border-amber-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-semibold text-xs uppercase tracking-wider">
            <Sun className="w-4 h-4 fill-amber-500 text-amber-500" />
            <span>Daily Focus</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1">
            {formattedDate}
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Tasks scheduled for today and overdue items requiring your immediate attention.
          </p>
        </div>

        <button
          onClick={() => onOpenCreateModal({ dueDate: new Date().toISOString().split('T')[0] })}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs sm:text-sm shadow-xs transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          Add to My Day
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center p-12">
          <div className="w-8 h-8 border-3 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
          <span className="mt-3 text-xs text-slate-500">Loading daily tasks...</span>
        </div>
      ) : error ? (
        <div className="p-6 bg-rose-50 dark:bg-rose-950/40 rounded-2xl border border-rose-200 text-center">
          <p className="text-sm font-medium text-rose-600 dark:text-rose-400">{error}</p>
          <button
            onClick={fetchMyDayTasks}
            className="mt-3 px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-semibold"
          >
            Retry
          </button>
        </div>
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={Sun}
          title="All clear for today!"
          description="You don't have any tasks scheduled for today or lingering overdue tasks."
          actionText="Add a Task for Today"
          onAction={() => onOpenCreateModal({ dueDate: new Date().toISOString().split('T')[0] })}
        />
      ) : (
        <div className="space-y-6">
          {/* Overdue Section */}
          {overdueTasks.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                <AlertTriangle className="w-4 h-4" />
                <span>Overdue Tasks ({overdueTasks.length})</span>
              </div>
              <div className="space-y-2.5">
                {overdueTasks.map((task) => (
                  <TaskItem
                    key={task._id}
                    task={task}
                    onToggleStatus={onToggleStatus}
                    onEdit={onEditTask}
                    onDelete={onDeleteTask}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Today Tasks Section */}
          {todayTasks.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                <Calendar className="w-4 h-4 text-indigo-500" />
                <span>Due Today ({todayTasks.length})</span>
              </div>
              <div className="space-y-2.5">
                {todayTasks.map((task) => (
                  <TaskItem
                    key={task._id}
                    task={task}
                    onToggleStatus={onToggleStatus}
                    onEdit={onEditTask}
                    onDelete={onDeleteTask}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
