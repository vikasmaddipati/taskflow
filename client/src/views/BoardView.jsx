import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  Calendar,
  CheckSquare,
  Paperclip,
  ChevronRight,
  MoreVertical,
  MoveRight
} from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const COLUMNS = [
  { id: 'pending', label: 'To Do', color: 'border-amber-500/30 bg-amber-500/5 text-amber-600 dark:text-amber-400' },
  { id: 'in_progress', label: 'In Progress', color: 'border-indigo-500/30 bg-indigo-500/5 text-indigo-600 dark:text-indigo-400' },
  { id: 'review', label: 'Review', color: 'border-purple-500/30 bg-purple-500/5 text-purple-600 dark:text-purple-400' },
  { id: 'completed', label: 'Completed', color: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400' }
];

const priorityStyles = {
  high: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
  medium: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  low: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20'
};

export const BoardView = ({ onOpenCreateModal, onEditTask, onDeleteTask, refreshTrigger, showToast }) => {
  const { currentOrg, currentWorkspace } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [draggedTaskId, setDraggedTaskId] = useState(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/tasks', {
        params: { limit: 100 }
      });
      if (res.data?.success) {
        setTasks(res.data.items || res.data.tasks || []);
      }
    } catch (err) {
      console.warn('Failed to fetch board tasks:', err.message);
    } finally {
      setLoading(false);
    }
  }, [currentOrg?._id, currentWorkspace?._id]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks, refreshTrigger]);

  // Handle task status transition with optimistic UI update
  const handleMoveStatus = async (taskId, newStatus) => {
    const targetTask = tasks.find((t) => t._id === taskId);
    if (!targetTask || targetTask.status === newStatus) return;

    // Optimistic update
    setTasks((prev) =>
      prev.map((t) => (t._id === taskId ? { ...t, status: newStatus } : t))
    );

    try {
      const res = await api.patch(`/tasks/${taskId}/status`, { status: newStatus });
      if (res.data?.success) {
        showToast?.({
          type: 'success',
          message: `Moved to ${newStatus.replace('_', ' ')}`
        });
      }
    } catch (err) {
      // Rollback on failure
      setTasks((prev) =>
        prev.map((t) => (t._id === taskId ? { ...t, status: targetTask.status } : t))
      );
      showToast?.({
        type: 'error',
        message: err.response?.data?.message || 'Failed to update status'
      });
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e, taskId) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.setData('text/plain', taskId);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e, columnId) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain') || draggedTaskId;
    if (taskId) {
      handleMoveStatus(taskId, columnId);
    }
    setDraggedTaskId(null);
  };

  // Filter tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      const matchesSearch =
        !search ||
        t.title.toLowerCase().includes(search.toLowerCase()) ||
        (t.description && t.description.toLowerCase().includes(search.toLowerCase()));

      const matchesPriority =
        priorityFilter === 'all' || t.priority === priorityFilter;

      return matchesSearch && matchesPriority;
    });
  }, [tasks, search, priorityFilter]);

  const tasksByColumn = useMemo(() => {
    const map = { pending: [], in_progress: [], review: [], completed: [] };
    filteredTasks.forEach((t) => {
      const col = map[t.status] ? t.status : 'pending';
      map[col].push(t);
    });
    return map;
  }, [filteredTasks]);

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Kanban Board
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Drag and drop tasks between workflow columns to track team progress
          </p>
        </div>

        <button
          onClick={() => onOpenCreateModal?.()}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-xs transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>New Task</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center gap-3 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search board tasks..."
            className="w-full pl-9 pr-4 py-1.5 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border-none focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800 dark:text-slate-200"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-3 py-1.5 text-xs font-medium rounded-xl bg-slate-50 dark:bg-slate-800 border-none text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            <option value="all">All Priorities</option>
            <option value="high">High Priority</option>
            <option value="medium">Medium Priority</option>
            <option value="low">Low Priority</option>
          </select>
        </div>
      </div>

      {/* Board Columns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
        {COLUMNS.map((col) => {
          const colTasks = tasksByColumn[col.id] || [];
          return (
            <div
              key={col.id}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, col.id)}
              className="flex flex-col bg-slate-100/70 dark:bg-slate-900/60 rounded-2xl p-3 border border-slate-200 dark:border-slate-800 min-h-[500px]"
            >
              {/* Column Header */}
              <div className="flex items-center justify-between px-2 py-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${col.id === 'completed' ? 'bg-emerald-500' : col.id === 'in_progress' ? 'bg-indigo-500' : col.id === 'review' ? 'bg-purple-500' : 'bg-amber-500'}`} />
                  <span className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                    {col.label}
                  </span>
                </div>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                  {colTasks.length}
                </span>
              </div>

              {/* Task Cards */}
              <div className="space-y-2.5 flex-1">
                {colTasks.map((task) => {
                  const completedSubtasks = task.subtasks?.filter((s) => s.isCompleted)?.length || 0;
                  const totalSubtasks = task.subtasks?.length || 0;

                  return (
                    <div
                      key={task._id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, task._id)}
                      onClick={() => onEditTask?.(task)}
                      className="group p-3.5 bg-white dark:bg-slate-850 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-md transition-all cursor-grab active:cursor-grabbing hover:border-indigo-500/50"
                    >
                      {/* Priority & Category */}
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${priorityStyles[task.priority] || priorityStyles.medium}`}
                        >
                          {task.priority}
                        </span>

                        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate max-w-[100px]">
                          {task.category || 'General'}
                        </span>
                      </div>

                      {/* Title */}
                      <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100 line-clamp-2 mb-1.5">
                        {task.title}
                      </h3>

                      {/* Description Preview */}
                      {task.description && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mb-3">
                          {task.description}
                        </p>
                      )}

                      {/* Subtask checklist metric */}
                      {totalSubtasks > 0 && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mb-2">
                          <CheckSquare className="w-3.5 h-3.5 text-indigo-500" />
                          <span>{completedSubtasks}/{totalSubtasks} subtasks</span>
                        </div>
                      )}

                      {/* Card Footer: Due Date, Attachments, Next Move fallback */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/80 text-xs text-slate-400">
                        <div className="flex items-center gap-3">
                          {task.dueDateString && (
                            <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                              <Calendar className="w-3 h-3 text-slate-400" />
                              <span>{task.dueDateString}</span>
                            </div>
                          )}

                          {task.attachments?.length > 0 && (
                            <div className="flex items-center gap-0.5 text-[11px] text-slate-500">
                              <Paperclip className="w-3 h-3" />
                              <span>{task.attachments.length}</span>
                            </div>
                          )}
                        </div>

                        {/* Column shift quick selector */}
                        <div
                          className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {COLUMNS.filter((c) => c.id !== col.id).map((targetCol) => (
                            <button
                              key={targetCol.id}
                              title={`Move to ${targetCol.label}`}
                              onClick={() => handleMoveStatus(task._id, targetCol.id)}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 hover:bg-indigo-500 hover:text-white text-slate-600 dark:text-slate-300 transition-colors"
                            >
                              {targetCol.label.slice(0, 3)}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {colTasks.length === 0 && (
                  <div className="h-32 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-center text-xs text-slate-400">
                    Drop tasks here
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
