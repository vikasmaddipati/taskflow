/**
 * Centralized SaaS Plan Catalog, Resource Quotas, and Feature Entitlements
 */

export const PLANS = {
  free: {
    id: 'free',
    name: 'Free Starter',
    description: 'Essential task tracking for individuals and micro-teams',
    price: 0,
    currency: 'INR',
    interval: 'monthly',
    isSelfServe: true,
    limits: {
      maxTasks: 100,
      maxTasksPerMonth: 100,
      maxMembers: 3,
      maxWorkspaces: 1,
      storageMb: 100,
      maxExportsPerMonth: 1
    },
    features: {
      'tasks.basic': true,
      'tasks.advanced_filters': false,
      'tasks.bulk_actions': false,
      'tasks.export': false,
      'workspaces.multiple': false,
      'teams.collaboration': false,
      'members.invite': true,
      'analytics.advanced': false,
      'priority_support': false
    },
    razorpayPlanId: null,
    stripePriceId: null
  },

  pro: {
    id: 'pro',
    name: 'Professional',
    description: 'Advanced productivity and workflow filters for power users',
    price: 799,
    currency: 'INR',
    interval: 'monthly',
    isSelfServe: true,
    limits: {
      maxTasks: 2500,
      maxTasksPerMonth: 2500,
      maxMembers: 15,
      maxWorkspaces: 5,
      storageMb: 5000,
      maxExportsPerMonth: 25
    },
    features: {
      'tasks.basic': true,
      'tasks.advanced_filters': true,
      'tasks.bulk_actions': true,
      'tasks.export': true,
      'workspaces.multiple': true,
      'teams.collaboration': false,
      'members.invite': true,
      'analytics.advanced': true,
      'priority_support': false
    },
    razorpayPlanId: process.env.RAZORPAY_PLAN_PRO || 'plan_pro_monthly',
    stripePriceId: process.env.STRIPE_PRICE_PRO_MONTHLY || 'price_pro_monthly'
  },

  team: {
    id: 'team',
    name: 'Team Collaboration',
    description: 'Shared workspaces, team squads, and workload coordination',
    price: 1999,
    currency: 'INR',
    interval: 'monthly',
    isSelfServe: true,
    limits: {
      maxTasks: 10000,
      maxTasksPerMonth: 10000,
      maxMembers: 50,
      maxWorkspaces: 25,
      storageMb: 25000,
      maxExportsPerMonth: 100
    },
    features: {
      'tasks.basic': true,
      'tasks.advanced_filters': true,
      'tasks.bulk_actions': true,
      'tasks.export': true,
      'workspaces.multiple': true,
      'teams.collaboration': true,
      'members.invite': true,
      'analytics.advanced': true,
      'priority_support': false
    },
    razorpayPlanId: process.env.RAZORPAY_PLAN_TEAM || 'plan_team_monthly',
    stripePriceId: process.env.STRIPE_PRICE_TEAM_MONTHLY || 'price_team_monthly'
  },

  enterprise: {
    id: 'enterprise',
    name: 'Enterprise Scale',
    description: 'Maximum scale, dedicated support, and custom data retention',
    price: 4999,
    currency: 'INR',
    interval: 'monthly',
    isSelfServe: true,
    limits: {
      maxTasks: 100000,
      maxTasksPerMonth: 100000,
      maxMembers: 500,
      maxWorkspaces: 100,
      storageMb: 100000,
      maxExportsPerMonth: 1000
    },
    features: {
      'tasks.basic': true,
      'tasks.advanced_filters': true,
      'tasks.bulk_actions': true,
      'tasks.export': true,
      'workspaces.multiple': true,
      'teams.collaboration': true,
      'members.invite': true,
      'analytics.advanced': true,
      'priority_support': true
    },
    razorpayPlanId: process.env.RAZORPAY_PLAN_ENTERPRISE || 'plan_enterprise_monthly',
    stripePriceId: process.env.STRIPE_PRICE_BUSINESS_MONTHLY || 'price_enterprise_monthly'
  }
};

// Alias for legacy or alternative tier naming
PLANS.business = {
  ...PLANS.team,
  id: 'business',
  name: 'Business Team'
};

export const DEFAULT_PLAN_ID = 'free';

/**
 * Returns normalized plan definition for an organization
 */
export const getOrgPlan = (organization) => {
  const planKey = (organization?.plan || DEFAULT_PLAN_ID).toLowerCase();
  return PLANS[planKey] || PLANS.free;
};
