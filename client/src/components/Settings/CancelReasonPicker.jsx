import React from 'react';
import { CANCEL_REASONS, CANCEL_NOTE_MAX } from '../../constants/cancelReasons';

/**
 * The "why are you leaving" question inside the cancel dialog.
 *
 * Optional by design. Nothing here gates the cancel button, no option is
 * preselected, and picking one can be undone by clicking it again — an answer
 * is worth a lot and worth nothing if it costs someone an extra click to
 * leave. The free-text box only appears once a reason is chosen, so the
 * dialog stays short for anyone who just wants out.
 */
export default function CancelReasonPicker({ reason, onReason, note, onNote, disabled = false }) {
  return (
    <div className="mb-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
        If you have a second — what went wrong?{' '}
        <span className="font-normal normal-case tracking-normal text-gray-400">(optional)</span>
      </p>
      <div className="flex flex-wrap gap-1.5">
        {CANCEL_REASONS.map((r) => {
          const picked = reason === r.id;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onReason(picked ? null : r.id)}
              disabled={disabled}
              aria-pressed={picked}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors disabled:opacity-50 ${
                picked
                  ? 'bg-gray-900 border-gray-900 text-white'
                  : 'bg-white border-gray-300 text-gray-700 hover:border-gray-400'
              }`}
            >
              {r.label}
            </button>
          );
        })}
      </div>
      {reason && (
        <textarea
          id="cancel-note"
          value={note}
          onChange={(e) => onNote(e.target.value.slice(0, CANCEL_NOTE_MAX))}
          disabled={disabled}
          rows={2}
          placeholder="Anything more you want to tell me? I read these."
          className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-gray-500 focus:outline-none disabled:opacity-50"
        />
      )}
    </div>
  );
}
