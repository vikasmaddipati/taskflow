import express from 'express';
import {
  getUserOrganizations,
  createOrganization,
  getCurrentOrganization,
  getOrganizationById,
  updateOrganization,
  transferOwnership,
  deleteOrganization,
  getOrganizationMembers,
  inviteMember,
  acceptInvitation,
  revokeInvitation,
  updateMemberRole,
  removeMember,
  leaveOrganization,
  getAuditLogs
} from '../controllers/orgController.js';
import { protect } from '../middleware/auth.js';
import { resolveTenant } from '../middleware/tenant.js';
import { requirePermission } from '../middleware/rbac.js';
import { PERMISSIONS } from '../config/permissions.js';

const router = express.Router();

router.use(protect);

router.route('/')
  .get(getUserOrganizations)
  .post(createOrganization);

router.get('/current', resolveTenant, getCurrentOrganization);
router.post('/invitations/:token/accept', acceptInvitation);

// Param-scoped routes resolved by active tenant context
router.use('/:id', resolveTenant);

router.route('/:id')
  .get(requirePermission(PERMISSIONS.ORG_READ), getOrganizationById)
  .patch(requirePermission(PERMISSIONS.ORG_UPDATE), updateOrganization)
  .delete(requirePermission(PERMISSIONS.ORG_DELETE), deleteOrganization);

router.post('/:id/transfer-ownership', requirePermission(PERMISSIONS.ORG_TRANSFER_OWNERSHIP), transferOwnership);
router.post('/:id/leave', leaveOrganization);

router.route('/:id/members')
  .get(requirePermission(PERMISSIONS.MEMBERS_READ), getOrganizationMembers);

router.route('/:id/members/:userId')
  .patch(requirePermission(PERMISSIONS.MEMBERS_UPDATE_ROLE), updateMemberRole)
  .delete(requirePermission(PERMISSIONS.MEMBERS_REMOVE), removeMember);

router.post('/:id/invitations', requirePermission(PERMISSIONS.MEMBERS_INVITE), inviteMember);
router.delete('/:id/invitations/:invitationId', requirePermission(PERMISSIONS.MEMBERS_INVITE), revokeInvitation);

router.get('/:id/audit-logs', requirePermission(PERMISSIONS.AUDIT_LOGS_READ), getAuditLogs);

export default router;
