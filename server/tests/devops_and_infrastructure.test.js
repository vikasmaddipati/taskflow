// TaskFlow — Production Infrastructure & DevOps Verification Suite (Audit Section 9)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

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
  return { status: response.status, data };
}

async function runDevOpsTests() {
  console.log('================================================================');
  console.log('   TaskFlow Production Infrastructure & DevOps Suite (Sec 9)    ');
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

  try {
    // -------------------------------------------------------------
    // TEST GROUP 1: DOCKER CONTAINERIZATION & MULTI-STAGE ARTIFACTS
    // -------------------------------------------------------------
    console.log('--- TEST GROUP 1: Docker Containerization & Orchestration ---');

    const serverDockerfile = path.join(ROOT_DIR, 'server/Dockerfile');
    assert(fs.existsSync(serverDockerfile), 'server/Dockerfile exists');
    const serverDockerContent = fs.readFileSync(serverDockerfile, 'utf8');
    assert(serverDockerContent.includes('node:20-alpine'), 'server/Dockerfile uses minimal alpine base');
    assert(serverDockerContent.includes('dumb-init'), 'server/Dockerfile installs dumb-init for PID 1 signal forwarding');
    assert(serverDockerContent.includes('USER node'), 'server/Dockerfile runs container as non-root user');
    assert(serverDockerContent.includes('HEALTHCHECK'), 'server/Dockerfile defines automated container healthcheck');

    const clientDockerfile = path.join(ROOT_DIR, 'client/Dockerfile');
    assert(fs.existsSync(clientDockerfile), 'client/Dockerfile exists');
    const clientDockerContent = fs.readFileSync(clientDockerfile, 'utf8');
    assert(clientDockerContent.includes('FROM nginx:'), 'client/Dockerfile uses high-performance Nginx web server');
    assert(clientDockerContent.includes('COPY --from=builder'), 'client/Dockerfile implements multi-stage asset build');

    const nginxConfPath = path.join(ROOT_DIR, 'client/nginx.conf');
    assert(fs.existsSync(nginxConfPath), 'client/nginx.conf exists');
    const nginxContent = fs.readFileSync(nginxConfPath, 'utf8');
    assert(nginxContent.includes('try_files $uri $uri/ /index.html;'), 'nginx.conf implements SPA HTML5 history routing');
    assert(nginxContent.includes('proxy_pass http://api:5000/api/;'), 'nginx.conf reverse proxies /api/ requests to backend');
    assert(nginxContent.includes('gzip on;'), 'nginx.conf enables gzip compression');

    const composePath = path.join(ROOT_DIR, 'docker-compose.yml');
    assert(fs.existsSync(composePath), 'docker-compose.yml exists at repository root');
    const composeContent = fs.readFileSync(composePath, 'utf8');
    assert(composeContent.includes('--replSet') && composeContent.includes('rs0'), 'docker-compose.yml configures MongoDB replica set for ACID transactions');
    assert(composeContent.includes('mongo-init'), 'docker-compose.yml includes replica set auto-initialization service');
    assert(composeContent.includes('container_name: taskflow_api'), 'docker-compose.yml provisions backend API service');
    assert(composeContent.includes('container_name: taskflow_web'), 'docker-compose.yml provisions frontend web service');

    const dockerignorePath = path.join(ROOT_DIR, '.dockerignore');
    assert(fs.existsSync(dockerignorePath), 'Root .dockerignore exists to protect secrets and ignore node_modules');

    // -------------------------------------------------------------
    // TEST GROUP 2: GRACEFUL SHUTDOWN & KUBERNETES PROBE DRAINING
    // -------------------------------------------------------------
    console.log('\n--- TEST GROUP 2: Graceful Shutdown & Health Probe Draining ---');

    // Normal operation: health probes respond 200 OK
    const normalHealth = await request('/api/health');
    assert(normalHealth.status === 200 && normalHealth.data.healthy === true, 'Normal operation: /api/health reports healthy');

    const normalReady = await request('/api/health/ready');
    assert(normalReady.status === 200 && normalReady.data.status === 'ready', 'Normal operation: /api/health/ready reports ready');

    const normalLive = await request('/api/health/live');
    assert(normalLive.status === 200 && normalLive.data.status === 'alive', 'Normal operation: /api/health/live reports alive');

    // Unit test shutdown draining logic via health controller
    const { getHealth, getReadiness, getLiveness, setShuttingDown } = await import('../src/controllers/healthController.js');

    setShuttingDown(true);

    let healthStatus = 0;
    let healthPayload = null;
    const mockResHealth = {
      setHeader: () => {},
      status: (code) => { healthStatus = code; return mockResHealth; },
      json: (data) => { healthPayload = data; return mockResHealth; }
    };
    await getHealth({}, mockResHealth);
    assert(
      healthStatus === 503 && healthPayload.status === 'terminating',
      'Shutdown phase: /api/health immediately returns 503 terminating to ingress'
    );

    let readyStatus = 0;
    let readyPayload = null;
    const mockResReady = {
      setHeader: () => {},
      status: (code) => { readyStatus = code; return mockResReady; },
      json: (data) => { readyPayload = data; return mockResReady; }
    };
    await getReadiness({}, mockResReady);
    assert(
      readyStatus === 503 && readyPayload.status === 'not_ready',
      'Shutdown phase: /api/health/ready immediately returns 503 not_ready to drop pod traffic'
    );

    let liveStatus = 0;
    let livePayload = null;
    const mockResLive = {
      setHeader: () => {},
      status: (code) => { liveStatus = code; return mockResLive; },
      json: (data) => { livePayload = data; return mockResLive; }
    };
    getLiveness({}, mockResLive);
    assert(
      liveStatus === 503 && livePayload.status === 'terminating',
      'Shutdown phase: /api/health/live returns 503 terminating'
    );

    // Restore shutdown state
    setShuttingDown(false);

    const restoredReady = await request('/api/health/ready');
    assert(restoredReady.status === 200 && restoredReady.data.status === 'ready', 'State restored: health probes resume normal operation');

    // Verify process trap declarations in server.js
    const serverPath = path.join(ROOT_DIR, 'server/src/server.js');
    const serverContent = fs.readFileSync(serverPath, 'utf8');
    assert(serverContent.includes("process.on('SIGTERM'"), 'server.js traps SIGTERM for Kubernetes/Docker container stops');
    assert(serverContent.includes("process.on('SIGINT'"), 'server.js traps SIGINT for manual interrupts');
    assert(serverContent.includes("process.on('SIGHUP'"), 'server.js traps SIGHUP');
    assert(serverContent.includes("process.on('uncaughtException'"), 'server.js traps uncaughtException with graceful teardown');
    assert(serverContent.includes("process.on('unhandledRejection'"), 'server.js traps unhandledRejection with graceful teardown');
    assert(serverContent.includes('server.closeIdleConnections()'), 'server.js terminates idle keep-alive connections on shutdown');
    assert(serverContent.includes('FORCE_SHUTDOWN_TIMEOUT_MS'), 'server.js includes watchdog safety timer for in-flight draining');

  } catch (err) {
    console.error('[DevOps Test Error]:', err);
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

runDevOpsTests();
