import express from 'express';
import {
  getUserOrganizations,
  createOrganization,
  getOrganizationById,
  getOrganizationMembers,
  inviteMember,
  acceptInvitation,
  removeMember
} from '../controllers/orgController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.route('/')
  .get(getUserOrganizations)
  .post(createOrganization);

router.post('/invitations/:token/accept', acceptInvitation);

router.route('/:id')
  .get(getOrganizationById);

router.route('/:id/members')
  .get(getOrganizationMembers);

router.post('/:id/invitations', inviteMember);
router.delete('/:id/members/:userId', removeMember);

export default router;
