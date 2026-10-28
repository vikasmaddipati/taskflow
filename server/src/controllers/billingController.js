import Organization from '../models/Organization.js';
import Subscription from '../models/Subscription.js';
import Invoice from '../models/Invoice.js';
import AuditLog from '../models/AuditLog.js';
import { PLANS, getOrgPlan } from '../config/plans.js';
import {
  createSubscriptionSession,
  verifyPaymentSignature
} from '../services/paymentService.js';
import {
  getEffectiveEntitlements,
  getUsageSummary
} from '../services/entitlementService.js';
import { ROLES } from '../config/permissions.js';

// @desc    Get subscription status and available plans
// @route   GET /api/billing/plans
// @access  Public / Optional Auth
export const getBillingPlans = async (req, res, next) => {
  try {
    const org = req.organization || null;
    let currentPlan = null;
    let usage = null;

    if (org) {
      currentPlan = getOrgPlan(org);
      try {
        usage = await getUsageSummary(org._id);
      } catch {
        // ignore if not yet initialized
      }
    }

    res.status(200).json({
      success: true,
      currentPlan: org
        ? {
            id: org.plan || 'free',
            name: currentPlan?.name || 'Free Starter',
            status: org.subscription?.status || 'active',
            currentPeriodEnd: org.subscription?.currentPeriodEnd,
            cancelAtPeriodEnd: org.subscription?.cancelAtPeriodEnd || false,
            isPersonal: org.isPersonal
          }
        : null,
      usage,
      plans: PLANS,
      planList: Object.values(PLANS)
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get complete organization billing status, quotas, and invoices
// @route   GET /api/billing/status
// @access  Private (Owner / Admin / Billing Admin)
export const getBillingStatus = async (req, res, next) => {
  try {
    const orgId = req.organization._id;

    const [usage, invoices] = await Promise.all([
      getUsageSummary(orgId),
      Invoice.find({ organization: orgId })
        .sort({ createdAt: -1 })
        .limit(20)
    ]);

    res.status(200).json({
      success: true,
      ...usage,
      invoices
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Initiate Razorpay checkout session for subscription
// @route   POST /api/billing/checkout
// @access  Private (Owner / Admin / Billing Admin)
export const createCheckoutSession = async (req, res, next) => {
  try {
    const { planId, billingInterval = 'monthly' } = req.body;
    const org = req.organization;
    const callerRole = req.membership?.role;

    if (!['pro', 'team', 'enterprise'].includes(planId)) {
      return res.status(400).json({ success: false, message: 'Invalid plan selected' });
    }

    // Role check: Only Owner, Admin, or Billing Admin can initiate checkout
    if (![ROLES.OWNER, ROLES.ADMIN, ROLES.BILLING_ADMIN].includes(callerRole)) {
      return res.status(403).json({
        success: false,
        code: 'PERMISSION_DENIED',
        message: 'Only organization owners, admins, or billing managers can manage subscriptions'
      });
    }

    const session = await createSubscriptionSession({
      organization: org,
      user: req.user,
      planId,
      billingInterval
    });

    res.status(200).json({
      success: true,
      ...session
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Verify Razorpay payment signature & activate subscription
// @route   POST /api/billing/verify
// @access  Private (Owner / Admin / Billing Admin)
export const verifyPayment = async (req, res, next) => {
  try {
    const {
      razorpay_payment_id,
      razorpay_subscription_id,
      razorpay_signature,
      planId
    } = req.body;

    const orgId = req.organization._id;

    if (!razorpay_payment_id || !razorpay_subscription_id || !planId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required payment verification parameters'
      });
    }

    // Validate signature
    const isValid = verifyPaymentSignature({
      razorpay_payment_id,
      razorpay_subscription_id,
      razorpay_signature
    });

    if (!isValid) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_SIGNATURE',
        message: 'Payment verification failed: invalid signature'
      });
    }

    const planConfig = PLANS[planId] || PLANS.pro;

    // 1. Upsert Subscription record
    const subscription = await Subscription.findOneAndUpdate(
      { organization: orgId },
      {
        organization: orgId,
        user: req.user._id,
        plan: planId,
        provider: 'razorpay',
        providerSubscriptionId: razorpay_subscription_id,
        status: 'active',
        currency: planConfig.currency || 'INR',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        cancelAtPeriodEnd: false
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // 2. Update Organization plan
    await Organization.findByIdAndUpdate(orgId, {
      plan: planId,
      subscription: {
        id: subscription._id,
        status: 'active',
        currentPeriodEnd: subscription.currentPeriodEnd
      }
    });

    // 3. Record Invoice record
    await Invoice.create({
      organization: orgId,
      subscription: subscription._id,
      provider: 'razorpay',
      providerPaymentId: razorpay_payment_id,
      amount: planConfig.price,
      currency: planConfig.currency || 'INR',
      status: 'paid',
      paidAt: new Date(),
      description: `Upgrade to ${planConfig.name}`
    });

    // 4. Audit Log
    await AuditLog.create({
      organization: orgId,
      actor: req.user._id,
      action: 'subscription.activated',
      targetType: 'Subscription',
      targetId: subscription._id.toString(),
      details: { plan: planId, paymentId: razorpay_payment_id }
    });

    res.status(200).json({
      success: true,
      message: `Successfully upgraded to ${planConfig.name}!`,
      plan: planId,
      subscription
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Cancel subscription at period end
// @route   POST /api/billing/cancel
// @access  Private (Owner / Admin / Billing Admin)
export const cancelSubscription = async (req, res, next) => {
  try {
    const orgId = req.organization._id;
    const subscription = await Subscription.findOne({ organization: orgId });

    if (!subscription || subscription.status === 'canceled') {
      return res.status(400).json({
        success: false,
        message: 'No active paid subscription found to cancel'
      });
    }

    subscription.cancelAtPeriodEnd = true;
    subscription.canceledAt = new Date();
    await subscription.save();

    await AuditLog.create({
      organization: orgId,
      actor: req.user._id,
      action: 'subscription.cancel_scheduled',
      targetType: 'Subscription',
      targetId: subscription._id.toString(),
      details: { effectiveDate: subscription.currentPeriodEnd }
    });

    res.status(200).json({
      success: true,
      message: 'Subscription will be canceled at the end of the billing period',
      currentPeriodEnd: subscription.currentPeriodEnd
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Resume canceled subscription before period end
// @route   POST /api/billing/resume
// @access  Private (Owner / Admin / Billing Admin)
export const resumeSubscription = async (req, res, next) => {
  try {
    const orgId = req.organization._id;
    const subscription = await Subscription.findOne({ organization: orgId });

    if (!subscription || !subscription.cancelAtPeriodEnd) {
      return res.status(400).json({
        success: false,
        message: 'No subscription scheduled for cancellation'
      });
    }

    subscription.cancelAtPeriodEnd = false;
    subscription.canceledAt = null;
    await subscription.save();

    await AuditLog.create({
      organization: orgId,
      actor: req.user._id,
      action: 'subscription.resumed',
      targetType: 'Subscription',
      targetId: subscription._id.toString()
    });

    res.status(200).json({
      success: true,
      message: 'Subscription resumed successfully',
      subscription
    });
  } catch (error) {
    next(error);
  }
};

// @desc    List payment invoices for organization
// @route   GET /api/billing/invoices
// @access  Private (Owner / Admin / Billing Admin)
export const getInvoices = async (req, res, next) => {
  try {
    const orgId = req.organization._id;
    const invoices = await Invoice.find({ organization: orgId })
      .sort({ createdAt: -1 })
      .limit(50);

    res.status(200).json({
      success: true,
      count: invoices.length,
      invoices
    });
  } catch (error) {
    next(error);
  }
};
