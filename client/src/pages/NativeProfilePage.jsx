import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  SportTile, LacValueChip, ThresholdChip, KpiTile, GlassCard, SectionTitle,
  normSport, SPORT_TINT, NativeSkeletonRows,
} from '../components/native/shared/Tiles';
import api, { getTestingsByAthleteId, updateUserProfile, updateAthleteProfile } from '../services/api';
import { useAthleteSelection } from '../context/AthleteSelectionContext';
import {
  NATIVE_DASHBOARD_KEYFRAMES, cardEntry,
} from '../components/NativeDashboard/animations';
import EditProfileModal from '../components/Profile/EditProfileModal';
import { useNotification } from '../context/NotificationContext';
import { calculateZonesFromTest } from '../components/Testing-page/zoneCalculator';
import {
  extractLactateThresholds,
  formatThresholdIntensity,
  isPaceLactateSport,
} from '../utils/extractLactateThresholds';
import { formatActivityDistance } from '../utils/unitsConverter';
import { formatProfileFullName } from '../utils/profileName';

// ─── helpers ──────────────────────────────────────────────────────────────────

function isPaceSport(s) { return isPaceLactateSport(s); }

const extractThresholds = extractLactateThresholds;

function fmtDuration(secs) {
  if (!secs) return '0m';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ─── component ────────────────────────────────────────────────────────────────

export default function NativeProfilePage({ user, userInfo, calendarData = [], onProfileUpdated }) {
  const navigate = useNavigate();
  const { addNotification } = useNotification();
  // Inline profile-edit modal — previously the Edit button navigated to
  // /profile-edit which has no registered route, so nothing happened.
  const [isEditOpen, setIsEditOpen] = useState(false);
  const handleProfileUpdate = async (updatedData) => {
    try {
      await updateUserProfile({
        ...updatedData,
        name: updatedData.name?.trim() || '',
        surname: updatedData.surname?.trim() || '',
      });
      addNotification('Profile updated', 'success');
      setIsEditOpen(false);
      onProfileUpdated?.();
      window.dispatchEvent(new CustomEvent('lachart-user-updated'));
    } catch (err) {
      addNotification(
        err?.response?.data?.message || err?.message || 'Failed to update profile',
        'error',
      );
    }
  };
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
    // Hit the /profile variant so we receive powerZones + heartRateZones —
    // the bare /user/athlete/:id endpoint strips them, which is why FTP,
    // MAX HR and the training-zones panel read empty for coach-viewed athletes.
    api.get(`/user/athlete/${effectiveAthleteId}/profile`)
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
  const fullName  = formatProfileFullName(u);
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
        {/* "Viewing athlete" pill removed — the active avatar in the
            top NativeAthleteBar already signals which athlete you're
            looking at, so this was visual noise. */}

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
              onClick={() => setIsEditOpen(true)}
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
                  <KpiTile label="Distance" value={formatActivityDistance(stats.totalDist, user) || '0'} />
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
                            {v.count} session{v.count !== 1 ? 's' : ''} · {fmtDuration(v.secs)} · {formatActivityDistance(v.dist, user) || '0'}
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
                <div style={{ padding: '2px 0' }}>
                  <NativeSkeletonRows rows={3} />
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
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                              {th.lt1 != null && (
                                <ThresholdChip
                                  label="LT1"
                                  value={formatThresholdIntensity(th.lt1, last, sp)}
                                  unit=""
                                  color="#4BA87D"
                                />
                              )}
                              {th.lt2 != null && (
                                <ThresholdChip
                                  label="LT2"
                                  value={formatThresholdIntensity(th.lt2, last, sp)}
                                  unit=""
                                  color="#E05347"
                                />
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

          {/* ─── Training zones per sport (editable) ───
              Now visible to coaches viewing their athletes too — save flow
              routes through PUT /user/coach/edit-athlete/:id when an athleteId
              is supplied, so changes persist on the right user document. */}
          <div style={{ ...cardEntry(4), ...snap }}>
            <TrainingZonesSection
              user={u}
              tests={tests}
              athleteId={isViewingOtherAthlete ? effectiveAthleteId : null}
            />
          </div>

          <div style={{ height: 32 }} />
        </div>
      </div>

      {/* Profile edit modal — opens from the Edit button in the header.
          Routes to /user/edit-profile via updateUserProfile on submit. */}
      {isEditOpen && (
        <EditProfileModal
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
          onSubmit={handleProfileUpdate}
          userData={u}
        />
      )}
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

// ─── TrainingZonesSection — editable LT1/LT2/MaxHR per sport ─────────────────
// Shows the current power/pace + heart-rate zones derived from the user's
// thresholds for each sport. "Edit" expands an inline form where the user can
// override LT1, LT2 and MaxHR; on save we recompute the 5 zones and PUT the
// full powerZones + heartRateZones objects to the user via /user/edit-profile.

const ZONE_DEFS = [
  { key: 'zone1', label: 'Z1 Recovery',   color: '#60A5FA' },
  { key: 'zone2', label: 'Z2 Endurance',  color: '#34D399' },
  { key: 'zone3', label: 'Z3 Tempo',      color: '#FBBF24' },
  { key: 'zone4', label: 'Z4 Threshold',  color: '#F97316' },
  { key: 'zone5', label: 'Z5 VO2max',     color: '#F43F5E' },
];

// Server keys are 'cycling' / 'running' / 'swimming' but native pages use
// 'bike' / 'run' / 'swim'. Map both ways.
const SHORT_TO_LONG = { bike: 'cycling', run: 'running', swim: 'swimming' };

// Compute power/pace + HR zones from raw threshold inputs (mirrors zoneCalculator).
function computeZonesFromThresholds({ sport, lt1, lt2, hr1, hr2 }) {
  const v = (n) => Number.isFinite(Number(n)) && Number(n) > 0 ? Number(n) : null;
  const lt1v = v(lt1); const lt2v = v(lt2);
  const hr1v = v(hr1); const hr2v = v(hr2);
  const heartRateZones = (hr1v && hr2v) ? {
    zone1: { min: Math.round(hr1v * 0.50), max: Math.round(hr1v * 0.90) },
    zone2: { min: Math.round(hr1v * 0.90), max: Math.round(hr1v * 1.00) },
    zone3: { min: Math.round(hr1v * 1.00), max: Math.round(hr2v * 0.95) },
    zone4: { min: Math.round(hr2v * 0.96), max: Math.round(hr2v * 1.04) },
    zone5: { min: Math.round(hr2v * 1.05), max: Math.round(hr2v * 1.30) },
    maxHeartRate: Math.round(hr2v * 1.10),
  } : null;
  if (!lt1v || !lt2v) return { primary: null, heartRateZones };
  if (sport === 'bike') {
    return {
      primary: {
        zone1: { min: Math.round(lt1v * 0.50), max: Math.round(lt1v * 0.90) },
        zone2: { min: Math.round(lt1v * 0.90), max: Math.round(lt1v * 1.00) },
        zone3: { min: Math.round(lt1v * 1.00), max: Math.round(lt2v * 0.95) },
        zone4: { min: Math.round(lt2v * 0.96), max: Math.round(lt2v * 1.04) },
        zone5: { min: Math.round(lt2v * 1.05), max: Math.round(lt2v * 1.30) },
        lt1: lt1v, lt2: lt2v,
      },
      heartRateZones,
    };
  }
  // run / swim — pace seconds (smaller = faster)
  return {
    primary: {
      zone1: { min: Math.round(lt1v / 0.50), max: Math.round(lt1v / 0.90) },
      zone2: { min: Math.round(lt1v / 0.90), max: Math.round(lt1v / 1.00) },
      zone3: { min: Math.round(lt1v / 1.00), max: Math.round(lt2v / 0.95) },
      zone4: { min: Math.round(lt2v / 0.96), max: Math.round(lt2v / 1.04) },
      zone5: { min: Math.round(lt2v / 1.05), max: Math.round(lt2v / 1.10) },
      lt1: lt1v, lt2: lt2v,
    },
    heartRateZones,
  };
}

// Pick best initial threshold values: explicit user override → latest test extract.
function pickInitialThresholds(user, tests, sport) {
  const longKey = SHORT_TO_LONG[sport];
  const userPZ = user?.powerZones?.[longKey];
  const userHR = user?.heartRateZones?.[longKey];
  let lt1 = userPZ?.lt1 ?? null;
  let lt2 = userPZ?.lt2 ?? null;
  let hr1 = userHR?.lt1 ?? null;
  let hr2 = userHR?.lt2 ?? userHR?.maxHeartRate ?? null;
  if (lt1 == null || lt2 == null || hr1 == null || hr2 == null) {
    const sportTests = (tests || [])
      .filter(t => normSport(t?.sport) === sport)
      .sort((a, b) => new Date(b?.date || b?.testDate || 0) - new Date(a?.date || a?.testDate || 0));
    const latest = sportTests[0];
    if (latest) {
      const th = extractThresholds(latest);
      if (th) {
        if (lt1 == null) lt1 = th.lt1;
        if (lt2 == null) lt2 = th.lt2;
        if (hr1 == null) hr1 = th.lt1Hr;
        if (hr2 == null) hr2 = th.lt2Hr;
      }
    }
  }
  return { lt1, lt2, hr1, hr2 };
}

function fmtPaceVal(sec) {
  if (!sec) return '—';
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
}

function TrainingZonesSection({ user, tests, athleteId = null }) {
  const [openSport, setOpenSport] = useState(null); // 'bike' | 'run' | 'swim' | null
  const [overrides, setOverrides] = useState({});  // { bike: {primary, heartRateZones}, ... } — applied locally after save
  return (
    <GlassCard>
      <div style={{ marginBottom: 9 }}>
        <SectionTitle>{athleteId ? "Athlete's training zones" : 'Training zones'}</SectionTitle>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {['bike', 'run', 'swim'].map(sport => (
          <SportZonesBlock
            key={sport}
            sport={sport}
            user={user}
            tests={tests}
            athleteId={athleteId}
            override={overrides[sport]}
            isOpen={openSport === sport}
            onToggle={() => setOpenSport(prev => (prev === sport ? null : sport))}
            onSaved={(zones) => {
              setOverrides(prev => ({ ...prev, [sport]: zones }));
              setOpenSport(null);
            }}
          />
        ))}
      </div>
    </GlassCard>
  );
}

function SportZonesBlock({ sport, user, tests, athleteId = null, override, isOpen, onToggle, onSaved }) {
  const isPace = isPaceSport(sport);
  const tint = SPORT_TINT[sport];
  const initial = useMemo(() => pickInitialThresholds(user, tests, sport), [user, tests, sport]);

  const latestTest = useMemo(() => {
    const sportTests = (tests || [])
      .filter((t) => normSport(t?.sport) === sport)
      .sort((a, b) => new Date(b?.date || b?.testDate || 0) - new Date(a?.date || a?.testDate || 0));
    return sportTests[0] || null;
  }, [tests, sport]);

  const latestTh = useMemo(
    () => (latestTest ? extractThresholds(latestTest) : null),
    [latestTest],
  );

  const zonesFromLatestTest = useMemo(
    () => (latestTest ? calculateZonesFromTest(latestTest) : null),
    [latestTest],
  );

  // Prefer zones from the latest lab test when it is newer than saved profile zones.
  const display = useMemo(() => {
    if (override?.primary || override?.heartRateZones) return override;

    const longKey = SHORT_TO_LONG[sport];
    const userPZ = user?.powerZones?.[longKey];
    const userHR = user?.heartRateZones?.[longKey];
    const hasUserPrimary = userPZ?.zone1 && userPZ?.zone1.min != null;
    const hasUserHR = userHR?.zone1 && userHR?.zone1.min != null;

    const testDate = latestTest ? new Date(latestTest.date || latestTest.testDate || 0).getTime() : 0;
    const zonesUpdated = userPZ?.lastUpdated ? new Date(userPZ.lastUpdated).getTime() : 0;
    const preferTestZones = zonesFromLatestTest && (!hasUserPrimary || testDate > zonesUpdated);

    const packFromTest = () => {
      if (!zonesFromLatestTest) return null;
      const primaryRaw = sport === 'bike' ? zonesFromLatestTest.power : zonesFromLatestTest.pace;
      if (!primaryRaw) return null;
      return {
        primary: {
          ...primaryRaw,
          lt1: latestTh?.lt1,
          lt2: latestTh?.lt2,
        },
        heartRateZones: zonesFromLatestTest.heartRate || (hasUserHR ? userHR : null),
      };
    };

    if (preferTestZones) {
      const packed = packFromTest();
      if (packed) return packed;
    }

    if (hasUserPrimary || hasUserHR) {
      return {
        primary: hasUserPrimary ? userPZ : null,
        heartRateZones: hasUserHR ? userHR : null,
      };
    }

    const packed = packFromTest();
    if (packed) return packed;

    return computeZonesFromThresholds({
      sport,
      lt1: initial.lt1,
      lt2: initial.lt2,
      hr1: initial.hr1,
      hr2: initial.hr2,
    });
  }, [override, user, sport, initial, latestTest, latestTh, zonesFromLatestTest]);

  const fmtLtLabel = (value) => {
    if (value == null) return '—';
    if (latestTest) return formatThresholdIntensity(value, latestTest, sport);
    return isPace ? fmtPaceVal(value) : `${Math.round(value)} W`;
  };

  const lt1Show = latestTh?.lt1 ?? display?.primary?.lt1 ?? initial.lt1;
  const lt2Show = latestTh?.lt2 ?? display?.primary?.lt2 ?? initial.lt2;

  const hasAnything = display?.primary || display?.heartRateZones;
  return (
    <div style={{
      borderRadius: 12,
      background: 'rgba(255,255,255,.55)',
      border: `1px solid ${tint}26`,
      borderLeft: `3px solid ${tint}`,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 11px',
      }}>
        <SportTile sport={sport} size={28} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#0A0E1A', textTransform: 'capitalize' }}>
            {sport}
          </div>
          <div style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 600 }}>
            {hasAnything && (lt1Show != null || lt2Show != null)
              ? `LT1 ${fmtLtLabel(lt1Show)} · LT2 ${fmtLtLabel(lt2Show)}`
              : 'No thresholds set'}
          </div>
        </div>
        <button
          onClick={onToggle}
          style={{
            padding: '4px 10px', borderRadius: 9999,
            background: isOpen ? tint : `${tint}1f`,
            color: isOpen ? '#fff' : tint,
            border: 'none', fontFamily: 'inherit',
            fontSize: 10.5, fontWeight: 800, cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
          }}
        >
          {isOpen ? 'Cancel' : 'Edit'}
        </button>
      </div>

      {/* Zones table */}
      {hasAnything && (
        <div style={{ padding: '0 11px 8px' }}>
          {ZONE_DEFS.map((z, i) => {
            const p = display.primary?.[z.key];
            const h = display.heartRateZones?.[z.key];
            const primaryStr = p
              ? (isPace ? `${p.min}–${p.max}` : `${p.min}–${p.max} W`)
              : '—';
            const hrStr = h ? `${h.min}–${h.max} bpm` : '—';
            return (
              <div key={z.key} style={{
                display: 'grid',
                gridTemplateColumns: '90px 1fr 80px',
                gap: 6, alignItems: 'center',
                padding: '4px 0',
                borderTop: i === 0 ? '1px solid rgba(118,126,181,.1)' : 'none',
                borderBottom: i < ZONE_DEFS.length - 1 ? '1px solid rgba(118,126,181,.07)' : 'none',
              }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: 10, fontWeight: 800, color: z.color,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: z.color, flexShrink: 0 }} />
                  {z.label}
                </span>
                <span style={{
                  fontSize: 10.5, fontWeight: 700, color: '#0A0E1A',
                  fontVariantNumeric: 'tabular-nums', textAlign: 'right',
                }}>{primaryStr}</span>
                <span style={{
                  fontSize: 10.5, fontWeight: 700, color: '#B84238',
                  fontVariantNumeric: 'tabular-nums', textAlign: 'right',
                }}>{hrStr}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit form */}
      {isOpen && (
        <ZonesEditor
          sport={sport}
          initial={initial}
          tint={tint}
          user={user}
          athleteId={athleteId}
          onCancel={onToggle}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}

function ZonesEditor({ sport, initial, tint, user = null, athleteId = null, onCancel, onSaved }) {
  const isPace = isPaceSport(sport);
  // Pace inputs use MM:SS, power inputs use raw numbers
  const fmtIn = (v) => {
    if (v == null) return '';
    if (isPace) return fmtPaceVal(v);
    return String(Math.round(v));
  };
  const parseIn = (str) => {
    if (str == null || str === '') return null;
    if (isPace) {
      const m = String(str).trim().match(/^(\d+):(\d{1,2})$/);
      if (m) return Number(m[1]) * 60 + Number(m[2]);
      const n = Number(str);
      return Number.isFinite(n) && n > 0 ? n : null;
    }
    const n = Number(str);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const [lt1, setLt1] = useState(fmtIn(initial.lt1));
  const [lt2, setLt2] = useState(fmtIn(initial.lt2));
  const [hr1, setHr1] = useState(initial.hr1 ? String(Math.round(initial.hr1)) : '');
  const [hr2, setHr2] = useState(initial.hr2 ? String(Math.round(initial.hr2)) : '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const lt1v = parseIn(lt1);
      const lt2v = parseIn(lt2);
      const hr1v = Number(hr1) || null;
      const hr2v = Number(hr2) || null;
      const computed = computeZonesFromThresholds({ sport, lt1: lt1v, lt2: lt2v, hr1: hr1v, hr2: hr2v });
      const longKey = SHORT_TO_LONG[sport];
      // Merge with the *existing* zones for the other sports so we don't
      // overwrite them — both endpoints replace the whole `powerZones` /
      // `heartRateZones` object, and previously editing the bike block would
      // wipe the run + swim zones for that user.
      const existingPZ = user?.powerZones || {};
      const existingHR = user?.heartRateZones || {};
      const payload = {
        powerZones: {
          ...existingPZ,
          [longKey]: { ...(computed.primary || {}), lastUpdated: new Date() },
        },
        heartRateZones: {
          ...existingHR,
          [longKey]: { ...(computed.heartRateZones || {}), lastUpdated: new Date() },
        },
        zonesSource: 'profile-mobile',
      };
      if (athleteId) {
        await updateAthleteProfile(athleteId, payload);
      } else {
        await updateUserProfile(payload);
      }
      onSaved(computed);
    } catch (e) {
      setErr(e?.response?.data?.message || e?.message || 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = {
    flex: 1, minWidth: 0,
    padding: '6px 9px', borderRadius: 8,
    border: '1px solid rgba(118,126,181,.25)', background: '#fff',
    fontFamily: 'inherit', fontSize: 12, fontWeight: 700, color: '#0A0E1A',
    fontVariantNumeric: 'tabular-nums',
    outline: 'none',
    WebkitAppearance: 'none',
  };
  const labelStyle = {
    fontSize: 9, fontWeight: 800, color: '#6B7280',
    letterSpacing: '0.06em', textTransform: 'uppercase',
    marginBottom: 3,
  };

  return (
    <div style={{
      padding: '10px 11px 12px',
      borderTop: '1px solid rgba(118,126,181,.12)',
      background: 'rgba(118,126,181,.05)',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={labelStyle}>LT1 ({isPace ? 'MM:SS' : 'W'})</span>
          <input value={lt1} onChange={e => setLt1(e.target.value)} placeholder={isPace ? '5:30' : '180'} style={inputStyle} inputMode={isPace ? 'text' : 'numeric'} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={labelStyle}>LT2 ({isPace ? 'MM:SS' : 'W'})</span>
          <input value={lt2} onChange={e => setLt2(e.target.value)} placeholder={isPace ? '4:30' : '250'} style={inputStyle} inputMode={isPace ? 'text' : 'numeric'} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={labelStyle}>LT1 HR (bpm)</span>
          <input value={hr1} onChange={e => setHr1(e.target.value)} placeholder="140" style={inputStyle} inputMode="numeric" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={labelStyle}>LT2 HR (bpm)</span>
          <input value={hr2} onChange={e => setHr2(e.target.value)} placeholder="170" style={inputStyle} inputMode="numeric" />
        </div>
      </div>
      {err && (
        <div style={{ fontSize: 10.5, color: '#B84238', fontWeight: 700 }}>{err}</div>
      )}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          disabled={busy}
          style={{
            padding: '6px 12px', borderRadius: 8,
            background: 'rgba(118,126,181,.12)', color: '#5E6590',
            border: 'none', fontFamily: 'inherit',
            fontSize: 11, fontWeight: 800, cursor: busy ? 'not-allowed' : 'pointer',
            opacity: busy ? 0.5 : 1,
            WebkitTapHighlightColor: 'transparent',
          }}
        >Cancel</button>
        <button
          onClick={save}
          disabled={busy}
          style={{
            padding: '6px 14px', borderRadius: 8,
            background: tint, color: '#fff',
            border: 'none', fontFamily: 'inherit',
            fontSize: 11, fontWeight: 800, cursor: busy ? 'wait' : 'pointer',
            opacity: busy ? 0.7 : 1,
            boxShadow: `0 2px 6px -1px ${tint}66`,
            WebkitTapHighlightColor: 'transparent',
          }}
        >{busy ? 'Saving…' : 'Save zones'}</button>
      </div>
    </div>
  );
}
