import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

  try {
    await runScript('tests/api.test.js');
    console.log('\n------------------------------------------------------------\n');
    await runScript('tests/multi_tenant_rbac.test.js');
    console.log('\n------------------------------------------------------------\n');
    await runScript('tests/billing_and_quotas.test.js');
    console.log('\n------------------------------------------------------------\n');
    await runScript('tests/security_and_auth_hardening.test.js');
    console.log('\n============================================================');
    console.log('   All Test Suites Completed Successfully (0 Errors)        ');
    console.log('============================================================\n');
  } catch (err) {
    console.error('\n[Test Suite Failure]', err.message);
    process.exit(1);
  }
}

runAll();
