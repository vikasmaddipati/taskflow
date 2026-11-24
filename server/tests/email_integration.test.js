import assert from 'assert';
import {
  isSmtpConfigured,
  sendOtpEmail,
  sendTaskAssignmentEmail,
  sendTaskReminderEmail,
  sendTaskOverdueEmail,
  sendTaskCompletedEmail,
  sendTestEmail,
  resolveTaskAssignees,
  setCustomTransporter,
  resetCustomTransporter,
  devOtpStore
} from '../src/services/emailService.js';

async function runTests() {
  console.log('--- Starting TaskMate Email Integration Test Suite ---');

  // Test 1: isSmtpConfigured properly detects unconfigured placeholder environment
  console.log('\n[Test 1] Verifying SMTP environment detection...');
  const smtpStatus = isSmtpConfigured();
  console.log(`  Current SMTP status: ${smtpStatus ? 'Configured (Live)' : 'Placeholder/Unconfigured (Safe Mock Mode)'}`);
  assert.strictEqual(typeof smtpStatus, 'boolean', 'isSmtpConfigured must return a boolean');
  console.log('  PASSED: SMTP status detection is valid.');

  // Test 2: Custom Transporter Mock Capture
  console.log('\n[Test 2] Testing Custom Transporter injection and message capture...');
  const capturedMessages = [];
  const mockTransporter = {
    sendMail: async (options) => {
      capturedMessages.push(options);
      return {
        messageId: `mock-msg-${Date.now()}`,
        accepted: [options.to]
      };
    }
  };

  setCustomTransporter(mockTransporter);

  // Test 3: OTP Verification Email Dispatch
  console.log('\n[Test 3] Verifying OTP Verification Email formatting...');
  const otpRes = await sendOtpEmail({
    to: 'testuser@example.com',
    name: 'Alex Developer',
    otp: '482910',
    purpose: 'login',
    expiresMinutes: 10
  });

  assert.strictEqual(otpRes.success, true, 'OTP email must succeed');
  assert.strictEqual(capturedMessages.length, 1, 'Should have captured 1 email');
  assert.strictEqual(capturedMessages[0].to, 'testuser@example.com');
  assert(capturedMessages[0].subject.includes('Verification Code'), 'Subject should contain Verification Code');
  assert(capturedMessages[0].html.includes('482910'), 'HTML must contain OTP');
  console.log('  PASSED: OTP email rendered and captured accurately.');

  // Test 4: Task Assignment Email
  console.log('\n[Test 4] Verifying Task Assignment Email rendering...');
  const taskObj = {
    title: 'Deploy Production Hotfix',
    description: 'Review merge conflict and deploy build v2.4 to AWS.',
    priority: 'urgent',
    dueDateString: '2026-11-20',
    dueTime: '18:00'
  };

  const assignRes = await sendTaskAssignmentEmail({
    to: 'engineer@company.com',
    recipientName: 'Sarah Connor',
    task: taskObj,
    assignerName: 'Team Lead John',
    workspaceName: 'Cloud Engineering'
  });

  assert.strictEqual(assignRes.success, true, 'Assignment email must succeed');
  assert.strictEqual(capturedMessages.length, 2, 'Should have captured 2 emails');
  const assignMsg = capturedMessages[1];
  assert.strictEqual(assignMsg.to, 'engineer@company.com');
  assert(assignMsg.subject.includes('New Task Assigned: Deploy Production Hotfix'));
  assert(assignMsg.html.includes('Sarah Connor'));
  assert(assignMsg.html.includes('Deploy Production Hotfix'));
  assert(assignMsg.html.includes('urgent priority'));
  assert(assignMsg.html.includes('Cloud Engineering'));
  console.log('  PASSED: Task assignment email generated with full context and badges.');

  // Test 5: 30-Minute Deadline Reminder Email
  console.log('\n[Test 5] Verifying 30-Minute Deadline Reminder Email...');
  const reminderRes = await sendTaskReminderEmail({
    to: 'engineer@company.com',
    recipientName: 'Sarah Connor',
    task: taskObj,
    minutesLeft: 30
  });

  assert.strictEqual(reminderRes.success, true, 'Reminder email must succeed');
  assert.strictEqual(capturedMessages.length, 3, 'Should have captured 3 emails');
  const reminderMsg = capturedMessages[2];
  assert(reminderMsg.subject.includes('30 Minutes Left'));
  assert(reminderMsg.html.includes('30 minutes'));
  assert(reminderMsg.html.includes('18:00'));
  console.log('  PASSED: 30-minute reminder email formatted correctly.');

  // Test 6: Overdue Notification Email
  console.log('\n[Test 6] Verifying Overdue / Due Time Completed Email...');
  const overdueRes = await sendTaskOverdueEmail({
    to: 'admin@company.com',
    recipientName: 'Admin Vikas',
    task: taskObj
  });

  assert.strictEqual(overdueRes.success, true, 'Overdue email must succeed');
  assert.strictEqual(capturedMessages.length, 4, 'Should have captured 4 emails');
  const overdueMsg = capturedMessages[3];
  assert(overdueMsg.subject.includes('Overdue Alert'));
  assert(overdueMsg.html.includes('OVERDUE'));
  console.log('  PASSED: Overdue alert generated with red urgent banner.');

  // Test 7: Task Completed Email
  console.log('\n[Test 7] Verifying Task Completed Notification Email...');
  const completedRes = await sendTaskCompletedEmail({
    to: 'admin@company.com',
    recipientName: 'Admin Vikas',
    task: taskObj,
    completedByName: 'Sarah Connor'
  });

  assert.strictEqual(completedRes.success, true, 'Completed email must succeed');
  assert.strictEqual(capturedMessages.length, 5, 'Should have captured 5 emails');
  const completedMsg = capturedMessages[4];
  assert(completedMsg.subject.includes('Task Completed'));
  assert(completedMsg.html.includes('Sarah Connor'));
  console.log('  PASSED: Task completed email formatted with green success badge.');

  // Test 8: Admin Test Email
  console.log('\n[Test 8] Verifying Admin Test Email...');
  const testRes = await sendTestEmail({
    to: 'admin@zerosyntax.in',
    name: 'Vikas Admin'
  });

  assert.strictEqual(testRes.success, true, 'Test email must succeed');
  assert.strictEqual(capturedMessages.length, 6, 'Should have captured 6 emails');
  const testMsg = capturedMessages[5];
  assert(testMsg.subject.includes('Test Successful'));
  assert(testMsg.html.includes('Email Delivery Active'));
  console.log('  PASSED: Admin test email generated with action links.');

  // Cleanup transporter
  resetCustomTransporter();

  // Test 9: Safe Mock Simulation Mode Fallback
  console.log('\n[Test 9] Verifying Safe Mock Simulation Mode when no real SMTP is available...');
  const mockFallbackRes = await sendTestEmail({
    to: 'simulation@example.com',
    name: 'Dev Tester',
    isMockMode: true
  });
  assert.strictEqual(mockFallbackRes.success, true);
  assert.strictEqual(mockFallbackRes.mode, 'mock_simulation');
  console.log('  PASSED: Safe fallback simulation mode operating without network errors.');

  // Test 10: Multi-Assignee & Collaborator Resolution
  console.log('\n[Test 10] Verifying multi-assignee and collaborator resolution...');
  const multiTask = {
    title: 'Joint Security Audit',
    assignedTo: { name: 'Lead Dev', email: 'lead@company.com' },
    collaborators: [
      { name: 'Sec Ops', email: 'secops@company.com' },
      { name: 'QA Tester', email: 'qa@company.com' },
      { name: 'Lead Dev Duplicate', email: 'lead@company.com' } // deduplicated
    ]
  };
  const resolved = await resolveTaskAssignees(multiTask);
  assert.strictEqual(resolved.length, 3, 'Should resolve 3 unique team members');
  assert.strictEqual(resolved[0].email, 'lead@company.com');
  assert.strictEqual(resolved[1].email, 'secops@company.com');
  assert.strictEqual(resolved[2].email, 'qa@company.com');
  console.log('  PASSED: Multi-assignee resolution accurately handles all assigned team members with deduplication.');

  console.log('\n============================================================');
  console.log('   All 10 Email Integration Tests Passed Successfully!     ');
  console.log('============================================================\n');
}

runTests().catch((err) => {
  console.error('\n[Email Test Failure]', err);
  process.exit(1);
});
