/**
 * Configurable SaaS Plans and Resource Entitlements
 */

export const PLANS = {
  free: {
    id: 'free',
    name: 'Starter (Free)',
    priceMonthly: 0,
    limits: {
      maxMembers: 3,
      maxTasks: 100,
      maxWorkspaces: 1
    },
    features: {
      analytics: false,
      exportData: false,
      prioritySupport: false
    }
  },
  pro: {
    id: 'pro',
    name: 'Professional',
    priceMonthly: 12,
    limits: {
      maxMembers: 15,
      maxTasks: 2500,
      maxWorkspaces: 5
    },
    features: {
      analytics: true,
      exportData: true,
      prioritySupport: false
    }
  },
  business: {
    id: 'business',
    name: 'Enterprise / Business',
    priceMonthly: 39,
    limits: {
      maxMembers: 100,
      maxTasks: 50000,
      maxWorkspaces: 50
    },
    features: {
      analytics: true,
      exportData: true,
      prioritySupport: true
    }
  }
};

/**
 * Get plan config for an organization
 */
export const getOrgPlan = (organization) => {
  const planKey = organization?.plan || 'free';
  return PLANS[planKey] || PLANS.free;
};
