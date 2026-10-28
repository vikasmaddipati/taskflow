import express from 'express';
import {
  getBillingPlans,
  getBillingStatus,
  createCheckoutSession,
  verifyPayment,
  cancelSubscription,
  resumeSubscription,
  getInvoices
} from '../controllers/billingController.js';
import { handleRazorpayWebhook } from '../controllers/webhookController.js';
import { protect } from '../middleware/auth.js';
import { resolveTenant } from '../middleware/tenant.js';
import { requirePermission } from '../middleware/rbac.js';
import { PERMISSIONS } from '../config/permissions.js';

const router = express.Router();

// Webhook endpoints (signature-verified, no session auth)
router.post('/webhook/razorpay', handleRazorpayWebhook);

// Public / optional auth plan catalog
router.get('/plans', getBillingPlans);

// Protected routes require authentication & active organization resolution
router.use(protect);
router.use(resolveTenant);

router.get('/status', requirePermission(PERMISSIONS.BILLING_READ), getBillingStatus);
router.post('/checkout', requirePermission(PERMISSIONS.BILLING_MANAGE), createCheckoutSession);
router.post('/verify', requirePermission(PERMISSIONS.BILLING_MANAGE), verifyPayment);
router.post('/cancel', requirePermission(PERMISSIONS.BILLING_MANAGE), cancelSubscription);
router.post('/resume', requirePermission(PERMISSIONS.BILLING_MANAGE), resumeSubscription);
router.get('/invoices', requirePermission(PERMISSIONS.BILLING_READ), getInvoices);

export default router;
