/**
 * ComparisonVerdict — the answer, before the chart.
 *
 * Sits above the comparison graph because the graph asks the athlete to do the
 * analysis themselves, and most of them will read a 0.2 mmol wiggle as progress.
 * This block states what changed, and — the part that matters — whether the
 * change is bigger than what the instruments and the session-to-session spread
 * can actually resolve.
 */
import React, { useMemo, useState } from 'react';
import {
  ArrowTrendingDownIcon,
  ArrowTrendingUpIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  MinusIcon,
  ShieldCheckIcon,
  ShieldExclamationIcon,
} from '@heroicons/react/24/outline';
import { buildComparisonVerdict, formatMetric } from '../../utils/comparisonVerdict';

const TONE = {
  good: { bg: '#ECFDF5', border: '#A7F3D0', accent: '#047857' },
  bad: { bg: '#FEF2F2', border: '#FECACA', accent: '#B91C1C' },
  neutral: { bg: '#F8FAFC', border: '#E2E8F0', accent: '#475569' },
};

function formatDate(date) {
  if (!date) return '';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function TrendIcon({ direction, className }) {
  if (direction === 'improving') return <ArrowTrendingUpIcon className={className} />;
  if (direction === 'declining') return <ArrowTrendingDownIcon className={className} />;
  return <MinusIcon className={className} />;
}

export default function ComparisonVerdict({ trainings, metric, workOnly = true }) {
  const [showDetail, setShowDetail] = useState(false);

  const verdict = useMemo(
    () => buildComparisonVerdict(trainings, metric, { workOnly }),
    [trainings, metric, workOnly],
  );

  // Fewer than two comparable sessions is not an error state worth a box —
  // the athlete can see there's only one session in the list.
  if (!verdict) return null;

  const tone = TONE[verdict.headline.tone] || TONE.neutral;
  const { vsPrevious, vsBest, efficiency, projection, latest, previous, best } = verdict;

  return (
    <div
      className="rounded-2xl border p-4 mb-4"
      style={{ background: tone.bg, borderColor: tone.border }}
    >
      {/* The verdict itself */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: tone.accent }}>
            Verdict
          </div>
          <div className="text-lg sm:text-xl font-bold text-gray-900 leading-tight">
            {verdict.headline.verdict}
          </div>
          <div className="text-sm text-gray-600 mt-0.5">{verdict.headline.detail}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Latest</div>
          <div className="text-xl font-bold" style={{ color: tone.accent }}>
            {formatMetric(latest.mean, metric)}
          </div>
          <div className="text-[10px] text-gray-500">{formatDate(latest.date)}</div>
        </div>
      </div>

      {/* Confidence — the line that stops a 0.2 mmol wiggle becoming a training decision */}
      <div className="mt-3 flex items-start gap-2 rounded-xl bg-white/70 px-3 py-2">
        {vsPrevious.significant ? (
          <ShieldCheckIcon className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
        ) : (
          <ShieldExclamationIcon className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
        )}
        <p className="text-xs text-gray-700 leading-relaxed">{vsPrevious.confidenceLine}</p>
      </div>

      {/* Supporting numbers */}
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat
          label="vs last"
          value={vsPrevious.comparable
            ? `${vsPrevious.delta > 0 ? '+' : ''}${formatMetric(vsPrevious.delta, metric)}`
            : '—'}
          sub={previous ? formatDate(previous.date) : null}
          muted={!vsPrevious.significant}
        />
        <Stat
          label="Best ever"
          value={best ? formatMetric(best.mean, metric) : '—'}
          sub={best ? formatDate(best.date) : null}
          muted={!vsBest?.significant}
        />
        <Stat
          label="Efficiency"
          value={efficiency ? efficiency.current.toFixed(2) : '—'}
          sub={efficiency ? `${efficiency.direction} · W/bpm` : 'needs power + HR'}
          icon={efficiency ? <TrendIcon direction={efficiency.direction} className="w-3 h-3" /> : null}
          muted={!efficiency}
        />
        <Stat
          label="Next session"
          value={projection ? formatMetric(projection.next, metric) : '—'}
          sub={projection ? `projected from ${projection.basedOn}` : 'needs 3+ sessions'}
          icon={projection ? <TrendIcon direction={projection.direction} className="w-3 h-3" /> : null}
          muted={!projection || projection.direction === 'flat'}
        />
      </div>

      <button
        type="button"
        onClick={() => setShowDetail((v) => !v)}
        className="mt-2.5 flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-gray-700"
      >
        {showDetail ? 'Hide the maths' : 'How this was decided'}
        {showDetail ? <ChevronUpIcon className="w-3.5 h-3.5" /> : <ChevronDownIcon className="w-3.5 h-3.5" />}
      </button>

      {showDetail && (
        <div className="mt-2 rounded-xl bg-white/70 px-3 py-2.5 space-y-1.5 text-[11px] text-gray-600 leading-relaxed">
          <div>
            <span className="font-semibold text-gray-800">Latest session:</span>{' '}
            {latest.n} interval{latest.n === 1 ? '' : 's'}, mean {formatMetric(latest.mean, metric)},
            spread ±{formatMetric(latest.sd, metric)}.
          </div>
          {previous ? (
            <div>
              <span className="font-semibold text-gray-800">Previous session:</span>{' '}
              {previous.n} interval{previous.n === 1 ? '' : 's'}, mean {formatMetric(previous.mean, metric)},
              spread ±{formatMetric(previous.sd, metric)}.
            </div>
          ) : null}
          <div>
            <span className="font-semibold text-gray-800">Threshold to call it real:</span>{' '}
            {formatMetric(vsPrevious.band, metric)} — the larger of the 95% band around the difference
            ({formatMetric(1.96 * vsPrevious.se, metric)}) and what the instrument can resolve
            ({formatMetric(vsPrevious.floor, metric)}).
          </div>
          <div className="text-gray-500">
            Warm-up and recovery intervals are excluded, so a longer warm-up doesn't move the average.
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub, icon = null, muted = false }) {
  return (
    <div className={`rounded-xl bg-white/70 px-2.5 py-2 ${muted ? 'opacity-60' : ''}`}>
      <div className="text-[9px] font-bold uppercase tracking-wide text-gray-400">{label}</div>
      <div className="text-sm font-bold text-gray-900 flex items-center gap-1">
        {icon}
        {value}
      </div>
      {sub ? <div className="text-[9px] text-gray-500 truncate">{sub}</div> : null}
    </div>
  );
}
