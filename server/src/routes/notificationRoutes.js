import express from 'express';
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  triggerReminderCheck
} from '../controllers/notificationController.js';
import { protect } from '../middleware/auth.js';
import { resolveTenant } from '../middleware/tenant.js';

const router = express.Router();

router.use(protect);
router.use(resolveTenant);

router.get('/', getNotifications);
router.patch('/:id/read', markNotificationRead);
router.post('/read-all', markAllNotificationsRead);
router.post('/run-reminders', triggerReminderCheck);

export default router;
