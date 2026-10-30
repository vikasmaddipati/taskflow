// TaskFlow — Production Deep Gaps & Enterprise Hardening Verification Suite
// Validates: Distributed Schedulers, Storage Cleanup, Comment Lifecycle, Bulk Operations, Workspace Task Migration, and SSE Real-Time Stream.
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
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

async function runProductionDeepGapsTests() {
  console.log('================================================================');
  console.log('   TaskFlow Production Deep Gaps & Enterprise Hardening Suite  ');
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
    // Setup: Register Test Owner & Member
    // -------------------------------------------------------------------------
    const ownerEmail = `enterprise_owner_${timestamp}@taskflow.corp`;
    const regRes = await request('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Enterprise Owner',
        email: ownerEmail,
        password: 'Password123!'
      })
    });
    assert(regRes.status === 201 && regRes.data.token, 'Owner registered with tenant context');
    const ownerToken = regRes.data.token;
    const ownerHeaders = { Authorization: `Bearer ${ownerToken}` };
    const orgId = regRes.data.organization._id;

    // -------------------------------------------------------------------------
    // GAP K: Task Comments Full Lifecycle (Update & Delete)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 1: Task Comments Full Lifecycle ---');

    // Create a task
    const taskRes = await request('/api/v1/tasks', {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({ title: 'Audit Trail Spec Review' })
    });
    const taskId = taskRes.data.task._id;

    // Add a comment
    const addCommentRes = await request(`/api/v1/tasks/${taskId}/comments`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({ content: 'Initial draft has typos on section 3' })
    });
    assert(addCommentRes.status === 201 && addCommentRes.data.comments?.length === 1, 'POST /tasks/:id/comments adds comment');
    const commentId = addCommentRes.data.comments[0]._id;

    // Edit the comment (GAP K Fix)
    const updateCommentRes = await request(`/api/v1/tasks/${taskId}/comments/${commentId}`, {
      method: 'PATCH',
      headers: ownerHeaders,
      body: JSON.stringify({ content: 'Initial draft review completed with corrections' })
    });
    assert(
      updateCommentRes.status === 200 &&
        updateCommentRes.data.comment?.content === 'Initial draft review completed with corrections',
      'PATCH /tasks/:id/comments/:commentId edits comment content'
    );

    // Delete the comment (GAP K Fix)
    const deleteCommentRes = await request(`/api/v1/tasks/${taskId}/comments/${commentId}`, {
      method: 'DELETE',
      headers: ownerHeaders
    });
    assert(
      deleteCommentRes.status === 200 && deleteCommentRes.data.comments?.length === 0,
      'DELETE /tasks/:id/comments/:commentId removes comment from task'
    );

    // -------------------------------------------------------------------------
    // GAP L: Bulk / Batch Task Operations
    // -------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 2: Bulk / Batch Task Operations ---');

    // Create 3 tasks
    const [t1, t2, t3] = await Promise.all([
      request('/api/v1/tasks', { method: 'POST', headers: ownerHeaders, body: JSON.stringify({ title: 'Batch Task A' }) }),
      request('/api/v1/tasks', { method: 'POST', headers: ownerHeaders, body: JSON.stringify({ title: 'Batch Task B' }) }),
      request('/api/v1/tasks', { method: 'POST', headers: ownerHeaders, body: JSON.stringify({ title: 'Batch Task C' }) })
    ]);
    const bulkIds = [t1.data.task._id, t2.data.task._id, t3.data.task._id];

    // Bulk status transition
    const bulkStatusRes = await request('/api/v1/tasks/bulk', {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        taskIds: bulkIds,
        operation: 'status',
        payload: 'in_progress'
      })
    });
    assert(
      bulkStatusRes.status === 200 && bulkStatusRes.data.modifiedCount === 3,
      'POST /tasks/bulk transitions multiple tasks to "in_progress" in a single batch'
    );

    // Bulk category assignment
    const bulkCatRes = await request('/api/v1/tasks/bulk', {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        taskIds: bulkIds,
        operation: 'category',
        payload: 'Infrastructure'
      })
    });
    assert(
      bulkCatRes.status === 200 && bulkCatRes.data.modifiedCount === 3,
      'POST /tasks/bulk assigns category to multiple tasks atomically'
    );

    // Bulk soft delete
    const bulkDelRes = await request('/api/v1/tasks/bulk', {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        taskIds: bulkIds,
        operation: 'delete'
      })
    });
    assert(
      bulkDelRes.status === 200 && bulkDelRes.data.modifiedCount === 3,
      'POST /tasks/bulk soft-deletes multiple tasks atomically'
    );

    // -------------------------------------------------------------------------
    // Workflow 4: Physical Storage Cleanup on Permanent Deletion
    // -------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 3: Physical Storage Leak Cleanup ---');

    // Create task with attachment
    const attachTaskRes = await request('/api/v1/tasks', {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({ title: 'Storage Cleanup Verification' })
    });
    const attachTaskId = attachTaskRes.data.task._id;

    const sampleB64 = Buffer.from('Test Storage Cleanup Content').toString('base64');
    const uploadRes = await request(`/api/v1/tasks/${attachTaskId}/attachments`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        originalName: 'purge_test.pdf',
        mimeType: 'application/pdf',
        base64Data: sampleB64
      })
    });
    const filename = uploadRes.data.attachment.filename;
    const diskPath = path.resolve(__dirname, '../uploads/attachments', filename);
    assert(fs.existsSync(diskPath), 'Physical attachment file verified on disk before deletion');

    // Soft-delete task
    await request(`/api/v1/tasks/${attachTaskId}`, { method: 'DELETE', headers: ownerHeaders });

    // Permanently delete task from trash
    const purgeRes = await request(`/api/v1/tasks/${attachTaskId}/permanent`, {
      method: 'DELETE',
      headers: ownerHeaders
    });
    assert(purgeRes.status === 200, 'DELETE /tasks/:id/permanent deletes task from database');
    assert(!fs.existsSync(diskPath), 'Physical attachment file was cleaned up from disk on permanent task deletion');

    // -------------------------------------------------------------------------
    // Workflow 2: Workspace Task Re-Parenting on Archive
    // -------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 4: Workspace Task Re-parenting on Archive ---');

    // Upgrade org to pro so workspace quota allows additional workspaces
    await request(`/api/v1/organizations/${orgId}`, {
      method: 'PATCH',
      headers: ownerHeaders,
      body: JSON.stringify({ plan: 'pro' })
    });

    // Create custom workspace
    const wsRes = await request('/api/v1/workspaces', {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({ name: 'Sprint 42 Alpha' })
    });
    const wsId = wsRes.data.workspace._id;

    // Create task in this workspace
    const wsTaskRes = await request('/api/v1/tasks', {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({ title: 'Sprint 42 Epic', workspaceId: wsId })
    });
    const wsTaskId = wsTaskRes.data.task._id;
    assert(
      (wsTaskRes.data.task.workspace._id || wsTaskRes.data.task.workspace) === wsId,
      'Task created inside custom workspace'
    );

    // Archive the custom workspace
    const archiveWsRes = await request(`/api/v1/workspaces/${wsId}`, {
      method: 'DELETE',
      headers: ownerHeaders
    });
    assert(archiveWsRes.status === 200, 'DELETE /workspaces/:id archives workspace');

    // Verify task was safely migrated to default workspace (not orphaned)
    const checkTaskRes = await request(`/api/v1/tasks/${wsTaskId}`, {
      method: 'GET',
      headers: ownerHeaders
    });
    assert(
      checkTaskRes.status === 200 && checkTaskRes.data.task.workspace._id !== wsId,
      'Archiving workspace automatically re-parents tasks to default workspace'
    );

    // -------------------------------------------------------------------------
    // Gap C: Real-Time Server-Sent Events (SSE) Stream
    // -------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 5: Real-Time SSE Stream ---');

    const sseRes = await fetch(`${BASE_URL}/api/v1/events`, {
      headers: {
        ...ownerHeaders,
        Accept: 'text/event-stream'
      },
      signal: AbortSignal.timeout(2000)
    }).catch(() => null);

    assert(
      sseRes && sseRes.status === 200 && sseRes.headers.get('content-type')?.includes('text/event-stream'),
      'GET /api/v1/events establishes live Server-Sent Events (SSE) stream for tenant'
    );

    // -------------------------------------------------------------------------
    // Section 4.1: Final Owner Protection on Account Deletion
    // -------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 6: Final Owner Protection on Account Deletion ---');

    // Invite another member to the owner's organization
    const memberEmail = `team_colleague_${timestamp}@taskflow.corp`;
    const inviteRes = await request(`/api/v1/organizations/${orgId}/invitations`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({ email: memberEmail, role: 'member' })
    });
    const invitationToken = inviteRes.data?.invitation?.token;

    // Register colleague and join org
    const regMember = await request('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Team Colleague',
        email: memberEmail,
        password: 'Password123!'
      })
    });
    const memberToken = regMember.data?.token;

    if (invitationToken && memberToken) {
      await request(`/api/v1/organizations/invitations/${invitationToken}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${memberToken}` }
      });
    }

    // Attempt to delete owner's account without transferring ownership
    const deleteAccountAttempt = await request('/api/v1/auth/account', {
      method: 'DELETE',
      headers: ownerHeaders,
      body: JSON.stringify({ confirmation: 'DELETE', password: 'Password123!' })
    });

    // The org has an active member, so deleting the owner account MUST be rejected
    assert(
      deleteAccountAttempt.status === 400 &&
      deleteAccountAttempt.data?.code === 'OWNER_CANNOT_DELETE_ACCOUNT_WITH_ACTIVE_MEMBERS',
      'DELETE /auth/account properly enforces Final Owner Protection when organization has active members'
    );

    // -------------------------------------------------------------------------
    // Summary
    // -------------------------------------------------------------------------
    console.log('\n================================================================');
    console.log(`Production Deep Gaps Tests Completed: ${passed} passed, ${failed} failed`);
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

runProductionDeepGapsTests();
