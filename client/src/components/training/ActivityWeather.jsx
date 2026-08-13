/**
 * ActivityWeather — what the conditions were during this session.
 *
 * Heat, wind and rain move a session more than most training decisions do, and
 * an athlete comparing two rides is often comparing the weather without knowing
 * it. Shown at the foot of the summary because it is context for everything
 * above it rather than a headline of its own.
 *
 * Renders nothing when the activity has no GPS — an empty weather box on every
 * treadmill session would be worse than no box at all.
 */
import React, { useEffect, useState } from 'react';
import {
  CloudIcon,
  SunIcon,
} from '@heroicons/react/24/outline';
import { getActivityWeather } from '../../services/api';

/** WMO code → the icon that fits. Kept coarse; four buckets read better than twenty. */
function iconFor(code) {
  const c = Number(code);
  if (c === 0 || c === 1) return SunIcon;
  return CloudIcon;
}

function windLabel(deg) {
  if (!Number.isFinite(Number(deg))) return null;
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(Number(deg) / 45) % 8];
}

export default function ActivityWeather({ activityKey, className = '' }) {
  const [weather, setWeather] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!activityKey) return undefined;
    let cancelled = false;
    setLoaded(false);
    getActivityWeather(activityKey)
      .then((data) => { if (!cancelled) setWeather(data); })
      .catch(() => { if (!cancelled) setWeather(null); })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [activityKey]);

  if (!loaded || !weather || weather.tempC == null) return null;

  const Icon = iconFor(weather.code);
  const dir = windLabel(weather.windDirDeg);

  const stats = [
    { label: 'Feels like', value: weather.apparentC != null ? `${Math.round(weather.apparentC)}°` : null },
    { label: 'Wind', value: weather.windKph != null ? `${Math.round(weather.windKph)} km/h${dir ? ` ${dir}` : ''}` : null },
    { label: 'Humidity', value: weather.humidityPct != null ? `${Math.round(weather.humidityPct)}%` : null },
    { label: 'Rain', value: weather.precipitationMm > 0 ? `${weather.precipitationMm.toFixed(1)} mm` : null },
  ].filter((s) => s.value);

  return (
    <div className={className}>
      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">
        Conditions
      </div>

      <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
        <div className="flex items-center gap-3">
          <Icon className="w-7 h-7 text-gray-400 shrink-0" />
          <div className="min-w-0">
            <div className="text-xl font-bold text-gray-900 leading-none">
              {Math.round(weather.tempC)}
              <span className="text-sm font-semibold text-gray-400">°C</span>
            </div>
            <div className="text-[11px] text-gray-500 truncate mt-0.5">
              {weather.description}
              {weather.place ? <span className="text-gray-400"> · {weather.place}</span> : null}
            </div>
          </div>
        </div>

        {stats.length ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1.5 mt-2.5 pt-2.5 border-t border-gray-200/70">
            {stats.map((s) => (
              <div key={s.label}>
                <div className="text-[9px] font-semibold uppercase tracking-wide text-gray-400">
                  {s.label}
                </div>
                <div className="text-xs font-bold text-gray-800">{s.value}</div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
