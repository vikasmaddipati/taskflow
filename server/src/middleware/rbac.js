import { hasPermission, ROLE_HIERARCHY, ROLES } from '../config/permissions.js';

/**
 * Reusable permission enforcement middleware.
 * Verifies that the authenticated user's organization membership grants the required capability.
 */
export const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        code: 'UNAUTHENTICATED',
        message: 'Authentication required'
      });
    }

    if (!req.membership || !req.membership.role) {
      return res.status(403).json({
        success: false,
        code: 'NO_MEMBERSHIP',
        message: 'You are not an active member of this organization'
      });
    }

    const userRole = req.membership.role;
    if (!hasPermission(userRole, permission)) {
      return res.status(403).json({
        success: false,
        code: 'PERMISSION_DENIED',
        message: `Action denied. Role '${userRole}' lacks permission '${permission}'`,
        requiredPermission: permission
      });
    }

    next();
  };
};

/**
 * Validates role-hierarchy rules to prevent privilege escalation.
 * Ensures an actor cannot grant a role higher or equal to their own (unless owner).
 */
export const validateRoleAssignment = (actorRole, targetRole) => {
  if (actorRole === ROLES.OWNER) return true;
  const actorLevel = ROLE_HIERARCHY[actorRole] || 0;
  const targetLevel = ROLE_HIERARCHY[targetRole] || 0;
  // Non-owners can only grant roles strictly below their own rank
  return actorLevel > targetLevel;
};
