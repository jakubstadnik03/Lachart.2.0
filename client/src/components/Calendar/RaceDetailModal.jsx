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
}) {
  const [editing, setEditing] = useState(false);
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
        }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-gray-100 shrink-0">
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

          {/* Post-race reflection — shown once the athlete submitted it */}
          {!editing && race?.postRaceFeedback
            && (race.postRaceFeedback.rpe != null || race.postRaceFeedback.feeling || race.postRaceFeedback.notes) && (() => {
            const fb = race.postRaceFeedback;
            const FEELING = {
              great: '🔥 Great', good: '👍 Good', ok: '😐 OK', tough: '😓 Tough', rough: '😞 Bad',
            };
            return (
              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <div className="text-[10px] font-bold uppercase tracking-wide text-amber-700 mb-1">Race reflection</div>
                <div className="flex items-center gap-3 text-sm font-semibold text-amber-900">
                  {fb.feeling && <span>{FEELING[fb.feeling] || fb.feeling}</span>}
                  {fb.rpe != null && <span>RPE {fb.rpe}/10</span>}
                </div>
                {fb.notes && (
                  <p className="text-xs text-amber-800 italic mt-1 whitespace-pre-wrap">“{fb.notes}”</p>
                )}
              </div>
            );
          })()}

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
          {chartData.length < 2 ? (
            <div className="text-sm text-gray-400 text-center py-12">
              Not enough training data yet — complete a few workouts to see your Form curve.
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-500 mb-3 text-center">
                {isFuture
                  ? 'How your Form (freshness) should build toward race day based on your plan'
                  : 'Your Form leading into race day'}
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
