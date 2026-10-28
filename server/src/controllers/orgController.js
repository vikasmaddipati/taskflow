import crypto from 'crypto';
import Organization from '../models/Organization.js';
import Membership from '../models/Membership.js';
import Workspace from '../models/Workspace.js';
import Invitation from '../models/Invitation.js';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';
import Task from '../models/Task.js';
import Team from '../models/Team.js';
import { getOrgPlan } from '../config/plans.js';
import { ROLES, ROLE_HIERARCHY } from '../config/permissions.js';

// Helper to hash secrets/tokens with SHA-256
const hashSecret = (value) => {
  return crypto.createHash('sha256').update(String(value).trim()).digest('hex');
};

// @desc    List organizations user belongs to
// @route   GET /api/organizations
// @access  Private
export const getUserOrganizations = async (req, res, next) => {
  try {
    const memberships = await Membership.find({ user: req.user._id })
      .populate('organization')
      .sort({ createdAt: 1 });

    const organizations = memberships
      .filter((m) => m.organization)
      .map((m) => ({
        ...m.organization.toJSON(),
        role: m.role,
        joinedAt: m.joinedAt
      }));

    res.status(200).json({
      success: true,
      count: organizations.length,
      organizations
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get current active organization details
// @route   GET /api/organizations/current
// @access  Private
export const getCurrentOrganization = async (req, res, next) => {
  try {
    if (!req.organization) {
      return res.status(404).json({ success: false, message: 'No active organization found' });
    }

    const membersCount = await Membership.countDocuments({ organization: req.organization._id });
    const plan = getOrgPlan(req.organization);

    res.status(200).json({
      success: true,
      userRole: req.membership?.role || 'member',
      organization: {
        ...req.organization.toJSON(),
        role: req.membership?.role || 'member',
        membersCount,
        planConfig: plan
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create a new organization
// @route   POST /api/organizations
// @access  Private
export const createOrganization = async (req, res, next) => {
  try {
    const { name } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ success: false, message: 'Organization name is required' });
    }

    const cleanName = name.trim();
    const slugBase = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const slug = `${slugBase || 'org'}-${Date.now().toString().slice(-4)}`;

    const organization = await Organization.create({
      name: cleanName,
      slug,
      owner: req.user._id,
      isPersonal: false,
      plan: 'free'
    });

    await Membership.create({
      organization: organization._id,
      user: req.user._id,
      role: ROLES.OWNER
    });

    await Workspace.create({
      organization: organization._id,
      name: 'General',
      isDefault: true,
      createdBy: req.user._id
    });

    await AuditLog.create({
      organization: organization._id,
      actor: req.user._id,
      action: 'organization.created',
      targetType: 'Organization',
      targetId: organization._id.toString(),
      details: { name: organization.name },
      ipAddress: req.ip
    });

    res.status(201).json({
      success: true,
      message: 'Organization created successfully',
      organization: {
        ...organization.toJSON(),
        role: ROLES.OWNER
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get organization details and membership
// @route   GET /api/organizations/:id
// @access  Private
export const getOrganizationById = async (req, res, next) => {
  try {
    const membership = await Membership.findOne({
      organization: req.params.id,
      user: req.user._id
    }).populate('organization');

    if (!membership || !membership.organization) {
      return res.status(404).json({ success: false, message: 'Organization not found or access denied' });
    }

    const membersCount = await Membership.countDocuments({ organization: req.params.id });
    const plan = getOrgPlan(membership.organization);

    res.status(200).json({
      success: true,
      organization: {
        ...membership.organization.toJSON(),
        role: membership.role,
        membersCount,
        planConfig: plan
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update organization settings
// @route   PATCH /api/organizations/:id
// @access  Private (Owner / Admin)
export const updateOrganization = async (req, res, next) => {
  try {
    const org = req.organization;
    const { name, logo, plan } = req.body;

    if (name && name.trim()) {
      org.name = name.trim();
    }
    if (logo !== undefined) {
      org.logo = logo;
    }
    if (plan && ['free', 'pro', 'business'].includes(plan)) {
      org.plan = plan;
    }

    await org.save();

    await AuditLog.create({
      organization: org._id,
      actor: req.user._id,
      action: 'organization.updated',
      targetType: 'Organization',
      targetId: org._id.toString(),
      details: { name: org.name },
      ipAddress: req.ip
    });

    res.status(200).json({
      success: true,
      message: 'Organization settings updated',
      organization: org
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Transfer ownership of organization to another member
// @route   POST /api/organizations/:id/transfer-ownership
// @access  Private (Owner only)
export const transferOwnership = async (req, res, next) => {
  try {
    const { targetUserId } = req.body;
    const org = req.organization;

    if (req.membership.role !== ROLES.OWNER) {
      return res.status(403).json({
        success: false,
        code: 'OWNER_ONLY',
        message: 'Only the current organization owner can transfer ownership'
      });
    }

    if (!targetUserId || targetUserId === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'A valid target member ID different from the current owner is required'
      });
    }

    const targetMembership = await Membership.findOne({
      organization: org._id,
      user: targetUserId
    }).populate('user');

    if (!targetMembership) {
      return res.status(404).json({
        success: false,
        message: 'Target user is not a member of this organization'
      });
    }

    // 1. Promote target member to Owner
    targetMembership.role = ROLES.OWNER;
    await targetMembership.save();

    // 2. Demote current caller to Admin
    req.membership.role = ROLES.ADMIN;
    await req.membership.save();

    // 3. Update organization owner field
    org.owner = targetUserId;
    await org.save();

    await AuditLog.create({
      organization: org._id,
      actor: req.user._id,
      action: 'organization.ownership_transferred',
      targetType: 'User',
      targetId: targetUserId,
      details: {
        newOwnerEmail: targetMembership.user?.email,
        previousOwnerId: req.user._id
      },
      ipAddress: req.ip
    });

    res.status(200).json({
      success: true,
      message: `Ownership successfully transferred to ${targetMembership.user?.name || 'new owner'}`,
      newOwnerId: targetUserId
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete or deactivate an organization
// @route   DELETE /api/organizations/:id
// @access  Private (Owner only)
export const deleteOrganization = async (req, res, next) => {
  try {
    const org = req.organization;

    if (req.membership.role !== ROLES.OWNER) {
      return res.status(403).json({
        success: false,
        code: 'OWNER_ONLY',
        message: 'Only the organization owner can delete the organization'
      });
    }

    // Cascade delete tenant-owned records
    await Promise.all([
      Task.deleteMany({ organization: org._id }),
      Workspace.deleteMany({ organization: org._id }),
      Team.deleteMany({ organization: org._id }),
      Invitation.deleteMany({ organization: org._id }),
      Membership.deleteMany({ organization: org._id }),
      Organization.findByIdAndDelete(org._id)
    ]);

    res.status(200).json({
      success: true,
      message: 'Organization and associated resources deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    List members of an organization
// @route   GET /api/organizations/:id/members
// @access  Private
export const getOrganizationMembers = async (req, res, next) => {
  try {
    const members = await Membership.find({ organization: req.organization._id })
      .populate('user', 'name email avatar')
      .sort({ joinedAt: 1 });

    const invitations = await Invitation.find({
      organization: req.organization._id,
      status: 'pending',
      expiresAt: { $gt: new Date() }
    }).select('-token -tokenHash');

    res.status(200).json({
      success: true,
      count: members.length,
      members: members.map((m) => ({
        id: m._id,
        user: m.user,
        role: m.role,
        joinedAt: m.joinedAt
      })),
      pendingInvitations: invitations
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Invite a new member via email
// @route   POST /api/organizations/:id/invitations
// @access  Private (Owner / Admin / Manager)
export const inviteMember = async (req, res, next) => {
  try {
    const { email, role = 'member', workspaceId } = req.body;
    const org = req.organization;
    const callerRole = req.membership.role;

    if (!email || !email.includes('@')) {
      return res.status(400).json({ success: false, message: 'Valid email address is required' });
    }

    const cleanEmail = email.toLowerCase().trim();

    // Privilege escalation check: cannot invite with role higher or equal to caller's rank (unless owner)
    if (callerRole !== ROLES.OWNER) {
      const callerLevel = ROLE_HIERARCHY[callerRole] || 0;
      const targetLevel = ROLE_HIERARCHY[role] || 0;
      if (targetLevel >= callerLevel) {
        return res.status(403).json({
          success: false,
          code: 'PRIVILEGE_ESCALATION_BLOCKED',
          message: `You cannot invite a member with role '${role}', which is equal or higher than your role '${callerRole}'`
        });
      }
    }

    const plan = getOrgPlan(org);

    // Enforce member quota
    const currentMemberCount = await Membership.countDocuments({ organization: org._id });
    if (currentMemberCount >= plan.limits.maxMembers) {
      return res.status(403).json({
        success: false,
        code: 'QUOTA_EXCEEDED',
        metric: 'members',
        currentUsage: currentMemberCount,
        limit: plan.limits.maxMembers,
        message: `Plan limit reached: The ${plan.name} plan allows up to ${plan.limits.maxMembers} members. Upgrade to Pro for more seats.`
      });
    }

    // Check if target user is already a member
    const existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser) {
      const alreadyMember = await Membership.findOne({ organization: org._id, user: existingUser._id });
      if (alreadyMember) {
        return res.status(400).json({ success: false, message: 'This user is already a member of the organization' });
      }
    }

    // Revoke any existing pending invite for this email
    await Invitation.updateMany(
      { organization: org._id, email: cleanEmail, status: 'pending' },
      { $set: { status: 'revoked' } }
    );

    // Generate cryptographically secure random token and its SHA-256 hash
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashSecret(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invitation = await Invitation.create({
      organization: org._id,
      workspace: workspaceId || null,
      email: cleanEmail,
      role: [ROLES.ADMIN, ROLES.MANAGER, ROLES.MEMBER, ROLES.GUEST, ROLES.BILLING_ADMIN].includes(role)
        ? role
        : ROLES.MEMBER,
      token: rawToken,
      tokenHash,
      invitedBy: req.user._id,
      expiresAt
    });

    await AuditLog.create({
      organization: org._id,
      actor: req.user._id,
      action: 'member.invited',
      targetType: 'Invitation',
      targetId: invitation._id.toString(),
      details: { email: cleanEmail, role: invitation.role },
      ipAddress: req.ip
    });

    res.status(201).json({
      success: true,
      message: `Invitation generated for ${cleanEmail}`,
      invitation: {
        id: invitation._id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
        token: rawToken,
        inviteUrl: `${req.protocol}://${req.get('host')}/invite/${rawToken}`
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Accept an invitation
// @route   POST /api/organizations/invitations/:token/accept
// @access  Private
export const acceptInvitation = async (req, res, next) => {
  try {
    const { token } = req.params;
    const hashed = hashSecret(token);

    // Match either hashed token or raw token
    const invitation = await Invitation.findOne({
      $or: [{ tokenHash: hashed }, { token }],
      status: 'pending',
      expiresAt: { $gt: new Date() }
    }).populate('organization');

    if (!invitation || !invitation.organization) {
      return res.status(400).json({
        success: false,
        message: 'Invitation is invalid, has expired, or was already accepted'
      });
    }

    // Check if user is already a member
    let membership = await Membership.findOne({
      organization: invitation.organization._id,
      user: req.user._id
    });

    if (!membership) {
      membership = await Membership.create({
        organization: invitation.organization._id,
        user: req.user._id,
        role: invitation.role
      });
    }

    invitation.status = 'accepted';
    await invitation.save();

    await AuditLog.create({
      organization: invitation.organization._id,
      actor: req.user._id,
      action: 'member.joined',
      targetType: 'Membership',
      targetId: membership._id.toString(),
      details: { role: membership.role },
      ipAddress: req.ip
    });

    res.status(200).json({
      success: true,
      message: `You have successfully joined ${invitation.organization.name}`,
      organization: invitation.organization
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Revoke a pending invitation
// @route   DELETE /api/organizations/:id/invitations/:invitationId
// @access  Private (Owner / Admin / Manager)
export const revokeInvitation = async (req, res, next) => {
  try {
    const { invitationId } = req.params;
    const org = req.organization;

    const invitation = await Invitation.findOne({
      _id: invitationId,
      organization: org._id
    });

    if (!invitation) {
      return res.status(404).json({ success: false, message: 'Invitation not found' });
    }

    invitation.status = 'revoked';
    await invitation.save();

    await AuditLog.create({
      organization: org._id,
      actor: req.user._id,
      action: 'invitation.revoked',
      targetType: 'Invitation',
      targetId: invitationId,
      details: { email: invitation.email },
      ipAddress: req.ip
    });

    res.status(200).json({
      success: true,
      message: 'Invitation revoked successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update a member's role
// @route   PATCH /api/organizations/:id/members/:userId
// @access  Private (Owner / Admin)
export const updateMemberRole = async (req, res, next) => {
  try {
    const { id: orgId, userId } = req.params;
    const { role: newRole } = req.body;
    const callerMembership = req.membership;

    if (!newRole || !Object.values(ROLES).includes(newRole)) {
      return res.status(400).json({ success: false, message: 'Valid role is required' });
    }

    const targetMembership = await Membership.findOne({
      organization: orgId,
      user: userId
    }).populate('user');

    if (!targetMembership) {
      return res.status(404).json({ success: false, message: 'Member not found in this organization' });
    }

    // Final Owner Protection: Owner role cannot be changed via role update
    if (targetMembership.role === ROLES.OWNER) {
      return res.status(400).json({
        success: false,
        code: 'FINAL_OWNER_PROTECTION',
        message: 'Cannot demote the organization owner. Use transfer ownership instead.'
      });
    }

    // Cannot promote someone to Owner via role update
    if (newRole === ROLES.OWNER) {
      return res.status(400).json({
        success: false,
        message: 'Cannot assign owner role directly. Use transfer ownership instead.'
      });
    }

    // Privilege Escalation Defense:
    // Non-owners cannot modify roles of members with equal or higher rank, nor assign a role >= caller's rank
    if (callerMembership.role !== ROLES.OWNER) {
      const callerLevel = ROLE_HIERARCHY[callerMembership.role] || 0;
      const targetCurrentLevel = ROLE_HIERARCHY[targetMembership.role] || 0;
      const newRoleLevel = ROLE_HIERARCHY[newRole] || 0;

      if (targetCurrentLevel >= callerLevel) {
        return res.status(403).json({
          success: false,
          code: 'PRIVILEGE_ESCALATION_BLOCKED',
          message: 'You cannot modify the role of a member with equal or higher rank'
        });
      }

      if (newRoleLevel >= callerLevel) {
        return res.status(403).json({
          success: false,
          code: 'PRIVILEGE_ESCALATION_BLOCKED',
          message: 'You cannot grant a role equal or higher than your own rank'
        });
      }
    }

    const oldRole = targetMembership.role;
    targetMembership.role = newRole;
    await targetMembership.save();

    await AuditLog.create({
      organization: orgId,
      actor: req.user._id,
      action: 'member.role_updated',
      targetType: 'User',
      targetId: userId,
      details: { oldRole, newRole },
      ipAddress: req.ip
    });

    res.status(200).json({
      success: true,
      message: `Member role updated to ${newRole}`,
      member: {
        id: targetMembership._id,
        user: targetMembership.user,
        role: targetMembership.role
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Remove member from organization
// @route   DELETE /api/organizations/:id/members/:userId
// @access  Private (Owner / Admin)
export const removeMember = async (req, res, next) => {
  try {
    const { id: orgId, userId } = req.params;
    const callerMembership = req.membership;

    const targetMembership = await Membership.findOne({
      organization: orgId,
      user: userId
    });

    if (!targetMembership) {
      return res.status(404).json({ success: false, message: 'Member not found in this organization' });
    }

    // Final Owner Protection: Cannot remove the owner
    if (targetMembership.role === ROLES.OWNER) {
      return res.status(400).json({
        success: false,
        code: 'FINAL_OWNER_PROTECTION',
        message: 'Cannot remove the organization owner'
      });
    }

    // Non-owner rank check
    if (callerMembership.role !== ROLES.OWNER) {
      const callerLevel = ROLE_HIERARCHY[callerMembership.role] || 0;
      const targetLevel = ROLE_HIERARCHY[targetMembership.role] || 0;
      if (targetLevel >= callerLevel) {
        return res.status(403).json({
          success: false,
          message: 'You cannot remove a member with equal or higher rank'
        });
      }
    }

    await Membership.findByIdAndDelete(targetMembership._id);

    await AuditLog.create({
      organization: orgId,
      actor: req.user._id,
      action: 'member.removed',
      targetType: 'User',
      targetId: userId,
      ipAddress: req.ip
    });

    res.status(200).json({
      success: true,
      message: 'Member removed successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Voluntarily leave organization
// @route   POST /api/organizations/:id/leave
// @access  Private
export const leaveOrganization = async (req, res, next) => {
  try {
    const org = req.organization;
    const membership = req.membership;

    // Final Owner Protection: Owner cannot leave without transferring ownership
    if (membership.role === ROLES.OWNER) {
      return res.status(400).json({
        success: false,
        code: 'FINAL_OWNER_CANNOT_LEAVE',
        message: 'The organization owner cannot leave without transferring ownership first'
      });
    }

    await Membership.findByIdAndDelete(membership._id);

    await AuditLog.create({
      organization: org._id,
      actor: req.user._id,
      action: 'member.left',
      targetType: 'User',
      targetId: req.user._id.toString(),
      ipAddress: req.ip
    });

    res.status(200).json({
      success: true,
      message: `You have left ${org.name}`
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get organization audit logs
// @route   GET /api/organizations/:id/audit-logs
// @access  Private (Owner / Admin / Billing Admin)
export const getAuditLogs = async (req, res, next) => {
  try {
    const orgId = req.organization._id;
    const { page = 1, limit = 20 } = req.query;

    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (parsedPage - 1) * parsedLimit;

    const [total, logs] = await Promise.all([
      AuditLog.countDocuments({ organization: orgId }),
      AuditLog.find({ organization: orgId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parsedLimit)
        .populate('actor', 'name email avatar')
    ]);

    const totalPages = Math.ceil(total / parsedLimit);

    res.status(200).json({
      success: true,
      count: logs.length,
      total,
      page: parsedPage,
      limit: parsedLimit,
      totalPages,
      hasMore: parsedPage < totalPages,
      logs
    });
  } catch (error) {
    next(error);
  }
};
