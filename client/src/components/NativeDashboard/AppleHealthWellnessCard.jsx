import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Heart } from 'lucide-react';
import { GlassCard, NativeSkeletonRows } from '../native/shared/Tiles';
import { fetchWellness } from '../../services/wellnessData';
import { isAppleHealthSupported } from '../../services/appleHealthCapacitor';
import WellnessDetailSheet from '../shared/WellnessDetailSheet';

function fmtSleep(mins) {
  if (!mins || mins <= 0) return '—';
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

function fmtDayLabel(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today - d) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

/**
 * Home-dashboard Apple Health card. Swipe (or use the chevrons) to move
 * between days; tap the metrics to open the WellnessDetailSheet trends.
 */
export default function AppleHealthWellnessCard({ loading: parentLoading = false }) {
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState([]);
  const [connected, setConnected] = useState(false);
  const [dayIdx, setDayIdx] = useState(-1); // index into days; -1 = latest
  const [detailMetric, setDetailMetric] = useState(null);
  const touchRef = useRef({ x: 0, y: 0, swiped: false });

  useEffect(() => {
    if (!isAppleHealthSupported()) {
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const data = await fetchWellness(90);
        if (cancelled) return;
        setConnected(Boolean(data?.connected));
        setDays(data?.days || []);
        setDayIdx(-1);
      } catch {
        if (!cancelled) setDays([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    window.addEventListener('appleHealth:synced', load);
    return () => { cancelled = true; window.removeEventListener('appleHealth:synced', load); };
  }, []);

  const effectiveIdx = dayIdx === -1 ? days.length - 1 : dayIdx;
  const row = effectiveIdx >= 0 ? days[effectiveIdx] : null;
  const canPrev = effectiveIdx > 0;
  const canNext = effectiveIdx < days.length - 1;

  const goPrev = () => { if (canPrev) setDayIdx(effectiveIdx - 1); };
  const goNext = () => { if (canNext) setDayIdx(effectiveIdx + 1); };

  const onTouchStart = (e) => {
    const t = e.touches?.[0];
    if (!t) return;
    touchRef.current = { x: t.clientX, y: t.clientY, swiped: false };
  };
  const onTouchEnd = (e) => {
    const t = e.changedTouches?.[0];
    if (!t) return;
    const dx = t.clientX - touchRef.current.x;
    const dy = t.clientY - touchRef.current.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      touchRef.current.swiped = true;
      if (dx < 0) goNext(); else goPrev();
    }
  };
  const openDetail = (metric) => {
    if (touchRef.current.swiped) { touchRef.current.swiped = false; return; }
    setDetailMetric(metric);
  };

  if (!isAppleHealthSupported() || (!loading && !connected && days.length === 0)) {
    return null;
  }

  const showSkeleton = parentLoading || loading;

  const metricCell = (label, value, unit, metricId) => (
    <button
      type="button"
      onClick={() => openDetail(metricId)}
      style={{ background: 'none', border: 'none', padding: 0, textAlign: 'center', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
    >
      <div style={{ fontSize: 10, color: '#6B7280' }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: '#111827' }}>
        {value ?? '—'}
        {value != null && unit && <span style={{ fontSize: 10, fontWeight: 500 }}> {unit}</span>}
      </div>
    </button>
  );

  return (
    <>
      <GlassCard style={{ padding: '14px 16px' }} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Heart size={16} color="#F43F5E" />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>Apple Health</span>
          {row?.date && (
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 2 }}>
              <button
                type="button"
                onClick={goPrev}
                disabled={!canPrev}
                style={{ background: 'none', border: 'none', padding: 2, color: canPrev ? '#6B7280' : '#E5E7EB', WebkitTapHighlightColor: 'transparent' }}
              >
                <ChevronLeft size={14} />
              </button>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', minWidth: 64, textAlign: 'center' }}>
                {fmtDayLabel(row.date)}
              </span>
              <button
                type="button"
                onClick={goNext}
                disabled={!canNext}
                style={{ background: 'none', border: 'none', padding: 2, color: canNext ? '#6B7280' : '#E5E7EB', WebkitTapHighlightColor: 'transparent' }}
              >
                <ChevronRight size={14} />
              </button>
            </span>
          )}
        </div>
        {showSkeleton ? (
          <NativeSkeletonRows rows={1} height={48} />
        ) : !row ? (
          <p style={{ fontSize: 12, color: '#6B7280', margin: 0 }}>
            Connect Apple Health in Settings to see resting HR, sleep and HRV.
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6 }}>
            {metricCell('Resting HR', row.restingHeartRate, 'bpm', 'rhr')}
            {metricCell('Low HR', row.sleepingHeartRate, 'bpm', 'lowhr')}
            {metricCell('Sleep', row.sleepMinutes > 0 ? fmtSleep(row.sleepMinutes) : null, null, 'sleep')}
            {metricCell('HRV', row.hrvMs, 'ms', 'hrv')}
          </div>
        )}
      </GlassCard>
      <WellnessDetailSheet
        open={Boolean(detailMetric)}
        initialMetric={detailMetric || 'sleep'}
        onClose={() => setDetailMetric(null)}
      />
    </>
  );
}
