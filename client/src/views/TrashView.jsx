import React, { useState, useEffect, useCallback } from 'react';
import {
  Trash2,
  RotateCcw,
  AlertTriangle,
  Search,
  Calendar,
  Tag,
  Clock,
  User,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import api from '../services/api';

export const TrashView = ({ showToast = () => {}, refreshTrigger = 0, onTaskRestored = () => {} }) => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalTasks, setTotalTasks] = useState(0);

  // Modals state
  const [taskToPermanentDelete, setTaskToPermanentDelete] = useState(null);
  const [isEmptyTrashModalOpen, setIsEmptyTrashModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    const loadTrash = async () => {
      setLoading(true);
      try {
        const res = await api.get('/tasks/trash', {
          params: {
            page,
            limit: 15,
            search: search.trim() || undefined
          },
          signal: controller.signal
        });

        if (res.data.success) {
          setTasks(res.data.items || res.data.tasks || []);
          setTotalPages(res.data.totalPages || 1);
          setTotalTasks(res.data.totalItems !== undefined ? res.data.totalItems : res.data.total || 0);
        }
      } catch (err) {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
        showToast(err.response?.data?.message || 'Failed to load trash', 'error');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    loadTrash();

    return () => {
      controller.abort();
    };
  }, [page, search, showToast, refreshTrigger]);

  const handleRestore = async (taskId, taskTitle) => {
    setActionLoading(true);
    try {
      const res = await api.patch(`/tasks/${taskId}/restore`);
      if (res.data.success) {
        showToast(`Restored "${taskTitle || 'Task'}"`, 'success');
        onTaskRestored();
        fetchTrash();
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to restore task', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePermanentDelete = async () => {
    if (!taskToPermanentDelete) return;
    setActionLoading(true);
    try {
      const res = await api.delete(`/tasks/${taskToPermanentDelete._id}/permanent`);
      if (res.data.success) {
        showToast('Task permanently deleted', 'success');
        setTaskToPermanentDelete(null);
        fetchTrash();
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to delete task permanently', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleEmptyTrash = async () => {
    setActionLoading(true);
    try {
      const res = await api.delete('/tasks/trash/empty');
      if (res.data.success) {
        showToast(res.data.message || 'Trash emptied successfully', 'success');
        setIsEmptyTrashModalOpen(false);
        fetchTrash();
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to empty trash', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Trash2 className="w-6 h-6 text-rose-500" />
            Trash &amp; Data Recovery
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Soft-deleted tasks are held here safely. You can restore them anytime or permanently remove them.
          </p>
        </div>

        {totalTasks > 0 && (
          <button
            onClick={() => setIsEmptyTrashModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl hover:bg-rose-100 dark:hover:bg-rose-900/40 transition shadow-sm"
          >
            <Trash2 className="w-4 h-4" />
            Empty Trash ({totalTasks})
          </button>
        )}
      </div>

      {/* Search Bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search deleted tasks..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Task List / Table */}
      {loading ? (
        <div className="flex justify-center items-center py-20 text-slate-400">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-center">
          <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-4">
            <Trash2 className="w-8 h-8 stroke-1" />
          </div>
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Trash is empty</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mt-1">
            No deleted tasks found. When tasks are deleted, they will be archived here safely for recovery.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {tasks.map((task) => {
              const formattedDeletedAt = task.deletedAt
                ? new Date(task.deletedAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })
                : 'Recently';

              return (
                <div
                  key={task._id}
                  className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900 dark:text-slate-100 text-base line-through text-slate-500 dark:text-slate-400">
                        {task.title}
                      </span>
                      {task.category && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                          <Tag className="w-3 h-3" />
                          {task.category}
                        </span>
                      )}
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          task.priority === 'high'
                            ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'
                            : task.priority === 'medium'
                            ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400'
                            : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {task.priority}
                      </span>
                    </div>

                    {task.description && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                        {task.description}
                      </p>
                    )}

                    <div className="flex items-center gap-4 text-xs text-slate-400 dark:text-slate-500 pt-1">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        Deleted {formattedDeletedAt}
                      </span>
                      {task.deletedBy?.name && (
                        <span className="flex items-center gap-1">
                          <User className="w-3.5 h-3.5" />
                          By {task.deletedBy.name}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <button
                      onClick={() => handleRestore(task._id, task.title)}
                      disabled={actionLoading}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 rounded-lg transition"
                      title="Restore task to active list"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Restore
                    </button>
                    <button
                      onClick={() => setTaskToPermanentDelete(task)}
                      disabled={actionLoading}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900/50 rounded-lg transition"
                      title="Permanently remove from database"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete Forever
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
              <span>
                Page {page} of {totalPages} ({totalTasks} total)
              </span>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Confirmation Modal: Delete Forever Single Task */}
      {taskToPermanentDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-950/60 flex items-center justify-center text-rose-600">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Permanently Delete Task?
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Are you sure you want to permanently delete{' '}
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  "{taskToPermanentDelete.title}"
                </span>
                ? This action cannot be undone.
              </p>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setTaskToPermanentDelete(null)}
                disabled={actionLoading}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handlePermanentDelete}
                disabled={actionLoading}
                className="px-4 py-2 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-sm"
              >
                {actionLoading ? 'Deleting...' : 'Delete Forever'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Empty Entire Trash */}
      {isEmptyTrashModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-950/60 flex items-center justify-center text-rose-600">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Empty All Trash?
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                This will permanently delete all {totalTasks} task(s) currently in the trash for your organization.
                This action is irreversible.
              </p>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setIsEmptyTrashModalOpen(false)}
                disabled={actionLoading}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleEmptyTrash}
                disabled={actionLoading}
                className="px-4 py-2 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-sm"
              >
                {actionLoading ? 'Emptying...' : 'Empty Entire Trash'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
