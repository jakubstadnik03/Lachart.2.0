import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { HeartIcon, MoonIcon, BoltIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../../context/AuthProvider';
import { getTodayMetrics } from '../../services/api';
import { fetchWellness } from '../../services/wellnessData';
import { assessReadiness, baseline, READINESS_COLORS } from '../../utils/recovery';

function fmtSleep(mins) {
  if (!mins || mins <= 0) return '—';
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

/** Tiny inline sparkline for a metric across the last N days. */
function Sparkline({ days, dataKey, color }) {
  const pts = (days || []).map((d) => d[dataKey]).map((v) => (v != null && v > 0 ? v : null));
  const real = pts.filter((v) => v != null);
  if (real.length < 2) return <div className="h-6" />;
  const min = Math.min(...real);
  const max = Math.max(...real);
  const span = max - min || 1;
  const w = 100;
  const h = 24;
  const step = w / (pts.length - 1);
  let d = '';
  pts.forEach((v, i) => {
    if (v == null) return;
    const x = i * step;
    const y = h - ((v - min) / span) * (h - 4) - 2;
    d += `${d ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)} `;
  });
  const lastIdx = pts.length - 1;
  const lastVal = pts[lastIdx];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-6">
      <path d={d.trim()} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {lastVal != null && (
        <circle cx={lastIdx * step} cy={h - ((lastVal - min) / span) * (h - 4) - 2} r="2.5" fill={color} />
      )}
    </svg>
  );
}

/**
 * Recovery & readiness snapshot from Apple Health — resting HR, sleep and HRV
 * over the last 7 days. Readiness also factors in TSB (Form) so accumulated
 * training fatigue plus poor recovery flags overreaching.
 *
 * @param {{ athleteId?: string }} props — pass athleteId when a coach views a
 *   linked athlete; defaults to the logged-in user.
 */
export default function WellnessCard({ athleteId = null }) {
  const { user } = useAuth();
  const targetId = athleteId || user?._id || null;
  const isCoachView = athleteId && user?._id && String(athleteId) !== String(user._id);
  const [days, setDays] = useState([]);
  const [connected, setConnected] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [tsb, setTsb] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchWellness(7, isCoachView ? athleteId : null);
      setDays(data.days);
      setConnected(data.connected);
    } catch {
      setDays([]);
    } finally {
      setLoaded(true);
    }
  }, [athleteId, isCoachView]);

  useEffect(() => {
    load();
    const onSynced = () => load();
    window.addEventListener('appleHealth:synced', onSynced);
    return () => window.removeEventListener('appleHealth:synced', onSynced);
  }, [load]);

  // Current Form (TSB) for the readiness assessment.
  useEffect(() => {
    let cancelled = false;
    if (!targetId) return undefined;
    (async () => {
      try {
        const { data } = await getTodayMetrics(targetId);
        if (!cancelled) setTsb(data?.form ?? null);
      } catch { if (!cancelled) setTsb(null); }
    })();
    return () => { cancelled = true; };
  }, [targetId]);

  const latest = days.length ? days[days.length - 1] : null;
  const readiness = useMemo(() => assessReadiness(days, { tsb }), [days, tsb]);

  const trend = useCallback((key, lowerIsBetter) => {
    const base = baseline(days, key);
    if (!base || !latest || !(latest[key] > 0)) return null;
    const delta = latest[key] - base;
    if (Math.abs(delta) < 0.5) return { delta: 0 };
    const good = lowerIsBetter ? delta < 0 : delta > 0;
    return { delta, good };
  }, [days, latest]);

  if (!loaded) return null;
  if (!connected && !latest) {
    if (isCoachView) {
      return (
        <div className="rounded-2xl bg-white ring-1 ring-slate-200/70 shadow-sm p-4 sm:p-5">
          <p className="text-sm text-slate-500 m-0">
            This athlete has not connected Apple Health yet. They need to open the LaChart iOS app → Settings → Integrations → Apple Health → Connect &amp; sync.
          </p>
        </div>
      );
    }
    return null;
  }
  const hasAny = latest && (latest.restingHeartRate || latest.sleepMinutes || latest.hrvMs);
  if (!hasAny) return null;

  const rhrTrend = trend('restingHeartRate', true);
  const hrvTrend = trend('hrvMs', false);

  const Delta = ({ t }) => {
    if (!t || t.delta === 0) return null;
    const arrow = t.delta > 0 ? '▲' : '▼';
    return (
      <span className={`ml-1 text-[11px] font-semibold ${t.good ? 'text-emerald-500' : 'text-rose-500'}`}>
        {arrow}{Math.abs(Math.round(t.delta))}
      </span>
    );
  };

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200/70 shadow-sm p-4 sm:p-5 h-full">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-rose-50">
          <HeartIcon className="w-4 h-4 text-rose-500" />
        </span>
        <h3 className="text-sm font-bold text-slate-700">
          Recovery &amp; readiness{isCoachView ? ' · athlete' : ''}
        </h3>
        {readiness && (
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ring-1 ${READINESS_COLORS[readiness.color].pill}`}>
            <BoltIcon className="w-3 h-3" />
            {readiness.label}
          </span>
        )}
        {tsb != null && (
          <span className="text-[11px] text-slate-400">Form {Math.round(tsb) > 0 ? '+' : ''}{Math.round(tsb)}</span>
        )}
        {latest?.date && (
          <span className="ml-auto text-[11px] text-slate-400">{latest.date}</span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-slate-50 p-3">
          <div className="flex items-center justify-center gap-1 text-[11px] text-slate-500 mb-1">
            <HeartIcon className="w-3.5 h-3.5" /> Resting HR
          </div>
          <div className="text-center text-xl font-extrabold text-slate-900 tabular-nums mb-1">
            {latest?.restingHeartRate ?? '—'}
            {latest?.restingHeartRate != null && <span className="text-[11px] font-medium text-slate-400"> bpm</span>}
            <Delta t={rhrTrend} />
          </div>
          <Sparkline days={days} dataKey="restingHeartRate" color="#f43f5e" />
        </div>

        <div className="rounded-xl bg-slate-50 p-3">
          <div className="flex items-center justify-center gap-1 text-[11px] text-slate-500 mb-1">
            <MoonIcon className="w-3.5 h-3.5" /> Sleep
          </div>
          <div className="text-center text-xl font-extrabold text-slate-900 tabular-nums mb-1">
            {fmtSleep(latest?.sleepMinutes)}
          </div>
          <Sparkline days={days} dataKey="sleepMinutes" color="#6366f1" />
        </div>

        <div className="rounded-xl bg-slate-50 p-3">
          <div className="text-center text-[11px] text-slate-500 mb-1">HRV</div>
          <div className="text-center text-xl font-extrabold text-slate-900 tabular-nums mb-1">
            {latest?.hrvMs ?? '—'}
            {latest?.hrvMs != null && <span className="text-[11px] font-medium text-slate-400"> ms</span>}
            <Delta t={hrvTrend} />
          </div>
          <Sparkline days={days} dataKey="hrvMs" color="#10b981" />
        </div>
      </div>

      {readiness && readiness.reasons.length > 0 && (
        <p className={`mt-3 text-[12px] ${readiness.level === 'high' ? 'text-rose-600' : 'text-amber-600'}`}>
          {readiness.level === 'high'
            ? 'Signs of overreaching — consider easier training or rest: '
            : 'Recovery worth watching: '}
          {readiness.reasons.join(', ')}.
        </p>
      )}
      {readiness && readiness.level === 'ok' && (
        <p className="mt-3 text-[12px] text-emerald-600">
          Recovery markers are in your normal range — good to train.
        </p>
      )}
    </div>
  );
}
