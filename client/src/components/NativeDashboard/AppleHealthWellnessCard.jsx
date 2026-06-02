import React, { useEffect, useState } from 'react';
import { Heart } from 'lucide-react';
import { GlassCard, NativeSkeletonRows } from '../native/shared/Tiles';
import { getAppleHealthWellness } from '../../services/api';
import { isAppleHealthSupported } from '../../services/appleHealthCapacitor';

function fmtSleep(mins) {
  if (!mins || mins <= 0) return '—';
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

export default function AppleHealthWellnessCard({ loading: parentLoading = false }) {
  const [loading, setLoading] = useState(true);
  const [latest, setLatest] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!isAppleHealthSupported()) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await getAppleHealthWellness({ days: 3 });
        if (cancelled) return;
        setConnected(Boolean(data?.connected));
        const days = data?.days || [];
        setLatest(days.length ? days[days.length - 1] : null);
      } catch {
        if (!cancelled) setLatest(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!isAppleHealthSupported() || (!loading && !connected && !latest)) {
    return null;
  }

  const showSkeleton = parentLoading || loading;

  return (
    <GlassCard style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Heart size={16} color="#F43F5E" />
        <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>Apple Health</span>
        {latest?.date && (
          <span style={{ marginLeft: 'auto', fontSize: 10, color: '#9CA3AF' }}>{latest.date}</span>
        )}
      </div>
      {showSkeleton ? (
        <NativeSkeletonRows rows={1} height={48} />
      ) : !latest ? (
        <p style={{ fontSize: 12, color: '#6B7280', margin: 0 }}>
          Connect Apple Health in Settings to see resting HR, sleep and HRV.
        </p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
          <div>
            <div style={{ fontSize: 10, color: '#6B7280' }}>Resting HR</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#111827' }}>
              {latest.restingHeartRate ?? '—'}
              {latest.restingHeartRate != null && <span style={{ fontSize: 10, fontWeight: 500 }}> bpm</span>}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#6B7280' }}>Sleep</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#111827' }}>{fmtSleep(latest.sleepMinutes)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#6B7280' }}>HRV</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#111827' }}>
              {latest.hrvMs ?? '—'}
              {latest.hrvMs != null && <span style={{ fontSize: 10, fontWeight: 500 }}> ms</span>}
            </div>
          </div>
        </div>
      )}
    </GlassCard>
  );
}
