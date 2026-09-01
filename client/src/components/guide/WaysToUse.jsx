/**
 * The three jobs LaChart is actually hired for.
 *
 * The rest of this page is written from an athlete's chair — "get your
 * training in", "understand a session", "take it with you" — which is the wrong
 * first page for most of the people who arrive. In the live data, 25 accounts
 * have run tests on three or more different people and only five of them have
 * connected a device: they are not tracking their own training, they are
 * testing clients and handing back a result. Nothing on the way in told them
 * the app was built for that, so they had to work it out.
 *
 * Naming the three uses is not marketing copy. It is the difference between a
 * lab coach deciding this is a training diary that happens to do lactate, and
 * seeing the job they came for on the first screen.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BeakerIcon, UserGroupIcon, ChartBarIcon, ArrowRightIcon,
} from '@heroicons/react/24/outline';

const WAYS = [
  {
    id: 'testing',
    icon: BeakerIcon,
    accent: '#7c3aed',
    title: 'You test people',
    who: 'Lab · physio · performance centre',
    body: 'Enter a step test, get the curve and LT1/LT2 by every method, and hand the '
      + 'athlete a branded PDF. Each person you test keeps their own record, so their next '
      + 'test sits beside the last one. No device to connect, no training data needed — '
      + 'the test is the whole job.',
    points: [
      'Unlimited athletes, one entry per test',
      'Log-log, IAT, OBLA, D-max and LTP side by side',
      'PDF and email report with your own branding',
      'Test-to-test comparison as they come back',
    ],
    cta: 'Enter a test',
    href: '/testing',
  },
  {
    id: 'coaching',
    icon: UserGroupIcon,
    accent: '#0ea5e9',
    title: 'You coach people',
    who: 'Coach with athletes on a plan',
    body: 'Invite your athletes, build their zones from a real test rather than a formula, '
      + 'then plan their weeks and see what they actually did against what you asked for. '
      + 'Their Strava or Garmin flows in on its own.',
    points: [
      'Invite an athlete, or add one yourself',
      'Plan workouts straight onto their calendar',
      'Planned versus completed, session by session',
      'Every session read against their own test',
    ],
    cta: 'Add an athlete',
    href: '/athletes',
  },
  {
    id: 'athlete',
    icon: ChartBarIcon,
    accent: '#f97316',
    title: 'You train',
    who: 'Athlete, with or without a coach',
    body: 'Connect Strava or Garmin, set your zones from a lactate test, and see each '
      + 'session read against it — time at your thresholds, where your heart sat, and '
      + 'whether the zones on file still describe you.',
    points: [
      'Strava, Garmin and Apple Health sync',
      'Zones from your measured thresholds',
      'Time at LT1 and LT2, not just five zones',
      'A nudge when it is worth retesting',
    ],
    cta: 'Connect a device',
    href: '/settings',
  },
];

export default function WaysToUse({ className = '' }) {
  const navigate = useNavigate();

  return (
    <section className={className}>
      <h2 className="text-[17px] font-bold text-gray-900">Three ways people use LaChart</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-gray-500">
        They barely overlap. Pick the one that sounds like your week — the rest of this page
        makes more sense once you have.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
        {WAYS.map((w) => {
          const Icon = w.icon;
          return (
            <div key={w.id} className="flex flex-col rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: `${w.accent}15` }}>
                  <Icon className="h-5 w-5" style={{ color: w.accent }} />
                </span>
                <div className="min-w-0">
                  <div className="text-[15px] font-bold text-gray-900">{w.title}</div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    {w.who}
                  </div>
                </div>
              </div>

              <p className="mt-2.5 text-[13px] leading-relaxed text-gray-600">{w.body}</p>

              <ul className="mt-2.5 space-y-1">
                {w.points.map((p) => (
                  <li key={p} className="flex gap-2 text-[12px] leading-relaxed text-gray-600">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full" style={{ background: w.accent }} />
                    {p}
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => navigate(w.href)}
                className="mt-3 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold text-white"
                style={{ background: w.accent }}
              >
                {w.cta}
                <ArrowRightIcon className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
