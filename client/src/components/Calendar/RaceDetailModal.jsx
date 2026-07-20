/**
 * RaceDetailModal — click a race badge in the calendar to see how Form (TSB)
 * builds toward race day, with a projected taper from planned workouts.
 */
import React, { useMemo, useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { XMarkIcon, PencilIcon, TrashIcon, FlagIcon, ArrowTrendingUpIcon } from '@heroicons/react/24/outline';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceArea,
} from 'recharts';
import { mergeProfileZones } from '../../utils/inferThresholdsFromActivities';
import {
  computePmcFromActivities,
  buildPlannedTssByDate,
  computePmcProjection,
  localCalendarDateKey,
} from '../../utils/formFitnessFromActivities';
import { daysUntilRace } from '../../utils/trainingInsights';
import { pmcAxisDomainsFromPoints, PMC_COLORS } from '../../utils/pmcChartAxes';
import TrainingComments from '../TrainingComments';
import SportIcon from '../shared/SportIcon';
import { submitRaceFeedback } from '../../services/api';

const FEELING_OPTIONS = [
  { id: 'great', label: 'Great', emoji: '🔥' },
  { id: 'good', label: 'Good', emoji: '👍' },
  { id: 'ok', label: 'OK', emoji: '😐' },
  { id: 'tough', label: 'Tough', emoji: '😓' },
  { id: 'rough', label: 'Bad', emoji: '😞' },
];

const PRIORITY_COLOR = { A: '#dc2626', B: '#ea580c', C: '#d97706' };
const SPORTS = ['run', 'bike', 'swim', 'triathlon', 'hyrox', 'other'];

function fmtDate(dateStr) {
  const d = new Date(`${String(dateStr).slice(0, 10)}T12:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtForm(v) {
  if (v == null || Number.isNaN(Number(v))) return '—';
  const n = Math.round(Number(v));
  return n >= 0 ? `+${n}` : `${n}`;
}

function formStatus(form) {
  const n = Number(form);
  if (Number.isNaN(n)) return null;
  if (n <= -30) return { label: 'Overloading', color: '#dc2626' };
  if (n <= -10) return { label: 'Fatigued', color: '#ea580c' };
  if (n < 10) return { label: 'Building', color: '#6b7280' };
  return { label: 'Fresh', color: '#16a34a' };
}

function RaceDayChartLabel({ viewBox, fill = '#dc2626' }) {
  if (!viewBox) return null;
  const x = viewBox.x ?? 0;
  // Clamp so the label never renders above the chart's top edge (where it would
  // get clipped and become unreadable).
  const y = Math.max(2, (viewBox.y ?? 0) - 16);
  return (
    <foreignObject x={x - 54} y={y} width={58} height={16}>
      <div
        xmlns="http://www.w3.org/1999/xhtml"
        className="flex items-center justify-end gap-1 text-[10px] font-bold leading-none"
        style={{ color: fill }}
      >
        <FlagIcon className="w-3 h-3 shrink-0" aria-hidden />
        <span>Race</span>
      </div>
    </foreignObject>
  );
}

export default function RaceDetailModal({
  race,
  activities = [],
  plannedWorkouts = [],
  userProfile = null,
  user = null,
  editable = false,
  onClose,
  onSave,
  onDelete,
  /** Open a race-day activity's detail (native day view passes openActivity). */
  onOpenActivity = null,
  /** Called with the updated race after the reflection is saved/edited. */
  onFeedbackSaved = null,
}) {
  const [editing, setEditing] = useState(false);

  // ── Post-race reflection: local override + inline edit form ──────────────
  const [fbLocal, setFbLocal] = useState(null); // updated race.postRaceFeedback after save
  const effectiveFb = fbLocal || race?.postRaceFeedback || null;
  const hasFb = Boolean(effectiveFb && (effectiveFb.rpe != null || effectiveFb.feeling || effectiveFb.notes));
  const [fbEditing, setFbEditing] = useState(false);
  const [fbSaving, setFbSaving] = useState(false);
  const [fbForm, setFbForm] = useState({ rpe: 6, feeling: null, notes: '' });
  const isOwnRace = user && race && String(user._id || user.id) === String(race.athleteId);

  // ── Swipe-down on the header closes the sheet (mobile bottom-sheet UX) ───
  const [dragY, setDragY] = useState(0);
  const dragStartYRef = React.useRef(0);
  const dragStartTimeRef = React.useRef(0);
  const draggingRef = React.useRef(false);
  const onHeaderTouchStart = (e) => {
    draggingRef.current = true;
    dragStartYRef.current = e.touches[0].clientY;
    dragStartTimeRef.current = Date.now();
  };
  const onHeaderTouchMove = (e) => {
    if (!draggingRef.current) return;
    const dy = e.touches[0].clientY - dragStartYRef.current;
    if (dy > 0) setDragY(dy);
  };
  const onHeaderTouchEnd = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const dt = (Date.now() - dragStartTimeRef.current) / 1000;
    const vel = dt > 0 ? dragY / dt : 0;
    if (dragY > 90 || vel > 450) onClose?.();
    setDragY(0);
  };

  const startFbEdit = () => {
    setFbForm({
      rpe: effectiveFb?.rpe ?? 6,
      feeling: effectiveFb?.feeling ?? null,
      notes: effectiveFb?.notes ?? '',
    });
    setFbEditing(true);
  };

  const saveFb = async () => {
    setFbSaving(true);
    try {
      const { data } = await submitRaceFeedback(race._id, {
        rpe: fbForm.rpe, feeling: fbForm.feeling, notes: fbForm.notes,
      });
      const updatedFb = data?.postRaceFeedback || { ...fbForm, submittedAt: new Date().toISOString() };
      setFbLocal(updatedFb);
      setFbEditing(false);
      onFeedbackSaved?.(data || { ...race, postRaceFeedback: updatedFb });
    } catch (e) {
      console.error('Race reflection save failed:', e);
    } finally {
      setFbSaving(false);
    }
  };
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    date: '',
    sport: 'run',
    priority: 'A',
    targetCTL: '',
    location: '',
    notes: '',
  });

  useEffect(() => {
    setEditing(false);
    setConfirmDelete(false);
    setEditForm({
      name: race?.name || '',
      date: String(race?.date || '').slice(0, 10),
      sport: race?.sport || 'run',
      priority: race?.priority || 'A',
      targetCTL: race?.targetCTL != null ? String(race.targetCTL) : '',
      location: race?.location || '',
      notes: race?.notes || '',
    });
  }, [race]);

  const handleSaveEdit = async () => {
    if (!editForm.name?.trim() || !editForm.date || !onSave) return;
    setSaving(true);
    try {
      await onSave({
        name: editForm.name.trim(),
        date: editForm.date,
        sport: editForm.sport,
        priority: editForm.priority,
        targetCTL: editForm.targetCTL ? Number(editForm.targetCTL) : null,
        location: editForm.location?.trim() || null,
        notes: editForm.notes?.trim() || null,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  };

  const raceDateStr = String(race?.date || '').slice(0, 10);
  const daysUntil = daysUntilRace(raceDateStr);
  const isFuture = daysUntil >= 0;

  // Completed activities on race day — the actual race sessions.
  const raceDayActs = useMemo(() => {
    if (!raceDateStr) return [];
    const pad = (n) => String(n).padStart(2, '0');
    return (activities || []).filter((a) => {
      const v = a?.date || a?.startDate || a?.timestamp || a?.start_time;
      const d = v ? new Date(v) : null;
      if (!d || Number.isNaN(d.getTime())) return false;
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` === raceDateStr;
    });
  }, [raceDateStr, activities]);
  const priorityColor = PRIORITY_COLOR[race?.priority] || '#dc2626';

  const profile = useMemo(
    () => mergeProfileZones(userProfile, user) || userProfile || user,
    [userProfile, user],
  );

  const chartBundle = useMemo(() => {
    if (!raceDateStr || !profile) return { chartData: [], metrics: null };

    const lookback = 90;
    const displayDays = isFuture
      ? Math.min(730, Math.max(lookback, daysUntil + lookback))
      : lookback + 14;

    const { series, todayMetrics } = computePmcFromActivities(activities, profile, {
      displayDays,
      sportFilter: 'all',
      tssUser: user,
    });

    if (!series.length) return { chartData: [], metrics: todayMetrics };

    const todayKey = localCalendarDateKey(new Date());
    const windowStart = new Date(`${raceDateStr}T12:00:00`);
    windowStart.setDate(windowStart.getDate() - lookback);
    const windowStartKey = localCalendarDateKey(windowStart);

    let extended = [...series];
    if (isFuture && raceDateStr > todayKey) {
      const plannedTssByDate = buildPlannedTssByDate(plannedWorkouts, {
        maxDays: daysUntil + 7,
      });
      const projection = computePmcProjection(series, plannedTssByDate, {
        endDate: raceDateStr,
        maxDays: daysUntil + 14,
      });
      if (projection.length) {
        const lastActual = series[series.length - 1];
        extended = [
          ...series.slice(0, -1),
          { ...lastActual, FormProj: lastActual.Form, FitnessProj: lastActual.Fitness },
          ...projection.map((p) => ({
            ...p,
            FormProj: p.Form,
            FitnessProj: p.Fitness,
            projected: true,
          })),
        ];
      }
    }

    const chartData = extended.filter((p) => {
      const dk = String(p.date || '').slice(0, 10);
      return dk >= windowStartKey && dk <= raceDateStr;
    });

    const racePoint = chartData.find((p) => String(p.date).slice(0, 10) === raceDateStr)
      || chartData[chartData.length - 1];
    const todayPoint = chartData.find((p) => String(p.date).slice(0, 10) === todayKey)
      || series[series.length - 1];

    return {
      chartData,
      metrics: {
        currentForm: todayPoint?.Form ?? todayMetrics?.form,
        currentCtl: todayPoint?.Fitness ?? todayMetrics?.fitness,
        raceForm: racePoint?.FormProj ?? racePoint?.Form,
        raceCtl: racePoint?.FitnessProj ?? racePoint?.Fitness,
        hasProjection: chartData.some((p) => p.projected),
      },
    };
  }, [activities, profile, user, plannedWorkouts, raceDateStr, daysUntil, isFuture]);

  const { chartData, metrics } = chartBundle;
  const axisDomains = useMemo(() => pmcAxisDomainsFromPoints(chartData), [chartData]);
  const raceDateLabel = chartData.find((p) => String(p.date).slice(0, 10) === raceDateStr)?.dateLabel;
  const todayLabel = chartData.find((p) => String(p.date).slice(0, 10) === localCalendarDateKey(new Date()))?.dateLabel;
  const currentStatus = formStatus(metrics?.currentForm);
  const raceStatus = formStatus(metrics?.raceForm);

  // Lock background scroll (NativeLayout uses #nl-content-scroll, not body).
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);

    const scrollEl = document.getElementById('nl-content-scroll');
    const prevBody = document.body.style.overflow;
    const prevScroll = scrollEl?.style.overflowY;
    document.body.style.overflow = 'hidden';
    if (scrollEl) scrollEl.style.overflowY = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevBody;
      if (scrollEl) scrollEl.style.overflowY = prevScroll || '';
    };
  }, [onClose]);

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 flex items-end sm:items-center justify-center bg-black/45 p-0 sm:p-4"
      style={{
        zIndex: 10050,
        pointerEvents: 'auto',
        WebkitTapHighlightColor: 'transparent',
      }}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => { e.stopPropagation(); }}
      onTouchEnd={(e) => e.stopPropagation()}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div
        className="w-full sm:max-w-2xl bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          pointerEvents: 'auto',
          transform: dragY > 0 ? `translateY(${dragY}px)` : 'translateY(0)',
          transition: dragY > 0 ? 'none' : 'transform .25s cubic-bezier(.4,0,.2,1)',
        }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      >
        {/* Header — drag zone: swipe down to close */}
        <div
          className="px-5 pt-2 pb-3 border-b border-gray-100 shrink-0"
          onTouchStart={onHeaderTouchStart}
          onTouchMove={onHeaderTouchMove}
          onTouchEnd={onHeaderTouchEnd}
          style={{ touchAction: 'none' }}
        >
          <div className="mx-auto mb-2 sm:hidden" style={{ width: 44, height: 5, borderRadius: 999, background: '#d1d5db' }} />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="text-[10px] font-extrabold uppercase text-white px-2 py-0.5 rounded-md"
                  style={{ background: priorityColor }}
                >
                  {race?.priority || 'A'} race
                </span>
                {race?.sport && (
                  <span className="text-[11px] font-semibold text-gray-400 capitalize">{race.sport}</span>
                )}
              </div>
              <h2 className="text-xl font-bold text-gray-900 truncate">{race?.name}</h2>
              <p className="text-sm text-gray-500 mt-0.5">{fmtDate(raceDateStr)}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              onPointerDown={(e) => e.stopPropagation()}
              className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 shrink-0"
              style={{ touchAction: 'manipulation' }}
              aria-label="Close"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
          {race?.location && !editing && (
            <p className="text-xs text-gray-400 mt-1">{race.location}</p>
          )}
          {race?.notes && !editing && (
            <p className="text-xs text-gray-500 mt-2 bg-gray-50 rounded-lg px-3 py-2">{race.notes}</p>
          )}


          {/* Countdown + metrics */}
          <div className="flex items-baseline gap-2 mt-3">
            <span className="text-4xl font-extrabold text-gray-900 leading-none">
              {isFuture ? Math.max(0, daysUntil) : 0}
            </span>
            <span className="text-sm font-semibold text-gray-500">
              {daysUntil === 0 ? 'race day' : isFuture ? 'days to go' : 'days ago'}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
            <MetricBox
              label="Form now"
              value={fmtForm(metrics?.currentForm)}
              sub={currentStatus?.label}
              subColor={currentStatus?.color}
            />
            <MetricBox
              label={isFuture ? 'Form on race day' : 'Form on race day'}
              value={fmtForm(metrics?.raceForm)}
              sub={raceStatus?.label}
              subColor={raceStatus?.color}
              projected={metrics?.hasProjection}
            />
            <MetricBox
              label="Fitness now"
              value={metrics?.currentCtl != null ? Math.round(metrics.currentCtl) : '—'}
              sub="CTL"
            />
            {race?.targetCTL != null ? (
              <MetricBox
                label="Target CTL"
                value={Math.round(race.targetCTL)}
                sub={metrics?.raceCtl != null ? `proj. ${Math.round(metrics.raceCtl)}` : null}
              />
            ) : (
              <MetricBox
                label="Fitness on race"
                value={metrics?.raceCtl != null ? Math.round(metrics.raceCtl) : '—'}
                sub="CTL"
                projected={metrics?.hasProjection}
              />
            )}
          </div>
        </div>

        {/* Chart */}
        <div
          className="flex-1 overflow-y-auto px-3 sm:px-5 py-4 min-h-0"
          style={{
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
            touchAction: 'pan-y',
          }}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          {/* Completed race: the actual race sessions — tap to open */}
          {!isFuture && raceDayActs.length > 0 && (
            <div className="mb-4">
              <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">Race activities</div>
              <div className="space-y-1.5">
                {raceDayActs.map((act, i) => {
                  const secs = Number(act.totalTime || act.duration || act.movingTime || act.elapsedTime || act.totalElapsedTime || 0);
                  const durStr = secs > 0 ? `${Math.floor(secs / 3600) > 0 ? `${Math.floor(secs / 3600)}h ` : ''}${Math.floor((secs % 3600) / 60)}m` : null;
                  const dist = Number(act.distance || act.totalDistance || 0);
                  const distStr = dist > 0 ? `${(dist / 1000).toFixed(dist >= 100000 ? 0 : 1)} km` : null;
                  return (
                    <button
                      key={act.id || act._id || i}
                      type="button"
                      onClick={() => { if (onOpenActivity) { onClose?.(); onOpenActivity(act); } }}
                      disabled={!onOpenActivity}
                      className="w-full flex items-center gap-2.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-left active:bg-gray-50 disabled:cursor-default"
                      style={{ WebkitTapHighlightColor: 'transparent' }}
                    >
                      <SportIcon sport={act.sport || act.type} className="w-4 h-4 shrink-0" />
                      <span className="text-sm font-semibold text-gray-900 truncate flex-1">
                        {act.title || act.titleManual || act.name || 'Activity'}
                      </span>
                      <span className="text-xs text-gray-500 tabular-nums shrink-0">
                        {[durStr, distStr].filter(Boolean).join(' · ')}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Completed race: reflection — view + inline edit */}
          {!isFuture && !editing && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
              <div className="flex items-center justify-between mb-1">
                <div className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Race reflection</div>
                {isOwnRace && !fbEditing && (
                  <button
                    type="button"
                    onClick={startFbEdit}
                    className="text-[11px] font-bold text-amber-700 underline underline-offset-2 active:opacity-70"
                  >
                    {hasFb ? 'Edit' : 'Add'}
                  </button>
                )}
              </div>
              {fbEditing ? (
                <div>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {FEELING_OPTIONS.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setFbForm((p) => ({ ...p, feeling: f.id }))}
                        className={`px-2.5 py-1 rounded-full text-[12px] font-semibold border ${
                          fbForm.feeling === f.id
                            ? 'bg-amber-600 text-white border-amber-600'
                            : 'bg-white text-amber-900 border-amber-300'
                        }`}
                      >
                        {f.emoji} {f.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-semibold text-amber-900 shrink-0">RPE {fbForm.rpe}/10</span>
                    <input
                      type="range" min="1" max="10" step="1"
                      value={fbForm.rpe}
                      onChange={(e) => setFbForm((p) => ({ ...p, rpe: Number(e.target.value) }))}
                      className="flex-1 accent-amber-600"
                    />
                  </div>
                  <textarea
                    value={fbForm.notes}
                    onChange={(e) => setFbForm((p) => ({ ...p, notes: e.target.value }))}
                    placeholder="Note for yourself or your coach…"
                    rows={2}
                    className="w-full rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      onClick={saveFb}
                      disabled={fbSaving}
                      className="flex-1 rounded-lg bg-amber-600 py-1.5 text-sm font-bold text-white active:bg-amber-700 disabled:opacity-60"
                    >
                      {fbSaving ? 'Saving…' : 'Save reflection'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setFbEditing(false)}
                      className="rounded-lg border border-amber-300 px-3 py-1.5 text-sm font-semibold text-amber-800"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : hasFb ? (
                <>
                  <div className="flex items-center gap-3 text-sm font-semibold text-amber-900">
                    {effectiveFb.feeling && (
                      <span>
                        {(FEELING_OPTIONS.find((f) => f.id === effectiveFb.feeling) || {}).emoji}{' '}
                        {(FEELING_OPTIONS.find((f) => f.id === effectiveFb.feeling) || { label: effectiveFb.feeling }).label}
                      </span>
                    )}
                    {effectiveFb.rpe != null && <span>RPE {effectiveFb.rpe}/10</span>}
                  </div>
                  {effectiveFb.notes && (
                    <p className="text-xs text-amber-800 italic mt-1 whitespace-pre-wrap">“{effectiveFb.notes}”</p>
                  )}
                </>
              ) : (
                <p className="text-xs text-amber-700">No reflection yet — how did it go?</p>
              )}
            </div>
          )}

          {isFuture && (chartData.length < 2 ? (
            <div className="text-sm text-gray-400 text-center py-12">
              Not enough training data yet — complete a few workouts to see your Form curve.
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-500 mb-3 text-center">
                {'How your Form (freshness) should build toward race day based on your plan'}
              </p>
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 24, right: 14, left: 0, bottom: 4 }}>
                    <defs>
                      <linearGradient id="raceFormGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={PMC_COLORS.form} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={PMC_COLORS.form} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" yAxisId="tsb" />
                    <XAxis
                      dataKey="dateLabel"
                      tick={{ fontSize: 10, fill: '#9ca3af' }}
                      interval="preserveStartEnd"
                      minTickGap={28}
                    />
                    <YAxis
                      yAxisId="tsb"
                      domain={[axisDomains.min, axisDomains.max]}
                      tick={{ fontSize: 10, fill: '#9ca3af' }}
                      width={36}
                      tickFormatter={(v) => (v > 0 ? `+${v}` : v)}
                    />
                    <YAxis
                      yAxisId="tss"
                      orientation="right"
                      domain={[0, axisDomains.tssMax]}
                      tick={{ fontSize: 10, fill: '#9ca3af' }}
                      width={32}
                    />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid #e5e7eb' }}
                      formatter={(val, name) => {
                        if (name === 'Form' || name === 'Form (planned)') return [fmtForm(val), name];
                        return [val, name];
                      }}
                    />
                    {metrics?.hasProjection && todayLabel && raceDateLabel && (
                      <ReferenceArea
                        yAxisId="tsb"
                        x1={todayLabel}
                        x2={raceDateLabel}
                        fill="#6366f1"
                        fillOpacity={0.06}
                      />
                    )}
                    {todayLabel && isFuture && (
                      <ReferenceLine
                        yAxisId="tsb"
                        x={todayLabel}
                        stroke="#94a3b8"
                        strokeDasharray="4 3"
                        label={{ value: 'Today', position: 'insideTopLeft', fontSize: 10, fill: '#64748b' }}
                      />
                    )}
                    {raceDateLabel && (
                      <ReferenceLine
                        yAxisId="tsb"
                        x={raceDateLabel}
                        stroke={priorityColor}
                        strokeWidth={2}
                        label={<RaceDayChartLabel fill={priorityColor} />}
                      />
                    )}
                    <ReferenceLine yAxisId="tsb" y={0} stroke="#d1d5db" strokeDasharray="3 3" />
                    <Area
                      yAxisId="tsb"
                      type="monotone"
                      dataKey="Form"
                      name="Form"
                      stroke={PMC_COLORS.form}
                      fill="url(#raceFormGrad)"
                      strokeWidth={2.5}
                      connectNulls
                    />
                    {metrics?.hasProjection && (
                      <Line
                        yAxisId="tsb"
                        type="monotone"
                        dataKey="FormProj"
                        name="Form (planned)"
                        stroke={PMC_COLORS.form}
                        strokeDasharray="5 4"
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                      />
                    )}
                    <Line
                      yAxisId="tss"
                      type="monotone"
                      dataKey="Fitness"
                      name="Fitness"
                      stroke={PMC_COLORS.fitness}
                      strokeWidth={1.5}
                      dot={false}
                      connectNulls
                      strokeOpacity={0.5}
                    />
                    {metrics?.hasProjection && (
                      <Line
                        yAxisId="tss"
                        type="monotone"
                        dataKey="FitnessProj"
                        name="Fitness (planned)"
                        stroke={PMC_COLORS.fitness}
                        strokeDasharray="4 3"
                        strokeWidth={1.5}
                        dot={false}
                        connectNulls
                        strokeOpacity={0.4}
                      />
                    )}
                    {race?.targetCTL != null && (
                      <ReferenceLine
                        yAxisId="tss"
                        y={Number(race.targetCTL)}
                        stroke="#767EB5"
                        strokeDasharray="6 4"
                        label={{
                          value: `Target ${Math.round(race.targetCTL)} CTL`,
                          position: 'insideBottomRight',
                          fontSize: 10,
                          fill: '#767EB5',
                        }}
                      />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap justify-center gap-4 mt-3">
                <LegendDot color={PMC_COLORS.form} label="Form (TSB)" />
                <LegendDot color={PMC_COLORS.fitness} label="Fitness (CTL)" dashed={false} />
                {metrics?.hasProjection && (
                  <LegendDot color={PMC_COLORS.form} label="Planned projection" dashed />
                )}
              </div>
              {isFuture && daysUntil <= 21 && race?.priority === 'A' && (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mt-3 text-center">
                  A-race taper window — Form should rise as fatigue drops. Check your planned volume in the calendar.
                </p>
              )}
            </>
          ))}

          {/* Comments — same thread component as activities; coach + athlete */}
          {race?._id && (
            <div className="mt-4 border-t border-gray-100 pt-3">
              <TrainingComments trainingId={String(race._id)} trainingType="race" isMobile />
            </div>
          )}
        </div>

        {editing && editable && (
          <div className="px-5 py-4 border-t border-gray-100 bg-gray-50/80 space-y-3 shrink-0">
            <div className="text-xs font-bold uppercase tracking-wide text-gray-500">Edit race</div>
            <input
              className="w-full text-sm px-3 py-2 rounded-xl border border-gray-200"
              placeholder="Race name"
              value={editForm.name}
              onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
            />
            <div className="flex gap-2 flex-wrap">
              <input
                type="date"
                className="flex-1 min-w-[140px] text-sm px-3 py-2 rounded-xl border border-gray-200"
                value={editForm.date}
                onChange={(e) => setEditForm((f) => ({ ...f, date: e.target.value }))}
              />
              <select
                className="flex-1 min-w-[120px] text-sm px-3 py-2 rounded-xl border border-gray-200"
                value={editForm.sport}
                onChange={(e) => setEditForm((f) => ({ ...f, sport: e.target.value }))}
              >
                {SPORTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex gap-2 flex-wrap">
              <select
                className="flex-1 text-sm px-3 py-2 rounded-xl border border-gray-200"
                value={editForm.priority}
                onChange={(e) => setEditForm((f) => ({ ...f, priority: e.target.value }))}
              >
                <option value="A">A — goal race</option>
                <option value="B">B race</option>
                <option value="C">C race</option>
              </select>
              <input
                type="number"
                className="flex-1 text-sm px-3 py-2 rounded-xl border border-gray-200"
                placeholder="Target CTL"
                value={editForm.targetCTL}
                onChange={(e) => setEditForm((f) => ({ ...f, targetCTL: e.target.value }))}
              />
            </div>
            <input
              className="w-full text-sm px-3 py-2 rounded-xl border border-gray-200"
              placeholder="Location (optional)"
              value={editForm.location}
              onChange={(e) => setEditForm((f) => ({ ...f, location: e.target.value }))}
            />
            <textarea
              className="w-full text-sm px-3 py-2 rounded-xl border border-gray-200 min-h-[72px] resize-y"
              placeholder="Notes (optional)"
              value={editForm.notes}
              onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
        )}

        <div className="px-5 py-3 border-t border-gray-100 shrink-0 flex flex-col gap-2">
          {editable && !editing && onSave && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              onPointerDown={(e) => e.stopPropagation()}
              className="w-full py-2.5 rounded-xl border border-gray-200 text-gray-700 text-sm font-semibold flex items-center justify-center gap-2"
              style={{ touchAction: 'manipulation' }}
            >
              <PencilIcon className="w-4 h-4" /> Edit race
            </button>
          )}
          {editing ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setEditing(false); setConfirmDelete(false); }}
                onPointerDown={(e) => e.stopPropagation()}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold"
                style={{ touchAction: 'manipulation' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={saving || !editForm.name?.trim()}
                onPointerDown={(e) => e.stopPropagation()}
                className="flex-[1.4] py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold disabled:opacity-50"
                style={{ touchAction: 'manipulation' }}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onClose}
              onPointerDown={(e) => e.stopPropagation()}
              className="w-full py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold"
              style={{ touchAction: 'manipulation' }}
            >
              Close
            </button>
          )}
          {editable && onDelete && !editing && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              onPointerDown={(e) => e.stopPropagation()}
              className={`w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 ${
                confirmDelete
                  ? 'bg-red-600 text-white'
                  : 'border border-red-200 text-red-600 bg-red-50'
              }`}
              style={{ touchAction: 'manipulation' }}
            >
              <TrashIcon className="w-4 h-4" />
              {deleting ? 'Deleting…' : confirmDelete ? 'Tap again to confirm delete' : 'Delete race'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.getElementById('app-modal-root') || document.body,
  );
}

function MetricBox({ label, value, sub, subColor, projected }) {
  return (
    <div className="bg-gray-50 rounded-xl px-3 py-2.5 min-w-0">
      <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide truncate flex items-center gap-0.5 min-w-0">
        <span className="truncate">{label}</span>
        {projected && <ArrowTrendingUpIcon className="w-3 h-3 text-indigo-500 shrink-0" aria-hidden />}
      </div>
      <div className="text-lg font-extrabold text-gray-900 leading-tight mt-0.5">{value}</div>
      {sub && (
        <div className="text-[10px] font-semibold mt-0.5 truncate" style={{ color: subColor || '#9ca3af' }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function LegendDot({ color, label, dashed }) {
  return (
    <div className="flex items-center gap-1.5">
      {dashed ? (
        <svg width="16" height="5" aria-hidden>
          <line x1="0" y1="2.5" x2="16" y2="2.5" stroke={color} strokeWidth="2" strokeDasharray="4 3" />
        </svg>
      ) : (
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
      )}
      <span className="text-xs text-gray-600">{label}</span>
    </div>
  );
}
