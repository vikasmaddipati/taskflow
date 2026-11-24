import nodemailer from 'nodemailer';
import Organization from '../models/Organization.js';
import User from '../models/User.js';

// In-memory store for automated test execution
export const devOtpStore = new Map();

// Custom transporter hook for test suites to inject mock or JSON transporters
let customTransporter = null;

export const setCustomTransporter = (transporter) => {
  customTransporter = transporter;
};

export const resetCustomTransporter = () => {
  customTransporter = null;
};

/**
 * Check if SMTP credentials are fully provided in environment
 */
export const isSmtpConfigured = () => {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  return Boolean(
    host &&
    user &&
    pass &&
    !host.includes('example.com') &&
    !user.includes('your_') &&
    !pass.includes('your_')
  );
};

/**
 * Creates and returns nodemailer transporter
 */
const getTransporter = () => {
  if (!isSmtpConfigured()) {
    return null;
  }

  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
  });
};

/**
 * Generic email dispatcher with mock mode fallback and standard layout
 */
export const sendEmail = async ({ to, subject, text, html, isMockMode = false }) => {
  const transporter = customTransporter || (isSmtpConfigured() ? getTransporter() : null);

  // If automated test environment simulation or mock mode is enabled
  if (!customTransporter && (process.env.NODE_ENV === 'test' || process.env.MOCK_EMAIL === 'true' || isMockMode || !isSmtpConfigured())) {
    console.log(`[EmailService:Mock] Simulated email to: ${to} | Subject: "${subject}"`);
    return {
      success: true,
      delivered: true,
      mode: 'mock_simulation',
      messageId: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    };
  }

  if (!transporter) {
    console.warn(`[EmailService] SMTP credentials not configured in server/.env. Unable to dispatch email to: ${to}`);
    return {
      success: false,
      delivered: false,
      error: 'SMTP_NOT_CONFIGURED',
      message: 'Email service is not configured on the server. Please set SMTP_HOST, SMTP_USER, and SMTP_PASS in server/.env.'
    };
  }

  try {
    const fromEmail = process.env.FROM_EMAIL || process.env.SMTP_USER;
    const fromName = process.env.FROM_NAME || 'TaskMate Notifications';

    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject,
      text,
      html
    });

    const accepted = Array.isArray(info.accepted) ? info.accepted.length > 0 : Boolean(info.messageId);

    if (!accepted) {
      console.error(`[EmailService] SMTP provider did not accept message for ${to}. Response: ${info.response || 'Rejected'}`);
      return {
        success: false,
        delivered: false,
        error: 'SMTP_REJECTED',
        message: 'The email provider did not accept the message for delivery.'
      };
    }

    console.log(`[EmailService] Email successfully delivered to ${to}. MessageId: ${info.messageId}`);
    return {
      success: true,
      delivered: true,
      messageId: info.messageId
    };
  } catch (err) {
    console.error(`[EmailService] SMTP sendMail error for ${to}: ${err.message}`);
    return {
      success: false,
      delivered: false,
      error: err.code || 'SEND_FAILED',
      message: `Failed to deliver email: ${err.message}`
    };
  }
};

/**
 * Standard TaskMate branded HTML email layout wrapper
 */
const buildHtmlLayout = ({ title, contentHtml, actionUrl = null, actionText = 'Open in TaskMate' }) => {
  const currentYear = new Date().getFullYear();
  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
          .container { max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
          .header { background: linear-gradient(135deg, #4f46e5 0%, #3730a3 100%); padding: 24px 32px; color: #ffffff; }
          .brand { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; margin: 0; }
          .brand-subtitle { font-size: 12px; color: #c7d2fe; margin-top: 4px; text-transform: uppercase; letter-spacing: 1px; }
          .body { padding: 32px; }
          .title { font-size: 19px; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 16px; }
          .text { font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 20px; }
          .card-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 20px 0; }
          .badge { display: inline-block; padding: 4px 10px; font-size: 11px; font-weight: 700; border-radius: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
          .badge-urgent { background: #fee2e2; color: #b91c1c; }
          .badge-high { background: #ffedd5; color: #c2410c; }
          .badge-medium { background: #fef3c7; color: #b45309; }
          .badge-low { background: #e0f2fe; color: #0369a1; }
          .grid-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px; }
          .grid-label { color: #64748b; font-weight: 500; }
          .grid-val { color: #0f172a; font-weight: 600; text-align: right; }
          .btn-container { text-align: center; margin: 30px 0 10px; }
          .btn { display: inline-block; background-color: #4f46e5; color: #ffffff !important; text-decoration: none; padding: 12px 28px; border-radius: 10px; font-weight: 600; font-size: 14px; box-shadow: 0 2px 4px rgba(79, 70, 229, 0.2); }
          .footer { font-size: 11px; color: #94a3b8; text-align: center; padding: 20px 32px; background: #f8fafc; border-top: 1px solid #f1f5f9; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 class="brand">TaskMate</h1>
            <div class="brand-subtitle">Workflow & Team Notifications</div>
          </div>
          <div class="body">
            <h2 class="title">${title}</h2>
            ${contentHtml}
            ${
              actionUrl
                ? `<div class="btn-container">
                    <a href="${actionUrl}" class="btn" target="_blank">${actionText} &rarr;</a>
                   </div>`
                : ''
            }
          </div>
          <div class="footer">
            &copy; ${currentYear} TaskMate SaaS. Automated workflow intelligence notification.<br/>
            You are receiving this notification according to your workspace settings.
          </div>
        </div>
      </body>
    </html>
  `;
};

/**
 * Send an OTP verification email
 */
export const sendOtpEmail = async ({ to, name, otp, purpose, expiresMinutes = 5, isMockMode = false }) => {
  const isReset = purpose === 'reset_password';
  const subject = isReset ? 'Your TaskMate Password Reset Code' : 'Your TaskMate Verification Code';
  const actionText = isReset ? 'reset your account password' : 'sign in to your TaskMate account';

  const plainText = `Hello ${name || 'there'},\n\nYour 6-digit verification code to ${actionText} is:\n\n${otp}\n\nThis code is valid for ${expiresMinutes} minutes and can only be used once.\n\nSECURITY WARNING: Never share this code with anyone.\n\nBest regards,\nThe TaskMate Team`;

  const contentHtml = `
    <p class="text">
      Hello ${name ? `<strong>${name}</strong>` : 'there'},<br/>
      Use the 6-digit verification code below to ${actionText}:
    </p>
    <div style="background: #f1f5f9; border: 2px dashed #cbd5e1; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0;">
      <span style="font-family: monospace, monospace; font-size: 36px; font-weight: 800; letter-spacing: 10px; color: #4f46e5;">${otp}</span>
    </div>
    <p class="text" style="font-size: 12px; color: #64748b;">
      This code will expire in <strong>${expiresMinutes} minutes</strong> and is single-use only.
    </p>
    <div style="font-size: 12px; color: #64748b; background: #fef2f2; border-left: 3px solid #ef4444; padding: 12px; border-radius: 6px; margin: 20px 0;">
      <strong>Security Notice:</strong> Never share this code with anyone. TaskMate team will never ask for your verification code.
    </div>
  `;

  const html = buildHtmlLayout({
    title: isReset ? 'Password Reset Verification' : 'Email Verification Code',
    contentHtml
  });

  if (!customTransporter && (process.env.MOCK_EMAIL === 'true' || isMockMode)) {
    devOtpStore.set(`${to.toLowerCase()}_${purpose}`, {
      otp,
      expiresAt: Date.now() + expiresMinutes * 60 * 1000
    });
    return {
      success: true,
      delivered: true,
      mode: 'mock_test',
      messageId: 'mock-test-id'
    };
  }

  return sendEmail({ to, subject, text: plainText, html, isMockMode });
};

/**
 * Send Task Assignment Email
 */
export const sendTaskAssignmentEmail = async ({
  to,
  recipientName,
  task,
  assignerName,
  workspaceName,
  isMockMode = false
}) => {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const actionUrl = `${clientUrl}/tasks`;
  const priority = task.priority || 'medium';
  const badgeClass =
    priority === 'urgent'
      ? 'badge-urgent'
      : priority === 'high'
      ? 'badge-high'
      : priority === 'medium'
      ? 'badge-medium'
      : 'badge-low';

  const subject = `[TaskMate] New Task Assigned: ${task.title}`;
  const plainText = `Hi ${recipientName || 'there'},\n\n${assignerName || 'A teammate'} has assigned a new task to you:\n\nTask: ${task.title}\nPriority: ${priority.toUpperCase()}\nDue Date: ${task.dueDateString || (task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'No date set')}\nDue Time: ${task.dueTime || 'Not specified'}\n\nView it here: ${actionUrl}\n\nTaskMate Notifications`;

  const contentHtml = `
    <p class="text">
      Hi <strong>${recipientName || 'there'}</strong>,<br/>
      <strong>${assignerName || 'A team manager'}</strong> has assigned a new task to you in <strong>${workspaceName || 'your workspace'}</strong>:
    </p>
    <div class="card-box">
      <div style="margin-bottom: 12px;">
        <span class="badge ${badgeClass}">${priority} priority</span>
      </div>
      <h3 style="margin: 0 0 8px 0; font-size: 16px; color: #0f172a;">${task.title}</h3>
      ${task.description ? `<p style="font-size: 13px; color: #475569; margin: 0 0 16px 0; line-height: 1.5;">${task.description}</p>` : ''}
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 12px 0;" />
      <div class="grid-row">
        <span class="grid-label">Due Date:</span>
        <span class="grid-val">${task.dueDateString || (task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'Flexible')}</span>
      </div>
      <div class="grid-row">
        <span class="grid-label">Due Time:</span>
        <span class="grid-val">${task.dueTime || 'End of Day'}</span>
      </div>
      <div class="grid-row">
        <span class="grid-label">Assigned By:</span>
        <span class="grid-val">${assignerName || 'Workspace Admin'}</span>
      </div>
    </div>
  `;

  const html = buildHtmlLayout({
    title: 'New Task Assignment',
    contentHtml,
    actionUrl,
    actionText: 'View Task in TaskMate'
  });

  return sendEmail({ to, subject, text: plainText, html, isMockMode });
};

/**
 * Send 30-Minute Deadline Reminder Email
 */
export const sendTaskReminderEmail = async ({
  to,
  recipientName,
  task,
  minutesLeft = 30,
  isMockMode = false
}) => {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const actionUrl = `${clientUrl}/tasks`;
  const subject = `⏰ [Reminder] 30 Minutes Left: ${task.title}`;
  const plainText = `Hi ${recipientName || 'there'},\n\nYour task "${task.title}" is due in approximately ${minutesLeft} minutes.\n\nDue Time: ${task.dueTime || 'Soon'}\nDue Date: ${task.dueDateString || (task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'Today')}\n\nPlease wrap up any remaining items.\n\nOpen Task: ${actionUrl}\n\nTaskMate Notifications`;

  const contentHtml = `
    <p class="text">
      Hi <strong>${recipientName || 'there'}</strong>,<br/>
      This is a quick notification that your task deadline is approaching within <strong>${minutesLeft} minutes</strong>:
    </p>
    <div class="card-box" style="border-left: 4px solid #f59e0b;">
      <h3 style="margin: 0 0 8px 0; font-size: 16px; color: #0f172a;">${task.title}</h3>
      <div class="grid-row" style="margin-top: 12px;">
        <span class="grid-label">Deadline Time:</span>
        <span class="grid-val" style="color: #d97706;">${task.dueTime || 'Approaching'}</span>
      </div>
      <div class="grid-row">
        <span class="grid-label">Due Date:</span>
        <span class="grid-val">${task.dueDateString || (task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'Today')}</span>
      </div>
    </div>
  `;

  const html = buildHtmlLayout({
    title: 'Task Deadline Approaching',
    contentHtml,
    actionUrl,
    actionText: 'Open & Complete Task'
  });

  return sendEmail({ to, subject, text: plainText, html, isMockMode });
};

/**
 * Send Overdue / Due Time Completed Email
 */
export const sendTaskOverdueEmail = async ({
  to,
  recipientName,
  task,
  isMockMode = false
}) => {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const actionUrl = `${clientUrl}/tasks`;
  const subject = `🚨 [Overdue Alert] Due Time Completed: ${task.title}`;
  const plainText = `Hello ${recipientName || 'there'},\n\nThe scheduled deadline for task "${task.title}" has completed without being marked finished.\n\nTarget Deadline: ${task.dueDateString || (task.dueDate ? new Date(task.dueDate).toLocaleDateString() : '')} ${task.dueTime || ''}\n\nPlease review and update status immediately.\n\nOpen Task: ${actionUrl}\n\nTaskMate System`;

  const contentHtml = `
    <p class="text">
      Hello <strong>${recipientName || 'there'}</strong>,<br/>
      The due date and time for the following task has <strong style="color: #ef4444;">completed</strong> and requires immediate review:
    </p>
    <div class="card-box" style="border-left: 4px solid #ef4444; background: #fff5f5;">
      <div style="margin-bottom: 8px;">
        <span class="badge badge-urgent">OVERDUE</span>
      </div>
      <h3 style="margin: 0 0 8px 0; font-size: 16px; color: #991b1b;">${task.title}</h3>
      <div class="grid-row" style="margin-top: 12px;">
        <span class="grid-label">Scheduled Due Time:</span>
        <span class="grid-val" style="color: #b91c1c;">${task.dueTime || 'Completed'} (${task.dueDateString || (task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'Today')})</span>
      </div>
      <div class="grid-row">
        <span class="grid-label">Current Status:</span>
        <span class="grid-val" style="text-transform: capitalize;">${task.status || 'Pending'}</span>
      </div>
    </div>
  `;

  const html = buildHtmlLayout({
    title: 'Task Overdue Notification',
    contentHtml,
    actionUrl,
    actionText: 'Review Overdue Task'
  });

  return sendEmail({ to, subject, text: plainText, html, isMockMode });
};

/**
 * Send Task Completed Notification Email to Admin / Assigner
 */
export const sendTaskCompletedEmail = async ({
  to,
  recipientName,
  task,
  completedByName,
  isMockMode = false
}) => {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const actionUrl = `${clientUrl}/tasks`;
  const subject = `✅ [Task Completed] ${task.title}`;
  const plainText = `Hi ${recipientName || 'Admin'},\n\nGood news! ${completedByName || 'A team member'} has finished the task "${task.title}".\n\nCompleted at: ${new Date().toLocaleTimeString()}\n\nView details: ${actionUrl}\n\nTaskMate System`;

  const contentHtml = `
    <p class="text">
      Hi <strong>${recipientName || 'Admin'}</strong>,<br/>
      Great progress! <strong>${completedByName || 'A team member'}</strong> has completed the following task:
    </p>
    <div class="card-box" style="border-left: 4px solid #10b981; background: #f0fdf4;">
      <h3 style="margin: 0 0 8px 0; font-size: 16px; color: #065f46;">${task.title}</h3>
      <div class="grid-row" style="margin-top: 12px;">
        <span class="grid-label">Completed By:</span>
        <span class="grid-val" style="color: #047857;">${completedByName || 'Team Member'}</span>
      </div>
      <div class="grid-row">
        <span class="grid-label">Completed At:</span>
        <span class="grid-val">${new Date().toLocaleTimeString()} (${new Date().toLocaleDateString()})</span>
      </div>
    </div>
  `;

  const html = buildHtmlLayout({
    title: 'Task Completed Successfully',
    contentHtml,
    actionUrl,
    actionText: 'View Completed Task'
  });

  return sendEmail({ to, subject, text: plainText, html, isMockMode });
};

/**
 * Send Test Email from Admin Dispatch Center
 */
export const sendTestEmail = async ({ to, name = 'Admin', isMockMode = false }) => {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const subject = 'TaskMate Email Dispatch Center - Test Successful';
  const plainText = `Hello ${name},\n\nThis is a test notification confirming that your TaskMate email delivery channel is active and successfully configured.\n\nYou will receive email alerts for:\n- Task assignments\n- 30-minute deadline warnings\n- Overdue alerts\n- Task completion verification\n\nTaskMate System`;

  const contentHtml = `
    <p class="text">
      Hello <strong>${name}</strong>,<br/>
      Your TaskMate automated email notification pipeline is <strong>active and operational</strong>.
    </p>
    <div class="card-box" style="border-left: 4px solid #4f46e5;">
      <h3 style="margin: 0 0 8px 0; font-size: 15px; color: #0f172a;">Active Notification Types:</h3>
      <ul style="margin: 8px 0 0 0; padding-left: 20px; font-size: 13px; color: #475569; line-height: 1.6;">
        <li>New task assignments with deadline details</li>
        <li>30-minute upcoming deadline warnings</li>
        <li>Overdue / due time completed alerts</li>
        <li>Task completion reports from team members</li>
      </ul>
      <div style="margin-top: 16px; font-size: 12px; color: #64748b;">
        Timestamp: <strong>${new Date().toLocaleString()}</strong>
      </div>
    </div>
  `;

  const html = buildHtmlLayout({
    title: 'Email Delivery Active',
    contentHtml,
    actionUrl: `${clientUrl}/admin`,
    actionText: 'Go to Admin Hub'
  });

  return sendEmail({ to, subject, text: plainText, html, isMockMode });
};

/**
 * Resolves all assigned team members for a task (primary assignee + all collaborators)
 */
export const resolveTaskAssignees = async (task) => {
  const users = [];
  const seenKeys = new Set();

  // 1. Primary assignee or task creator
  let primary = task.assignedTo || task.user;
  if (primary) {
    if (!primary.email && (primary._id || typeof primary === 'string')) {
      primary = await User.findById(primary._id || primary).select('name email emailAlertsEnabled');
    }
    if (primary && primary.email) {
      const key = primary.email.toLowerCase();
      seenKeys.add(key);
      users.push(primary);
    }
  }

  // 2. Collaborators / co-assigned team members
  if (Array.isArray(task.collaborators) && task.collaborators.length > 0) {
    for (let col of task.collaborators) {
      let colUser = col;
      if (!colUser.email && (colUser._id || typeof colUser === 'string')) {
        colUser = await User.findById(colUser._id || colUser).select('name email emailAlertsEnabled');
      }
      if (colUser && colUser.email) {
        const key = colUser.email.toLowerCase();
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          users.push(colUser);
        }
      }
    }
  }

  return users;
};

/**
 * Dispatch Email Alert when a task is assigned to team members
 */
export const notifyTaskAssignedEmail = async (task, orgId, assignerName = 'Admin') => {
  try {
    const org = await Organization.findById(orgId || task.organization).populate('owner', 'email name');
    if (!org) return;

    if (org.emailSettings && org.emailSettings.enabled === false) return;
    if (org.emailSettings && org.emailSettings.notifyOnTaskAssigned === false) return;

    // Resolve all assigned team members (primary assignee + collaborators)
    const assignees = await resolveTaskAssignees(task);

    // Dispatch personalized assignment email to every team member given this task
    for (const member of assignees) {
      if (member.email && member.emailAlertsEnabled !== false) {
        await sendTaskAssignmentEmail({
          to: member.email,
          recipientName: member.name,
          task,
          assignerName,
          workspaceName: org.name
        }).catch((err) => {
          console.warn(`[EmailService] Failed to send assignment email to ${member.email}:`, err.message);
        });
      }
    }

    // Also notify configured Admin Email if different from assigned members
    const adminEmail = org.emailSettings?.adminEmail || (org.owner?.emailAlertsEnabled !== false ? org.owner?.email : null);
    const isMemberAdmin = assignees.some((m) => m.email?.toLowerCase() === adminEmail?.toLowerCase());
    if (adminEmail && !isMemberAdmin) {
      await sendTaskAssignmentEmail({
        to: adminEmail,
        recipientName: org.owner?.name || 'Admin',
        task,
        assignerName,
        workspaceName: org.name
      }).catch((err) => {
        console.warn('[EmailService] Admin task assigned copy error:', err.message);
      });
    }
  } catch (err) {
    console.warn('[EmailService] notifyTaskAssignedEmail error:', err.message);
  }
};

/**
 * Dispatch Email Alert when a task is marked completed
 */
export const notifyTaskCompletedEmail = async (task, orgId, actorName = 'Team Member') => {
  try {
    const org = await Organization.findById(orgId || task.organization).populate('owner', 'email name');
    if (!org) return;

    if (org.emailSettings && org.emailSettings.enabled === false) return;
    if (org.emailSettings && org.emailSettings.notifyOnTaskCompleted === false) return;

    const adminEmail = org.emailSettings?.adminEmail || (org.owner?.emailAlertsEnabled !== false ? org.owner?.email : null);
    if (adminEmail) {
      await sendTaskCompletedEmail({
        to: adminEmail,
        recipientName: org.owner?.name || 'Admin',
        task,
        completedByName: actorName
      }).catch((err) => {
        console.warn('[EmailService] Task completed email error:', err.message);
      });
    }
  } catch (err) {
    console.warn('[EmailService] notifyTaskCompletedEmail error:', err.message);
  }
};

/**
 * Dispatch Email Alert 30 minutes before due time to all assigned team members & admin
 */
export const notifyTask30MinWarningEmail = async (task, orgId) => {
  try {
    const org = await Organization.findById(orgId || task.organization).populate('owner', 'email name');
    if (!org) return;

    if (org.emailSettings && org.emailSettings.enabled === false) return;
    if (org.emailSettings && org.emailSettings.notifyBefore30Min === false) return;

    const assignees = await resolveTaskAssignees(task);

    // Send 30-min reminder to every team member given the task
    for (const member of assignees) {
      if (member.email && member.emailAlertsEnabled !== false) {
        await sendTaskReminderEmail({
          to: member.email,
          recipientName: member.name,
          task,
          minutesLeft: 30
        }).catch(() => {});
      }
    }

    const adminEmail = org.emailSettings?.adminEmail || (org.owner?.emailAlertsEnabled !== false ? org.owner?.email : null);
    const isMemberAdmin = assignees.some((m) => m.email?.toLowerCase() === adminEmail?.toLowerCase());
    if (adminEmail && !isMemberAdmin) {
      await sendTaskReminderEmail({
        to: adminEmail,
        recipientName: org.owner?.name || 'Admin',
        task,
        minutesLeft: 30
      }).catch(() => {});
    }
  } catch (err) {
    console.warn('[EmailService] notifyTask30MinWarningEmail error:', err.message);
  }
};

/**
 * Dispatch Email Alert when task due time is completed / overdue to all assigned members & admin
 */
export const notifyTaskOverdueEmail = async (task, orgId) => {
  try {
    const org = await Organization.findById(orgId || task.organization).populate('owner', 'email name');
    if (!org) return;

    if (org.emailSettings && org.emailSettings.enabled === false) return;
    if (org.emailSettings && org.emailSettings.notifyOnOverdue === false) return;

    const assignees = await resolveTaskAssignees(task);

    // Send overdue notification to every team member assigned to this task
    for (const member of assignees) {
      if (member.email && member.emailAlertsEnabled !== false) {
        await sendTaskOverdueEmail({
          to: member.email,
          recipientName: member.name,
          task
        }).catch(() => {});
      }
    }

    const adminEmail = org.emailSettings?.adminEmail || (org.owner?.emailAlertsEnabled !== false ? org.owner?.email : null);
    const isMemberAdmin = assignees.some((m) => m.email?.toLowerCase() === adminEmail?.toLowerCase());
    if (adminEmail && !isMemberAdmin) {
      await sendTaskOverdueEmail({
        to: adminEmail,
        recipientName: org.owner?.name || 'Admin',
        task
      }).catch(() => {});
    }
  } catch (err) {
    console.warn('[EmailService] notifyTaskOverdueEmail error:', err.message);
  }
};
