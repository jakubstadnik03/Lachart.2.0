/**
 * HealthCalendarPanels - the open episodes, opened out below the calendar.
 *
 * The strip above the grid says what colour today is; this is where the athlete
 * finds out why. The symptom chart is the reason it sits on the calendar page
 * at all - the flare-up and the week that caused it end up on one screen, which
 * no amount of warning copy achieves.
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { updateEpisode, todayKey, findCatalogEntry } from '../../services/healthApi';
import EpisodeCard from './EpisodeCard';
import SymptomLoadChart from './SymptomLoadChart';
import { EpisodeProgressPanel } from './ReturnProgressChart';

const HISTORY_PREVIEW = 6;

/** Anchor the strip's chips scroll to. Kept in one place so both sides agree. */
export function panelDomId(episodeId) {
  return `health-episode-${episodeId}`;
}

function ResolveButton({ episodeId, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const resolve = async () => {
    setBusy(true);
    setError(null);
    try {
      await updateEpisode(episodeId, { status: 'resolved', endDate: todayKey() });
      onChanged?.();
    } catch (e) {
      setError(e?.response?.data?.error || 'Could not close this episode');
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={resolve}
        disabled={busy}
        className="mt-2 w-full py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
      >
        Mark as fully resolved
      </button>
      {error && <div className="mt-1 text-xs text-red-600">{error}</div>}
    </>
  );
}

function HistoryRow({ episode, catalogEntry }) {
  const days = episode.endDate
    ? Math.round((new Date(episode.endDate) - new Date(episode.startDate)) / 86400000)
    : null;

  return (
    <div className="px-4 py-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm font-medium text-gray-900 truncate">
          {catalogEntry?.shortLabel || catalogEntry?.label || episode.catalogId}
          {episode.side && episode.side !== 'n/a' ? ` · ${episode.side}` : ''}
        </div>
        <div className="text-xs text-gray-500">
          {episode.startDate}
          {episode.endDate ? ` → ${episode.endDate}` : ''}
          {days != null ? ` · ${days} days` : ''}
          {episode.stepBackCount > 0 ? ` · ${episode.stepBackCount} step-backs` : ''}
        </div>
      </div>
      <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600 flex-shrink-0">
        {episode.status}
      </span>
    </div>
  );
}

export default function HealthCalendarPanels({
  items = [],
  catalog,
  checkInsByEpisode = {},
  past = [],
  onCheckIn,
  onChanged,
}) {
  const [historyOpen, setHistoryOpen] = useState(false);

  const open = (items || []).filter((it) => it?.episode?._id && it?.catalogEntry);
  const closed = [...(past || [])].sort((a, b) => {
    const aKey = a.endDate || a.startDate || '';
    const bKey = b.endDate || b.startDate || '';
    return aKey < bKey ? 1 : -1;
  });

  if (open.length === 0 && closed.length === 0) return null;

  const entries = catalog?.catalog || [];

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h2 className="text-sm font-semibold text-gray-800">Health</h2>
        {/* The nav entry is gone, so this is the only way back to the full page.
            It cannot hang off the history block, which an athlete on their first
            injury does not have. */}
        <Link to="/health" className="text-xs font-medium text-blue-600 hover:text-blue-700">
          Full health history
        </Link>
      </div>

      {open.length > 0 && (
        <div className="space-y-4">
          {open.map((item) => {
            const id = item.episode._id;
            const checkIns = (checkInsByEpisode || {})[id] || [];
            return (
              <div
                key={id}
                id={panelDomId(id)}
                // The calendar page has a sticky header, so a bare scrollIntoView
                // would park the card's verdict underneath it.
                style={{ scrollMarginTop: 96 }}
              >
                <EpisodeCard item={item} onCheckIn={onCheckIn} onChanged={onChanged} />

                <EpisodeProgressPanel episodeId={id} className="mt-2" />

                {checkIns.length > 1 && (
                  <div className="mt-2 bg-white rounded-xl border border-gray-200 p-4">
                    <SymptomLoadChart checkIns={checkIns} catalogEntry={item.catalogEntry} />
                  </div>
                )}

                {item.gate?.stageGate?.isFinalStage && (
                  <ResolveButton episodeId={id} onChanged={onChanged} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {closed.length > 0 && (
        <div className={open.length > 0 ? 'mt-4' : ''}>
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            aria-expanded={historyOpen}
            className="w-full flex items-center gap-2 px-1 py-2 text-left"
          >
            <ChevronDownIcon
              className={`w-4 h-4 text-gray-400 transition-transform ${historyOpen ? '' : '-rotate-90'}`}
            />
            <span className="text-sm font-semibold text-gray-700">History</span>
            <span className="text-xs text-gray-400">
              {closed.length} dealt with
            </span>
          </button>

          {historyOpen && (
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {closed.slice(0, HISTORY_PREVIEW).map((ep) => (
                <HistoryRow key={ep._id} episode={ep} catalogEntry={findCatalogEntry(entries, ep.catalogId)} />
              ))}
              {closed.length > HISTORY_PREVIEW && (
                <Link
                  to="/health"
                  className="block px-4 py-2.5 text-xs font-medium text-blue-600 hover:bg-gray-50"
                >
                  {closed.length - HISTORY_PREVIEW} older on the health page
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
