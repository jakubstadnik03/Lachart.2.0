import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  XMarkIcon,
  SparklesIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
  CalendarDaysIcon,
  PlayCircleIcon,
  BeakerIcon,
  PaintBrushIcon,
  BoltIcon,
  ArrowTrendingUpIcon,
  ChartBarSquareIcon,
  HeartIcon,
  CloudArrowDownIcon,
} from '@heroicons/react/24/outline';
import { getIntegrationStatus } from '../services/api';

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

// Slide content — each item carries a React component for its hero icon
// (we render it via createElement with an `accent` colour) instead of an
// emoji glyph. Emojis used to render inconsistently across OS / browser
// (colourful on macOS, flat / outline on Windows / Linux, missing on
// some Linux distros entirely) which made the modal look amateurish on
// non-Apple devices. Heroicons stays crisp and matches the accent palette.
// `stravaOnly: true` slides are only shown to users whose Strava is NOT yet
// connected — they're a soft prompt to wire it up. Filtered in-component
// once we know the integration status. Items without the flag always show.
const ITEMS = [
  {
    icon: CloudArrowDownIcon,
    title: 'Connect Strava in one click',
    body: "Auto-import every ride, run and swim — with power, HR, pace and laps — straight into LaChart. Your training history fills itself in.",
    cta: 'Connect Strava',
    href: '/settings?tab=integrations',
    accent: '#fc4c02', // strava orange
    stravaOnly: true,
  },
  {
    icon: CalendarDaysIcon,
    title: 'Plan workouts in the calendar',
    body: 'Build structured sessions — warm-up, intervals with target zones, recoveries, cooldown — and drop them onto any day. See planned vs actual side-by-side.',
    cta: 'Open the planner',
    href: '/workout-planner',
    accent: '#7c3aed', // violet
  },
  {
    icon: PlayCircleIcon,
    title: 'Start trainings from the app',
    body: 'Open a planned workout and run it live with step-by-step prompts, target zones and lap timers right in the browser.',
    cta: "See today's plan",
    href: '/training-calendar',
    accent: '#0ea5e9', // sky
  },
  {
    icon: BeakerIcon,
    title: 'Add lactate values to any interval',
    body: 'Tag any interval of an existing workout with a blood lactate sample. Each sample feeds straight back into your curve and zones.',
    cta: 'Try it',
    href: '/training-calendar',
    accent: '#ef4444', // red
  },
  {
    icon: PaintBrushIcon,
    title: 'Brand your PDF reports',
    body: 'Coach plan: upload your logo, set your studio name + address + colour, and every test PDF goes out as your branded handout.',
    cta: 'Set up branding',
    href: '/settings?tab=branding',
    accent: '#f59e0b', // amber
  },
  {
    icon: BoltIcon,
    title: 'Auto-categorize your activities',
    body: 'Connect Strava or upload a FIT file and LaChart sorts each session — endurance, threshold, VO2max, recovery — using interval structure, zones and workout titles.',
    cta: 'Open Strava sync',
    href: '/settings?tab=integrations',
    accent: '#6366f1', // indigo
  },
  {
    icon: HeartIcon,
    title: 'Track form, fitness & fatigue',
    body: 'CTL, ATL and TSB charted over weeks so you can see when you peak, when you overreach, and when to back off — built from every workout you log.',
    cta: 'See my form',
    href: '/training-calendar',
    accent: '#ec4899', // pink
  },
  {
    icon: ChartBarSquareIcon,
    title: 'Compare sessions side-by-side',
    body: 'Stack any two workouts on the same chart — pace, power, HR, lactate — and watch how the same session looks fresh vs fatigued, base vs race-fit.',
    cta: 'Open compare',
    href: '/training',
    accent: '#06b6d4', // cyan
  },
  {
    icon: ArrowTrendingUpIcon,
    title: 'Watch your lactate curve evolve',
    body: 'Every new test re-builds your curve with LT1, LT2, IAT and OBLA thresholds — and overlays previous tests so progress is impossible to miss.',
    cta: 'View my tests',
    href: '/lactate-statistics',
    accent: '#10b981', // emerald
  },
];

export default function WhatsNewModal({ open, onClose, userName }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  // `null` while we haven't checked yet → assume connected (i.e. hide the
  // Strava-only prompt slide) so it doesn't flash-in then disappear. Flip
  // to `false` only after the status call confirms the user has NOT linked
  // Strava — then the conditional slides appear.
  const [stravaConnected, setStravaConnected] = useState(null);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const status = await getIntegrationStatus({ timeout: 6000 });
        if (!cancelled) setStravaConnected(Boolean(status?.stravaConnected));
      } catch {
        // Treat any failure as "connected" so we don't nag people whose
        // status call just timed out / was rate-limited.
        if (!cancelled) setStravaConnected(true);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  // Hide `stravaOnly` slides once we know the user has Strava linked. Until
  // the status resolves we also hide them — see comment on the state above.
  const visibleItems = ITEMS.filter((it) => !it.stravaOnly || stravaConnected === false);
  const total = visibleItems.length;

  // Reset to the first slide whenever the modal is (re-)opened — otherwise
  // a user who closed it midway through last time would re-open on slide 4
  // with no context. Also reset if the filtered slide count changes under
  // us (e.g. status resolves and adds a slide) to avoid an out-of-range step.
  useEffect(() => {
    if (open) setStep(0);
  }, [open]);
  useEffect(() => {
    if (step >= total) setStep(0);
  }, [total, step]);

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
  if (total === 0) return null;

  const current = visibleItems[step];
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
      // Anchor near the top of the viewport (≈64 px from top) so the modal
      // sits beneath any global app header / topbar without obscuring the
      // dashboard content underneath. Falls back to center on very small
      // screens via the items-center sm: variant. Backdrop click still
      // dismisses.
      className="fixed inset-0 z-[11500] flex items-start sm:items-start justify-center pt-[64px] sm:pt-[80px] px-4 pb-4 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
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
            className="inline-flex items-center justify-center w-20 h-20 rounded-3xl mb-4"
            style={{ backgroundColor: `${current.accent}12` }}
            aria-hidden
          >
            {/* Stroke colour = slide accent so the icon visually matches the
                rest of the slide chrome (header gradient, CTA, dot, etc.). */}
            <current.icon className="w-10 h-10" style={{ color: current.accent }} strokeWidth={1.6} />
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
            {visibleItems.map((it, i) => {
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
