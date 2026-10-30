import express from 'express';
import authRoutes from '../authRoutes.js';
import taskRoutes from '../taskRoutes.js';
import orgRoutes from '../orgRoutes.js';
import billingRoutes from '../billingRoutes.js';
import workspaceRoutes from '../workspaceRoutes.js';
import teamRoutes from '../teamRoutes.js';
import categoryRoutes from '../categoryRoutes.js';
import notificationRoutes from '../notificationRoutes.js';
import aiRoutes from '../aiRoutes.js';
import { handleRazorpayWebhook } from '../../controllers/webhookController.js';
import { getHealth, getLiveness, getReadiness } from '../../controllers/healthController.js';
import { streamTenantEvents } from '../../controllers/realtimeController.js';
import { protect } from '../../middleware/auth.js';
import { resolveTenant } from '../../middleware/tenant.js';

const router = express.Router();

// Health check and orchestration probes
router.get('/health', getHealth);
router.get('/health/live', getLiveness);
router.get('/health/ready', getReadiness);

// Real-Time Server-Sent Events (SSE) stream
router.get('/events', protect, resolveTenant, streamTenantEvents);

// Webhook endpoints
router.post('/webhooks/razorpay', handleRazorpayWebhook);

// Core SaaS domain routes
router.use('/auth', authRoutes);
router.use('/tasks', taskRoutes);
router.use('/organizations', orgRoutes);
router.use('/workspaces', workspaceRoutes);
router.use('/teams', teamRoutes);
router.use('/billing', billingRoutes);
router.use('/categories', categoryRoutes);
router.use('/notifications', notificationRoutes);
router.use('/ai', aiRoutes);

export default router;
