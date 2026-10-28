import express from 'express';
import {
  getWorkspaces,
  createWorkspace,
  getWorkspaceById,
  updateWorkspace,
  deleteWorkspace
} from '../controllers/workspaceController.js';
import { protect } from '../middleware/auth.js';
import { resolveTenant } from '../middleware/tenant.js';
import { requirePermission } from '../middleware/rbac.js';
import { PERMISSIONS } from '../config/permissions.js';

const router = express.Router();

router.use(protect);
router.use(resolveTenant);

router.route('/')
  .get(requirePermission(PERMISSIONS.WORKSPACES_READ), getWorkspaces)
  .post(requirePermission(PERMISSIONS.WORKSPACES_CREATE), createWorkspace);

router.route('/:id')
  .get(requirePermission(PERMISSIONS.WORKSPACES_READ), getWorkspaceById)
  .patch(requirePermission(PERMISSIONS.WORKSPACES_UPDATE), updateWorkspace)
  .delete(requirePermission(PERMISSIONS.WORKSPACES_DELETE), deleteWorkspace);

export default router;
