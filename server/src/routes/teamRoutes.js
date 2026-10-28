import express from 'express';
import {
  getTeams,
  createTeam,
  getTeamById,
  updateTeam,
  deleteTeam,
  addTeamMember,
  removeTeamMember
} from '../controllers/teamController.js';
import { protect } from '../middleware/auth.js';
import { resolveTenant } from '../middleware/tenant.js';
import { requirePermission } from '../middleware/rbac.js';
import { PERMISSIONS } from '../config/permissions.js';

const router = express.Router();

router.use(protect);
router.use(resolveTenant);

router.route('/')
  .get(requirePermission(PERMISSIONS.ORG_READ), getTeams)
  .post(requirePermission(PERMISSIONS.TEAMS_CREATE), createTeam);

router.route('/:id')
  .get(requirePermission(PERMISSIONS.ORG_READ), getTeamById)
  .patch(requirePermission(PERMISSIONS.TEAMS_MANAGE), updateTeam)
  .delete(requirePermission(PERMISSIONS.TEAMS_MANAGE), deleteTeam);

router.post('/:id/members', requirePermission(PERMISSIONS.TEAMS_MANAGE), addTeamMember);
router.delete('/:id/members/:userId', requirePermission(PERMISSIONS.TEAMS_MANAGE), removeTeamMember);

export default router;
