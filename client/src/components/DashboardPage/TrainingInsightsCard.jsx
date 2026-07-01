/**
 * TrainingInsightsCard — dashboard coach hints (Form + rule-based alerts).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { getRaceEvents } from '../../services/api';
import { fetchWellness } from '../../services/wellnessData';
import { computeDailyInsight } from '../../utils/trainingInsights';

const SEVERITY = {
  ok: { bg: '#ECFDF5', border: '#A7F3D0', accent: '#047857', label: 'OK' },
  watch: { bg: '#FFFBEB', border: '#FDE68A', accent: '#B45309', label: 'Pozor' },
  warning: { bg: '#FEF2F2', border: '#FECACA', accent: '#B91C1C', label: 'Recovery' },
};

export default function TrainingInsightsCard({
  athleteId = null,
  todayMetrics = {},
  plannedWorkouts = [],
  activities = [],
  tests = [],
  sparklineData = [],
  wellnessDays: wellnessProp = undefined,
  nextRace: nextRaceProp = undefined,
  userProfile = null,
  loading = false,
  compact = false,
}) {
  const [fetchedRace, setFetchedRace] = useState(null);
  const [wellnessDays, setWellnessDays] = useState(wellnessProp || []);

  useEffect(() => {
    if (wellnessProp !== undefined) {
      setWellnessDays(wellnessProp);
      return undefined;
    }
    if (!athleteId) return undefined;
    let cancelled = false;
    fetchWellness(7, athleteId)
      .then((data) => { if (!cancelled) setWellnessDays(data.days || []); })
      .catch(() => { if (!cancelled) setWellnessDays([]); });
    return () => { cancelled = true; };
  }, [athleteId, wellnessProp]);

  useEffect(() => {
    if (nextRaceProp !== undefined || !athleteId) return undefined;
    let cancelled = false;
    const todayIso = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
    getRaceEvents(athleteId, { from: todayIso })
      .then(({ data }) => {
        if (!cancelled) setFetchedRace(Array.isArray(data) && data[0] ? data[0] : null);
      })
      .catch(() => {
        if (!cancelled) setFetchedRace(null);
      });
    return () => { cancelled = true; };
  }, [athleteId, nextRaceProp]);

  const nextRace = nextRaceProp !== undefined ? nextRaceProp : fetchedRace;

  const insight = useMemo(
    () =>
      computeDailyInsight({
        todayMetrics,
        plannedWorkouts,
        wellnessDays,
        activities,
        tests,
        sparklineData,
        nextRace,
        userProfile,
      }),
    [todayMetrics, plannedWorkouts, wellnessDays, activities, tests, sparklineData, nextRace, userProfile]
  );

  const style = SEVERITY[insight.severity] || SEVERITY.ok;
  const extras = insight.all?.slice(1, compact ? 2 : 3) || [];

  if (loading) {
    return (
      <div style={cardShell(compact)}>
        <div style={{ fontSize: 12, color: '#9CA3AF' }}>Načítám doporučení…</div>
      </div>
    );
  }

  return (
    <div
      style={{
        ...cardShell(compact),
        background: style.bg,
        borderColor: style.border,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#6B7280', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Dnešní insight
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            color: style.accent,
            background: '#fff',
            borderRadius: 999,
            padding: '2px 8px',
            border: `1px solid ${style.border}`,
          }}
        >
          {style.label}
        </span>
      </div>
      <div style={{ fontSize: compact ? 15 : 17, fontWeight: 800, color: '#0A0E1A', lineHeight: 1.25 }}>
        {insight.headline}
      </div>
      {insight.detail && (
        <p style={{ margin: '6px 0 0', fontSize: compact ? 12 : 13, color: '#374151', lineHeight: 1.45 }}>
          {insight.detail}
        </p>
      )}
      {extras.length > 0 && (
        <ul style={{ margin: '10px 0 0', padding: '0 0 0 16px', fontSize: compact ? 11 : 12, color: '#4B5563' }}>
          {extras.map((x) => (
            <li key={x.headline} style={{ marginBottom: 4 }}>{x.headline}{x.detail ? ` — ${x.detail}` : ''}</li>
          ))}
        </ul>
      )}
      {insight.moreCount > extras.length && (
        <p style={{ margin: '8px 0 0', fontSize: 11, color: '#9CA3AF' }}>
          +{insight.moreCount - extras.length} dalších signálů
        </p>
      )}
    </div>
  );
}

function cardShell(compact) {
  return {
    background: '#fff',
    border: '1px solid #E5E7EB',
    borderRadius: compact ? 18 : 16,
    padding: compact ? '12px 14px' : '16px',
    boxShadow: '0 1px 2px rgba(15,23,42,.04)',
  };
}
