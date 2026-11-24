import React, { useEffect, useState } from 'react';
import {
  BellRing,
  Clock,
  CheckCircle2,
  Volume2,
  VolumeX,
  X,
  RotateCcw,
  Sparkles
} from 'lucide-react';

export const TaskDueAlarmModal = ({
  task,
  isOpen,
  onDismiss,
  onComplete,
  onSnooze,
  onMuteToggle,
  isMuted = false
}) => {
  const [pulse, setPulse] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setPulse((p) => !p);
    }, 600);
    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen || !task) return null;

  const priorityStyles = {
    high: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300 dark:border-rose-800',
    medium: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 dark:border-amber-800',
    low: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
  };

  // Format due time display
  const formatTimeDisplay = () => {
    if (task.dueTime) {
      const [h, m] = task.dueTime.split(':').map(Number);
      if (!isNaN(h) && !isNaN(m)) {
        const period = h >= 12 ? 'PM' : 'AM';
        const displayHours = h % 12 || 12;
        return `${displayHours}:${String(m).padStart(2, '0')} ${period}`;
      }
      return task.dueTime;
    }
    return 'Deadline Reached';
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="alarm-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-white dark:bg-slate-900 border-2 border-rose-500/40 shadow-2xl shadow-rose-500/20">
        {/* Pulsing Top Emergency Ambient Bar */}
        <div className="h-2 w-full bg-gradient-to-r from-rose-500 via-amber-500 to-rose-500 animate-pulse" />

        {/* Header with Alarm Icon & Dismiss Button */}
        <div className="p-6 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3.5">
              {/* Glowing ringing alarm bell */}
              <div
                className={`relative flex items-center justify-center w-14 h-14 rounded-2xl transition-all duration-300 ${
                  pulse
                    ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/50 scale-105'
                    : 'bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 scale-95'
                }`}
              >
                <BellRing className={`w-7 h-7 ${pulse ? 'animate-bounce' : ''}`} />
                <span className="absolute -top-1 -right-1 flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-rose-600" />
                </span>
              </div>

              <div>
                <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 px-2.5 py-0.5 rounded-full border border-rose-200 dark:border-rose-900">
                  <Clock className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '6s' }} />
                  Due Time Completed
                </span>
                <h2
                  id="alarm-modal-title"
                  className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-1 leading-snug"
                >
                  Task Alarm Triggered!
                </h2>
              </div>
            </div>

            {/* Mute toggle button */}
            <button
              type="button"
              onClick={onMuteToggle}
              className={`p-2 rounded-xl border transition-all ${
                isMuted
                  ? 'border-slate-300 dark:border-slate-700 text-slate-400 hover:text-slate-600'
                  : 'border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100'
              }`}
              title={isMuted ? 'Unmute alarm sound' : 'Silence alarm sound'}
            >
              {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5 animate-pulse" />}
            </button>
          </div>

          {/* Task Card Box */}
          <div className="mt-5 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span
                className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border ${
                  priorityStyles[task.priority] || priorityStyles.medium
                }`}
              >
                {task.priority || 'Medium'} Priority
              </span>

              {task.category && (
                <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-700 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-600">
                  {task.category}
                </span>
              )}

              <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-md border border-rose-200 dark:border-rose-900 inline-flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Scheduled for: {formatTimeDisplay()}
              </span>
            </div>

            <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white break-words">
              {task.title}
            </h3>

            {task.description && (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                {task.description}
              </p>
            )}
          </div>

          {/* Voice and Audio status callout */}
          <div className="mt-4 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 bg-amber-500/10 dark:bg-amber-500/5 px-3 py-2 rounded-xl border border-amber-500/20">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
              <span>Voice announcement & audio chime active</span>
            </div>
            <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">Ringing</span>
          </div>

          {/* Action Buttons */}
          <div className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onDismiss}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors flex items-center justify-center gap-1.5"
            >
              <X className="w-4 h-4" />
              Dismiss Alarm
            </button>

            <button
              type="button"
              onClick={() => onSnooze(task)}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 transition-colors flex items-center justify-center gap-1.5"
            >
              <RotateCcw className="w-4 h-4" />
              Snooze (5 Mins)
            </button>

            <button
              type="button"
              onClick={() => onComplete(task)}
              className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 shadow-md shadow-emerald-600/30 transition-all flex items-center justify-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              Mark as Completed
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskDueAlarmModal;
