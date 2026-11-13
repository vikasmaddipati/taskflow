import { useState, useEffect, useRef, useCallback } from 'react';
import alarmAudioService from '../services/alarmAudioService';
import voiceService from '../services/voiceService';
import api from '../services/api';

/**
 * Custom hook to monitor task due dates & times in real time.
 * Triggers an interactive incoming phone call screen, authentic telephone ringtones,
 * spoken voice bot callouts, and browser notifications when a task's due time is reached.
 */
export const useTaskAlarmMonitor = ({
  tasks = [],
  onCompleteTask = null,
  showToast = null,
  isAuthenticated = false
}) => {
  const [activeCallTask, setActiveCallTask] = useState(null);
  const [isCallOpen, setIsCallOpen] = useState(false);

  // Map of taskId -> { alertedAt: number, snoozeUntil?: number }
  const alertedTasksRef = useRef(new Map());
  const tasksRef = useRef(tasks);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  // Request browser desktop notification permission on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
    }
  }, []);

  // End / Decline Call
  const declineCall = useCallback(() => {
    alarmAudioService.stopAlarm();
    voiceService.stopSpeaking();
    setIsCallOpen(false);
    setActiveCallTask(null);
  }, []);

  // Snooze Call alert for X minutes (default: 5 minutes)
  const snoozeCall = useCallback(
    (task, minutes = 5) => {
      if (!task?._id) return;
      alarmAudioService.stopAlarm();
      voiceService.stopSpeaking();
      setIsCallOpen(false);
      setActiveCallTask(null);

      const snoozeTime = Date.now() + minutes * 60 * 1000;
      alertedTasksRef.current.set(task._id, {
        alertedAt: Date.now(),
        snoozeUntil: snoozeTime
      });

      showToast?.({
        type: 'info',
        message: `Phone call alert for "${task.title}" snoozed for ${minutes} minutes.`
      });
    },
    [showToast]
  );

  // Complete task from call
  const completeCallTask = useCallback(
    async (task) => {
      if (!task?._id) return;
      alarmAudioService.stopAlarm();
      voiceService.stopSpeaking();
      setIsCallOpen(false);
      setActiveCallTask(null);

      alarmAudioService.playCompletionChime();

      alertedTasksRef.current.set(task._id, {
        alertedAt: Date.now(),
        dismissed: true
      });

      if (onCompleteTask) {
        await onCompleteTask(task);
      }

      showToast?.({
        type: 'success',
        message: `Task "${task.title}" marked as completed!`
      });
    },
    [onCompleteTask, showToast]
  );

  // Trigger incoming phone call for a task
  const triggerIncomingCall = useCallback(
    (task) => {
      if (!task?._id) return;
      setActiveCallTask(task);
      setIsCallOpen(true);

      // Start authentic telephone ringtone
      alarmAudioService.startAlarm();

      // Fire desktop notification
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification(`Incoming Phone Call: ${task.title}`, {
            body: `Deadline reached for "${task.title}". Tap to view task.`,
            icon: '/vite.svg',
            tag: `task-call-${task._id}`
          });
        } catch {
          // ignore notification error
        }
      }

      showToast?.({
        type: 'warning',
        message: `Incoming Deadline Call: "${task.title}"`
      });
    },
    [showToast]
  );

  // Main task evaluation engine
  const checkDueTasks = useCallback(() => {
    if (isCallOpen) return;

    const now = Date.now();
    const currentTasks = tasksRef.current || [];

    for (const task of currentTasks) {
      if (!task || task.status === 'completed' || task.isDeleted) continue;

      let dueTimestamp = null;

      // 1. Precise local time evaluation
      if (task.dueDateString && task.dueTime) {
        const [y, m, d] = task.dueDateString.split('-').map(Number);
        const [h, min] = task.dueTime.split(':').map(Number);
        if (!isNaN(y) && !isNaN(m) && !isNaN(d) && !isNaN(h) && !isNaN(min)) {
          const localDate = new Date(y, m - 1, d, h, min, 0, 0);
          dueTimestamp = localDate.getTime();
        }
      } else if (task.dueDate) {
        const parsed = new Date(task.dueDate);
        if (!isNaN(parsed.getTime())) {
          dueTimestamp = parsed.getTime();
        }
      }

      if (!dueTimestamp) continue;

      // Check if due time has passed within the last 24 hours
      const diff = now - dueTimestamp;
      const isDueTimeCompleted = diff >= 0 && diff <= 24 * 60 * 60 * 1000;

      if (isDueTimeCompleted) {
        const alertRecord = alertedTasksRef.current.get(task._id);

        if (alertRecord) {
          if (alertRecord.snoozeUntil && now >= alertRecord.snoozeUntil) {
            // Snooze interval finished -> re-trigger call
          } else {
            // Already alerted
            continue;
          }
        }

        // Record alerted task
        alertedTasksRef.current.set(task._id, {
          alertedAt: now
        });

        triggerIncomingCall(task);
        break; // Trigger one call at a time
      }
    }
  }, [isCallOpen, triggerIncomingCall]);

  // Periodic interval runner (checks every 3 seconds)
  useEffect(() => {
    const interval = setInterval(checkDueTasks, 3000);
    checkDueTasks();
    return () => clearInterval(interval);
  }, [checkDueTasks]);

  // Periodic background task sync (refreshes tasks every 15 seconds)
  useEffect(() => {
    if (!isAuthenticated) return;
    const fetchInterval = setInterval(() => {
      api.get('/tasks?limit=100')
        .then((res) => {
          if (res.data?.success && Array.isArray(res.data.tasks || res.data.items)) {
            tasksRef.current = res.data.tasks || res.data.items;
          }
        })
        .catch(() => {});
    }, 15000);

    return () => clearInterval(fetchInterval);
  }, [isAuthenticated]);

  // Listen for real-time SSE phone call events
  useEffect(() => {
    const handleSseCall = (e) => {
      if (e.detail?.task) {
        triggerIncomingCall(e.detail.task);
      }
    };
    window.addEventListener('taskflow:phone_call', handleSseCall);
    return () => window.removeEventListener('taskflow:phone_call', handleSseCall);
  }, [triggerIncomingCall]);

  return {
    activeCallTask,
    isCallOpen,
    declineCall,
    snoozeCall,
    completeCallTask,
    triggerIncomingCall
  };
};

export default useTaskAlarmMonitor;
