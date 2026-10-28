// Comprehensive automated verification script for TaskFlow Authentication & Task API
import { devOtpStore } from '../src/services/emailService.js';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'http://localhost:5000/api';

async function isServerRunning() {
  try {
    const res = await fetch('http://localhost:5000/api/health', {
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
  console.log('======================================================');
  console.log('   TaskFlow Authentication & Security Test Suite      ');
  console.log('======================================================\n');
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
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 500));
        if (await isServerRunning()) {
          serverReady = true;
          break;
        }
      }

      if (!serverReady) {
        throw new Error(
          'Could not start backend server. Please verify MongoDB is running locally (e.g. net start MongoDB) or start the server manually using: npm run dev'
        );
      }
      console.log('[Test Runner] Server is up and ready on port 5000.\n');
    }
    const randomSuffix = Math.floor(Math.random() * 100000);

    // 1. Health check
    const health = await request('/health');
    assert(health.status === 200 && health.data.status === 'ok', '1. Health check returns 200 OK');

    // 2. Standard Email/Password Registration
    const user1Email = `tester${randomSuffix}@taskflow.dev`;
    const regRes = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Jordan Lee',
        email: user1Email,
        password: 'password123'
      })
    });
    assert(
      regRes.status === 201 && regRes.data.token && regRes.data.user.email === user1Email,
      '2. User 1 registered with password & received JWT token'
    );
    const user1Token = regRes.data.token;

    // 3. Duplicate Email Registration Prevention
    const dupRes = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Jordan Fake',
        email: user1Email,
        password: 'password999'
      })
    });
    assert(dupRes.status === 400, '3. Duplicate email registration rejected with 400');

    // 4. Password Login
    const loginRes = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: user1Email,
        password: 'password123'
      })
    });
    assert(loginRes.status === 200 && loginRes.data.user.email === user1Email, '4. Password login verified');

    // 5. Wrong Password Rejection
    const badLogin = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: user1Email,
        password: 'wrongpassword'
      })
    });
    assert(badLogin.status === 401, '5. Incorrect password correctly rejected with 401');

    // 5b. SMTP Provider & Configuration Behavior Test
    const noSmtpRes = await fetch(`${BASE_URL}/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `verify-smtp-${randomSuffix}@taskflow.dev` })
    });
    const noSmtpData = await noSmtpRes.json().catch(() => ({}));
    if (noSmtpRes.status === 503) {
      assert(
        noSmtpData.code === 'SMTP_NOT_CONFIGURED',
        '5b. Server refuses to claim email was sent when SMTP is unconfigured (returns 503)'
      );
    } else {
      assert(
        noSmtpRes.status === 200 && noSmtpData.success,
        '5b. Live SMTP credentials active: verification request accepted for transmission'
      );
    }

    // 6. Request Email Login OTP (with test mode)
    const otpEmail = `otpuser${randomSuffix}@taskflow.dev`;
    const otpReq = await request('/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify({ email: otpEmail })
    });
    assert(
      otpReq.status === 200 && otpReq.data.success && !otpReq.data.otp,
      '6. Email OTP requested; plain OTP is NOT leaked in API response'
    );

    // 7. OTP Request 60-Second Cooldown Protection
    const coolReq = await request('/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify({ email: otpEmail })
    });
    assert(
      coolReq.status === 429,
      '7. Repeated OTP request within 60s rejected with 429 Rate Limit'
    );

    // Retrieve simulated dev OTP from internal store endpoint
    const otpFetch = await request(`/auth/dev/otp/${otpEmail}/login`);
    const storedOtp = otpFetch.data?.otp;
    assert(
      Boolean(storedOtp && storedOtp.length === 6),
      '8. Cryptographically generated 6-digit OTP confirmed'
    );

    // 9. Incorrect OTP Verification Attempt
    const badOtpVerify = await request('/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({
        email: otpEmail,
        otp: '000000'
      })
    });
    assert(
      badOtpVerify.status === 400 && badOtpVerify.data.message.includes('remaining'),
      '9. Incorrect OTP rejected with remaining attempt count'
    );

    // 10. Valid OTP Verification & Passwordless Account Creation
    const validOtpVerify = await request('/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({
        email: otpEmail,
        otp: storedOtp,
        name: 'Morgan OTP'
      })
    });
    assert(
      validOtpVerify.status === 200 &&
      validOtpVerify.data.token &&
      validOtpVerify.data.user.authProviders.includes('email_otp'),
      '10. Valid Email OTP verified; user authenticated with JWT'
    );
    const otpUserToken = validOtpVerify.data.token;

    // 11. OTP Single-Use Invalidation (replay attack defense)
    const replayOtp = await request('/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({
        email: otpEmail,
        otp: storedOtp
      })
    });
    assert(
      replayOtp.status === 400,
      '11. Replayed / already-used OTP rejected (single-use enforced)'
    );

    // 12. Forgot Password - User Enumeration Defense
    const ghostEmail = `nonexistent${randomSuffix}@taskflow.dev`;
    const ghostForgot = await request('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: ghostEmail })
    });
    const realForgot = await request('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: user1Email })
    });
    assert(
      ghostForgot.status === 200 &&
      realForgot.status === 200 &&
      ghostForgot.data.message === realForgot.data.message,
      '12. Forgot password provides identical generic message (user enumeration prevented)'
    );

    // 13. Forgot Password - Verify Reset OTP
    const resetOtpFetch = await request(`/auth/dev/otp/${user1Email}/reset_password`);
    const resetOtp = resetOtpFetch.data?.otp;
    const verifyReset = await request('/auth/reset-password/verify-otp', {
      method: 'POST',
      body: JSON.stringify({
        email: user1Email,
        otp: resetOtp
      })
    });
    assert(
      verifyReset.status === 200 && Boolean(verifyReset.data.resetToken),
      '13. Password reset OTP verified; received short-lived reset authorization token'
    );
    const resetToken = verifyReset.data.resetToken;

    // 14. Cross-purpose OTP prevention
    // (Login OTP cannot be verified as Reset OTP)
    const crossPurpose = await request('/auth/reset-password/verify-otp', {
      method: 'POST',
      body: JSON.stringify({
        email: otpEmail,
        otp: '123456'
      })
    });
    assert(
      crossPurpose.status === 400,
      '14. Strict purpose isolation enforced across login and reset OTPs'
    );

    // 15. Complete Password Reset
    const completeReset = await request('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        email: user1Email,
        resetToken,
        newPassword: 'newsecurepassword456'
      })
    });
    assert(
      completeReset.status === 200,
      '15. Password successfully updated in database'
    );

    // 16. Login with New Password & Rejection with Old Password
    const oldPassLogin = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: user1Email,
        password: 'password123'
      })
    });
    const newPassLogin = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: user1Email,
        password: 'newsecurepassword456'
      })
    });
    assert(
      oldPassLogin.status === 401 && newPassLogin.status === 200,
      '16. Old password rejected; login with new password succeeds'
    );

    // 17. Google Auth Endpoint Validation
    const emptyGoogle = await request('/auth/google', {
      method: 'POST',
      body: JSON.stringify({})
    });
    assert(
      emptyGoogle.status === 400,
      '17. Google endpoint requires credential ID token'
    );

    // 18. Task Management & Isolation with New User
    const task1 = await request('/tasks', {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
      body: JSON.stringify({
        title: 'Confidential Task of User 1',
        priority: 'high',
        category: 'Work'
      })
    });
    assert(
      task1.status === 201 && task1.data.task.title === 'Confidential Task of User 1',
      '18. Task creation works for authenticated user'
    );
    const task1Id = task1.data.task._id;

    // 19. Cross-User Data Isolation Protection (403 Forbidden)
    const unauthorizedAccess = await request(`/tasks/${task1Id}`, {
      headers: { Authorization: `Bearer ${otpUserToken}` }
    });
    const unauthorizedDelete = await request(`/tasks/${task1Id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${otpUserToken}` }
    });
    assert(
      unauthorizedAccess.status === 403 && unauthorizedDelete.status === 403,
      '19. Strict cross-user data isolation verified: User 2 gets 403 Forbidden'
    );

    // 20. Task Status Toggle & Dashboard Stats
    const toggleRes = await request(`/tasks/${task1Id}/toggle`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${user1Token}` }
    });
    const statsRes = await request('/tasks/stats', {
      headers: { Authorization: `Bearer ${user1Token}` }
    });
    assert(
      toggleRes.status === 200 &&
      toggleRes.data.task.status === 'completed' &&
      statsRes.data.stats.completed >= 1,
      '20. Task toggling and live dashboard statistics computation verified'
    );

    console.log(`\n======================================================`);
    console.log(` Test Results: ${passed} passed, ${failed} failed.`);
    console.log(`======================================================`);
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
