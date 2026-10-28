import express from 'express';
import {
  getTasks,
  getTaskStats,
  getTaskById,
  createTask,
  updateTask,
  toggleTaskStatus,
  deleteTask
} from '../controllers/taskController.js';
import { protect } from '../middleware/auth.js';
import { resolveTenant } from '../middleware/tenant.js';

const router = express.Router();

// All task routes require authentication and multi-tenant resolution
router.use(protect);
router.use(resolveTenant);

router.route('/')
  .get(getTasks)
  .post(createTask);

router.get('/stats', getTaskStats);

router.route('/:id')
  .get(getTaskById)
  .put(updateTask)
  .delete(deleteTask);

router.patch('/:id/toggle', toggleTaskStatus);

export default router;
