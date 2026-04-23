/**
 * OnboardingFlow — guided setup for new users
 * Shows after registration or whenever setup is incomplete.
 * Works on desktop (centered modal) and mobile / Capacitor (full-screen).
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthProvider';
import api, { updateUserProfile, getStravaAuthUrl } from '../../services/api';
import { CheckIcon } from '@heroicons/react/24/solid';
import { XMarkIcon } from '@heroicons/react/24/outline';

// ─── helpers ──────────────────────────────────────────────────────────────────

const COACH_LIKE = ['coach', 'tester', 'testing', 'admin'];
const isCoach = (u) =>
  COACH_LIKE.includes(u?.role) || (u?.admin === true && u?.role !== 'athlete');

const DISMISS_KEY = (uid) => `lachart:onboardingSetupDone:${uid}`;
const STRAVA_SKIP_KEY = (uid) => `stravaConnectModalDone_${uid}`;

/** Returns true when the onboarding flow should be shown for this user. */
export function shouldShowOnboarding(user) {
  if (!user?._id) return false;
  // Never show again once dismissed/completed
  if (localStorage.getItem(DISMISS_KEY(user._id)) === 'true') return false;
  // Show if any required step is unfinished
  const profileDone =
    user.onboarding?.basicProfileDone ||
    (user.dateOfBirth && user.height && user.weight && user.sport);
  const unitsDone = user.onboarding?.unitsDone;
  return !profileDone || !unitsDone;
}

// ─── step definitions ─────────────────────────────────────────────────────────

const STEPS_ATHLETE = [
  { id: 'profile',  label: 'Profile',       subtitle: null       },
  { id: 'units',    label: 'Units',          subtitle: null       },
  { id: 'strava',   label: 'Connect Data',   subtitle: 'Optional' },
  { id: 'zones',    label: 'Training Zones', subtitle: null       },
  { id: 'test',     label: 'First Test',     subtitle: null       },
];

const STEPS_COACH = [
  { id: 'profile',  label: 'Profile',       subtitle: null       },
  { id: 'units',    label: 'Units',          subtitle: null       },
  { id: 'strava',   label: 'Connect Data',   subtitle: 'Optional' },
  { id: 'athletes', label: 'Add Athletes',   subtitle: null       },
  { id: 'test',     label: 'First Test',     subtitle: null       },
];

// ─── StepIndicator ────────────────────────────────────────────────────────────

function StepIndicator({ steps, current }) {
  return (
    <div className="flex items-start justify-center w-full px-2 sm:px-4 overflow-x-auto">
      <div className="flex items-start min-w-max">
        {steps.map((step, idx) => {
          const done    = idx < current;
          const active  = idx === current;

          return (
            <React.Fragment key={step.id}>
              {/* Step bubble + label */}
              <div className="flex flex-col items-center" style={{ minWidth: 56 }}>
                {/* Circle */}
                <div className="relative flex items-center justify-center">
                  {/* Glow ring on active */}
                  {active && (
                    <span className="absolute inset-0 rounded-full animate-ping bg-primary/20" />
                  )}
                  <div
                    className={`
                      relative z-10 flex items-center justify-center rounded-full
                      transition-all duration-300
                      ${done
                        ? 'w-8 h-8 bg-primary shadow-md'
                        : active
                          ? 'w-8 h-8 bg-white border-2 border-primary shadow shadow-primary/30'
                          : 'w-8 h-8 bg-white border-2 border-gray-200'
                      }
                    `}
                  >
                    {done ? (
                      <CheckIcon className="w-4 h-4 text-white" />
                    ) : (
                      <span
                        className={`text-xs font-bold ${active ? 'text-primary' : 'text-gray-400'}`}
                      >
                        {idx + 1}
                      </span>
                    )}
                  </div>
                </div>

                {/* Label */}
                <div className="mt-1.5 text-center" style={{ width: 56 }}>
                  <p
                    className={`text-[10px] leading-tight font-semibold truncate
                      ${done ? 'text-gray-500' : active ? 'text-primary' : 'text-gray-400'}
                    `}
                  >
                    {step.label}
                  </p>
                  {step.subtitle && (
                    <p className="text-[9px] text-gray-400 leading-none mt-0.5">{step.subtitle}</p>
                  )}
                </div>
              </div>

              {/* Connector line */}
              {idx < steps.length - 1 && (
                <div className="flex-shrink-0 mt-4" style={{ width: 28 }}>
                  <div
                    className={`h-[2px] w-full rounded-full transition-colors duration-500
                      ${idx < current ? 'bg-primary' : 'bg-gray-200'}
                    `}
                  />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step content components ──────────────────────────────────────────────────

/** Step 1 — Profile */
function ProfileStep({ user, onSave, saving }) {
  const [form, setForm] = useState({
    name:           user?.name       || '',
    surname:        user?.surname    || '',
    dateOfBirth:    fmtDateForInput(user?.dateOfBirth),
    height:         user?.height     ?? '',
    weight:         user?.weight     ?? '',
    sport:          user?.sport      || '',
    gender:         user?.gender     || 'male',
  });
  const [err, setErr] = useState('');

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = (e) => {
    e.preventDefault();
    setErr('');
    if (!form.name.trim()) { setErr('Name is required'); return; }
    onSave({
      name: form.name.trim(),
      surname: form.surname.trim(),
      dateOfBirth: fmtDateForSubmit(form.dateOfBirth),
      height: form.height !== '' ? Number(form.height) : undefined,
      weight: form.weight !== '' ? Number(form.weight) : undefined,
      sport: form.sport,
      gender: form.gender,
      onboarding: { basicProfileDone: true },
    });
  };

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div className="text-center mb-2">
        <div className="text-4xl mb-2">🙋</div>
        <h3 className="text-lg font-bold text-gray-900">Tell us about yourself</h3>
        <p className="text-sm text-gray-500 mt-1">Basic information helps us personalise your experience</p>
      </div>

      {err && <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2">{err}</div>}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">First Name *</label>
          <input
            className={INPUT}
            value={form.name}
            onChange={e => set('name', e.target.value)}
            placeholder="Jan"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Last Name</label>
          <input
            className={INPUT}
            value={form.surname}
            onChange={e => set('surname', e.target.value)}
            placeholder="Novák"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Date of Birth</label>
          <input
            type="date"
            className={INPUT}
            value={form.dateOfBirth}
            onChange={e => set('dateOfBirth', e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Gender</label>
          <select className={INPUT} value={form.gender} onChange={e => set('gender', e.target.value)}>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Height (cm)</label>
          <input
            type="number"
            className={INPUT}
            value={form.height}
            onChange={e => set('height', e.target.value)}
            placeholder="175"
            min={100} max={250}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Weight (kg)</label>
          <input
            type="number"
            className={INPUT}
            value={form.weight}
            onChange={e => set('weight', e.target.value)}
            placeholder="70"
            min={30} max={300}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">Primary Sport</label>
        <select className={INPUT} value={form.sport} onChange={e => set('sport', e.target.value)}>
          <option value="">Select sport…</option>
          <option value="cycling">🚴 Cycling</option>
          <option value="running">🏃 Running</option>
          <option value="swimming">🏊 Swimming</option>
          <option value="triathlon">🏅 Triathlon</option>
          <option value="rowing">🚣 Rowing</option>
          <option value="other">Other</option>
        </select>
      </div>

      <SaveButton saving={saving} label="Save Profile" />
    </form>
  );
}

/** Step 2 — Units */
function UnitsStep({ user, onSave, saving }) {
  const [units, setUnits] = useState({
    distance:    user?.units?.distance    || 'metric',
    weight:      user?.units?.weight      || 'kg',
    temperature: user?.units?.temperature || 'celsius',
  });

  const RadioGroup = ({ name, label, options }) => (
    <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
      <p className="text-xs font-bold text-gray-700 mb-3 uppercase tracking-wide">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        {options.map(opt => (
          <label
            key={opt.value}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border-2 cursor-pointer transition-all
              ${units[name] === opt.value
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}
            `}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={units[name] === opt.value}
              onChange={() => setUnits(p => ({ ...p, [name]: opt.value }))}
              className="sr-only"
            />
            <span className="text-lg">{opt.icon}</span>
            <div>
              <p className="text-xs font-semibold leading-tight">{opt.label}</p>
              <p className="text-[10px] text-gray-400 leading-none">{opt.sub}</p>
            </div>
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="text-center mb-2">
        <div className="text-4xl mb-2">📐</div>
        <h3 className="text-lg font-bold text-gray-900">Units & Preferences</h3>
        <p className="text-sm text-gray-500 mt-1">Choose your preferred measurement system</p>
      </div>

      <RadioGroup
        name="distance"
        label="Distance"
        options={[
          { value: 'metric',   icon: '🌍', label: 'Metric',   sub: 'km, meters' },
          { value: 'imperial', icon: '🇺🇸', label: 'Imperial', sub: 'miles, feet' },
        ]}
      />
      <RadioGroup
        name="weight"
        label="Weight"
        options={[
          { value: 'kg',  icon: '⚖️', label: 'Kilograms', sub: 'kg' },
          { value: 'lbs', icon: '🏋️', label: 'Pounds',    sub: 'lbs' },
        ]}
      />

      <button
        type="button"
        onClick={() => onSave({ units, onboarding: { unitsDone: true } })}
        disabled={saving}
        className={BTN_PRIMARY}
      >
        {saving ? 'Saving…' : 'Save Units →'}
      </button>
    </div>
  );
}

/** Step 3 — Strava */
function StravaStep({ user, onSkip, onConnect }) {
  const [loading, setLoading] = useState(false);
  const alreadyConnected = !!user?.strava?.athleteId;

  const handleConnect = async () => {
    setLoading(true);
    try {
      const url = await getStravaAuthUrl();
      window.location.href = url;
    } catch {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="text-center mb-2">
        <div className="text-4xl mb-2">🔗</div>
        <h3 className="text-lg font-bold text-gray-900">Connect Your Training Data</h3>
        <p className="text-sm text-gray-500 mt-1">Sync your activities automatically</p>
      </div>

      {alreadyConnected ? (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-green-50 border border-green-200">
          <CheckIcon className="w-6 h-6 text-green-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-green-800">Strava already connected ✓</p>
            <p className="text-xs text-green-600">Your activities are syncing automatically</p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-orange-50 border border-orange-100">
              <img src="/images/strava.svg" alt="Strava" className="w-8 h-8 flex-shrink-0 mt-0.5" onError={e => { e.target.style.display='none'; }} />
              <div>
                <p className="text-sm font-bold text-gray-900">Strava</p>
                <p className="text-xs text-gray-600 mt-0.5">Automatically import workouts, laps and heart rate data from your Strava account</p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleConnect}
            disabled={loading}
            className="w-full py-3 px-4 rounded-2xl bg-[#FC4C02] text-white font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#e04402] active:scale-[0.98] transition-all disabled:opacity-60"
          >
            {loading ? 'Redirecting…' : '🚴 Connect with Strava'}
          </button>
        </>
      )}

      <button
        type="button"
        onClick={onSkip}
        className="w-full py-2.5 px-4 rounded-2xl border border-gray-200 text-gray-500 text-sm font-medium hover:bg-gray-50 transition-all"
      >
        {alreadyConnected ? 'Continue →' : 'Skip for now'}
      </button>
    </div>
  );
}

/** Step 4a — Training Zones (athlete) */
function ZonesStep({ onSkip, navigate, onClose }) {
  return (
    <div className="space-y-5">
      <div className="text-center mb-2">
        <div className="text-4xl mb-2">⚡</div>
        <h3 className="text-lg font-bold text-gray-900">Set Your Training Zones</h3>
        <p className="text-sm text-gray-500 mt-1">Zones help you train at the right intensity</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Zone 1', color: 'bg-blue-100 text-blue-700',   desc: 'Active Recovery' },
          { label: 'Zone 2', color: 'bg-green-100 text-green-700', desc: 'Aerobic Base' },
          { label: 'Zone 3', color: 'bg-yellow-100 text-yellow-700',desc: 'Aerobic Threshold' },
          { label: 'Zone 4', color: 'bg-orange-100 text-orange-700',desc: 'Lactate Threshold' },
          { label: 'Zone 5', color: 'bg-red-100 text-red-700',     desc: 'VO2 Max' },
          { label: 'Zone 6', color: 'bg-purple-100 text-purple-700',desc: 'Anaerobic' },
        ].map(z => (
          <div key={z.label} className={`rounded-xl px-3 py-2 ${z.color}`}>
            <p className="text-xs font-bold">{z.label}</p>
            <p className="text-[10px] opacity-80">{z.desc}</p>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-500 text-center">
        Zones are automatically calculated from your lactate test results. You can also set them manually in Settings.
      </p>

      <button
        type="button"
        onClick={() => { onClose(); navigate('/settings?tab=zones'); }}
        className={BTN_PRIMARY}
      >
        Set Zones in Settings
      </button>

      <button type="button" onClick={onSkip} className={BTN_GHOST}>
        Skip — I'll do this later
      </button>
    </div>
  );
}

/** Step 4b — Add Athletes (coach) */
function AthletesStep({ onSkip, navigate, onClose, onDone }) {
  const [form, setForm] = useState({ name: '', surname: '', email: '' });
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState(false);
  const [err, setErr] = useState('');

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setErr('Name is required'); return; }
    setLoading(true); setErr('');
    try {
      await api.post('/user/coach/add-athlete', form);
      window.dispatchEvent(new Event('coachAthletesUpdated'));
      window.dispatchEvent(new Event('athleteListUpdated'));
      setAdded(true);
    } catch (e) {
      setErr(e.response?.data?.error || 'Could not add athlete');
    } finally {
      setLoading(false);
    }
  };

  if (added) {
    return (
      <div className="space-y-5 text-center">
        <div className="text-5xl">🎉</div>
        <h3 className="text-lg font-bold text-gray-900">Athlete added!</h3>
        <p className="text-sm text-gray-500">You can add more athletes from the Athletes page.</p>
        <button type="button" onClick={onDone} className={BTN_PRIMARY}>Continue →</button>
        <button
          type="button"
          onClick={() => { onClose(); navigate('/athletes'); }}
          className={BTN_GHOST}
        >
          Add more athletes
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleAdd} className="space-y-4">
      <div className="text-center mb-2">
        <div className="text-4xl mb-2">👥</div>
        <h3 className="text-lg font-bold text-gray-900">Add Your First Athlete</h3>
        <p className="text-sm text-gray-500 mt-1">Invite athletes to your coaching team</p>
      </div>

      {err && <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2">{err}</div>}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">First Name *</label>
          <input className={INPUT} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Jan" required />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Last Name</label>
          <input className={INPUT} value={form.surname} onChange={e => setForm(p => ({ ...p, surname: e.target.value }))} placeholder="Novák" />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">Email (for invitation)</label>
        <input
          type="email"
          className={INPUT}
          value={form.email}
          onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
          placeholder="athlete@email.com"
        />
        <p className="text-[10px] text-gray-400 mt-1">They'll receive an email invite to join your team</p>
      </div>

      <SaveButton saving={loading} label="Add Athlete" />

      <button type="button" onClick={onSkip} className={BTN_GHOST}>Skip — I'll add athletes later</button>
    </form>
  );
}

/** Step 5 — First Test */
function FirstTestStep({ user, navigate, onClose, onSkip }) {
  const isCoachUser = isCoach(user);
  return (
    <div className="space-y-5">
      <div className="text-center mb-2">
        <div className="text-4xl mb-2">🧪</div>
        <h3 className="text-lg font-bold text-gray-900">Create Your First Test</h3>
        <p className="text-sm text-gray-500 mt-1">
          {isCoachUser
            ? 'Run a lactate test for your athlete to get accurate training zones'
            : 'A lactate test gives you precise, personalised training zones'}
        </p>
      </div>

      {/* Visual preview */}
      <div className="bg-gradient-to-br from-primary/5 to-primary/10 rounded-2xl p-4 border border-primary/10">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center text-lg">📊</div>
          <div>
            <p className="text-sm font-bold text-gray-900">Lactate Threshold Test</p>
            <p className="text-xs text-gray-500">Step-by-step guided protocol</p>
          </div>
        </div>
        <div className="flex gap-4 text-xs text-gray-600">
          <span>⚡ Power zones</span>
          <span>❤️ HR zones</span>
          <span>📈 LT1 / LT2</span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => { onClose(); navigate('/testing'); }}
        className={BTN_PRIMARY}
      >
        Start First Test 🚀
      </button>

      <button type="button" onClick={onSkip} className={BTN_GHOST}>
        I'll do this later
      </button>
    </div>
  );
}

// ─── Shared UI helpers ────────────────────────────────────────────────────────

const INPUT = 'w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all placeholder-gray-400';
const BTN_PRIMARY = 'w-full py-3 px-4 rounded-2xl bg-primary text-white font-semibold text-sm hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-50';
const BTN_GHOST = 'w-full py-2.5 px-4 rounded-2xl border border-gray-200 text-gray-500 text-sm font-medium hover:bg-gray-50 transition-all';

function SaveButton({ saving, label }) {
  return (
    <button type="submit" disabled={saving} className={BTN_PRIMARY}>
      {saving ? <span className="flex items-center justify-center gap-2"><Spinner />{' '}Saving…</span> : `${label} →`}
    </button>
  );
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

function fmtDateForInput(d) {
  if (!d) return '';
  try {
    const date = new Date(d);
    if (isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
  } catch { return ''; }
}

function fmtDateForSubmit(s) {
  if (!s) return undefined;
  try {
    const d = new Date(s + 'T00:00:00.000Z');
    return isNaN(d.getTime()) ? undefined : d.toISOString();
  } catch { return undefined; }
}

// ─── Main OnboardingFlow ──────────────────────────────────────────────────────

export default function OnboardingFlow({ onDismiss }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [visible, setVisible] = useState(false);

  const coach = isCoach(user);
  const STEPS = coach ? STEPS_COACH : STEPS_ATHLETE;
  const totalSteps = STEPS.length;

  // Fade-in on mount
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 30);
    return () => clearTimeout(t);
  }, []);

  // Advance to next step automatically if already done
  useEffect(() => {
    if (!user) return;
    const stravaConnected = !!user.strava?.athleteId;
    const stravaSkipped   = localStorage.getItem(STRAVA_SKIP_KEY(user._id)) === 'true';

    if (STEPS[step]?.id === 'profile' && (user.onboarding?.basicProfileDone || (user.dateOfBirth && user.weight && user.sport))) {
      setStep(s => Math.min(s + 1, totalSteps - 1));
    } else if (STEPS[step]?.id === 'units' && user.onboarding?.unitsDone) {
      setStep(s => Math.min(s + 1, totalSteps - 1));
    } else if (STEPS[step]?.id === 'strava' && (stravaConnected || stravaSkipped)) {
      setStep(s => Math.min(s + 1, totalSteps - 1));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, user]);

  const dismiss = useCallback((completed = false) => {
    if (user?._id) {
      localStorage.setItem(DISMISS_KEY(user._id), 'true');
    }
    setVisible(false);
    setTimeout(() => onDismiss?.(completed), 200);
  }, [user, onDismiss]);

  const saveProfile = async (data) => {
    setSaving(true);
    try {
      const resp = await updateUserProfile(data);
      // Notify AuthProvider / other consumers that user data has changed
      if (resp?.data) {
        window.dispatchEvent(new CustomEvent('userUpdated', { detail: resp.data }));
      }
      setStep(s => Math.min(s + 1, totalSteps - 1));
    } catch (e) {
      console.error('Profile save error:', e);
    } finally {
      setSaving(false);
    }
  };

  const skipStrava = () => {
    if (user?._id) localStorage.setItem(STRAVA_SKIP_KEY(user._id), 'true');
    setStep(s => Math.min(s + 1, totalSteps - 1));
  };

  const next = () => setStep(s => Math.min(s + 1, totalSteps - 1));

  const currentStepId = STEPS[step]?.id;
  const renderStep = () => {
    switch (currentStepId) {
      case 'profile':
        return <ProfileStep user={user} onSave={saveProfile} saving={saving} />;

      case 'units':
        return <UnitsStep user={user} onSave={saveProfile} saving={saving} />;

      case 'strava':
        return <StravaStep user={user} onSkip={skipStrava} />;

      case 'zones':
        return <ZonesStep onSkip={next} navigate={navigate} onClose={() => dismiss(true)} />;

      case 'athletes':
        return (
          <AthletesStep
            onSkip={next}
            navigate={navigate}
            onClose={() => dismiss(true)}
            onDone={next}
          />
        );

      case 'test':
        return (
          <FirstTestStep
            user={user}
            navigate={navigate}
            onClose={() => dismiss(true)}
            onSkip={() => dismiss(true)}
          />
        );

      default:
        return null;
    }
  };

  if (!user) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[9998] bg-black/50 backdrop-blur-sm transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={(e) => e.stopPropagation()}
      />

      {/* Modal */}
      <div
        className={`
          fixed z-[9999] inset-0 sm:inset-auto
          sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2
          sm:w-full sm:max-w-[520px]
          flex flex-col bg-white
          sm:rounded-3xl sm:shadow-2xl sm:shadow-black/20
          transition-all duration-200
          ${visible ? 'opacity-100 sm:scale-100 translate-y-0' : 'opacity-0 sm:scale-95 translate-y-4'}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
          <div>
            <p className="text-xs font-bold text-primary uppercase tracking-widest">Setup</p>
            <h2 className="text-base font-bold text-gray-900 leading-tight">Welcome to LaChart 👋</h2>
          </div>
          <button
            onClick={() => dismiss(false)}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition-all flex-shrink-0"
            title="Skip setup"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="px-4 pb-4 flex-shrink-0">
          <StepIndicator steps={STEPS} current={step} />
        </div>

        <div className="h-px bg-gray-100 flex-shrink-0" />

        {/* Step content — scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-5 min-h-0">
          {renderStep()}
        </div>

        {/* Footer progress */}
        <div className="flex-shrink-0 px-5 pb-safe-bottom pb-5 pt-3 border-t border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-400">Step {step + 1} of {totalSteps}</span>
            <button
              onClick={() => dismiss(false)}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Skip setup
            </button>
          </div>
          {/* Progress bar */}
          <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${((step + 1) / totalSteps) * 100}%` }}
            />
          </div>
        </div>
      </div>
    </>
  );
}
