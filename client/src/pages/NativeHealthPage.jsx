/**
 * NativeHealthPage - the phone version of HealthPage.
 *
 * Same ground as the desktop page: what is open, today's verdict for each, what
 * the ceiling is, what unlocks the next stage, and the history of what has
 * already been dealt with. The chart under an open episode is the point of the
 * whole screen - symptom trend against training load on one time axis is what
 * makes an athlete see for themselves that the flare-up followed the volume
 * jump by two days.
 *
 * Rendered by HealthPage when running inside the Capacitor shell.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import useNativeTabScrollToTop from '../hooks/useNativeTabScrollToTop';
import { GlassCard, NativeSkeletonCard } from '../components/native/shared/Tiles';
import { NATIVE_DASHBOARD_KEYFRAMES, cardEntry } from '../components/NativeDashboard/animations';
import {
  fetchHealthCatalog, fetchHealthToday, fetchEpisodes, fetchCheckIns, updateEpisode,
  advanceStage, stepBackStage, markSpeedStepCleared,
  deleteEpisode, setStage, todayKey,
  LIGHT_COLORS, LIGHT_LABELS, loadResponseHeadline,
  formatDistance, formatDuration, formatPace,
} from '../services/healthApi';
import SymptomLoadChart from '../components/Health/SymptomLoadChart';
import { EpisodeProgressPanel } from '../components/Health/ReturnProgressChart';
import NativeCheckInSheet from '../components/Health/NativeCheckInSheet';
import NativeNewEpisodeSheet from '../components/Health/NativeNewEpisodeSheet';

/** Other health surfaces refetch on this rather than polling. */
export const HEALTH_CHANGED_EVENT = 'health:changed';

/** Tag on our own broadcasts so this page does not reload twice for one change. */
const EVENT_SOURCE = 'native-health-page';

export default function NativeHealthPage({ user, athleteId: externalAthleteId }) {
  useNativeTabScrollToTop('health');

  // Coaches viewing an athlete pass that athlete's id; an athlete viewing their
  // own page passes nothing, and the server infers it from the token.
  const athleteId = externalAthleteId && String(externalAthleteId) !== String(user?._id)
    ? externalAthleteId
    : null;

  const [catalog, setCatalog] = useState({ catalog: [], bodySites: [], functionalTests: {} });
  const [items, setItems] = useState([]);
  const [past, setPast] = useState([]);
  const [checkInsByEpisode, setCheckInsByEpisode] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [checkInTarget, setCheckInTarget] = useState(null);

  const pageRef = useRef(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [cat, open, all] = await Promise.all([
        fetchHealthCatalog(),
        fetchHealthToday(athleteId),
        fetchEpisodes({ athleteId, status: 'resolved,recurred' }),
      ]);
      setCatalog(cat);
      setItems(open);
      setPast(all);

      const series = {};
      await Promise.all(open.map(async (it) => {
        try {
          series[it.episode._id] = await fetchCheckIns(it.episode._id, 90);
        } catch {
          series[it.episode._id] = [];
        }
      }));
      setCheckInsByEpisode(series);
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Could not load');
    } finally {
      setLoading(false);
    }
  }, [athleteId]);

  useEffect(() => { load(); }, [load]);

  // Anything that changed an episode elsewhere in the app (a check-in from the
  // dashboard card, say) has to land here too - the verdict is the whole point.
  useEffect(() => {
    const onChanged = (e) => {
      if (e?.detail?.source === EVENT_SOURCE) return;
      load();
    };
    window.addEventListener(HEALTH_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(HEALTH_CHANGED_EVENT, onChanged);
  }, [load]);

  // Coming in from a scrolled dashboard should not land mid-page.
  useEffect(() => {
    const scroller = document.getElementById('nl-content-scroll');
    if (scroller) scroller.scrollTop = 0;
  }, []);

  const reload = useCallback(() => {
    load();
    window.dispatchEvent(new CustomEvent(HEALTH_CHANGED_EVENT));
  }, [load]);

  const resolveEpisode = async (episodeId) => {
    await updateEpisode(episodeId, {
      status: 'resolved',
      endDate: new Date().toISOString().slice(0, 10),
    });
    reload();
  };

  const openCount = items.length;

  return (
    <>
      <style>{NATIVE_DASHBOARD_KEYFRAMES}</style>
      <div ref={pageRef} style={styles.page}>
        {/* ─── Header ─── */}
        <div style={{ ...styles.header, ...cardEntry(0) }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={styles.title}>Health</div>
            <div style={styles.subtitle}>
              {loading
                ? 'Loading…'
                : openCount === 0
                  ? 'Nothing open'
                  : `${openCount} open · injuries, illness and getting back`}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowNew(true)}
            onTouchStart={(e) => { e.currentTarget.style.transform = 'scale(.94)'; }}
            onTouchEnd={(e) => { e.currentTarget.style.transform = ''; }}
            style={styles.newBtn}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Log
          </button>
        </div>

        <div style={styles.body}>
          {error && (
            <div style={{ ...cardEntry(0), ...styles.errorBox }}>{error}</div>
          )}

          {loading && (
            <>
              <NativeSkeletonCard rows={3} style={cardEntry(0)} />
              <NativeSkeletonCard rows={2} style={cardEntry(1)} />
            </>
          )}

          {!loading && openCount === 0 && (
            <div style={cardEntry(0)}>
              <GlassCard style={{ padding: '26px 20px', textAlign: 'center' }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 14, margin: '0 auto 12px',
                  background: 'rgba(34,197,94,.10)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#0A0E1A' }}>
                  Nothing open, good
                </div>
                <p style={{ fontSize: 12.5, color: '#6B7280', lineHeight: 1.55, marginTop: 8 }}>
                  If something starts niggling, log it early. A niggle tracked from day one is a much
                  shorter story than one you notice three weeks in.
                </p>
                <button
                  type="button"
                  onClick={() => setShowNew(true)}
                  style={{
                    marginTop: 16, width: '100%',
                    padding: '13px 16px', borderRadius: 13,
                    background: '#5E6590', border: '1px solid #5E6590', color: '#fff',
                    fontFamily: 'inherit', fontSize: 13.5, fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px -4px rgba(94,101,144,.5)',
                    WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
                  }}
                >
                  Log an injury or illness
                </button>
              </GlassCard>
            </div>
          )}

          {!loading && items.map((item, i) => (
            <div key={item.episode._id} style={cardEntry(i + 1)}>
              <EpisodeBlock
                item={item}
                checkIns={checkInsByEpisode[item.episode._id] || []}
                onCheckIn={() => setCheckInTarget(item)}
                onChanged={reload}
                onResolve={() => resolveEpisode(item.episode._id)}
              />
            </div>
          ))}

          {!loading && past.length > 0 && (
            <div style={cardEntry(items.length + 1)}>
              <div style={{ ...styles.sectionLabel, margin: '6px 4px 6px' }}>History</div>
              <GlassCard style={{ padding: '4px 14px' }}>
                {past.map((ep, i) => {
                  const entry = catalog.catalog.find((c) => c.id === ep.catalogId);
                  const days = ep.endDate
                    ? Math.round((new Date(ep.endDate) - new Date(ep.startDate)) / 86400000)
                    : null;
                  return (
                    <div
                      key={ep._id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '11px 0',
                        borderTop: i === 0 ? 'none' : '1px solid rgba(118,126,181,.12)',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 13, fontWeight: 700, color: '#0A0E1A',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {entry?.shortLabel || entry?.label || ep.catalogId}
                          {ep.side !== 'n/a' ? ` · ${ep.side}` : ''}
                        </div>
                        <div style={{
                          fontSize: 11, color: '#6B7280', marginTop: 2,
                          fontVariantNumeric: 'tabular-nums',
                        }}>
                          {ep.startDate}
                          {ep.endDate ? ` → ${ep.endDate}` : ''}
                          {days != null ? ` · ${days} days` : ''}
                          {ep.stepBackCount > 0 ? ` · ${ep.stepBackCount} step-backs` : ''}
                        </div>
                      </div>
                      <span style={{
                        flexShrink: 0,
                        fontSize: 9.5, fontWeight: 800,
                        letterSpacing: '0.05em', textTransform: 'uppercase',
                        padding: '4px 9px', borderRadius: 9999,
                        background: 'rgba(118,126,181,.12)', color: '#5E6590',
                      }}>
                        {ep.status}
                      </span>
                    </div>
                  );
                })}
              </GlassCard>
            </div>
          )}

          <div style={{ height: 48 }} />
        </div>
      </div>

      {/* Sheets portal themselves into #app-modal-root, so they can sit here. */}
      <NativeNewEpisodeSheet
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={reload}
        catalog={catalog.catalog}
        bodySites={catalog.bodySites}
        athleteId={athleteId}
      />

      {/* Keyed on the episode so switching targets starts from a clean form. */}
      {checkInTarget && (
        <NativeCheckInSheet
          key={checkInTarget.episode._id}
          open
          onClose={() => setCheckInTarget(null)}
          onSaved={reload}
          episode={checkInTarget.episode}
          catalogEntry={checkInTarget.catalogEntry}
          functionalTests={catalog.functionalTests}
        />
      )}
    </>
  );
}

// ── One open episode ──────────────────────────────────────────────────────

function EpisodeBlock({ item, checkIns, onCheckIn, onChanged, onResolve }) {
  const { episode, catalogEntry, gate, checkedInToday } = item || {};
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);

  if (!episode || !catalogEntry) return null;

  const light = gate?.light || 'green';
  const colors = LIGHT_COLORS[light] || LIGHT_COLORS.green;
  const caps = gate?.caps;
  const stages = catalogEntry.stages || [];
  const stageIndex = episode.currentStageIndex ?? 0;
  const stage = stages[stageIndex];
  const dayNumber = Math.max(
    1,
    Math.round((Date.now() - new Date(`${episode.startDate}T00:00:00Z`)) / 86400000),
  );

  const run = async (fn, fallbackMessage) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      onChanged?.();
    } catch (e) {
      setActionError(e?.response?.data?.error || fallbackMessage);
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassCard style={{ padding: 0, overflow: 'hidden' }}>
      {/* Verdict. The tailwind tokens come from healthApi so the light means the
          same thing here as it does on the desktop card. */}
      <div
        className={`${colors.bg} ${colors.border}`}
        style={{ borderBottomWidth: 1, borderBottomStyle: 'solid', padding: '12px 14px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span className={colors.dot} style={{ width: 10, height: 10, borderRadius: 9999, flexShrink: 0 }} />
          <div className={colors.text} style={{ fontSize: 13, fontWeight: 800, minWidth: 0 }}>
            {LIGHT_LABELS[light]}
          </div>
          {!checkedInToday && (
            <span style={{
              marginLeft: 'auto', flexShrink: 0,
              fontSize: 9.5, fontWeight: 800,
              letterSpacing: '0.05em', textTransform: 'uppercase',
              padding: '4px 8px', borderRadius: 9999,
              background: 'rgba(255,255,255,.75)', color: '#6B7280',
            }}>
              No check-in
            </span>
          )}
        </div>

        {gate?.reasons?.length > 0 && (
          <div style={{ marginTop: 9, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {gate.reasons.slice(0, 3).map((r, i) => (
              <div key={`${r.id}-${i}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <svg
                  className={colors.text}
                  width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                  style={{ flexShrink: 0, marginTop: 1 }}
                >
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <div style={{ minWidth: 0 }}>
                  <div className={colors.text} style={{ fontSize: 12, fontWeight: 800 }}>{r.title}</div>
                  <div style={{ fontSize: 11.5, color: '#4B5563', lineHeight: 1.45, marginTop: 1 }}>
                    {r.body}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {gate?.requiresMedicalAttention && (
          <div style={{
            marginTop: 9, fontSize: 11.5, lineHeight: 1.45, color: '#B91C1C',
            background: 'rgba(255,255,255,.75)', borderRadius: 10, padding: '9px 11px',
          }}>
            This is not a training-load problem. Please get it looked at before your next session.
          </div>
        )}
      </div>

      <div style={{ padding: '12px 14px 14px' }}>
        {/* Identity */}
        <div style={{
          fontSize: 14, fontWeight: 800, color: '#0A0E1A',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {catalogEntry.shortLabel || catalogEntry.label}
          {episode.side && episode.side !== 'n/a' ? ` · ${episode.side}` : ''}
        </div>
        <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
          Day {dayNumber}
          {episode.isRecurrence && ' · repeat'}
          {episode.stepBackCount > 0
            && ` · ${episode.stepBackCount} step-back${episode.stepBackCount > 1 ? 's' : ''}`}
        </div>

        {/* Stage track */}
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {stages.map((s, i) => (
              <div
                key={s.id}
                style={{
                  flex: 1, height: 5, borderRadius: 9999,
                  background: i < stageIndex ? '#16A34A' : i === stageIndex ? '#2563EB' : '#E5E7EB',
                }}
              />
            ))}
          </div>
          <div style={{
            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
            gap: 8, marginTop: 7,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#0A0E1A', minWidth: 0 }}>
              {stage?.name}
              <span style={{ fontWeight: 600, color: '#9CA3AF' }}>
                {' '}· {stageIndex + 1}/{stages.length}
              </span>
            </div>
            {gate?.volumePctOfBaseline != null && (
              <div style={{
                fontSize: 11, color: '#6B7280', flexShrink: 0,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {gate.volumePctOfBaseline}% of pre-injury
              </div>
            )}
          </div>
        </div>

        {stage?.focus && (
          <div style={{
            marginTop: 10, fontSize: 12, lineHeight: 1.5, color: '#374151',
            background: 'rgba(118,126,181,.07)', borderRadius: 12, padding: '10px 12px',
          }}>
            {stage.focus}
          </div>
        )}

        <div style={{ marginTop: 8, fontSize: 11.5, color: '#6B7280', fontStyle: 'italic', lineHeight: 1.45 }}>
          {loadResponseHeadline(catalogEntry)}
        </div>

        {/* Today's ceiling */}
        {caps && (
          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
            <CapTile
              label="Weekly ceiling"
              value={
                caps.runningAllowed === false
                  ? 'No running'
                  : caps.weeklyDistanceCapM != null
                    ? formatDistance(caps.weeklyDistanceCapM)
                    : formatDuration(caps.weeklyDurationCapS)
              }
            />
            <CapTile
              label={caps.speedCapMps != null ? `Speed ceiling (${caps.speedCapPct}%)` : 'Sessions / week'}
              value={
                caps.speedCapMps != null
                  ? formatPace(caps.speedCapMps)
                  : (caps.maxSessionsPerWeek ?? '-')
              }
            />
            {caps.allowedZones?.length > 0 && (
              <CapTile
                label="Zones"
                value={
                  caps.allowedZones.length > 1
                    ? `${caps.allowedZones[0]}-${caps.allowedZones[caps.allowedZones.length - 1]}`
                    : String(caps.allowedZones[0])
                }
              />
            )}
          </div>
        )}

        {/* Speed ladder - muscle strains progress in speed, not volume. One rung
            per session with 48 h between, never two in a week. */}
        {stage?.speedProgression?.length > 0 && (
          <SpeedLadder
            ladder={stage.speedProgression}
            reached={episode.speedPctReached}
            busy={busy}
            onClear={() => run(() => markSpeedStepCleared(episode._id), 'Could not update')}
          />
        )}

        {/* What unlocks the next stage. Shown in full rather than collapsed into
            "not ready yet" - a visible "3 / 5 pain-free days" is what makes
            waiting feel like progress. */}
        {gate?.stageGate?.conditions?.length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 11, borderTop: '1px solid rgba(118,126,181,.14)' }}>
            <div style={styles.sectionLabel}>
              {gate.stageGate.met ? 'Ready for the next stage' : 'To unlock the next stage'}
            </div>
            <div style={{ marginTop: 6 }}>
              {gate.stageGate.conditions.map((c) => (
                <GateCondition key={c.id} condition={c} />
              ))}
            </div>
          </div>
        )}

        {gate?.stageGate?.isFinalStage && (
          <div style={{
            marginTop: 12, display: 'flex', alignItems: 'flex-start', gap: 8,
            fontSize: 11.5, lineHeight: 1.45, color: '#15803D',
            background: 'rgba(34,197,94,.08)', borderRadius: 12, padding: '10px 12px',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            Final stage - the episode closes itself once you have been clear for a few weeks.
          </div>
        )}

        {/* Volume and pace against the ceiling that applied at the time. Renders
            nothing until there are at least two weeks to compare. */}
        <div style={{ marginTop: 14 }}>
          <EpisodeProgressPanel episodeId={episode._id} unstyled />
        </div>

        {/* Symptom trend */}
        {checkIns.length > 1 && (
          <div style={{ marginTop: 14, paddingTop: 11, borderTop: '1px solid rgba(118,126,181,.14)' }}>
            <SymptomLoadChart checkIns={checkIns} catalogEntry={catalogEntry} />
          </div>
        )}

        {actionError && (
          <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600, color: '#B91C1C' }}>
            {actionError}
          </div>
        )}

        {/* Actions */}
        <button
          type="button"
          onClick={onCheckIn}
          style={{
            marginTop: 14, width: '100%',
            padding: '14px 16px', borderRadius: 14,
            background: checkedInToday ? 'rgba(118,126,181,.10)' : '#5E6590',
            border: `1px solid ${checkedInToday ? 'rgba(118,126,181,.25)' : '#5E6590'}`,
            color: checkedInToday ? '#5E6590' : '#fff',
            fontFamily: 'inherit', fontSize: 14, fontWeight: 800,
            cursor: 'pointer',
            boxShadow: checkedInToday ? 'none' : '0 4px 12px -4px rgba(94,101,144,.5)',
            WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
          }}
        >
          {checkedInToday ? 'Update check-in' : 'Check in'}
        </button>

        {(gate?.canAdvance || (gate?.stepBack && stageIndex > 0)) && (
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            {gate?.canAdvance && (
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => advanceStage(episode._id), 'Could not advance')}
                style={{
                  flex: 1,
                  padding: '12px 14px', borderRadius: 12,
                  background: '#16A34A', border: '1px solid #16A34A', color: '#fff',
                  fontFamily: 'inherit', fontSize: 13, fontWeight: 800,
                  cursor: 'pointer', opacity: busy ? 0.6 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
                }}
              >
                Next stage
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                </svg>
              </button>
            )}
            {gate?.stepBack && stageIndex > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={() => run(
                  () => stepBackStage(episode._id, gate?.reasons?.[0]?.title || 'Symptoms flared'),
                  'Could not step back',
                )}
                style={{
                  flex: 1,
                  padding: '12px 14px', borderRadius: 12,
                  background: 'rgba(245,158,11,.12)', border: '1px solid rgba(245,158,11,.35)',
                  color: '#B45309',
                  fontFamily: 'inherit', fontSize: 13, fontWeight: 800,
                  cursor: 'pointer', opacity: busy ? 0.6 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 14 4 9 9 4" /><path d="M20 20v-7a4 4 0 0 0-4-4H4" />
                </svg>
                Step back
              </button>
            )}
          </div>
        )}

        {gate?.stageGate?.isFinalStage && (
          <button
            type="button"
            onClick={onResolve}
            style={{
              marginTop: 8, width: '100%',
              padding: '12px 14px', borderRadius: 12,
              background: 'rgba(255,255,255,.6)', border: '1px solid rgba(118,126,181,.22)',
              color: '#5E6590',
              fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700,
              cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
            }}
          >
            Mark as fully resolved
          </button>
        )}

        <NativeEpisodeAdmin episode={episode} catalogEntry={catalogEntry} onChanged={onChanged} />
      </div>
    </GlassCard>
  );
}

/**
 * Delete, correct the start date, or jump to the right stage.
 *
 * The same three repairs the web card offers, because the phone is where an
 * injury actually gets logged, usually days after it started. Collapsed behind
 * a single row so it never competes with the check-in button, which is the one
 * thing this screen exists for.
 */
function NativeEpisodeAdmin({ episode, catalogEntry, onChanged }) {
  const [mode, setMode] = useState(null); // null | 'menu' | 'date' | 'stage' | 'delete'
  const [startDate, setStartDate] = useState(episode.startDate || todayKey());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setMode(null);
      onChanged?.();
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Did not work');
    } finally {
      setBusy(false);
    }
  };

  const rowStyle = {
    width: '100%', textAlign: 'left', padding: '11px 12px', borderRadius: 11,
    background: 'rgba(255,255,255,.55)', border: '1px solid rgba(118,126,181,.18)',
    fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#0A0E1A',
    cursor: 'pointer', WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
    marginBottom: 6,
  };

  if (!mode) {
    return (
      <button
        type="button"
        onClick={() => setMode('menu')}
        style={{
          marginTop: 8, width: '100%', padding: '10px 14px', borderRadius: 12,
          background: 'transparent', border: 'none', color: '#8A90B8',
          fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
          cursor: 'pointer', WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
        }}
      >
        Edit or delete
      </button>
    );
  }

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(118,126,181,.16)' }}>
      {mode === 'menu' && (
        <>
          <button type="button" style={rowStyle} onClick={() => setMode('date')}>
            Correct the start date
          </button>
          {(catalogEntry.stages || []).length > 1 && (
            <button type="button" style={rowStyle} onClick={() => setMode('stage')}>
              Set the current stage
            </button>
          )}
          <button
            type="button"
            style={{ ...rowStyle, color: '#B84238', borderColor: 'rgba(184,66,56,.28)' }}
            onClick={() => setMode('delete')}
          >
            Delete this episode
          </button>
          <button
            type="button"
            style={{ ...rowStyle, background: 'transparent', border: 'none', color: '#8A90B8', marginBottom: 0 }}
            onClick={() => setMode(null)}
          >
            Cancel
          </button>
        </>
      )}

      {mode === 'date' && (
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0A0E1A', marginBottom: 7 }}>
            When did it actually start?
          </div>
          <input
            type="date"
            value={startDate}
            max={todayKey()}
            onChange={(e) => setStartDate(e.target.value)}
            style={{
              width: '100%', fontSize: 14, padding: '10px 11px', borderRadius: 11,
              border: '1px solid rgba(118,126,181,.28)', background: 'rgba(255,255,255,.65)',
              color: '#0A0E1A', fontFamily: 'inherit',
            }}
          />
          <div style={{ fontSize: 11, color: '#6B7280', marginTop: 6, lineHeight: 1.4 }}>
            This recalculates your pre-injury baseline, since that is the eight weeks before onset.
          </div>
          {error && <div style={{ fontSize: 11.5, color: '#B84238', marginTop: 6 }}>{error}</div>}
          <NativeAdminButtons
            busy={busy}
            onCancel={() => setMode('menu')}
            onConfirm={() => run(() => updateEpisode(episode._id, { startDate }))}
            confirmLabel="Save"
          />
        </div>
      )}

      {mode === 'stage' && (
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0A0E1A', marginBottom: 7 }}>
            Which stage are you on?
          </div>
          {(catalogEntry.stages || []).map((s, i) => (
            <button
              key={s.id}
              type="button"
              disabled={busy}
              onClick={() => run(() => setStage(episode._id, i))}
              style={{
                ...rowStyle,
                background: i === episode.currentStageIndex ? 'rgba(118,126,181,.16)' : rowStyle.background,
              }}
            >
              {i + 1}. {s.name}
            </button>
          ))}
          {error && <div style={{ fontSize: 11.5, color: '#B84238', marginTop: 6 }}>{error}</div>}
          <button
            type="button"
            style={{ ...rowStyle, background: 'transparent', border: 'none', color: '#8A90B8', marginBottom: 0 }}
            onClick={() => setMode('menu')}
          >
            Cancel
          </button>
        </div>
      )}

      {mode === 'delete' && (
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0A0E1A' }}>Delete this episode?</div>
          <div style={{ fontSize: 11, color: '#6B7280', marginTop: 5, lineHeight: 1.4 }}>
            Its check-ins and its band on the calendar go with it. This cannot be undone.
          </div>
          {error && <div style={{ fontSize: 11.5, color: '#B84238', marginTop: 6 }}>{error}</div>}
          <NativeAdminButtons
            busy={busy}
            onCancel={() => setMode('menu')}
            onConfirm={() => run(() => deleteEpisode(episode._id))}
            confirmLabel="Delete"
            danger
          />
        </div>
      )}
    </div>
  );
}

function NativeAdminButtons({ busy, onCancel, onConfirm, confirmLabel, danger }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
      <button
        type="button"
        onClick={onCancel}
        style={{
          padding: '11px 14px', borderRadius: 11, background: 'transparent', border: 'none',
          color: '#8A90B8', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700,
          cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
        }}
      >
        Cancel
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={onConfirm}
        style={{
          flex: 1, padding: '11px 14px', borderRadius: 11, border: 'none',
          background: busy ? '#C7CBE0' : danger ? '#B84238' : '#767EB5',
          color: '#fff', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 800,
          cursor: 'pointer', WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
        }}
      >
        {busy ? 'Working...' : confirmLabel}
      </button>
    </div>
  );
}

// ── Small pieces ──────────────────────────────────────────────────────────

function CapTile({ label, value }) {
  return (
    <div style={{
      padding: '9px 11px', borderRadius: 12,
      background: 'rgba(255,255,255,.55)', border: '1px solid rgba(255,255,255,.7)',
    }}>
      <div style={{
        fontSize: 9, fontWeight: 800, color: '#6B7280',
        letterSpacing: '0.06em', textTransform: 'uppercase',
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 13.5, fontWeight: 800, color: '#0A0E1A', marginTop: 2,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </div>
    </div>
  );
}

function SpeedLadder({ ladder, reached, onClear, busy }) {
  const next = ladder.find((v) => v > (reached || 0));
  return (
    <div style={{ marginTop: 14, paddingTop: 11, borderTop: '1px solid rgba(118,126,181,.14)' }}>
      <div style={styles.sectionLabel}>Speed progression</div>
      <div style={{ display: 'flex', gap: 4, margin: '7px 0 9px' }}>
        {ladder.map((pct) => {
          const done = (reached || 0) >= pct;
          const isNext = pct === next;
          return (
            <div
              key={pct}
              style={{
                flex: 1, textAlign: 'center',
                padding: '6px 0', borderRadius: 8,
                fontSize: 10.5, fontWeight: 800,
                fontVariantNumeric: 'tabular-nums',
                background: done ? '#16A34A' : isNext ? '#DBEAFE' : '#F3F4F6',
                color: done ? '#fff' : isNext ? '#1D4ED8' : '#9CA3AF',
              }}
            >
              {pct}%
            </div>
          );
        })}
      </div>
      {next ? (
        <button
          type="button"
          onClick={onClear}
          disabled={busy}
          style={{
            width: '100%',
            padding: '12px 12px', borderRadius: 12,
            background: 'rgba(118,126,181,.08)', border: '1px solid rgba(118,126,181,.22)',
            color: '#5E6590',
            fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700,
            cursor: 'pointer', opacity: busy ? 0.6 : 1,
            WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
          }}
        >
          I completed {next}% pain-free, unlock the next step
        </button>
      ) : (
        <div style={{ fontSize: 12, fontWeight: 700, color: '#15803D' }}>Full speed cleared.</div>
      )}
    </div>
  );
}

function GateCondition({ condition }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '5px 0' }}>
      <span style={{
        width: 18, height: 18, borderRadius: 9999, flexShrink: 0, marginTop: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: condition.met ? '#16A34A' : 'rgba(118,126,181,.16)',
      }}>
        {condition.met && (
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.6">
            <path d="M2 6l3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12.5, lineHeight: 1.4,
          color: condition.met ? '#9CA3AF' : '#374151',
          textDecoration: condition.met ? 'line-through' : 'none',
        }}>
          {condition.label}
        </div>
        {condition.detail && (
          <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>{condition.detail}</div>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    display: 'flex', flexDirection: 'column', minHeight: '100%',
    background: 'linear-gradient(160deg, #EEF0F4 0%, #E8EAF0 100%)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 10,
    // Extra top padding so the title clears the NativeLayout top bar.
    padding: '22px 18px 10px',
  },
  title: {
    fontSize: 19, fontWeight: 800, color: '#0A0E1A',
    letterSpacing: '-0.02em', lineHeight: 1.25,
  },
  subtitle: {
    fontSize: 12, fontWeight: 600, color: '#6B7280', marginTop: 2,
  },
  newBtn: {
    fontFamily: 'inherit', cursor: 'pointer',
    fontSize: 11.5, fontWeight: 700,
    padding: '7px 12px', borderRadius: 9999,
    background: '#5E6590', color: '#fff',
    border: 'none',
    boxShadow: '0 2px 8px -2px rgba(94,101,144,.55)',
    display: 'inline-flex', alignItems: 'center', gap: 4,
    transition: 'transform .12s ease',
    WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
  },
  body: {
    flex: 1, padding: '8px 14px 0',
    display: 'flex', flexDirection: 'column', gap: 10,
  },
  sectionLabel: {
    fontSize: 10, fontWeight: 800, color: '#0A0E1A',
    letterSpacing: '0.06em', textTransform: 'uppercase',
  },
  errorBox: {
    fontSize: 12.5, lineHeight: 1.5, color: '#B91C1C',
    background: '#FEF2F2', border: '1px solid #FECACA',
    borderRadius: 14, padding: '11px 13px',
  },
};
