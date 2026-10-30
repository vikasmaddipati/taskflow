import React from 'react';
import {
  Check,
  Calendar,
  Tag,
  Clock,
  Edit3,
  Trash2,
  AlertCircle,
  CheckSquare,
  Repeat,
  Paperclip
} from 'lucide-react';

export const TaskItem = ({
  task,
  onToggleStatus,
  onEdit,
  onDelete,
  isSelected = false,
  onToggleSelect = null
}) => {
  const isCompleted = task.status === 'completed';
  const subtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
  const completedSubtasksCount = subtasks.filter((s) => s.isCompleted).length;
  const attachmentsCount = Array.isArray(task.attachments) ? task.attachments.length : 0;
  const isRecurring = Boolean(task.recurrence?.isRecurring && task.recurrence?.frequency !== 'none');

  // Accurate calendar day evaluation in user local timezone
  const getDueDateInfo = (task) => {
    const dateInput = task.dueDateString || task.dueDate;
    if (!dateInput) return null;

    const now = new Date();
    const todayStr = new Intl.DateTimeFormat('en-CA').format(now); // YYYY-MM-DD in local time

    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = new Intl.DateTimeFormat('en-CA').format(tomorrow);

    // Extract target YYYY-MM-DD
    let targetDateStr = '';
    if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateInput)) {
      targetDateStr = dateInput.substring(0, 10);
    } else {
      const d = new Date(dateInput);
      if (!isNaN(d.getTime())) {
        targetDateStr = new Intl.DateTimeFormat('en-CA').format(d);
      }
    }

    if (!targetDateStr) return null;

    const isDueToday = targetDateStr === todayStr;
    const isDueTomorrow = targetDateStr === tomorrowStr;
    const isOverdue = targetDateStr < todayStr && !isCompleted;

    const [y, m, d] = targetDateStr.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);

    let label = dateObj.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: dateObj.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });

    if (isDueToday) label = 'Today';
    else if (isDueTomorrow) label = 'Tomorrow';

    return {
      label,
      isOverdue,
      isDueToday,
      targetDateStr
    };
  };

  const dueInfo = getDueDateInfo(task);

  // Priority badge styling
  const priorityStyles = {
    high: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900',
    medium: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900',
    low: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900'
  };

  return (
    <div
      className={`group relative flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-2xl border transition-all duration-200 ${
        isCompleted
          ? 'bg-slate-50/60 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800/80 opacity-75'
          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-xs hover:shadow-md'
      }`}
    >
      {/* Left section: Checkbox, Title, Details */}
      <div className="flex items-start gap-3 flex-1 min-w-0 w-full sm:w-auto">
        {/* Multi-select Checkbox */}
        {onToggleSelect && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(task._id)}
            className="mt-1 w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-700 dark:bg-slate-800 cursor-pointer"
            title="Select task for bulk actions"
          />
        )}

        {/* Toggle Checkbox Button */}
        <button
          type="button"
          onClick={() => onToggleStatus(task._id)}
          className={`mt-0.5 w-5 h-5 rounded-lg border flex items-center justify-center shrink-0 transition-all ${
            isCompleted
              ? 'bg-emerald-500 border-emerald-500 text-white'
              : 'border-slate-300 dark:border-slate-600 hover:border-indigo-500 dark:hover:border-indigo-400 bg-white dark:bg-slate-800'
          }`}
          title={isCompleted ? 'Mark as pending' : 'Mark as completed'}
        >
          {isCompleted && <Check className="w-3.5 h-3.5 stroke-[3]" />}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0 pr-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h4
              className={`text-sm font-semibold leading-tight break-words transition-all ${
                isCompleted
                  ? 'line-through text-slate-400 dark:text-slate-500'
                  : 'text-slate-800 dark:text-slate-100'
              }`}
            >
              {task.title}
            </h4>

            {/* Priority Badge */}
            <span
              className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border ${
                priorityStyles[task.priority] || priorityStyles.medium
              }`}
            >
              {task.priority || 'Medium'}
            </span>

            {/* Status indicator if in_progress or review */}
            {task.status === 'in_progress' && (
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900">
                In Progress
              </span>
            )}
            {task.status === 'review' && (
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-900">
                Review
              </span>
            )}

            {/* Category Tag */}
            {task.category && (
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md font-medium">
                <Tag className="w-3 h-3 text-slate-400" />
                {task.category}
              </span>
            )}

            {/* Recurrence Badge */}
            {isRecurring && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-2 py-0.5 rounded-md border border-indigo-200 dark:border-indigo-800">
                <Repeat className="w-3 h-3" />
                <span className="capitalize">{task.recurrence.frequency}</span>
              </span>
            )}
          </div>

          {/* Description */}
          {task.description && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
              {task.description}
            </p>
          )}

          {/* Badges container: Due date, Subtask checklist progress, Attachments */}
          <div className="flex items-center gap-3 mt-2 flex-wrap text-xs">
            {dueInfo && (
              <div
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-medium text-[11px] ${
                  dueInfo.isOverdue
                    ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60'
                    : dueInfo.isDueToday
                    ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {dueInfo.isOverdue ? (
                  <AlertCircle className="w-3 h-3 shrink-0 text-rose-500" />
                ) : (
                  <Calendar className="w-3 h-3 shrink-0 text-slate-400" />
                )}
                <span>Due {dueInfo.label}</span>
              </div>
            )}

            {subtasks.length > 0 && (
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-medium text-[11px] text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800">
                <CheckSquare className="w-3 h-3 text-slate-400" />
                <span>
                  {completedSubtasksCount}/{subtasks.length} subtasks
                </span>
              </div>
            )}

            {attachmentsCount > 0 && (
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-medium text-[11px] text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800">
                <Paperclip className="w-3 h-3 text-slate-400" />
                <span>{attachmentsCount} file{attachmentsCount > 1 ? 's' : ''}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right section: Action Buttons */}
      <div className="flex items-center gap-1.5 self-end sm:self-center mt-3 sm:mt-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800 w-full sm:w-auto justify-end">
        {onEdit && (
          <button
            type="button"
            onClick={() => onEdit(task)}
            className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            title="Edit task"
          >
            <Edit3 className="w-4 h-4" />
          </button>
        )}

        {onDelete && (
          <button
            type="button"
            onClick={() => onDelete(task)}
            className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors"
            title="Delete task"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
