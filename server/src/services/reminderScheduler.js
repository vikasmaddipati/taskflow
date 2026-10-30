import os from 'os';
import Task from '../models/Task.js';
import Notification from '../models/Notification.js';
import SchedulerLock from '../models/SchedulerLock.js';
import { sendOtpEmail } from './emailService.js';

const instanceId = `${os.hostname()}_${process.pid}_${Math.random().toString(36).substring(2, 8)}`;

/**
 * Attempts to acquire an atomic distributed lock for the scheduler
 *
 * @param {string} lockName - Name of the scheduled job lock
 * @param {number} lockTtlMs - Lock duration in milliseconds (default: 4 minutes)
 * @returns {Promise<boolean>} - True if acquired, false if held by another replica
 */
export const acquireSchedulerLock = async (lockName = 'reminder_daemon', lockTtlMs = 4 * 60 * 1000) => {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + lockTtlMs);

  try {
    const lock = await SchedulerLock.findOneAndUpdate(
      {
        lockName,
        $or: [
          { expiresAt: { $lt: now } },
          { lockedBy: instanceId }
        ]
      },
      {
        lockName,
        lockedBy: instanceId,
        acquiredAt: now,
        expiresAt
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return lock && lock.lockedBy === instanceId;
  } catch (err) {
    // E11000 duplicate key error means another pod holds the active unexpired lock
    if (err.code === 11000) {
      return false;
    }
    console.warn('[SchedulerLock Warning] Error checking distributed lock:', err.message);
    return false;
  }
};

/**
 * Releases an atomic distributed lock
 *
 * @param {string} lockName - Name of the scheduled job lock
 */
export const releaseSchedulerLock = async (lockName = 'reminder_daemon') => {
  try {
    await SchedulerLock.deleteOne({ lockName, lockedBy: instanceId });
  } catch {
    // ignore release errors
  }
};

/**
 * Scan database for upcoming deadlines and overdue tasks, dispatching in-app
 * notifications and alert emails
 * @param {Object} [options]
 * @param {string} [options.organizationId] - Optional org scoping
 * @param {boolean} [options.requireLock] - Whether to require distributed cluster lock
 * @returns {Promise<{ scanned: number, remindersSent: number, notificationsCreated: number, notifiedCount: number }>}
 */
export const scanAndDispatchReminders = async (options = {}) => {
  if (options.requireLock) {
    const hasLock = await acquireSchedulerLock('reminder_daemon');
    if (!hasLock) {
      return {
        scanned: 0,
        notificationsCreated: 0,
        remindersSent: 0,
        notifiedCount: 0,
        skipped: true,
        reason: 'Lock held by another cluster instance'
      };
    }
  }

  const now = new Date();
  const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const query = {
    isDeleted: false,
    status: { $nin: ['completed'] },
    dueDate: { $ne: null, $lte: next24Hours },
    remindedAt: null
  };

  if (options.organizationId) {
    query.organization = options.organizationId;
  }

  try {
    const tasksToRemind = await Task.find(query)
      .populate('user', 'name email')
      .populate('assignedTo', 'name email')
      .populate('organization', 'name');

    let notificationsCreated = 0;
    let remindersSent = 0;

    for (const task of tasksToRemind) {
      const recipientUser = task.assignedTo || task.user;
      if (!recipientUser) continue;

      const isOverdue = new Date(task.dueDate) < now;
      const alertType = isOverdue ? 'overdue' : 'due_soon';
      const alertTitle = isOverdue
        ? `Task Overdue: "${task.title}"`
        : `Task Due Soon: "${task.title}"`;

      const alertMessage = isOverdue
        ? `Task "${task.title}" was due on ${task.dueDateString || new Date(task.dueDate).toLocaleDateString()}. Please take action.`
        : `Task "${task.title}" is scheduled for completion within the next 24 hours.`;

      // 1. Create In-App Notification
      await Notification.create({
        user: recipientUser._id,
        organization: task.organization._id || task.organization,
        task: task._id,
        title: alertTitle,
        message: alertMessage,
        type: alertType
      });
      notificationsCreated++;

      // 2. Dispatch Email Alert (Non-blocking)
      try {
        if (recipientUser.email) {
          await sendOtpEmail({
            to: recipientUser.email,
            name: recipientUser.name,
            otp: 'DEADLINE',
            purpose: 'login',
            isMockMode: true // uses mock/json transport in non-production environments
          }).catch(() => {});
          remindersSent++;
        }
      } catch {
        // ignore email dispatch errors during batch
      }

      // 3. Mark task as reminded
      task.remindedAt = new Date();
      await task.save({ validateBeforeSave: false });
    }

    return {
      scanned: tasksToRemind.length,
      notificationsCreated,
      remindersSent,
      notifiedCount: notificationsCreated
    };
  } finally {
    if (options.requireLock) {
      await releaseSchedulerLock('reminder_daemon');
    }
  }
};

/**
 * Starts periodic reminder scheduler daemon with distributed cluster locking
 * @param {number} intervalMs - Interval between scans (default: 5 minutes)
 * @returns {NodeJS.Timeout}
 */
export const startReminderDaemon = (intervalMs = 5 * 60 * 1000) => {
  console.log(`[ReminderDaemon] Background deadline scheduler initialized (interval: ${intervalMs / 1000}s, instance: ${instanceId})`);
  
  // Initial immediate background check (delayed by 10s to let DB connect cleanly)
  setTimeout(() => {
    scanAndDispatchReminders({ requireLock: true }).catch((err) => {
      console.warn('[ReminderDaemon] Error during initial reminder scan:', err.message);
    });
  }, 10000);

  // Recurring cron scan
  return setInterval(() => {
    scanAndDispatchReminders({ requireLock: true }).catch((err) => {
      console.warn('[ReminderDaemon] Error during scheduled reminder scan:', err.message);
    });
  }, intervalMs);
};
