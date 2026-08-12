/**
 * MoveCostDialog — what this move costs, before it happens.
 *
 * Shown on drop rather than on drag: the athlete has already decided where they
 * want it, and interrupting mid-drag with a tooltip they can't read while
 * holding the mouse down helps nobody.
 *
 * A free move confirms itself and never opens this dialog — see shouldConfirm().
 * Nagging on every drag is how a warning becomes something people click through
 * without reading.
 */
import React from 'react';
import ReactDOM from 'react-dom';
import { motion } from 'framer-motion';
import {
  ArrowRightIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';

const SEVERITY = {
  high: { accent: '#B91C1C', bg: '#FEF2F2', border: '#FECACA', cta: 'Move it anyway' },
  medium: { accent: '#B45309', bg: '#FFFBEB', border: '#FDE68A', cta: 'Move it' },
  low: { accent: '#475569', bg: '#F8FAFC', border: '#E2E8F0', cta: 'Move it' },
  none: { accent: '#047857', bg: '#ECFDF5', border: '#A7F3D0', cta: 'Move it' },
};

const DOT = { high: '#DC2626', medium: '#F59E0B', low: '#94A3B8' };

/**
 * Only interrupt when there is something worth reading. A move with no
 * consequences should feel like it always did — instant.
 */
export function shouldConfirm(assessment) {
  return !!assessment && assessment.severity !== 'none' && assessment.severity !== 'low';
}

function formatDay(key) {
  const d = new Date(`${key}T12:00:00`);
  if (Number.isNaN(d.getTime())) return key;
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

/**
 * The panel itself, without the portal.
 *
 * Split out because a portal cannot be server-rendered, and this is the part
 * worth rendering in tests and in the design preview.
 */
export function MoveCostPanel({ assessment, onConfirm, onCancel }) {
  if (!assessment) return null;
  const tone = SEVERITY[assessment.severity] || SEVERITY.low;

  return (
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden"
      >
        <div className="px-4 pt-4 pb-3" style={{ background: tone.bg, borderBottom: `1px solid ${tone.border}` }}>
          <div className="flex items-start gap-2">
            {assessment.severity === 'none'
              ? <CheckCircleIcon className="w-5 h-5 mt-0.5 shrink-0" style={{ color: tone.accent }} />
              : <ExclamationTriangleIcon className="w-5 h-5 mt-0.5 shrink-0" style={{ color: tone.accent }} />}
            <div className="min-w-0">
              <div className="text-base font-bold" style={{ color: tone.accent }}>
                {assessment.headline}
              </div>
              <div className="text-xs text-gray-600 mt-0.5 flex items-center gap-1.5 flex-wrap">
                <span className="font-semibold text-gray-800">{assessment.workoutTitle}</span>
                <span>{formatDay(assessment.from)}</span>
                <ArrowRightIcon className="w-3 h-3" />
                <span className="font-semibold text-gray-800">{formatDay(assessment.to)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 py-3 space-y-2">
          {assessment.costs.map((c) => (
            <div key={c.id} className="flex items-start gap-2">
              <span
                className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                style={{ background: DOT[c.severity] }}
              />
              <p className="text-sm text-gray-700 leading-relaxed">{c.text}</p>
            </div>
          ))}
          {assessment.neutral.map((n) => (
            <div key={n.id} className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 bg-emerald-400" />
              <p className="text-sm text-gray-500 leading-relaxed">{n.text}</p>
            </div>
          ))}
          {!assessment.costs.length && !assessment.neutral.length ? (
            <p className="text-sm text-gray-500">Nothing else on those days.</p>
          ) : null}
        </div>

        <div className="px-4 pb-4 pt-1 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Keep it where it is
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ background: tone.accent }}
          >
            {tone.cta}
          </button>
        </div>
      </motion.div>
  );
}

export default function MoveCostDialog({ assessment, onConfirm, onCancel }) {
  if (!assessment) return null;
  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={onCancel}
    >
      <MoveCostPanel assessment={assessment} onConfirm={onConfirm} onCancel={onCancel} />
    </div>,
    document.body,
  );
}
