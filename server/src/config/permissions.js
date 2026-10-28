/**
 * Centralized Permission Registry & Role-to-Permission Mapping
 * Defines explicit capabilities and roles for TaskFlow Multi-Tenant SaaS.
 */

export const PERMISSIONS = {
  // Organization Administration
  ORG_READ: 'organization:read',
  ORG_UPDATE: 'organization:update',
  ORG_DELETE: 'organization:delete',
  ORG_TRANSFER_OWNERSHIP: 'organization:transfer_ownership',

  // Membership & Invitations
  MEMBERS_READ: 'members:read',
  MEMBERS_INVITE: 'members:invite',
  MEMBERS_UPDATE_ROLE: 'members:update_role',
  MEMBERS_REMOVE: 'members:remove',

  // Teams
  TEAMS_CREATE: 'teams:create',
  TEAMS_MANAGE: 'teams:manage',

  // Workspaces
  WORKSPACES_CREATE: 'workspaces:create',
  WORKSPACES_READ: 'workspaces:read',
  WORKSPACES_UPDATE: 'workspaces:update',
  WORKSPACES_DELETE: 'workspaces:delete',

  // Tasks & Collaboration
  TASKS_CREATE: 'tasks:create',
  TASKS_READ: 'tasks:read',
  TASKS_UPDATE: 'tasks:update',
  TASKS_DELETE: 'tasks:delete',
  TASKS_ASSIGN: 'tasks:assign',
  TASKS_SHARE: 'tasks:share',
  TASKS_COMMENT: 'tasks:comment',

  // Billing
  BILLING_READ: 'billing:read',
  BILLING_MANAGE: 'billing:manage',

  // Security & Compliance
  AUDIT_LOGS_READ: 'audit_logs:read'
};

export const ALL_PERMISSIONS = Object.values(PERMISSIONS);

export const ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MANAGER: 'manager',
  MEMBER: 'member',
  GUEST: 'guest',
  BILLING_ADMIN: 'billing_admin'
};

export const ROLE_HIERARCHY = {
  owner: 100,
  admin: 80,
  manager: 60,
  member: 40,
  guest: 20,
  billing_admin: 30
};

/**
 * Explicit Role-to-Permissions Mapping
 */
export const ROLE_PERMISSIONS = {
  [ROLES.OWNER]: ALL_PERMISSIONS,

  [ROLES.ADMIN]: [
    PERMISSIONS.ORG_READ,
    PERMISSIONS.ORG_UPDATE,
    PERMISSIONS.MEMBERS_READ,
    PERMISSIONS.MEMBERS_INVITE,
    PERMISSIONS.MEMBERS_UPDATE_ROLE,
    PERMISSIONS.MEMBERS_REMOVE,
    PERMISSIONS.TEAMS_CREATE,
    PERMISSIONS.TEAMS_MANAGE,
    PERMISSIONS.WORKSPACES_CREATE,
    PERMISSIONS.WORKSPACES_READ,
    PERMISSIONS.WORKSPACES_UPDATE,
    PERMISSIONS.WORKSPACES_DELETE,
    PERMISSIONS.TASKS_CREATE,
    PERMISSIONS.TASKS_READ,
    PERMISSIONS.TASKS_UPDATE,
    PERMISSIONS.TASKS_DELETE,
    PERMISSIONS.TASKS_ASSIGN,
    PERMISSIONS.TASKS_SHARE,
    PERMISSIONS.TASKS_COMMENT,
    PERMISSIONS.BILLING_READ,
    PERMISSIONS.BILLING_MANAGE,
    PERMISSIONS.AUDIT_LOGS_READ
  ],

  [ROLES.MANAGER]: [
    PERMISSIONS.ORG_READ,
    PERMISSIONS.MEMBERS_READ,
    PERMISSIONS.MEMBERS_INVITE,
    PERMISSIONS.TEAMS_CREATE,
    PERMISSIONS.TEAMS_MANAGE,
    PERMISSIONS.WORKSPACES_READ,
    PERMISSIONS.WORKSPACES_CREATE,
    PERMISSIONS.TASKS_CREATE,
    PERMISSIONS.TASKS_READ,
    PERMISSIONS.TASKS_UPDATE,
    PERMISSIONS.TASKS_DELETE,
    PERMISSIONS.TASKS_ASSIGN,
    PERMISSIONS.TASKS_SHARE,
    PERMISSIONS.TASKS_COMMENT
  ],

  [ROLES.MEMBER]: [
    PERMISSIONS.ORG_READ,
    PERMISSIONS.MEMBERS_READ,
    PERMISSIONS.WORKSPACES_READ,
    PERMISSIONS.TASKS_CREATE,
    PERMISSIONS.TASKS_READ,
    PERMISSIONS.TASKS_UPDATE,
    PERMISSIONS.TASKS_COMMENT
  ],

  [ROLES.GUEST]: [
    PERMISSIONS.ORG_READ,
    PERMISSIONS.WORKSPACES_READ,
    PERMISSIONS.TASKS_READ,
    PERMISSIONS.TASKS_UPDATE, // Permitted only on explicitly assigned/collaborated tasks via resource policy
    PERMISSIONS.TASKS_COMMENT
  ],

  [ROLES.BILLING_ADMIN]: [
    PERMISSIONS.ORG_READ,
    PERMISSIONS.MEMBERS_READ,
    PERMISSIONS.TASKS_READ,
    PERMISSIONS.BILLING_READ,
    PERMISSIONS.BILLING_MANAGE,
    PERMISSIONS.AUDIT_LOGS_READ
  ]
};

/**
 * Evaluates whether a role grants a specific permission.
 */
export const hasPermission = (role, permission) => {
  if (!role || !permission) return false;
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.includes(permission);
};
