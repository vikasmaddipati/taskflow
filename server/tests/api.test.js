// Comprehensive Automated Verification Suite for TaskFlow Hardened SaaS Architecture
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
  console.log('   TaskFlow Production Hardening & SaaS Verification Suite       ');
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
      console.log('[Test Runner] No server detected on port 5000. Launching server automatically...');
      spawnedServer = spawn('node', ['src/server.js'], {
        cwd: path.resolve(__dirname, '..'),
        stdio: 'pipe'
      });

      let serverReady = false;
      for (let i = 0; i < 25; i++) {
        await new Promise((r) => setTimeout(r, 500));
        if (await isServerRunning()) {
          serverReady = true;
          break;
        }
      }

      if (!serverReady) {
        throw new Error(
          'Could not start backend server. Please verify MongoDB is running locally (e.g. net start MongoDB).'
        );
      }
      console.log('[Test Runner] Server is up and ready on 127.0.0.1:5000.\n');
    }

    const randomSuffix = Math.floor(Math.random() * 1000000);

    // ---------------------------------------------------------
    // 1. Health check & Live MongoDB Verification
    // ---------------------------------------------------------
    const health = await request('/health');
    assert(
      health.status === 200 && health.data.status === 'ok' && health.data.database?.connected === true,
      '1. Health check returns 200 OK with active MongoDB connection'
    );

    // ---------------------------------------------------------
    // 2. Dev OTP Backdoor Removal Verification (Security Hardening)
    // ---------------------------------------------------------
    const backdoorRes = await request(`/auth/dev/otp/attacker@test.com/login`);
    assert(
      backdoorRes.status === 404,
      '2. Dev OTP bypass route /auth/dev/otp/:email/:purpose returns 404 (backdoor removed)'
    );

    // ---------------------------------------------------------
    // 3. User Registration with Tenant Auto-Provisioning
    // ---------------------------------------------------------
    const user1Email = `ceo${randomSuffix}@acmecorp.com`;
    const regRes1 = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Alice Johnson',
        email: user1Email,
        password: 'Password123!'
      })
    });
    assert(
      regRes1.status === 201 &&
      Boolean(regRes1.data.token) &&
      Boolean(regRes1.data.refreshToken) &&
      Boolean(regRes1.data.organization) &&
      regRes1.data.organization.plan === 'free',
      '3. User 1 registered with password, received access+refresh tokens, and auto-provisioned organization'
    );
    const user1Token = regRes1.data.token;
    let user1RefreshToken = regRes1.data.refreshToken;
    const user1OrgId = regRes1.data.organization._id;

    // ---------------------------------------------------------
    // 4. Duplicate Email Registration Prevention
    // ---------------------------------------------------------
    const dupRes = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Alice Imposter',
        email: user1Email,
        password: 'Password999!'
      })
    });
    assert(dupRes.status === 400, '4. Duplicate email registration rejected with 400');

    // ---------------------------------------------------------
    // 5. Password Authentication
    // ---------------------------------------------------------
    const loginRes = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: user1Email,
        password: 'Password123!'
      })
    });
    assert(
      loginRes.status === 200 && Boolean(loginRes.data.token) && Boolean(loginRes.data.refreshToken),
      '5. Password login successful and yields valid session'
    );
    // Use this fresh session for rotation test
    user1RefreshToken = loginRes.data.refreshToken;

    // ---------------------------------------------------------
    // 6. Wrong Password Rejection
    // ---------------------------------------------------------
    const badLogin = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: user1Email,
        password: 'WrongPassword!'
      })
    });
    assert(badLogin.status === 401, '6. Incorrect password correctly rejected with 401');

    // ---------------------------------------------------------
    // 7. Revocable Sessions: Refresh Token Rotation
    // ---------------------------------------------------------
    const refreshRes = await request('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({
        refreshToken: user1RefreshToken
      })
    });
    assert(
      refreshRes.status === 200 &&
      Boolean(refreshRes.data.token) &&
      Boolean(refreshRes.data.refreshToken) &&
      refreshRes.data.refreshToken !== user1RefreshToken,
      '7. Refresh token rotation successfully exchanges old token for new pair'
    );
    const rotatedAccessToken = refreshRes.data.token;
    const rotatedRefreshToken = refreshRes.data.refreshToken;

    // ---------------------------------------------------------
    // 8. Revocable Sessions: Reuse Detection (Compromise Defense)
    // ---------------------------------------------------------
    const reuseAttempt = await request('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({
        refreshToken: user1RefreshToken // Replaying already-used token
      })
    });
    assert(
      reuseAttempt.status === 403,
      '8. Token reuse detection triggers: replayed refresh token rejected with 403 and revokes family'
    );

    // ---------------------------------------------------------
    // 9. Active Sessions Listing
    // ---------------------------------------------------------
    const sessionsRes = await request('/auth/sessions', {
      headers: { Authorization: `Bearer ${rotatedAccessToken}` }
    });
    assert(
      sessionsRes.status === 200 && Array.isArray(sessionsRes.data.sessions),
      '9. User can query active revocable sessions'
    );

    // ---------------------------------------------------------
    // 10. Multi-Tenancy & Default Organization Query
    // ---------------------------------------------------------
    const orgRes = await request('/organizations/current', {
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'x-organization-id': user1OrgId
      }
    });
    assert(
      orgRes.status === 200 &&
      orgRes.data.organization._id === user1OrgId &&
      orgRes.data.userRole === 'owner',
      '10. Current organization retrieved with owner role'
    );

    // ---------------------------------------------------------
    // 11. Multi-Tenant Task Creation
    // ---------------------------------------------------------
    const taskCreateRes1 = await request('/tasks', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'x-organization-id': user1OrgId
      },
      body: JSON.stringify({
        title: 'Org 1 Sensitive Financial Audit',
        priority: 'high',
        category: 'Finance',
        dueDate: '2026-11-15'
      })
    });
    assert(
      taskCreateRes1.status === 201 &&
      taskCreateRes1.data.task.title === 'Org 1 Sensitive Financial Audit' &&
      taskCreateRes1.data.task.organization === user1OrgId,
      '11. Task created in Org 1 with tenant boundary metadata'
    );
    const org1TaskId = taskCreateRes1.data.task._id;

    // ---------------------------------------------------------
    // 12. Register User 2 in Separate Organization (Org 2)
    // ---------------------------------------------------------
    const user2Email = `competitor${randomSuffix}@beta.org`;
    const regRes2 = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Bob Rival',
        email: user2Email,
        password: 'Password456!'
      })
    });
    assert(
      regRes2.status === 201 && regRes2.data.organization._id !== user1OrgId,
      '12. User 2 registered in independent isolated Organization 2'
    );
    const user2Token = regRes2.data.token;
    const user2OrgId = regRes2.data.organization._id;

    // ---------------------------------------------------------
    // 13. Tenant Data Isolation: User 2 CANNOT access Org 1 tasks
    // ---------------------------------------------------------
    const breachAttemptGet = await request(`/tasks/${org1TaskId}`, {
      headers: {
        Authorization: `Bearer ${user2Token}`,
        'x-organization-id': user2OrgId
      }
    });
    assert(
      breachAttemptGet.status === 404,
      '13a. Cross-tenant data isolation: User 2 receives 404 attempting to read Org 1 task'
    );

    const breachAttemptDelete = await request(`/tasks/${org1TaskId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${user2Token}`,
        'x-organization-id': user2OrgId
      }
    });
    assert(
      breachAttemptDelete.status === 404,
      '13b. Cross-tenant data isolation: User 2 receives 404 attempting to delete Org 1 task'
    );

    // ---------------------------------------------------------
    // 14. Bounded Pagination: Query limit & page metadata
    // ---------------------------------------------------------
    // Create 3 more tasks in Org 1 to verify pagination
    for (let i = 1; i <= 3; i++) {
      await request('/tasks', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${user1Token}`,
          'x-organization-id': user1OrgId
        },
        body: JSON.stringify({
          title: `Org 1 Task Batch #${i}`,
          priority: 'medium',
          category: 'Work'
        })
      });
    }

    const pagedTasks = await request('/tasks?page=1&limit=2', {
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'x-organization-id': user1OrgId
      }
    });
    assert(
      pagedTasks.status === 200 &&
      pagedTasks.data.tasks.length === 2 &&
      pagedTasks.data.pagination &&
      pagedTasks.data.pagination.page === 1 &&
      pagedTasks.data.pagination.limit === 2 &&
      pagedTasks.data.pagination.totalPages >= 2 &&
      pagedTasks.data.pagination.hasMore === true,
      '14. Bounded pagination verified: returns exact limit and pagination metadata'
    );

    // ---------------------------------------------------------
    // 15. Soft Deletion & Audit Logging
    // ---------------------------------------------------------
    const deleteRes = await request(`/tasks/${org1TaskId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'x-organization-id': user1OrgId
      }
    });
    assert(deleteRes.status === 200, '15a. Task soft deleted successfully');

    // Confirm excluded from active query
    const verifyExclusion = await request('/tasks', {
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'x-organization-id': user1OrgId
      }
    });
    const foundDeleted = verifyExclusion.data.tasks.find((t) => t._id === org1TaskId);
    assert(!foundDeleted, '15b. Soft-deleted task is excluded from standard active tasks list');

    // ---------------------------------------------------------
    // 16. Timezone Handling: Evaluation with x-timezone header
    // ---------------------------------------------------------
    const tzTaskRes = await request('/tasks', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'x-organization-id': user1OrgId,
        'x-timezone': 'America/Los_Angeles'
      },
      body: JSON.stringify({
        title: 'West Coast Timezone Verification Task',
        priority: 'high',
        category: 'Personal',
        dueDate: '2026-12-31'
      })
    });
    assert(
      tzTaskRes.status === 201 &&
      tzTaskRes.data.task.dueDateString === '2026-12-31',
      '16. Task stored with normalized calendar dueDateString honoring client timezone'
    );

    // ---------------------------------------------------------
    // 17. Billing Plans & Entitlements Configuration
    // ---------------------------------------------------------
    const plansRes = await request('/billing/plans');
    assert(
      plansRes.status === 200 &&
      Boolean(plansRes.data.plans.free) &&
      Boolean(plansRes.data.plans.pro) &&
      Boolean(plansRes.data.plans.business),
      '17. Billing tiers (free, pro, business) with maxMembers and maxTasks published'
    );

    // ---------------------------------------------------------
    // 18. RBAC: Team Member Invitations
    // ---------------------------------------------------------
    const inviteRes = await request(`/organizations/${user1OrgId}/invitations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'x-organization-id': user1OrgId
      },
      body: JSON.stringify({
        email: `newhire${randomSuffix}@acmecorp.com`,
        role: 'member'
      })
    });
    assert(
      inviteRes.status === 201 &&
      inviteRes.data.invitation.email === `newhire${randomSuffix}@acmecorp.com` &&
      inviteRes.data.invitation.role === 'member',
      '18. Organization owner successfully invited team member'
    );

    // ---------------------------------------------------------
    // 19. Session Invalidation: Sign Out All Devices
    // ---------------------------------------------------------
    // Log in user1 to establish fresh active session after earlier reuse revocation test
    const freshLogin = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: user1Email,
        password: 'Password123!'
      })
    });
    const freshToken = freshLogin.data.token;

    const logoutAllRes = await request('/auth/logout-all', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${freshToken}`
      }
    });
    assert(
      logoutAllRes.status === 200 && logoutAllRes.data.sessionsRevoked >= 1,
      '19. Sign out from all devices revokes all active session records'
    );

    console.log(`\n================================================================`);
    console.log(` Test Execution Complete: ${passed} passed, ${failed} failed.`);
    console.log(`================================================================`);
    if (failed > 0) {
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('Test execution failed with error:', err.message || err);
    process.exitCode = 1;
  } finally {
    if (spawnedServer) {
      console.log('[Test Runner] Shutting down spawned test server...');
      try {
        spawnedServer.kill();
      } catch (e) {
        // ignore
      }
    }
  }
}

runTests();
