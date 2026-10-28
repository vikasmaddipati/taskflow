import express from 'express';
import {
  getBillingPlans,
  createCheckoutSession,
  createCustomerPortalSession,
  handleStripeWebhook
} from '../controllers/billingController.js';
import { protect } from '../middleware/auth.js';
import { resolveTenant } from '../middleware/tenant.js';

const router = express.Router();

// Stripe Webhook needs raw body before JSON parsing
router.post('/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);

// Protected routes require authentication & active organization resolution
router.use(protect);
router.use(resolveTenant);

router.get('/plans', getBillingPlans);
router.post('/checkout', createCheckoutSession);
router.post('/portal', createCustomerPortalSession);

export default router;
