import React from 'react';
import { useNavigate } from 'react-router-dom';
import { XMarkIcon, LockClosedIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { isCapacitorNative } from '../utils/isNativeApp';

const PLAN_DETAILS = {
  pro: {
    name: 'Pro',
    price: '$9.99',
    color: 'from-primary to-primary/80',
    features: [
      'Unlimited lactate tests',
      'FIT file analysis — intervals & power charts',
      'Advanced analytics & charts',
      'PDF export of test reports',
      'Population comparison',
      'Priority support',
    ],
  },
  coach: {
    name: 'Coach',
    price: '$19.99',
    color: 'from-purple-600 to-purple-500',
    features: [
      'Unlimited athletes (free: 1)',
      'Unlimited tests per athlete (free: 1)',
      'Coach dashboard & athlete overview',
      'Bulk data export',
      'PDF branding & custom logo',
      'Priority support',
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
  const plan = PLAN_DETAILS[requiredPlan] || PLAN_DETAILS.pro;

  if (!isOpen) return null;
  // App Store guideline 3.1.1: native iOS builds may not reference external
  // payment flows or paid digital subscriptions outside of In-App Purchase.
  // All features are currently free for every user (see premiumAccess.js),
  // so we simply suppress the upgrade UI on iOS and never gate anything.
  if (isCapacitorNative()) return null;

  const handleUpgrade = () => {
    onClose();
    navigate('/settings?tab=subscription');
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
            Unlock this with <span className="font-semibold text-white">LaChart {plan.name}</span> — start with 1 month free, no charge today.
          </p>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {/* Price */}
          <div className="flex items-end gap-1 mb-4">
            <span className="text-3xl font-bold text-gray-900">{plan.price}</span>
            <span className="text-gray-400 text-sm mb-1">/ month after trial</span>
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
            <button
              onClick={handleUpgrade}
              className="w-full py-3 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary/90 transition-colors shadow-sm"
            >
              🎁 Try {plan.name} free for 1 month
            </button>
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
