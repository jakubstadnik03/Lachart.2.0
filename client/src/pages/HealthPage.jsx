/**
 * HealthPage
 * ──────────
 * Injuries and illnesses: what is open, today's verdict for each, and the
 * history of what has already been dealt with.
 *
 * The chart at the bottom of an open episode is the point of the whole page -
 * symptom trend drawn against training load on one time axis. That is where an
 * athlete sees for themselves that the flare-up followed the volume jump by two
 * days, which no amount of warning copy achieves.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { PlusIcon, HeartIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../context/AuthProvider';
import { useAthleteSelection } from '../context/AthleteSelectionContext';
import { isCapacitorNative } from '../utils/isNativeApp';
import {
  fetchHealthCatalog, fetchHealthToday, fetchEpisodes, fetchCheckIns, updateEpisode,
} from '../services/healthApi';
import EpisodeCard from '../components/Health/EpisodeCard';
import NewEpisodeModal from '../components/Health/NewEpisodeModal';
import HealthCheckInModal from '../components/Health/HealthCheckInModal';
import SymptomLoadChart from '../components/Health/SymptomLoadChart';
import { EpisodeProgressPanel } from '../components/Health/ReturnProgressChart';
import NativeHealthPage from './NativeHealthPage';

export default function HealthPage() {
  const { user } = useAuth();
  const { selectedAthleteId } = useAthleteSelection();
  const athleteId = selectedAthleteId && selectedAthleteId !== user?._id ? selectedAthleteId : null;

  const [catalog, setCatalog] = useState({ catalog: [], bodySites: [], functionalTests: {} });
  const [items, setItems] = useState([]);
  const [past, setPast] = useState([]);
  const [checkInsByEpisode, setCheckInsByEpisode] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [checkInTarget, setCheckInTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cat, open, all] = await Promise.all([
        fetchHealthCatalog(),
        fetchHealthToday(athleteId),
        fetchEpisodes({ athleteId, status: 'resolved,recurred' }),
      ]);
      setCatalog(cat);
      setItems(open);
      setPast(all);

      const series = {};
      await Promise.all(open.map(async (it) => {
        try {
          series[it.episode._id] = await fetchCheckIns(it.episode._id, 90);
        } catch {
          series[it.episode._id] = [];
        }
      }));
      setCheckInsByEpisode(series);
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Could not load');
    } finally {
      setLoading(false);
    }
  }, [athleteId]);

  useEffect(() => { load(); }, [load]);

  const resolveEpisode = async (episodeId) => {
    await updateEpisode(episodeId, { status: 'resolved', endDate: new Date().toISOString().slice(0, 10) });
    load();
  };

  // Native app: the phone gets its own screen. Same data, sheet-based chrome.
  if (isCapacitorNative()) {
    return <NativeHealthPage user={user} athleteId={selectedAthleteId || user?._id} />;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Health</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Injuries, illness, and getting back without overdoing it
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
        >
          <PlusIcon className="w-4 h-4" /> Log something
        </button>
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
          {error}
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-40 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="text-center py-14 px-6 bg-white rounded-xl border border-gray-200">
          <HeartIcon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <div className="text-base font-semibold text-gray-900">Nothing open - good</div>
          <p className="text-sm text-gray-500 mt-1.5 max-w-sm mx-auto leading-relaxed">
            If something starts niggling, log it early. A niggle tracked from day one is a much
            shorter story than one you notice three weeks in.
          </p>
          <button
            type="button"
            onClick={() => setShowNew(true)}
            className="mt-4 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold"
          >
            Log an injury or illness
          </button>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="space-y-4">
          {items.map((item) => (
            <div key={item.episode._id}>
              <EpisodeCard
                item={item}
                onCheckIn={setCheckInTarget}
                onChanged={load}
              />
              <EpisodeProgressPanel episodeId={item.episode._id} className="mt-2" />
              {(checkInsByEpisode[item.episode._id]?.length || 0) > 1 && (
                <div className="mt-2 bg-white rounded-xl border border-gray-200 p-4">
                  <SymptomLoadChart
                    checkIns={checkInsByEpisode[item.episode._id]}
                    catalogEntry={item.catalogEntry}
                  />
                </div>
              )}
              {item.gate?.stageGate?.isFinalStage && (
                <button
                  type="button"
                  onClick={() => resolveEpisode(item.episode._id)}
                  className="mt-2 w-full py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
                >
                  Mark as fully resolved
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!loading && past.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">History</h2>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {past.map((ep) => {
              const entry = catalog.catalog.find((c) => c.id === ep.catalogId);
              const days = ep.endDate
                ? Math.round((new Date(ep.endDate) - new Date(ep.startDate)) / 86400000)
                : null;
              return (
                <div key={ep._id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {entry?.shortLabel || entry?.label || ep.catalogId}
                      {ep.side !== 'n/a' ? ` · ${ep.side}` : ''}
                    </div>
                    <div className="text-xs text-gray-500">
                      {ep.startDate}
                      {ep.endDate ? ` → ${ep.endDate}` : ''}
                      {days != null ? ` · ${days} days` : ''}
                      {ep.stepBackCount > 0 ? ` · ${ep.stepBackCount} step-backs` : ''}
                    </div>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600 flex-shrink-0">
                    {ep.status}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showNew && (
        <NewEpisodeModal
          catalog={catalog.catalog}
          bodySites={catalog.bodySites}
          onClose={() => setShowNew(false)}
          onCreated={load}
          athleteId={athleteId}
        />
      )}

      {checkInTarget && (
        <HealthCheckInModal
          episode={checkInTarget.episode}
          catalogEntry={checkInTarget.catalogEntry}
          functionalTests={catalog.functionalTests}
          onClose={() => setCheckInTarget(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
