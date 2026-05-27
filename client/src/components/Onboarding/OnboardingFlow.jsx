/**
 * OnboardingFlow — guided setup for new users
 * Shows after registration or whenever setup is incomplete.
 * Works on desktop (centered modal) and mobile / Capacitor (full-screen).
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthProvider';
import api, { updateUserProfile, getStravaAuthUrl } from '../../services/api';
import { CheckIcon } from '@heroicons/react/24/solid';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { Globe, Flag, Scale, Dumbbell, Timer, Zap, Microscope, Droplets, Heart, Users, FlaskConical, BarChart2, TrendingUp, Link2, CheckCircle, SlidersHorizontal, User as UserIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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
    role:           user?.role       || 'athlete',
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
      role: form.role,
      onboarding: { basicProfileDone: true },
    });
  };

  return (
    <form onSubmit={handleSave} className="flex-1 flex flex-col min-h-0">
      {/* Scrollable body */}
      <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-4 pb-4">
        <div className="text-center mb-2">
          <div className="flex justify-center mb-2"><UserIcon className="w-10 h-10 text-primary" /></div>
          <h3 className="text-lg font-bold text-gray-900">Tell us about yourself</h3>
          <p className="text-sm text-gray-500 mt-1">Basic information helps us personalise your experience</p>
        </div>

        {err && <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2">{err}</div>}

        {/* Role selector — switch between athlete and coach */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">I am a</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { role: 'athlete', label: 'Athlete', icon: <UserIcon className="w-5 h-5 flex-shrink-0" /> },
              { role: 'coach',   label: 'Coach',   icon: <Users    className="w-5 h-5 flex-shrink-0" /> },
            ].map(({ role: r, label, icon }) => (
              <button
                type="button"
                key={r}
                onClick={() => set('role', r)}
                className={`h-12 flex items-center justify-center gap-2 rounded-xl border-2 text-sm font-semibold transition-all ${
                  form.role === r
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                }`}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <label className="block text-xs font-semibold text-gray-600 mb-1">First Name *</label>
            <input
              className={INPUT}
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="Jan"
              required
            />
          </div>
          <div className="min-w-0">
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
          <div className="min-w-0">
            <label className="block text-xs font-semibold text-gray-600 mb-1">Date of Birth</label>
            <input
              type="date"
              className={`${INPUT} block`}
              value={form.dateOfBirth}
              onChange={e => set('dateOfBirth', e.target.value)}
            />
          </div>
          <div className="min-w-0">
            <label className="block text-xs font-semibold text-gray-600 mb-1">Gender</label>
            <select className={INPUT} value={form.gender} onChange={e => set('gender', e.target.value)}>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0">
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
          <div className="min-w-0">
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
            <option value="cycling">Cycling</option>
            <option value="running">Running</option>
            <option value="swimming">Swimming</option>
            <option value="triathlon">Triathlon</option>
            <option value="rowing">Rowing</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>

      {/* Sticky bottom action */}
      <div className="flex-shrink-0 pt-3 border-t border-gray-100 bg-white"
           style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom, 8px))' }}>
        <SaveButton saving={saving} label="Save Profile" />
      </div>
    </form>
  );
}

/**
 * Step 2 — Preferences (units + training preferences combined).
 *
 * Was split into two sub-pages (Units → Training Prefs) with its own
 * inline Back button. That created two problems:
 *   - The bottom Back button was inconsistent with every other step in
 *     the modal, which only use the header back arrow for navigation.
 *   - Sub-page Back navigated within the step, but the header arrow
 *     navigated to the previous step — two different "back" semantics
 *     in the same screen confused users.
 *
 * Now everything lives in one scrollable view with a single
 * "Save & Continue →" CTA. The modal's header back arrow handles step
 * navigation; nothing inside the step does.
 */
function UnitsStep({ user, onSave, saving }) {
  const [units, setUnits] = useState({
    distance:    user?.units?.distance    || 'metric',
    weight:      user?.units?.weight      || 'kg',
    temperature: user?.units?.temperature || 'celsius',
  });
  const [trainingPrefs, setTrainingPrefs] = useState({
    rpeScale:    user?.trainingPreferences?.rpeScale    || 'rpe',
    paceDisplay: user?.trainingPreferences?.paceDisplay || 'minpkm',
    zonesMethod: user?.trainingPreferences?.zonesMethod || 'lactate',
  });

  const RadioGroup = ({ stateKey, label, options, isTraining }) => (
    <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
      <p className="text-xs font-bold text-gray-700 mb-3 uppercase tracking-wide">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        {options.map(opt => {
          const val = isTraining ? trainingPrefs[stateKey] : units[stateKey];
          const isSelected = val === opt.value;
          return (
            <label
              key={opt.value}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border-2 cursor-pointer transition-all
                ${isSelected
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}
              `}
            >
              <input type="radio" name={stateKey} value={opt.value} checked={isSelected}
                onChange={() => isTraining ? setTrainingPrefs(p => ({ ...p, [stateKey]: opt.value })) : setUnits(p => ({ ...p, [stateKey]: opt.value }))}
                className="sr-only"
              />
              {React.isValidElement(opt.icon) ? <span className="flex-shrink-0">{opt.icon}</span> : <span className="text-lg flex-shrink-0">{opt.icon}</span>}
              <div>
                <p className="text-xs font-semibold leading-tight">{opt.label}</p>
                <p className="text-[10px] text-gray-400 leading-none">{opt.sub}</p>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pb-2">
        <div className="text-center">
          <div className="flex justify-center mb-2"><SlidersHorizontal className="w-10 h-10 text-primary" /></div>
          <h3 className="text-lg font-bold text-gray-900">Preferences</h3>
          <p className="text-sm text-gray-500 mt-1">Units and how you like to measure your training</p>
        </div>

        {/* Units */}
        <RadioGroup stateKey="distance" label="Distance" options={[
          { value: 'metric',   icon: <Globe className="w-5 h-5" />,  label: 'Metric',   sub: 'km, meters' },
          { value: 'imperial', icon: <Flag className="w-5 h-5" />,   label: 'Imperial', sub: 'miles, feet' },
        ]} />
        <RadioGroup stateKey="weight" label="Weight" options={[
          { value: 'kg',  icon: <Scale className="w-5 h-5" />,    label: 'Kilograms', sub: 'kg' },
          { value: 'lbs', icon: <Dumbbell className="w-5 h-5" />, label: 'Pounds',    sub: 'lbs' },
        ]} />

        {/* Training preferences */}
        <RadioGroup stateKey="paceDisplay" label="Running Pace" isTraining options={[
          { value: 'minpkm', icon: <Timer className="w-5 h-5" />, label: 'min/km', sub: 'e.g. 4:30 /km' },
          { value: 'kmh',    icon: <Zap className="w-5 h-5" />,   label: 'km/h',   sub: 'e.g. 13.3 km/h' },
        ]} />
        <RadioGroup stateKey="rpeScale" label="Perceived Exertion" isTraining options={[
          { value: 'rpe',  icon: <Dumbbell className="w-5 h-5" />,   label: 'RPE 1–10',  sub: 'Simple scale' },
          { value: 'borg', icon: <Microscope className="w-5 h-5" />, label: 'Borg 6–20', sub: 'Scientific' },
        ]} />
        <RadioGroup stateKey="zonesMethod" label="Zones Based On" isTraining options={[
          { value: 'lactate', icon: <Droplets className="w-5 h-5" />, label: 'Lactate LT1/LT2', sub: 'Recommended' },
          { value: 'hrmax',   icon: <Heart className="w-5 h-5" />,    label: 'Max HR %',         sub: 'Classic' },
          { value: 'ftp',     icon: <Zap className="w-5 h-5" />,      label: 'FTP / Power',      sub: 'Cycling' },
        ]} />
      </div>

      {/* Sticky action — single primary CTA matches the rest of the flow. */}
      <div className="flex-shrink-0 pt-3 border-t border-gray-100 bg-white"
           style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom, 8px))' }}>
        <button
          type="button"
          onClick={() => onSave({
            units,
            trainingPreferences: trainingPrefs,
            onboarding: { unitsDone: true },
          })}
          disabled={saving}
          className={BTN_PRIMARY}
        >
          {saving ? 'Saving…' : 'Save & Continue →'}
        </button>
      </div>
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

  // Apple HealthKit integration removed — see initCapacitorShell.js comment.

  return (
    <div className="space-y-5">
      <div className="text-center mb-2">
        <div className="flex justify-center mb-2"><Link2 className="w-10 h-10 text-primary" /></div>
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
            {loading ? 'Redirecting…' : 'Connect with Strava'}
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

/** Step 4a — Training Zones (athlete) — enter LT1/LT2, generate zones, edit & confirm */
function ZonesStep({ onSkip, onSave, saving }) {
  const [sport, setSport] = useState('cycling');
  const [lt1, setLt1] = useState('');
  const [lt2, setLt2] = useState('');
  const [lt1hr, setLt1hr] = useState('');
  const [lt2hr, setLt2hr] = useState('');
  const [maxhr, setMaxhr] = useState('');
  const [editableZones, setEditableZones] = useState(null); // { power: {...}, hr: {...} } — editable after generation
  const [err, setErr] = useState('');

  const sportLabel = sport === 'cycling' ? 'W' : sport === 'running' ? 'sec/km' : 'm/min';

  const handleGenerate = () => {
    const l1 = Number(lt1); const l2 = Number(lt2);
    if (!l1 || !l2 || l1 >= l2) { setErr('Enter valid LT1 and LT2 (LT1 must be less than LT2)'); return; }
    setErr('');
    const pz = {
      lt1: l1, lt2: l2,
      zone1: { min: 0,                                           max: Math.round(l1 * 0.75),              description: 'Active Recovery' },
      zone2: { min: Math.round(l1 * 0.75),                      max: l1,                                  description: 'Aerobic Base'    },
      zone3: { min: l1,                                          max: Math.round(l1 + (l2 - l1) * 0.5),   description: 'Tempo'           },
      zone4: { min: Math.round(l1 + (l2 - l1) * 0.5),           max: l2,                                  description: 'Threshold'       },
      zone5: { min: l2,                                          max: Math.round(l2 * 1.20),               description: 'VO2 Max'         },
    };
    let hz = null;
    const h1 = Number(lt1hr); const h2 = Number(lt2hr); const hmax = Number(maxhr);
    if (h1 && h2 && h1 < h2) {
      hz = {
        maxHeartRate: hmax || Math.round(h2 * 1.05),
        zone1: { min: 0,                                                  max: h1,                                       description: 'Active Recovery' },
        zone2: { min: h1,                                                 max: Math.round(h1 + (h2 - h1) * 0.4),         description: 'Aerobic Base'    },
        zone3: { min: Math.round(h1 + (h2 - h1) * 0.4),                  max: Math.round(h1 + (h2 - h1) * 0.8),         description: 'Tempo'           },
        zone4: { min: Math.round(h1 + (h2 - h1) * 0.8),                  max: h2,                                        description: 'Threshold'       },
        zone5: { min: h2,                                                 max: hmax || Math.round(h2 * 1.05),             description: 'VO2 Max'         },
      };
    }
    setEditableZones({ power: pz, hr: hz });
  };

  const updateZone = (type, zoneKey, field, value) => {
    setEditableZones(prev => ({
      ...prev,
      [type]: { ...prev[type], [zoneKey]: { ...prev[type][zoneKey], [field]: value === '' ? '' : Number(value) } },
    }));
  };

  const handleSave = () => {
    if (!editableZones) return;
    onSave({
      powerZones: { [sport]: editableZones.power },
      ...(editableZones.hr ? { heartRateZones: { [sport]: editableZones.hr } } : {}),
      onboarding: { trainingZonesDone: true },
    });
  };

  const ZONE_COLORS = [
    { row: 'bg-blue-50   border-blue-100',   text: 'text-blue-700',   input: 'border-blue-200   bg-blue-50/60'   },
    { row: 'bg-green-50  border-green-100',  text: 'text-green-700',  input: 'border-green-200  bg-green-50/60'  },
    { row: 'bg-yellow-50 border-yellow-100', text: 'text-yellow-700', input: 'border-yellow-200 bg-yellow-50/60' },
    { row: 'bg-orange-50 border-orange-100', text: 'text-orange-700', input: 'border-orange-200 bg-orange-50/60' },
    { row: 'bg-red-50    border-red-100',    text: 'text-red-700',    input: 'border-red-200    bg-red-50/60'    },
  ];

  const ZoneEditor = ({ zonesObj, type, unit }) => (
    <div className="space-y-1.5">
      {Object.entries(zonesObj).filter(([k]) => k.startsWith('zone')).map(([key, z], i) => {
        const c = ZONE_COLORS[i];
        return (
          <div key={key} className={`rounded-xl px-3 py-2.5 border ${c.row}`}>
            <div className="flex items-center justify-between mb-1.5">
              <span className={`text-xs font-bold ${c.text}`}>{key.replace('zone', 'Zone ')}</span>
              <span className="text-[10px] text-gray-400">{z.description}</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={z.min}
                onChange={e => updateZone(type, key, 'min', e.target.value)}
                className={`flex-1 text-center text-xs font-semibold rounded-lg border px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary ${c.input} ${c.text}`}
              />
              <span className={`text-xs font-bold ${c.text}`}>–</span>
              <input
                type="number"
                value={z.max}
                onChange={e => updateZone(type, key, 'max', e.target.value)}
                className={`flex-1 text-center text-xs font-semibold rounded-lg border px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary ${c.input} ${c.text}`}
              />
              <span className={`text-[10px] font-medium w-8 flex-shrink-0 ${c.text}`}>{unit}</span>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Scrollable body */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pb-2">
        <div className="text-center">
          <div className="flex justify-center mb-2"><Zap className="w-10 h-10 text-primary" /></div>
          <h3 className="text-lg font-bold text-gray-900">Generate Training Zones</h3>
          <p className="text-sm text-gray-500 mt-1">Enter your LT1 & LT2 thresholds to auto-calculate zones</p>
        </div>

        {/* Sport selector — switching sport only changes the unit label; generated
            zones stay visible so the user doesn't lose their work. */}
        <div className="flex rounded-xl border border-gray-200 overflow-hidden text-sm font-medium">
          {['cycling', 'running', 'swimming'].map(s => (
            <button key={s} type="button" onClick={() => setSport(s)}
              className={`flex-1 py-2 capitalize transition-all ${sport === s ? 'bg-primary text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
              {s}
            </button>
          ))}
        </div>

        {/* LT inputs — hidden once zones are generated */}
        {!editableZones && (
          <div className="bg-gray-50 rounded-2xl p-4 space-y-3 border border-gray-100">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Power / Pace Thresholds ({sportLabel})</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">LT1 (Aerobic)</label>
                <input type="number" value={lt1} onChange={e => setLt1(e.target.value)} placeholder={sport === 'cycling' ? '180' : '240'} className={INPUT} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">LT2 (Anaerobic)</label>
                <input type="number" value={lt2} onChange={e => setLt2(e.target.value)} placeholder={sport === 'cycling' ? '250' : '290'} className={INPUT} />
              </div>
            </div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide pt-1">Heart Rate (bpm) — optional</p>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">LT1 HR</label>
                <input type="number" value={lt1hr} onChange={e => setLt1hr(e.target.value)} placeholder="145" className={INPUT} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">LT2 HR</label>
                <input type="number" value={lt2hr} onChange={e => setLt2hr(e.target.value)} placeholder="168" className={INPUT} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Max HR</label>
                <input type="number" value={maxhr} onChange={e => setMaxhr(e.target.value)} placeholder="185" className={INPUT} />
              </div>
            </div>
          </div>
        )}

        {err && <p className="text-xs text-red-600 text-center">{err}</p>}

        {/* Editable zone tables — shown after generation */}
        {editableZones && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Power Zones ({sportLabel})</p>
              <button type="button" onClick={() => setEditableZones(null)}
                className="text-[11px] text-primary font-semibold hover:underline">
                ← Recalculate
              </button>
            </div>
            <ZoneEditor zonesObj={editableZones.power} type="power" unit={sportLabel} />

            {editableZones.hr && (
              <>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Heart Rate Zones (bpm)</p>
                <ZoneEditor zonesObj={editableZones.hr} type="hr" unit="bpm" />
              </>
            )}
          </div>
        )}
      </div>

      {/* Sticky bottom actions */}
      <div className="flex-shrink-0 pt-3 border-t border-gray-100 space-y-2"
           style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom, 8px))' }}>
        {!editableZones ? (
          <button type="button" onClick={handleGenerate} className={BTN_PRIMARY}>Generate Zones</button>
        ) : (
          <button type="button" onClick={handleSave} disabled={saving} className={BTN_PRIMARY}>
            {saving ? <span className="flex items-center justify-center gap-2"><Spinner /> Saving…</span> : 'Confirm & Save Zones'}
          </button>
        )}
        <button type="button" onClick={onSkip} className={BTN_GHOST}>Skip — I'll set zones later</button>
      </div>
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
        <div className="flex justify-center"><CheckCircle className="w-14 h-14 text-green-500" /></div>
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
        <div className="flex justify-center mb-2"><Users className="w-10 h-10 text-primary" /></div>
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
        <div className="flex justify-center mb-2"><FlaskConical className="w-10 h-10 text-primary" /></div>
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
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center"><BarChart2 className="w-5 h-5 text-primary" /></div>
          <div>
            <p className="text-sm font-bold text-gray-900">Lactate Threshold Test</p>
            <p className="text-xs text-gray-500">Step-by-step guided protocol</p>
          </div>
        </div>
        <div className="flex gap-4 text-xs text-gray-600">
          <span className="flex items-center gap-1"><Zap className="w-3.5 h-3.5" /> Power zones</span>
          <span className="flex items-center gap-1"><Heart className="w-3.5 h-3.5" /> HR zones</span>
          <span className="flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5" /> LT1 / LT2</span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => { onClose(); navigate('/testing'); }}
        className={BTN_PRIMARY}
      >
        Start First Test
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

// ─── Intro Slides ─────────────────────────────────────────────────────────────

// Visual components — light theme
function LactateCurveVisual() {
  const points = [
    { x: 5, y: 85, w: 120 }, { x: 20, y: 78, w: 150 },
    { x: 35, y: 68, w: 180 }, { x: 50, y: 52, w: 210 },
    { x: 65, y: 32, w: 240 }, { x: 80, y: 18, w: 270 },
  ];
  const svgPoints = points.map(p => `${p.x * 4},${p.y * 1.4}`).join(' ');
  return (
    <div className="w-full rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 pt-4 pb-2">
        <div className="flex justify-between items-center mb-3">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Lactate Curve</span>
          <div className="flex gap-3">
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-500" /><span className="text-[10px] text-gray-500">LT1</span></div>
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-500" /><span className="text-[10px] text-gray-500">LT2</span></div>
          </div>
        </div>
        <svg viewBox="0 0 340 120" className="w-full h-28">
          <defs>
            <linearGradient id="curveGradL" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#767EB5" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#767EB5" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polyline points={`5,119 ${svgPoints} 330,119`} fill="url(#curveGradL)" stroke="none" />
          <polyline points={svgPoints} fill="none" stroke="#767EB5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="120" y1="0" x2="120" y2="119" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="4,3" />
          <circle cx="120" cy="86" r="4" fill="#3b82f6" />
          <line x1="220" y1="0" x2="220" y2="119" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4,3" />
          <circle cx="220" cy="47" r="4" fill="#ef4444" />
          {[150,200,250,300,350].map((w,i) => (
            <text key={i} x={40 + i*60} y="118" fontSize="8" fill="#9ca3af" textAnchor="middle">{w}W</text>
          ))}
        </svg>
      </div>
      <div className="grid grid-cols-2 border-t border-gray-100">
        <div className="px-4 py-3 border-r border-gray-100">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider">LT1 Power</p>
          <p className="text-lg font-bold text-blue-500 mt-0.5">193 W</p>
          <p className="text-[10px] text-gray-400">2.1 mmol/L</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider">LT2 Power</p>
          <p className="text-lg font-bold text-red-500 mt-0.5">267 W</p>
          <p className="text-[10px] text-gray-400">4.0 mmol/L</p>
        </div>
      </div>
    </div>
  );
}

function ZonesVisual() {
  const zones = [
    { z: 'Z1', label: 'Active Recovery', sub: '< 55%', pct: 28, color: '#3b82f6', bg: '#eff6ff' },
    { z: 'Z2', label: 'Endurance',       sub: '55–75%', pct: 52, color: '#10b981', bg: '#f0fdf4' },
    { z: 'Z3', label: 'Tempo',           sub: '75–90%', pct: 68, color: '#f59e0b', bg: '#fffbeb' },
    { z: 'Z4', label: 'Threshold',       sub: '90–105%', pct: 82, color: '#f97316', bg: '#fff7ed' },
    { z: 'Z5', label: 'VO2 Max',         sub: '> 105%', pct: 95, color: '#ef4444', bg: '#fef2f2' },
  ];
  return (
    <div className="w-full space-y-2">
      {zones.map(({ z, label, sub, pct, color, bg }) => (
        <div key={z} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ backgroundColor: bg }}>
          <span className="text-[11px] font-bold w-5 flex-shrink-0" style={{ color }}>{z}</span>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-xs font-semibold text-gray-800 truncate">{label}</span>
              <span className="text-[10px] text-gray-400 ml-2 flex-shrink-0">{sub}</span>
            </div>
            <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function StepTestVisual() {
  const steps = [
    { w: 120, la: 1.2, hr: 118 }, { w: 150, la: 1.5, hr: 132 },
    { w: 180, la: 1.8, hr: 145 }, { w: 210, la: 2.4, hr: 158 },
    { w: 240, la: 3.6, hr: 169 }, { w: 270, la: 6.1, hr: 178 },
  ];
  return (
    <div className="w-full rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center bg-gray-50">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Step Test</span>
        <span className="text-[10px] text-gray-400">6 steps</span>
      </div>
      <div className="divide-y divide-gray-50">
        <div className="grid grid-cols-4 px-4 py-2 bg-gray-50/50">
          {['Step','Watts','Lactate','HR'].map(h => (
            <span key={h} className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">{h}</span>
          ))}
        </div>
        {steps.map((s, i) => (
          <div key={i} className={`grid grid-cols-4 px-4 py-2.5 ${i === 3 ? 'bg-blue-50' : ''}`}>
            <span className="text-xs text-gray-400">{i + 1}</span>
            <span className="text-xs font-semibold text-gray-800">{s.w} W</span>
            <span className={`text-xs font-bold ${s.la > 4 ? 'text-red-500' : s.la > 2 ? 'text-amber-500' : 'text-emerald-500'}`}>{s.la}</span>
            <span className="text-xs text-gray-500">{s.hr} bpm</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportsVisual() {
  return (
    <div className="w-full rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/60">
        <div>
          <p className="text-xs font-bold text-gray-800">Lactate Test Report</p>
          <p className="text-[10px] text-gray-400 mt-0.5">April 30, 2026 · Cycling</p>
        </div>
        <div className="w-8 h-10 rounded-md bg-gray-100 flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
          </svg>
        </div>
      </div>
      <div className="px-5 py-4 space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'LT1', value: '193 W', sub: '2.1 mmol/L', color: 'text-blue-500' },
            { label: 'LT2', value: '267 W', sub: '4.0 mmol/L', color: 'text-red-500' },
            { label: 'Max HR', value: '182', sub: 'bpm', color: 'text-gray-800' },
          ].map(({ label, value, sub, color }) => (
            <div key={label} className="bg-gray-50 rounded-xl px-2 py-2.5 text-center border border-gray-100">
              <p className="text-[9px] text-gray-400 uppercase tracking-wider">{label}</p>
              <p className={`text-sm font-bold mt-0.5 ${color}`}>{value}</p>
              <p className="text-[9px] text-gray-400">{sub}</p>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-[#767EB5]/8 border border-[#767EB5]/20 px-3 py-2.5">
          <svg viewBox="0 0 24 24" className="w-4 h-4 text-[#767EB5] flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
          </svg>
          <p className="text-xs text-gray-600">Send PDF report to athlete</p>
          <div className="ml-auto text-[10px] font-bold text-[#767EB5]">Send</div>
        </div>
      </div>
    </div>
  );
}

function CoachVisual() {
  const athletes = [
    { name: 'Martin K.', sport: 'Cycling', lt2: '287 W', trend: '+12W', up: true },
    { name: 'Jana P.', sport: 'Running', lt2: '4:02/km', trend: '-8s', up: true },
    { name: 'Tomáš B.', sport: 'Triathlon', lt2: '241 W', trend: '-5W', up: false },
  ];
  return (
    <div className="w-full space-y-2">
      <div className="flex items-center justify-between px-1 mb-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Your Athletes</p>
        <p className="text-[10px] text-gray-400">3 active</p>
      </div>
      {athletes.map(({ name, sport, lt2, trend, up }) => (
        <div key={name} className="flex items-center gap-3 rounded-2xl bg-white border border-gray-100 shadow-sm px-4 py-3">
          <div className="w-9 h-9 rounded-full bg-[#767EB5]/10 flex items-center justify-center text-sm font-bold text-[#767EB5] flex-shrink-0">
            {name[0]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-800 truncate">{name}</p>
            <p className="text-[10px] text-gray-400">{sport}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-xs font-bold text-gray-800">{lt2}</p>
            <p className={`text-[10px] font-semibold ${up ? 'text-emerald-500' : 'text-red-500'}`}>{trend}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Slide definitions (light theme) ─────────────────────────────────────────

const INTRO_SLIDES = [
  { label: 'Welcome',        accentColor: '#767EB5', title: 'The Science of\nEndurance Performance', subtitle: 'Professional lactate threshold testing for coaches and athletes — with the precision of a sports lab, in your pocket.', visual: <LactateCurveVisual /> },
  { label: 'Step Testing',   accentColor: '#3b82f6', title: 'Run a Step Test\nin Minutes',            subtitle: 'Enter power, lactate and heart rate at each step. LaChart fits the curve and detects LT1 & LT2 automatically.',        visual: <StepTestVisual />    },
  { label: 'Training Zones', accentColor: '#10b981', title: 'Zones From\nReal Lactate Data',          subtitle: 'Forget generic HR formulas. Your 5 training zones are derived directly from LT1 and LT2 — specific to you.',         visual: <ZonesVisual />       },
  { label: 'PDF Reports',    accentColor: '#8b5cf6', title: 'Professional\nPDF Reports',              subtitle: 'Generate a complete report with lactate curve, thresholds and zones — send it directly to your athlete.',             visual: <ReportsVisual />     },
  { label: 'Coach',          accentColor: '#ec4899', title: 'Manage Your\nEntire Squad',              subtitle: 'Track every athlete\'s progress, compare tests over time, and monitor fitness from a single coach dashboard.',          visual: <CoachVisual />       },
];

export const INTRO_SEEN_KEY = (uid) => `lachart:introSlidesSeen:${uid}`;

// ─── slide animation variants ─────────────────────────────────────────────────

const SLIDE_VARIANTS = {
  enter:  (dir) => ({ x: dir >= 0 ? 48 : -48, opacity: 0 }),
  center: { x: 0, opacity: 1, transition: { duration: 0.26, ease: [0.4, 0, 0.2, 1] } },
  exit:   (dir) => ({ x: dir >= 0 ? -48 : 48, opacity: 0, transition: { duration: 0.18, ease: [0.4, 0, 0.2, 1] } }),
};

const SETUP_STEPS = [
  { id: 'profile',     label: 'Your Profile'    },
  { id: 'preferences', label: 'Preferences'     },
  { id: 'zones',       label: 'Training Zones'  },
  { id: 'strava',      label: 'Connect Data'    },
];

// Unified full-screen tutorial: intro slides → setup steps
export function IntroSlides({ user, onDone, startAtSetup = false }) {
  const [phase, setPhase]       = useState(startAtSetup ? 'setup' : 'slides');
  const [slide, setSlide]       = useState(0);
  const [direction, setDir]     = useState(1);   // 1 = forward, -1 = backward
  const [setupStep, setSetupStep] = useState(0);
  const [saving, setSaving]     = useState(false);
  const [exiting, setExiting]   = useState(false);

  const total   = INTRO_SLIDES.length;
  const current = INTRO_SLIDES[Math.min(slide, total - 1)];

  const globalStep  = phase === 'slides' ? slide : total + setupStep;
  const globalTotal = total + SETUP_STEPS.length;

  // Unique key so AnimatePresence knows when to swap panels
  const animKey = `${phase}-${phase === 'slides' ? slide : setupStep}`;

  // ── Swipe ──────────────────────────────────────────────────────────────────
  const touchStart = useRef(null);
  const onTouchStart = (e) => { touchStart.current = e.touches[0].clientX; };
  const onTouchEnd   = (e) => {
    if (touchStart.current === null) return;
    const diff = touchStart.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40 && phase === 'slides') {
      if (diff > 0) goNextSlide(); else if (slide > 0) goPrevSlide();
    }
    touchStart.current = null;
  };

  // ── Navigation ─────────────────────────────────────────────────────────────
  const goNextSlide = () => {
    setDir(1);
    if (slide < total - 1) setSlide(s => s + 1);
    else setPhase('setup');
  };
  const goPrevSlide = () => { setDir(-1); setSlide(s => s - 1); };

  const goNextSetup = () => { setDir(1);  setSetupStep(s => s + 1); };
  const goPrevSetup = () => {
    setDir(-1);
    if (setupStep > 0) setSetupStep(s => s - 1);
    else { setDir(-1); setPhase('slides'); }
  };

  const handleFinish = () => {
    if (user?._id) localStorage.setItem(INTRO_SEEN_KEY(user._id), 'true');
    setExiting(true);
    setTimeout(() => onDone(), 300);
  };

  const saveAndNext = async (data) => {
    setSaving(true);
    try {
      const resp = await updateUserProfile(data);
      if (resp?.data) window.dispatchEvent(new CustomEvent('userUpdated', { detail: resp.data }));
      goNextSetup();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  // ── Content ────────────────────────────────────────────────────────────────
  const content = (
    <div
      className={`fixed inset-0 transition-opacity duration-300 sm:bg-black/50 sm:backdrop-blur-sm sm:flex sm:items-center sm:justify-center sm:p-4 ${exiting ? 'opacity-0' : 'opacity-100'}`}
      style={{ zIndex: 99999 }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Modal card — fixed height so every slide is identical size */}
      <div className="bg-white flex flex-col w-full h-full sm:w-[520px] sm:max-w-[94vw] sm:h-[700px] sm:max-h-[96vh] sm:rounded-2xl sm:shadow-2xl sm:border sm:border-gray-100 overflow-hidden">

        {/* ── TOP BAR: progress + close ─────────────────────────────────── */}
        <div
          className="flex-shrink-0 px-5 pb-3"
          style={{ paddingTop: 'max(16px, env(safe-area-inset-top, 16px))' }}
        >
          <div className="flex items-center gap-2">
            <div className="flex-1 flex gap-[3px]">
              {Array.from({ length: globalTotal }).map((_, i) => (
                <div key={i} className="flex-1 h-[3px] rounded-full overflow-hidden bg-gray-100">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: i <= globalStep ? '100%' : '0%',
                      backgroundColor: phase === 'slides' ? current.accentColor : '#767EB5',
                    }}
                  />
                </div>
              ))}
            </div>
            {/* Close / Skip — always visible */}
            <button
              onClick={handleFinish}
              className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition-all flex-shrink-0 ml-1.5"
              title="Skip"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── ANIMATED CONTENT ──────────────────────────────────────────── */}
        {/* overflow-hidden clips the slide-in animation */}
        <div className="flex-1 overflow-hidden min-h-0 relative">
          <AnimatePresence custom={direction} mode="wait">
            <motion.div
              key={animKey}
              custom={direction}
              variants={SLIDE_VARIANTS}
              initial="enter"
              animate="center"
              exit="exit"
              className="absolute inset-0 flex flex-col"
            >

              {/* ── SLIDE PHASE ─────────────────────────────────────────── */}
              {phase === 'slides' && (
                <div className="flex-1 flex flex-col px-6 min-h-0">
                  {/* Badge */}
                  <div className="flex-shrink-0 mt-3 mb-3">
                    <span
                      className="text-[11px] font-bold uppercase tracking-widest px-3 py-1 rounded-full border"
                      style={{
                        color: current.accentColor,
                        borderColor: `${current.accentColor}30`,
                        backgroundColor: `${current.accentColor}0f`,
                      }}
                    >
                      {current.label}
                    </span>
                  </div>

                  {/* Title */}
                  <h2 className="text-[22px] sm:text-[26px] leading-[1.15] font-black text-gray-900 mb-2 flex-shrink-0 whitespace-pre-line">
                    {current.title}
                  </h2>

                  {/* Subtitle */}
                  <p className="text-[13px] text-gray-400 leading-relaxed mb-4 flex-shrink-0 line-clamp-3">
                    {current.subtitle}
                  </p>

                  {/* Visual — fills remaining height */}
                  <div className="flex-1 min-h-0 overflow-hidden">
                    {current.visual}
                  </div>

                  {/* Bottom nav: back ← · dots · → forward */}
                  <div
                    className="flex items-center gap-3 pt-4 flex-shrink-0"
                    style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom, 20px))' }}
                  >
                    {/* Back */}
                    <button
                      onClick={goPrevSlide}
                      disabled={slide === 0}
                      className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 active:scale-95 transition-all disabled:opacity-0 disabled:pointer-events-none"
                    >
                      <svg viewBox="0 0 24 24" className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>

                    {/* Dot indicators */}
                    <div className="flex-1 flex items-center justify-center gap-1.5">
                      {Array.from({ length: total }).map((_, i) => (
                        <button
                          key={i}
                          onClick={() => { setDir(i > slide ? 1 : -1); setSlide(i); }}
                          className="rounded-full transition-all duration-300"
                          style={{
                            width: i === slide ? 20 : 6,
                            height: 6,
                            backgroundColor: i === slide ? current.accentColor : '#e5e7eb',
                          }}
                        />
                      ))}
                    </div>

                    {/* Next / Start Setup */}
                    <button
                      onClick={goNextSlide}
                      className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 active:scale-95 transition-all"
                      style={{ backgroundColor: current.accentColor }}
                    >
                      {slide < total - 1 ? (
                        <svg viewBox="0 0 24 24" className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      ) : (
                        <CheckIcon className="w-4 h-4 text-white" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* ── SETUP PHASE ─────────────────────────────────────────── */}
              {phase === 'setup' && (
                <div className="flex-1 flex flex-col px-6 min-h-0">

                  {/* Step header */}
                  <div className="flex items-center gap-3 mt-3 mb-4 flex-shrink-0">
                    <button
                      onClick={goPrevSetup}
                      className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 active:scale-95 transition-all"
                    >
                      <svg viewBox="0 0 24 24" className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                    <div className="flex-1">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
                        Step {setupStep + 1} of {SETUP_STEPS.length}
                      </p>
                      <p className="text-base font-bold text-gray-900 leading-tight">
                        {SETUP_STEPS[setupStep]?.label}
                      </p>
                    </div>
                  </div>

                  {/* Step body — flex column so each step component can fill + scroll internally */}
                  <div className="flex-1 min-h-0 flex flex-col">
                    {setupStep === 0 && (
                      <ProfileStep user={user} onSave={saveAndNext} saving={saving} />
                    )}
                    {setupStep === 1 && (
                      <UnitsStep user={user} onSave={saveAndNext} saving={saving} />
                    )}
                    {setupStep === 2 && (
                      <ZonesStep
                        onSkip={goNextSetup}
                        onSave={saveAndNext}
                        saving={saving}
                      />
                    )}
                    {setupStep === 3 && (
                      <div className="flex flex-col gap-3 pb-8">
                        <StravaStep user={user} onSkip={handleFinish} />
                      </div>
                    )}
                    {setupStep >= SETUP_STEPS.length && handleFinish()}
                  </div>
                </div>
              )}

            </motion.div>
          </AnimatePresence>
        </div>

      </div>
    </div>
  );

  return ReactDOM.createPortal(content, document.body);
}

export default function OnboardingFlow({ onDismiss }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [visible, setVisible] = useState(false);
  const [showIntro, setShowIntro] = useState(() => {
    if (!user?._id) return false;
    return localStorage.getItem(INTRO_SEEN_KEY(user?._id)) !== 'true';
  });

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

  // Show intro slides first for new users — also handles setup steps
  if (showIntro) {
    return <IntroSlides user={user} onDone={() => setShowIntro(false)} />;
  }

  // For returning users who skipped/need to redo setup — reuse IntroSlides in setup phase
  return <IntroSlides user={user} onDone={() => dismiss(true)} startAtSetup />;

  // eslint-disable-next-line no-unreachable
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
