import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'http://127.0.0.1:5000';

async function isServerRunning() {
  try {
    const res = await fetch(`${BASE_URL}/api/health`, {
      signal: AbortSignal.timeout(1200)
    });
    return res.ok;
  } catch {
    return false;
  }
}

function runScript(scriptPath) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [scriptPath], {
      stdio: 'inherit',
      cwd: path.resolve(__dirname, '..')
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Script ${scriptPath} exited with code ${code}`));
    });
  });
}

async function runAll() {
  console.log('\n============================================================');
  console.log('   Executing Full TaskFlow Automated Verification Suite     ');
  console.log('============================================================\n');

  let persistentServer = null;

  try {
    const alreadyUp = await isServerRunning();
    if (!alreadyUp) {
      console.log('[Runner Setup] Launching persistent background API server on port 5000...');
      persistentServer = spawn('node', ['src/server.js'], {
        cwd: path.resolve(__dirname, '..'),
        stdio: 'pipe',
        env: { ...process.env, HOST: '127.0.0.1' }
      });
      persistentServer.stdout.on('data', () => {});
      persistentServer.stderr.on('data', () => {});

      let ready = false;
      for (let i = 0; i < 25; i++) {
        await new Promise((r) => setTimeout(r, 500));
        if (await isServerRunning()) {
          ready = true;
          break;
        }
      }
      if (!ready) {
        throw new Error('Could not connect to persistent background API server.');
      }
      console.log('[Runner Setup] Persistent server is running.\n');
    }

    await runScript('tests/api.test.js');
    console.log('\n------------------------------------------------------------\n');
    await runScript('tests/multi_tenant_rbac.test.js');
    console.log('\n------------------------------------------------------------\n');
    await runScript('tests/billing_and_quotas.test.js');
    console.log('\n------------------------------------------------------------\n');
    await runScript('tests/security_and_auth_hardening.test.js');
    console.log('\n------------------------------------------------------------\n');
    await runScript('tests/database_integrity_and_data_hardening.test.js');
    console.log('\n------------------------------------------------------------\n');
    await runScript('tests/api_design_and_architecture.test.js');
    console.log('\n------------------------------------------------------------\n');
    await runScript('tests/ux_product_flow_and_compliance.test.js');
    console.log('\n------------------------------------------------------------\n');
    await runScript('tests/devops_and_infrastructure.test.js');
    console.log('\n------------------------------------------------------------\n');
    await runScript('tests/systemic_gaps_inventory.test.js');
    console.log('\n------------------------------------------------------------\n');
    await runScript('tests/production_deep_gaps.test.js');
    console.log('\n------------------------------------------------------------\n');
    await runScript('tests/ai.test.js');

    console.log('\n============================================================');
    console.log('   All Test Suites Completed Successfully (0 Errors)        ');
    console.log('============================================================\n');
  } catch (err) {
    console.error('\n[Test Suite Failure]', err.message);
    process.exit(1);
  } finally {
    if (persistentServer) {
      console.log('[Runner Teardown] Stopping persistent background API server...');
      persistentServer.kill();
    }
  }
}

runAll();
