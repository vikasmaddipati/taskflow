import React from 'react';
import {
  Check,
  Calendar,
  Tag,
  Clock,
  Edit3,
  Trash2,
  AlertCircle,
  RotateCcw
} from 'lucide-react';

export const TaskItem = ({
  task,
  onToggleStatus,
  onEdit,
  onDelete
}) => {
  const isCompleted = task.status === 'completed';

  // Format and evaluate due date
  const getDueDateInfo = (dateString) => {
    if (!dateString) return null;
    const due = new Date(dateString);
    const now = new Date();

    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
    const endOfTomorrow = new Date(startOfTomorrow);
    endOfTomorrow.setHours(23, 59, 59, 999);

    const isOverdue = due < startOfToday && !isCompleted;
    const isDueToday = due >= startOfToday && due <= endOfToday;
    const isDueTomorrow = due >= startOfTomorrow && due <= endOfTomorrow;

    let label = due.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: due.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });

    if (isDueToday) label = 'Today';
    else if (isDueTomorrow) label = 'Tomorrow';

    return {
      label,
      isOverdue,
      isDueToday
    };
  };

  const dueInfo = getDueDateInfo(task.dueDate);

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
      <div className="flex items-start gap-3.5 flex-1 min-w-0 w-full sm:w-auto">
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
              className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md border ${
                priorityStyles[task.priority] || priorityStyles.medium
              }`}
            >
              {task.priority}
            </span>

            {/* Category Badge */}
            {task.category && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                <Tag className="w-2.5 h-2.5 text-slate-400" />
                {task.category}
              </span>
            )}
          </div>

          {/* Description */}
          {task.description && (
            <p
              className={`mt-1 text-xs line-clamp-2 leading-relaxed ${
                isCompleted
                  ? 'text-slate-400 dark:text-slate-600'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {task.description}
            </p>
          )}

          {/* Metadata Footer: Due Date, Overdue Alert, Created At */}
          <div className="mt-2.5 flex items-center gap-3 text-[11px] text-slate-400 dark:text-slate-500 flex-wrap">
            {dueInfo && (
              <div
                className={`inline-flex items-center gap-1 font-medium ${
                  dueInfo.isOverdue
                    ? 'text-rose-600 dark:text-rose-400'
                    : dueInfo.isDueToday
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {dueInfo.isOverdue ? (
                  <AlertCircle className="w-3.5 h-3.5" />
                ) : (
                  <Calendar className="w-3.5 h-3.5" />
                )}
                <span>
                  {dueInfo.isOverdue ? `Overdue (${dueInfo.label})` : `Due ${dueInfo.label}`}
                </span>
              </div>
            )}

            <div className="inline-flex items-center gap-1 text-slate-400">
              <Clock className="w-3 h-3" />
              <span>
                {new Date(task.createdAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric'
                })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Right section: Action Buttons */}
      <div className="flex items-center gap-1.5 mt-3 sm:mt-0 self-end sm:self-center shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 w-full sm:w-auto justify-end">
        {isCompleted ? (
          <button
            type="button"
            onClick={() => onToggleStatus(task._id)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-colors"
            title="Reopen task"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reopen</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onEdit(task)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-800 transition-colors"
            title="Edit task"
          >
            <Edit3 className="w-4 h-4" />
          </button>
        )}

        {/* Edit also available if completed */}
        {isCompleted && (
          <button
            type="button"
            onClick={() => onEdit(task)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-800 transition-colors"
            title="Edit task"
          >
            <Edit3 className="w-4 h-4" />
          </button>
        )}

        <button
          type="button"
          onClick={() => onDelete(task)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-800 transition-colors"
          title="Delete task"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
