// TaskFlow — Systemic Gaps Audit Extension Verification Suite
// Validates: Subtasks, Attachments, Activity Log, Recurring Tasks, Notifications & Reminders, and Kanban Status Transitions.
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'http://127.0.0.1:5000';

async function isServerRunning() {
  try {
    const res = await fetch(`${BASE_URL}/api/health`, {
      signal: AbortSignal.timeout(1500)
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-test-mode': 'true',
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data, headers: response.headers };
}

async function runSystemicGapsTests() {
  console.log('================================================================');
  console.log('   TaskFlow Systemic Gaps & Feature Inventory Verification     ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;
  let spawnedServer = null;

  function assert(condition, testName, extraInfo = '') {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName} ${extraInfo ? '- ' + extraInfo : ''}`);
      failed++;
    }
  }

  // Ensure server is running
  const serverAlreadyRunning = await isServerRunning();
  if (!serverAlreadyRunning) {
    console.log('[Setup] Launching API server on port 5000...');
    spawnedServer = spawn('node', ['src/server.js'], {
      cwd: path.resolve(__dirname, '..'),
      stdio: 'pipe',
      detached: false,
      env: { ...process.env, HOST: '127.0.0.1' }
    });
    spawnedServer.stdout.on('data', () => {});
    spawnedServer.stderr.on('data', () => {});

    let running = false;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 600));
      if (await isServerRunning()) {
        running = true;
        break;
      }
    }

    if (!running) {
      console.error('[Error] Could not connect to API server.');
      process.exit(1);
    }
    console.log('[Setup] Server running.\n');
  }

  const timestamp = Date.now();

  try {
    // -------------------------------------------------------------------------
    // Setup: Register Test User
    // -------------------------------------------------------------------------
    const userEmail = `gaps_user_${timestamp}@enterprise.com`;
    const regRes = await request('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Product Architect',
        email: userEmail,
        password: 'Password123!'
      })
    });
    assert(regRes.status === 201 && regRes.data.token, 'Test user registered successfully');
    const token = regRes.data.token;
    const authHeaders = { Authorization: `Bearer ${token}` };

    // -------------------------------------------------------------------------
    // GAP 2: Subtasks & Checklist Management
    // -------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 1: Subtasks & Checklist Management ---');

    // Create a base task
    const taskRes = await request('/api/v1/tasks', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        title: 'Release Production Engine v2.0',
        description: 'Complete all checklist items prior to launch'
      })
    });
    assert(taskRes.status === 201 && taskRes.data.task?._id, 'Created base task for subtasks test');
    const taskId = taskRes.data.task._id;

    // Add first subtask
    const subtask1Res = await request(`/api/v1/tasks/${taskId}/subtasks`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ title: 'Verify database replica failover' })
    });
    assert(
      subtask1Res.status === 201 && subtask1Res.data.subtask?.title === 'Verify database replica failover',
      'POST /tasks/:id/subtasks adds first checklist subtask'
    );
    const subtask1Id = subtask1Res.data.subtask._id;

    // Add second subtask
    const subtask2Res = await request(`/api/v1/tasks/${taskId}/subtasks`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ title: 'Conduct security vulnerability scan' })
    });
    assert(subtask2Res.status === 201, 'POST /tasks/:id/subtasks adds second checklist subtask');
    const subtask2Id = subtask2Res.data.subtask._id;

    // Toggle subtask completion
    const toggleSubtaskRes = await request(`/api/v1/tasks/${taskId}/subtasks/${subtask1Id}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ isCompleted: true })
    });
    assert(
      toggleSubtaskRes.status === 200 &&
        toggleSubtaskRes.data.subtask?.isCompleted === true &&
        Boolean(toggleSubtaskRes.data.subtask?.completedAt),
      'PATCH /tasks/:id/subtasks/:subtaskId completes subtask and sets completedAt timestamp'
    );

    // Delete second subtask
    const delSubtaskRes = await request(`/api/v1/tasks/${taskId}/subtasks/${subtask2Id}`, {
      method: 'DELETE',
      headers: authHeaders
    });
    assert(
      delSubtaskRes.status === 200 && delSubtaskRes.data.task?.subtasks?.length === 1,
      'DELETE /tasks/:id/subtasks/:subtaskId removes subtask from checklist'
    );

    // -------------------------------------------------------------------------
    // GAP 4: Attachments & File Storage
    // -------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 2: Attachments & File Storage ---');

    // Upload attachment via base64 fallback
    const sampleContent = Buffer.from('TaskFlow Architecture Whitepaper Specification v2.0').toString('base64');
    const attachRes = await request(`/api/v1/tasks/${taskId}/attachments`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        originalName: 'whitepaper_spec.pdf',
        mimeType: 'application/pdf',
        base64Data: sampleContent
      })
    });
    assert(
      attachRes.status === 201 && attachRes.data.attachment?._id,
      'POST /tasks/:id/attachments uploads task attachment'
    );
    const attachmentId = attachRes.data.attachment?._id;

    // Download attachment
    const downloadRes = await fetch(`${BASE_URL}/api/v1/tasks/${taskId}/attachments/${attachmentId}/download`, {
      headers: authHeaders
    });
    assert(
      downloadRes.status === 200 && downloadRes.headers.get('content-disposition')?.includes('whitepaper_spec.pdf'),
      'GET /tasks/:id/attachments/:attachmentId/download downloads attachment with correct Content-Disposition'
    );

    // Delete attachment
    const delAttachRes = await request(`/api/v1/tasks/${taskId}/attachments/${attachmentId}`, {
      method: 'DELETE',
      headers: authHeaders
    });
    assert(
      delAttachRes.status === 200 && delAttachRes.data.task?.attachments?.length === 0,
      'DELETE /tasks/:id/attachments/:attachmentId removes attachment'
    );

    // -------------------------------------------------------------------------
    // GAP 5: Activity Log & Audit Trail
    // -------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 3: Activity Log & Audit Trail ---');

    const activityRes = await request(`/api/v1/tasks/${taskId}/activity`, {
      method: 'GET',
      headers: authHeaders
    });
    assert(
      activityRes.status === 200 && Array.isArray(activityRes.data.activity) && activityRes.data.activity.length >= 2,
      'GET /tasks/:id/activity returns chronological audit log of task lifecycle events'
    );

    // -------------------------------------------------------------------------
    // GAP 6: Recurring Tasks
    // -------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 4: Recurring Tasks Auto-Generation ---');

    // Create recurring task
    const recurringTaskRes = await request('/api/v1/tasks', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        title: 'Daily DevOps Standup',
        dueDateString: '2026-11-01',
        recurrence: {
          isRecurring: true,
          frequency: 'daily',
          interval: 1
        }
      })
    });
    assert(
      recurringTaskRes.status === 201 && recurringTaskRes.data.task?.recurrence?.isRecurring === true,
      'POST /tasks creates recurring task with daily repetition schedule'
    );
    const recurringTaskId = recurringTaskRes.data.task._id;

    // Toggle task to completed
    const toggleRecurringRes = await request(`/api/v1/tasks/${recurringTaskId}/toggle`, {
      method: 'PATCH',
      headers: authHeaders
    });
    assert(
      toggleRecurringRes.status === 200 &&
        toggleRecurringRes.data.task?.status === 'completed' &&
        toggleRecurringRes.data.nextOccurrence?._id,
      'PATCH /tasks/:id/toggle completes current task and automatically spawns next occurrence'
    );
    assert(
      toggleRecurringRes.data.nextOccurrence?.status === 'pending' &&
        toggleRecurringRes.data.nextOccurrence?.recurrence?.isRecurring === true,
      'Next occurrence task is initialized with pending status and intact recurrence schedule'
    );

    // -------------------------------------------------------------------------
    // GAP 3: Notifications & Scheduled Reminders
    // -------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 5: Notifications & Reminder Scheduler Engine ---');

    // Trigger reminder engine scan
    const reminderScanRes = await request('/api/v1/notifications/run-reminders', {
      method: 'POST',
      headers: authHeaders
    });
    assert(
      reminderScanRes.status === 200 && typeof reminderScanRes.data.notifiedCount === 'number',
      'POST /notifications/run-reminders executes reminder scheduler scan engine'
    );

    // Fetch user notifications
    const notifsRes = await request('/api/v1/notifications', {
      method: 'GET',
      headers: authHeaders
    });
    assert(
      notifsRes.status === 200 && Array.isArray(notifsRes.data.notifications),
      'GET /notifications returns list of user notifications and unreadCount'
    );

    // Mark all notifications read
    const markAllReadRes = await request('/api/v1/notifications/read-all', {
      method: 'POST',
      headers: authHeaders
    });
    assert(markAllReadRes.status === 200, 'POST /notifications/read-all marks all notifications as read');

    // -------------------------------------------------------------------------
    // GAP 7: Kanban / Board View & Status Transitions
    // -------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 6: Kanban Board Status Transitions ---');

    // Transition status to 'in_progress'
    const statusProgRes = await request(`/api/v1/tasks/${taskId}/status`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ status: 'in_progress' })
    });
    assert(
      statusProgRes.status === 200 && statusProgRes.data.task?.status === 'in_progress',
      'PATCH /tasks/:id/status transitions task to "in_progress"'
    );

    // Transition status to 'review'
    const statusReviewRes = await request(`/api/v1/tasks/${taskId}/status`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ status: 'review' })
    });
    assert(
      statusReviewRes.status === 200 && statusReviewRes.data.task?.status === 'review',
      'PATCH /tasks/:id/status transitions task to "review"'
    );

    // Reject invalid status
    const invalidStatusRes = await request(`/api/v1/tasks/${taskId}/status`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ status: 'not_a_valid_status' })
    });
    assert(
      invalidStatusRes.status === 400,
      'PATCH /tasks/:id/status rejects invalid status with 400 Bad Request'
    );

    // -------------------------------------------------------------------------
    // Summary
    // -------------------------------------------------------------------------
    console.log('\n================================================================');
    console.log(`Systemic Gaps Tests Completed: ${passed} passed, ${failed} failed`);
    console.log('================================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Unhandled test suite error:', err);
    process.exit(1);
  } finally {
    if (spawnedServer) {
      spawnedServer.kill();
    }
  }
}

runSystemicGapsTests();
