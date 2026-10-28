import React, { useState, useEffect } from 'react';
import { CreditCard, Check, Sparkles, Zap, Shield, ExternalLink, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

export const BillingView = ({ showToast }) => {
  const { currentOrg, fetchOrganizations } = useAuth();
  const [billingData, setBillingData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [upgradingPlan, setUpgradingPlan] = useState(null);
  const [openingPortal, setOpeningPortal] = useState(false);

  const fetchBilling = async () => {
    try {
      setLoading(true);
      const res = await api.get('/billing/plans');
      if (res.data.success) {
        setBillingData(res.data);
      }
    } catch (err) {
      showToast?.({ type: 'error', message: err.response?.data?.message || 'Failed to load billing status' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBilling();
  }, [currentOrg?._id]);

  const handleUpgrade = async (planId) => {
    setUpgradingPlan(planId);
    try {
      const res = await api.post('/billing/checkout', { planId });
      if (res.data.success) {
        if (res.data.mode === 'simulation') {
          showToast?.({ type: 'success', message: res.data.message });
          fetchBilling();
          fetchOrganizations();
        } else if (res.data.url) {
          window.location.href = res.data.url;
        }
      }
    } catch (err) {
      showToast?.({ type: 'error', message: err.response?.data?.message || 'Failed to initiate checkout' });
    } finally {
      setUpgradingPlan(null);
    }
  };

  const handleOpenPortal = async () => {
    setOpeningPortal(true);
    try {
      const res = await api.post('/billing/portal');
      if (res.data.success && res.data.url) {
        window.location.href = res.data.url;
      }
    } catch (err) {
      showToast?.({ type: 'error', message: err.response?.data?.message || 'Unable to open billing portal' });
    } finally {
      setOpeningPortal(false);
    }
  };

  const currentPlan = billingData?.currentPlan || { id: currentOrg?.plan || 'free', name: 'Starter (Free)' };
  const plans = billingData?.plans || [];

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="p-6 bg-linear-to-r from-purple-500/10 via-indigo-500/10 to-blue-500/10 dark:from-purple-950/20 dark:via-indigo-950/20 dark:to-blue-950/20 rounded-2xl border border-purple-200/50 dark:border-purple-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 font-semibold text-xs uppercase tracking-wider">
            <CreditCard className="w-4 h-4" />
            <span>SaaS Subscription & Entitlements</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1">
            Billing & Plans — {currentOrg?.name || 'Workspace'}
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Current Tier: <span className="font-extrabold uppercase text-indigo-600 dark:text-indigo-400">{currentPlan.id}</span>
            {currentPlan.status === 'active' && ' • Active Subscription'}
          </p>
        </div>

        {currentPlan.id !== 'free' && (
          <button
            onClick={handleOpenPortal}
            disabled={openingPortal}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors self-start sm:self-auto"
          >
            <ExternalLink className="w-4 h-4 text-slate-400" />
            {openingPortal ? 'Loading...' : 'Manage Stripe Billing'}
          </button>
        )}
      </div>

      {/* Pricing Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((p) => {
          const isCurrent = currentPlan.id === p.id;
          const isPro = p.id === 'pro';

          return (
            <div
              key={p.id}
              className={`relative flex flex-col rounded-3xl p-6 border transition-all ${
                isCurrent
                  ? 'border-indigo-500 ring-2 ring-indigo-500/40 bg-white dark:bg-slate-900 shadow-md'
                  : isPro
                  ? 'border-purple-300 dark:border-purple-800 bg-purple-50/20 dark:bg-purple-950/10'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
              }`}
            >
              {isPro && !isCurrent && (
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
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">{p.name}</h3>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-slate-900 dark:text-slate-100">
                    ${p.priceMonthly}
                  </span>
                  <span className="text-xs text-slate-400">/ month</span>
                </div>
              </div>

              {/* Limits and features */}
              <ul className="mt-6 space-y-3 flex-1 text-xs text-slate-600 dark:text-slate-300">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Up to <strong>{p.limits.maxMembers}</strong> team members</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Up to <strong>{p.limits.maxTasks}</strong> active tasks</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Up to <strong>{p.limits.maxWorkspaces}</strong> dedicated workspaces</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className={`w-4 h-4 shrink-0 ${p.features.analytics ? 'text-emerald-500' : 'text-slate-300'}`} />
                  <span className={p.features.analytics ? '' : 'text-slate-400'}>Productivity Analytics</span>
                </li>
              </ul>

              {/* Action Button */}
              <div className="mt-8 pt-4 border-t border-slate-100 dark:border-slate-800">
                {isCurrent ? (
                  <button
                    disabled
                    className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 font-semibold text-xs cursor-default"
                  >
                    Current Plan
                  </button>
                ) : p.priceMonthly === 0 ? (
                  <button
                    disabled
                    className="w-full py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-400 font-medium text-xs cursor-default"
                  >
                    Included
                  </button>
                ) : (
                  <button
                    onClick={() => handleUpgrade(p.id)}
                    disabled={upgradingPlan === p.id}
                    className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50"
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
  );
};
