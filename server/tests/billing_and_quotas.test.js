// Comprehensive SaaS Monetization, Razorpay Subscriptions, Billing Quotas, and Entitlements Test Suite
import dotenv from 'dotenv';
dotenv.config();
import crypto from 'crypto';
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

async function runBillingTests() {
  console.log('================================================================');
  console.log('   TaskFlow SaaS Monetization, Billing & Quotas Test Suite      ');
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
        stdio: 'pipe',
        env: { ...process.env, HOST: '127.0.0.1' }
      });
      spawnedServer.stdout.on('data', () => {});
      spawnedServer.stderr.on('data', () => {});

      for (let i = 0; i < 25; i++) {
        await new Promise((r) => setTimeout(r, 500));
        if (await isServerRunning()) break;
      }
    }

    const uid = Math.floor(Math.random() * 1000000);
    const ownerEmail = `billing_owner_${uid}@test.dev`;
    const memberEmail = `billing_member_${uid}@test.dev`;
    const tenant2Email = `billing_tenant2_${uid}@test.dev`;

    // -------------------------------------------------------------
    // Test 1: User Registration & Default Free Plan
    // -------------------------------------------------------------
    console.log('\n--- Section 1: Default Free Plan Entitlements ---');
    const regOwner = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Billing Owner',
        email: ownerEmail,
        password: 'Password123!@#'
      })
    });

    assert(regOwner.status === 201, 'Owner registered successfully');
    const ownerToken = regOwner.data.token;

    // Get Organizations
    const orgsRes = await request('/organizations', {
      headers: { Authorization: `Bearer ${ownerToken}` }
    });
    const org = orgsRes.data.organizations?.[0];
    assert(!!org, 'Organization created for registered user');
    assert(org.plan === 'free', 'New organization defaults to Free plan');

    // Get Workspaces
    const wsRes = await request('/workspaces', {
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'x-organization-id': org._id
      }
    });
    const defaultWorkspace = wsRes.data.workspaces?.[0];
    assert(!!defaultWorkspace, 'Default workspace created');

    // Verify Billing Plans Endpoint
    const plansRes = await request('/billing/plans', {
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'x-organization-id': org._id
      }
    });
    assert(plansRes.status === 200, 'GET /api/billing/plans returns 200');
    assert(plansRes.data.plans?.free?.price === 0, 'Free plan catalog price is 0');
    assert(plansRes.data.plans?.pro?.price === 799, 'Pro plan catalog price is 799');
    assert(plansRes.data.plans?.team?.price === 1999, 'Team plan catalog price is 1999');
    assert(plansRes.data.plans?.enterprise?.price === 4999, 'Enterprise plan catalog price is 4999');

    // -------------------------------------------------------------
    // Test 2: Free Plan Quotas & Feature Gating Enforcement
    // -------------------------------------------------------------
    console.log('\n--- Section 2: Quota & Feature Gating Enforcement ---');

    // Free plan has maxWorkspaces = 1. Creating a 2nd workspace must fail with QUOTA_EXCEEDED
    const secondWsRes = await request('/workspaces', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'x-organization-id': org._id
      },
      body: JSON.stringify({
        name: 'Second Workspace Attempt'
      })
    });
    assert(
      secondWsRes.status === 403 && secondWsRes.data.code === 'QUOTA_EXCEEDED',
      'Free plan rejects 2nd workspace creation (quota limit = 1)',
      `Status: ${secondWsRes.status}, Code: ${secondWsRes.data.code}`
    );

    // Free plan has teams.collaboration = false. Creating a team squad must fail with FEATURE_NOT_AVAILABLE
    const teamSquadRes = await request('/teams', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'x-organization-id': org._id
      },
      body: JSON.stringify({
        name: 'Core Engineering Squad'
      })
    });
    assert(
      teamSquadRes.status === 403 && (teamSquadRes.data.code === 'FEATURE_NOT_AVAILABLE' || teamSquadRes.data.code === 'FEATURE_GATED'),
      'Free plan rejects team squad creation (feature gated: teams.collaboration)',
      `Status: ${teamSquadRes.status}, Code: ${teamSquadRes.data.code}`
    );

    // Creating tasks within monthly quota succeeds
    const task1 = await request('/tasks', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'x-organization-id': org._id,
        'x-workspace-id': defaultWorkspace._id
      },
      body: JSON.stringify({
        title: 'Complete First Billing Task',
        priority: 'high'
      })
    });
    assert(task1.status === 201, 'Task created successfully under quota');

    // Check usage summary
    const statusRes = await request('/billing/status', {
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'x-organization-id': org._id
      }
    });
    assert(statusRes.status === 200, 'GET /api/billing/status returns 200');
    assert(statusRes.data.quotas?.tasks?.current >= 1, 'Task creation usage metered in live quotas');
    assert(statusRes.data.quotas?.workspaces?.current === 1, 'Workspace count metered in live quotas');

    // -------------------------------------------------------------
    // Test 3: Checkout Session Creation (Razorpay)
    // -------------------------------------------------------------
    console.log('\n--- Section 3: Razorpay Checkout Session Generation ---');
    const checkoutRes = await request('/billing/checkout', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'x-organization-id': org._id
      },
      body: JSON.stringify({
        planId: 'pro',
        billingInterval: 'monthly'
      })
    });

    assert(checkoutRes.status === 200, 'POST /api/billing/checkout returns 200');
    assert(checkoutRes.data.subscriptionId?.length > 0, 'Subscription session generated');
    assert(checkoutRes.data.amount === 799, 'Session amount matches Pro plan price (799)');
    assert(checkoutRes.data.currency === 'INR', 'Currency is INR');
    const subscriptionId = checkoutRes.data.subscriptionId;

    // -------------------------------------------------------------
    // Test 4: Payment Verification & Subscription Activation
    // -------------------------------------------------------------
    console.log('\n--- Section 4: Signature Verification & Upgraded Limits ---');

    // Invalid signature rejection test
    const fakeVerify = await request('/billing/verify', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'x-organization-id': org._id
      },
      body: JSON.stringify({
        razorpay_payment_id: 'pay_invalid_123',
        razorpay_subscription_id: 'sub_live_invalid',
        razorpay_signature: 'fake_tampered_sig',
        planId: 'pro'
      })
    });
    assert(fakeVerify.status === 400, 'Invalid payment signature rejected with HTTP 400');

    // Valid simulation verification
    const validVerify = await request('/billing/verify', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'x-organization-id': org._id
      },
      body: JSON.stringify({
        razorpay_payment_id: `pay_test_${Date.now()}`,
        razorpay_subscription_id: subscriptionId,
        razorpay_signature: 'test_simulated_sig',
        planId: 'pro'
      })
    });
    assert(validVerify.status === 200, 'Valid payment verified & subscription activated');
    assert(validVerify.data.plan === 'pro', 'Organization plan upgraded to pro');

    // Verify updated entitlements: Creating a 2nd workspace should now succeed on Pro plan
    const secondWsPro = await request('/workspaces', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'x-organization-id': org._id
      },
      body: JSON.stringify({
        name: 'Second Workspace (Pro Entitlement)'
      })
    });
    assert(secondWsPro.status === 201, '2nd Workspace created successfully with Pro plan entitlement (max: 5)');

    // Verify invoice was automatically recorded
    const invoicesRes = await request('/billing/invoices', {
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'x-organization-id': org._id
      }
    });
    assert(invoicesRes.status === 200, 'GET /api/billing/invoices returns 200');
    assert(invoicesRes.data.invoices?.length > 0, 'Payment recorded in invoice ledger');
    assert(invoicesRes.data.invoices[0].amount === 799, 'Invoice amount matches Pro plan price');
    assert(invoicesRes.data.invoices[0].status === 'paid', 'Invoice status is paid');

    // -------------------------------------------------------------
    // Test 5: Role-Based Access Control for Billing
    // -------------------------------------------------------------
    console.log('\n--- Section 5: Role-Based Access Control (RBAC) ---');
    const regMember = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Regular Member',
        email: memberEmail,
        password: 'Password123!@#'
      })
    });
    const memberToken = regMember.data.token;

    // Owner invites member
    const inviteRes = await request(`/organizations/${org._id}/invitations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'x-organization-id': org._id
      },
      body: JSON.stringify({
        email: memberEmail,
        role: 'member'
      })
    });
    assert(inviteRes.status === 201, 'Member invited to organization');

    // Member accepts invite
    const acceptRes = await request(`/organizations/invitations/${inviteRes.data.invitation.token}/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${memberToken}` }
    });
    assert(acceptRes.status === 200, 'Member joined organization');

    // Member attempts checkout — must be forbidden
    const memberCheckout = await request('/billing/checkout', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${memberToken}`,
        'x-organization-id': org._id
      },
      body: JSON.stringify({ planId: 'team' })
    });
    assert(
      memberCheckout.status === 403 && memberCheckout.data.code === 'PERMISSION_DENIED',
      'Regular member forbidden from initiating billing checkout (403 PERMISSION_DENIED)'
    );

    // Member attempts cancel — must be forbidden
    const memberCancel = await request('/billing/cancel', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${memberToken}`,
        'x-organization-id': org._id
      }
    });
    assert(memberCancel.status === 403, 'Regular member forbidden from canceling subscription');

    // -------------------------------------------------------------
    // Test 6: Cross-Tenant Billing Isolation
    // -------------------------------------------------------------
    console.log('\n--- Section 6: Cross-Tenant Billing Isolation ---');
    const regTenant2 = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Tenant Two Owner',
        email: tenant2Email,
        password: 'Password123!@#'
      })
    });
    const tenant2Token = regTenant2.data.token;

    // Tenant 2 tries to access Org 1's billing status by providing Org 1's ID in header
    const crossTenantBilling = await request('/billing/status', {
      headers: {
        Authorization: `Bearer ${tenant2Token}`,
        'x-organization-id': org._id
      }
    });
    assert(
      crossTenantBilling.status === 403,
      'Cross-tenant billing status access blocked with 403 Forbidden'
    );

    // -------------------------------------------------------------
    // Test 7: Razorpay Webhooks (Signature & Replay Prevention)
    // -------------------------------------------------------------
    console.log('\n--- Section 7: Webhook Processing & Idempotency ---');
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || 'rzp_whsec_placeholder_webhook_secret';

    const testWebhookEventId = `evt_test_${uid}_${Date.now()}`;
    const webhookPayload = JSON.stringify({
      entity: 'event',
      account_id: 'acc_test_123',
      event: 'payment.captured',
      contains: ['payment'],
      payload: {
        payment: {
          entity: {
            id: `pay_wh_${Date.now()}`,
            amount: 79900,
            currency: 'INR',
            status: 'captured',
            notes: {
              organizationId: org._id.toString()
            }
          }
        }
      },
      created_at: Math.floor(Date.now() / 1000)
    });

    // Compute valid HMAC SHA-256 signature
    const validSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(webhookPayload)
      .digest('hex');

    // 1. Invalid signature should be rejected with HTTP 400
    const invalidWebhook = await fetch(`${BASE_URL}/webhooks/razorpay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': 'invalid_signature_hex'
      },
      body: webhookPayload
    });
    const invalidWhJson = await invalidWebhook.json();
    assert(
      invalidWebhook.status === 400 && invalidWhJson.code === 'INVALID_SIGNATURE',
      'Webhook with invalid signature rejected (HTTP 400 INVALID_SIGNATURE)'
    );

    // 2. Valid signature should process successfully
    const validWebhook = await fetch(`${BASE_URL}/webhooks/razorpay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': validSignature,
        'x-razorpay-event-id': testWebhookEventId
      },
      body: webhookPayload
    });
    const validWhJson = await validWebhook.json();
    assert(validWebhook.status === 200, 'Valid webhook processed successfully (HTTP 200)');
    assert(validWhJson.status === 'processed', 'Webhook event marked as processed');

    // 3. Webhook replay attack test: duplicate event ID should be ignored
    const duplicateWebhook = await fetch(`${BASE_URL}/webhooks/razorpay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': validSignature,
        'x-razorpay-event-id': testWebhookEventId
      },
      body: webhookPayload
    });
    const dupWhJson = await duplicateWebhook.json();
    assert(
      duplicateWebhook.status === 200 && dupWhJson.status === 'already_processed',
      'Duplicate webhook event detected and discarded idempotently (Replay attack prevention)'
    );

    // -------------------------------------------------------------
    // Test 8: Webhook Payment Failed (Grace Period)
    // -------------------------------------------------------------
    console.log('\n--- Section 8: Payment Failure & Grace Period Handling ---');
    const paymentFailedPayload = JSON.stringify({
      entity: 'event',
      account_id: 'acc_test_123',
      event: 'payment.failed',
      contains: ['payment'],
      payload: {
        payment: {
          entity: {
            id: `pay_failed_${Date.now()}`,
            amount: 79900,
            currency: 'INR',
            status: 'failed',
            error_description: 'Card declined by issuing bank',
            notes: {
              organizationId: org._id.toString()
            }
          }
        }
      },
      created_at: Math.floor(Date.now() / 1000)
    });

    const failedSig = crypto
      .createHmac('sha256', webhookSecret)
      .update(paymentFailedPayload)
      .digest('hex');

    const paymentFailedRes = await fetch(`${BASE_URL}/webhooks/razorpay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': failedSig
      },
      body: paymentFailedPayload
    });
    assert(paymentFailedRes.status === 200, 'payment.failed webhook acknowledged');

    // Verify subscription status is now past_due
    const pastDueStatus = await request('/billing/status', {
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'x-organization-id': org._id
      }
    });
    assert(
      pastDueStatus.data.status === 'past_due' && pastDueStatus.data.isGracePeriod === true,
      'Subscription transitioned to past_due with active 7-day grace period'
    );

    // -------------------------------------------------------------
    // Test 9: Self-Service Cancellation and Resumption
    // -------------------------------------------------------------
    console.log('\n--- Section 9: Self-Service Cancellation & Resumption ---');

    // Cancel at period end
    const cancelRes = await request('/billing/cancel', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'x-organization-id': org._id
      }
    });
    assert(cancelRes.status === 200, 'Owner scheduled subscription cancellation at period end');

    // Verify cancellation flag in status
    const canceledStatus = await request('/billing/status', {
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'x-organization-id': org._id
      }
    });
    assert(
      canceledStatus.data.subscription?.cancelAtPeriodEnd === true,
      'cancelAtPeriodEnd set to true on subscription'
    );

    // Resume subscription
    const resumeRes = await request('/billing/resume', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'x-organization-id': org._id
      }
    });
    assert(resumeRes.status === 200, 'Owner resumed subscription before period end');

    const resumedStatus = await request('/billing/status', {
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'x-organization-id': org._id
      }
    });
    assert(
      resumedStatus.data.subscription?.cancelAtPeriodEnd === false,
      'cancelAtPeriodEnd reverted to false'
    );

    // -------------------------------------------------------------
    // Test 10: Webhook Subscription Cancelled (Downgrade to Free)
    // -------------------------------------------------------------
    console.log('\n--- Section 10: Downgrade on Cancellation ---');
    const subCancelledPayload = JSON.stringify({
      entity: 'event',
      account_id: 'acc_test_123',
      event: 'subscription.cancelled',
      contains: ['subscription'],
      payload: {
        subscription: {
          entity: {
            id: subscriptionId,
            plan_id: 'plan_pro_monthly',
            status: 'cancelled',
            notes: {
              organizationId: org._id.toString()
            }
          }
        }
      },
      created_at: Math.floor(Date.now() / 1000)
    });

    const subCancelledSig = crypto
      .createHmac('sha256', webhookSecret)
      .update(subCancelledPayload)
      .digest('hex');

    const subCancelledRes = await fetch(`${BASE_URL}/webhooks/razorpay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': subCancelledSig
      },
      body: subCancelledPayload
    });
    assert(subCancelledRes.status === 200, 'subscription.cancelled webhook processed');

    // Check organization downgraded to free
    const downgradedStatus = await request('/billing/status', {
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'x-organization-id': org._id
      }
    });
    assert(downgradedStatus.data.plan?.id === 'free', 'Organization successfully downgraded to Free plan');

    console.log('\n================================================================');
    console.log(`Billing Test Suite Finished: ${passed} Passed, ${failed} Failed`);
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

runBillingTests();
