import fs from 'fs';
import path from 'path';
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
import {
  getBaileysStatus,
  connectBaileys,
  disconnectBaileys
} from '../services/baileysService.js';
import { scanAndDispatchReminders } from '../services/reminderScheduler.js';
import { isSmtpConfigured, sendTestEmail, notifyTaskAssignedEmail } from '../services/emailService.js';
import { escapeRegex } from '../utils/validators.js';

/**
 * Admin Panel & Monitoring Controller
 * Provides complete enterprise oversight over tasks, assignees, deadlines, and WhatsApp alerts.
 */

// @desc    Get complete administrative overview of taskmate system
// @route   GET /api/v1/admin/overview
// @access  Private (Owner, Admin, Manager)
export const getAdminOverview = async (req, res, next) => {
  try {
    const orgId = req.organization._id;

    // Trigger immediate background reminder & overdue audit scan for this organization
    scanAndDispatchReminders({ organizationId: orgId, requireLock: false }).catch(() => {});

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
        },
        emailSettings: activeOrg?.emailSettings || {
          adminEmail: activeOrg?.owner?.email || null,
          enabled: true,
          notifyOnTaskAssigned: true,
          notifyOnTaskCompleted: true,
          notifyBefore30Min: true,
          notifyOnOverdue: true
        },
        smtpConfigured: isSmtpConfigured()
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
      const regex = new RegExp(escapeRegex(search.trim()), 'i');
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

    // Auto-save adminPhone and enable WhatsApp settings if provided in test
    if (phone && (!org.whatsappSettings?.adminPhone || !org.whatsappSettings?.enabled)) {
      org.whatsappSettings = {
        adminPhone: phone,
        enabled: true,
        notifyOnTaskAssigned: org.whatsappSettings?.notifyOnTaskAssigned ?? true,
        notifyOnTaskCompleted: org.whatsappSettings?.notifyOnTaskCompleted ?? true,
        notifyBefore30Min: org.whatsappSettings?.notifyBefore30Min ?? true,
        notifyOnOverdue: org.whatsappSettings?.notifyOnOverdue ?? true
      };
      await org.save();
    }

    const testMessage = `🤖 *TaskMate Admin Notification Connected!*\n\n` +
      `Hello ${req.user.name || 'Admin'}!\n` +
      `Your TaskMate monitoring channel is active and configured.\n\n` +
      `✅ *You will receive WhatsApp alerts for:*\n` +
      `• Task assignments to team members\n` +
      `• 30-minute deadline warnings\n` +
      `• Overdue / due time completed notifications\n` +
      `• Task completion verification from team members\n\n` +
      `Time: ${new Date().toLocaleTimeString()} (TaskMate System)`;

    const result = await sendAdminWhatsAppMessage({
      organizationId: orgId,
      eventType: 'test',
      message: testMessage,
      recipientPhone: targetPhone
    });

    const isLiveGateway = Boolean(
      result.channel === 'baileys_whatsapp' ||
      result.channel === 'twilio_whatsapp' ||
      result.channel === 'meta_cloud_api'
    );

    const feedbackMessage = isLiveGateway
      ? `Live WhatsApp message dispatched to ${targetPhone} via ${result.channel.replace(/_/g, ' ')}`
      : `Test message recorded in Live Feed. Note: To receive actual messages on your physical phone, link your WhatsApp account by scanning the QR code above, or configure Twilio/Meta API.`;

    res.status(200).json({
      success: true,
      isLiveGateway,
      channel: result.channel,
      message: feedbackMessage,
      result
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update Email configuration for organization
// @route   PUT /api/v1/admin/email-settings
// @access  Private (Owner, Admin)
export const updateEmailSettings = async (req, res, next) => {
  try {
    const orgId = req.organization._id;
    const {
      adminEmail,
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

    org.emailSettings = {
      adminEmail: adminEmail !== undefined ? adminEmail : org.emailSettings?.adminEmail,
      enabled: Boolean(enabled),
      notifyOnTaskAssigned: Boolean(notifyOnTaskAssigned),
      notifyOnTaskCompleted: Boolean(notifyOnTaskCompleted),
      notifyBefore30Min: Boolean(notifyBefore30Min),
      notifyOnOverdue: Boolean(notifyOnOverdue)
    };

    await org.save();

    res.status(200).json({
      success: true,
      message: 'Email notification settings saved successfully',
      emailSettings: org.emailSettings
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Send a live test email to the configured Admin email
// @route   POST /api/v1/admin/email-test
// @access  Private (Owner, Admin)
export const testEmailNotification = async (req, res, next) => {
  try {
    const orgId = req.organization._id;
    const { email } = req.body;

    const org = await Organization.findById(orgId).populate('owner', 'email name');
    const targetEmail = email || org.emailSettings?.adminEmail || org.owner?.email || req.user.email;

    if (!targetEmail) {
      return res.status(400).json({
        success: false,
        message: 'No admin email address configured. Please provide a valid email.'
      });
    }

    // Auto-save adminEmail and enable email settings if provided in test
    if (email && (!org.emailSettings?.adminEmail || !org.emailSettings?.enabled)) {
      org.emailSettings = {
        adminEmail: email,
        enabled: true,
        notifyOnTaskAssigned: org.emailSettings?.notifyOnTaskAssigned ?? true,
        notifyOnTaskCompleted: org.emailSettings?.notifyOnTaskCompleted ?? true,
        notifyBefore30Min: org.emailSettings?.notifyBefore30Min ?? true,
        notifyOnOverdue: org.emailSettings?.notifyOnOverdue ?? true
      };
      await org.save();
    }

    const result = await sendTestEmail({
      to: targetEmail,
      name: req.user.name || org.owner?.name || 'Admin'
    });

    const isLive = isSmtpConfigured() && result.success && result.mode !== 'mock_simulation';

    const feedbackMessage = isLive
      ? `Live verification email delivered to ${targetEmail} via configured SMTP provider.`
      : `Test email simulated successfully for ${targetEmail}. Note: To deliver live emails to actual inboxes, configure your SMTP_USER and SMTP_PASS in server/.env (e.g. Gmail App Password or Brevo/SendGrid).`;

    res.status(200).json({
      success: true,
      isLive,
      message: feedbackMessage,
      result
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Manually dispatch task assignment email to all assigned team members for a task
// @route   POST /api/v1/admin/tasks/:taskId/dispatch-email
// @access  Private (Owner, Admin, Manager)
export const dispatchTaskEmailToMembers = async (req, res, next) => {
  try {
    const orgId = req.organization._id;
    const { taskId } = req.params;

    const task = await Task.findOne({ _id: taskId, organization: orgId, isDeleted: false })
      .populate('assignedTo', 'name email avatar')
      .populate('collaborators', 'name email avatar')
      .populate('workspace', 'name');

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    if (!task.assignedTo && (!task.collaborators || task.collaborators.length === 0)) {
      return res.status(400).json({
        success: false,
        message: 'This task is not assigned to any team member yet.'
      });
    }

    await notifyTaskAssignedEmail(task, orgId, req.user.name || 'Admin');

    res.status(200).json({
      success: true,
      message: 'Assignment email dispatched to all assigned team members.'
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

// @desc    Get current Baileys WhatsApp connection status and QR code
// @route   GET /api/v1/admin/baileys/status
// @access  Private (Owner, Admin)
export const getBaileysConnectionStatus = async (req, res, next) => {
  try {
    const status = getBaileysStatus();
    res.status(200).json({
      success: true,
      ...status
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Initiate Baileys connection / refresh QR code
// @route   POST /api/v1/admin/baileys/connect
// @access  Private (Owner, Admin)
export const connectBaileysSocket = async (req, res, next) => {
  try {
    const status = await connectBaileys();
    res.status(200).json({
      success: true,
      message: 'Baileys connection process initialized',
      ...status
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Disconnect or unlink Baileys WhatsApp connection
// @route   POST /api/v1/admin/baileys/disconnect
// @access  Private (Owner, Admin)
export const disconnectBaileysSocket = async (req, res, next) => {
  try {
    const { logout } = req.body;
    const status = await disconnectBaileys(logout === true);
    res.status(200).json({
      success: true,
      message: logout ? 'WhatsApp device unlinked successfully' : 'WhatsApp connection paused',
      ...status
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Trigger Background Baileys NPM Packages Installation
// @route   POST /api/v1/admin/baileys/install
// @access  Private (Owner, Admin)
export const installBaileysPackages = async (req, res, next) => {
  try {
    const { exec } = await import('child_process');
    const logPath = path.resolve(process.cwd(), 'npm_install.log');
    const cpanelNpm = '/home/taskflow/nodevenv/taskflow/20/bin/npm';
    const cpanelLib = '/home/taskflow/nodevenv/taskflow/20/lib';

    let npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    let targetCwd = process.cwd();

    if (fs.existsSync(cpanelNpm)) {
      npmBin = cpanelNpm;
      if (fs.existsSync(cpanelLib)) {
        targetCwd = cpanelLib;
      }
    }

    const cmd = `"${npmBin}" install --ignore-engines --legacy-peer-deps --no-audit --no-fund --save @innovatorssoft/baileys qrcode pino > "${logPath}" 2>&1`;
    
    console.log('[Admin] Executing Baileys npm installation:', cmd);
    exec(cmd, { cwd: targetCwd });

    res.status(200).json({
      success: true,
      message: 'Baileys package installation triggered successfully.'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get NPM Install Log
// @route   GET /api/v1/admin/baileys/install-log
export const getBaileysInstallLog = async (req, res, next) => {
  try {
    const logPath = path.resolve(process.cwd(), 'npm_install.log');
    let logContent = 'No install log found yet.';
    if (fs.existsSync(logPath)) {
      logContent = fs.readFileSync(logPath, 'utf8');
    }
    res.status(200).json({ success: true, log: logContent });
  } catch (err) {
    next(err);
  }
};

// @desc    System Diagnostics & Host Environment Check (Admin Only)
// @route   GET /api/v1/admin/diagnostics
// @access  Private (Owner, Admin)
export const getSystemDiagnostics = async (req, res, next) => {
  try {
    const { execSync } = await import('child_process');
    let npmVersion = null;
    let nodeVersion = null;
    let npmPath = null;
    try {
      nodeVersion = execSync('node -v').toString().trim();
    } catch (e) {
      nodeVersion = e.message;
    }
    try {
      npmPath = execSync('which npm 2>/dev/null || where npm 2>nul || echo not_found').toString().trim();
    } catch (e) {
      npmPath = e.message;
    }
    try {
      npmVersion = execSync('npm -v 2>/dev/null || echo not_found').toString().trim();
    } catch (e) {
      npmVersion = e.message;
    }

    const nodeModulesPath = path.resolve(process.cwd(), 'node_modules');
    let installedModules = [];
    if (fs.existsSync(nodeModulesPath)) {
      installedModules = fs.readdirSync(nodeModulesPath);
    }

    let npmList = '';
    try {
      const cpanelNpm = '/home/taskflow/nodevenv/taskflow/20/bin/npm';
      const npmCmd = fs.existsSync(cpanelNpm) ? cpanelNpm : (process.platform === 'win32' ? 'npm.cmd' : 'npm');
      npmList = execSync(`"${npmCmd}" list --depth=0 2>&1`).toString().trim();
    } catch (e) {
      npmList = e.stdout ? e.stdout.toString() : e.message;
    }

    res.status(200).json({
      success: true,
      node: process.version,
      execPath: process.execPath,
      cwd: process.cwd(),
      nodeModulesPath,
      installedModulesCount: installedModules.length,
      hasBaileys: installedModules.includes('@whiskeysockets') || installedModules.includes('@innovatorssoft'),
      hasQrcode: installedModules.includes('qrcode'),
      hasPino: installedModules.includes('pino'),
      npmList: npmList.split('\n').slice(0, 20)
    });
  } catch (error) {
    next(error);
  }
};
