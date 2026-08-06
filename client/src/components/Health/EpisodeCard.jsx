/**
 * EpisodeCard - one open injury or illness: today's verdict, where the athlete
 * is in the protocol, and what has to happen before the next stage unlocks.
 *
 * The gate checklist is deliberately shown in full rather than collapsed into
 * "not ready yet". People rush a comeback because the plan is opaque; a visible
 * "3 / 5 pain-free days" is what makes waiting feel like progress.
 */
import React, { useState } from 'react';
import {
  ExclamationTriangleIcon, CheckCircleIcon, ArrowRightIcon, ArrowUturnLeftIcon,
  EllipsisHorizontalIcon, TrashIcon, PencilSquareIcon, ForwardIcon,
} from '@heroicons/react/24/outline';
import {
  LIGHT_COLORS, LIGHT_LABELS, loadResponseHeadline, formatDistance, formatPace,
  advanceStage, stepBackStage, markSpeedStepCleared,
  deleteEpisode, updateEpisode, setStage, todayKey,
} from '../../services/healthApi';

/**
 * Delete, correct the start date, or jump to the right stage.
 *
 * These belong together because they are all "I logged this after the fact"
 * repairs. Someone who records an injury three weeks late is not on stage one
 * and did not start today, and without a way to say so the plan is wrong from
 * the first day and every percentage derived from it is wrong too.
 */
function EpisodeAdminMenu({ episode, catalogEntry, onChanged }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState(null); // 'date' | 'stage' | 'delete'
  const [startDate, setStartDate] = useState(episode.startDate || todayKey());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setMode(null);
      setOpen(false);
      onChanged?.();
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Did not work');
    } finally {
      setBusy(false);
    }
  };

  const stages = catalogEntry?.stages || [];

  return (
    <div className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); setMode(null); setError(null); }}
        className="p-1 -mr-1 text-gray-400 hover:text-gray-600 rounded"
        aria-label="Episode options"
      >
        <EllipsisHorizontalIcon className="w-5 h-5" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => { setOpen(false); setMode(null); }} />
          <div className="absolute right-0 top-7 z-20 w-64 bg-white border border-gray-200 rounded-xl shadow-lg p-1.5">
            {!mode && (
              <>
                <MenuItem icon={PencilSquareIcon} label="Correct the start date" onClick={() => setMode('date')} />
                {stages.length > 1 && (
                  <MenuItem icon={ForwardIcon} label="Set the current stage" onClick={() => setMode('stage')} />
                )}
                <MenuItem icon={TrashIcon} label="Delete this episode" danger onClick={() => setMode('delete')} />
              </>
            )}

            {mode === 'date' && (
              <div className="p-2">
                <div className="text-xs font-semibold text-gray-800 mb-1.5">When did it actually start?</div>
                <input
                  type="date"
                  value={startDate}
                  max={todayKey()}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-2.5 py-2 border border-gray-300 rounded-md text-sm"
                />
                <p className="text-[11px] text-gray-500 mt-1.5 leading-snug">
                  Changing this recalculates your pre-injury baseline, since that is the eight
                  weeks before onset.
                </p>
                {error && <div className="text-[11px] text-red-600 mt-1">{error}</div>}
                <div className="flex gap-1.5 mt-2">
                  <button type="button" onClick={() => setMode(null)} className="px-2.5 py-1.5 text-xs text-gray-600">
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => run(() => updateEpisode(episode._id, { startDate }))}
                    className="flex-1 px-2.5 py-1.5 rounded-md bg-blue-600 text-white text-xs font-semibold disabled:bg-gray-300"
                  >
                    {busy ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            )}

            {mode === 'stage' && (
              <div className="p-2">
                <div className="text-xs font-semibold text-gray-800 mb-1.5">Which stage are you on?</div>
                <div className="space-y-1 max-h-56 overflow-y-auto">
                  {stages.map((s, i) => (
                    <button
                      key={s.id}
                      type="button"
                      disabled={busy}
                      onClick={() => run(() => setStage(episode._id, i))}
                      className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs ${
                        i === episode.currentStageIndex
                          ? 'bg-blue-50 text-blue-800 font-semibold'
                          : 'hover:bg-gray-50 text-gray-700'
                      }`}
                    >
                      {i + 1}. {s.name}
                    </button>
                  ))}
                </div>
                {error && <div className="text-[11px] text-red-600 mt-1">{error}</div>}
              </div>
            )}

            {mode === 'delete' && (
              <div className="p-2">
                <div className="text-xs font-semibold text-gray-800">Delete this episode?</div>
                <p className="text-[11px] text-gray-500 mt-1 leading-snug">
                  Its check-ins and its band on the calendar go with it. This cannot be undone.
                </p>
                {error && <div className="text-[11px] text-red-600 mt-1">{error}</div>}
                <div className="flex gap-1.5 mt-2">
                  <button type="button" onClick={() => setMode(null)} className="px-2.5 py-1.5 text-xs text-gray-600">
                    Keep it
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => run(() => deleteEpisode(episode._id))}
                    className="flex-1 px-2.5 py-1.5 rounded-md bg-red-600 text-white text-xs font-semibold disabled:bg-gray-300"
                  >
                    {busy ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({ icon: Icon, label, onClick, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-left ${
        danger ? 'text-red-700 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-50'
      }`}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      {label}
    </button>
  );
}

/**
 * Muscle-strain stages progress in speed, not volume. The ladder is shown as
 * discrete rungs because that is how the protocol works - one step per session
 * with 48 h between, never two in a week.
 */
function SpeedLadder({ ladder, reached, onClear, busy }) {
  const next = ladder.find((v) => v > (reached || 0));
  return (
    <div className="mt-3 border-t border-gray-100 pt-2.5">
      <div className="text-xs font-semibold text-gray-700 mb-1.5">Speed progression</div>
      <div className="flex gap-1 mb-2">
        {ladder.map((pct) => {
          const done = (reached || 0) >= pct;
          const isNext = pct === next;
          return (
            <div
              key={pct}
              className="flex-1 text-center py-1 rounded text-[10px] font-bold"
              style={{
                background: done ? '#16A34A' : isNext ? '#DBEAFE' : '#F3F4F6',
                color: done ? '#fff' : isNext ? '#1D4ED8' : '#9CA3AF',
              }}
            >
              {pct}%
            </div>
          );
        })}
      </div>
      {next ? (
        <button
          type="button"
          onClick={onClear}
          disabled={busy}
          className="w-full py-2 rounded-lg text-xs font-semibold bg-gray-100 text-gray-800 hover:bg-gray-200 disabled:opacity-50"
        >
          I completed {next}% pain-free - unlock the next step
        </button>
      ) : (
        <div className="text-xs text-green-700">Full speed cleared.</div>
      )}
    </div>
  );
}

function StageTrack({ stages = [], currentIndex = 0 }) {
  return (
    <div className="flex gap-1">
      {stages.map((s, i) => (
        <div
          key={s.id}
          className="flex-1 h-1.5 rounded-full"
          style={{ background: i < currentIndex ? '#16A34A' : i === currentIndex ? '#2563EB' : '#E5E7EB' }}
          title={s.name}
        />
      ))}
    </div>
  );
}

function GateCondition({ condition }) {
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <span
        className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
          condition.met ? 'bg-green-500' : 'bg-gray-200'
        }`}
      >
        {condition.met && (
          <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M2 6l3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <div className="flex-1 min-w-0">
        <div className={`text-sm ${condition.met ? 'text-gray-500 line-through' : 'text-gray-800'}`}>
          {condition.label}
        </div>
        {condition.detail && (
          <div className="text-xs text-gray-500 mt-0.5">{condition.detail}</div>
        )}
      </div>
    </div>
  );
}

export default function EpisodeCard({
  item,
  onCheckIn,
  onChanged,
  onOpenDetail,
  compact = false,
}) {
  const { episode, catalogEntry, gate, checkedInToday } = item || {};
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);

  if (!episode || !catalogEntry) return null;

  const light = gate?.light || 'green';
  const colors = LIGHT_COLORS[light] || LIGHT_COLORS.green;
  const caps = gate?.caps;
  const stages = catalogEntry.stages || [];
  const stageIndex = episode.currentStageIndex ?? 0;
  const stage = stages[stageIndex];

  const doAdvance = async () => {
    setBusy(true);
    setActionError(null);
    try {
      await advanceStage(episode._id);
      onChanged?.();
    } catch (e) {
      setActionError(e?.response?.data?.error || 'Could not advance');
    } finally {
      setBusy(false);
    }
  };

  const doClearSpeedStep = async () => {
    setBusy(true);
    setActionError(null);
    try {
      await markSpeedStepCleared(episode._id);
      onChanged?.();
    } catch (e) {
      setActionError(e?.response?.data?.error || 'Could not update');
    } finally {
      setBusy(false);
    }
  };

  const doStepBack = async () => {
    setBusy(true);
    setActionError(null);
    try {
      await stepBackStage(episode._id, gate?.reasons?.[0]?.title || 'Symptoms flared');
      onChanged?.();
    } catch (e) {
      setActionError(e?.response?.data?.error || 'Could not step back');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Verdict */}
      <div className={`px-4 py-3 ${colors.bg} border-b ${colors.border}`}>
        <div className="flex items-center gap-2.5">
          <span className={`w-2.5 h-2.5 rounded-full ${colors.dot} flex-shrink-0`} />
          <div className={`text-sm font-semibold ${colors.text}`}>{LIGHT_LABELS[light]}</div>
          {!checkedInToday && (
            <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-white/70 text-gray-600 font-medium">
              No check-in today
            </span>
          )}
        </div>
        {gate?.reasons?.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {gate.reasons.slice(0, compact ? 1 : 3).map((r, i) => (
              <div key={`${r.id}-${i}`} className="flex items-start gap-2">
                <ExclamationTriangleIcon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${colors.text}`} />
                <div className="min-w-0">
                  <div className={`text-xs font-semibold ${colors.text}`}>{r.title}</div>
                  <div className="text-xs text-gray-600 leading-snug">{r.body}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        {gate?.requiresMedicalAttention && (
          <div className="mt-2 text-xs text-red-700 bg-white/70 rounded-lg px-2.5 py-2">
            This is not a training-load problem. Please get it looked at before your next session.
          </div>
        )}
      </div>

      {/* Identity + stage */}
      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => onOpenDetail?.(episode)}
              className="text-left"
            >
              <div className="text-sm font-semibold text-gray-900 truncate">
                {catalogEntry.shortLabel || catalogEntry.label}
                {episode.side && episode.side !== 'n/a' ? ` · ${episode.side}` : ''}
              </div>
            </button>
            <div className="text-xs text-gray-500 mt-0.5">
              Day {Math.max(1, Math.round((Date.now() - new Date(`${episode.startDate}T00:00:00Z`)) / 86400000))}
              {episode.isRecurrence && ' · repeat'}
              {episode.stepBackCount > 0 && ` · ${episode.stepBackCount} step-back${episode.stepBackCount > 1 ? 's' : ''}`}
            </div>
          </div>
          {!compact && (
            <EpisodeAdminMenu
              episode={episode}
              catalogEntry={catalogEntry}
              onChanged={onChanged}
            />
          )}
        </div>

        <div className="mt-3">
          <StageTrack stages={stages} currentIndex={stageIndex} />
          <div className="flex items-baseline justify-between mt-1.5">
            <div className="text-xs font-semibold text-gray-800">
              {stage?.name} <span className="font-normal text-gray-400">· {stageIndex + 1}/{stages.length}</span>
            </div>
            {gate?.volumePctOfBaseline != null && (
              <div className="text-xs text-gray-500">
                {gate.volumePctOfBaseline}% of pre-injury volume
              </div>
            )}
          </div>
        </div>

        {!compact && stage?.focus && (
          <div className="mt-2.5 text-xs text-gray-600 leading-relaxed bg-gray-50 rounded-lg px-3 py-2.5">
            {stage.focus}
          </div>
        )}

        {!compact && (
          <div className="mt-2 text-xs text-gray-500 italic">
            {loadResponseHeadline(catalogEntry)}
          </div>
        )}

        {/* Today's ceiling */}
        {!compact && caps && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="bg-gray-50 rounded-lg px-3 py-2">
              <div className="text-[11px] text-gray-500">Weekly ceiling</div>
              <div className="text-sm font-semibold text-gray-900">
                {caps.runningAllowed === false
                  ? 'No running'
                  : formatDistance(caps.weeklyDistanceCapM)}
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg px-3 py-2">
              <div className="text-[11px] text-gray-500">
                {caps.speedCapMps != null ? `Speed ceiling (${caps.speedCapPct}%)` : 'Sessions / week'}
              </div>
              <div className="text-sm font-semibold text-gray-900">
                {caps.speedCapMps != null
                  ? formatPace(caps.speedCapMps)
                  : (caps.maxSessionsPerWeek ?? '-')}
              </div>
            </div>
          </div>
        )}

        {!compact && stage?.speedProgression?.length > 0 && (
          <SpeedLadder
            ladder={stage.speedProgression}
            reached={episode.speedPctReached}
            onClear={doClearSpeedStep}
            busy={busy}
          />
        )}

        {/* What unlocks the next stage */}
        {!compact && gate?.stageGate?.conditions?.length > 0 && (
          <div className="mt-3 border-t border-gray-100 pt-2.5">
            <div className="text-xs font-semibold text-gray-700 mb-1">
              {gate.stageGate.met ? 'Ready for the next stage' : 'To unlock the next stage'}
            </div>
            {gate.stageGate.conditions.map((c) => (
              <GateCondition key={c.id} condition={c} />
            ))}
          </div>
        )}

        {!compact && gate?.stageGate?.isFinalStage && (
          <div className="mt-3 flex items-center gap-2 text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">
            <CheckCircleIcon className="w-4 h-4 flex-shrink-0" />
            Final stage - the episode closes itself once you have been clear for a few weeks.
          </div>
        )}

        {actionError && <div className="mt-2 text-xs text-red-600">{actionError}</div>}

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => onCheckIn?.(item)}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold ${
              checkedInToday
                ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {checkedInToday ? 'Update check-in' : 'Check in'}
          </button>
          {gate?.canAdvance && (
            <button
              type="button"
              onClick={doAdvance}
              disabled={busy}
              className="px-3 py-2 rounded-lg text-sm font-semibold bg-green-600 text-white hover:bg-green-700 disabled:bg-gray-300 flex items-center gap-1.5"
            >
              Next stage <ArrowRightIcon className="w-4 h-4" />
            </button>
          )}
          {gate?.stepBack && stageIndex > 0 && (
            <button
              type="button"
              onClick={doStepBack}
              disabled={busy}
              className="px-3 py-2 rounded-lg text-sm font-semibold bg-amber-100 text-amber-800 hover:bg-amber-200 disabled:opacity-50 flex items-center gap-1.5"
              title="Repeat the previous stage"
            >
              <ArrowUturnLeftIcon className="w-4 h-4" /> Step back
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
