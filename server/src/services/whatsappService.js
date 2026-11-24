import { broadcastTenantEvent } from './realtimeService.js';
import Organization from '../models/Organization.js';
import User from '../models/User.js';
import { getBaileysStatus, sendBaileysNotification, hasStoredBaileysCreds, connectBaileys } from './baileysService.js';

/**
 * WhatsApp Notification Service for TaskMate
 * Sends WhatsApp notification dispatches to the Admin / Task Organizer.
 * Supports Twilio WhatsApp API, Meta WhatsApp Cloud API, and real-time SSE stream dispatching.
 */

/**
 * Format international phone number for WhatsApp
 */
export const formatWhatsAppNumber = (phone) => {
  if (!phone) return null;
  let cleaned = phone.replace(/[^\d+]/g, '');
  if (!cleaned) return null;
  if (cleaned.startsWith('+')) {
    // If entered as +910..., strip the redundant 0
    if (cleaned.startsWith('+910') && cleaned.length === 14) {
      cleaned = '+91' + cleaned.slice(4);
    }
    return cleaned;
  }
  // Strip leading national trunk 0 (e.g. 09876543210 -> 9876543210)
  if (cleaned.startsWith('0') && cleaned.length === 11) {
    cleaned = cleaned.slice(1);
  }
  if (cleaned.length === 10) return `+91${cleaned}`; // Default to India (+91) if 10 digits
  return `+${cleaned}`;
};

/**
 * Core dispatch function to deliver a WhatsApp message to admin
 */
export const sendAdminWhatsAppMessage = async ({
  organizationId,
  eventType, // 'task_assigned' | 'task_completed' | 'task_due_soon_30m' | 'task_overdue' | 'test'
  message,
  task = null,
  recipientPhone = null
}) => {
  try {
    let targetPhone = recipientPhone;
    let org = null;

    const orgLookupId = organizationId?._id || organizationId;
    if (orgLookupId) {
      org = await Organization.findById(orgLookupId).populate('owner', 'phone name');
    }

    // Check organization settings if not a test event
    if (org && eventType !== 'test') {
      const ws = org.whatsappSettings;
      if (ws && ws.enabled === false) {
        console.log(`[WhatsApp Service] Skipping ${eventType}: WhatsApp alerts disabled for org "${org.name}"`);
        return { success: true, skipped: true, reason: 'WhatsApp alerts disabled for organization' };
      }
      if (eventType === 'task_assigned' && ws?.notifyOnTaskAssigned === false) {
        return { success: true, skipped: true, reason: 'Task assignment alerts disabled' };
      }
      if (eventType === 'task_completed' && ws?.notifyOnTaskCompleted === false) {
        return { success: true, skipped: true, reason: 'Task completion alerts disabled' };
      }
      if (eventType === 'task_due_soon_30m' && ws?.notifyBefore30Min === false) {
        return { success: true, skipped: true, reason: '30-minute warning alerts disabled' };
      }
      if (eventType === 'task_overdue' && ws?.notifyOnOverdue === false) {
        return { success: true, skipped: true, reason: 'Task overdue alerts disabled' };
      }
    }

    if (!targetPhone) {
      targetPhone = org?.whatsappSettings?.adminPhone || org?.owner?.phone;
    }

    const formattedPhone = formatWhatsAppNumber(targetPhone);

    const payload = {
      eventType,
      message,
      targetPhone: formattedPhone || 'Not Configured',
      task: task
        ? {
            id: task._id?.toString() || task.id,
            title: task.title,
            due: `${task.dueDateString || ''} ${task.dueTime || ''}`.trim(),
            status: task.status,
            priority: task.priority,
            assignee: task.assignedTo?.name || task.assignedTo || 'Unassigned'
          }
        : null,
      timestamp: new Date().toISOString()
    };

    console.log(`[WhatsApp Service] [${eventType}] Dispatching message to ${formattedPhone || 'in-app'}: "${message}"`);

    // 1. Dispatch real-time SSE event to all admins/owners in the tenant for instant live feed
    if (orgLookupId) {
      try {
        broadcastTenantEvent(orgLookupId.toString(), 'whatsapp.message_dispatched', payload);
      } catch (sseErr) {
        console.warn('[WhatsApp Service] SSE broadcast error:', sseErr.message);
      }
    }

    // 2. Innovatorssoft Baileys Direct WhatsApp Dispatch (if connected or has stored creds)
    let baileysStatus = getBaileysStatus();
    if (baileysStatus.status !== 'connected' && hasStoredBaileysCreds()) {
      try {
        console.log('[WhatsApp Service] Stored Baileys session exists. Auto-connecting socket...');
        await connectBaileys();
        for (let i = 0; i < 6; i++) {
          await new Promise((r) => setTimeout(r, 500));
          baileysStatus = getBaileysStatus();
          if (baileysStatus.status === 'connected') break;
        }
      } catch (connErr) {
        console.warn('[WhatsApp Service] Failed to auto-connect Baileys on demand:', connErr.message);
      }
    }

    if (baileysStatus.status === 'connected' && formattedPhone) {
      try {
        const baileysRes = await sendBaileysNotification(formattedPhone, message);
        if (baileysRes.success) {
          return {
            success: true,
            channel: 'baileys_whatsapp',
            messageId: baileysRes.messageId,
            targetPhone: formattedPhone
          };
        }
      } catch (baileysErr) {
        console.warn('[WhatsApp Service] Baileys dispatch failed, falling back:', baileysErr.message);
      }
    }

    // 3. Twilio WhatsApp Dispatch (if configured in environment)
    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioWhatsAppFrom = process.env.TWILIO_WHATSAPP_FROM || (process.env.TWILIO_PHONE_NUMBER ? `whatsapp:${process.env.TWILIO_PHONE_NUMBER}` : null);

    if (formattedPhone && twilioSid && twilioToken && twilioWhatsAppFrom) {
      try {
        const auth = Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64');
        const postData = new URLSearchParams({
          From: twilioWhatsAppFrom.startsWith('whatsapp:') ? twilioWhatsAppFrom : `whatsapp:${twilioWhatsAppFrom}`,
          To: `whatsapp:${formattedPhone}`,
          Body: message
        }).toString();

        const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: postData
        });

        const data = await response.json();
        console.log(`[WhatsApp Service] Twilio dispatch result:`, data.sid || data.message || 'Sent');
        return { success: true, channel: 'twilio_whatsapp', sid: data.sid, targetPhone: formattedPhone };
      } catch (err) {
        console.warn('[WhatsApp Service] Twilio API call failed:', err.message);
      }
    }

    // 3. Meta / WhatsApp Cloud API Dispatch (if configured in environment)
    const metaToken = process.env.WHATSAPP_CLOUD_API_TOKEN;
    const metaPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (formattedPhone && metaToken && metaPhoneId) {
      try {
        const cleanDigits = formattedPhone.replace('+', '');
        const response = await fetch(`https://graph.facebook.com/v19.0/${metaPhoneId}/messages`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${metaToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: cleanDigits,
            type: 'text',
            text: { body: message }
          })
        });
        const metaRes = await response.json();
        console.log(`[WhatsApp Service] Meta WhatsApp API result:`, metaRes);
        return { success: true, channel: 'meta_cloud_api', targetPhone: formattedPhone };
      } catch (err) {
        console.warn('[WhatsApp Service] Meta Cloud API call failed:', err.message);
      }
    }

    // Return success with in-app simulated delivery logged
    return {
      success: true,
      channel: 'simulated_and_sse',
      targetPhone: formattedPhone,
      message,
      deliveredAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('[WhatsApp Service Error]:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Notify Admin when a task is assigned to a team member
 */
export const notifyAdminTaskAssigned = async (task, orgId) => {
  const assigneeName = task.assignedTo?.name || 'A team member';
  const dueInfo = task.dueDateString
    ? `${task.dueDateString}${task.dueTime ? ' at ' + task.dueTime : ''}`
    : 'No due date';

  const message = `📋 *TaskMate Alert: Task Assigned*\n\n` +
    `*Task:* ${task.title}\n` +
    `*Assigned to:* ${assigneeName}\n` +
    `*Due:* ${dueInfo}\n` +
    `*Priority:* ${(task.priority || 'medium').toUpperCase()}\n\n` +
    `⚠️ The team member must complete this task before the due time.`;

  return await sendAdminWhatsAppMessage({
    organizationId: orgId || task.organization,
    eventType: 'task_assigned',
    message,
    task
  });
};

/**
 * Notify Admin when a task is completed or status changed
 */
export const notifyAdminTaskCompleted = async (task, orgId, actorName = 'Team Member') => {
  const isCompleted = task.status === 'completed';
  const dueInfo = task.dueDateString
    ? `${task.dueDateString}${task.dueTime ? ' at ' + task.dueTime : ''}`
    : 'N/A';

  const message = isCompleted
    ? `✅ *TaskMate Alert: Task Completed*\n\n` +
      `*Task:* ${task.title}\n` +
      `*Completed by:* ${actorName}\n` +
      `*Original Due:* ${dueInfo}\n` +
      `*Status:* COMPLETED\n\n` +
      `🎉 Task successfully finished on schedule.`
    : `🔄 *TaskMate Alert: Task Status Updated*\n\n` +
      `*Task:* ${task.title}\n` +
      `*Updated by:* ${actorName}\n` +
      `*New Status:* ${task.status.toUpperCase()}\n` +
      `*Due:* ${dueInfo}`;

  return await sendAdminWhatsAppMessage({
    organizationId: orgId || task.organization,
    eventType: 'task_completed',
    message,
    task
  });
};

/**
 * Notify Admin 30 minutes before task due time
 */
export const notifyAdmin30MinWarning = async (task, orgId) => {
  const assigneeName = task.assignedTo?.name || 'Unassigned';
  const timeStr = task.dueTime || 'Upcoming';

  const message = `⏰ *TaskMate Alert: 30 Minutes Remaining!*\n\n` +
    `*Task:* ${task.title}\n` +
    `*Assigned to:* ${assigneeName}\n` +
    `*Due in 30 minutes at:* ${timeStr} today\n` +
    `*Priority:* ${(task.priority || 'medium').toUpperCase()}\n\n` +
    `⚠️ Please follow up with the team member to ensure completion before the deadline.`;

  return await sendAdminWhatsAppMessage({
    organizationId: orgId || task.organization,
    eventType: 'task_due_soon_30m',
    message,
    task
  });
};

/**
 * Notify Admin when task deadline has expired and is overdue
 */
export const notifyAdminTaskOverdue = async (task, orgId) => {
  const assigneeName = task.assignedTo?.name || 'Unassigned';
  const dueInfo = task.dueDateString
    ? `${task.dueDateString}${task.dueTime ? ' at ' + task.dueTime : ''}`
    : 'Passed';

  const message = `🚨 *TaskMate URGENT: Task Due Time Completed!*\n\n` +
    `*Task:* ${task.title}\n` +
    `*Assigned to:* ${assigneeName}\n` +
    `*Scheduled Due:* ${dueInfo}\n` +
    `*Status:* ${task.status.toUpperCase()} (NOT FINISHED)\n\n` +
    `❌ The due time for this task has passed and it has NOT been completed.`;

  return await sendAdminWhatsAppMessage({
    organizationId: orgId || task.organization,
    eventType: 'task_overdue',
    message,
    task
  });
};
