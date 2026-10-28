import Organization from '../models/Organization.js';
import Subscription from '../models/Subscription.js';
import UsageRecord from '../models/UsageRecord.js';
import Membership from '../models/Membership.js';
import Workspace from '../models/Workspace.js';
import Task from '../models/Task.js';
import { PLANS, DEFAULT_PLAN_ID, getOrgPlan } from '../config/plans.js';

/**
 * Returns current UTC monthly period identifier (e.g. "2026-10")
 */
export const getCurrentPeriod = (date = new Date()) => {
  const d = new Date(date);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

/**
 * Resolves authoritative entitlements for an organization based on active subscription status
 */
export const getEffectiveEntitlements = async (organizationId) => {
  const org = await Organization.findById(organizationId);
  if (!org) {
    throw new Error('Organization not found');
  }

  const subscription = await Subscription.findOne({ organization: organizationId });

  let effectivePlanId = org.plan || DEFAULT_PLAN_ID;
  let status = subscription?.status || 'active';
  let isGracePeriod = false;

  if (subscription) {
    const now = new Date();
    // If subscription is past due, allow a 7-day grace period
    if (subscription.status === 'past_due') {
      const gracePeriodEnd = new Date(subscription.currentPeriodEnd.getTime() + 7 * 24 * 60 * 60 * 1000);
      if (now <= gracePeriodEnd) {
        isGracePeriod = true;
      } else {
        // Grace period expired: downgrade to Free limits without deleting data
        effectivePlanId = 'free';
      }
    } else if (['canceled', 'incomplete_expired', 'unpaid'].includes(subscription.status)) {
      if (subscription.currentPeriodEnd && now > subscription.currentPeriodEnd) {
        effectivePlanId = 'free';
      }
    } else if (subscription.status === 'active' || subscription.status === 'trialing') {
      effectivePlanId = subscription.plan;
    }
  }

  const planConfig = PLANS[effectivePlanId] || PLANS.free;

  return {
    planId: effectivePlanId,
    plan: planConfig,
    status,
    isGracePeriod,
    subscription,
    limits: planConfig.limits,
    features: planConfig.features
  };
};

/**
 * Atomically checks quota compliance for an operation
 */
export const checkQuota = async (organizationId, metric, requestedCount = 1) => {
  const entitlements = await getEffectiveEntitlements(organizationId);
  const period = getCurrentPeriod();

  let currentUsage = 0;
  let limit = 0;

  if (metric === 'tasks_created') {
    limit = entitlements.limits.maxTasksPerMonth;
    const usage = await UsageRecord.findOne({
      organization: organizationId,
      metric: 'tasks_created',
      period
    });
    currentUsage = usage ? usage.count : 0;
  } else if (metric === 'members') {
    limit = entitlements.limits.maxMembers;
    currentUsage = await Membership.countDocuments({ organization: organizationId });
  } else if (metric === 'workspaces') {
    limit = entitlements.limits.maxWorkspaces;
    currentUsage = await Workspace.countDocuments({
      organization: organizationId,
      isArchived: false
    });
  } else if (metric === 'exports') {
    limit = entitlements.limits.maxExportsPerMonth;
    const usage = await UsageRecord.findOne({
      organization: organizationId,
      metric: 'exports_generated',
      period
    });
    currentUsage = usage ? usage.count : 0;
  }

  const allowed = currentUsage + requestedCount <= limit;
  return {
    allowed,
    metric,
    currentUsage,
    limit,
    remaining: Math.max(0, limit - currentUsage),
    planName: entitlements.plan.name
  };
};

/**
 * Concurrency-safe atomic usage recording with upsert
 */
export const recordUsage = async (organizationId, metric, increment = 1) => {
  const period = getCurrentPeriod();
  const record = await UsageRecord.findOneAndUpdate(
    { organization: organizationId, metric, period },
    { $inc: { count: increment } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return record.count;
};

/**
 * Gathers complete usage and quota summary for billing dashboard
 */
export const getUsageSummary = async (organizationId) => {
  const entitlements = await getEffectiveEntitlements(organizationId);
  const period = getCurrentPeriod();

  const [tasksUsage, exportsUsage, membersCount, workspacesCount] = await Promise.all([
    UsageRecord.findOne({ organization: organizationId, metric: 'tasks_created', period }),
    UsageRecord.findOne({ organization: organizationId, metric: 'exports_generated', period }),
    Membership.countDocuments({ organization: organizationId }),
    Workspace.countDocuments({ organization: organizationId, isArchived: false })
  ]);

  const tasksCreated = tasksUsage ? tasksUsage.count : 0;
  const exportsCreated = exportsUsage ? exportsUsage.count : 0;

  return {
    period,
    plan: entitlements.plan,
    status: entitlements.status,
    isGracePeriod: entitlements.isGracePeriod,
    subscription: entitlements.subscription,
    quotas: {
      tasks: {
        metric: 'tasks_created',
        current: tasksCreated,
        limit: entitlements.limits.maxTasksPerMonth,
        percentage: Math.min(100, Math.round((tasksCreated / entitlements.limits.maxTasksPerMonth) * 100))
      },
      members: {
        metric: 'members',
        current: membersCount,
        limit: entitlements.limits.maxMembers,
        percentage: Math.min(100, Math.round((membersCount / entitlements.limits.maxMembers) * 100))
      },
      workspaces: {
        metric: 'workspaces',
        current: workspacesCount,
        limit: entitlements.limits.maxWorkspaces,
        percentage: Math.min(100, Math.round((workspacesCount / entitlements.limits.maxWorkspaces) * 100))
      },
      exports: {
        metric: 'exports_generated',
        current: exportsCreated,
        limit: entitlements.limits.maxExportsPerMonth,
        percentage: Math.min(100, Math.round((exportsCreated / entitlements.limits.maxExportsPerMonth) * 100))
      }
    },
    features: entitlements.features
  };
};

/**
 * Express Middleware: Enforces feature entitlement
 */
export const requireFeature = (featureName) => {
  return async (req, res, next) => {
    try {
      if (!req.organization) {
        return res.status(401).json({ success: false, message: 'Organization context required' });
      }

      const entitlements = await getEffectiveEntitlements(req.organization._id);
      if (!entitlements.features[featureName]) {
        return res.status(403).json({
          success: false,
          code: 'FEATURE_GATED',
          feature: featureName,
          currentPlan: entitlements.plan.name,
          message: `The '${featureName}' capability is not available on your ${entitlements.plan.name} plan. Upgrade to unlock this feature.`
        });
      }

      next();
    } catch (err) {
      next(err);
    }
  };
};

/**
 * Express Middleware: Enforces resource creation quota
 */
export const requireQuota = (metric, requestedCount = 1) => {
  return async (req, res, next) => {
    try {
      if (!req.organization) {
        return res.status(401).json({ success: false, message: 'Organization context required' });
      }

      const check = await checkQuota(req.organization._id, metric, requestedCount);
      if (!check.allowed) {
        return res.status(403).json({
          success: false,
          code: 'QUOTA_EXCEEDED',
          metric: check.metric,
          currentUsage: check.currentUsage,
          limit: check.limit,
          message: `Monthly quota exceeded: Your ${check.planName} plan allows up to ${check.limit} ${check.metric}. Upgrade to a higher tier for more capacity.`
        });
      }

      next();
    } catch (err) {
      next(err);
    }
  };
};
