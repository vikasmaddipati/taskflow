import express from 'express';
import {
  getAdminOverview,
  getAdminTasks,
  updateWhatsAppSettings,
  testWhatsAppNotification,
  updateEmailSettings,
  testEmailNotification,
  dispatchTaskEmailToMembers,
  triggerSchedulerScan,
  getBaileysConnectionStatus,
  connectBaileysSocket,
  disconnectBaileysSocket,
  installBaileysPackages,
  getBaileysInstallLog,
  getSystemDiagnostics
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
router.post('/tasks/:taskId/dispatch-email', requirePermission(PERMISSIONS.TASKS_UPDATE), dispatchTaskEmailToMembers);

// WhatsApp Configuration and Testing (Available to Owner and Admin)
router.put('/whatsapp-settings', requirePermission(PERMISSIONS.ORG_UPDATE), updateWhatsAppSettings);
router.post('/whatsapp-test', requirePermission(PERMISSIONS.ORG_UPDATE), testWhatsAppNotification);

// Email Configuration and Testing (Available to Owner and Admin)
router.put('/email-settings', requirePermission(PERMISSIONS.ORG_UPDATE), updateEmailSettings);
router.post('/email-test', requirePermission(PERMISSIONS.ORG_UPDATE), testEmailNotification);

router.post('/run-scheduler-scan', requirePermission(PERMISSIONS.ORG_UPDATE), triggerSchedulerScan);

// Baileys WhatsApp Web Direct Integration (No-cost direct socket)
router.get('/baileys/status', requirePermission(PERMISSIONS.ORG_READ), getBaileysConnectionStatus);
router.post('/baileys/connect', requirePermission(PERMISSIONS.ORG_UPDATE), connectBaileysSocket);
router.post('/baileys/disconnect', requirePermission(PERMISSIONS.ORG_UPDATE), disconnectBaileysSocket);
router.post('/baileys/install', requirePermission(PERMISSIONS.ORG_UPDATE), installBaileysPackages);
router.get('/baileys/install-log', requirePermission(PERMISSIONS.ORG_READ), getBaileysInstallLog);
router.get('/diagnostics', requirePermission(PERMISSIONS.ORG_READ), getSystemDiagnostics);

export default router;
