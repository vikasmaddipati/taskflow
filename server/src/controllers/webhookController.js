import crypto from 'crypto';
import WebhookEvent from '../models/WebhookEvent.js';
import Subscription from '../models/Subscription.js';
import Organization from '../models/Organization.js';
import Invoice from '../models/Invoice.js';
import AuditLog from '../models/AuditLog.js';
import { verifyWebhookSignature } from '../services/paymentService.js';
import { config } from '../config/env.js';

// @desc    Process Razorpay Webhook Events
// @route   POST /api/webhooks/razorpay
// @access  Public (Signature-verified)
export const handleRazorpayWebhook = async (req, res, next) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const rawPayload = req.rawBody || req.body;

    // Verify webhook signature
    const isValid = verifyWebhookSignature(rawPayload, signature);
    if (!isValid) {
      console.warn('[Webhook Warning] Invalid Razorpay webhook signature received.');
      return res.status(400).json({
        success: false,
        code: 'INVALID_SIGNATURE',
        message: 'Invalid webhook signature'
      });
    }

    const event = typeof rawPayload === 'string'
      ? JSON.parse(rawPayload)
      : (Buffer.isBuffer(rawPayload) ? JSON.parse(rawPayload.toString('utf-8')) : rawPayload);

    const eventId =
      req.headers['x-razorpay-event-id'] ||
      event.id ||
      event.event_id ||
      `evt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    const eventType = event.event;
    const payload = event.payload || {};

    // 1. Idempotency Check: check if event was already processed
    const existingEvent = await WebhookEvent.findOne({ eventId });
    if (existingEvent && existingEvent.status === 'processed') {
      return res.status(200).json({
        success: true,
        status: 'already_processed',
        message: 'Event already processed',
        eventId
      });
    }

    // Record webhook event in ledger
    await WebhookEvent.findOneAndUpdate(
      { eventId },
      {
        provider: 'razorpay',
        eventType,
        payload,
        status: 'processed'
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // 2. Dispatch event handling
    switch (eventType) {
      case 'subscription.authenticated':
      case 'subscription.activated': {
        const subEntity = payload.subscription?.entity || payload.payment?.entity?.notes || {};
        const subId = subEntity.id || subEntity.subscription_id;
        const orgId = subEntity.notes?.organizationId;
        const planId = subEntity.notes?.planId;

        let subscription = null;
        if (subId) {
          subscription = await Subscription.findOne({ providerSubscriptionId: subId });
        }
        if (!subscription && orgId) {
          subscription = await Subscription.findOne({ organization: orgId });
        }

        if (subscription) {
          subscription.status = 'active';
          if (planId) subscription.plan = planId;
          subscription.currentPeriodStart = new Date((subEntity.current_start || Date.now() / 1000) * 1000);
          subscription.currentPeriodEnd = new Date((subEntity.current_end || (Date.now() / 1000 + 30 * 24 * 3600)) * 1000);
          await subscription.save();

          // Update organization plan
          await Organization.findByIdAndUpdate(subscription.organization, {
            plan: subscription.plan,
            'subscription.status': 'active',
            'subscription.currentPeriodEnd': subscription.currentPeriodEnd
          });

          await AuditLog.create({
            organization: subscription.organization,
            action: 'subscription.activated',
            targetType: 'Subscription',
            targetId: subscription._id.toString(),
            details: { plan: subscription.plan, providerSubscriptionId: subId }
          });
        }
        break;
      }

      case 'subscription.charged':
      case 'payment.captured':
      case 'invoice.paid': {
        const paymentEntity = payload.payment?.entity || payload.invoice?.entity || {};
        const subId = paymentEntity.subscription_id || paymentEntity.notes?.subscription_id;
        const orgId = paymentEntity.notes?.organizationId;

        let subscription = null;
        if (subId) {
          subscription = await Subscription.findOne({ providerSubscriptionId: subId });
        }
        if (!subscription && orgId) {
          subscription = await Subscription.findOne({ organization: orgId });
        }

        const targetOrgId = orgId || subscription?.organization;

        if (targetOrgId) {
          // Amount in Razorpay is typically passed in paise (1 INR = 100 paise)
          const amount = paymentEntity.amount ? (paymentEntity.amount > 1000 ? paymentEntity.amount / 100 : paymentEntity.amount) : 0;
          const currency = paymentEntity.currency || 'INR';

          await Invoice.create({
            organization: targetOrgId,
            subscription: subscription?._id || null,
            provider: 'razorpay',
            providerPaymentId: paymentEntity.id,
            providerOrderId: paymentEntity.order_id,
            providerInvoiceId: paymentEntity.invoice_id,
            amount,
            currency,
            status: 'paid',
            paidAt: new Date(),
            receiptUrl: paymentEntity.receipt || null,
            description: `Payment for ${subscription?.plan || 'TaskFlow'} plan`
          });

          if (subscription) {
            subscription.status = 'active';
            await subscription.save();
            await Organization.findByIdAndUpdate(targetOrgId, {
              'subscription.status': 'active'
            });
          }

          await AuditLog.create({
            organization: targetOrgId,
            action: 'payment.captured',
            targetType: 'Invoice',
            details: { amount, currency, paymentId: paymentEntity.id }
          });
        }
        break;
      }

      case 'payment.failed': {
        const paymentEntity = payload.payment?.entity || {};
        const subId = paymentEntity.subscription_id || paymentEntity.notes?.subscription_id;
        const orgId = paymentEntity.notes?.organizationId;

        let subscription = null;
        if (subId) {
          subscription = await Subscription.findOne({ providerSubscriptionId: subId });
        }
        if (!subscription && orgId) {
          subscription = await Subscription.findOne({ organization: orgId });
        }

        const targetOrgId = orgId || subscription?.organization;

        if (subscription) {
          subscription.status = 'past_due';
          subscription.failureCode = paymentEntity.error_code || 'PAYMENT_FAILED';
          subscription.failureReason = paymentEntity.error_description || 'Payment transaction failed';
          await subscription.save();

          await Organization.findByIdAndUpdate(subscription.organization, {
            'subscription.status': 'past_due'
          });
        }

        if (targetOrgId) {
          await Invoice.create({
            organization: targetOrgId,
            subscription: subscription?._id || null,
            provider: 'razorpay',
            providerPaymentId: paymentEntity.id,
            amount: paymentEntity.amount ? (paymentEntity.amount > 1000 ? paymentEntity.amount / 100 : paymentEntity.amount) : 0,
            currency: paymentEntity.currency || 'INR',
            status: 'failed',
            failureCode: paymentEntity.error_code,
            failureReason: paymentEntity.error_description,
            description: 'Failed payment charge'
          });

          await AuditLog.create({
            organization: targetOrgId,
            action: 'payment.failed',
            targetType: 'Payment',
            details: { errorCode: paymentEntity.error_code, description: paymentEntity.error_description }
          });
        }
        break;
      }

      case 'subscription.cancelled':
      case 'subscription.halted': {
        const subEntity = payload.subscription?.entity || {};
        const subId = subEntity.id;
        const orgId = subEntity.notes?.organizationId;

        let subscription = null;
        if (subId) {
          subscription = await Subscription.findOne({ providerSubscriptionId: subId });
        }
        if (!subscription && orgId) {
          subscription = await Subscription.findOne({ organization: orgId });
        }

        if (subscription) {
          subscription.status = 'canceled';
          subscription.canceledAt = new Date();
          await subscription.save();

          await Organization.findByIdAndUpdate(subscription.organization, {
            plan: 'free',
            'subscription.status': 'canceled'
          });

          await AuditLog.create({
            organization: subscription.organization,
            action: 'subscription.cancelled',
            targetType: 'Subscription',
            targetId: subscription._id.toString(),
            details: { reason: subEntity.cancel_reason || 'Webhook cancellation event' }
          });
        }
        break;
      }

      default:
        console.log(`[Razorpay Webhook] Received unhandled event: ${eventType}`);
    }

    res.status(200).json({
      success: true,
      status: 'processed',
      message: `Webhook event '${eventType}' processed successfully`,
      eventId
    });
  } catch (error) {
    next(error);
  }
};
