// Comprehensive Security Hardening, JWT Fallback Removal, CORS, and Session Verification Suite
import dotenv from 'dotenv';
dotenv.config();
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { isValidEmail, normalizeEmail } from '../src/utils/validators.js';

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
  return { status: response.status, headers: response.headers, data };
}

async function runSecurityTests() {
  console.log('================================================================');
  console.log('   TaskFlow Critical Security & Authentication Hardening Suite   ');
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
      console.log('[Test Runner] Launching backend server...');
      spawnedServer = spawn('node', ['src/server.js'], {
        cwd: path.resolve(__dirname, '..'),
        stdio: 'pipe'
      });

      for (let i = 0; i < 25; i++) {
        await new Promise((r) => setTimeout(r, 500));
        if (await isServerRunning()) break;
      }
    }

    const uid = Math.floor(Math.random() * 1000000);
    const testEmail = `sec_user_${uid}@acme.cloud`;

    // -------------------------------------------------------------
    // Test 1: Security Headers (Helmet)
    // -------------------------------------------------------------
    console.log('\n--- Section 1: Security Headers (Helmet) ---');
    const healthRes = await fetch(`${BASE_URL}/health`);
    assert(
      healthRes.headers.get('x-content-type-options') === 'nosniff',
      '1. X-Content-Type-Options: nosniff is enforced'
    );
    assert(
      healthRes.headers.get('x-frame-options') === 'SAMEORIGIN',
      '2. Clickjacking protection: X-Frame-Options is SAMEORIGIN'
    );
    assert(
      Boolean(healthRes.headers.get('content-security-policy')),
      '3. Content-Security-Policy is present and configured'
    );
    assert(
      healthRes.headers.get('referrer-policy') === 'strict-origin-when-cross-origin',
      '4. Referrer-Policy is strict-origin-when-cross-origin'
    );

    // -------------------------------------------------------------
    // Test 2: CORS Hardening
    // -------------------------------------------------------------
    console.log('\n--- Section 2: CORS Hardening & Origin Allowlist ---');
    // Preflight from approved origin
    const approvedPreflight = await fetch(`${BASE_URL}/auth/login`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type, Authorization'
      }
    });
    assert(
      approvedPreflight.headers.get('access-control-allow-origin') === 'http://localhost:5173',
      '5. Approved origin receives Access-Control-Allow-Origin header on preflight'
    );
    assert(
      approvedPreflight.headers.get('access-control-allow-credentials') === 'true',
      '6. Credentialed requests enabled for approved origin'
    );

    // Preflight from unauthorized external origin
    const unapprovedPreflight = await fetch(`${BASE_URL}/auth/login`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://evil-attacker-site.com',
        'Access-Control-Request-Method': 'POST'
      }
    });
    assert(
      unapprovedPreflight.headers.get('access-control-allow-origin') !== 'https://evil-attacker-site.com',
      '7. Unauthorized origin rejected without Access-Control-Allow-Origin header'
    );

    // -------------------------------------------------------------
    // Test 3: JWT Fallback Prevention & Signature Validation
    // -------------------------------------------------------------
    console.log('\n--- Section 3: JWT Fallback Elimination & Tampering Defense ---');

    // Attempt request with token signed by insecure public default secret
    const forgedToken = jwt.sign(
      { id: '65f123456789012345678901', type: 'access' },
      'dev_fallback_only_active_in_test_env_32chars_min_length',
      { expiresIn: '15m', algorithm: 'HS256' }
    );

    const forgedRes = await request('/auth/me', {
      headers: { Authorization: `Bearer ${forgedToken}` }
    });
    assert(
      forgedRes.status === 401 && forgedRes.data.code === 'TOKEN_INVALID',
      '8. Token signed with old/insecure fallback secret rejected with 401 TOKEN_INVALID'
    );

    // Attempt request with 'none' algorithm token
    const headerBase64 = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payloadBase64 = Buffer.from(JSON.stringify({ id: '65f123456789012345678901', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
    const algNoneToken = `${headerBase64}.${payloadBase64}.`;

    const algNoneRes = await request('/auth/me', {
      headers: { Authorization: `Bearer ${algNoneToken}` }
    });
    assert(
      algNoneRes.status === 401,
      '9. Algorithm switching attack (alg: none) rejected with 401'
    );

    // -------------------------------------------------------------
    // Test 4: OTP Backdoor Removal
    // -------------------------------------------------------------
    console.log('\n--- Section 4: OTP Backdoor & Brute-Force Defense ---');
    const backdoorRes = await request(`/auth/dev/otp/${testEmail}/login`);
    assert(
      backdoorRes.status === 404,
      '10. Development OTP backdoor /auth/dev/otp/:email/:purpose returns 404'
    );

    // -------------------------------------------------------------
    // Test 5: Email Validation & Modern TLDs
    // -------------------------------------------------------------
    console.log('\n--- Section 5: Standards-Compliant Email Validation ---');
    const modernValidEmails = [
      'user@company.cloud',
      'alex@design.agency',
      'dev@techflow.online',
      'eng@deeptech.engineering',
      'shop@clothing.store',
      'curator@art.museum',
      'first.last+tag@sub.example.org'
    ];

    let allModernPassed = true;
    for (const validEmail of modernValidEmails) {
      if (!isValidEmail(validEmail)) {
        allModernPassed = false;
        console.error(`Unexpected validation failure for: ${validEmail}`);
      }
    }
    assert(allModernPassed, '11. Modern domain TLDs (.cloud, .agency, .online, .engineering, .store, .museum, subdomains, plus-addressing) accepted');

    const invalidEmails = [
      'plainaddress',
      '@missinglocal.com',
      'missingat.domain.com',
      'user@.missingdomain.com',
      'user@domain..com',
      'user..name@domain.com',
      'user@domain.c', // Single-character TLD is invalid
      'user space@domain.com'
    ];

    let allInvalidRejected = true;
    for (const badEmail of invalidEmails) {
      if (isValidEmail(badEmail)) {
        allInvalidRejected = false;
        console.error(`Invalid email accepted incorrectly: ${badEmail}`);
      }
    }
    assert(allInvalidRejected, '12. Malformed emails and invalid syntax rejected');

    // Normalization check
    const rawInput = '   User.Name+Task@Acme.CLOUD   ';
    assert(
      normalizeEmail(rawInput) === 'user.name+task@acme.cloud',
      '13. Email normalization correctly trims surrounding whitespace and lowercases input'
    );

    // -------------------------------------------------------------
    // Test 6: Registration & Email Verification Flow
    // -------------------------------------------------------------
    console.log('\n--- Section 6: Registration & Email Verification ---');
    const regRes = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Security Test User',
        email: testEmail,
        password: 'Password123!@#'
      })
    });
    if (regRes.status !== 201) {
      console.log('[DEBUG regRes]', regRes.status, regRes.data);
    }

    assert(regRes.status === 201, '14. User registered successfully');
    assert(regRes.data.requiresVerification === true, '15. Registration indicates email verification is required');
    assert(regRes.data.user?.isEmailVerified === false, '16. New account initialized with isEmailVerified: false');
    assert(Boolean(regRes.data.csrfToken), '17. Anti-CSRF token issued upon registration');

    const cookies = regRes.headers.get('set-cookie') || '';
    assert(
      cookies.includes('tm_access_token') && cookies.includes('HttpOnly'),
      '18. HttpOnly cookie tm_access_token set by backend'
    );

    // Resend verification with cooldown
    const resendCooldown = await request('/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email: testEmail })
    });
    assert(
      resendCooldown.status === 429,
      '19. Resend email verification enforces 60-second cooldown rate limit (HTTP 429)'
    );

    // -------------------------------------------------------------
    // Test 7: Mobile / Android Authentication Compatibility
    // -------------------------------------------------------------
    console.log('\n--- Section 7: Mobile & Android Client Compatibility ---');
    const bearerToken = regRes.data.token;
    const mobileMeRes = await request('/auth/me', {
      headers: { Authorization: `Bearer ${bearerToken}` }
    });
    assert(
      mobileMeRes.status === 200 && mobileMeRes.data.user.email === testEmail,
      '20. Mobile/Android Bearer token authentication verified seamlessly without cookies'
    );

    // -------------------------------------------------------------
    // Test 8: Refresh Token Rotation & Token Theft Reuse Defense
    // -------------------------------------------------------------
    console.log('\n--- Section 8: Refresh Token Rotation & Reuse Detection ---');
    const originalRefreshToken = regRes.data.refreshToken;

    // First rotation
    const refreshRes1 = await request('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: originalRefreshToken })
    });
    assert(refreshRes1.status === 200, '21. Refresh token successfully rotated for fresh access token');
    const newRefreshToken = refreshRes1.data.refreshToken;
    assert(newRefreshToken !== originalRefreshToken, '22. New refresh token is distinct from original token');

    // Replay attack: attempt to use the original (already rotated) refresh token
    const replayRes = await request('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: originalRefreshToken })
    });
    assert(
      replayRes.status === 403 && replayRes.data.code === 'TOKEN_REUSE_DETECTED',
      '23. Replayed refresh token triggers theft detection (HTTP 403 TOKEN_REUSE_DETECTED) and revokes family'
    );

    // Verify all sessions were revoked due to theft detection
    const postReplayUse = await request('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: newRefreshToken })
    });
    assert(
      postReplayUse.status === 401 && postReplayUse.data.code === 'SESSION_REVOKED',
      '24. All sessions revoked for user after token reuse breach detected'
    );

    // -------------------------------------------------------------
    // Test 9: Password Reset Session Revocation
    // -------------------------------------------------------------
    console.log('\n--- Section 9: Password Reset & Session Invalidation ---');

    // Login to get a fresh session
    const freshLogin = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: testEmail,
        password: 'Password123!@#'
      })
    });
    assert(freshLogin.status === 200, '25. Password login successful');
    const loginAccessToken = freshLogin.data.token;

    // Wait 1.1s so JWT integer iat timestamp is strictly older than passwordChangedAt
    await new Promise((r) => setTimeout(r, 1100));

    // Change password via profile
    const changePassRes = await request('/auth/profile', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${loginAccessToken}` },
      body: JSON.stringify({
        currentPassword: 'Password123!@#',
        newPassword: 'BrandNewSecurePassword456!@#'
      })
    });
    assert(changePassRes.status === 200 && changePassRes.data.passwordChanged === true, '26. Password changed via profile');

    // Old token should now be invalidated because password was changed after token issuance
    const invalidatedMe = await request('/auth/me', {
      headers: { Authorization: `Bearer ${loginAccessToken}` }
    });
    assert(
      invalidatedMe.status === 401 && invalidatedMe.data.code === 'TOKEN_INVALIDATED',
      '27. Existing session tokens invalidated on password change (TOKEN_INVALIDATED)'
    );

    // -------------------------------------------------------------
    // Test 10: Server-Side Logout Revocation
    // -------------------------------------------------------------
    console.log('\n--- Section 10: Server-Side Session Logout ---');
    const newLogin = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: testEmail,
        password: 'BrandNewSecurePassword456!@#'
      })
    });
    assert(newLogin.status === 200, '28. Login with new password successful');
    const logoutRefreshToken = newLogin.data.refreshToken;

    const logoutRes = await request('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: logoutRefreshToken })
    });
    assert(logoutRes.status === 200, '29. Logout endpoint invalidates session server-side');

    // Using the logged out refresh token should fail
    const postLogoutRefresh = await request('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: logoutRefreshToken })
    });
    assert(
      postLogoutRefresh.status === 401 && postLogoutRefresh.data.code === 'SESSION_REVOKED',
      '30. Logged out session cannot be refreshed (HTTP 401 SESSION_REVOKED)'
    );

    console.log('\n================================================================');
    console.log(`Security Hardening Test Suite: ${passed} Passed, ${failed} Failed`);
    console.log('================================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  } finally {
    if (spawnedServer) {
      spawnedServer.kill();
    }
  }
}

runSecurityTests();
