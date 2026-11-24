import os from 'os';
import Task from '../models/Task.js';
import Notification from '../models/Notification.js';
import SchedulerLock from '../models/SchedulerLock.js';
import { sendOtpEmail, notifyTask30MinWarningEmail, notifyTaskOverdueEmail } from './emailService.js';
import { makeTaskDueCall } from './telephonyService.js';
import { notifyAdmin30MinWarning, notifyAdminTaskOverdue, sendAdminWhatsAppMessage } from './whatsappService.js';

const instanceId = `${os.hostname()}_${process.pid}_${Math.random().toString(36).substring(2, 8)}`;

/**
 * Attempts to acquire an atomic distributed lock for the scheduler
 *
 * @param {string} lockName - Name of the scheduled job lock
 * @param {number} lockTtlMs - Lock duration in milliseconds (default: 4 minutes)
 * @returns {Promise<boolean>} - True if acquired, false if held by another replica
 */
export const acquireSchedulerLock = async (lockName = 'reminder_daemon', lockTtlMs = 50 * 1000) => {
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
    $and: [
      {
        $or: [
          { dueDate: { $ne: null, $lte: next24Hours } },
          { dueDateString: { $ne: null } }
        ]
      },
      {
        $or: [
          { remindedAt: null },
          { whatsapp30MinNotifiedAt: null },
          { whatsappDueNotifiedAt: null },
          { email30MinNotifiedAt: null },
          { emailDueNotifiedAt: null }
        ]
      }
    ]
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

      // Determine overdue status using both UTC timestamp and local calendar date/time
      let isOverdue = Boolean(task.dueDate && new Date(task.dueDate) < now);
      if (!isOverdue && task.dueDateString) {
        try {
          const tz = 'Asia/Kolkata';
          const todayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
          const todayStr = todayFormatter.format(now);
          if (task.dueDateString < todayStr) {
            isOverdue = true;
          } else if (task.dueDateString === todayStr && task.dueTime) {
            const timeFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
            const nowTimeStr = timeFormatter.format(now);
            if (task.dueTime <= nowTimeStr) {
              isOverdue = true;
            }
          }
        } catch {}
      }
      const alertType = isOverdue ? 'overdue' : 'due_soon';
      const alertTitle = isOverdue
        ? `Task Overdue: "${task.title}"`
        : `Task Due Soon: "${task.title}"`;

      const alertMessage = isOverdue
        ? `Task "${task.title}" was due on ${task.dueDateString || new Date(task.dueDate).toLocaleDateString()}. Please take action.`
        : `Task "${task.title}" is scheduled for completion within the next 24 hours.`;

      // 1. Create In-App Notification and dispatch initial email (only once per task)
      if (!task.remindedAt) {
        await Notification.create({
          user: recipientUser._id,
          organization: task.organization._id || task.organization,
          task: task._id,
          title: alertTitle,
          message: alertMessage,
          type: alertType
        });
        notificationsCreated++;

        // Dispatch Email Alert (Non-blocking)
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

        task.remindedAt = new Date();
      }

      // 2. Trigger Telephony Automated Phone Call alert if task due time is completed
      if (isOverdue) {
        await makeTaskDueCall({ user: recipientUser, task }).catch(() => {});
        // Dispatch WhatsApp notification to Admin & Assignee that task due time is completed and overdue
        if (!task.whatsappDueNotifiedAt) {
          await notifyAdminTaskOverdue(task, task.organization._id || task.organization).catch(() => {});
          if (recipientUser.phone) {
            const assigneeMsg = `🚨 *TaskMate URGENT: Task Due Time Completed!*\n\n` +
              `Hi ${recipientUser.name || 'there'}!\n` +
              `*Task:* ${task.title}\n` +
              `*Scheduled Due:* ${task.dueDateString || ''} ${task.dueTime || ''}\n` +
              `*Status:* NOT FINISHED\n\n` +
              `⚠️ The deadline for your assigned task has passed. Please complete or update status in TaskMate immediately.`;
            await sendAdminWhatsAppMessage({
              organizationId: task.organization._id || task.organization,
              eventType: 'task_overdue',
              message: assigneeMsg,
              task,
              recipientPhone: recipientUser.phone
            }).catch(() => {});
          }
          task.whatsappDueNotifiedAt = new Date();
        }
        // Dispatch Email notification that task due time is completed and overdue
        if (!task.emailDueNotifiedAt) {
          await notifyTaskOverdueEmail(task, task.organization._id || task.organization).catch(() => {});
          task.emailDueNotifiedAt = new Date();
        }
      }

      // 3. Dispatch WhatsApp and Email 30-minute warning if deadline is within next 45 minutes
      const timeDiffMinutes = (new Date(task.dueDate).getTime() - now.getTime()) / (60 * 1000);
      if (timeDiffMinutes > 0 && timeDiffMinutes <= 45) {
        if (!task.whatsapp30MinNotifiedAt) {
          await notifyAdmin30MinWarning(task, task.organization._id || task.organization).catch(() => {});
          if (recipientUser.phone) {
            const warningMsg = `⏰ *TaskMate Reminder: 30 Minutes Remaining!*\n\n` +
              `Hi ${recipientUser.name || 'there'}!\n` +
              `*Task:* ${task.title}\n` +
              `*Due in 30 minutes at:* ${task.dueTime || 'Upcoming'} today\n\n` +
              `⚠️ Please finish and submit your assigned task before the scheduled deadline.`;
            await sendAdminWhatsAppMessage({
              organizationId: task.organization._id || task.organization,
              eventType: 'task_due_soon_30m',
              message: warningMsg,
              task,
              recipientPhone: recipientUser.phone
            }).catch(() => {});
          }
          task.whatsapp30MinNotifiedAt = new Date();
        }
        if (!task.email30MinNotifiedAt) {
          await notifyTask30MinWarningEmail(task, task.organization._id || task.organization).catch(() => {});
          task.email30MinNotifiedAt = new Date();
        }
      }

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
 * @param {number} intervalMs - Interval between scans (default: 1 minute / 60s)
 * @returns {NodeJS.Timeout}
 */
export const startReminderDaemon = (intervalMs = 60 * 1000) => {
  console.log(`[ReminderDaemon] Background deadline scheduler initialized (interval: ${intervalMs / 1000}s, instance: ${instanceId})`);
  
  // Initial immediate background check (delayed by 2s to let DB connect cleanly)
  setTimeout(() => {
    scanAndDispatchReminders({ requireLock: false }).catch((err) => {
      console.warn('[ReminderDaemon] Error during initial reminder scan:', err.message);
    });
  }, 2000);

  // Recurring cron scan (every 60 seconds)
  return setInterval(() => {
    scanAndDispatchReminders({ requireLock: true }).catch((err) => {
      console.warn('[ReminderDaemon] Error during scheduled reminder scan:', err.message);
    });
  }, intervalMs);
};
