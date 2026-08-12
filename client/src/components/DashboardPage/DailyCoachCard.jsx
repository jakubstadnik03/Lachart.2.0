/**
 * DailyCoachCard — the day's coaching in one card.
 *
 * Sits at the top of the dashboard because it answers the question an athlete
 * actually opens the app with ("what am I doing today, and should I?") before
 * they have to read a chart to find out.
 *
 * All content comes from buildDailyCard() so this file stays presentational —
 * the same card model drives the native shell, the Expo app and the morning
 * push, and none of them can drift from each other.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AdjustmentsHorizontalIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  LightBulbIcon,
  MinusIcon,
} from '@heroicons/react/24/outline';
import { buildDailyCard } from '../../utils/dailyCoachCard';
import { fetchWellness } from '../../services/wellnessData';
import RpeCapture from '../training/RpeCapture';
import { assessFeltVsData } from '../../utils/feltVsData';
import { saveSessionRpe } from '../../utils/saveSessionRpe';
import {
  COACHING_STYLES,
  styleAtIndex,
  styleIndex,
} from '../../constants/coachingStyles';
import {
  isCardMinimised,
  readDailyCardPrefs,
  saveDailyCardPrefs,
  setCardMinimised,
} from '../../utils/dailyCardPrefs';

const SPORT_EMOJI = {
  run: '🏃', bike: '🚴', mtbike: '🚵', swim: '🏊', strength: '🏋️', gym: '🏋️',
  walk: '🚶', brick: '🔁', crosstrain: '🤸', rowing: '🚣', lactate: '🩸', other: '•',
};

/** Form gauge: the five readiness bands laid out left (strained) → right (very fresh). */
function ReadinessGauge({ readiness, compact }) {
  const pct = Math.round(readiness.gauge * 100);
  return (
    <div className={compact ? 'mt-3' : 'mt-4'}>
      <div className="flex items-end justify-between gap-2 mb-2">
        {[
          { label: 'Fitness', value: readiness.fitness, hint: 'CTL' },
          { label: 'Fatigue', value: readiness.fatigue, hint: 'ATL' },
          {
            label: 'Form',
            value: `${readiness.form > 0 ? '+' : ''}${readiness.form}`,
            hint: 'TSB',
            accent: readiness.color,
          },
        ].map((m) => (
          <div key={m.label} className="flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              {m.label}
            </div>
            <div
              className={`${compact ? 'text-lg' : 'text-xl'} font-bold leading-tight`}
              style={{ color: m.accent || '#111827' }}
            >
              {m.value}
            </div>
          </div>
        ))}
        <div className="text-right">
          <div
            className="inline-flex items-center px-2 py-1 rounded-full text-[11px] font-bold"
            style={{ background: readiness.bg, color: readiness.color, border: `1px solid ${readiness.border}` }}
          >
            {readiness.label}
          </div>
        </div>
      </div>

      <div className="relative h-2 rounded-full overflow-hidden bg-gray-100">
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg,#FCA5A5 0%,#FCD34D 28%,#CBD5E1 52%,#6EE7B7 74%,#7DD3FC 100%)',
          }}
        />
      </div>
      <div className="relative h-0">
        <motion.div
          initial={false}
          animate={{ left: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 220, damping: 26 }}
          className="absolute -top-[13px] -ml-[7px] w-3.5 h-3.5 rounded-full border-2 border-white shadow"
          style={{ background: readiness.color }}
        />
      </div>
      <div className="flex justify-between mt-2 text-[9px] font-medium uppercase tracking-wide text-gray-400">
        <span>Strained</span>
        <span>Neutral</span>
        <span>Fresh</span>
      </div>
    </div>
  );
}

function formatSleep(minutes) {
  const m = Number(minutes) || 0;
  if (m <= 0) return null;
  return `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}m`;
}

/**
 * What the body says, next to what the load model predicts.
 *
 * Deliberately shows the delta against the athlete's own baseline rather than
 * the raw number: 52 bpm means nothing on its own, "+7% on your normal" means
 * something. Renders nothing without a wearable, which is most athletes.
 */
function RecoveryStrip({ recovery }) {
  if (!recovery) return null;

  const sleep = formatSleep(recovery.sleepMinutes);
  const hasAny = sleep || recovery.restingHeartRate || recovery.hrvMs;
  if (!hasAny) return null;

  const items = [
    {
      label: 'Sleep',
      value: sleep || '—',
      // The reasons list is the source of truth for what counts as a problem.
      bad: recovery.reasons.some((r) => r.includes('short sleep')),
      delta: null,
    },
    {
      label: 'Resting HR',
      value: recovery.restingHeartRate ? `${Math.round(recovery.restingHeartRate)}` : '—',
      unit: 'bpm',
      bad: recovery.reasons.some((r) => r.startsWith('resting HR')),
      delta: recovery.restingHeartRateDeltaPct,
    },
    {
      label: 'HRV',
      value: recovery.hrvMs ? `${Math.round(recovery.hrvMs)}` : '—',
      unit: 'ms',
      bad: recovery.reasons.some((r) => r.startsWith('HRV')),
      delta: recovery.hrvDeltaPct,
    },
  ];

  return (
    <div className="mt-3 rounded-xl border px-3 py-2" style={{ borderColor: `${recovery.hex}40`, background: `${recovery.hex}0D` }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Body</span>
        <span className="text-[10px] font-bold" style={{ color: recovery.hex }}>{recovery.label}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {items.map((it) => (
          <div key={it.label}>
            <div className="text-[9px] font-semibold uppercase tracking-wide text-gray-400">{it.label}</div>
            <div className={`text-sm font-bold ${it.bad ? '' : 'text-gray-900'}`} style={it.bad ? { color: recovery.hex } : undefined}>
              {it.value}
              {it.unit && it.value !== '—' ? <span className="text-[10px] font-medium text-gray-400"> {it.unit}</span> : null}
            </div>
            {it.delta !== null && it.delta !== undefined && it.value !== '—' ? (
              <div className="text-[9px] text-gray-500">
                {it.delta > 0 ? '+' : ''}{it.delta}% vs your normal
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {recovery.disagreesWithLoad ? (
        <p className="mt-1.5 text-[10px] text-gray-600 leading-snug">
          Your numbers and your body disagree today — trust the body.
        </p>
      ) : null}
    </div>
  );
}

/** Already-rated sessions get the comparison without the ten buttons. */
function FeltVsDataLine({ activity, userProfile }) {
  const felt = assessFeltVsData(activity, userProfile);
  if (!felt) return null;
  const color = felt.direction === 'harder' ? '#B45309' : felt.direction === 'easier' ? '#047857' : '#6B7280';
  return (
    <div className="text-[11px] mt-0.5">
      <span style={{ color }} className="font-semibold">{felt.verdict}</span>
      <span className="text-gray-500">
        {' '}— you rated it {felt.rpe}
        {felt.expected !== null ? `, the numbers say ${felt.expected}` : ''}
      </span>
    </div>
  );
}

function SessionRow({ item, muted = false, prefix = null }) {
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <span className="text-base leading-5 shrink-0" aria-hidden="true">
        {SPORT_EMOJI[String(item.sport || '').toLowerCase()] || '•'}
      </span>
      <div className="min-w-0 flex-1">
        <div className={`text-sm font-semibold truncate ${muted ? 'text-gray-600' : 'text-gray-900'}`}>
          {prefix ? <span className="text-gray-400 font-medium">{prefix} </span> : null}
          {item.title}
          {item.hard ? (
            <span className="ml-1.5 align-middle inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-100 text-orange-700">
              HARD
            </span>
          ) : null}
        </div>
        {item.detail ? <div className="text-xs text-gray-500 truncate">{item.detail}</div> : null}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">{title}</div>
      {children}
    </div>
  );
}

function StyleSlider({ value, onChange }) {
  const idx = styleIndex(value);
  const current = COACHING_STYLES[idx];
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs font-semibold text-gray-700">Coaching voice</span>
        <span className="text-xs font-bold text-gray-900">{current.label}</span>
      </div>
      <input
        type="range"
        min={0}
        max={COACHING_STYLES.length - 1}
        step={1}
        value={idx}
        onChange={(e) => onChange(styleAtIndex(e.target.value).id)}
        className="w-full accent-primary cursor-pointer"
        aria-label="Coaching voice"
      />
      <div className="flex justify-between text-[9px] text-gray-400 font-medium mt-0.5">
        <span>{COACHING_STYLES[0].label}</span>
        <span>{COACHING_STYLES[COACHING_STYLES.length - 1].label}</span>
      </div>
      <p className="text-[11px] text-gray-500 mt-1.5">{current.blurb}</p>
    </div>
  );
}

export default function DailyCoachCard({
  athleteId = null,
  user = null,
  todayMetrics = {},
  plannedWorkouts = [],
  activities = [],
  userProfile = null,
  weather = null,
  /** Pass to skip the fetch when the parent already holds wellness rows. */
  wellnessDays = undefined,
  loading = false,
  compact = false,
  /** Coaches viewing an athlete get the facts without the second-person voice. */
  readOnly = false,
}) {
  const [prefs, setPrefs] = useState(() => readDailyCardPrefs(user));
  const [showSettings, setShowSettings] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [minimised, setMinimised] = useState(false);
  const [saving, setSaving] = useState(false);
  const [wellness, setWellness] = useState(wellnessDays || []);
  const [ratedYesterday, setRatedYesterday] = useState(null);

  useEffect(() => { setPrefs(readDailyCardPrefs(user)); }, [user]);

  // Resting HR, HRV and sleep. fetchWellness has its own short TTL cache, so
  // sharing it with the insights card costs one request, not two.
  useEffect(() => {
    if (wellnessDays !== undefined) { setWellness(wellnessDays); return undefined; }
    if (!athleteId) return undefined;
    let cancelled = false;
    fetchWellness(7, athleteId)
      .then((data) => { if (!cancelled) setWellness(data.days || []); })
      .catch(() => { if (!cancelled) setWellness([]); });
    return () => { cancelled = true; };
  }, [athleteId, wellnessDays]);

  const card = useMemo(
    () => buildDailyCard({
      todayMetrics,
      plannedWorkouts,
      activities,
      userProfile,
      user,
      styleId: prefs.style,
      weather,
      wellness,
      now: new Date(),
    }),
    [todayMetrics, plannedWorkouts, activities, userProfile, user, prefs.style, weather, wellness],
  );

  useEffect(() => {
    setMinimised(isCardMinimised(athleteId, card.dateKey));
  }, [athleteId, card.dateKey]);

  const persist = useCallback(async (next) => {
    setPrefs(next);
    setSaving(true);
    try {
      await saveDailyCardPrefs(next, user?.notifications);
    } catch {
      /* localStorage mirror already holds it — a failed sync shouldn't undo the choice */
    } finally {
      setSaving(false);
    }
  }, [user?.notifications]);

  const handleRateYesterday = useCallback(async (rpe) => {
    await saveSessionRpe(card.yesterdayActivity, rpe, athleteId);
    setRatedYesterday(rpe);
  }, [card.yesterdayActivity, athleteId]);

  const minimise = useCallback(() => {
    setMinimised(true);
    setCardMinimised(athleteId, card.dateKey, true);
  }, [athleteId, card.dateKey]);

  const restore = useCallback(() => {
    setMinimised(false);
    setCardMinimised(athleteId, card.dateKey, false);
  }, [athleteId, card.dateKey]);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-lg animate-pulse">
        <div className="h-4 w-28 bg-gray-200 rounded mb-3" />
        <div className="h-6 w-2/3 bg-gray-200 rounded mb-2" />
        <div className="h-3 w-full bg-gray-100 rounded mb-1.5" />
        <div className="h-3 w-4/5 bg-gray-100 rounded" />
      </div>
    );
  }

  // Nothing computed yet (no activities, no profile) — a card of zeroes would
  // read as "Form 0, you're neutral", which is a claim we haven't earned.
  const hasSignal = Number.isFinite(Number(todayMetrics?.fitness)) && (activities?.length || plannedWorkouts?.length);
  if (!hasSignal) return null;

  if (minimised) {
    return (
      <motion.button
        type="button"
        onClick={restore}
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-white shadow border border-gray-100 text-left"
        style={{ borderLeft: `3px solid ${card.readiness.color}` }}
      >
        <span className="text-xs font-bold text-gray-900 truncate">{card.headline}</span>
        <span className="text-[11px] text-gray-500 truncate hidden sm:inline">{card.pushBody}</span>
        <ChevronDownIcon className="w-4 h-4 text-gray-400 ml-auto shrink-0" />
      </motion.button>
    );
  }

  const isNerd = prefs.style === 'nerd';

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl shadow-lg overflow-hidden"
      style={{ borderTop: `3px solid ${card.readiness.color}` }}
    >
      <div className={compact ? 'p-3.5' : 'p-4 sm:p-5'}>
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="min-w-0">
            {card.greeting && !readOnly ? (
              <div className="text-[11px] font-semibold text-gray-400">{card.greeting}</div>
            ) : (
              <div className="text-[11px] font-semibold text-gray-400">Today</div>
            )}
            <h3 className={`${compact ? 'text-base' : 'text-lg'} font-bold text-gray-900 leading-snug`}>
              {card.headline}
            </h3>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowSettings((v) => !v)}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Card settings"
            >
              <AdjustmentsHorizontalIcon className="w-4 h-4 text-gray-400" />
            </button>
            <button
              type="button"
              onClick={minimise}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Minimise card"
            >
              <MinusIcon className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </div>

        {/* The directive — the one line worth reading if they read nothing else */}
        <p className={`${compact ? 'text-xs' : 'text-sm'} text-gray-700 leading-relaxed`}>
          {isNerd ? card.readiness.readout : card.directive}
        </p>
        {isNerd ? (
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">{card.directive}</p>
        ) : null}

        <ReadinessGauge readiness={card.readiness} compact={compact} />
        <RecoveryStrip recovery={card.recovery} />

        {/* Settings */}
        <AnimatePresence initial={false}>
          {showSettings && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-4 pt-4 border-t border-gray-100 space-y-4">
                <StyleSlider value={prefs.style} onChange={(style) => persist({ ...prefs, style })} />

                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-gray-700">Morning card</div>
                    <div className="text-[11px] text-gray-500">Push this card each day</div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={prefs.enabled}
                      onChange={(e) => persist({ ...prefs, enabled: e.target.checked })}
                    />
                    <div className="w-10 h-5 bg-gray-200 rounded-full peer peer-checked:bg-primary transition-colors" />
                    <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5" />
                  </label>
                </div>

                {prefs.enabled ? (
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-gray-700">Delivery time</div>
                      <div className="text-[11px] text-gray-500">Your local time</div>
                    </div>
                    <input
                      type="time"
                      value={`${String(prefs.hour).padStart(2, '0')}:${String(prefs.minute).padStart(2, '0')}`}
                      onChange={(e) => {
                        const [h, m] = String(e.target.value || '07:00').split(':');
                        persist({ ...prefs, hour: Number(h) || 0, minute: Number(m) || 0 });
                      }}
                      className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm font-semibold text-gray-900"
                    />
                  </div>
                ) : null}

                {saving ? <div className="text-[11px] text-gray-400">Saving…</div> : null}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Today / yesterday / weather */}
        <div className="mt-4 pt-3.5 border-t border-gray-100 space-y-3">
          <Section title="Today">
            {card.todayPlanned.length ? (
              card.todayPlanned.map((p) => <SessionRow key={p.id} item={p} />)
            ) : card.todayCompleted.length ? (
              card.todayCompleted.map((a) => <SessionRow key={a.id} item={a} prefix="Done —" />)
            ) : (
              <div className="text-sm text-gray-500 py-1.5">Nothing planned</div>
            )}
            {card.todayPlanned.length && card.todayCompleted.length ? (
              <div className="text-[11px] text-green-700 font-medium">
                {card.todayCompleted.length} already logged today
              </div>
            ) : null}
          </Section>

          <AnimatePresence initial={false}>
            {showMore && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden space-y-3"
              >
                {card.yesterday ? (
                  <Section title="Yesterday">
                    <SessionRow item={card.yesterday} muted />
                    {/* The morning after is the one moment an athlete will
                        actually rate a session, so the prompt lives here rather
                        than behind a tap on the session detail page. */}
                    {!readOnly && (card.needsRpe || ratedYesterday) ? (
                      <div className="mt-1.5">
                        <RpeCapture
                          activity={{ ...card.yesterdayActivity, rpe: ratedYesterday || card.yesterdayActivity?.rpe }}
                          userProfile={userProfile}
                          scale={user?.trainingPreferences?.rpeScale || 'rpe'}
                          onSave={handleRateYesterday}
                          compact
                        />
                      </div>
                    ) : card.yesterday.rpe ? (
                      <FeltVsDataLine activity={card.yesterdayActivity} userProfile={userProfile} />
                    ) : null}
                  </Section>
                ) : null}

                {card.tomorrowPlanned.length ? (
                  <Section title="Tomorrow">
                    {card.tomorrowPlanned.map((p) => <SessionRow key={p.id} item={p} muted />)}
                  </Section>
                ) : null}

                <Section title="Last 7 days">
                  <div className="text-sm text-gray-700 py-1">
                    <span className="font-bold text-gray-900">{card.load.last7} TSS</span>
                    <span className="text-gray-500"> across {card.load.sessions7} session{card.load.sessions7 === 1 ? '' : 's'}</span>
                    {card.load.changePct !== null ? (
                      <span className={card.load.changePct >= 0 ? 'text-orange-600' : 'text-blue-600'}>
                        {' '}({card.load.changePct >= 0 ? '+' : ''}{card.load.changePct}% vs previous 7)
                      </span>
                    ) : null}
                  </div>
                </Section>

                {card.weather ? (
                  <Section title="Conditions">
                    <div className="text-sm text-gray-700 py-1">
                      {card.weather.tempC != null ? `${Math.round(card.weather.tempC)}°C` : ''}
                      {card.weather.description ? ` · ${card.weather.description}` : ''}
                      {card.weather.place ? <span className="text-gray-500"> · {card.weather.place}</span> : null}
                    </div>
                  </Section>
                ) : null}
              </motion.div>
            )}
          </AnimatePresence>

          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-gray-700"
          >
            {showMore ? 'Less' : 'Yesterday, tomorrow & load'}
            {showMore ? <ChevronUpIcon className="w-3.5 h-3.5" /> : <ChevronDownIcon className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Daily lesson — the one part of the card that isn't about them */}
      {prefs.lesson && card.lesson ? (
        <div className="px-4 sm:px-5 py-3 bg-gray-50 border-t border-gray-100">
          <div className="flex items-start gap-2">
            <LightBulbIcon className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-bold text-gray-900">
                {card.lesson.title}
                <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wide text-gray-400">
                  {card.lesson.tag}
                </span>
              </div>
              <p className="text-[11px] text-gray-600 leading-relaxed mt-0.5">{card.lesson.body}</p>
            </div>
          </div>
        </div>
      ) : null}
    </motion.div>
  );
}
