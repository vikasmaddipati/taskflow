import React, { useState, useEffect } from 'react';
import { CheckCircle2, RotateCcw } from 'lucide-react';
import { TaskItem } from '../components/tasks/TaskItem';
import { EmptyState } from '../components/common/EmptyState';
import api from '../services/api';

export const CompletedView = ({
  onEditTask,
  onDeleteTask,
  onToggleStatus,
  refreshTrigger
}) => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();

    const fetchCompletedTasks = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await api.get('/tasks?status=completed&sortBy=updatedAt&sortOrder=desc', {
          signal: controller.signal
        });
        if (res.data.success) {
          setTasks(res.data.items || res.data.tasks || []);
        }
      } catch (err) {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
        setError(err.response?.data?.message || 'Failed to load completed tasks');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchCompletedTasks();

    return () => {
      controller.abort();
    };
  }, [refreshTrigger]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header card */}
      <div className="p-6 bg-linear-to-r from-emerald-500/10 via-teal-500/10 to-indigo-500/10 dark:from-emerald-950/20 dark:via-teal-950/20 dark:to-indigo-950/20 rounded-2xl border border-emerald-200/50 dark:border-emerald-900/40 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold text-xs uppercase tracking-wider">
            <CheckCircle2 className="w-4 h-4" />
            <span>Completed Archive</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1">
            Finished Tasks ({tasks.length})
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Review completed work or reopen tasks that need further revision.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center p-12">
          <div className="w-8 h-8 border-3 border-emerald-600/30 border-t-emerald-600 rounded-full animate-spin" />
          <span className="mt-3 text-xs text-slate-500">Loading completed tasks...</span>
        </div>
      ) : error ? (
        <div className="p-6 bg-rose-50 dark:bg-rose-950/40 rounded-2xl border border-rose-200 text-center">
          <p className="text-sm font-medium text-rose-600 dark:text-rose-400">{error}</p>
          <button
            onClick={fetchCompletedTasks}
            className="mt-3 px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-semibold"
          >
            Retry
          </button>
        </div>
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="No completed tasks yet"
          description="When you finish tasks, they will be archived here for easy reference."
        />
      ) : (
        <div className="space-y-2.5">
          {tasks.map((task) => (
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
  );
};
