/**
 * RpeCapture — one tap, then the comparison.
 *
 * Deliberately a row of ten buttons rather than a slider or a modal: the whole
 * feature only works if athletes actually rate sessions, and anything that
 * takes more than one tap on a phone won't get done after a hard workout.
 *
 * The payoff is immediate — the moment they tap, they see how their rating sat
 * against what the numbers predicted. That is what makes it worth doing again
 * tomorrow.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowDownRightIcon,
  ArrowUpRightIcon,
  EqualsIcon,
  MinusSmallIcon,
} from '@heroicons/react/24/outline';
import {
  RPE_LABELS,
  assessFeltVsData,
  rpeToBorg,
} from '../../utils/feltVsData';

const DIRECTION_STYLE = {
  harder: { bg: '#FFFBEB', border: '#FDE68A', accent: '#B45309', Icon: ArrowUpRightIcon },
  easier: { bg: '#ECFDF5', border: '#A7F3D0', accent: '#047857', Icon: ArrowDownRightIcon },
  matched: { bg: '#F8FAFC', border: '#E2E8F0', accent: '#475569', Icon: EqualsIcon },
  unknown: { bg: '#F8FAFC', border: '#E2E8F0', accent: '#475569', Icon: MinusSmallIcon },
};

/** Colour ramp across the scale — cool at 1, hot at 10. */
const SWATCH = [
  '#BFDBFE', '#A5D8F3', '#A7F3D0', '#86EFAC', '#FDE68A',
  '#FCD34D', '#FDBA74', '#FB923C', '#F87171', '#EF4444',
];

export default function RpeCapture({
  activity,
  userProfile = null,
  /** 'rpe' (1–10) or 'borg' (6–20) — from trainingPreferences. */
  scale = 'rpe',
  onSave,
  compact = false,
}) {
  const existing = Number(activity?.rpe ?? activity?.RPE) || null;
  const [value, setValue] = useState(existing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const felt = useMemo(
    () => assessFeltVsData({ ...activity, rpe: value }, userProfile),
    [activity, value, userProfile],
  );

  const choose = useCallback(async (next) => {
    setValue(next);
    setError(null);
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave(next);
    } catch (e) {
      setError('Could not save — tap again.');
      setValue(existing);
    } finally {
      setSaving(false);
    }
  }, [onSave, existing]);

  const tone = felt ? DIRECTION_STYLE[felt.direction] : DIRECTION_STYLE.unknown;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
          How did it feel?
        </span>
        {value ? (
          <span className="text-[11px] text-gray-500">
            {scale === 'borg' ? `Borg ${rpeToBorg(value)}` : `${value}/10`}
            <span className="text-gray-400"> · {RPE_LABELS[value]}</span>
          </span>
        ) : (
          <span className="text-[11px] text-gray-400">Tap a number</span>
        )}
      </div>

      <div className="flex gap-1">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
          const active = value === n;
          return (
            <button
              key={n}
              type="button"
              disabled={saving}
              onClick={() => choose(n)}
              aria-label={`${n} — ${RPE_LABELS[n]}`}
              className={`flex-1 rounded-md text-[11px] font-bold transition-all ${
                compact ? 'h-7' : 'h-8'
              } ${active ? 'ring-2 ring-offset-1 ring-gray-800 text-gray-900' : 'text-gray-600 hover:brightness-95'}`}
              style={{ background: SWATCH[n - 1], opacity: value && !active ? 0.45 : 1 }}
            >
              {scale === 'borg' ? rpeToBorg(n) : n}
            </button>
          );
        })}
      </div>

      {error ? <p className="text-[11px] text-rose-600 mt-1.5">{error}</p> : null}

      {/* The payoff — shown the instant they tap. */}
      {felt && !error ? (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-2 rounded-xl border px-3 py-2"
          style={{ background: tone.bg, borderColor: tone.border }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 text-xs font-bold" style={{ color: tone.accent }}>
              <tone.Icon className="w-3.5 h-3.5 shrink-0" />
              {felt.verdict}
            </span>
            {felt.expected !== null ? (
              <span className="text-[11px] text-gray-500">
                you {felt.rpe} · data {felt.expected}
              </span>
            ) : null}
          </div>
          <p className="text-[11px] text-gray-600 leading-relaxed mt-0.5">{felt.note}</p>
        </motion.div>
      ) : null}
    </div>
  );
}
