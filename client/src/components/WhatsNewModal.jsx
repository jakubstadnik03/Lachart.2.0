import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { XMarkIcon, SparklesIcon, ArrowRightIcon, ArrowLeftIcon } from '@heroicons/react/24/outline';

/**
 * WhatsNewModal
 *
 * Step-through announcement that pops up on the Dashboard for users who
 * signed up BEFORE a given feature release. Each feature gets its own
 * "slide" with a large hero, body copy, deep-link CTA, and prev/next
 * navigation — same shape as the onboarding intro slides so the look is
 * familiar.
 *
 * Visibility gated by `localStorage.whatsNew_v<RELEASE_TAG>_seen_<userId>`
 * — each user sees a given announcement at most once. Bump RELEASE_TAG
 * when shipping the next round of features and the modal re-shows
 * everywhere.
 */

const RELEASE_TAG = '2026-05';

const ITEMS = [
  {
    emoji: '📅',
    title: 'Plan workouts in the calendar',
    body: 'Build structured sessions — warm-up, intervals with target zones, recoveries, cooldown — and drop them onto any day. See planned vs actual side-by-side.',
    cta: 'Open the planner',
    href: '/workout-planner',
    accent: '#7c3aed', // violet
  },
  {
    emoji: '▶️',
    title: 'Start trainings from the app',
    body: 'Open a planned workout and run it live with step-by-step prompts, target zones and lap timers right in the browser.',
    cta: "See today's plan",
    href: '/training-calendar',
    accent: '#0ea5e9', // sky
  },
  {
    emoji: '📡',
    title: 'Connect your smart trainer',
    body: 'Pair an indoor smart trainer over Bluetooth and execute structured workouts with automatic resistance control. No third-party app needed.',
    cta: 'How it works',
    href: '/how-to-use',
    accent: '#10b981', // emerald
  },
  {
    emoji: '🩸',
    title: 'Add lactate values to any interval',
    body: 'Tag any interval of an existing workout with a blood lactate sample. Each sample feeds straight back into your curve and zones.',
    cta: 'Try it',
    href: '/training-calendar',
    accent: '#ef4444', // red
  },
  {
    emoji: '🎨',
    title: 'Brand your PDF reports',
    body: 'Coach plan: upload your logo, set your studio name + address + colour, and every test PDF goes out as your branded handout.',
    cta: 'Set up branding',
    href: '/settings?tab=branding',
    accent: '#f59e0b', // amber
  },
];

export default function WhatsNewModal({ open, onClose, userName }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const total = ITEMS.length;

  // Reset to the first slide whenever the modal is (re-)opened — otherwise
  // a user who closed it midway through last time would re-open on slide 4
  // with no context.
  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  // Keyboard navigation — ← → for prev/next, Esc to close. Wired only
  // while the modal is open so we don't trap arrow keys elsewhere.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
      else if (e.key === 'ArrowRight') setStep((s) => Math.min(total - 1, s + 1));
      else if (e.key === 'ArrowLeft')  setStep((s) => Math.max(0, s - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, total]);

  if (!open) return null;

  const current = ITEMS[step];
  const isFirst = step === 0;
  const isLast  = step === total - 1;

  const goNext = () => {
    if (isLast) onClose?.();
    else setStep((s) => Math.min(total - 1, s + 1));
  };
  const goPrev = () => setStep((s) => Math.max(0, s - 1));

  const handleCtaClick = () => {
    const href = current.href;
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

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg my-4 overflow-hidden">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-1.5 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
          aria-label="Close"
        >
          <XMarkIcon className="w-4 h-4 text-gray-600" />
        </button>

        {/* Header — small, persistent across slides so the user always
            knows they're in 'What's new', not random product copy. */}
        <div
          className="px-6 sm:px-8 pt-8 pb-4 text-center transition-colors duration-300"
          style={{
            background: `linear-gradient(to bottom right, ${current.accent}15, ${current.accent}05)`,
          }}
        >
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-white shadow-sm mb-2">
            <SparklesIcon className="w-5 h-5" style={{ color: current.accent }} />
          </div>
          <p
            className="text-[11px] font-semibold uppercase tracking-wide mb-1"
            style={{ color: current.accent }}
          >
            What's new{userName ? ` · ${userName}` : ''}
          </p>
          <p className="text-xs text-gray-500">
            {step + 1} of {total}
          </p>
        </div>

        {/* Slide body — keyed on `step` so React mounts a fresh node every
            time and the CSS transition replays. */}
        <div key={step} className="px-6 sm:px-10 py-8 text-center animate-[fadeInUp_.35s_ease]">
          <div
            className="inline-flex items-center justify-center w-20 h-20 rounded-3xl mb-4 text-5xl"
            style={{ backgroundColor: `${current.accent}12` }}
            aria-hidden
          >
            {current.emoji}
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
            {current.title}
          </h2>
          <p className="text-sm text-gray-600 max-w-md mx-auto leading-relaxed">
            {current.body}
          </p>

          <button
            onClick={handleCtaClick}
            className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white shadow-sm hover:opacity-90 transition-opacity"
            style={{ backgroundColor: current.accent }}
          >
            {current.cta}
            <ArrowRightIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Footer — dot indicators + prev/next. Last slide swaps Next for
            'Got it' so the modal has a clear terminus. */}
        <div className="px-5 sm:px-8 py-4 border-t border-gray-100 flex items-center gap-3">
          {/* Prev */}
          <button
            onClick={goPrev}
            disabled={isFirst}
            className="w-9 h-9 rounded-full flex items-center justify-center bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-0 disabled:pointer-events-none"
            aria-label="Previous"
          >
            <ArrowLeftIcon className="w-4 h-4 text-gray-500" />
          </button>

          {/* Dot indicators */}
          <div className="flex-1 flex items-center justify-center gap-1.5">
            {ITEMS.map((it, i) => {
              const active = i === step;
              return (
                <button
                  key={it.title}
                  onClick={() => setStep(i)}
                  aria-label={`Go to step ${i + 1}`}
                  className="rounded-full transition-all duration-300"
                  style={{
                    width: active ? 22 : 6,
                    height: 6,
                    backgroundColor: active ? current.accent : '#E5E7EB',
                  }}
                />
              );
            })}
          </div>

          {/* Next / Got it */}
          <button
            onClick={goNext}
            className="px-3.5 h-9 rounded-full text-sm font-semibold text-white flex items-center gap-1.5 transition-opacity hover:opacity-90"
            style={{ backgroundColor: current.accent }}
          >
            {isLast ? 'Got it' : (
              <>
                Next
                <ArrowRightIcon className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Slide-in animation — defined here so we don't need a separate
          CSS file just for one keyframe set. */}
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
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
