import React, { useState, useEffect, useCallback } from 'react';
import {
  CreditCard,
  Check,
  Sparkles,
  Zap,
  Shield,
  ExternalLink,
  ArrowRight,
  AlertTriangle,
  Calendar,
  Download,
  RefreshCw,
  FileText,
  Lock,
  Layers,
  Users,
  CheckCircle2,
  XCircle,
  Clock
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

/**
 * Dynamically loads Razorpay standard checkout script
 */
const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && window.Razorpay) {
      return resolve(true);
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

export const BillingView = ({ showToast }) => {
  const { currentOrg, fetchOrganizations } = useAuth();
  const [billingStatus, setBillingStatus] = useState(null);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [upgradingPlan, setUpgradingPlan] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const isBillingAdmin = !currentOrg?.role || ['owner', 'admin', 'billing_admin'].includes(currentOrg.role);

  // Fetch billing plans and live status
  const fetchBillingData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [plansRes, statusRes] = await Promise.all([
        api.get('/billing/plans'),
        api.get('/billing/status').catch(() => null)
      ]);

      if (plansRes.data?.success) {
        if (plansRes.data.plans) {
          setPlans(Object.values(plansRes.data.plans));
        } else if (plansRes.data.planList) {
          setPlans(plansRes.data.planList);
        }
      }

      if (statusRes?.data?.success) {
        setBillingStatus(statusRes.data);
      } else if (plansRes.data?.usage) {
        setBillingStatus({
          quotas: plansRes.data.usage.quotas,
          plan: plansRes.data.currentPlan,
          subscription: null,
          invoices: []
        });
      }
    } catch (err) {
      showToast?.({
        type: 'error',
        message: err.response?.data?.message || 'Failed to fetch billing status'
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchBillingData();
  }, [fetchBillingData, currentOrg?._id]);

  // Handle plan upgrade / checkout initiation
  const handleUpgrade = async (planId) => {
    if (!isBillingAdmin) {
      showToast?.({
        type: 'error',
        message: 'Only organization owners or admins can manage subscriptions.'
      });
      return;
    }

    setUpgradingPlan(planId);
    try {
      const checkoutRes = await api.post('/billing/checkout', { planId });

      if (!checkoutRes.data.success) {
        throw new Error(checkoutRes.data.message || 'Failed to initiate checkout session');
      }

      const checkoutData = checkoutRes.data;

      // Handle Test Mode Simulation
      if (checkoutData.mode === 'test_simulation') {
        // Automatically verify simulated payment
        const verifyRes = await api.post('/billing/verify', {
          razorpay_payment_id: `pay_test_${Date.now()}`,
          razorpay_subscription_id: checkoutData.subscriptionId,
          razorpay_signature: 'test_simulated_sig',
          planId
        });

        if (verifyRes.data.success) {
          showToast?.({
            type: 'success',
            message: `Upgraded to ${planId.toUpperCase()} tier successfully (Test Simulation)!`
          });
          await fetchBillingData();
          await fetchOrganizations();
        }
        return;
      }

      // Handle Live or Test Razorpay Checkout Modal
      const isScriptLoaded = await loadRazorpayScript();
      if (!isScriptLoaded || !window.Razorpay) {
        showToast?.({
          type: 'error',
          message: 'Razorpay SDK failed to load. Please check your internet connection.'
        });
        return;
      }

      const options = {
        key: checkoutData.keyId,
        subscription_id: checkoutData.subscriptionId,
        name: 'TaskFlow Cloud',
        description: `Upgrade to ${planId.toUpperCase()} Subscription`,
        prefill: {
          name: checkoutData.customer?.name,
          email: checkoutData.customer?.email
        },
        theme: {
          color: '#4f46e5'
        },
        handler: async (response) => {
          try {
            setUpgradingPlan(planId);
            const verifyRes = await api.post('/billing/verify', {
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_subscription_id: response.razorpay_subscription_id,
              razorpay_signature: response.razorpay_signature,
              planId
            });

            if (verifyRes.data.success) {
              showToast?.({
                type: 'success',
                message: 'Payment verified! Your subscription is now active.'
              });
              await fetchBillingData();
              await fetchOrganizations();
            }
          } catch (verifyErr) {
            showToast?.({
              type: 'error',
              message: verifyErr.response?.data?.message || 'Payment signature verification failed'
            });
          } finally {
            setUpgradingPlan(null);
          }
        },
        modal: {
          ondismiss: () => {
            setUpgradingPlan(null);
          }
        }
      };

      const rzpInstance = new window.Razorpay(options);
      rzpInstance.open();
    } catch (err) {
      showToast?.({
        type: 'error',
        message: err.response?.data?.message || err.message || 'Upgrade failed'
      });
    } finally {
      setUpgradingPlan(null);
    }
  };

  // Handle Cancel Subscription at Period End
  const handleCancelSubscription = async () => {
    if (!window.confirm('Are you sure you want to cancel your subscription at the end of the current billing cycle? You will retain access until the cycle finishes.')) {
      return;
    }

    setActionLoading(true);
    try {
      const res = await api.post('/billing/cancel');
      if (res.data.success) {
        showToast?.({
          type: 'success',
          message: 'Subscription will be canceled at the end of your billing cycle.'
        });
        await fetchBillingData();
      }
    } catch (err) {
      showToast?.({
        type: 'error',
        message: err.response?.data?.message || 'Failed to schedule cancellation'
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Resume Subscription
  const handleResumeSubscription = async () => {
    setActionLoading(true);
    try {
      const res = await api.post('/billing/resume');
      if (res.data.success) {
        showToast?.({
          type: 'success',
          message: 'Subscription resumed successfully!'
        });
        await fetchBillingData();
      }
    } catch (err) {
      showToast?.({
        type: 'error',
        message: err.response?.data?.message || 'Failed to resume subscription'
      });
    } finally {
      setActionLoading(false);
    }
  };

  const currentPlanId = billingStatus?.plan?.id || currentOrg?.plan || 'free';
  const subscription = billingStatus?.subscription;
  const quotas = billingStatus?.quotas;
  const invoices = billingStatus?.invoices || [];
  const isPastDue = billingStatus?.status === 'past_due' || billingStatus?.isGracePeriod;
  const isCancelScheduled = subscription?.cancelAtPeriodEnd;

  const formatCurrency = (amount, currency = 'INR') => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-200 pb-12">
      {/* Top Header Banner */}
      <div className="p-6 bg-linear-to-r from-purple-500/10 via-indigo-500/10 to-blue-500/10 dark:from-purple-950/20 dark:via-indigo-950/20 dark:to-blue-950/20 rounded-3xl border border-purple-200/50 dark:border-purple-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold text-xs uppercase tracking-wider">
            <CreditCard className="w-4 h-4" />
            <span>Monetization & Subscription Management</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800 dark:text-slate-100 mt-1">
            Billing & Plans — {currentOrg?.name || 'Organization'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2">
            <span>Current Tier:</span>
            <span className="font-extrabold uppercase px-2 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300">
              {currentPlanId}
            </span>
            <span>•</span>
            <span className={isPastDue ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-emerald-600 dark:text-emerald-400 font-semibold'}>
              {isPastDue ? 'Past Due (Grace Period)' : subscription?.status === 'active' ? 'Active Paid' : 'Active Free Tier'}
            </span>
            {subscription?.currentPeriodEnd && (
              <>
                <span>•</span>
                <span>Renews / Ends: {formatDate(subscription.currentPeriodEnd)}</span>
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => fetchBillingData(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Warning Alert: Past Due / Grace Period */}
      {isPastDue && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs sm:text-sm text-amber-800 dark:text-amber-200">
            <span className="font-bold">Payment Overdue — 7-Day Grace Period Active.</span> Your recent renewal invoice could not be charged. Please retry payment or update your billing details. During grace period, features remain intact.
          </div>
        </div>
      )}

      {/* Warning Alert: Scheduled Cancellation */}
      {isCancelScheduled && (
        <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-xs sm:text-sm text-indigo-900 dark:text-indigo-200">
            <Clock className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span>
              Your subscription is scheduled for cancellation and will expire on{' '}
              <strong>{formatDate(subscription?.currentPeriodEnd)}</strong>. You will automatically revert to the Free Starter plan.
            </span>
          </div>
          <button
            onClick={handleResumeSubscription}
            disabled={actionLoading}
            className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shrink-0 transition-colors shadow-xs"
          >
            {actionLoading ? 'Resuming...' : 'Resume Subscription'}
          </button>
        </div>
      )}

      {/* Read-Only Notice for Non-Admins */}
      {!isBillingAdmin && (
        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center gap-2.5 text-xs text-slate-500 dark:text-slate-400">
          <Lock className="w-4 h-4 text-slate-400 shrink-0" />
          <span>You have view-only access to organization billing. Only Organization Owners, Admins, or Billing Managers can modify plans.</span>
        </div>
      )}

      {/* Live Quotas & Metering Section */}
      {quotas && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" />
              <span>Current Usage & Quotas (Period: {billingStatus?.period || 'Monthly'})</span>
            </h2>
            <span className="text-xs text-slate-400">Resets monthly on UTC 1st</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Monthly Tasks Created */}
            <div className="p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span className="font-semibold">Tasks Created (Monthly)</span>
                <span className="font-bold text-slate-700 dark:text-slate-200">
                  {quotas.tasks?.current || 0} / {quotas.tasks?.limit || 0}
                </span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full mt-3 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    (quotas.tasks?.percentage || 0) >= 90
                      ? 'bg-rose-500'
                      : (quotas.tasks?.percentage || 0) >= 70
                      ? 'bg-amber-500'
                      : 'bg-indigo-600'
                  }`}
                  style={{ width: `${Math.min(100, quotas.tasks?.percentage || 0)}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-2">
                {quotas.tasks?.percentage || 0}% used of monthly allotment
              </p>
            </div>

            {/* Active Members */}
            <div className="p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span className="font-semibold">Team Members</span>
                <span className="font-bold text-slate-700 dark:text-slate-200">
                  {quotas.members?.current || 0} / {quotas.members?.limit || 0}
                </span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full mt-3 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    (quotas.members?.percentage || 0) >= 90 ? 'bg-rose-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, quotas.members?.percentage || 0)}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-2">
                {quotas.members?.percentage || 0}% seat utilization
              </p>
            </div>

            {/* Workspaces */}
            <div className="p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span className="font-semibold">Workspaces</span>
                <span className="font-bold text-slate-700 dark:text-slate-200">
                  {quotas.workspaces?.current || 0} / {quotas.workspaces?.limit || 0}
                </span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full mt-3 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    (quotas.workspaces?.percentage || 0) >= 90 ? 'bg-rose-500' : 'bg-blue-500'
                  }`}
                  style={{ width: `${Math.min(100, quotas.workspaces?.percentage || 0)}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-2">
                {quotas.workspaces?.percentage || 0}% workspace quota used
              </p>
            </div>

            {/* Exports */}
            <div className="p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span className="font-semibold">Data Exports (Monthly)</span>
                <span className="font-bold text-slate-700 dark:text-slate-200">
                  {quotas.exports?.current || 0} / {quotas.exports?.limit || 0}
                </span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full mt-3 overflow-hidden">
                <div
                  className="h-full rounded-full bg-purple-500 transition-all duration-500"
                  style={{ width: `${Math.min(100, quotas.exports?.percentage || 0)}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-2">
                {quotas.exports?.percentage || 0}% reports generated
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Pricing Comparison Cards */}
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
            Available Subscription Tiers
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Transparent pricing billed monthly. Scalable limits designed for solo makers and high-velocity engineering organizations.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {plans.map((p) => {
            const isCurrent = currentPlanId === p.id;
            const isPopular = p.id === 'team';
            const isPro = p.id === 'pro';

            return (
              <div
                key={p.id}
                className={`relative flex flex-col rounded-3xl p-6 border transition-all ${
                  isCurrent
                    ? 'border-indigo-500 ring-2 ring-indigo-500/40 bg-white dark:bg-slate-900 shadow-lg'
                    : isPopular
                    ? 'border-purple-300 dark:border-purple-800 bg-purple-50/20 dark:bg-purple-950/20 shadow-md'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                {/* Badges */}
                {isPopular && !isCurrent && (
                  <span className="absolute -top-3 right-6 bg-linear-to-r from-purple-600 to-indigo-600 text-white text-[10px] font-extrabold uppercase tracking-wider px-3 py-1 rounded-full shadow-xs">
                    Most Popular
                  </span>
                )}

                {isCurrent && (
                  <span className="absolute -top-3 right-6 bg-indigo-600 text-white text-[10px] font-extrabold uppercase tracking-wider px-3 py-1 rounded-full shadow-xs">
                    Current Plan
                  </span>
                )}

                <div>
                  <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">{p.name}</h3>
                  <p className="text-xs text-slate-400 mt-1 min-h-[32px]">{p.description}</p>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold text-slate-900 dark:text-slate-100">
                      {p.price === 0 ? '₹0' : formatCurrency(p.price, p.currency)}
                    </span>
                    <span className="text-xs text-slate-400">/ month</span>
                  </div>
                </div>

                {/* Plan Limits & Highlights */}
                <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800/80 flex-1">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">Resource Limits</p>
                  <ul className="space-y-2.5 text-xs text-slate-600 dark:text-slate-300">
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span><strong>{p.limits?.maxTasksPerMonth?.toLocaleString()}</strong> tasks/mo</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span><strong>{p.limits?.maxMembers}</strong> members</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span><strong>{p.limits?.maxWorkspaces}</strong> workspaces</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span><strong>{p.limits?.storageMb >= 1000 ? `${p.limits.storageMb / 1000}GB` : `${p.limits.storageMb}MB`}</strong> storage</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span><strong>{p.limits?.maxExportsPerMonth}</strong> exports/mo</span>
                    </li>
                  </ul>

                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mt-5 mb-3">Features</p>
                  <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 ${p.features?.['tasks.advanced_filters'] ? 'text-emerald-500' : 'text-slate-300 dark:text-slate-700'}`} />
                      <span className={p.features?.['tasks.advanced_filters'] ? '' : 'text-slate-400 dark:text-slate-600'}>
                        Advanced Filters
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 ${p.features?.['teams.collaboration'] ? 'text-emerald-500' : 'text-slate-300 dark:text-slate-700'}`} />
                      <span className={p.features?.['teams.collaboration'] ? '' : 'text-slate-400 dark:text-slate-600'}>
                        Team Squads & Collaboration
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 ${p.features?.['analytics.advanced'] ? 'text-emerald-500' : 'text-slate-300 dark:text-slate-700'}`} />
                      <span className={p.features?.['analytics.advanced'] ? '' : 'text-slate-400 dark:text-slate-600'}>
                        Productivity Analytics
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 ${p.features?.priority_support ? 'text-emerald-500' : 'text-slate-300 dark:text-slate-700'}`} />
                      <span className={p.features?.priority_support ? '' : 'text-slate-400 dark:text-slate-600'}>
                        24/7 Priority Support
                      </span>
                    </li>
                  </ul>
                </div>

                {/* Plan Action Button */}
                <div className="mt-8 pt-4 border-t border-slate-100 dark:border-slate-800">
                  {isCurrent ? (
                    <div className="space-y-2">
                      <button
                        disabled
                        className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-bold text-xs cursor-default flex items-center justify-center gap-1.5"
                      >
                        <Check className="w-4 h-4 text-emerald-500" />
                        <span>Active Tier</span>
                      </button>
                      {p.price > 0 && !isCancelScheduled && isBillingAdmin && (
                        <button
                          onClick={handleCancelSubscription}
                          disabled={actionLoading}
                          className="w-full py-1.5 text-center text-[11px] font-semibold text-rose-600 hover:text-rose-700 dark:text-rose-400 hover:underline transition-colors"
                        >
                          Cancel subscription
                        </button>
                      )}
                    </div>
                  ) : p.price === 0 ? (
                    <button
                      disabled
                      className="w-full py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-400 font-medium text-xs cursor-default"
                    >
                      Default Plan
                    </button>
                  ) : (
                    <button
                      onClick={() => handleUpgrade(p.id)}
                      disabled={upgradingPlan === p.id || !isBillingAdmin}
                      className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-1.5 active:scale-98 disabled:opacity-50"
                    >
                      {upgradingPlan === p.id ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <>
                          <span>Upgrade to {p.name.split(' ')[0]}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Invoice History Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-500" />
              <span>Billing History & Invoices</span>
            </h2>
            <p className="text-xs text-slate-400">Past payment records, receipts, and subscription charges</p>
          </div>
        </div>

        <div className="border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden bg-white dark:bg-slate-900 shadow-xs">
          {invoices.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No invoices or payment transactions recorded for this organization yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Description</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Reference ID</th>
                    <th className="py-3 px-4 text-right">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-600 dark:text-slate-300">
                  {invoices.map((inv) => (
                    <tr key={inv._id || inv.providerPaymentId} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-4 font-medium">{formatDate(inv.createdAt || inv.paidAt)}</td>
                      <td className="py-3 px-4">{inv.description || 'Subscription charge'}</td>
                      <td className="py-3 px-4 font-bold text-slate-800 dark:text-slate-100">
                        {formatCurrency(inv.amount, inv.currency)}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            inv.status === 'paid'
                              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                              : inv.status === 'failed'
                              ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                        {inv.providerPaymentId || inv._id}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {inv.receiptUrl ? (
                          <a
                            href={inv.receiptUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 hover:underline font-semibold"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Download</span>
                          </a>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600">Generated</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
