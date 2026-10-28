import express from 'express';
import {
  getTasks,
  getTaskStats,
  getTaskById,
  createTask,
  updateTask,
  toggleTaskStatus,
  deleteTask,
  addTaskComment,
  updateCollaborators
} from '../controllers/taskController.js';
import { protect } from '../middleware/auth.js';
import { resolveTenant } from '../middleware/tenant.js';
import { requirePermission } from '../middleware/rbac.js';
import { PERMISSIONS } from '../config/permissions.js';

const router = express.Router();

// All task routes require authentication and multi-tenant resolution
router.use(protect);
router.use(resolveTenant);

router.route('/')
  .get(requirePermission(PERMISSIONS.TASKS_READ), getTasks)
  .post(requirePermission(PERMISSIONS.TASKS_CREATE), createTask);

router.get('/stats', requirePermission(PERMISSIONS.TASKS_READ), getTaskStats);

router.route('/:id')
  .get(requirePermission(PERMISSIONS.TASKS_READ), getTaskById)
  .put(requirePermission(PERMISSIONS.TASKS_UPDATE), updateTask)
  .delete(requirePermission(PERMISSIONS.TASKS_DELETE), deleteTask);

router.patch('/:id/toggle', requirePermission(PERMISSIONS.TASKS_UPDATE), toggleTaskStatus);
router.post('/:id/comments', requirePermission(PERMISSIONS.TASKS_COMMENT), addTaskComment);
router.post('/:id/collaborators', requirePermission(PERMISSIONS.TASKS_SHARE), updateCollaborators);

export default router;
