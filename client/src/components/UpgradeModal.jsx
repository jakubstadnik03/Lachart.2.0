import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { XMarkIcon, LockClosedIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { isCapacitorNative } from '../utils/isNativeApp';
import {
  ATHLETE_PLAN_PRICE_LABEL,
  COACH_PLAN_PRICE_LABEL,
} from '../constants/planPricing';
import { createCheckoutSession } from '../services/api';
import { useAuth } from '../context/AuthProvider';

const PLAN_DETAILS = {
  pro: {
    name: 'Athlete',
    price: ATHLETE_PLAN_PRICE_LABEL,
    color: 'from-primary to-primary/80',
    features: [
      'Unlimited lactate tests',
      'Plan workouts in the calendar',
      'Start trainings from the app',
      'Connect to your smart trainer',
      'Advanced analytics & charts',
      'PDF export of test reports',
      'Priority support',
    ],
  },
  coach: {
    name: 'Coach',
    price: COACH_PLAN_PRICE_LABEL,
    color: 'from-purple-600 to-purple-500',
    features: [
      'Unlimited athletes',
      'Plan workouts for your athletes',
      'Unlimited PDF report generation',
      'PDF branding — your logo, title & address',
      'Coach dashboard & overview',
      'Everything in Athlete',
    ],
  },
};

/**
 * UpgradeModal
 *
 * Props:
 *   isOpen       — boolean
 *   onClose      — () => void
 *   feature      — string  e.g. "FIT Training Analysis"
 *   requiredPlan — 'pro' | 'coach'  (default 'pro')
 */
export default function UpgradeModal({ isOpen, onClose, feature = 'This feature', requiredPlan = 'pro' }) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const plan = PLAN_DETAILS[requiredPlan] || PLAN_DETAILS.pro;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  /**
   * Direct Stripe Checkout handoff — skips the Settings page entirely so the
   * user goes from "I want this feature" straight to the payment screen in
   * one click. Matches how every onboarding-style paywall works today.
   *
   * - Logged-out users → /signup?plan=... so the signup flow can resume the
   *   checkout once the account is created.
   * - Logged-in users  → backend creates a Stripe Checkout Session and we
   *   redirect the browser to Stripe's hosted page.
   * - Errors are shown inline; the user can still click "Maybe later" or use
   *   the fallback link to the Settings page.
   */
  const handleUpgrade = async () => {
    if (!isAuthenticated) {
      onClose();
      navigate(`/signup?plan=${encodeURIComponent(requiredPlan)}`);
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const { url } = await createCheckoutSession(requiredPlan);
      if (url) {
        window.location.href = url;
        return;
      }
      // Fallback if Stripe didn't return a URL — shouldn't happen, but
      // we still navigate so the user has somewhere to recover.
      onClose();
      navigate('/settings?tab=subscription');
    } catch (err) {
      console.error('UpgradeModal checkout error:', err);
      const debug = err?.response?.data?.debug;
      const msg = debug?.hint || debug?.message || err?.response?.data?.message ||
                  err?.response?.data?.error || err?.message || 'Checkout failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Card */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

        {/* Header gradient */}
        <div className={`bg-gradient-to-br ${plan.color} px-6 pt-8 pb-6 text-white`}>
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
          >
            <XMarkIcon className="w-4 h-4 text-white" />
          </button>

          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <LockClosedIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-white/70 text-xs font-medium uppercase tracking-wide">Premium feature</p>
              <h2 className="text-lg font-bold leading-tight">{feature}</h2>
            </div>
          </div>

          <p className="text-white/80 text-sm">
            Unlock this with <span className="font-semibold text-white">LaChart {plan.name}</span> — start with 2 months free, no charge today.
          </p>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {/* Price */}
          <div className="flex items-end gap-1 mb-4">
            <span className="text-3xl font-bold text-gray-900">{plan.price}</span>
            <span className="text-gray-400 text-sm mb-1">/ month after 2-month free trial</span>
          </div>

          {/* Features */}
          <ul className="space-y-2 mb-6">
            {plan.features.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                <SparklesIcon className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <span>{f}</span>
              </li>
            ))}
          </ul>

          {/* CTA — on native iOS we don't offer in-app checkout (App Store
              3.1.1). Instead the user is informed that this is a paid
              feature available on the web. */}
          {isCapacitorNative() ? (
            <div className="w-full py-3 rounded-xl bg-gray-100 text-gray-700 text-center text-sm">
              This is a {plan.name} feature. Manage subscriptions at lachart.net in a web browser.
            </div>
          ) : (
            <>
              <button
                onClick={handleUpgrade}
                disabled={loading}
                className="w-full py-3 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-60 disabled:cursor-wait"
              >
                {loading ? 'Redirecting to checkout…' : `🎁 Try ${plan.name} free for 2 months`}
              </button>
              {error && (
                <p className="mt-2 text-xs text-red-600 text-center">
                  {error}{' '}
                  <button
                    onClick={() => { onClose(); navigate('/settings?tab=subscription'); }}
                    className="underline hover:text-red-700"
                  >
                    Go to subscription settings
                  </button>
                </p>
              )}
            </>
          )}

          <button
            onClick={onClose}
            className="w-full mt-2 py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            {isCapacitorNative() ? 'Close' : 'Maybe later'}
          </button>
        </div>
      </div>
    </div>
  );
}
