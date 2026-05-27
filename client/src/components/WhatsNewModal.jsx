import React from 'react';
import { useNavigate } from 'react-router-dom';
import { XMarkIcon, SparklesIcon } from '@heroicons/react/24/outline';

/**
 * WhatsNewModal
 *
 * One-shot announcement that pops up on the Dashboard for users who signed
 * up BEFORE a given feature release. Lists what's new, with a CTA per item
 * that deep-links into the feature so people don't have to hunt for it.
 *
 * Visibility is gated by `localStorage.whatsNew_v<RELEASE_TAG>_seen_<userId>`
 * so each user sees a given announcement at most once. Bumping RELEASE_TAG
 * (below) when we ship the next round of features automatically re-shows
 * the modal to everyone with the new contents.
 */

const RELEASE_TAG = '2026-05';

const ITEMS = [
  {
    emoji: '📅',
    title: 'Plan workouts in the calendar',
    body: 'Build structured sessions — warm-up, intervals with target zones, recoveries, cooldown — and drop them onto any day. See planned vs actual side-by-side.',
    cta: 'Open the planner',
    href: '/workout-planner',
  },
  {
    emoji: '▶️',
    title: 'Start trainings from the app',
    body: 'Open a planned workout and run it live with step-by-step prompts, target zones and lap timers right in the browser.',
    cta: 'See today\'s plan',
    href: '/training-calendar',
  },
  {
    emoji: '📡',
    title: 'Connect your smart trainer',
    body: 'Pair an indoor smart trainer over Bluetooth and execute structured workouts with automatic resistance control. No third-party app needed.',
    cta: 'How it works',
    href: '/how-to-use',
  },
  {
    emoji: '🩸',
    title: 'Add lactate values to any interval',
    body: 'Tag any interval of an existing workout with a blood lactate sample. Each sample feeds straight back into your curve and zones.',
    cta: 'Try it',
    href: '/training-calendar',
  },
  {
    emoji: '🎨',
    title: 'Brand your PDF reports',
    body: 'Coach plan: upload your logo, set your studio name + address + colour, and every test PDF goes out as your branded handout.',
    cta: 'Set up branding',
    href: '/settings?tab=branding',
  },
];

export default function WhatsNewModal({ open, onClose, userName }) {
  const navigate = useNavigate();
  if (!open) return null;

  const handleItemClick = (href) => {
    onClose?.();
    if (href.startsWith('http')) {
      window.location.href = href;
    } else {
      navigate(href);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[11500] flex items-center justify-center p-4 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-4 overflow-hidden">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-1.5 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
          aria-label="Close"
        >
          <XMarkIcon className="w-4 h-4 text-gray-600" />
        </button>

        {/* Header */}
        <div className="px-6 sm:px-8 pt-8 pb-4 text-center bg-gradient-to-br from-primary/5 to-purple-50">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-white shadow-sm mb-3">
            <SparklesIcon className="w-6 h-6 text-primary" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-1">What's new</p>
          <h2 className="text-2xl font-bold text-gray-900">
            5 new things in LaChart{userName ? `, ${userName}` : ''}
          </h2>
          <p className="mt-2 text-sm text-gray-600 max-w-lg mx-auto">
            You can now plan workouts, start them live, pair your smart trainer, log lactate to any interval, and brand your PDF reports.
          </p>
        </div>

        {/* Feature list */}
        <div className="px-6 sm:px-8 py-5 space-y-3">
          {ITEMS.map((item) => (
            <button
              key={item.title}
              onClick={() => handleItemClick(item.href)}
              className="w-full flex items-start gap-3 p-3 rounded-xl border border-gray-100 hover:border-primary/40 hover:bg-primary/5 transition-colors text-left group"
            >
              <span className="text-2xl shrink-0" aria-hidden>{item.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-900 text-sm">
                  {item.title}
                </div>
                <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">
                  {item.body}
                </p>
                <span className="inline-block mt-1 text-xs font-semibold text-primary group-hover:underline">
                  {item.cta} →
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 sm:px-8 py-4 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-gray-500">
            Spotted something missing? Reply to any LaChart email — I read every one.
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors shrink-0"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * localStorage key for a user's seen flag. Exported so DashboardPage can read
 * and write it without duplicating the convention.
 */
export function whatsNewSeenKey(userId) {
  return `whatsNew_v${RELEASE_TAG}_seen_${userId}`;
}

export { RELEASE_TAG };
