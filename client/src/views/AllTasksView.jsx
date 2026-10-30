import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, CheckSquare, Check, Play, Trash2, X, RefreshCw } from 'lucide-react';
import { TaskFilters } from '../components/tasks/TaskFilters';
import { TaskItem } from '../components/tasks/TaskItem';
import { EmptyState } from '../components/common/EmptyState';
import api from '../services/api';

export const AllTasksView = ({
  onOpenCreateModal,
  onEditTask,
  onDeleteTask,
  onToggleStatus,
  refreshTrigger
}) => {
  const [tasks, setTasks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Bulk selection state
  const [selectedTaskIds, setSelectedTaskIds] = useState(new Set());
  const [isBulkOperating, setIsBulkOperating] = useState(false);

  // Pagination states
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Filter and sort states
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');

  // Reset page to 1 whenever filters change
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, priorityFilter, categoryFilter, sortBy, sortOrder]);

  // Asynchronous race-condition protected fetch with AbortController
  useEffect(() => {
    const controller = new AbortController();

    const timer = setTimeout(async () => {
      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams();
        if (search) params.append('search', search);
        if (statusFilter !== 'all') params.append('status', statusFilter);
        if (priorityFilter !== 'all') params.append('priority', priorityFilter);
        if (categoryFilter !== 'all') params.append('category', categoryFilter);
        params.append('sortBy', sortBy);
        params.append('sortOrder', sortOrder);
        params.append('page', page);
        params.append('limit', limit);

        const res = await api.get(`/tasks?${params.toString()}`, {
          signal: controller.signal
        });

        if (res.data.success) {
          setTasks(res.data.items || res.data.tasks || []);
          setTotal(res.data.totalItems ?? res.data.total ?? res.data.tasks.length);
          setTotalPages(res.data.totalPages ?? 1);
          if (res.data.categories) {
            setCategories(res.data.categories);
          }
        }
      } catch (err) {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') {
          return; // Ignore aborted requests
        }
        setError(err.response?.data?.message || 'Failed to fetch tasks');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, 150);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, statusFilter, priorityFilter, categoryFilter, sortBy, sortOrder, page, refreshTrigger]);

  // Bulk selection handlers
  const handleToggleSelect = (taskId) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedTaskIds.size === tasks.length) {
      setSelectedTaskIds(new Set());
    } else {
      setSelectedTaskIds(new Set(tasks.map((t) => t._id)));
    }
  };

  const handleBulkAction = async (operation, payload = undefined) => {
    if (selectedTaskIds.size === 0 || isBulkOperating) return;
    const taskIds = Array.from(selectedTaskIds);
    setIsBulkOperating(true);
    try {
      const res = await api.post('/tasks/bulk', {
        taskIds,
        operation,
        payload
      });
      if (res.data.success) {
        setSelectedTaskIds(new Set());
        // Trigger page refresh by changing search/refresh
        setPage((p) => p);
        const params = new URLSearchParams();
        if (search) params.append('search', search);
        if (statusFilter !== 'all') params.append('status', statusFilter);
        if (priorityFilter !== 'all') params.append('priority', priorityFilter);
        if (categoryFilter !== 'all') params.append('category', categoryFilter);
        params.append('sortBy', sortBy);
        params.append('sortOrder', sortOrder);
        params.append('page', page);
        params.append('limit', limit);
        const refetch = await api.get(`/tasks?${params.toString()}`);
        if (refetch.data.success) {
          setTasks(refetch.data.items || refetch.data.tasks || []);
          setTotal(refetch.data.totalItems ?? refetch.data.total ?? refetch.data.tasks.length);
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Bulk operation failed');
    } finally {
      setIsBulkOperating(false);
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Filters and Search Bar */}
      <TaskFilters
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        priorityFilter={priorityFilter}
        onPriorityChange={setPriorityFilter}
        categoryFilter={categoryFilter}
        onCategoryChange={setCategoryFilter}
        categories={categories}
        sortBy={sortBy}
        onSortByChange={setSortBy}
        sortOrder={sortOrder}
        onSortOrderChange={setSortOrder}
      />

      {/* Floating / Pinned Bulk Action Toolbar when tasks are selected */}
      {selectedTaskIds.size > 0 && (
        <div className="p-3 bg-indigo-50/90 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-800 rounded-2xl flex items-center justify-between flex-wrap gap-2 shadow-sm animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-indigo-900 dark:text-indigo-200 px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/60 rounded-full">
              {selectedTaskIds.size} selected
            </span>
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-xs text-indigo-700 dark:text-indigo-300 hover:underline font-semibold"
            >
              {selectedTaskIds.size === tasks.length ? 'Deselect All' : 'Select All On Page'}
            </button>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              disabled={isBulkOperating}
              onClick={() => handleBulkAction('status', 'in_progress')}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition-colors"
            >
              <Play className="w-3 h-3 text-blue-500" />
              <span>In Progress</span>
            </button>
            <button
              type="button"
              disabled={isBulkOperating}
              onClick={() => handleBulkAction('status', 'completed')}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
            >
              <Check className="w-3 h-3" />
              <span>Complete</span>
            </button>
            <button
              type="button"
              disabled={isBulkOperating}
              onClick={() => handleBulkAction('delete')}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 text-white transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              <span>Delete</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedTaskIds(new Set())}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              title="Clear selection"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Task List Header info & Count */}
      <div className="flex items-center justify-between px-1 text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-3">
          {tasks.length > 0 && (
            <label className="flex items-center gap-1.5 cursor-pointer font-semibold select-none">
              <input
                type="checkbox"
                checked={tasks.length > 0 && selectedTaskIds.size === tasks.length}
                onChange={handleSelectAll}
                className="w-3.5 h-3.5 rounded text-indigo-600 border-slate-300 dark:border-slate-700 focus:ring-indigo-500 cursor-pointer"
              />
              <span>Select All</span>
            </label>
          )}
          <span className="font-semibold uppercase tracking-wider">
            {total > 0
              ? `Showing ${(page - 1) * limit + 1}–${Math.min(page * limit, total)} of ${total} tasks`
              : `Showing 0 tasks`}
          </span>
        </div>

        {totalPages > 1 && (
          <span className="font-medium">
            Page {page} of {totalPages}
          </span>
        )}
      </div>

      {/* Task List or States */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-12">
          <div className="w-8 h-8 border-3 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin" />
          <span className="mt-3 text-xs text-slate-500">Loading tasks...</span>
        </div>
      ) : error ? (
        <div className="p-6 bg-rose-50 dark:bg-rose-950/40 rounded-2xl border border-rose-200 text-center">
          <p className="text-sm font-medium text-rose-600 dark:text-rose-400">{error}</p>
          <button
            onClick={fetchTasks}
            className="mt-3 px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-semibold"
          >
            Retry
          </button>
        </div>
      ) : tasks.length === 0 ? (
        <EmptyState
          title={
            search || statusFilter !== 'all' || priorityFilter !== 'all' || categoryFilter !== 'all'
              ? 'No matching tasks found'
              : 'No tasks yet'
          }
          description={
            search || statusFilter !== 'all' || priorityFilter !== 'all' || categoryFilter !== 'all'
              ? 'Try adjusting your search criteria or reset filters.'
              : 'Get started by creating your very first task to stay organized.'
          }
          actionText="Create Task"
          onAction={onOpenCreateModal}
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
              isSelected={selectedTaskIds.has(task._id)}
              onToggleSelect={handleToggleSelect}
            />
          ))}
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>

          <span className="text-xs font-medium text-slate-500">
            Page {page} of {totalPages}
          </span>

          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
