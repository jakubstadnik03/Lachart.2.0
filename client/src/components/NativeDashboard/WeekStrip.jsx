import React, { useState } from 'react';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Sport dot colours — mirrors CalendarView mini-calendar
const SPORT_DOT = {
  bike:  '#3b82f6',
  run:   '#f97316',
  swim:  '#06b6d4',
  walk:  '#22c55e',
  other: '#8b5cf6',
};

// Sport icon paths — same as CalendarView SPORT_COLORS_CELL
const SPORT_ICON = {
  bike: '/icon/bike.svg',
  run:  '/icon/run.svg',
  swim: '/icon/swim.svg',
};

// Returns Mon..Sun for the week containing `ref`. Defaults to current week.
function getWeekDays(ref = new Date()) {
  const dow = (ref.getDay() + 6) % 7;
  const monday = new Date(ref);
  monday.setDate(ref.getDate() - dow);
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function toLocalDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate();
}

// Normalise a sport string to a key
function normaliseSport(sport) {
  const s = String(sport || '').toLowerCase();
  if (s.includes('bike') || s.includes('ride') || s.includes('cycle') || s.includes('virtual')) return 'bike';
  if (s.includes('run'))  return 'run';
  if (s.includes('swim')) return 'swim';
  if (s.includes('walk')) return 'walk';
  return 'other';
}

// Returns array of distinct sport keys for activities on a date
function getDaySports(activities, date) {
  const seen = new Set();
  activities.forEach(a => {
    const d = new Date(a.date || a.startDate || a.timestamp || 0);
    if (isSameDay(d, date)) seen.add(normaliseSport(a.sport || ''));
  });
  return [...seen];
}

// Planned-only day (no completed activities)
function hasPlannedOnly(activities, plannedWorkouts, date) {
  const dateStr = toLocalDateStr(date);
  const hasDone = activities.some(a => isSameDay(new Date(a.date || a.startDate || a.timestamp || 0), date));
  const hasPlan = (plannedWorkouts || []).some(p => String(p.date || '').slice(0, 10) === dateStr);
  return !hasDone && hasPlan;
}

// Has both planned and at least one completed activity
function hasPairedDay(activities, plannedWorkouts, date) {
  const dateStr = toLocalDateStr(date);
  const hasDone = activities.some(a => isSameDay(new Date(a.date || a.startDate || a.timestamp || 0), date));
  const hasPlan = (plannedWorkouts || []).some(p => String(p.date || '').slice(0, 10) === dateStr);
  return hasDone && hasPlan;
}

function hasLactate(activities, date) {
  return activities.some(a => {
    const d = new Date(a.date || a.startDate || a.timestamp || 0);
    return isSameDay(d, date) &&
      Array.isArray(a.results) &&
      a.results.some(r => r.lactate != null || r.mmol != null || r.lac != null);
  });
}

// ── Daily totals (TSS + duration) ──────────────────────────────────────────
// Aggregates completed activities for the day. Falls back to planned totals
// for future days where nothing's been done yet — gives the user a feel for
// the workload on each cell at a glance, TrainingPeaks-style.
function dailyTotals(activities, plannedWorkouts, date) {
  const acts = activities.filter(a => isSameDay(new Date(a.date || a.startDate || a.timestamp || 0), date));
  let tss = 0, secs = 0;
  for (const a of acts) {
    tss  += Number(a.tss || a.trainingLoad || a.totalTSS || a.hrTSS || a.hrTss || 0) || 0;
    secs += Number(a.totalTime || a.duration || a.movingTime || a.moving_time || a.elapsedTime || a.elapsed_time || 0) || 0;
  }
  if (acts.length === 0) {
    // No activities → fall back to planned for future days
    const dateStr = toLocalDateStr(date);
    const pws = (plannedWorkouts || []).filter(p => String(p.date || '').slice(0, 10) === dateStr);
    for (const p of pws) {
      tss  += Number(p.targetTss || 0) || 0;
      secs += Number(p.plannedDuration || 0) || 0;
    }
    return { tss: Math.round(tss), secs, planned: tss > 0 || secs > 0 };
  }
  return { tss: Math.round(tss), secs, planned: false };
}

function fmtDur(secs) {
  if (!secs || secs < 60) return null;
  const h = Math.floor(secs / 3600);
  const m = Math.round((secs % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h${m}`;
}

export default function WeekStrip({ activities = [], plannedWorkouts = [], selectedDate, onSelectDate, onPlanWorkout = null }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // The reference date that determines which week is shown.
  // If a selected date is in a different week, the strip auto-tracks it.
  const [weekRef, setWeekRef] = useState(selectedDate || today);

  // Sync weekRef when an external `selectedDate` lands in a different week
  React.useEffect(() => {
    if (!selectedDate) return;
    const cur = getWeekDays(weekRef);
    const inSameWeek = cur.some(d => isSameDay(d, selectedDate));
    if (!inSameWeek) setWeekRef(selectedDate);
  }, [selectedDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const weekDays = getWeekDays(weekRef);

  // Header label for the visible week — e.g. "May 5 — May 11"
  const monday = weekDays[0];
  const sunday = weekDays[6];
  const sameMonth = monday.getMonth() === sunday.getMonth();
  const headerLabel = sameMonth
    ? `${monday.toLocaleDateString('en', { month: 'short' })} ${monday.getDate()} – ${sunday.getDate()}`
    : `${monday.toLocaleDateString('en', { month: 'short', day: 'numeric' })} – ${sunday.toLocaleDateString('en', { month: 'short', day: 'numeric' })}`;

  // Detect "this week" so the toolbar can hide the "Today" pill when not needed
  const isCurrentWeek = weekDays.some(d => isSameDay(d, today));

  // Shift the visible week by ±1 (or N) weeks
  const shiftWeek = (delta) => {
    const next = new Date(weekRef);
    next.setDate(next.getDate() + delta * 7);
    setWeekRef(next);
  };

  const goToday = () => {
    setWeekRef(today);
    onSelectDate && onSelectDate(today);
  };

  // Press-feedback handlers
  const press = (e) => { e.currentTarget.style.transform = 'scale(.92)'; };
  const release = (e) => { e.currentTarget.style.transform = ''; };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {/* ── Toolbar: prev / week label / next  ── */}
      <div style={styles.toolbar}>
        <button
          onClick={() => shiftWeek(-1)}
          onMouseDown={press} onMouseUp={release} onMouseLeave={release}
          onTouchStart={press} onTouchEnd={release}
          aria-label="Previous week"
          style={styles.navBtn}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <div style={styles.weekLabelWrap}>
          <span style={styles.weekLabel}>{headerLabel}</span>
          {!isCurrentWeek && (
            <button
              onClick={goToday}
              onMouseDown={press} onMouseUp={release} onMouseLeave={release}
              onTouchStart={press} onTouchEnd={release}
              style={styles.todayPill}
            >
              Today
            </button>
          )}
        </div>

        <button
          onClick={() => shiftWeek(1)}
          onMouseDown={press} onMouseUp={release} onMouseLeave={release}
          onTouchStart={press} onTouchEnd={release}
          aria-label="Next week"
          style={styles.navBtn}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      {/* ── Day strip — re-keys on weekRef so each new week fades in ── */}
      <div key={`week-${weekRef.toDateString()}`} style={{ ...styles.card, animation: 'ndFadeIn .3s cubic-bezier(.22,1,.36,1) both' }}>
      {weekDays.map((d, i) => {
        const isToday    = isSameDay(d, today);
        const isSelected = selectedDate && isSameDay(d, selectedDate);
        const sports     = getDaySports(activities, d);         // ['bike','run',…]
        const hasActs    = sports.length > 0;
        const hasLac     = hasLactate(activities, d);
        const isPlan     = hasPlannedOnly(activities, plannedWorkouts, d);
        const isPaired   = hasPairedDay(activities, plannedWorkouts, d);

        // Primary sport (first found) for icon
        const primarySport = sports[0] || null;
        const iconSrc      = primarySport ? SPORT_ICON[primarySport] : null;

        // Background rules
        const dayBg = isSelected
          ? 'linear-gradient(160deg,#5E6590,#767EB5)'
          : isToday
          ? 'rgba(118,126,181,.12)'
          : 'transparent';

        const dayBorder = isSelected
          ? '1.5px solid rgba(255,255,255,.3)'
          : isToday
          ? '1.5px solid rgba(118,126,181,.25)'
          : '1.5px solid transparent';

        const dayBoxShadow = isSelected
          ? '0 4px 14px -4px rgba(94,101,144,.55)'
          : 'none';

        const numColor   = isSelected ? '#fff' : isToday ? '#5E6590' : !hasActs && !isPlan ? 'rgba(10,14,26,.28)' : '#0A0E1A';
        const labelColor = isSelected ? 'rgba(255,255,255,.75)' : isToday ? '#767EB5' : '#9CA3AF';

        // ─── Indicator area below the date number ───────────────────────────
        // Priority: if has activities → show sport icon + colored dot(s)
        //           if plan-only      → show dashed gray circle
        //           else              → small faint dot

        const indicatorContent = () => {
          if (hasLac) {
            // Lactate test: orange dot
            return (
              <span style={{
                width: 6, height: 6, borderRadius: '50%', display: 'block', flexShrink: 0,
                background: isSelected ? 'rgba(255,255,255,.9)' : '#FF6B4A',
              }} />
            );
          }

          if (hasActs) {
            const dots = sports.slice(0, 3); // max 3 dots
            return (
              <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                {dots.map(sp => (
                  <span key={sp} style={{
                    width: 5, height: 5, borderRadius: '50%', display: 'block', flexShrink: 0,
                    background: isSelected ? 'rgba(255,255,255,.85)' : (SPORT_DOT[sp] || SPORT_DOT.other),
                    boxShadow: isSelected ? 'none' : `0 0 0 1px ${(SPORT_DOT[sp] || SPORT_DOT.other)}33`,
                  }} />
                ))}
                {isPaired && !isSelected && (
                  <span style={{
                    width: 5, height: 5, borderRadius: '50%', display: 'block', flexShrink: 0,
                    background: '#22c55e',
                    boxShadow: '0 0 0 1px #22c55e33',
                    marginLeft: -1,
                  }} />
                )}
              </div>
            );
          }

          if (isPlan) {
            return (
              <span style={{
                width: 6, height: 6, borderRadius: '50%', display: 'block',
                background: 'transparent',
                border: `1.5px dashed ${isSelected ? 'rgba(255,255,255,.5)' : 'rgba(118,126,181,.45)'}`,
              }} />
            );
          }

          // Rest day: faint placeholder
          return (
            <span style={{
              width: 4, height: 4, borderRadius: '50%', display: 'block',
              background: isSelected ? 'rgba(255,255,255,.2)' : 'rgba(118,126,181,.15)',
            }} />
          );
        };

        return (
          <button
            key={i}
            onClick={() => onSelectDate && onSelectDate(d)}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(.94)'; }}
            onMouseUp={(e)   => { e.currentTarget.style.transform = ''; }}
            onMouseLeave={(e)=> { e.currentTarget.style.transform = ''; }}
            onTouchStart={(e)=> { e.currentTarget.style.transform = 'scale(.94)'; }}
            onTouchEnd={(e)  => { e.currentTarget.style.transform = ''; }}
            style={{
              position: 'relative',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              padding: '7px 0 8px', borderRadius: 12,
              background: dayBg,
              border: dayBorder,
              boxShadow: dayBoxShadow,
              fontFamily: 'inherit', cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
              touchAction: 'manipulation',
              transition: 'background .18s ease, box-shadow .18s ease, transform .12s ease',
            }}
          >
            {/* Day letter */}
            <span style={{
              fontSize: 9.5, fontWeight: 700, letterSpacing: '0.05em',
              textTransform: 'uppercase', color: labelColor,
              transition: 'color .18s',
            }}>
              {DOW[i][0]}
            </span>

            {/* Date number */}
            <span style={{
              fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
              color: numColor, transition: 'color .18s', lineHeight: 1.2,
            }}>
              {d.getDate()}
            </span>

            {/* Sport icon (if activities exist) — tinted to match sport dot colour */}
            {iconSrc ? (
              <span
                aria-label={primarySport}
                style={{
                  width: 14, height: 14, display: 'block',
                  // Use the SVG as a mask and color via background — gives full sport-colour tint
                  background: isSelected ? '#fff' : (SPORT_DOT[primarySport] || SPORT_DOT.other),
                  WebkitMaskImage: `url(${iconSrc})`,
                  maskImage:       `url(${iconSrc})`,
                  WebkitMaskRepeat: 'no-repeat',
                  maskRepeat: 'no-repeat',
                  WebkitMaskPosition: 'center',
                  maskPosition: 'center',
                  WebkitMaskSize: 'contain',
                  maskSize: 'contain',
                  transition: 'background .18s',
                }}
              />
            ) : (
              <span style={{ width: 14, height: 14, display: 'block' }} />
            )}

            {/* Dots row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 6 }}>
              {indicatorContent()}
            </div>

            {/* Daily totals + plan-workout shortcut.
                The "+" used to live in the top-right corner as a nested
                <button> — invalid HTML (button-in-button) which the iOS
                WebView silently de-activates. Now it's rendered as a
                <span role="button"> inline beside the TSS/duration totals
                on the SELECTED day, where the touch target is unambiguous
                and the day cell's onClick can't swallow it
                (stopPropagation on the span). */}
            {(() => {
              const tot = dailyTotals(activities, plannedWorkouts, d);
              const durStr = fmtDur(tot.secs);
              const hasTotals = tot.tss > 0 || !!durStr;
              const showPlusBtn = isSelected && !!onPlanWorkout;
              if (!hasTotals && !showPlusBtn) return null;

              const totalsColor = isSelected
                ? 'rgba(255,255,255,.85)'
                : tot.planned ? '#9CA3AF' : '#5E6590';

              return (
                <div style={{
                  marginTop: 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: 4,
                }}>
                  {hasTotals && (
                    <div style={{
                      fontSize: 8.5, fontWeight: 800, color: totalsColor,
                      fontVariantNumeric: 'tabular-nums', lineHeight: 1.15,
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      fontStyle: tot.planned ? 'italic' : 'normal',
                    }}>
                      {tot.tss > 0 && <span>{tot.tss}</span>}
                      {durStr && <span style={{ fontSize: 7.5, opacity: 0.75, fontWeight: 700 }}>{durStr}</span>}
                    </div>
                  )}
                  {showPlusBtn && (
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label="Plan workout for this day"
                      onClick={(e) => { e.stopPropagation(); onPlanWorkout(d); }}
                      onMouseDown={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                      onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); onPlanWorkout(d); }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.stopPropagation(); e.preventDefault(); onPlanWorkout(d);
                        }
                      }}
                      style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 16, height: 16, borderRadius: '50%',
                        background: isSelected ? 'rgba(255,255,255,.32)' : 'rgba(94,101,144,.18)',
                        color: isSelected ? '#fff' : '#5E6590',
                        fontSize: 12, fontWeight: 800, lineHeight: 1,
                        cursor: 'pointer',
                        userSelect: 'none',
                        WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
                      }}
                    >
                      +
                    </span>
                  )}
                </div>
              );
            })()}
          </button>
        );
      })}
      </div>
    </div>
  );
}

const styles = {
  card: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7,1fr)',
    gap: 3,
    padding: '6px 6px',
    background: 'rgba(255,255,255,.65)',
    backdropFilter: 'blur(22px) saturate(170%)',
    WebkitBackdropFilter: 'blur(22px) saturate(170%)',
    border: '1px solid rgba(255,255,255,.7)',
    boxShadow: '0 1px 0 rgba(255,255,255,.7) inset, 0 8px 24px -10px rgba(10,14,26,.08)',
    borderRadius: 16,
  },
  toolbar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 4px',
  },
  navBtn: {
    width: 30, height: 30, borderRadius: 999,
    border: 'none',
    background: 'rgba(255,255,255,.55)',
    color: '#5E6590',
    boxShadow: '0 1px 4px -1px rgba(10,14,26,.06)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', fontFamily: 'inherit',
    transition: 'transform .12s ease, background .15s ease',
    WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
  },
  weekLabelWrap: {
    display: 'flex', alignItems: 'center', gap: 8,
  },
  weekLabel: {
    fontSize: 11.5, fontWeight: 700, color: '#0A0E1A',
    letterSpacing: '0.04em', textTransform: 'uppercase',
    fontVariantNumeric: 'tabular-nums',
  },
  todayPill: {
    fontFamily: 'inherit', cursor: 'pointer',
    fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em',
    padding: '3px 9px', borderRadius: 9999,
    background: '#5E6590', color: '#fff', border: 'none',
    boxShadow: '0 2px 6px -2px rgba(94,101,144,.5)',
    transition: 'transform .12s ease',
    WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
  },
};
