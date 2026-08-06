/**
 * HealthStatusCard - open injuries/illness on the dashboard.
 *
 * Renders nothing when there is nothing open, so it costs a healthy athlete no
 * screen space. When something IS open it goes near the top: an athlete looking
 * at today's plan needs to see the ceiling before they see the session.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRightIcon } from '@heroicons/react/24/outline';
import { fetchHealthToday, fetchHealthCatalog } from '../../services/healthApi';
import EpisodeCard from '../Health/EpisodeCard';
import HealthCheckInModal from '../Health/HealthCheckInModal';

export default function HealthStatusCard({ athleteId = null }) {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [functionalTests, setFunctionalTests] = useState({});
  const [checkInTarget, setCheckInTarget] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const [open, cat] = await Promise.all([
        fetchHealthToday(athleteId),
        fetchHealthCatalog(),
      ]);
      setItems(open);
      setFunctionalTests(cat.functionalTests || {});
    } catch {
      setItems([]);
    } finally {
      setLoaded(true);
    }
  }, [athleteId]);

  useEffect(() => { load(); }, [load]);

  if (!loaded || items.length === 0) return null;

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-gray-800">Health</h2>
        <button
          type="button"
          onClick={() => navigate('/health')}
          className="flex items-center gap-0.5 text-xs text-blue-600 font-medium"
        >
          All details <ChevronRightIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-3">
        {items.slice(0, 2).map((item) => (
          <EpisodeCard
            key={item.episode._id}
            item={item}
            compact={items.length > 1}
            onCheckIn={setCheckInTarget}
            onChanged={load}
            onOpenDetail={() => navigate('/health')}
          />
        ))}
      </div>

      {checkInTarget && (
        <HealthCheckInModal
          episode={checkInTarget.episode}
          catalogEntry={checkInTarget.catalogEntry}
          functionalTests={functionalTests}
          onClose={() => setCheckInTarget(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
