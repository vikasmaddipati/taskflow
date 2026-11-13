import Task from '../models/Task.js';
import Organization from '../models/Organization.js';
import Membership from '../models/Membership.js';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';
import {
  sendAdminWhatsAppMessage,
  notifyAdminTaskAssigned,
  notifyAdminTaskCompleted,
  notifyAdmin30MinWarning,
  notifyAdminTaskOverdue
} from '../services/whatsappService.js';
import { scanAndDispatchReminders } from '../services/reminderScheduler.js';

/**
 * Admin Panel & Monitoring Controller
 * Provides complete enterprise oversight over tasks, assignees, deadlines, and WhatsApp alerts.
 */

// @desc    Get complete administrative overview of taskflow system
// @route   GET /api/v1/admin/overview
// @access  Private (Owner, Admin, Manager)
export const getAdminOverview = async (req, res, next) => {
  try {
    const orgId = req.organization._id;

    // Fetch counts and metrics across entire organization
    const [
      totalTasks,
      completedTasks,
      pendingTasks,
      inProgressTasks,
      reviewTasks,
      overdueTasks,
      totalMembers,
      membersList,
      recentAuditLogs,
      activeOrg
    ] = await Promise.all([
      Task.countDocuments({ organization: orgId, isDeleted: false }),
      Task.countDocuments({ organization: orgId, isDeleted: false, status: 'completed' }),
      Task.countDocuments({ organization: orgId, isDeleted: false, status: 'pending' }),
      Task.countDocuments({ organization: orgId, isDeleted: false, status: 'in_progress' }),
      Task.countDocuments({ organization: orgId, isDeleted: false, status: 'review' }),
      Task.countDocuments({
        organization: orgId,
        isDeleted: false,
        status: { $ne: 'completed' },
        dueDate: { $ne: null, $lt: new Date() }
      }),
      Membership.countDocuments({ organization: orgId }),
      Membership.find({ organization: orgId })
        .populate('user', 'name email phone avatar')
        .lean(),
      AuditLog.find({ organization: orgId })
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('actor', 'name email')
        .lean(),
      Organization.findById(orgId).populate('owner', 'name email phone')
    ]);

    // Member workload breakdown
    const memberStats = await Task.aggregate([
      { $match: { organization: orgId, isDeleted: false, assignedTo: { $ne: null } } },
      {
        $group: {
          _id: '$assignedTo',
          total: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          },
          pending: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
          },
          inProgress: {
            $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] }
          }
        }
      }
    ]);

    const memberWorkload = membersList.map((m) => {
      const uId = m.user?._id?.toString();
      const stats = memberStats.find((s) => s._id?.toString() === uId) || {
        total: 0,
        completed: 0,
        pending: 0,
        inProgress: 0
      };
      return {
        userId: uId,
        name: m.user?.name || 'Unnamed',
        email: m.user?.email || '',
        phone: m.user?.phone || null,
        role: m.role,
        assignedTasks: stats.total,
        completedTasks: stats.completed,
        pendingTasks: stats.pending,
        inProgressTasks: stats.inProgress,
        completionRate: stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0
      };
    });

    const completionRate =
      totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    res.status(200).json({
      success: true,
      data: {
        metrics: {
          totalTasks,
          completedTasks,
          pendingTasks,
          inProgressTasks,
          reviewTasks,
          overdueTasks,
          totalMembers,
          completionRate
        },
        memberWorkload,
        recentActivity: recentAuditLogs,
        whatsappSettings: activeOrg?.whatsappSettings || {
          adminPhone: activeOrg?.owner?.phone || null,
          enabled: false,
          notifyOnTaskAssigned: true,
          notifyOnTaskCompleted: true,
          notifyBefore30Min: true,
          notifyOnOverdue: true
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all organization tasks with deep admin monitoring filters
// @route   GET /api/v1/admin/tasks
// @access  Private (Owner, Admin, Manager)
export const getAdminTasks = async (req, res, next) => {
  try {
    const orgId = req.organization._id;
    const { status, assignedTo, priority, overdue, search, page = 1, limit = 50 } = req.query;

    const query = {
      organization: orgId,
      isDeleted: false
    };

    if (status && status !== 'all') {
      query.status = status;
    }

    if (assignedTo && assignedTo !== 'all') {
      if (assignedTo === 'unassigned') {
        query.assignedTo = null;
      } else {
        query.assignedTo = assignedTo;
      }
    }

    if (priority && priority !== 'all') {
      query.priority = priority;
    }

    if (overdue === 'true') {
      query.dueDate = { $ne: null, $lt: new Date() };
      query.status = { $ne: 'completed' };
    }

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [{ title: regex }, { description: regex }, { category: regex }];
    }

    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (parsedPage - 1) * parsedLimit;

    const [total, tasks] = await Promise.all([
      Task.countDocuments(query),
      Task.find(query)
        .sort({ dueDate: 1, createdAt: -1 })
        .skip(skip)
        .limit(parsedLimit)
        .populate('assignedTo', 'name email phone avatar')
        .populate('user', 'name email')
        .populate('workspace', 'name')
        .lean()
    ]);

    res.status(200).json({
      success: true,
      count: tasks.length,
      total,
      page: parsedPage,
      totalPages: Math.ceil(total / parsedLimit),
      tasks
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update WhatsApp configuration for organization
// @route   PUT /api/v1/admin/whatsapp-settings
// @access  Private (Owner, Admin)
export const updateWhatsAppSettings = async (req, res, next) => {
  try {
    const orgId = req.organization._id;
    const {
      adminPhone,
      enabled = true,
      notifyOnTaskAssigned = true,
      notifyOnTaskCompleted = true,
      notifyBefore30Min = true,
      notifyOnOverdue = true
    } = req.body;

    const org = await Organization.findById(orgId);
    if (!org) {
      return res.status(404).json({ success: false, message: 'Organization not found' });
    }

    org.whatsappSettings = {
      adminPhone: adminPhone !== undefined ? adminPhone : org.whatsappSettings?.adminPhone,
      enabled: Boolean(enabled),
      notifyOnTaskAssigned: Boolean(notifyOnTaskAssigned),
      notifyOnTaskCompleted: Boolean(notifyOnTaskCompleted),
      notifyBefore30Min: Boolean(notifyBefore30Min),
      notifyOnOverdue: Boolean(notifyOnOverdue)
    };

    await org.save();

    res.status(200).json({
      success: true,
      message: 'WhatsApp notification settings saved successfully',
      whatsappSettings: org.whatsappSettings
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Send a live test message to the configured Admin WhatsApp number
// @route   POST /api/v1/admin/whatsapp-test
// @access  Private (Owner, Admin)
export const testWhatsAppNotification = async (req, res, next) => {
  try {
    const orgId = req.organization._id;
    const { phone } = req.body;

    const org = await Organization.findById(orgId).populate('owner', 'phone name');
    const targetPhone = phone || org.whatsappSettings?.adminPhone || org.owner?.phone || req.user.phone;

    if (!targetPhone) {
      return res.status(400).json({
        success: false,
        message: 'No admin WhatsApp phone number configured. Please enter a valid number.'
      });
    }

    const testMessage = `🤖 *TaskFlow Admin Notification Connected!*\n\n` +
      `Hello ${req.user.name || 'Admin'}!\n` +
      `Your TaskFlow monitoring channel is active and configured.\n\n` +
      `✅ *You will receive WhatsApp alerts for:*\n` +
      `• Task assignments to team members\n` +
      `• 30-minute deadline warnings\n` +
      `• Overdue / due time completed notifications\n` +
      `• Task completion verification from team members\n\n` +
      `Time: ${new Date().toLocaleTimeString()} (TaskFlow System)`;

    const result = await sendAdminWhatsAppMessage({
      organizationId: orgId,
      eventType: 'test',
      message: testMessage,
      recipientPhone: targetPhone
    });

    res.status(200).json({
      success: true,
      message: `Test WhatsApp message sent to ${targetPhone}`,
      result
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Manually trigger deadline & 30-min WhatsApp scheduler audit scan
// @route   POST /api/v1/admin/run-scheduler-scan
// @access  Private (Owner, Admin)
export const triggerSchedulerScan = async (req, res, next) => {
  try {
    const result = await scanAndDispatchReminders({ organizationId: req.organization._id });
    res.status(200).json({
      success: true,
      message: 'Deadline and WhatsApp monitoring scan completed',
      result
    });
  } catch (error) {
    next(error);
  }
};
