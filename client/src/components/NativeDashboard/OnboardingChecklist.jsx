import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GlassCard } from '../native/shared/Tiles';
import api, { getIntegrationStatus } from '../../services/api';

const DISMISS_KEY = 'onboardingChecklistDismissed';

/**
 * Getting-started checklist for the home dashboard. Drives the features that
 * data shows are under-discovered — connect a source (15%), run a test (66%),
 * plan a workout (2%), and (coaches) invite an athlete. Auto-hides once every
 * step is done; dismissible with a persistent flag.
 *
 * Props:
 *   user, tests[], plannedWorkouts[], stravaConnected
 *   onConnect       — open the connect sheet
 *   onPlanWorkout   — (date) => void, open the planner
 */
export default function OnboardingChecklist({
  user = null,
  tests = [],
  plannedWorkouts = [],
  stravaConnected = false,
  onConnect,
  onPlanWorkout,
}) {
  const navigate = useNavigate();
  const isCoach = String(user?.role || '').toLowerCase() === 'coach';
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  });
  const [connected, setConnected] = useState(Boolean(stravaConnected));
  const [hasAthlete, setHasAthlete] = useState(null); // null = unknown yet

  // Live-check integration status (Strava OR Garmin OR Apple Health) and, for
  // coaches, whether they already have an athlete. Re-checks after a sync.
  useEffect(() => {
    let cancelled = false;
    const check = () => {
      getIntegrationStatus()
        .then((s) => { if (!cancelled) setConnected(Boolean(s?.stravaConnected || s?.garminConnected || s?.appleHealthConnected)); })
        .catch(() => {});
    };
    check();
    window.addEventListener('appleHealth:synced', check);
    window.addEventListener('garmin:synced', check);
    if (isCoach) {
      api.get('/user/coach/athletes')
        .then((r) => {
          if (cancelled) return;
          const list = Array.isArray(r.data) ? r.data : (r.data?.athletes || []);
          setHasAthlete(list.some((a) => !a.invitationPending && a.coachLinkStatus !== 'pending') || list.length > 0);
        })
        .catch(() => { if (!cancelled) setHasAthlete(false); });
    }
    return () => {
      cancelled = true;
      window.removeEventListener('appleHealth:synced', check);
      window.removeEventListener('garmin:synced', check);
    };
  }, [isCoach]);

  const steps = useMemo(() => {
    const base = [
      {
        key: 'connect',
        label: 'Connect a data source',
        desc: 'Strava, Garmin or Apple Health',
        done: connected,
        cta: 'Connect',
        action: () => onConnect?.(),
      },
      {
        key: 'test',
        label: 'Run your first lactate test',
        desc: 'Get your curve and thresholds',
        done: (tests?.length || 0) > 0,
        cta: 'Test',
        action: () => navigate('/testing'),
      },
      {
        key: 'plan',
        label: 'Plan a workout',
        desc: 'Build your week in the planner',
        done: (plannedWorkouts?.length || 0) > 0,
        cta: 'Plan',
        action: () => (onPlanWorkout ? onPlanWorkout(new Date()) : navigate('/workout-planner')),
      },
    ];
    if (isCoach) {
      base.push({
        key: 'athlete',
        label: 'Invite an athlete',
        desc: 'Coach and track your athletes',
        done: hasAthlete === true,
        cta: 'Invite',
        action: () => navigate('/athletes'),
      });
    }
    return base;
  }, [connected, tests, plannedWorkouts, isCoach, hasAthlete, navigate, onConnect, onPlanWorkout]);

  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;

  // Wait for the coach athlete check before deciding "all done" to avoid a flash.
  const pending = isCoach && hasAthlete === null;
  if (dismissed || allDone || pending) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
    setDismissed(true);
  };

  const pct = Math.round((doneCount / steps.length) * 100);

  return (
    <GlassCard style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 16 }}>🚀</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: '#0A0E1A' }}>Get started</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#6B7280' }}>{doneCount}/{steps.length}</span>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', padding: 2, WebkitTapHighlightColor: 'transparent' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        </button>
      </div>

      {/* Progress bar */}
      <div style={{ height: 6, borderRadius: 999, background: 'rgba(94,101,144,.12)', overflow: 'hidden', marginBottom: 12 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#5E6590,#767EB5)', borderRadius: 999, transition: 'width .3s ease' }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {steps.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={s.done ? undefined : s.action}
            disabled={s.done}
            style={{
              display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left',
              padding: '8px 10px', borderRadius: 12,
              background: s.done ? 'rgba(16,185,129,.06)' : 'rgba(118,126,181,.06)',
              border: `1px solid ${s.done ? 'rgba(16,185,129,.18)' : 'rgba(118,126,181,.14)'}`,
              cursor: s.done ? 'default' : 'pointer', fontFamily: 'inherit',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <span style={{
              flexShrink: 0, width: 22, height: 22, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: s.done ? '#10b981' : '#fff',
              border: s.done ? 'none' : '2px solid #C7CBE0',
            }}>
              {s.done && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              )}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: s.done ? '#6B7280' : '#0A0E1A', textDecoration: s.done ? 'line-through' : 'none' }}>{s.label}</span>
              {!s.done && <span style={{ display: 'block', fontSize: 10.5, color: '#9CA3AF' }}>{s.desc}</span>}
            </span>
            {!s.done && (
              <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 800, color: '#fff', background: '#767EB5', borderRadius: 8, padding: '5px 11px' }}>
                {s.cta}
              </span>
            )}
          </button>
        ))}
      </div>
    </GlassCard>
  );
}
