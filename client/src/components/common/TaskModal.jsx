import React, { useState, useEffect } from 'react';
import { X, AlertCircle, UserCheck, Layers, Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';

const CATEGORY_SUGGESTIONS = ['Work', 'Personal', 'Study', 'Urgent', 'Health', 'Project'];

export const TaskModal = ({ isOpen, onClose, onSubmit, task = null, isSubmitting = false }) => {
  const { currentOrg, workspaces, currentWorkspace } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [status, setStatus] = useState('pending');
  const [dueDate, setDueDate] = useState('');
  const [category, setCategory] = useState('General');
  const [assignedTo, setAssignedTo] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [members, setMembers] = useState([]);
  const [error, setError] = useState('');

  // Fetch members when modal is opened
  useEffect(() => {
    if (isOpen && currentOrg?._id) {
      api.get(`/organizations/${currentOrg._id}/members`)
        .then((res) => {
          if (res.data.success) {
            setMembers(res.data.members || []);
          }
        })
        .catch(() => {});
    }
  }, [isOpen, currentOrg?._id]);

  useEffect(() => {
    if (task) {
      setTitle(task.title || '');
      setDescription(task.description || '');
      setPriority(task.priority || 'medium');
      setStatus(task.status || 'pending');
      setAssignedTo(task.assignedTo?._id || task.assignedTo || '');
      setWorkspaceId(task.workspace?._id || task.workspace || '');
      setIsPrivate(Boolean(task.isPrivate));

      // Preserve date string without timezone skew
      let dateVal = '';
      if (task.dueDateString) {
        dateVal = task.dueDateString;
      } else if (task.dueDate) {
        try {
          dateVal = new Intl.DateTimeFormat('en-CA').format(new Date(task.dueDate));
        } catch {
          dateVal = '';
        }
      }
      setDueDate(dateVal);
      setCategory(task.category || 'General');
    } else {
      setTitle('');
      setDescription('');
      setPriority('medium');
      setStatus('pending');
      setDueDate('');
      setCategory('General');
      setAssignedTo('');
      setWorkspaceId(currentWorkspace?._id || '');
      setIsPrivate(false);
    }
    setError('');
  }, [task, isOpen, currentWorkspace]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Task title is required');
      return;
    }

    setError('');
    onSubmit({
      title: title.trim(),
      description: description.trim(),
      priority,
      status,
      dueDate: dueDate || null,
      dueDateString: dueDate || null,
      category: category.trim() || 'General',
      assignedTo: assignedTo || null,
      workspaceId: workspaceId || null,
      isPrivate
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden transform transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            {task ? 'Edit Task' : 'Create New Task'}
          </h2>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="flex items-center gap-2 p-3 text-sm text-rose-600 bg-rose-50 dark:bg-rose-950/50 dark:text-rose-300 rounded-xl border border-rose-200 dark:border-rose-900">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
              Task Title <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Design multi-tenant database migration"
              disabled={isSubmitting}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:focus:bg-slate-850 transition-colors"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add key deliverables, acceptance criteria, or context..."
              rows={3}
              disabled={isSubmitting}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:focus:bg-slate-850 transition-colors"
            />
          </div>

          {/* Priority & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                Priority
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { value: 'low', label: 'Low', color: 'text-slate-600' },
                  { value: 'medium', label: 'Medium', color: 'text-amber-600' },
                  { value: 'high', label: 'High', color: 'text-rose-600' }
                ].map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => setPriority(item.value)}
                    className={`py-2 px-2 text-xs font-medium rounded-xl border text-center transition-all ${
                      priority === item.value
                        ? 'border-indigo-500 text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 font-bold ring-2 ring-indigo-500/50 shadow-xs'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                Status
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { value: 'pending', label: 'In Progress' },
                  { value: 'completed', label: 'Completed' }
                ].map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => setStatus(item.value)}
                    className={`py-2 px-2 text-xs font-medium rounded-xl border text-center transition-all ${
                      status === item.value
                        ? 'border-indigo-500 text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 font-bold ring-2 ring-indigo-500/50 shadow-xs'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Assignee & Workspace */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                <UserCheck className="w-3.5 h-3.5 text-indigo-500" />
                <span>Assignee</span>
              </label>
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
              >
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.id} value={m.user?._id}>
                    {m.user?.name} ({m.role})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                <Layers className="w-3.5 h-3.5 text-purple-500" />
                <span>Workspace</span>
              </label>
              <select
                value={workspaceId}
                onChange={(e) => setWorkspaceId(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
              >
                <option value="">Default (General)</option>
                {workspaces.map((ws) => (
                  <option key={ws._id} value={ws._id}>
                    {ws.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Due Date & Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                Due Date <span className="text-slate-400 text-xs font-normal">(Local Date)</span>
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                Category
              </label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Work, Personal"
                list="category-suggestions"
                disabled={isSubmitting}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <datalist id="category-suggestions">
                {CATEGORY_SUGGESTIONS.map((cat) => (
                  <option key={cat} value={cat} />
                ))}
              </datalist>
            </div>
          </div>

          {/* Private Task Toggle */}
          <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
            <input
              type="checkbox"
              id="isPrivate"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className="w-4 h-4 text-indigo-600 rounded-sm border-slate-300 focus:ring-indigo-500"
            />
            <label htmlFor="isPrivate" className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
              <Lock className="w-3.5 h-3.5 text-amber-500" />
              <span>Mark as Private (Restricted from Guest and Billing Admin viewers)</span>
            </label>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center px-5 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 rounded-xl shadow-md shadow-indigo-600/20 transition-all active:scale-95"
            >
              {isSubmitting ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : task ? (
                'Save Changes'
              ) : (
                'Create Task'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
