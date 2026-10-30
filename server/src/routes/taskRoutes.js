import express from 'express';
import {
  getTasks,
  getTaskStats,
  getTaskById,
  createTask,
  updateTask,
  toggleTaskStatus,
  updateTaskStatus,
  deleteTask,
  addTaskComment,
  updateCollaborators,
  getTrashTasks,
  restoreTask,
  permanentlyDeleteTask,
  emptyTrash,
  exportTasks,
  addSubtask,
  updateSubtask,
  deleteSubtask,
  uploadAttachment,
  downloadAttachment,
  deleteAttachment,
  getTaskActivity,
  updateTaskComment,
  deleteTaskComment,
  bulkTaskOperations
} from '../controllers/taskController.js';
import { taskAttachmentUpload } from '../middleware/upload.js';
import { protect } from '../middleware/auth.js';
import { resolveTenant } from '../middleware/tenant.js';
import { requirePermission } from '../middleware/rbac.js';
import { PERMISSIONS } from '../config/permissions.js';
import { validate } from '../middleware/validate.js';
import {
  createTaskSchema,
  updateTaskSchema,
  getTasksQuerySchema,
  taskIdParamSchema,
  addCommentSchema,
  updateCommentSchema,
  updateCollaboratorsSchema,
  bulkTasksSchema
} from '../validations/taskSchemas.js';

const router = express.Router();

// All task routes require authentication and multi-tenant resolution
router.use(protect);
router.use(resolveTenant);

router
  .route('/')
  .get(requirePermission(PERMISSIONS.TASKS_READ), validate({ query: getTasksQuerySchema }), getTasks)
  .post(requirePermission(PERMISSIONS.TASKS_CREATE), validate({ body: createTaskSchema }), createTask);

router.get('/stats', requirePermission(PERMISSIONS.TASKS_READ), getTaskStats);
router.get('/export', requirePermission(PERMISSIONS.TASKS_READ), exportTasks);

// Bulk batch operations
router.post(
  '/bulk',
  requirePermission(PERMISSIONS.TASKS_UPDATE),
  validate({ body: bulkTasksSchema }),
  bulkTaskOperations
);

// Trash collection routes - MUST be mounted before /:id parameter route
router.get('/trash', requirePermission(PERMISSIONS.TASKS_READ), validate({ query: getTasksQuerySchema }), getTrashTasks);
router.delete('/trash/empty', requirePermission(PERMISSIONS.TASKS_DELETE), emptyTrash);

router
  .route('/:id')
  .get(requirePermission(PERMISSIONS.TASKS_READ), validate({ params: taskIdParamSchema }), getTaskById)
  .put(
    requirePermission(PERMISSIONS.TASKS_UPDATE),
    validate({ params: taskIdParamSchema, body: updateTaskSchema }),
    updateTask
  )
  .delete(requirePermission(PERMISSIONS.TASKS_DELETE), validate({ params: taskIdParamSchema }), deleteTask);

router.patch(
  '/:id/restore',
  requirePermission(PERMISSIONS.TASKS_CREATE),
  validate({ params: taskIdParamSchema }),
  restoreTask
);

router.delete(
  '/:id/permanent',
  requirePermission(PERMISSIONS.TASKS_DELETE),
  validate({ params: taskIdParamSchema }),
  permanentlyDeleteTask
);

router.patch(
  '/:id/toggle',
  requirePermission(PERMISSIONS.TASKS_UPDATE),
  validate({ params: taskIdParamSchema }),
  toggleTaskStatus
);

router.patch(
  '/:id/status',
  requirePermission(PERMISSIONS.TASKS_UPDATE),
  validate({ params: taskIdParamSchema }),
  updateTaskStatus
);

// Subtask & Checklist routes
router.post(
  '/:id/subtasks',
  requirePermission(PERMISSIONS.TASKS_UPDATE),
  validate({ params: taskIdParamSchema }),
  addSubtask
);

router.patch(
  '/:id/subtasks/:subtaskId',
  requirePermission(PERMISSIONS.TASKS_UPDATE),
  updateSubtask
);

router.delete(
  '/:id/subtasks/:subtaskId',
  requirePermission(PERMISSIONS.TASKS_UPDATE),
  deleteSubtask
);

// Attachment routes
router.post(
  '/:id/attachments',
  requirePermission(PERMISSIONS.TASKS_UPDATE),
  taskAttachmentUpload.single('file'),
  uploadAttachment
);

router.get(
  '/:id/attachments/:attachmentId/download',
  requirePermission(PERMISSIONS.TASKS_READ),
  downloadAttachment
);

router.delete(
  '/:id/attachments/:attachmentId',
  requirePermission(PERMISSIONS.TASKS_UPDATE),
  deleteAttachment
);

// Activity Log & Changelog route
router.get(
  '/:id/activity',
  requirePermission(PERMISSIONS.TASKS_READ),
  validate({ params: taskIdParamSchema }),
  getTaskActivity
);

router.post(
  '/:id/comments',
  requirePermission(PERMISSIONS.TASKS_COMMENT),
  validate({ params: taskIdParamSchema, body: addCommentSchema }),
  addTaskComment
);

router.patch(
  '/:id/comments/:commentId',
  requirePermission(PERMISSIONS.TASKS_COMMENT),
  validate({ body: updateCommentSchema }),
  updateTaskComment
);

router.delete(
  '/:id/comments/:commentId',
  requirePermission(PERMISSIONS.TASKS_COMMENT),
  deleteTaskComment
);

router.post(
  '/:id/collaborators',
  requirePermission(PERMISSIONS.TASKS_SHARE),
  validate({ params: taskIdParamSchema, body: updateCollaboratorsSchema }),
  updateCollaborators
);

export default router;
