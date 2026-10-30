// TaskFlow — API Design & Architectural Hardening Verification Suite
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

async function runApiDesignTests() {
  console.log('================================================================');
  console.log('   TaskFlow API Design & Architectural Hardening Verification   ');
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
    // 6.1: API Versioning Verification (/api/v1 and /api backward compatibility)
    // -------------------------------------------------------------------------
    console.log('--- TEST GROUP 1: API Versioning & Header Verification ---');

    // 1. Version header present on responses
    const v1Health = await request('/api/v1/health');
    assert(
      v1Health.status === 200 && v1Health.headers.get('x-api-version') === '1.0.0',
      'GET /api/v1/health responds with X-API-Version: 1.0.0 header'
    );

    // 2. Backward compatibility alias: /api/health works identically
    const legacyHealth = await request('/api/health');
    assert(
      legacyHealth.status === 200 && legacyHealth.headers.get('x-api-version') === '1.0.0',
      'Legacy alias GET /api/health responds with identical status and version header'
    );

    // 3. User registration via versioned /api/v1/auth/register
    const userEmail = `v1_user_${timestamp}@enterprise.com`;
    const regRes = await request('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'V1 Architect',
        email: userEmail,
        password: 'Password123!'
      })
    });
    assert(
      regRes.status === 201 && regRes.data.token && regRes.headers.get('x-api-version') === '1.0.0',
      'POST /api/v1/auth/register creates user under canonical versioned namespace'
    );
    const token = regRes.data.token;
    const orgId = regRes.data.organization._id;

    // 4. Task listing via versioned /api/v1/tasks
    const taskListRes = await request('/api/v1/tasks', {
      headers: { Authorization: `Bearer ${token}`, 'x-organization-id': orgId }
    });
    assert(
      taskListRes.status === 200 && Array.isArray(taskListRes.data.items),
      'GET /api/v1/tasks returns versioned resource payload'
    );

    // -------------------------------------------------------------------------
    // 6.2: Schema Validation Middleware & NoSQL Injection Protection
    // -------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 2: Schema Validation & NoSQL Injection Protection ---');

    // 1. Zod Schema Validation: Invalid Email format
    const invalidEmailRes = await request('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Invalid Email User',
        email: 'not-an-email',
        password: 'Password123!'
      })
    });
    assert(
      invalidEmailRes.status === 400 &&
        invalidEmailRes.data.code === 'VALIDATION_ERROR' &&
        Array.isArray(invalidEmailRes.data.error?.details),
      'Invalid email format rejected with 400 VALIDATION_ERROR and structured error details'
    );

    // 2. Zod Schema Validation: Short password (<8 characters)
    const shortPwRes = await request('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Short Password User',
        email: `short_pw_${timestamp}@test.com`,
        password: '123'
      })
    });
    assert(
      shortPwRes.status === 400 && shortPwRes.data.code === 'VALIDATION_ERROR',
      'Password shorter than 8 chars rejected with 400 VALIDATION_ERROR'
    );

    // 3. Zod Schema Validation: Empty task title
    const emptyTitleRes = await request('/api/v1/tasks', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'x-organization-id': orgId },
      body: JSON.stringify({
        title: '   ',
        priority: 'high'
      })
    });
    assert(
      emptyTitleRes.status === 400 && emptyTitleRes.data.code === 'VALIDATION_ERROR',
      'Empty task title rejected with 400 VALIDATION_ERROR'
    );

    // 4. Zod Schema Validation: Invalid MongoDB ObjectId param
    const invalidIdRes = await request('/api/v1/tasks/not-a-valid-object-id', {
      headers: { Authorization: `Bearer ${token}`, 'x-organization-id': orgId }
    });
    assert(
      invalidIdRes.status === 400 && invalidIdRes.data.code === 'VALIDATION_ERROR',
      'Non-hexadecimal ObjectId param rejected with 400 VALIDATION_ERROR'
    );

    // 5. NoSQL Operator Stripping in Request Body ($where injection)
    const injectedBodyRes = await request('/api/v1/tasks', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'x-organization-id': orgId },
      body: JSON.stringify({
        title: 'Safe Task from Injection',
        priority: 'high',
        $where: 'sleep(5000)'
      })
    });
    assert(
      injectedBodyRes.status === 201 && injectedBodyRes.data.task?._id,
      'NoSQL $ operators in request body ($where) safely stripped by sanitization middleware'
    );

    // 6. Schema validator rejects non-scalar operator objects
    const injectedTypeRes = await request('/api/v1/tasks', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'x-organization-id': orgId },
      body: JSON.stringify({
        title: 'Safe Task with Injected Status',
        status: { $ne: null }
      })
    });
    assert(
      injectedTypeRes.status === 400 && injectedTypeRes.data.code === 'VALIDATION_ERROR',
      'Schema validator strictly rejects NoSQL operator objects in scalar string fields'
    );

    // 7. NoSQL Operator Stripping in Request Query params ($regex injection)
    const injectedQueryRes = await request('/api/v1/tasks?search[$regex]=.*', {
      headers: { Authorization: `Bearer ${token}`, 'x-organization-id': orgId }
    });
    assert(
      injectedQueryRes.status === 200,
      'NoSQL $regex operator in query parameters stripped without executing arbitrary regex'
    );

    // -------------------------------------------------------------------------
    // 6.3: Deep Production Health Check & Kubernetes Probes
    // -------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 3: Deep Production Health Check & Probes ---');

    // 1. Deep Health Check verification
    assert(
      v1Health.data.healthy === true &&
        v1Health.data.database?.connected === true &&
        v1Health.data.database?.state === 'connected' &&
        typeof v1Health.data.database?.latencyMs === 'number' &&
        typeof v1Health.data.uptimeSeconds === 'number' &&
        v1Health.data.memory?.rss > 0,
      'Deep health check includes active DB ping latency, connection state, uptime, and memory metrics'
    );

    // 2. Kubernetes Liveness Probe
    const livenessRes = await request('/api/v1/health/live');
    assert(
      livenessRes.status === 200 && livenessRes.data.status === 'alive',
      'Liveness probe /api/v1/health/live returns HTTP 200 { status: "alive" }'
    );

    // 3. Kubernetes Readiness Probe
    const readinessRes = await request('/api/v1/health/ready');
    assert(
      readinessRes.status === 200 && readinessRes.data.status === 'ready',
      'Readiness probe /api/v1/health/ready verifies database availability before routing traffic'
    );

    // -------------------------------------------------------------------------
    // 6.4: Standardized Error Architecture Verification
    // -------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 4: Standardized Error Architecture ---');

    // 1. 404 Route Not Found structure
    const notFoundRes = await request('/api/v1/non-existent-endpoint-test');
    assert(
      notFoundRes.status === 404 &&
        notFoundRes.data.success === false &&
        notFoundRes.data.code === 'ROUTE_NOT_FOUND' &&
        Boolean(notFoundRes.data.timestamp) &&
        notFoundRes.data.path === '/api/v1/non-existent-endpoint-test' &&
        notFoundRes.data.error?.code === 'ROUTE_NOT_FOUND',
      'Unmatched routes return standardized error envelope with code, path, and timestamp'
    );

    // 2. 401 Unauthorized structure
    const unauthRes = await request('/api/v1/tasks');
    assert(
      unauthRes.status === 401 &&
        unauthRes.data.success === false &&
        Boolean(unauthRes.data.code) &&
        Boolean(unauthRes.data.message),
      'Unauthorized requests return consistent error shape with machine-readable code'
    );

  } catch (err) {
    console.error('[Unhandled Exception in Test Execution]', err);
    failed++;
  } finally {
    if (spawnedServer) {
      console.log('\n[Teardown] Shutting down spawned test server...');
      spawnedServer.kill();
    }
  }

  console.log('\n================================================================');
  console.log(`   Verification Finished: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runApiDesignTests();
