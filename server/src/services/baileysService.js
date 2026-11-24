import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Task from '../models/Task.js';
import User from '../models/User.js';
import Organization from '../models/Organization.js';
import { broadcastTenantEvent } from './realtimeService.js';

let makeWASocket = null;
let useMultiFileAuthState = null;
let DisconnectReason = null;
let pino = null;
let QRCode = null;
let modulesLoaded = false;
let moduleLoadAttempted = false;

/**
 * Dynamically load Baileys modules with graceful fallback if not yet installed in host environment
 */
let lastLoadError = null;

export const loadBaileysModules = async () => {
  if (modulesLoaded) return true;

  try {
    let baileysPkg = null;
    let bError = null;
    try {
      baileysPkg = await import('@whiskeysockets/baileys');
    } catch (e1) {
      bError = e1.message;
      try {
        baileysPkg = await import('@innovatorssoft/baileys');
      } catch (e2) {
        bError += ' | ' + e2.message;
        try {
          baileysPkg = await import('baileys');
        } catch (e3) {
          bError += ' | ' + e3.message;
        }
      }
    }

    if (!baileysPkg) {
      lastLoadError = 'Failed to load baileys: ' + bError;
      return false;
    }

    makeWASocket = baileysPkg.makeWASocket || baileysPkg.default?.makeWASocket;
    useMultiFileAuthState = baileysPkg.useMultiFileAuthState || baileysPkg.default?.useMultiFileAuthState;
    DisconnectReason = baileysPkg.DisconnectReason || baileysPkg.default?.DisconnectReason;

    try {
      const pinoPkg = await import('pino');
      pino = pinoPkg.default || pinoPkg;
    } catch {
      pino = () => ({
        level: 'silent',
        child: () => ({ info: () => {}, error: () => {}, warn: () => {}, debug: () => {}, trace: () => {} }),
        info: () => {},
        error: () => {},
        warn: () => {},
        debug: () => {},
        trace: () => {}
      });
    }

    try {
      const qrPkg = await import('qrcode');
      QRCode = qrPkg.default || qrPkg;
    } catch (qrErr) {
      lastLoadError = 'Failed to load qrcode: ' + qrErr.message;
      return false;
    }

    if (makeWASocket && useMultiFileAuthState && QRCode) {
      modulesLoaded = true;
      return true;
    }
    lastLoadError = 'makeWASocket or useMultiFileAuthState missing from package';
    return false;
  } catch (err) {
    lastLoadError = err.message;
    console.warn('[Baileys] Optional Baileys dependencies not available:', err.message);
    modulesLoaded = false;
    return false;
  }
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AUTH_DIR = path.resolve(__dirname, '../../data/baileys_auth');

// In-memory Baileys state
let sock = null;
let connectionStatus = 'disconnected'; // 'disconnected' | 'connecting' | 'qr_ready' | 'connected'
let currentQrCode = null;
let currentQrDataUrl = null;
let connectedUser = null;
let reconnectTimer = null;
let isInitializing = false;
let isManualDisconnect = false;

// Ensure auth directory exists
if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

/**
 * Check if active authentication credentials exist in data/baileys_auth
 */
export const hasStoredBaileysCreds = () => {
  try {
    const credsPath = path.join(AUTH_DIR, 'creds.json');
    return fs.existsSync(credsPath);
  } catch {
    return false;
  }
};

let recentEvents = [];

const logBaileysEvent = (msg) => {
  const entry = `[${new Date().toISOString()}] ${msg}`;
  console.log('[Baileys]', msg);
  recentEvents.unshift(entry);
  if (recentEvents.length > 20) recentEvents.pop();
};

/**
 * Format raw phone number into a valid WhatsApp JID
 */
export const formatJID = (phone) => {
  if (!phone) return null;
  let cleaned = phone.replace(/[^\d]/g, '');
  if (!cleaned) return null;
  // If 11 digits starting with 0 (national trunk prefix, e.g. in India/UK), strip the 0
  if (cleaned.startsWith('0') && cleaned.length === 11) {
    cleaned = cleaned.slice(1);
  }
  // If 10 digits without country code, default to India (+91)
  const fullPhone = cleaned.length === 10 ? `91${cleaned}` : cleaned;
  return `${fullPhone}@s.whatsapp.net`;
};

/**
 * Get current Baileys connection status & QR code for frontend
 */
export const getBaileysStatus = () => {
  return {
    status: connectionStatus,
    qrCodeDataUrl: currentQrDataUrl,
    connectedUser: connectedUser ? {
      id: connectedUser.id,
      phone: connectedUser.id?.split(':')[0]?.split('@')[0],
      name: connectedUser.name || 'Admin'
    } : null,
    isLinked: connectionStatus === 'connected',
    isSupported: modulesLoaded,
    recentEvents: recentEvents.slice(0, 10)
  };
};

/**
 * Initialize Baileys socket connection and attach event handlers
 */
export const connectBaileys = async () => {
  if (sock && (connectionStatus === 'connected' || connectionStatus === 'connecting')) {
    return getBaileysStatus();
  }

  if (isInitializing) {
    return getBaileysStatus();
  }

  isInitializing = true;
  isManualDisconnect = false;
  connectionStatus = 'connecting';

  try {
    const isAvailable = await loadBaileysModules();
    if (!isAvailable) {
      connectionStatus = 'unsupported';
      isInitializing = false;
      return {
        status: 'unsupported',
        message: 'Baileys WhatsApp module is not installed on this server. Standard WhatsApp alerts remain fully active via your configured phone number.',
        details: lastLoadError,
        isLinked: false,
        isSupported: false
      };
    }

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    const logger = pino({ level: 'silent' });

    sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger,
      browser: ['TaskMate Admin Hub', 'Chrome', '1.0.0']
    });

    // Save credentials whenever updated
    sock.ev.on('creds.update', saveCreds);

    // Connection lifecycle updates
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      logBaileysEvent(`connection.update: connection=${connection || 'none'}, qr=${Boolean(qr)}, code=${lastDisconnect?.error?.output?.statusCode || 'none'}`);

      if (qr) {
        currentQrCode = qr;
        try {
          currentQrDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 6 });
          connectionStatus = 'qr_ready';
          logBaileysEvent('New WhatsApp Web QR code generated.');
        } catch (qrErr) {
          logBaileysEvent('Error generating QR data URL: ' + qrErr.message);
        }
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;
        const shouldReconnect = !isManualDisconnect && !isLoggedOut;
        logBaileysEvent(`Connection closed (code: ${statusCode}). Reconnecting: ${shouldReconnect}`);

        connectionStatus = 'disconnected';
        currentQrCode = null;
        currentQrDataUrl = null;
        connectedUser = null;

        if (isLoggedOut) {
          logBaileysEvent('Device logged out. Clearing stored credentials.');
          try {
            if (fs.existsSync(AUTH_DIR)) {
              fs.rmSync(AUTH_DIR, { recursive: true, force: true });
              fs.mkdirSync(AUTH_DIR, { recursive: true });
            }
          } catch (rmErr) {
            logBaileysEvent('Error clearing auth directory: ' + rmErr.message);
          }
        } else if (shouldReconnect) {
          clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(() => {
            logBaileysEvent('Executing automatic reconnect attempt...');
            connectBaileys();
          }, 4000);
        }
      } else if (connection === 'open') {
        connectionStatus = 'connected';
        currentQrCode = null;
        currentQrDataUrl = null;
        connectedUser = sock.user;
        logBaileysEvent(`WhatsApp Web connection OPEN! Authenticated as: ${sock.user?.id}`);
      }
    });

    // Two-way interactive messaging listener
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify' || !messages || messages.length === 0) return;

      for (const msg of messages) {
        const senderJid = msg.key.remoteJid;
        if (!senderJid) continue;

        // Skip group messages, broadcast status, and newsletters
        if (
          senderJid.endsWith('@g.us') ||
          senderJid.endsWith('@newsletter') ||
          senderJid.endsWith('@broadcast') ||
          senderJid === 'status@broadcast'
        ) {
          continue;
        }

        const myPhone = sock.user?.id ? sock.user.id.split(':')[0].split('@')[0] : null;
        const senderPhone = senderJid.split('@')[0].split(':')[0];
        const isSelfChat = Boolean(myPhone && senderPhone === myPhone);

        // Skip messages sent by our own account unless it is a note-to-self chat
        if (msg.key.fromMe && !isSelfChat) continue;

        const text = (
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          msg.message?.buttonsResponseMessage?.selectedButtonId ||
          ''
        ).trim();

        if (!text) continue;

        console.log(`[Baileys] Inbound WhatsApp message from ${senderPhone}: "${text}"`);

        await handleIncomingCommand(senderPhone, text, senderJid);
      }
    });

    // Wait briefly (up to 1.5s) for initial handshake or QR code generation
    for (let i = 0; i < 15; i++) {
      if (connectionStatus === 'qr_ready' || connectionStatus === 'connected') {
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    isInitializing = false;
    return getBaileysStatus();
  } catch (err) {
    console.error('[Baileys] Failed to initialize socket:', err);
    connectionStatus = 'disconnected';
    isInitializing = false;
    throw err;
  }
};

/**
 * Process inbound WhatsApp command (done, snooze, tasks, help)
 * Strictly filters out casual chat, external/unregistered contacts, and non-command messages.
 */
export const handleIncomingCommand = async (senderPhone, commandText, senderJid) => {
  try {
    if (!senderPhone || !commandText || !senderJid) {
      return { handled: false, reason: 'invalid_arguments' };
    }

    const trimmedText = commandText.trim();
    if (!trimmedText) {
      return { handled: false, reason: 'empty_text' };
    }

    // 1. Locate the user or organization matching this phone number
    const localPhone = senderPhone.replace(/[^\d]/g, '').slice(-10);
    if (!localPhone || localPhone.length < 10) {
      return { handled: false, reason: 'invalid_phone' };
    }
    const phoneRegex = new RegExp(`${localPhone}$`);

    const user = await User.findOne({ phone: { $regex: phoneRegex } }).sort({ updatedAt: -1 });
    
    // Resolve organization: where user is owner, or whatsappSettings.adminPhone matches
    let org = null;
    if (user?._id) {
      org = await Organization.findOne({
        $or: [
          { owner: user._id },
          { 'whatsappSettings.adminPhone': { $regex: phoneRegex } }
        ]
      }).sort({ updatedAt: -1 });

      if (!org) {
        const MembershipModel = (await import('../models/Membership.js')).default;
        const membership = await MembershipModel.findOne({ user: user._id }).sort({ updatedAt: -1 });
        if (membership?.organization) {
          org = await Organization.findById(membership.organization);
        }
      }
    }

    if (!org) {
      org = await Organization.findOne({
        'whatsappSettings.adminPhone': { $regex: phoneRegex }
      }).sort({ updatedAt: -1 });
    }

    // STRICT CHECK 1: If sender is NOT an authorized TaskMate admin or member, SILENTLY IGNORE.
    // Never reply to external contacts, family, friends, or strangers messaging this WhatsApp number.
    if (!org) {
      return { handled: false, reason: 'unauthorized_sender' };
    }

    // STRICT CHECK 2: If organization has WhatsApp alerts disabled, ignore.
    if (org.whatsappSettings && org.whatsappSettings.enabled === false) {
      return { handled: false, reason: 'whatsapp_disabled_for_org' };
    }

    // 2. Command Parsing & Intent Detection
    // Senders can send:
    // a) Explicit prefixed commands: !done, /done, #done, !tasks, /tasks, !snooze, !help, taskmate: done, etc.
    // b) Clean exact single-word keywords: done, complete, finish, snooze, delay, tasks, list, pending, status, help, menu
    // We STRICTLY REJECT conversational messages (e.g. "Are you done?", "What is the status?", "Hi there")
    const hasCommandPrefix = /^(?:[!/#]|taskmate[:\s]+)/i.test(trimmedText);
    const cleanedCmd = trimmedText
      .replace(/^(?:[!/#]|taskmate[:\s]+)/i, '')
      .trim()
      .toLowerCase();

    // Check exact keyword match (or keyword at start of prefixed command)
    const isDoneCmd = /^(?:done|complete|finish)(?:\s+.*)?$/i.test(cleanedCmd);
    const isSnoozeCmd = /^(?:snooze|delay)(?:\s+.*)?$/i.test(cleanedCmd);
    const isTasksCmd = /^(?:tasks|list|pending|status)$/i.test(cleanedCmd);
    const isHelpCmd = /^(?:help|commands|menu|\?)$/i.test(cleanedCmd);

    // If neither a command prefix nor an exact recognized keyword was supplied:
    // SILENTLY IGNORE! Do NOT send any auto-reply to casual messages or contacts.
    if (!hasCommandPrefix && !isDoneCmd && !isSnoozeCmd && !isTasksCmd && !isHelpCmd) {
      return { handled: false, reason: 'not_a_command' };
    }

    const tenantFilter = { organization: org._id };

    // Determine if sender is owner/admin or a team member
    const isOrgAdmin = Boolean(
      (org.owner && user && org.owner.toString() === user._id.toString()) ||
      (org.whatsappSettings?.adminPhone && org.whatsappSettings.adminPhone.replace(/[^\d]/g, '').endsWith(localPhone))
    );

    const memberTaskFilter = (!isOrgAdmin && user?._id)
      ? { $or: [{ assignedTo: user._id }, { user: user._id }] }
      : {};

    // Command: "done" / "complete" / "finish"
    if (isDoneCmd) {
      const task = await Task.findOne({
        ...tenantFilter,
        ...memberTaskFilter,
        isDeleted: false,
        status: { $in: ['pending', 'in_progress', 'review'] }
      }).sort({ dueDate: 1, updatedAt: -1 });

      if (!task) {
        await sendTextMessage(senderJid, `ℹ️ *TaskMate:* You have no active pending tasks right now! Everything is completed. 🎉`);
        return { handled: true, action: 'done_no_tasks' };
      }

      task.status = 'completed';
      task.completedAt = new Date();
      task.activityLog = task.activityLog || [];
      task.activityLog.push({
        action: 'status_changed',
        details: `Completed via WhatsApp by ${user?.name || senderPhone}`,
        timestamp: new Date()
      });
      await task.save();

      const orgId = task.organization?._id || task.organization;
      if (orgId) {
        broadcastTenantEvent(orgId.toString(), 'task.updated', {
          taskId: task._id.toString(),
          status: 'completed',
          title: task.title
        });
      }

      await sendTextMessage(
        senderJid,
        `✅ *Task Completed!*\n\n*Task:* ${task.title}\n*Status:* Completed 🚀\n\nYour TaskMate dashboard and Kanban board have been updated in real time.`
      );
      return { handled: true, action: 'task_completed', taskId: task._id };
    }

    // Command: "snooze" / "delay"
    if (isSnoozeCmd) {
      const task = await Task.findOne({
        ...tenantFilter,
        ...memberTaskFilter,
        isDeleted: false,
        status: { $in: ['pending', 'in_progress'] }
      }).sort({ dueDate: 1 });

      if (!task) {
        await sendTextMessage(senderJid, `ℹ️ *TaskMate:* No pending tasks found to snooze.`);
        return { handled: true, action: 'snooze_no_tasks' };
      }

      if (task.dueTime) {
        const [h, m] = task.dueTime.split(':').map(Number);
        const newMinutes = (m + 30) % 60;
        const newHours = (h + Math.floor((m + 30) / 60)) % 24;
        task.dueTime = `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}`;
      }
      task.whatsapp30MinNotifiedAt = null;
      await task.save();

      await sendTextMessage(
        senderJid,
        `⏰ *Task Snoozed for 30 Minutes!*\n\n*Task:* ${task.title}\n*New Due Time:* ${task.dueTime || 'Extended'}`
      );
      return { handled: true, action: 'task_snoozed', taskId: task._id };
    }

    // Command: "tasks" / "list" / "pending" / "status"
    if (isTasksCmd) {
      const pendingTasks = await Task.find({
        ...tenantFilter,
        ...memberTaskFilter,
        isDeleted: false,
        status: { $in: ['pending', 'in_progress'] }
      })
        .sort({ dueDate: 1 })
        .limit(5);

      if (pendingTasks.length === 0) {
        await sendTextMessage(senderJid, `📋 *TaskMate:* All caught up! No pending tasks in your workspace. ✨`);
        return { handled: true, action: 'tasks_empty' };
      }

      let reply = `📋 *TaskMate: Your Top Pending Tasks*\n\n`;
      pendingTasks.forEach((t, i) => {
        const due = t.dueDateString ? ` (Due: ${t.dueDateString}${t.dueTime ? ' ' + t.dueTime : ''})` : '';
        reply += `${i + 1}. *${t.title}*${due} [${t.priority.toUpperCase()}]\n`;
      });
      reply += `\n_Reply "done" or "!done" to mark the top task as completed._`;

      await sendTextMessage(senderJid, reply);
      return { handled: true, action: 'tasks_listed', count: pendingTasks.length };
    }

    // Command: "help" or prefixed unknown command (e.g. !help or !xyz)
    if (isHelpCmd || hasCommandPrefix) {
      await sendTextMessage(
        senderJid,
        `👋 *TaskMate WhatsApp Assistant*\n\n` +
        `Here are the commands you can send me:\n` +
        `• *done* — Mark your latest overdue/pending task as completed\n` +
        `• *snooze* — Snooze your current task deadline by 30 mins\n` +
        `• *tasks* — List your top pending tasks\n` +
        `• *help* — Show this instructions menu`
      );
      return { handled: true, action: 'help_displayed' };
    }

    // Fallback: Never send anything for casual conversational messages!
    return { handled: false, reason: 'ignored' };
  } catch (err) {
    console.error('[Baileys] Error handling inbound message:', err);
    return { handled: false, error: err.message };
  }
};

/**
 * Helper to send standard text message via Baileys socket
 */
export const sendTextMessage = async (jid, text) => {
  if (!sock || connectionStatus !== 'connected') {
    return false;
  }
  try {
    await sock.sendMessage(jid, { text });
    return true;
  } catch (err) {
    console.warn(`[Baileys] Failed to send message to ${jid}:`, err.message);
    return false;
  }
};

/**
 * Dispatch an outbound task notification to an admin or assignee phone number
 */
export const sendBaileysNotification = async (targetPhone, text) => {
  if (!sock || connectionStatus !== 'connected') {
    return { success: false, reason: 'Baileys WhatsApp socket is not connected' };
  }

  let jid = formatJID(targetPhone);
  if (!jid) {
    return { success: false, reason: 'Invalid phone number format' };
  }

  // Detect self-notification (when recipient phone matches the linked WhatsApp session)
  const connectedPhone = sock.user?.id ? sock.user.id.split(':')[0].split('@')[0] : null;
  const targetPhoneDigits = targetPhone.replace(/[^\d]/g, '');
  const fullTargetDigits = targetPhoneDigits.length === 10 ? `91${targetPhoneDigits}` : targetPhoneDigits;
  const isSelf = Boolean(connectedPhone && fullTargetDigits === connectedPhone && sock.user?.id);

  try {
    let res = null;
    if (isSelf) {
      logBaileysEvent(`Self-chat detected for ${connectedPhone}. Sending via ${sock.user.id} and ${jid}`);
      // Send to the linked device JID (critical for self-chat in Baileys multi-device)
      res = await sock.sendMessage(sock.user.id, { text });
      // Also dispatch to clean normalized user JID as dual-delivery fallback
      try {
        await sock.sendMessage(jid, { text });
      } catch {}
    } else {
      res = await sock.sendMessage(jid, { text });
    }
    logBaileysEvent(`Successfully dispatched WhatsApp notification. MessageId: ${res?.key?.id}`);
    return { success: true, messageId: res?.key?.id, jid: isSelf ? sock.user.id : jid };
  } catch (err) {
    logBaileysEvent(`Failed to dispatch message to ${jid}: ${err.message}`);
    return { success: false, error: err.message };
  }
};

/**
 * Manually disconnect or logout Baileys
 */
export const disconnectBaileys = async (logout = false) => {
  isManualDisconnect = true;
  clearTimeout(reconnectTimer);
  if (sock) {
    try {
      if (logout) {
        await sock.logout();
      } else {
        await sock.end();
      }
    } catch {
      // ignore clean shutdown errors
    }
  }

  sock = null;
  connectionStatus = 'disconnected';
  currentQrCode = null;
  currentQrDataUrl = null;
  connectedUser = null;

  if (logout) {
    try {
      if (fs.existsSync(AUTH_DIR)) {
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        fs.mkdirSync(AUTH_DIR, { recursive: true });
      }
    } catch {
      // ignore
    }
  }

  return getBaileysStatus();
};

export default {
  connectBaileys,
  disconnectBaileys,
  getBaileysStatus,
  sendBaileysNotification,
  formatJID,
  handleIncomingCommand,
  sendTextMessage
};
