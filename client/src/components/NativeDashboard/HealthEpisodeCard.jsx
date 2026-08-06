/**
 * HealthEpisodeCard - the open injury or illness, on the native home dashboard.
 *
 * Renders nothing while the athlete is healthy, so it costs a healthy athlete no
 * screen space. It also deliberately renders WITHOUT the usual wrapper <div> the
 * other cards sit in: an empty wrapper is still a flex item, so it would burn a
 * 10px gap and leave a scroll-snap point with nothing in it. The page passes its
 * entry animation down through `style` instead.
 *
 * Read-only on purpose. Check-in, stage advances and step-backs all live on the
 * health page, so those decisions get made in one place rather than two.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronRight, HeartPulse } from 'lucide-react';
import { GlassCard, NativeSkeletonRows } from '../native/shared/Tiles';
import {
  fetchHealthToday,
  LIGHT_COLORS,
  LIGHT_LABELS,
  formatDistance,
  formatDuration,
  formatPace,
} from '../../services/healthApi';

const SEVERITY = { red: 3, amber: 2, green: 1 };

/** Worst light first - the red episode is the one that decides today. */
function bySeverity(a, b) {
  return (SEVERITY[b?.gate?.light] || 0) - (SEVERITY[a?.gate?.light] || 0);
}

// Remembering "this athlete had something open" lets us show a skeleton on the
// next mount instead of popping the card in late. Without the hint we render
// nothing until the fetch answers, because flashing a skeleton at a healthy
// athlete and then removing it reads as a bug.
const hintKey = (athleteId) => `health:hasOpen:${athleteId || 'self'}`;

function readHint(athleteId) {
  try { return sessionStorage.getItem(hintKey(athleteId)) === '1'; } catch { return false; }
}

function writeHint(athleteId, hasOpen) {
  try { sessionStorage.setItem(hintKey(athleteId), hasOpen ? '1' : '0'); } catch { /* private mode */ }
}

/** Today's ceiling, in the unit the sport is actually capped in. */
function ceilingValue(caps) {
  if (!caps) return '-';
  if (caps.runningAllowed === false) return 'No running';
  if (caps.weeklyDistanceCapM != null) return formatDistance(caps.weeklyDistanceCapM);
  if (caps.weeklyDurationCapS != null) return formatDuration(caps.weeklyDurationCapS);
  return '-';
}

function CeilingTile({ label, value }) {
  return (
    <div style={{ flex: 1, minWidth: 0, background: 'rgba(118,126,181,.06)', borderRadius: 12, padding: '7px 10px' }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 800, color: '#0A0E1A', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
    </div>
  );
}

export default function HealthEpisodeCard({
  athleteId = null,
  /** True while the dashboard itself is still fetching. */
  loading: parentLoading = false,
  style,
}) {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const open = await fetchHealthToday(athleteId);
      writeHint(athleteId, open.length > 0);
      return open;
    } catch {
      return [];
    }
  }, [athleteId]);

  useEffect(() => {
    let cancelled = false;
    // A coach switching athletes must not keep looking at the previous
    // athlete's injury while the new fetch is in flight.
    setLoaded(false);
    const run = async () => {
      const open = await load();
      if (cancelled) return;
      setItems(open);
      setLoaded(true);
    };
    run();
    // Pull-to-refresh never reaches children, so a check-in or an episode edit
    // anywhere in the app announces itself the same way Apple Health does.
    window.addEventListener('health:changed', run);
    return () => { cancelled = true; window.removeEventListener('health:changed', run); };
  }, [load]);

  // Hold the card back until our own fetch and the dashboard's first load have
  // both answered, so the stack fills in together instead of this card landing
  // on its own a beat early.
  if (!loaded || parentLoading) {
    // Only place a skeleton where we already know something is open, otherwise
    // the healthy case would flash a card that immediately disappears.
    if (!readHint(athleteId)) return null;
    return (
      <GlassCard style={{ padding: '14px 16px', ...style }}>
        <NativeSkeletonRows rows={2} />
      </GlassCard>
    );
  }

  if (items.length === 0) return null;

  const sorted = [...items].sort(bySeverity);
  const { episode, catalogEntry, gate, checkedInToday } = sorted[0];
  if (!episode || !catalogEntry) return null;

  const extra = sorted.length - 1;
  const light = gate?.light || 'green';
  const colors = LIGHT_COLORS[light] || LIGHT_COLORS.green;
  const reason = gate?.reasons?.[0] || null;
  const caps = gate?.caps;
  const stages = catalogEntry.stages || [];
  const stageIndex = episode.currentStageIndex ?? 0;
  const stage = stages[stageIndex];
  const side = episode.side && episode.side !== 'n/a' ? ` · ${episode.side}` : '';

  const openHealth = () => navigate('/health');

  return (
    <GlassCard
      style={{ padding: '14px 16px', cursor: 'pointer', WebkitTapHighlightColor: 'transparent', ...style }}
      onClick={openHealth}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <HeartPulse size={16} color="#F43F5E" />
        <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>Health</span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          {extra > 0 && (
            <span style={{ fontSize: 10.5, fontWeight: 800, color: '#5E6590', background: 'rgba(118,126,181,.12)', borderRadius: 8, padding: '3px 8px' }}>
              +{extra} more
            </span>
          )}
          <ChevronRight size={14} color="#9CA3AF" />
        </span>
      </div>

      {/* Verdict - the gate colours are the ones the health page already uses */}
      <div
        className={`${colors.bg} ${colors.border}`}
        style={{ borderWidth: 1, borderStyle: 'solid', borderRadius: 12, padding: '9px 11px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={colors.dot} style={{ width: 8, height: 8, borderRadius: 999, flexShrink: 0 }} />
          <span className={colors.text} style={{ fontSize: 12.5, fontWeight: 700 }}>{LIGHT_LABELS[light]}</span>
        </div>

        {reason && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, marginTop: 7 }}>
            <AlertTriangle size={13} className={colors.text} style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ minWidth: 0 }}>
              <div className={colors.text} style={{ fontSize: 11.5, fontWeight: 700 }}>{reason.title}</div>
              {reason.body && (
                <div style={{
                  fontSize: 11, color: '#6B7280', lineHeight: 1.35, marginTop: 1,
                  display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden',
                }}>
                  {reason.body}
                </div>
              )}
            </div>
          </div>
        )}

        {gate?.requiresMedicalAttention && (
          <div style={{ fontSize: 11, fontWeight: 600, color: '#B91C1C', marginTop: 7 }}>
            Get this looked at before your next session.
          </div>
        )}
      </div>

      {/* Which episode, and where it is in the protocol */}
      <div style={{ marginTop: 11 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: '#0A0E1A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {catalogEntry.shortLabel || catalogEntry.label}{side}
        </div>

        {stages.length > 0 && (
          <div style={{ display: 'flex', gap: 3, marginTop: 7 }}>
            {stages.map((s, i) => (
              <span
                key={s.id}
                style={{
                  flex: 1, height: 4, borderRadius: 999,
                  background: i < stageIndex ? '#16A34A' : i === stageIndex ? '#767EB5' : '#E5E7EB',
                }}
              />
            ))}
          </div>
        )}

        {(stage || gate?.volumePctOfBaseline != null) && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
            {stage && (
              <span style={{ fontSize: 11.5, fontWeight: 700, color: '#111827', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {stage.name}
                <span style={{ fontWeight: 500, color: '#9CA3AF' }}> · {stageIndex + 1}/{stages.length}</span>
              </span>
            )}
            {gate?.volumePctOfBaseline != null && (
              <span style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 10.5, color: '#6B7280', fontVariantNumeric: 'tabular-nums' }}>
                {gate.volumePctOfBaseline}% of pre-injury volume
              </span>
            )}
          </div>
        )}
      </div>

      {caps && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <CeilingTile label="Weekly ceiling" value={ceilingValue(caps)} />
          <CeilingTile
            label={caps.speedCapMps != null ? `Speed cap ${caps.speedCapPct}%` : 'Sessions / week'}
            value={caps.speedCapMps != null ? formatPace(caps.speedCapMps) : (caps.maxSessionsPerWeek ?? '-')}
          />
        </div>
      )}

      {!checkedInToday && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); openHealth(); }}
          style={{
            width: '100%', marginTop: 10, padding: '9px 0', borderRadius: 10, border: 'none',
            background: '#767EB5', color: '#fff', fontSize: 12.5, fontWeight: 800,
            fontFamily: 'inherit', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
          }}
        >
          Check in
        </button>
      )}
    </GlassCard>
  );
}
