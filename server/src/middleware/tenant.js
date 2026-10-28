import Organization from '../models/Organization.js';
import Membership from '../models/Membership.js';
import Workspace from '../models/Workspace.js';

/**
 * Resolves active organization context for the authenticated user and verifies membership.
 * Auto-provisions a personal organization if the user doesn't have one yet.
 */
export const resolveTenant = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const requestedOrgId =
      req.headers['x-organization-id'] ||
      req.query.organizationId ||
      req.user.currentOrganization;

    let organization = null;
    let membership = null;

    if (requestedOrgId && requestedOrgId.match(/^[0-9a-fA-F]{24}$/)) {
      membership = await Membership.findOne({
        organization: requestedOrgId,
        user: req.user._id
      }).populate('organization');

      if (membership && membership.organization) {
        organization = membership.organization;
      }
    }

    // If requested org not found or not specified, find user's primary membership
    if (!organization) {
      membership = await Membership.findOne({ user: req.user._id })
        .sort({ role: 1, createdAt: 1 })
        .populate('organization');

      if (membership && membership.organization) {
        organization = membership.organization;
      }
    }

    // If user has zero organizations, auto-provision personal organization
    if (!organization) {
      const slug = `org-${req.user._id.toString().slice(-6)}-${Date.now().toString().slice(-4)}`;
      organization = await Organization.create({
        name: `${req.user.name}'s Workspace`,
        slug,
        owner: req.user._id,
        isPersonal: true,
        plan: 'free'
      });

      membership = await Membership.create({
        organization: organization._id,
        user: req.user._id,
        role: 'owner'
      });

      // Create default workspace
      await Workspace.create({
        organization: organization._id,
        name: 'General',
        isDefault: true,
        createdBy: req.user._id
      });

      req.user.currentOrganization = organization._id;
      await req.user.save({ validateBeforeSave: false });
    }

    req.organization = organization;
    req.membership = membership;
    req.orgRole = membership ? membership.role : 'guest';

    // Resolve active Workspace context within organization
    const requestedWorkspaceId =
      req.headers['x-workspace-id'] ||
      req.query.workspaceId;

    let workspace = null;
    if (requestedWorkspaceId && requestedWorkspaceId.match(/^[0-9a-fA-F]{24}$/)) {
      workspace = await Workspace.findOne({
        _id: requestedWorkspaceId,
        organization: organization._id,
        isArchived: false
      });
    }

    if (!workspace) {
      // Fallback to default or first active workspace in this organization
      workspace = await Workspace.findOne({
        organization: organization._id,
        isArchived: false
      }).sort({ isDefault: -1, createdAt: 1 });
    }

    // If still no workspace exists in the organization, create default 'General'
    if (!workspace) {
      workspace = await Workspace.create({
        organization: organization._id,
        name: 'General',
        isDefault: true,
        createdBy: req.user._id
      });
    }

    req.workspace = workspace;

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * RBAC authorization middleware: requires specific organization roles
 * @param {string[]} allowedRoles - e.g. ['owner', 'admin']
 */
export const requireRole = (allowedRoles = ['owner', 'admin']) => {
  return (req, res, next) => {
    if (!req.orgRole || !allowedRoles.includes(req.orgRole)) {
      return res.status(403).json({
        success: false,
        code: 'FORBIDDEN_INSUFFICIENT_ROLE',
        message: `This action requires one of the following roles: ${allowedRoles.join(', ')}`
      });
    }
    next();
  };
};
