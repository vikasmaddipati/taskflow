import Stripe from 'stripe';
import Organization from '../models/Organization.js';
import AuditLog from '../models/AuditLog.js';
import { config } from '../config/env.js';
import { PLANS, getOrgPlan } from '../config/plans.js';

let stripeClient = null;
const getStripe = () => {
  if (!config.stripe.secretKey || config.stripe.secretKey.includes('placeholder')) {
    return null;
  }
  if (!stripeClient) {
    stripeClient = new Stripe(config.stripe.secretKey, {
      apiVersion: '2023-10-16'
    });
  }
  return stripeClient;
};

// @desc    Get subscription status and available plans
// @route   GET /api/billing/plans
// @access  Public / Optional Auth
export const getBillingPlans = async (req, res, next) => {
  try {
    const org = req.organization || null;
    const currentPlan = org ? getOrgPlan(org) : null;

    res.status(200).json({
      success: true,
      currentPlan: org
        ? {
            id: org.plan || 'free',
            name: currentPlan?.name || 'Free',
            status: org.subscription?.status || 'none',
            currentPeriodEnd: org.subscription?.currentPeriodEnd,
            cancelAtPeriodEnd: org.subscription?.cancelAtPeriodEnd || false,
            isPersonal: org.isPersonal
          }
        : null,
      plans: PLANS,
      planList: Object.values(PLANS)
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create Stripe Checkout Session for Plan Upgrade
// @route   POST /api/billing/checkout
// @access  Private (Owner only)
export const createCheckoutSession = async (req, res, next) => {
  try {
    const { planId } = req.body;
    const org = req.organization;

    if (!['pro', 'business'].includes(planId)) {
      return res.status(400).json({ success: false, message: 'Invalid plan selected' });
    }

    if (req.orgRole !== 'owner') {
      return res.status(403).json({ success: false, message: 'Only the organization owner can manage subscriptions' });
    }

    const stripe = getStripe();

    // If Stripe is in mock / development mode without real keys:
    if (!stripe) {
      // Simulate upgrade in development mode safely
      org.plan = planId;
      org.subscription = {
        stripeCustomerId: `cus_sim_${Date.now()}`,
        stripeSubscriptionId: `sub_sim_${Date.now()}`,
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        cancelAtPeriodEnd: false
      };
      await org.save();

      await AuditLog.create({
        organization: org._id,
        actor: req.user._id,
        action: 'subscription.simulated_upgrade',
        targetType: 'Organization',
        targetId: org._id.toString(),
        details: { plan: planId, mode: 'dev_simulation' },
        ipAddress: req.ip
      });

      return res.status(200).json({
        success: true,
        mode: 'simulation',
        message: `Plan upgraded to ${planId.toUpperCase()} (Development Simulation Mode). Configure STRIPE_SECRET_KEY in server/.env for live Stripe payments.`,
        plan: planId
      });
    }

    // Real Stripe Checkout Flow
    let customerId = org.subscription?.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: req.user.email,
        name: `${req.user.name} (${org.name})`,
        metadata: {
          organizationId: org._id.toString(),
          userId: req.user._id.toString()
        }
      });
      customerId = customer.id;
      org.subscription.stripeCustomerId = customerId;
      await org.save();
    }

    const priceId = planId === 'business' ? config.stripe.businessPriceId : config.stripe.proPriceId;

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [
        {
          price: priceId || 'price_placeholder',
          quantity: 1
        }
      ],
      success_url: `${config.cors.clientUrl}/settings?billing_status=success`,
      cancel_url: `${config.cors.clientUrl}/settings?billing_status=canceled`,
      metadata: {
        organizationId: org._id.toString(),
        planId
      }
    });

    res.status(200).json({
      success: true,
      url: session.url
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create Stripe Customer Portal session
// @route   POST /api/billing/portal
// @access  Private (Owner only)
export const createCustomerPortalSession = async (req, res, next) => {
  try {
    const org = req.organization;

    if (req.orgRole !== 'owner') {
      return res.status(403).json({ success: false, message: 'Only the organization owner can manage subscriptions' });
    }

    const stripe = getStripe();
    if (!stripe || !org.subscription?.stripeCustomerId || org.subscription.stripeCustomerId.startsWith('cus_sim_')) {
      return res.status(400).json({
        success: false,
        message: 'No active Stripe billing profile found. Configure STRIPE_SECRET_KEY in server/.env.'
      });
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: org.subscription.stripeCustomerId,
      return_url: `${config.cors.clientUrl}/settings`
    });

    res.status(200).json({
      success: true,
      url: portalSession.url
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Stripe Webhook handler with signature validation
// @route   POST /api/billing/webhook
// @access  Public (Stripe signature verified)
export const handleStripeWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const stripe = getStripe();

  if (!stripe || !config.stripe.webhookSecret) {
    return res.status(400).send('Stripe is not configured on this server');
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, config.stripe.webhookSecret);
  } catch (err) {
    console.error(`[Stripe Webhook Error] ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const orgId = session.metadata?.organizationId;
        const planId = session.metadata?.planId || 'pro';

        if (orgId) {
          await Organization.findByIdAndUpdate(orgId, {
            plan: planId,
            'subscription.stripeSubscriptionId': session.subscription,
            'subscription.status': 'active',
            'subscription.currentPeriodStart': new Date()
          });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        const statusMap = {
          active: 'active',
          trialing: 'trialing',
          past_due: 'past_due',
          canceled: 'canceled',
          unpaid: 'past_due'
        };

        await Organization.findOneAndUpdate(
          { 'subscription.stripeCustomerId': customerId },
          {
            'subscription.status': statusMap[subscription.status] || 'active',
            'subscription.currentPeriodEnd': new Date(subscription.current_period_end * 1000),
            'subscription.cancelAtPeriodEnd': subscription.cancel_at_period_end
          }
        );
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await Organization.findOneAndUpdate(
          { 'subscription.stripeCustomerId': subscription.customer },
          {
            plan: 'free',
            'subscription.status': 'canceled',
            'subscription.stripeSubscriptionId': null
          }
        );
        break;
      }

      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error(`[Stripe Webhook Processing Error]`, err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};
