/**
 * WorkoutPlanModal
 * ─────────────────
 * Portable portal-modal for creating / editing a planned workout.
 * Used from both the Training Calendar (FitAnalysisPage) and the
 * standalone WorkoutPlannerPage.
 *
 * Props:
 *  date        Date     – the day being planned
 *  workout     object?  – existing planned workout (edit mode) or null (create)
 *  context     { ftp, lt1Power, lt2Power }
 *  templates   array    – list of saved templates
 *  onSave(data)         – called with { date, sport, title, description, targetTss, steps }
 *  onDelete(workout)    – called when user deletes an existing workout
 *  onClose()            – close the modal
 */
import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { motion } from 'framer-motion';
import { XMarkIcon, TrashIcon, BookmarkIcon, WrenchScrewdriverIcon, RectangleStackIcon, ArrowRightIcon } from '@heroicons/react/24/outline';
import WorkoutBuilder, { PRESET_CATALOG, buildPresetSteps, computeEstTSS } from './WorkoutBuilder';
import { createWorkoutTemplate } from '../../services/workoutPlannerApi';

// ─── Shared helpers ───────────────────────────────────────────────────────────
export const SPORT_ICONS  = { bike: '/icon/bike.svg', run: '/icon/run.svg', swim: '/icon/swim.svg' };
export const SPORT_COLORS = { bike: '#767EB5', run: '#f97316', swim: '#38bdf8' };
const STEP_COLORS = { warmup:'#fbbf24', work:'#767EB5', recovery:'#6ee7b7', cooldown:'#38bdf8', rest:'#d1d5db' };

export function stepTotalSecs(steps) {
  if (!Array.isArray(steps)) return 0;
  const visited = new Set();
  let total = 0;
  steps.forEach(s => {
    if (!s.groupId) { total += s.durationSeconds || 0; return; }
    if (visited.has(s.groupId)) return;
    visited.add(s.groupId);
    const group = steps.filter(x => x.groupId === s.groupId);
    const reps = (group.find(x => x.isGroupHeader)?.groupRepeat) || 1;
    group.forEach(gs => { total += (gs.durationSeconds || 0) * reps; });
  });
  return total;
}

export function fmtDuration(s) {
  if (!s) return '';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function toLocalISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Mini SVG chart for template cards (with ramp support)
export function MiniWorkoutChart({ steps, height = 20, width = 120 }) {
  if (!steps?.length) return null;
  const expanded = [];
  const visited = new Set();
  steps.forEach(s => {
    if (!s.groupId) { expanded.push(s); return; }
    if (visited.has(s.groupId)) return;
    visited.add(s.groupId);
    const group = steps.filter(x => x.groupId === s.groupId);
    const reps = (group.find(x => x.isGroupHeader)?.groupRepeat) || 1;
    for (let r = 0; r < reps; r++) group.filter(x => !x.isGroupHeader).forEach(gs => expanded.push(gs));
  });
  const total = expanded.reduce((s, x) => s + (x.durationSeconds || 0), 0);
  if (!total) return null;
  const ZONE_COLORS = ['#93c5fd','#86efac','#fde68a','#fb923c','#f87171'];
  const W = width, H = height;
  const FLOOR = 0.12; // minimum bar height as fraction
  // Compute step heights
  const stepIntensities = expanded.map(s => {
    const type = s.stepType;
    if (type === 'work') return 1;
    if (type === 'warmup' || type === 'cooldown') return 0.55;
    if (type === 'recovery') return 0.28;
    if (type === 'rest') return 0.12;
    return 0.4;
  });
  let cx = 0;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      {expanded.map((s, i) => {
        const w = Math.max(1, (s.durationSeconds / total) * W);
        let fill = STEP_COLORS[s.stepType] || '#94a3b8';
        if (s.powerTarget?.type === 'zone') fill = ZONE_COLORS[Math.min((s.powerTarget.value || 1) - 1, 4)];
        const pct = Math.max(FLOOR, stepIntensities[i]);
        const barH = pct * H;
        const bw = Math.max(1, w - 0.5);
        const x = cx; cx += w;
        let shape;
        if (s.isRamp && s.stepType === 'warmup') {
          shape = <polygon key={i} points={`${x},${H} ${x+bw},${H-barH} ${x+bw},${H}`} fill={fill} opacity={0.85} />;
        } else if (s.isRamp && s.stepType === 'cooldown') {
          shape = <polygon key={i} points={`${x},${H-barH} ${x},${H} ${x+bw},${H}`} fill={fill} opacity={0.85} />;
        } else {
          shape = <rect key={i} x={x} y={H - barH} width={bw} height={barH} fill={fill} rx={1} opacity={0.85} />;
        }
        return shape;
      })}
    </svg>
  );
}

// ─── Main modal ────────────────────────────────────────────────────────────────
export default function WorkoutPlanModal({ date, workout, onSave, onDelete, onClose, context = {}, templates = [] }) {
  const isEdit = Boolean(workout?._id);
  const [sport, setSport]         = useState(workout?.sport || 'bike');
  const [title, setTitle]         = useState(workout?.title || '');
  const [desc, setDesc]           = useState(workout?.description || '');
  const [tss, setTss]             = useState(workout?.targetTss || '');
  const [steps, setSteps]         = useState(workout?.steps || []);
  const [saving, setSaving]       = useState(false);
  const [tab, setTab]             = useState('builder');
  const [presetSport, setPresetSport] = useState(workout?.sport || 'bike');

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await onSave({
      date: toLocalISO(date),
      sport,
      title: title.trim(),
      description: desc,
      targetTss: tss ? Number(tss) : undefined,
      steps,
    });
    setSaving(false);
  };

  const loadTemplate = (tpl) => {
    const newSteps = tpl.steps || [];
    setSteps(newSteps);
    if (!title) setTitle(tpl.name);
    const newSport = tpl.sport || sport || 'bike';
    if (!sport) setSport(newSport);
    // Auto-fill Target TSS from template or compute estimate
    if (tpl.targetTss) {
      setTss(String(tpl.targetTss));
    } else if (newSteps.length > 0) {
      const est = computeEstTSS(newSteps, { ...context, sport: newSport });
      if (est > 0) setTss(String(est));
    }
    setTab('builder');
  };

  return ReactDOM.createPortal(
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ zIndex: 99998 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ y: '100%', opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="w-full sm:max-w-2xl bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: '92vh' }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 shrink-0">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-slate-400 font-medium">
              {date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            <h2 className="text-base font-bold text-slate-900 leading-tight">
              {isEdit ? 'Edit planned workout' : 'Plan a workout'}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-4 flex flex-col gap-4">
          {/* Sport + Title row */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1 block">Sport</label>
              <div className="flex gap-2">
                {['bike','run','swim'].map(s => (
                  <button key={s} onClick={() => { setSport(s); setPresetSport(s); }}
                    className={`flex-1 flex flex-col items-center gap-0.5 p-2 rounded-xl border transition-all ${sport === s ? 'border-primary bg-primary/5' : 'border-slate-200 bg-white'}`}>
                    <img src={SPORT_ICONS[s]} alt={s} className="w-5 h-5" />
                    <span className="text-[10px] capitalize text-slate-600">{s}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="col-span-2">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1 block">Title</label>
              <input
                type="text" value={title} onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Threshold intervals"
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
                autoFocus
              />
            </div>
          </div>

          {/* Notes + TSS */}
          <div className="grid grid-cols-4 gap-3">
            <div className="col-span-3">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1 block">Notes</label>
              <textarea rows={2} value={desc} onChange={e => setDesc(e.target.value)}
                placeholder="Coach notes, focus, context…"
                className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1 block">Target TSS</label>
              <input type="number" value={tss} onChange={e => setTss(e.target.value)}
                placeholder="—"
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 text-center"
              />
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-slate-100">
            {[
              { k: 'builder',   label: 'Builder',   Icon: WrenchScrewdriverIcon },
              { k: 'templates', label: 'Templates',  Icon: RectangleStackIcon },
            ].map(({ k, label, Icon }) => (
              <button key={k} onClick={() => setTab(k)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-t-lg transition-colors ${tab === k ? 'bg-primary text-white' : 'text-slate-500 hover:text-slate-700'}`}>
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          {tab === 'builder' && (
            <WorkoutBuilder initialSteps={steps} context={context} sport={sport} onChange={setSteps} />
          )}

          {tab === 'templates' && (
            <div className="flex flex-col gap-4">

              {/* ── Sport switcher ── */}
              <div className="flex gap-1.5 p-1 bg-slate-100 rounded-xl">
                {['bike','run','swim'].map(s => {
                  const SPORT_LABEL = { bike: 'Bike', run: 'Run', swim: 'Swim' };
                  const sportColors = { bike: '#767EB5', run: '#f97316', swim: '#38bdf8' };
                  const isActive = presetSport === s;
                  return (
                    <button
                      key={s}
                      onClick={() => setPresetSport(s)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        isActive ? 'bg-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
                      }`}
                      style={isActive ? { color: sportColors[s] } : {}}
                    >
                      <img src={SPORT_ICONS[s]} alt={s} className="w-3.5 h-3.5" />
                      {SPORT_LABEL[s]}
                    </button>
                  );
                })}
              </div>

              {/* ── Built-in presets for selected sport ── */}
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Built-in workouts</p>
                <div className="grid grid-cols-2 gap-2">
                  {PRESET_CATALOG.filter(p => p.sport === presetSport).map(preset => {
                    const presetSteps = buildPresetSteps(preset.key);
                    return (
                      <button
                        key={preset.key}
                        onClick={() => {
                          setSport(preset.sport);
                          loadTemplate({ name: preset.name, sport: preset.sport, steps: presetSteps });
                        }}
                        className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-all text-left group"
                        style={{ borderLeftColor: preset.color, borderLeftWidth: 3 }}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-slate-800 leading-tight">{preset.name}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{preset.desc}</p>
                          <div className="mt-1.5">
                            <MiniWorkoutChart steps={presetSteps} width={100} height={16} />
                          </div>
                        </div>
                        <ArrowRightIcon className="w-3 h-3 text-slate-300 group-hover:text-slate-600 shrink-0 mt-0.5 transition-colors" />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── My saved templates (filtered to current sport) ── */}
              {(() => {
                const myTpls = templates.filter(t => t.sport === presetSport);
                return (
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">My templates</p>
                    {myTpls.length === 0 ? (
                      <p className="text-sm text-slate-400 text-center py-4 border border-dashed border-slate-200 rounded-xl">
                        No saved templates for {presetSport} yet.
                      </p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {myTpls.map(tpl => (
                          <button key={tpl._id} onClick={() => { setSport(tpl.sport); loadTemplate(tpl); }}
                            className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-white hover:border-primary/50 hover:bg-primary/5 transition-all text-left">
                            <img src={SPORT_ICONS[tpl.sport] || SPORT_ICONS.bike} alt={tpl.sport} className="w-6 h-6 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-slate-800">{tpl.name}</p>
                              <p className="text-[11px] text-slate-400">{tpl.steps?.length || 0} steps · {fmtDuration(stepTotalSecs(tpl.steps))}</p>
                              {tpl.steps?.length > 0 && <div className="mt-1"><MiniWorkoutChart steps={tpl.steps} /></div>}
                            </div>
                            <span className="flex items-center gap-0.5 text-xs text-primary font-semibold shrink-0">Use <ArrowRightIcon className="w-3 h-3" /></span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 shrink-0 bg-white">
          <div className="flex gap-2">
            {isEdit && (
              <button onClick={() => onDelete(workout)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-200 text-red-500 text-sm hover:bg-red-50 transition-colors">
                <TrashIcon className="w-4 h-4" />
              </button>
            )}
            {steps.length > 0 && (
              <button
                onClick={async () => {
                  const name = window.prompt('Template name:', title);
                  if (!name) return;
                  try {
                    await createWorkoutTemplate({ name, sport, steps, description: desc });
                  } catch (_) {}
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 transition-colors">
                <BookmarkIcon className="w-4 h-4" />
                Save as template
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button onClick={handleSave} disabled={!title.trim() || saving}
              className="px-5 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40">
              {saving ? 'Saving…' : isEdit ? 'Update' : 'Plan it'}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}
