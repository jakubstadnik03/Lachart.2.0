/**
 * First slide of the native dashboard carousel — Fitness / Form / Fatigue KPIs.
 * Day navigator: past actuals + future projection from planned workouts.
 */
import React, { useMemo, useState } from 'react';
import { NativeSkeleton } from '../native/shared/Tiles';
import { buildExtendedPmcSeries, localCalendarDateKey, computePmcFromActivities } from '../../utils/formFitnessFromActivities';
import { resolveActivityTss } from '../../utils/computeTss';
import { enrichProfileForTss, mergeProfileZones } from '../../utils/inferThresholdsFromActivities';
import { requestTrainingZonesModal, profileNeedsTrainingZones } from '../../utils/trainingZonesSetup';
import { useAuth } from '../../context/AuthProvider';

const CARD = {
  background: 'rgba(255,255,255,.65)',
  backdropFilter: 'blur(22px) saturate(170%)',
  WebkitBackdropFilter: 'blur(22px) saturate(170%)',
  border: '1px solid rgba(255,255,255,.7)',
  boxShadow: '0 1px 0 rgba(255,255,255,.7) inset, 0 8px 24px -10px rgba(10,14,26,.08)',
  borderRadius: 18,
  padding: '12px 14px 14px',
  width: '100%',
  boxSizing: 'border-box',
};

const dateNavBtn = {
  width: 22,
  height: 22,
  borderRadius: '50%',
  background: 'rgba(118,126,181,.12)',
  border: 'none',
  color: '#5E6590',
  fontFamily: 'inherit',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  flexShrink: 0,
  WebkitTapHighlightColor: 'transparent',
  touchAction: 'manipulation',
};

function readField(d, ...keys) {
  for (const k of keys) {
    const v = d[k] ?? d[k.toLowerCase()] ?? d[k.toUpperCase()];
    if (v !== undefined && v !== null) return Number(v);
  }
  return 0;
}

function DeltaArrow({ value }) {
  if (value == null || value === 0) return null;
  const up = value > 0;
  const color = up ? '#10b981' : '#9ca3af';
  return (
    <span style={{ fontSize: 10, fontWeight: 800, color, marginLeft: 2 }} aria-hidden>
      {up ? '▲' : '▼'}
    </span>
  );
}

function MetricTile({ label, value, color, delta, highlight = false, dimmed = false }) {
  const display = typeof value === 'number' && label === 'Form' && value > 0 ? `+${value}` : value;
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        borderRadius: 12,
        padding: '10px 8px 8px',
        background: 'rgba(255,255,255,.55)',
        border: highlight ? `1.5px solid ${color}` : '1px solid rgba(118,126,181,.14)',
        textAlign: 'center',
        opacity: dimmed ? 0.72 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span
          style={{
            fontSize: 22,
            fontWeight: 900,
            color,
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.02em',
            lineHeight: 1,
          }}
        >
          {display}
        </span>
        <DeltaArrow value={delta} />
      </div>
      <div
        style={{
          marginTop: 6,
          paddingTop: 5,
          borderTop: `2px solid ${color}`,
          fontSize: 11,
          fontWeight: 800,
          color,
          letterSpacing: '0.02em',
        }}
      >
        {label}
      </div>
    </div>
  );
}

function formatDayLabel(selectedDate, dayOffset, isProjected) {
  if (dayOffset === 0) return 'Today';
  if (dayOffset === -1) return 'Yesterday';
  if (dayOffset === 1) return 'Tomorrow';
  const base = selectedDate.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' });
  return isProjected ? `${base} · planned` : base;
}

export default function PerformanceInsightsSlide({
  activities = [],
  userProfile = null,
  todayMetrics = {},
  sparklineData = [],
  plannedWorkouts = [],
  loading = false,
}) {
  const { user } = useAuth() || {};
  const profile = useMemo(
    () => mergeProfileZones(userProfile, user) || userProfile || user,
    [userProfile, user],
  );

  const derived = useMemo(() => {
    if (!activities?.length || !profile) return null;
    return computePmcFromActivities(activities, profile, { tssUser: user });
  }, [activities, profile, user]);

  const effTodayMetrics = useMemo(() => {
    if (derived?.todayMetrics && activities?.length) return derived.todayMetrics;
    if (todayMetrics.fitness != null || todayMetrics.form != null || todayMetrics.fatigue != null) {
      return todayMetrics;
    }
    return derived?.todayMetrics || todayMetrics;
  }, [todayMetrics, derived, activities]);

  const effSparkline = useMemo(() => {
    if (derived?.series?.length && activities?.length) return derived.series;
    return sparklineData?.length ? sparklineData : (derived?.series || []);
  }, [sparklineData, derived, activities]);

  const [dayOffset, setDayOffset] = useState(0);

  const extendedSeries = useMemo(
    () => buildExtendedPmcSeries(effSparkline, plannedWorkouts),
    [effSparkline, plannedWorkouts],
  );

  const sparkByDate = useMemo(() => {
    const map = {};
    (extendedSeries || []).forEach((d) => {
      const key = d?.date ? String(d.date).slice(0, 10) : null;
      if (key) map[key] = d;
    });
    return map;
  }, [extendedSeries]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const todayKey = localCalendarDateKey(today);
  const oldestKey = effSparkline.length > 0 ? String(effSparkline[0].date || '').slice(0, 10) : null;
  const lastExtendedKey = extendedSeries.length > 0
    ? String(extendedSeries[extendedSeries.length - 1].date || '').slice(0, 10)
    : todayKey;

  const maxDayOffset = useMemo(() => {
    const end = new Date(`${lastExtendedKey}T12:00:00`);
    return Math.max(0, Math.round((end - today) / 86400000));
  }, [lastExtendedKey, today]);

  const selectedDate = useMemo(() => {
    const d = new Date(today);
    d.setDate(today.getDate() + dayOffset);
    return d;
  }, [today, dayOffset]);

  const selectedKey = localCalendarDateKey(selectedDate);
  const selectedPt = sparkByDate[selectedKey];
  const isToday = dayOffset === 0;
  const isProjected = Boolean(selectedPt?.projected);
  const canGoBack = !!oldestKey && selectedKey > oldestKey;
  const canGoForward = dayOffset < maxDayOffset;

  const lastPt = effSparkline.length > 0 ? effSparkline[effSparkline.length - 1] : null;

  const canResolveAnyTss = useMemo(() => {
    if (!activities?.length || !profile) return false;
    const enriched = enrichProfileForTss(profile, activities);
    return activities.some((a) => resolveActivityTss(a, enriched, { user }) > 0);
  }, [activities, profile, user]);

  const { fitness, fatigue, form, fitnessDelta, fatigueDelta, formDelta, noData } = useMemo(() => {
    const fit = Math.round(
      isToday
        ? (effTodayMetrics.fitness ?? (lastPt ? readField(lastPt, 'Fitness', 'fitness', 'ctl') : 0))
        : (selectedPt ? readField(selectedPt, 'Fitness', 'fitness', 'ctl') : 0),
    );
    const fat = Math.round(
      isToday
        ? (effTodayMetrics.fatigue ?? (lastPt ? readField(lastPt, 'Fatigue', 'fatigue', 'atl') : 0))
        : (selectedPt ? readField(selectedPt, 'Fatigue', 'fatigue', 'atl') : 0),
    );
    const frm = Math.round(
      isToday
        ? (effTodayMetrics.form != null
          ? effTodayMetrics.form
          : lastPt
            ? readField(lastPt, 'Form', 'form', 'tsb')
            : 0)
        : (selectedPt ? readField(selectedPt, 'Form', 'form', 'tsb') : 0),
    );

    const prev = new Date(selectedDate);
    prev.setDate(selectedDate.getDate() - 1);
    const prevKey = localCalendarDateKey(prev);
    const prevPt = sparkByDate[prevKey];

    const computeDelta = (curr, todayKey, prevKeys) => {
      if (isToday && effTodayMetrics[todayKey] != null) return effTodayMetrics[todayKey];
      if (!prevPt) return null;
      const prevVal = readField(prevPt, ...prevKeys);
      return Math.round(curr - prevVal);
    };

    const metricsUnset = !canResolveAnyTss
      && (activities?.length > 0)
      && !effSparkline.length
      && effTodayMetrics.fitness == null
      && effTodayMetrics.fatigue == null
      && effTodayMetrics.form == null;

    return {
      fitness: fit,
      fatigue: fat,
      form: frm,
      fitnessDelta: computeDelta(fit, 'fitnessChange', ['Fitness', 'fitness', 'ctl']),
      fatigueDelta: computeDelta(fat, 'fatigueChange', ['Fatigue', 'fatigue', 'atl']),
      formDelta: computeDelta(frm, 'formChange', ['Form', 'form', 'tsb']),
      noData: metricsUnset,
    };
  }, [isToday, effTodayMetrics, lastPt, selectedPt, selectedDate, sparkByDate, effSparkline.length, canResolveAnyTss, activities?.length]);

  const shiftDay = (delta) => {
    setDayOffset((o) => {
      const next = o + delta;
      if (next > maxDayOffset) return maxDayOffset;
      if (oldestKey) {
        const d = new Date(today);
        d.setDate(today.getDate() + next);
        if (localCalendarDateKey(d) < oldestKey) {
          const oldest = new Date(`${oldestKey}T12:00:00`);
          return Math.round((oldest - today) / 86400000);
        }
      }
      return next;
    });
  };

  // Once activities are on screen, compute locally — don't block on parent PMC state.
  if (loading && !activities?.length) {
    return (
      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <NativeSkeleton width={22} height={22} radius={6} />
          <NativeSkeleton width={140} height={14} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <NativeSkeleton height={72} radius={12} style={{ flex: 1 }} />
          <NativeSkeleton height={72} radius={12} style={{ flex: 1 }} />
          <NativeSkeleton height={72} radius={12} style={{ flex: 1 }} />
        </div>
      </div>
    );
  }

  return (
    <div style={CARD}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect x="3" y="12" width="4" height="9" rx="1" fill="#599FD0" />
            <rect x="10" y="7" width="4" height="14" rx="1" fill="#5E6590" />
            <rect x="17" y="3" width="4" height="18" rx="1" fill="#599FD0" opacity="0.55" />
          </svg>
          <span style={{ fontSize: 15, fontWeight: 800, color: '#0A0E1A', letterSpacing: '-0.02em' }}>
            Performance Insights
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => canGoBack && shiftDay(-1)}
            disabled={!canGoBack}
            aria-label="Previous day"
            style={{ ...dateNavBtn, opacity: canGoBack ? 1 : 0.35, cursor: canGoBack ? 'pointer' : 'not-allowed' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: isProjected ? '#7c6cf0' : '#6B7280',
              whiteSpace: 'nowrap',
              maxWidth: 118,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {formatDayLabel(selectedDate, dayOffset, isProjected)}
          </span>
          <button
            type="button"
            onClick={() => canGoForward && shiftDay(1)}
            disabled={!canGoForward}
            aria-label="Next day"
            style={{ ...dateNavBtn, opacity: canGoForward ? 1 : 0.35, cursor: canGoForward ? 'pointer' : 'not-allowed' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
          {!isToday && (
            <button
              type="button"
              onClick={() => setDayOffset(0)}
              style={{
                fontSize: 9,
                fontWeight: 800,
                padding: '2px 6px',
                borderRadius: 9999,
                background: 'rgba(118,126,181,.12)',
                color: '#5E6590',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                WebkitTapHighlightColor: 'transparent',
                touchAction: 'manipulation',
              }}
            >
              Today
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <MetricTile label="Fitness" value={fitness} color="#3b82f6" delta={fitnessDelta} dimmed={isProjected} />
        <MetricTile label="Form" value={form} color="#f97316" delta={formDelta} highlight dimmed={isProjected} />
        <MetricTile label="Fatigue" value={fatigue} color="#ec4899" delta={fatigueDelta} dimmed={isProjected} />
      </div>

      {isProjected && selectedPt?.PlannedTSS > 0 && (
        <p style={{ margin: '8px 0 0', fontSize: 10, lineHeight: 1.4, color: '#7c6cf0', textAlign: 'center', fontWeight: 600 }}>
          Based on {Math.round(selectedPt.PlannedTSS)} planned TSS
        </p>
      )}

      {noData && profileNeedsTrainingZones(profile) && (
        <div style={{ margin: '10px 0 0', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 11, lineHeight: 1.4, color: '#6b7280' }}>
            Set FTP / LT2 and heart-rate zones to unlock Form &amp; Fitness from your workouts.
          </p>
          <button
            type="button"
            onClick={() => requestTrainingZonesModal({ force: true, source: 'performance-insights' })}
            style={{
              marginTop: 8,
              fontSize: 12,
              fontWeight: 700,
              color: '#5E6590',
              background: 'rgba(118,126,181,.12)',
              border: 'none',
              borderRadius: 999,
              padding: '6px 14px',
            }}
          >
            Set up zones
          </button>
        </div>
      )}
    </div>
  );
}
