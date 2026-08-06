/**
 * HealthCalendarStrip - the health entry point, sitting above the calendar grid.
 *
 * The calendar is what the athlete came for, so a healthy athlete gets one
 * muted line and nothing else. The moment something is open the row earns its
 * space: the traffic light, why it is that colour, and the check-in that keeps
 * the verdict honest, all without scrolling down to the panels.
 */
import React from 'react';
import { PlusIcon } from '@heroicons/react/24/outline';
import { LIGHT_COLORS, LIGHT_LABELS } from '../../services/healthApi';

const SEVERITY = { red: 3, amber: 2, green: 1 };

/** Worst light first - the red episode is the one that decides today. */
function bySeverity(a, b) {
  return (SEVERITY[b?.gate?.light] || 0) - (SEVERITY[a?.gate?.light] || 0);
}

function LogButton({ onClick, label = 'Log an injury or illness', iconOnly = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={iconOnly ? label : undefined}
      title={iconOnly ? label : undefined}
      className={`flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 flex-shrink-0 ${
        iconOnly ? 'p-1.5' : 'px-2.5 py-1.5 text-xs'
      }`}
    >
      <PlusIcon className="w-3.5 h-3.5" />
      {!iconOnly && label}
    </button>
  );
}

function EpisodeChip({ item, onOpenEpisode }) {
  const { episode, catalogEntry, gate } = item;
  const light = gate?.light || 'green';
  const colors = LIGHT_COLORS[light] || LIGHT_COLORS.green;
  const stages = catalogEntry?.stages || [];
  const stageIndex = (episode?.currentStageIndex ?? 0) + 1;
  const side = episode?.side && episode.side !== 'n/a' ? ` · ${episode.side}` : '';
  // A red or amber light with no reason attached still has to say something,
  // otherwise the chip looks alarming and explains nothing.
  const warning = light === 'green' ? null : (gate?.reasons?.[0]?.title || LIGHT_LABELS[light]);

  return (
    <button
      type="button"
      onClick={() => onOpenEpisode?.(item)}
      className={`flex items-center gap-2 max-w-full min-w-0 rounded-lg border px-2.5 py-1.5 text-left transition-shadow hover:shadow-sm ${colors.bg} ${colors.border}`}
    >
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${colors.dot}`} />
      <span className="text-xs font-semibold text-gray-900 truncate">
        {catalogEntry?.shortLabel || catalogEntry?.label || episode?.catalogId}
        {side}
      </span>
      {stages.length > 0 && (
        <span className="text-[11px] text-gray-500 whitespace-nowrap flex-shrink-0">
          Stage {stageIndex} of {stages.length}
        </span>
      )}
      {warning && (
        <span className={`text-[11px] font-medium truncate ${colors.text}`}>
          {warning}
        </span>
      )}
    </button>
  );
}

export default function HealthCalendarStrip({
  items = [],
  loading = false,
  error = null,
  // False once the catalogue failed to load: the wizard's first step is the
  // body-site grid, so offering "log something" would open an empty shell the
  // athlete cannot get out of except by closing it.
  canLog = true,
  onLogNew,
  onCheckIn,
  onOpenEpisode,
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 px-1 py-1.5" aria-hidden="true">
        <div className="h-6 w-44 rounded-lg bg-gray-100 animate-pulse" />
        <div className="h-6 w-24 rounded-lg bg-gray-100 animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-between gap-3 px-1 py-1.5">
        <span className="text-xs text-gray-400 truncate">Health status is unavailable right now.</span>
        {canLog && onLogNew && <LogButton onClick={onLogNew} />}
      </div>
    );
  }

  const open = (items || []).filter((it) => it?.episode?._id && it?.catalogEntry);

  if (open.length === 0) {
    return (
      <div className="flex items-center justify-between gap-3 flex-wrap px-1 py-1.5">
        <span className="text-xs text-gray-400">
          Nothing open. A niggle logged on day one is a much shorter story than one noticed three weeks in.
        </span>
        {canLog && <LogButton onClick={onLogNew} />}
      </div>
    );
  }

  const sorted = [...open].sort(bySeverity);
  const needsCheckIn = sorted.filter((it) => !it.checkedInToday);
  const checkInTarget = needsCheckIn[0] || null;
  const checkInEntry = checkInTarget?.catalogEntry;
  const checkInLabel = needsCheckIn.length > 1 && checkInEntry
    ? `Check in · ${checkInEntry.shortLabel || checkInEntry.label}`
    : 'Check in';

  return (
    <div className="flex items-center gap-2 flex-wrap bg-white rounded-xl border border-gray-200 px-3 py-2">
      {sorted.map((item) => (
        <EpisodeChip key={item.episode._id} item={item} onOpenEpisode={onOpenEpisode} />
      ))}

      <div className="flex items-center gap-2 ml-auto flex-shrink-0">
        {checkInTarget && (
          <button
            type="button"
            onClick={() => onCheckIn?.(checkInTarget)}
            className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 max-w-[220px] truncate"
          >
            {checkInLabel}
          </button>
        )}
        {canLog && <LogButton onClick={onLogNew} iconOnly />}
      </div>
    </div>
  );
}
