import { useState, useEffect, useRef, useCallback } from 'react';
import alarmAudioService from '../services/alarmAudioService';
import voiceService from '../services/voiceService';

/**
 * Custom hook to monitor task due dates/times in real time and trigger audible alarms,
 * voice speech callouts, visual alarm modal, and browser notifications when a task's due time is reached.
 */
export const useTaskAlarmMonitor = ({ tasks = [], onCompleteTask = null, showToast = null }) => {
  const [activeAlarmTask, setActiveAlarmTask] = useState(null);
  const [isAlarmOpen, setIsAlarmOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

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

  // Dismiss / Silence active alarm
  const dismissAlarm = useCallback(() => {
    alarmAudioService.stopAlarm();
    voiceService.stopSpeaking();
    setIsAlarmOpen(false);
    setActiveAlarmTask(null);
  }, []);

  // Snooze active alarm for X minutes (default: 5 minutes)
  const snoozeAlarm = useCallback(
    (task, minutes = 5) => {
      if (!task?._id) return;
      alarmAudioService.stopAlarm();
      voiceService.stopSpeaking();
      setIsAlarmOpen(false);
      setActiveAlarmTask(null);

      const snoozeTime = Date.now() + minutes * 60 * 1000;
      alertedTasksRef.current.set(task._id, {
        alertedAt: Date.now(),
        snoozeUntil: snoozeTime
      });

      showToast?.({
        type: 'info',
        message: `Alarm for "${task.title}" snoozed for ${minutes} minutes.`
      });
    },
    [showToast]
  );

  // Mark task as completed directly from the alarm modal
  const completeAlarmTask = useCallback(
    async (task) => {
      if (!task?._id) return;
      alarmAudioService.stopAlarm();
      voiceService.stopSpeaking();
      setIsAlarmOpen(false);
      setActiveAlarmTask(null);

      // Play positive completion chime
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
        message: `Task "${task.title}" completed!`
      });
    },
    [onCompleteTask, showToast]
  );

  // Toggle mute state
  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (next) {
        alarmAudioService.stopAlarm();
      } else {
        alarmAudioService.startAlarm();
      }
      return next;
    });
  }, []);

  // Main evaluation engine
  const checkDueTasks = useCallback(() => {
    // If an alarm is already ringing in the modal, do not overwrite until handled
    if (isAlarmOpen) return;

    const now = Date.now();
    const currentTasks = tasksRef.current || [];

    for (const task of currentTasks) {
      if (!task || task.status === 'completed' || task.isDeleted) continue;

      // Determine due timestamp
      let dueTimestamp = null;

      if (task.dueDateString && task.dueTime) {
        // Precise date and time string e.g. "2026-11-13" and "14:30"
        const isoLocal = `${task.dueDateString}T${task.dueTime}:00`;
        const parsed = new Date(isoLocal);
        if (!isNaN(parsed.getTime())) {
          dueTimestamp = parsed.getTime();
        }
      } else if (task.dueDate) {
        const parsed = new Date(task.dueDate);
        if (!isNaN(parsed.getTime())) {
          dueTimestamp = parsed.getTime();
        }
      }

      if (!dueTimestamp) continue;

      // We trigger the alarm when the due time is reached or passed (within the last 2 hours to avoid alerting ancient tasks on initial login)
      const diff = now - dueTimestamp;
      const isDueTimeReached = diff >= 0 && diff <= 2 * 60 * 60 * 1000;

      if (isDueTimeReached) {
        const alertRecord = alertedTasksRef.current.get(task._id);

        if (alertRecord) {
          // If snoozed and snooze time has now passed
          if (alertRecord.snoozeUntil && now >= alertRecord.snoozeUntil) {
            // Re-trigger alarm!
          } else {
            // Already alerted and not snoozed
            continue;
          }
        }

        // Record that this task has triggered an alarm
        alertedTasksRef.current.set(task._id, {
          alertedAt: now
        });

        // 1. Open visual modal
        setActiveAlarmTask(task);
        setIsAlarmOpen(true);
        setIsMuted(false);

        // 2. Play audible alarm synthesizer
        alarmAudioService.startAlarm();

        // 3. Announce aloud via speech synthesis
        const voiceText = `Attention! The due time for task "${task.title}" is completed. Please review or complete this task.`;
        voiceService.speak(voiceText).catch(() => {});

        // 4. Fire Desktop System Notification if supported
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification(`Task Due Time Completed: ${task.title}`, {
              body: `The scheduled due time for "${task.title}" has arrived.`,
              icon: '/vite.svg',
              tag: `task-alarm-${task._id}`
            });
          } catch {
            // ignore
          }
        }

        // 5. In-app toast
        showToast?.({
          type: 'warning',
          message: `Due time reached for "${task.title}"!`
        });

        // Trigger one alarm at a time
        break;
      }
    }
  }, [isAlarmOpen, showToast]);

  // Periodic interval runner (runs every 4 seconds)
  useEffect(() => {
    const interval = setInterval(checkDueTasks, 4000);
    // Initial immediate check
    checkDueTasks();
    return () => clearInterval(interval);
  }, [checkDueTasks]);

  return {
    activeAlarmTask,
    isAlarmOpen,
    isMuted,
    dismissAlarm,
    snoozeAlarm,
    completeAlarmTask,
    toggleMute
  };
};

export default useTaskAlarmMonitor;
