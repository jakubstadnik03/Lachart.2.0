import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  SportTile, LacValueChip, ThresholdChip, KpiTile, GlassCard, SectionTitle,
  normSport, SPORT_TINT,
} from '../components/native/shared/Tiles';
import api, { getTestingsByAthleteId } from '../services/api';
import { useAthleteSelection } from '../context/AthleteSelectionContext';
import {
  NATIVE_DASHBOARD_KEYFRAMES, cardEntry,
} from '../components/NativeDashboard/animations';

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtPace(secPerKm) {
  if (!secPerKm || !Number.isFinite(secPerKm) || secPerKm <= 0) return '—';
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}/km`;
}

function fmtDuration(secs) {
  if (!secs) return '0m';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function isPaceSport(s) { return s === 'run' || s === 'swim'; }

// Lightweight threshold extraction (mirrors ThresholdHistory.jsx)
function extractThresholds(test) {
  if (!test) return null;
  const sport = normSport(test.sport);
  const isPace = isPaceSport(sport);
  const ov = test.thresholdOverrides || {};
  let lt1 = ov.LTP1 != null ? Number(ov.LTP1) : null;
  let lt2 = ov.LTP2 != null ? Number(ov.LTP2) : null;
  let lt1Lac = ov.LTP1_lactate != null ? Number(ov.LTP1_lactate) : null;
  let lt2Lac = ov.LTP2_lactate != null ? Number(ov.LTP2_lactate) : null;

  const pts = (Array.isArray(test.results) ? test.results : [])
    .map(r => ({
      x: Number(String(r.power ?? r.interval ?? '').replace(',', '.')),
      y: Number(String(r.lactate ?? '').replace(',', '.')),
    }))
    .filter(p => Number.isFinite(p.x) && p.x > 0 && Number.isFinite(p.y) && p.y > 0);

  if (pts.length >= 3) {
    pts.sort((a, b) => isPace ? b.x - a.x : a.x - b.x);
    const base = Number(test.baseLactate) || pts[0]?.y || 1.0;
    const lt1Target = base + 1.5;
    const lt2Target = Math.max(4.0, base + 3.0);
    const interp = (target) => {
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        if ((a.y - target) * (b.y - target) <= 0) {
          const t = (target - a.y) / (b.y - a.y || 1);
          return Math.round((a.x + t * (b.x - a.x)) * 10) / 10;
        }
      }
      return null;
    };
    if (lt1 == null) { lt1 = interp(lt1Target); lt1Lac = lt1Lac ?? lt1Target; }
    if (lt2 == null) { lt2 = interp(lt2Target) ?? interp(4.0); lt2Lac = lt2Lac ?? 4.0; }
  }

  return { sport, isPace, lt1, lt2, lt1Lac, lt2Lac };
}

// ─── component ────────────────────────────────────────────────────────────────

export default function NativeProfilePage({ user, userInfo, calendarData = [] }) {
  const navigate = useNavigate();
  // Logged-in user (coach or athlete)
  const me = userInfo || user || {};
  const myId = String(me._id || me.id || '');
  const isCoachLike = ['coach', 'admin', 'tester', 'testing'].includes(me.role);

  // When a coach has an athlete selected via NativeAthleteBar, view that athlete.
  // Athletes always view their own profile.
  const { selectedAthleteId } = useAthleteSelection();
  const effectiveAthleteId = isCoachLike && selectedAthleteId
    ? String(selectedAthleteId)
    : myId;
  const isViewingOtherAthlete = effectiveAthleteId && effectiveAthleteId !== myId;

  // Loaded athlete profile (only fetched when coach is viewing another athlete).
  // For the logged-in-self case, we just use `userInfo` straight from props.
  const [athleteProfile, setAthleteProfile] = useState(null);
  useEffect(() => {
    if (!isViewingOtherAthlete) { setAthleteProfile(null); return; }
    let active = true;
    api.get(`/user/athlete/${effectiveAthleteId}`)
      .then(res => { if (active) setAthleteProfile(res?.data || null); })
      .catch(() => { if (active) setAthleteProfile(null); });
    return () => { active = false; };
  }, [isViewingOtherAthlete, effectiveAthleteId]);

  // Display profile = the loaded athlete profile (when coach is viewing other),
  // otherwise the logged-in-self info.
  const u = (isViewingOtherAthlete && athleteProfile) ? athleteProfile : me;

  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);

  // Load tests for the EFFECTIVE athlete — auto-reloads when coach switches
  useEffect(() => {
    if (!effectiveAthleteId) { setLoading(false); return; }
    let active = true;
    setLoading(true);
    getTestingsByAthleteId(effectiveAthleteId)
      .then(data => { if (active) setTests(Array.isArray(data) ? data : (data?.data || [])); })
      .catch(() => { if (active) setTests([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [effectiveAthleteId]);

  // ── Aggregate stats by sport from calendarData ─────────────────────────────
  const stats = useMemo(() => {
    const out = { totalSecs: 0, totalDist: 0, sessions: calendarData.length, bySport: {} };
    for (const a of calendarData) {
      const s = normSport(a.sport);
      const secs = Number(a.totalTime || a.duration || a.movingTime || 0);
      const dist = Number(a.distance || 0);
      out.totalSecs += secs;
      out.totalDist += dist;
      if (!out.bySport[s]) out.bySport[s] = { secs: 0, dist: 0, count: 0 };
      out.bySport[s].secs  += secs;
      out.bySport[s].dist  += dist;
      out.bySport[s].count += 1;
    }
    return out;
  }, [calendarData]);

  // ── Group tests by sport, newest first ─────────────────────────────────────
  const testsBySport = useMemo(() => {
    const m = {};
    for (const t of tests) {
      const sp = normSport(t.sport);
      if (sp === 'other') continue;
      if (!m[sp]) m[sp] = [];
      m[sp].push(t);
    }
    Object.keys(m).forEach(sp => {
      m[sp].sort((a, b) => new Date(b.date || b.testDate || 0) - new Date(a.date || a.testDate || 0));
    });
    return m;
  }, [tests]);

  // Scroll-snap so each card lands cleanly under the top bar when scrolling.
  // The page header is also a snap point so the very top is always reachable.
  const pageRef = useRef(null);
  useEffect(() => {
    const el = pageRef.current;
    if (!el) return;
    let node = el.parentElement;
    while (node && node !== document.body) {
      const cs = window.getComputedStyle(node);
      if (cs.overflowY === 'auto' || cs.overflowY === 'scroll') break;
      node = node.parentElement;
    }
    if (!node || node === document.body) return;
    const prev = {
      st: node.style.scrollSnapType,
      sp: node.style.scrollPaddingTop,
      sb: node.style.scrollBehavior,
    };
    node.style.scrollSnapType   = 'y proximity';
    node.style.scrollPaddingTop = '8px';
    node.style.scrollBehavior   = 'smooth';
    node.scrollTop = 0;
    return () => {
      node.style.scrollSnapType   = prev.st || '';
      node.style.scrollPaddingTop = prev.sp || '';
      node.style.scrollBehavior   = prev.sb || '';
    };
  }, []);
  const snap = { scrollSnapAlign: 'start', scrollSnapStop: 'normal' };

  // ── Display values ─────────────────────────────────────────────────────────
  const fullName  = `${u.name || u.firstName || ''}${u.surname ? ' ' + u.surname : ''}`.trim() || 'Athlete';
  const initials  = fullName.split(' ').map(s => s.charAt(0).toUpperCase()).slice(0, 2).join('') || 'A';
  const avatarUrl = u.profilePicture || u.avatar || null;
  const role      = u.role || 'Athlete';
  const ftp       = u.ftp || u.powerZones?.cycling?.lt2 || null;
  const restingHR = u.restingHR || u.restingHeartRate || null;
  const maxHR     = u.maxHR || u.maxHeartRate || null;
  const weight    = u.weight || null;

  const sportsActive = Object.keys(stats.bySport)
    .filter(s => stats.bySport[s].count > 0 && s !== 'other')
    .sort((a, b) => stats.bySport[b].count - stats.bySport[a].count);

  return (
    <>
      <style>{NATIVE_DASHBOARD_KEYFRAMES}</style>
      <div ref={pageRef} style={styles.page}>
        {/* "Viewing athlete" indicator — only when coach is viewing another athlete */}
        {isViewingOtherAthlete && (
          <div style={{
            margin: '6px 14px 0',
            padding: '6px 12px', borderRadius: 9999,
            background: 'rgba(118,126,181,.14)',
            border: '1px solid rgba(118,126,181,.22)',
            color: '#5E6590',
            fontSize: 10.5, fontWeight: 700,
            letterSpacing: '0.04em', textTransform: 'uppercase',
            display: 'inline-flex', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
            animation: 'ndPopIn .4s cubic-bezier(.22,1.4,.36,1) both',
          }}>
            {/* Eye icon — "Viewing athlete" */}
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Viewing athlete
          </div>
        )}

        {/* ─── Header — avatar + name + role ─── */}
        <div style={{ ...styles.header, ...cardEntry(0), ...snap }}>
          <div style={styles.avatar}>
            {avatarUrl
              ? <img src={avatarUrl} alt={fullName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>{initials}</span>}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={styles.name}>{fullName}</div>
            <div style={styles.role}>{role.charAt(0).toUpperCase() + role.slice(1)}</div>
            {/* Sport icon row */}
            {sportsActive.length > 0 && !isViewingOtherAthlete && (
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                {sportsActive.slice(0, 3).map(s => (
                  <SportTile key={s} sport={s} size={20} />
                ))}
              </div>
            )}
          </div>
          {/* Edit button only on own profile (coaches edit athletes elsewhere) */}
          {!isViewingOtherAthlete && (
            <button
              onClick={() => navigate('/profile-edit')}
              onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(.94)'; }}
              onMouseUp={(e)   => { e.currentTarget.style.transform = ''; }}
              onMouseLeave={(e)=> { e.currentTarget.style.transform = ''; }}
              onTouchStart={(e)=> { e.currentTarget.style.transform = 'scale(.94)'; }}
              onTouchEnd={(e)  => { e.currentTarget.style.transform = ''; }}
              style={styles.editBtn}
            >
              Edit
            </button>
          )}
        </div>

        <div style={styles.body}>
          {/* ─── Athlete metrics ─── */}
          <div style={{ ...cardEntry(1), ...snap }}>
            <GlassCard>
              <div style={{ marginBottom: 9 }}>
                <SectionTitle>Athlete profile</SectionTitle>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 7 }}>
                {[
                  { label: 'FTP',     value: ftp ? `${Math.round(ftp)} W` : '—' },
                  { label: 'Max HR',  value: maxHR ? `${maxHR} bpm` : '—' },
                  { label: 'Rest HR', value: restingHR ? `${restingHR} bpm` : '—' },
                  { label: 'Weight',  value: weight ? `${weight} kg` : '—' },
                ].map(({ label, value }, idx) => (
                  <div key={label} style={{ animation: `ndPopIn .45s ${idx * 60}ms cubic-bezier(.22,1.4,.36,1) both` }}>
                    <KpiTile label={label} value={value} />
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>

          {/* ─── Activity summary ─── */}
          {/* Activity stats only when viewing OWN profile —
              calendarData prop is always the logged-in user's data */}
          {!isViewingOtherAthlete && calendarData.length > 0 && (
            <div style={{ ...cardEntry(2), ...snap }}>
              <GlassCard>
                <div style={{ marginBottom: 9 }}>
                  <SectionTitle>All activity</SectionTitle>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 7, marginBottom: 11 }}>
                  <KpiTile label="Sessions" value={stats.sessions} />
                  <KpiTile label="Time"     value={fmtDuration(stats.totalSecs)} />
                  <KpiTile label="Distance" value={stats.totalDist >= 1000 ? `${Math.round(stats.totalDist / 1000)} km` : `${Math.round(stats.totalDist)} m`} />
                </div>

                {/* Per-sport breakdown */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {sportsActive.map((s, idx) => {
                    const v = stats.bySport[s];
                    const tint = SPORT_TINT[s];
                    return (
                      <div
                        key={s}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 9,
                          padding: '7px 9px', borderRadius: 11,
                          background: 'rgba(255,255,255,.45)',
                          border: '1px solid rgba(118,126,181,.14)',
                          animation: `ndFadeIn .4s ${idx * 60}ms cubic-bezier(.22,1,.36,1) both`,
                        }}
                      >
                        <SportTile sport={s} size={28} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#0A0E1A', textTransform: 'capitalize' }}>{s}</div>
                          <div style={{ fontSize: 10.5, color: '#6B7280', marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>
                            {v.count} session{v.count !== 1 ? 's' : ''} · {fmtDuration(v.secs)} · {v.dist >= 1000 ? `${Math.round(v.dist / 1000)} km` : `${Math.round(v.dist)} m`}
                          </div>
                        </div>
                        <span style={{
                          fontSize: 10.5, fontWeight: 700,
                          padding: '3px 8px', borderRadius: 9999,
                          background: tint + '18', color: tint,
                        }}>
                          {Math.round((v.secs / (stats.totalSecs || 1)) * 100)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </GlassCard>
            </div>
          )}

          {/* ─── Lab tests by sport ─── */}
          <div style={{ ...cardEntry(3), ...snap }}>
            <GlassCard>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: 11,
              }}>
                <SectionTitle>Lab tests</SectionTitle>
                {tests.length > 0 && (
                  <button
                    onClick={() => navigate('/testing')}
                    onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(.94)'; }}
                    onMouseUp={(e)   => { e.currentTarget.style.transform = ''; }}
                    onMouseLeave={(e)=> { e.currentTarget.style.transform = ''; }}
                    style={styles.linkBtn}
                  >
                    View all →
                  </button>
                )}
              </div>

              {loading && tests.length === 0 ? (
                <div style={{ padding: '14px 0', textAlign: 'center', color: '#9CA3AF', fontSize: 12 }}>
                  Loading…
                </div>
              ) : tests.length === 0 ? (
                <div style={{ padding: '14px 0', textAlign: 'center', color: '#9CA3AF', fontSize: 12, fontWeight: 600 }}>
                  No lab tests yet
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {Object.keys(testsBySport).map((sp, idx) => {
                    const last = testsBySport[sp][0];
                    const th = extractThresholds(last);
                    const date = new Date(last.date || last.testDate || 0);
                    const dateStr = date.toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' });
                    const count = testsBySport[sp].length;
                    const tint = SPORT_TINT[sp];
                    return (
                      <button
                        key={sp}
                        onClick={() => navigate(`/testing?testId=${encodeURIComponent(last._id || last.id)}`)}
                        onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(.985)'; }}
                        onMouseUp={(e)   => { e.currentTarget.style.transform = ''; }}
                        onMouseLeave={(e)=> { e.currentTarget.style.transform = ''; }}
                        onTouchStart={(e)=> { e.currentTarget.style.transform = 'scale(.985)'; }}
                        onTouchEnd={(e)  => { e.currentTarget.style.transform = ''; }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          width: '100%', padding: '10px 11px', borderRadius: 13,
                          background: 'rgba(255,255,255,.55)',
                          border: '1px solid rgba(255,255,255,.6)',
                          borderLeft: `3px solid ${tint}`,
                          textAlign: 'left',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          animation: `ndFadeIn .4s ${idx * 70}ms cubic-bezier(.22,1,.36,1) both`,
                          transition: 'transform .15s ease',
                          WebkitTapHighlightColor: 'transparent',
                        }}
                      >
                        <SportTile sport={sp} size={36} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#0A0E1A', textTransform: 'capitalize' }}>
                            {sp} test
                          </div>
                          <div style={{ fontSize: 10.5, color: '#6B7280', marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>
                            {dateStr} · {count} test{count !== 1 ? 's' : ''}
                          </div>
                          {/* LT chips inline */}
                          {th && (th.lt1 != null || th.lt2 != null) && (
                            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                              {th.lt1 != null && (
                                <ThresholdChip label="LT1" value={th.lt1} unit={th.isPace ? '' : 'W'} color="#4BA87D" />
                              )}
                              {th.lt2 != null && (
                                <ThresholdChip label="LT2" value={th.lt2} unit={th.isPace ? '' : 'W'} color="#E05347" />
                              )}
                            </div>
                          )}
                          {/* Pace label override for run/swim */}
                          {th?.isPace && (th.lt1 != null || th.lt2 != null) && (
                            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                              {th.lt1 != null && (
                                <span style={{ fontSize: 10.5, color: '#4BA87D', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                                  LT1 {fmtPace(th.lt1)}
                                </span>
                              )}
                              {th.lt2 != null && (
                                <span style={{ fontSize: 10.5, color: '#E05347', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                                  · LT2 {fmtPace(th.lt2)}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <span style={{ fontSize: 14, color: '#9CA3AF', flexShrink: 0 }}>›</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Latest lactate values, if any */}
              {(() => {
                const newest = tests.slice().sort((a, b) =>
                  new Date(b.date || b.testDate || 0) - new Date(a.date || a.testDate || 0))[0];
                if (!newest) return null;
                const th = extractThresholds(newest);
                if (!th || (th.lt1Lac == null && th.lt2Lac == null)) return null;
                return (
                  <div style={{ display: 'flex', gap: 8, marginTop: 11 }}>
                    {th.lt1Lac != null && (
                      <LacValueChip label="LT1" value={th.lt1Lac} color="#4BA87D" />
                    )}
                    {th.lt2Lac != null && (
                      <LacValueChip label="LT2" value={th.lt2Lac} color="#E05347" />
                    )}
                  </div>
                );
              })()}
            </GlassCard>
          </div>

          <div style={{ height: 16 }} />
        </div>
      </div>
    </>
  );
}

const styles = {
  page: {
    display: 'flex', flexDirection: 'column', minHeight: '100%',
    background: 'linear-gradient(160deg, #EEF0F4 0%, #E8EAF0 100%)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '22px 18px 10px',
  },
  avatar: {
    width: 56, height: 56, borderRadius: '50%',
    background: 'linear-gradient(160deg,#5E6590,#767EB5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', flexShrink: 0,
    boxShadow: '0 4px 12px -4px rgba(94,101,144,.4)',
  },
  name: {
    fontSize: 19, fontWeight: 800, color: '#0A0E1A',
    letterSpacing: '-0.02em', lineHeight: 1.2,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  role: {
    fontSize: 11, fontWeight: 600, color: '#6B7280',
    marginTop: 1, textTransform: 'capitalize',
  },
  editBtn: {
    fontFamily: 'inherit', cursor: 'pointer',
    fontSize: 11, fontWeight: 700,
    padding: '6px 14px', borderRadius: 9999,
    background: 'rgba(255,255,255,.65)',
    border: '1px solid rgba(118,126,181,.2)',
    color: '#5E6590',
    transition: 'transform .12s ease',
    WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
    flexShrink: 0,
  },
  body: {
    flex: 1,
    padding: '8px 14px 0',
    display: 'flex', flexDirection: 'column', gap: 10,
  },
  linkBtn: {
    background: 'none', border: 'none',
    fontFamily: 'inherit', fontSize: 11, fontWeight: 700,
    color: '#767EB5', cursor: 'pointer', padding: 0,
    transition: 'transform .12s ease',
    WebkitTapHighlightColor: 'transparent',
  },
};
