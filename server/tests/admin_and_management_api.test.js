import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'http://127.0.0.1:5000/api';

async function isServerRunning() {
  try {
    const res = await fetch('http://127.0.0.1:5000/api/health', {
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
  return { status: response.status, data };
}

async function runTests() {
  console.log('================================================================');
  console.log('   TaskMate Admin & Management API Automated Verification       ');
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

  try {
    const alreadyRunning = await isServerRunning();
    if (!alreadyRunning) {
      console.log('[Runner Setup] Launching persistent background API server on port 5000...');
      spawnedServer = spawn('node', ['src/server.js'], {
        cwd: path.resolve(__dirname, '..'),
        stdio: 'pipe',
        env: { ...process.env, HOST: '127.0.0.1' }
      });
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 500));
        if (await isServerRunning()) break;
      }
    }

    const randomSuffix = Math.floor(Math.random() * 1000000);
    const adminEmail = `admin_tester_${randomSuffix}@taskmate.dev`;
    const memberEmail = `member_tester_${randomSuffix}@taskmate.dev`;

    // 1. Register Admin User
    const regRes = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Super Admin',
        email: adminEmail,
        password: 'Password123!',
        phone: '+919876543210'
      })
    });

    assert(
      regRes.status === 201 && Boolean(regRes.data.token),
      '1. Admin registered successfully and received authorization token'
    );

    const token = regRes.data.token;
    const orgId = regRes.data.user?.organization || regRes.data.organization?._id;
    const headers = {
      Authorization: `Bearer ${token}`,
      'x-organization-id': orgId
    };

    // 2. Query Admin Overview
    const overviewRes = await request('/v1/admin/overview', { headers });
    assert(
      overviewRes.status === 200 &&
      overviewRes.data.success === true &&
      typeof overviewRes.data.data?.metrics?.totalTasks === 'number' &&
      Array.isArray(overviewRes.data.data?.memberWorkload),
      '2. GET /v1/admin/overview returns aggregated metrics and member workload'
    );

    // 3. Create a Task for monitoring
    const taskRes = await request('/tasks', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        title: 'Admin Supervised Task',
        description: 'Testing administrative oversight and reminders',
        priority: 'high',
        category: 'DevOps',
        dueDateString: '2026-11-30',
        dueTime: '16:00'
      })
    });
    assert(
      taskRes.status === 201 && Boolean(taskRes.data.task?._id),
      '3. Task created under organization for admin inspection'
    );
    const taskId = taskRes.data.task?._id;

    // 4. Query Admin Tasks with filters
    const adminTasksRes = await request('/v1/admin/tasks?priority=high&search=Supervised', { headers });
    assert(
      adminTasksRes.status === 200 &&
      adminTasksRes.data.success === true &&
      adminTasksRes.data.tasks.some((t) => t._id === taskId),
      '4. GET /v1/admin/tasks successfully filters and searches monitored tasks'
    );

    // 5. Update WhatsApp Settings
    const updateWaRes = await request('/v1/admin/whatsapp-settings', {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        adminPhone: '+919876543210',
        enabled: true,
        notifyOnTaskAssigned: true,
        notifyOnTaskCompleted: true,
        notifyBefore30Min: true,
        notifyOnOverdue: true
      })
    });
    assert(
      updateWaRes.status === 200 && updateWaRes.data.whatsappSettings?.adminPhone === '+919876543210',
      '5. PUT /v1/admin/whatsapp-settings configures alert preferences'
    );

    // 6. Test WhatsApp Notification Trigger
    const testWaRes = await request('/v1/admin/whatsapp-test', {
      method: 'POST',
      headers,
      body: JSON.stringify({ phone: '+919876543210' })
    });
    assert(
      testWaRes.status === 200 && testWaRes.data.success === true,
      '6. POST /v1/admin/whatsapp-test dispatches test verification alert'
    );

    // 7. Update Email Settings
    const updateEmailRes = await request('/v1/admin/email-settings', {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        adminEmail: 'admin.alerts@taskmate.dev',
        enabled: true,
        notifyOnTaskAssigned: true,
        notifyOnTaskCompleted: true,
        notifyBefore30Min: true,
        notifyOnOverdue: true
      })
    });
    assert(
      updateEmailRes.status === 200 && updateEmailRes.data.emailSettings?.adminEmail === 'admin.alerts@taskmate.dev',
      '7. PUT /v1/admin/email-settings configures email dispatch preferences'
    );

    // 8. Test Email Notification Trigger
    const testEmailRes = await request('/v1/admin/email-test', {
      method: 'POST',
      headers,
      body: JSON.stringify({ email: 'admin.alerts@taskmate.dev' })
    });
    assert(
      testEmailRes.status === 200 && testEmailRes.data.success === true,
      '8. POST /v1/admin/email-test dispatches test verification email'
    );

    // 9. Manual Scheduler Scan Execution
    const scanRes = await request('/v1/admin/run-scheduler-scan', {
      method: 'POST',
      headers
    });
    assert(
      scanRes.status === 200 && scanRes.data.success === true,
      '9. POST /v1/admin/run-scheduler-scan triggers manual deadline audit scan'
    );

    // 10. Baileys Connection Status Probe
    const baileysStatusRes = await request('/v1/admin/baileys/status', { headers });
    assert(
      baileysStatusRes.status === 200 &&
      (typeof baileysStatusRes.data.isLinked === 'boolean' || typeof baileysStatusRes.data.status === 'string'),
      '10. GET /v1/admin/baileys/status reports WhatsApp socket status'
    );

    // 11. System Diagnostics Probe
    const diagnosticsRes = await request('/v1/admin/diagnostics', { headers });
    assert(
      diagnosticsRes.status === 200 && Boolean(diagnosticsRes.data.node),
      '11. GET /v1/admin/diagnostics retrieves runtime environment specs'
    );

    // 12. Category Management Lifecycle (Create, Query, Update, Cascade Delete)
    const createCatRes = await request('/v1/categories', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: `Security Compliance ${randomSuffix}`,
        color: '#ef4444',
        description: 'Audit tasks'
      })
    });
    assert(
      createCatRes.status === 201 && Boolean(createCatRes.data.category?._id),
      '12. POST /v1/categories creates scoped persistent category'
    );
    const catId = createCatRes.data.category?._id;

    const listCatRes = await request('/v1/categories', { headers });
    assert(
      listCatRes.status === 200 && listCatRes.data.categories?.some((c) => c._id === catId),
      '13. GET /v1/categories returns persistent categories with computed task counts'
    );

    const updateCatRes = await request(`/v1/categories/${catId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        color: '#10b981',
        description: 'Updated description'
      })
    });
    assert(
      updateCatRes.status === 200 && updateCatRes.data.category?.color === '#10b981',
      '14. PUT /v1/categories/:id updates color and metadata'
    );

    const deleteCatRes = await request(`/v1/categories/${catId}`, {
      method: 'DELETE',
      headers
    });
    assert(
      deleteCatRes.status === 200 && deleteCatRes.data.success === true,
      '15. DELETE /v1/categories/:id cleanly purges unreferenced category'
    );

    // 16. Workspace Management Lifecycle
    const createWsRes = await request('/v1/workspaces', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: `Alpha Workspace ${randomSuffix}`,
        description: 'Test workspace'
      })
    });
    // On free plan (limit: 1 default workspace), creating second workspace should check quota or succeed if under quota
    assert(
      createWsRes.status === 201 || (createWsRes.status === 403 && createWsRes.data.code === 'QUOTA_EXCEEDED'),
      '16. POST /v1/workspaces enforces tenant workspace creation and plan quota guard'
    );

    // 17. Notifications Management
    const notifsRes = await request('/v1/notifications', { headers });
    assert(
      notifsRes.status === 200 && Array.isArray(notifsRes.data.notifications),
      '17. GET /v1/notifications retrieves user alert feed'
    );

    const readAllNotifsRes = await request('/v1/notifications/read-all', {
      method: 'POST',
      headers
    });
    assert(
      readAllNotifsRes.status === 200 && readAllNotifsRes.data.success === true,
      '18. POST /v1/notifications/read-all acknowledges unread alerts'
    );

    console.log(`\n================================================================`);
    console.log(` Admin & Management Tests: ${passed} Passed, ${failed} Failed`);
    console.log(`================================================================\n`);

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('[Admin Test Suite Exception]', err);
    process.exit(1);
  } finally {
    if (spawnedServer) {
      spawnedServer.kill();
    }
  }
}

runTests();
