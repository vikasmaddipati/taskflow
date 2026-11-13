import express from 'express';
import {
  getAdminOverview,
  getAdminTasks,
  updateWhatsAppSettings,
  testWhatsAppNotification,
  triggerSchedulerScan
} from '../controllers/adminController.js';
import { protect } from '../middleware/auth.js';
import { resolveTenant } from '../middleware/tenant.js';
import { requirePermission } from '../middleware/rbac.js';
import { PERMISSIONS } from '../config/permissions.js';

const router = express.Router();

router.use(protect);
router.use(resolveTenant);

// Overview and Task Monitoring (Available to Owner, Admin, Manager)
router.get('/overview', requirePermission(PERMISSIONS.ORG_READ), getAdminOverview);
router.get('/tasks', requirePermission(PERMISSIONS.TASKS_READ), getAdminTasks);

// WhatsApp Configuration and Testing (Available to Owner and Admin)
router.put('/whatsapp-settings', requirePermission(PERMISSIONS.ORG_UPDATE), updateWhatsAppSettings);
router.post('/whatsapp-test', requirePermission(PERMISSIONS.ORG_UPDATE), testWhatsAppNotification);
router.post('/run-scheduler-scan', requirePermission(PERMISSIONS.ORG_UPDATE), triggerSchedulerScan);

export default router;
