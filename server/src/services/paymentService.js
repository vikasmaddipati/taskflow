import crypto from 'crypto';
import Razorpay from 'razorpay';
import { config } from '../config/env.js';
import { PLANS, getOrgPlan } from '../config/plans.js';

let razorpayClient = null;

/**
 * Returns initialized Razorpay client or null if credentials unconfigured
 */
export const getRazorpayClient = () => {
  if (
    !config.razorpay.keyId ||
    !config.razorpay.keySecret ||
    config.razorpay.keyId.includes('placeholder')
  ) {
    return null;
  }

  if (!razorpayClient) {
    razorpayClient = new Razorpay({
      key_id: config.razorpay.keyId,
      key_secret: config.razorpay.keySecret
    });
  }
  return razorpayClient;
};

/**
 * Creates a subscription checkout session for Razorpay
 */
export const createSubscriptionSession = async ({ organization, user, planId, billingInterval = 'monthly' }) => {
  const plan = PLANS[planId];
  if (!plan) {
    throw new Error(`Plan '${planId}' does not exist in catalog.`);
  }

  if (planId === 'free') {
    throw new Error('Free plan does not require a payment session.');
  }

  const client = getRazorpayClient();
  const currency = config.razorpay.currency || 'INR';

  // If live/test Razorpay API credentials are configured, create native Razorpay subscription
  if (client) {
    try {
      // In production, plan.razorpayPlanId must be configured in Razorpay dashboard
      const planIdToUse = plan.razorpayPlanId;

      const subResponse = await client.subscriptions.create({
        plan_id: planIdToUse,
        total_count: billingInterval === 'yearly' ? 1 : 12,
        quantity: 1,
        customer_notify: 1,
        notes: {
          organizationId: organization._id.toString(),
          userId: user._id.toString(),
          planId
        }
      });

      return {
        mode: 'razorpay',
        keyId: config.razorpay.keyId,
        subscriptionId: subResponse.id,
        planId,
        amount: plan.price,
        currency,
        organizationId: organization._id,
        customer: {
          name: user.name,
          email: user.email
        }
      };
    } catch (err) {
      console.warn('[Razorpay API Warning] Could not call Razorpay API directly:', err.message);
      // Fall through to test simulation if in development/test
      if (config.isProd) {
        throw new Error(`Payment provider error: ${err.message}`);
      }
    }
  }

  // Development & Test Mode simulation
  const simulatedSubId = `sub_test_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  return {
    mode: 'test_simulation',
    keyId: config.razorpay.keyId || 'rzp_test_taskflow_mock',
    subscriptionId: simulatedSubId,
    planId,
    amount: plan.price,
    currency,
    organizationId: organization._id,
    customer: {
      name: user.name,
      email: user.email
    }
  };
};

/**
 * Verifies Razorpay payment signature
 * Signature = HMAC_SHA256(payment_id + '|' + subscription_id, key_secret)
 */
export const verifyPaymentSignature = ({
  razorpay_payment_id,
  razorpay_subscription_id,
  razorpay_signature
}) => {
  if (!razorpay_payment_id || !razorpay_subscription_id) {
    return false;
  }

  // If running in development/test simulation
  if (razorpay_subscription_id.startsWith('sub_test_') && !config.isProd) {
    return true;
  }

  const secret = config.razorpay.keySecret;
  if (!secret) return false;

  const generatedSignature = crypto
    .createHmac('sha256', secret)
    .update(`${razorpay_payment_id}|${razorpay_subscription_id}`)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(generatedSignature, 'utf-8'),
      Buffer.from(razorpay_signature || '', 'utf-8')
    );
  } catch {
    return false;
  }
};

/**
 * Verifies Razorpay Webhook signature
 * Signature = HMAC_SHA256(raw_body, webhook_secret)
 */
export const verifyWebhookSignature = (rawBody, signature, customSecret = null) => {
  const secret = customSecret || config.razorpay.webhookSecret;
  if (!secret || !signature) {
    return false;
  }

  let bodyPayload = rawBody;
  if (!Buffer.isBuffer(rawBody) && typeof rawBody !== 'string') {
    bodyPayload = JSON.stringify(rawBody);
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(bodyPayload)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'utf-8'),
      Buffer.from(signature, 'utf-8')
    );
  } catch {
    return false;
  }
};
