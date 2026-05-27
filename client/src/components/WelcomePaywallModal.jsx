import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { XMarkIcon, SparklesIcon, CheckIcon } from '@heroicons/react/24/outline';
import { isCapacitorNative } from '../utils/isNativeApp';
import { createCheckoutSession } from '../services/api';

/**
 * WelcomePaywallModal
 *
 * Shown to a freshly-registered or first-logged-in user on the dashboard.
 * Lets them either:
 *   - Start a 2-month free trial of Pro or Coach (direct Stripe Checkout), or
 *   - Continue on the Free plan.
 *
 * Suppressed on native iOS (App Store guideline 3.1.1: no external paywalls).
 * Visibility is controlled by the caller via `open` — typically gated by a
 * per-user localStorage flag so it only appears once.
 */

const PLANS = [
  {
    id: 'pro',
    name: 'Pro',
    price: '€9.99',
    tagline: 'For serious athletes',
    accent: 'from-primary to-primary/80',
    border: 'border-primary',
    features: [
      'Unlimited lactate tests',
      'Plan workouts in the calendar',
      'Start trainings from the app',
      'Connect to your smart trainer',
      'Advanced analytics & charts',
      'PDF export of test reports',
      'Priority support',
    ],
    badge: 'Most popular',
  },
  {
    id: 'coach',
    name: 'Coach',
    price: '€19.99',
    tagline: 'For coaches & teams',
    accent: 'from-purple-600 to-purple-500',
    border: 'border-purple-500',
    features: [
      'Unlimited athletes',
      'Plan workouts for your athletes',
      'Unlimited PDF report generation',
      'PDF branding — logo, title & address',
      'Coach dashboard & overview',
      'Everything in Pro',
    ],
  },
];

export default function WelcomePaywallModal({ open, onClose, userName }) {
  const navigate = useNavigate();
  const [loadingPlan, setLoadingPlan] = useState(null);
  const [error, setError] = useState(null);

  if (!open) return null;
  // Apple guideline 3.1.1 — iOS native build never references paid plans
  // outside of IAP. The Capacitor build calls onClose immediately so the
  // user lands on the dashboard with no paywall.
  if (isCapacitorNative()) return null;

  const startTrial = async (planId) => {
    setError(null);
    setLoadingPlan(planId);
    try {
      const { url } = await createCheckoutSession(planId);
      if (url) {
        window.location.href = url;
        return;
      }
      navigate('/settings?tab=subscription');
    } catch (err) {
      console.error('WelcomePaywall checkout error:', err);
      const debug = err?.response?.data?.debug;
      const msg = debug?.hint || debug?.message ||
                  err?.response?.data?.message || err?.response?.data?.error ||
                  err?.message || 'Could not start checkout';
      setError(msg);
    } finally {
      setLoadingPlan(null);
    }
  };

  const continueFree = () => {
    onClose?.();
  };

  return (
    <div
      className="fixed inset-0 z-[12000] flex items-center justify-center p-4 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) continueFree(); }}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-4 overflow-hidden">
        <button
          onClick={continueFree}
          className="absolute top-4 right-4 z-10 p-1.5 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
          aria-label="Close"
        >
          <XMarkIcon className="w-4 h-4 text-gray-600" />
        </button>

        {/* Header */}
        <div className="px-6 sm:px-8 pt-8 pb-4 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 mb-3">
            <SparklesIcon className="w-6 h-6 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">
            Welcome to LaChart{userName ? `, ${userName}` : ''}!
          </h2>
          <p className="mt-2 text-sm text-gray-600 max-w-lg mx-auto">
            Pick a plan to get started. Try Pro or Coach <strong>free for 2 months</strong> — no charge today, cancel anytime.
          </p>
        </div>

        {/* Plan cards */}
        <div className="px-6 sm:px-8 pb-2 grid sm:grid-cols-2 gap-4">
          {PLANS.map((plan) => {
            const isLoading = loadingPlan === plan.id;
            return (
              <div
                key={plan.id}
                className={`relative rounded-2xl border-2 ${plan.border} p-5 flex flex-col bg-white`}
              >
                {plan.badge && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 text-[11px] font-semibold bg-primary text-white rounded-full whitespace-nowrap">
                    {plan.badge}
                  </span>
                )}

                <div className="mb-3">
                  <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
                  <p className="text-xs text-gray-500">{plan.tagline}</p>
                </div>

                <div className="mb-4">
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-gray-900">Free</span>
                    <span className="text-xs text-gray-500">for 2 months</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">then {plan.price} / month</p>
                </div>

                <ul className="space-y-1.5 mb-5 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-gray-700">
                      <CheckIcon className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => startTrial(plan.id)}
                  disabled={loadingPlan !== null}
                  className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-sm disabled:opacity-60 disabled:cursor-wait text-white bg-gradient-to-br ${plan.accent} hover:opacity-90`}
                >
                  {isLoading ? 'Redirecting…' : `Try ${plan.name} free for 2 months`}
                </button>
              </div>
            );
          })}
        </div>

        {error && (
          <p className="mx-6 sm:mx-8 my-3 text-xs text-red-600 text-center">
            {error}
          </p>
        )}

        {/* Continue free */}
        <div className="px-6 sm:px-8 py-5 text-center border-t border-gray-100 mt-2">
          <button
            onClick={continueFree}
            className="text-sm text-gray-600 hover:text-gray-900 underline-offset-2 hover:underline"
          >
            Continue with the Free plan
          </button>
          <p className="text-[11px] text-gray-400 mt-1">
            You can upgrade anytime from Settings → Subscription.
          </p>
        </div>
      </div>
    </div>
  );
}
