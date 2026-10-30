import React, { useState, useEffect } from 'react';
import {
  X,
  AlertCircle,
  UserCheck,
  Layers,
  Lock,
  CheckSquare,
  Repeat,
  Paperclip,
  History,
  Trash2,
  Download,
  Plus,
  Check,
  UploadCloud,
  MessageSquare,
  Send,
  Edit2
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';

const CATEGORY_SUGGESTIONS = ['Work', 'Personal', 'Study', 'Urgent', 'Health', 'Project'];

export const TaskModal = ({ isOpen, onClose, onSubmit, task = null, isSubmitting = false }) => {
  const { currentOrg, workspaces, currentWorkspace, user: currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState('details');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [status, setStatus] = useState('pending');
  const [dueDate, setDueDate] = useState('');
  const [category, setCategory] = useState('General');
  const [assignedTo, setAssignedTo] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);

  // Recurrence state
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceFreq, setRecurrenceFreq] = useState('daily');
  const [recurrenceInterval, setRecurrenceInterval] = useState(1);

  // Subtasks state
  const [subtasks, setSubtasks] = useState([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

  // Attachments state
  const [attachments, setAttachments] = useState([]);
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  // Comments state
  const [comments, setComments] = useState([]);
  const [newCommentText, setNewCommentText] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editingCommentText, setEditingCommentText] = useState('');

  // Activity log state
  const [activityLogs, setActivityLogs] = useState([]);
  const [isLoadingActivity, setIsLoadingActivity] = useState(false);

  const [members, setMembers] = useState([]);
  const [availableCategories, setAvailableCategories] = useState(CATEGORY_SUGGESTIONS);
  const [error, setError] = useState('');

  // Fetch members and persistent categories when modal is opened
  useEffect(() => {
    if (isOpen) {
      if (currentOrg?._id) {
        api.get(`/organizations/${currentOrg._id}/members`)
          .then((res) => {
            if (res.data.success) {
              setMembers(res.data.members || []);
            }
          })
          .catch(() => {});
      }

      api.get('/categories')
        .then((res) => {
          if (res.data?.success && res.data.categories?.length > 0) {
            const catNames = res.data.categories.map((c) => c.name);
            setAvailableCategories(Array.from(new Set([...catNames, ...CATEGORY_SUGGESTIONS])));
          }
        })
        .catch(() => {});
    }
  }, [isOpen, currentOrg?._id]);

  useEffect(() => {
    setActiveTab('details');
    if (task) {
      setTitle(task.title || '');
      setDescription(task.description || '');
      setPriority(task.priority || 'medium');
      setStatus(task.status || 'pending');
      setAssignedTo(task.assignedTo?._id || task.assignedTo || '');
      setWorkspaceId(task.workspace?._id || task.workspace || '');
      setIsPrivate(Boolean(task.isPrivate));

      // Recurrence
      setIsRecurring(Boolean(task.recurrence?.isRecurring));
      setRecurrenceFreq(task.recurrence?.frequency || 'daily');
      setRecurrenceInterval(task.recurrence?.interval || 1);

      // Subtasks, Attachments & Comments
      setSubtasks(Array.isArray(task.subtasks) ? task.subtasks : []);
      setAttachments(Array.isArray(task.attachments) ? task.attachments : []);
      setComments(Array.isArray(task.comments) ? task.comments : []);

      // Date normalization
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
      setIsRecurring(false);
      setRecurrenceFreq('daily');
      setRecurrenceInterval(1);
      setSubtasks([]);
      setAttachments([]);
      setComments([]);
    }
    setError('');
  }, [task, isOpen, currentWorkspace]);

  // Load latest comments when comments tab is selected
  useEffect(() => {
    if (activeTab === 'comments' && task?._id) {
      api.get(`/tasks/${task._id}`)
        .then((res) => {
          if (res.data.success && res.data.task) {
            setComments(res.data.task.comments || []);
          }
        })
        .catch(() => {});
    }
  }, [activeTab, task?._id]);

  // Load activity logs when activity tab is selected
  useEffect(() => {
    if (activeTab === 'activity' && task?._id) {
      setIsLoadingActivity(true);
      api.get(`/tasks/${task._id}/activity`)
        .then((res) => {
          if (res.data.success) {
            setActivityLogs(res.data.activity || []);
          }
        })
        .catch(() => {})
        .finally(() => setIsLoadingActivity(false));
    }
  }, [activeTab, task?._id]);

  if (!isOpen) return null;

  // Subtask handlers
  const handleAddSubtask = async (e) => {
    e.preventDefault();
    if (!newSubtaskTitle.trim()) return;

    if (task?._id) {
      try {
        const res = await api.post(`/tasks/${task._id}/subtasks`, { title: newSubtaskTitle.trim() });
        if (res.data.success && res.data.subtask) {
          setSubtasks((prev) => [...prev, res.data.subtask]);
          setNewSubtaskTitle('');
        }
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to add subtask');
      }
    } else {
      setSubtasks((prev) => [...prev, { _id: Date.now().toString(), title: newSubtaskTitle.trim(), isCompleted: false }]);
      setNewSubtaskTitle('');
    }
  };

  const handleToggleSubtask = async (subtaskId, currentStatus) => {
    if (task?._id) {
      try {
        const res = await api.patch(`/tasks/${task._id}/subtasks/${subtaskId}`, { isCompleted: !currentStatus });
        if (res.data.success) {
          setSubtasks((prev) =>
            prev.map((s) => (s._id === subtaskId ? { ...s, isCompleted: !currentStatus } : s))
          );
        }
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to update subtask');
      }
    } else {
      setSubtasks((prev) =>
        prev.map((s) => (s._id === subtaskId ? { ...s, isCompleted: !currentStatus } : s))
      );
    }
  };

  const handleDeleteSubtask = async (subtaskId) => {
    if (task?._id) {
      try {
        const res = await api.delete(`/tasks/${task._id}/subtasks/${subtaskId}`);
        if (res.data.success) {
          setSubtasks((prev) => prev.filter((s) => s._id !== subtaskId));
        }
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to delete subtask');
      }
    } else {
      setSubtasks((prev) => prev.filter((s) => s._id !== subtaskId));
    }
  };

  // Attachment handlers
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !task?._id) return;

    const formData = new FormData();
    formData.append('file', file);

    setIsUploadingFile(true);
    try {
      const res = await api.post(`/tasks/${task._id}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (res.data.success && res.data.attachment) {
        setAttachments((prev) => [...prev, res.data.attachment]);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'File upload failed');
    } finally {
      setIsUploadingFile(false);
      e.target.value = '';
    }
  };

  const handleDeleteAttachment = async (attachmentId) => {
    if (!task?._id) return;
    try {
      const res = await api.delete(`/tasks/${task._id}/attachments/${attachmentId}`);
      if (res.data.success) {
        setAttachments((prev) => prev.filter((a) => a._id !== attachmentId));
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete attachment');
    }
  };

  const handleDownloadAttachment = async (att) => {
    if (!task?._id || !att) return;
    try {
      const res = await api.get(`/tasks/${task._id}/attachments/${att._id}/download`, {
        responseType: 'blob'
      });
      const blobUrl = window.URL.createObjectURL(
        new Blob([res.data], { type: att.mimeType || 'application/octet-stream' })
      );
      const link = document.createElement('a');
      link.href = blobUrl;
      link.setAttribute('download', att.originalName || 'attachment');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to download attachment');
    }
  };

  // Comment Handlers
  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!task?._id || !newCommentText.trim() || isSubmittingComment) return;

    setIsSubmittingComment(true);
    try {
      const res = await api.post(`/tasks/${task._id}/comments`, {
        content: newCommentText.trim()
      });
      if (res.data.success && res.data.comments) {
        setComments(res.data.comments);
        setNewCommentText('');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to post comment');
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleUpdateComment = async (commentId) => {
    if (!task?._id || !commentId || !editingCommentText.trim()) return;

    try {
      const res = await api.patch(`/tasks/${task._id}/comments/${commentId}`, {
        content: editingCommentText.trim()
      });
      if (res.data.success && res.data.comments) {
        setComments(res.data.comments);
        setEditingCommentId(null);
        setEditingCommentText('');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update comment');
    }
  };

  const handleDeleteComment = async (commentId) => {
    if (!task?._id || !commentId) return;

    try {
      const res = await api.delete(`/tasks/${task._id}/comments/${commentId}`);
      if (res.data.success) {
        setComments((prev) => prev.filter((c) => c._id !== commentId));
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete comment');
    }
  };

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
      isPrivate,
      subtasks,
      recurrence: {
        isRecurring,
        frequency: isRecurring ? recurrenceFreq : 'none',
        interval: Number(recurrenceInterval) || 1
      }
    });
  };

  const completedSubtasksCount = subtasks.filter((s) => s.isCompleted).length;
  const subtaskPercent = subtasks.length > 0 ? Math.round((completedSubtasksCount / subtasks.length) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden transform transition-all flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
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

        {/* Modal Tabs if editing existing task */}
        {task && (
          <div className="flex items-center border-b border-slate-100 dark:border-slate-800 px-6 gap-2 bg-slate-50/50 dark:bg-slate-850/50 shrink-0 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab('details')}
              className={`py-3 px-3 border-b-2 transition-colors ${
                activeTab === 'details'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              Task Details
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('subtasks')}
              className={`py-3 px-3 border-b-2 flex items-center gap-1.5 transition-colors ${
                activeTab === 'subtasks'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>Subtasks ({subtasks.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('attachments')}
              className={`py-3 px-3 border-b-2 flex items-center gap-1.5 transition-colors ${
                activeTab === 'attachments'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <Paperclip className="w-3.5 h-3.5" />
              <span>Attachments ({attachments.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('comments')}
              className={`py-3 px-3 border-b-2 flex items-center gap-1.5 transition-colors ${
                activeTab === 'comments'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Comments ({comments.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('activity')}
              className={`py-3 px-3 border-b-2 flex items-center gap-1.5 transition-colors ${
                activeTab === 'activity'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Activity Log</span>
            </button>
          </div>
        )}

        {/* Tab 1: Details Form */}
        {activeTab === 'details' && (
          <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
            {error && (
              <div className="flex items-center gap-2 p-3 text-sm text-rose-600 bg-rose-50 dark:bg-rose-950/50 dark:text-rose-300 rounded-xl border border-rose-200 dark:border-rose-900">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Title */}
            <div>
              <label htmlFor="task-title" className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                Task Title <span className="text-rose-500">*</span>
              </label>
              <input
                id="task-title"
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
                    { value: 'low', label: 'Low' },
                    { value: 'medium', label: 'Medium' },
                    { value: 'high', label: 'High' }
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
                <label htmlFor="task-due-date" className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                  Due Date <span className="text-slate-400 text-xs font-normal">(Local Date)</span>
                </label>
                <input
                  id="task-due-date"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label htmlFor="task-category" className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                  Category
                </label>
                <input
                  id="task-category"
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. Work, Personal"
                  list="category-suggestions"
                  disabled={isSubmitting}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <datalist id="category-suggestions">
                  {availableCategories.map((cat) => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
              </div>
            </div>

            {/* Recurrence Settings */}
            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/60 dark:border-slate-700/60 space-y-2.5">
              <div className="flex items-center justify-between">
                <label htmlFor="isRecurring" className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                  <Repeat className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Repeat Task (Recurring Schedule)</span>
                </label>
                <input
                  type="checkbox"
                  id="isRecurring"
                  checked={isRecurring}
                  onChange={(e) => setIsRecurring(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded-sm border-slate-300 focus:ring-indigo-500 cursor-pointer"
                />
              </div>

              {isRecurring && (
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200/50 dark:border-slate-700/50">
                  <div>
                    <span className="block text-[11px] font-medium text-slate-500 mb-1">Frequency</span>
                    <select
                      value={recurrenceFreq}
                      onChange={(e) => setRecurrenceFreq(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                  <div>
                    <span className="block text-[11px] font-medium text-slate-500 mb-1">Interval (Every X)</span>
                    <input
                      type="number"
                      min="1"
                      max="365"
                      value={recurrenceInterval}
                      onChange={(e) => setRecurrenceInterval(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Inline Subtasks if creating new task */}
            {!task && (
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/60 dark:border-slate-700/60 space-y-2">
                <span className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  Checklist & Subtasks ({subtasks.length})
                </span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    placeholder="Add checklist item..."
                    className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={handleAddSubtask}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold"
                  >
                    Add
                  </button>
                </div>
                {subtasks.length > 0 && (
                  <ul className="space-y-1.5 pt-1">
                    {subtasks.map((st) => (
                      <li key={st._id} className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-850 px-2.5 py-1.5 rounded-lg border border-slate-200/50 dark:border-slate-750">
                        <span>{st.title}</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteSubtask(st._id)}
                          className="text-slate-400 hover:text-rose-500"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

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
        )}

        {/* Tab 2: Subtasks Tab (Edit Mode) */}
        {activeTab === 'subtasks' && (
          <div className="p-6 space-y-4 overflow-y-auto flex-1">
            {/* Progress bar */}
            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                <span>Checklist Progress</span>
                <span>{subtaskPercent}% ({completedSubtasksCount}/{subtasks.length})</span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-indigo-600 h-full transition-all duration-300"
                  style={{ width: `${subtaskPercent}%` }}
                />
              </div>
            </div>

            {/* Add Subtask */}
            <form onSubmit={handleAddSubtask} className="flex gap-2">
              <input
                type="text"
                value={newSubtaskTitle}
                onChange={(e) => setNewSubtaskTitle(e.target.value)}
                placeholder="Add new subtask item..."
                className="flex-1 px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="submit"
                disabled={!newSubtaskTitle.trim()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Add</span>
              </button>
            </form>

            {/* Subtask items */}
            <div className="space-y-2">
              {subtasks.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  No subtasks added yet. Break down this task into smaller steps above!
                </div>
              ) : (
                subtasks.map((st) => (
                  <div
                    key={st._id}
                    className="flex items-center justify-between p-3 rounded-xl border border-slate-200/70 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => handleToggleSubtask(st._id, st.isCompleted)}
                        className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                          st.isCompleted
                            ? 'bg-emerald-500 border-emerald-500 text-white'
                            : 'border-slate-300 dark:border-slate-600 hover:border-indigo-500'
                        }`}
                      >
                        {st.isCompleted && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </button>
                      <span
                        className={`text-xs ${
                          st.isCompleted
                            ? 'line-through text-slate-400 dark:text-slate-500'
                            : 'text-slate-800 dark:text-slate-100 font-medium'
                        }`}
                      >
                        {st.title}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteSubtask(st._id)}
                      className="p-1 text-slate-400 hover:text-rose-500 rounded-lg transition-colors"
                      title="Delete subtask"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Attachments Tab (Edit Mode) */}
        {activeTab === 'attachments' && (
          <div className="p-6 space-y-4 overflow-y-auto flex-1">
            {/* Upload Box */}
            <div className="p-4 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl flex flex-col items-center justify-center text-center bg-slate-50/50 dark:bg-slate-850/30">
              <UploadCloud className="w-8 h-8 text-indigo-500 mb-2" />
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Upload task attachment (PDF, Images, Documents up to 10MB)
              </p>
              <label className="mt-3 cursor-pointer inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors">
                <span>{isUploadingFile ? 'Uploading...' : 'Choose File'}</span>
                <input
                  type="file"
                  onChange={handleFileUpload}
                  disabled={isUploadingFile}
                  className="hidden"
                />
              </label>
            </div>

            {/* Attachment list */}
            <div className="space-y-2">
              {attachments.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400">
                  No attachments yet for this task.
                </div>
              ) : (
                attachments.map((att) => (
                  <div
                    key={att._id}
                    className="flex items-center justify-between p-3 rounded-xl border border-slate-200/70 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/50"
                  >
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <Paperclip className="w-4 h-4 text-slate-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
                          {att.originalName}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {(att.size / 1024).toFixed(1)} KB • {new Date(att.uploadedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleDownloadAttachment(att)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg transition-colors"
                        title="Download file (Authenticated)"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteAttachment(att._id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                        title="Delete file"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Tab 4: Comments Tab (Edit Mode) */}
        {activeTab === 'comments' && (
          <div className="p-6 space-y-4 overflow-y-auto flex-1 flex flex-col">
            {/* Comment list */}
            <div className="space-y-3 flex-1 overflow-y-auto pr-1">
              {comments.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                  No comments yet. Start the conversation below.
                </div>
              ) : (
                comments.map((comment) => {
                  const author = comment.user || {};
                  const isAuthor =
                    currentUser?._id &&
                    (author._id === currentUser._id || comment.user === currentUser._id);
                  const isEditing = editingCommentId === comment._id;

                  return (
                    <div
                      key={comment._id}
                      className="p-3.5 rounded-xl border border-slate-200/70 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/50 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-[10px] font-bold">
                            {(author.name || 'U').charAt(0).toUpperCase()}
                          </div>
                          <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                            {author.name || 'Team Member'}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {new Date(comment.createdAt).toLocaleDateString()} at{' '}
                            {new Date(comment.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>

                        {isAuthor && (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCommentId(comment._id);
                                setEditingCommentText(comment.content);
                              }}
                              className="p-1 text-slate-400 hover:text-indigo-600 rounded transition-colors"
                              title="Edit comment"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteComment(comment._id)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                              title="Delete comment"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      {isEditing ? (
                        <div className="space-y-2 pt-1">
                          <textarea
                            value={editingCommentText}
                            onChange={(e) => setEditingCommentText(e.target.value)}
                            rows={2}
                            className="w-full text-xs p-2.5 rounded-lg border border-indigo-300 dark:border-indigo-600 bg-white dark:bg-slate-900 focus:outline-hidden"
                          />
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCommentId(null);
                                setEditingCommentText('');
                              }}
                              className="px-2.5 py-1 text-[11px] text-slate-500 hover:text-slate-700"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateComment(comment._id)}
                              className="px-3 py-1 text-[11px] font-semibold text-white bg-indigo-600 rounded-md"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap pl-8">
                          {comment.content}
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Post comment input box */}
            <form onSubmit={handleAddComment} className="pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex gap-2">
                <textarea
                  value={newCommentText}
                  onChange={(e) => setNewCommentText(e.target.value)}
                  placeholder="Write a comment or update for the team..."
                  rows={2}
                  className="flex-1 text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 resize-none"
                />
                <button
                  type="submit"
                  disabled={!newCommentText.trim() || isSubmittingComment}
                  className="px-4 py-2 self-end text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl flex items-center gap-1.5 shadow-xs transition-colors shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSubmittingComment ? 'Sending...' : 'Post'}</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Tab 5: Activity Log Tab (Edit Mode) */}
        {activeTab === 'activity' && (
          <div className="p-6 space-y-4 overflow-y-auto flex-1">
            {isLoadingActivity ? (
              <div className="py-12 flex justify-center">
                <div className="w-6 h-6 border-2 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin" />
              </div>
            ) : activityLogs.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No activity history recorded for this task.
              </div>
            ) : (
              <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
                {activityLogs.map((log) => (
                  <div key={log._id} className="relative">
                    <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-indigo-600 ring-4 ring-white dark:ring-slate-900" />
                    <div>
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {log.actor?.name || log.actor?.email || 'User'}{' '}
                        <span className="font-normal text-slate-500">
                          {log.action.replace('task.', '').replace('_', ' ')}
                        </span>
                      </p>
                      {log.metadata?.changes && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono bg-slate-100 dark:bg-slate-800 p-1.5 rounded-md">
                          {JSON.stringify(log.metadata.changes)}
                        </p>
                      )}
                      <span className="text-[10px] text-slate-400 mt-1 block">
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
