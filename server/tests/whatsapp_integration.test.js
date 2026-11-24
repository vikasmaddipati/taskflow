import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { formatWhatsAppNumber, sendAdminWhatsAppMessage, notifyAdminTaskAssigned, notifyAdminTaskCompleted, notifyAdmin30MinWarning, notifyAdminTaskOverdue } from '../src/services/whatsappService.js';
import { formatJID, loadBaileysModules, getBaileysStatus, disconnectBaileys, handleIncomingCommand } from '../src/services/baileysService.js';
import Organization from '../src/models/Organization.js';
import User from '../src/models/User.js';
import Task from '../src/models/Task.js';
import { scanAndDispatchReminders } from '../src/services/reminderScheduler.js';
import Notification from '../src/models/Notification.js';

console.log('\n================================================================');
console.log('   TaskMate WhatsApp Integration & Baileys Verification Suite   ');
console.log('================================================================\n');

async function runTests() {
  // Connect to DB for integration tests
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/taskmanager';
  await mongoose.connect(mongoUri);

  // --- TEST GROUP 1: Phone Number & JID Normalization ---
  console.log('--- TEST GROUP 1: Phone Number & JID Normalization ---');

  assert.equal(formatWhatsAppNumber('9876543210'), '+919876543210', '10-digit number defaults to India +91');
  console.log('[PASS] formatWhatsAppNumber("9876543210") => "+919876543210"');

  assert.equal(formatWhatsAppNumber('+919876543210'), '+919876543210', 'Already-prefixed international number preserved');
  console.log('[PASS] formatWhatsAppNumber("+919876543210") => "+919876543210"');

  assert.equal(formatWhatsAppNumber('+14155552671'), '+14155552671', 'US international number preserved');
  console.log('[PASS] formatWhatsAppNumber("+14155552671") => "+14155552671"');

  assert.equal(formatWhatsAppNumber('09876543210'), '+919876543210', 'Leading 0 on 11-digit national trunk number stripped');
  console.log('[PASS] formatWhatsAppNumber("09876543210") => "+919876543210"');

  assert.equal(formatWhatsAppNumber('+9109876543210'), '+919876543210', '+910 redundant zero properly stripped');
  console.log('[PASS] formatWhatsAppNumber("+9109876543210") => "+919876543210"');

  assert.equal(formatWhatsAppNumber(null), null, 'Null phone returns null');
  assert.equal(formatWhatsAppNumber(''), null, 'Empty string returns null');
  console.log('[PASS] formatWhatsAppNumber handles null/empty gracefully');

  assert.equal(formatJID('9876543210'), '919876543210@s.whatsapp.net', '10-digit JID defaults to 91');
  console.log('[PASS] formatJID("9876543210") => "919876543210@s.whatsapp.net"');

  assert.equal(formatJID('09876543210'), '919876543210@s.whatsapp.net', '11-digit leading 0 JID normalized');
  console.log('[PASS] formatJID("09876543210") => "919876543210@s.whatsapp.net"');

  assert.equal(formatJID('+91 98765 43210'), '919876543210@s.whatsapp.net', 'Spaced JID normalized');
  console.log('[PASS] formatJID("+91 98765 43210") => "919876543210@s.whatsapp.net"');

  // --- TEST GROUP 2: Baileys Module Loader & Disconnect State ---
  console.log('\n--- TEST GROUP 2: Baileys Module Loader & Status ---');

  const loaded = await loadBaileysModules();
  assert.equal(loaded, true, 'Baileys modules load dynamically');
  console.log('[PASS] loadBaileysModules() successfully resolved socket libraries');

  const status = getBaileysStatus();
  assert.ok(status.status, 'Baileys status contains connection status');
  assert.equal(status.isSupported, true, 'isSupported flag is true');
  console.log('[PASS] getBaileysStatus() returns expected state shape');

  const disconnectResult = await disconnectBaileys(false);
  assert.equal(disconnectResult.status, 'disconnected', 'disconnectBaileys pauses socket');
  console.log('[PASS] disconnectBaileys() sets status to disconnected without auto-reconnect');

  // --- TEST GROUP 3: Settings & Preference Filtering ---
  console.log('\n--- TEST GROUP 3: WhatsApp Settings & Event Filtering ---');

  const uniquePhone = `98${String(Date.now()).slice(-8)}`;
  const uniqueJid = `91${uniquePhone}@s.whatsapp.net`;

  const testUser = await User.create({
    name: 'WhatsApp Admin Test',
    email: `wa.admin.${Date.now()}@taskmate.dev`,
    password: 'Password123!',
    phone: uniquePhone,
    isEmailVerified: true
  });

  const testOrg = await Organization.create({
    name: 'WhatsApp Test Org',
    slug: `wa-test-org-${Date.now()}`,
    owner: testUser._id,
    whatsappSettings: {
      adminPhone: uniquePhone,
      enabled: false, // Disabled
      notifyOnTaskAssigned: false,
      notifyOnTaskCompleted: true,
      notifyBefore30Min: true,
      notifyOnOverdue: true
    }
  });

  // Test event should bypass enabled: false
  const testMsgRes = await sendAdminWhatsAppMessage({
    organizationId: testOrg._id,
    eventType: 'test',
    message: 'Test message verification',
    recipientPhone: uniquePhone
  });
  assert.equal(testMsgRes.success, true, 'Test event bypasses enabled: false');
  console.log('[PASS] Test event successfully delivered even when global notifications are disabled');

  // Task assigned should be skipped because enabled: false
  const assignedRes = await sendAdminWhatsAppMessage({
    organizationId: testOrg._id,
    eventType: 'task_assigned',
    message: 'Task assigned message'
  });
  assert.equal(assignedRes.skipped, true, 'Task assigned event skipped when enabled: false');
  console.log('[PASS] Automatic task alert cleanly skipped when organization has WhatsApp disabled');

  // Enable WhatsApp, but keep notifyOnTaskAssigned: false
  testOrg.whatsappSettings.enabled = true;
  await testOrg.save();

  const assignedSkippedRes = await sendAdminWhatsAppMessage({
    organizationId: testOrg._id,
    eventType: 'task_assigned',
    message: 'Task assigned message'
  });
  assert.equal(assignedSkippedRes.skipped, true, 'Skipped when notifyOnTaskAssigned: false');
  console.log('[PASS] Event-specific toggle (notifyOnTaskAssigned: false) respected');

  // Completed should pass when notifyOnTaskCompleted: true
  const completedRes = await sendAdminWhatsAppMessage({
    organizationId: testOrg._id,
    eventType: 'task_completed',
    message: 'Task completed message'
  });
  assert.equal(completedRes.success, true, 'Completed event dispatches when toggle is true');
  assert.equal(completedRes.skipped, undefined, 'Not skipped');
  console.log('[PASS] Enabled event (notifyOnTaskCompleted: true) dispatches successfully');

  // --- TEST GROUP 4: Full Task Helper Dispatches ---
  console.log('\n--- TEST GROUP 4: High-Level Task Event Dispatches ---');

  const testTask = await Task.create({
    title: 'Deploy Production Cluster',
    user: testUser._id,
    organization: testOrg._id,
    assignedTo: testUser._id,
    status: 'in_progress',
    priority: 'high',
    dueDate: new Date(Date.now() + 30 * 60 * 1000),
    dueDateString: '2026-11-20',
    dueTime: '18:00'
  });

  const res30m = await notifyAdmin30MinWarning(testTask, testOrg._id);
  assert.equal(res30m.success, true, '30-minute warning dispatches successfully');
  console.log('[PASS] notifyAdmin30MinWarning dispatched message to admin channel');

  const resOverdue = await notifyAdminTaskOverdue(testTask, testOrg._id);
  assert.equal(resOverdue.success, true, 'Task overdue alert dispatches successfully');
  console.log('[PASS] notifyAdminTaskOverdue dispatched urgent message to admin channel');

  const resCompleted = await notifyAdminTaskCompleted(testTask, testOrg._id, 'Vikas');
  assert.equal(resCompleted.success, true, 'Task completed notification dispatches successfully');
  console.log('[PASS] notifyAdminTaskCompleted dispatched completion alert');

  // --- TEST GROUP 5: Reminder Scheduler Scan & Deduplication ---
  console.log('\n--- TEST GROUP 5: Reminder Scheduler & Notification Deduplication ---');

  // Set task to be due in 20 minutes (within 30m window)
  testTask.dueDate = new Date(Date.now() + 20 * 60 * 1000);
  testTask.remindedAt = null;
  testTask.whatsapp30MinNotifiedAt = null;
  testTask.whatsappDueNotifiedAt = null;
  await testTask.save();

  // First scan: should create in-app notification and dispatch 30-min WhatsApp warning
  const scanResult1 = await scanAndDispatchReminders({ organizationId: testOrg._id });
  assert.ok(scanResult1.scanned >= 1, 'Scanned at least 1 upcoming task');
  assert.equal(scanResult1.notificationsCreated, 1, 'Created 1 in-app notification on first scan');
  console.log('[PASS] Initial reminder scan created in-app notification and set remindedAt');

  // Verify task flags updated
  const updatedTask = await Task.findById(testTask._id);
  assert.ok(updatedTask.remindedAt, 'remindedAt timestamp was set');
  assert.ok(updatedTask.whatsapp30MinNotifiedAt, 'whatsapp30MinNotifiedAt timestamp was set');
  console.log('[PASS] Task timestamps (remindedAt & whatsapp30MinNotifiedAt) persisted');

  // Second scan immediately after: should NOT duplicate in-app notification
  const scanResult2 = await scanAndDispatchReminders({ organizationId: testOrg._id });
  assert.equal(scanResult2.notificationsCreated, 0, 'No duplicate notification created on second scan');
  console.log('[PASS] Re-scan successfully prevented duplicate notifications and emails');

  // --- TEST GROUP 6: Inbound WhatsApp Filtering & Command Isolation ---
  console.log('\n--- TEST GROUP 6: Inbound WhatsApp Filtering & Command Isolation ---');

  // 1. External/unknown sender (friend, family, stranger) sends casual text -> SILENTLY IGNORED
  const strangerChat = await handleIncomingCommand('9998887777', 'Hey Vikas, how are you doing?', '919998887777@s.whatsapp.net');
  assert.equal(strangerChat.handled, false, 'Unregistered sender chat is not handled');
  assert.equal(strangerChat.reason, 'unauthorized_sender', 'Rejected as unauthorized sender');
  console.log('[PASS] Casual message from external/unknown phone number is silently ignored (NO auto-reply sent)');

  // 2. External/unknown sender sends command word -> SILENTLY IGNORED
  const strangerCommand = await handleIncomingCommand('9998887777', 'done', '919998887777@s.whatsapp.net');
  assert.equal(strangerCommand.handled, false, 'Unregistered sender command is not handled');
  assert.equal(strangerCommand.reason, 'unauthorized_sender', 'Rejected as unauthorized sender');
  console.log('[PASS] Command word from external/unknown phone number is silently ignored (NO tasks modified)');

  // 3. Authorized admin sends casual conversation -> SILENTLY IGNORED (NO spam reply)
  const adminCasual1 = await handleIncomingCommand(uniquePhone, 'Good morning Vikas!', uniqueJid);
  assert.equal(adminCasual1.handled, false, 'Casual greeting from admin is not handled as command');
  assert.equal(adminCasual1.reason, 'not_a_command', 'Identified as not a command');
  console.log('[PASS] Casual greeting from admin phone is silently ignored (NO TaskMate help message sent)');

  const adminCasual2 = await handleIncomingCommand(uniquePhone, 'Are you done with lunch yet?', uniqueJid);
  assert.equal(adminCasual2.handled, false, 'Conversational sentence containing "done" is not matched');
  assert.equal(adminCasual2.reason, 'not_a_command', 'Identified as conversational text, not command');
  console.log('[PASS] Sentence containing "done" is not falsely triggered as a task completion command');

  // 4. Authorized admin sends explicit "tasks" command
  const adminTasksCmd = await handleIncomingCommand(uniquePhone, 'tasks', uniqueJid);
  assert.equal(adminTasksCmd.handled, true, 'Explicit tasks command handled');
  assert.equal(adminTasksCmd.action, 'tasks_listed', 'Listed pending tasks');
  console.log('[PASS] Exact single-word command "tasks" correctly lists tasks');

  // 5. Authorized admin sends prefixed "!tasks" command
  const adminPrefixedTasks = await handleIncomingCommand(uniquePhone, '!tasks', uniqueJid);
  assert.equal(adminPrefixedTasks.handled, true, 'Prefixed !tasks command handled');
  assert.equal(adminPrefixedTasks.action, 'tasks_listed', 'Listed pending tasks');
  console.log('[PASS] Prefixed command "!tasks" correctly lists tasks');

  // 6. Authorized admin sends explicit "snooze" command
  const adminSnoozeCmd = await handleIncomingCommand(uniquePhone, 'snooze', uniqueJid);
  assert.equal(adminSnoozeCmd.handled, true, 'Explicit snooze command handled');
  assert.equal(adminSnoozeCmd.action, 'task_snoozed', 'Snoozed pending task');
  console.log('[PASS] Exact single-word command "snooze" correctly snoozes task deadline');

  // 7. Authorized admin sends explicit "done" command -> marks task completed
  const adminDoneCmd = await handleIncomingCommand(uniquePhone, 'done', uniqueJid);
  assert.equal(adminDoneCmd.handled, true, 'Explicit done command handled');
  assert.equal(adminDoneCmd.action, 'task_completed', 'Task marked completed');
  const finishedTask = await Task.findById(testTask._id);
  assert.equal(finishedTask.status, 'completed', 'Task status changed to completed in database');
  console.log('[PASS] Exact single-word command "done" completes task in database');

  // 8. Authorized admin sends explicit "help" command
  const adminHelpCmd = await handleIncomingCommand(uniquePhone, 'help', uniqueJid);
  assert.equal(adminHelpCmd.handled, true, 'Explicit help command handled');
  assert.equal(adminHelpCmd.action, 'help_displayed', 'Help menu shown');
  console.log('[PASS] Explicit "help" command displays instructions');

  // 9. When WhatsApp alerts are disabled for the organization -> SILENTLY IGNORED
  testOrg.whatsappSettings.enabled = false;
  await testOrg.save();
  const disabledOrgCmd = await handleIncomingCommand(uniquePhone, 'done', uniqueJid);
  assert.equal(disabledOrgCmd.handled, false, 'Disabled org command is not handled');
  assert.equal(disabledOrgCmd.reason, 'whatsapp_disabled_for_org', 'Rejected because WhatsApp alerts are disabled');
  console.log('[PASS] Inbound commands silently ignored when organization disables WhatsApp alerts');

  // Cleanup test data
  await Task.deleteMany({ organization: testOrg._id });
  await Notification.deleteMany({ organization: testOrg._id });
  await Organization.findByIdAndDelete(testOrg._id);
  await User.findByIdAndDelete(testUser._id);

  await mongoose.disconnect();

  console.log('\n================================================================');
  console.log('   All WhatsApp Integration Tests Completed Successfully (0 Failures)');
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('\n[TEST FAILURE]:', err);
  process.exit(1);
});
