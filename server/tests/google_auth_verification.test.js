import mongoose from 'mongoose';
import connectDB from '../src/config/db.js';
import User from '../src/models/User.js';
import Organization from '../src/models/Organization.js';
import Membership from '../src/models/Membership.js';
import Session from '../src/models/Session.js';
import { verifyGoogleIdToken } from '../src/services/googleAuthService.js';
import { googleAuth } from '../src/controllers/authController.js';

async function testGoogleAuth() {
  console.log('================================================================');
  console.log('   Testing Google Authentication End-to-End                     ');
  console.log('================================================================\n');

  await connectDB();

  let passed = 0;
  let failed = 0;

  function assert(condition, name) {
    if (condition) {
      console.log(`[PASS] ${name}`);
      passed++;
    } else {
      console.error(`[FAIL] ${name}`);
      failed++;
    }
  }

  // 1. Missing credential validation
  {
    let statusCode = 0;
    let resData = null;
    const req = { body: {} };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        resData = data;
        return this;
      }
    };
    await googleAuth(req, res, () => {});
    assert(statusCode === 400 && resData?.message === 'Google credential ID token is required', '1. Missing credential rejected with 400');
  }

  // 2. Invalid Google token validation
  {
    let statusCode = 0;
    let resData = null;
    const req = { body: { credential: 'completely_invalid_token_12345' } };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        resData = data;
        return this;
      }
    };
    await googleAuth(req, res, () => {});
    assert(statusCode === 400 && resData?.success === false, '2. Invalid Google credential rejected with 400');
  }

  // 3. New User Google Registration & Organization Provisioning
  const testEmail = `google.qa.${Date.now()}@example.com`;
  const testSub = `google_sub_${Date.now()}`;
  const mockToken = `test_google_token:${testEmail}:QA Google Tester:${testSub}`;
  let userToken = null;
  let userId = null;
  let orgId = null;

  {
    let statusCode = 0;
    let resData = null;
    let cookies = {};
    const req = {
      body: { credential: mockToken },
      ip: '127.0.0.1',
      headers: { 'user-agent': 'GoogleAuthTest/1.0' }
    };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      cookie(name, val, opts) {
        cookies[name] = val;
        return this;
      },
      json(data) {
        resData = data;
        return this;
      }
    };

    await googleAuth(req, res, () => {});
    assert(statusCode === 200, '3. Valid Google authentication succeeds with HTTP 200');
    assert(resData?.success === true, '4. Response indicates success');
    assert(resData?.token && resData?.refreshToken, '5. Access token and refresh token generated');
    assert(resData?.user?.email === testEmail, '6. User profile populated with Google email');
    assert(resData?.user?.isEmailVerified === true, '7. User is marked email verified by default');
    assert(cookies['tm_access_token'] && cookies['tm_refresh_token'], '8. HttpOnly session cookies attached to response');
    assert(resData?.organization && resData?.organization._id, '9. Default organization provisioned automatically');

    userToken = resData.token;
    userId = resData.user.id;
    orgId = resData.organization._id;
  }

  // 4. Repeated Google Sign-In with Same Account (Login Idempotency)
  {
    let statusCode = 0;
    let resData = null;
    const req = {
      body: { credential: mockToken },
      ip: '127.0.0.1',
      headers: { 'user-agent': 'GoogleAuthTest/1.0' }
    };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      cookie() {
        return this;
      },
      json(data) {
        resData = data;
        return this;
      }
    };

    await googleAuth(req, res, () => {});
    assert(statusCode === 200, '10. Returning user Google sign-in succeeds');
    assert(resData?.user?.id?.toString() === userId.toString(), '11. Existing user account reused without duplicate creation');
    assert(resData?.organization?._id?.toString() === orgId.toString(), '12. Existing organization context maintained');
  }

  // 5. Account Linking: Existing Password Account signing in with Google
  const hybridEmail = `hybrid.qa.${Date.now()}@example.com`;
  const existingPasswordUser = await User.create({
    name: 'Existing Password User',
    email: hybridEmail,
    password: 'password123',
    authProviders: ['local'],
    isEmailVerified: false
  });

  {
    const hybridSub = `google_sub_hybrid_${Date.now()}`;
    const hybridMockToken = `test_google_token:${hybridEmail}:Existing Password User:${hybridSub}`;
    let statusCode = 0;
    let resData = null;
    const req = {
      body: { credential: hybridMockToken },
      ip: '127.0.0.1',
      headers: { 'user-agent': 'GoogleAuthTest/1.0' }
    };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      cookie() {
        return this;
      },
      json(data) {
        resData = data;
        return this;
      }
    };

    await googleAuth(req, res, () => {});
    assert(statusCode === 200, '13. Google login with matching email succeeds for existing user');
    assert(resData?.user?.id?.toString() === existingPasswordUser._id.toString(), '14. Account linked to existing user ID');

    const updatedUser = await User.findById(existingPasswordUser._id);
    assert(updatedUser.authProviders.includes('google') && updatedUser.authProviders.includes('local'), '15. User now has both google and local password providers');
    assert(updatedUser.isEmailVerified === true, '16. Google authentication marks email verified');
  }

  // Cleanup test fixtures
  await User.deleteMany({ email: { $in: [testEmail, hybridEmail] } });
  await Organization.deleteMany({ _id: orgId });
  await Membership.deleteMany({ organization: orgId });
  await Session.deleteMany({ user: { $in: [userId, existingPasswordUser._id] } });

  console.log(`\n================================================================`);
  console.log(`Google Auth Tests: ${passed} Passed, ${failed} Failed`);
  console.log(`================================================================`);

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

testGoogleAuth().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
