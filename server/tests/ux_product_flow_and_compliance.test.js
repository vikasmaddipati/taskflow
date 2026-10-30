// TaskFlow — UX, Product Flow & Compliance Verification Suite (Audit Section 7)
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

  const contentType = response.headers.get('content-type') || '';
  let data;
  if (contentType.includes('application/json')) {
    data = await response.json().catch(() => ({}));
  } else {
    data = await response.text().catch(() => '');
  }

  return { status: response.status, data, headers: response.headers };
}

async function runComplianceAndUxTests() {
  console.log('================================================================');
  console.log('   TaskFlow UX, Product Flow & Compliance Verification (Sec 7)  ');
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
  const testUser = {
    name: 'Compliance User',
    email: `compliance_${timestamp}@example.com`,
    password: 'Password123!'
  };

  let token = '';
  let userId = '';

  try {
    // -------------------------------------------------------------
    // SETUP: Register user & create sample tasks
    // -------------------------------------------------------------
    console.log('--- 1. User Onboarding & Task Creation ---');
    const registerRes = await request('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify(testUser)
    });
    assert(registerRes.status === 201, 'User registered successfully for compliance test');
    token = registerRes.data?.token || '';
    userId = registerRes.data?.user?.id || registerRes.data?.user?._id || '';

    // Create 3 sample tasks for export & date boundary tests
    const task1 = await request('/api/v1/tasks', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        title: 'Task Alpha (Portability Test)',
        description: 'First task for data export',
        priority: 'high',
        category: 'Work',
        dueDate: new Date().toISOString()
      })
    });
    if (task1.status !== 201) {
      console.log('Task1 create response:', task1.status, task1.data);
    }
    assert(task1.status === 201, 'Created first sample task');

    const task2 = await request('/api/v1/tasks', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        title: 'Task Beta (Portability Test)',
        description: 'Second task for data export',
        priority: 'medium',
        category: 'Personal'
      })
    });
    assert(task2.status === 201, 'Created second sample task');

    // -------------------------------------------------------------
    // 7.3 TIMEZONE-AWARE DUE DATE CALCULATIONS
    // -------------------------------------------------------------
    console.log('\n--- 2. Section 7.3: Timezone-Aware Calculation Verification ---');
    const statsResNY = await request('/api/v1/tasks/stats', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-timezone': 'America/New_York'
      }
    });
    assert(statsResNY.status === 200 && statsResNY.data.success, 'Task stats returned with x-timezone header (America/New_York)');
    assert(typeof statsResNY.data.stats.dueToday === 'number', 'Stats includes computed dueToday metric');

    const statsResTokyo = await request('/api/v1/tasks/stats', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-timezone': 'Asia/Tokyo'
      }
    });
    assert(statsResTokyo.status === 200, 'Task stats successfully evaluated with Tokyo timezone');

    // -------------------------------------------------------------
    // 7.7 GDPR ARTICLE 20: DATA PORTABILITY (EXPORT)
    // -------------------------------------------------------------
    console.log('\n--- 3. Section 7.7: GDPR Article 20 Data Portability & Export ---');
    
    // Unauthenticated export rejection
    const unauthExport = await request('/api/v1/tasks/export?format=json', { method: 'GET' });
    assert(unauthExport.status === 401, 'Unauthenticated export is strictly rejected with HTTP 401');

    // JSON export
    const jsonExport = await request('/api/v1/tasks/export?format=json', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` }
    });
    assert(jsonExport.status === 200, 'JSON task export returns HTTP 200 OK');
    const jsonDisposition = jsonExport.headers.get('content-disposition') || '';
    assert(jsonDisposition.includes('filename="taskflow_tasks_export.json"'), 'JSON export specifies attachment disposition filename');
    assert(Array.isArray(jsonExport.data?.tasks) && jsonExport.data.tasks.length >= 2, 'Exported JSON contains array of all user tasks');
    assert(jsonExport.data.tasks[0]?.title && jsonExport.data.tasks[0]?.priority, 'Exported tasks contain structured attributes');

    // CSV export
    const csvExport = await request('/api/v1/tasks/export?format=csv', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` }
    });
    assert(csvExport.status === 200, 'CSV task export returns HTTP 200 OK');
    const csvDisposition = csvExport.headers.get('content-disposition') || '';
    assert(csvDisposition.includes('filename="taskflow_tasks_export.csv"'), 'CSV export specifies attachment disposition filename');
    assert(typeof csvExport.data === 'string' && csvExport.data.includes('Title,Description,Priority,Status,Category'), 'CSV export contains CSV header row');
    assert(csvExport.data.includes('Task Alpha (Portability Test)'), 'CSV export contains task data row');

    // Backward compatible legacy export route
    const legacyExport = await request('/api/tasks/export?format=json', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` }
    });
    assert(legacyExport.status === 200, 'Legacy /api/tasks/export route is backward compatible');

    // -------------------------------------------------------------
    // 7.7 EMAIL CHANGE LIFECYCLE
    // -------------------------------------------------------------
    console.log('\n--- 4. Section 7.7: Email Change Lifecycle Verification ---');

    // Missing current password
    const noPasswordEmailChange = await request('/api/v1/auth/email', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ newEmail: `updated_${timestamp}@example.com` })
    });
    assert(noPasswordEmailChange.status === 400, 'Email change requires current password validation (HTTP 400)');

    // Wrong password
    const wrongPasswordEmailChange = await request('/api/v1/auth/email', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        newEmail: `updated_${timestamp}@example.com`,
        currentPassword: 'WrongPassword!'
      })
    });
    assert(wrongPasswordEmailChange.status === 401, 'Email change rejects incorrect password (HTTP 401)');

    // Duplicate email
    const duplicateEmailChange = await request('/api/v1/auth/email', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        newEmail: testUser.email, // already used
        currentPassword: testUser.password
      })
    });
    assert(duplicateEmailChange.status === 400, 'Email change rejects duplicate/existing email (HTTP 400)');

    // Valid email change
    const newEmail = `updated_${timestamp}@example.com`;
    const validEmailChange = await request('/api/v1/auth/email', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        newEmail,
        currentPassword: testUser.password
      })
    });
    assert(validEmailChange.status === 200 && validEmailChange.data.success, 'Valid email change succeeds with HTTP 200');
    assert(validEmailChange.data.user?.email === newEmail, 'User profile email is updated to new address');
    assert(validEmailChange.data.user?.isEmailVerified === false, 'Updated email resets email verification status');

    // -------------------------------------------------------------
    // 7.7 SESSION REVOCATION (LOGOUT-ALL)
    // -------------------------------------------------------------
    console.log('\n--- 5. Section 7.7: Active Session Revocation ---');
    const logoutAllRes = await request('/api/v1/auth/logout-all', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    assert(logoutAllRes.status === 200 && logoutAllRes.data.success, 'Global session revocation (/logout-all) succeeds');

    // Token version incremented: old token should now be rejected
    const testOldToken = await request('/api/v1/tasks', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` }
    });
    assert(testOldToken.status === 401, 'Pre-revocation token is rejected with HTTP 401 after global logout');

    // Re-authenticate with updated email
    const reAuthRes = await request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: newEmail,
        password: testUser.password
      })
    });
    assert(reAuthRes.status === 200, 'Successfully re-authenticated using updated email address');
    token = reAuthRes.data?.token || '';

    // -------------------------------------------------------------
    // 7.7 GDPR ARTICLE 17: RIGHT TO ERASURE (ACCOUNT DELETION)
    // -------------------------------------------------------------
    console.log('\n--- 6. Section 7.7: GDPR Article 17 Right to Erasure (Account Deletion) ---');

    // Missing confirmation word
    const noConfirmDelete = await request('/api/v1/auth/account', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        password: testUser.password,
        confirmation: 'PLEASE_DELETE' // must be exactly 'DELETE'
      })
    });
    assert(noConfirmDelete.status === 400, 'Account deletion rejects invalid confirmation keyword (HTTP 400)');

    // Wrong password
    const wrongPassDelete = await request('/api/v1/auth/account', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        password: 'IncorrectPassword!',
        confirmation: 'DELETE'
      })
    });
    assert(wrongPassDelete.status === 401, 'Account deletion rejects wrong password (HTTP 401)');

    // Proper account deletion
    const validDelete = await request('/api/v1/auth/account', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        password: testUser.password,
        confirmation: 'DELETE'
      })
    });
    assert(validDelete.status === 200 && validDelete.data.success, 'Account successfully erased with HTTP 200');

    // Verify user can no longer log in
    const deletedLogin = await request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: newEmail,
        password: testUser.password
      })
    });
    assert(deletedLogin.status === 400 || deletedLogin.status === 401, 'Erased user cannot authenticate (HTTP 400/401)');

    // Verify token no longer functions
    const testDeletedToken = await request('/api/v1/tasks', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` }
    });
    assert(testDeletedToken.status === 401, 'Deleted user token is permanently invalid (HTTP 401)');

  } catch (err) {
    console.error('[Test Error]:', err);
    failed++;
  } finally {
    if (spawnedServer) {
      console.log('\n[Teardown] Stopping test API server...');
      spawnedServer.kill();
    }
  }

  console.log('\n================================================================');
  console.log(`Results: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runComplianceAndUxTests();
