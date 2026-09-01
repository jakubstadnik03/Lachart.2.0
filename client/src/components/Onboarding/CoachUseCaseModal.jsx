/**
 * "Which kind of coach are you?", asked once, right after signup.
 *
 * Two very different products share this account type. In the live data, 25
 * accounts have run tests on three or more different people and only five ever
 * connected a device — they test clients and hand back a PDF, and the training
 * calendar is not what they came for. A smaller group coaches a roster: 252
 * planned workouts across 18 athletes.
 *
 * Until now both were shown the same thing on the way in — connect Strava,
 * then an empty dashboard — which is the wrong first screen for the larger
 * group and the reason a lab coach could conclude this is a training diary
 * that happens to do lactate.
 *
 * The answer only picks the first screen and can be wrong without cost:
 * everything remains reachable from the menu either way.
 */

import React from 'react';
import { BeakerIcon, UserGroupIcon } from '@heroicons/react/24/outline';

const CHOICES = [
  {
    id: 'testing',
    icon: BeakerIcon,
    accent: '#7c3aed',
    title: 'I test people',
    body: 'Step tests for clients — curve, thresholds and a PDF to hand back.',
    aside: 'No device to connect. The test is the job.',
  },
  {
    id: 'coaching',
    icon: UserGroupIcon,
    accent: '#0ea5e9',
    title: 'I coach athletes',
    body: 'Plan their weeks and follow what they actually did.',
    aside: 'Their Strava or Garmin syncs in on its own.',
  },
];

export default function CoachUseCaseModal({ isOpen, onChoose, onSkip }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
        <h2 className="text-[19px] font-bold text-gray-900">What will you use LaChart for?</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-gray-500">
          It only decides where we drop you first — everything stays in the menu either way.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {CHOICES.map((c) => {
            const Icon = c.icon;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onChoose(c.id)}
                className="flex flex-col rounded-xl border-2 border-gray-200 bg-white p-4 text-left transition-colors hover:border-gray-300"
                style={{ borderColor: undefined }}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg"
                  style={{ background: `${c.accent}15` }}>
                  <Icon className="h-5 w-5" style={{ color: c.accent }} />
                </span>
                <span className="mt-2 text-[15px] font-bold text-gray-900">{c.title}</span>
                <span className="mt-1 text-[13px] leading-relaxed text-gray-600">{c.body}</span>
                <span className="mt-1.5 text-[11px] font-semibold" style={{ color: c.accent }}>
                  {c.aside}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onSkip}
          className="mt-4 w-full text-[12px] font-semibold text-gray-400 hover:text-gray-600"
        >
          I'll decide later
        </button>
      </div>
    </div>
  );
}
