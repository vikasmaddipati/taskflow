import crypto from 'crypto';
import Organization from '../models/Organization.js';
import Membership from '../models/Membership.js';
import Workspace from '../models/Workspace.js';
import Invitation from '../models/Invitation.js';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';
import { getOrgPlan } from '../config/plans.js';

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
      role: 'owner'
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
        role: 'owner'
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

// @desc    List members of an organization
// @route   GET /api/organizations/:id/members
// @access  Private
export const getOrganizationMembers = async (req, res, next) => {
  try {
    const membership = await Membership.findOne({
      organization: req.params.id,
      user: req.user._id
    });

    if (!membership) {
      return res.status(403).json({ success: false, message: 'Access denied to organization members' });
    }

    const members = await Membership.find({ organization: req.params.id })
      .populate('user', 'name email avatar')
      .sort({ joinedAt: 1 });

    const invitations = await Invitation.find({
      organization: req.params.id,
      status: 'pending',
      expiresAt: { $gt: new Date() }
    }).select('-token');

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
// @access  Private (Owner / Admin)
export const inviteMember = async (req, res, next) => {
  try {
    const { email, role = 'member' } = req.body;
    const orgId = req.params.id;

    if (!email || !email.includes('@')) {
      return res.status(400).json({ success: false, message: 'Valid email address is required' });
    }

    const cleanEmail = email.toLowerCase().trim();

    // Verify caller is admin or owner
    const callerMembership = await Membership.findOne({
      organization: orgId,
      user: req.user._id
    }).populate('organization');

    if (!callerMembership || !['owner', 'admin'].includes(callerMembership.role)) {
      return res.status(403).json({ success: false, message: 'Only owners and admins can invite members' });
    }

    const org = callerMembership.organization;
    const plan = getOrgPlan(org);

    // Enforce member quota
    const currentMemberCount = await Membership.countDocuments({ organization: orgId });
    if (currentMemberCount >= plan.limits.maxMembers) {
      return res.status(403).json({
        success: false,
        code: 'QUOTA_EXCEEDED_MEMBERS',
        message: `Plan limit reached: The ${plan.name} plan allows up to ${plan.limits.maxMembers} members. Upgrade to Pro for more seats.`
      });
    }

    // Check if target user is already a member
    const existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser) {
      const alreadyMember = await Membership.findOne({ organization: orgId, user: existingUser._id });
      if (alreadyMember) {
        return res.status(400).json({ success: false, message: 'This user is already a member of the organization' });
      }
    }

    // Revoke any existing pending invite for this email
    await Invitation.updateMany(
      { organization: orgId, email: cleanEmail, status: 'pending' },
      { $set: { status: 'revoked' } }
    );

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invitation = await Invitation.create({
      organization: orgId,
      email: cleanEmail,
      role: ['admin', 'member', 'guest'].includes(role) ? role : 'member',
      token,
      invitedBy: req.user._id,
      expiresAt
    });

    await AuditLog.create({
      organization: orgId,
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
        inviteUrl: `${req.protocol}://${req.get('host')}/invite/${token}`
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

    const invitation = await Invitation.findOne({
      token,
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

// @desc    Remove member from organization
// @route   DELETE /api/organizations/:id/members/:userId
// @access  Private (Owner / Admin)
export const removeMember = async (req, res, next) => {
  try {
    const { id: orgId, userId } = req.params;

    const callerMembership = await Membership.findOne({
      organization: orgId,
      user: req.user._id
    });

    if (!callerMembership || !['owner', 'admin'].includes(callerMembership.role)) {
      return res.status(403).json({ success: false, message: 'Insufficient permission to remove members' });
    }

    const targetMembership = await Membership.findOne({
      organization: orgId,
      user: userId
    });

    if (!targetMembership) {
      return res.status(404).json({ success: false, message: 'Member not found in this organization' });
    }

    if (targetMembership.role === 'owner') {
      return res.status(400).json({ success: false, message: 'Cannot remove the organization owner' });
    }

    if (callerMembership.role === 'admin' && targetMembership.role === 'admin') {
      return res.status(403).json({ success: false, message: 'Admins cannot remove other admins' });
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
