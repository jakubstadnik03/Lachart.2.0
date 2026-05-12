import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Trash, Save, X, Activity, Edit2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { computeVLamax, interpretVLamax } from './vlamaxCalculator';
import {
  getVLamaxTestsByAthleteId,
  addVLamaxTest,
  updateVLamaxTest,
  deleteVLamaxTest,
} from '../../services/api';
import { useNotification } from '../../context/NotificationContext';

const DEFAULT_SAMPLES = (sport) => {
  // Recommended sampling schedule. Peak typically 3–7 min after the sprint
  // depending on sport / lactate clearance.
  if (sport === 'swim') return [{ tMin: 1, lactate: '' }, { tMin: 3, lactate: '' }, { tMin: 5, lactate: '' }];
  return [
    { tMin: 1, lactate: '' },
    { tMin: 3, lactate: '' },
    { tMin: 5, lactate: '' },
    { tMin: 7, lactate: '' },
  ];
};

function VLamaxCard({ test, onEdit, onDelete }) {
  const interp = interpretVLamax(test.vlamax);
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <div className="font-bold text-gray-900 truncate">{test.title || 'VLamax Sprint'}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {new Date(test.date).toLocaleDateString()} · {test.sport} · {test.sprintDurationSec}s sprint
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onEdit} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100" title="Edit">
            <Edit2 size={14} />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50" title="Delete">
            <Trash size={14} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="bg-gradient-to-br from-rose-50 to-amber-50 rounded-xl p-3 border border-rose-100">
          <div className="text-[10px] font-bold text-rose-700 uppercase tracking-wider">VLamax</div>
          <div className="text-xl font-bold text-gray-900 mt-0.5">
            {test.vlamax != null ? test.vlamax.toFixed(2) : '—'}
            <span className="text-[10px] text-gray-500 ml-1">mmol/L/s</span>
          </div>
        </div>
        <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
          <div className="text-[10px] font-bold text-gray-700 uppercase tracking-wider">Peak La</div>
          <div className="text-xl font-bold text-gray-900 mt-0.5">
            {test.peakLactate != null ? test.peakLactate.toFixed(1) : '—'}
            <span className="text-[10px] text-gray-500 ml-1">mmol/L</span>
          </div>
        </div>
        <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
          <div className="text-[10px] font-bold text-gray-700 uppercase tracking-wider">Δ Pre→Peak</div>
          <div className="text-xl font-bold text-gray-900 mt-0.5">
            {(test.peakLactate != null && test.preLactate != null)
              ? `+${(test.peakLactate - test.preLactate).toFixed(1)}`
              : '—'}
          </div>
        </div>
      </div>

      {interp && (
        <div className={`rounded-xl border p-3 text-xs ${interp.color}`}>
          <div className="font-bold uppercase tracking-wider text-[10px] mb-0.5">Profile</div>
          <div className="font-semibold">{interp.label}</div>
          <div className="opacity-80 mt-0.5">{interp.hint}</div>
        </div>
      )}

      <details className="mt-3 text-xs text-gray-500">
        <summary className="cursor-pointer hover:text-gray-700">
          Show samples (pre {test.preLactate?.toFixed(1)} mmol + {test.samples?.length || 0})
        </summary>
        <div className="mt-2 space-y-1">
          <div className="flex justify-between border-b border-gray-50 py-1">
            <span>pre-sprint</span>
            <span className="font-mono">{test.preLactate?.toFixed(1)} mmol/L</span>
          </div>
          {(test.samples || []).map((s, i) => (
            <div key={i} className="flex justify-between border-b border-gray-50 py-1">
              <span>+{s.tMin} min</span>
              <span className="font-mono">{s.lactate?.toFixed(1)} mmol/L</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

function VLamaxEditor({ initial, athleteId, sport, onSaved, onCancel }) {
  const { addNotification } = useNotification();
  const [draft, setDraft] = useState(() => ({
    title: initial?.title || 'VLamax Sprint Test',
    sport: initial?.sport || sport || 'bike',
    date: initial?.date
      ? new Date(initial.date).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10),
    notes: initial?.notes || '',
    sprintDurationSec: initial?.sprintDurationSec ?? (sport === 'swim' ? 20 : 15),
    alacticOffsetSec: initial?.alacticOffsetSec ?? 3.0,
    sprintAvgPower: initial?.sprintAvgPower ?? '',
    sprintAvgPace: initial?.sprintAvgPace ?? '',
    sprintDistanceM: initial?.sprintDistanceM ?? '',
    preLactate: initial?.preLactate ?? '',
    samples: initial?.samples?.length
      ? initial.samples.map(s => ({ ...s }))
      : DEFAULT_SAMPLES(sport),
  }));
  const [saving, setSaving] = useState(false);

  const computed = useMemo(() => {
    return computeVLamax({
      preLactate: draft.preLactate,
      samples: draft.samples,
      sprintDurationSec: draft.sprintDurationSec,
      alacticOffsetSec: draft.alacticOffsetSec,
    });
  }, [draft]);

  const updateSample = (idx, next) => {
    setDraft(d => ({ ...d, samples: d.samples.map((s, i) => (i === idx ? next : s)) }));
  };
  const addSample = () => {
    setDraft(d => {
      const lastT = d.samples.length ? Number(d.samples[d.samples.length - 1].tMin) || 0 : 0;
      return { ...d, samples: [...d.samples, { tMin: lastT + 2, lactate: '' }] };
    });
  };
  const removeSample = (idx) => {
    setDraft(d => ({ ...d, samples: d.samples.filter((_, i) => i !== idx) }));
  };

  const canSave = useMemo(() => {
    return computed && computed.vlamax != null && computed.vlamax > 0;
  }, [computed]);

  const handleSave = async () => {
    if (!canSave) {
      addNotification('Need pre-sprint lactate + at least one post-sprint sample.', 'warning');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...draft,
        athleteId,
        preLactate: Number(draft.preLactate),
        sprintDurationSec: Number(draft.sprintDurationSec),
        alacticOffsetSec: Number(draft.alacticOffsetSec),
        sprintAvgPower: draft.sprintAvgPower !== '' ? Number(draft.sprintAvgPower) : null,
        sprintAvgPace: draft.sprintAvgPace !== '' ? Number(draft.sprintAvgPace) : null,
        sprintDistanceM: draft.sprintDistanceM !== '' ? Number(draft.sprintDistanceM) : null,
        samples: draft.samples
          .filter(s => Number(s.tMin) >= 0 && Number(s.lactate) > 0)
          .map(s => ({ tMin: Number(s.tMin), lactate: Number(s.lactate) })),
        vlamax: computed.vlamax,
        peakLactate: computed.peakLactate,
        peakAtMin: computed.peakAtMin,
      };
      const saved = initial?._id
        ? await updateVLamaxTest(initial._id, payload)
        : await addVLamaxTest(payload);
      addNotification(initial?._id ? 'VLamax test updated.' : 'VLamax test saved.', 'success');
      onSaved(saved);
    } catch (err) {
      addNotification(err?.response?.data?.error || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const interp = computed ? interpretVLamax(computed.vlamax) : null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-gray-900 flex items-center gap-2">
          <Activity size={16} className="text-rose-500" />
          {initial?._id ? 'Edit VLamax test' : 'New VLamax test'}
        </h3>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
          <X size={18} />
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <div>
          <label className="block text-[11px] font-medium text-gray-600 mb-1">Date</label>
          <input type="date" value={draft.date}
            onChange={(e) => setDraft(d => ({ ...d, date: e.target.value }))}
            className="w-full p-1.5 text-sm border border-gray-200 rounded-lg" />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-gray-600 mb-1">Sport</label>
          <select value={draft.sport}
            onChange={(e) => setDraft(d => ({ ...d, sport: e.target.value }))}
            className="w-full p-1.5 text-sm border border-gray-200 rounded-lg bg-white">
            <option value="bike">Bike</option>
            <option value="run">Run</option>
            <option value="swim">Swim</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-gray-600 mb-1">Sprint (sec)</label>
          <input type="number" min={5} max={60} step={1}
            value={draft.sprintDurationSec}
            onChange={(e) => setDraft(d => ({ ...d, sprintDurationSec: e.target.value }))}
            className="w-full p-1.5 text-sm border border-gray-200 rounded-lg" />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-gray-600 mb-1" title="Alactic phosphagen window — period before lactate accumulates. Typically 3.0–3.5 s.">
            Alactic offset
          </label>
          <input type="number" min={1} max={6} step={0.1}
            value={draft.alacticOffsetSec}
            onChange={(e) => setDraft(d => ({ ...d, alacticOffsetSec: e.target.value }))}
            className="w-full p-1.5 text-sm border border-gray-200 rounded-lg" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <label className="block text-[11px] font-medium text-gray-600 mb-1">Pre-sprint lactate</label>
          <input type="number" step={0.1} placeholder="mmol/L"
            value={draft.preLactate}
            onChange={(e) => setDraft(d => ({ ...d, preLactate: e.target.value }))}
            className="w-full p-1.5 text-sm border border-gray-200 rounded-lg" />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-gray-600 mb-1">
            {draft.sport === 'bike' ? 'Sprint avg power (W)' : draft.sport === 'swim' ? 'Pace (sec/100m)' : 'Pace (sec/km)'} <span className="opacity-50">(opt.)</span>
          </label>
          <input type="number"
            value={draft.sport === 'bike' ? draft.sprintAvgPower : draft.sprintAvgPace}
            onChange={(e) => setDraft(d => draft.sport === 'bike'
              ? ({ ...d, sprintAvgPower: e.target.value })
              : ({ ...d, sprintAvgPace: e.target.value }))}
            className="w-full p-1.5 text-sm border border-gray-200 rounded-lg" />
        </div>
      </div>

      <div className="rounded-xl border border-gray-100 bg-gray-50/40 p-3 mb-3">
        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">
          Post-sprint lactate samples
        </div>
        <div className="grid grid-cols-[28px_1fr_1fr_28px] gap-2 items-center text-[10px] font-bold text-gray-500 mb-1 px-0.5">
          <div className="text-center">#</div>
          <div className="text-center">+min</div>
          <div className="text-center">mmol/L</div>
          <div />
        </div>
        {(draft.samples || []).map((s, idx) => (
          <div key={idx} className="grid grid-cols-[28px_1fr_1fr_28px] gap-2 items-center py-1">
            <div className="text-xs text-gray-400 text-center">{idx + 1}</div>
            <input type="number" min={0} max={30} step={1}
              value={s.tMin}
              onChange={(e) => updateSample(idx, { ...s, tMin: e.target.value })}
              className="w-full p-1 text-sm border border-gray-200 rounded-lg text-center" />
            <input type="number" step={0.1}
              value={s.lactate}
              onChange={(e) => updateSample(idx, { ...s, lactate: e.target.value })}
              className="w-full p-1 text-sm border border-gray-200 rounded-lg text-center" />
            <button type="button" onClick={() => removeSample(idx)}
              className="text-red-500 hover:text-red-700"><Trash size={14} /></button>
          </div>
        ))}
        <button type="button" onClick={addSample}
          className="mt-1 w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 rounded-lg hover:bg-rose-100 transition-colors">
          <Plus size={12} /> Add sample
        </button>
      </div>

      {computed && computed.vlamax != null && (
        <div className={`rounded-xl border p-3 mb-3 ${interp?.color || 'bg-rose-50 border-rose-100 text-rose-800'}`}>
          <div className="text-[10px] font-bold uppercase tracking-wider mb-1">Live result</div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold">{computed.vlamax.toFixed(2)}</span>
            <span className="text-xs opacity-70">mmol/L/s</span>
            <span className="text-xs opacity-60 ml-auto">
              peak {computed.peakLactate.toFixed(1)} at +{computed.peakAtMin}min
            </span>
          </div>
          {interp && (
            <div className="text-xs mt-1 opacity-90">
              <strong>{interp.label}.</strong> {interp.hint}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={onCancel}
          className="flex-1 px-3 py-2 text-sm text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200">
          Cancel
        </button>
        <button type="button" onClick={handleSave} disabled={!canSave || saving}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-rose-600 rounded-xl hover:bg-rose-700 disabled:opacity-50">
          <Save size={14} /> {saving ? 'Saving…' : initial?._id ? 'Update' : 'Save'}
        </button>
      </div>
    </div>
  );
}

export default function VLamaxPanel({ athleteId, sport = 'bike' }) {
  const { addNotification } = useNotification();
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);

  const loadAll = useCallback(async () => {
    if (!athleteId) { setLoading(false); return; }
    setLoading(true);
    try {
      const arr = await getVLamaxTestsByAthleteId(athleteId).catch(() => []);
      setTests(Array.isArray(arr) ? arr : []);
    } finally { setLoading(false); }
  }, [athleteId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const filtered = useMemo(
    () => tests.filter(t => t.sport === sport).sort((a, b) => new Date(b.date) - new Date(a.date)),
    [tests, sport]
  );

  const handleSaved = (saved) => {
    setEditing(null);
    setTests(prev => [saved, ...prev.filter(t => t._id !== saved._id)]);
  };
  const handleDelete = async (test) => {
    if (!window.confirm(`Delete VLamax test from ${new Date(test.date).toLocaleDateString()}?`)) return;
    try {
      await deleteVLamaxTest(test._id);
      setTests(prev => prev.filter(t => t._id !== test._id));
      addNotification('VLamax test deleted.', 'success');
    } catch (err) {
      addNotification(err?.response?.data?.error || 'Delete failed', 'error');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-rose-500" />
          <h3 className="font-bold text-gray-900">VLamax Sprint Tests</h3>
          <span className="text-xs text-gray-400">({filtered.length})</span>
        </div>
        {!editing && (
          <button onClick={() => setEditing('new')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 rounded-xl hover:bg-rose-700">
            <Plus size={12} /> New VLamax test
          </button>
        )}
      </div>

      <AnimatePresence>
        {editing && (
          <motion.div key="vlamax-editor"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden">
            <VLamaxEditor
              initial={editing === 'new' ? null : editing}
              athleteId={athleteId}
              sport={sport}
              onSaved={handleSaved}
              onCancel={() => setEditing(null)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="text-center text-sm text-gray-400 py-8">Loading…</div>
      ) : filtered.length === 0 && !editing ? (
        <div className="text-center text-sm text-gray-400 py-8 bg-gray-50 rounded-2xl border border-gray-100">
          No VLamax tests yet for {sport}. The 15-second sprint test reveals glycolytic capacity — useful alongside LT for profiling.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(test => (
            <VLamaxCard key={test._id} test={test}
              onEdit={() => setEditing(test)}
              onDelete={() => handleDelete(test)} />
          ))}
        </div>
      )}
    </div>
  );
}
