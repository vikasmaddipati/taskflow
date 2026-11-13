import { broadcastTenantEvent } from './realtimeService.js';

/**
 * Telephony & Automated Phone Call Service for TaskFlow
 * Provides automated phone call notifications when tasks reach their due date & time.
 * Supports Twilio Voice API for real phone calls, plus real-time in-app call dispatching.
 */

export const makeTaskDueCall = async ({ user, task }) => {
  if (!user || !task) return { success: false, reason: 'Missing user or task' };

  const phone = user.phone || null;
  const userName = user.name || 'User';
  const taskTitle = task.title || 'Untitled Task';

  console.log(`[Telephony] Triggering task due telephone alert for user "${userName}" on task "${taskTitle}"`);

  // 1. Dispatch real-time SSE event to trigger in-app incoming phone call screen
  try {
    if (task.organization) {
      const orgId = task.organization._id ? task.organization._id.toString() : task.organization.toString();
      broadcastTenantEvent(orgId, 'task.phone_call_triggered', {
        userId: user._id.toString(),
        task: {
          _id: task._id.toString(),
          title: task.title,
          description: task.description || '',
          priority: task.priority || 'medium',
          category: task.category || 'General',
          dueDateString: task.dueDateString,
          dueTime: task.dueTime
        },
        caller: 'TaskFlow Automated Calling System',
        timestamp: new Date().toISOString()
      });
    }
  } catch (err) {
    console.warn('[Telephony Warning] Failed to broadcast in-app phone call SSE:', err.message);
  }

  // 2. Real Outbound Twilio Telephony Call (if configured in environment)
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioNumber = process.env.TWILIO_PHONE_NUMBER;

  if (phone && twilioSid && twilioToken && twilioNumber) {
    try {
      const twiml = `
        <Response>
          <Pause length="1"/>
          <Say voice="alice" language="en-US">
            Hello ${userName}. This is an urgent telephone call from TaskFlow. 
            The scheduled due date and time for your task: ${taskTitle} has completed. 
            Please log into TaskFlow to complete or reschedule this task. 
            Thank you, and have a productive day!
          </Say>
          <Pause length="1"/>
        </Response>
      `.trim();

      const params = new URLSearchParams();
      params.append('To', phone);
      params.append('From', twilioNumber);
      params.append('Twiml', twiml);

      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Calls.json`;
      const authHeader = `Basic ${Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64')}`;

      const res = await fetch(twilioUrl, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        console.log(`[Telephony] Live outbound call placed via Twilio SID: ${data.sid}`);
        return { success: true, mode: 'twilio', callSid: data.sid };
      } else {
        console.warn('[Telephony Warning] Twilio API call failed:', data.message || res.statusText);
        return { success: false, mode: 'twilio_error', error: data.message };
      }
    } catch (err) {
      console.warn('[Telephony Error] Exception placing Twilio call:', err.message);
      return { success: false, mode: 'error', error: err.message };
    }
  }

  // Fallback: Telephony simulation mode (ready for Twilio keys)
  return {
    success: true,
    mode: 'in_app_call',
    simulated: true,
    phone: phone || 'Not configured in profile',
    message: 'In-app incoming call triggered and dispatched to client'
  };
};

export default {
  makeTaskDueCall
};
