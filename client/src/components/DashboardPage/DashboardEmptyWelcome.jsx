import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  UserCircleIcon,
  LinkIcon,
  CalendarDaysIcon,
  BeakerIcon,
  Cog6ToothIcon,
  CheckCircleIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';

/**
 * Friendly onboarding strip for athletes with no trainings / calendar data yet.
 */
export default function DashboardEmptyWelcome({ user, stravaConnected, onConnectStrava, hasTests }) {
  const navigate = useNavigate();

  const firstName = useMemo(() => {
    const raw = (user?.name || user?.firstName || '').trim();
    if (!raw) return '';
    return raw.split(/\s+/)[0];
  }, [user?.name, user?.firstName]);

  const profileBasicsDone = Boolean(
    user?.dateOfBirth && user?.height && user?.weight && user?.sport
  );
  const stravaDone = Boolean(stravaConnected || user?.strava?.athleteId);

  const steps = [
    {
      key: 'profile',
      title: 'Complete your profile',
      body: 'Date of birth, height, weight, and sport help charts and zones match you.',
      done: profileBasicsDone,
      cta: 'Open profile',
      onClick: () => navigate('/profile'),
      Icon: UserCircleIcon
    },
    {
      key: 'strava',
      title: 'Connect Strava or Garmin',
      body: 'Sync activities automatically. Garmin is under Settings → Integrations.',
      done: stravaDone,
      cta: stravaDone ? 'Connected' : 'Connect Strava',
      onClick: stravaDone ? undefined : onConnectStrava,
      Icon: LinkIcon,
      secondary: {
        label: 'Settings & Garmin',
        onClick: () => navigate('/settings')
      }
    },
    {
      key: 'calendar',
      title: 'Add your first activity',
      body: 'Upload a FIT file or let Strava fill your Training Calendar.',
      done: false,
      cta: 'Open Training Calendar',
      onClick: () => navigate('/training-calendar'),
      Icon: CalendarDaysIcon
    },
    {
      key: 'testing',
      title: 'Log a lactate test (optional)',
      body: 'After a test in Testing, curves and comparisons appear on the dashboard.',
      done: Boolean(hasTests),
      cta: hasTests ? 'View tests' : 'Go to Testing',
      onClick: () => navigate('/testing'),
      Icon: BeakerIcon
    }
  ];

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="mb-8 overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-white via-custom-gray to-primary/5 shadow-lg"
    >
      <div className="px-5 py-6 sm:px-8 sm:py-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-white shadow-md">
              <SparklesIcon className="h-7 w-7" aria-hidden />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-text sm:text-2xl">
                {firstName ? `Welcome, ${firstName}!` : 'Welcome to LaChart'}
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-lighterText sm:text-base">
                Your dashboard is ready. Follow these steps to load trainings, charts, and stats — usually only takes a few minutes.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="inline-flex items-center justify-center gap-2 self-start rounded-xl border border-primary/20 bg-white px-4 py-2.5 text-sm font-medium text-text shadow-sm transition-colors hover:bg-primary/5"
          >
            <Cog6ToothIcon className="h-5 w-5 text-lighterText" aria-hidden />
            Settings
          </button>
        </div>

        <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4">
          {steps.map((step, index) => {
            const Icon = step.Icon;
            const isDone = step.done;
            return (
              <li
                key={step.key}
                className={`relative flex flex-col rounded-xl border p-4 transition-colors sm:p-5 ${
                  isDone
                    ? 'border-greenos/25 bg-greenos/10'
                    : 'border-primary/15 bg-white/90 hover:border-primary/30 hover:bg-white'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Icon className={`h-5 w-5 shrink-0 ${isDone ? 'text-greenos' : 'text-primary'}`} aria-hidden />
                      <h3 className="font-semibold text-text">{step.title}</h3>
                      {isDone && (
                        <span className="inline-flex items-center gap-0.5 text-xs font-medium text-greenos">
                          <CheckCircleIcon className="h-4 w-4" aria-hidden />
                          Done
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-lighterText">{step.body}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {step.onClick && (
                        <button
                          type="button"
                          disabled={isDone && step.key === 'strava'}
                          onClick={step.onClick}
                          className={`inline-flex items-center justify-center rounded-lg px-3.5 py-2 text-sm font-semibold shadow-sm transition-colors ${
                            isDone && step.key === 'strava'
                              ? 'cursor-default bg-greenos/20 text-text'
                              : 'bg-primary text-white hover:bg-primary-dark'
                          }`}
                        >
                          {step.cta}
                        </button>
                      )}
                      {step.secondary && (
                        <button
                          type="button"
                          onClick={step.secondary.onClick}
                          className="inline-flex items-center justify-center rounded-lg border border-primary/20 bg-white px-3.5 py-2 text-sm font-medium text-text transition-colors hover:bg-primary/5"
                        >
                          {step.secondary.label}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </motion.section>
  );
}
